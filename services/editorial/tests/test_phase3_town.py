"""Phase 3 (Doc 05; Doc 04 sections 2 to 9, 4A; Doc 06 sections 13 and 16.2): goods, the tick, the Harbour, the Market
Hall, contracts, the outbox and relay, J0 records, Town Hall recycling and the thermostat, and the headless simulation.
"""
from __future__ import annotations

import json

import pytest

from palavva_editorial.economy import db, issuance
from palavva_editorial.economy.sim import gates, metrics as M, report, runner, scenarios
from palavva_editorial.economy.town import actions, ai, checks, civic, contracts, events, genesis, goods, market, params
from palavva_editorial.economy.town.world import World

C = params.C


def make_world(seed: int = 1, scenario: str = "baseline") -> World:
    con = db.connect(":memory:")
    db.init(con)
    w = World(con, params.tuned(), seed, scenario=scenarios.make(scenario, 30))
    w.metrics = M.Metrics()
    with db.clock(lambda: w.ts()):
        con.execute("BEGIN IMMEDIATE")
        genesis.genesis(w)
        con.execute("COMMIT")
    return w


def act(w: World, actor: str, kind: str, via: str = "agent", **inputs) -> actions.Result:
    with db.clock(lambda: w.ts()):
        return actions.submit(w, actor, kind, via=via, **inputs)


@pytest.fixture(scope="module")
def short_runs():
    a = runner.run("baseline", 3, 6)
    b = runner.run("baseline", 3, 6)
    return a, b


# ------------------------------------------------------------------------------------------------ conservation, determinism
def test_every_tick_conserves_coins_and_goods(short_runs):
    s, _ = short_runs
    assert s["conservation"]["failure"] is None
    assert s["conservation"]["ticks_checked"] == 6 * 24
    assert s["conservation"]["final"]["ok"]


def test_same_seed_same_fingerprint(short_runs):
    a, b = short_runs
    assert a["fingerprint"] == b["fingerprint"]
    c = runner.run("baseline", 4, 6)
    assert c["fingerprint"] != a["fingerprint"]


def test_checker_catches_a_goods_leak():
    w = make_world()
    chk = checks.Checker(w.con)
    with db.clock(lambda: w.ts()):
        w.con.execute("BEGIN IMMEDIATE")
        holder = next(iter(w.biz.values())).holder
        # bypass the goods module: a unit appears with no goods-log row
        w.con.execute("UPDATE stock SET qty=qty+1 WHERE holder=? AND good='crops'", (holder,))
        with pytest.raises(checks.ConservationError):
            chk.tick(w.tick)
        w.con.execute("ROLLBACK")


# ------------------------------------------------------------------------------------------------ the Actions gate
def test_cheater_is_always_refused():
    s = runner.run("cheater", 2, 4)
    m = s["mischief"]
    assert m["attempts"] >= 8
    assert m["accepted"] == []
    assert {"SELF_TRADE", "NOT_OWNER", "OVER_LIMIT", "NOT_ALLOWED"} <= set(m["codes"])


def test_refusals_that_are_not_ordinary_become_j0_candidates():
    w = make_world()
    p = genesis.arrive_player(w, "p001")
    r = act(w, p.id, "issue_coins", amount=1000 * C)
    assert not r.ok and r.code == "NOT_ALLOWED"
    v = w.con.execute("SELECT * FROM violations WHERE accused=?", (p.id,)).fetchone()
    assert v["status"] == "candidate" and v["rule"] == "gate:NOT_ALLOWED"
    other = next(b for b in w.biz.values())
    r = act(w, p.id, "set_price", business=other.id, price=600)
    assert r.code == "NOT_OWNER"


def test_parity_human_and_agent():
    """Doc 05 Gate B: the same plays give the same results whether a person or an agent submits them."""
    out = []
    for via in ("human", "agent"):
        w = make_world(seed=7)
        with db.clock(lambda: w.ts()):
            p = genesis.arrive_player(w, "p001", endowment=500 * C)
        res = [act(w, p.id, "build", via=via, btype="stall"),
               act(w, p.id, "buy_decor", via=via, amount=10 * C),
               act(w, p.id, "pay", via=via, to="h001", amount=5 * C),
               act(w, p.id, "pay", via=via, to="h001", amount=10_000 * C),
               act(w, p.id, "transfer_shares", via=via, business="b001", to=p.id, qty=10)]
        out.append(([(r.ok, r.code) for r in res], checks.fingerprint(w.con)))
    assert out[0] == out[1]


def test_daily_cap_is_enforced_for_players():
    w = make_world()
    with db.clock(lambda: w.ts()):
        p = genesis.arrive_player(w, "p001", endowment=2000 * C)
    cap = p.limits["daily_cap"]
    assert act(w, p.id, "buy_decor", amount=cap - C).ok
    r = act(w, p.id, "buy_decor", amount=2 * C)
    assert not r.ok and r.code == "OVER_LIMIT"


# ------------------------------------------------------------------------------------------------ Market Hall
def test_market_self_trade_is_rejected_and_other_owners_trade():
    w = make_world()
    with db.clock(lambda: w.ts()):
        a = genesis.arrive_player(w, "p001", endowment=300 * C)
        farm = next(b for b in w.biz.values() if b.type == "farm")
        price = w.ref_price("crops")
        # a house farm sells; a house stall buying from it is the same platform owner: rejected
        sell = actions.submit(w, farm.owner, "place_order", good="crops", side="sell", price=price, qty=5, business=farm.id)
        assert sell.ok
        stall = next(b for b in w.biz.values() if b.type == "stall")
        r = actions.submit(w, stall.owner, "place_order", good="crops", side="buy", price=price, qty=5, business=stall.id)
        assert not r.ok and r.code == "SELF_TRADE"
        before = goods.get(w.con, a.holder, "crops")[0] + goods.get(w.con, goods.TRANSIT, "crops")[0]
        r = actions.submit(w, a.id, "place_order", good="crops", side="buy", price=price, qty=5)
        assert r.ok and r.data["fills"] == 1
        after = goods.get(w.con, a.holder, "crops")[0] + goods.get(w.con, goods.TRANSIT, "crops")[0]
        assert after - before == 5
        bad, _cash = market.check_reservations(w.con)
        assert not bad


def test_market_rejects_prices_outside_the_band():
    w = make_world()
    with db.clock(lambda: w.ts()):
        a = genesis.arrive_player(w, "p001", endowment=300 * C)
        r = actions.submit(w, a.id, "place_order", good="crops", side="buy", price=w.ref_price("crops") * 3, qty=1)
    assert not r.ok and r.code == "PRICE_BAND"


# ------------------------------------------------------------------------------------------------ contracts and J0
def test_contract_breach_records_a_candidate_violation():
    w = make_world()
    farm = next(b for b in w.biz.values() if b.type == "farm")
    stall = next(b for b in w.biz.values() if b.type == "stall")
    with db.clock(lambda: w.ts()):
        r = actions.submit(w, stall.owner, "sign_contract", buyer=stall.id, seller=farm.id, good="crops", qty=10_000, price=w.ref_price("crops"), days=3)
    if not r.ok:  # the gate may refuse an impossible promise outright; then build one directly to test the breach path
        with db.clock(lambda: w.ts()):
            contracts.sign(w, seller=farm, buyer=stall, good="crops", qty=10_000, price=w.ref_price("crops"), days=3)
    w.tick += 24  # a contract starts the day after it is signed
    with db.clock(lambda: w.ts()):
        contracts.dispatch_day(w)
    k = w.con.execute("SELECT * FROM contracts WHERE buyer=? AND qty_per_day=10000", (stall.id,)).fetchone()
    assert k["breaches"] == 1
    v = w.con.execute("SELECT * FROM violations WHERE rule='contract_delivery'").fetchone()
    assert v and v["status"] == "candidate" and json.loads(v["evidence"])["contract"] == k["id"]
    assert w.con.execute("SELECT 1 FROM world_events WHERE kind='contract_breached'").fetchone()


# ------------------------------------------------------------------------------------------------ outbox and relay
def test_outbox_relay_delivers_exactly_once_with_retry_and_hold():
    w = make_world()
    with db.clock(lambda: w.ts()):
        with db.tx(w.con):
            eid = w.event("test_event", ["h001"], "a test", visibility="owner")
        dests = {r["destination"] for r in w.con.execute("SELECT destination FROM outbox WHERE event_id=?", (eid,))}
        assert dests == set(events.ALLOWED["owner"]) and "feed" not in dests
        seen = []
        ok = {"records": lambda ev: events.apply_once(w.con, "records", ev["id"], lambda: seen.append(ev["id"]))}
        r1 = events.relay_once(w.con, ok)
        r2 = events.relay_once(w.con, ok)
        assert r1["delivered"] >= 1 and r2["delivered"] == 0
        assert seen.count(eid) == 1
        # a repeat delivery is ignored by apply_once
        assert events.apply_once(w.con, "records", eid, lambda: seen.append(eid)) is False

        def boom(ev):
            raise RuntimeError("down")
        held = 0
        for i in range(events.MAX_ATTEMPTS):
            with db.clock(lambda: w.ts() + 10_000 * (i + 1)):
                held += events.relay_once(w.con, {"notifications": boom})["held"]
        assert w.con.execute("SELECT status FROM outbox WHERE event_id=? AND destination='notifications'", (eid,)).fetchone()["status"] == "held"


# ------------------------------------------------------------------------------------------------ Town Hall and issuance
def test_destroyed_sora_is_recycled_and_carried():
    w = make_world()
    with db.clock(lambda: w.ts()):
        wk = issuance.weekly(w.con)
        assert wk["recycled"] >= sum(b.cost for b in w.biz.values())  # genesis builds were paid to the Town Hall
        left_unpaced, _ = civic.budget_left_today(w, paced=False)
        left_paced, _ = civic.budget_left_today(w)
        assert left_unpaced >= left_paced >= 0
    # a week later the unspent part carries over, net of the growth part
    with db.clock(lambda: w.ts(7 * 24 + 1)):
        nxt = issuance.weekly(w.con)
        assert nxt["carry"] > 0 and nxt["recycled"] >= nxt["carry"]


def test_thermostat_shrinks_after_two_weeks_above_and_grows_after_two_below():
    w = make_world()
    with db.clock(lambda: w.ts()):
        r1 = issuance.record_growth(w.con, "2027-W10", 0.40)
        r2 = issuance.record_growth(w.con, "2027-W11", 0.40)
        assert r1["next_multiplier"] == 1.0 and r2["next_multiplier"] == pytest.approx(issuance.THERMOSTAT_DOWN)
        r3 = issuance.record_growth(w.con, "2027-W12", 0.05)
        r4 = issuance.record_growth(w.con, "2027-W13", 0.05)
        assert r3["next_multiplier"] == r2["next_multiplier"]
        assert r4["next_multiplier"] == pytest.approx(issuance.THERMOSTAT_DOWN * issuance.THERMOSTAT_UP)


def test_harbour_floor_counts_against_the_budget():
    w = make_world()
    farm = next(b for b in w.biz.values() if b.type == "farm")
    with db.clock(lambda: w.ts()):
        used0 = issuance.weekly(w.con)["used"]
        paid = civic.harbour_buys(w, [(farm, "crops", 10)])
        assert paid == 10 * civic.floor_price(w, "crops")
        assert issuance.weekly(w.con)["used"] == used0 + paid


def test_starter_grant_once_per_person_after_five_days_within_the_budget():
    w = make_world()
    with db.clock(lambda: w.ts()):
        a = genesis.arrive_player(w, "p900")
        assert not civic.queue_starter_grant(w, a)  # already queued on arrival: once per person
        assert civic.starter_grants(w) == 0  # not due before five days in town
        due = w.con.execute("SELECT due_tick - queued_tick d FROM starter_grants WHERE person=?", (a.owner_key,)).fetchone()["d"]
        assert w.p.starter_grant_after_days * 24 <= due < (w.p.starter_grant_after_days + w.p.starter_grant_spread_days) * 24
        w.tick += due
        used0 = issuance.weekly(w.con)["used"]
        before = w.bal(a.acct)
        paid = civic.starter_grants(w)
        assert paid == w.p.starter_grant == 80 * C
        assert w.bal(a.acct) == before + paid
        assert issuance.weekly(w.con)["used"] == used0 + paid  # counts against the weekly budget
        assert civic.starter_grants(w) == 0  # never twice
        row = w.con.execute("SELECT status FROM starter_grants WHERE person=?", (a.owner_key,)).fetchone()
        assert row["status"] == "paid"


def test_starter_grants_are_spread_over_several_days():
    w = make_world()
    with db.clock(lambda: w.ts()):
        for i in range(40):
            genesis.arrive_player(w, f"p{700 + i}")
    days = {r["d"] for r in w.con.execute("SELECT (due_tick - queued_tick) / 24 d FROM starter_grants")}
    assert len(days) == w.p.starter_grant_spread_days


def test_new_stalls_go_to_the_street_with_room():
    w = make_world()
    stalls = [b.xy for b in w.open_biz() if b.type == "stall"]
    free = [p for p in w.plots.values() if p["use"] == "business" and not p["owner"]]
    pid = actions._free_plot(w, "stall")
    pl = w.plots[pid]
    near = lambda q: sum(1 for s in stalls if w.dist(s, (q["x"], q["y"])) <= actions.STREET)
    homes = lambda q: sum(1 for a in w.agents.values() if a.home and w.dist(a.home, (q["x"], q["y"])) <= actions.NEAR_HOMES)
    best = max(homes(q) / (1 + near(q)) for q in free)
    assert homes(pl) / (1 + near(pl)) == pytest.approx(best, abs=1e-3)


# ------------------------------------------------------------------------------------------------ reports, AI, gates
def test_morning_reports_link_real_records(short_runs):
    s, _ = short_runs
    rep = s["reports"]
    assert rep["messages"] > 0 and rep["share_linked"] == 1.0 and rep["padded"] == 0


def test_recordings_cover_every_prompt_and_replay():
    rec = ai.RecordedPlanner()
    assert rec.meta.get("provider") == "fixture"
    n = 0
    for t, b, trig in ai.all_prompts():
        ans, meta = rec.plan(t, b, trig)
        assert ans is not None and ai.validate(ans) and not meta["fallback"]
        n += 1
    assert n == len(rec.answers)


def test_recorded_run_uses_the_planner_without_fallbacks():
    s = runner.run("baseline", 2, 5, mode="recorded")
    assert s["ai"]["calls"] > 0 and s["ai"]["fallbacks"] == 0
    assert s["conservation"]["failure"] is None


def test_growth_window_is_smoothed_and_annualised():
    days = [{"day": d, "index": 1.0005 ** d, "chain": 1.0005} for d in range(30)]
    g = M.growth_windows(days)[0]
    assert g["growth"] == pytest.approx(1.0005 ** 365 - 1, rel=1e-6)


def test_run_report_and_gate_checks_render(short_runs, tmp_path):
    s = runner.strip(short_runs[0])
    chk = gates.check_run(s)
    assert chk["conservation"][0]
    page = report.write(s, tmp_path / "r.html").read_text()
    assert "Payback curve" in page and "Leaderboard" in page and "uPlot" in page
