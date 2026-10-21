"""The hourly tick (Doc 05 section 4). Each tick runs the same steps in the same order, inside one transaction:

 1. Clock: advance one hour; daily and weekly jobs run at their set hours.
 2. Arrivals and scenario events.
 3. Decide: each agent proposes actions (rules every hour; an AI plan at 06:00 or on a trigger).
 4. Act: every proposal passes the Actions gate in a fixed order (by actor id), then is applied or refused.
 5. Produce: farms grow crops, workshops make tools, stalls cook meals, tools wear.
 6. Move: contract goods leave at 06:00; deliveries progress and arrive.
 7. Trade: the Market Hall expires old orders; residents choose stalls and eat (12:00 and 18:00).
 8. Pay (20:00): wages, upkeep, Town Hall civic pay, Harbour floor purchases, owner draws.
 9. Check: the conservation checks run; any failure stops the run (the caller saves the tick).
10. Record: 07:00 morning messages; 23:00 the day's books, metrics and (on Sunday) the thermostat.
"""
from __future__ import annotations

import math

from .. import db
from . import actions, agents, business as B, civic, contracts, delivery, goods, market, reports
from .world import CIVIC, MEAL_HOURS, WORK_HOURS, World


def run_tick(w: World, checker) -> None:
    con = w.con
    with db.clock(lambda: w.ts()):
        con.execute("BEGIN IMMEDIATE")
        try:
            _steps(w)
            checker.tick(w.tick)
        except BaseException:
            con.execute("ROLLBACK")
            raise
        con.execute("COMMIT")
    w.tick += 1


def _steps(w: World) -> None:
    h = w.hour
    # 1. clock
    if h == 0:
        for a in w.agents.values():
            a.spent_today, a.hours, a.meals_today = 0, {}, 0
        w.floor_offers = []
        w._today_events = None
    # 2. arrivals and scenario events
    if w.scenario is not None:
        w.scenario.on_tick(w)
    if h == 10 and w.day % 7 == 0:
        civic.weekly_vote(w)
    # 3. decide, 4. act
    act(w, agents.decide(w))
    # 5. produce
    if h in WORK_HOURS:
        for a in w.agents.values():
            if a.job and not a.job.startswith("own:"):
                a.hours[a.job] = a.hours.get(a.job, 0) + 1
        B.produce(w)
    # 6. move
    if h == 6:
        contracts.dispatch_day(w)
    delivery.arrive(w)
    # 7. trade
    market.expire(w)
    if h in MEAL_HOURS:
        meals(w)
    # 8. pay
    if h == 20:
        B.pay_wages_and_upkeep(w)
        civic.starter_grants(w)
        civic.civic_wages(w)
        civic.harbour_buys(w, w.floor_offers)
        w.floor_offers = []
        civic.project_buys(w)
        B.owner_draw(w)
    # 10. record
    if h == 7:
        reports.morning(w)
    if h == 23:
        if w.metrics is not None:
            w.metrics.before_close(w)
        B.end_of_day(w)
        signals(w)
        if w.metrics is not None:
            w.metrics.end_of_day(w)
            if w.day % 7 == 6:
                civic.weekly_close(w, w.metrics.days[-7:])


def act(w: World, proposals: list) -> None:
    order = sorted(range(len(proposals)), key=lambda i: (proposals[i][0], i))
    skip_next: set[str] = set()
    for i in order:
        actor, kind, inputs, tag = proposals[i]
        if tag == "mischief" and actor in skip_next:
            skip_next.discard(actor)
            continue
        r = actions.submit(w, actor, kind, via="agent", **inputs)
        if tag == "setup" and not r.ok:
            skip_next.add(actor)
        if tag == "mischief" and w.metrics is not None:
            w.metrics.mischief(actor, kind, r)


def meals(w: World) -> None:
    p = w.p
    rng = w.rng["meals"]
    stalls = [b for b in w.open_biz() if b.type == "stall"]
    left = {b.id: goods.free(w.con, b.holder, "meals") for b in stalls}
    for b in stalls:
        # customers only come at meal times, so a stall is out of stock when a session opens on an empty shelf; each
        # of the two sessions stands for half of its 12 business hours
        if left[b.id] == 0 and b.acc.get("trading"):
            b.day["empty_hours"] = b.day.get("empty_hours", 0) + len(WORK_HOURS) // len(MEAL_HOURS)
    order = sorted(w.agents)
    rng.shuffle(order)
    for aid in order:
        a = w.agents[aid]
        if a.meals_today >= p.meals_per_day:
            continue
        own = next((x for x in a.businesses if x in left and left[x] > 0), None)
        if own:
            if actions.submit(w, a.id, "eat_own", business=own).ok:
                left[own] -= 1
                a.meals_today += 1
                continue
        cash = w.bal(a.acct)
        best, best_u, first = None, -math.inf, None
        scored = []
        for b in stalls:
            if b.owner == a.id or b.price > cash:
                continue
            u = -4.0 * b.price / p.meal_ref - 0.25 * w.dist(a.home, b.xy) + 2.0 * b.rating - math.log(-math.log(max(rng.random(), 1e-12)))
            scored.append((u, b.id, b))
        scored.sort(key=lambda t: (-t[0], t[1]))
        for k, (u, bid, b) in enumerate(scored):
            if left[bid] <= 0:
                if k == 0:
                    b.day["turned_away"] = b.day.get("turned_away", 0) + 1
                continue
            best = b
            break
        if best is None:
            a.hungry += 1
            if w.metrics is not None:
                w.metrics.count("hungry", 1)
            continue
        if actions.submit(w, a.id, "buy_meal", business=best.id).ok:
            left[best.id] -= 1
            a.meals_today += 1


def signals(w: World) -> None:
    """Yesterday's signals that agents read: where there is room for a new business and how crowded each trade is.
    Room means a shortage (customers turned away or hungry, stalls out of crops, farms out of tools, goods fetched by
    hand for want of a cart) or a trade that pays back faster than the middle of its lane (Doc 04 rule 1)."""
    p = w.p
    by = {t: [b for b in w.open_biz() if b.type == t] for t in ("stall", "farm", "workshop", "delivery")}
    last = {b.id: (b.history[-1] if b.history and b.history[-1]["day"] == w.day else {}) for b in w.open_biz()}
    n = len(w.residents())
    demand = n * p.meals_per_day
    m = w.metrics.today if w.metrics is not None else {}
    turned = sum(last[b.id].get("turned_away", 0) for b in by["stall"])
    hungry = m.get("hungry", 0) if m else w.flags.get("hungry_today", 0)
    shortage = {
        "stall": turned >= 0.03 * demand and sum(last[b.id].get("out_hours", 0) for b in by["stall"]) < 3,
        # a supply shortage only counts when the suppliers have nothing spare either (not a late cart or a missing contract)
        "farm": sum(last[b.id].get("out_hours", 0) for b in by["stall"]) >= 3
                and sum(goods.free(w.con, b.holder, "crops") - B.committed_out(w, b) for b in by["farm"]) < 0.25 * demand,
        "workshop": sum(last[b.id].get("out_hours", 0) for b in by["farm"]) >= 3
                and sum(goods.free(w.con, b.holder, "tools") - B.committed_out(w, b) for b in by["workshop"]) < 2,
        "delivery": m.get("self_fetch", 0) >= 3 if m else False,
    }
    room, crowd, payback = {}, {}, {}
    for t, bs in by.items():
        lo, hi = p.lanes[p.lane_of[t]]
        mid = (lo + hi) / 2
        prof = [sum(x["profit"] for x in b.history[-3:]) / max(1, len(b.history[-3:])) for b in bs if b.history]
        med = B.median(prof) if prof else None
        pb = (p.build_cost[t] / med) if med and med > 0 else (0.0 if not bs else float("inf"))
        payback[t] = pb
        room[t] = not bs or (pb <= mid and shortage[t]) or pb < lo + (mid - lo) / 2
        crowd[t] = "short" if room[t] else "crowded" if pb > hi else "balanced"
    w.signals = {"room": room, "crowd": crowd, "payback": payback}
