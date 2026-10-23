"""Palasora step 3: finding a place. A person moves into a free home, starts a food cart at a free plot's kerb, and buys a
business plot at its listed price (or settles the cart there). Every change is a request the next tick applies through
the Actions gate; zone rules decide what each plot may hold; the ledger checks still pass.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import actions, card, checks, civic, place, view
from palavva_editorial.economy.town.params import C, tuned
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module")
def town():
    return runner.run("baseline", 7, 4)["_world"]


def tick(w, n=1):
    chk = checks.Checker(w.con)
    for _ in range(n):
        run_tick(w, chk)


def status(w, rid):
    return dict(w.con.execute("SELECT * FROM owner_requests WHERE id=?", (rid,)).fetchone())


def test_plot_prices_follow_the_zone_and_prime_plots_cost_more():
    p = tuned()
    assert p.plot_price({"area": "market", "prime": 1}) == 120 * C
    assert p.plot_price({"area": "main", "prime": 0}) == 60 * C
    assert p.plot_price({"area": "harbourside", "prime": 0}) == 50 * C
    assert p.plot_price({"area": "farmland", "prime": 0}) == 30 * C


def test_a_newcomer_moves_into_the_home_they_picked(town):
    m = place.me(town.con, "user-zara")
    assert m["resident"] is False and m["free_homes"] and m["for_sale"]
    home = m["free_homes"][0]["plot"]
    with db.tx(town.con):
        r = place.request(town.con, "user-zara", "move_in", {"plot": home, "name": "Zara"})
    # the same home can't be asked for twice while the first request waits
    with pytest.raises(place.PlaceError) as e, db.tx(town.con):
        place.request(town.con, "user-kemi", "move_in", {"plot": home})
    assert e.value.code == "NO_PLOT"
    assert home not in {h["plot"] for h in place.me(town.con, "user-kemi")["free_homes"]}
    tick(town)
    assert status(town, r["id"])["status"] == "done"
    m = place.me(town.con, "user-zara")
    assert m["resident"] and m["home"] == home and m["balance"] >= 200
    a = town.agents[m["agent"]]
    assert a.is_player and a.home == (town.plots[home]["x"], town.plots[home]["y"])
    v = view.world(town.con, "user-zara")
    assert v["mine"]["home"] == home and v["mine"]["resident"]
    with pytest.raises(place.PlaceError) as e, db.tx(town.con):
        place.request(town.con, "user-zara", "move_in", {"plot": m["free_homes"][0]["plot"]})
    assert e.value.code == "ALREADY"


def test_a_cart_trades_at_a_kerb_without_taking_the_plot(town):
    m = place.me(town.con, "user-zara")
    kerb = next(p for p in m["for_sale"] if p["kerb"])["plot"]
    bal = m["balance"]
    with db.tx(town.con):
        r = place.request(town.con, "user-zara", "start_cart", {"plot": kerb})
    tick(town)
    assert status(town, r["id"])["status"] == "done", status(town, r["id"])
    m = place.me(town.con, "user-zara")
    assert len(m["carts"]) == 1 and m["carts"][0]["plot"] == kerb and not m["businesses"]
    b = town.biz[m["carts"][0]["id"]]
    assert b.cart and b.type == "stall" and b.cost == 40 * C and b.max_hires(town.p) == 0
    assert town.plots[kerb]["owner"] == "" and town.plots[kerb]["building"] == ""
    assert m["balance"] <= bal - 40
    v = view.world(town.con)
    assert "business" not in next(p for p in v["plots"] if p["id"] == kerb)
    assert next(x for x in v["businesses"] if x["id"] == b.id)["cart"] is True
    # one cart each; a cart is not upgraded, it settles
    assert actions.submit(town, b.owner, "start_cart", via="human").code == "ALREADY"
    assert actions.submit(town, b.owner, "upgrade", via="human", business=b.id).code == "BAD_ACTION"
    tick(town, 24)  # a day of trading with the cart: the conservation checks pass every hour


def test_zone_rules_decide_what_a_plot_may_hold(town):
    m = place.me(town.con, "user-zara")
    farm = next(p for p in m["for_sale"] if p["area"] == "farmland")
    market = next(p for p in m["for_sale"] if p["area"] == "market")
    assert farm["allowed"] == ["farm"] and market["allowed"] == ["stall", "delivery"]
    with pytest.raises(place.PlaceError) as e, db.tx(town.con):
        place.request(town.con, "user-zara", "buy_plot", {"plot": market["plot"], "btype": "farm"})
    assert e.value.code == "ZONE"
    res = actions.submit(town, m["agent"], "buy_plot", via="human", plot=market["plot"], btype="farm")
    assert not res.ok and res.code == "ZONE"
    assert town.plots[market["plot"]]["owner"] == ""


def test_a_cart_settles_on_a_bought_plot_and_keeps_its_company(town):
    m = place.me(town.con, "user-zara")
    cart = m["carts"][0]["id"]
    plot = next(p for p in m["for_sale"] if p["area"] == "main" and not p["cart_parked"])
    with db.tx(town.con):
        civic.population_issue(town, town.agents[m["agent"]], 400 * C, "scenario_endowment")
    bal = place.me(town.con, "user-zara")["balance"]
    with db.tx(town.con):
        r = place.request(town.con, "user-zara", "buy_plot", {"plot": plot["plot"], "btype": "stall", "business": cart})
    tick(town)
    s = status(town, r["id"])
    assert s["status"] == "done", s
    b = town.biz[cart]
    total = 200 - 50 + plot["price"]
    assert not b.cart and b.plot == plot["plot"] and b.cost == total * C and b.max_hires(town.p) == 2
    assert town.plots[plot["plot"]]["owner"] == m["agent"] and town.plots[plot["plot"]]["building"] == "stall"
    paid = town.con.execute("SELECT amount FROM journal WHERE rule='build' AND ref_id=? ORDER BY id DESC LIMIT 1", (cart,)).fetchone()["amount"]
    assert paid == (total - 40) * C  # the cart's cost counts toward the stall
    after = place.me(town.con, "user-zara")
    assert not after["carts"] and after["businesses"][0]["id"] == cart and after["balance"] <= bal - (total - 40) + 50  # wages and meals move too
    assert card.business_card(town.con, cart, "")["plot"] == plot["plot"]


def test_buying_a_plot_to_build_costs_the_listed_price_and_needs_the_money(town):
    m = place.me(town.con, "user-zara")
    farm = next(p for p in m["for_sale"] if p["area"] == "farmland")
    assert farm["total"]["farm"] == 400 - 50 + farm["price"]
    with db.tx(town.con):
        r = place.request(town.con, "user-zara", "buy_plot", {"plot": farm["plot"], "btype": "farm"})
    if m["balance"] < farm["total"]["farm"]:
        tick(town)
        assert status(town, r["id"])["refusal"] in ("INSUFFICIENT", "OVER_LIMIT")
        with db.tx(town.con):
            civic.population_issue(town, town.agents[m["agent"]], 500 * C, "scenario_endowment")
        town.agents[m["agent"]].spent_today = 0
        with db.tx(town.con):
            r = place.request(town.con, "user-zara", "buy_plot", {"plot": farm["plot"], "btype": "farm"})
    tick(town)
    s = status(town, r["id"])
    assert s["status"] == "done", s
    b = next(x for x in town.biz.values() if x.plot == farm["plot"] and x.status == "open")
    assert b.type == "farm" and b.owner == m["agent"] and b.cost == farm["total"]["farm"] * C
    tick(town, 6)


def test_people_without_a_resident_cannot_buy_or_start_carts(town):
    for kind in ("start_cart", "buy_plot", "claim_home"):
        with pytest.raises(place.PlaceError) as e, db.tx(town.con):
            place.request(town.con, "user-nobody", kind, {"plot": "P405"})
        assert e.value.code == "NOT_RESIDENT"
    with pytest.raises(place.PlaceError) as e:
        place.request(town.con, "", "move_in", {})
    assert e.value.code == "SIGN_IN"
    # house agents keep building the old way; carts are for people
    h = next(a for a in town.agents.values() if a.kind == "house")
    assert actions.submit(town, h.id, "start_cart", via="agent").code == "NOT_ALLOWED"
