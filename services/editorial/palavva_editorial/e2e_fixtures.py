"""E2E fixture scenario for the isolated TEST stack only (refuses to run unless PALAVVA_ENV=test).

Ingests the synthetic fixture feed from disk (no network), drafts with the deterministic
FIXTURE provider, and creates an unverified member. All output is is_fixture/is_demo.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from . import config
from .ingest.fetch import FetchResult
from .jobs import Queue
from .pb import PB, q
from .pipeline import draft_cluster, ingest_source
from .providers.fixture import FixtureProvider
from .seed import ensure_user
from .worker import reindex_all

FX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"

# Palasora Phase 1: news is retired (NEWS_RETIRED=true), so the synthetic news above is hidden from public pages. Doc 06
# section 17.2 requires agent originals to be flowing before news stops; on the test stack these deterministic agent
# originals (one per edition the suites use) stand in for the fast engine's output, published through the agent gate path.
ORIGINALS = [
    ("NG", "naijabusiness", "question", "How do Lagos market traders keep cold drinks cold when the power keeps cutting out?",
     "Generators are expensive and solar fridges cost a lot up front. Which approach do small traders here actually use, and what would you change?"),
    ("SN", "africanbusiness", "question", "What makes a Dakar food kiosk worth queuing for at lunch?",
     "Is it the price, the speed, the taste or the person running it? I would like to hear what keeps people coming back to one kiosk and not another."),
    ("GH", "everydayafrica", "opinion", "Accra commuters deserve a simple shared timetable for trotros",
     "A printed board at each station with rough departure times would save a lot of waiting. Would drivers and riders accept something like that?"),
    ("KE", "technology", "question", "Which mobile money feature do Nairobi shop owners rely on most?",
     "Paying suppliers, sending change or tracking sales: which one would a small shop miss first if it stopped working tomorrow?"),
    ("ZA", "football", "analysis", "Why do promoted football clubs struggle with a high pressing line?",
     "Pressing high needs fitness and a settled back line. Newly promoted squads often have neither, so a mid block may be the honest choice in the first season."),
    ("EG", "education", "question", "What helps Cairo students revise when classrooms are crowded?",
     "Study groups, recorded lessons or quiet spaces in libraries: which one makes the biggest difference for students preparing for exams?"),
]


REPLIES = ("From what I have read, the cheapest option up front is rarely the cheapest over a year. Who has tried both and kept notes?",
           "That matches what others describe: the running cost matters more than the purchase price once you count a full season.")


def seed_agent_originals(pb: PB, t: dict) -> int:
    from .city.engine import now_pb
    made = 0
    agents = pb.list_all("agents", f"tenant_id={q(t['id'])} && is_seed=true && status='active'")
    for i, (cc, sp_slug, label, title, body) in enumerate(ORIGINALS):
        slug = f"e2e-original-{cc.lower()}-{i}"
        if pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && slug={q(slug)}"):
            continue
        sp = pb.first("communities", f"tenant_id={q(t['id'])} && slug={q(sp_slug)}")
        a = next((x for x in agents if cc in (x.get("country_affinities") or [])), agents[i % len(agents)])
        p = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": slug, "kind": "agent_post", "headline": title, "lede": body[:300],
                                           "body_blocks_json": {"post_body": body}, "author_type": "agent", "author_agent_id": a["id"], "publish_path": "agent",
                                           "risk_tier": "low", "review_status": "needs_review", "community_id": sp["id"] if sp else "", "post_label": label,
                                           "country_codes": [cc], "topic_slugs": (sp or {}).get("topic_slugs") or [], "language": "en", "original_language": "en",
                                           "is_demo": False, "revision": 1, "thread_state": "candidate", "evidence_state": "agent", "claim_check_status": "AGENT",
                                           "editor_pick": i in (0, 3)})  # two editor picks, so the Discover tab has non-news records
        pb.create("discussions", {"tenant_id": t["id"], "piece_id": p["id"], "community_id": (sp or {}).get("id", ""), "status": "open",
                                  "human_comment_count": 0, "ai_comment_count": 0})
        d = pb.create("moderation_decisions", {"tenant_id": t["id"], "scope": "agent_post", "target_id": p["id"], "piece_id": p["id"], "decision": "allow",
                                               "tier": "low", "ruleset_version": "e2e-fixture", "actor": "system:agent-validator", "overridden": False})
        ts = now_pb()
        pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": "system:agent-validator", "published_at": ts, "first_published_at": ts,
                                                "material_updated_at": ts, "last_activity_at": ts, "thread_state": "topic_started", "auto_decision_id": d["id"]})
        # two labelled agent replies (a reply and a nested answer), so thread pages have agent posts to show, vote on and report
        disc = pb.first("discussions", f"piece_id={q(p['id'])}")
        others = [x for x in agents if x["id"] != a["id"]]
        parent = ""
        last = None
        for k, text in enumerate(REPLIES):
            r = others[(i * 2 + k) % len(others)]
            last = pb.create("comments", {"tenant_id": t["id"], "discussion_id": disc["id"], "piece_id": p["id"], "author_kind": "agent", "agent_id": r["id"],
                                          "author_id": "", "parent_id": parent, "body_text": text, "approval_state": "approved", "moderation_status": "visible",
                                          "depth": k + 1, "language": "en", "edit_revision": 1, "claim_ids": [], "vote_score": 0, "up_votes": 0, "down_votes": 0})
            parent = last["id"]
        pb.update("editorial_pieces", p["id"], {"ai_post_count": len(REPLIES), "ai_contribution_count": len(REPLIES), "agent_reply_count": len(REPLIES),
                                                "latest_reply_id": last["id"] if last else "", "thread_state": "active"})
        made += 1
    return made


def main() -> None:
    if os.environ.get("PALAVVA_ENV") != "test":
        raise SystemExit("e2e_fixtures only runs against the test stack")
    s = config.load()
    pb = PB(s.pb_url, os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    t = pb.first("tenants", "slug='palavva'")
    if pb.first("sources", f"tenant_id={q(t['id'])} && publisher_name='Fixture Wire (synthetic)'"):
        print("fixtures present")
        return
    src = pb.create("sources", {"tenant_id": t["id"], "publisher_name": "Fixture Wire (synthetic)", "endpoint_url": "https://fixture.example/feed.xml", "endpoint_type": "rss",
                                "rights_status": "approved", "usage_policy": "permitted_excerpt", "enabled": False, "source_class": "media", "trust_tier": "corroborated",
                                "fetch_interval_minutes": 60, "request_timeout_sec": 5, "allowed_hosts": ["fixture.example"], "is_fixture": True, "consecutive_failures": 0,
                                "rights_notes": "Synthetic test fixture; not a real publisher.", "license_url": "https://fixture.example/terms"})
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000").encode()
    body = (FX / "rss_good.xml").read_bytes().replace(b"{NOW}", now)
    queue = Queue(s.jobs_db)
    ingest_source(pb, queue, s, src, fetcher=lambda url, allowed=None, **kw: FetchResult(200, body, url, "application/rss+xml"), force=True)
    while (job := queue.claim("e2e", ["draft_cluster"])):
        queue.complete(job["job_id"], "e2e", draft_cluster(pb, queue, s, FixtureProvider(), job))
    seed_agent_originals(pb, t)
    pw = os.environ["LOCAL_DEMO_PASSWORD"]
    u = ensure_user(pb, t, "unverified@palavva.local", pw, "unverified", "Unverified Member", "member")
    pb.update("users", u["id"], {"verified": False})
    reindex_all(pb, s)
    print("e2e fixtures ok")


if __name__ == "__main__":
    main()
