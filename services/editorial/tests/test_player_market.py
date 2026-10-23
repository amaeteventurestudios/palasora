"""The player market: a person who owns a business sells its goods at the Market Hall, or bids for goods, at their own
price. Orders are owner requests that the next hour runs through the Actions gate (reservation first, no self-trade, the
price band); house businesses short of their input buy fair offers at 13:00. The conservation checks run every hour.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import actions, agents, card, checks, civic, goods, market, place
from palavva_editorial.economy.town.params import C
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module")
def town():
    w = runner.run("baseline", 7, 10)["_world"]
    w._chk = checks.Checker(w.con)
    w._chk.tick(w.tick)
    with db.tx(w.con):
        home = place.me(w.con, "user-kemi")["free_homes"][0]["plot"]
        place.request(w.con, "user-kemi", "move_in", {"plot": home, "name": "Kemi"})
    run_tick(w, w._chk)
    me = w.agents[place.me(w.con, "user-kemi")["agent"]]
    farm = next(b for b in sorted(w.open_biz(), key=lambda b: b.id) if b.type == "farm" and w.agents[b.owner].kind == "house")
    with db.tx(w.con):
        civic.population_issue(w, me, farm.cost + 200 * C, "scenario_endowment")
        r = actions.submit(w, me.id, "buy_business", via="human", business=farm.id)
    assert r.ok, r
    w.save_biz(farm)
    w._kemi, w._farm = me, farm
    return w


def tick(w, n=1):
    for _ in range(n):
        run_tick(w, w._chk)


def to_hour(w, h):
    while w.hour != h:
        tick(w)


def test_the_hall_board_shows_goods_stalls_and_the_viewers_business(town):
    w = town
    h = market.hall(w.con, "user-kemi")
    assert [g["good"] for g in h["goods"]] == list(market.MARKET_GOODS)
    for g in h["goods"]:
        assert g["band"][0] < g["ref"] < g["band"][1] and g["price"] > 0
    mine = h["mine"]
    assert [m["business"] for m in mine] == [w._farm.id] and "crops" in mine[0]["stock"]
    assert market.hall(w.con, "")["mine"] == []
    v = market.good_view(w.con, "crops", "user-kemi")
    assert set(v["book"]) == {"sell", "buy"} and "history" in v and v["mine"][0]["business"] == w._farm.id
    assert market.good_view(w.con, "meals") is None


def test_requests_are_checked_before_they_queue(town):
    w = town
    bid = w._farm.id
    lo, hi = market.band("crops")
    bad = [({"good": "meals", "side": "sell", "price": 2, "qty": 5}, "BAD_INPUT"),
           ({"good": "crops", "side": "sell", "price": hi / C * 2, "qty": 5}, "PRICE_BAND"),
           ({"good": "crops", "side": "sell", "price": lo / C, "qty": 100000}, "BAD_INPUT"),
           ({"good": "crops", "side": "sell", "price": lo / C, "qty": 499}, "NO_STOCK"),
           ({"good": "tools", "side": "buy", "price": hi / C, "qty": 500}, None)]
    for inp, code in bad:
        if code is None:
            continue
        with pytest.raises(card.RequestError) as e, db.tx(w.con):
            card.request(w.con, bid, "user-kemi", "place_order", inp)
        assert e.value.code == code, inp
    with pytest.raises(card.RequestError) as e, db.tx(w.con):
        card.request(w.con, bid, "someone-else", "place_order", {"good": "crops", "side": "sell", "price": 2, "qty": 1})
    assert e.value.code == "NOT_OWNER"


def test_a_person_offers_crops_at_their_price_and_a_buyer_takes_them(town):
    w = town
    farm, me = w._farm, w._kemi
    while goods.free(w.con, farm.holder, "crops") < 12:
        tick(w)
    ask = market.ref_prices()["crops"] - 10   # a little under the reference: a fair offer
    with db.tx(w.con):
        r = card.request(w.con, farm.id, "user-kemi", "place_order", {"good": "crops", "side": "sell", "price": ask / C, "qty": 10})
    assert r["inputs"]["hours"] == market.PERSON_HOURS
    tick(w)
    req = w.con.execute("SELECT * FROM owner_requests WHERE id=?", (r["id"],)).fetchone()
    assert req["status"] == "done", dict(req)
    o = w.con.execute("SELECT * FROM goods_orders WHERE holder=? AND side='sell' ORDER BY id DESC LIMIT 1", (farm.holder,)).fetchone()
    assert o["price"] == ask and o["expires_tick"] - o["tick"] == market.PERSON_HOURS
    assert any(s["business"] == farm.id and s["price"] == ask / C for s in market.hall(w.con)["stalls"])
    # a house stall short of crops buys it at the asking price (the resting order sets the price)
    stall = next(b for b in sorted(w.open_biz(), key=lambda b: b.id) if b.type == "stall" and w.agents[b.owner].kind == "house")
    left = o["qty"] - o["filled"]
    if left:
        cash = w.bal(farm.acct)
        with db.tx(w.con):
            res = actions.submit(w, stall.owner, "place_order", via="agent", business=stall.id, good="crops", side="buy", price=ask + 20, qty=left)
        assert res.ok, res
        assert w.bal(farm.acct) - cash == ask * left
    o = w.con.execute("SELECT * FROM goods_orders WHERE id=?", (o["id"],)).fetchone()
    assert o["status"] == "filled"
    t = market.good_view(w.con, "crops")["trades"]
    assert any(x["seller"]["business"] == farm.id for x in t)
    bad, _cash = market.check_reservations(w.con)
    assert bad == []


def test_an_offer_waits_and_cancelling_gives_the_goods_back(town):
    w = town
    farm = w._farm
    while goods.free(w.con, farm.holder, "crops") < 6:
        tick(w)
    _lo, hi = market.band("crops")
    with db.tx(w.con):
        card.request(w.con, farm.id, "user-kemi", "place_order", {"good": "crops", "side": "sell", "price": hi / C, "qty": 5})
    tick(w)
    o = w.con.execute("SELECT * FROM goods_orders WHERE holder=? AND status IN ('open','partial') ORDER BY id DESC LIMIT 1", (farm.holder,)).fetchone()
    assert o and o["price"] == hi
    assert market.hall(w.con, "user-kemi")["mine"][0]["orders"][0]["id"] == o["id"]
    with db.tx(w.con):
        card.request(w.con, farm.id, "user-kemi", "cancel_order", {"order": o["id"]})
    with pytest.raises(card.RequestError), db.tx(w.con):
        card.request(w.con, farm.id, "user-kemi", "cancel_order", {"order": 999999})
    tick(w)
    assert w.con.execute("SELECT status FROM goods_orders WHERE id=?", (o["id"],)).fetchone()["status"] == "cancelled"
    assert w.con.execute("SELECT reserved FROM stock WHERE holder=? AND good='crops'", (farm.holder,)).fetchone()["reserved"] == 0
    assert market.check_reservations(w.con)[0] == []


def test_house_businesses_buy_fair_offers_and_the_town_stays_balanced(town):
    w = town
    farm = w._farm
    to_hour(w, 12)
    while goods.free(w.con, farm.holder, "crops") < 30:
        tick(w, 24)
        to_hour(w, 12)
    ask = market.ref_prices()["crops"] - 20
    with db.tx(w.con):
        card.request(w.con, farm.id, "user-kemi", "place_order", {"good": "crops", "side": "sell", "price": ask / C, "qty": 30})
    tick(w)  # 12:00 → the order rests
    props = [p for p in agents.bargains(w) if p[1] == "place_order"]
    assert all(p[2]["price"] <= w.ref_price("crops") and p[2]["side"] == "buy" for p in props)
    sold_before = w.con.execute("SELECT COALESCE(SUM(qty),0) q FROM goods_trades WHERE seller=?", (farm.holder,)).fetchone()["q"]
    tick(w, 30)   # through 13:00 and on: conservation checks run each hour
    sold = w.con.execute("SELECT COALESCE(SUM(qty),0) q FROM goods_trades WHERE seller=?", (farm.holder,)).fetchone()["q"]
    assert props, "a house business short of crops shops at the Hall"
    assert sold > sold_before
    assert market.check_reservations(w.con)[0] == []
