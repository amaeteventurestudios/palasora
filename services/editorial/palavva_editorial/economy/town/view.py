"""Palasora Phase 6: what the world viewer reads (Doc 06 sections 8, 9 and 14).

One read for the first frame: the town, its plots (from `plots` once genesis has run, otherwise the fixed layout), the
businesses on them, the viewer's own plot and agent, and "since you left" markers built from stored events. Read-only;
the client never writes the world.
"""
from __future__ import annotations

import json
import sqlite3

from . import auctions, layout, reports, social
from .params import C, tuned


def _town(con: sqlite3.Connection) -> dict:
    r = con.execute("SELECT id, name, slug FROM towns ORDER BY created_at, id LIMIT 1").fetchone()
    if r is None:
        tid, name = social.DEFAULT_TOWN
        return {"id": tid, "name": name, "slug": tid}
    return {"id": r["id"], "name": r["name"], "slug": r["slug"]}


def world(con: sqlite3.Connection, viewer: str = "", since_hours: int = 48) -> dict:
    now = con.execute("SELECT COALESCE(MAX(tick), 0) t FROM world_events").fetchone()["t"]
    stored = [dict(r) for r in con.execute("SELECT id, area, x, y, size, prime, use, owner, building, level FROM plots ORDER BY id")]
    plots = stored or layout.layout()
    by_id = {p["id"]: p for p in plots}
    prices = tuned()
    held = {a["plot"]: a for a in auctions.open_auctions(con)} if stored else {}
    for p in plots:  # step 3: a free business plot shows its price; step 4: or its auction
        if p["id"] in held:
            a = held[p["id"]]
            p["auction"] = {"id": a["id"], "reserve": a["reserve"] / C, "high": a["high"] / C, "bids": a["bids"], "ends_tick": a["end_tick"],
                            "min_bid": auctions.min_bid(a) / C}
        elif p["use"] == "business" and not p["owner"] and not p["building"]:
            p["price"] = prices.plot_price(p) / C
    names = {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}
    biz = []
    listed = {r["business"] for r in con.execute("SELECT business FROM share_listings WHERE status='listed'")}
    for b in con.execute("SELECT id, type, plot, owner, price, wage, level, health, status, opened_tick, cart FROM businesses ORDER BY id"):
        if b["plot"] not in by_id:
            continue
        row = {"id": b["id"], "type": b["type"], "plot": b["plot"], "owner": b["owner"], "owner_name": names.get(b["owner"], ""),
               "level": b["level"], "health": b["health"], "status": b["status"], "price_sora": b["price"] / C, "wage_sora": b["wage"] / C,
               "opened_tick": b["opened_tick"], "cart": bool(b["cart"]), "listed": b["id"] in listed}
        biz.append(row)
        if b["status"] == "open" and not b["cart"]:  # a cart stands at the kerb; the plot stays free
            by_id[b["plot"]]["business"] = b["id"]
    members = social.members_of(con, viewer) if viewer else set()
    agents = sorted(m for m in members if not m.startswith("b"))
    mine_biz = [b for b in biz if b["id"] in members]
    # "My Plot" is where the person trades (an owned business plot), else their home
    my_plot = next((p["id"] for p in plots if p["owner"] and p["owner"] in members and p["use"] != "home"), None) or \
        next((b["plot"] for b in mine_biz if not b["cart"]), None) or next((p["id"] for p in plots if p["owner"] and p["owner"] in members), None)
    markers: list[dict] = []
    away = None
    if viewer:
        away = reports.away(con, members, max(0, now - max(1, min(since_hours, 24 * 14))), 12)
        for i in away["items"]:
            ev = con.execute("SELECT who, refs FROM world_events WHERE id=?", (i["event"],)).fetchone()
            i["text"] = social.display_text(con, i)
            refs, who = json.loads(ev["refs"]), json.loads(ev["who"])
            ids = [refs["business"]] if refs.get("business") else [w for w in who if w.startswith("b")]
            plot = next((b["plot"] for b in biz if b["id"] in ids), None)
            i["plot"] = plot
            if plot and not any(m["plot"] == plot for m in markers):
                markers.append({"plot": plot, "event": i["event"], "kind": i["kind"], "yours": i["yours"]})
    flows = goods_flows(con, now, by_id) if stored else []
    population = con.execute("SELECT COUNT(*) n FROM town_agents WHERE status='active'").fetchone()["n"]
    return {"town": _town(con), "tick": now, "population": population, "grid": {"w": layout.WIDTH, "d": layout.DEPTH}, "founded": bool(stored), "plots": plots,
            "businesses": biz, "mine": {"plot": my_plot, "agents": agents, "businesses": [b["id"] for b in mine_biz], "resident": bool(members),
                     "home": next((p["id"] for p in plots if p["use"] == "home" and p["owner"] and p["owner"] in members), None)},
            "away": away, "markers": markers, "flows": flows}


def goods_flows(con: sqlite3.Connection, now: int, by_id: dict, limit: int = 40) -> list[dict]:
    """Step 4, visible logistics: goods moving between places, from plot to plot. Active contracts (a daily route) and the
    last day's deliveries; the Harbour's cargo starts or ends at the harbour plot. Busiest routes first."""
    plot_of = {r["id"]: r["plot"] for r in con.execute("SELECT id, plot FROM businesses")}
    harbour = next((p["id"] for p in by_id.values() if p["area"] == "harbour"), None)
    def where(holder: str) -> str | None:
        kind, _, oid = holder.partition(":")
        if kind == "company":
            return plot_of.get(oid)
        return harbour if "harbour" in holder else None
    routes: dict[tuple, dict] = {}
    def add(src, dst, good, qty, kind, moving=False):
        if not src or not dst or src == dst or src not in by_id or dst not in by_id:
            return
        r = routes.setdefault((src, dst, good), {"from": src, "to": dst, "good": good, "qty": 0, "kind": kind, "moving": False})
        r["qty"] += qty
        r["moving"] = r["moving"] or moving
        if kind == "contract":
            r["kind"] = "contract"
    for k in con.execute("SELECT seller, buyer, good, qty_per_day FROM contracts WHERE status='active'"):
        add(plot_of.get(k["seller"]), plot_of.get(k["buyer"]), k["good"], k["qty_per_day"], "contract")
    for d in con.execute("SELECT src, dst, good, qty, status FROM deliveries WHERE status='moving' OR created_tick >= ?", (now - 24,)):
        add(where(d["src"]), where(d["dst"]), d["good"], d["qty"], "delivery", d["status"] == "moving")
    return sorted(routes.values(), key=lambda r: (-r["qty"], r["from"], r["to"]))[:limit]
