"""Palasora Phase 8: the town runs on its own. Gate E (Doc 05): the live service, restoring its snapshot before every
hour, ends on the same ledger fingerprint as the headless run straight through. Also: the clock follows real hours, a long
outage catches up in steps, an hour is never run twice, owners' requests are applied by the live tick, and a failed
conservation check pauses the town."""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db
from palavva_editorial.economy.sim import runner, scenarios
from palavva_editorial.economy.town import checks, live, place

H = 3600


@pytest.fixture()
def con(tmp_path):
    c = db.connect(tmp_path / "economy.db")
    db.init(c)
    live._cache.clear()
    yield c
    live._cache.clear()
    c.close()


def anchor(c):
    return live._state(c, "live_clock")["anchor"]


def test_gate_e_live_matches_the_headless_run(con):
    days, seed = 3, 5
    head = runner.run("baseline", seed, days)
    live.found(con, seed, scenario=scenarios.make("baseline", days))
    a = anchor(con)
    for hour in range(0, days * 24, 7):  # the worker wakes at odd times; every wake restores from the stored snapshot
        live._cache.clear()
        live.advance(con, now=a + hour * H + 5)
    live._cache.clear()
    out = live.advance(con, now=a + (days * 24 - 1) * H + 5)
    assert live.status(con, a + (days * 24 - 1) * H + 5)["tick"] == days * 24, out
    assert checks.fingerprint(con) == head["fingerprint"]


def test_the_clock_follows_real_hours_and_catches_up_in_steps(con):
    t0 = 1_800_000_000.0
    live.found(con, 1, now=t0)
    a = anchor(con)
    assert a <= t0 < a + 24 * H
    hours_today = int((t0 - a) // H) + 1
    r = live.advance(con, now=t0)
    assert r["ran"] == hours_today and r["tick"] == hours_today
    assert live.advance(con, now=t0)["ran"] == 0, "an hour is never run twice"
    later = t0 + 3 * 24 * H  # three days down
    r = live.advance(con, now=later, limit=48)
    assert r["ran"] == 48 and live.status(con, later)["behind"] == 72 - 48 + 0
    live.advance(con, now=later)
    assert live.status(con, later)["behind"] == 0


def test_a_second_process_never_runs_the_same_hour(con, tmp_path):
    live.found(con, 2, now=1_800_000_000.0)
    other = db.connect(tmp_path / "economy.db")
    w1, c1 = live.restore(con)
    w2, c2 = live.restore(other)
    from palavva_editorial.economy.town.tick import run_tick
    run_tick(w1, c1, before_commit=lambda: live._save(w1, c1))
    with pytest.raises(live.Stale):
        run_tick(w2, c2, before_commit=lambda: live._save(w2, c2))
    assert live._state(con, "live_tick") == 1
    other.close()


def test_requests_wait_for_the_live_hour_and_then_apply(con):
    t0 = 1_800_000_000.0
    live.found(con, 3, now=t0)
    live.advance(con, now=t0)
    home = place.me(con, "user-ada")["free_homes"][0]["plot"]
    with db.tx(con):
        place.request(con, "user-ada", "move_in", {"plot": home, "name": "Ada"})
    assert place.me(con, "user-ada")["resident"] is False
    live.advance(con, now=t0 + H)
    me = place.me(con, "user-ada")
    assert me["resident"] and me["home"] == home and me["balance"] > 0


def test_a_failed_check_pauses_the_town(con):
    t0 = 1_800_000_000.0
    live.found(con, 4, now=t0)
    live.advance(con, now=t0)
    acct = con.execute("SELECT id FROM accounts WHERE owner_kind='agent' LIMIT 1").fetchone()["id"]
    con.execute("UPDATE accounts SET available = available + 1 WHERE id=?", (acct,))  # money from nowhere
    r = live.advance(con, now=t0 + 2 * H)
    assert r["reason"] == "paused" and r["paused"]["reason"] == "conservation"
    assert live.advance(con, now=t0 + 3 * H)["reason"] == "paused"
    assert live.status(con)["paused"]


def test_found_refuses_twice(con):
    live.found(con, 1, now=1_800_000_000.0)
    with pytest.raises(live.LiveError):
        live.found(con, 1, now=1_800_000_000.0)
