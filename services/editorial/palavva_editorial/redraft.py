"""Re-queue held clusters once under a new pipeline version (after a prompt change). Bounded."""
from __future__ import annotations

import sys

from . import config
from .ingest.normalize import idempotency_key
from .jobs import Queue
from .pb import PB


def main(version: str, limit: int = 10) -> None:
    s = config.load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    q = Queue(s.jobs_db, lease_seconds=900)
    n = 0
    for c in pb.list("story_clusters", "status='held' && is_fixture=false", "-latest_material_update_at", limit):
        pb.update("story_clusters", c["id"], {"status": "open"})
        _, created = q.enqueue(c["tenant_id"], "draft_cluster", {"cluster_id": c["id"]}, idempotency_key(c["tenant_id"], c["id"], version, "draft"))
        n += int(created)
    print("requeued", n)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "p2")
