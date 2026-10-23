"""Palasora: the residents directory. Counts, search and filters over everyone in town; a resident's card with a street
address, job, ledger-backed income and net worth, and neighbours; following a resident."""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import residents


@pytest.fixture(scope="module")
def con():
    return runner.run("baseline", 11, 3)["_world"].con


def test_counts_cover_everyone_and_the_filters_add_up(con):
    d = residents.directory(con, limit=100)
    active = con.execute("SELECT COUNT(*) n FROM town_agents WHERE status='active' AND role != 'mischief'").fetchone()["n"]
    assert d["counts"]["all"] == d["total"] == active > 50
    assert residents.directory(con, filt="no_home", limit=100)["total"] == d["counts"]["no_home"]
    nj = residents.directory(con, filt="no_job", limit=100)
    assert nj["total"] == d["counts"]["no_job"] and all(r["job"] is None for r in nj["rows"])
    housed = [r for r in d["rows"] if r["home"]]
    assert housed and all(r["address"] for r in housed)
    assert len({r["address"] for r in housed}) == len(housed), "every flat has its own address"


def test_search_by_handle_name_and_street(con):
    r = residents.directory(con, limit=100)["rows"][7]
    assert residents.directory(con, q="@" + r["handle"])["rows"][0]["id"] == r["id"]
    assert r["id"] in {x["id"] for x in residents.directory(con, q=r["name"].split()[0].lower(), limit=100)["rows"]}
    street = r["address"].split(" ", 1)[1].split(",")[0] if r["address"] else ""
    if street:
        assert all(street in x["address"] for x in residents.directory(con, q=street, limit=100)["rows"])
    assert residents.directory(con, q="zzzz-nobody")["total"] == 0


def test_a_residents_card_reads_the_ledger_and_lists_neighbours(con):
    rows = residents.directory(con, limit=100)["rows"]
    worker = next(r for r in rows if r["job"] and r["job"]["kind"] == "works" and r["home"])
    card = residents.resident(con, worker["id"])
    acct = con.execute("SELECT available + reserved s FROM accounts WHERE owner_kind='agent' AND owner_id=? AND asset='SORA'", (worker["id"],)).fetchone()
    assert card["wallet"] == acct["s"] / 100 and card["income"] == worker["job"]["wage"]
    assert card["neighbours"] and all(n["id"] != worker["id"] for n in card["neighbours"])
    owner = next((r for r in rows if r["job"] and r["job"]["kind"] == "runs"), None)
    if owner:
        oc = residents.resident(con, owner["id"])
        assert oc["businesses"] and oc["net_worth"] >= oc["wallet"]
    assert residents.resident(con, "nobody") is None


def test_following_a_resident(con):
    aid = residents.directory(con)["rows"][0]["id"]
    with db.tx(con):
        assert residents.follow(con, "user-ife", aid, True) == {"following": True, "followers": 1}
        residents.follow(con, "user-ife", aid, True)  # twice is still once
    d = residents.directory(con, filt="following", viewer="user-ife")
    assert d["counts"]["following"] == 1 and d["rows"][0]["id"] == aid and d["rows"][0]["following"]
    assert residents.resident(con, aid, "user-ife")["following"]
    with db.tx(con):
        assert residents.follow(con, "user-ife", aid, False)["followers"] == 0
    with pytest.raises(KeyError):
        residents.follow(con, "user-ife", "nobody", True)
