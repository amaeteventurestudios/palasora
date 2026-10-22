"""Palasora Phase 4: town events reach the feed, notifications, live updates and reports (Doc 06 sections 5, 13, 14, 19).

Runs a short seeded town, links its players to real PocketBase people and agents, and relays the stored events into an
isolated PocketBase with the production migrations and hooks (so the publish gate runs for real).
"""
from __future__ import annotations

import json
import time

import pytest

from palavva_editorial import translate
from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import events, reports, social
from palavva_editorial.pb import PBError, q


def _user(pb, t, name: str) -> dict:
    stamp = f"{name}{int(time.time() * 1000)}"
    return pb.create("users", {"tenant_id": t["id"], "email": f"{stamp}@phase4.test", "password": "phase4-password-123", "passwordConfirm": "phase4-password-123",
                               "handle": stamp.lower()[:30], "display_name": name, "account_status": "active", "verified": True})


def _agent(pb, t, owner: dict, handle: str) -> dict:
    h = f"{handle}{int(time.time() * 1000) % 100000}"
    return pb.create("agents", {"tenant_id": t["id"], "handle": h, "handle_key": h, "display_name": handle.capitalize(), "kind": "personal", "hosting": "palavva",
                                "owner_type": "user", "owner_user_id": owner["id"], "status": "active", "permissions": {"post": True, "reply": True, "vote": True}})


@pytest.fixture(scope="module")
def town(seeded):
    """A 6-day baseline town (seed 3) with players p001 and p002 linked to two people and their agents."""
    pb, t = seeded["pb"], seeded["palavva"]
    s = runner.run("baseline", 3, 6)
    con = s["_world"].con
    ada, kofi = _user(pb, t, "Ada"), _user(pb, t, "Kofi")
    ada_agent, kofi_agent = _agent(pb, t, ada, "adabot"), _agent(pb, t, kofi, "kofibot")
    with db.tx(con):
        social.link(con, "p001", user_id=ada["id"], agent_id=ada_agent["id"], display_name="Ada's agent")
        social.link(con, "p002", user_id=kofi["id"], agent_id=kofi_agent["id"], display_name="Kofi's agent")
    first = social.relay(con, pb, t["id"], limit=5000)
    return {"pb": pb, "t": t, "con": con, "ada": ada, "kofi": kofi, "ada_agent": ada_agent, "first": first}


def _public(con):
    return [dict(r) for r in con.execute("SELECT * FROM world_events WHERE visibility='public' AND kind != 'event_withdrawn' ORDER BY seq")]


def _pieces(pb, t, eid):
    return pb.list("editorial_pieces", f"tenant_id={q(t['id'])} && town_event_id={q(eid)}")


def test_every_public_event_appears_in_the_feed_exactly_once_and_relay_repeats_are_ignored(town):
    pb, t, con = town["pb"], town["t"], town["con"]
    assert town["first"]["failed"] == 0 and town["first"]["held"] == 0
    pub = _public(con)
    assert len(pub) >= 5
    for e in pub:
        ps = _pieces(pb, t, e["id"])
        assert len(ps) == 1, e
        assert ps[0]["review_status"] == "published" and ps[0]["kind"] == "town_event" and ps[0]["reviewer_id"] == social.RELAY
    # A crash after the PocketBase writes but before the receipts commit: receipts gone, rows pending again.
    with db.tx(con):
        con.execute("DELETE FROM event_receipts WHERE consumer IN ('feed','notifications','world','profile')")
        con.execute("UPDATE outbox SET status='pending', attempts=0, next_try=0")
    again = social.relay(con, pb, t["id"], limit=5000)
    assert again["delivered"] > 0 and again["failed"] == 0
    # ... and a plain second pass over delivered rows does nothing at all.
    assert social.relay(con, pb, t["id"], limit=5000)["delivered"] == 0
    for e in pub:
        assert len(_pieces(pb, t, e["id"])) == 1
        assert len(pb.list("town_events", f"tenant_id={q(t['id'])} && event_id={q(e['id'])}")) == 1
        assert len(pb.list("thread_events", f"tenant_id={q(t['id'])} && town_event_id={q(e['id'])}")) == 1
    for n in pb.list("notifications", f"tenant_id={q(t['id'])} && kind='town_event'", per_page=500):
        assert len(pb.list("notifications", f"tenant_id={q(t['id'])} && user_id={q(n['user_id'])} && ref_key={q(n['ref_key'])}")) == 1


def test_every_feed_post_links_to_a_stored_event_with_display_text_only(town):
    pb, t, con = town["pb"], town["t"], town["con"]
    posts = pb.list("editorial_pieces", f"tenant_id={q(t['id'])} && kind='town_event'", per_page=500)
    assert posts
    for p in posts:
        ev = con.execute("SELECT * FROM world_events WHERE id=?", (p["town_event_id"],)).fetchone()
        assert ev is not None and ev["visibility"] == "public"
        rec = pb.first("town_events", f"tenant_id={q(t['id'])} && event_id={q(ev['id'])}")
        assert rec["piece_id"] == p["id"]
        assert all(k in social.ID_REFS for k in rec["refs"])  # ids only: no amounts copied into PocketBase
        assert p["feed_scope"] == ("main" if ev["kind"] in social.MAIN_FEED_KINDS else "place")
        sp = pb.get("communities", p["community_id"])
        assert sp["place_kind"] == "town" and sp["kind"] == "subpal"


def test_visibility_owner_and_town_events_never_reach_the_public_feed_or_stream(town):
    pb, t, con = town["pb"], town["t"], town["con"]
    private = [r["id"] for r in con.execute("SELECT id FROM world_events WHERE visibility IN ('owner','town','staff')")]
    assert private
    for eid in private:
        assert _pieces(pb, t, eid) == []
        assert pb.list("thread_events", f"tenant_id={q(t['id'])} && town_event_id={q(eid)}") == []
    # The gate refuses a hand-made post for an owner-only event, and any reviewer but the relay for a town event.
    eid = con.execute("SELECT id FROM world_events WHERE visibility='owner' LIMIT 1").fetchone()["id"]
    pb.create("town_events", {"tenant_id": t["id"], "event_id": eid, "kind": "hired", "visibility": "owner", "text": "x", "status": "live"})
    p = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": f"forged-{eid}", "kind": "town_event", "headline": "forged", "author_type": "town",
                                       "publish_path": "town_event", "risk_tier": "low", "review_status": "needs_review", "town_event_id": eid, "revision": 1})
    pb.create("moderation_decisions", {"tenant_id": t["id"], "scope": "town_event", "target_id": p["id"], "piece_id": p["id"], "decision": "allow",
                                       "tier": "low", "ruleset_version": "x", "actor": social.RELAY, "overridden": False})
    with pytest.raises(PBError, match="only public town events"):
        pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": social.RELAY})
    with pytest.raises(PBError, match="only through the town relay"):
        pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": "system:agent-validator"})
    orphan = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": f"orphan-{eid}", "kind": "town_event", "headline": "orphan", "author_type": "town",
                                            "publish_path": "town_event", "risk_tier": "low", "review_status": "needs_review", "town_event_id": "ev-99999999", "revision": 1})
    with pytest.raises(PBError, match="linked event record"):
        pb.update("editorial_pieces", orphan["id"], {"review_status": "published", "reviewer_id": social.RELAY})
    # A published post cannot be re-pointed at another event.
    some = pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && kind='town_event' && review_status='published'")
    with pytest.raises(PBError, match="immutable"):
        pb.update("editorial_pieces", some["id"], {"town_event_id": eid})


def test_notifications_only_for_linked_owners_and_only_with_a_real_event(town):
    pb, t, con = town["pb"], town["t"], town["con"]
    rows = pb.list("notifications", f"tenant_id={q(t['id'])} && kind='town_event'", per_page=500)
    assert rows
    users = {town["ada"]["id"], town["kofi"]["id"]}
    for n in rows:
        assert n["user_id"] in users
        ev = con.execute("SELECT * FROM world_events WHERE id=?", (n["town_event_id"],)).fetchone()
        assert ev is not None and ev["visibility"] != "staff"
        mine = social.members_of(con, n["user_id"])
        assert mine & set(json.loads(ev["who"]))  # about this person's agent or business
    # An event about nobody linked tells nobody; a house agent's event tells nobody.
    house = con.execute("SELECT id FROM world_events WHERE who NOT LIKE '%p0%' AND visibility != 'staff' LIMIT 1").fetchone()
    if house:
        assert pb.list("notifications", f"tenant_id={q(t['id'])} && town_event_id={q(house['id'])}") == []


def test_owning_a_plot_joins_the_town_subpal(town):
    pb, t = town["pb"], town["t"]
    sp = pb.first("communities", f"tenant_id={q(t['id'])} && place_kind='town'")
    f = pb.first("follows", f"tenant_id={q(t['id'])} && user_id={q(town['ada']['id'])} && target_type='community' && target_id={q(sp['slug'])}")
    assert f is not None and f["source"] == "plot"
    m = pb.first("agent_memberships", f"tenant_id={q(t['id'])} && agent_id={q(town['ada_agent']['id'])} && target_id={q(sp['id'])}")
    assert m is not None and m["source"] == "plot"
    assert pb.get("communities", sp["id"])["watcher_count"] >= 2


def test_withdrawn_event_leaves_the_feed_and_notifications(town):
    pb, t, con = town["pb"], town["t"], town["con"]
    target = next(e for e in _public(con) if "p002" in json.loads(e["who"]) and not e["withdrawn"])
    assert pb.list("notifications", f"tenant_id={q(t['id'])} && town_event_id={q(target['id'])}")
    with db.tx(con):
        nxt = con.execute("SELECT MAX(seq) + 1 s FROM world_events").fetchone()["s"]
        wid = events.withdraw(con, target["id"], "recorded twice by mistake", seq=nxt, tick=target["tick"])
        assert events.withdraw(con, target["id"], "again", seq=nxt + 1, tick=target["tick"]) is None
    out = social.relay(con, pb, t["id"])
    assert out["failed"] == 0
    p = _pieces(pb, t, target["id"])[0]
    assert p["review_status"] == "retracted" and "recorded twice" in p["correction_note"]
    assert pb.first("town_events", f"tenant_id={q(t['id'])} && event_id={q(target['id'])}")["status"] == "withdrawn"
    assert pb.list("notifications", f"tenant_id={q(t['id'])} && town_event_id={q(target['id'])}") == []
    assert pb.first("thread_events", f"tenant_id={q(t['id'])} && town_event_id={q(wid)}")["event_type"] == "town_event_withdrawn"
    # A withdrawn event cannot be published again, and the report leaves it out.
    with pytest.raises(PBError, match="withdrawn"):
        pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": social.RELAY})
    assert target["id"] not in [i["event"] for i in reports.away(con, {"p002"}, 0, 50)["items"]]


def test_held_after_retries_then_retried_from_the_command_center(town):
    pb, t, con = town["pb"], town["t"], town["con"]
    with db.tx(con):
        eid = events.emit(con, seq=con.execute("SELECT MAX(seq) + 1 s FROM world_events").fetchone()["s"], tick=200, kind="business_opened",
                          who=["p002"], visibility="public", refs={"business": "b001"}, text="A new stall opened on plot P0405")

    class Down:
        def __getattr__(self, name):
            def boom(*a, **k):
                raise PBError(503, "PocketBase down")
            return boom
    for _ in range(events.MAX_ATTEMPTS):
        with db.tx(con):
            con.execute("UPDATE outbox SET next_try=0 WHERE event_id=?", (eid,))
        events.relay_once(con, social.consumers(con, Down(), t["id"]))
    held = {h["destination"] for h in events.held(con) if h["event_id"] == eid}
    assert {"feed", "notifications", "world", "profile"} <= held
    assert _pieces(pb, t, eid) == []
    with db.tx(con):
        assert events.retry_held(con, eid) >= 4
    assert social.relay(con, pb, t["id"])["held"] == 0
    assert len(_pieces(pb, t, eid)) == 1 and events.held(con) == []


def test_while_you_were_away_is_ranked_from_stored_events_and_never_padded(town):
    con = town["con"]
    mine = social.members_of(con, town["ada"]["id"])
    assert "p001" in mine
    out = reports.away(con, mine, 0, 30)
    yours = [i for i in out["items"] if i["yours"]]
    assert yours and all(i["yours"] for i in out["items"][:len(yours)])  # the person's own news comes first
    weights = [reports.IMPORTANCE.get(i["kind"], 0) for i in yours]
    assert weights == sorted(weights, reverse=True)
    for i in out["items"]:
        assert con.execute("SELECT 1 FROM world_events WHERE id=? AND withdrawn=0", (i["event"],)).fetchone()
    quiet = reports.away(con, {"nobody"}, 10_000, 30, town_wide=True)
    assert quiet["quiet"] and quiet["items"] == []


def test_morning_reports_still_link_every_story_with_no_duplicates(town):
    v = reports.verify(town["con"])
    assert v["messages"] > 0 and v["share_linked"] == 1.0 and v["padded"] == 0 and v["duplicates"] == 0


def test_town_posts_go_through_the_translation_pipeline(town):
    pb, t = town["pb"], town["t"]
    p = pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && kind='town_event' && review_status='published'")
    assert translate.piece_fields(p)["headline"] == p["headline"] and p["original_language"] == "en"


def test_live_record_reads_numbers_from_the_economy(town):
    con = town["con"]
    e = next(e for e in _public(con) if e["kind"] == "business_opened")
    r = social.record(con, e["id"])
    b = con.execute("SELECT * FROM businesses WHERE id=?", (json.loads(e["refs"])["business"],)).fetchone()
    assert r["links"]["business"]["price_sora"] == b["price"] / 100 and r["links"]["business"]["status"] == b["status"]
