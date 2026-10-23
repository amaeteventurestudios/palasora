"""Palasora Phase 7: the business card and the owner's requests (Doc 06 sections 10 and 11.3, Doc 03 section 6).

Every number on the card is read from the ledger, never estimated: revenue, costs and profit are sums of journal entries
on the business's own account (a company account), by period. Owner capital, owner draws, genesis capital and business
sales are money moving between an owner and the business, so they are neither revenue nor cost. This is the same split
the business keeps in its own daily books (business.py); test_phase7_card checks that the two always agree.

An owner changes the business through requests. A request is stored, then applied by the town's tick through the Actions
gate (`actions.submit(..., via="human")`) with the owner's limits, so a request can be refused for the same reasons an
agent's action can. The owner asking is itself the approval for actions that need one.
"""
from __future__ import annotations

import json
import re
import sqlite3
import time

from . import social
from .params import C, tuned
from .world import EPOCH

BIZ_ID = re.compile(r"^b\d{3,}$")
NOT_REVENUE = ("genesis", "owner_capital", "business_sale")
NOT_COST = ("owner_draw", "dividend", "business_sale", "wind_up")
SALE_LABEL = {"meal": "Meals sold", "contract": "Contract delivery", "delivery_fee": "Delivery fee", "harbour_floor": "Sold to the Harbour",
              "civic_project": "Town Hall project", "market_hall": "Market Hall sale", "": "Market Hall sale"}
COST_LABEL = {"wage": "Wages", "plot_upkeep": "Plot upkeep", "import": "Imports", "contract": "Contract supplies", "delivery_fee": "Delivery fees",
              "market_hall": "Market Hall purchases", "": "Market Hall purchases", "upgrade": "Upgrade", "build": "Building"}
OUTPUT = {"farm": "crops", "workshop": "tools", "stall": "meals", "delivery": "delivery loads", "factory": "meals for stalls"}
INPUT = {"farm": "tools", "workshop": "materials", "stall": "crops", "factory": "crops"}
REQUEST_KINDS = ("set_price", "set_wage", "hire", "fire", "upgrade", "end_contract", "close_business", "list_shares",
                 "place_order", "cancel_order", "post_job", "stop_hiring")
PERIODS = (("day", 24), ("week", 24 * 7), ("month", 24 * 30))


def now_tick(con: sqlite3.Connection) -> int:
    ev = con.execute("SELECT COALESCE(MAX(tick), 0) t FROM world_events").fetchone()["t"]
    j = con.execute("SELECT MAX(created_at) t FROM journal").fetchone()["t"]
    jt = int((j - EPOCH) // 3600) if j and j >= EPOCH else 0
    return max(ev, jt)


def _acct(con: sqlite3.Connection, bid: str) -> int | None:
    r = con.execute("SELECT id FROM accounts WHERE owner_kind='company' AND owner_id=? AND asset='SORA'", (bid,)).fetchone()
    return r["id"] if r else None


def money(con: sqlite3.Connection, acct: int | None, since: float | None = None) -> dict:
    """Revenue, costs and profit from journal entries on the account, in centi-Sora (`since` = a ledger timestamp)."""
    if acct is None:
        return {"revenue": 0, "costs": 0, "profit": 0, "entries": 0}
    t = "" if since is None else " AND created_at >= ?"
    arg = () if since is None else (since,)
    q = lambda col, ex: con.execute(  # noqa: E731
        f"SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM journal WHERE {col}=? AND from_account != to_account AND asset='SORA' "
        f"AND rule NOT IN ({','.join('?' * len(ex))}){t}", (acct, *ex, *arg)).fetchone()
    rv, cs = q("to_account", NOT_REVENUE), q("from_account", NOT_COST)
    return {"revenue": rv["s"], "costs": cs["s"], "profit": rv["s"] - cs["s"], "entries": rv["n"] + cs["n"]}


def owner_of(con: sqlite3.Connection, bid: str, user_id: str) -> str | None:
    """The town agent through which this person owns the business, if they do."""
    if not user_id:
        return None
    b = con.execute("SELECT owner FROM businesses WHERE id=?", (bid,)).fetchone()
    if b is None:
        return None
    linked = con.execute("SELECT 1 FROM town_links WHERE town_agent=? AND user_id=? AND user_id != ''", (b["owner"], user_id)).fetchone()
    return b["owner"] if linked else None


def business_card(con: sqlite3.Connection, bid: str, viewer: str = "") -> dict | None:
    b = con.execute("SELECT * FROM businesses WHERE id=?", (bid,)).fetchone()
    if b is None:
        return None
    p = tuned()
    names = {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}
    acct = _acct(con, bid)
    now = now_tick(con)
    ts_now = EPOCH + (now + 1) * 3600
    periods = {k: money(con, acct, ts_now - h * 3600) for k, h in PERIODS}
    periods["all"] = money(con, acct)
    bal = con.execute("SELECT available, reserved FROM accounts WHERE id=?", (acct,)).fetchone() if acct else None
    # the ledger check: the balance equals every entry in minus every entry out
    flows = con.execute("SELECT COALESCE(SUM(CASE WHEN to_account=? THEN amount ELSE 0 END),0) i, COALESCE(SUM(CASE WHEN from_account=? THEN amount ELSE 0 END),0) o "
                        "FROM journal WHERE (to_account=? OR from_account=?) AND from_account != to_account AND asset='SORA'", (acct, acct, acct, acct)).fetchone() if acct else None
    sales = [{"tick": int((r["created_at"] - EPOCH) // 3600), "what": SALE_LABEL.get(r["rule"], r["rule"]), "amount": r["amount"] / C, "entry": r["id"]}
             for r in con.execute("SELECT id, rule, amount, created_at FROM journal WHERE to_account=? AND from_account != to_account AND asset='SORA' "
                                  f"AND rule NOT IN ({','.join('?' * len(NOT_REVENUE))}) AND created_at >= ? ORDER BY id DESC LIMIT 12",
                                  (acct, *NOT_REVENUE, ts_now - 24 * 3600))] if acct else []
    costs = {COST_LABEL.get(r["rule"], r["rule"]): r["s"] / C for r in con.execute(
        "SELECT rule, SUM(amount) s FROM journal WHERE from_account=? AND from_account != to_account AND asset='SORA' "
        f"AND rule NOT IN ({','.join('?' * len(NOT_COST))}) AND created_at >= ? GROUP BY rule ORDER BY s DESC", (acct, *NOT_COST, ts_now - 7 * 24 * 3600))} if acct else {}
    staff = [{"worker": r["worker"], "name": names.get(r["worker"], ""), "wage": r["wage"] / C, "since_tick": r["start_tick"]}
             for r in con.execute("SELECT worker, wage, start_tick FROM jobs WHERE employer=? AND end_tick IS NULL ORDER BY start_tick", (bid,))]
    stock = {r["good"]: {"qty": r["qty"], "reserved": r["reserved"]} for r in con.execute("SELECT good, qty, reserved FROM stock WHERE holder=?", (f"company:{bid}",))}
    contracts = [{"id": r["id"], "role": "seller" if r["seller"] == bid else "buyer", "other": r["buyer"] if r["seller"] == bid else r["seller"],
                  "good": r["good"], "qty_per_day": r["qty_per_day"], "price": r["price"] / C, "end_day": r["end_day"], "delivered": r["delivered"], "breaches": r["breaches"]}
                 for r in con.execute("SELECT * FROM contracts WHERE (seller=? OR buyer=?) AND status='active' ORDER BY id", (bid, bid))]
    ref = p.type_ref(b["type"])
    owner = owner_of(con, bid, viewer)
    mine = owner is not None
    vis = "('public','town','owner')" if mine else "('public','town')"
    events = [{"id": e["id"], "kind": e["kind"], "tick": e["tick"], "text": social.display_text(con, e)}
              for e in con.execute(f"SELECT * FROM world_events WHERE withdrawn=0 AND visibility IN {vis} AND (who LIKE ? OR refs LIKE ?) ORDER BY seq DESC LIMIT 6",
                                   (f'%"{bid}"%', f'%"{bid}"%'))]
    out = {
        "id": bid, "type": b["type"], "plot": b["plot"], "status": b["status"], "health": b["health"], "level": b["level"], "rating": b["rating"],
        "owner": b["owner"], "owner_name": names.get(b["owner"], ""), "managing_agent": b["owner"], "opened_tick": b["opened_tick"], "closed_tick": b["closed_tick"],
        "products": [{"good": OUTPUT[b["type"]], "price": b["price"] / C, "unit": "a load" if b["type"] == "delivery" else "each"}],
        "input": INPUT.get(b["type"]), "wage": b["wage"] / C, "now_tick": now,
        "money": {k: {kk: (v / C if kk != "entries" else v) for kk, v in m.items()} for k, m in periods.items()},
        "balance": {"available": (bal["available"] / C) if bal else 0, "reserved": (bal["reserved"] / C) if bal else 0},
        "ledger": {"account": acct, "entries": periods["all"]["entries"], "in": (flows["i"] / C) if flows else 0, "out": (flows["o"] / C) if flows else 0,
                   "balance_matches": bool(bal is not None and flows is not None and flows["i"] - flows["o"] == bal["available"] + bal["reserved"])},
        "recent_sales": sales, "costs_week": costs, "employees": staff, "stock": stock, "contracts": contracts, "events": events,
        "mine": mine,
    }
    from . import shares
    out["shares"] = shares.card_info(con, bid, mine)
    if mine:
        lim = json.loads((con.execute("SELECT limits FROM town_agents WHERE id=?", (owner,)).fetchone() or {"limits": "{}"})["limits"] or "{}")
        lo, hi = lim.get("price_range", p.price_range)
        out["manage"] = {
            "owner_agent": owner, "price_min": round(lo * ref / C, 2), "price_max": round(hi * ref / C, 2), "wage_min": p.civic_wage // 2 / C,
            "upgrade_cost": (b["cost"] // 2) / C, "max_staff": p.hires_level1 + (b["level"] - 1) * p.hires_per_level, "staff": len(staff),
            "requests": [dict(r) | {"inputs": json.loads(r["inputs"])} for r in con.execute(
                "SELECT id, kind, inputs, status, refusal, detail, done_tick FROM owner_requests WHERE business=? ORDER BY id DESC LIMIT 8", (bid,))],
        }
    return out


class RequestError(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code, self.detail = code, detail


def request(con: sqlite3.Connection, bid: str, user_id: str, kind: str, inputs: dict) -> dict:
    """Store an owner's request; the next tick applies it through the Actions gate."""
    owner = owner_of(con, bid, user_id)
    if owner is None:
        raise RequestError("NOT_OWNER", "only the business's owner can change it")
    if kind not in REQUEST_KINDS:
        raise RequestError("NOT_ALLOWED", f"'{kind}' is not something an owner can ask for here")
    clean: dict = {"business": bid}
    if kind == "set_price":
        clean["price"] = int(round(float(inputs.get("price", 0)) * C))
        if clean["price"] <= 0:
            raise RequestError("BAD_INPUT", "a price must be above zero")
    elif kind == "set_wage":
        clean["wage"] = int(round(float(inputs.get("wage", 0)) * C))
        if clean["wage"] <= 0:
            raise RequestError("BAD_INPUT", "a wage must be above zero")
    elif kind == "hire":
        clean["slots"] = max(1, min(5, int(inputs.get("slots", 1))))
    elif kind == "end_contract":
        cid = str(inputs.get("contract", ""))
        if not con.execute("SELECT 1 FROM contracts WHERE id=? AND (seller=? OR buyer=?) AND status='active'", (cid, bid, bid)).fetchone():
            raise RequestError("BAD_INPUT", "no such active contract on this business")
        clean = {"contract": cid}
    elif kind == "close_business":
        clean["reason"] = "the owner closed it"
    elif kind == "list_shares":
        from .shares import MAX_OFFER
        clean["qty"] = int(inputs.get("qty", 300) or 0)
        if not 1 <= clean["qty"] <= MAX_OFFER:
            raise RequestError("BAD_INPUT", f"offer between 1 and {MAX_OFFER} shares; you keep the majority")
    elif kind == "post_job":
        clean["slots"] = int(inputs.get("slots", 1) or 0)
        clean["wage"] = int(round(float(inputs.get("wage", 0) or 0) * C))
        if not 1 <= clean["slots"] <= 5:
            raise RequestError("BAD_INPUT", "post between 1 and 5 positions")
        if clean["wage"] < tuned().civic_wage // 2:
            raise RequestError("WAGE_TOO_LOW", f"a wage of at least {tuned().civic_wage // 2 / C:.0f} Sora a day")
    elif kind == "place_order":
        clean.update(_market_order(con, bid, owner, inputs))
    elif kind == "cancel_order":
        oid = int(inputs.get("order", 0) or 0)
        if not con.execute("SELECT 1 FROM goods_orders WHERE id=? AND holder=? AND status IN ('open','partial')", (oid, f"company:{bid}")).fetchone():
            raise RequestError("BAD_INPUT", "no such open Market Hall order on this business")
        clean = {"order": oid}
    if con.execute("SELECT COUNT(*) n FROM owner_requests WHERE business=? AND status='queued'", (bid,)).fetchone()["n"] >= 10:
        raise RequestError("TOO_MANY", "ten requests are already waiting for the next tick")
    cur = con.execute("INSERT INTO owner_requests(business, actor, user_id, kind, inputs, created_at) VALUES (?,?,?,?,?,?)",
                      (bid, owner, user_id, kind, json.dumps(clean, sort_keys=True), time.time()))
    return {"id": cur.lastrowid, "status": "queued", "kind": kind, "inputs": clean}


def _market_order(con: sqlite3.Connection, bid: str, owner: str, inputs: dict) -> dict:
    """The player market: an owner offers their business's goods at the Market Hall, or bids for some, at their own price."""
    from . import market
    from .. import ledger
    good, side = str(inputs.get("good", "")), str(inputs.get("side", ""))
    if good not in market.MARKET_GOODS:
        raise RequestError("BAD_INPUT", "the Market Hall trades crops, tools and materials")
    if side not in ("buy", "sell"):
        raise RequestError("BAD_INPUT", "choose to buy or to sell")
    price, qty = int(round(float(inputs.get("price", 0) or 0) * C)), int(inputs.get("qty", 0) or 0)
    if not 1 <= qty <= market.MAX_QTY:
        raise RequestError("BAD_INPUT", f"between 1 and {market.MAX_QTY} at a time")
    lo, hi = market.band(good)
    if not lo <= price <= hi:
        raise RequestError("PRICE_BAND", f"a price between {lo / C:.2f} and {hi / C:.2f} Sora")
    holder = f"company:{bid}"
    if side == "sell":
        r = con.execute("SELECT qty - reserved q FROM stock WHERE holder=? AND good=?", (holder, good)).fetchone()
        if not r or r["q"] < qty:
            raise RequestError("NO_STOCK", f"this business has {r['q'] if r else 0} {good} to sell")
    else:
        a = con.execute("SELECT available FROM accounts WHERE owner_kind='company' AND owner_id=? AND asset='SORA'", (bid,)).fetchone()
        if not a or a["available"] < price * qty:
            raise RequestError("INSUFFICIENT", f"the business has {(a['available'] if a else 0) / C:.2f} Sora to spend")
    # never against one of your own orders: the Hall refuses that, and it would count against your agent
    okey = con.execute("SELECT owner_key FROM town_agents WHERE id=?", (owner,)).fetchone()
    me = ledger.trade_owner(okey["owner_key"]) if okey else owner
    cross = "price <= ?" if side == "buy" else "price >= ?"
    for r in con.execute(f"SELECT owner_key FROM goods_orders WHERE good=? AND side=? AND status IN ('open','partial') AND {cross}",
                         (good, "sell" if side == "buy" else "buy", price)):
        if ledger.trade_owner(r["owner_key"]) == me:
            raise RequestError("SELF_TRADE", "that price would meet one of your own orders")
    return {"good": good, "side": side, "price": price, "qty": qty, "hours": market.PERSON_HOURS}


def apply_requests(w) -> int:
    """Run every queued owner request through the Actions gate, oldest first (called by the tick before agents act)."""
    from . import actions, place
    rows = w.con.execute("SELECT * FROM owner_requests WHERE status='queued' ORDER BY id").fetchall()
    for r in rows:
        inp = json.loads(r["inputs"])
        if r["kind"] == "move_in":
            res = place.apply_move_in(w, r)
        else:
            res = actions.submit(w, r["actor"], r["kind"], via="human", **inp)
        w.con.execute("UPDATE owner_requests SET status=?, refusal=?, detail=?, done_tick=?, action_id=? WHERE id=?",
                      ("done" if res.ok else "refused", "" if res.ok else res.code, (res.detail or "")[:300], w.tick, res.action_id, r["id"]))
        b = w.biz.get(r["business"])
        if res.ok and b is not None:
            w.save_biz(b)
    return len(rows)
