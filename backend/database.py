"""
database.py — Penda Backend
Supabase PostgreSQL replacement for the original SQLite database.py.
All functions accept user_id (UUID string from Supabase Auth JWT) instead of username.
"""

import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]

# Use the SERVICE ROLE key on the backend so RLS policies don't block
# server-side operations. This key must NEVER be exposed to the frontend.
_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_client() -> Client:
    """Return the shared Supabase service-role client."""
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
    """Update arbitrary profile fields. Returns the updated row."""
    fields["updated_at"] = datetime.utcnow().isoformat()
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
    _supabase.table("chats").update({"title": title, "updated_at": datetime.utcnow().isoformat()}).eq("id", chat_id).execute()


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

def save_message(chat_id: str, role: str, content: str, token_count: int = 0) -> int:
    """Insert a message and return its ID."""
    res = (
        _supabase.table("messages")
        .insert({
            "chat_id": chat_id,
            "role": role,
            "content": content,
            "token_count": token_count,
        })
        .execute()
    )
    return res.data[0]["id"]


def get_messages(chat_id: str) -> list[dict]:
    """Return all messages for a chat in chronological order."""
    res = (
        _supabase.table("messages")
        .select("role, content")
        .eq("chat_id", chat_id)
        .order("id", desc=False)
        .execute()
    )
    return res.data or []


def get_recent_messages(chat_id: str, limit: int = 6) -> list[dict]:
    """Return the most recent `limit` messages in ascending order."""
    # Supabase doesn't support LIMIT on DESC + re-order in one query easily,
    # so we fetch DESC limited and reverse in Python.
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
    # Upsert: insert or update if chat_id already exists
    _supabase.table("summaries").upsert({
        "chat_id": chat_id,
        "summary": summary,
        "updated_at": datetime.utcnow().isoformat(),
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
    # Supabase RPC call to avoid race conditions
    _supabase.rpc("increment_trial_tokens", {"uid": user_id, "amount": tokens}).execute()


# ============================================================
# Documents (global attachments)
# ============================================================

MAX_DOC_CHARS = 12_000   # hard cap per document stored in DB
MAX_DOCS_PER_USER = 10   # prevent abuse

def save_document(user_id: str, name: str, content: str, size_bytes: int) -> str:
    """Persist a global document and return its UUID."""
    content = content[:MAX_DOC_CHARS]
    res = (
        _supabase.table("documents")
        .insert({
            "user_id": user_id,
            "name": name,
            "content": content,
            "size_bytes": size_bytes,
            "chat_id": None,   # NULL = global
        })
        .execute()
    )
    return res.data[0]["id"]


def get_global_documents(user_id: str) -> list[dict]:
    """Return all global documents for a user (chat_id IS NULL), newest first."""
    res = (
        _supabase.table("documents")
        .select("id, name, content, size_bytes, created_at")
        .eq("user_id", user_id)
        .is_("chat_id", "null")
        .order("created_at", desc=True)
        .limit(MAX_DOCS_PER_USER)
        .execute()
    )
    return res.data or []


def delete_document(doc_id: str, user_id: str) -> None:
    """Delete a document — user_id guard prevents cross-user deletion."""
    _supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user_id).execute()

