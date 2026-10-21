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
(`issuance_budgets`), so the number is auditable.

Phase 3 (the town economy, Doc 04 section 4A rule 2):
  * Harbour floor-price buying counts against the same budget as Town Hall issuance.
  * Recycling: Sora destroyed in the week (imports, upkeep, building, decor, fees) may be issued again in the same week,
    so the budget limits NET growth to the target: budget = formula x thermostat (at least the floor) + destroyed so far.
    An operator's SORA_WEEKLY_BUDGET is an exact budget and recycles nothing.
  * Population on top: the starting money of new residents (genesis balances, the new player's grant) is recorded as
    Town Hall issuance but is not growth per resident, so it does not count against the budget (POPULATION_RULES).
  * The thermostat: each week's measured growth per resident is stored in `growth_weeks`. Two weeks in a row above the
    band shrink next week's growth part (x THERMOSTAT_DOWN); two weeks below grow it (x THERMOSTAT_UP). Nobody's coins are
    ever taken back.
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
POPULATION_RULES = ("genesis", "new_player_grant", "scenario_endowment")
THERMOSTAT_DOWN, THERMOSTAT_UP, THERMOSTAT_RANGE = 0.8, 1.25, (0.25, 4.0)


def week_start(ts: float | None = None) -> float:
    t = ts if ts is not None else db.now()
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


def supply(con: sqlite3.Connection, before: float | None = None, since: float | None = None) -> dict:
    """Sora created, destroyed and in circulation, from the journal (optionally only entries in [since, before))."""
    mints, burn = _special_ids(con)
    where, args = "", []
    if before is not None:
        where += " AND created_at < ?"; args.append(before)
    if since is not None:
        where += " AND created_at >= ?"; args.append(since)
    m = ",".join(str(i) for i in mints) or "-1"
    mb = ",".join(str(i) for i in mints | burn) or "-1"
    r = con.execute(f"""SELECT COALESCE(SUM(CASE WHEN from_account IN ({m}) AND to_account NOT IN ({m}) THEN amount ELSE 0 END),0) c,
                               COALESCE(SUM(CASE WHEN to_account IN ({mb}) AND from_account NOT IN ({mb}) THEN amount ELSE 0 END),0) d
                        FROM journal WHERE asset=? {where}""", (db.SORA, *args)).fetchone()
    return {"created": r["c"], "destroyed": r["d"], "circulating": r["c"] - r["d"]}


def used(con: sqlite3.Connection, ts: float | None = None) -> int:
    """Issuance against the week's budget: every Town Hall and Harbour issue entry except the conversion and population."""
    ws = week_start(ts)
    return _used_between(con, ws, ws + WEEK)


def _used_between(con: sqlite3.Connection, since: float, before: float) -> int:
    mints, _ = _special_ids(con)
    if not mints:
        return 0
    pop = ",".join("?" * len(POPULATION_RULES))
    return con.execute(f"""SELECT COALESCE(SUM(amount),0) s FROM journal WHERE from_account IN ({",".join(str(i) for i in mints)}) AND kind='issue' AND asset=?
                           AND rule != ? AND rule NOT IN ({pop}) AND created_at >= ? AND created_at < ?""",
                       (db.SORA, MIGRATION_RULE, *POPULATION_RULES, since, before)).fetchone()["s"]


def recycled(con: sqlite3.Connection, ts: float | None = None) -> int:
    """Sora destroyed in the week so far, plus destroyed Sora from earlier weeks that was not issued again (the carry): it
    may be issued again (net growth stays on the target). Without the carry, coins destroyed but not reissued before a
    week ended would be lost to the town, and the money supply would shrink week by week. The town spends the carry
    back slowly (civic.budget_left_today paces it), so old sinks never come back as a lump."""
    this_week, carry = recycled_parts(con, ts)
    return this_week + carry


def recycled_parts(con: sqlite3.Connection, ts: float | None = None) -> tuple[int, int]:
    """(destroyed this week so far, carry from earlier weeks)."""
    ws = week_start(ts)
    this_week = supply(con, before=min(ws + WEEK, db.now() + 1), since=ws)["destroyed"]
    before = supply(con, before=ws, since=0)["destroyed"]
    carry = max(0, before - _used_between(con, 0, ws)) if before else 0
    return this_week, carry


def thermostat(con: sqlite3.Connection, ts: float | None = None) -> float:
    """This week's growth multiplier: set by the previous week's thermostat record (1.0 when there is none)."""
    prev = week_label(week_start(ts) - WEEK)
    r = con.execute("SELECT next_multiplier FROM growth_weeks WHERE week=?", (prev,)).fetchone()
    return float(r["next_multiplier"]) if r else 1.0


def record_growth(con: sqlite3.Connection, week: str, measured: float, band: tuple[float, float] = GROWTH_BAND) -> dict:
    """Store a week's measured growth per resident (annualised) and set next week's multiplier (Doc 04 4A rule 2)."""
    state = "above" if measured > band[1] else "below" if measured < band[0] else "in"
    prev = con.execute("SELECT * FROM growth_weeks WHERE week < ? ORDER BY week DESC LIMIT 1", (week,)).fetchone()
    mult = float(prev["next_multiplier"]) if prev else 1.0
    nxt = mult
    if prev and prev["band"] == state == "above":
        nxt = mult * THERMOSTAT_DOWN
    elif state == "below":
        nxt = mult * THERMOSTAT_UP  # Doc 04 rule 2: "if it runs below, the budget grows" (one week is enough)
    nxt = min(max(nxt, THERMOSTAT_RANGE[0]), THERMOSTAT_RANGE[1])
    con.execute("INSERT INTO growth_weeks(week, measured, band, multiplier, next_multiplier) VALUES (?,?,?,?,?) ON CONFLICT(week) DO UPDATE SET "
                "measured=excluded.measured, band=excluded.band, multiplier=excluded.multiplier, next_multiplier=excluded.next_multiplier",
                (week, measured, state, mult, nxt))
    return {"week": week, "measured": measured, "band": state, "multiplier": mult, "next_multiplier": nxt}


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
    mult = thermostat(con, ws)
    rec = carry = 0
    if ov is not None:
        budget, source = ov, "setting"
    else:
        grown = math.ceil(row["formula_budget"] * mult)
        rec_week, carry = recycled_parts(con, ws)
        rec = rec_week + carry
        if grown >= row["floor"]:
            budget, source = grown + rec, "formula"
        else:
            budget, source = row["floor"] + rec, "floor"
    u = used(con, ws)
    return {"week": wk, "week_start": ws, "budget": budget, "source": source, "used": u, "left": max(0, budget - u),
            "supply_at_start": row["supply_at_start"], "growth": row["growth"], "formula_budget": row["formula_budget"], "floor": row["floor"],
            "thermostat": mult, "recycled": rec, "carry": carry,
            "formula": ("ceil(supply_at_week_start x ((1 + growth) ^ (7/365) - 1)) x thermostat, at least the floor, plus the Sora destroyed this week "
                        "and destroyed Sora from earlier weeks not yet issued again; "
                        "an operator's weekly budget replaces all of it")}


def allows(con: sqlite3.Connection, amount: int, ts: float | None = None) -> bool:
    w = weekly(con, ts)
    return w["used"] + amount <= w["budget"]
