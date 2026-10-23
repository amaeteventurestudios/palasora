"""Civic: the Town Hall and the Harbour, the only two mints (Doc 04 section 4; Doc 05 section 2, Civic part).

* The Town Hall issues starting balances, the new player's grant and civic wages, and receives (destroys) plot and
  building payments, upkeep and decor. The Harbour sells materials at a fixed price (destroyed) and buys surplus crops
  and tools at the floor price (created). Neither ever spends outside the weekly budget (issuance.weekly):
      budget = growth part (from the money growth target, x the thermostat) + Sora destroyed this week (recycled)
  so NET growth per resident stays on the target. Starting money for new residents is population, not growth.
* Pacing: the growth part is released evenly over the week; recycled Sora is available as soon as it is destroyed.
  The day's spending happens in the Pay step (20:00), civic wages first, then Harbour floor buying.
* The civic job is always open. If the day's budget cannot cover every civic wage, each civic worker is paid the same
  share (the shortfall is recorded); the Town Hall never pays outside its budget.
"""
from __future__ import annotations

import hashlib
import math

from .. import db, issuance, ledger
from . import delivery, goods
from .params import C
from .world import CIVIC, WORK_HOURS, Agent, Biz

TOWN_HALL = ledger.TOWN_HALL
HARBOUR = ledger.HARBOUR
HARBOUR_DOCK = "platform:harbour"   # goods holder: cargo waits here for a cart


def setup(w) -> None:
    """Sim switches: no weekly floor (recycling replaces it) and the growth target from the parameters."""
    for k, v in (("SORA_WEEKLY_FLOOR", "0"), ("SORA_GROWTH_TARGET", str(w.p.growth_target))):
        w.con.execute("INSERT INTO switches(key, value, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                      (k, v, "sim", db.now()))


def population_issue(w, a_or_acct, amount: int, rule: str) -> int:
    acct = a_or_acct.acct if isinstance(a_or_acct, Agent) else a_or_acct.acct if isinstance(a_or_acct, Biz) else a_or_acct
    return w.issue(TOWN_HALL, acct, amount, rule=rule, ref_type="population", ref_id=acct[1])


def budget_left_today(w, paced: bool = True) -> tuple[int, dict]:
    """What the Town Hall may still issue today. The growth part and the carry from earlier weeks are paced over the
    week (a seventh a day) for the Harbour floor and civic projects; civic wages come first and may use the whole week's
    budget left (paced=False), so the always-open civic job is paid in full whenever the town's sinks allow."""
    wk = issuance.weekly(w.con)
    days = int((w.ts() - wk["week_start"]) // 86400) + 1
    if wk["source"] == "setting" or not paced:
        allowed = wk["budget"]
    else:
        growth_part = wk["budget"] - wk["recycled"]
        paced_part = (growth_part + wk.get("carry", 0)) * min(days, 7) // 7
        allowed = paced_part + wk["recycled"] - wk.get("carry", 0)
    return max(0, allowed - wk["used"]), wk


def civic_wages(w) -> dict:
    p = w.p
    due = []
    for a in w.agents.values():
        hrs = a.hours.get(CIVIC, 0)
        if hrs:
            due.append((a, p.civic_wage * hrs // len(WORK_HOURS)))
    total = sum(d for _, d in due)
    left, _ = budget_left_today(w, paced=False)
    share = 1.0 if total <= left else (left / total if total else 1.0)
    paid = 0
    for a, d in due:
        amt = int(d * share)
        if amt > 0:
            w.issue(TOWN_HALL, a.acct, amt, rule="civic_wage", ref_type="civic", ref_id=a.id)
            a.last_paid_tick = w.tick
            paid += amt
    if share < 1.0:
        w.flags["civic_shortfall_days"] += 1
        w.event("civic_shortfall", ["town_hall"], f"The Town Hall's budget covered {share:.0%} of civic wages today", visibility="staff",
                refs={"due": total, "paid": paid})
    if w.metrics is not None:
        w.metrics.count("civic_paid", paid)
        w.metrics.count("civic_due", total)
    return {"due": total, "paid": paid, "share": share}


def queue_starter_grant(w, a) -> bool:
    """The new player's one-time starter grant (owner decision after the Phase 3 gates): queued once per person (keyed
    by the person, not the agent, so a second arrival of the same person gets nothing) and paid by the Town Hall from
    its weekly issuance budget, so unlike the arrival grant it counts against the money growth target."""
    if a.kind != "player" or w.p.starter_grant <= 0:
        return False
    # each person's grant falls due on a seeded day in the spread, so a crowd that arrives together does not get its
    # grants (and open its stalls) on the same day (owner decision after the second gate run)
    spread = max(1, w.p.starter_grant_spread_days)
    offset = int(hashlib.sha256(f"{w.seed}:{a.owner_key}".encode()).hexdigest(), 16) % spread
    due = w.tick + (w.p.starter_grant_after_days + offset) * 24
    cur = w.con.execute("""INSERT OR IGNORE INTO starter_grants(person, agent, amount, queued_tick, due_tick, status)
                           VALUES (?,?,?,?,?,'queued')""", (a.owner_key, a.id, w.p.starter_grant, w.tick, due))
    return cur.rowcount == 1


def starter_grants(w) -> int:
    """Pay starter grants that have come due (5 to 9 days after arrival, seeded per person, so the first stall stays
    about a week of work away, Doc 04 section 3) first come, first served, within the week's budget left. They come before the
    day's civic wages: a grant turns a civic worker into a stall owner, which frees the civic payroll it would otherwise
    keep drawing. A grant the budget cannot cover today waits for the next day; it is never paid in part."""
    left, _ = budget_left_today(w, paced=False)
    paid = 0
    for r in w.con.execute("""SELECT person, agent, amount FROM starter_grants WHERE status='queued' AND due_tick <= ?
                              ORDER BY due_tick, person""", (w.tick,)).fetchall():
        if r["amount"] > left or r["agent"] not in w.agents:
            break
        a = w.agents[r["agent"]]
        w.issue(TOWN_HALL, a.acct, r["amount"], rule="starter_grant", ref_type="starter_grant", ref_id=r["person"])
        w.con.execute("UPDATE starter_grants SET status='paid', paid_tick=? WHERE person=?", (w.tick, r["person"]))
        w.event("starter_grant", [a.id, "town_hall"], f"The Town Hall paid {a.id} a starter grant of {r['amount'] // C} Sora", visibility="owner",
                refs={"agent": a.id, "amount": r["amount"]})
        left -= r["amount"]
        paid += r["amount"]
    if w.metrics is not None:
        w.metrics.count("starter_paid", paid)
    return paid


def floor_price(w, good: str) -> int:
    ref = {"crops": w.p.crop_ref, "tools": w.p.tool_ref}[good]
    return max(1, int(ref * w.p.floor_pct))


def harbour_buys(w, offers: list[tuple[Biz, str, int]]) -> int:
    """Buy the day's floor offers in business id order, within the budget left after civic wages."""
    left, _ = budget_left_today(w)
    bought = 0
    for b, good, qty in sorted(offers, key=lambda o: (o[0].id, o[1])):
        if b.status != "open":
            continue
        fp = floor_price(w, good)
        qty = min(qty, goods.free(w.con, b.holder, good), left // fp if fp else 0)
        if qty <= 0:
            continue
        amt = fp * qty
        w.issue(HARBOUR, b.acct, amt, rule="harbour_floor", ref_type="business", ref_id=b.id)
        goods.destroy(w.con, w.tick, b.holder, good, qty, "exported", "harbour_floor", b.id)
        b.day["revenue"] = b.day.get("revenue", 0) + amt
        b.day["floor"] = b.day.get("floor", 0) + qty
        left -= amt
        bought += amt
    if w.metrics is not None:
        w.metrics.count("floor_paid", bought)
    return bought


def project_buys(w) -> int:
    """The voted civic project (building it, town upkeep) buys tools and crops from the town's businesses at the
    reference price with whatever the day's budget has left, so recycled Sora goes back into the town instead of
    vanishing. Only stock above what a business has promised under contracts is bought; the goods are used up."""
    from . import business as B
    left, _ = budget_left_today(w)
    # today's own surplus (Sora destroyed today, less what was issued against the budget today) and a steady trickle of
    # the rest: civic projects never spend reserves in a lump, so they smooth the money supply instead of moving it
    t0 = w.ts(w.day * 24)
    today = issuance.supply(w.con, before=w.ts() + 1, since=t0)["destroyed"] - issuance._used_between(w.con, t0, w.ts() + 1)
    wk = issuance.weekly(w.con)
    trickle = 0 if wk["source"] == "setting" else max(0, (wk["budget"] - wk["recycled"] + wk.get("carry", 0)) // 7)
    left = min(left, max(0, today) + trickle)  # plus a seventh of the week's growth part and of last week's carry
    spent = 0
    for good, btype in (("tools", "workshop"), ("crops", "farm")):
        sellers = [b for b in w.open_biz() if b.type == btype]
        offers = []
        for b in sellers:
            spare = goods.free(w.con, b.holder, good) - B.committed_out(w, b) - (2 if good == "tools" else 10)
            if spare > 0:
                offers.append((b, spare))
        price = w.ref_price(good)
        total = sum(q for _, q in offers)
        if not total or left < price:
            continue
        share = min(1.0, (left // 2 if good == "tools" else left) / (total * price))
        for b, q in offers:
            n = int(q * share)
            if n <= 0:
                continue
            amt = n * price
            w.issue(TOWN_HALL, b.acct, amt, rule="civic_project", ref_type="business", ref_id=b.id)
            goods.destroy(w.con, w.tick, b.holder, good, n, "worn", "civic_project", b.id)
            b.day["revenue"] = b.day.get("revenue", 0) + amt
            b.day["sold"] = b.day.get("sold", 0) + n
            left -= amt
            spent += amt
    # what is left of the day's share pays the civic project's crew (today's civic workers) a bonus of up to one civic
    # wage, so recycled Sora always finds its way back even when no business has spare goods to sell
    crew = sorted((a for a in w.agents.values() if a.hours.get(CIVIC, 0)), key=lambda a: a.id)
    if crew and left > 0:
        each = min(left // len(crew), w.p.civic_wage)
        if each > 0:
            for a in crew:
                w.issue(TOWN_HALL, a.acct, each, rule="civic_project", ref_type="civic", ref_id=a.id)
                spent += each
    if w.metrics is not None:
        w.metrics.count("project_paid", spent)
    return spent


def import_materials(w, b: Biz, qty: int) -> dict:
    """The Harbour sells materials at its fixed price; the coins are destroyed. The cargo then goes by cart."""
    price = w.material_price()
    w.sink(b.acct, HARBOUR, price * qty, rule="import", ref_type="business", ref_id=b.id)
    b.day["costs"] = b.day.get("costs", 0) + price * qty
    b.day["inputs"] = b.day.get("inputs", 0) + price * qty
    goods.create(w.con, w.tick, HARBOUR_DOCK, "materials", qty, "imported", "business", b.id)
    return delivery.dispatch(w, src=HARBOUR_DOCK, dst=b.holder, good="materials", qty=qty, payer=b.acct, ref_type="import", ref_id=b.id)


def import_crops(w, b: Biz, qty: int) -> dict:
    """Bigger businesses: a food factory short of local crops buys them off the boats at a premium; the coins are
    destroyed like any import, and the cargo goes by cart. The owner tops up the factory's cash first if it must."""
    from .business import top_up
    cost = int(w.p.crop_ref * w.p.crop_import_markup) * qty
    if w.bal(b.acct) < cost:
        top_up(w, b, cost - w.bal(b.acct))
    if w.bal(b.acct) < cost:
        return {"imported": 0}
    w.sink(b.acct, HARBOUR, cost, rule="import", ref_type="business", ref_id=b.id)
    b.day["costs"] = b.day.get("costs", 0) + cost
    b.day["inputs"] = b.day.get("inputs", 0) + cost
    goods.create(w.con, w.tick, HARBOUR_DOCK, "crops", qty, "imported", "business", b.id)
    return delivery.dispatch(w, src=HARBOUR_DOCK, dst=b.holder, good="crops", qty=qty, payer=b.acct, ref_type="import", ref_id=b.id)


def buy_decor(w, a: Agent, amount: int) -> None:
    """Cosmetics bought with coins (a sink, Doc 04 section 4). An owner's decor lifts its first business's rating a little."""
    w.sink(a.acct, TOWN_HALL, amount, rule="decor", ref_type="agent", ref_id=a.id)
    a.decor += amount
    if a.businesses:
        b = w.biz[a.businesses[0]]
        if b.status == "open":
            b.rating = min(1.3, b.rating + amount / (2000 * C))


def per_resident_index_week(w, days: list[dict]) -> float:
    """Annualised growth of the chain-linked Sora-per-resident index over the given daily records."""
    f = 1.0
    for d in days:
        f *= d["chain"]
    n = len(days)
    return f ** (365 / n) - 1 if n else 0.0


def weekly_close(w, week_days: list[dict]) -> dict | None:
    """End of a simulated week: store measured growth and let the thermostat set next week's multiplier."""
    if not week_days:
        return None
    g = per_resident_index_week(w, week_days)
    return issuance.record_growth(w.con, issuance.week_label(w.ts() - 3600), g, tuple(w.p.growth_band))


VOTE_OPTIONS = ("street lights on the market square", "a new jetty at the harbour", "shade trees on the main road")


def weekly_vote(w) -> str:
    """The weekly vote runs on test requests (Doc 05 section 11): each resident votes; the winner is recorded."""
    rng = w.rng["agents"]
    ballots: dict[str, int] = {o: 0 for o in VOTE_OPTIONS}
    for a in w.residents():
        ballots[VOTE_OPTIONS[rng.randrange(len(VOTE_OPTIONS))]] += 1
    winner = sorted(ballots.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    import json
    wk = issuance.week_label(w.ts())
    w.con.execute("INSERT OR REPLACE INTO votes(week, options, asked_by, ballots, winner) VALUES (?,?,?,?,?)",
                  (wk, json.dumps(VOTE_OPTIONS), json.dumps(["test-request"]), json.dumps(ballots, sort_keys=True), winner))
    w.event("vote_result", ["town_hall"], f"This week's vote chose: {winner}", visibility="public", refs={"week": wk})
    return winner


def floor_cap(w, good: str) -> int:
    return w.p.floor_daily_cap_units.get(good, 0)

