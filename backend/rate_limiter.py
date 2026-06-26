import time
from collections import defaultdict, deque
from fastapi import HTTPException, status


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: dict[str, deque] = defaultdict(deque)

    def is_allowed(self, user_id: str) -> tuple[bool, int]:
        now = time.monotonic()
        window_start = now - self.window_seconds
        bucket = self._buckets[user_id]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            retry_after = int(bucket[0] + self.window_seconds - now) + 1
            return False, retry_after
        bucket.append(now)
        return True, 0
    
    def enforce(self, user_id: str) -> None:
        allowed, retry_after = self.is_allowed(user_id)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
        
    def reset(self, user_id: str) -> None:
        self._buckets.pop(user_id, None)

    def get_remaining(self, user_id: str) -> dict:
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

async def validate_groq_key(api_key: str) -> tuple[bool, str]:
    try:
        import groq as _groq
        client = _groq.AsyncGroq(api_key=api_key)
        await client.chat.completions.create(
            messages=[{"role": "user", "content": "Reply with just the number 1."}],
            model="llama-3.1-8b-instant",
            max_tokens=3,
        )
        return True, ""
    except Exception as exc:
        exc_type = type(exc).__name__
        if exc_type == "AuthenticationError":
            return False, "Invalid API key. Please verify it on console.groq.com."
        if exc_type == "RateLimitError":
            return True, ""
        if exc_type in ("APIConnectionError", "APITimeoutError"):
            return False, "Could not reach Groq servers. Check your internet connection."
        return False, f"Unexpected error during validation:"
