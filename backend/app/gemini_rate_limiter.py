"""
Centralized rate limiter for all Gemini API calls.

Usage (non-streaming):
    from app.gemini_rate_limiter import limiter

    resp = await limiter.execute(
        lambda: model.generate_content(prompt),
        tier="flash",           # or "pro"
        user_id="user-uuid",    # optional — enables per-user throttling
        context="classify_intent",
    )

Usage (streaming) — caller manages the loop, just acquires a token:
    await limiter.wait_for_token(tier="flash", user_id=user_id)
    stream = await loop.run_in_executor(None, _run_stream)
    for chunk in stream:
        yield chunk.text

Configuration (environment variables):
    GEMINI_MAX_CONCURRENT_REQUESTS  default 3
    GEMINI_RPM_LIMIT_FLASH          default 60
    GEMINI_RPM_LIMIT_PRO            default 30
    GEMINI_RETRY_MAX                default 3
    GEMINI_PER_USER_RPM             default 20
"""
import asyncio
import logging
import time
from collections import deque
from typing import Any, Callable

log = logging.getLogger(__name__)


# ── Error detection ────────────────────────────────────────────────────────────

def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True for 429 / quota-exhausted responses from the Gemini SDK."""
    msg = str(exc).lower()
    return (
        "429" in msg
        or "quota" in msg
        or "resource_exhausted" in msg
        or ("rate" in msg and "limit" in msg)
    )


# ── Token bucket ───────────────────────────────────────────────────────────────

class _TokenBucket:
    """Sliding-window request counter: allow at most `rpm` calls per 60 s."""

    __slots__ = ("_rpm", "_ts")

    def __init__(self, rpm: int) -> None:
        self._rpm = rpm
        self._ts: deque[float] = deque()

    def _evict(self) -> None:
        cutoff = time.monotonic() - 60.0
        while self._ts and self._ts[0] < cutoff:
            self._ts.popleft()

    def full(self) -> bool:
        self._evict()
        return len(self._ts) >= self._rpm

    def wait_seconds(self) -> float:
        """Seconds until the next slot opens (assuming the bucket is full)."""
        self._evict()
        if not self._ts:
            return 0.0
        return max(0.0, 60.0 - (time.monotonic() - self._ts[0]) + 0.05)

    def consume(self) -> None:
        self._evict()
        self._ts.append(time.monotonic())


# ── Rate limiter ───────────────────────────────────────────────────────────────

class GeminiRateLimiter:
    """
    Global rate limiter for Gemini API calls.

    Features
    --------
    - Concurrent-request cap via asyncio.Semaphore (requests queue automatically)
    - Per-tier (Flash / Pro) sliding-window RPM token bucket
    - Optional per-user RPM token bucket
    - Exponential back-off retry on 429 / quota errors (1 s → 2 s → 4 s → 8 s)
    - Logging on rate-limit waits, retries, and queue depth
    """

    def __init__(
        self,
        max_concurrent: int,
        flash_rpm: int,
        pro_rpm: int,
        per_user_rpm: int,
        max_retries: int,
    ) -> None:
        self._max_concurrent = max_concurrent
        self._flash_rpm = flash_rpm
        self._pro_rpm = pro_rpm
        self._per_user_rpm = per_user_rpm
        self._max_retries = max_retries

        # Lazily created so they bind to the running event loop on first use
        # (safe with Python 3.10+ asyncio primitives)
        self._semaphore: asyncio.Semaphore | None = None
        self._lock: asyncio.Lock | None = None

        self._flash_bucket = _TokenBucket(flash_rpm)
        self._pro_bucket = _TokenBucket(pro_rpm)
        self._user_buckets: dict[str, _TokenBucket] = {}

    # ── lazy primitives ────────────────────────────────────────────────────────

    @property
    def _sem(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self._max_concurrent)
        return self._semaphore

    @property
    def _lk(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    # ── internals ─────────────────────────────────────────────────────────────

    def _tier_bucket(self, tier: str) -> _TokenBucket:
        return self._pro_bucket if tier == "pro" else self._flash_bucket

    def _user_bucket(self, user_id: str) -> _TokenBucket:
        if user_id not in self._user_buckets:
            self._user_buckets[user_id] = _TokenBucket(self._per_user_rpm)
        return self._user_buckets[user_id]

    async def _acquire_token(self, tier: str, user_id: str | None) -> None:
        """Block until both the global-tier and per-user tokens are available."""
        while True:
            wait_time = 0.0

            async with self._lk:
                tb = self._tier_bucket(tier)
                ub = self._user_bucket(user_id) if user_id else None

                tier_full = tb.full()
                user_full = ub is not None and ub.full()

                if not tier_full and not user_full:
                    tb.consume()
                    if ub is not None:
                        ub.consume()
                    return

                if user_full:
                    wait_time = ub.wait_seconds()  # type: ignore[union-attr]
                    log.warning(
                        "rate_limiter: per-user limit (%d rpm) hit for user=%s — "
                        "waiting %.1f s",
                        self._per_user_rpm,
                        user_id,
                        wait_time,
                    )
                else:
                    wait_time = tb.wait_seconds()
                    log.warning(
                        "rate_limiter: global %s RPM limit hit — waiting %.1f s",
                        tier,
                        wait_time,
                    )

            # Sleep *outside* the lock so other coroutines can proceed
            await asyncio.sleep(min(wait_time, 2.0))

    # ── public API ─────────────────────────────────────────────────────────────

    async def execute(
        self,
        func: Callable[[], Any],
        *,
        tier: str = "flash",
        user_id: str | None = None,
        context: str = "gemini_call",
    ) -> Any:
        """
        Execute a synchronous Gemini callable with full rate-limit protection.

        Parameters
        ----------
        func    : Zero-argument callable that calls the Gemini SDK synchronously.
        tier    : "flash" or "pro" — selects which RPM bucket to use.
        user_id : Optional user ID for per-user rate limiting.
        context : Label used in log messages.

        The semaphore provides a request queue: callers block here if
        `max_concurrent` requests are already in-flight rather than failing.
        """
        loop = asyncio.get_running_loop()

        # Semaphore queues callers when at capacity
        queue_depth = self._max_concurrent - (self._sem._value)  # type: ignore[attr-defined]
        if queue_depth > 0:
            log.debug(
                "rate_limiter: %s waiting — semaphore queue depth ~%d",
                context,
                queue_depth,
            )

        async with self._sem:
            await self._acquire_token(tier, user_id)

            for attempt in range(self._max_retries + 1):
                try:
                    result = await loop.run_in_executor(None, func)
                    if attempt > 0:
                        log.info(
                            "rate_limiter: %s succeeded on attempt %d",
                            context,
                            attempt + 1,
                        )
                    return result
                except Exception as exc:
                    if _is_rate_limit_error(exc) and attempt < self._max_retries:
                        wait = 2**attempt  # 1 s → 2 s → 4 s → 8 s
                        log.warning(
                            "rate_limiter: Gemini 429 on %s "
                            "(attempt %d/%d) — retrying in %d s",
                            context,
                            attempt + 1,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                    else:
                        raise

    async def wait_for_token(
        self,
        tier: str = "flash",
        user_id: str | None = None,
    ) -> None:
        """
        Acquire a rate-limit token without executing a call.

        Use this for streaming responses where the caller manages its own
        ``run_in_executor`` / retry loop.
        """
        await self._acquire_token(tier, user_id)


# ── Module-level singleton ─────────────────────────────────────────────────────
# Reads settings lazily so tests can monkeypatch settings before import.

def _build_limiter() -> GeminiRateLimiter:
    # Import here to avoid circular imports at module load time
    from app.core.config import settings  # noqa: PLC0415

    return GeminiRateLimiter(
        max_concurrent=settings.GEMINI_MAX_CONCURRENT_REQUESTS,
        flash_rpm=settings.GEMINI_RPM_LIMIT_FLASH,
        pro_rpm=settings.GEMINI_RPM_LIMIT_PRO,
        per_user_rpm=settings.GEMINI_PER_USER_RPM,
        max_retries=settings.GEMINI_RETRY_MAX,
    )


limiter: GeminiRateLimiter = _build_limiter()
