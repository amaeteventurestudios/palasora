"""Delivery: goods only arrive when delivered (Doc 04 section 2).

A dispatch moves goods onto a cart (the transit holder) and books the cheapest delivery business with a free cart today;
the payer pays its fee a load. With no free cart the owner fetches the goods themselves: no fee, but slowly. Arrival
moves the goods from the cart to the receiver.
"""
from __future__ import annotations

import math

from . import goods
from .params import C


def capacity_left(w, b) -> int:
    return b.labour(w) * w.p.delivery_loads_per_worker - b.loads_today


def dispatch(w, *, src: str, dst: str, good: str, qty: int, payer: tuple[str, str], ref_type: str, ref_id: str, from_reserved: bool = False) -> dict:
    """Move `qty` of `good` from `src` onto a cart for `dst`. Returns the delivery row values."""
    p = w.p
    loads = max(1, math.ceil(qty / p.load_size))
    free = [b for b in w.open_biz() if b.type == "delivery" and capacity_left(w, b) >= loads]
    cheapest = min((b.price for b in free), default=0)
    # carts within 10% of the cheapest fee share the work (the least busy first), so a town's carts all keep running
    carts = sorted(free, key=lambda b: (b.price > cheapest * 1.1, b.loads_today / max(1, b.labour(w) * p.delivery_loads_per_worker), b.price, b.id))
    cart, fee, due = "self", 0, w.tick + p.self_fetch_hours
    payer_bal = w.bal(payer)
    for b in carts:
        f = b.price * loads
        if payer_bal >= f:
            if payer[0] == "company" and w.biz[payer[1]].owner == b.owner:
                continue  # an owner does not pay its own cart; it fetches (keeps the books of each business honest)
            w.pay(payer, b.acct, f, kind="revenue", rule="delivery_fee", ref_type=ref_type, ref_id=ref_id)
            b.loads_today += loads
            b.day["revenue"] = b.day.get("revenue", 0) + f
            b.day["sold"] = b.day.get("sold", 0) + loads
            if payer[0] == "company":
                pb = w.biz[payer[1]]
                pb.day["costs"] = pb.day.get("costs", 0) + f
            cart, fee, due = b.id, f, w.tick + p.trip_hours
            break
    else:
        if w.metrics is not None:
            w.metrics.count("self_fetch", loads)
    goods.move(w.con, w.tick, src, goods.TRANSIT, good, qty, ref_type, ref_id, from_reserved=from_reserved)
    cur = w.con.execute("INSERT INTO deliveries(src, dst, good, qty, cart, fee, status, created_tick, due_tick, ref_type, ref_id) VALUES (?,?,?,?,?,?,'moving',?,?,?,?)",
                        (src, dst, good, qty, cart, fee, w.tick, due, ref_type, ref_id))
    return {"id": cur.lastrowid, "cart": cart, "fee": fee, "due": due}


def arrive(w) -> int:
    rows = w.con.execute("SELECT * FROM deliveries WHERE status='moving' AND due_tick <= ? ORDER BY id", (w.tick,)).fetchall()
    for r in rows:
        goods.move(w.con, w.tick, goods.TRANSIT, r["dst"], r["good"], r["qty"], "delivery", str(r["id"]))
        w.con.execute("UPDATE deliveries SET status='arrived' WHERE id=?", (r["id"],))
    return len(rows)


def incoming(w, dst: str, good: str) -> int:
    return w.con.execute("SELECT COALESCE(SUM(qty),0) s FROM deliveries WHERE status='moving' AND dst=? AND good=?", (dst, good)).fetchone()["s"]


DEFAULT_FEE = 3 * C
