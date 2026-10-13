"""Short-lived cache for tenant SWITCH reads (v1.8+ performance; ORACLE-STAGING-READINESS §4).

The engine loops re-read the same on/off switches (AI_PAUSED, CITY_PAUSED, AGENT_POSTING_PAUSED...) on every step, which made
up most of the ~500,000 PocketBase requests logged per day. Each process now keeps a switch value for at most
SWITCH_CACHE_SECONDS (default 3; 0 on the test stack so tests see a flipped switch at once). An emergency switch therefore
takes effect within a few seconds everywhere. Only boolean switches go through here: cursors and other read-modify-write
settings are always read fresh.
"""
from __future__ import annotations

import os
import threading
import time

_lock = threading.Lock()
_cache: dict[tuple[str, str], tuple[float, object]] = {}


def ttl() -> float:
    default = "0" if os.environ.get("PALAVVA_ENV") == "test" else "3"
    try:
        return max(0.0, float(os.environ.get("SWITCH_CACHE_SECONDS", default)))
    except ValueError:
        return 3.0


def read(pb, tenant_id: str, key: str):
    """The stored value of a tenant switch (or None), cached for ttl() seconds per process."""
    from .pb import q
    t = ttl()
    now = time.monotonic()
    if t > 0:
        with _lock:
            hit = _cache.get((tenant_id, key))
        if hit and now - hit[0] < t:
            return hit[1]
    r = pb.first("tenant_settings", f"tenant_id={q(tenant_id)} && key={q(key)}")
    v = r.get("value") if r else None
    if t > 0:
        with _lock:
            _cache[(tenant_id, key)] = (now, v)
    return v


def forget() -> None:
    with _lock:
        _cache.clear()
