"""The Actions gate: the single door every action from a person or an agent goes through (Doc 04 section 7; Doc 05
sections 2 and 4). Agents and people only submit actions; only this gate changes the records, by calling the Ledger,
Goods, Market, Business and Civic parts.

Every action is checked in the same order: the actor exists; the action is on the list; the actor may act for what it
names (ownership); the town's rules; the owner's limits (daily spending cap, price range, approvals); the balance and
stock. A refused action changes nothing (it runs inside a savepoint) and is logged with its reason; a refusal of a rule
is also recorded as a J0 candidate violation (Doc 06 section 16.2). People and agents get the same result for the same
play: `via` is recorded, never used to decide (except that a person approves their own actions).
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from .. import ledger
from . import business as B
from . import civic, contracts, delivery, goods, market, shares
from .params import C, TYPES
from .world import CIVIC, WORK_HOURS, Agent

# Refusal codes that are ordinary (an applicant was too late, a seller had sold out): logged, never a violation.
ORDINARY = {"INSUFFICIENT", "NO_STOCK", "NO_SLOT", "NO_PLOT", "NO_CAPACITY", "NEEDS_APPROVAL", "NOT_HIRING", "CLOSED", "PRICE_BAND", "NO_ROOM",
            "ALREADY", "NOT_FOR_SALE", "LOW_BID", "ZONE", "NOT_LISTED", "NOT_ELIGIBLE", "BAD_QTY"}
APPROVAL = {"build", "buy_plot", "start_cart", "sell_plot", "close_business", "buy_business", "transfer_shares", "upgrade", "list_shares"}
SPEND = {"build": "amount", "buy_plot": "amount", "import_materials": "amount", "import_crops": "amount", "buy_decor": "amount", "place_order": "amount", "upgrade": "amount",
         "buy_business": "amount", "start_cart": "amount", "bid": "amount", "buy_shares": "amount"}
# step 3, zone rules: what may be built on a business plot, by its area
ALLOWED = {"farmland": ("farm",), "harbourside": ("workshop", "delivery", "factory"), "market": ("stall", "delivery"), "main": ("stall", "delivery")}


class Refused(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}")
        self.code, self.detail = code, detail


@dataclass
class Result:
    ok: bool
    code: str = ""
    detail: str = ""
    data: dict | None = None
    action_id: int = 0


def submit(w, actor_id: str, kind: str, via: str = "agent", **inputs) -> Result:
    con = w.con
    a = w.agents.get(actor_id)
    known = set(w._acct)
    con.execute("SAVEPOINT act")
    try:
        if a is None:
            raise Refused("UNKNOWN_ACTOR", actor_id)
        fn = HANDLERS.get(kind)
        if fn is None:
            raise Refused("NOT_ALLOWED", f"'{kind}' is not on the action list")
        spend = _spend_of(w, kind, inputs)
        _limits(w, a, kind, via, spend, inputs)
        data = fn(w, a, **inputs) or {}
        if spend:
            a.spent_today += spend
    except (Refused, ledger.LedgerError, goods.GoodsError, market.MarketError, shares.ShareError) as e:
        con.execute("ROLLBACK TO act")
        con.execute("RELEASE act")
        for k in set(w._acct) - known:  # an account created inside the rolled-back savepoint no longer exists
            del w._acct[k]
        code = getattr(e, "code", "REFUSED")
        detail = getattr(e, "detail", "") or str(e)
        cur = con.execute("INSERT INTO actions(tick, actor, via, type, inputs, result, refusal, detail) VALUES (?,?,?,?,?, 'refused', ?, ?)",
                          (w.tick, actor_id, via, kind, json.dumps(_plain(inputs), sort_keys=True), code, detail[:300]))
        if code not in ORDINARY:
            contracts.violation(w, rule=f"gate:{code}", accused=actor_id, detecting="actions.submit",
                                evidence={"action": cur.lastrowid, "type": kind})
        if w.metrics is not None:
            w.metrics.refusal(actor_id, kind, code)
        return Result(False, code, detail, action_id=cur.lastrowid)
    con.execute("RELEASE act")
    cur = con.execute("INSERT INTO actions(tick, actor, via, type, inputs, result) VALUES (?,?,?,?,?, 'done')",
                      (w.tick, actor_id, via, kind, json.dumps(_plain(inputs), sort_keys=True)))
    return Result(True, data=data, action_id=cur.lastrowid)


def _plain(d: dict) -> dict:
    return {k: (v if isinstance(v, (int, float, str, bool, type(None))) else str(v)) for k, v in d.items()}


def _spend_of(w, kind: str, inp: dict) -> int:
    p = w.p
    if kind == "build":
        return p.build_cost.get(inp.get("btype", ""), 0)
    if kind == "import_materials":
        return w.material_price() * int(inp.get("qty", 0))
    if kind == "import_crops":
        return int(p.crop_ref * p.crop_import_markup) * int(inp.get("qty", 0))
    if kind == "buy_decor":
        return int(inp.get("amount", 0))
    if kind == "place_order" and inp.get("side") == "buy":
        return int(inp.get("price", 0)) * int(inp.get("qty", 0))
    if kind == "upgrade":
        b = w.biz.get(inp.get("business", ""))
        return b.cost // 2 if b else 0
    if kind == "buy_business":
        b = w.biz.get(inp.get("business", ""))
        return b.cost if b else 0
    if kind == "start_cart":
        return p.cart_cost
    if kind == "bid":
        return int(inp.get("amount", 0))
    if kind == "buy_shares":
        return int(inp.get("price", 0)) * int(inp.get("qty", 0))
    if kind == "buy_plot":
        pl = w.plots.get(inp.get("plot", ""))
        btype = inp.get("btype", "stall")
        if pl is None or btype not in p.build_cost:
            return 0
        total = p.build_cost[btype] - p.plot_share + p.plot_price(pl)
        cart = w.biz.get(inp.get("business", ""))
        return max(0, total - cart.cost) if cart is not None and cart.cart else total
    return 0


def _limits(w, a: Agent, kind: str, via: str, spend: int, inp: dict) -> None:
    lim = a.limits
    # the cap is the limit a person sets on their agent; a request the person confirmed themselves is not held to it
    if spend and via != "human" and a.spent_today + spend > lim.get("daily_cap", 10**12):
        raise Refused("OVER_LIMIT", f"over the owner's daily spending cap of {lim.get('daily_cap', 0) / C:.0f} Sora")
    if kind == "set_price":
        b = w.biz.get(inp.get("business", ""))
        if b:
            lo, hi = lim.get("price_range", w.p.price_range)
            ref = w.p.type_ref(b.type)
            if not (lo * ref <= int(inp.get("price", 0)) <= hi * ref):
                raise Refused("PRICE_RANGE", "outside the owner's price range")
    if kind in APPROVAL and via == "agent" and a.is_player and kind in lim.get("approval", APPROVAL):
        if not w.players_online:
            raise Refused("NEEDS_APPROVAL", "waiting for the owner's approval")


def _own_biz(w, a: Agent, bid: str):
    b = w.biz.get(bid)
    if b is None:
        raise Refused("UNKNOWN_BUSINESS", bid)
    if b.owner != a.id:
        raise Refused("NOT_OWNER", f"{a.id} does not own {bid}")
    if b.status != "open":
        raise Refused("CLOSED", bid)
    return b


# --------------------------------------------------------------------------- handlers: work
def h_apply_job(w, a: Agent, employer: str) -> dict:
    if employer == CIVIC:
        w.set_job(a, CIVIC, w.p.civic_wage)
        return {"employer": CIVIC}
    b = w.biz.get(employer)
    if b is None or b.status != "open":
        raise Refused("CLOSED", employer)
    if b.acc.get("hiring", 0) <= 0 or len(b.workers) >= b.max_hires(w.p):
        raise Refused("NOT_HIRING", employer)
    if b.owner == a.id:
        raise Refused("NOT_ALLOWED", "an owner works its own business")
    b.acc["hiring"] -= 1
    w.set_job(a, b.id, b.wage)
    w.event("hired", [a.id, b.owner, b.id], f"{a.id} started work at {b.id} for {b.wage / C:.0f} Sora a day", visibility="owner", refs={"business": b.id})
    return {"employer": b.id}


def h_quit_job(w, a: Agent) -> dict:
    w.set_job(a, None)
    return {}


def h_hire(w, a: Agent, business: str, slots: int = 1) -> dict:
    b = _own_biz(w, a, business)
    if len(b.workers) + slots > b.max_hires(w.p):
        raise Refused("NO_SLOT", "staff limit for this level")
    b.acc["hiring"] = b.acc.get("hiring", 0) + slots
    b.last_change_day = w.day
    return {"open_slots": b.acc["hiring"]}


def h_fire(w, a: Agent, business: str) -> dict:
    b = _own_biz(w, a, business)
    if not b.workers:
        raise Refused("NO_SLOT", "nobody to let go")
    wid = b.workers[-1]
    w.set_job(w.agents[wid], None)
    b.last_change_day = w.day
    w.event("let_go", [wid, a.id, b.id], f"{wid} was let go by {b.id}", visibility="owner", refs={"business": b.id})
    return {"worker": wid}


def h_set_wage(w, a: Agent, business: str, wage: int) -> dict:
    b = _own_biz(w, a, business)
    if wage < w.p.civic_wage // 2:
        raise Refused("WAGE_TOO_LOW", "below half the civic wage")
    b.wage = int(wage)
    b.last_change_day = w.day
    return {}


# --------------------------------------------------------------------------- handlers: trade
def h_set_price(w, a: Agent, business: str, price: int) -> dict:
    b = _own_biz(w, a, business)
    old = b.price
    b.price = int(price)
    if old != b.price:
        b.last_change_day = w.day
        if abs(b.price - old) >= old * 0.1:
            w.event("price_changed", [a.id, b.id], f"{b.id} changed its price from {old / C:.2f} to {b.price / C:.2f} Sora", visibility="town",
                    refs={"business": b.id})
    return {"old": old, "new": b.price}


def h_place_order(w, a: Agent, good: str, side: str, price: int, qty: int, business: str = "") -> dict:
    acct = a.acct
    if business:
        acct = _own_biz(w, a, business).acct
    r = market.place(w, acct=acct, good=good, side=side, price=int(price), qty=int(qty))
    return {"order": r["order"]["id"], "fills": len(r["fills"])}


def h_cancel_order(w, a: Agent, order: int) -> dict:
    o = w.con.execute("SELECT * FROM goods_orders WHERE id=?", (order,)).fetchone()
    if not o:
        raise Refused("UNKNOWN_ORDER", str(order))
    k, oid = o["holder"].split(":", 1)
    owner = oid if k != "company" else w.biz[oid].owner
    if owner != a.id:
        raise Refused("NOT_OWNER", "not your order")
    market.cancel(w, order)
    return {}


def h_sign_contract(w, a: Agent, buyer: str, seller: str, good: str, qty: int, price: int, days: int = 0) -> dict:
    bb = _own_biz(w, a, buyer)
    s = w.biz.get(seller)
    if s is None or s.status != "open":
        raise Refused("CLOSED", seller)
    restock = bb.type == "stall" and s.type == "factory" and good == "meals"  # a busy stall also buys a factory's meals
    if B.output_good(s.type) != good or (B.input_good(bb.type) != good and not restock):
        raise Refused("BAD_CONTRACT", "the seller does not make this good or the buyer does not use it")
    if price < s.price:
        raise Refused("BELOW_ASK", "below the seller's asking price")
    spare = B.promise_capacity(w, s) - B.committed_out(w, s)
    if qty <= 0 or qty > spare:
        raise Refused("NO_CAPACITY", f"{seller} can promise {max(spare, 0)} a day")
    cid = contracts.sign(w, seller=s, buyer=bb, good=good, qty=int(qty), price=int(price), days=int(days or w.p.contract_days))
    return {"contract": cid}


def h_end_contract(w, a: Agent, contract: str) -> dict:
    k = w.con.execute("SELECT * FROM contracts WHERE id=?", (contract,)).fetchone()
    if not k or k["status"] != "active":
        raise Refused("UNKNOWN_CONTRACT", contract)
    if a.id not in (w.biz[k["seller"]].owner, w.biz[k["buyer"]].owner):
        raise Refused("NOT_OWNER", "not a party to this contract")
    w.con.execute("UPDATE contracts SET status='ended' WHERE id=?", (contract,))
    w.event("contract_ended", [w.biz[k["seller"]].owner, w.biz[k["buyer"]].owner], f"Contract {contract} was ended by {a.id}", visibility="owner",
            refs={"contract": contract})
    return {}


def h_import_materials(w, a: Agent, business: str, qty: int) -> dict:
    b = _own_biz(w, a, business)
    if b.type != "workshop":
        raise Refused("BAD_ACTION", "only workshops import materials")
    if qty <= 0:
        raise Refused("BAD_QTY", "")
    return civic.import_materials(w, b, int(qty))


def h_import_crops(w, a: Agent, business: str, qty: int) -> dict:
    b = _own_biz(w, a, business)
    if b.type != "factory":
        raise Refused("BAD_ACTION", "only food factories import crops")
    if qty <= 0:
        raise Refused("BAD_QTY", "")
    return civic.import_crops(w, b, int(qty))


def h_sell_floor(w, a: Agent, business: str, good: str, qty: int) -> dict:
    b = _own_biz(w, a, business)
    if good not in ("crops", "tools"):
        raise Refused("BAD_GOOD", "the Harbour's floor buys crops and tools")
    if qty <= 0 or qty > goods.free(w.con, b.holder, good):
        raise Refused("NO_STOCK", f"{business} does not hold {qty} {good}")
    qty = min(int(qty), civic.floor_cap(w, good) - b.day.get("floor_offered", 0))
    if qty <= 0:
        raise Refused("FLOOR_CAP", "the Harbour's daily cap for this seller is reached")
    b.day["floor_offered"] = b.day.get("floor_offered", 0) + qty
    w.floor_offers.append((b, good, qty))
    return {"offered": qty}


def h_buy_meal(w, a: Agent, business: str) -> dict:
    b = w.biz.get(business)
    if b is None or b.status != "open" or b.type != "stall":
        raise Refused("CLOSED", business)
    if b.owner == a.id:
        raise Refused("NOT_ALLOWED", "owners eat from their own stall without paying themselves")
    if goods.free(w.con, b.holder, "meals") <= 0:
        raise Refused("NO_STOCK", "sold out")
    w.pay(a.acct, b.acct, b.price, kind="revenue", rule="meal", ref_type="business", ref_id=b.id)
    goods.destroy(w.con, w.tick, b.holder, "meals", 1, "eaten", "agent", a.id)
    b.day["revenue"] = b.day.get("revenue", 0) + b.price
    b.day["sold"] = b.day.get("sold", 0) + 1
    return {}


def h_eat_own(w, a: Agent, business: str) -> dict:
    """An owner eats a meal from its own stall: the meal is eaten, no money moves."""
    b = _own_biz(w, a, business)
    if goods.free(w.con, b.holder, "meals") <= 0:
        raise Refused("NO_STOCK", "sold out")
    goods.destroy(w.con, w.tick, b.holder, "meals", 1, "eaten", "agent", a.id)
    return {}


# --------------------------------------------------------------------------- handlers: property
def _free_plot(w, btype: str, prime: bool | None = None) -> str | None:
    pref = {"farm": "farmland", "workshop": "harbourside", "stall": "market", "delivery": "main", "factory": "harbourside"}[btype]
    free = [p for p in w.plots.values() if p["use"] == "business" and not p["owner"] and p["id"] not in w.at_auction]
    if btype == "stall" and free:
        return _roomy_stall_plot(w, free, pref)
    free.sort(key=lambda p: (p["area"] != pref, p["prime"], p["id"]))
    return free[0]["id"] if free else None


STREET = 2.5   # plots within this distance share a street's shoppers
NEAR_HOMES = 4.0


def _roomy_stall_plot(w, free: list[dict], pref: str) -> str:
    """Owner decision after the Phase 3 gates: a new stall goes to the street with the most room, scored as residents
    living near the plot for each stall already trading in its street (stall choice weighs distance, so shoppers near an
    uncrowded street spread there). Ties go to the market area, then prime plots, then the plot id."""
    stalls = [(b.xy) for b in w.open_biz() if b.type == "stall"]
    homes = [a.home for a in w.agents.values() if a.home]
    def score(pl):
        xy = (pl["x"], pl["y"])
        near = sum(1 for s in stalls if w.dist(s, xy) <= STREET)
        people = sum(1 for h in homes if w.dist(h, xy) <= NEAR_HOMES)
        return people / (1 + near)
    best = max(free, key=lambda pl: (round(score(pl), 3), pl["area"] == pref, pl["prime"], [-ord(c) for c in pl["id"]]))
    return best["id"]


def h_build(w, a: Agent, btype: str, plot: str = "") -> dict:
    if btype not in TYPES:
        raise Refused("BAD_TYPE", btype)
    owned = sum(1 for x in a.businesses if w.biz[x].status == "open")
    if a.is_player and owned >= w.p.max_businesses_per_player:
        raise Refused("PLOT_LIMIT", f"up to {w.p.max_businesses_per_player} businesses before the Exchange opens")
    founder = False
    if not plot and a.founder_plot and not w.plots[a.founder_plot]["building"]:
        plot, founder = a.founder_plot, True
    elif plot and plot == a.founder_plot and not w.plots[plot]["building"]:
        founder = True
    if not plot:  # a plot the builder already owns (won at auction) comes first
        plot = next((p["id"] for p in sorted(w.plots.values(), key=lambda p: p["id"])
                     if p["use"] == "business" and p["owner"] == a.id and not p["building"] and p["id"] != a.founder_plot), "")
    plot = plot or _free_plot(w, btype)
    if not plot or plot not in w.plots:
        raise Refused("NO_PLOT", "no free plot")
    pl = w.plots[plot]
    if pl["use"] != "business" or (pl["owner"] and pl["owner"] != a.id) or pl["building"] or plot in w.at_auction:
        raise Refused("NO_PLOT", f"plot {plot} is not free")
    crowded = not w.signals.get("room", {}).get(btype, True)
    # a plot the builder already bought (at auction) is paid for: only the construction is due
    b = B.build(w, a, btype, plot, founder_plot=founder, plot_price=0 if pl["owner"] == a.id and not founder else None)
    if crowded:
        # Doc 04 rule 1: a business opened where its trade has no room (a stall in a crowded street) shares customers by
        # design; it is shown beside the payback curve, not forced onto it
        b.beside_curve = True
        w.save_biz(b)
    return {"business": b.id, "plot": plot, "beside_curve": crowded}


def _open_count(w, a: Agent) -> int:
    return sum(1 for x in a.businesses if w.biz[x].status == "open")


def h_claim_home(w, a: Agent, plot: str) -> dict:
    """Step 3: a person moves into a free home plot (homes cost nothing; one each)."""
    pl = w.plots.get(plot)
    if pl is None or pl["use"] != "home":
        raise Refused("NO_PLOT", f"{plot} is not a home plot")
    if any(p["use"] == "home" and p["owner"] == a.id for p in w.plots.values()):
        raise Refused("ALREADY", "already has a home")
    if pl["owner"]:
        raise Refused("NO_PLOT", f"home {plot} is taken")
    pl["owner"] = a.id
    w.con.execute("UPDATE plots SET owner=? WHERE id=?", (a.id, plot))
    a.home = (pl["x"], pl["y"])
    w.save_agent(a)
    w.event("moved_in", [a.id], f"{a.id} moved into the home on plot {plot}", visibility="public", refs={"agent": a.id, "plot": plot})
    return {"plot": plot}


def _kerbs(w) -> list[dict]:
    """Free business plots with no cart parked at the kerb yet."""
    taken = {b.plot for b in w.open_biz() if b.cart}
    return [p for p in w.plots.values() if p["use"] == "business" and not p["owner"] and not p["building"] and p["id"] not in taken
            and p["id"] not in w.at_auction and p["area"] in ("market", "main")]


def h_start_cart(w, a: Agent, plot: str = "") -> dict:
    """Step 3: start trading from a food cart at a free plot's kerb: the cheapest first business, owner only."""
    if not a.is_player:
        raise Refused("NOT_ALLOWED", "carts are for people starting out")
    if sum(1 for x in a.businesses if w.biz[x].status == "open" and w.biz[x].cart) >= w.p.carts_per_player:
        raise Refused("ALREADY", "already runs a cart")
    if _open_count(w, a) >= w.p.max_businesses_per_player:
        raise Refused("PLOT_LIMIT", f"up to {w.p.max_businesses_per_player} businesses before the Exchange opens")
    kerbs = _kerbs(w)
    if plot:
        if plot not in {p["id"] for p in kerbs}:
            raise Refused("NO_PLOT", f"no room for a cart by plot {plot}")
    else:
        if not kerbs:
            raise Refused("NO_PLOT", "no free kerb for a cart")
        plot = _roomy_stall_plot(w, kerbs, "market")
    b = B.open_cart(w, a, plot)
    return {"business": b.id, "plot": plot}


def h_buy_plot(w, a: Agent, plot: str, btype: str = "stall", business: str = "") -> dict:
    """Step 3: buy a free business plot at its listed price and build on it, or settle one's cart there as a stall. The
    plot's zone decides what may be built (farmland: farms; harbourside: workshops and delivery; market and main streets:
    stalls and delivery)."""
    pl = w.plots.get(plot)
    if pl is None or pl["use"] != "business":
        raise Refused("NO_PLOT", f"{plot} is not a business plot")
    if pl["owner"] or pl["building"]:
        raise Refused("NO_PLOT", f"plot {plot} is not for sale")
    if plot in w.at_auction:
        raise Refused("NOT_FOR_SALE", f"plot {plot} is up for auction")
    if btype not in TYPES:
        raise Refused("BAD_TYPE", btype)
    if btype not in ALLOWED.get(pl["area"], ()):
        raise Refused("ZONE", f"a {pl['area']} plot takes {' or '.join(ALLOWED.get(pl['area'], ('nothing',)))}, not a {btype}")
    price = w.p.plot_price(pl)
    if business:
        b = _own_biz(w, a, business)
        if not b.cart or btype != "stall":
            raise Refused("BAD_ACTION", "only a cart settles on a plot, as a stall")
        paid = B.settle_cart(w, a, b, plot, price)
        return {"business": b.id, "plot": plot, "paid": paid, "settled": True}
    if a.is_player and _open_count(w, a) >= w.p.max_businesses_per_player:
        raise Refused("PLOT_LIMIT", f"up to {w.p.max_businesses_per_player} businesses before the Exchange opens")
    b = B.build(w, a, btype, plot, plot_price=price)
    return {"business": b.id, "plot": plot, "paid": b.cost, "settled": False}


def h_bid(w, a: Agent, auction: int, amount: int, plot: str = "") -> dict:
    """Step 4: bid for a plot at auction; the Sora is held until the bidder is outbid or the auction ends."""
    from . import auctions
    return auctions.bid(w, a, int(auction), int(amount))


def h_upgrade(w, a: Agent, business: str) -> dict:
    b = _own_biz(w, a, business)
    if b.cart:
        raise Refused("BAD_ACTION", "a cart is upgraded by settling it on a plot")
    cost = b.cost // 2
    w.sink(a.acct, civic.TOWN_HALL, cost, rule="upgrade", ref_type="business", ref_id=b.id)
    b.level += 1
    b.last_change_day = w.day
    w.event("upgraded", [a.id, b.id], f"{b.id} was upgraded to level {b.level}", visibility="town", refs={"business": b.id})
    return {"level": b.level}


def h_close_business(w, a: Agent, business: str, reason: str = "the owner closed it") -> dict:
    b = _own_biz(w, a, business)
    B.close(w, b, reason)
    return {}


def h_buy_business(w, a: Agent, business: str) -> dict:
    """An approved private sale: a house agent sells its business to a person at the price it cost (Doc 04 sections 6 and
    8; rule 3: tied to what it cost, not to today's price). The 1,000 shares move with the payment, in one transaction."""
    b = w.biz.get(business)
    if b is None or b.status != "open":
        raise Refused("CLOSED", business)
    seller = w.agents[b.owner]
    if shares.listing(w.con, b.id):
        raise Refused("NOT_FOR_SALE", "a listed business's shares trade on the Town Exchange")
    if seller.kind != "house" or not a.is_player:
        raise Refused("NOT_FOR_SALE", "house agents sell businesses to people")
    owned = sum(1 for x in a.businesses if w.biz[x].status == "open")
    if owned >= w.p.max_businesses_per_player:
        raise Refused("PLOT_LIMIT", "")
    if ledger.trade_owner(seller.owner_key) == ledger.trade_owner(a.owner_key):
        raise Refused("SELF_TRADE", "same owner")
    w.pay(a.acct, seller.acct, b.cost, kind="transfer", rule="business_sale", ref_type="business", ref_id=b.id)
    asset = f"SHR:{b.id}"
    src = ledger.account(w.con, seller.owner_kind, seller.id, asset, seller.owner_key)
    dst = ledger.account(w.con, a.owner_kind, a.id, asset, a.owner_key)
    ledger.transfer(w.con, kind="transfer", idem_key=w.key("shares"), src=src["id"], src_bucket="available", dst=dst["id"], dst_bucket="available",
                    asset=asset, amount=1000, txn_id=f"t{w.tick}", ref_type="business", ref_id=b.id, rule="business_sale")
    w.con.execute("UPDATE accounts SET owner_key=? WHERE owner_kind='company' AND owner_id=?", (a.owner_key, b.id))
    seller.businesses.remove(b.id)
    if seller.job == f"own:{b.id}":
        w.set_job(seller, None)
    b.owner = a.id
    b.mode = a.mode if a.mode in ("recorded", "live") else "rules"
    b.last_change_day = w.day
    a.businesses.append(b.id)
    if a.first_business_tick is None:
        a.first_business_tick = w.tick
    w.set_job(a, f"own:{b.id}")
    w.plots[b.plot]["owner"] = a.id
    w.con.execute("UPDATE plots SET owner=? WHERE id=?", (a.id, b.plot))
    w.save_biz(b)
    w.event("business_sold", [a.id, seller.id, b.id], f"{seller.id} (house agent) sold {b.id} to {a.id} for {b.cost / C:.0f} Sora", visibility="public",
            refs={"business": b.id})
    return {"business": b.id}


def h_list_shares(w, a: Agent, business: str, qty: int) -> dict:
    """Company shares: the owner offers up to 490 of its 1,000 shares on the Town Exchange at the listing price."""
    b = _own_biz(w, a, business)
    return shares.list_business(w, a, b, int(qty))


def h_buy_shares(w, a: Agent, business: str, price: int, qty: int) -> dict:
    r = shares.place(w, a, business, "buy", int(price), int(qty))
    return {"order": r["order"]["id"], "filled": r["order"]["filled"]}


def h_sell_shares(w, a: Agent, business: str, price: int, qty: int) -> dict:
    r = shares.place(w, a, business, "sell", int(price), int(qty))
    return {"order": r["order"]["id"], "filled": r["order"]["filled"]}


def h_cancel_share_order(w, a: Agent, order: int, share_business: str = "") -> dict:
    o = w.con.execute("SELECT holder, status FROM share_orders WHERE id=?", (int(order),)).fetchone()
    if o is None or o["holder"] != a.id:
        raise Refused("NOT_OWNER", f"order {order}")
    shares.cancel(w, int(order))
    return {}


def h_transfer_shares(w, a: Agent, business: str, to: str, qty: int) -> dict:
    raise Refused("NOT_APPROVED", "shares move only through an approved private sale")


def h_pay_dividend(w, a: Agent, business: str, amount: int) -> dict:
    b = _own_biz(w, a, business)
    w.pay(b.acct, a.acct, int(amount), kind="transfer", rule="dividend", ref_type="business", ref_id=b.id)
    return {}


def h_request_delivery(w, a: Agent, business: str, to_business: str, good: str, qty: int) -> dict:
    s = _own_biz(w, a, business)
    d = _own_biz(w, a, to_business)
    if goods.free(w.con, s.holder, good) < qty:
        raise Refused("NO_STOCK", "")
    return delivery.dispatch(w, src=s.holder, dst=d.holder, good=good, qty=int(qty), payer=d.acct, ref_type="own_move", ref_id=s.id)


# --------------------------------------------------------------------------- handlers: community and spending
def h_buy_decor(w, a: Agent, amount: int) -> dict:
    if amount <= 0:
        raise Refused("BAD_AMOUNT", "")
    civic.buy_decor(w, a, int(amount))
    return {}


def h_vote(w, a: Agent, option: str) -> dict:
    if option not in civic.VOTE_OPTIONS:
        raise Refused("BAD_OPTION", option)
    return {}


def h_make_request(w, a: Agent, text: str) -> dict:
    return {}


def h_message_owner(w, a: Agent, text: str) -> dict:
    return {}


def h_pay(w, a: Agent, to: str, amount: int) -> dict:
    """A plain payment to another resident (used by people; agents pay only through trade, wages and contracts)."""
    t = w.agents.get(to)
    if t is None:
        raise Refused("UNKNOWN_ACTOR", to)
    if ledger.trade_owner(t.owner_key) == ledger.trade_owner(a.owner_key):
        raise Refused("SELF_TRADE", "same owner")
    w.pay(a.acct, t.acct, int(amount), kind="transfer", rule="payment", ref_type="agent", ref_id=to)
    return {}


HANDLERS = {
    "apply_job": h_apply_job, "quit_job": h_quit_job, "hire": h_hire, "fire": h_fire, "set_wage": h_set_wage,
    "set_price": h_set_price, "place_order": h_place_order, "cancel_order": h_cancel_order, "sign_contract": h_sign_contract,
    "end_contract": h_end_contract, "import_materials": h_import_materials, "import_crops": h_import_crops, "sell_floor": h_sell_floor, "buy_meal": h_buy_meal, "eat_own": h_eat_own,
    "build": h_build, "upgrade": h_upgrade, "close_business": h_close_business, "buy_business": h_buy_business,
    "transfer_shares": h_transfer_shares, "pay_dividend": h_pay_dividend, "list_shares": h_list_shares, "buy_shares": h_buy_shares,
    "sell_shares": h_sell_shares, "cancel_share_order": h_cancel_share_order, "request_delivery": h_request_delivery,
    "claim_home": h_claim_home, "start_cart": h_start_cart, "buy_plot": h_buy_plot, "bid": h_bid,
    "buy_decor": h_buy_decor, "vote": h_vote, "make_request": h_make_request, "message_owner": h_message_owner, "pay": h_pay,
}
