"""Business: farms, workshops, food stalls and delivery: production, wages, upkeep, building and closing (Doc 04 section 2).

Production, wages and upkeep are the tick's own steps. Building, closing, hiring and prices change only through the
Actions gate (actions.py), which calls the functions here after its checks.

Profit is kept per business per day on a cash basis: revenue (meals, contracts, Market Hall, floor sales, delivery fees)
minus costs (inputs, delivery fees, wages, upkeep, imports). Payback = build cost / median daily profit (Doc 05 section 7).
"""
from __future__ import annotations

import math

from .. import ledger
from . import delivery, goods
from .params import C
from .world import CIVIC, WORK_HOURS, Agent, Biz

COUNTERS = ("revenue", "costs", "sold", "made", "wages", "upkeep", "inputs", "out_hours", "empty_hours", "trading_hours", "sold_out", "labour_bound", "offered", "floor")


def new_day(b: Biz) -> None:
    b.day = {k: 0 for k in COUNTERS}
    b.loads_today = 0


def add(b: Biz, key: str, v: int) -> None:
    b.day[key] = b.day.get(key, 0) + v


def daily_capacity(w, b: Biz) -> int:
    p = w.p
    lab = b.labour(w)
    return {"farm": int(p.farm_crops_per_worker * lab * w.mod["farm_output"]), "workshop": p.workshop_tools_per_worker * lab,
            "stall": p.stall_meals_per_worker * lab, "delivery": p.delivery_loads_per_worker * lab, "factory": p.factory_meals_per_worker * lab}[b.type]


def promise_capacity(w, b: Biz) -> int:
    """What a seller may promise a day: its labour's output; a factory counts at least one pair of hands, since it hires
    to fill the orders it takes."""
    if b.type == "factory":
        return w.p.factory_meals_per_worker * max(1, b.labour(w))
    return daily_capacity(w, b)


def output_good(t: str) -> str | None:
    return {"farm": "crops", "workshop": "tools", "stall": "meals", "factory": "meals"}.get(t)


def input_good(t: str) -> str | None:
    return {"farm": "tools", "workshop": "materials", "stall": "crops", "factory": "crops"}.get(t)


def committed_out(w, b: Biz) -> int:
    """Units a day this business has promised to deliver tomorrow under active contracts."""
    return w.con.execute("SELECT COALESCE(SUM(qty_per_day),0) s FROM contracts WHERE seller=? AND status='active' AND end_day > ?",
                         (b.id, w.day)).fetchone()["s"]


def contracted_in(w, b: Biz) -> int:
    """Units a day due to arrive tomorrow (contracts that end today no longer count, so they are renewed in time)."""
    return w.con.execute("SELECT COALESCE(SUM(qty_per_day),0) s FROM contracts WHERE buyer=? AND status='active' AND end_day > ?",
                         (b.id, w.day)).fetchone()["s"]


def input_use_per_day(w, b: Biz) -> float:
    """Units of input it expects to use a day."""
    p = w.p
    if b.type == "stall":
        return max(b.ema_demand, 10.0)
    if b.type == "farm":
        return max(b.ema_demand, p.farm_crops_per_worker * 0.5) / p.crops_per_tool
    if b.type == "workshop":
        return max(b.ema_demand, 2.0)
    if b.type == "factory":
        return max(float(committed_out(w, b)), b.ema_demand, 20.0)
    return 0.0


def stock_target(w, b: Biz) -> int:
    """How much output to hold before production idles."""
    if b.type == "stall":
        return int(max(b.ema_demand, 10) * 0.75) + 4      # a session and a half of meals
    if b.type == "farm":
        return committed_out(w, b) * 2 + w.p.floor_daily_cap_units["crops"] + 40
    if b.type == "workshop":
        return committed_out(w, b) * 3 + w.p.floor_daily_cap_units["tools"] + 4
    if b.type == "factory":
        return committed_out(w, b) + 10
    return 0


# --------------------------------------------------------------------------- the Produce step
def produce(w) -> None:
    if w.hour not in WORK_HOURS:
        return
    con, p = w.con, w.p
    for b in w.open_biz():
        og = output_good(b.type)
        if og is None:
            continue
        lab = b.labour(w)
        have = goods.free(con, b.holder, og)
        if have or goods.free(con, b.holder, input_good(b.type) or og):
            b.acc["trading"] = 1  # open for trade from the first hour it has something to sell or make (fitting out before that)
        if b.acc.get("trading"):
            add(b, "trading_hours", 1)
        if lab == 0:
            if have == 0 and b.acc.get("trading") and b.type != "stall":
                add(b, "empty_hours", 1)
            continue
        per_day = daily_capacity(w, b)
        target = stock_target(w, b)
        if have >= target:
            continue
        b.acc[og] = b.acc.get(og, 0.0) + per_day / len(WORK_HOURS)
        n = min(int(b.acc[og]), target - have)
        if n <= 0:
            if have == 0 and b.acc.get("trading") and b.type != "stall":
                add(b, "empty_hours", 1)
            continue
        if b.type == "farm":
            tools = goods.free(con, b.holder, "tools")
            if (b.since_tool + n) // p.crops_per_tool > tools:
                n = max(0, (tools + 1) * p.crops_per_tool - 1 - b.since_tool)
                add(b, "out_hours", 1)
            if n > 0:
                worn = (b.since_tool + n) // p.crops_per_tool
                if worn:
                    goods.destroy(con, w.tick, b.holder, "tools", worn, "worn", "business", b.id)
                b.since_tool = b.since_tool + n - worn * p.crops_per_tool
        else:
            ig = input_good(b.type)
            avail = goods.free(con, b.holder, ig)
            if avail < n:
                n = avail
                add(b, "out_hours", 1)
            if n > 0:
                _consume(w, b, ig, n)
        if n > 0:
            goods.create(con, w.tick, b.holder, og, n, "made", "business", b.id)
            b.acc[og] -= n
            add(b, "made", n)
        elif have == 0 and b.acc.get("trading") and b.type != "stall":
            add(b, "empty_hours", 1)  # a farm or workshop with nothing on hand and nothing made this hour  # nothing on the shelf and nothing made this hour: out of stock (Gate A)
        if n == 0 or b.acc[og] > per_day / len(WORK_HOURS) * 2:
            b.acc[og] = min(b.acc[og], per_day / len(WORK_HOURS))
        if per_day and n >= int(per_day / len(WORK_HOURS)) and have + n < target:
            add(b, "labour_bound", 1)


def _consume(w, b: Biz, good: str, n: int) -> None:
    """Inputs used up in production (crops cooked into meals, materials made into tools) are logged as 'worn'."""
    goods.destroy(w.con, w.tick, b.holder, good, n, "worn", "input", b.id)


# --------------------------------------------------------------------------- the Pay step (20:00)
def pay_wages_and_upkeep(w) -> None:
    from .civic import TOWN_HALL
    p = w.p
    for b in w.open_biz():
        for wid in list(b.workers):
            a = w.agents[wid]
            hrs = a.hours.get(b.id, 0)
            due = b.wage * hrs // len(WORK_HOURS)
            if due <= 0:
                continue
            if w.bal(b.acct) < due:
                top_up(w, b, due - w.bal(b.acct))
            amt = min(due, w.bal(b.acct))
            if amt > 0:
                w.pay(b.acct, a.acct, amt, kind="wage", rule="wage", ref_type="business", ref_id=b.id)
                add(b, "wages", amt)
                add(b, "costs", amt)
                a.last_paid_tick = w.tick
            if amt < due:
                w.set_job(a, None)
                w.event("worker_left", [a.id, b.owner, b.id], f"A worker left {b.id}: wages could not be paid in full", visibility="owner", refs={"business": b.id})
        due = p.plot_upkeep
        if w.bal(b.acct) < due:
            top_up(w, b, due - w.bal(b.acct))
        if w.bal(b.acct) >= due:
            w.sink(b.acct, TOWN_HALL, due, rule="plot_upkeep", ref_type="business", ref_id=b.id)
            add(b, "upkeep", due)
            add(b, "costs", due)
        else:
            b.day["unpaid_upkeep"] = 1


def top_up(w, b: Biz, need: int) -> int:
    """The owner puts money into the business (owner capital), if they have it."""
    o = w.agents[b.owner]
    amt = min(need, w.bal(o.acct))
    if amt > 0:
        w.pay(o.acct, b.acct, amt, kind="transfer", rule="owner_capital", ref_type="business", ref_id=b.id)
    return amt


def working_capital(w, b: Biz) -> int:
    hist = b.history[-7:]
    avg_costs = (sum(d["costs"] for d in hist) / len(hist)) if hist else 60 * C
    return int(avg_costs * w.p.working_capital_days) + 50 * C


def owner_draw(w) -> None:
    for b in w.open_biz():
        extra = w.bal(b.acct) - working_capital(w, b)
        if extra > 0:
            w.pay(b.acct, w.agents[b.owner].acct, extra, kind="transfer", rule="owner_draw", ref_type="business", ref_id=b.id)


# --------------------------------------------------------------------------- building and closing (called by the gate)
def build(w, a: Agent, btype: str, plot_id: str, *, founder_plot: bool = False, plot_price: int | None = None, label: str = "") -> Biz:
    """Build on a plot. The build cost includes the plot share; a founder's plot is already paid for, and a plot bought at
    its listed price (`plot_price`, step 3) replaces the plot share with that price."""
    from .civic import TOWN_HALL
    p = w.p
    cost = p.build_cost[btype]
    pay = cost - (p.plot_share if founder_plot else 0)
    if plot_price is not None:
        cost = cost - p.plot_share + plot_price
        pay = cost
    bid = f"b{len(w.biz) + 1:03d}"
    w.sink(a.acct, TOWN_HALL, pay, rule="build", ref_type="business", ref_id=bid)
    pl = w.plots[plot_id]
    price = p.type_ref(btype)
    b = Biz(id=bid, type=btype, plot=plot_id, owner=a.id, xy=(pl["x"], pl["y"]), price=price, wage=p.wage_ref, cost=cost, opened_tick=w.tick,
            mode=a.mode if a.mode in ("recorded", "live") else "rules")
    b.ema_demand = {"stall": 25.0, "farm": 30.0, "workshop": 4.0, "delivery": 6.0, "factory": 40.0}[btype]
    b.last_change_day = w.day
    new_day(b)
    w.biz[bid] = b
    pl["owner"], pl["building"], pl["level"] = a.id, btype, 1
    w.con.execute("UPDATE plots SET owner=?, building=?, level=1 WHERE id=?", (a.id, btype, plot_id))
    a.businesses.append(bid)
    if a.first_business_tick is None:
        a.first_business_tick = w.tick
    w.save_biz(b)
    mint_shares(w, b, a)
    if btype == "factory":  # a line buys a day of crops before it sells a meal: the owner puts in a starting float
        float_ = min(w.bal(a.acct), w.p.factory_float)
        if float_ > 0:
            w.pay(a.acct, b.acct, float_, kind="transfer", rule="owner_capital", ref_type="business", ref_id=bid)
    w.set_job(a, f"own:{bid}")
    w.event("business_opened", [a.id, bid], f"A new {btype} opened on plot {plot_id}{label}", visibility="public",
            refs={"business": bid, "plot": plot_id, "cost": cost})
    return b


def open_cart(w, a: Agent, kerb: str) -> Biz:
    """A food cart (step 3): a stall with no plot of its own, parked at the kerb of a free business plot. It costs the
    cart, sells meals like a stall, and only its owner works it. Settling it on a bought plot (`settle_cart`) turns it
    into a stall with the same company, books and shares."""
    from .civic import TOWN_HALL
    p = w.p
    bid = f"b{len(w.biz) + 1:03d}"
    w.sink(a.acct, TOWN_HALL, p.cart_cost, rule="build", ref_type="business", ref_id=bid)
    pl = w.plots[kerb]
    b = Biz(id=bid, type="stall", plot=kerb, owner=a.id, xy=(pl["x"], pl["y"] + 0.45), price=p.meal_ref, wage=p.wage_ref, cost=p.cart_cost,
            opened_tick=w.tick, mode=a.mode if a.mode in ("recorded", "live") else "rules", cart=True)
    b.ema_demand = 10.0
    b.last_change_day = w.day
    new_day(b)
    w.biz[bid] = b
    a.businesses.append(bid)
    if a.first_business_tick is None:
        a.first_business_tick = w.tick
    w.save_biz(b)
    mint_shares(w, b, a)
    w.set_job(a, f"own:{bid}")
    w.event("cart_opened", [a.id, bid], f"A food cart started trading by plot {kerb}", visibility="public", refs={"business": bid, "plot": kerb, "cart": True})
    return b


def settle_cart(w, a: Agent, b: Biz, plot_id: str, plot_price: int) -> int:
    """A cart moves onto a bought plot and becomes a stall: the plot price and the stall's construction are paid, less what
    the cart cost (the cart is built into the stall). Returns what was paid."""
    from .civic import TOWN_HALL
    p = w.p
    cost = p.build_cost["stall"] - p.plot_share + plot_price
    pay = max(0, cost - b.cost)
    w.sink(a.acct, TOWN_HALL, pay, rule="build", ref_type="business", ref_id=b.id)
    pl = w.plots[plot_id]
    b.cart, b.plot, b.xy, b.cost = False, plot_id, (pl["x"], pl["y"]), cost
    b.last_change_day = w.day
    pl["owner"], pl["building"], pl["level"] = a.id, "stall", b.level
    w.con.execute("UPDATE plots SET owner=?, building='stall', level=? WHERE id=?", (a.id, b.level, plot_id))
    w.save_biz(b)
    w.event("cart_settled", [a.id, b.id], f"The food cart {b.id} settled on plot {plot_id} and became a stall", visibility="public",
            refs={"business": b.id, "plot": plot_id, "cost": cost})
    return pay


def mint_shares(w, b: Biz, a: Agent) -> None:
    """Every new business is a company from day one: its founder holds 1,000 shares (Doc 04 section 8)."""
    asset = f"SHR:{b.id}"
    mint = ledger.account(w.con, "platform", f"mint:{b.id}", asset)
    hold = ledger.account(w.con, a.owner_kind, a.id, asset, a.owner_key)
    ledger.transfer(w.con, kind="ipo_shares", idem_key=f"shares:{b.id}", src=mint["id"], src_bucket="available", dst=hold["id"], dst_bucket="available",
                    asset=asset, amount=1000, txn_id=f"t{w.tick}", ref_type="business", ref_id=b.id)


def close(w, b: Biz, reason: str) -> None:
    """Close a business: workers are let go, contracts end, leftover goods stay with the business account's owner
    (moved to the owner) and the plot returns to the Town Hall. Its build cost is gone (it was destroyed when paid)."""
    o = w.agents[b.owner]
    for wid in list(b.workers):
        w.set_job(w.agents[wid], None)
    w.con.execute("UPDATE contracts SET status='ended' WHERE (seller=? OR buyer=?) AND status='active'", (b.id, b.id))
    for r in w.con.execute("SELECT * FROM goods_orders WHERE holder=? AND status IN ('open','partial')", (b.holder,)).fetchall():
        from .market import cancel
        cancel(w, r["id"], "business closed")
    for g in ("crops", "meals", "tools", "materials"):
        n = goods.free(w.con, b.holder, g)
        if n > 0:
            goods.move(w.con, w.tick, b.holder, o.holder, g, n, "close", b.id)
    from . import shares
    shares.wind_up(w, b)  # a listed business shares out its cash among all its shareholders and leaves the Exchange
    cash = w.bal(b.acct)
    if cash > 0:
        w.pay(b.acct, o.acct, cash, kind="transfer", rule="owner_draw", ref_type="business", ref_id=b.id)
    b.status, b.closed_tick = "closed", w.tick
    if not b.cart:  # a cart never held its plot
        w.plots[b.plot].update(owner="", building="", level=0)
        w.con.execute("UPDATE plots SET owner='', building='', level=0 WHERE id=?", (b.plot,))
    if o.job == f"own:{b.id}":
        nxt = next((x for x in o.businesses if x != b.id and w.biz[x].status == "open"), None)
        w.set_job(o, f"own:{nxt}" if nxt else None)
    o.closed_at.append(w.tick)
    w.save_biz(b)
    w.event("business_closed", [o.id, b.id], f"{b.type.capitalize()} {b.id} closed: {reason}", visibility="public", refs={"business": b.id, "reason": reason})


def end_of_day(w) -> None:
    """Close the day's books for every open business (23:00)."""
    for b in list(w.biz.values()):
        if b.status != "open":
            continue
        d = dict(b.day)
        d["profit"] = d.get("revenue", 0) - d.get("costs", 0)
        d["day"] = w.day
        d["price"] = b.price
        d["labour"] = b.labour(w)
        b.history.append(d)
        b.loss_streak = b.loss_streak + 1 if d["profit"] < 0 else 0
        sold = d.get("sold", 0) + d.get("turned_away", 0)  # demand, not just sales: a stall that ran out still saw the queue
        b.ema_demand = 0.7 * b.ema_demand + 0.3 * sold if b.history[:-1] else max(b.ema_demand, sold)
        w.save_biz(b)
        new_day(b)


def median(xs: list) -> float:
    s = sorted(xs)
    n = len(s)
    if not n:
        return 0.0
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def payback_days(b: Biz, last: int = 7) -> float | None:
    hist = b.history[-last:]
    if len(hist) < last:
        return None
    m = median([d["profit"] for d in hist])
    return b.cost / m if m > 0 else math.inf


def is_civic(a: Agent) -> bool:
    return a.job == CIVIC
