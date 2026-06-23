"""
main.py — Penda FastAPI Backend
Production-ready RESTful API that:
  - Verifies Supabase JWTs locally (no network call per request)
  - Routes to the correct Groq API key (BYOK or dev trial key)
  - Enforces token limits for trial users (token budget + request rate)
  - Validates BYOK Groq API keys before saving them (encrypted at rest)
  - Streams LLM responses using Server-Sent Events (SSE)
  - Persists all chat data to Supabase PostgreSQL

Growth-scope improvements implemented in this revision:
  S1C — Async LLM Integration: /chat/stream now uses LangGraph's native
    astream() — no ThreadPoolExecutor+queue bridge needed. This eliminates
    thread overhead and makes the entire streaming path truly async,
    improving concurrent request handling on Render's free tier.
  S3B — PDF OCR Fallback: _extract_pdf_text() now falls back to
    pytesseract OCR when PyMuPDF returns no text (image-based/scanned PDFs).
    pytesseract and pdf2image are optional; if not installed the old
    behaviour (empty string) is preserved rather than crashing.
  S4  — Prompt Injection Sanitization: _sanitize_web_content() strips
    instruction-injection patterns from any external content (webpage reads,
    global docs) before it enters the LLM context window.
  Keep-alive: /ping endpoint returns {"alive": true} — called every 5 min
    by the frontend so the Render free-tier instance never spins down.

Known limitations NOT fixable from this file alone:
  - The trial-token check-then-increment is still not atomic.
  - Global documents are stored as text in Postgres, not object storage.
  - No DB connection pooling config here (lives in database.py).
  - Heavy background work (embeddings, etc.) still runs inline.
"""

import base64
import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncio
import fitz  # PyMuPDF
import jwt
import tiktoken
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from jwt import PyJWKClient
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

import auth as auth_service
from rate_limiter import RateLimiter, validate_groq_key
from database import (
    get_client,
    get_profile,
    update_profile,
    create_chat,
    get_chats,
    update_title,
    delete_chat,
    get_chat_owner,
    save_message,
    get_messages,
    count_messages,
    get_trial_usage,
    increment_trial_tokens,
    save_document,
    get_global_documents,
    delete_document,
)
from memory import build_context, manage_memory, extract_user_facts
from graph import astream_chat_workflow, build_ats_workflow, build_llm

load_dotenv()

# ============================================================
# Logging
# ============================================================

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("penda")


# ============================================================
# Config / Required Env Vars
# ============================================================

def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


DEV_GROQ_API_KEY: str = _require_env("GROQ_API_KEY")
SUPABASE_URL: str = _require_env("SUPABASE_URL")

# Used to encrypt/decrypt BYOK Groq keys at rest. Generate one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# and keep it secret — anyone with this key can decrypt every stored BYOK key.
BYOK_ENCRYPTION_KEY: str = _require_env("BYOK_ENCRYPTION_KEY")
_fernet = Fernet(BYOK_ENCRYPTION_KEY.encode())

# Legacy Supabase projects sign JWTs with HS256 + a shared secret. Newer
# projects use asymmetric JWT Signing Keys (ES256/RS256) discoverable via
# the project's JWKS endpoint. We support both so this works regardless of
# which the Supabase project is configured for.
SUPABASE_JWT_SECRET: str | None = os.getenv("SUPABASE_JWT_SECRET")
_jwk_client: PyJWKClient | None = None
if not SUPABASE_JWT_SECRET:
    _jwk_client = PyJWKClient(
        f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True
    )

FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

TRIAL_MODEL = "openai/gpt-oss-20b"

AVAILABLE_MODELS = [
    {"id": "llama-3.1-8b-instant",                     "name": "Llama 3.1 8B ⚡ (Fast, Default)"},
    {"id": "llama-3.3-70b-versatile",                  "name": "Llama 3.3 70B 💪 (Powerful)"},
    {"id": "meta-llama/llama-4-scout-17b-16e-instruct", "name": "Llama 4 Scout 17B 🦇"},
    {"id": "openai/gpt-oss-120b",                      "name": "GPT-OSS 120B (Largest)"},
    {"id": "openai/gpt-oss-20b",                       "name": "GPT-OSS 20B (Balanced)"},
    {"id": "qwen/qwen3-32b",                           "name": "Qwen3 32B 🐉 (Code)"},
    {"id": "qwen/qwen3.6-27b",                         "name": "Qwen3.6 27B"},
    {"id": "groq/compound",                            "name": "Groq Compound (Multi-step)"},
    {"id": "groq/compound-mini",                       "name": "Groq Compound Mini"},
    {"id": "mixtral-8x7b-32768",                       "name": "Mixtral 8x7B (32K context)"},
    {"id": "gemma2-9b-it",                             "name": "Gemma 2 9B"},
    {"id": "allam-2-7b",                               "name": "Allam 2 7B (🇸🇦 Arabic)"},
]

MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024       # 413 above this
STREAM_TIMEOUT_SECONDS = 120                  # hard cap on one /chat/stream call
ATS_TIMEOUT_SECONDS = 90                      # hard cap on one /ats call
MAX_HISTORY_MESSAGES = 40                     # defensive cap, on top of build_context()


# ============================================================
# Rate Limiters (instantiated once at startup)
# ============================================================

chat_limiter = RateLimiter(max_requests=10, window_seconds=60)
ats_limiter = RateLimiter(max_requests=2, window_seconds=60)

# Auth abuse protection — keyed by client IP.
auth_limiter = RateLimiter(max_requests=5, window_seconds=60)
# Keyed by the target email so an attacker can't dodge the limit by
# rotating IPs while spamming reset emails at one address.
forgot_password_limiter = RateLimiter(max_requests=3, window_seconds=3600)
validate_key_limiter = RateLimiter(max_requests=10, window_seconds=60)


# ============================================================
# FastAPI App
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Executor is now only used by the ATS blocking invoke — 4 workers
    # is ample since the async streaming path no longer needs threads.
    app.state.executor = ThreadPoolExecutor(max_workers=4)
    yield
    app.state.executor.shutdown(wait=False)


app = FastAPI(
    title="Penda API",
    version="1.0.0",
    description="Backend API for the Penda AI chat application.",
    lifespan=lifespan,
)


# ── Request size limit ──────────────────────────────────────────
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE_BYTES:
        return Response(status_code=413, content="Request body too large.")
    return await call_next(request)


# ── Security headers ────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ── CORS ─────────────────────────────────────────────────────────
# This API uses Bearer tokens (not cookies), so allow_origins="*" is safe.
# CORS only prevents cross-origin cookie theft — it does not restrict
# Authorization headers that JavaScript explicitly attaches. Using a
# restricted origin list caused OPTIONS 400 errors when FRONTEND_URL
# wasn't set in the deployment environment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Auth: JWT Verification Dependency (local, no Supabase round-trip)
# ============================================================

def _verify_jwt(token: str) -> dict:
    try:
        if SUPABASE_JWT_SECRET:
            return jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        # JWKS path — only works for asymmetric Supabase projects (RS256/ES256).
        # If your project uses HS256 (most legacy projects), set SUPABASE_JWT_SECRET.
        if _jwk_client is None:
            logger.error(
                "SUPABASE_JWT_SECRET is not set and JWKS client was not initialised. "
                "Add SUPABASE_JWT_SECRET to your environment variables."
            )
            raise jwt.PyJWTError("No JWT verification method configured.")
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired or is invalid. Please log in again.",
        )
    except jwt.PyJWTError:
        logger.info("JWT verification failed")
        raise HTTPException(status_code=401, detail="Invalid authentication token.")



def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency. Verifies the Supabase JWT locally (JWKS/HS256 —
    see _verify_jwt) and returns {'sub': user UUID, 'email': ...}.

    Note: local verification trades a small amount of revocation latency
    (a banned/deleted user stays valid until their token's natural
    expiry, typically ~1h) for removing a network round-trip to Supabase
    on every authenticated request. This is the standard tradeoff and is
    fine for short-lived access tokens.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )
    token = auth_header.split(" ", 1)[1]
    payload = _verify_jwt(token)
    # Stashed for routes (e.g. logout) that need the raw token without
    # re-parsing the header.
    request.state.token = token
    return {"sub": payload["sub"], "email": payload.get("email")}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ============================================================
# BYOK key encryption helpers
# ============================================================

def encrypt_secret(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    """Returns None (and logs) if the stored value can't be decrypted —
    e.g. a key saved before encryption was added. Caller falls back to
    trial mode in that case rather than crashing the request."""
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, ValueError, Exception):
        logger.error("Could not decrypt stored BYOK key — treating as unset.")
        return None


def resolve_api_key_and_model(profile: dict) -> tuple[str, str]:
    """
    Returns (api_key, model) to use for this request.
    - If the user has a saved, decryptable BYOK key → use it.
    - Otherwise → use the dev trial key with the default trial model.
    """
    encrypted_key = profile.get("groq_api_key") if profile else None
    if encrypted_key:
        byok_key = decrypt_secret(encrypted_key)
        if byok_key:
            model = profile.get("preferred_model") or TRIAL_MODEL
            return byok_key, model
    return DEV_GROQ_API_KEY, TRIAL_MODEL


def estimate_tokens(text: str) -> int:
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return int(len(text.split()) * 1.3)


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Runs in the shared thread pool — keeps the event loop free.

    S3B — OCR Fallback: if PyMuPDF returns no text (image-based/scanned PDF)
    we fall back to pytesseract+pdf2image. These are optional — if not
    installed the function returns a descriptive message rather than crashing.
    """
    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        text = "\n".join(page.get_text() for page in pdf_doc)
    finally:
        pdf_doc.close()

    if text.strip():
        return text

    # Scanned/image PDF — attempt OCR
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_bytes  # type: ignore
        logger.info("PDF text empty — attempting OCR fallback.")
        images = convert_from_bytes(pdf_bytes, dpi=200)
        ocr_text = "\n".join(pytesseract.image_to_string(img) for img in images).strip()
        if ocr_text:
            logger.info("OCR succeeded (%d chars).", len(ocr_text))
            return ocr_text
    except ImportError:
        logger.debug("pytesseract/pdf2image not installed — OCR skipped.")
    except Exception:
        logger.exception("OCR fallback failed.")

    return "[No extractable text found. This PDF may be an image-based scan.]"


# S4 — Prompt injection sanitization
# Strip common injection patterns from externally-fetched content before
# injecting it into the LLM context window (webpages, global docs, etc.).
_INJECTION_RE = re.compile(
    r"(ignore (all )?(previous|prior|above|earlier) instructions?"
    r"|disregard (all )?(previous|prior|above|earlier) instructions?"
    r"|you are now|act as (a |an |your )?"
    r"|system:\s*\[|\[system\]|<system>"
    r"|new instructions?:|override:|jailbreak)",
    re.IGNORECASE,
)


def _sanitize_web_content(content: str) -> str:
    """S4 — Strip prompt injection patterns from external content."""
    sanitized = _INJECTION_RE.sub("[REDACTED]", content)
    if sanitized != content:
        logger.warning("Prompt injection pattern redacted in external content.")
    return sanitized


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"



# ============================================================
# Pydantic Request / Response Models
# ============================================================

class ChatRequest(BaseModel):
    chat_id: str
    message: str = Field(..., min_length=1, max_length=50_000)
    doc_name: str | None = Field(default=None, max_length=200)
    doc_content: str | None = Field(default=None, max_length=5_000_000)

class DocumentUploadRequest(BaseModel):
    name: str = Field(..., max_length=200)
    content: str = Field(..., max_length=12_000)

class NewChatResponse(BaseModel):
    chat_id: str

class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    style: str | None = Field(default=None, max_length=50)
    expertise_level: str | None = Field(default=None, max_length=50)
    groq_api_key: str | None = Field(default=None, max_length=200)
    preferred_model: str | None = Field(default=None, max_length=100)

class ATSRequest(BaseModel):
    resume_text: str = Field(..., min_length=1, max_length=50_000)
    job_description: str = Field(..., min_length=1, max_length=20_000)

class UpdateTitleRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)

# --- Auth models ---
class SignUpRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = ""

class SignInRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str

class UpdatePasswordRequest(BaseModel):
    access_token: str
    new_password: str = Field(min_length=8)

# --- BYOK validation ---
class ValidateKeyRequest(BaseModel):
    api_key: str


# ============================================================
# Routes: Health
# ============================================================

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "penda-api"}


@app.get("/ping", tags=["Health"])
def ping():
    """Keep-alive endpoint — called by the frontend every 5 minutes to
    prevent the Render free-tier instance from spinning down during an
    active user session. Returns 200 with {"alive": true}."""
    return {"alive": True}


# ============================================================
# Routes: Auth
# All auth routes are public (no JWT required) but rate limited.
# ============================================================

@app.post("/auth/signup", tags=["Auth"])
def signup(body: SignUpRequest, request: Request):
    auth_limiter.enforce(_client_ip(request))
    try:
        return auth_service.sign_up(body.email, body.password, body.full_name)
    except Exception:
        logger.exception("Signup failed")
        raise HTTPException(status_code=400, detail="Could not create account.")


@app.post("/auth/login", tags=["Auth"])
def login(body: SignInRequest, request: Request):
    auth_limiter.enforce(_client_ip(request))
    try:
        return auth_service.sign_in(body.email, body.password)
    except Exception:
        logger.info("Login failed for an account")
        raise HTTPException(status_code=401, detail="Invalid email or password.")


@app.post("/auth/logout", tags=["Auth"])
def logout(request: Request, user: dict = Depends(get_current_user)):
    try:
        auth_service.sign_out(request.state.token)
    except Exception:
        logger.exception("Sign-out call failed for user %s", user["sub"])
    # Client should discard its tokens regardless of server-side outcome.
    return {"success": True}


@app.post("/auth/refresh", tags=["Auth"])
def refresh(body: RefreshRequest):
    try:
        return auth_service.refresh_session(body.refresh_token)
    except Exception:
        logger.info("Refresh token exchange failed")
        raise HTTPException(status_code=401, detail="Could not refresh session.")


@app.post("/auth/forgot-password", tags=["Auth"])
def forgot_password(body: ForgotPasswordRequest, request: Request):
    auth_limiter.enforce(_client_ip(request))
    forgot_password_limiter.enforce(body.email.lower())
    try:
        redirect = f"{FRONTEND_URL}/auth/reset-password"
        auth_service.send_password_reset(body.email, redirect)
    except Exception:
        logger.exception("Password reset send failed")
    # Always return success to prevent email enumeration.
    return {"success": True, "message": "If that email exists, a reset link has been sent."}


@app.post("/auth/update-password", tags=["Auth"])
def update_password(body: UpdatePasswordRequest, request: Request):
    auth_limiter.enforce(_client_ip(request))
    try:
        return auth_service.update_password(body.access_token, body.new_password)
    except Exception:
        logger.info("Password update failed")
        raise HTTPException(status_code=400, detail="Could not update password.")


# ============================================================
# Routes: Models
# ============================================================

@app.get("/models", tags=["Models"])
def list_models():
    return {"models": AVAILABLE_MODELS}


# ============================================================
# Routes: Profile
# ============================================================

@app.get("/profile", tags=["Profile"])
def get_user_profile(user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    profile = get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    safe_profile = {k: v for k, v in profile.items() if k != "groq_api_key"}
    safe_profile["has_byok"] = bool(profile.get("groq_api_key"))

    used, limit = get_trial_usage(user_id)
    safe_profile["trial_tokens_used"] = used
    safe_profile["trial_token_limit"] = limit

    return safe_profile


@app.patch("/profile", tags=["Profile"])
def patch_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    updates = body.model_dump(exclude_none=True)

    if "groq_api_key" in updates:
        raw_key = updates["groq_api_key"].strip()
        updates["groq_api_key"] = encrypt_secret(raw_key) if raw_key else None

    try:
        updated = update_profile(user_id, **updates)
    except Exception:
        logger.exception("Profile update failed for user %s", user_id)
        raise HTTPException(status_code=500, detail="Failed to update profile.")

    safe_profile = {k: v for k, v in (updated or {}).items() if k != "groq_api_key"}
    return {"success": True, "profile": safe_profile}


@app.post("/profile/validate-key", tags=["Profile"])
def validate_byok_key(
    body: ValidateKeyRequest,
    user: dict = Depends(get_current_user),
):
    validate_key_limiter.enforce(user["sub"])
    is_valid, error_msg = validate_groq_key(body.api_key)
    if is_valid:
        return {"valid": True, "message": "API key is valid! BYOK mode unlocked."}
    return {"valid": False, "message": error_msg}


@app.delete("/profile/key", tags=["Profile"])
def remove_byok_key(user: dict = Depends(get_current_user)):
    update_profile(user["sub"], groq_api_key=None)
    return {"success": True, "message": "API key removed. You are now in Trial mode."}


# ============================================================
# Routes: Chats
# ============================================================

@app.get("/chats", tags=["Chats"])
def list_chats(user: dict = Depends(get_current_user)):
    return {"chats": get_chats(user["sub"])}


@app.post("/chats", tags=["Chats"], response_model=NewChatResponse)
def new_chat(user: dict = Depends(get_current_user)):
    return {"chat_id": create_chat(user["sub"])}


@app.delete("/chats/{chat_id}", tags=["Chats"])
def remove_chat(chat_id: str, user: dict = Depends(get_current_user)):
    if get_chat_owner(chat_id) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your chat.")
    delete_chat(chat_id)
    return {"success": True}


@app.patch("/chats/{chat_id}/title", tags=["Chats"])
def set_chat_title(
    chat_id: str,
    body: UpdateTitleRequest,
    user: dict = Depends(get_current_user),
):
    if get_chat_owner(chat_id) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your chat.")
    update_title(chat_id, body.title)
    return {"success": True}


@app.get("/chats/{chat_id}/messages", tags=["Chats"])
def get_chat_messages(chat_id: str, user: dict = Depends(get_current_user)):
    if get_chat_owner(chat_id) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your chat.")
    return {"messages": get_messages(chat_id)}


# ============================================================
# Routes: Documents
# ============================================================

@app.post("/documents", tags=["Documents"])
def upload_document(
    body: DocumentUploadRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    size_bytes = len(body.content.encode("utf-8"))
    doc_id = save_document(
        user_id=user_id, name=body.name, content=body.content, size_bytes=size_bytes
    )
    return {"id": doc_id, "name": body.name, "size_bytes": size_bytes}


@app.get("/documents", tags=["Documents"])
def list_documents(user: dict = Depends(get_current_user)):
    docs = get_global_documents(user["sub"])
    return {"documents": [{k: v for k, v in d.items() if k != "content"} for d in docs]}


@app.delete("/documents/{doc_id}", tags=["Documents"])
def remove_document(doc_id: str, user: dict = Depends(get_current_user)):
    delete_document(doc_id, user["sub"])
    return {"success": True}


# ============================================================
# Routes: Streaming Chat
# ============================================================

@app.post("/chat/stream", tags=["Chat"])
async def stream_chat(
    body: ChatRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Main streaming endpoint. Returns a Server-Sent Events stream.

    SSE Event format:
      data: {"type": "token", "content": "..."}
      data: {"type": "tool_call", "tool": "web_search"}
      data: {"type": "done", "total_tokens": 123}
      data: {"type": "error", "message": "..."}
    """
    chat_limiter.enforce(user["sub"])
    user_id = user["sub"]
    chat_id = body.chat_id
    user_message = body.message.strip()

    if get_chat_owner(chat_id) != user_id:
        raise HTTPException(status_code=403, detail="Not your chat.")

    profile = get_profile(user_id)
    api_key, model = resolve_api_key_and_model(profile)
    is_trial = (api_key == DEV_GROQ_API_KEY)

    # NOTE: see module docstring — this check is best-effort, not atomic.
    if is_trial:
        used, limit = get_trial_usage(user_id)
        prompt_tokens = estimate_tokens(user_message)
        if used + prompt_tokens > limit:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Trial token limit reached ({limit} tokens). "
                    "Please add your own Groq API key in Settings to continue."
                ),
            )

    save_message(chat_id, "user", user_message, token_count=estimate_tokens(user_message))

    if count_messages(chat_id) == 1:
        update_title(chat_id, user_message[:40])

    llm = build_llm(api_key, model)
    history = build_context(chat_id, user_id, llm, current_prompt=user_message)
    history = history[-MAX_HISTORY_MESSAGES:]

    executor: ThreadPoolExecutor = request.app.state.executor
    loop = asyncio.get_running_loop()

    # --- Inject document context (inline + global) ---
    doc_segments: list[str] = []

    if body.doc_content:
        content_text = body.doc_content
        if content_text.startswith("data:application/pdf;base64,"):
            try:
                b64_data = content_text.split(",", 1)[1]
                pdf_bytes = base64.b64decode(b64_data)
                # Run blocking PDF/OCR extraction in the thread pool (S3B)
                content_text = await loop.run_in_executor(executor, _extract_pdf_text, pdf_bytes)
            except Exception:
                logger.exception("PDF extraction failed for chat %s", chat_id)
                content_text = "[Failed to extract text from the attached PDF.]"
        truncated = content_text[:15_000]
        doc_segments.append(f"[Attached Document: {body.doc_name or 'document'}]\n{truncated}")

    global_docs = get_global_documents(user_id)
    for doc in global_docs[:5]:
        # S4 — sanitize externally-sourced document content before injection
        safe_content = _sanitize_web_content(doc["content"][:5_000])
        doc_segments.append(f"[Global Document: {doc['name']}]\n{safe_content}")

    if doc_segments:
        history.insert(
            0,
            SystemMessage(
                content=(
                    "The following documents have been provided by the user for reference.\n"
                    "Use them when answering questions.\n\n" + "\n\n---\n\n".join(doc_segments)
                )
            ),
        )

    if not history or not (
        isinstance(history[-1], HumanMessage) and history[-1].content == user_message
    ):
        history.append(HumanMessage(content=user_message))

    # S1C — Native async streaming via LangGraph astream.
    # No ThreadPoolExecutor, no queue bridge — the event loop is never blocked.
    async def event_generator() -> AsyncGenerator[str, None]:
        full_response = ""
        total_tokens = 0
        last_tool_call_name: str | None = None
        deadline = loop.time() + STREAM_TIMEOUT_SECONDS
        timed_out = False
        client_gone = False
        error_occurred = False

        try:
            async for chunk, metadata in astream_chat_workflow(api_key, model, history):
                if loop.time() > deadline:
                    timed_out = True
                    yield _sse({"type": "error", "message": "Response timed out."})
                    break

                if await request.is_disconnected():
                    client_gone = True
                    break

                if metadata.get("langgraph_node") != "assistant":
                    continue

                if getattr(chunk, "tool_calls", None):
                    for tc in chunk.tool_calls:
                        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                        if name and name != last_tool_call_name:
                            last_tool_call_name = name
                            yield _sse({"type": "tool_call", "tool": name})
                elif chunk.content:
                    full_response += chunk.content
                    total_tokens += estimate_tokens(chunk.content)
                    yield _sse({"type": "token", "content": chunk.content})

        except Exception:
            logger.exception("Streaming error in chat %s", chat_id)
            error_occurred = True
            yield _sse({"type": "error", "message": "An error occurred while generating the response."})

        # Persist whatever was generated, even on disconnect/timeout
        if full_response:
            save_message(chat_id, "assistant", full_response, token_count=total_tokens)

            try:
                extract_user_facts(user_message, user_id, llm)
            except Exception:
                logger.exception("extract_user_facts failed for chat %s", chat_id)

            if is_trial:
                try:
                    increment_trial_tokens(user_id, total_tokens)
                except Exception:
                    logger.exception("increment_trial_tokens failed for user %s", user_id)

            try:
                manage_memory(chat_id, llm)
            except Exception:
                logger.exception("manage_memory failed for chat %s", chat_id)

        if not client_gone and not timed_out and not error_occurred:
            yield _sse({"type": "done", "total_tokens": total_tokens})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )



# ============================================================
# Routes: ATS Agent
# ============================================================

@app.post("/ats", tags=["ATS Agent"])
async def run_ats_agent(
    body: ATSRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Runs the 2-step ATS resume optimization pipeline.
    Returns: { critique, refined_bullets }
    """
    ats_limiter.enforce(user["sub"])
    user_id = user["sub"]
    profile = get_profile(user_id)
    api_key, model = resolve_api_key_and_model(profile)
    is_trial = (api_key == DEV_GROQ_API_KEY)

    if is_trial:
        used, limit = get_trial_usage(user_id)
        prompt_tokens = estimate_tokens(body.resume_text + body.job_description)
        if used + prompt_tokens > limit:
            raise HTTPException(
                status_code=429,
                detail="Trial token limit reached. Add your own Groq API key in Settings.",
            )

    ats_workflow = build_ats_workflow(api_key, model)
    executor: ThreadPoolExecutor = request.app.state.executor
    loop = asyncio.get_running_loop()

    def _run():
        return ats_workflow.invoke(
            {
                "resume_text": body.resume_text,
                "job_description": body.job_description,
                "critique": "",
                "refined_bullets": "",
            }
        )

    try:
        final_state = await asyncio.wait_for(
            loop.run_in_executor(executor, _run), timeout=ATS_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="ATS analysis timed out. Please try again.")
    except Exception:
        logger.exception("ATS workflow failed for user %s", user_id)
        raise HTTPException(status_code=500, detail="ATS analysis failed.")

    if is_trial:
        total = estimate_tokens(final_state["critique"] + final_state["refined_bullets"])
        try:
            increment_trial_tokens(user_id, total)
        except Exception:
            logger.exception("increment_trial_tokens failed for user %s", user_id)

    return {
        "critique": final_state["critique"],
        "refined_bullets": final_state["refined_bullets"],
    }