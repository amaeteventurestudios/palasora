"""Palasora step 3: finding a place in town. A person moves into a free home, starts trading from a food cart at a free
plot's kerb, and later buys a business plot and builds on it (or settles the cart there as a stall).

`me()` is one read for the "Find a place" panel: the person's resident, home, balance, businesses and carts, their recent
requests, the free homes and the plots for sale with their prices and what each zone allows. Like the business card's
controls, every change is a request: stored now, applied by the town's next tick through the Actions gate
(`apply_move_in` for a newcomer, `actions.submit(..., via="human")` for the rest), so a request can be refused for the
same reasons as an agent's action. Homes cost nothing; a cart costs `cart_cost`; a plot costs its listed price plus the
building's construction.
"""
from __future__ import annotations

import json
import sqlite3
import time

from . import auctions as AU, social
from .params import C, TYPES, tuned

KINDS = ("move_in", "claim_home", "start_cart", "buy_plot", "bid", "build", "buy_shares", "sell_shares", "cancel_share_order")
SHARE_KINDS = ("buy_shares", "sell_shares", "cancel_share_order")  # stored without a business, so they never show on its owner's card
PLACE_KINDS = tuple(k for k in KINDS if k not in SHARE_KINDS)        # share orders show on their listing, not in Find a place
ALLOWED = {"farmland": ("farm",), "harbourside": ("workshop", "delivery", "factory"), "market": ("stall", "delivery"), "main": ("stall", "delivery")}
LABEL = {"farm": "Farm", "workshop": "Workshop", "stall": "Food stall", "delivery": "Delivery depot", "factory": "Food factory"}


class PlaceError(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code, self.detail = code, detail


def _resident(con: sqlite3.Connection, user_id: str) -> str | None:
    if not user_id:
        return None
    r = con.execute("SELECT town_agent FROM town_links WHERE user_id=? AND user_id != '' AND town_agent NOT LIKE 'b%' ORDER BY town_agent LIMIT 1",
                    (user_id,)).fetchone()
    return r["town_agent"] if r else None


def _queued_plots(con: sqlite3.Connection, kinds: tuple, user_id: str = "") -> set[str]:
    """Plots named by requests still waiting for the next tick (by anyone, or by everyone except `user_id`)."""
    out = set()
    for r in con.execute(f"SELECT user_id, inputs FROM owner_requests WHERE status='queued' AND kind IN ({','.join('?' * len(kinds))})", kinds):
        if user_id and r["user_id"] == user_id:
            continue
        p = json.loads(r["inputs"]).get("plot")
        if p:
            out.add(p)
    return out


def for_sale(con: sqlite3.Connection) -> list[dict]:
    p = tuned()
    carts = {r["plot"] for r in con.execute("SELECT plot FROM businesses WHERE cart=1 AND status='open'")}
    held = {a["plot"] for a in AU.open_auctions(con)}
    rows = []
    for pl in con.execute("SELECT id, area, x, y, prime FROM plots WHERE use='business' AND owner='' AND building='' ORDER BY id"):
        if pl["id"] in held:
            continue
        pl = dict(pl)
        price = p.plot_price(pl)
        allowed = ALLOWED.get(pl["area"], ())
        rows.append({"plot": pl["id"], "area": pl["area"], "x": pl["x"], "y": pl["y"], "prime": bool(pl["prime"]), "price": price / C,
                     "allowed": list(allowed), "total": {t: (p.build_cost[t] - p.plot_share + price) / C for t in allowed},
                     "cart_parked": pl["id"] in carts, "kerb": pl["area"] in ("market", "main") and pl["id"] not in carts})
    return rows


def auction_rows(con: sqlite3.Connection, agent: str | None = None) -> list[dict]:
    now = con.execute("SELECT COALESCE(MAX(tick), 0) t FROM world_events").fetchone()["t"]
    out = []
    for a in AU.open_auctions(con):
        pl = con.execute("SELECT area, prime FROM plots WHERE id=?", (a["plot"],)).fetchone()
        mine = con.execute("SELECT MAX(amount) m FROM bids WHERE auction=? AND bidder=?", (a["id"], agent or "")).fetchone()["m"] if agent else None
        out.append({"id": a["id"], "plot": a["plot"], "area": pl["area"] if pl else "", "prime": bool(pl and pl["prime"]), "reserve": a["reserve"] / C,
                    "high": a["high"] / C, "bids": a["bids"], "min_bid": AU.min_bid(a) / C, "ends_tick": a["end_tick"], "hours_left": max(0, a["end_tick"] - now),
                    "leading": bool(agent) and a["high_bidder"] == agent, "my_bid": (mine or 0) / C})
    return out


def me(con: sqlite3.Connection, user_id: str) -> dict:
    p = tuned()
    agent = _resident(con, user_id)
    pending_homes = _queued_plots(con, ("move_in", "claim_home"), user_id)
    free_homes = [{"plot": r["id"], "x": r["x"], "y": r["y"]} for r in con.execute("SELECT id, x, y FROM plots WHERE use='home' AND owner='' ORDER BY id")
                  if r["id"] not in pending_homes]
    out: dict = {"resident": agent is not None, "agent": agent, "home": None, "balance": 0.0, "businesses": [], "carts": [],
                 "free_homes": free_homes, "for_sale": for_sale(con), "requests": [], "auctions": auction_rows(con, agent), "my_plots": [],
                 "prices": {"cart": p.cart_cost / C, "grant": p.grant_new_player / C, "plot_share": p.plot_share / C,
                            "build": {t: p.build_cost[t] / C for t in TYPES}, "max_businesses": p.max_businesses_per_player},
                 "labels": LABEL}
    if user_id:
        out["requests"] = [dict(r) | {"inputs": json.loads(r["inputs"])} for r in con.execute(
            f"SELECT id, kind, inputs, status, refusal, detail, done_tick FROM owner_requests WHERE user_id=? AND kind IN ({','.join('?' * len(PLACE_KINDS))}) "
            "ORDER BY id DESC LIMIT 8", (user_id, *PLACE_KINDS))]
    if agent is None:
        return out
    h = con.execute("SELECT id FROM plots WHERE use='home' AND owner=?", (agent,)).fetchone()
    out["home"] = h["id"] if h else None
    bal = con.execute("SELECT COALESCE(SUM(available),0) s FROM accounts WHERE owner_id=? AND owner_kind IN ('human','agent') AND asset='SORA'",
                      (agent,)).fetchone()
    out["balance"] = bal["s"] / C
    held = con.execute("SELECT COALESCE(SUM(reserved),0) s FROM accounts WHERE owner_id=? AND owner_kind IN ('human','agent') AND asset='SORA'", (agent,)).fetchone()
    out["held"] = held["s"] / C
    for pl in con.execute("SELECT id, area, prime FROM plots WHERE use='business' AND owner=? AND building='' ORDER BY id", (agent,)):
        allowed = ALLOWED.get(pl["area"], ())
        out["my_plots"].append({"plot": pl["id"], "area": pl["area"], "prime": bool(pl["prime"]), "allowed": list(allowed),
                                "total": {t: (p.build_cost[t] - p.plot_share) / C for t in allowed}})
    for b in con.execute("SELECT id, type, plot, cart, level FROM businesses WHERE owner=? AND status='open' ORDER BY id", (agent,)):
        row = {"id": b["id"], "type": b["type"], "plot": b["plot"], "cart": bool(b["cart"]), "level": b["level"]}
        (out["carts"] if b["cart"] else out["businesses"]).append(row)
    return out


def request(con: sqlite3.Connection, user_id: str, kind: str, inputs: dict) -> dict:
    """Store a request to move in, start a cart or buy a plot; the next tick applies it through the Actions gate."""
    if not user_id:
        raise PlaceError("SIGN_IN", "sign in to find a place in town")
    if kind not in KINDS:
        raise PlaceError("NOT_ALLOWED", f"'{kind}' is not something a resident can ask for here")
    agent = _resident(con, user_id)
    plot = str(inputs.get("plot", ""))
    clean: dict = {}
    if kind in ("move_in", "claim_home"):
        if kind == "move_in" and agent is not None:
            raise PlaceError("ALREADY", "you already live in town")
        if kind == "claim_home":
            if agent is None:
                raise PlaceError("NOT_RESIDENT", "move in first")
            if con.execute("SELECT 1 FROM plots WHERE use='home' AND owner=?", (agent,)).fetchone():
                raise PlaceError("ALREADY", "you already have a home")
        row = con.execute("SELECT owner FROM plots WHERE id=? AND use='home'", (plot,)).fetchone()
        if row is None or row["owner"] or plot in _queued_plots(con, ("move_in", "claim_home"), user_id):
            raise PlaceError("NO_PLOT", "that home is not free")
        clean = {"plot": plot}
        if kind == "move_in":
            clean["name"] = str(inputs.get("name", ""))[:60]
    else:
        if agent is None:
            raise PlaceError("NOT_RESIDENT", "move in first")
        sale = {r["plot"]: r for r in for_sale(con)}
        if kind in ("buy_shares", "sell_shares"):
            from . import shares
            bid = str(inputs.get("business", ""))
            lst = shares.listing(con, bid)
            if lst is None or lst["status"] != "listed":
                raise PlaceError("NOT_LISTED", "that business is not on the Town Exchange")
            price = int(round(float(inputs.get("price", 0) or 0) * C))
            qty = int(inputs.get("qty", 0) or 0)
            ref = shares.last_price(con, bid)
            if price <= 0 or not 1 <= qty <= 500:
                raise PlaceError("BAD_INPUT", "a price above zero and between 1 and 500 shares")
            if abs(price - ref) > ref * shares.BAND:
                raise PlaceError("PRICE_BAND", f"the price must be within {int(shares.BAND * 100)}% of {ref / C:.2f} Sora")
            clean = {"business": bid, "price": price, "qty": qty}
        elif kind == "cancel_share_order":
            o = con.execute("SELECT business FROM share_orders WHERE id=? AND holder=? AND status IN ('open','partial')", (int(inputs.get("order", 0) or 0), agent)).fetchone()
            if o is None:
                raise PlaceError("BAD_INPUT", "no such open order of yours")
            clean = {"order": int(inputs.get("order")), "share_business": o["business"]}
        elif kind == "bid":
            au = next((a for a in AU.open_auctions(con) if a["id"] == int(inputs.get("auction", 0) or 0)), None)
            if au is None:
                raise PlaceError("CLOSED", "that auction has ended")
            amount = int(round(float(inputs.get("amount", 0)) * C))
            if amount < AU.min_bid(au):
                raise PlaceError("LOW_BID", f"the lowest bid now is {AU.min_bid(au) / C:.0f} Sora")
            clean = {"auction": au["id"], "amount": amount, "plot": au["plot"]}
        elif kind == "build":
            btype = str(inputs.get("btype", ""))
            row = con.execute("SELECT area FROM plots WHERE id=? AND use='business' AND owner=? AND building=''", (plot, agent)).fetchone()
            if row is None:
                raise PlaceError("NO_PLOT", "that is not an empty plot of yours")
            if btype not in ALLOWED.get(row["area"], ()):
                raise PlaceError("ZONE", f"this plot takes {' or '.join(LABEL[t].lower() for t in ALLOWED.get(row['area'], ()))}")
            clean = {"plot": plot, "btype": btype}
        elif kind == "start_cart":
            if plot and not (plot in sale and sale[plot]["kerb"]):
                raise PlaceError("NO_PLOT", "there is no free kerb by that plot")
            if con.execute("SELECT 1 FROM businesses WHERE owner=? AND cart=1 AND status='open'", (agent,)).fetchone():
                raise PlaceError("ALREADY", "you already run a cart")
            clean = {"plot": plot} if plot else {}
        else:
            btype = str(inputs.get("btype", "stall"))
            if plot not in sale:
                raise PlaceError("NO_PLOT", "that plot is not for sale")
            if btype not in sale[plot]["allowed"]:
                raise PlaceError("ZONE", f"this plot takes {' or '.join(LABEL[t].lower() for t in sale[plot]['allowed'])}")
            clean = {"plot": plot, "btype": btype}
            cart = str(inputs.get("business", ""))
            if cart:
                if not con.execute("SELECT 1 FROM businesses WHERE id=? AND owner=? AND cart=1 AND status='open'", (cart, agent)).fetchone():
                    raise PlaceError("BAD_INPUT", "that is not your cart")
                clean["business"] = cart
    if con.execute("SELECT COUNT(*) n FROM owner_requests WHERE user_id=? AND status='queued'", (user_id,)).fetchone()["n"] >= 10:
        raise PlaceError("TOO_MANY", "ten requests are already waiting for the next tick")
    if kind == "move_in" and con.execute("SELECT 1 FROM owner_requests WHERE user_id=? AND kind='move_in' AND status='queued'", (user_id,)).fetchone():
        raise PlaceError("ALREADY", "your move is already waiting for the next hour")
    cur = con.execute("INSERT INTO owner_requests(business, actor, user_id, kind, inputs, created_at) VALUES (?,?,?,?,?,?)",
                      ("" if kind in SHARE_KINDS else clean.get("business", ""), agent or "", user_id, kind, json.dumps(clean, sort_keys=True), time.time()))
    return {"id": cur.lastrowid, "status": "queued", "kind": kind, "inputs": clean}


def apply_move_in(w, r):
    """A newcomer arrives: a player resident with the new player's grant, tied to the person, then housed in the home they
    picked (or the first free home, if someone moved in first)."""
    from . import actions
    from .genesis import arrive_player
    inp = json.loads(r["inputs"])
    have = _resident(w.con, r["user_id"])
    if have:
        return actions.Result(False, "ALREADY", "already lives in town")
    n = 1 + sum(1 for a in w.agents.values() if a.kind == "player")
    while f"p{n:03d}" in w.agents:
        n += 1
    pid = f"p{n:03d}"
    arrive_player(w, pid)
    social.link(w.con, pid, user_id=r["user_id"], display_name=inp.get("name", ""))
    want = inp.get("plot", "")
    if not (want in w.plots and w.plots[want]["use"] == "home" and not w.plots[want]["owner"]):
        want = next((p["id"] for p in sorted(w.plots.values(), key=lambda p: p["id"]) if p["use"] == "home" and not p["owner"]), "")
    if not want:
        return actions.Result(True, detail="moved in; no free home yet", data={"agent": pid})
    res = actions.submit(w, pid, "claim_home", via="human", plot=want)
    detail = "" if want == inp.get("plot") else f"the home you picked was taken; moved into {want}"
    return actions.Result(res.ok, res.code, detail or res.detail, data={"agent": pid, "plot": want}, action_id=res.action_id)
