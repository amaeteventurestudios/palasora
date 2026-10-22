"""E2E fixture scenario for the isolated TEST stack only (refuses to run unless PALAVVA_ENV=test).

Seeds deterministic agent originals, the founding company and the town's stored events, and creates an unverified
member. All output is is_fixture/is_demo. (The synthetic news feed it used to ingest was removed with news in Phase 5.)
"""
from __future__ import annotations

import os

from . import config
from .pb import PB, q
from .seed import ensure_user
from .worker import reindex_all


# Doc 06 section 17.2: agent originals carry the feed without news. On the test stack these deterministic agent
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


FOUNDING = {"name": "Volta Harvest Co-op", "ticker": "VHCO", "market": "GH", "sector": "agriculture",
            "description": "A fictional Ghanaian farming co-op, seeded as a founding company for the end-to-end tests. Simulated only: no real business."}


def seed_founding_company(pb: PB, t: dict) -> dict | None:
    """Palasora Phase 2: new companies are private (Doc 04 section 8) and the real founding companies came from before Sora,
    so the test stack gets one founding company (listed, 10,000 shares, its treasury offered at 1.00 Sora). Its founder is a
    house agent, so only people and their agents can buy its IPO (house agents share the platform owner)."""
    from .economy import db as edb, exchange as ex, rewards, service
    c = service.con()
    if c.execute("SELECT 1 FROM companies WHERE ticker=?", (FOUNDING["ticker"],)).fetchone():
        return None
    a = pb.first("agents", f"tenant_id={q(t['id'])} && is_seed=true && hosting='palavva' && country_affinities~'" + '"GH"' + "'") or pb.first("agents", f"tenant_id={q(t['id'])} && is_seed=true")
    key = service.owner_key_for(a)
    rewards.award(c, agent_id=a["id"], rule="first_contribution", ref_type="mission", ref_id="e2e-founding", owner_key=key, memo="e2e founding company")
    with edb.tx(c):
        return ex.create_company(c, founder_agent_id=a["id"], owner_key=key, ipo_price=100, fictional_ack=True, founding=True, **FOUNDING)


def seed_town(pb: PB, t: dict) -> dict:
    """Palasora Phase 4: a few stored town events (no simulation run, no coins moved) linked to the local reader, relayed into
    the feed exactly as the worker would. reader@palavva.local plays p001, which owns stall b001."""
    from .economy import db as edb, service as economy
    from .economy.town import events, layout, social
    con = economy.con()
    if con.execute("SELECT 1 FROM world_events LIMIT 1").fetchone():
        return {"seeded": False}
    reader = pb.first("users", f"tenant_id={q(t['id'])} && email='reader@palavva.local'")
    with edb.tx(con):
        # Phase 6: the founded town's plot grid, so the world viewer draws the same plots the ledger knows.
        con.executemany("INSERT OR IGNORE INTO plots(id, area, x, y, size, prime, use) VALUES (?,?,?,?,1,?,?)",
                        [(p["id"], p["area"], p["x"], p["y"], p["prime"], p["use"]) for p in layout.layout()])
        con.execute("""INSERT INTO businesses(id, type, plot, owner, price, wage, status, cost, opened_tick) VALUES
                       ('b001','stall','P405','p001',250,1500,'open',40000,9), ('b002','farm','P809','h020',180,1400,'open',30000,12)""")
        # house agents' businesses from day 0 (no events: genesis businesses are not news)
        con.execute("""INSERT INTO businesses(id, type, plot, owner, price, wage, status, cost, opened_tick, health) VALUES
                       ('b003','workshop','P101','h021',400,1600,'open',50000,0,'green'), ('b004','delivery','P201','h022',300,1500,'open',45000,0,'yellow'),
                       ('b005','stall','P406','h023',240,1400,'open',40000,0,'green'), ('b006','stall','P307','h024',260,1400,'open',40000,0,'orange'),
                       ('b007','farm','P903','h025',170,1300,'open',30000,0,'green'), ('b008','workshop','P706','h026',380,1600,'open',50000,0,'green')""")
        social.link(con, "p001", user_id=reader["id"] if reader else "", display_name="Local Reader's agent")
        rows = [(8, "player_arrived", ["p001"], "public", {"agent": "p001"}, "p001 arrived in town"),
                (9, "business_opened", ["p001", "b001"], "public", {"business": "b001", "plot": "P405"}, "A new stall opened on plot P405 (run by p001)"),
                (10, "hired", ["h010", "p001", "b001"], "owner", {"business": "b001"}, "h010 started work at b001 for 15 Sora a day"),
                (11, "price_changed", ["p001", "b001"], "town", {"business": "b001"}, "b001 changed its price from 2.20 to 2.50 Sora"),
                (12, "business_opened", ["h020", "b002"], "public", {"business": "b002", "plot": "P809"}, "A new farm opened on plot P809"),
                (13, "player_arrived", ["p002"], "public", {"agent": "p002"}, "p002 arrived in town")]
        for i, (tick, kind, who, vis, refs, text) in enumerate(rows, start=1):
            events.emit(con, seq=i, tick=tick, kind=kind, who=who, visibility=vis, refs=refs, text=text)
    return social.relay(con, pb, t["id"])


def main() -> None:
    if os.environ.get("PALAVVA_ENV") != "test":
        raise SystemExit("e2e_fixtures only runs against the test stack")
    s = config.load()
    pb = PB(s.pb_url, os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    t = pb.first("tenants", "slug='palavva'")
    if pb.first("users", "email='unverified@palavva.local'"):
        print("fixtures present")
        return
    seed_agent_originals(pb, t)
    seed_founding_company(pb, t)
    print("town", seed_town(pb, t))
    pw = os.environ["LOCAL_DEMO_PASSWORD"]
    u = ensure_user(pb, t, "unverified@palavva.local", pw, "unverified", "Unverified Member", "member")
    pb.update("users", u["id"], {"verified": False})
    reindex_all(pb, s)
    print("e2e fixtures ok")


if __name__ == "__main__":
    main()
