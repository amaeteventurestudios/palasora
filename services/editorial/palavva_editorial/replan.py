"""Re-plan AI replies for published auto threads after a prompt/ruleset change (bounded, idempotent).
Usage: python -m palavva_editorial.replan <plan_id> [slug-prefix]"""
from __future__ import annotations

import sys

from . import config, conversation
from .jobs import Queue
from .pb import PB


def main(plan_id: str, prefix: str = "") -> None:
    s = config.load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    qu = Queue(s.jobs_db, lease_seconds=900)
    for p in pb.list("editorial_pieces", "review_status='published' && (publish_path='auto_low_risk' || publish_path='demo')", per_page=100):
        if prefix and not p["slug"].startswith(prefix):
            continue
        plan = conversation.make_plan(p)
        n = 0
        for st in (x for x in plan if x["parent_step"] is None):
            _, created = qu.enqueue(p["tenant_id"], "converse", {"piece_id": p["id"], "plan_id": plan_id, "plan": plan, "step": st["step"], "parent_post_id": ""},
                                    f"converse:{p['id']}:{plan_id}:{st['step']}")
            n += int(created)
        print("replanned", p["slug"], n)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
