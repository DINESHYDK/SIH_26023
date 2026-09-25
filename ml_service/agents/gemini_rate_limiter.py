"""A process-wide quota guard shared by every Gemini call in this service."""
from __future__ import annotations

import os
import threading
import time
from collections import deque

from dotenv import load_dotenv

# This module is imported before the query/OCR modules call load_dotenv(), so
# load the project settings here before reading the quota configuration.
load_dotenv()


class GeminiRateLimitExceeded(RuntimeError):
    """Raised before a request that would exceed the configured daily quota."""


class GeminiRateLimiter:
    """Thread-safe rolling-window limiter for Gemini RPM and RPD quotas.

    RPM requests wait for the next available slot.  RPD requests fail quickly
    instead of tying up an API worker until the following day.  Configure both
    values to match the quota for the deployed Gemini model/account.
    """

    def __init__(self, rpm: float, rpd: int) -> None:
        if rpm <= 0 or rpd <= 0:
            raise ValueError("GEMINI_RPM and GEMINI_RPD must both be greater than zero")
        self.rpm = rpm
        self.rpd = rpd
        self._requests: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Reserve one request without exceeding either rolling window."""
        while True:
            with self._lock:
                now = time.monotonic()
                while self._requests and now - self._requests[0] >= 86_400:
                    self._requests.popleft()
                if len(self._requests) >= self.rpd:
                    raise GeminiRateLimitExceeded(
                        f"Gemini daily request limit ({self.rpd} RPD) reached; retry after the quota window resets"
                    )

                recent_minute = sum(timestamp > now - 60 for timestamp in self._requests)
                if recent_minute < self.rpm:
                    self._requests.append(now)
                    return

                # Sleep outside the lock so other callers can inspect the
                # limiter while this request waits for the minute window.
                oldest_minute = next(timestamp for timestamp in self._requests if timestamp > now - 60)
                delay = max(0.01, 60 - (now - oldest_minute))
            time.sleep(delay)


# Conservative defaults keep a fresh deployment within common free-tier
# quotas. Production deployments should set these explicitly for their model.
gemini_rate_limiter = GeminiRateLimiter(
    rpm=float(os.getenv("GEMINI_RPM", "8")),
    rpd=int(os.getenv("GEMINI_RPD", "20")),
)
