"""Integration tests against a real (isolated) PocketBase with the production migrations + hooks."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from palavva_editorial.pb import PBError


# ---------- T-003 migration + seed ----------
def test_seed_counts_and_idempotency(seeded, pb_server):
    db = sqlite3.connect(Path(pb_server["data"]) / "data.db")
    counts = {t: db.execute(f"select count(*) from {t}").fetchone()[0] for t in ("countries", "topics", "topic_groups", "tenants", "editorial_pieces", "users")}
    assert counts["countries"] == 54 and counts["topics"] == 25 and counts["topic_groups"] == 6 and counts["tenants"] == 2
    from palavva_editorial import seed
    assert seed.main() == 0
    again = {t: db.execute(f"select count(*) from {t}").fetchone()[0] for t in counts}
    assert again == counts


# ---------- DB-level guards (publish gate, tenant immutability, append-only audit) ----------
def test_publish_gate_blocks_unreviewed_publication(seeded):
    pb, t = seeded["pb"], seeded["palavva"]
    with pytest.raises(PBError):
        pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": "gate-1", "headline": "x", "review_status": "published"})
    p = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": "gate-2", "headline": "x", "review_status": "needs_review"})
    with pytest.raises(PBError):
        pb.update("editorial_pieces", p["id"], {"review_status": "published"})
    member = pb.first("users", "email='reader@palavva.local'")
    pb.create("editorial_reviews", {"tenant_id": t["id"], "piece_id": p["id"], "decision": "approve", "reviewer_id": member["id"]})
    with pytest.raises(PBError):  # a member is not an editor
        pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": member["id"]})
    sample_editor = pb.first("users", "email='editor@sample.local'")
    pb.create("editorial_reviews", {"tenant_id": t["id"], "piece_id": p["id"], "decision": "approve", "reviewer_id": sample_editor["id"]})
    with pytest.raises(PBError):  # an editor of ANOTHER tenant cannot approve here
        pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": sample_editor["id"]})
    editor = pb.first("users", "email='editor@palavva.local'")
    pb.create("editorial_reviews", {"tenant_id": t["id"], "piece_id": p["id"], "decision": "approve", "reviewer_id": editor["id"]})
    assert pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": editor["id"]})["review_status"] == "published"


def test_tenant_id_immutable_and_audit_append_only(seeded):
    pb, a, b = seeded["pb"], seeded["palavva"], seeded["sample"]
    p = pb.create("editorial_pieces", {"tenant_id": a["id"], "slug": "imm-1", "headline": "x", "review_status": "draft"})
    with pytest.raises(PBError):
        pb.update("editorial_pieces", p["id"], {"tenant_id": b["id"]})
    ev = pb.create("audit_events", {"tenant_id": a["id"], "action": "test", "actor_type": "system"})
    with pytest.raises(PBError):
        pb.update("audit_events", ev["id"], {"action": "tampered"})
    with pytest.raises(PBError):
        pb.delete("audit_events", ev["id"])


def test_ai_comment_requires_run(seeded):
    pb, t = seeded["pb"], seeded["palavva"]
    with pytest.raises(PBError):
        pb.create("comments", {"tenant_id": t["id"], "discussion_id": "d", "author_kind": "editorial_ai", "body_text": "x", "approval_state": "approved"})





def test_T028_raw_event_partitions_older_than_30_days_are_purged(seeded, tmp_path, monkeypatch):
    """Retention: raw first-party events older than 30 days are deleted, newer ones kept; also when ALL data is old."""
    import dataclasses, json as _json
    from datetime import date, timedelta
    from palavva_editorial import analytics_etl, config
    pb, t = seeded["pb"], seeded["palavva"]
    s = dataclasses.replace(config.load(), data_dir=tmp_path)
    base = s.analytics_dir / f"tenant={t['id']}"
    old_day, new_day = (date.today() - timedelta(days=45)).isoformat(), date.today().isoformat()
    for d in (old_day, new_day):
        (base / f"date={d}").mkdir(parents=True)
        (base / f"date={d}" / "events-10.ndjson").write_text(_json.dumps({"event_id": "x", "event_name": "story_viewed", "occurred_at": f"{d}T10:00:00Z", "tenant_id": t["id"]}) + "\n")
    out = analytics_etl.run(s, pb)
    assert out["purged_dirs"] >= 1 and not (base / f"date={old_day}").exists() and (base / f"date={new_day}").exists()
    # Only-old data is purged too (previously skipped).
    (base / f"date={old_day}").mkdir(parents=True)
    (base / f"date={old_day}" / "events-10.ndjson").write_text("{}\n")
    import shutil; shutil.rmtree(base / f"date={new_day}")
    analytics_etl.run(s, pb)
    assert not (base / f"date={old_day}").exists()
