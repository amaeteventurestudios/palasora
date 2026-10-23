"""Palasora step 4: property auctions and visible logistics. The Town Hall auctions one free prime plot a day; a bid holds
the bidder's Sora in the ledger's reserved bucket until they are outbid or win; the winner pays the Town Hall and owns
the plot, then builds paying only for construction. Goods routes (contracts and deliveries) come back as plot-to-plot
flows for the world viewer. The ledger's conservation checks run every hour throughout.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db, ledger
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import actions, auctions, civic, checks, place, view
from palavva_editorial.economy.town.params import C
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module")
def town():
    w = runner.run("baseline", 11, 4)["_world"]
    chk = checks.Checker(w.con)
    for user in ("user-ife", "user-tunde"):
        home = place.me(w.con, user)["free_homes"][0]["plot"]
        with db.tx(w.con):
            place.request(w.con, user, "move_in", {"plot": home})
        run_tick(w, chk)
        a = w.agents[place.me(w.con, user)["agent"]]
        with db.tx(w.con):
            civic.population_issue(w, a, 600 * C, "scenario_endowment")
    w.chk = chk
    return w


def tick(w, n=1):
    for _ in range(n):
        run_tick(w, w.chk)


def open_auction(w):
    for _ in range(30):
        au = auctions.open_auctions(w.con)
        if au and au[0]["end_tick"] - w.tick > 8 and not au[0]["high_bidder"]:
            return au[0]
        tick(w)
    pytest.fail("no auction opened")


def held(w, user):
    return place.me(w.con, user)["held"]


def test_a_plot_at_auction_is_not_for_sale_or_building(town):
    au = open_auction(town)
    pl = town.plots[au["plot"]]
    assert pl["prime"] and au["reserve"] == town.p.plot_price(pl)
    assert au["plot"] not in {p["plot"] for p in place.me(town.con, "user-ife")["for_sale"]}
    agent = place.me(town.con, "user-ife")["agent"]
    assert actions.submit(town, agent, "buy_plot", via="human", plot=au["plot"], btype="stall").code == "NOT_FOR_SALE"
    assert actions.submit(town, agent, "build", via="human", btype="stall", plot=au["plot"]).code == "NO_PLOT"
    v = view.world(town.con)
    p = next(x for x in v["plots"] if x["id"] == au["plot"])
    assert p["auction"]["reserve"] == au["reserve"] / C and "price" not in p


def test_bids_hold_sora_and_an_outbid_bidder_gets_it_back(town):
    au = open_auction(town)
    ife, tunde = place.me(town.con, "user-ife"), place.me(town.con, "user-tunde")
    with pytest.raises(place.PlaceError) as e, db.tx(town.con):
        place.request(town.con, "user-ife", "bid", {"auction": au["id"], "amount": au["reserve"] / C - 1})
    assert e.value.code == "LOW_BID"
    with db.tx(town.con):
        place.request(town.con, "user-ife", "bid", {"auction": au["id"], "amount": 160})
    tick(town)
    assert held(town, "user-ife") == 160
    row = place.auction_rows(town.con, ife["agent"])[0]
    assert row["leading"] and row["high"] == 160 and row["min_bid"] == 168  # 5% over, at least 5 Sora
    with db.tx(town.con):
        place.request(town.con, "user-tunde", "bid", {"auction": au["id"], "amount": 175})
    tick(town)
    assert held(town, "user-ife") == 0 and held(town, "user-tunde") == 175
    assert not place.auction_rows(town.con, ife["agent"])[0]["leading"]
    out = town.con.execute("SELECT text FROM world_events WHERE kind='outbid' ORDER BY seq DESC LIMIT 1").fetchone()
    assert out and ife["agent"] in out["text"]
    assert tunde["agent"] != ife["agent"]


def test_the_winner_pays_the_town_hall_owns_the_plot_and_builds_for_construction_only(town):
    au = next(a for a in auctions.open_auctions(town.con) if a["high_bidder"])
    me = place.me(town.con, "user-tunde")
    while auctions.open_auctions(town.con) and any(a["id"] == au["id"] for a in auctions.open_auctions(town.con)):
        tick(town)
    row = dict(town.con.execute("SELECT * FROM auctions WHERE id=?", (au["id"],)).fetchone())
    assert row["status"] == "sold" and row["winner"] == me["agent"] and row["price"] == au["high"]
    assert town.plots[au["plot"]]["owner"] == me["agent"]
    assert held(town, "user-tunde") == 0
    paid = town.con.execute("SELECT amount FROM journal WHERE rule='plot_auction' AND ref_id=?", (au["plot"],)).fetchone()
    assert paid["amount"] == au["high"]
    mine = place.me(town.con, "user-tunde")["my_plots"]
    if mine:  # the person builds on it themselves...
        assert mine[0]["plot"] == au["plot"] and mine[0]["total"]["stall"] == 150  # 200 less the 50 plot share
        with db.tx(town.con):
            place.request(town.con, "user-tunde", "build", {"plot": au["plot"], "btype": "stall"})
        tick(town)
    # ...or their agent already did: either way the land is not paid for twice
    b = next(x for x in town.biz.values() if x.plot == au["plot"] and x.status == "open")
    assert b.owner == me["agent"] and b.cost == 150 * C


def test_an_auction_with_no_bids_ends_unsold_and_the_plot_goes_back_on_sale(town):
    au = open_auction(town)
    tick(town, au["end_tick"] - town.tick + 1)
    row = town.con.execute("SELECT status FROM auctions WHERE id=?", (au["id"],)).fetchone()
    if row["status"] == "sold":  # a house entrepreneur bid the reserve
        assert town.plots[au["plot"]]["owner"].startswith("h")
    else:
        assert row["status"] == "unsold" and au["plot"] in {p["plot"] for p in place.me(town.con, "user-ife")["for_sale"]}


def test_goods_routes_come_back_as_plot_to_plot_flows(town):
    v = view.world(town.con)
    assert v["flows"], "a running town moves goods"
    ids = {p["id"] for p in v["plots"]}
    for f in v["flows"]:
        assert f["from"] in ids and f["to"] in ids and f["from"] != f["to"] and f["qty"] > 0
        assert f["good"] in ("crops", "meals", "tools", "materials") and f["kind"] in ("contract", "delivery")
    assert any(f["kind"] == "contract" for f in v["flows"])
