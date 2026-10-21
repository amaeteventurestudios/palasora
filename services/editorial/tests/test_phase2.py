"""Phase 2 (Doc 06 sections 4, 7.2, 7.3; Doc 04 sections 4, 4A, 5, 8): the Pals-to-Sora migration, human accounts, the
platform owner, the two mints, the burn account, the Town Hall weekly budget, the company rule split, sourced_reply retired.

Pals-era ledgers are built with the economy code exactly as it was in Phase 1 (tests/fixtures/pals_v1_economy), so the
migration is tested against the real v1 schema and real v1 journal rows, not a hand-made imitation.
"""
from __future__ import annotations

import dataclasses
import hashlib
import math
import sqlite3
import sys
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from palavva_editorial.economy import db, exchange as ex, issuance, ledger, migration, policy, reconcile, rewards

sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from pals_v1_economy import db as v1db, exchange as v1ex, ledger as v1ledger, reconcile as v1rec, rewards as v1rewards  # noqa: E402

C = db.CENTS
COUNTRIES = {"NG": {"name": "Nigeria", "region": "West Africa"}, "KE": {"name": "Kenya", "region": "East Africa"}}


# ------------------------------------------------------------------------------------------------ Pals-era ledgers (v1 code)

def v1_enable(c, agent):
    with v1db.tx(c):
        c.execute("INSERT OR REPLACE INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_at) VALUES (?,?,?,?,?,?,?)",
                  (agent, 1, 5000, 20000, 50, "[]", v1db.now()))


def v1_fund(c, agent, key, n=6):
    for i in range(n):
        v1rewards.award(c, agent_id=agent, rule="accepted_post" if i < 2 else "accepted_reply", ref_type="piece", ref_id=f"{agent}-{i}", owner_key=key)
    v1rewards.award(c, agent_id=agent, rule="first_contribution", ref_type="mission", ref_id="welcome", owner_key=key)


def build_v1(path: Path) -> Path:
    """A Pals ledger with everything the migration must carry: rewards (house agents and people's agents), a reversal,
    listing fees, two listed companies with IPOs, matched trades, and open orders reserving Pals and shares."""
    c = v1db.connect(path)
    v1db.init(c)
    with v1db.tx(c):
        v1ex.ensure_markets(c, COUNTRIES)
        v1rewards.ensure_rules(c)
    keys = {"s0": "seed:s0", "s1": "seed:s1", "s2": "seed:s2", "s3": "seed:s3", "u0": "user:alice", "u1": "user:bob", "u2": "user:alice"}
    for a, k in keys.items():
        v1_fund(c, a, k)
        v1_enable(c, a)
    bad = v1rewards.award(c, agent_id="s2", rule="cross_owner_upvote", ref_type="vote", ref_id="v1", owner_key="seed:s2")
    v1rewards.reverse_reward(c, bad["id"], "collusion found")
    with v1db.tx(c):
        kola = v1ex.create_company(c, founder_agent_id="s0", owner_key="seed:s0", name="Kola Logistics", ticker="KOLA", market="NG", sector="logistics",
                                   description="A fictional logistics co-op.", ipo_price=100, fictional_ack=True)
        rift = v1ex.create_company(c, founder_agent_id="s3", owner_key="seed:s3", name="Rift Solar Works", ticker="RIFT", market="KE", sector="energy",
                                   description="A fictional solar co-op.", ipo_price=120, fictional_ack=True)
    v1ex.place_order(c, agent_id="u0", owner_key="user:alice", company_id=kola["id"], side="buy", price=100, qty=20, idem_key="u0-ipo")
    v1ex.place_order(c, agent_id="s1", owner_key="seed:s1", company_id=kola["id"], side="buy", price=100, qty=15, idem_key="s1-ipo")
    v1ex.place_order(c, agent_id="u1", owner_key="user:bob", company_id=rift["id"], side="buy", price=120, qty=10, idem_key="u1-ipo")
    v1ex.place_order(c, agent_id="s1", owner_key="seed:s1", company_id=kola["id"], side="sell", price=110, qty=5, idem_key="s1-sell")   # rests: reserves shares
    v1ex.place_order(c, agent_id="u1", owner_key="user:bob", company_id=rift["id"], side="buy", price=100, qty=4, idem_key="u1-bid")     # rests: reserves Pals
    v1ex.place_order(c, agent_id="s2", owner_key="seed:s2", company_id=kola["id"], side="buy", price=110, qty=5, idem_key="s2-buy")     # fills from the KOLA IPO at 100
    assert v1rec.run(c, store=False)["ok"]
    c.close()
    return path


def pb_stub(data: Path) -> None:
    (data / "pb_data").mkdir(parents=True, exist_ok=True)
    s = sqlite3.connect(data / "pb_data" / "data.db")
    s.execute("CREATE TABLE IF NOT EXISTS users (id TEXT)")
    s.commit(); s.close()


@pytest.fixture()
def legacy(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    pb_stub(data)
    build_v1(data / "economy.db")
    return {"data": data, "db": data / "economy.db", "backups": tmp_path / "backups"}


def snapshot(path: Path) -> dict:
    """Totals per (owner, asset) read straight from the file, without any of today's code."""
    c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    out = {(r["owner_kind"], r["owner_id"], r["asset"]): r["available"] + r["reserved"] for r in c.execute("SELECT * FROM accounts")}
    c.close()
    return out


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# ------------------------------------------------------------------------------------------------ the migration

def test_migration_converts_one_to_one_fingerprints_match_and_is_idempotent(legacy):
    before = snapshot(legacy["db"])
    pals = {(k, i): v for (k, i, a), v in before.items() if a == "PALS" and not (k == "platform" and i == "issuance") and v}
    shares = {(k, i, a): v for (k, i, a), v in before.items() if a.startswith("SHR:") and not i.startswith("mint:") and v}
    v1 = sqlite3.connect(legacy["db"]); v1.row_factory = sqlite3.Row
    open_orders = [dict(o) for o in v1.execute("SELECT * FROM orders WHERE status IN ('open','partial')")]
    v1.close()
    assert len(open_orders) >= 2 and {o["side"] for o in open_orders} == {"buy", "sell"}  # Pals and shares reserved

    rep = migration.migrate(legacy["db"], data_dir=legacy["data"], backup_root=legacy["backups"], quiet=True)
    assert rep["status"] == "done", rep
    assert rep["fingerprints_match"] and rep["before"]["sha256"] == rep["after"]["sha256"]
    assert rep["before"]["money_sha256"] == rep["after"]["money_sha256"] and rep["before"]["shares_sha256"] == rep["after"]["shares_sha256"]
    assert rep["freeze"]["orders_cancelled"] == len(open_orders)
    assert Path(rep["backup"]["dir"], "economy.db").exists() and len(rep["backup"]["economy_sha256"]) == 64

    con = db.connect(legacy["db"])
    after = snapshot(legacy["db"])
    # every account's Sora equals its old Pals (fees and the old clawback holding convert like any other account)
    for (k, i), v in pals.items():
        assert after[(k, i, "SORA")] == v, (k, i)
        assert after[(k, i, "PALS")] == 0
    # the Pals in platform:conversion equal the Sora the migration issued, which equal all Pals held before
    conv = after[("platform", "conversion", "PALS")]
    issued = con.execute("SELECT SUM(amount) s FROM journal WHERE asset='SORA' AND kind='issue' AND rule='migration:pals-to-sora'").fetchone()["s"]
    assert conv == issued == sum(pals.values()) == -after[("platform", "town_hall", "SORA")]
    # shares untouched (holders and totals; the freeze only released reserved shares back to their owner)
    assert {(k, i, a): v for (k, i, a), v in after.items() if a.startswith("SHR:") and not i.startswith("mint:") and v} == shares
    # open orders cancelled with their reservations released; nothing reserved anywhere
    for o in open_orders:
        row = con.execute("SELECT status, reserved_left, reject_reason FROM orders WHERE id=?", (o["id"],)).fetchone()
        assert row["status"] == "cancelled" and row["reserved_left"] == 0 and "migration" in row["reject_reason"]
        assert con.execute("SELECT 1 FROM journal WHERE idem_key=?", (f"cancel:{o['id']}",)).fetchone()
    assert con.execute("SELECT COALESCE(SUM(reserved),0) s FROM accounts").fetchone()["s"] == 0
    # two entries per converted account, one transaction, tagged
    rows = con.execute("SELECT kind, asset, txn_id FROM journal WHERE rule='migration:pals-to-sora'").fetchall()
    assert len(rows) == 2 * len(pals) and len({r["txn_id"] for r in rows}) == 1
    assert {(r["kind"], r["asset"]) for r in rows} == {("convert", "PALS"), ("issue", "SORA")}
    # the companies that existed become founding companies: 10,000 shares, still listed
    assert [tuple(r) for r in con.execute("SELECT founding, status, shares_outstanding FROM companies")] == [(1, "listed", 10000)] * 2
    assert db.currency_state(con) == "sora" and reconcile.run(con)["ok"]
    # Pals history stays readable; Pals can no longer move
    hist = ledger.history(con, "agent", "u0", db.PALS)
    assert hist[0]["kind"] == "convert" and hist[0]["label"].startswith("Pals converted") and len(hist) > 3
    a = con.execute("SELECT id FROM accounts WHERE owner_id='u0' AND asset='PALS'").fetchone()["id"]
    cv = con.execute("SELECT id FROM accounts WHERE owner_id='conversion' AND asset='PALS'").fetchone()["id"]
    with pytest.raises(ledger.LedgerError) as e:
        with db.tx(con):
            ledger.transfer(con, kind="refund", idem_key="sneak", src=cv, src_bucket="available", dst=a, dst_bucket="available", asset=db.PALS, amount=1)
    assert e.value.code == "PALS_RETIRED"
    # the freeze stays on until an operator lifts it
    assert ex.switch_on(con, "EXCHANGE_HALTED") and ex.switch_on(con, "PALS_ISSUANCE_PAUSED")
    n_journal = con.execute("SELECT COUNT(*) n FROM journal").fetchone()["n"]
    fp = reconcile.fingerprint(con)["sha256"]
    con.close()

    again = migration.migrate(legacy["db"], data_dir=legacy["data"], backup_root=legacy["backups"], quiet=True)
    assert again["status"] == "already_done"
    con = db.connect(legacy["db"])
    assert con.execute("SELECT COUNT(*) n FROM journal").fetchone()["n"] == n_journal and reconcile.fingerprint(con)["sha256"] == fp
    assert len(list(legacy["backups"].glob("palasora-*"))) == 1  # the second run did not even back up
    st_ = migration.unfreeze(con, "ops")
    assert st_["switches"] == {"PALS_ISSUANCE_PAUSED": False, "EXCHANGE_HALTED": False} and st_["migration"] == "done"
    # after the unfreeze the founding company trades in Sora. Its IPO order was an open order too, so it was cancelled and the
    # treasury shares went back to the company (re-offering them is an operator decision, see SORA-MIGRATION.md).
    kola = con.execute("SELECT id FROM companies WHERE ticker='KOLA'").fetchone()["id"]
    assert ex.book(con, kola)["asks"] == [] and ledger.balance(con, "company", kola, f"SHR:{kola}")["available"] > 0
    bal = ledger.balance(con, "agent", "u1")["available"]
    r = ex.place_order(con, agent_id="u1", owner_key="user:bob", company_id=kola, side="buy", price=100, qty=3, idem_key="post-sora")
    assert r["trades"] == [] and r["order"]["status"] == "open"
    s = ex.place_order(con, agent_id="s1", owner_key="seed:s1", company_id=kola, side="sell", price=100, qty=3, idem_key="post-sora-s")
    assert s["trades"] and ledger.balance(con, "agent", "u1")["available"] == bal - 300
    assert reconcile.run(con)["ok"]


def test_migration_aborts_and_restores_on_an_injected_mismatch(legacy):
    def corrupt(con):  # one account gets one centi-Sora more than it held in Pals
        con.execute("UPDATE accounts SET available = available + 1 WHERE id = (SELECT MIN(id) FROM accounts WHERE asset='SORA' AND owner_kind='agent')")
    rep = migration.migrate(legacy["db"], data_dir=legacy["data"], backup_root=legacy["backups"], quiet=True, _fault=corrupt)
    assert rep["status"] == "aborted_restored" and "account_sora_equals_old_pals" in rep["error"]
    assert sha(legacy["db"]) == rep["backup"]["economy_sha256"]  # byte for byte the backup
    con = db.connect(legacy["db"])
    assert db.currency_state(con) == "pending"
    assert con.execute("SELECT COUNT(*) n FROM journal WHERE asset='SORA'").fetchone()["n"] == 0
    assert con.execute("SELECT 1 FROM migrations").fetchone() is None
    con.close()
    # nothing moves while Pals are unconverted
    con = db.connect(legacy["db"]); db.init(con)
    with pytest.raises(ledger.LedgerError) as e:
        with db.tx(con):
            ledger.issue(con, "u0", 100, idem_key="early", rule="x", ref_type="t", ref_id="1")
    assert e.value.code == "MIGRATION_PENDING"
    con.close()


def test_migration_restores_when_the_check_after_commit_fails_and_can_run_again(legacy):
    def tamper(con):
        with db.tx(con):
            con.execute("UPDATE accounts SET available = available + 5 WHERE id = (SELECT MAX(id) FROM accounts WHERE asset='SORA' AND owner_kind='agent')")
    rep = migration.migrate(legacy["db"], data_dir=legacy["data"], backup_root=legacy["backups"], quiet=True, _post_commit_fault=tamper)
    assert rep["status"] == "aborted_restored" and rep["differences"]
    assert sha(legacy["db"]) == rep["backup"]["economy_sha256"]
    ok = migration.migrate(legacy["db"], data_dir=legacy["data"], backup_root=legacy["backups"], quiet=True)
    assert ok["status"] == "done" and ok["fingerprints_match"]


def test_dry_run_works_on_a_copy_and_reports_fingerprints(legacy):
    before = sha(legacy["db"])
    rep = migration.dry_run(legacy["db"], data_dir=legacy["data"], quiet=True)
    assert rep["status"] == "done" and rep["dry_run"] and rep["second_run"] == "already_done"
    assert rep["before"]["sha256"] == rep["after"]["sha256"] and rep["fingerprints_match"]
    assert sha(legacy["db"]) == before  # the real file was only read
    c = sqlite3.connect(legacy["db"])
    assert c.execute("SELECT COUNT(*) FROM journal WHERE asset='SORA'").fetchone()[0] == 0
    c.close()
    assert migration.main(["--dry-run", "--data-dir", str(legacy["data"])]) == 0
    assert migration.main(["--data-dir", str(legacy["data"])]) == 2  # a real run needs --yes


def test_a_ledger_that_never_held_pals_starts_in_sora(tmp_path):
    data = tmp_path / "d"; data.mkdir(); pb_stub(data)
    c = db.connect(data / "economy.db"); db.init(c)
    assert db.currency_state(c) == "sora"
    c.close()
    assert migration.migrate(data / "economy.db", data_dir=data, backup_root=tmp_path / "b", quiet=True)["status"] == "nothing_to_do"


def test_schema_upgrade_keeps_every_row_and_id(tmp_path):
    p = build_v1(tmp_path / "e.db")
    raw = sqlite3.connect(p)
    before = {t: raw.execute(f"SELECT * FROM {t} ORDER BY 1").fetchall() for t in ("accounts", "journal")}
    companies = raw.execute("SELECT id, ticker, status, shares_outstanding FROM companies ORDER BY id").fetchall()
    raw.close()
    c = db.connect(p); db.init(c)
    assert [tuple(r) for r in c.execute("SELECT * FROM accounts ORDER BY 1")] == before["accounts"]
    assert [tuple(r) for r in c.execute("SELECT * FROM journal ORDER BY 1")] == before["journal"]
    assert [tuple(r) for r in c.execute("SELECT id, ticker, status, shares_outstanding FROM companies ORDER BY id")] == companies
    assert c.execute("PRAGMA foreign_key_check").fetchall() == [] and c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert db.currency_state(c) == "pending" and not db.upgrade(c)  # second upgrade is a no-op


@settings(max_examples=30, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow])
@given(ops=st.lists(st.tuples(st.sampled_from(["award", "reverse", "buy", "sell", "rest"]), st.integers(0, 4), st.integers(1, 30)), min_size=1, max_size=25),
       users=st.lists(st.booleans(), min_size=5, max_size=5))
def test_property_conservation_holds_through_migration(tmp_path_factory, ops, users):
    """Any Pals ledger the v1 code can produce converts with every invariant intact: each asset still sums to zero, every
    account's Sora equals its old Pals, total Sora supply equals the Pals that existed, shares do not move."""
    p = tmp_path_factory.mktemp("prop") / "e.db"
    c = v1db.connect(p); v1db.init(c)
    with v1db.tx(c):
        v1ex.ensure_markets(c, COUNTRIES); v1rewards.ensure_rules(c)
    agents = [f"a{i}" for i in range(5)]
    key = {a: (f"user:o{i % 2}" if users[i] else f"seed:{a}") for i, a in enumerate(agents)}
    for a in agents:
        v1_fund(c, a, key[a], n=3); v1_enable(c, a)
    with v1db.tx(c):
        co = v1ex.create_company(c, founder_agent_id="a0", owner_key=key["a0"], name="Kola Logistics", ticker="KOLA", market="NG", sector="logistics",
                                 description="A fictional logistics co-op.", ipo_price=100, fictional_ack=True)
    for n, (op, who, q) in enumerate(ops):
        a = agents[who]
        try:
            if op == "award":
                v1rewards.award(c, agent_id=a, rule="cross_owner_upvote", ref_type="vote", ref_id=f"v{n}", owner_key=key[a])
            elif op == "reverse":
                rw = c.execute("SELECT id FROM rewards WHERE agent_id=? AND status='issued' ORDER BY id DESC LIMIT 1", (a,)).fetchone()
                if rw:
                    v1rewards.reverse_reward(c, rw["id"], "test")
            elif op in ("buy", "rest"):
                v1ex.place_order(c, agent_id=a, owner_key=key[a], company_id=co["id"], side="buy", price=100 if op == "buy" else 90, qty=q, idem_key=f"o{n}")
            else:
                v1ex.place_order(c, agent_id=a, owner_key=key[a], company_id=co["id"], side="sell", price=105, qty=q, idem_key=f"o{n}")
        except (v1ex.ExchangeError, v1ledger.LedgerError):
            pass
    c.close()
    before = snapshot(p)
    con = db.connect(p); db.init(con)
    migration.freeze(con, "prop")
    fp = reconcile.fingerprint(con, db.PALS)
    with ledger.migrating(), db.tx(con):
        migration.convert(con)
        chk = migration.verify(con, fp)
    assert chk["ok"], chk["differences"]
    rec = reconcile.run(con, store=False)
    assert rec["ok"], rec["mismatches"]
    after = snapshot(p)
    for asset in {a for (_k, _i, a) in after}:
        assert sum(v for (_k, _i, a), v in after.items() if a == asset) == 0, asset  # conservation, every asset
    held_pals = sum(v for (k, i, a), v in before.items() if a == "PALS" and (k, i) != ("platform", "issuance"))
    assert rec["supply_sora"] == held_pals == -before[("platform", "issuance", "PALS")]
    assert {k: v for k, v in after.items() if k[2].startswith("SHR:")} == {k: v for k, v in before.items() if k[2].startswith("SHR:")}
    con.close()


# ------------------------------------------------------------------------------------------------ rules after the migration

@pytest.fixture()
def con(tmp_path):
    c = db.connect(tmp_path / "economy.db")
    db.init(c)
    with db.tx(c):
        ex.ensure_markets(c, COUNTRIES)
        rewards.ensure_rules(c)
    yield c
    c.close()


def fund(con, agent, key=None, n=6):
    for i in range(n):
        rewards.award(con, agent_id=agent, rule="accepted_post" if i < 2 else "accepted_reply", ref_type="piece", ref_id=f"{agent}-{i}", owner_key=key or f"seed:{agent}")
    rewards.award(con, agent_id=agent, rule="first_contribution", ref_type="mission", ref_id="welcome", owner_key=key or f"seed:{agent}")


def enable(con, agent):
    with db.tx(con):
        con.execute("INSERT OR REPLACE INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (agent, 1, 5000, 20000, 50, "[]", db.now()))


def founding(con, founder="s0", key="seed:s0", ticker="KOLA"):
    fund(con, founder, key)
    with db.tx(con):
        return ex.create_company(con, founder_agent_id=founder, owner_key=key, name=f"{ticker.title()} Logistics", ticker=ticker, market="NG", sector="logistics",
                                 description="A fictional logistics co-op.", ipo_price=100, fictional_ack=True, founding=True)


def test_human_account_is_created_once_on_first_visit(tmp_path, monkeypatch):
    from palavva_editorial.economy import api as eapi, service
    monkeypatch.setenv("ECONOMY_DB", str(tmp_path / "svc.db"))
    first = service.human_account("user0000000001")
    again = service.human_account("user0000000001")
    assert first["account_id"] == again["account_id"] and first["owner_kind"] == "human" and first["currency"] == "SORA"
    assert first["balance"] == {"available": 0, "reserved": 0} and "1 Pal = 1 Sora" in first["note"]["text"]
    c = service.con()
    assert c.execute("SELECT COUNT(*) n FROM accounts WHERE owner_kind='human' AND owner_id='user0000000001'").fetchone()["n"] == 1
    assert c.execute("SELECT owner_key FROM accounts WHERE owner_kind='human'").fetchone()["owner_key"] == "user:user0000000001"
    # the HTTP route is the same call, behind the service token
    from fastapi.testclient import TestClient
    from palavva_editorial import api
    monkeypatch.setattr(api, "S", dataclasses.replace(api.S, service_token="tok"))
    cl = TestClient(api.app)
    assert cl.post("/economy/humans/user0000000002/account").status_code == 401
    r = cl.post("/economy/humans/user0000000002/account", headers={"x-service-token": "tok"})
    assert r.status_code == 200 and r.json()["owner_kind"] == "human"
    assert cl.post("/economy/humans/user0000000002/account", headers={"x-service-token": "tok"}).json()["account_id"] == r.json()["account_id"]
    m = cl.get("/economy/migration", headers={"x-service-token": "tok"}).json()
    assert m["currency_state"] == "sora" and m["note"]["currency"] == "SORA"
    lim = cl.post("/economy/agents/a1/limits", headers={"x-service-token": "tok"},
                  json={"enabled": True, "max_order_pals": 300, "daily_pals": 900, "daily_orders": 5, "updated_by": "t"}).json()  # old names still accepted
    assert lim["max_order_sora"] == 300 and lim["daily_sora"] == 900
    s = cl.get("/economy/summary", headers={"x-service-token": "tok"}).json()
    assert s["currency"] == "SORA" and s["sora_invested"] == s["pals_invested"] and s["index"]["name"].startswith("Sora")
    assert eapi.router  # imported


def test_house_agents_share_the_platform_owner_for_self_trade(con):
    co = founding(con)  # founded by a house agent: its IPO order belongs to the platform owner
    for a, k in (("s1", "seed:s1"), ("s2", "seed:s2"), ("u1", "user:ada")):
        fund(con, a, k); enable(con, a)
    r = ex.place_order(con, agent_id="s1", owner_key="seed:s1", company_id=co["id"], side="buy", price=100, qty=5, idem_key="s1")
    assert r["trades"] == [] and r["order"]["status"] == "open"  # a house agent never buys a house agent's IPO
    u = ex.place_order(con, agent_id="u1", owner_key="user:ada", company_id=co["id"], side="buy", price=100, qty=10, idem_key="u1")
    assert u["trades"] and u["trades"][0]["seller"] == co["id"]  # a person's agent does
    ex.cancel_order(con, r["order"]["id"], "s1")
    # integrity: no same-owner trade was ever made
    sig = {s["key"]: s for s in policy.integrity(con)["signals"]}
    assert sig["self_trades"]["severity"] == "ok"
    assert ledger.trade_owner("seed:abc") == ledger.trade_owner("platform") == "platform" and ledger.trade_owner("user:x") == "user:x"


def test_two_house_agents_cannot_trade_and_people_get_the_same_refusal(con):
    co = founding(con)
    for a, k in (("u1", "user:ada"), ("s1", "seed:s1"), ("s2", "seed:s2")):
        fund(con, a, k); enable(con, a)
    ex.place_order(con, agent_id="u1", owner_key="user:ada", company_id=co["id"], side="buy", price=100, qty=10, idem_key="u1")
    ex.place_order(con, agent_id="u1", owner_key="user:ada", company_id=co["id"], side="sell", price=105, qty=10, idem_key="u1s")  # u1 now sells to s1
    ex.place_order(con, agent_id="s1", owner_key="seed:s1", company_id=co["id"], side="buy", price=105, qty=10, idem_key="s1b")
    assert ledger.balance(con, "agent", "s1", f"SHR:{co['id']}")["available"] == 10
    ask = ex.place_order(con, agent_id="s1", owner_key="seed:s1", company_id=co["id"], side="sell", price=104, qty=10, idem_key="s1s")
    bid = ex.place_order(con, agent_id="s2", owner_key="seed:s2", company_id=co["id"], side="buy", price=104, qty=10, idem_key="s2b")
    assert ask["trades"] == [] and bid["trades"] == [] and bid["order"]["status"] == "open"  # house agent to house agent: refused
    # Leave only the agents' own orders on the book: the IPO and s2's bid go.
    ex.cancel_order(con, con.execute("SELECT id FROM orders WHERE idem_key=?", (f"ipo:{co['id']}",)).fetchone()["id"], None)
    ex.cancel_order(con, bid["order"]["id"], "s2")
    with db.tx(con):
        ledger.issue(con, "h1", 5000, idem_key="grant-h1", rule="test_grant", ref_type="t", ref_id="h1", owner_kind="human", owner_key="user:ada")
    h = ex.place_order(con, agent_id="h1", owner_key="user:ada", company_id=co["id"], side="buy", price=104, qty=1, idem_key="h1b", owner_kind="human")
    assert h["trades"] and h["trades"][0]["seller"] == "s1"  # a person buys from a house agent
    ex.place_order(con, agent_id="u1", owner_key="user:ada", company_id=co["id"], side="buy", price=104, qty=3, idem_key="u1b2")  # from s1 too
    ex.place_order(con, agent_id="u1", owner_key="user:ada", company_id=co["id"], side="sell", price=103, qty=2, idem_key="u1s2")  # rests
    mine = ex.place_order(con, agent_id="h1", owner_key="user:ada", company_id=co["id"], side="buy", price=103, qty=1, idem_key="h1b2", owner_kind="human")
    assert mine["trades"] == [] and mine["order"]["status"] == "open"  # a person never buys from their own agent: the same refusal
    assert ex.portfolio(con, "h1", "human")["holdings"][0]["qty"] == 1
    assert reconcile.run(con)["ok"]


def test_only_town_hall_and_harbour_can_create_sora(con):
    fees = ledger.account(con, "platform", "fees")
    burn = ledger.account(con, *ledger.BURN)
    a = ledger.account(con, "agent", "x1")
    with pytest.raises(ledger.LedgerError) as e:
        with db.tx(con):
            ledger.transfer(con, kind="issue", idem_key="i1", src=fees["id"], src_bucket="available", dst=a["id"], dst_bucket="available", asset=db.SORA, amount=100)
    assert e.value.code == "NOT_A_MINT"
    with pytest.raises(ledger.LedgerError) as e:
        with db.tx(con):
            ledger.transfer(con, kind="refund", idem_key="i2", src=burn["id"], src_bucket="available", dst=a["id"], dst_bucket="available", asset=db.SORA, amount=100)
    assert e.value.code == "INSUFFICIENT"  # a platform account that is not a mint can only move what it holds
    with pytest.raises(ledger.LedgerError) as e:
        with db.tx(con):
            ledger.issue(con, "x1", 100, idem_key="i3", rule="r", ref_type="t", ref_id="1", mint=("platform", "issuance"))
    assert e.value.code == "NOT_A_MINT"  # the old Pals mint is history
    with pytest.raises(sqlite3.IntegrityError):
        con.execute("UPDATE accounts SET available=-1 WHERE id=?", (fees["id"],))  # the database refuses too
    with db.tx(con):
        ledger.issue(con, "x1", 100, idem_key="i4", rule="r", ref_type="t", ref_id="1")
        ledger.issue(con, "x1", 50, idem_key="i5", rule="r", ref_type="t", ref_id="2", mint=ledger.HARBOUR)
    assert ledger.balance(con, "platform", "town_hall")["available"] == -100 and ledger.balance(con, "platform", "harbour")["available"] == -50
    assert ledger.balance(con, "agent", "x1")["available"] == 150 and reconcile.run(con)["ok"]


def test_fees_and_clawbacks_are_burned_and_counted_as_destroyed(con):
    fund(con, "f1")
    created_before = issuance.supply(con)["created"]
    with db.tx(con):
        co = ex.create_company(con, founder_agent_id="f1", owner_key="seed:f1", name="Sahel Seeds", ticker="SAHL", market="NG", sector="agriculture",
                               description="A fictional seed co-op.", ipo_price=100, fictional_ack=True)
    assert ledger.balance(con, *ledger.BURN)["available"] == ex.LISTING_FEE
    rw = rewards.award(con, agent_id="f2", rule="accepted_post", ref_type="piece", ref_id="p", owner_key="seed:f2")
    rewards.reverse_reward(con, rw["id"], "moderation removed it")
    s = issuance.supply(con)
    assert s["destroyed"] == ex.LISTING_FEE + 10 * C and s["created"] == created_before + 10 * C
    assert s["circulating"] == s["created"] - s["destroyed"]
    held = con.execute("SELECT SUM(available+reserved) s FROM accounts WHERE asset='SORA' AND owner_kind != 'platform'").fetchone()["s"]
    assert held == s["circulating"]  # Doc 04 invariant 1: coins held = created - destroyed
    rec = reconcile.run(con)
    assert rec["ok"] and rec["destroyed_sora"] == s["destroyed"] and rec["supply_sora"] == held
    assert co["status"] == "private"


def test_town_hall_weekly_budget_from_the_growth_target_is_enforced(con):
    w = issuance.weekly(con)
    assert w["source"] == "floor" and w["budget"] == issuance.DEFAULT_FLOOR * C and w["growth"] == 0.20  # young economy: the floor
    with db.tx(con):
        con.execute("INSERT INTO switches(key, value, updated_at) VALUES ('SORA_WEEKLY_BUDGET', '60', 0)")
    ok = [rewards.award(con, agent_id=f"a{i}", rule="accepted_post", ref_type="p", ref_id=str(i)) for i in range(8)]
    assert [r["status"] for r in ok].count("issued") == 6  # 6 x 10 Sora = 60
    denied = [r for r in ok if r["status"] == "denied"]
    assert denied and all(r["reason"] == "Town Hall weekly issuance budget reached" for r in denied)
    assert policy.deny_category(denied[0]["reason"]) == "weekly_budget" and "weekly" in policy.explain(con)
    assert issuance.weekly(con)["used"] == 60 * C and issuance.weekly(con)["left"] == 0
    # the formula: next week's budget is the 20%-a-year growth of the supply that exists when the week begins
    with db.tx(con):
        con.execute("DELETE FROM switches WHERE key='SORA_WEEKLY_BUDGET'")
        ledger.issue(con, "big", 50_000_000 * C, idem_key="seed-supply", rule="test_supply", ref_type="t", ref_id="1")
    nxt = issuance.week_start() + 7 * 86400 + 3600
    supply = issuance.supply(con)["circulating"]
    w2 = issuance.weekly(con, nxt)
    assert w2["supply_at_start"] == supply and w2["source"] == "formula"
    assert w2["budget"] == math.ceil(supply * (1.2 ** (7 / 365) - 1)) > issuance.DEFAULT_FLOOR * C
    assert w2["used"] == 0
    with db.tx(con):  # growth outside the 15-25% band is clamped to it
        con.execute("INSERT INTO switches(key, value, updated_at) VALUES ('SORA_GROWTH_TARGET', '0.9', 0)")
    assert issuance.growth(con) == 0.25
    # an audited weekly-budget change sits in the policy history but is not restored through the reward-rule rollback
    with db.tx(con):
        cur = con.execute("INSERT INTO reward_policy_changes(target, before_json, after_json, reason, changed_by, created_at) VALUES ('weekly_budget','{}','{}','t','t',0)")
    with pytest.raises(policy.PolicyError) as e:
        policy.rollback(con, cur.lastrowid, by="t", reason="restore it", expected_revision=policy.revision(con))
    assert e.value.code == "NOT_RESTORABLE"


def test_issuance_paused_and_sourced_reply_retired(con):
    r = rewards.award(con, agent_id="a", rule="sourced_reply", ref_type="comment", ref_id="c1")
    assert r["status"] == "denied" and r["reason"] == "unknown or inactive rule"
    assert con.execute("SELECT active, description FROM reward_rules WHERE code='sourced_reply'").fetchone()["active"] == 0
    with pytest.raises(policy.PolicyError) as e:
        policy.validate(con, {"rules": {"sourced_reply": {"active": True}}})
    assert e.value.code == "RETIRED"
    rewards.ensure_rules(con)  # a restart never revives it
    assert con.execute("SELECT active FROM reward_rules WHERE code='sourced_reply'").fetchone()["active"] == 0


def test_new_companies_follow_doc04_and_founding_companies_keep_their_listing(con, monkeypatch):
    fund(con, "f1")
    with db.tx(con):
        new = ex.create_company(con, founder_agent_id="f1", owner_key="user:ada", name="Sahel Seeds", ticker="SAHL", market="NG", sector="agriculture",
                                description="A fictional seed co-op.", ipo_price=100, fictional_ack=True)
    assert (new["status"], new["shares_outstanding"], new["founder_shares"], new["founding"], new["listed_at"]) == ("private", 1000, 1000, 0, None)
    assert ledger.balance(con, "agent", "f1", f"SHR:{new['id']}")["available"] == 1000
    assert con.execute("SELECT COUNT(*) n FROM orders WHERE company_id=?", (new["id"],)).fetchone()["n"] == 0  # no IPO
    fund(con, "b1", "user:bo"); enable(con, "b1")
    with pytest.raises(ex.ExchangeError) as e:
        ex.place_order(con, agent_id="b1", owner_key="user:bo", company_id=new["id"], side="buy", price=100, qty=1, idem_key="x")
    assert e.value.code == "NOT_LISTED"
    with pytest.raises(ex.ExchangeError) as e:
        with db.tx(con):
            ex.list_company(con, new["id"])
    assert e.value.code == "NOT_ELIGIBLE"
    # 30 days with revenue (Phase 3 sales write 'revenue' entries; here a customer pays once a day)
    cust = None
    with db.tx(con):
        ledger.issue(con, "cust", 100 * C, idem_key="cust", rule="t", ref_type="t", ref_id="c")
        cust = ledger.account(con, "agent", "cust")["id"]
    comp = ledger.account(con, "company", new["id"])["id"]
    t0 = db.now() - 40 * 86400
    for d in range(30):
        monkeypatch.setattr(db, "now", lambda d=d: t0 + d * 86400)
        with db.tx(con):
            ledger.transfer(con, kind="revenue", idem_key=f"sale{d}", src=cust, src_bucket="available", dst=comp, dst_bucket="available", asset=db.SORA, amount=C)
        if d == 28:
            assert ex.listing_status(con, new["id"])["eligible"] is False
    monkeypatch.undo()
    assert ex.listing_status(con, new["id"])["revenue_days"] == 30
    with db.tx(con):
        listed = ex.list_company(con, new["id"])
    assert listed["status"] == "listed" and listed["shares_outstanding"] == 1000
    old = founding(con, "s9", "seed:s9", "RIFT")
    assert (old["status"], old["shares_outstanding"], old["founding"]) == ("listed", 10000, 1)
    assert reconcile.run(con)["ok"]
