import os
import secrets
from datetime import datetime, timezone
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_KEY")
    or ""
)
if not SUPABASE_SERVICE_KEY:
    raise RuntimeError(
        "Missing Supabase service key. "
        "Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in your Render environment variables."
    )

_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

DOCUMENTS_BUCKET = "documents"
ATS_BUCKET = "ats-resumes"


def get_client() -> Client:
    return _supabase


# ============================================================
# Profile
# ============================================================
def get_profile(user_id: str) -> dict | None:
    res = (
        _supabase.table("profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return res.data

def update_profile(user_id: str, **fields) -> dict:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = (
        _supabase.table("profiles")
        .update(fields)
        .eq("id", user_id)
        .execute()
    )
    return res.data[0] if res.data else {}


# ============================================================
# Chats
# ============================================================

def create_chat(user_id: str) -> str:
    """Create a new chat row and return its UUID."""
    res = (
        _supabase.table("chats")
        .insert({"user_id": user_id, "title": "New Chat"})
        .execute()
    )
    return res.data[0]["id"]


def get_chats(user_id: str) -> list[dict]:
    """Return all chats for a user, newest first."""
    res = (
        _supabase.table("chats")
        .select("id, title, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def update_title(chat_id: str, title: str) -> None:
    _supabase.table("chats").update({
        "title": title, 
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", chat_id).execute()


def delete_chat(chat_id: str) -> None:
    """Cascade deletes messages, summaries automatically via FK."""
    _supabase.table("chats").delete().eq("id", chat_id).execute()


def get_chat_owner(chat_id: str) -> str | None:
    """Return user_id who owns this chat (used for auth guard)."""
    res = (
        _supabase.table("chats")
        .select("user_id")
        .eq("id", chat_id)
        .single()
        .execute()
    )
    return res.data["user_id"] if res.data else None


# ============================================================
# Messages
# ============================================================

def save_message(chat_id: str, role: str, content: str, token_count: int = 0, file_name: str | None = None) -> int:
    """Insert a message and return its ID."""
    row: dict = {
        "chat_id": chat_id,
        "role": role,
        "content": content,
        "token_count": token_count,
    }
    if file_name:
        row["file_name"] = file_name
    res = (
        _supabase.table("messages")
        .insert(row)
        .execute()
    )
    return res.data[0]["id"]


def get_messages(chat_id: str) -> list[dict]:
    """Return all messages for a chat in chronological order."""
    res = (
        _supabase.table("messages")
        .select("role, content, file_name")
        .eq("chat_id", chat_id)
        .order("id", desc=False)
        .execute()
    )
    return res.data or []


def get_recent_messages(chat_id: str, limit: int = 6) -> list[dict]:
    """Return the most recent `limit` messages in ascending order."""
    res = (
        _supabase.table("messages")
        .select("role, content")
        .eq("chat_id", chat_id)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(res.data or []))


def count_messages(chat_id: str) -> int:
    res = (
        _supabase.table("messages")
        .select("id", count="exact")
        .eq("chat_id", chat_id)
        .execute()
    )
    return res.count or 0


def delete_old_messages(chat_id: str, keep: int = 6) -> None:
    """Keep only the `keep` most recent messages, delete the rest."""
    res = (
        _supabase.table("messages")
        .select("id")
        .eq("chat_id", chat_id)
        .order("id", desc=True)
        .limit(keep)
        .execute()
    )
    
    keep_ids = [row["id"] for row in (res.data or [])]
    if not keep_ids:
        return

    # supabase-py v2: .not_ is a property (SyncFilterRequestBuilder), not callable.
    # Use .not_.in_() with a plain list instead of a hand-formatted string.
    (
        _supabase.table("messages")
        .delete()
        .eq("chat_id", chat_id)
        .not_.in_("id", keep_ids)
        .execute()
    )


# ============================================================
# Summaries
# ============================================================

def get_summary(chat_id: str) -> str:
    res = (
        _supabase.table("summaries")
        .select("summary")
        .eq("chat_id", chat_id)
        .execute()
    )
    return res.data[0]["summary"] if res.data else ""


def save_summary(chat_id: str, summary: str) -> None:
    _supabase.table("summaries").upsert({
        "chat_id": chat_id,
        "summary": summary,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


# ============================================================
# User Memory (long-term facts)
# ============================================================

def save_user_fact(user_id: str, fact: str, importance: int = 5) -> None:
    _supabase.table("user_memory").insert({
        "user_id": user_id,
        "fact": fact,
        "importance": importance,
    }).execute()


def get_user_facts(user_id: str) -> list[str]:
    res = (
        _supabase.table("user_memory")
        .select("fact")
        .eq("user_id", user_id)
        .order("importance", desc=True)
        .execute()
    )
    return [row["fact"] for row in (res.data or [])]


# ============================================================
# Trial Token Accounting
# ============================================================

def get_trial_usage(user_id: str) -> tuple[int, int]:
    """Return (tokens_used, token_limit) for a user."""
    res = (
        _supabase.table("profiles")
        .select("trial_tokens_used, trial_token_limit")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if res.data:
        return res.data["trial_tokens_used"], res.data["trial_token_limit"]
    return 0, 5000


def increment_trial_tokens(user_id: str, tokens: int) -> None:
    """Atomically add `tokens` to the user's trial_tokens_used counter."""
    _supabase.rpc("increment_trial_tokens", {"uid": user_id, "amount": tokens}).execute()


# ============================================================
# Documents — Supabase Storage + metadata
# ============================================================

MAX_DOC_CHARS = 12_000   
MAX_DOCS_PER_USER = 10   

def upload_file_to_storage(
    bucket: str,
    path: str,
    content_bytes: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Upload a file to Supabase Storage and return its public/signed URL path.
    Returns the storage path (not the full URL).
    """
    _supabase.storage.from_(bucket).upload(
        path,
        content_bytes,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def get_file_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    """Get a signed URL for a private storage file (valid for `expires_in` seconds)."""
    res = _supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return res.get("signedURL", "")


def get_file_from_storage(bucket: str, path: str) -> bytes:
    """Download file content from Supabase Storage."""
    return _supabase.storage.from_(bucket).download(path)


def delete_file_from_storage(bucket: str, path: str) -> None:
    """Remove a file from Supabase Storage."""
    try:
        _supabase.storage.from_(bucket).remove([path])
    except Exception:
        pass  # Best-effort deletion


def save_document(
    user_id: str,
    name: str,
    content: str | bytes,
    size_bytes: int,
    storage_path: str | None = None,
    mime_type: str | None = None,
    file_url: str | None = None,
) -> str:
    """Persist a global document record and return its UUID.
    
    Backward-compatible: if the V3 columns (storage_path, mime_type, file_url)
    don't exist yet in the DB, falls back to inserting only the base columns.
    """
    content_text = ""
    if isinstance(content, bytes):
        try:
            content_text = content.decode("utf-8", errors="replace")[:MAX_DOC_CHARS]
        except Exception:
            content_text = ""
    else:
        content_text = str(content)[:MAX_DOC_CHARS]

    base_row = {
        "user_id": user_id,
        "name": name,
        "content": content_text,
        "size_bytes": size_bytes,
        "chat_id": None,
    }

    # Try V3 insert first (includes storage columns)
    v3_row = dict(base_row)
    if storage_path:
        v3_row["storage_path"] = storage_path
    if mime_type:
        v3_row["mime_type"] = mime_type
    if file_url:
        v3_row["file_url"] = file_url

    try:
        res = _supabase.table("documents").insert(v3_row).execute()
        return res.data[0]["id"]
    except Exception as e:
        # If V3 columns don't exist yet, fall back to base schema
        if "storage_path" in str(e) or "mime_type" in str(e) or "file_url" in str(e) or "42703" in str(e):
            res = _supabase.table("documents").insert(base_row).execute()
            return res.data[0]["id"]
        raise


def get_global_documents(user_id: str) -> list[dict]:
    """Return all global documents for a user (chat_id IS NULL), newest first.
    
    Selects only base columns that exist in both the original and V3 schema.
    V3 columns (storage_path, mime_type, file_url) are fetched separately
    only after the schema migration has been applied.
    """
    try:
        # Try V3 select first (includes storage metadata)
        res = (
            _supabase.table("documents")
            .select("id, name, size_bytes, created_at, content, storage_path, mime_type, file_url")
            .eq("user_id", user_id)
            .is_("chat_id", None)
            .order("created_at", desc=True)
            .limit(MAX_DOCS_PER_USER)
            .execute()
        )
        return res.data or []
    except Exception as e:
        # V3 columns don't exist yet — fall back to base schema select
        if "storage_path" in str(e) or "mime_type" in str(e) or "file_url" in str(e) or "42703" in str(e):
            res = (
                _supabase.table("documents")
                .select("id, name, size_bytes, created_at, content")
                .eq("user_id", user_id)
                .is_("chat_id", None)
                .order("created_at", desc=True)
                .limit(MAX_DOCS_PER_USER)
                .execute()
            )
            return res.data or []
        raise


def delete_document(doc_id: str, user_id: str) -> None:
    """Delete a document and its storage file if present.
    
    Backward-compatible: handles the case where storage_path column
    doesn't exist yet (pre-V3 schema).
    """
    # Try to fetch storage path (V3 schema only)
    try:
        res = (
            _supabase.table("documents")
            .select("storage_path")
            .eq("id", doc_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if res.data and res.data.get("storage_path"):
            delete_file_from_storage(DOCUMENTS_BUCKET, res.data["storage_path"])
    except Exception as e:
        # If storage_path column doesn't exist, skip storage deletion gracefully
        if "storage_path" in str(e) or "42703" in str(e):
            pass  # Pre-V3 schema — no storage to clean up
        # else re-raise unexpected errors

    _supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user_id).execute()


# ============================================================
# Document Chunks (RAG / pgvector)
# ============================================================

def save_document_chunks(
    document_id: str,
    user_id: str,
    chunks: list[dict],  # [{"content": str, "embedding": list[float], "chunk_index": int}]
) -> None:
    """Persist text chunks with embeddings for a document."""
    rows = [
        {
            "document_id": document_id,
            "user_id": user_id,
            "content": c["content"],
            "embedding": c["embedding"],
            "chunk_index": c["chunk_index"],
        }
        for c in chunks
    ]
    if rows:
        _supabase.table("document_chunks").insert(rows).execute()


def search_similar_chunks(
    user_id: str,
    query_embedding: list[float],
    limit: int = 5,
    threshold: float = 0.7,
) -> list[str]:
    """
    Run a pgvector similarity search and return the top-k matching chunk contents.
    Uses the match_document_chunks RPC function from schema_v3.sql.
    """
    try:
        res = _supabase.rpc(
            "match_document_chunks",
            {
                "query_embedding": query_embedding,
                "match_user_id": user_id,
                "match_count": limit,
                "match_threshold": threshold,
            },
        ).execute()
        return [row["content"] for row in (res.data or [])]
    except Exception:
        return []


# ============================================================
# Shared Chats
# ============================================================

def create_shared_chat(chat_id: str, user_id: str) -> str:
    """
    Create (or retrieve existing) a share token for a chat.
    Returns the share_token string.
    """
    # Check if share already exists
    existing = (
        _supabase.table("shared_chats")
        .select("share_token")
        .eq("chat_id", chat_id)
        .eq("created_by", user_id)
        .execute()
    )
    if existing.data:
        return existing.data[0]["share_token"]

    # Generate a URL-safe token
    token = secrets.token_urlsafe(24)
    _supabase.table("shared_chats").insert({
        "chat_id": chat_id,
        "share_token": token,
        "created_by": user_id,
    }).execute()
    return token


def get_shared_chat_by_token(share_token: str) -> dict | None:
    """
    Retrieve shared chat metadata by its token.
    Returns None if the token is invalid or expired.
    """
    res = (
        _supabase.table("shared_chats")
        .select("chat_id, created_at, expires_at")
        .eq("share_token", share_token)
        .single()
        .execute()
    )
    if not res.data:
        return None
    data = res.data
    # Check expiry
    if data.get("expires_at"):
        expires = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        if expires < datetime.now(timezone.utc):
            return None
    return data


def get_shared_chat_messages(chat_id: str) -> list[dict]:
    """
    Retrieve messages for a shared (public) chat.
    Uses service role to bypass RLS — safe because we already
    verified the share_token is valid.
    """
    res = (
        _supabase.table("messages")
        .select("role, content")
        .eq("chat_id", chat_id)
        .order("id", desc=False)
        .execute()
    )
    return res.data or []


def get_shared_chat_title(chat_id: str) -> str:
    """Return the title of a chat for the shared view."""
    res = (
        _supabase.table("chats")
        .select("title")
        .eq("id", chat_id)
        .single()
        .execute()
    )
    return res.data["title"] if res.data else "Shared Chat"


# ============================================================
# ATS Candidates
# ============================================================

def save_ats_candidate(
    user_id: str,
    name: str | None,
    email: str | None,
    resume_text: str,
    job_description: str,
    ats_score: int | None,
    missing_keywords: list[str] | None,
    critique: str,
    refined_bullets: str,
    resume_storage_path: str | None = None,
) -> str:
    """Persist ATS analysis results and return the candidate UUID."""
    res = (
        _supabase.table("ats_candidates")
        .insert({
            "user_id": user_id,
            "name": name,
            "email": email,
            "resume_text": resume_text[:50_000],
            "job_description": job_description[:20_000],
            "ats_score": ats_score,
            "missing_keywords": missing_keywords or [],
            "critique": critique,
            "refined_bullets": refined_bullets,
            "resume_storage_path": resume_storage_path,
            "status": "analyzed",
        })
        .execute()
    )
    return res.data[0]["id"]


def get_ats_candidates(user_id: str) -> list[dict]:
    """Return all ATS candidates for a user, newest first."""
    res = (
        _supabase.table("ats_candidates")
        .select("id, name, email, ats_score, status, created_at, missing_keywords")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def get_ats_candidate(candidate_id: str, user_id: str) -> dict | None:
    """Return a single ATS candidate with full details."""
    res = (
        _supabase.table("ats_candidates")
        .select("*")
        .eq("id", candidate_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    return res.data


def update_ats_candidate_status(candidate_id: str, user_id: str, status: str) -> None:
    """Update the status of an ATS candidate."""
    _supabase.table("ats_candidates").update({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", candidate_id).eq("user_id", user_id).execute()


def delete_ats_candidate(candidate_id: str, user_id: str) -> None:
    """Delete an ATS candidate and its storage file."""
    res = (
        _supabase.table("ats_candidates")
        .select("resume_storage_path")
        .eq("id", candidate_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if res.data and res.data.get("resume_storage_path"):
        delete_file_from_storage(ATS_BUCKET, res.data["resume_storage_path"])

    _supabase.table("ats_candidates").delete().eq("id", candidate_id).eq("user_id", user_id).execute()