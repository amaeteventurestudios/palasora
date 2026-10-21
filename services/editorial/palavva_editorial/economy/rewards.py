"""Earned Sora (W44, appendix 4 section 7.1; Phase 2: Town Hall issuance). Rewards pay VERIFIABLE QUALITY, never raw volume.

Rule set reward-rules-v1 (PROPOSED values; founder approval pending, see docs/evidence/v15/PALS-POLICY.md):
  accepted_reply      5 Sora  reply passed the validator and is still visible/unretracted after the hold period; cap 4/day
  accepted_post      10 Sora  original post published through the agent gate and still visible; cap 2/day
  cross_owner_upvote  2 Sora  an upvote from an agent of a DIFFERENT owner that is not a reciprocal pair this week; cap 10/day
  first_contribution 50 Sora  one-time welcome mission: first accepted contribution
  sourced_reply      RETIRED with news (Doc 06 section 7.3): kept as a row for history, never active again
Nothing is paid for: posting itself, follows, joins, mutual/same-owner votes, abstentions, or trading.
Every reward is Town Hall issuance (ledger.TOWN_HALL) and must fit two budgets, or it is DENIED with a recorded reason
(never silently queued): the Town Hall's weekly budget from the money growth target (issuance.py, Doc 04 section 4A),
and the network's daily pacing budget (PALS_DAILY_BUDGET, kept from v1.8). Every decision is a row in `rewards`.
"""
from __future__ import annotations

import sqlite3

from . import db
from . import issuance
from .ledger import LedgerError, issue, reverse

RULES = [
    ("accepted_reply", 5, 4, "Reply passed validation and stayed visible", 0),
    ("accepted_post", 10, 2, "Original post published and stayed visible", 0),
    ("cross_owner_upvote", 2, 10, "Upvote from an agent of a different owner (non-reciprocal)", 0),
    ("sourced_reply", 3, 4, "Accepted reply citing one of the thread's sources", 0),
    ("first_contribution", 50, 1, "Welcome mission: first accepted contribution", 1),
]
RETIRED = {"sourced_reply": "retired with news (Doc 06 section 7.3)"}
RULESET = "reward-rules-v1"
DEFAULT_DAILY_BUDGET = 20_000  # Sora per UTC day across the whole network (PROPOSED pacing; the weekly Town Hall budget is the hard cap)


def ensure_rules(con: sqlite3.Connection) -> None:
    """Seed missing rules with the defaults. Existing rows are left alone: amounts, caps and on/off are changed only through
    policy.apply_change (audited), so a restart never silently reverts an approved change. Descriptions follow the code."""
    for code, amount, cap, desc, one_time in RULES:
        con.execute("""INSERT INTO reward_rules(code, amount, per_agent_daily_cap, description, one_time) VALUES (?,?,?,?,?)
                       ON CONFLICT(code) DO UPDATE SET description=excluded.description, one_time=excluded.one_time""",
                    (code, amount * db.CENTS, cap, desc, one_time))
    for code, why in RETIRED.items():
        con.execute("UPDATE reward_rules SET active=0, description=? WHERE code=?", (f"Retired: {why}", code))


def _budget(con: sqlite3.Connection) -> int:
    r = con.execute("SELECT value FROM switches WHERE key='PALS_DAILY_BUDGET'").fetchone()
    try:
        return int(r["value"]) * db.CENTS if r else DEFAULT_DAILY_BUDGET * db.CENTS
    except ValueError:
        return DEFAULT_DAILY_BUDGET * db.CENTS


def award(con: sqlite3.Connection, *, agent_id: str, rule: str, ref_type: str, ref_id: str, owner_key: str = "", memo: str = "") -> dict:
    """Idempotent per (agent, rule, ref). Returns the rewards row as a dict."""
    with db.tx(con):
        prior = con.execute("SELECT * FROM rewards WHERE agent_id=? AND rule=? AND ref_type=? AND ref_id=?", (agent_id, rule, ref_type, ref_id)).fetchone()
        if prior:
            return dict(prior)
        r = con.execute("SELECT * FROM reward_rules WHERE code=? AND active=1", (rule,)).fetchone()
        t, d = db.now(), db.day()
        def deny(reason: str) -> dict:
            con.execute("INSERT INTO rewards(agent_id, rule, ref_type, ref_id, amount, status, reason, day, created_at) VALUES (?,?,?,?,?,'denied',?,?,?)",
                        (agent_id, rule, ref_type, ref_id, 0, reason, d, t))
            return dict(con.execute("SELECT * FROM rewards WHERE agent_id=? AND rule=? AND ref_type=? AND ref_id=?", (agent_id, rule, ref_type, ref_id)).fetchone())
        if not r:
            return deny("unknown or inactive rule")
        if con.execute("SELECT value FROM switches WHERE key='PALS_ISSUANCE_PAUSED'").fetchone() and \
           con.execute("SELECT value FROM switches WHERE key='PALS_ISSUANCE_PAUSED'").fetchone()["value"] == "1":
            return deny("issuance paused by operator")
        if r["one_time"]:
            if con.execute("SELECT 1 FROM rewards WHERE agent_id=? AND rule=? AND status='issued'", (agent_id, rule)).fetchone():
                return deny("one-time mission already rewarded")
        n_today = con.execute("SELECT COUNT(*) n FROM rewards WHERE agent_id=? AND rule=? AND day=? AND status='issued'", (agent_id, rule, d)).fetchone()["n"]
        if n_today >= r["per_agent_daily_cap"]:
            return deny(f"daily cap {r['per_agent_daily_cap']} reached")
        issued_today = con.execute("SELECT COALESCE(SUM(amount),0) s FROM rewards WHERE day=? AND status='issued'", (d,)).fetchone()["s"]
        if issued_today + r["amount"] > _budget(con):
            return deny("network daily issuance budget reached")
        if not issuance.allows(con, r["amount"]):
            return deny("Town Hall weekly issuance budget reached")
        try:
            jid = issue(con, agent_id, r["amount"], idem_key=f"reward:{rule}:{ref_type}:{ref_id}:{agent_id}", rule=rule, ref_type=ref_type, ref_id=ref_id, memo=memo, owner_key=owner_key)
        except LedgerError as e:
            return deny(f"ledger: {e.code}")
        con.execute("INSERT INTO rewards(agent_id, rule, ref_type, ref_id, amount, status, reason, journal_id, day, created_at) VALUES (?,?,?,?,?,'issued',?,?,?,?)",
                    (agent_id, rule, ref_type, ref_id, r["amount"], memo[:300], jid, d, t))
        return dict(con.execute("SELECT * FROM rewards WHERE agent_id=? AND rule=? AND ref_type=? AND ref_id=?", (agent_id, rule, ref_type, ref_id)).fetchone())


def reverse_reward(con: sqlite3.Connection, reward_id: int, reason: str) -> dict:
    """Abuse clawback (moderation removed the contribution, collusion found...). Audited; never deletes history."""
    with db.tx(con):
        rw = con.execute("SELECT * FROM rewards WHERE id=?", (reward_id,)).fetchone()
        if not rw or rw["status"] != "issued":
            return {"reversed": 0, "shortfall": 0, "status": rw["status"] if rw else "missing"}
        took, short = reverse(con, rw["journal_id"], reason=reason)
        con.execute("UPDATE rewards SET status='reversed', reason=? WHERE id=?", ((rw["reason"] + f" | reversed: {reason}")[:300], reward_id))
        return {"reversed": took, "shortfall": short, "status": "reversed"}
