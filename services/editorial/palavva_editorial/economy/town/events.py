"""One event, many views (Doc 06 section 13): world events, the outbox and the relay.

* Written once: `emit()` writes the event and one outbox row per view in the caller's transaction, so an event exists
  exactly when the change it records exists. Event ids are deterministic (`ev-<seq>`), so a seeded run repeats them.
* Delivered at least once: `relay_once()` reads pending outbox rows in event order and hands each to its view's
  consumer, retrying with backoff; after MAX_ATTEMPTS it moves the row to the held list (nothing is lost or posted twice).
* Applied once: every consumer goes through `apply_once()`, which stores (consumer, event id) and ignores repeats.
* Permissions: each event carries a visibility; a view only receives what its visibility allows (owner-only detail
  never reaches the public feed).
* Never sends anything during tests: the simulation writes outbox rows but does not run the relay.

Phase 3 has consumers for the `records` and `report` views (both in economy.db). The `world`, `profile`, `feed` and
`notifications` views get their outbox rows now and their consumers in phases 4 and 6, so nothing written today is lost.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Callable

from .. import db

VIEWS = ("world", "records", "profile", "feed", "notifications", "report")
# which views may receive an event of each visibility
ALLOWED = {
    "public": VIEWS,
    "town": ("world", "records", "profile", "notifications", "report"),
    "owner": ("records", "notifications", "report"),
    "staff": ("records",),
}
MAX_ATTEMPTS = 5
BACKOFF_SEC = (5, 30, 120, 600, 1800)


def emit(con: sqlite3.Connection, *, seq: int, tick: int, kind: str, who: list[str], visibility: str, refs: dict, text: str) -> str:
    if visibility not in ALLOWED:
        raise ValueError(f"bad visibility {visibility}")
    eid = f"ev-{seq:08d}"
    con.execute("INSERT INTO world_events(id, seq, tick, kind, who, visibility, refs, text) VALUES (?,?,?,?,?,?,?,?)",
                (eid, seq, tick, kind, json.dumps(sorted(set(who))), visibility, json.dumps(refs, sort_keys=True), text[:400]))
    con.executemany("INSERT INTO outbox(event_id, destination, status) VALUES (?,?,'pending')", [(eid, v) for v in ALLOWED[visibility]])
    return eid


def apply_once(con: sqlite3.Connection, consumer: str, event_id: str, fn: Callable[[], None]) -> bool:
    """Run `fn` once per (consumer, event). Returns False for a repeat (ignored)."""
    if con.execute("SELECT 1 FROM event_receipts WHERE consumer=? AND event_id=?", (consumer, event_id)).fetchone():
        return False
    fn()
    con.execute("INSERT INTO event_receipts(consumer, event_id, applied_at) VALUES (?,?,?)", (consumer, event_id, db.now()))
    return True


def relay_once(con: sqlite3.Connection, consumers: dict[str, Callable[[sqlite3.Row], None]], limit: int = 500) -> dict:
    """Deliver pending outbox rows whose view has a consumer. A consumer that raises is retried with backoff and held
    after MAX_ATTEMPTS. Each delivery commits on its own, so a crash repeats at most one delivery (ignored by apply_once)."""
    now = db.now()
    dests = tuple(consumers)
    if not dests:
        return {"delivered": 0, "failed": 0, "held": 0}
    rows = con.execute(f"""SELECT o.*, e.seq FROM outbox o JOIN world_events e ON e.id=o.event_id WHERE o.status='pending' AND o.next_try <= ?
                           AND o.destination IN ({",".join("?" * len(dests))}) ORDER BY e.seq, o.destination LIMIT ?""", (now, *dests, limit)).fetchall()
    out = {"delivered": 0, "failed": 0, "held": 0}
    for r in rows:
        ev = con.execute("SELECT * FROM world_events WHERE id=?", (r["event_id"],)).fetchone()
        try:
            with db.tx(con):
                consumers[r["destination"]](ev)
                con.execute("UPDATE outbox SET status='delivered', attempts=attempts+1, delivered_at=? WHERE event_id=? AND destination=?",
                            (now, r["event_id"], r["destination"]))
            out["delivered"] += 1
        except Exception as e:  # noqa: BLE001 - any consumer failure is retried, never lost
            att = r["attempts"] + 1
            held = att >= MAX_ATTEMPTS
            with db.tx(con):
                con.execute("UPDATE outbox SET attempts=?, next_try=?, status=?, last_error=? WHERE event_id=? AND destination=?",
                            (att, now + BACKOFF_SEC[min(att, len(BACKOFF_SEC)) - 1], "held" if held else "pending", str(e)[:300], r["event_id"], r["destination"]))
            out["held" if held else "failed"] += 1
    return out


def records_consumer(con: sqlite3.Connection) -> Callable[[sqlite3.Row], None]:
    """The Phase 3 `records` view: the event is stored once against each record it links (business, contract, agent)."""
    def consume(ev: sqlite3.Row) -> None:
        apply_once(con, "records", ev["id"], lambda: None)
    return consume


def report_consumer(con: sqlite3.Connection) -> Callable[[sqlite3.Row], None]:
    """The Phase 3 `report` view: morning messages read world_events directly; the receipt marks the event as seen."""
    def consume(ev: sqlite3.Row) -> None:
        apply_once(con, "report", ev["id"], lambda: None)
    return consume
