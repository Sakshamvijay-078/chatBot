"""
auth.py — Penda Backend
Supabase Auth service wrapper.

Handles signup, login, logout, token refresh, and password reset
by calling the Supabase Auth REST API via the Python client.

NOTE: On the frontend (Next.js), most auth operations are handled
directly by the Supabase JS SDK. These server-side endpoints exist
as a secure fallback and for server-to-server operations.
"""

import os
from gotrue.errors import AuthApiError
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]

# Use the ANON key for auth operations (users authenticate as themselves)
_auth_client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# ============================================================
# Auth Operations
# ============================================================

def sign_up(email: str, password: str, full_name: str = "") -> dict:
    """
    Register a new user with Supabase Auth.
    Supabase will automatically trigger the `on_auth_user_created` trigger
    which inserts a row into `public.profiles`.
    Returns a dict with { user, session } on success.
    Raises AuthApiError on failure (e.g. email already registered).
    """
    res = _auth_client.auth.sign_up({
        "email": email,
        "password": password,
        "options": {
            "data": {"full_name": full_name}
        },
    })
    return _parse_auth_response(res)


def sign_in(email: str, password: str) -> dict:
    """
    Authenticate an existing user with email + password.
    Returns { user, session: { access_token, refresh_token, expires_at } }.
    Raises AuthApiError on invalid credentials.
    """
    res = _auth_client.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })
    return _parse_auth_response(res)


def sign_out(access_token: str) -> None:
    """
    Invalidate the user's session on the Supabase side.
    Pass the current JWT access_token so Supabase knows which session to kill.
    """
    # Set the session so the client acts as that user
    _auth_client.auth.set_session(access_token, "")
    _auth_client.auth.sign_out()


def refresh_session(refresh_token: str) -> dict:
    """
    Exchange a refresh_token for a fresh access_token + refresh_token pair.
    Call this when the frontend receives a 401 with 'Token has expired'.
    Returns { user, session }.
    """
    res = _auth_client.auth.refresh_session(refresh_token)
    return _parse_auth_response(res)


def send_password_reset(email: str, redirect_url: str) -> None:
    """
    Send a password-reset email to the user.
    `redirect_url` is the URL Supabase redirects to after the user clicks the link.
    It must be whitelisted in: Supabase Dashboard > Auth > URL Configuration.
    """
    _auth_client.auth.reset_password_for_email(
        email,
        options={"redirect_to": redirect_url},
    )


def update_password(access_token: str, new_password: str) -> dict:
    """
    Update a user's password after they've clicked the reset link.
    The access_token here comes from the URL fragment after the redirect.
    """
    # Hydrate the client with the recovery token
    _auth_client.auth.set_session(access_token, "")
    res = _auth_client.auth.update_user({"password": new_password})
    return {"success": True, "user_id": res.user.id if res.user else None}


def get_user_from_token(access_token: str) -> dict | None:
    """
    Retrieve the user object from Supabase for a given access_token.
    Used as a lightweight "who am I?" call.
    Returns None if the token is invalid or expired.
    """
    try:
        _auth_client.auth.set_session(access_token, "")
        user = _auth_client.auth.get_user(access_token)
        return {"id": user.user.id, "email": user.user.email} if user.user else None
    except Exception:
        return None


# ============================================================
# Helpers
# ============================================================

def _parse_auth_response(res) -> dict:
    """
    Normalise the Supabase Auth response into a clean dict.
    Raises AuthApiError if the response indicates a failure.
    """
    session = res.session
    user = res.user

    if not session or not user:
        raise AuthApiError("Authentication failed: no session returned.", 400, None)

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.user_metadata.get("full_name", ""),
        },
        "session": {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "expires_at": session.expires_at,
            "token_type": "Bearer",
        },
    }
