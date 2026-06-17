"""
main.py — Penda FastAPI Backend
Production-ready RESTful API that:
  - Accepts JWT tokens from Supabase Auth (verifies them server-side)
  - Routes to the correct Groq API key (BYOK or dev trial key)
  - Enforces token limits for trial users (token budget + request rate)
  - Validates BYOK Groq API keys before saving them
  - Streams LLM responses using Server-Sent Events (SSE)
  - Persists all chat data to Supabase PostgreSQL

Phase 2 additions:
  - /auth/signup, /auth/login, /auth/logout, /auth/refresh, /auth/forgot-password
  - /profile/validate-key  (BYOK key validation)
  - Per-user sliding-window rate limiter on /chat/stream and /ats
"""

import os
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import tiktoken
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
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
    get_summary,
    get_trial_usage,
    increment_trial_tokens,
    save_document,
    get_global_documents,
    delete_document,
)
from memory import build_context, manage_memory, extract_user_facts
from graph import build_chat_workflow, build_ats_workflow, build_llm

load_dotenv()

# ============================================================
# Config
# ============================================================

DEV_GROQ_API_KEY: str = os.environ["GROQ_API_KEY"]          # Your dev Groq key (trial mode)
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Build allowed origins list from ALLOWED_ORIGINS env var (comma-separated).
# Always ensure FRONTEND_URL is included even if ALLOWED_ORIGINS isn't set.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["http://localhost:3000"]
)
# Guarantee the explicit FRONTEND_URL is always in the list
if FRONTEND_URL and FRONTEND_URL not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(FRONTEND_URL)

# Default model for trial users
TRIAL_MODEL = "llama-3.1-8b-instant"

# Available Groq models (updated June 2025 — from user's Groq dashboard)
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

# ============================================================
# Rate Limiters (instantiated once at startup)
# ============================================================

# Chat: max 15 requests per 60-second window per user
chat_limiter = RateLimiter(max_requests=15, window_seconds=60)

# ATS: max 5 runs per 60-second window (heavier, 2-step pipeline)
ats_limiter = RateLimiter(max_requests=5, window_seconds=60)


# ============================================================
# FastAPI App
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing heavy needed since LLM is per-request
    yield
    # Shutdown: cleanup if needed

app = FastAPI(
    title="Penda API",
    version="1.0.0",
    description="Backend API for the Penda AI chat application.",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────
# Custom echo-origin middleware instead of CORSMiddleware.
# Reason: CORSMiddleware with allow_credentials=True requires an exact
# origin match and returns 400 for any unrecognised origin — fragile in
# multi-env deployments. Since the frontend uses Bearer tokens (not
# cookies), we don't need credentialed mode; we just reflect back the
# incoming Origin so every Vercel/localhost origin is always accepted.
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "*")

    # Handle CORS preflight immediately — never let it reach route handlers
    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-Requested-With",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Max-Age": "86400",
            },
        )

    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# ============================================================
# Auth: JWT Verification Dependency
# ============================================================

def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency. Extracts and verifies the Supabase JWT by calling
    Supabase's own get_user() API — avoids any JWT secret format issues.
    Returns a dict with 'sub' (user UUID) and 'email'.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )

    token = auth_header.split(" ", 1)[1]
    try:
        sb = get_client()
        response = sb.auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")
        return {"sub": response.user.id, "email": response.user.email}
    except HTTPException:
        raise
    except Exception as exc:
        msg = str(exc).lower()
        if any(k in msg for k in ("expired", "invalid", "unauthorized", "jwt")):
            raise HTTPException(status_code=401, detail="Token has expired or is invalid. Please log in again.")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {exc}")


def resolve_api_key_and_model(profile: dict) -> tuple[str, str]:
    """
    Returns (api_key, model) to use for this request.
    - If the user has saved their own BYOK key → use it with their preferred model.
    - Otherwise → use the dev trial key with the default trial model.
    """
    byok_key = profile.get("groq_api_key") if profile else None
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


# ============================================================
# Pydantic Request / Response Models
# ============================================================

class ChatRequest(BaseModel):
    chat_id: str
    message: str
    # Inline per-chat document (text extracted client-side, not stored in DB)
    doc_name: str | None = None
    doc_content: str | None = Field(default=None, max_length=5_000_000)

class DocumentUploadRequest(BaseModel):
    name: str = Field(..., max_length=200)
    content: str = Field(..., max_length=12_000)

class NewChatResponse(BaseModel):
    chat_id: str

class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    style: str | None = None
    expertise_level: str | None = None
    groq_api_key: str | None = None
    preferred_model: str | None = None

class ATSRequest(BaseModel):
    resume_text: str
    job_description: str

class UpdateTitleRequest(BaseModel):
    title: str

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
    access_token: str  # recovery token from the reset link URL
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


# ============================================================
# Routes: Auth
# All auth routes are public (no JWT required).
# The Supabase JS SDK on the frontend handles most auth flows;
# these endpoints exist as a clean server-side interface.
# ============================================================

@app.post("/auth/signup", tags=["Auth"])
def signup(body: SignUpRequest):
    """
    Register a new user.
    Returns { user, session } on success.
    The Supabase trigger auto-creates a profile row.
    """
    try:
        result = auth_service.sign_up(body.email, body.password, body.full_name)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/auth/login", tags=["Auth"])
def login(body: SignInRequest):
    """
    Authenticate with email + password.
    Returns { user, session: { access_token, refresh_token, expires_at } }.
    The frontend stores these tokens in memory (not localStorage for XSS safety).
    """
    try:
        result = auth_service.sign_in(body.email, body.password)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/auth/logout", tags=["Auth"])
def logout(user: dict = Depends(get_current_user), request: Request = None):
    """
    Invalidate the current session on the Supabase side.
    Requires a valid Bearer token in the Authorization header.
    """
    try:
        token = request.headers.get("Authorization", "").split(" ", 1)[1]
        auth_service.sign_out(token)
        return {"success": True}
    except Exception:
        # Even if Supabase errors, we still treat the client as logged out
        return {"success": True}


@app.post("/auth/refresh", tags=["Auth"])
def refresh(body: RefreshRequest):
    """
    Exchange a refresh_token for a new access_token.
    Call this when a 401 'Token has expired' is returned by any endpoint.
    """
    try:
        result = auth_service.refresh_session(body.refresh_token)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/auth/forgot-password", tags=["Auth"])
def forgot_password(body: ForgotPasswordRequest):
    """
    Trigger a password-reset email for the given address.
    Supabase sends the email; the link redirects to FRONTEND_URL/auth/reset-password.
    Always returns success to prevent email enumeration attacks.
    """
    try:
        redirect = f"{FRONTEND_URL}/auth/reset-password"
        auth_service.send_password_reset(body.email, redirect)
    except Exception:
        pass  # Intentionally swallow all errors
    return {"success": True, "message": "If that email exists, a reset link has been sent."}


@app.post("/auth/update-password", tags=["Auth"])
def update_password(body: UpdatePasswordRequest):
    """
    Set a new password using the recovery token from the reset email link.
    The frontend should parse the access_token from the URL hash and POST it here.
    """
    try:
        result = auth_service.update_password(body.access_token, body.new_password)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ============================================================
# Routes: Models
# ============================================================

@app.get("/models", tags=["Models"])
def list_models():
    """Returns the list of Groq models available for BYOK users."""
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

    # Never expose the raw API key — just indicate if one is set
    safe_profile = {k: v for k, v in profile.items() if k != "groq_api_key"}
    safe_profile["has_byok"] = bool(profile.get("groq_api_key"))

    # Add trial usage info
    used, limit = get_trial_usage(user_id)
    safe_profile["trial_tokens_used"] = used
    safe_profile["trial_token_limit"] = limit

    return safe_profile


@app.patch("/profile", tags=["Profile"])
def patch_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    """
    Update profile fields. If groq_api_key is included, it is saved
    as-is (assumed already validated via /profile/validate-key).
    """
    user_id = user["sub"]
    updates = body.model_dump(exclude_none=True)
    updated = update_profile(user_id, **updates)
    return {"success": True, "profile": updated}


@app.post("/profile/validate-key", tags=["Profile"])
def validate_byok_key(
    body: ValidateKeyRequest,
    user: dict = Depends(get_current_user),
):
    """
    Test a user's Groq API key before saving it to their profile.
    Makes a minimal test call to Groq and returns whether the key works.
    The frontend should call this BEFORE calling PATCH /profile.

    Returns: { valid: bool, message: str }
    """
    is_valid, error_msg = validate_groq_key(body.api_key)
    if is_valid:
        return {"valid": True, "message": "API key is valid! BYOK mode unlocked."}
    else:
        return {"valid": False, "message": error_msg}


@app.delete("/profile/key", tags=["Profile"])
def remove_byok_key(user: dict = Depends(get_current_user)):
    """
    Remove the user's saved Groq API key, reverting them to trial mode.
    """
    user_id = user["sub"]
    update_profile(user_id, groq_api_key=None)
    return {"success": True, "message": "API key removed. You are now in Trial mode."}


# ============================================================
# Routes: Chats
# ============================================================

@app.get("/chats", tags=["Chats"])
def list_chats(user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    return {"chats": get_chats(user_id)}


@app.post("/chats", tags=["Chats"], response_model=NewChatResponse)
def new_chat(user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    chat_id = create_chat(user_id)
    return {"chat_id": chat_id}


@app.delete("/chats/{chat_id}", tags=["Chats"])
def remove_chat(chat_id: str, user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    owner = get_chat_owner(chat_id)
    if owner != user_id:
        raise HTTPException(status_code=403, detail="Not your chat.")
    delete_chat(chat_id)
    return {"success": True}


@app.patch("/chats/{chat_id}/title", tags=["Chats"])
def set_chat_title(
    chat_id: str,
    body: UpdateTitleRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    owner = get_chat_owner(chat_id)
    if owner != user_id:
        raise HTTPException(status_code=403, detail="Not your chat.")
    update_title(chat_id, body.title)
    return {"success": True}


@app.get("/chats/{chat_id}/messages", tags=["Chats"])
def get_chat_messages(chat_id: str, user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    owner = get_chat_owner(chat_id)
    if owner != user_id:
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
    """Upload a global document (available in all chats for this user)."""
    user_id = user["sub"]
    size_bytes = len(body.content.encode("utf-8"))
    doc_id = save_document(
        user_id=user_id,
        name=body.name,
        content=body.content,
        size_bytes=size_bytes,
    )
    return {"id": doc_id, "name": body.name, "size_bytes": size_bytes}


@app.get("/documents", tags=["Documents"])
def list_documents(user: dict = Depends(get_current_user)):
    """List all global documents for the current user."""
    docs = get_global_documents(user["sub"])
    # Omit the full content from list response (bandwidth saving)
    return {"documents": [{k: v for k, v in d.items() if k != "content"} for d in docs]}


@app.delete("/documents/{doc_id}", tags=["Documents"])
def remove_document(doc_id: str, user: dict = Depends(get_current_user)):
    """Delete a global document (ownership verified server-side)."""
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
    The frontend should use fetch() with ReadableStream.

    SSE Event format:
      data: {"type": "token", "content": "..."}
      data: {"type": "tool_call", "tool": "web_search"}
      data: {"type": "done", "total_tokens": 123}
      data: {"type": "error", "message": "..."}
    """
    # Rate limit check (uses already-verified user dict, no JWT re-decode needed)
    chat_limiter.enforce(user["sub"])
    user_id = user["sub"]
    chat_id = body.chat_id
    user_message = body.message.strip()

    # --- Auth guard ---
    owner = get_chat_owner(chat_id)
    if owner != user_id:
        raise HTTPException(status_code=403, detail="Not your chat.")

    # --- Resolve API key ---
    profile = get_profile(user_id)
    api_key, model = resolve_api_key_and_model(profile)
    is_trial = (api_key == DEV_GROQ_API_KEY)

    # --- Trial rate-limit check ---
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

    # --- Persist user message ---
    save_message(chat_id, "user", user_message, token_count=estimate_tokens(user_message))

    # --- Auto-title on first message ---
    if count_messages(chat_id) == 1:
        update_title(chat_id, user_message[:40])

    # --- Build LLM instance for this request ---
    llm = build_llm(api_key, model)

    # --- Build context history ---
    history = build_context(chat_id, user_id, llm, current_prompt=user_message)

    # --- Inject document context (inline + global) ---
    from langchain_core.messages import SystemMessage
    doc_segments: list[str] = []

    # 1. Inline per-chat document (sent with this request, not stored in DB)
    if body.doc_content:
        content_text = body.doc_content
        if content_text.startswith("data:application/pdf;base64,"):
            try:
                import base64
                import fitz
                b64_data = content_text.split(",", 1)[1]
                pdf_bytes = base64.b64decode(b64_data)
                pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                text_parts = []
                for page in pdf_doc:
                    text_parts.append(page.get_text())
                content_text = "\n".join(text_parts)
            except Exception as e:
                content_text = f"[Failed to extract PDF text: {e}]"
                
        truncated = content_text[:15_000]
        doc_segments.append(
            f"[Attached Document: {body.doc_name or 'document'}]\n{truncated}"
        )

    # 2. User's saved global documents (stored in DB, available in every chat)
    global_docs = get_global_documents(user_id)
    for doc in global_docs[:5]:   # cap at 5 global docs per request
        doc_segments.append(
            f"[Global Document: {doc['name']}]\n{doc['content'][:5_000]}"
        )

    if doc_segments:
        history.insert(
            0,
            SystemMessage(
                content=(
                    "The following documents have been provided by the user for reference.\n"
                    "Use them when answering questions.\n\n"
                    + "\n\n---\n\n".join(doc_segments)
                )
            ),
        )

    # --- Append the current user message to history ---
    # build_context() only fetches messages already saved to DB.
    # The message was just saved above, but the DB round-trip means it may
    # already be in recent_messages. Add it explicitly only if not present.
    from langchain_core.messages import HumanMessage as _HM
    if not history or not (isinstance(history[-1], _HM) and history[-1].content == user_message):
        history.append(_HM(content=user_message))

    # --- Build workflow ---
    workflow = build_chat_workflow(api_key, model)

    # Thread pool for running the synchronous LangGraph workflow
    _executor = ThreadPoolExecutor(max_workers=2)

    async def event_generator() -> AsyncGenerator[str, None]:
        full_response = ""
        total_tokens = 0
        last_tool_call_name: str | None = None

        try:
            # Run the blocking workflow.stream() in a thread so it doesn't
            # starve the asyncio event loop (critical on single-worker Render).
            loop = asyncio.get_event_loop()

            def _run_workflow():
                """Collect all (chunk, metadata) pairs synchronously."""
                return list(workflow.stream(
                    {"messages": history}, stream_mode="messages"
                ))

            all_chunks = await loop.run_in_executor(_executor, _run_workflow)

            for chunk, metadata in all_chunks:
                node = metadata.get("langgraph_node", "")

                # Only process output from the assistant node
                if node != "assistant":
                    continue

                # --- Tool call announcement ---
                if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                    for tc in chunk.tool_calls:
                        # tc may be a dict or an object; guard both forms
                        name = (
                            tc.get("name") if isinstance(tc, dict)
                            else getattr(tc, "name", None)
                        )
                        if name and name != last_tool_call_name:
                            last_tool_call_name = name
                            event = json.dumps({"type": "tool_call", "tool": name})
                            yield f"data: {event}\n\n"
                            await asyncio.sleep(0)

                # --- Text token ---
                elif chunk.content:
                    full_response += chunk.content
                    total_tokens += estimate_tokens(chunk.content)
                    event = json.dumps({"type": "token", "content": chunk.content})
                    yield f"data: {event}\n\n"
                    await asyncio.sleep(0)

            # Persist the complete assistant response
            save_message(chat_id, "assistant", full_response, token_count=total_tokens)

            # Extract user facts in background AFTER stream completes (non-blocking for UX)
            try:
                extract_user_facts(user_message, user_id, llm)
            except Exception:
                pass  # Never let fact extraction crash the response

            # Update trial token counter (wrapped — RPC may not exist yet)
            if is_trial:
                try:
                    increment_trial_tokens(user_id, total_tokens)
                except Exception:
                    pass

            # Memory management
            try:
                manage_memory(chat_id, llm)
            except Exception:
                pass

            done_event = json.dumps({"type": "done", "total_tokens": total_tokens})
            yield f"data: {done_event}\n\n"

        except Exception as exc:
            error_event = json.dumps({"type": "error", "message": str(exc)})
            yield f"data: {error_event}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering on Render
        },
    )


# ============================================================
# Routes: ATS Agent
# ============================================================

@app.post("/ats", tags=["ATS Agent"])
def run_ats_agent(
    body: ATSRequest,
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

    # Rough token estimate for ATS (resume + JD)
    if is_trial:
        used, limit = get_trial_usage(user_id)
        prompt_tokens = estimate_tokens(body.resume_text + body.job_description)
        if used + prompt_tokens > limit:
            raise HTTPException(
                status_code=429,
                detail="Trial token limit reached. Add your own Groq API key in Settings.",
            )

    ats_workflow = build_ats_workflow(api_key, model)
    final_state = ats_workflow.invoke({
        "resume_text": body.resume_text,
        "job_description": body.job_description,
        "critique": "",
        "refined_bullets": "",
    })

    if is_trial:
        total = estimate_tokens(final_state["critique"] + final_state["refined_bullets"])
        increment_trial_tokens(user_id, total)

    return {
        "critique": final_state["critique"],
        "refined_bullets": final_state["refined_bullets"],
    }
