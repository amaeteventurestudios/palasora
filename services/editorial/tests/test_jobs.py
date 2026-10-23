"""Hiring and job boards. Businesses with open positions appear on the job board with their wage; the civic job is always
open. A resident takes a job from the board or leaves theirs through a request the next hour applies (before the agents
look for work); an owner posts a job (how many, at what wage) or stops hiring. The conservation checks run every hour.
"""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner
from palavva_editorial.economy.town import actions, card, checks, civic, jobs, place
from palavva_editorial.economy.town.params import C
from palavva_editorial.economy.town.tick import run_tick
from palavva_editorial.economy.town.world import CIVIC


@pytest.fixture(scope="module")
def town():
    w = runner.run("baseline", 7, 6)["_world"]
    w._chk = checks.Checker(w.con)
    w._chk.tick(w.tick)
    with db.tx(w.con):
        home = place.me(w.con, "user-ola")["free_homes"][0]["plot"]
        place.request(w.con, "user-ola", "move_in", {"plot": home, "name": "Ola"})
    tick(w)
    w._ola = w.agents[place.me(w.con, "user-ola")["agent"]]
    return w


def tick(w, n=1):
    for _ in range(n):
        run_tick(w, w._chk)


def test_the_board_matches_the_world(town):
    w = town
    tick(w)
    b = jobs.board(w.con)
    want = {x.id: jobs.openings(w, x) for x in w.open_biz() if jobs.openings(w, x) > 0}
    assert {r["business"]: r["slots"] for r in b["openings"]} == want
    assert b["civic"]["wage"] == w.p.civic_wage / C and b["stats"]["open_positions"] == sum(want.values())
    assert [r["wage"] for r in b["openings"]] == sorted((r["wage"] for r in b["openings"]), reverse=True)
    me = jobs.board(w.con, "user-ola")
    assert me["resident"] and me["me"]["agent"] == w._ola.id


def test_an_owner_posts_a_job_and_a_resident_takes_it_first(town):
    w = town
    ola = w._ola
    b = next(x for x in sorted(w.open_biz(), key=lambda x: x.id) if not x.cart and w.agents[x.owner].kind == "house" and len(x.workers) < x.max_hires(w.p))
    owner = w.agents[b.owner]
    wage = w.p.civic_wage + 10 * C
    with db.tx(w.con):
        r = actions.submit(w, owner.id, "post_job", via="human", business=b.id, slots=1, wage=wage)
    assert r.ok, r
    with db.tx(w.con):
        jobs.publish(w)
    row = next(o for o in jobs.board(w.con)["openings"] if o["business"] == b.id)
    assert row["wage"] == wage / C and row["slots"] == 1
    # the resident asks; the next hour applies their request before any agent looks for work
    with db.tx(w.con):
        req = place.request(w.con, "user-ola", "apply_job", {"employer": b.id})
    assert w.con.execute("SELECT business FROM owner_requests WHERE id=?", (req["id"],)).fetchone()["business"] == ""
    tick(w)
    assert ola.job == b.id and ola.wage == wage
    assert jobs.current_job(w.con, ola.id)["employer"] == b.id
    assert jobs.board(w.con, "user-ola")["me"]["job"]["wage"] == wage / C
    assert all(o["business"] != b.id for o in jobs.board(w.con)["openings"])  # the position is filled
    with pytest.raises(place.PlaceError) as e, db.tx(w.con):
        place.request(w.con, "user-ola", "apply_job", {"employer": b.id})
    assert e.value.code == "ALREADY"
    # wages arrive at 20:00
    while w.hour != 20:
        tick(w)
    before = w.bal(ola.acct)
    tick(w)
    assert w.bal(ola.acct) > before


def test_requests_are_checked(town):
    w = town
    with pytest.raises(place.PlaceError) as e, db.tx(w.con):
        place.request(w.con, "user-ola", "apply_job", {"employer": "b999"})
    assert e.value.code == "CLOSED"
    full = next((x for x in w.open_biz() if not x.cart and jobs.openings(w, x) == 0 and x.owner != w._ola.id and x.id != w._ola.job), None)
    if full:
        with pytest.raises(place.PlaceError) as e, db.tx(w.con):
            place.request(w.con, "user-ola", "apply_job", {"employer": full.id})
        assert e.value.code == "NOT_HIRING"
    b = next(x for x in w.open_biz() if not x.cart)
    with pytest.raises(card.RequestError) as e, db.tx(w.con):
        card.request(w.con, b.id, "user-ola", "post_job", {"slots": 1, "wage": 20})
    assert e.value.code == "NOT_OWNER"


def test_leaving_a_job_and_taking_the_civic_one(town):
    w = town
    ola = w._ola
    jobs_before = ola.job
    with db.tx(w.con):
        place.request(w.con, "user-ola", "quit_job", {})
    tick(w)
    # leaving frees the place; the resident's agent then looks for work itself (the civic job, or a better-paid opening)
    assert ola.id not in w.biz[jobs_before].workers
    with db.tx(w.con):
        place.request(w.con, "user-ola", "apply_job", {"employer": CIVIC})
    tick(w)
    assert ola.job == CIVIC and jobs.current_job(w.con, ola.id)["type"] == "civic"


def test_an_owner_stops_hiring_and_a_quitting_owner_goes_back_to_their_business(town):
    w = town
    b = next(x for x in sorted(w.open_biz(), key=lambda x: x.id) if not x.cart and len(x.workers) < x.max_hires(w.p) and w.agents[x.owner].kind == "house")
    owner = w.agents[b.owner]
    with db.tx(w.con):
        assert actions.submit(w, owner.id, "post_job", via="human", business=b.id, slots=1, wage=w.p.civic_wage).ok
        assert actions.submit(w, owner.id, "stop_hiring", via="human", business=b.id).ok
        jobs.publish(w)
    assert all(o["business"] != b.id for o in jobs.board(w.con)["openings"])
    with db.tx(w.con):
        r = actions.submit(w, owner.id, "post_job", via="human", business=b.id, slots=1, wage=w.p.civic_wage // 4)
    assert not r.ok and r.code == "WAGE_TOO_LOW"
    # an owner who leaves another job goes back to their own business
    other = next(x for x in w.open_biz() if x.id != b.id and not x.cart and x.owner != owner.id)
    with db.tx(w.con):
        w.set_job(owner, other.id, other.wage)
        assert actions.submit(w, owner.id, "quit_job", via="human").ok
    assert owner.job.startswith("own:") and w.biz[owner.job[4:]].owner == owner.id
    tick(w, 3)
