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
from fastapi import UploadFile, File
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
    # --- New in V3 ---
    upload_file_to_storage,
    get_file_signed_url,
    create_shared_chat,
    get_shared_chat_by_token,
    get_shared_chat_messages,
    get_shared_chat_title,
    save_ats_candidate,
    get_ats_candidates,
    get_ats_candidate,
    update_ats_candidate_status,
    delete_ats_candidate,
    DOCUMENTS_BUCKET,
    ATS_BUCKET,
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
logging.getLogger("httpx").setLevel(logging.WARNING)
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
BYOK_ENCRYPTION_KEY: str = _require_env("BYOK_ENCRYPTION_KEY")
_fernet = Fernet(BYOK_ENCRYPTION_KEY.encode())
SUPABASE_JWT_SECRET: str | None = os.getenv("SUPABASE_JWT_SECRET")
_jwk_client = PyJWKClient(
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True
)
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS","http://localhost:3000")
TRIAL_MODEL = "llama-3.1-8b-instant"   # High rate-limits on Groq free tier (30 RPM)
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
STREAM_TIMEOUT_SECONDS = 90                   # hard cap on one /chat/stream call
ATS_TIMEOUT_SECONDS = 90                      # hard cap on one /ats call
MAX_HISTORY_MESSAGES = 20                     # keep context lean to save tokens


# ============================================================
# Rate Limiters (instantiated once at startup)
# ============================================================
chat_limiter = RateLimiter(max_requests=10, window_seconds=60)
ats_limiter = RateLimiter(max_requests=2, window_seconds=60)
auth_limiter = RateLimiter(max_requests=5, window_seconds=60)
forgot_password_limiter = RateLimiter(max_requests=3, window_seconds=3600)
validate_key_limiter = RateLimiter(max_requests=5, window_seconds=60)

# ============================================================
# FastAPI App
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.executor = ThreadPoolExecutor(max_workers=4)

    # Keep-alive: ping the /ping endpoint every 12 min so Render free tier
    # doesn't spin down between requests.
    async def _keep_alive():
        import httpx as _httpx
        backend_url = os.getenv("RENDER_EXTERNAL_URL", "")
        if not backend_url:
            return  # skip locally or if env var absent
        while True:
            await asyncio.sleep(12 * 60)  # 12 minutes
            try:
                async with _httpx.AsyncClient(timeout=10) as c:
                    await c.get(f"{backend_url}/ping")
                    logger.debug("Keep-alive ping sent.")
            except Exception:
                pass  # best-effort; failures are harmless

    # Periodic rate-limiter bucket pruner — runs every 10 minutes.
    # Without this, _buckets accumulates expired timestamps for every unique
    # user/IP that ever hit the service, leaking memory indefinitely.
    async def _prune_rate_limiters():
        limiters = [chat_limiter, ats_limiter, auth_limiter,
                    forgot_password_limiter, validate_key_limiter]
        while True:
            await asyncio.sleep(10 * 60)  # 10 minutes
            try:
                now = __import__("time").monotonic()
                for limiter in limiters:
                    stale = [
                        uid for uid, bucket in list(limiter._buckets.items())
                        if not bucket or bucket[-1] < now - limiter.window_seconds
                    ]
                    for uid in stale:
                        limiter._buckets.pop(uid, None)
                logger.debug("Rate-limiter buckets pruned (%d limiters).", len(limiters))
            except Exception:
                pass  # best-effort

    _keep_alive_task = asyncio.create_task(_keep_alive())
    _prune_task = asyncio.create_task(_prune_rate_limiters())
    yield
    _keep_alive_task.cancel()
    _prune_task.cancel()
    app.state.executor.shutdown(wait=True)

## ____ Defining the app here __________
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
# Default to allow all origins using regex to bypass the allow_origins=["*"] restriction when allow_credentials=True.
# This prevents 400 Bad Request OPTIONS errors due to trailing slashes or config mismatches in ALLOWED_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",  # Regex match for all origins resolves Render preflight issues
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth: JWT Verification Dependency
def _verify_jwt(token: str) -> dict:
    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                raise jwt.PyJWTError("Token is HS256 but SUPABASE_JWT_SECRET is not set in environment.")
            return jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_exp": False},
            )
        elif alg in ("ES256", "RS256"):
            if _jwk_client is None:
                raise jwt.PyJWTError("Token is asymmetric but JWKS client failed to initialize.")
            signing_key = _jwk_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
                options={"verify_exp": False},
            )
        else:
            raise jwt.PyJWTError(f"Unsupported JWT algorithm: {alg}")
    except jwt.ExpiredSignatureError as e:
        logger.error(f"JWT expired: {e}")
        raise HTTPException(
            status_code=401,
            detail="Token has expired or is invalid. Please log in again.",
        )
    except jwt.PyJWTError as e:
        logger.error(f"JWT verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")

def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )
    token = auth_header.split(" ", 1)[1]
    payload = _verify_jwt(token)
    request.state.token = token
    return {"sub": payload["sub"], "email": payload.get("email")}

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# BYOK key encryption helpers

def encrypt_secret(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()

def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, ValueError, Exception):
        logger.error("Could not decrypt stored BYOK key — treating as unset.")
        return None

def resolve_api_key_and_model(profile: dict) -> tuple[str, str]:
    encrypted_key = profile.get("groq_api_key") if profile else None
    if encrypted_key:
        byok_key = decrypt_secret(encrypted_key)
        if byok_key:
            model = profile.get("preferred_model") or TRIAL_MODEL
            return byok_key, model
    return DEV_GROQ_API_KEY, TRIAL_MODEL

# Cache the encoder at module level — creating it on every call is expensive
# (it loads a large BPE vocab file from disk / cache each time).
_TOKEN_ENCODER = None

def _get_encoder():
    global _TOKEN_ENCODER
    if _TOKEN_ENCODER is None:
        _TOKEN_ENCODER = tiktoken.get_encoding("cl100k_base")
    return _TOKEN_ENCODER

def estimate_tokens(text: str) -> int:
    try:
        return len(_get_encoder().encode(text))
    except Exception:
        return int(len(text.split()) * 1.3)


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        text = "\n".join(page.get_text() for page in pdf_doc)
    finally:
        pdf_doc.close()
    if text.strip():
        return text
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

_INJECTION_RE = re.compile(
    r"""
    (
        (?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?)
        | you\s+are\s+now
        | act\s+as\s+(?:a\s+|an\s+|your\s+)?
        | adopt\s+the\s+persona\s+of
        | system:\s*\[
        | \[system\]
        | <system>
        | <\|system\|>
        | <\|user\|>
        | <\|assistant\|>
        | new\s+instructions?:
        | override:
        | jailbreak
        | DAN\s+prompt
    )
    """,
    re.IGNORECASE | re.VERBOSE
)

def _normalize_text(content: str) -> str:
    condensed = re.sub(r'\s+', ' ', content)
    return condensed
def _sanitize_web_content(content: str) -> str:
    if not content:
        return content
    normalized_content = _normalize_text(content)
    sanitized = _INJECTION_RE.sub("[REDACTED]", normalized_content)
    if sanitized != normalized_content:
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

class ATSCandidateStatusRequest(BaseModel):
    status: str = Field(..., pattern=r'^(pending|analyzed|rejected|shortlisted|hired)$')

class ShareChatResponse(BaseModel):
    share_token: str
    share_url: str

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
    return {"alive": True}

@app.post("/auth/signup", tags=["Auth"])
def signup(body: SignUpRequest, request: Request):
    auth_limiter.enforce(_client_ip(request))
    try:
        return auth_service.sign_up(body.email, body.password, body.full_name)
    except Exception:
        logger.exception("Signup failed")
        raise HTTPException(status_code=400, detail="Could not create account.Try again")

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
async def patch_profile(
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
async def validate_byok_key(
    body: ValidateKeyRequest,
    user: dict = Depends(get_current_user),
):
    validate_key_limiter.enforce(user["sub"])
    is_valid, error_msg = await validate_groq_key(body.api_key)
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


@app.post("/chats/{chat_id}/share", tags=["Chats"], response_model=ShareChatResponse)
def share_chat(
    chat_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Create (or retrieve) a public share token for a chat."""
    if get_chat_owner(chat_id) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your chat.")
    token = create_shared_chat(chat_id, user["sub"])
    share_url = f"{FRONTEND_URL}/share/{token}"
    return {"share_token": token, "share_url": share_url}


# ============================================================
# Routes: Public Share View (no auth required)
# ============================================================

@app.get("/share/{share_token}", tags=["Share"])
def get_shared_chat(
    share_token: str,
):
    """
    Public endpoint — returns messages for a shared chat.
    No authentication required; access is gated by the opaque token.
    """
    shared = get_shared_chat_by_token(share_token)
    if not shared:
        raise HTTPException(status_code=404, detail="Shared chat not found or link has expired.")
    chat_id = shared["chat_id"]
    messages = get_shared_chat_messages(chat_id)
    title = get_shared_chat_title(chat_id)
    return {"title": title, "messages": messages, "chat_id": chat_id}

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
# Routes: Documents — now backed by Supabase Storage
# ============================================================

@app.post("/documents", tags=["Documents"])
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload a document to Supabase Storage and save metadata to DB.
    File blob is stored in Storage; only text content + metadata in PostgreSQL.
    """
    user_id = user["sub"]
    content_bytes = await file.read()
    size_bytes = len(content_bytes)
    filename = file.filename or "upload"
    mime = file.content_type or "application/octet-stream"

    # Extract text for RAG + DB storage — run blocking I/O in thread pool
    content_text = ""
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        try:
            loop = asyncio.get_running_loop()
            executor: ThreadPoolExecutor = request.app.state.executor
            content_text = await loop.run_in_executor(executor, _extract_pdf_text, content_bytes)
        except Exception:
            logger.exception("PDF extraction failed during upload")
            content_text = "[Could not extract text from PDF]"
    else:
        try:
            content_text = content_bytes.decode("utf-8", errors="replace")
        except Exception:
            content_text = ""

    # Upload binary to Supabase Storage
    storage_path = f"{user_id}/{filename}"
    file_url = ""
    try:
        upload_file_to_storage(DOCUMENTS_BUCKET, storage_path, content_bytes, mime)
        file_url = get_file_signed_url(DOCUMENTS_BUCKET, storage_path, expires_in=86400 * 365)
    except Exception:
        logger.exception("Storage upload failed for user %s", user_id)
        # Still save the metadata even if storage fails
        storage_path = None
        file_url = None

    doc_id = save_document(
        user_id=user_id,
        name=filename,
        content=content_text,
        size_bytes=size_bytes,
        storage_path=storage_path,
        mime_type=mime,
        file_url=file_url,
    )
    return {
        "id": doc_id,
        "name": filename,
        "size_bytes": size_bytes,
        "file_url": file_url,
        "storage_path": storage_path,
        "content": content_text[:500],  # small preview for immediate UI display
    }

@app.get("/documents", tags=["Documents"])
def list_documents(user: dict = Depends(get_current_user)):
    docs = get_global_documents(user["sub"])
    return {"documents": docs}


@app.delete("/documents/{doc_id}", tags=["Documents"])
def remove_document(doc_id: str, user: dict = Depends(get_current_user)):
    delete_document(doc_id, user["sub"])
    return {"success": True}


# ============================================================
# Routes: Streaming Chat
# ============================================================

# to safely use extract_user_facts and manage_memory in background
async def _safe_run(coro):
        """Wrapper to safely run background tasks without crashing the thread."""
        try:
            await coro
        except Exception as e:
            logger.exception(f"Background task failed: {e}")

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

    # Persist user message; include doc name so history can reconstruct attachment indicator
    save_message(
        chat_id, "user", user_message,
        token_count=estimate_tokens(user_message),
        file_name=body.doc_name,
    )

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

        except Exception as e:
            logger.exception("Streaming error in chat %s", chat_id)
            error_occurred = True
            error_str = str(e).lower()
            if "rate_limit" in error_str or "429" in error_str:
                yield _sse({"type": "error", "message": "Rate limit exceeded. Please wait a moment or add your own Groq API key in Settings."})
            elif "failed to call a function" in error_str:
                yield _sse({"type": "error", "message": "The AI encountered an issue using its tools. Please try rephrasing your request."})
            else:
                yield _sse({"type": "error", "message": "An error occurred while generating the response."})

        # Persist whatever was generated, even on disconnect/timeout
        if full_response:
            save_message(chat_id, "assistant", full_response, token_count=total_tokens)

            # Fire-and-forget background tasks (do NOT block the SSE stream)
            asyncio.create_task(
                _safe_run(extract_user_facts(user_message, user_id, llm))
            )

            # Memory Management
            asyncio.create_task(
                _safe_run(manage_memory(chat_id, llm))
            )

            if is_trial:
                async def _increment_safely():
                    await asyncio.to_thread(increment_trial_tokens, user_id, total_tokens)

                asyncio.create_task(_safe_run(_increment_safely()))

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
    Runs the 2-step ATS resume optimization pipeline natively using async.
    Returns: { critique, refined_bullets }
    """
    ats_limiter.enforce(user["sub"])
    user_id = user["sub"]
    profile = get_profile(user_id)
    api_key, model = resolve_api_key_and_model(profile)
    is_trial = (api_key == DEV_GROQ_API_KEY)

    raw_text = body.resume_text + body.job_description

    # 1. Cheap CPU Check: Guard against massive payloads before tokenizing
    MAX_CHARS = 30_000 
    if len(raw_text) > MAX_CHARS:
         raise HTTPException(
             status_code=413, 
             detail=f"Input text is too long. Max allowed characters: {MAX_CHARS}."
         )

    # 2. Expensive CPU Check: Token estimation for trial users
    if is_trial:
        used, limit = get_trial_usage(user_id)
        prompt_tokens = estimate_tokens(raw_text)
        if used + prompt_tokens > limit:
            raise HTTPException(
                status_code=429,
                detail=f"Trial token limit reached ({limit} tokens). Please add your own Groq API key in Settings.",
            )

    ats_workflow = build_ats_workflow(api_key, model)

    # 3. Native Async Invocation (No ThreadPool Tax)
    try:
        # We use ainvoke instead of invoke to let the event loop handle the I/O wait efficiently
        final_state = await asyncio.wait_for(
            ats_workflow.ainvoke(
                {
                    "resume_text": body.resume_text,
                    "job_description": body.job_description,
                    "critique": "",
                    "refined_bullets": "",
                }
            ),
            timeout=ATS_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="ATS analysis timed out. Please try again.")
    except Exception as e:
        logger.exception("ATS workflow failed for user %s: %s", user_id, e)
        if "rate_limit" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a moment or add your own Groq API key in Settings.")
        raise HTTPException(status_code=500, detail="ATS analysis failed.")

    # 4. Fire-and-Forget Analytics/Billing updates (Don't block the return)
    if is_trial:
        total = estimate_tokens(final_state["critique"] + final_state["refined_bullets"])
        
        # We use the executor here just to offload the synchronous DB update, 
        # so the user gets their resume critique back instantly.
        executor: ThreadPoolExecutor = request.app.state.executor
        loop = asyncio.get_running_loop()
        
        def _safe_increment():
            try:
                increment_trial_tokens(user_id, total)
            except Exception as e:
                logger.exception("increment_trial_tokens failed for user %s: %s", user_id, e)
                
        loop.run_in_executor(executor, _safe_increment)

    return {
        "critique": final_state["critique"],
        "refined_bullets": final_state["refined_bullets"],
    }


# ============================================================
# Routes: ATS Candidates (CRUD Dashboard)
# ============================================================

@app.post("/ats/upload", tags=["ATS Agent"])
async def ats_upload_resume(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload a resume PDF to Supabase Storage, extract text, run ATS analysis,
    and persist the candidate record.
    """
    ats_limiter.enforce(user["sub"])
    user_id = user["sub"]
    profile = get_profile(user_id)
    api_key, model = resolve_api_key_and_model(profile)

    content_bytes = await file.read()
    filename = file.filename or "resume.pdf"

    # Extract text
    loop = asyncio.get_running_loop()
    executor: ThreadPoolExecutor = request.app.state.executor
    try:
        resume_text = await loop.run_in_executor(executor, _extract_pdf_text, content_bytes)
    except Exception:
        logger.exception("PDF extraction failed for ATS upload")
        raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

    # Upload to Supabase Storage
    storage_path = f"{user_id}/{filename}"
    try:
        upload_file_to_storage(ATS_BUCKET, storage_path, content_bytes, "application/pdf")
    except Exception:
        logger.exception("ATS resume storage upload failed for user %s", user_id)
        storage_path = None

    return {
        "resume_text": resume_text[:50_000],
        "storage_path": storage_path,
        "filename": filename,
    }


@app.get("/ats/candidates", tags=["ATS Agent"])
def list_ats_candidates(user: dict = Depends(get_current_user)):
    """List all ATS candidates for the current user."""
    return {"candidates": get_ats_candidates(user["sub"])}


@app.get("/ats/candidates/{candidate_id}", tags=["ATS Agent"])
def get_ats_candidate_detail(
    candidate_id: str,
    user: dict = Depends(get_current_user),
):
    """Get full details for a specific ATS candidate."""
    candidate = get_ats_candidate(candidate_id, user["sub"])
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return candidate


@app.patch("/ats/candidates/{candidate_id}/status", tags=["ATS Agent"])
def update_candidate_status(
    candidate_id: str,
    body: ATSCandidateStatusRequest,
    user: dict = Depends(get_current_user),
):
    """Update the hiring pipeline status of a candidate."""
    candidate = get_ats_candidate(candidate_id, user["sub"])
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    update_ats_candidate_status(candidate_id, user["sub"], body.status)
    return {"success": True}


@app.delete("/ats/candidates/{candidate_id}", tags=["ATS Agent"])
def remove_ats_candidate(
    candidate_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a candidate and their resume from storage."""
    candidate = get_ats_candidate(candidate_id, user["sub"])
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    delete_ats_candidate(candidate_id, user["sub"])
    return {"success": True}


# ============================================================
# Retry Utility
# ============================================================

async def with_retry(
    coro_factory,
    max_attempts: int = 5,
    base_delay: float = 0.5,
    label: str = "operation",
):
    """
    Retry an async operation up to `max_attempts` times with exponential backoff.
    On final failure, returns None and logs the error (does not raise).
    For use in background/non-critical tasks.
    """
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return await coro_factory()
        except Exception as exc:
            last_exc = exc
            if attempt < max_attempts - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    "[retry] %s failed (attempt %d/%d), retrying in %.1fs: %s",
                    label, attempt + 1, max_attempts, delay, exc,
                )
                await asyncio.sleep(delay)
    logger.error(
        "[retry] %s failed after %d attempts: %s", label, max_attempts, last_exc
    )
    return None