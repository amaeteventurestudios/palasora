"""The first town's plot layout (Doc 03 section 2, Doc 05 section 6): 12 x 10 plots, the same for every run.

Genesis writes these rows into `plots`. The world viewer reads `plots` when the town has been founded and this layout
when it has not, so the town on screen and the town in the ledger always share one grid.
"""
from __future__ import annotations

WIDTH, DEPTH = 12, 10
CIVIC = {(5, 5): "town_hall", (6, 5): "market_hall", (0, 5): "harbour"}
HOMES = 20  # the first 20 plots on the main streets are homes


def layout() -> list[dict]:
    rows = []
    for y in range(DEPTH):
        for x in range(WIDTH):
            if (x, y) in CIVIC:
                area, use, prime = CIVIC[(x, y)], "civic", 0
            elif 3 <= x <= 8 and 2 <= y <= 7:
                area, use, prime = "market", "business", 1
            elif y >= 8:
                area, use, prime = "farmland", "business", 0
            elif x <= 2:
                area, use, prime = "harbourside", "business", 0
            else:
                area, use, prime = "main", "business", 0
            rows.append({"id": f"P{y:01d}{x:02d}", "area": area, "x": float(x), "y": float(y), "size": 1, "prime": prime, "use": use,
                         "owner": "", "building": "", "level": 0})
    for r in [r for r in rows if r["area"] == "main"][:HOMES]:
        r["use"] = "home"
    return rows
