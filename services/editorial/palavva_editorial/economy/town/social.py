"""Phase 4: town events reach the social network (Doc 06 sections 5, 13 and 14).

The Phase 3 relay (`events.relay_once`) hands each outbox row to the consumer for its view. This module adds the
consumers that write to PocketBase:

* `feed`: a public event becomes a `town_event` post in the town's SubPal (and in the main feed when it is public
  enough). The post passes the publish gate only through `system:town-relay`, which checks a linked `town_events` record
  that is public and live. A withdrawn event's post is retracted.
* `notifications`: the people whose agents or businesses an event is about are told. No event, no notification.
* `world`: public events go to the live SSE stream (the `thread_events` log the web hub already replays).
* `profile`: owning a plot joins you to the town's SubPal (people follow it; agents become members).

Applied once, twice over: each consumer stores (consumer, event id) in economy.db through `apply_once`, and every
PocketBase write is keyed by the event id too (unique indexes on town_events, pieces, thread_events and the notification
ref_key), so a delivery repeated after a crash between the PocketBase write and the economy.db commit changes nothing.

No second truth: PocketBase rows hold the event id and display text only. Live numbers come from the economy service
(`record()` below, served at /economy/town/events/{id}).
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
from datetime import datetime, timezone

from ...pb import PBError, q
from .. import db
from . import events
from .events import apply_once
from .params import C

RELAY = "system:town-relay"
# Only ids cross into PocketBase; amounts in refs (a building's cost, a grant) stay in economy.db.
ID_REFS = ("business", "contract", "plot", "agent", "founder_plot", "week", "goods_trade", "event", "violation")
RULESET = "town-relay-v1"
DEFAULT_TOWN = ("first-town", "First Town")
# "Public enough" for the main feed; every other public event stays in the town's SubPal.
MAIN_FEED_KINDS = {"business_opened", "business_closed", "business_sold", "vote_result"}
# Events that put a plot in someone's name: they join the town's SubPal.
PLOT_KINDS = {"player_arrived", "business_opened", "business_sold"}
NOTIFY_TITLES = {
    "hired": "A new worker started", "let_go": "A worker was let go", "worker_left": "A worker left",
    "contract_signed": "Contract signed", "contract_breached": "Contract breached", "contract_ended": "Contract ended",
    "business_opened": "Business opened", "business_closed": "Business closed", "business_sold": "Business sold",
    "price_changed": "Price changed", "upgraded": "Business upgraded", "market_trade": "Market Hall trade",
    "player_arrived": "You arrived in town", "starter_grant": "Starter grant paid",
}


def now_pb(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts if ts is not None else time.time(), timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


# ---------------------------------------------------------------------------------------------- towns and identities

def ensure_town(con: sqlite3.Connection, pb, tenant_id: str, town_id: str = DEFAULT_TOWN[0], name: str = DEFAULT_TOWN[1]) -> dict:
    """The town row in economy.db and its place SubPal in PocketBase (Doc 06 section 5 item 5). Idempotent."""
    if not con.execute("SELECT 1 FROM towns WHERE id=?", (town_id,)).fetchone():
        con.execute("INSERT INTO towns(id, name, slug, created_at) VALUES (?,?,?,?)", (town_id, name, town_id, time.time()))
    t = con.execute("SELECT * FROM towns WHERE id=?", (town_id,)).fetchone()
    sp = pb.first("communities", f"tenant_id={q(tenant_id)} && slug={q(t['slug'])}")
    if sp is None:
        sp = pb.create("communities", {"tenant_id": tenant_id, "slug": t["slug"], "name": t["name"], "kind": "subpal", "status": "published",
                                       "summary": f"What happens in {t['name']}: openings, closings, sales and the weekly vote. Every post links to its town record.",
                                       "place_kind": "town", "town_id": town_id, "icon": "🏘", "country_codes": [], "topic_slugs": [], "edition_focus": []})
    return {"id": t["id"], "name": t["name"], "slug": t["slug"], "subpal_id": sp["id"]}


def town_of(con: sqlite3.Connection, ev) -> str:
    if ev["town"]:
        return ev["town"]
    r = con.execute("SELECT id FROM towns ORDER BY created_at, id LIMIT 1").fetchone()
    return r["id"] if r else DEFAULT_TOWN[0]


def link(con: sqlite3.Connection, town_agent: str, *, user_id: str = "", agent_id: str = "", display_name: str = "") -> None:
    """Tie a town resident to its PocketBase identity (a person's account and/or their agent)."""
    con.execute("""INSERT INTO town_links(town_agent, user_id, agent_id, display_name) VALUES (?,?,?,?) ON CONFLICT(town_agent) DO UPDATE SET
                   user_id=excluded.user_id, agent_id=excluded.agent_id, display_name=excluded.display_name""", (town_agent, user_id, agent_id, display_name))


def owners(con: sqlite3.Connection, who: list[str]) -> list[dict]:
    """The linked people behind an event: residents named in it, and the owners of businesses named in it."""
    ids = set(who)
    for bid in who:
        r = con.execute("SELECT owner FROM businesses WHERE id=?", (bid,)).fetchone()
        if r:
            ids.add(r["owner"])
    if not ids:
        return []
    rows = con.execute(f"SELECT * FROM town_links WHERE town_agent IN ({','.join('?' * len(ids))}) ORDER BY town_agent", sorted(ids)).fetchall()
    return [dict(r) for r in rows]


def members_of(con: sqlite3.Connection, user_id: str) -> set[str]:
    """A person's town agents and their businesses (for "while you were away")."""
    agents = {r["town_agent"] for r in con.execute("SELECT town_agent FROM town_links WHERE user_id=? AND user_id != ''", (user_id,))}
    if not agents:
        return set()
    biz = {r["id"] for r in con.execute(f"SELECT id FROM businesses WHERE owner IN ({','.join('?' * len(agents))})", sorted(agents))}
    return agents | biz


def display_text(con: sqlite3.Connection, ev) -> str:
    """The event's text with linked residents shown by their public names (display only; ids stay in the record)."""
    names = {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}
    if not names:
        return ev["text"]
    return re.sub(r"\b[A-Za-z]\d{2,}\b", lambda m: names.get(m.group(0), m.group(0)), ev["text"])


# ---------------------------------------------------------------------------------------------- the PocketBase side

def _event_record(pb, tenant_id: str, con: sqlite3.Connection, ev) -> dict:
    rec = pb.first("town_events", f"tenant_id={q(tenant_id)} && event_id={q(ev['id'])}")
    if rec is None:
        rec = pb.create("town_events", {"tenant_id": tenant_id, "event_id": ev["id"], "town_id": town_of(con, ev), "kind": ev["kind"],
                                        "visibility": ev["visibility"], "text": display_text(con, ev)[:400], "refs": {k: v for k, v in json.loads(ev["refs"]).items() if k in ID_REFS},
                                        "seq": ev["seq"], "tick": ev["tick"], "status": "live"})
    return rec


def publish(con: sqlite3.Connection, pb, tenant_id: str, ev) -> str | None:
    """Make (or find) the feed post for a public event. Returns the piece id, or None when the event may not be shown."""
    if ev["visibility"] != "public" or ev["withdrawn"]:
        return None  # owner-only, town-only and staff events never reach the public feed
    town = ensure_town(con, pb, tenant_id, town_of(con, ev))
    rec = _event_record(pb, tenant_id, con, ev)
    piece = pb.first("editorial_pieces", f"tenant_id={q(tenant_id)} && town_event_id={q(ev['id'])}")
    if piece is None:
        text = display_text(con, ev)
        piece = pb.create("editorial_pieces", {
            "tenant_id": tenant_id, "slug": f"town-{ev['id']}", "kind": "town_event", "headline": text[:300], "lede": "",
            "body_blocks_json": {"town_event": {"event_id": ev["id"], "kind": ev["kind"], "town": town["id"]}},
            "author_type": "town", "publish_path": "town_event", "risk_tier": "low", "review_status": "needs_review",
            "community_id": town["subpal_id"], "town_event_id": ev["id"], "feed_scope": "main" if ev["kind"] in MAIN_FEED_KINDS else "place",
            "country_codes": [], "topic_slugs": [], "language": "en", "original_language": "en", "is_demo": False, "revision": 1,
            "thread_state": "candidate", "evidence_state": "town_record", "claim_check_status": "TOWN_RECORD"})
    if piece.get("review_status") != "published":
        if pb.first("discussions", f"tenant_id={q(tenant_id)} && piece_id={q(piece['id'])}") is None:
            pb.create("discussions", {"tenant_id": tenant_id, "piece_id": piece["id"], "community_id": town["subpal_id"], "status": "open",
                                      "human_comment_count": 0, "ai_comment_count": 0})
        d = pb.first("moderation_decisions", f"tenant_id={q(tenant_id)} && piece_id={q(piece['id'])} && scope='town_event'")
        if d is None:
            d = pb.create("moderation_decisions", {"tenant_id": tenant_id, "scope": "town_event", "target_id": piece["id"], "piece_id": piece["id"],
                                                   "decision": "allow", "tier": "low", "ruleset_version": RULESET, "actor": RELAY, "overridden": False,
                                                   "reasons": f"stored economy event {ev['id']} ({ev['kind']}, public)"})
        ts = now_pb()
        pb.update("editorial_pieces", piece["id"], {"review_status": "published", "reviewer_id": RELAY, "published_at": ts, "first_published_at": ts,
                                                    "material_updated_at": ts, "last_activity_at": ts, "thread_state": "topic_started", "auto_decision_id": d["id"]})
    if rec.get("piece_id") != piece["id"]:
        pb.update("town_events", rec["id"], {"piece_id": piece["id"]})
    _recount(pb, tenant_id, town["subpal_id"])
    return piece["id"]


def _recount(pb, tenant_id: str, subpal_id: str) -> None:
    n = pb.count("editorial_pieces", f"tenant_id={q(tenant_id)} && community_id={q(subpal_id)} && review_status='published'")
    pb.update("communities", subpal_id, {"post_count": n, "last_activity_at": now_pb()})


def take_back(con: sqlite3.Connection, pb, tenant_id: str, event_id: str, reason: str) -> None:
    """A withdrawn event: its record is marked, its post retracted (the feed's cache drops it), its notifications removed."""
    rec = pb.first("town_events", f"tenant_id={q(tenant_id)} && event_id={q(event_id)}")
    if rec is not None and rec.get("status") != "withdrawn":
        pb.update("town_events", rec["id"], {"status": "withdrawn", "withdrawn_reason": reason[:300]})
    piece = pb.first("editorial_pieces", f"tenant_id={q(tenant_id)} && town_event_id={q(event_id)}")
    if piece is not None and piece.get("review_status") != "retracted":
        pb.update("editorial_pieces", piece["id"], {"review_status": "retracted", "correction_note": f"Withdrawn: {reason}"[:1000], "material_updated_at": now_pb()})
        if piece.get("community_id"):
            _recount(pb, tenant_id, piece["community_id"])


def notify(con: sqlite3.Connection, pb, tenant_id: str, ev) -> int:
    """Tell the linked owners about a real event. Returns how many notifications were written."""
    if ev["withdrawn"] or ev["visibility"] == "staff" or ev["kind"] not in NOTIFY_TITLES:
        return 0
    n = 0
    text = display_text(con, ev)
    for o in owners(con, json.loads(ev["who"])):
        if not o["user_id"]:
            continue
        key = f"town:{ev['id']}"
        if pb.first("notifications", f"tenant_id={q(tenant_id)} && user_id={q(o['user_id'])} && ref_key={q(key)}") is not None:
            continue
        try:
            pb.create("notifications", {"tenant_id": tenant_id, "user_id": o["user_id"], "agent_id": o["agent_id"], "kind": "town_event",
                                        "title": NOTIFY_TITLES[ev["kind"]], "body": text[:1000], "link": f"/town/event/{ev['id']}",
                                        "ref_key": key, "town_event_id": ev["id"]})
            n += 1
        except PBError as e:
            if e.status != 400:  # 400 = the unique ref_key: already told
                raise
    return n


def unnotify(pb, tenant_id: str, event_id: str) -> None:
    for r in pb.list("notifications", f"tenant_id={q(tenant_id)} && town_event_id={q(event_id)}", per_page=200):
        pb.delete("notifications", r["id"])


def stream(con: sqlite3.Connection, pb, tenant_id: str, ev, event_type: str = "town_event", payload: dict | None = None) -> None:
    """Append one public live event (the SSE hub and `events/replay` read this log). Keyed by the economy event id."""
    if pb.first("thread_events", f"tenant_id={q(tenant_id)} && town_event_id={q(ev['id'])}") is not None:
        return
    piece = pb.first("editorial_pieces", f"tenant_id={q(tenant_id)} && town_event_id={q(ev['id'])}") if event_type == "town_event" else None
    body = payload or {"event_id": ev["id"], "kind": ev["kind"], "text": display_text(con, ev), "town": town_of(con, ev)}
    for _ in range(8):
        last = pb.list("thread_events", f"tenant_id={q(tenant_id)}", "-seq", 1)
        seq = (last[0]["seq"] if last else 0) + 1
        try:
            pb.create("thread_events", {"tenant_id": tenant_id, "seq": seq, "event_type": event_type, "piece_id": piece["id"] if piece else "",
                                        "author_kind": "system", "visibility": "public", "payload": body, "town_event_id": ev["id"]})
            return
        except PBError as e:
            if e.status != 400:
                raise
            if pb.first("thread_events", f"tenant_id={q(tenant_id)} && town_event_id={q(ev['id'])}") is not None:
                return  # a repeat raced us: already streamed
            time.sleep(0.05)  # unique (tenant_id, seq) race with the web server: retry with a fresh max
    raise RuntimeError("could not allocate event sequence")


def join_places(con: sqlite3.Connection, pb, tenant_id: str, ev) -> int:
    """Owning a plot joins you to the town's SubPal: people follow it, their agents become members. Topic SubPals stay."""
    if ev["withdrawn"] or ev["kind"] not in PLOT_KINDS:
        return 0
    who = json.loads(ev["who"])
    if ev["kind"] == "business_sold":
        refs = json.loads(ev["refs"])
        b = con.execute("SELECT owner FROM businesses WHERE id=?", (refs.get("business", ""),)).fetchone()
        who = [b["owner"]] if b else []  # the buyer joins; the seller keeps any other plot it owns
    town = ensure_town(con, pb, tenant_id, town_of(con, ev))
    n = 0
    for o in owners(con, who):
        if o["user_id"] and pb.first("follows", f"tenant_id={q(tenant_id)} && user_id={q(o['user_id'])} && target_type='community' && target_id={q(town['slug'])}") is None:
            pb.create("follows", {"tenant_id": tenant_id, "user_id": o["user_id"], "target_type": "community", "target_id": town["slug"], "source": "plot"})
            n += 1
        if o["agent_id"] and pb.first("agent_memberships", f"tenant_id={q(tenant_id)} && agent_id={q(o['agent_id'])} && target_type='subpal' && target_id={q(town['subpal_id'])}") is None:
            pb.create("agent_memberships", {"tenant_id": tenant_id, "agent_id": o["agent_id"], "target_type": "subpal", "target_id": town["subpal_id"],
                                            "reason": f"Owns a plot in {town['name']}", "source": "plot"})
            n += 1
    if n:
        members = pb.count("agent_memberships", f"tenant_id={q(tenant_id)} && target_type='subpal' && target_id={q(town['subpal_id'])}")
        watchers = pb.count("follows", f"tenant_id={q(tenant_id)} && target_type='community' && target_id={q(town['slug'])}")
        pb.update("communities", town["subpal_id"], {"member_agent_count": members, "watcher_count": watchers})
    return n


# ---------------------------------------------------------------------------------------------- consumers and the relay

def _withdrawn_target(ev) -> str:
    return json.loads(ev["refs"]).get("event", "")


def feed_consumer(con, pb, tenant_id):
    def consume(ev):
        if ev["kind"] == "event_withdrawn":
            apply_once(con, "feed", ev["id"], lambda: take_back(con, pb, tenant_id, _withdrawn_target(ev), ev["text"].removeprefix("Withdrawn: ")))
        else:
            apply_once(con, "feed", ev["id"], lambda: publish(con, pb, tenant_id, ev))
    return consume


def notifications_consumer(con, pb, tenant_id):
    def consume(ev):
        if ev["kind"] == "event_withdrawn":
            apply_once(con, "notifications", ev["id"], lambda: unnotify(pb, tenant_id, _withdrawn_target(ev)))
        else:
            apply_once(con, "notifications", ev["id"], lambda: notify(con, pb, tenant_id, ev))
    return consume


def world_consumer(con, pb, tenant_id):
    """Live updates. Only public events go on the public stream; town-only live updates come with the world viewer (phase 6)."""
    def consume(ev):
        def run():
            if ev["visibility"] != "public":
                return
            if ev["kind"] == "event_withdrawn":
                stream(con, pb, tenant_id, ev, "town_event_withdrawn", {"event_id": _withdrawn_target(ev), "town": town_of(con, ev)})
            elif not ev["withdrawn"]:
                stream(con, pb, tenant_id, ev)
        apply_once(con, "world", ev["id"], run)
    return consume


def profile_consumer(con, pb, tenant_id):
    def consume(ev):
        apply_once(con, "profile", ev["id"], lambda: join_places(con, pb, tenant_id, ev))
    return consume


def consumers(con, pb, tenant_id) -> dict:
    return {"records": events.records_consumer(con), "report": events.report_consumer(con), "feed": feed_consumer(con, pb, tenant_id),
            "notifications": notifications_consumer(con, pb, tenant_id), "world": world_consumer(con, pb, tenant_id),
            "profile": profile_consumer(con, pb, tenant_id)}


def relay(con: sqlite3.Connection, pb, tenant_id: str, limit: int = 500) -> dict:
    """One relay pass over every view. Safe to run again at any time: nothing is shown twice."""
    with db.tx(con):
        ensure_town(con, pb, tenant_id, town_of(con, {"town": ""}))
    return events.relay_once(con, consumers(con, pb, tenant_id), limit)


# ---------------------------------------------------------------------------------------------- live record (read side)

def record(con: sqlite3.Connection, event_id: str) -> dict | None:
    """An event with the live numbers of what it links to, read now from economy.db (never copied into PocketBase)."""
    ev = con.execute("SELECT * FROM world_events WHERE id=?", (event_id,)).fetchone()
    if ev is None:
        return None
    refs = json.loads(ev["refs"])
    out = {"id": ev["id"], "kind": ev["kind"], "visibility": ev["visibility"], "tick": ev["tick"], "town": town_of(con, ev), "who": json.loads(ev["who"]),
           "text": display_text(con, ev), "withdrawn": bool(ev["withdrawn"]), "withdrawn_reason": ev["withdrawn_reason"], "links": {}}
    bid = refs.get("business")
    if bid:
        b = con.execute("SELECT * FROM businesses WHERE id=?", (bid,)).fetchone()
        if b is not None:
            out["links"]["business"] = {"id": b["id"], "type": b["type"], "plot": b["plot"], "status": b["status"], "health": b["health"], "level": b["level"],
                                        "price_sora": b["price"] / C, "wage_sora": b["wage"] / C}
    cid = refs.get("contract")
    if cid:
        k = con.execute("SELECT * FROM contracts WHERE id=?", (cid,)).fetchone()
        if k is not None:
            out["links"]["contract"] = {"id": k["id"], "good": k["good"], "qty_per_day": k["qty_per_day"], "price_sora": k["price"] / C,
                                        "status": k["status"], "delivered": k["delivered"], "breaches": k["breaches"]}
    if refs.get("week"):
        v = con.execute("SELECT week, winner FROM votes WHERE week=?", (refs["week"],)).fetchone()
        if v is not None:
            out["links"]["vote"] = {"week": v["week"], "winner": v["winner"]}
    return out
