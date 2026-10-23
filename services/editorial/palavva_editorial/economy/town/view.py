"""Palasora Phase 6: what the world viewer reads (Doc 06 sections 8, 9 and 14).

One read for the first frame: the town, its plots (from `plots` once genesis has run, otherwise the fixed layout), the
businesses on them, the viewer's own plot and agent, and "since you left" markers built from stored events. Read-only;
the client never writes the world.
"""
from __future__ import annotations

import json
import sqlite3

from . import layout, reports, social
from .params import C


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
    names = {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}
    biz = []
    for b in con.execute("SELECT id, type, plot, owner, price, wage, level, health, status, opened_tick FROM businesses ORDER BY id"):
        if b["plot"] not in by_id:
            continue
        row = {"id": b["id"], "type": b["type"], "plot": b["plot"], "owner": b["owner"], "owner_name": names.get(b["owner"], ""),
               "level": b["level"], "health": b["health"], "status": b["status"], "price_sora": b["price"] / C, "wage_sora": b["wage"] / C,
               "opened_tick": b["opened_tick"]}
        biz.append(row)
        if b["status"] == "open":
            by_id[b["plot"]]["business"] = b["id"]
    members = social.members_of(con, viewer) if viewer else set()
    agents = sorted(m for m in members if not m.startswith("b"))
    mine_biz = [b for b in biz if b["id"] in members]
    my_plot = next((p["id"] for p in plots if p["owner"] and p["owner"] in members), None) or (mine_biz[0]["plot"] if mine_biz else None)
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
    population = con.execute("SELECT COUNT(*) n FROM town_agents WHERE status='active'").fetchone()["n"]
    return {"town": _town(con), "tick": now, "population": population, "grid": {"w": layout.WIDTH, "d": layout.DEPTH}, "founded": bool(stored), "plots": plots,
            "businesses": biz, "mine": {"plot": my_plot, "agents": agents, "businesses": [b["id"] for b in mine_biz], "resident": bool(members)},
            "away": away, "markers": markers}
