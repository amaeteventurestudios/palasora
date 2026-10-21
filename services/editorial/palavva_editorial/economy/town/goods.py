"""Goods: stock held by each holder, and the goods log (Doc 05 section 2, Goods part).

Goods are created only by production ('made') and imports ('imported') and destroyed only by eating, wear and exports
('eaten', 'worn', 'exported'); 'moved' rows always come in pairs that sum to zero (Doc 04 section 5, invariant 2). A
holder can never go below zero (CHECK) and cannot move or destroy what it has reserved for an open order.
This part never sets prices and never moves money.
"""
from __future__ import annotations

import sqlite3

TRANSIT = "platform:transit"   # goods on a cart, between a dispatch and an arrival
CREATE = ("made", "imported")
DESTROY = ("eaten", "worn", "exported")


class GoodsError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def get(con: sqlite3.Connection, holder: str, good: str) -> tuple[int, int]:
    r = con.execute("SELECT qty, reserved FROM stock WHERE holder=? AND good=?", (holder, good)).fetchone()
    return (r["qty"], r["reserved"]) if r else (0, 0)


def free(con: sqlite3.Connection, holder: str, good: str) -> int:
    q, r = get(con, holder, good)
    return q - r


def _log(con: sqlite3.Connection, tick: int, holder: str, good: str, change: int, cause: str, ref_type: str, ref_id: str) -> None:
    con.execute("INSERT INTO goods_log(tick, holder, good, change, cause, ref_type, ref_id) VALUES (?,?,?,?,?,?,?)",
                (tick, holder, good, change, cause, ref_type, ref_id))


def _add(con: sqlite3.Connection, holder: str, good: str, n: int) -> None:
    con.execute("INSERT INTO stock(holder, good, qty) VALUES (?,?,?) ON CONFLICT(holder, good) DO UPDATE SET qty = qty + excluded.qty", (holder, good, n))


def _take(con: sqlite3.Connection, holder: str, good: str, n: int, from_reserved: bool = False) -> None:
    q, r = get(con, holder, good)
    have = r if from_reserved else q - r
    if n > have:
        raise GoodsError("NO_STOCK", f"{holder} has {have} {good}{' reserved' if from_reserved else ''}, needs {n}")
    if from_reserved:
        con.execute("UPDATE stock SET qty = qty - ?, reserved = reserved - ? WHERE holder=? AND good=?", (n, n, holder, good))
    else:
        con.execute("UPDATE stock SET qty = qty - ? WHERE holder=? AND good=?", (n, holder, good))


def create(con: sqlite3.Connection, tick: int, holder: str, good: str, n: int, cause: str, ref_type: str = "", ref_id: str = "") -> None:
    if cause not in CREATE or n <= 0:
        raise GoodsError("BAD_CAUSE", "goods are created only by production and imports")
    _add(con, holder, good, n)
    _log(con, tick, holder, good, n, cause, ref_type, ref_id)


def destroy(con: sqlite3.Connection, tick: int, holder: str, good: str, n: int, cause: str, ref_type: str = "", ref_id: str = "") -> None:
    if cause not in DESTROY or n <= 0:
        raise GoodsError("BAD_CAUSE", "goods are destroyed only by eating, wear and exports")
    _take(con, holder, good, n)
    _log(con, tick, holder, good, -n, cause, ref_type, ref_id)


def move(con: sqlite3.Connection, tick: int, src: str, dst: str, good: str, n: int, ref_type: str = "", ref_id: str = "", from_reserved: bool = False) -> None:
    if n <= 0:
        raise GoodsError("BAD_QTY", "quantity must be positive")
    if src == dst:
        raise GoodsError("SAME_HOLDER", "a move needs two holders")
    _take(con, src, good, n, from_reserved)
    _add(con, dst, good, n)
    _log(con, tick, src, good, -n, "moved", ref_type, ref_id)
    _log(con, tick, dst, good, n, "moved", ref_type, ref_id)


def reserve(con: sqlite3.Connection, holder: str, good: str, n: int) -> None:
    if n > free(con, holder, good):
        raise GoodsError("NO_STOCK", f"{holder} cannot reserve {n} {good}")
    con.execute("UPDATE stock SET reserved = reserved + ? WHERE holder=? AND good=?", (n, holder, good))


def release(con: sqlite3.Connection, holder: str, good: str, n: int) -> None:
    con.execute("UPDATE stock SET reserved = reserved - ? WHERE holder=? AND good=?", (n, holder, good))


def check(con: sqlite3.Connection) -> list[dict]:
    """Full goods conservation: per holder and good, stock equals the sum of its log; per good, moves net to zero and
    stock = made + imported - eaten - worn - exported."""
    bad: list[dict] = []
    logsum = {(r["holder"], r["good"]): r["s"] for r in con.execute("SELECT holder, good, SUM(change) s FROM goods_log GROUP BY holder, good")}
    for r in con.execute("SELECT holder, good, qty, reserved FROM stock"):
        if r["qty"] != logsum.get((r["holder"], r["good"]), 0):
            bad.append({"check": "goods_rebuild", "holder": r["holder"], "good": r["good"], "stock": r["qty"], "log": logsum.get((r["holder"], r["good"]), 0)})
    held = {(r["holder"], r["good"]) for r in con.execute("SELECT holder, good FROM stock")}
    for k, v in logsum.items():
        if k not in held and v != 0:
            bad.append({"check": "goods_rebuild", "holder": k[0], "good": k[1], "stock": 0, "log": v})
    for r in con.execute("SELECT good, SUM(CASE WHEN cause='moved' THEN change ELSE 0 END) mv, SUM(CASE WHEN cause IN ('made','imported') THEN change ELSE 0 END) inn, "
                         "SUM(CASE WHEN cause IN ('eaten','worn','exported') THEN -change ELSE 0 END) outt FROM goods_log GROUP BY good"):
        total = con.execute("SELECT COALESCE(SUM(qty),0) s FROM stock WHERE good=?", (r["good"],)).fetchone()["s"]
        if r["mv"] != 0 or total != r["inn"] - r["outt"]:
            bad.append({"check": "goods_conservation", "good": r["good"], "stock": total, "made_imported": r["inn"], "eaten_worn_exported": r["outt"], "moves": r["mv"]})
    return bad
