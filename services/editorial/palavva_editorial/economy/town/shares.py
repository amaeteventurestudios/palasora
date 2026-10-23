"""Bigger businesses: company shares on the Town Exchange.

Every business is a company from day one: its founder holds 1,000 shares (business.mint_shares). A business that has
traded for two weeks and made a profit over the last seven days may list. Its owner offers up to 490 shares (they keep
the majority) at a price set by rule, not by the owner: what the business cost plus twenty days of its recent profit,
over 1,000 shares. From then on the shares trade in a small order book with the Exchange's rules (exchange.py, market.py):
limit orders only, price-time priority, partial fills, the resting order sets the price, reservation first (a buy holds
Sora, a sell holds the shares), and both legs settle in the same transaction. Orders never match their own owner, and
all house agents share one owner (Doc 04 section 5), so house agents can't trade a house business's shares among
themselves: people buy those, and house agents buy into people's businesses.

Every Sunday evening a listed business pays half of the week's profit, when it made one, to everyone holding its shares,
pro rata, keeping a cash reserve. Dividends are ledger transfers from the business to each holder (rule `dividend`), so
the conservation checks cover them. A business that closes is delisted and its open orders are cancelled.
"""
from __future__ import annotations

from .. import db, ledger
from .params import C

SHARES = 1000             # every business has 1,000 shares
MAX_OFFER = 490           # an owner keeps the majority
MIN_DAYS = 14             # days trading before a business may list
PROFIT_DAYS = 20          # the listing price counts this many days of recent profit
BAND = 0.30               # an order more than 30% from the last price is rejected
TTL = 72                  # hours an order rests before it expires
OFFER_TTL = 14 * 24       # the listing offer rests for two weeks
DIVIDEND_SHARE = 0.5      # of a positive week's profit
DIVIDEND_RESERVE = 100 * C  # the business keeps this much cash before paying out
MIN_PRICE = 10            # 0.10 Sora a share


class ShareError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.detail = message


def asset(bid: str) -> str:
    return f"SHR:{bid}"


def listing(con, bid: str) -> dict | None:
    r = con.execute("SELECT * FROM share_listings WHERE business=?", (bid,)).fetchone()
    return dict(r) if r else None


def listed(con) -> list[dict]:
    return [dict(r) for r in con.execute("SELECT * FROM share_listings WHERE status='listed' ORDER BY business")]


def week_profit(b) -> int:
    return sum(h.get("profit", 0) for h in b.history[-7:])


def listing_price(b) -> int:
    """What the business cost plus twenty days of its last week's average profit, over its 1,000 shares."""
    daily = max(0, week_profit(b)) // 7
    return max(MIN_PRICE, (b.cost + PROFIT_DAYS * daily) // SHARES)


def eligibility(w, b) -> tuple[bool, str]:
    days = (w.tick - b.opened_tick) // 24
    if b.status != "open" or b.cart:
        return False, "only an open business on its own plot can list"
    if listing(w.con, b.id):
        return False, "already listed"
    if days < MIN_DAYS:
        return False, f"a business lists after {MIN_DAYS} days of trading (this one has {days})"
    if week_profit(b) <= 0:
        return False, "a business lists after a week with a profit"
    return True, ""


def last_price(con, bid: str) -> int:
    r = con.execute("SELECT price FROM share_trades WHERE business=? ORDER BY id DESC LIMIT 1", (bid,)).fetchone()
    if r:
        return r["price"]
    lst = listing(con, bid)
    return lst["ipo_price"] if lst else 0


def _cash(w, a) -> int:
    return w.acct_id(a.owner_kind, a.id, a.owner_key)


def _shr(w, a, bid: str) -> int:
    return ledger.account(w.con, a.owner_kind, a.id, asset(bid), a.owner_key)["id"]


def held(con, owner_kind: str, owner_id: str, bid: str) -> tuple[int, int]:
    r = con.execute("SELECT available, reserved FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset(bid))).fetchone()
    return (r["available"], r["reserved"]) if r else (0, 0)


def holders(con, bid: str) -> list[dict]:
    """Everyone holding the business's shares (agents and people), largest first."""
    return [{"kind": r["owner_kind"], "id": r["owner_id"], "shares": r["s"]} for r in con.execute(
        "SELECT owner_kind, owner_id, available + reserved s FROM accounts WHERE asset=? AND owner_kind != 'platform' AND available + reserved > 0 "
        "ORDER BY s DESC, owner_id", (asset(bid),))]


# ---------------------------------------------------------------------------------------------------------- listing
def list_business(w, a, b, qty: int) -> dict:
    """The owner offers `qty` of their shares at the listing price: one resting sell order, the first day's offering."""
    ok, why = eligibility(w, b)
    if not ok:
        raise ShareError("NOT_ELIGIBLE", why)
    qty = int(qty)
    avail, _r = held(w.con, a.owner_kind, a.id, b.id)
    if not (1 <= qty <= MAX_OFFER) or qty > avail - (SHARES - MAX_OFFER):
        raise ShareError("BAD_QTY", f"an owner offers between 1 and {MAX_OFFER} shares and keeps the majority")
    price = listing_price(b)
    w.con.execute("INSERT INTO share_listings(business, listed_tick, ipo_price, ipo_qty, status) VALUES (?,?,?,?, 'listed')", (b.id, w.tick, price, qty))
    order = place(w, a, b.id, "sell", price, qty, reason="listing")
    w.event("shares_listed", [a.id, b.id], f"{b.id} listed on the Town Exchange: {qty} shares at {price / C:.2f} Sora", visibility="public",
            refs={"business": b.id, "price": price, "qty": qty})
    return {"business": b.id, "price": price, "qty": qty, "order": order["order"]["id"]}


def wind_up(w, b) -> None:
    """A listed business that closes pays its cash out to every shareholder pro rata, then leaves the Exchange."""
    lst = listing(w.con, b.id)
    if lst is None or lst["status"] != "listed":
        return
    delist(w, b.id, "business closed")
    per = w.bal(b.acct) // SHARES
    if per > 0:
        for h in holders(w.con, b.id):
            w.pay(b.acct, (h["kind"], h["id"]), per * h["shares"], kind="transfer", rule="wind_up", ref_type="business", ref_id=b.id)


def delist(w, bid: str, reason: str) -> None:
    if not listing(w.con, bid):
        return
    for r in w.con.execute("SELECT id FROM share_orders WHERE business=? AND status IN ('open','partial') ORDER BY id", (bid,)).fetchall():
        cancel(w, r["id"], reason)
    w.con.execute("UPDATE share_listings SET status='delisted' WHERE business=?", (bid,))


# ---------------------------------------------------------------------------------------------------------- orders
def place(w, a, bid: str, side: str, price: int, qty: int, reason: str = "") -> dict:
    con = w.con
    lst = listing(con, bid)
    if lst is None or lst["status"] != "listed":
        raise ShareError("NOT_LISTED", f"{bid} is not listed")
    price, qty = int(price), int(qty)
    if side not in ("buy", "sell") or price <= 0 or qty <= 0:
        raise ShareError("BAD_ORDER", "side, price and quantity are required")
    ref = last_price(con, bid)
    if abs(price - ref) > ref * BAND:
        raise ShareError("PRICE_BAND", f"price must be within {int(BAND * 100)}% of {ref / C:.2f} Sora")
    me = ledger.trade_owner(a.owner_key)
    opp, cross = ("sell", "price <= ?") if side == "buy" else ("buy", "price >= ?")
    for r in con.execute(f"SELECT owner_key FROM share_orders WHERE business=? AND side=? AND status IN ('open','partial') AND {cross}", (bid, opp, price)):
        if ledger.trade_owner(r["owner_key"]) == me:
            raise ShareError("SELF_TRADE", "this order would match an order with the same owner")
    cur = con.execute("""INSERT INTO share_orders(idem_key, business, holder, owner_key, side, price, qty, status, reserved_left, tick, expires_tick, reason)
                         VALUES (?,?,?,?,?,?,?,'open',0,?,?,?)""", (w.key("sorder"), bid, a.id, a.owner_key, side, price, qty, w.tick, w.tick + (OFFER_TTL if reason == "listing" else TTL), reason[:200]))
    oid = cur.lastrowid
    try:
        if side == "buy":
            ledger.reserve(con, _cash(w, a), db.SORA, price * qty, idem_key=f"sreserve:{oid}", ref_type="share_order", ref_id=str(oid), txn_id=f"t{w.tick}")
            con.execute("UPDATE share_orders SET reserved_left=? WHERE id=?", (price * qty, oid))
        else:
            ledger.reserve(con, _shr(w, a, bid), asset(bid), qty, idem_key=f"sreserve:{oid}", ref_type="share_order", ref_id=str(oid), txn_id=f"t{w.tick}")
            con.execute("UPDATE share_orders SET reserved_left=? WHERE id=?", (qty, oid))
    except ledger.LedgerError as e:
        raise ShareError("INSUFFICIENT", "not enough Sora for that order" if side == "buy" else "not enough shares for that order") from e
    fills = _match(w, oid)
    return {"order": dict(con.execute("SELECT * FROM share_orders WHERE id=?", (oid,)).fetchone()), "fills": fills}


def _match(w, oid: int) -> list[dict]:
    con = w.con
    o = con.execute("SELECT * FROM share_orders WHERE id=?", (oid,)).fetchone()
    me = ledger.trade_owner(o["owner_key"])
    if o["side"] == "buy":
        book = con.execute(f"""SELECT * FROM share_orders WHERE business=? AND side='sell' AND status IN ('open','partial') AND price<=? AND id != ?
                               AND {ledger.TRADE_OWNER_SQL} != ? ORDER BY price ASC, id ASC""", (o["business"], o["price"], oid, me)).fetchall()
    else:
        book = con.execute(f"""SELECT * FROM share_orders WHERE business=? AND side='buy' AND status IN ('open','partial') AND price>=? AND id != ?
                               AND {ledger.TRADE_OWNER_SQL} != ? ORDER BY price DESC, id ASC""", (o["business"], o["price"], oid, me)).fetchall()
    fills = []
    remaining = o["qty"] - o["filled"]
    bid = o["business"]
    for r in book:
        if remaining <= 0:
            break
        q = min(remaining, r["qty"] - r["filled"])
        px = r["price"]
        buy, sell = (o, r) if o["side"] == "buy" else (r, o)
        ba, sa = w.agents[buy["holder"]], w.agents[sell["holder"]]
        tag = f"{buy['id']}:{sell['id']}:{buy['filled']}:{sell['filled']}"
        k = f"t{w.tick}"
        ledger.transfer(con, kind="trade_cash", idem_key=f"scash:{tag}", src=_cash(w, ba), src_bucket="reserved", dst=_cash(w, sa), dst_bucket="available",
                        asset=db.SORA, amount=px * q, txn_id=k, ref_type="share_order", ref_id=str(oid), rule="town_exchange")
        ledger.transfer(con, kind="trade_shares", idem_key=f"sshr:{tag}", src=_shr(w, sa, bid), src_bucket="reserved", dst=_shr(w, ba, bid), dst_bucket="available",
                        asset=asset(bid), amount=q, txn_id=k, ref_type="share_order", ref_id=str(oid), rule="town_exchange")
        improve = (buy["price"] - px) * q
        if improve > 0:
            ledger.release(con, _cash(w, ba), db.SORA, improve, idem_key=f"simprove:{tag}", ref_type="share_order", ref_id=str(buy["id"]), txn_id=k)
        for row, consumed in ((buy, buy["price"] * q), (sell, q)):
            filled = row["filled"] + q
            con.execute("UPDATE share_orders SET filled=?, status=?, reserved_left=reserved_left-? WHERE id=?",
                        (filled, "filled" if filled == row["qty"] else "partial", consumed, row["id"]))
        cur = con.execute("INSERT INTO share_trades(business, buy_order, sell_order, buyer, seller, price, qty, tick) VALUES (?,?,?,?,?,?,?,?)",
                          (bid, buy["id"], sell["id"], ba.id, sa.id, px, q, w.tick))
        fills.append({"trade": cur.lastrowid, "price": px, "qty": q, "buyer": ba.id, "seller": sa.id})
        w.event("shares_traded", [ba.id, sa.id, bid], f"Town Exchange: {q} shares of {bid} at {px / C:.2f} Sora", visibility="town",
                refs={"business": bid, "share_trade": cur.lastrowid})
        remaining -= q
        o = con.execute("SELECT * FROM share_orders WHERE id=?", (oid,)).fetchone()
    return fills


def cancel(w, oid: int, reason: str = "cancelled") -> None:
    con = w.con
    o = con.execute("SELECT * FROM share_orders WHERE id=?", (oid,)).fetchone()
    if not o or o["status"] not in ("open", "partial"):
        return
    a = w.agents[o["holder"]]
    if o["reserved_left"] > 0:
        if o["side"] == "buy":
            ledger.release(con, _cash(w, a), db.SORA, o["reserved_left"], idem_key=f"scancel:{oid}", ref_type="share_order", ref_id=str(oid), txn_id=f"t{w.tick}")
        else:
            ledger.release(con, _shr(w, a, o["business"]), asset(o["business"]), o["reserved_left"], idem_key=f"scancel:{oid}", ref_type="share_order",
                           ref_id=str(oid), txn_id=f"t{w.tick}")
    con.execute("UPDATE share_orders SET status='cancelled', reserved_left=0, reason=? WHERE id=?", (reason[:200], oid))


def expire(w) -> int:
    rows = w.con.execute("SELECT id FROM share_orders WHERE status IN ('open','partial') AND expires_tick <= ? ORDER BY id", (w.tick,)).fetchall()
    for r in rows:
        cancel(w, r["id"], "expired")
    return len(rows)


# ---------------------------------------------------------------------------------------------------------- dividends
def pay_dividends(w) -> int:
    """Sunday 21:00: each listed business pays half of a profitable week to its shareholders, pro rata, keeping a reserve."""
    paid = 0
    for lst in listed(w.con):
        b = w.biz.get(lst["business"])
        if b is None or b.status != "open":
            continue
        pot = min(int(max(0, week_profit(b)) * DIVIDEND_SHARE), w.bal(b.acct) - DIVIDEND_RESERVE)
        per = pot // SHARES
        if per <= 0:
            continue
        hs = holders(w.con, b.id)
        total = 0
        for h in hs:
            amt = per * h["shares"]
            w.pay(b.acct, (h["kind"], h["id"]), amt, kind="transfer", rule="dividend", ref_type="business", ref_id=b.id)
            total += amt
        w.con.execute("INSERT INTO share_dividends(business, tick, per_share, total, holders) VALUES (?,?,?,?,?)", (b.id, w.tick, per, total, len(hs)))
        b.day["dividends"] = b.day.get("dividends", 0) + total
        w.event("dividend_paid", [b.owner, b.id], f"{b.id} paid a dividend of {per / C:.2f} Sora a share ({total / C:.0f} Sora to {len(hs)} shareholders)",
                visibility="town", refs={"business": b.id, "per_share": per})
        paid += total
    return paid


def week_dividend(con, bid: str) -> int:
    r = con.execute("SELECT per_share FROM share_dividends WHERE business=? ORDER BY id DESC LIMIT 1", (bid,)).fetchone()
    return r["per_share"] if r else 0


def check_reservations(con) -> list[dict]:
    """Every resting sell order's shares are what its holder has reserved."""
    want: dict = {}
    for o in con.execute("SELECT holder, business, reserved_left FROM share_orders WHERE status IN ('open','partial') AND side='sell'"):
        want[(o["holder"], o["business"])] = want.get((o["holder"], o["business"]), 0) + o["reserved_left"]
    bad = []
    for r in con.execute("SELECT owner_id, asset, reserved FROM accounts WHERE asset LIKE 'SHR:%' AND owner_kind != 'platform'"):
        k = (r["owner_id"], r["asset"][4:])
        if r["reserved"] != want.get(k, 0):
            bad.append({"check": "share_reservation", "holder": k[0], "business": k[1], "reserved": r["reserved"], "orders": want.get(k, 0)})
    return bad


# ---------------------------------------------------------------------------------------------------------- reads (API)
def _name(con, aid: str, names: dict) -> str:
    from .residents import made_up_name
    return names.get(aid) or made_up_name(aid)


def _week_profit_ledger(con, bid: str) -> int:
    from .card import _acct, money, now_tick
    from .world import EPOCH
    return money(con, _acct(con, bid), EPOCH + (now_tick(con) + 1 - 24 * 7) * 3600)["profit"]


def _row(con, bid: str, me: str | None, names: dict) -> dict:
    b = con.execute("SELECT id, type, plot, owner, status, cost FROM businesses WHERE id=?", (bid,)).fetchone()
    lst = listing(con, bid)
    last = last_price(con, bid)
    ask = con.execute("SELECT MIN(price) p FROM share_orders WHERE business=? AND side='sell' AND status IN ('open','partial')", (bid,)).fetchone()["p"]
    bid_ = con.execute("SELECT MAX(price) p FROM share_orders WHERE business=? AND side='buy' AND status IN ('open','partial')", (bid,)).fetchone()["p"]
    div = week_dividend(con, bid)
    hs = holders(con, bid)
    mine = 0
    if me:
        kind = con.execute("SELECT owner_kind FROM town_agents WHERE id=?", (me,)).fetchone()
        mine = sum(held(con, kind["owner_kind"], me, bid)) if kind else 0
    return {"business": bid, "type": b["type"], "plot": b["plot"], "owner": b["owner"], "owner_name": _name(con, b["owner"], names),
            "status": lst["status"], "listed_tick": lst["listed_tick"], "ipo_price": lst["ipo_price"] / C, "price": last / C,
            "change_pct": round((last - lst["ipo_price"]) * 100 / lst["ipo_price"], 1), "ask": ask / C if ask else None, "bid": bid_ / C if bid_ else None,
            "dividend": div / C, "yield_pct": round(div * 100 / last, 1) if last else 0, "holders": len(hs),
            "public": sum(h["shares"] for h in hs if h["id"] != b["owner"]), "week_profit": _week_profit_ledger(con, bid) / C, "mine": mine}


def board(con, user_id: str = "") -> dict:
    """The Town Exchange: every listed business, its price, dividend and holders, and the viewer's own shares."""
    from .place import _resident
    me = _resident(con, user_id)
    names = {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}
    rows = [_row(con, l["business"], me, names) for l in listed(con)]
    rows.sort(key=lambda r: (-r["dividend"], r["business"]))
    mine = []
    if me:
        kind = con.execute("SELECT owner_kind FROM town_agents WHERE id=?", (me,)).fetchone()
        for r in con.execute("SELECT asset, available + reserved s FROM accounts WHERE owner_kind=? AND owner_id=? AND asset LIKE 'SHR:%' AND available + reserved > 0",
                             (kind["owner_kind"] if kind else "human", me)):
            bid = r["asset"][4:]
            st = con.execute("SELECT status FROM businesses WHERE id=?", (bid,)).fetchone()
            lst = listing(con, bid)
            mine.append({"business": bid, "shares": r["s"], "price": last_price(con, bid) / C if lst else 0, "listed": bool(lst and lst["status"] == "listed"),
                         "open": bool(st and st["status"] == "open")})
    paid = con.execute("SELECT COALESCE(SUM(total),0) s FROM share_dividends").fetchone()["s"]
    return {"listed": rows, "resident": me is not None, "agent": me, "holdings": mine, "dividends_paid": paid / C,
            "rules": {"min_days": MIN_DAYS, "max_offer": MAX_OFFER, "band_pct": int(BAND * 100), "dividend_share_pct": int(DIVIDEND_SHARE * 100),
                      "order_hours": TTL}}


def detail(con, bid: str, user_id: str = "") -> dict | None:
    from .place import _resident
    lst = listing(con, bid)
    if lst is None:
        return None
    me = _resident(con, user_id)
    names = {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}
    out = _row(con, bid, me, names)
    book = lambda side, order: [{"price": r["price"] / C, "qty": r["q"]} for r in con.execute(  # noqa: E731
        f"SELECT price, SUM(qty - filled) q FROM share_orders WHERE business=? AND side=? AND status IN ('open','partial') GROUP BY price ORDER BY price {order} LIMIT 5",
        (bid, side))]
    out["book"] = {"sell": book("sell", "ASC"), "buy": book("buy", "DESC")}
    out["trades"] = [{"tick": r["tick"], "price": r["price"] / C, "qty": r["qty"], "buyer": _name(con, r["buyer"], names), "seller": _name(con, r["seller"], names)}
                     for r in con.execute("SELECT * FROM share_trades WHERE business=? ORDER BY id DESC LIMIT 10", (bid,))]
    out["holder_list"] = [{"id": h["id"], "name": _name(con, h["id"], names), "shares": h["shares"], "owner": h["id"] == out["owner"]}
                          for h in holders(con, bid)[:8]]
    out["dividends"] = [{"tick": r["tick"], "per_share": r["per_share"] / C, "total": r["total"] / C, "holders": r["holders"]}
                        for r in con.execute("SELECT * FROM share_dividends WHERE business=? ORDER BY id DESC LIMIT 6", (bid,))]
    out["orders"] = [dict(r) | {"price": r["price"] / C} for r in con.execute(
        "SELECT id, side, price, qty, filled, status, expires_tick FROM share_orders WHERE business=? AND holder=? AND status IN ('open','partial') ORDER BY id",
        (bid, me or ""))] if me else []
    out["requests"] = [dict(r) | {"inputs": __import__("json").loads(r["inputs"])} for r in con.execute(
        "SELECT id, kind, inputs, status, refusal, detail FROM owner_requests WHERE user_id=? AND kind IN ('buy_shares','sell_shares','cancel_share_order') "
        "AND inputs LIKE ? ORDER BY id DESC LIMIT 6", (user_id, f'%"{bid}"%'))] if user_id else []
    out["resident"] = me is not None
    return out


def card_info(con, bid: str, owner: bool) -> dict:
    """What the business card shows about shares: listed (price, dividend) or, for its owner, whether it can list."""
    lst = listing(con, bid)
    if lst and lst["status"] == "listed":
        return {"listed": True, "price": last_price(con, bid) / C, "ipo_price": lst["ipo_price"] / C, "dividend": week_dividend(con, bid) / C,
                "holders": len(holders(con, bid))}
    out: dict = {"listed": False, "delisted": bool(lst)}
    if owner and not lst:
        from .card import now_tick
        b = con.execute("SELECT opened_tick, cost, status, cart FROM businesses WHERE id=?", (bid,)).fetchone()
        days = (now_tick(con) - b["opened_tick"]) // 24
        wp = _week_profit_ledger(con, bid)
        why = ("only an open business on its own plot can list" if b["status"] != "open" or b["cart"] else
               f"a business lists after {MIN_DAYS} days of trading (this one has {days})" if days < MIN_DAYS else
               "a business lists after a week with a profit" if wp <= 0 else "")
        out.update({"eligible": not why, "why": why, "listing_price": max(MIN_PRICE, (b["cost"] + PROFIT_DAYS * max(0, wp) // 7) // SHARES) / C,
                    "max_offer": MAX_OFFER})
    return out
