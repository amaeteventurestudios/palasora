"""Gates A to D (Doc 05 section 8): run the scenarios on every seed and say pass or fail per gate, with the numbers.

Gate A runs rules-only agents on the eight core scenarios; every run is also re-run once to compare fingerprints.
Gate B runs every scenario with the recorded planner and compares AI-planned businesses with rules-only ones.
Gate C checks every morning message of every run. Gate D estimates AI cost per active player from the recorded token
counts (the live sample needs an OpenRouter key; when there is none the gate says so instead of passing).
The gates never change to make a run pass: Doc 05 section 9 step 4 tunes Document 04's numbers instead.
"""
from __future__ import annotations

import math
import os
from concurrent.futures import ProcessPoolExecutor
from statistics import median

from ..town import ai
from ..town.params import tuned
from . import runner, scenarios

SEEDS = tuple(range(1, 11))


# ---------------------------------------------------------------------------------------------------------------- runs
def _one(job: tuple) -> dict:
    scenario, seed, days, mode, recheck = job
    s = runner.strip(runner.run(scenario, seed, days, mode=mode))
    if recheck:
        again = runner.run(scenario, seed, days, mode=mode)
        s["fingerprint_again"] = again["fingerprint"]
    return s


def run_many(jobs: list[tuple], workers: int | None = None) -> list[dict]:
    workers = workers or max(1, min(len(jobs), (os.cpu_count() or 2)))
    if workers == 1:
        return [_one(j) for j in jobs]
    with ProcessPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(_one, jobs))


# ---------------------------------------------------------------------------------------------------------- Gate A
def check_run(s: dict) -> dict:
    """Every Gate A check on one run. Each value is (ok, number shown in the report)."""
    p = s["params"]
    band = tuple(p["growth_band"])
    out: dict[str, tuple] = {}
    c = s["conservation"]
    out["conservation"] = (c["failure"] is None and c["final"]["ok"], f"{c['ticks_checked']} ticks")
    if "fingerprint_again" in s:
        out["determinism"] = (s["fingerprint"] == s["fingerprint_again"], s["fingerprint"][:12])
    if s["scenario"] == "cheater":
        m = s["mischief"]
        out["cheater_refused"] = (m["attempts"] > 0 and not m["accepted"], f"{m['refused']}/{m['attempts']} refused")
    gw = s["growth_windows"]
    out["growth_band"] = (bool(gw) and all(band[0] <= g["growth"] <= band[1] for g in gw), ", ".join(f"{g['growth']:+.1%}" for g in gw) or "no window")
    out["thermostat"] = (s["weeks_above_band"] < 2, f"{s['weeks_above_band']} weeks above in a row")
    pb_ok, pb_txt = True, []
    for t, v in s["paybacks"].items():
        if v is None:
            pb_txt.append(f"{t} n/a")
            continue
        lo, hi = v["bounds"]
        ok = lo <= v["payback"] <= hi
        pb_ok &= ok
        pb_txt.append(f"{t} {v['payback']:.1f}d [{lo:g}-{hi:g}]")
    bs = [f"{t} {v['payback']:.1f}d ({v['businesses']})" for t, v in s.get("paybacks_beside", {}).items() if v]
    out["payback_lanes"] = (pb_ok, "; ".join(pb_txt) + (f"; beside the curve: {', '.join(bs)}" if bs else ""))
    out["playing_beats_sitting"] = _sitting(s)
    devs = [abs(d["dev"]) for d in s["meal_price"] if d["day"] >= 7]
    out["meal_price"] = (all(x <= 0.25 for x in devs), f"max {max(devs, default=0):.0%} off its 7-day average")
    shares = [w["share"] for w in s["profitable_windows"]]
    out["profitable_share"] = (bool(shares) and all(0.5 <= x <= 0.8 for x in shares),
                               f"{min(shares, default=0):.0%} to {max(shares, default=0):.0%} profitable")
    cl = s["closures"]
    out["closure_recovery"] = (cl["closed"] >= 1 and cl["recovered"] >= 1, f"{cl['closed']} closed, {cl['recovered']} recovered")
    pl = s["players"]
    fb = [x for x in pl["first_business_days"]]
    med_fb = median(fb) if fb else math.inf
    out["first_business"] = (5 <= med_fb <= 10, f"median {med_fb:g} days ({len(fb)} players)")
    fj = pl["first_job_days"]
    out["first_job"] = (bool(fj) and max(fj) <= 1, f"max {max(fj, default=math.inf):g} days")
    oos = s["out_of_stock"]
    share = oos["hours"] / oos["biz_hours"] if oos["biz_hours"] else 0.0
    out["out_of_stock"] = (share < 0.05, f"{share:.1%} of business-hours")
    return out


def _sitting(s: dict) -> tuple:
    """Rule 3: holding money earns less a day than the median business with the same money. Savings interest is 0 in
    v0.1 and there is no rent, so the holder earns nothing; the business side is the median daily profit per Sora of
    build cost, scaled to the same money."""
    profits = [b["profit_median"] for b in s["businesses"] if b["days"] >= 7]
    biz_rate = median([b["profit_median"] / b["cost"] for b in s["businesses"] if b["days"] >= 7]) if profits else 0.0
    hold_rate = s["params"]["savings_interest"] / 365
    if s.get("sitter"):
        st = s["sitter"]
        same_money = biz_rate * 2000 * 100  # the median business's daily profit per Sora of cost, on the sitter's 2,000 Sora
        ok = st["sitter_earned_per_day"] < same_money and hold_rate < biz_rate
        return ok, (f"sitter {st['sitter_earned_per_day'] / 100:.2f}/day vs median business on the same money {same_money / 100:.2f}/day "
                    f"(the scenario's runner: {st['runner_business_profit_per_day'] / 100:.2f}/day)")
    return hold_rate < biz_rate, f"holding {hold_rate:.2%}/day vs median business {biz_rate:.2%}/day of its cost"


def _windfall(s: dict, base: dict | None) -> tuple:
    """Price shock (materials +50%, days 10 to 16): no income already owned rises in value by more than the shock. For
    each trade, the daily profit of the businesses that stood before day 10 is set against the same trade in the
    Baseline run of the same seed (same town, no shock). Build costs are fixed numbers and do not move at all."""
    if base is None:
        return False, "no Baseline run of the same seed to compare with"
    def per_day(run: dict, btype: str) -> tuple[float, float]:
        tot, n, cost = 0, 0, 0
        for b in run["businesses"]:
            if b["type"] != btype or b["opened_day"] >= 10:
                continue
            xs = [x for d, x in run["histories"].get(b["id"], []) if 10 <= d <= 16]
            tot += sum(xs)
            n += len(xs)
            cost += b["cost"] if xs else 0
        return (tot / 7, cost)
    worst, who = 0.0, ""
    for t in ("stall", "farm", "workshop", "delivery"):
        mine, cost_m = per_day(s, t)
        theirs, cost_b = per_day(base, t)
        ref = max(abs(theirs), max(cost_m, cost_b) / 10)  # a tenth of the trade's cost a day: tiny baselines do not turn noise into percentages
        if ref <= 0:
            continue
        rise = (mine - theirs) / ref
        if rise > worst:
            worst, who = rise, t
    return worst <= 0.5, f"largest rise against the Baseline {worst:+.0%}{' (' + who + ')' if who else ''} (shock +50%)"


def gate_a(runs: list[dict], long_run: dict | None) -> dict:
    per = {}
    base = {s["seed"]: s for s in runs if s["scenario"] == "baseline"}
    for s in runs:
        per[(s["scenario"], s["seed"])] = check_run(s)
        if s["scenario"] == "price_shock":
            per[(s["scenario"], s["seed"])]["no_windfall"] = _windfall(s, base.get(s["seed"]))
    names = sorted({k for v in per.values() for k in v})
    summary = {}
    for n in names:
        res = [(k, v[n]) for k, v in per.items() if n in v]
        fails = [(k, v) for k, v in res if not v[0]]
        summary[n] = {"ok": not fails, "runs": len(res), "failed": len(fails),
                      "examples": [f"{k[0]} seed {k[1]}: {v[1]}" for k, v in fails[:4]] or [f"{res[0][0][0]} seed {res[0][0][1]}: {res[0][1][1]}"] if res else []}
    if long_run is not None:
        band = tuple(long_run["params"]["growth_band"])
        gw = long_run["growth_windows"]
        ok = bool(gw) and all(band[0] <= g["growth"] <= band[1] for g in gw)
        summary["growth_180_days"] = {"ok": ok, "runs": 1, "failed": 0 if ok else 1,
                                      "examples": [", ".join(f"d{g['from']}-{g['to']} {g['growth']:+.1%}" for g in gw)]}
    return {"ok": all(v["ok"] for v in summary.values()), "checks": summary, "per_run": {f"{k[0]}:{k[1]}": {n: list(v) for n, v in d.items()} for k, d in per.items()}}


# ---------------------------------------------------------------------------------------------------------- Gate B
def gate_b(rec_runs: list[dict], rules_runs: list[dict] | None = None) -> dict:
    """AI-planned (recorded) businesses against rules-only ones in the same runs (every second house business and every
    player's business is AI-planned in an AI run): profit a day, recovery time after a closure, closure rate. Plus: no
    agent stuck losing for 3 days without changing anything."""
    def stats(runs, ai_planned: bool):
        prof, closed, n, rec = [], 0, 0, []
        for s in runs:
            mine = set()
            for b in s["businesses"]:
                if (b["mode"] in ("recorded", "live")) != ai_planned or b["days"] < 3:
                    continue
                mine.add(b["id"])
                n += 1
                prof.append(b["profit_total"] / b["days"])
                closed += b["status"] == "closed"
            for r in s["closures"]["detail"]:
                if r["business"] in mine and r["recovery_days"] is not None:
                    rec.append(r["recovery_days"])
        return {"businesses": n, "profit_per_day": (sum(prof) / len(prof) / 100) if prof else 0.0,
                "closure_rate": closed / n if n else 0.0, "recovery_days": median(rec) if rec else None}
    ai_s = stats(rec_runs, True)
    rules_s = stats(rec_runs, False)
    stuck = sum(len(s["stuck"]) for s in rec_runs)
    calls = sum(s["ai"]["calls"] for s in rec_runs)
    fb = sum(s["ai"]["fallbacks"] for s in rec_runs)
    beats = ai_s["profit_per_day"] > rules_s["profit_per_day"]
    rec_ok = ai_s["recovery_days"] is None or rules_s["recovery_days"] is None or ai_s["recovery_days"] <= rules_s["recovery_days"]
    closure_ok = ai_s["closure_rate"] <= rules_s["closure_rate"] + 1e-9
    source = {s.get("ai_source", "") for s in rec_runs} - {""}
    checks = {
        "ai_beats_rules_profit": {"ok": beats, "examples": [f"AI {ai_s['profit_per_day']:.2f}/day vs rules {rules_s['profit_per_day']:.2f}/day "
                                                            f"({ai_s['businesses']} vs {rules_s['businesses']} businesses)"]},
        "ai_recovery_not_worse": {"ok": rec_ok, "examples": [f"AI {ai_s['recovery_days']} vs rules {rules_s['recovery_days']} days"]},
        "ai_closure_not_worse": {"ok": closure_ok, "examples": [f"AI {ai_s['closure_rate']:.1%} vs rules {rules_s['closure_rate']:.1%}"]},
        "no_stuck_agents": {"ok": stuck == 0, "examples": [f"{stuck} stuck across {len(rec_runs)} runs"]},
        "recordings_cover_prompts": {"ok": calls > 0 and fb == 0, "examples": [f"{calls} plans, {fb} fell back to rules"]},
    }
    return {"ok": all(v["ok"] for v in checks.values()), "checks": checks, "ai": ai_s, "rules": rules_s,
            "planner_source": sorted(source) or ["fixture"],
            "note": "Recorded answers come from the deterministic fixture planner (no OpenRouter key in this environment); "
                    "the parity test is tests/test_phase3_town.py::test_parity_human_and_agent."}


# ---------------------------------------------------------------------------------------------------------- Gate C
def gate_c(runs: list[dict]) -> dict:
    linked = all(s["reports"]["share_linked"] == 1.0 for s in runs if s["reports"]["stories"])
    most = [s["reports"].get("share_with_event", 0.0) for s in runs if s["reports"]["messages"]]
    stories = sum(s["reports"]["stories"] for s in runs)
    msgs = sum(s["reports"]["messages"] for s in runs)
    padded = sum(s["reports"].get("padded", 0) for s in runs)
    checks = {
        "stories_link_records": {"ok": linked, "examples": [f"{stories} stories in {msgs} morning messages, every one checked against the journal and events"]},
        "real_event_most_mornings": {"ok": bool(most) and min(most) > 0.5,
                                     "examples": [f"lowest run {min(most, default=0):.0%} of mornings with a real event"]},
        "quiet_not_padded": {"ok": padded == 0, "examples": [f"{padded} padded quiet mornings"]},
    }
    return {"ok": all(v["ok"] for v in checks.values()), "checks": checks}


# ---------------------------------------------------------------------------------------------------------- Gate D
def gate_d(rec_runs: list[dict], budget_usd_month: float = 1.0, model: str = ai.DEFAULT_MODEL, live: dict | None = None) -> dict:
    """Cost per active player a month. Estimated from recorded token counts at the assumed list price for the default
    model, scaled to 30 days. The live sample (real provider-reported cost) is required to pass; without a key it is
    reported as blocked."""
    per_player = []
    for s in rec_runs:
        players = max(1, s.get("active_players", 0))
        usd = ai.estimate_usd(s["ai"]["tokens_in"], s["ai"]["tokens_out"], model)
        per_player.append(usd / players * 30 / max(1, s["days"]))
    est = max(per_player, default=0.0)
    checks = {"estimate_under_budget": {"ok": est < budget_usd_month,
                                        "examples": [f"up to ${est:.3f} a player a month at {model} list price (assumed), budget ${budget_usd_month:.2f}"]}}
    if live is None:
        checks["live_sample"] = {"ok": False, "blocked": True, "examples": ["blocked: no OPENROUTER_API_KEY in this environment, so no live call was made"]}
    else:
        checks["live_sample"] = {"ok": live["usd_per_player_month"] < budget_usd_month, "examples": [live["text"]]}
    return {"ok": all(v["ok"] for v in checks.values()), "checks": checks, "estimate_usd_per_player_month": est}


def scenario_jobs(names, seeds=SEEDS, days: int = 30, mode: str = "rules", recheck: bool = False) -> list[tuple]:
    return [(n, s, days, mode, recheck) for n in names for s in seeds]


ALL = scenarios.ORDER
_ = tuned
