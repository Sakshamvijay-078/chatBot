import time
from collections import defaultdict, deque, OrderedDict
from fastapi import HTTPException, status


class RateLimiter:
    # Max number of unique user-ids/IPs tracked in memory at once.
    # Beyond this, the oldest entry is evicted (LRU).
    _MAX_BUCKETS = 10_000

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # Use OrderedDict so we can do O(1) LRU eviction
        self._buckets: OrderedDict[str, deque] = OrderedDict()

    def _get_bucket(self, user_id: str) -> deque:
        if user_id in self._buckets:
            self._buckets.move_to_end(user_id)   # Mark as recently used
            return self._buckets[user_id]

        # Create new bucket — evict oldest if at cap
        if len(self._buckets) >= self._MAX_BUCKETS:
            self._buckets.popitem(last=False)

        bucket: deque = deque()
        self._buckets[user_id] = bucket
        return bucket

    def is_allowed(self, user_id: str) -> tuple[bool, int]:
        now = time.monotonic()
        window_start = now - self.window_seconds
        bucket = self._get_bucket(user_id)

        # Purge expired timestamps
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
