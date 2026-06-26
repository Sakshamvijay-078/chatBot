import os
from gotrue.errors import AuthApiError
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]

_auth_client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# ============================================================
# Auth Operations
# ============================================================

def sign_up(email: str, password: str, full_name: str = "") -> dict:
    res = _auth_client.auth.sign_up({
        "email": email,
        "password": password,
        "options": {
            "data": {"full_name": full_name}
        },
    })
    return _parse_auth_response(res)


def sign_in(email: str, password: str) -> dict:
    res = _auth_client.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })
    return _parse_auth_response(res)


def sign_out(access_token: str) -> None:
    _auth_client.auth.set_session(access_token, "")
    _auth_client.auth.sign_out()


def refresh_session(refresh_token: str) -> dict:
    res = _auth_client.auth.refresh_session(refresh_token)
    return _parse_auth_response(res)


def send_password_reset(email: str, redirect_url: str) -> None:
    _auth_client.auth.reset_password_for_email(
        email,
        options={"redirect_to": redirect_url},
    )


def update_password(access_token: str, new_password: str) -> dict:
    _auth_client.auth.set_session(access_token, "")
    res = _auth_client.auth.update_user({"password": new_password})
    return {"success": True, "user_id": res.user.id if res.user else None}


def get_user_from_token(access_token: str) -> dict | None:
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
