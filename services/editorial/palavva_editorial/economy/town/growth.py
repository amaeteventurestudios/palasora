"""Meadowvale growth: the suburbs fill one home at a time. The town keeps a few new homes waiting in its suburbs
(Southgate first, then Palm Hill); when fewer than FREE_MIN are left it lays out the next street of eight lots. A lot
is an ordinary home plot (area "suburb", ids S001...), so a newcomer picks it in Find a place, claims it through the
Actions gate, and the map builds a house on it the day they move in. Until someone lives there it is an empty lot.

Where each lot stands comes from suburb_lots.json, written from the web map's own lot list (apps/web/lib/world/districts.ts,
scripts/suburb-lots.mts) so the service and the map agree; x and y are in the town's grid units, so a suburb home's
distance to work is about right.
"""
from __future__ import annotations

import json
from pathlib import Path

AREA = "suburb"
PER_STREET = 8
FREE_MIN = 4
DISTRICT_NAME = {"southgate": "Southgate", "palm-hill": "Palm Hill"}
_LOTS: list[dict] | None = None


def lots() -> list[dict]:
    global _LOTS
    if _LOTS is None:
        _LOTS = json.loads((Path(__file__).with_name("suburb_lots.json")).read_text())
    return _LOTS


def address(plot_id: str) -> str:
    n = int(plot_id[1:]) - 1 if plot_id.startswith("S") and plot_id[1:].isdigit() else -1
    return lots()[n]["address"] if 0 <= n < len(lots()) else ""


def opened(con) -> int:
    return con.execute("SELECT COUNT(*) n FROM plots WHERE area=?", (AREA,)).fetchone()["n"]


def free(con) -> int:
    return con.execute("SELECT COUNT(*) n FROM plots WHERE area=? AND owner=''", (AREA,)).fetchone()["n"]


def open_street(w) -> list[str]:
    """Lay out the next street of lots (or what is left of the suburbs)."""
    con = w.con
    start = opened(con)
    new = lots()[start:start + PER_STREET]
    for l in new:
        row = {"id": l["id"], "area": AREA, "x": l["x"], "y": l["y"], "size": 1, "prime": 0, "use": "home", "owner": "", "building": "", "level": 0}
        con.execute("INSERT OR IGNORE INTO plots(id, area, x, y, size, prime, use) VALUES (?,?,?,?,1,0,'home')", (l["id"], AREA, l["x"], l["y"]))
        w.plots[l["id"]] = row
    if new:
        street = new[0]["address"].split(" ", 1)[1]
        w.event("street_opened", [], f"A new street opened in {DISTRICT_NAME.get(new[0]['district'], new[0]['district'])}: {street}, {len(new)} homes",
                visibility="public", refs={"plot": new[0]["id"], "street": street, "district": new[0]["district"]})
    return [l["id"] for l in new]


def grow(w) -> int:
    """Every hour: keep at least FREE_MIN new homes waiting in the suburbs."""
    if free(w.con) >= FREE_MIN or opened(w.con) >= len(lots()):
        return 0
    return len(open_street(w))
