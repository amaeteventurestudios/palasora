"""ISSUE-14: reward policy that a person can read, change safely and audit, plus integrity signals from the real ledger.

* explain():   the rules, the network's daily budget, today's issued vs denied (by plain reason), daily history, the agents
               most often denied. A denial is a recorded decision ("budget used up", "agent reached today's cap"), not a
               finding of wrongdoing.
* preview():   replays the reward events actually recorded in the last N days under a proposed policy and under the
               current one, so the founder sees "what would have happened" before changing anything. Estimate only.
* apply_change() / rollback(): bounded, reasoned, revision-checked changes, one audit row per target. They affect
               FUTURE rewards only; rows in `rewards` and `journal` (and therefore balances) are never rewritten.
* integrity(): duplicate issuance, ledger reconciliation, reward outliers, upvote concentration and same-owner rewards,
               self/same-owner trades, pair concentration, sharp price moves on thin volume. Signals are warnings with
               evidence for a person to review, never proof.
"""
from __future__ import annotations

import json
import sqlite3
import statistics
import time
from collections import Counter, defaultdict

from . import db
from .rewards import DEFAULT_DAILY_BUDGET, RULES

BOUNDS = {"amount": (1, 100), "cap": (1, 50), "budget": (1_000, 100_000)}  # Pals, rewards/agent/day, Pals/day
LARGE_FACTOR = 2.0  # a change to more than 2x or less than half of the current value needs an explicit confirmation
DEFAULTS = {code: {"amount": amount, "cap": cap} for code, amount, cap, _d, _o in RULES}

DENY_PLAIN = {
    "budget": "The network's daily Pals budget was already used up",
    "agent_cap": "This agent already earned this reward as many times as allowed today",
    "one_time": "A one-time reward this agent had already received",
    "paused": "Issuance was paused by an operator",
    "inactive_rule": "The rule was switched off",
    "ledger": "The ledger refused the entry (for example a duplicate)",
    "other": "Other",
}


def deny_category(reason: str) -> str:
    r = (reason or "").lower()
    if r.startswith("network daily issuance budget"):
        return "budget"
    if r.startswith("daily cap"):
        return "agent_cap"
    if r.startswith("one-time"):
        return "one_time"
    if r.startswith("issuance paused"):
        return "paused"
    if r.startswith("unknown or inactive rule"):
        return "inactive_rule"
    if r.startswith("ledger"):
        return "ledger"
    return "other"


def _rules(con: sqlite3.Connection) -> dict[str, dict]:
    return {r["code"]: {"code": r["code"], "amount": r["amount"] / db.CENTS, "cap": r["per_agent_daily_cap"], "active": bool(r["active"]),
                        "one_time": bool(r["one_time"]), "description": r["description"],
                        "default_amount": DEFAULTS.get(r["code"], {}).get("amount"), "default_cap": DEFAULTS.get(r["code"], {}).get("cap")}
            for r in con.execute("SELECT * FROM reward_rules ORDER BY code")}


def _budget(con: sqlite3.Connection) -> dict:
    r = con.execute("SELECT value, updated_by, updated_at FROM switches WHERE key='PALS_DAILY_BUDGET'").fetchone()
    try:
        v = int(r["value"]) if r else DEFAULT_DAILY_BUDGET
    except ValueError:
        v = DEFAULT_DAILY_BUDGET
    return {"pals": v, "default": DEFAULT_DAILY_BUDGET, "source": "setting" if r else "default", "updated_by": r["updated_by"] if r else "", "updated_at": r["updated_at"] if r else None}


def revision(con: sqlite3.Connection) -> int:
    return con.execute("SELECT COALESCE(MAX(id),0) m FROM reward_policy_changes").fetchone()["m"]


def explain(con: sqlite3.Connection, days: int = 14) -> dict:
    today = db.day()
    first_day = db.day(time.time() - (days - 1) * 86400)
    rows = con.execute("SELECT day, rule, agent_id, status, reason, amount, created_at FROM rewards WHERE day>=?", (first_day,)).fetchall()
    hist: dict[str, dict] = {}
    by_rule_today: dict[str, dict] = defaultdict(lambda: {"issued_n": 0, "issued_pals": 0.0, "denied_n": 0})
    denied_agents: dict[str, Counter] = defaultdict(Counter)
    issued_agents: Counter = Counter()
    reached_at = None
    for r in rows:
        h = hist.setdefault(r["day"], {"day": r["day"], "issued_n": 0, "issued_pals": 0.0, "denied_n": 0, "reversed_n": 0, "denied_by": Counter()})
        if r["status"] == "issued":
            h["issued_n"] += 1
            h["issued_pals"] += r["amount"] / db.CENTS
            issued_agents[r["agent_id"]] += 1
        elif r["status"] == "reversed":
            h["reversed_n"] += 1
        else:
            cat = deny_category(r["reason"])
            h["denied_n"] += 1
            h["denied_by"][cat] += 1
            denied_agents[r["agent_id"]][cat] += 1
            if r["day"] == today and cat == "budget" and (reached_at is None or r["created_at"] < reached_at):
                reached_at = r["created_at"]
        if r["day"] == today:
            br = by_rule_today[r["rule"]]
            if r["status"] == "issued":
                br["issued_n"] += 1
                br["issued_pals"] += r["amount"] / db.CENTS
            elif r["status"] == "denied":
                br["denied_n"] += 1
    history = [{**h, "denied_by": dict(h["denied_by"])} for _, h in sorted(hist.items())]
    t = next((h for h in history if h["day"] == today), {"day": today, "issued_n": 0, "issued_pals": 0.0, "denied_n": 0, "reversed_n": 0, "denied_by": {}})
    budget = _budget(con)
    top = sorted(denied_agents.items(), key=lambda kv: -sum(kv[1].values()))[:25]
    changes = [dict(r) for r in con.execute("SELECT * FROM reward_policy_changes ORDER BY id DESC LIMIT 25")]
    return {
        "rules": list(_rules(con).values()), "budget": budget, "revision": revision(con), "days": days,
        "today": {**t, "budget_used_pct": round(100 * t["issued_pals"] / budget["pals"], 1) if budget["pals"] else None,
                  "budget_reached_at": reached_at, "by_rule": [{"rule": k, **v} for k, v in sorted(by_rule_today.items())]},
        "history": history,
        "top_denied_agents": [{"agent_id": a, "denied_n": sum(c.values()), "denied_by": dict(c), "issued_n": issued_agents.get(a, 0)} for a, c in top],
        "denied_agents_n": len(denied_agents), "deny_plain": DENY_PLAIN, "changes": changes,
    }


# ---------------------------------------------------------------- preview (replay of recorded events)

def _replay(con: sqlite3.Connection, rows: list[sqlite3.Row], rules: dict[str, dict], budget_pals: int, since: float) -> dict[str, dict]:
    """Re-decide every recorded eligible event in order under `rules`/`budget`. Events refused for reasons the policy does
    not control (operator pause, ledger) keep their recorded outcome as a denial."""
    once = {(r["agent_id"], r["rule"]) for r in con.execute(
        "SELECT DISTINCT agent_id, rule FROM rewards WHERE status IN ('issued','reversed') AND created_at<? AND rule IN (SELECT code FROM reward_rules WHERE one_time=1)", (since,))}
    out: dict[str, dict] = {}
    per_agent: Counter = Counter()
    spent: Counter = Counter()
    for r in rows:
        d = out.setdefault(r["day"], {"issued_n": 0, "issued_pals": 0.0, "denied_n": 0, "denied_by": Counter()})
        rule = rules.get(r["rule"])
        cat = deny_category(r["reason"]) if r["status"] == "denied" else ""
        verdict = ""
        if cat in ("paused", "ledger", "other"):
            verdict = cat
        elif not rule or not rule["active"]:
            verdict = "inactive_rule"
        elif rule["one_time"] and (r["agent_id"], r["rule"]) in once:
            verdict = "one_time"
        elif per_agent[(r["day"], r["agent_id"], r["rule"])] >= rule["cap"]:
            verdict = "agent_cap"
        elif spent[r["day"]] + rule["amount"] > budget_pals + 1e-9:
            verdict = "budget"
        if verdict:
            d["denied_n"] += 1
            d["denied_by"][verdict] += 1
            continue
        d["issued_n"] += 1
        d["issued_pals"] += rule["amount"]
        spent[r["day"]] += rule["amount"]
        per_agent[(r["day"], r["agent_id"], r["rule"])] += 1
        if rule["one_time"]:
            once.add((r["agent_id"], r["rule"]))
    return out


def _proposed_rules(con: sqlite3.Connection, proposal: dict) -> tuple[dict[str, dict], int]:
    rules = _rules(con)
    for code, ch in (proposal.get("rules") or {}).items():
        if code not in rules:
            raise PolicyError("UNKNOWN_RULE", f"unknown rule {code}")
        rules[code] = {**rules[code], **{k: v for k, v in ch.items() if k in ("amount", "cap", "active")}}
    budget = int(proposal["budget"]) if proposal.get("budget") is not None else _budget(con)["pals"]
    return rules, budget


def preview(con: sqlite3.Connection, proposal: dict, days: int = 7) -> dict:
    days = max(1, min(days, 30))
    validate(con, proposal, require_confirm=False)
    since_day = db.day(time.time() - (days - 1) * 86400)
    rows = con.execute("SELECT * FROM rewards WHERE day>=? AND status IN ('issued','denied','reversed') ORDER BY created_at, id", (since_day,)).fetchall()
    since = rows[0]["created_at"] if rows else time.time()
    cur_rules, cur_budget = _rules(con), _budget(con)["pals"]
    new_rules, new_budget = _proposed_rules(con, proposal)
    cur = _replay(con, rows, cur_rules, cur_budget, since)
    new = _replay(con, rows, new_rules, new_budget, since)
    actual: dict[str, dict] = {}
    for r in rows:
        a = actual.setdefault(r["day"], {"issued_n": 0, "issued_pals": 0.0, "denied_n": 0})
        if r["status"] in ("issued", "reversed"):
            a["issued_n"] += 1
            a["issued_pals"] += r["amount"] / db.CENTS
        else:
            a["denied_n"] += 1
    per_day = []
    for d in sorted(actual):
        c, n = cur.get(d, {}), new.get(d, {})
        per_day.append({"day": d, "actual_issued_pals": round(actual[d]["issued_pals"], 2), "actual_denied_n": actual[d]["denied_n"],
                        "current_issued_pals": round(c.get("issued_pals", 0), 2), "current_denied_n": c.get("denied_n", 0),
                        "proposed_issued_pals": round(n.get("issued_pals", 0), 2), "proposed_issued_n": n.get("issued_n", 0),
                        "proposed_denied_n": n.get("denied_n", 0), "proposed_denied_by": dict(n.get("denied_by", {}))})
    tot = lambda k: round(sum(x[k] for x in per_day), 2)  # noqa: E731
    cur_total, new_total = tot("current_issued_pals"), tot("proposed_issued_pals")
    warnings = []
    if cur_total and new_total > cur_total * 1.5:
        warnings.append(f"Supply would grow {new_total / cur_total:.1f}x faster than under the current policy.")
    if tot("proposed_denied_n") > tot("current_denied_n") * 1.5 and tot("proposed_denied_n") > 50:
        warnings.append("Many more good contributions would go unrewarded.")
    return {"days": days, "events": len(rows), "per_day": per_day, "proposal": proposal,
            "totals": {"actual_issued_pals": tot("actual_issued_pals"), "current_issued_pals": cur_total, "proposed_issued_pals": new_total,
                       "actual_denied_n": tot("actual_denied_n"), "current_denied_n": tot("current_denied_n"), "proposed_denied_n": tot("proposed_denied_n")},
            "warnings": warnings,
            "note": "Estimate: the reward events recorded in these days are decided again, in the same order, under each policy. "
                    "It does not change any past reward or balance; a real change affects future rewards only."}


# ---------------------------------------------------------------- audited changes

class PolicyError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def validate(con: sqlite3.Connection, proposal: dict, require_confirm: bool = True) -> list[str]:
    """Bounds and safeguards. Returns the list of 'large' changes (more than 2x up or down) that need confirmation."""
    rules = _rules(con)
    large: list[str] = []
    if not (proposal.get("rules") or proposal.get("budget") is not None):
        raise PolicyError("EMPTY", "nothing to change")
    for code, ch in (proposal.get("rules") or {}).items():
        if code not in rules:
            raise PolicyError("UNKNOWN_RULE", f"unknown rule {code}")
        for k, v in ch.items():
            if k == "active":
                if not isinstance(v, bool):
                    raise PolicyError("BAD_VALUE", "active must be true or false")
                continue
            if k not in ("amount", "cap"):
                raise PolicyError("BAD_FIELD", f"{k} cannot be changed here")
            lo, hi = BOUNDS[k]
            if not isinstance(v, (int, float)) or not (lo <= v <= hi) or (k == "cap" and int(v) != v) or (k == "amount" and round(v * db.CENTS) != v * db.CENTS):
                raise PolicyError("OUT_OF_BOUNDS", f"{code} {k} must be between {lo} and {hi}" + (" (whole number)" if k == "cap" else ""))
            if k == "cap" and rules[code]["one_time"] and v != 1:
                raise PolicyError("OUT_OF_BOUNDS", f"{code} is a one-time reward; its cap stays 1")
            cur = rules[code][k]
            if cur and (v > cur * LARGE_FACTOR or v < cur / LARGE_FACTOR):
                large.append(f"{code} {k} {cur:g} -> {v:g}")
    if proposal.get("budget") is not None:
        v = proposal["budget"]
        lo, hi = BOUNDS["budget"]
        if not isinstance(v, int) or not (lo <= v <= hi):
            raise PolicyError("OUT_OF_BOUNDS", f"daily budget must be a whole number of Pals between {lo:,} and {hi:,}")
        cur = _budget(con)["pals"]
        if v > cur * LARGE_FACTOR or v < cur / LARGE_FACTOR:
            large.append(f"daily budget {cur:,} -> {v:,}")
    if require_confirm and large and not proposal.get("confirm_large"):
        raise PolicyError("CONFIRM_LARGE", "large change needs explicit confirmation: " + "; ".join(large))
    return large


def _record(con: sqlite3.Connection, target: str, before: dict, after: dict, reason: str, by: str, preview_summary: dict, rollback_of: int | None) -> int:
    cur = con.execute("INSERT INTO reward_policy_changes(target, before_json, after_json, reason, preview_json, changed_by, rollback_of, created_at) VALUES (?,?,?,?,?,?,?,?)",
                      (target, json.dumps(before), json.dumps(after), reason[:1000], json.dumps(preview_summary)[:4000], by[:120], rollback_of, db.now()))
    return int(cur.lastrowid)


def apply_change(con: sqlite3.Connection, proposal: dict, *, by: str, reason: str, expected_revision: int, rollback_of: int | None = None) -> dict:
    reason = (reason or "").strip()
    if len(reason) < 15:
        raise PolicyError("REASON", "give a reason of at least 15 characters")
    validate(con, proposal)
    summary = preview(con, proposal)["totals"]
    ids: list[int] = []
    with db.tx(con):
        if revision(con) != expected_revision:
            raise PolicyError("CONFLICT", "the policy changed since this page loaded; reload and review again")
        rules = _rules(con)
        for code, ch in (proposal.get("rules") or {}).items():
            before = {k: rules[code][k] for k in ("amount", "cap", "active")}
            after = {**before, **{k: v for k, v in ch.items() if k in ("amount", "cap", "active")}}
            if after == before:
                continue
            con.execute("UPDATE reward_rules SET amount=?, per_agent_daily_cap=?, active=? WHERE code=?",
                        (round(after["amount"] * db.CENTS), int(after["cap"]), int(after["active"]), code))
            ids.append(_record(con, f"rule:{code}", before, after, reason, by, summary, rollback_of))
        if proposal.get("budget") is not None:
            b = _budget(con)
            if proposal["budget"] != b["pals"]:
                con.execute("INSERT INTO switches(key, value, updated_by, updated_at) VALUES ('PALS_DAILY_BUDGET',?,?,?) "
                            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at",
                            (str(proposal["budget"]), by[:80], db.now()))
                ids.append(_record(con, "budget", {"pals": b["pals"]}, {"pals": proposal["budget"]}, reason, by, summary, rollback_of))
    if not ids:
        raise PolicyError("EMPTY", "the proposal matches the current policy")
    return {"change_ids": ids, "revision": revision(con), "rules": list(_rules(con).values()), "budget": _budget(con)}


def rollback(con: sqlite3.Connection, change_id: int, *, by: str, reason: str, expected_revision: int) -> dict:
    ch = con.execute("SELECT * FROM reward_policy_changes WHERE id=?", (change_id,)).fetchone()
    if not ch:
        raise PolicyError("NOT_FOUND", "no such change")
    before = json.loads(ch["before_json"])
    if ch["target"] == "budget":
        proposal: dict = {"budget": int(before["pals"])}
    else:
        proposal = {"rules": {ch["target"].split(":", 1)[1]: before}}
    proposal["confirm_large"] = True  # restoring a previously approved value
    return apply_change(con, proposal, by=by, reason=reason, expected_revision=expected_revision, rollback_of=change_id)


# ---------------------------------------------------------------- integrity signals

def _reviews(con: sqlite3.Connection) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in con.execute("SELECT * FROM integrity_reviews ORDER BY id"):
        out[r["signal_key"]] = dict(r)
    return out


def review(con: sqlite3.Connection, signal_key: str, disposition: str, note: str, by: str) -> dict:
    if disposition not in ("looks_fine", "investigating", "action_taken"):
        raise PolicyError("BAD_VALUE", "unknown disposition")
    if len((note or "").strip()) < 10:
        raise PolicyError("REASON", "add a note of at least 10 characters")
    with db.tx(con):
        con.execute("INSERT INTO integrity_reviews(signal_key, disposition, note, reviewed_by, created_at) VALUES (?,?,?,?,?)",
                    (signal_key[:200], disposition, note.strip()[:1000], by[:120], db.now()))
    return _reviews(con)[signal_key[:200]]


def integrity(con: sqlite3.Connection, days: int = 7) -> dict:
    days = max(1, min(days, 90))
    since = time.time() - days * 86400
    owner = {r["owner_id"]: r["owner_key"] for r in con.execute("SELECT owner_id, owner_key FROM accounts WHERE owner_kind='agent' AND asset='PALS'")}
    signals: list[dict] = []

    def add(key: str, kind: str, severity: str, title: str, plain: str, evidence: list, checked: str) -> None:
        signals.append({"key": key, "kind": kind, "severity": severity, "title": title, "plain": plain, "evidence": evidence[:50], "count": len(evidence), "checked": checked})

    # 1. Double issuance (idempotency): one issue entry per (rule, reference, agent); one rewards row per decision.
    dup = [dict(r) for r in con.execute("""SELECT j.rule, j.ref_type, j.ref_id, a.owner_id agent_id, COUNT(*) n FROM journal j JOIN accounts a ON a.id=j.to_account
                                          WHERE j.kind='issue' GROUP BY j.rule, j.ref_type, j.ref_id, j.to_account HAVING n>1 LIMIT 50""")]
    orphan = con.execute("SELECT COUNT(*) n FROM rewards WHERE status='issued' AND journal_id IS NULL").fetchone()["n"]
    n_issue = con.execute("SELECT COUNT(*) n FROM journal WHERE kind='issue'").fetchone()["n"]
    add("double_issuance", "ledger", "alert" if dup or orphan else "ok", "Double issuance",
        "Each reward can be paid once: the ledger has a unique key per rule, reference and agent, and a second attempt is refused. "
        f"Checked all {n_issue:,} issue entries." + (f" {orphan} issued rewards have no ledger entry." if orphan else ""), dup, "all time")

    # 2. Reconciliation: balances rebuilt from the immutable journal.
    last = con.execute("SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1").fetchone()
    if not last:
        add("reconciliation", "ledger", "watch", "Reconciliation has not run", "Run a reconciliation to rebuild every balance from the journal.", [], "never")
    else:
        mism = json.loads(last["mismatches"] or "[]")
        age_h = (time.time() - last["ran_at"]) / 3600
        add("reconciliation", "ledger", "alert" if not last["ok"] else ("watch" if age_h > 26 else "ok"),
            "Ledger reconciliation", f"Last run {age_h:.1f} h ago over {last['accounts']:,} accounts and {last['journal_rows']:,} journal rows: "
            + ("every balance matches the journal and total supply is conserved." if last["ok"] else f"{len(mism)} mismatches recorded for a person to investigate (never auto-corrected)."),
            mism, f"run #{last['id']}")

    # 3. Reward outliers: agents earning far above the network (possible farming, or simply very active).
    earned = {r["agent_id"]: r["s"] / db.CENTS for r in con.execute("SELECT agent_id, SUM(amount) s FROM rewards WHERE status='issued' AND created_at>=? GROUP BY agent_id", (since,))}
    if len(earned) >= 10:
        vals = list(earned.values())
        mu, sd = statistics.mean(vals), statistics.pstdev(vals) or 1.0
        out = sorted(((a, v) for a, v in earned.items() if v > mu + 4 * sd), key=lambda x: -x[1])
        add("reward_outliers", "rewards", "watch" if out else "ok", "Unusually high earners",
            f"Agents earning more than 4 standard deviations above the average ({mu:.1f} Pals per earning agent in {days} days). "
            "High earnings can be legitimate; look at what was rewarded before acting.",
            [{"agent_id": a, "earned_pals": round(v, 2), "times_average": round(v / mu, 1)} for a, v in out], f"{len(earned):,} earning agents")

    # 4. Upvote rewards: concentration from one voter, reciprocal reward pairs, same-owner rewards (should be impossible).
    pairs: Counter = Counter()
    for r in con.execute("SELECT agent_id, reason FROM rewards WHERE rule='cross_owner_upvote' AND status='issued' AND created_at>=?", (since,)):
        m = (r["reason"] or "")  # an issued reward stores its memo ("upvote from <voter>") in `reason`
        if m.startswith("upvote from "):
            pairs[(m[len("upvote from "):].strip(), r["agent_id"])] += 1
    heavy = [{"voter": v, "author": a, "rewarded_upvotes": n} for (v, a), n in pairs.most_common() if n >= 5]
    add("upvote_concentration", "voting", "watch" if heavy else "ok", "One agent repeatedly rewarding another",
        "Pairs where one agent's upvotes earned the same author 5 or more rewards in the window. Votes between agents with shared interests are normal; a steady one-way stream is worth a look.",
        heavy, f"{sum(pairs.values()):,} rewarded upvotes")
    recip = [{"agent_a": a, "agent_b": b, "a_to_b": pairs[(a, b)], "b_to_a": pairs[(b, a)]} for (a, b) in pairs if a < b and (b, a) in pairs]
    add("reciprocal_upvote_rewards", "voting", "watch" if recip else "ok", "Reciprocal upvote rewards",
        "Two agents each rewarded for the other's upvotes in the window. The engine already refuses rewards for a pair that voted for each other in the same week; anything here crossed week boundaries.",
        recip, f"{len(pairs):,} voter→author pairs")
    same = [{"voter": v, "author": a, "owner": owner.get(a, "")} for (v, a) in pairs if owner.get(v) and owner.get(v) == owner.get(a)]
    add("same_owner_rewards", "voting", "alert" if same else "ok", "Rewards between agents of the same human owner",
        "Upvotes between agents of the same human owner must never earn Pals (each Palavva resident counts as its own owner).", same, "rewarded upvotes")

    # 5. Trading: self trades, same-owner trades (prohibited self-dealing), pair concentration, sharp moves on thin volume.
    trades = con.execute("SELECT * FROM trades WHERE created_at>=? ORDER BY created_at", (since,)).fetchall()
    selfd = [{"trade_id": t["id"], "agent_id": t["buyer_id"], "company_id": t["company_id"]} for t in trades if t["buyer_id"] == t["seller_id"]]
    sameo = [{"trade_id": t["id"], "buyer": t["buyer_id"], "seller": t["seller_id"], "owner": owner.get(t["buyer_id"], "")} for t in trades
             if t["buyer_id"] != t["seller_id"] and owner.get(t["buyer_id"]) and owner.get(t["buyer_id"]) == owner.get(t["seller_id"])]
    add("self_trades", "exchange", "alert" if selfd or sameo else "ok", "Self-dealing and same-owner trades",
        "An agent trading with itself, or two agents of the same human owner trading with each other (simulated wash trading). Each Palavva resident counts as its own owner.",
        selfd + sameo, f"{len(trades):,} trades")
    vol: dict[str, Counter] = defaultdict(Counter)
    for t in trades:
        vol[t["company_id"]][tuple(sorted((t["buyer_id"], t["seller_id"])))] += t["qty"]
    conc = []
    for cid, c in vol.items():
        total = sum(c.values())
        (pair, q), = c.most_common(1)
        n_trades = sum(1 for t in trades if t["company_id"] == cid and tuple(sorted((t["buyer_id"], t["seller_id"]))) == pair)
        if total and q / total > 0.5 and n_trades >= 5:
            conc.append({"company_id": cid, "pair": list(pair), "share_of_volume_pct": round(100 * q / total), "trades": n_trades})
    add("pair_concentration", "exchange", "watch" if conc else "ok", "One pair dominating a company's trading",
        "More than half of a company's traded shares in the window passed between the same two agents (at least 5 trades).", conc, f"{len(vol):,} traded companies")
    moves = []
    byday: dict[tuple[str, str], list] = defaultdict(list)
    for t in trades:
        byday[(t["company_id"], db.day(t["created_at"]))].append(t)
    prev_close: dict[str, int] = {}
    for (cid, d) in sorted(byday, key=lambda k: (k[0], k[1])):
        ts = byday[(cid, d)]
        ref = prev_close.get(cid, ts[0]["price"])
        last_p = ts[-1]["price"]
        if ref and abs(last_p - ref) / ref > 0.3 and len(ts) <= 3:
            moves.append({"company_id": cid, "day": d, "from": ref / db.CENTS, "to": last_p / db.CENTS, "trades": len(ts)})
        prev_close[cid] = last_p
    add("thin_price_moves", "exchange", "watch" if moves else "ok", "Large price moves on very few trades",
        "A company's price moved more than 30% in a day on 3 trades or fewer. Small markets move easily; this is a prompt to look, not a finding.", moves, f"{len(byday):,} company-days")

    # 6. Transfers: the ledger has no agent-to-agent transfer kind, so there is nothing to check.
    add("transfers", "ledger", "ok", "Transfers between agents", "Agents cannot send Pals to each other (the ledger has no transfer entry type), so there are no transfer anomalies to check.", [], "ledger design")

    rv = _reviews(con)
    for s in signals:
        s["review"] = rv.get(s["key"])
    return {"days": days, "signals": signals, "as_of": time.time(),
            "note": "Signals are warnings with evidence for a person to review. They are not proof of wrongdoing, and nothing is reversed automatically."}
