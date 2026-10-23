"""Bigger businesses: company shares on the Town Exchange. A profitable business lists part of its 1,000 shares at a price
set by rule; people (and their agents) buy and sell them in an order book with reservation first and no self-trade;
listed businesses pay a weekly dividend to every shareholder; a listed business that closes shares out its cash. The
conservation checks run every hour throughout.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import actions, card, checks, civic, place, shares
from palavva_editorial.economy.town.params import C
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module")
def town():
    w = runner.run("baseline", 7, 16)["_world"]
    w._chk = checks.Checker(w.con)
    w._chk.tick(w.tick)
    return w


def tick(w, n=1):
    for _ in range(n):
        run_tick(w, w._chk)


def total_shares(con, bid):
    return con.execute("SELECT COALESCE(SUM(available + reserved),0) s FROM accounts WHERE asset=? AND owner_kind != 'platform'", (shares.asset(bid),)).fetchone()["s"]


def test_profitable_house_businesses_list_at_the_rule_price(town):
    w = town
    ls = shares.listed(w.con)
    assert ls, "a profitable house business lists after two weeks"
    for l in ls:
        b = w.biz[l["business"]]
        assert l["ipo_qty"] <= shares.MAX_OFFER and (l["listed_tick"] - b.opened_tick) // 24 >= shares.MIN_DAYS
        assert total_shares(w.con, b.id) == shares.SHARES
        owner = shares.held(w.con, w.agents[b.owner].owner_kind, b.owner, b.id)
        assert sum(owner) >= shares.SHARES - shares.MAX_OFFER  # the owner keeps the majority
    # a young business can't list, and an owner can't offer the majority
    young = next(b for b in w.open_biz() if not b.cart and (w.tick - b.opened_tick) // 24 < shares.MIN_DAYS) if any(
        not b.cart and (w.tick - b.opened_tick) // 24 < shares.MIN_DAYS for b in w.open_biz()) else None
    if young:
        with db.tx(w.con):
            r = actions.submit(w, young.owner, "list_shares", via="human", business=young.id, qty=100)
        assert not r.ok and r.code == "NOT_ELIGIBLE"
    b = next(b for b in w.open_biz() if shares.eligibility(w, b)[0]) if any(shares.eligibility(w, b)[0] for b in w.open_biz()) else None
    if b:
        with db.tx(w.con):
            r = actions.submit(w, b.owner, "list_shares", via="human", business=b.id, qty=600)
        assert not r.ok and r.code == "BAD_QTY"


def test_a_person_buys_shares_sells_some_and_cancels(town):
    w = town
    with db.tx(w.con):
        home = place.me(w.con, "user-ada")["free_homes"][0]["plot"]
        place.request(w.con, "user-ada", "move_in", {"plot": home, "name": "Ada"})
    tick(w)
    me = place.me(w.con, "user-ada")["agent"]
    a = w.agents[me]
    with db.tx(w.con):
        civic.population_issue(w, a, 500 * C, "scenario_endowment")
    board = shares.board(w.con, "user-ada")
    row = next(r for r in board["listed"] if r["ask"] is not None and w.agents[r["owner"]].kind == "house")
    bid, ask = row["business"], row["ask"]
    # outside the price band is refused when asked
    with pytest.raises(place.PlaceError) as e, db.tx(w.con):
        place.request(w.con, "user-ada", "buy_shares", {"business": bid, "price": ask * 2, "qty": 5})
    assert e.value.code == "PRICE_BAND"
    with db.tx(w.con):
        r = place.request(w.con, "user-ada", "buy_shares", {"business": bid, "price": ask, "qty": 20})
    assert w.con.execute("SELECT business FROM owner_requests WHERE id=?", (r["id"],)).fetchone()["business"] == ""  # never on the owner's card
    before = w.bal(a.acct)
    tick(w)
    assert w.con.execute("SELECT status FROM owner_requests WHERE id=?", (r["id"],)).fetchone()["status"] == "done"
    assert shares.held(w.con, a.owner_kind, a.id, bid) == (20, 0)
    assert before - w.bal(a.acct) == int(round(ask * C)) * 20
    assert next(h for h in shares.board(w.con, "user-ada")["holdings"] if h["business"] == bid)["shares"] == 20
    # a sell order above the market rests, holds the shares, and cancelling gives them back
    hi = round(shares.last_price(w.con, bid) * 1.25 / C, 2)
    with db.tx(w.con):
        place.request(w.con, "user-ada", "sell_shares", {"business": bid, "price": hi, "qty": 8})
    tick(w)
    assert shares.held(w.con, a.owner_kind, a.id, bid) == (12, 8)
    d = shares.detail(w.con, bid, "user-ada")
    assert d["orders"] and d["orders"][0]["side"] == "sell" and d["holder_list"][0]["owner"]
    with db.tx(w.con):
        place.request(w.con, "user-ada", "cancel_share_order", {"order": d["orders"][0]["id"]})
    tick(w)
    assert shares.held(w.con, a.owner_kind, a.id, bid) == (20, 0)
    assert shares.check_reservations(w.con) == []
    assert total_shares(w.con, bid) == shares.SHARES


def test_no_self_trade_between_house_agents(town):
    w = town
    row = next(l for l in shares.listed(w.con) if w.agents[w.biz[l["business"]].owner].kind == "house")
    bid = row["business"]
    ask = w.con.execute("SELECT MIN(price) p FROM share_orders WHERE business=? AND side='sell' AND status IN ('open','partial')", (bid,)).fetchone()["p"]
    if ask is None:
        pytest.skip("the offering sold out")
    other = next(x for x in sorted(w.agents.values(), key=lambda x: x.id) if x.kind == "house" and x.id != w.biz[bid].owner and w.bal(x.acct) > ask * 5)
    with db.tx(w.con):
        r = actions.submit(w, other.id, "buy_shares", via="agent", business=bid, price=ask, qty=2)
    assert not r.ok and r.code == "SELF_TRADE"


def test_sunday_dividends_reach_every_shareholder(town):
    w = town
    while not (w.day % 7 == 6 and w.hour == 22):
        tick(w)
    paid = w.con.execute("SELECT * FROM share_dividends WHERE tick >= ?", (w.tick - 2,)).fetchall()
    assert paid, "listed profitable businesses paid a dividend"
    d = paid[0]
    hs = shares.holders(w.con, d["business"])
    assert d["holders"] == len(hs) and d["total"] == d["per_share"] * shares.SHARES
    j = w.con.execute("SELECT COUNT(*) n FROM journal WHERE rule='dividend' AND ref_id=? AND created_at >= ?", (d["business"], w.ts() - 3 * 3600)).fetchone()["n"]
    assert j == len(hs)


def test_a_listed_business_that_closes_shares_out_its_cash(town):
    w = town
    l = shares.listed(w.con)[0]
    b = w.biz[l["business"]]
    hs = {h["id"]: h["shares"] for h in shares.holders(w.con, b.id)}
    outsider = next(h for h in hs if h != b.owner)
    before = w.bal(w.agents[outsider].acct)
    per = w.bal(b.acct) // shares.SHARES
    with db.tx(w.con):
        r = actions.submit(w, b.owner, "close_business", via="human", business=b.id)
    assert r.ok
    assert shares.listing(w.con, b.id)["status"] == "delisted"
    assert w.bal(w.agents[outsider].acct) - before == per * hs[outsider]
    assert not w.con.execute("SELECT 1 FROM share_orders WHERE business=? AND status IN ('open','partial')", (b.id,)).fetchone()
    tick(w)  # the conservation checks pass over the closing
    assert shares.check_reservations(w.con) == []


def test_owner_card_shows_listing_and_requests_validate(town):
    w = town
    l = shares.listed(w.con)[0]
    c = card.business_card(w.con, l["business"])
    assert c["shares"]["listed"] and c["shares"]["price"] > 0
    young = next(b for b in w.open_biz() if not shares.listing(w.con, b.id))
    info = shares.card_info(w.con, young.id, True)
    assert info["listed"] is False and "eligible" in info and info["listing_price"] > 0
    with pytest.raises(place.PlaceError) as e, db.tx(w.con):
        place.request(w.con, "user-ada", "buy_shares", {"business": young.id, "price": 1, "qty": 1})
    assert e.value.code == "NOT_LISTED"
