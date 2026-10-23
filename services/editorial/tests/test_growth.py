"""Meadowvale growth: the town keeps a few new homes waiting in its suburbs and lays out the next street of eight lots
when fewer than four are free. Newcomers are offered the new homes first; each lot has a street address; the map builds
a house only once someone moves in (apps/web, chunks.ts). The conservation checks run every hour.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import checks, growth, place, residents
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module")
def town():
    w = runner.run("baseline", 5, 2)["_world"]
    w._chk = checks.Checker(w.con)
    w._chk.tick(w.tick)
    return w


def tick(w, n=1):
    for _ in range(n):
        run_tick(w, w._chk)


def test_the_lot_list_is_complete_and_in_order():
    ls = growth.lots()
    assert len(ls) >= 160 and [l["n"] for l in ls] == list(range(len(ls)))
    assert ls[0]["id"] == "S001" and ls[0]["address"] == "1 Palm Lane" and ls[0]["district"] == "southgate"
    assert ls[8]["address"].startswith("1 ") and ls[8]["address"] != ls[0]["address"]
    assert all(l["y"] < 0 for l in ls)  # south of the town's grid


def test_the_first_street_opens_and_newcomers_are_offered_new_homes_first(town):
    w = town
    assert growth.opened(w.con) == growth.PER_STREET  # the first hour laid out Palm Lane
    ev = w.con.execute("SELECT text FROM world_events WHERE kind='street_opened' ORDER BY seq").fetchall()
    assert ev and ev[0]["text"] == "A new street opened in Southgate: Palm Lane, 8 homes"
    homes = place.me(w.con, "user-new")["free_homes"]
    assert homes[0]["plot"] == "S001" and homes[0]["new"] and homes[0]["address"] == "1 Palm Lane"
    assert any(not h["new"] for h in homes)  # the old town's free homes are still there, after the new ones


def test_moving_in_builds_a_house_and_the_next_street_opens_when_homes_run_low(town):
    w = town
    with db.tx(w.con):
        place.request(w.con, "user-a", "move_in", {"plot": "S003", "name": "Amara"})
        for k, lot in enumerate(("S001", "S002", "S004", "S005")):
            place.request(w.con, f"user-{k}", "move_in", {"plot": lot, "name": f"N{k}"})
    tick(w)
    owners = {r["id"]: r["owner"] for r in w.con.execute("SELECT id, owner FROM plots WHERE area='suburb'")}
    assert owners["S003"] and sum(1 for o in owners.values() if o) == 5
    t = w.con.execute("SELECT text FROM world_events WHERE kind='moved_in' AND refs LIKE '%S003%'").fetchone()["text"]
    assert t.endswith("moved into a new house at 3 Palm Lane")
    tick(w)  # three free: the next street opens
    assert growth.opened(w.con) == 2 * growth.PER_STREET and growth.free(w.con) == 11
    me = place.me(w.con, "user-a")
    assert me["home"] == "S003"
    who = me["agent"]
    row = next(p for p in residents._people(w.con) if p["id"] == who)
    assert row["home"] == "S003" and row["address"] == "3 Palm Lane"


def test_your_path_reads_the_ladder_from_the_records(town):
    w = town
    p = place.me(w.con, "user-a")["path"]
    assert [s["key"] for s in p["steps"]] == ["home", "earn", "business", "staff", "trade", "bigger", "listed"]
    assert p["steps"][0]["done"] and p["total"] == 7 and p["next"] != "home"
    owner = w.con.execute("SELECT owner FROM businesses WHERE status='open' AND cart=0 GROUP BY owner ORDER BY COUNT(*) DESC").fetchone()["owner"]
    from palavva_editorial.economy.town import path
    q = path.progress(w.con, owner)
    assert next(s for s in q["steps"] if s["key"] == "business")["done"] and q["done"] >= 2
    nobody = path.progress(w.con, None)
    assert nobody["done"] == 0 and nobody["next"] == "home"
