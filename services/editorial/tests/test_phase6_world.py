"""Palasora Phase 6: the world viewer's one read (Doc 06 sections 8, 9 and 14).

The town on screen and the town in the ledger share one grid; "since you left" markers come only from stored events.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import layout, social, view


@pytest.fixture(scope="module")
def town():
    s = runner.run("baseline", 3, 6)
    con = s["_world"].con
    with db.tx(con):
        social.link(con, "p001", user_id="user-ada", display_name="Ada's agent")
    return con


def test_layout_matches_genesis_plots(town):
    # the town's grid; suburb lots (Meadowvale growth, test_growth.py) are laid out beyond it street by street
    stored = {r["id"]: (r["area"], r["x"], r["y"], r["prime"], r["use"]) for r in town.execute("SELECT * FROM plots WHERE area != 'suburb'")}
    fixed = {p["id"]: (p["area"], p["x"], p["y"], p["prime"], p["use"]) for p in layout.layout()}
    assert stored == fixed and len(fixed) == layout.WIDTH * layout.DEPTH
    assert sum(1 for p in fixed.values() if p[4] == "home") == layout.HOMES
    assert {p[0] for p in fixed.values() if p[4] == "civic"} == {"town_hall", "market_hall", "harbour"}


def test_world_for_a_resident_has_their_plot_agent_and_markers_from_real_events(town):
    w = view.world(town, "user-ada")
    assert w["founded"] and sum(1 for p in w["plots"] if p["area"] != "suburb") == 120 and w["town"]["slug"]
    assert w["mine"]["resident"] and w["mine"]["agents"] == ["p001"]
    plots = {p["id"] for p in w["plots"]}
    for b in w["businesses"]:
        assert b["plot"] in plots
    mine = [b for b in w["businesses"] if b["owner"] == "p001"]
    if mine:
        assert w["mine"]["plot"] == mine[0]["plot"]
    events = {r["id"] for r in town.execute("SELECT id FROM world_events")}
    for m in w["markers"]:
        assert m["event"] in events and m["plot"] in plots
    assert len({m["plot"] for m in w["markers"]}) == len(w["markers"])  # one marker per place
    active = town.execute("SELECT COUNT(*) FROM town_agents WHERE status='active'").fetchone()[0]
    assert w["population"] == active > 0  # districts open as this grows


def test_world_for_a_visitor_has_no_private_parts(town):
    w = view.world(town, "")
    assert w["away"] is None and w["markers"] == [] and w["mine"] == {"plot": None, "agents": [], "businesses": [], "resident": False, "home": None}


def test_unfounded_town_uses_the_fixed_layout():
    con = db.connect(":memory:")
    db.init(con)
    w = view.world(con, "")
    assert not w["founded"] and [p["id"] for p in w["plots"]] == [p["id"] for p in layout.layout()]
    assert w["population"] == 0
    assert w["town"] == {"id": "first-town", "name": "First Town", "slug": "first-town"}
