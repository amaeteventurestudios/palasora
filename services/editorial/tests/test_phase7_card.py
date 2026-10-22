"""Palasora Phase 7 gate: card numbers match the ledger (Doc 06 sections 10, 11.3 and 19).

The card sums journal entries on each business's account. Every business also keeps its own daily books while the town
runs (business.py: revenue and costs counted where the money moves). Over two seeded runs, for every business, the two
must agree to the centi-Sora, the balance must equal entries in minus entries out, and owners' requests must pass
through the Actions gate with the owner's limits.
"""
from __future__ import annotations

import json

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import card, checks, social
from palavva_editorial.economy.town.params import C
from palavva_editorial.economy.town.tick import run_tick


@pytest.fixture(scope="module", params=[3, 5])
def town(request):
    s = runner.run("baseline", request.param, 12)
    w = s["_world"]
    with db.tx(w.con):
        social.link(w.con, "p001", user_id="user-ada", display_name="Ada's agent")
    return w


def books(b) -> tuple[int, int]:
    return (sum(d.get("revenue", 0) for d in b.history) + b.day.get("revenue", 0), sum(d.get("costs", 0) for d in b.history) + b.day.get("costs", 0))


def test_card_money_equals_each_business_own_books_and_the_balance_equals_the_journal(town):
    assert len(town.biz) >= 15
    for b in town.biz.values():
        c = card.business_card(town.con, b.id)
        rev, cost = books(b)
        assert round(c["money"]["all"]["revenue"] * C) == rev, b.id
        assert round(c["money"]["all"]["costs"] * C) == cost, b.id
        assert round(c["money"]["all"]["profit"] * C) == rev - cost, b.id
        assert c["ledger"]["balance_matches"], b.id
        assert c["ledger"]["entries"] > 0
        # periods nest: a day is inside a week, a week inside a month; a 12-day town fits in a month
        m = c["money"]
        assert m["day"]["entries"] <= m["week"]["entries"] <= m["month"]["entries"] == m["all"]["entries"]
        assert m["month"]["revenue"] == m["all"]["revenue"]


def test_week_figures_are_the_last_seven_days_of_the_books(town):
    for b in town.biz.values():
        if b.status != "open" or len(b.history) < 8:
            continue
        c = card.business_card(town.con, b.id)
        # the books close at 23:00; the card's week runs to the current hour, so compare up to the hour the card ends
        last7 = b.history[-7:]
        lo = sum(d.get("revenue", 0) for d in last7)
        assert round(c["money"]["week"]["revenue"] * C) >= lo - max(d.get("revenue", 0) for d in b.history[-8:-6]) - 1


def test_visitors_see_no_owner_controls_or_owner_events(town):
    b = next(iter(town.biz.values()))
    c = card.business_card(town.con, b.id, "")
    assert c["mine"] is False and "manage" not in c
    vis = {r["visibility"] for r in town.con.execute("SELECT visibility FROM world_events WHERE id IN (%s)" % ",".join("?" * len(c["events"])), [e["id"] for e in c["events"]])} if c["events"] else set()
    assert "owner" not in vis and "staff" not in vis


def test_owner_requests_go_through_the_gate(town):
    mine = [b for b in town.biz.values() if b.owner == "p001" and b.status == "open"]
    if not mine:
        pytest.skip("p001 has no open business in this run")
    b = mine[0]
    c = card.business_card(town.con, b.id, "user-ada")
    assert c["mine"] and c["manage"]["owner_agent"] == "p001"
    lo, hi = c["manage"]["price_min"], c["manage"]["price_max"]
    with pytest.raises(card.RequestError) as e:
        card.request(town.con, b.id, "user-kofi", "set_price", {"price": lo})
    assert e.value.code == "NOT_OWNER"
    with pytest.raises(card.RequestError):
        card.request(town.con, b.id, "user-ada", "build", {})
    ok = card.request(town.con, b.id, "user-ada", "set_price", {"price": round((lo + hi) / 2, 2)})
    bad = card.request(town.con, b.id, "user-ada", "set_price", {"price": hi * 3})
    low = card.request(town.con, b.id, "user-ada", "set_wage", {"wage": 1})
    chk = checks.Checker(town.con)
    run_tick(town, chk)  # the next tick applies them, oldest first
    st = {r["id"]: dict(r) for r in town.con.execute("SELECT * FROM owner_requests")}
    assert st[ok["id"]]["status"] == "done" and town.biz[b.id].price == ok["inputs"]["price"]
    assert st[bad["id"]]["status"] == "refused" and st[bad["id"]]["refusal"] == "PRICE_RANGE"
    assert st[low["id"]]["status"] == "refused" and st[low["id"]]["refusal"] == "WAGE_TOO_LOW"
    acts = {r["id"]: r for r in town.con.execute("SELECT * FROM actions WHERE via='human'")}
    for r in (ok, bad, low):
        assert st[r["id"]]["action_id"] in acts  # every request left its trace in the gate's action log
    after = card.business_card(town.con, b.id, "user-ada")
    assert after["products"][0]["price"] == ok["inputs"]["price"] / C
    assert [r["status"] for r in after["manage"]["requests"]][:3] == ["refused", "refused", "done"]
    assert json.loads(json.dumps(after))  # plain JSON for the web
