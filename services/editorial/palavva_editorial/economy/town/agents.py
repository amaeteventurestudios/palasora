"""Agents: choosing actions (Doc 04 section 6; Doc 05 sections 2 and 5). Agents never change the records: they return
proposals, and the tick submits every proposal through the Actions gate in a fixed order.

Modes: `rules` (fixed rules, every run), `recorded` / `live` (an AI plan at 06:00 and AI calls on events, within the
daily AI budget; a missing answer falls back to rules), and `mischief` (tries forbidden actions on purpose).
"""
from __future__ import annotations

import json
import math

from .. import ledger
from . import ai, business as B, contracts, delivery, goods
from .params import C, TYPES
from .world import CIVIC, WORK_HOURS, Agent, Biz

Proposal = tuple  # (actor_id, kind, inputs, tag)


def decide(w) -> list[Proposal]:
    h = w.hour
    out: list[Proposal] = []
    if h == 5:
        out += procurement(w)
    if h == 6:
        out += ai_plans(w)
    if h == 7:
        out += imports(w)
    if h in WORK_HOURS:
        out += job_seeking(w)
    if h == 9:
        out += progression(w)
    if h == 20:
        out += sell_surplus(w)
    if h == 19:
        out += decor(w)
    if h == 21:
        out += reviews(w)
    if h in (10, 14, 16):
        out += mischief(w)
    return out


# --------------------------------------------------------------------------- work
def job_seeking(w) -> list[Proposal]:
    openings = sorted((b for b in w.open_biz() if b.acc.get("hiring", 0) > 0 and len(b.workers) < b.max_hires(w.p)), key=lambda b: (-b.wage, b.id))
    out = []
    taken: dict[str, int] = {}
    for a in w.agents.values():
        if a.role in ("sitter",) or (a.job and a.job.startswith("own:")) or (a.job and a.job in w.biz):
            continue
        best = None
        for b in openings:
            if b.owner == a.id or b.wage <= w.p.civic_wage or taken.get(b.id, 0) >= b.acc.get("hiring", 0):
                continue
            best = b
            break
        if best is not None:
            taken[best.id] = taken.get(best.id, 0) + 1
            out.append((a.id, "apply_job", {"employer": best.id}, ""))
        elif a.job is None:
            out.append((a.id, "apply_job", {"employer": CIVIC}, ""))
    return out


# --------------------------------------------------------------------------- inputs
def procurement(w) -> list[Proposal]:
    out = []
    p = w.p
    farms = [b for b in w.open_biz() if b.type == "farm"]
    shops = [b for b in w.open_biz() if b.type == "workshop"]
    def can_make(b) -> int:
        """What a seller can really make a day: its labour, capped by the inputs it has or has coming."""
        cap = B.daily_capacity(w, b)
        ig = B.input_good(b.type)
        inputs = goods.free(w.con, b.holder, ig) + delivery.incoming(w, b.holder, ig) + B.contracted_in(w, b)
        return min(cap, inputs * p.crops_per_tool if b.type == "farm" else inputs)
    spare = {b.id: can_make(b) - B.committed_out(w, b) for b in farms + shops}
    # stock already on the shelf beyond what contracts need can go out on short (2-day) contracts
    stock = {b.id: max(0, (goods.free(w.con, b.holder, B.output_good(b.type)) - 2 * B.committed_out(w, b) - 10) // 2) for b in farms + shops}
    for b in w.open_biz():
        if b.type not in ("stall", "farm"):
            continue
        good = B.input_good(b.type)
        days = b.acc.get("stock_days", 2)
        use = B.input_use_per_day(w, b)
        have = goods.free(w.con, b.holder, good) + delivery.incoming(w, b.holder, good)
        contracted = B.contracted_in(w, b)
        if b.type == "stall":
            last = b.history[-1] if b.history else {}
            need = math.ceil(max(use, last.get("sold", 0) + last.get("turned_away", 0)) * p.stall_stock_cover) + p.stall_stock_extra
            gap = need - contracted
            if have > use * (days + 1):
                gap = min(gap, 0)
            # never promise to buy more a day than the stall and its owner can pay for on dispatch; a stall short of
            # cash signs short contracts and grows them as its takings come in
            afford = (w.bal(b.acct) + w.bal(w.agents[b.owner].acct)) // max(1, int(w.ref_price(good) * 1.4)) - contracted
            k_days = p.contract_days if afford >= gap else 2
            gap = min(gap, afford)
            if gap < 3:
                continue
            per_day = gap
        else:
            # tools for what the farm's whole crew can grow (it hires before it grows), a little over so one late cart
            # does not stop the fields
            need = max(1, math.ceil(max(use, B.daily_capacity(w, b) / p.crops_per_tool) * 1.2))
            gap = need - contracted
            if gap < 1 or have >= need * (days + 3):
                continue
            per_day = gap
            k_days = p.contract_days
        sellers = sorted(farms if good == "crops" else shops, key=lambda s: (s.price, w.dist(s.xy, b.xy), s.id))
        for s in sellers:
            if gap <= 0:
                break
            q = min(gap, spare[s.id])
            if q <= 0 or s.price > w.ref_price(good) * 1.5:
                continue
            spare[s.id] -= q
            gap -= q
            out.append((b.owner, "sign_contract", {"buyer": b.id, "seller": s.id, "good": good, "qty": q, "price": s.price, "days": k_days}, ""))
        for s in sellers:
            if gap <= 0:
                break
            q = min(gap, stock[s.id])
            if q <= 0 or s.price > w.ref_price(good) * 1.5:
                continue
            stock[s.id] -= q
            gap -= q
            out.append((b.owner, "sign_contract", {"buyer": b.id, "seller": s.id, "good": good, "qty": q, "price": s.price, "days": 2}, ""))
        if gap > 0 and have < use:
            price = int(w.ref_price(good) * 1.25)
            q = int(min(gap, w.bal(b.acct) // max(price, 1)))
            if q > 0:
                out.append((b.owner, "place_order", {"good": good, "side": "buy", "price": price, "qty": q, "business": b.id}, ""))
    return out


def imports(w) -> list[Proposal]:
    out = []
    for b in w.open_biz():
        if b.type != "workshop":
            continue
        days = b.acc.get("stock_days", 2)
        rate = B.daily_capacity(w, b)
        demand = max(B.committed_out(w, b), b.ema_demand, 1)
        want = int(min(rate, demand + w.p.floor_daily_cap_units["tools"]) * days)
        have = goods.free(w.con, b.holder, "materials") + delivery.incoming(w, b.holder, "materials")
        q = want - have
        price = w.material_price()
        q = min(q, (w.bal(b.acct) - 20 * C) // price) if price else q
        if q > 0:
            out.append((b.owner, "import_materials", {"business": b.id, "qty": int(q)}, ""))
    return out


def sell_surplus(w) -> list[Proposal]:
    """20:00: surplus above what contracts need goes to the Market Hall (other owners can buy) and to the Harbour's floor."""
    out = []
    for b in w.open_biz():
        g = B.output_good(b.type)
        if g not in ("crops", "tools"):
            continue
        keep = B.committed_out(w, b) * 2 + (2 if g == "tools" else 10)
        free = goods.free(w.con, b.holder, g)
        extra = free - keep
        if extra <= 0:
            continue
        # first to buyers waiting at the Market Hall (other owners only: the Hall never matches an owner with itself)
        me = ledger.trade_owner(w.agents[b.owner].owner_key)
        bids = w.con.execute("SELECT owner_key, price, qty - filled AS q FROM goods_orders WHERE good=? AND side='buy' AND status IN ('open','partial') AND price >= ?",
                             (g, b.price)).fetchall()
        if bids and not any(ledger.trade_owner(r["owner_key"]) == me for r in bids):
            q = min(extra, sum(r["q"] for r in bids))
            if q > 0:
                out.append((b.owner, "place_order", {"good": g, "side": "sell", "price": b.price, "qty": q, "business": b.id}, ""))
                extra -= q
        if extra <= 0:
            continue
        cap = w.p.floor_daily_cap_units[g]
        out.append((b.owner, "sell_floor", {"business": b.id, "good": g, "qty": min(extra, cap)}, ""))
    return out


# --------------------------------------------------------------------------- the daily review (rules)
def reviews(w) -> list[Proposal]:
    out = []
    for b in w.open_biz():
        if b.mode in ("recorded", "live"):
            out += _close_rule(w, b)
            out += ai_events(w, b)
            continue
        out += review_rules(w, b)
    return out


def _bound(w, b: Biz, price: int) -> int:
    a = w.agents[b.owner]
    lo, hi = a.limits.get("price_range", w.p.price_range)
    ref = {"stall": w.p.meal_ref, "farm": w.p.crop_ref, "workshop": w.p.tool_ref, "delivery": w.p.delivery_fee}[b.type]
    floor = {"stall": int(w.p.crop_ref * 2), "farm": int(w.p.crop_ref * w.p.floor_pct * 1.1), "workshop": int(w.material_price() * 1.2),
             "delivery": int(w.p.delivery_fee * 0.6)}[b.type]
    return int(min(max(price, int(lo * ref), floor), int(hi * ref)))


def review_rules(w, b: Biz) -> list[Proposal]:
    p, d = w.p, b.day
    out: list[Proposal] = []
    step = p.price_step
    new = b.price
    cap = B.daily_capacity(w, b)
    if b.type == "stall":
        turned, sold = d.get("turned_away", 0), d.get("sold", 0)
        meals = goods.free(w.con, b.holder, "meals")
        rivals = sorted(x.price for x in w.open_biz() if x.type == "stall" and x.id != b.id)
        med = rivals[len(rivals) // 2] if rivals else b.price
        if turned > 0 and d.get("out_hours", 0) == 0:
            new = int(b.price * (1 + step))
        elif sold < 0.6 * b.ema_demand and meals > 0.3 * b.ema_demand:
            new = int(b.price * (1 - step))
        elif b.price > med * 1.25 and sold < b.ema_demand:
            new = int(b.price * (1 - step))
        if turned > 2 and d.get("labour_bound", 0) >= 2 and len(b.workers) < b.max_hires(p) and _recent(b, 3) >= 0:
            out.append((b.owner, "hire", {"business": b.id}, ""))
        elif b.workers and d.get("made", 0) < 0.45 * cap and _recent(b, 3) < 0:
            out.append((b.owner, "fire", {"business": b.id}, ""))
    elif b.type in ("farm", "workshop"):
        committed = B.committed_out(w, b)
        g = B.output_good(b.type)
        free = goods.free(w.con, b.holder, g)
        if committed >= 0.9 * cap and (free < committed * 2 or w.signals["room"].get(b.type)):
            new = int(b.price * (1 + step))
            if len(b.workers) < b.max_hires(p) and _recent(b, 3) > 0:
                out.append((b.owner, "hire", {"business": b.id}, ""))
            elif (len(b.workers) >= b.max_hires(p) and w.signals["room"].get(b.type) and b.level < 3
                  and w.bal(w.agents[b.owner].acct) >= b.cost // 2 + 50 * C):
                out.append((b.owner, "upgrade", {"business": b.id}, ""))  # full staff, the town short of its goods: grow
        elif committed < 0.5 * cap:
            new = int(b.price * (1 - step))
            if b.workers and committed + p.floor_daily_cap_units[g] < 0.5 * cap and _recent(b, 3) < 0:
                out.append((b.owner, "fire", {"business": b.id}, ""))
    elif b.type == "delivery":
        util = b.loads_today / cap if cap else 1.0
        if util >= 0.9:
            new = int(b.price * (1 + step))
            if len(b.workers) < b.max_hires(p) and _recent(b, 2) >= 0:
                out.append((b.owner, "hire", {"business": b.id}, ""))
        elif util < 0.3:
            new = int(b.price * (1 - step))
            if b.workers and _recent(b, 3) < 0:
                out.append((b.owner, "fire", {"business": b.id}, ""))
    new = _bound(w, b, new)
    if new != b.price:
        out.append((b.owner, "set_price", {"business": b.id, "price": new}, ""))
    out += _close_rule(w, b)
    return _unstick(w, b, out, "")


CHANGES = ("set_price", "hire", "fire", "close_business", "upgrade", "set_wage", "sign_contract", "end_contract")


def _unstick(w, b: Biz, out: list[Proposal], tag: str) -> list[Proposal]:
    """Default (recorded in the PR): an owner losing money two days running who planned no change makes one. Without
    staff to let go it tries the price: down when sales were slow, up when it sold what it had."""
    if b.loss_streak < 2 or any(k in CHANGES for _, k, _, _ in out):
        return out
    if b.workers and _recent(b, 2) < 0:
        return out + [(b.owner, "fire", {"business": b.id}, tag)]
    last = b.history[-1] if b.history else {}
    slow = last.get("sold", 0) < 0.8 * max(b.ema_demand, 1) if b.type == "stall" else B.committed_out(w, b) < 0.7 * max(B.daily_capacity(w, b), 1)
    step = w.p.price_step
    new = _bound(w, b, int(b.price * (1 - step if slow else 1 + step)))
    if new == b.price:
        new = _bound(w, b, int(b.price * (1 + step if slow else 1 - step)))
    if new != b.price:
        out = out + [(b.owner, "set_price", {"business": b.id, "price": new}, tag)]
    return out


def _recent(b: Biz, n: int) -> int:
    return sum(x["profit"] for x in b.history[-n:])


def _close_rule(w, b: Biz) -> list[Proposal]:
    p = w.p
    hist = b.history[-7:]
    if b.loss_streak >= p.close_loss_days and sum(x["profit"] for x in hist) < 0:
        costs = sum(x["costs"] for x in hist) / max(len(hist), 1)
        if w.bal(b.acct) + w.bal(w.agents[b.owner].acct) < costs * 3:
            return [(b.owner, "close_business", {"business": b.id, "reason": f"{b.loss_streak} days of losses and no cash left"}, "")]
    crowd = _crowded_exit(w, b)
    if crowd:
        return crowd
    if b.day.get("unpaid_upkeep") and b.history and b.history[-1].get("unpaid_upkeep"):
        return [(b.owner, "close_business", {"business": b.id, "reason": "could not pay upkeep two days running"}, "")]
    return []


def _crowded_exit(w, b: Biz) -> list[Proposal]:
    """Default (recorded in the PR): a house owner shuts a business that has paid back slower than its lane (with the
    half-lane margin) for a week while others of its kind carry on, so a crowded trade thins out instead of every stall limping along. Only the
    weakest of its trade, only one a day per trade, and never a player's business (players decide for themselves)."""
    p = w.p
    if w.agents[b.owner].kind != "house" or len(b.history) < 10:
        return []
    hist = b.history[-7:]
    med = B.median([x["profit"] for x in hist])
    hi = p.lane_bounds(b.type)[1]
    if med > 0 and p.build_cost[b.type] / med <= hi:
        return []
    if sum(x.get("out_hours", 0) for x in hist) > len(hist) or (B.output_good(b.type) in ("crops", "tools") and any(not x.get("made") for x in hist)):
        return []  # short of inputs, not of customers: that is a supply problem, not a crowd
    rivals = [x for x in w.open_biz() if x.type == b.type and x.id != b.id]
    if len(rivals) < 2 or w.flags.get(f"crowd_exit:{b.type}") == w.day:
        return []
    def score(x):
        return B.median([y["profit"] for y in x.history[-7:]]) if x.history else 0
    if any(score(x) < med and w.agents[x.owner].kind == "house" and len(x.history) >= 10 for x in rivals):
        return []
    w.flags[f"crowd_exit:{b.type}"] = w.day
    return [(b.owner, "close_business", {"business": b.id, "reason": "too many of its kind: a week far slower than its lane"}, "")]


# --------------------------------------------------------------------------- AI plans and events
def buckets(w, b: Biz) -> dict:
    p = w.p
    ref = {"stall": p.meal_ref, "farm": p.crop_ref, "workshop": p.tool_ref, "delivery": p.delivery_fee}[b.type]
    last = b.history[-1] if b.history else {}
    price = "low" if b.price < ref * 0.9 else "high" if b.price > ref * 1.15 else "normal"
    if b.type == "stall":
        sales = "sold_out" if last.get("turned_away", 0) > 0 else "slow" if last.get("sold", 0) < 0.6 * max(b.ema_demand, 1) else "steady"
    elif b.type == "delivery":
        cap = max(B.daily_capacity(w, b), 1)
        u = last.get("sold", 0) / cap
        sales = "sold_out" if u >= 0.9 else "slow" if u < 0.3 else "steady"
    else:
        cap = max(B.daily_capacity(w, b), 1)
        c = B.committed_out(w, b)
        sales = "sold_out" if c >= 0.9 * cap else "slow" if c < 0.5 * cap else "steady"
    ig = B.input_good(b.type)
    if ig:
        use = max(B.input_use_per_day(w, b), 0.1)
        have = goods.free(w.con, b.holder, ig) + delivery.incoming(w, b.holder, ig)
        cover = "out" if have < use * 0.5 else "low" if have < use * 1.5 else "ok"
    else:
        cover = "ok"
    pr = _recent(b, 3)
    profit = "loss" if pr < 0 else "thin" if pr < b.cost * 0.05 else "good"
    same = [x for x in w.open_biz() if x.type == b.type]
    crowd = w.signals.get("crowd", {}).get(b.type, "balanced")
    return {"price": price, "sales": sales, "cover": cover, "profit": profit, "crowd": crowd}


def _apply_plan(w, b: Biz, ans: dict) -> list[Proposal]:
    out: list[Proposal] = []
    step = {"+8%": 0.08, "+4%": 0.04, "hold": 0.0, "-4%": -0.04, "-8%": -0.08}[ans["price"]]
    new = _bound(w, b, int(b.price * (1 + step)))
    if new != b.price:
        out.append((b.owner, "set_price", {"business": b.id, "price": new}, "ai"))
    if ans["staff"] == "hire" and len(b.workers) < b.max_hires(w.p):
        out.append((b.owner, "hire", {"business": b.id}, "ai"))
    elif ans["staff"] == "fire" and b.workers:
        out.append((b.owner, "fire", {"business": b.id}, "ai"))
    b.acc["stock_days"] = int(ans["stock_days"])
    if ans.get("close"):
        out.append((b.owner, "close_business", {"business": b.id, "reason": "the agent's plan closed it"}, "ai"))
    return out


def _ask(w, b: Biz, trigger: str) -> list[Proposal] | None:
    a = w.agents[b.owner]
    budget = w.ai_budget.setdefault(b.owner, {"plan": w.p.ai_plans_per_day, "event": w.p.ai_event_calls_per_day})
    kind = "plan" if trigger == "plan" else "event"
    if budget[kind] <= 0:
        _decision(w, a, b, "rules", trigger, "", [], "AI budget used up: rules", 0, 0, 0.0, True)
        return None
    budget[kind] -= 1
    bk = buckets(w, b)
    ans, meta = w.planner.plan(b.type, bk, kind)
    if ans is None:
        w.ai_missing += 1
        _decision(w, a, b, w.planner.mode, trigger, meta["prompt_hash"], [], "no recorded answer: rules", meta["tokens_in"], meta["tokens_out"],
                  meta["cost_usd"], True)
        return None
    props = _apply_plan(w, b, ans)
    _decision(w, a, b, w.planner.mode, trigger, meta["prompt_hash"], [[k, i] for _, k, i, _ in props], ans.get("note", ""), meta["tokens_in"],
              meta["tokens_out"], meta.get("cost_usd", 0.0), False)
    if w.metrics is not None:
        w.metrics.ai_call(b.owner, meta)
    return props


def _decision(w, a: Agent, b: Biz, mode: str, trigger: str, h: str, acts: list, reason: str, tin: int, tout: int, cost: float, fallback: bool) -> None:
    w.con.execute("""INSERT INTO agent_decisions(agent, tick, mode, trigger, prompt_hash, actions, reason, tokens_in, tokens_out, cost_usd, fallback)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)""", (a.id, w.tick, mode if mode in ("rules", "recorded", "live", "fixture", "mischief") else "recorded",
                                                         f"{trigger}:{b.id}", h, json.dumps(acts), reason[:200], tin, tout, cost, int(fallback)))


def ai_plans(w) -> list[Proposal]:
    out = []
    if w.planner is None:
        return out
    w.ai_budget = {}
    for b in w.open_biz():
        if b.mode not in ("recorded", "live"):
            continue
        props = _ask(w, b, "plan")
        if props is None:
            b.acc["fallback_today"] = 1
        else:
            out += props
    return out


def ai_events(w, b: Biz) -> list[Proposal]:
    """Event triggers (Doc 04 section 6): three days of losses, out of stock two days running, a rival opening nearby.
    A business whose plan fell back today is reviewed by the rules instead."""
    if b.acc.pop("fallback_today", 0):
        return review_rules(w, b)
    trig = None
    if b.loss_streak == 3:
        trig = "three_losses"
    elif b.day.get("out_hours", 0) and b.history and b.history[-1].get("out_hours", 0):
        trig = "out_of_stock"
    elif any(r["kind"] == "business_opened" and w.biz.get(json.loads(r["refs"]).get("business", ""), b).type == b.type
             and w.dist(w.biz[json.loads(r["refs"])["business"]].xy, b.xy) <= 3 and json.loads(r["refs"])["business"] != b.id
             for r in w.today_events()):
        trig = "rival_opened"
    if trig is None or w.planner is None:
        return _unstick(w, b, [], "ai")
    props = _ask(w, b, trig)
    return review_rules(w, b) if props is None else _unstick(w, b, props, "ai")


# --------------------------------------------------------------------------- progression and investment
def room(w) -> dict:
    return w.signals.get("room", {t: False for t in TYPES})


def progression(w) -> list[Proposal]:
    """09:00: entrepreneurs and players look for room. Only one newcomer a day may take the room in each trade (the
    first in id order); the others wait for tomorrow's signals."""
    out = []
    p = w.p
    rm = dict(room(w))
    for t in list(rm):
        # wait to see what the last newcomer in a trade did to it before another one opens (signals lag a few days)
        if any(b.type == t and b.opened_tick > 0 and w.tick - b.opened_tick < p.entry_gap_days * 24 for b in w.open_biz()):
            rm[t] = False
    for a in w.agents.values():
        owned = [x for x in a.businesses if w.biz[x].status == "open"]
        if a.role == "entrepreneur":
            if len(owned) >= 2:
                continue
            bold = a.personality.get("boldness", 0.5)
            choices = _by_room(w, [t for t in ("stall", "delivery", "farm", "workshop") if rm.get(t) and w.bal(a.acct) >= p.build_cost[t] + 20 * C])
            if not choices and w.rng["agents"].random() < bold * 0.04:
                # now and then a bold entrepreneur opens a cart or stall where the trade still pays back inside its lane
                pbk = w.signals.get("payback", {})
                choices = [t for t in ("stall", "delivery") if pbk.get(t, 0) <= p.lanes[p.lane_of[t]][1] and w.bal(a.acct) >= p.build_cost[t] + 20 * C]
            if choices:
                out.append((a.id, "build", {"btype": choices[0]}, ""))
                rm[choices[0]] = False
            continue
        if not a.is_player or a.role in ("sitter", "mischief"):
            continue
        if len(owned) >= p.max_businesses_per_player:
            continue
        cash = w.bal(a.acct)
        buffer = (80 if not owned else 150) * C  # a first stall needs a float to buy its first days of crops
        disc = p.plot_share if (a.founder_plot and not w.plots[a.founder_plot]["building"]) else 0
        if a.afford_tick is None and cash + disc >= p.build_cost["stall"]:
            a.afford_tick = w.tick
        if not owned:
            # the worker path (Doc 04 rule 1, tight lane): work, save, then build a first food stall. One per player, so
            # it does not wait for room; a player in a crowded street sits beside the curve
            if cash + disc >= p.build_cost["stall"] + buffer:
                # wait up to first_wait_days for room in the stalls (one newcomer a day takes it), then build anyway
                ready = w.flags.setdefault(f"ready:{a.id}", w.tick)
                if rm.get("stall") or w.tick - ready >= p.first_wait_days * 24:
                    out.append((a.id, "build", {"btype": "stall"}, ""))
                    rm["stall"] = False
            continue
        choices = _by_room(w, [t for t in ("stall", "delivery", "farm", "workshop") if rm.get(t) and cash + disc >= p.build_cost[t] + buffer])
        if choices:
            out.append((a.id, "build", {"btype": choices[0]}, ""))
            rm[choices[0]] = False
            continue
        if len(owned) < p.max_businesses_per_player:
            forsale = sorted((b for b in w.open_biz() if w.agents[b.owner].kind == "house" and cash >= b.cost + buffer and _recent(b, 7) > 0),
                             key=lambda b: (-_recent(b, 7) / b.cost, b.id))
            if forsale:
                out.append((a.id, "buy_business", {"business": forsale[0].id}, ""))
    return out


def _by_room(w, types: list) -> list:
    """The trades with room, fastest payback against the middle of its lane first (the clearest gap in the town)."""
    p, pbk = w.p, w.signals.get("payback", {})
    return sorted(types, key=lambda t: (pbk.get(t, 0.0) / (sum(p.lanes[p.lane_of[t]]) / 2), t))


def decor(w) -> list[Proposal]:
    out = []
    p = w.p
    rm = room(w)
    gap = _by_room(w, [t for t in ("stall", "delivery", "farm", "workshop") if rm.get(t)])
    saving_for = max(p.build_cost[gap[0]] if gap else 0, p.build_cost["stall"])  # people save up for the trade the town lacks most
    for a in w.agents.values():
        if a.role in ("sitter", "mischief"):
            continue
        owned = [x for x in a.businesses if w.biz[x].status == "open"]
        comfort = p.decor_comfort["owner" if owned else "worker"]
        if a.is_player and len(owned) < p.max_businesses_per_player:
            # a player saves for a first food stall (the tight lane, Doc 04 rule 1), then for whatever the town lacks
            comfort += (saving_for if owned else p.build_cost["stall"]) + (150 * C if owned else 80 * C)
        if a.role == "entrepreneur" and len(owned) < 2:
            comfort += saving_for + 20 * C
        excess = w.bal(a.acct) - comfort
        amt = int(excess * p.decor_share) // C * C
        if amt >= C:
            out.append((a.id, "buy_decor", {"amount": amt}, ""))
    return out


# --------------------------------------------------------------------------- mischief (the Cheater scenario)
MISCHIEF = ("self_trade", "over_limit", "fake_goods", "mint", "not_owner", "overdraw", "share_grab", "fake_floor")


def mischief(w) -> list[Proposal]:
    out = []
    for a in w.agents.values():
        if a.role != "mischief":
            continue
        trick = MISCHIEF[(w.day * 3 + (w.hour // 5)) % len(MISCHIEF)]
        own = next((x for x in a.businesses if w.biz[x].status == "open"), None)
        other = next((b.id for b in w.open_biz() if b.owner != a.id), "b001")
        if trick == "self_trade" and own:
            # the setup sell rests at the top of the band so no honest buyer takes it first; once it rests, the buy
            # crosses it (a buy with no own sell resting would be an honest order, so it is not counted as a trick)
            hi = int(w.p.crop_ref * 1.45)
            resting = w.con.execute("""SELECT price FROM goods_orders WHERE holder=? AND good='crops' AND side='sell'
                                       AND status IN ('open','partial') ORDER BY id DESC LIMIT 1""", (w.biz[own].holder,)).fetchone()
            if resting is None:
                out.append((a.id, "place_order", {"good": "crops", "side": "sell", "price": hi, "qty": 5, "business": own}, "setup"))
            else:
                out.append((a.id, "place_order", {"good": "crops", "side": "buy", "price": resting["price"], "qty": 5}, "mischief"))
        elif trick == "over_limit":
            out.append((a.id, "buy_decor", {"amount": a.limits["daily_cap"] + C}, "mischief"))
        elif trick == "fake_goods":
            out.append((a.id, "make_goods", {"good": "tools", "qty": 50}, "mischief"))
        elif trick == "mint":
            out.append((a.id, "issue_coins", {"amount": 1000 * C}, "mischief"))
        elif trick == "not_owner":
            out.append((a.id, "set_price", {"business": other, "price": w.p.meal_ref}, "mischief"))
        elif trick == "overdraw":
            out.append((a.id, "pay", {"to": "h001", "amount": w.bal(a.acct) + 500 * C}, "mischief"))
        elif trick == "share_grab":
            out.append((a.id, "transfer_shares", {"business": other, "to": a.id, "qty": 500}, "mischief"))
        elif trick == "fake_floor":
            out.append((a.id, "sell_floor", {"business": own or other, "good": "crops", "qty": 500}, "mischief"))
        if trick == "self_trade" and not own:
            held = goods.free(w.con, f"{a.acct[0]}:{a.acct[1]}", "tools")  # sell more tools than it holds
            out.append((a.id, "place_order", {"good": "tools", "side": "sell", "price": w.p.tool_ref, "qty": held + 3}, "mischief"))
    return out
