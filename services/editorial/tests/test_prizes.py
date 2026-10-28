"""Game prize pots: a finished week pays each place once, into the winner's own Sora account, never more than the pot."""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db, ledger, prizes


@pytest.fixture()
def con(tmp_path):
    c = db.connect(tmp_path / "economy.db")
    db.init(c)
    yield c
    c.close()


def test_week_pays_winners_once(con):
    lines = [{"user_id": "u1", "place": 1, "amount": 2500}, {"user_id": "u2", "place": 2, "amount": 1800}]
    r = prizes.pay_week(con, "agp", 3, lines)
    assert [l["status"] for l in r["lines"]] == ["paid", "paid"]
    assert ledger.balance(con, "human", "u1")["available"] == 2500
    again = prizes.pay_week(con, "agp", 3, lines)
    assert [l["status"] for l in again["lines"]] == ["already_paid", "already_paid"]
    assert ledger.balance(con, "human", "u1")["available"] == 2500
    assert prizes.paid(con, "agp", 3) == 4300
    h = prizes.history(con, "agp")
    assert {x["user_id"] for x in h} == {"u1", "u2"} and all(x["week"] == "3" for x in h)


def test_never_more_than_the_pot(con):
    with pytest.raises(prizes.PrizeError) as e:
        prizes.pay_week(con, "agp", 4, [{"user_id": "u1", "place": 1, "amount": 6000}, {"user_id": "u2", "place": 2, "amount": 6000}])
    assert e.value.code == "OVER_POT"
    assert ledger.balance(con, "human", "u1")["available"] == 0, "nothing is paid when the week is refused"
    with db.tx(con):
        con.execute("INSERT OR REPLACE INTO switches(key, value, updated_at) VALUES ('AGP_WEEKLY_POT', '20000', 0)")
    assert prizes.pay_week(con, "agp", 4, [{"user_id": "u1", "place": 1, "amount": 12000}])["paid"] == 12000


def test_unknown_game_and_bad_lines(con):
    with pytest.raises(prizes.PrizeError):
        prizes.pay_week(con, "chess", 1, [])
    with pytest.raises(prizes.PrizeError):
        prizes.pay_week(con, "agp", 1, [{"user_id": "u1", "place": 1, "amount": 10}, {"user_id": "u2", "place": 1, "amount": 10}])
