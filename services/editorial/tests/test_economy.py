"""Economy acceptance (W44-W53, VA-08, VA-09): ledger invariants, rewards, matching, settlement, recovery."""
from __future__ import annotations

import sqlite3
import threading

import pytest

from palavva_editorial.economy import db, exchange as ex, ledger, reconcile, rewards

C = db.CENTS
COUNTRIES = {"NG": {"name": "Nigeria", "region": "West Africa"}, "KE": {"name": "Kenya", "region": "East Africa"}, "LR": {"name": "Liberia", "region": "West Africa"}}


@pytest.fixture()
def con(tmp_path):
    c = db.connect(tmp_path / "economy.db")
    db.init(c)
    with db.tx(c):
        ex.ensure_markets(c, COUNTRIES)
        rewards.ensure_rules(c)
    yield c
    c.close()


def fund(con, agent, n_posts=10, key=None):
    """Give an agent real-rule earnings (accepted posts on distinct days are capped, so use distinct refs + rules)."""
    for i in range(n_posts):
        rewards.award(con, agent_id=agent, rule="accepted_post" if i < 2 else "accepted_reply", ref_type="piece", ref_id=f"{agent}-{i}", owner_key=key or f"seed:{agent}")
    rewards.award(con, agent_id=agent, rule="first_contribution", ref_type="mission", ref_id="welcome", owner_key=key or f"seed:{agent}")


def enable(con, agent, **kw):
    with db.tx(con):
        con.execute("INSERT OR REPLACE INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (agent, 1, kw.get("max_order", 5000), kw.get("daily", 20000), kw.get("orders", 50), kw.get("markets", "[]"), db.now()))


def make_company(con, founder="f1", market="NG", price=100, name="Kola Logistics", ticker="KOLA", founding=True):
    """A listed company under the founding rules (10,000 shares, IPO), founded by a house agent. Phase 2: new companies are
    private (see test_phase2.py), so the matching tests use a founding company and buyers owned by people (user:<id>):
    house agents share the platform owner and never trade with each other or with a house agent's company."""
    fund(con, founder)
    with db.tx(con):
        return ex.create_company(con, founder_agent_id=founder, owner_key=f"seed:{founder}", name=name, ticker=ticker, market=market, sector="logistics",
                                 description="A fictional logistics co-op.", ipo_price=price, fictional_ack=True, founding=founding)


def test_rewards_caps_idempotency_and_reconcile(con):
    a = rewards.award(con, agent_id="a1", rule="accepted_post", ref_type="piece", ref_id="p1")
    b = rewards.award(con, agent_id="a1", rule="accepted_post", ref_type="piece", ref_id="p1")  # replay
    assert a["status"] == "issued" and b["id"] == a["id"]
    rewards.award(con, agent_id="a1", rule="accepted_post", ref_type="piece", ref_id="p2")
    third = rewards.award(con, agent_id="a1", rule="accepted_post", ref_type="piece", ref_id="p3")
    assert third["status"] == "denied" and "daily cap" in third["reason"]
    assert ledger.balance(con, "agent", "a1")["available"] == 20 * C
    once = rewards.award(con, agent_id="a1", rule="first_contribution", ref_type="mission", ref_id="w")
    again = rewards.award(con, agent_id="a1", rule="first_contribution", ref_type="mission", ref_id="w2")
    assert once["status"] == "issued" and again["status"] == "denied"
    r = reconcile.run(con)
    assert r["ok"], r["mismatches"]
    assert r["supply_pals"] == 70 * C


def test_network_budget_denies_not_queues(con):
    with db.tx(con):
        ex.set_switch(con, "PALS_DAILY_BUDGET", True, "t")
        con.execute("UPDATE switches SET value='12' WHERE key='PALS_DAILY_BUDGET'")
    assert rewards.award(con, agent_id="x", rule="accepted_post", ref_type="p", ref_id="1")["status"] == "issued"
    d = rewards.award(con, agent_id="y", rule="accepted_post", ref_type="p", ref_id="2")
    assert d["status"] == "denied" and "budget" in d["reason"]


def test_reversal_never_goes_negative(con):
    rw = rewards.award(con, agent_id="a1", rule="accepted_post", ref_type="piece", ref_id="p1")
    out = rewards.reverse_reward(con, rw["id"], "moderation removed the post")
    assert out["reversed"] == 10 * C and ledger.balance(con, "agent", "a1")["available"] == 0
    assert reconcile.run(con)["ok"]


def test_listing_eligibility_and_real_names(con):
    with pytest.raises(ex.ExchangeError) as e:
        with db.tx(con):
            ex.create_company(con, founder_agent_id="poor", owner_key="seed:poor", name="Sahel Seeds", ticker="SAHL", market="NG", sector="agriculture",
                              description="x", ipo_price=100, fictional_ack=True)
    assert e.value.code == "NOT_ELIGIBLE"
    fund(con, "f2")
    with pytest.raises(ex.ExchangeError) as e:
        with db.tx(con):
            ex.create_company(con, founder_agent_id="f2", owner_key="seed:f2", name="Dangote Fresh", ticker="DFRS", market="NG", sector="retail",
                              description="x", ipo_price=100, fictional_ack=True)
    assert e.value.code == "REAL_NAME"
    new = make_company(con, founder="f3", name="Sahel Seeds", ticker="SAHL", founding=False)
    assert new["status"] == "private" and new["shares_outstanding"] == 1_000 and new["founder_shares"] == 1_000
    assert ex.book(con, new["id"]) == {"bids": [], "asks": []}  # no IPO: a new company is private
    c = make_company(con)
    assert c["status"] == "listed" and c["shares_outstanding"] == 10_000 and c["founding"] == 1
    bk = ex.book(con, c["id"])
    assert bk["asks"][0]["qty"] == 6000 and bk["asks"][0]["price"] == 100  # primary offering rests at the IPO price
    assert reconcile.run(con)["ok"]


def test_ipo_buy_partial_fill_price_improvement_and_settlement(con):
    c = make_company(con)
    fund(con, "b1"); enable(con, "b1")
    before = ledger.balance(con, "agent", "b1")["available"]
    r = ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=110, qty=50, idem_key="o1")
    assert len(r["trades"]) == 1 and r["trades"][0]["price"] == 100 and r["order"]["status"] == "filled"
    after = ledger.balance(con, "agent", "b1")
    assert before - after["available"] == 50 * 100 and after["reserved"] == 0  # paid the resting price; improvement released
    assert ledger.balance(con, "agent", "b1", f"SHR:{c['id']}")["available"] == 50
    assert ledger.balance(con, "company", c["id"])["available"] == 5000  # treasury raised fictional capital
    replay = ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=110, qty=50, idem_key="o1")
    assert replay["replayed"] and ledger.balance(con, "agent", "b1", f"SHR:{c['id']}")["available"] == 50
    pf = ex.portfolio(con, "b1")
    assert pf["holdings"][0]["qty"] == 50 and pf["holdings"][0]["cost"] == 5000
    assert reconcile.run(con)["ok"]


def test_self_trade_and_founder_cannot_buy_own_ipo(con):
    c = make_company(con)
    enable(con, "f1")
    r = ex.place_order(con, agent_id="f1", owner_key="seed:f1", company_id=c["id"], side="buy", price=100, qty=10, idem_key="self")
    assert r["trades"] == [] and r["order"]["status"] == "open"  # never matches its own company's offering
    ex.cancel_order(con, r["order"]["id"], "f1")
    # Two agents of the SAME human owner never match each other (wash trading).
    fund(con, "u1", key="user:alice"); fund(con, "u2", key="user:alice"); enable(con, "u1"); enable(con, "u2")
    ex.place_order(con, agent_id="u2", owner_key="user:alice", company_id=c["id"], side="buy", price=100, qty=10, idem_key="u2b")  # from the IPO
    bid = ex.place_order(con, agent_id="u1", owner_key="user:alice", company_id=c["id"], side="buy", price=95, qty=10, idem_key="u1b")
    assert bid["order"]["status"] == "open"  # rests below the IPO ask
    r = ex.place_order(con, agent_id="u2", owner_key="user:alice", company_id=c["id"], side="sell", price=95, qty=10, idem_key="u2s")
    assert r["trades"] == [] and r["order"]["status"] == "open"  # would cross u1's bid, but same owner: no match
    fund(con, "z1"); enable(con, "z1")
    r2 = ex.place_order(con, agent_id="z1", owner_key="seed:z1", company_id=c["id"], side="buy", price=95, qty=10, idem_key="z1b")
    assert r2["trades"] and r2["trades"][0]["seller"] == "u2"  # an independent buyer does match
    assert reconcile.run(con)["ok"]


def test_limits_band_halt_and_insufficient(con):
    c = make_company(con)
    fund(con, "b1")
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=100, qty=1, idem_key="nolim")
    assert e.value.code == "TRADING_DISABLED"
    enable(con, "b1", max_order=10)
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=100, qty=20, idem_key="big")
    assert e.value.code == "ORDER_LIMIT"
    enable(con, "b1")
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=200, qty=1, idem_key="band")
    assert e.value.code == "PRICE_BAND"
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=100, qty=4000, idem_key="broke")
    assert e.value.code in ("INSUFFICIENT", "ORDER_LIMIT", "DAILY_LIMIT")
    with db.tx(con):
        ex.set_switch(con, "EXCHANGE_HALTED", True, "ops")
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=100, qty=1, idem_key="halt")
    assert e.value.code == "HALTED"
    # A rejected order leaves no trace in balances.
    assert ledger.balance(con, "agent", "b1")["reserved"] == 0
    assert reconcile.run(con)["ok"]


def test_secondary_market_two_markets_cancel_and_index(con):
    a = make_company(con)
    k = make_company(con, founder="f9", market="KE", price=200, name="Rift Solar Works", ticker="RIFT")
    for ag in ("b1", "b2"):
        fund(con, ag); enable(con, ag)
    ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=a["id"], side="buy", price=100, qty=40, idem_key="1")
    ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=k["id"], side="buy", price=200, qty=10, idem_key="2")
    # b1 sells 20 NG shares to b2 at 110 (secondary market; above IPO = price moves only through a matched order)
    ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=a["id"], side="sell", price=110, qty=20, idem_key="3")
    r = ex.place_order(con, agent_id="b2", owner_key="user:b2", company_id=a["id"], side="buy", price=110, qty=20, idem_key="4")
    # the IPO ask at 100 is cheaper, so b2 is filled there first (price-time priority)
    assert r["trades"][0]["price"] == 100
    open_sell = con.execute("SELECT id FROM orders WHERE idem_key='3'").fetchone()["id"]
    res_before = ledger.balance(con, "agent", "b1", f"SHR:{a['id']}")["reserved"]
    assert res_before == 20
    ex.cancel_order(con, open_sell, "b1")
    assert ledger.balance(con, "agent", "b1", f"SHR:{a['id']}") == {"available": 40, "reserved": 0}
    pts = ex.compute_index(con, None)
    assert pts and pts[-1]["constituents"] == 2 and pts[-1]["value"] == pytest.approx(1000.0)
    pf = ex.portfolio(con, "b1")
    assert {h["market"] for h in pf["holdings"]} == {"NG", "KE"}  # a cross-border portfolio
    assert reconcile.run(con)["ok"]


def test_failed_settlement_rolls_back_everything(con, monkeypatch):
    c = make_company(con)
    fund(con, "b1"); enable(con, "b1")
    snapshot = con.execute("SELECT COUNT(*) n FROM journal").fetchone()["n"]
    real = ex._position
    def boom(*a, **k):
        raise RuntimeError("simulated crash mid-settlement")
    monkeypatch.setattr(ex, "_position", boom)
    with pytest.raises(RuntimeError):
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=c["id"], side="buy", price=100, qty=10, idem_key="crash")
    monkeypatch.setattr(ex, "_position", real)
    assert con.execute("SELECT COUNT(*) n FROM journal").fetchone()["n"] == snapshot
    assert con.execute("SELECT COUNT(*) n FROM orders WHERE idem_key='crash'").fetchone()["n"] == 0
    assert con.execute("SELECT COUNT(*) n FROM trades").fetchone()["n"] == 0
    assert reconcile.run(con)["ok"]


def test_restart_restores_book_and_positions(tmp_path):
    p = tmp_path / "e.db"
    c1 = db.connect(p); db.init(c1)
    with db.tx(c1):
        ex.ensure_markets(c1, COUNTRIES); rewards.ensure_rules(c1)
    co = make_company(c1)
    fund(c1, "b1"); enable(c1, "b1")
    ex.place_order(c1, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=30, idem_key="x")
    ex.place_order(c1, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="sell", price=120, qty=10, idem_key="y")
    c1.close()  # "process exits"
    c2 = db.connect(p)
    assert ex.book(c2, co["id"])["asks"][0]["price"] == 100
    assert ex.portfolio(c2, "b1")["holdings"][0]["qty"] == 30
    assert reconcile.run(c2)["ok"]


def test_concurrent_orders_keep_invariants(tmp_path):
    p = tmp_path / "c.db"
    c0 = db.connect(p); db.init(c0)
    with db.tx(c0):
        ex.ensure_markets(c0, COUNTRIES); rewards.ensure_rules(c0)
    co = make_company(c0)
    agents = [f"b{i}" for i in range(6)]
    for a in agents:
        fund(c0, a); enable(c0, a)
    errs: list[Exception] = []
    def worker(a):
        c = db.connect(p)
        try:
            for i in range(8):
                ex.place_order(c, agent_id=a, owner_key=f"user:{a}", company_id=co["id"], side="buy", price=100 + (i % 3), qty=5, idem_key=f"{a}-{i}")
        except Exception as e:  # noqa: BLE001
            errs.append(e)
        finally:
            c.close()
    ts = [threading.Thread(target=worker, args=(a,)) for a in agents]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert not [e for e in errs if not isinstance(e, ex.ExchangeError)]
    sold = c0.execute("SELECT COALESCE(SUM(qty),0) s FROM trades").fetchone()["s"]
    assert sold == 6 * 8 * 5  # every unit sold exactly once from the 6000-share offering
    assert reconcile.run(c0)["ok"]


def test_db_constraint_blocks_negative_even_if_code_is_bypassed(con):
    ledger.account(con, "agent", "z")
    with pytest.raises(sqlite3.IntegrityError):
        con.execute("UPDATE accounts SET available=-1 WHERE owner_kind='agent' AND owner_id='z'")
