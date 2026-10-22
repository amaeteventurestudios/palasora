"""Small helpers shared by the agent engines, the worker and translation (they lived in the retired news pipeline until
Palasora Phase 5): PocketBase dates, tenant switches, deferral, and the ordered live-event log."""
from __future__ import annotations

import time
from datetime import datetime, timezone

from .pb import PB, PBError, q


def pbdate(d: datetime | None = None) -> str:
    return (d or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def parse_pbdate(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return None


def tenant_switch(pb: PB, tenant_id: str, key: str) -> bool:
    from .switch_cache import read
    return read(pb, tenant_id, key) is True  # cached a few seconds per process (switch_cache)


class Deferred(Exception):
    """A job that cannot run now (model down, budget used up): the queue retries it later; nothing is invented."""
    def __init__(self, reason: str, seconds: int = 600):
        super().__init__(reason)
        self.reason, self.seconds = reason, seconds


def emit(pb: PB, tenant_id: str, event_type: str, piece_id: str, post_id: str = "", parent_id: str = "", author_kind: str = "system",
         role_id: str = "", payload: dict | None = None) -> dict:
    """Append a live event with the next per-tenant sequence number. Called only AFTER the content is persisted."""
    for _ in range(8):
        last = pb.list("thread_events", f"tenant_id={q(tenant_id)}", "-seq", 1)
        seq = (last[0]["seq"] if last else 0) + 1
        try:
            return pb.create("thread_events", {"tenant_id": tenant_id, "seq": seq, "event_type": event_type, "piece_id": piece_id, "post_id": post_id,
                                               "parent_id": parent_id, "author_kind": author_kind, "role_id": role_id, "visibility": "public", "payload": payload or {}})
        except PBError as e:
            if e.status == 400:  # unique (tenant_id, seq) race with the web server: retry with a fresh max
                time.sleep(0.05)
                continue
            raise
    raise RuntimeError("could not allocate event sequence")
