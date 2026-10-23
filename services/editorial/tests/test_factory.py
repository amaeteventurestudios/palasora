"""Palasora bigger businesses: the food factory. A person buys a harbourside plot and builds a factory; its line turns crops
(from farm contracts, or imported at the harbour when farms are short) into packed meals, which stalls that turn customers
away buy on contract. Every change goes through the Actions gate and the conservation checks hold every hour.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import card, checks, civic, goods, place
from palavva_editorial.economy.town.params import C, tuned
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module")
def town():
    w = runner.run("baseline", 7, 4)["_world"]
    chk = checks.Checker(w.con)
    chk.tick(w.tick)
    w._chk = chk
    return w


def tick(w, n=1):
    for _ in range(n):
        run_tick(w, w._chk)


def test_factory_prices_and_zone():
    p = tuned()
    assert p.type_ref("factory") == int(p.meal_ref * p.factory_price_share) < p.meal_ref
    assert p.build_cost["factory"] == 1200 * C
    assert "factory" in place.ALLOWED["harbourside"] and "factory" not in place.ALLOWED["main"]


def test_a_person_builds_a_factory_that_feeds_busy_stalls(town):
    w = town
    with db.tx(w.con):
        home = place.me(w.con, "user-oba")["free_homes"][0]["plot"]
        place.request(w.con, "user-oba", "move_in", {"plot": home})
    tick(w)
    a = w.agents[place.me(w.con, "user-oba")["agent"]]
    with db.tx(w.con):
        civic.population_issue(w, a, 2000 * C, "scenario_endowment")
        plot = next(p["plot"] for p in place.me(w.con, "user-oba")["for_sale"] if p["area"] == "harbourside")
        r = place.request(w.con, "user-oba", "buy_plot", {"plot": plot, "btype": "factory"})
    tick(w)
    assert w.con.execute("SELECT status FROM owner_requests WHERE id=?", (r["id"],)).fetchone()["status"] == "done"
    f = next(b for b in w.biz.values() if b.type == "factory")
    assert f.owner == a.id and f.plot == plot and f.price < w.p.meal_ref
    turned_before = sum(b.history[-1].get("turned_away", 0) for b in w.open_biz() if b.type == "stall" and b.history)

    tick(w, 24 * 8)
    assert f.status == "open"
    made = sum(h.get("made", 0) for h in f.history)
    sold = sum(h.get("sold", 0) for h in f.history)
    assert made > 300 and sold > 300  # crops in, meals out, sold to stalls
    buyers = w.con.execute("SELECT DISTINCT buyer FROM contracts WHERE seller=? AND good='meals'", (f.id,)).fetchall()
    assert len(buyers) >= 3 and all(w.biz[r["buyer"]].type == "stall" for r in buyers)
    imported = w.con.execute("SELECT COUNT(*) n FROM actions WHERE type='import_crops' AND result='done' AND actor=?", (a.id,)).fetchone()["n"]
    farmed = w.con.execute("SELECT COUNT(*) n FROM contracts WHERE buyer=? AND good='crops'", (f.id,)).fetchone()["n"]
    assert imported + farmed > 0
    # the line does not hoard: its crop store stays within a few days of its orders
    assert goods.free(w.con, f.holder, "crops") < 4 * max(40, sum(h.get("made", 0) for h in f.history[-3:]) / 3)
    turned_after = sum(b.history[-1].get("turned_away", 0) for b in w.open_biz() if b.type == "stall" and b.history)
    assert turned_after < turned_before  # fewer people turned away at the stalls
    c = card.business_card(w.con, f.id)
    assert c["type"] == "factory" and "meals" in c["products"][0]["good"] and c["input"] == "crops"
