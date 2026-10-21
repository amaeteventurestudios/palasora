"""The Market Hall: an order book for crops, tools and materials (Doc 04 section 8).

It follows the Exchange's matching rules (exchange.py): limit orders only, price-time priority, partial fills, the
resting order sets the price, reservation first (a buy reserves Sora, a sell reserves the goods), and settlement of the
cash leg and the goods leg in the same transaction. Self-trade uses the same owner mapping (ledger.trade_owner): every
house agent maps to the one platform owner. An order that would match its owner's own resting order is rejected
(Doc 04 section 5); otherwise orders never match the same owner. Sold goods leave on a cart (delivery.py). Prices come
from orders, not from the game: the Harbour sits underneath as the seller of materials and the buyer of last resort.
"""
from __future__ import annotations

from .. import db, ledger
from . import delivery, goods
from .params import C

BAND = 0.5          # an order more than 50% away from the good's reference price is rejected
MARKET_GOODS = ("crops", "tools", "materials")


class MarketError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def place(w, *, acct: tuple[str, str], good: str, side: str, price: int, qty: int, ttl_hours: int = 24, reason: str = "") -> dict:
    con = w.con
    if good not in MARKET_GOODS:
        raise MarketError("BAD_GOOD", "the Market Hall trades crops, tools and materials")
    if side not in ("buy", "sell") or qty <= 0 or price <= 0:
        raise MarketError("BAD_ORDER", "side, price and quantity are required")
    ref = w.ref_price(good)
    if abs(price - ref) > ref * BAND:
        raise MarketError("PRICE_BAND", f"price must be within {int(BAND * 100)}% of {ref / C:.2f} Sora")
    holder = f"{acct[0]}:{acct[1]}"
    okey = w.owner_key_of(acct)
    me = ledger.trade_owner(okey)
    opp = "sell" if side == "buy" else "buy"
    cross = "price <= ?" if side == "buy" else "price >= ?"
    for r in con.execute(f"SELECT owner_key FROM goods_orders WHERE good=? AND side=? AND status IN ('open','partial') AND {cross}", (good, opp, price)):
        if ledger.trade_owner(r["owner_key"]) == me:
            raise MarketError("SELF_TRADE", "this order would match an order with the same owner")
    t = w.tick
    cur = con.execute("""INSERT INTO goods_orders(idem_key, holder, owner_key, good, side, price, qty, status, reserved_left, tick, expires_tick, reason)
                         VALUES (?,?,?,?,?,?,?,'open',0,?,?,?)""", (w.key("gorder"), holder, okey, good, side, price, qty, t, t + ttl_hours, reason[:200]))
    oid = cur.lastrowid
    if side == "buy":
        aid = w.acct_id(acct[0], acct[1], okey)
        try:
            ledger.reserve(con, aid, db.SORA, price * qty, idem_key=f"greserve:{oid}", ref_type="goods_order", ref_id=str(oid), txn_id=f"t{t}")
        except ledger.LedgerError as e:
            raise MarketError("INSUFFICIENT", str(e)) from e
        con.execute("UPDATE goods_orders SET reserved_left=? WHERE id=?", (price * qty, oid))
    else:
        try:
            goods.reserve(con, holder, good, qty)
        except goods.GoodsError as e:
            raise MarketError("NO_STOCK", str(e)) from e
        con.execute("UPDATE goods_orders SET reserved_left=? WHERE id=?", (qty, oid))
    fills = _match(w, oid)
    return {"order": dict(con.execute("SELECT * FROM goods_orders WHERE id=?", (oid,)).fetchone()), "fills": fills}


def _acct_of(holder: str) -> tuple[str, str]:
    k, i = holder.split(":", 1)
    return (k, i)


def _match(w, oid: int) -> list[dict]:
    con = w.con
    o = con.execute("SELECT * FROM goods_orders WHERE id=?", (oid,)).fetchone()
    me = ledger.trade_owner(o["owner_key"])
    if o["side"] == "buy":
        book = con.execute(f"""SELECT * FROM goods_orders WHERE good=? AND side='sell' AND status IN ('open','partial') AND price<=? AND id != ?
                               AND {ledger.TRADE_OWNER_SQL} != ? ORDER BY price ASC, id ASC""", (o["good"], o["price"], oid, me)).fetchall()
    else:
        book = con.execute(f"""SELECT * FROM goods_orders WHERE good=? AND side='buy' AND status IN ('open','partial') AND price>=? AND id != ?
                               AND {ledger.TRADE_OWNER_SQL} != ? ORDER BY price DESC, id ASC""", (o["good"], o["price"], oid, me)).fetchall()
    fills = []
    remaining = o["qty"] - o["filled"]
    for r in book:
        if remaining <= 0:
            break
        q = min(remaining, r["qty"] - r["filled"])
        px = r["price"]
        buy, sell = (o, r) if o["side"] == "buy" else (r, o)
        b_acct, s_acct = _acct_of(buy["holder"]), _acct_of(sell["holder"])
        b_id = w.acct_id(*b_acct, buy["owner_key"])
        s_id = w.acct_id(*s_acct, sell["owner_key"])
        tag = f"{buy['id']}:{sell['id']}:{buy['filled']}:{sell['filled']}"
        ledger.transfer(con, kind="goods_cash", idem_key=f"gcash:{tag}", src=b_id, src_bucket="reserved", dst=s_id, dst_bucket="available", asset=db.SORA,
                        amount=px * q, txn_id=f"t{w.tick}", ref_type="goods_order", ref_id=str(oid), rule="market_hall")
        improve = (buy["price"] - px) * q
        if improve > 0:
            ledger.release(con, b_id, db.SORA, improve, idem_key=f"gimprove:{tag}", ref_type="goods_order", ref_id=str(buy["id"]), txn_id=f"t{w.tick}")
        for side_row, consumed in ((buy, buy["price"] * q), (sell, q)):
            filled = side_row["filled"] + q
            con.execute("UPDATE goods_orders SET filled=?, status=?, reserved_left=reserved_left-? WHERE id=?",
                        (filled, "filled" if filled == side_row["qty"] else "partial", consumed, side_row["id"]))
        cur = con.execute("INSERT INTO goods_trades(good, buy_order, sell_order, buyer, seller, price, qty, tick) VALUES (?,?,?,?,?,?,?,?)",
                          (o["good"], buy["id"], sell["id"], buy["holder"], sell["holder"], px, q, w.tick))
        delivery.dispatch(w, src=sell["holder"], dst=buy["holder"], good=o["good"], qty=q, payer=b_acct, ref_type="goods_trade", ref_id=str(cur.lastrowid),
                          from_reserved=True)
        _book(w, b_acct, -px * q, "inputs")
        _book(w, s_acct, px * q, "revenue", sold=q)
        fills.append({"trade": cur.lastrowid, "price": px, "qty": q, "buyer": buy["holder"], "seller": sell["holder"]})
        w.event("market_trade", [b_acct[1], s_acct[1]], f"Market Hall: {q} {o['good']} at {px / C:.2f} Sora", visibility="town",
                refs={"goods_trade": cur.lastrowid})
        remaining -= q
        o = con.execute("SELECT * FROM goods_orders WHERE id=?", (oid,)).fetchone()
    return fills


def _book(w, acct: tuple[str, str], amount: int, key: str, sold: int = 0) -> None:
    if acct[0] != "company" or acct[1] not in w.biz:
        return
    b = w.biz[acct[1]]
    if amount < 0:
        b.day["costs"] = b.day.get("costs", 0) - amount
        b.day[key] = b.day.get(key, 0) - amount
    else:
        b.day["revenue"] = b.day.get("revenue", 0) + amount
        b.day["sold"] = b.day.get("sold", 0) + sold


def cancel(w, oid: int, reason: str = "cancelled") -> None:
    con = w.con
    o = con.execute("SELECT * FROM goods_orders WHERE id=?", (oid,)).fetchone()
    if not o or o["status"] not in ("open", "partial"):
        return
    if o["reserved_left"] > 0:
        if o["side"] == "buy":
            aid = w.acct_id(*_acct_of(o["holder"]), o["owner_key"])
            ledger.release(con, aid, db.SORA, o["reserved_left"], idem_key=f"gcancel:{oid}", ref_type="goods_order", ref_id=str(oid), txn_id=f"t{w.tick}")
        else:
            goods.release(con, o["holder"], o["good"], o["reserved_left"])
    con.execute("UPDATE goods_orders SET status='cancelled', reserved_left=0, reason=? WHERE id=?", (reason[:200], oid))


def expire(w) -> int:
    rows = w.con.execute("SELECT id FROM goods_orders WHERE status IN ('open','partial') AND expires_tick <= ? ORDER BY id", (w.tick,)).fetchall()
    for r in rows:
        cancel(w, r["id"], "expired")
    return len(rows)


def last_price(w, good: str) -> int | None:
    r = w.con.execute("SELECT price FROM goods_trades WHERE good=? ORDER BY id DESC LIMIT 1", (good,)).fetchone()
    return r["price"] if r else None


def check_reservations(con) -> list[dict]:
    """Every goods order's reservation matches what its holder has reserved (Sora or goods)."""
    bad = []
    cash: dict = {}
    gds: dict = {}
    for o in con.execute("SELECT * FROM goods_orders WHERE status IN ('open','partial')"):
        if o["side"] == "buy":
            cash[o["holder"]] = cash.get(o["holder"], 0) + o["reserved_left"]
        else:
            gds[(o["holder"], o["good"])] = gds.get((o["holder"], o["good"]), 0) + o["reserved_left"]
    for r in con.execute("SELECT holder, good, reserved FROM stock WHERE reserved > 0 OR holder IN (SELECT holder FROM goods_orders)"):
        if r["reserved"] != gds.get((r["holder"], r["good"]), 0):
            bad.append({"check": "goods_reservation", "holder": r["holder"], "good": r["good"], "reserved": r["reserved"], "orders": gds.get((r["holder"], r["good"]), 0)})
    return bad, cash
