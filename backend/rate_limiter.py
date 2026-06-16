"""
rate_limiter.py — Penda Backend
Two-layer rate limiting system:

Layer 1 — Request Rate Limit (per-user, in-memory)
    Prevents a single user from firing too many requests per minute
    (e.g., spamming the /chat/stream endpoint). Uses a sliding window
    implemented with a deque. This is fast and zero-cost (no Redis needed
    on Render's free tier).

Layer 2 — Token Budget (per-user, persistent in Supabase)
    Already implemented in main.py using database.get_trial_usage() and
    database.increment_trial_tokens(). This module does NOT duplicate that.

Usage in main.py:
    from rate_limiter import RateLimiter, rate_limit_dependency

    limiter = RateLimiter(max_requests=10, window_seconds=60)

    @app.post("/chat/stream")
    async def stream_chat(
        body: ChatRequest,
        user: dict = Depends(get_current_user),
        _: None = Depends(limiter.dependency()),
    ):
        ...
"""

import time
from collections import defaultdict, deque
from fastapi import HTTPException, status


class RateLimiter:
    """
    Sliding-window in-memory rate limiter keyed by user_id.
    Thread-safe enough for single-process FastAPI/uvicorn workers.
    For multi-worker deployments, use Redis (e.g., slowapi + redis).
    """

    def __init__(self, max_requests: int, window_seconds: int):
        """
        :param max_requests: Max allowed requests per window.
        :param window_seconds: Length of the sliding window in seconds.
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # user_id → deque of timestamps (floats)
        self._buckets: dict[str, deque] = defaultdict(deque)

    def is_allowed(self, user_id: str) -> tuple[bool, int]:
        """
        Check if a user is within their rate limit.
        Returns (allowed: bool, retry_after_seconds: int).
        """
        now = time.monotonic()
        window_start = now - self.window_seconds
        bucket = self._buckets[user_id]

        # Evict timestamps outside the current window
        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= self.max_requests:
            # Oldest request + window = when the next slot opens
            retry_after = int(bucket[0] + self.window_seconds - now) + 1
            return False, retry_after

        bucket.append(now)
        return True, 0

    def enforce(self, user_id: str) -> None:
        """
        Synchronous check — call this at the top of any route handler.
        Raises HTTP 429 if the user has exceeded their rate limit.
        
        Usage in route:
            user: dict = Depends(get_current_user)
            chat_limiter.enforce(user["sub"])
        """
        allowed, retry_after = self.is_allowed(user_id)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    def reset(self, user_id: str) -> None:
        """Manually clear a user's bucket (useful in tests or admin actions)."""
        self._buckets.pop(user_id, None)

    def get_remaining(self, user_id: str) -> dict:
        """Return rate limit status for a user (for X-RateLimit headers)."""
        now = time.monotonic()
        window_start = now - self.window_seconds
        bucket = self._buckets.get(user_id, deque())
        active = sum(1 for t in bucket if t >= window_start)
        return {
            "limit": self.max_requests,
            "remaining": max(0, self.max_requests - active),
            "window_seconds": self.window_seconds,
        }


# ============================================================
# Shared BYOK Key Validator
# ============================================================

def validate_groq_key(api_key: str) -> tuple[bool, str]:
    """
    Makes a minimal test call to Groq to verify a BYOK API key is valid.
    Uses the raw `groq` client (installed as a dep of langchain-groq) and
    typed exceptions so we never false-positive reject a valid key.

    Returns (is_valid: bool, error_message: str).
    """
    try:
        import groq as _groq

        client = _groq.Groq(api_key=api_key)
        client.chat.completions.create(
            messages=[{"role": "user", "content": "Reply with just the number 1."}],
            model="llama-3.1-8b-instant",
            max_tokens=3,
        )
        return True, ""

    except Exception as exc:
        # Resolve the actual exception class name to handle it
        # without importing groq at module level.
        exc_type = type(exc).__name__

        if exc_type == "AuthenticationError":
            return False, "Invalid API key. Please verify it on console.groq.com."

        if exc_type == "RateLimitError":
            # Key is valid — user just hit rate limit during validation
            return True, ""

        if exc_type in ("APIConnectionError", "APITimeoutError"):
            return False, "Could not reach Groq servers. Check your internet connection."

        # Fallback: include the raw message but truncate it
        return False, f"Unexpected error during validation: {str(exc)[:200]}"
