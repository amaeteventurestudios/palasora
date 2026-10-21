"""ISSUE-15: deterministic-trade-v2 price discovery. Prices move only through matched trades between different owners."""
from __future__ import annotations

import pytest

from palavva_editorial.economy import db, exchange as ex, ledger, pricing, reconcile, rewards

C = db.CENTS


@pytest.fixture()
def con(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "SHARES_OUTSTANDING", 100)  # 40 founder shares, 60 offered at IPO: easy to sell out in a test
    c = db.connect(tmp_path / "economy.db")
    db.init(c)
    with db.tx(c):
        ex.ensure_markets(c, {"NG": {"name": "Nigeria", "region": "West Africa"}})
        rewards.ensure_rules(c)
    yield c
    c.close()


def fund(con, agent):
    for i in range(6):
        rewards.award(con, agent_id=agent, rule="accepted_post" if i < 2 else "accepted_reply", ref_type="piece", ref_id=f"{agent}-{i}", owner_key=f"seed:{agent}")
    rewards.award(con, agent_id=agent, rule="first_contribution", ref_type="mission", ref_id="welcome", owner_key=f"seed:{agent}")
    with db.tx(con):
        con.execute("INSERT OR REPLACE INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (agent, 1, 5000, 20000, 50, "[]", db.now()))


def test_rules_are_bounded_and_off_means_v1():
    # Ask within the band is always taken.
    assert pricing.buy_price(last=100, ref=100, best_ask=101, risk="bold", band=0.3, discovery=True) == (101, "the best offer")
    # No ask: v1 bids the last price; v2 bids up by the risk premium, never past the band.
    assert pricing.buy_price(last=100, ref=100, best_ask=None, risk="bold", band=0.3, discovery=False)[0] == 100
    assert pricing.buy_price(last=100, ref=100, best_ask=None, risk="cautious", band=0.3, discovery=True)[0] == 101
    assert pricing.buy_price(last=100, ref=100, best_ask=None, risk="bold", band=0.3, discovery=True)[0] == 103
    assert pricing.buy_price(last=129, ref=100, best_ask=None, risk="bold", band=0.3, discovery=True)[0] == 130
    # Sells go to a real bid when there is one; a loss-cut without bids offers slightly under the last trade.
    assert pricing.sell_price(last=120, ref=120, best_bid=118, avg_cost=100, band=0.3, risk="balanced", cutting_loss=False, discovery=True)[0] == 118
    assert pricing.sell_price(last=80, ref=80, best_bid=None, avg_cost=100, band=0.3, risk="balanced", cutting_loss=True, discovery=True)[0] == 78
    assert pricing.sell_price(last=80, ref=80, best_bid=79, avg_cost=100, band=0.3, risk="balanced", cutting_loss=True, discovery=False)[0] == 80


def test_sold_out_ipo_bids_up_founder_sells_one_percent_and_price_and_index_follow_real_trades(con):
    fund(con, "f1")
    with db.tx(con):
        co = ex.create_company(con, founder_agent_id="f1", owner_key="seed:f1", name="Kola Logistics", ticker="KOLA", market="NG", sector="logistics",
                               description="A fictional logistics co-op.", ipo_price=100, fictional_ack=True, founding=True)
    for b in ("b1", "b2"):
        fund(con, b)
    ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=30, idem_key="ipo1")
    ex.place_order(con, agent_id="b2", owner_key="user:b2", company_id=co["id"], side="buy", price=100, qty=30, idem_key="ipo2")
    comp = dict(con.execute("SELECT * FROM companies WHERE id=?", (co["id"],)).fetchone())
    assert comp["last_price"] == 100 and not ex.book(con, co["id"])["asks"]  # IPO sold out; v1 would stop here forever
    assert ex.compute_index(con, None)[-1]["value"] == 1000.0  # correct: every trade was at the IPO price
    # IPO still open -> no founder sale.
    # A new buyer finds no offer and bids up (v2 rule 1).
    fund(con, "b3")
    p, why = pricing.buy_price(last=100, ref=100, best_ask=None, risk="balanced", band=ex.BAND, discovery=True)
    assert p == 102 and "nobody is offering" in why
    r = ex.place_order(con, agent_id="b3", owner_key="user:b3", company_id=co["id"], side="buy", price=p, qty=5, idem_key="bid1")
    assert r["trades"] == [] and r["order"]["status"] == "open"  # a bid is not a trade
    assert con.execute("SELECT last_price FROM companies WHERE id=?", (co["id"],)).fetchone()["last_price"] == 100  # no fabricated motion
    # The founder may sell up to 1% of founder shares per day (40 -> 1 share) into that real bid (rule 3).
    bids = ex.book(con, co["id"])["bids"]
    founder_qty = ledger.balance(con, "agent", "f1", f"SHR:{co['id']}")["available"]
    sale = pricing.founder_sale(con, founder_id="f1", company=comp, held_qty=founder_qty, best_bid=bids[0]["price"], best_bid_qty=bids[0]["qty"], last=100)
    assert sale and sale["qty"] == 1 and sale["allowance"] == 1 and sale["price"] == 1.02
    t = ex.place_order(con, agent_id="f1", owner_key="seed:f1", company_id=co["id"], side="sell", price=round(sale["price"] * C), qty=sale["qty"], idem_key="fs1")
    assert len(t["trades"]) == 1 and t["trades"][0]["price"] == 102
    assert con.execute("SELECT last_price FROM companies WHERE id=?", (co["id"],)).fetchone()["last_price"] == 102
    assert ex.compute_index(con, None)[-1]["value"] == 1020.0  # 1000 x 102/100: derived from the matched trade
    # Daily allowance used: no second founder sale today.
    bids = ex.book(con, co["id"])["bids"]
    assert pricing.founder_sale(con, founder_id="f1", company=comp, held_qty=founder_qty - 1, best_bid=bids[0]["price"] if bids else None,
                                best_bid_qty=bids[0]["qty"] if bids else 0, last=102) is None
    # No founder sale while the IPO is still on offer, or when bids are below the last price.
    assert pricing.founder_sale(con, founder_id="f1", company=comp, held_qty=10, best_bid=99, best_bid_qty=5, last=102) is None
    assert reconcile.run(con, store=False)["ok"]


def test_engine_trade_tick_uses_v2_rules_end_to_end(tmp_path, monkeypatch):
    """The real FastEngine.trade_tick on a temporary economy database: a sold-out company gets a bid above the last trade from an
    interested agent, its founder sells one share into it, and the decision log names the v2 rules. PocketBase is not touched."""
    from palavva_editorial.city import control, fast
    from palavva_editorial.economy import service as econ
    monkeypatch.setenv("ECONOMY_DB", str(tmp_path / "econ.db"))
    monkeypatch.setattr(ex, "SHARES_OUTSTANDING", 100)
    con = econ.con()
    vals = {"price_discovery_enabled": True, "company_formation_enabled": False, "max_new_companies_per_market_day": 1, "country_paused": False, "exchange_enabled": True}
    monkeypatch.setattr(control, "get", lambda tid, key, cc="": vals.get(key, True))
    monkeypatch.setattr(fast, "cfg", lambda: {"agents_per_trade_tick": 10, "max_new_companies_day": 0})
    for a in ("f1", "b1", "b2", "b3"):
        fund(con, a)
    with db.tx(con):
        co = ex.create_company(con, founder_agent_id="f1", owner_key="seed:f1", name="Kola Logistics", ticker="KOLA", market="NG", sector="logistics",
                               description="A fictional logistics co-op.", ipo_price=100, fictional_ack=True, founding=True)
    ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=30, idem_key="ipo1")
    ex.place_order(con, agent_id="b2", owner_key="user:b2", company_id=co["id"], side="buy", price=100, qty=30, idem_key="ipo2")
    eng = fast.FastEngine.__new__(fast.FastEngine)
    eng.tid, eng.trade_cursor, eng.meter = "t1", 0, None
    base = {"trading_enabled": True, "risk_profile": "balanced", "country_affinities": ["NG"], "primary_subjects": ["logistics"], "secondary_subjects": [], "_home": "NG"}
    # ids sort as b3 < f1: the buyer bids first, then the founder sells into that bid in the same tick.
    eng.agents = {"b3": {**base, "id": "b3", "handle": "b3", "owner_type": "user", "owner_user_id": "u3"}, "f1": {**base, "id": "f1", "handle": "f1"}}
    eng.notify = lambda *a, **k: None
    eng._emit_economy = lambda *a, **k: None
    out = eng.trade_tick()
    assert out["orders"] == 2, out
    rows = {r["agent_id"]: dict(r) for r in con.execute("SELECT * FROM decisions WHERE kind='trade'")}
    assert rows["b3"]["action"] == "buy" and "nobody is offering shares" in rows["b3"]["explanation"] and rows["b3"]["decider"] == pricing.RULES_VERSION
    assert rows["f1"]["action"] == "sell" and "at most 1 per day" in rows["f1"]["explanation"]
    assert con.execute("SELECT last_price FROM companies WHERE id=?", (co["id"],)).fetchone()["last_price"] == 102
    # Switch off -> v1: a new interested agent bids only the last price.
    vals["price_discovery_enabled"] = False
    fund(con, "b4")
    eng.agents = {"b4": {**base, "id": "b4", "handle": "b4"}}
    eng.trade_cursor = 0
    eng.trade_tick()
    o = con.execute("SELECT price FROM orders WHERE owner_id='b4'").fetchone()
    assert o["price"] == 102
    assert reconcile.run(con, store=False)["ok"]


def _company_with_resting_orders(con):
    fund(con, "f1")
    with db.tx(con):
        co = ex.create_company(con, founder_agent_id="f1", owner_key="seed:f1", name="Kola Logistics", ticker="KOLA", market="NG", sector="logistics",
                               description="A fictional logistics co-op.", ipo_price=100, fictional_ack=True, founding=True)
    for b in ("b1", "b2"):
        fund(con, b)
    ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=10, idem_key="ipo1")
    rest = ex.place_order(con, agent_id="b2", owner_key="user:b2", company_id=co["id"], side="buy", price=95, qty=5, idem_key="rest1")  # rests below the IPO offer
    return co, rest


def test_halt_vs_pause_with_pending_orders(con):
    co, rest = _company_with_resting_orders(con)
    reserved = ledger.balance(con, "agent", "b2")["reserved"]
    assert rest["order"]["status"] == "open" and reserved == 5 * 95
    # HALT EXCHANGE: every new order is refused; the resting order keeps its reservation and is not cancelled.
    with db.tx(con):
        ex.set_switch(con, "EXCHANGE_HALTED", True, "admin")
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=1, idem_key="during-halt")
    assert e.value.code == "HALTED"
    assert con.execute("SELECT status FROM orders WHERE id=?", (rest["order"]["id"],)).fetchone()["status"] == "open"
    assert ledger.balance(con, "agent", "b2")["reserved"] == reserved
    assert reconcile.run(con, store=False)["ok"]
    with db.tx(con):
        ex.set_switch(con, "EXCHANGE_HALTED", False, "admin")
    # MARKET HALT: only that country's market refuses orders.
    with db.tx(con):
        con.execute("UPDATE markets SET status='halted' WHERE code='NG'")
    with pytest.raises(ex.ExchangeError):
        ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=1, idem_key="ng-halt")
    with db.tx(con):
        con.execute("UPDATE markets SET status='open' WHERE code='NG'")
    # PAUSE AGENT TRADING: the engine stops deciding, but the market stays open to orders (e.g. a user's own agent through the API).
    with db.tx(con):
        ex.set_switch(con, "TRADING_ENGINE_PAUSED", True, "admin")
    r = ex.place_order(con, agent_id="b1", owner_key="user:b1", company_id=co["id"], side="buy", price=100, qty=1, idem_key="during-pause")
    assert r["trades"] and r["trades"][0]["price"] == 100
    assert reconcile.run(con, store=False)["ok"]


def test_price_audit_and_trade_trail_show_settlement(con):
    from palavva_editorial.economy import intel
    co, _ = _company_with_resting_orders(con)
    a = intel.price_audit(con, None, False)
    assert a["trades"] == 1 and a["ipo_trades"] == 1 and a["secondary_trades"] == 0
    assert "correct, not a calculation error" in a["verdict"] and "Price discovery is OFF" in a["verdict"]
    tid = intel.recent_trades(con)[0]["id"]
    t = intel.trade_trail(con, tid)
    assert t["settled"] and t["trade"]["kind"] == "ipo"
    assert {e["kind"] for e in t["journal"]} >= {"trade_cash", "trade_shares"}
    assert t["buy_order"]["owner_id"] == "b1" and t["sell_order"]["account_owner_kind"] == "company"
    own = {o["ticker"]: o for o in intel.ownership(con)}["KOLA"]
    assert own["founder_pct"] == 40.0 and own["outside_holders"] == 1 and own["treasury_pct"] == 50.0
