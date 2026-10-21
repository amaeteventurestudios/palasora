"""Town Hall weekly issuance budget (Doc 04 section 4A, rule 2; Doc 06 section 7.3).

The target is that Sora per active resident grows about 20% a year (allowed band 15 to 25%). The Town Hall's budget for
a week is what that growth allows on the money that existed when the week began:

    formula_budget = ceil(supply_at_week_start x ((1 + g) ^ (7 / 365) - 1))      g = SORA_GROWTH_TARGET, default 0.20
    budget         = SORA_WEEKLY_BUDGET (Sora) when an operator sets it, else max(formula_budget, floor)

`floor` (SORA_WEEKLY_FLOOR, default 5,000 Sora) lets a young economy start: with almost no supply the formula alone would
allow almost nothing. Supply is counted from the journal only: Sora created by a mint minus Sora destroyed (sent to a
mint or to platform:burn). The Pals conversion counts as supply (it is the money people already had), but it is not
issuance against the budget. Every Town Hall issue entry in the week counts against the budget, whatever its rule.

The week runs Monday 00:00 to Sunday 24:00 UTC. The supply and the formula are fixed for the week when first computed
(`issuance_budgets`), so the number is auditable. Measured growth feedback (shrink or grow next week's budget after two
weeks outside the band) and Harbour floor buying arrive with the economy tick in Phase 3.
"""
from __future__ import annotations

import math
import sqlite3
import time

from . import db
from .ledger import BURN, MIGRATION_RULE, TOWN_HALL

DEFAULT_GROWTH = 0.20
GROWTH_BAND = (0.15, 0.25)
DEFAULT_FLOOR = 5_000  # Sora per week
WEEK = 7 * 86400


def week_start(ts: float | None = None) -> float:
    t = ts if ts is not None else time.time()
    day0 = t - (t % 86400)
    return day0 - time.gmtime(day0).tm_wday * 86400  # tm_wday: Monday = 0


def week_label(ts: float | None = None) -> str:
    return time.strftime("%G-W%V", time.gmtime(week_start(ts)))


def _switch(con: sqlite3.Connection, key: str) -> str | None:
    r = con.execute("SELECT value FROM switches WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None


def growth(con: sqlite3.Connection) -> float:
    try:
        g = float(_switch(con, "SORA_GROWTH_TARGET") or DEFAULT_GROWTH)
    except ValueError:
        g = DEFAULT_GROWTH
    return min(max(g, GROWTH_BAND[0]), GROWTH_BAND[1])


def floor(con: sqlite3.Connection) -> int:
    try:
        return max(0, int(_switch(con, "SORA_WEEKLY_FLOOR") or DEFAULT_FLOOR)) * db.CENTS
    except ValueError:
        return DEFAULT_FLOOR * db.CENTS


def override(con: sqlite3.Connection) -> int | None:
    v = _switch(con, "SORA_WEEKLY_BUDGET")
    if v in (None, ""):
        return None
    try:
        return max(0, int(v)) * db.CENTS
    except ValueError:
        return None


def _special_ids(con: sqlite3.Connection) -> tuple[set[int], set[int]]:
    mints = {r["id"] for r in con.execute("SELECT id FROM accounts WHERE asset=? AND owner_kind='platform' AND owner_id IN ('town_hall','harbour')", (db.SORA,))}
    burn = {r["id"] for r in con.execute("SELECT id FROM accounts WHERE asset=? AND owner_kind=? AND owner_id=?", (db.SORA, *BURN))}
    return mints, burn


def supply(con: sqlite3.Connection, before: float | None = None) -> dict:
    """Sora created, destroyed and in circulation, from the journal (optionally only entries before `before`)."""
    mints, burn = _special_ids(con)
    where, args = ("AND created_at < ?", (before,)) if before is not None else ("", ())
    created = destroyed = 0
    for j in con.execute(f"SELECT from_account f, to_account t, amount FROM journal WHERE asset=? {where}", (db.SORA, *args)):
        if j["f"] in mints and j["t"] not in mints:
            created += j["amount"]
        elif j["t"] in mints | burn and j["f"] not in mints | burn:
            destroyed += j["amount"]
    return {"created": created, "destroyed": destroyed, "circulating": created - destroyed}


def used(con: sqlite3.Connection, ts: float | None = None) -> int:
    th = con.execute("SELECT id FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (*TOWN_HALL, db.SORA)).fetchone()
    if not th:
        return 0
    ws = week_start(ts)
    return con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE from_account=? AND kind='issue' AND rule != ? AND created_at >= ? AND created_at < ?",
                       (th["id"], MIGRATION_RULE, ws, ws + WEEK)).fetchone()["s"]


def weekly(con: sqlite3.Connection, ts: float | None = None) -> dict:
    """The Town Hall's budget for the week containing `ts`, with how it was computed and how much is used."""
    ws = week_start(ts)
    wk = week_label(ws)
    row = con.execute("SELECT * FROM issuance_budgets WHERE week=? AND mint='town_hall'", (wk,)).fetchone()
    if not row:
        g = growth(con)
        s0 = supply(con, before=ws)["circulating"]
        fb = math.ceil(s0 * ((1 + g) ** (7 / 365) - 1))
        con.execute("INSERT OR IGNORE INTO issuance_budgets(week, mint, supply_at_start, growth, formula_budget, floor, computed_at) VALUES (?,?,?,?,?,?,?)",
                    (wk, "town_hall", s0, g, fb, floor(con), db.now()))
        row = con.execute("SELECT * FROM issuance_budgets WHERE week=? AND mint='town_hall'", (wk,)).fetchone()
    ov = override(con)
    if ov is not None:
        budget, source = ov, "setting"
    elif row["formula_budget"] >= row["floor"]:
        budget, source = row["formula_budget"], "formula"
    else:
        budget, source = row["floor"], "floor"
    u = used(con, ws)
    return {"week": wk, "week_start": ws, "budget": budget, "source": source, "used": u, "left": max(0, budget - u),
            "supply_at_start": row["supply_at_start"], "growth": row["growth"], "formula_budget": row["formula_budget"], "floor": row["floor"],
            "formula": "ceil(supply_at_week_start x ((1 + growth) ^ (7/365) - 1)), at least the floor, unless an operator sets the weekly budget"}


def allows(con: sqlite3.Connection, amount: int, ts: float | None = None) -> bool:
    w = weekly(con, ts)
    return w["used"] + amount <= w["budget"]
