"""ISSUE-14 follow-up: compare sustainable Pals reward policies on the REAL recorded reward events (read-only).

Runs on a temporary COPY of data/economy.db. Nothing is changed: no rule, budget, reward, journal row or balance.
Scenarios the product's own replay supports (policy.preview: rule amounts/caps and one network budget) use it directly;
pooled budgets (separate welcome vs contribution pools) and a per-agent daily total cap are simulated here with the same
decision order as policy._replay. Every scenario re-decides the same events in the same order, so the numbers are
comparable estimates, not forecasts: they cannot know about agents who would have behaved differently.

Usage: services/editorial/.venv/bin/python scripts/analysis/pals_replay_scenarios.py [days] > out.json
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/editorial"))
from palavva_editorial.economy import policy  # noqa: E402

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 7
WELCOME = "first_contribution"


def gini(xs: list[float]) -> float:
    xs = sorted(x for x in xs if x > 0)
    n = len(xs)
    if not n:
        return 0.0
    cum = sum((i + 1) * x for i, x in enumerate(xs))
    return round((2 * cum) / (n * sum(xs)) - (n + 1) / n, 3)


def simulate(con, rows, rules, pools: dict[str, int] | None, network: int, agent_total_cap: float | None, since: float):
    """pools: {'welcome': W, 'contribution': C} or None (single network budget). agent_total_cap: Pals/agent/day across all rules."""
    once = {(r["agent_id"], r["rule"]) for r in con.execute(
        "SELECT DISTINCT agent_id, rule FROM rewards WHERE status IN ('issued','reversed') AND created_at<? AND rule IN (SELECT code FROM reward_rules WHERE one_time=1)", (since,))}
    per_rule, spent, agent_day = Counter(), Counter(), Counter()
    issued, denied, by_agent, welcome_waiting = Counter(), Counter(), defaultdict(float), Counter()
    exhausted_at: dict[str, float] = {}
    contrib_budget_denied = 0
    for r in rows:
        rule = rules.get(r["rule"])
        cat = policy.deny_category(r["reason"]) if r["status"] == "denied" else ""
        pool = "welcome" if r["rule"] == WELCOME else "contribution"
        key = (r["day"], pool) if pools else (r["day"], "all")
        limit = (pools[pool] if pools else network)
        v = ""
        if cat in ("paused", "ledger", "other"):
            v = cat
        elif not rule or not rule["active"]:
            v = "inactive_rule"
        elif rule["one_time"] and (r["agent_id"], r["rule"]) in once:
            v = "one_time"
        elif per_rule[(r["day"], r["agent_id"], r["rule"])] >= rule["cap"]:
            v = "agent_cap"
        elif agent_total_cap is not None and agent_day[(r["day"], r["agent_id"])] + rule["amount"] > agent_total_cap + 1e-9:
            v = "agent_total_cap"
        elif spent[key] + rule["amount"] > limit + 1e-9:
            v = "budget"
            exhausted_at.setdefault(f"{key[0]}:{key[1]}", r["created_at"])
        if v:
            denied[v] += 1
            if r["rule"] == WELCOME and v == "budget":
                welcome_waiting[r["agent_id"]] += 1
            if r["rule"] != WELCOME and v == "budget":
                contrib_budget_denied += 1
            continue
        issued[r["rule"]] += rule["amount"]
        spent[key] += rule["amount"]
        per_rule[(r["day"], r["agent_id"], r["rule"])] += 1
        agent_day[(r["day"], r["agent_id"])] += rule["amount"]
        by_agent[r["agent_id"]] += rule["amount"]
        if rule["one_time"]:
            once.add((r["agent_id"], r["rule"]))
    total = sum(issued.values())
    contribution_events = sum(1 for r in rows if r["rule"] != WELCOME)
    vals = sorted(by_agent.values(), reverse=True)
    top1 = sum(vals[: max(1, len(vals) // 100)]) if vals else 0
    return {"issued_pals": round(total, 2), "issued_by_rule": {k: round(v, 2) for k, v in issued.items()},
            "welcome_share": round(issued.get(WELCOME, 0) / total, 3) if total else 0, "agents_rewarded": len(by_agent),
            "denied": dict(denied), "contribution_denied_for_budget": contrib_budget_denied,
            "welcome_denied_for_budget_agents": len(welcome_waiting), "gini_per_agent": gini(list(by_agent.values())),
            "top_1pct_share": round(top1 / total, 3) if total else 0, "budget_exhausted_utc": {k: __import__("time").strftime("%H:%M", __import__("time").gmtime(t)) for k, t in sorted(exhausted_at.items())},
            "contribution_events": contribution_events}


def main() -> None:
    src = ROOT / "data/economy.db"
    tmp = Path(tempfile.mkdtemp(prefix="pals-replay-")) / "economy.db"
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    d = sqlite3.connect(tmp)
    s.backup(d)
    s.close()
    d.row_factory = sqlite3.Row
    con = d
    since_day = policy.db.day(__import__("time").time() - (DAYS - 1) * 86400)
    rows = con.execute("SELECT * FROM rewards WHERE day>=? AND status IN ('issued','denied','reversed') ORDER BY created_at, id", (since_day,)).fetchall()
    since = rows[0]["created_at"] if rows else 0
    rules, budget = policy._rules(con), policy._budget(con)["pals"]
    def with_rules(ch: dict) -> dict:
        r = {k: dict(v) for k, v in rules.items()}
        for code, c in ch.items():
            r[code].update(c)
        return r
    out = {"window_days": DAYS, "events": len(rows), "first_day": rows[0]["day"] if rows else None, "last_day": rows[-1]["day"] if rows else None,
           "current": {"budget": budget, "rules": {k: {"amount": v["amount"], "cap": v["cap"]} for k, v in rules.items()}},
           "population_note": "27,060 resident agents exist; every agent's first accepted contribution earns the welcome bonus once.",
           "scenarios": {}}
    S = out["scenarios"]
    S["A_current"] = simulate(con, rows, rules, None, budget, None, since)
    S["B_welcome_20"] = simulate(con, rows, with_rules({WELCOME: {"amount": 20}}), None, budget, None, since)
    S["C_budget_30k"] = simulate(con, rows, rules, None, 30_000, None, since)
    S["D_pools_welcome5k_contrib20k"] = simulate(con, rows, rules, {"welcome": 5_000, "contribution": 20_000}, 0, None, since)
    S["E_pools_welcome5k_contrib15k_welcome20"] = simulate(con, rows, with_rules({WELCOME: {"amount": 20}}), {"welcome": 5_000, "contribution": 15_000}, 0, None, since)
    S["F_E_plus_agent_total_cap_40"] = simulate(con, rows, with_rules({WELCOME: {"amount": 20}}), {"welcome": 5_000, "contribution": 15_000}, 0, 40, since)
    S["G_quality_weighted"] = simulate(con, rows, with_rules({WELCOME: {"amount": 20}, "accepted_reply": {"amount": 4}, "sourced_reply": {"amount": 5}, "cross_owner_upvote": {"amount": 1, "cap": 6}}),
                                       {"welcome": 5_000, "contribution": 15_000}, 0, 40, since)
    # Cross-check: the product's own preview for the scenarios it supports must agree with this simulation's single-budget path.
    pv = policy.preview(con, {"rules": {WELCOME: {"amount": 20}}}, days=DAYS)
    out["crosscheck_policy_preview_B"] = {"product_preview_proposed_pals": pv["totals"]["proposed_issued_pals"], "this_script_B": S["B_welcome_20"]["issued_pals"],
                                          "product_preview_current_pals": pv["totals"]["current_issued_pals"], "this_script_A": S["A_current"]["issued_pals"]}
    integ = policy.integrity(con) if hasattr(policy, "integrity") else {}
    out["integrity_signals"] = [{"key": x.get("key"), "kind": x.get("kind"), "severity": x.get("severity"), "count": x.get("count")} for x in (integ.get("signals") or [])][:30]
    print(json.dumps(out, indent=2, default=str))
    shutil.rmtree(tmp.parent, ignore_errors=True)


if __name__ == "__main__":
    main()
