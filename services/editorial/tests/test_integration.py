"""Integration tests against a real (isolated) PocketBase with the production migrations + hooks."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from palavva_editorial import config
from palavva_editorial.ingest.fetch import FetchResult
from palavva_editorial.jobs import Queue
from palavva_editorial.pb import PBError, q
from palavva_editorial.pipeline import Deferred, draft_cluster, ingest_source
from palavva_editorial.providers.fixture import FixtureProvider

FX = Path(__file__).parent / "fixtures"


def feed(name: str) -> bytes:
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    return (FX / name).read_bytes().replace(b"{NOW}", now.encode())


class CountingFetcher:
    def __init__(self, body: bytes):
        self.body, self.calls = body, 0

    def __call__(self, url, allowed=None, **kw):
        self.calls += 1
        return FetchResult(200, self.body, url, "application/rss+xml", '"e1"', "")


def make_source(pb, tenant, name, rights="approved", enabled=True, topics=None):
    return pb.create("sources", {"tenant_id": tenant["id"], "publisher_name": name, "endpoint_url": "https://fixture.example/feed.xml", "endpoint_type": "rss",
                                 "rights_status": rights, "usage_policy": "permitted_excerpt", "enabled": enabled, "source_class": "media", "trust_tier": "corroborated",
                                 "fetch_interval_minutes": 60, "request_timeout_sec": 5, "countries": [], "topic_ids": topics or [], "allowed_hosts": ["fixture.example"],
                                 "is_fixture": True, "consecutive_failures": 0})


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


# ---------- T-013 rights gate: zero network for unapproved ----------
def test_unapproved_source_makes_zero_requests(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    queue = Queue(tmp_path / "j.db")
    for rights in ("pending", "revoked", "restricted"):
        src = make_source(pb, t, f"Unapproved {rights}", rights=rights)
        f = CountingFetcher(feed("rss_good.xml"))
        res = ingest_source(pb, queue, s, src, fetcher=f)
        assert f.calls == 0 and res["new_items"] == 0 and res["error"] == "RIGHTS_OR_DISABLED"
    disabled = make_source(pb, t, "Approved but disabled", enabled=False)
    f = CountingFetcher(feed("rss_good.xml"))
    assert ingest_source(pb, queue, s, disabled, fetcher=f)["error"] == "RIGHTS_OR_DISABLED" and f.calls == 0


# ---------- T-014 (fixture), T-016 dedup, T-017 classification, pipeline ----------
def test_ingest_dedup_cluster_and_pipeline(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    queue = Queue(tmp_path / "j.db")
    src = make_source(pb, t, "Fixture Wire")
    f = CountingFetcher(feed("rss_good.xml"))
    r1 = ingest_source(pb, queue, s, src, fetcher=f)
    assert f.calls == 1 and r1["new_items"] == 3 and r1["ignored"] == 1 and r1["enqueued"] == 2
    items = pb.list("source_items", f"tenant_id={q(t['id'])} && source_id={q(src['id'])}")
    oslo = next(i for i in items if "Oslo" in i["title"])
    assert oslo["status"] == "ignored"
    gh = next(i for i in items if i["title"].startswith("Ghana"))
    assert gh["country_candidates"] == ["GH"] and "fintech" in gh["topic_candidates"]
    assert all("utm_source" not in i["canonical_url"] for i in items)
    # Replay of the same feed creates nothing new (T-016).
    r2 = ingest_source(pb, queue, s, src, fetcher=CountingFetcher(feed("rss_good.xml")))
    assert r2["new_items"] == 0 and r2["duplicates"] == 3 and r2["enqueued"] == 0
    # A material update with a new GUID joins the existing cluster instead of creating a thread.
    upd = feed("rss_good.xml").replace(b"fx-2", b"fx-2-update").replace(b"Ghana mobile money fees: fixture regulator note", b"Ghana mobile money fees fixture regulator note updated")
    upd = upd.replace(b"Fixture text about fintech and the central bank in Ghana.", b"Updated fixture text, new detail.")
    r3 = ingest_source(pb, queue, s, src, fetcher=CountingFetcher(upd))
    assert r3["clustered"] == 1 and r3["enqueued"] == 0

    provider = FixtureProvider()
    done = []
    while (job := queue.claim("w", ["draft_cluster"])):
        out = draft_cluster(pb, queue, s, provider, job)
        queue.complete(job["job_id"], "w", out)
        done.append(out)
    assert {d["outcome"] for d in done} <= {"needs_review", "auto_published", "held"}
    pieces = [pb.get("editorial_pieces", d["piece_id"]) for d in done if d.get("piece_id")]
    gh_or_ke = [p for p in pieces if set(p["country_codes"]) & {"GH", "KE"}]
    assert len(gh_or_ke) == 2
    # The medium-risk Ghana fintech item is never auto-published (v1.3 risk tiers).
    assert all(p["review_status"] != "published" for p in gh_or_ke if "GH" in p["country_codes"])
    gh_piece = next(p for p in pieces if "GH" in p["country_codes"])
    assert gh_piece["risk_tier"] in ("medium", "high")
    claims = pb.list("evidence_claims", f"tenant_id={q(t['id'])} && cluster_id={q(gh_piece['cluster_id'])}")
    assert claims and all(c["source_item_ids"] for c in claims)
    # v1.3: no flat AI "analysis" cards are attached to a held topic.
    assert pb.list("comments", f"tenant_id={q(t['id'])} && piece_id={q(gh_piece['id'])}") == []
    runs = pb.list("ai_runs", f"tenant_id={q(t['id'])} && is_fixture_provider=true")
    assert runs and all(r["provider"] == "fixture" for r in runs)
    # Idempotent replay of a finished job never creates a second piece (T-036).
    job = {"job_id": "replay", "tenant_id": t["id"], "payload": {"cluster_id": gh_piece["cluster_id"]}}
    assert draft_cluster(pb, queue, s, provider, job)["outcome"] == "already_drafted"


def test_invalid_citation_is_held(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    queue = Queue(tmp_path / "j.db")
    src = make_source(pb, t, "Fixture Wire 2")
    body = feed("rss_good.xml").replace(b"fx-1", b"bc-1").replace(b"Kenya's fictional co-op opens solar cold room in Nakuru", b"Rwanda fixture: battery swap pilot for motorcycle taxis in Kigali")
    ingest_source(pb, queue, s, src, fetcher=CountingFetcher(body))
    job = queue.claim("w")
    out = draft_cluster(pb, queue, s, FixtureProvider("bad_citation"), job)
    assert out["outcome"] == "held" and any("UNKNOWN_CLAIM_ID" in f for f in out["flags"])


def test_model_offline_defers_without_inventing(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    queue = Queue(tmp_path / "j.db")
    src = make_source(pb, t, "Fixture Wire 3")
    body = feed("rss_injection.xml")
    ingest_source(pb, queue, s, src, fetcher=CountingFetcher(body))
    job = queue.claim("w")
    with pytest.raises(Deferred) as e:
        draft_cluster(pb, queue, s, FixtureProvider("offline"), job)
    assert e.value.reason.startswith("MODEL_UNAVAILABLE")
    cl = job["payload"]["cluster_id"]
    assert pb.first("editorial_pieces", f"cluster_id={q(cl)}") is None
    # Injection text in the feed cannot make anything public: once drafted it still waits for review.
    out = draft_cluster(pb, queue, s, FixtureProvider(), job)
    p = pb.get("editorial_pieces", out["piece_id"])
    assert p["review_status"] in ("needs_review", "held") and p["risk_tier"] == "high"
    assert out["outcome"] != "auto_published"


def test_ai_paused_switch_defers(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    sw = pb.first("tenant_settings", f"tenant_id={q(t['id'])} && key='AI_PAUSED'")
    pb.update("tenant_settings", sw["id"], {"value": True})
    try:
        with pytest.raises(Deferred) as e:
            draft_cluster(pb, Queue(tmp_path / "j.db"), config.load(), FixtureProvider(), {"job_id": "x", "tenant_id": t["id"], "payload": {"cluster_id": "nope"}})
        assert e.value.reason == "AI_PAUSED"
    finally:
        pb.update("tenant_settings", sw["id"], {"value": False})
