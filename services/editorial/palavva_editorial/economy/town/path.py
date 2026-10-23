"""Your path: the ladder from newcomer to company owner (the Capital Rift arc, on what the town already has). Each rung is
read from the town's records, never stored: a home, a first way to earn (a job or a food cart), a business on its own
plot, a first worker, trade beyond your own counter (a Market Hall order or a supply contract), a bigger business (a food
factory or a second business), and shares on the Town Exchange. The card shows the rungs done and points at the next.
"""
from __future__ import annotations

import sqlite3

STEPS = (
    ("home", "Move in", "Pick a free home: a new house goes up for you in Southgate."),
    ("earn", "Start earning", "Take a job from the job board, or start a food cart at a busy kerb."),
    ("business", "Open a business", "Buy a plot and build, or settle your cart on a plot as a stall."),
    ("staff", "Hire your first worker", "Post a job from your business card or the job board."),
    ("trade", "Trade beyond your counter", "Offer goods at the Market Hall, or sign a supply contract."),
    ("bigger", "Grow bigger", "Run a food factory, or a second business."),
    ("listed", "List on the Town Exchange", "After two profitable weeks, offer shares and pay dividends."),
)


def progress(con: sqlite3.Connection, agent: str | None) -> dict:
    if agent is None:
        done: set[str] = set()
    else:
        biz = con.execute("SELECT id, type, cart FROM businesses WHERE owner=? AND status='open'", (agent,)).fetchall()
        ids = [b["id"] for b in biz]
        q = ",".join("?" * len(ids))
        has = lambda sql, *a: bool(ids) and con.execute(sql, (*ids, *a)).fetchone() is not None  # noqa: E731
        done = set()
        if con.execute("SELECT 1 FROM plots WHERE use='home' AND owner=?", (agent,)).fetchone():
            done.add("home")
        if biz or con.execute("SELECT 1 FROM jobs WHERE worker=? AND end_tick IS NULL", (agent,)).fetchone():
            done.add("earn")
        if any(not b["cart"] for b in biz):
            done.add("business")
        if has(f"SELECT 1 FROM jobs WHERE employer IN ({q}) AND end_tick IS NULL"):
            done.add("staff")
        holders = tuple(f"company:{i}" for i in ids)
        if (ids and con.execute(f"SELECT 1 FROM goods_orders WHERE holder IN ({q})", holders).fetchone()) \
                or has(f"SELECT 1 FROM contracts WHERE (seller IN ({q}) OR buyer IN ({q})) AND status='active'", *ids):
            done.add("trade")
        if any(b["type"] == "factory" for b in biz) or sum(1 for b in biz if not b["cart"]) >= 2:
            done.add("bigger")
        if has(f"SELECT 1 FROM share_listings WHERE business IN ({q}) AND status='listed'"):
            done.add("listed")
    steps = [{"key": k, "title": t, "how": h, "done": k in done} for k, t, h in STEPS]
    nxt = next((s["key"] for s in steps if not s["done"]), None)
    return {"steps": steps, "next": nxt, "done": len(done), "total": len(STEPS)}
