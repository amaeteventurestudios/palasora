"""Palasora Phase 8: the town runs on its own (Doc 06 section 19, Doc 05 Gate E).

The live service runs the same hourly tick as the headless simulation, one town in memory, on the real clock: one game
day is one real day (Doc 04 section 1), so the town's hour follows the real hour in the town's time zone. The worker calls
`advance()` every few seconds; it runs every hour that is due (at most `MAX_CATCH_UP` per call, so a long outage catches
up in steps), and each tick commits together with a snapshot of the in-memory world (agents, businesses, random-number
states, the conservation checker), so a restart carries on exactly where it stopped. Restoring and ticking gives the same
ledger fingerprint as running straight through (Gate E, tests/test_phase8_live.py).

Nothing here starts on its own: the town must be founded once (`found`, from the command line below) and the worker only
ticks when TOWN_LIVE_ENABLED=true. A failed conservation check pauses the town instead of retrying; `resume` clears it.

    python -m palavva_editorial.economy.town.live status
    python -m palavva_editorial.economy.town.live found --seed 1      # once, on a ledger already in Sora
    python -m palavva_editorial.economy.town.live pause | resume
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .. import db
from ..sim.metrics import Metrics
from . import auctions, checks, genesis
from .params import tuned
from .tick import run_tick
from .world import World

MAX_CATCH_UP = 48        # ticks per advance() call
KEEP_SNAPSHOTS = 48      # the last two days of snapshots stay for inspection
_cache: dict = {}        # path -> (tick, world, checker): the worker keeps the town in memory between calls


class LiveError(RuntimeError):
    pass


def _state(con: sqlite3.Connection, key: str, default=None):
    r = con.execute("SELECT value FROM town_state WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def _set(con: sqlite3.Connection, key: str, value) -> None:
    con.execute("INSERT INTO town_state(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value)))


def tz() -> ZoneInfo:
    return ZoneInfo(os.environ.get("TOWN_TIMEZONE", "Africa/Lagos"))


def enabled() -> bool:
    return os.environ.get("TOWN_LIVE_ENABLED", "false").lower() == "true"


# ---------------------------------------------------------------------------------------------------------------- snapshots
def _pack(w: World, checker, tick: int) -> bytes:
    d = {k: v for k, v in w.__dict__.items() if k not in ("con", "planner", "_acct", "_today_events")}
    d["tick"] = tick
    if w.metrics is not None:  # the thermostat reads the last week; keep a month
        w.metrics.days = w.metrics.days[-30:]
        w.metrics.mis, w.metrics.ai = w.metrics.mis[-200:], w.metrics.ai[-200:]
    c = {k: v for k, v in checker.__dict__.items() if k != "con"}
    return pickle.dumps({"world": d, "checker": c, "version": 1}, protocol=pickle.HIGHEST_PROTOCOL)


class Stale(RuntimeError):
    """Another process ran this hour first; the tick is rolled back and the newer snapshot is read instead."""


def _save(w: World, checker, founding: bool = False) -> None:
    tick = w.tick + 1  # run_tick moves the clock on after the commit; the snapshot is of the world after this hour
    if not founding and _state(w.con, "live_tick", 0) != w.tick:
        raise Stale(w.tick)
    w.con.execute("INSERT OR REPLACE INTO town_snapshots(tick, data, created_at) VALUES (?,?,?)", (tick, _pack(w, checker, tick), time.time()))
    w.con.execute("DELETE FROM town_snapshots WHERE tick <= ?", (tick - KEEP_SNAPSHOTS,))
    _set(w.con, "live_tick", tick)


def restore(con: sqlite3.Connection, planner=None) -> tuple[World, checks.Checker]:
    r = con.execute("SELECT data FROM town_snapshots ORDER BY tick DESC LIMIT 1").fetchone()
    if r is None:
        raise LiveError("the town has not been founded")
    snap = pickle.loads(r["data"])
    w = World.__new__(World)
    w.__dict__.update(snap["world"])
    w.con, w._acct, w._today_events = con, {}, None
    w.planner = planner if planner is not None else _planner(w.mode)
    auctions.load(w)
    chk = checks.Checker(con)
    chk.__dict__.update(snap["checker"])
    chk.con = con
    return w, chk


def _planner(mode: str):
    if mode == "rules":
        return None
    from . import ai
    if mode == "recorded":
        return ai.RecordedPlanner()
    raise LiveError(f"agent mode '{mode}' needs a planner passed in")


# ---------------------------------------------------------------------------------------------------------------- the clock
def _midnight(now: float) -> float:
    d = datetime.fromtimestamp(now, tz()).replace(hour=0, minute=0, second=0, microsecond=0)
    return d.timestamp()


def due_tick(con: sqlite3.Connection, now: float | None = None) -> int:
    """The tick the town should have reached: one tick per real hour since the founding day's midnight (town time)."""
    clock = _state(con, "live_clock")
    if clock is None:
        return 0
    now = time.time() if now is None else now
    return max(0, int((now - clock["anchor"]) // clock["seconds_per_hour"]) + 1)


def found(con: sqlite3.Connection, seed: int, *, now: float | None = None, scenario=None, params=None, seconds_per_hour: int = 3600) -> dict:
    """Day 0 on this ledger: the plots, the house agents and their starting coins (genesis), once. The clock is set so the
    town's hours follow real hours from today's midnight; the hours already past today run on the next advance()."""
    if con.execute("SELECT 1 FROM town_snapshots LIMIT 1").fetchone() or _state(con, "live_clock"):
        raise LiveError("the town is already founded")
    if con.execute("SELECT 1 FROM plots LIMIT 1").fetchone():
        raise LiveError("plots already exist on this ledger (a test or headless town): found on a clean ledger")
    if db.currency_state(con) != "sora":
        raise LiveError("the ledger still holds Pals: run the Sora migration first")
    now = time.time() if now is None else now
    w = World(con, params or tuned(), seed, mode="rules", scenario=scenario)
    w.metrics = Metrics()  # the day's books and the Sunday thermostat read it, as in the headless run
    chk = checks.Checker(con)
    with db.clock(lambda: w.ts()):
        con.execute("BEGIN IMMEDIATE")
        try:
            genesis.genesis(w)
            _set(con, "live_clock", {"anchor": _midnight(now), "seconds_per_hour": seconds_per_hour, "seed": seed, "founded_at": now})
            w.tick = -1  # the snapshot is of tick 0, before the first hour runs
            _save(w, chk, founding=True)
            w.tick = 0
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    _cache.pop(_key(con), None)
    return status(con, now)


def _key(con: sqlite3.Connection) -> str:
    return con.execute("PRAGMA database_list").fetchone()["file"] or f"memory:{id(con)}"


def advance(con: sqlite3.Connection, now: float | None = None, limit: int = MAX_CATCH_UP) -> dict:
    """Run every hour that is due (up to `limit`). Safe to call from several processes: the tick's own BEGIN IMMEDIATE
    serialises them, and a tick that is already saved by someone else is never run twice."""
    if _state(con, "live_clock") is None:
        return {"ran": 0, "reason": "not founded"}
    if _state(con, "live_paused"):
        return {"ran": 0, "reason": "paused", "paused": _state(con, "live_paused")}
    target = due_tick(con, now)
    ran = 0
    while ran < limit:
        saved = _state(con, "live_tick", 0)
        if saved >= target:
            break
        k = _key(con)
        hit = _cache.get(k)
        if hit and hit[0] == saved:
            w, chk = hit[1], hit[2]
        else:
            w, chk = restore(con)
        try:
            run_tick(w, chk, before_commit=lambda: _save(w, chk))
        except checks.ConservationError as e:
            with db.tx(con):
                _set(con, "live_paused", {"reason": "conservation", "tick": e.tick, "problems": e.problems[:10], "at": time.time()})
            _cache.pop(k, None)
            return {"ran": ran, "reason": "paused", "paused": _state(con, "live_paused")}
        except Stale:  # another process saved this hour first: read its snapshot next time round
            _cache.pop(k, None)
            continue
        _cache[k] = (w.tick, w, chk)
        ran += 1
    return {"ran": ran, "tick": _state(con, "live_tick", 0), "due": target}


def pause(con: sqlite3.Connection, reason: str = "paused by staff") -> None:
    with db.tx(con):
        _set(con, "live_paused", {"reason": reason, "at": time.time()})


def resume(con: sqlite3.Connection) -> None:
    with db.tx(con):
        con.execute("DELETE FROM town_state WHERE key='live_paused'")
    _cache.pop(_key(con), None)


def status(con: sqlite3.Connection, now: float | None = None) -> dict:
    clock = _state(con, "live_clock")
    if clock is None:
        return {"founded": False, "enabled": enabled()}
    tick, due = _state(con, "live_tick", 0), due_tick(con, now)
    when = datetime.fromtimestamp(clock["anchor"], tz()) + timedelta(seconds=tick * clock["seconds_per_hour"])
    return {"founded": True, "enabled": enabled(), "tick": tick, "day": tick // 24, "hour": tick % 24, "due": due, "behind": max(0, due - tick),
            "paused": _state(con, "live_paused"), "seed": clock["seed"], "timezone": str(tz()), "town_time": when.isoformat(),
            "snapshots": con.execute("SELECT COUNT(*) n FROM town_snapshots").fetchone()["n"]}


def main(argv: list[str] | None = None) -> int:
    from .. import service
    ap = argparse.ArgumentParser(prog="python -m palavva_editorial.economy.town.live")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("found")
    f.add_argument("--seed", type=int, required=True)
    sub.add_parser("status")
    sub.add_parser("advance")
    sub.add_parser("pause")
    sub.add_parser("resume")
    a = ap.parse_args(argv)
    con = service.con()
    out = {"found": lambda: found(con, a.seed), "status": lambda: status(con), "advance": lambda: advance(con),
           "pause": lambda: (pause(con), status(con))[1], "resume": lambda: (resume(con), status(con))[1]}[a.cmd]()
    print(json.dumps(out, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
