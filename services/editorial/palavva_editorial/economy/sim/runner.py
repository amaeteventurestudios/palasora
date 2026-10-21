"""Run one scenario for one seed: a fresh in-memory economy.db, genesis, then hourly ticks as fast as they go."""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

from .. import db, issuance
from ..town import ai, checks, genesis, reports
from ..town.params import C, Params, tuned
from ..town.tick import run_tick
from ..town.world import World
from . import metrics as M, scenarios


def run(scenario: str, seed: int, days: int = 30, *, mode: str = "rules", params: Params | None = None, planner=None, keep_db: str | None = None) -> dict:
    p = params or tuned()
    con = db.connect(keep_db or ":memory:")
    con.execute("PRAGMA synchronous=OFF")
    db.init(con)
    if mode in ("recorded", "live") and planner is None:
        planner = ai.RecordedPlanner()
    scn = scenarios.make(scenario, days)
    w = World(con, p, seed, mode=mode, scenario=scn, planner=planner)
    w.metrics = M.Metrics()
    chk = checks.Checker(con)
    started = time.perf_counter()
    failure = None
    with db.clock(lambda: w.ts()):
        con.execute("BEGIN IMMEDIATE")
        genesis.genesis(w)
        con.execute("COMMIT")
    try:
        while w.tick < days * 24:
            run_tick(w, chk)
    except checks.ConservationError as e:
        failure = {"tick": e.tick, "problems": e.problems[:20]}
    elapsed = time.perf_counter() - started
    with db.clock(lambda: w.ts()):
        full = chk.full()
        fp = checks.fingerprint(con)
        summary = summarise(w, scenario, seed, days, mode, elapsed, full, fp, failure, chk)
    summary["_world"] = w
    return summary


def summarise(w: World, scenario: str, seed: int, days: int, mode: str, elapsed: float, full: dict, fp: str, failure, chk) -> dict:
    con, p = w.con, w.p
    ds = w.metrics.days
    prog = M.player_progress(w)
    mis = w.metrics.mis
    ai_calls = w.metrics.ai
    biz = []
    for b in w.biz.values():
        prof = [x["profit"] for x in b.history]
        biz.append({"id": b.id, "type": b.type, "owner": b.owner, "owner_kind": w.agents[b.owner].kind, "mode": b.mode, "status": b.status, "cost": b.cost,
                    "opened_day": b.opened_tick // 24, "closed_day": None if b.closed_tick is None else b.closed_tick // 24,
                    "days": len(prof), "profit_total": sum(prof), "profit_median": M._median(prof) if prof else 0, "price": b.price,
                    "workers": len(b.workers), "level": b.level, "beside_curve": b.beside_curve})
    sitter = {}
    if scenario == "sitter":
        s, r = w.agents.get("s001"), w.agents.get("s002")
        if s and r:
            rb = [w.biz[x] for x in r.businesses]
            per_day = [x["profit"] for b in rb for x in b.history]
            sitter = {"sitter_earned_per_day": 0.0, "sitter_interest_rate": p.savings_interest,
                      "runner_business_profit_per_day": (sum(per_day) / max(1, len({x['day'] for b in rb for x in b.history}))) if per_day else 0.0,
                      "sitter_balance": w.bal(s.acct), "runner_balance": w.bal(r.acct)}
    rep = reports.verify(con)
    out = {
        "scenario": scenario, "seed": seed, "days": days, "mode": mode, "elapsed_sec": round(elapsed, 2),
        "days_per_minute": round(days / elapsed * 60, 1) if elapsed else None,
        "fingerprint": fp, "conservation": {"ticks_checked": chk.ticks, "failure": failure, "final": full},
        "params": {k: v for k, v in p.as_dict().items()},
        "series": ds,
        "growth_windows": M.growth_windows(ds), "weeks_above_band": M.weeks_above(ds, p.growth_band),
        "paybacks": M.paybacks(w), "paybacks_beside": M.paybacks(w, beside=True), "profitable_windows": M.profitable_windows(w), "meal_price": M.meal_price_dev(ds),
        "closures": M.closures_and_recovery(w), "players": prog,
        "out_of_stock": {"hours": sum(d.get("out_hours", 0) for d in ds), "biz_hours": sum(d.get("biz_hours", 0) for d in ds)},
        "mischief": {"attempts": len(mis), "refused": sum(1 for m in mis if not m["ok"]), "codes": sorted({m["code"] for m in mis if not m["ok"]}),
                     "accepted": [m for m in mis if m["ok"]]},
        "refusals": dict(w.metrics.refusals),
        "ai": {"calls": len(ai_calls), "fallbacks": sum(1 for c in ai_calls if c["fallback"]) + w.ai_missing, "missing": w.ai_missing,
               "tokens_in": sum(c["tokens_in"] or 0 for c in ai_calls), "tokens_out": sum(c["tokens_out"] or 0 for c in ai_calls),
               "cost_usd": sum(c["cost_usd"] or 0 for c in ai_calls)},
        "reports": rep, "businesses": biz, "histories": {b.id: [(x["day"], x["profit"]) for x in b.history] for b in w.biz.values()},
        "ai_source": getattr(w.planner, "meta", {}).get("provider", "") if w.planner is not None else "",
        "active_players": sum(1 for a in w.agents.values() if a.is_player and a.role not in ("sitter", "mischief")), "sitter": sitter, "stuck": M.stuck_agents(w),
        "violations": con.execute("SELECT COUNT(*) n FROM violations").fetchone()["n"],
        "event_log": [dict(r) for r in con.execute("SELECT seq, tick, kind, visibility, text FROM world_events ORDER BY seq DESC LIMIT 400")][::-1],
        "event_kinds": {r["kind"]: r["n"] for r in con.execute("SELECT kind, COUNT(*) n FROM world_events GROUP BY kind")},
        "events": con.execute("SELECT COUNT(*) n FROM world_events").fetchone()["n"],
        "outbox_rows": con.execute("SELECT COUNT(*) n FROM outbox").fetchone()["n"],
        "civic_shortfall_days": w.flags["civic_shortfall_days"],
        "thermostat": [dict(r) for r in con.execute("SELECT * FROM growth_weeks ORDER BY week")],
        "budgets": [dict(r) for r in con.execute("SELECT * FROM issuance_budgets ORDER BY week")],
    }
    return out


def strip(summary: dict) -> dict:
    return {k: v for k, v in summary.items() if not k.startswith("_")}


def save(summary: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(strip(summary), default=_json, sort_keys=True))


def _json(o):
    if isinstance(o, float) and math.isinf(o):
        return "inf"
    if isinstance(o, tuple):
        return list(o)
    return str(o)


_ = (C, issuance)
