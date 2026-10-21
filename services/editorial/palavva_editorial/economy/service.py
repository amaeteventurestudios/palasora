"""Economy service: connection management, startup initialisation and read models used by the API and the agent engine."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path

from . import db, exchange as ex, issuance, ledger, migration, reconcile, rewards

_local = threading.local()
_inited: set[str] = set()


def db_path() -> Path:
    base = Path(os.environ.get("PALAVVA_DATA_DIR", "./data")).resolve()
    return Path(os.environ.get("ECONOMY_DB", str(base / "economy.db")))


def registry_countries() -> dict[str, dict]:
    reg = Path(__file__).resolve().parents[4] / "apps" / "web" / "lib" / "i18n" / "registry.json"
    return json.loads(reg.read_text())["countries"]


def con() -> sqlite3.Connection:
    p = str(db_path())
    c = getattr(_local, "c", None)
    if c is None or getattr(_local, "p", "") != p:
        c = db.connect(p)
        _local.c, _local.p = c, p
    if p not in _inited:
        db.init(c)
        with db.tx(c):
            ex.ensure_markets(c, registry_countries())
            rewards.ensure_rules(c)
        _inited.add(p)
    return c


def owner_key_for(agent: dict) -> str:
    """Identity key: one key per human owner (user:<id>); each Palasora-operated persona keeps its own key (seed:<id>) for
    reward and integrity checks. For self-trade checks every seed key maps to the one platform owner (ledger.trade_owner)."""
    if agent.get("owner_type") == "user" and agent.get("owner_user_id"):
        return f"user:{agent['owner_user_id']}"
    return f"seed:{agent['id']}"


def summary(market: str) -> dict:
    c = con()
    mk = None if market in ("", "ALL") else market
    where, args = ("WHERE market=?", (mk,)) if mk else ("", ())
    t0 = time.time() - (time.time() % 86400)
    listed = c.execute(f"SELECT COUNT(*) n FROM companies {where + (' AND' if where else 'WHERE')} status='listed'", args).fetchone()["n"]
    tr_today = c.execute(f"SELECT COUNT(*) n FROM trades {where + (' AND' if where else 'WHERE')} created_at>=?", (*args, t0)).fetchone()["n"]
    tr_yday = c.execute(f"SELECT COUNT(*) n FROM trades {where + (' AND' if where else 'WHERE')} created_at>=? AND created_at<?", (*args, t0 - 86400, t0)).fetchone()["n"]
    invested = c.execute(f"""SELECT COALESCE(SUM(p.qty * COALESCE(co.last_price, co.ipo_price)),0) v FROM positions p JOIN companies co ON co.id=p.company_id
                             WHERE p.qty>0 AND p.owner_id NOT IN (SELECT founder_agent_id FROM companies WHERE id=p.company_id) {('AND co.market=?' if mk else '')}""", args).fetchone()["v"]
    with_listings = c.execute("SELECT COUNT(DISTINCT market) n FROM companies WHERE status='listed'").fetchone()["n"]
    with db.tx(c):
        pts = ex.compute_index(c, mk)
    idx = None
    if pts:
        last = pts[-1]["value"]; prev = pts[-2]["value"] if len(pts) > 1 else None
        idx = {"name": "Sora Market Index (SMI)", "value": last, "change_pct": ((last - prev) / prev * 100) if prev else None, "base": 1000,
               "points": [{"t": int(time.mktime(time.strptime(p["day"], "%Y-%m-%d"))), "v": p["value"]} for p in pts[-90:]]}
    else:
        idx = {"name": "Sora Market Index (SMI)", "value": None, "change_pct": None, "base": 1000, "points": []}
    halted = ex.switch_on(c, "EXCHANGE_HALTED") or bool(mk and c.execute("SELECT status FROM markets WHERE code=?", (mk,)).fetchone()["status"] == "halted")
    return {"market": market or "ALL", "markets_configured": c.execute("SELECT COUNT(*) n FROM markets").fetchone()["n"], "markets_with_listings": with_listings,
            "companies_listed": listed, "trades_today": tr_today, "trades_yesterday": tr_yday, "sora_invested": invested / db.CENTS,
            "pals_invested": invested / db.CENTS,  # pre-Sora alias of sora_invested
            "currency": db.SORA, "index": idx, "halted": halted,
            "private_companies": c.execute("SELECT COUNT(*) n FROM companies WHERE status='private'" + (" AND market=?" if mk else ""), args).fetchone()["n"],
            "listing_rule": f"New companies list after {ex.LISTING_REVENUE_DAYS} days of operations with revenue; the founding companies keep their listings.",
            "as_of": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            # v1.7: the latest MATCHED executions (real counterparties only), newest first, for the Exchange page
            "recent_trades": [dict(r) for r in c.execute(
                f"SELECT t.id, co.ticker, co.name, t.market, t.qty, t.price / {db.CENTS}.0 AS price, t.created_at FROM trades t JOIN companies co ON co.id = t.company_id "
                f"{'WHERE t.market=?' if mk else ''} ORDER BY t.created_at DESC LIMIT 8", args)]}


def markets() -> list[dict]:
    c = con()
    rows = c.execute("""SELECT m.*, (SELECT COUNT(*) FROM companies co WHERE co.market=m.code AND co.status='listed') listed,
                        (SELECT COUNT(*) FROM trades t WHERE t.market=m.code) trades,
                        (SELECT COALESCE(SUM(price*qty),0) FROM trades t WHERE t.market=m.code) volume FROM markets m ORDER BY m.name""").fetchall()
    return [dict(r) for r in rows]


def companies(market: str | None) -> list[dict]:
    c = con()
    q = "SELECT * FROM companies WHERE status != 'delisted'" + (" AND market=?" if market and market != "ALL" else "") + " ORDER BY created_at DESC"
    out = []
    for r in c.execute(q, (market,) if market and market != "ALL" else ()):
        d = dict(r)
        d["volume"] = c.execute("SELECT COALESCE(SUM(qty),0) v, COUNT(*) n FROM trades WHERE company_id=?", (r["id"],)).fetchone()["v"]
        d["trades"] = c.execute("SELECT COUNT(*) n FROM trades WHERE company_id=?", (r["id"],)).fetchone()["n"]
        d["change_pct"] = ((r["last_price"] - r["ipo_price"]) / r["ipo_price"] * 100) if r["last_price"] else None
        out.append(d)
    return out


def company(cid: str) -> dict | None:
    c = con()
    r = c.execute("SELECT * FROM companies WHERE id=? OR ticker=?", (cid, cid.upper())).fetchone()
    if not r:
        return None
    trades = [dict(t) for t in c.execute("SELECT id, price, qty, buyer_id, seller_id, created_at FROM trades WHERE company_id=? ORDER BY id DESC LIMIT 50", (r["id"],))]
    holders = [dict(h) for h in c.execute("SELECT owner_id, qty FROM positions WHERE company_id=? AND qty>0 ORDER BY qty DESC LIMIT 20", (r["id"],))]
    return {"company": dict(r), "book": ex.book(c, r["id"]), "candles": ex.candles(c, r["id"], 86400), "candles_hourly": ex.candles(c, r["id"], 3600, 200),
            "trades": trades, "holders": holders}


def _conversion(c: sqlite3.Connection, owner_kind: str, owner_id: str) -> dict | None:
    """The one labelled Pals-to-Sora line for this account, if it held Pals."""
    r = c.execute("""SELECT j.amount, j.created_at FROM journal j JOIN accounts a ON a.id=j.to_account
                     WHERE a.owner_kind=? AND a.owner_id=? AND a.asset=? AND j.rule=? AND j.kind='issue'""", (owner_kind, owner_id, db.SORA, ledger.MIGRATION_RULE)).fetchone()
    return {"pals": r["amount"], "sora": r["amount"], "at": r["created_at"], "rate": "1 Pal = 1 Sora"} if r else None


def migration_note(c: sqlite3.Connection | None = None) -> dict:
    c = c or con()
    st = db.currency_state(c)
    rec = c.execute("SELECT finished_at FROM migrations WHERE name=? AND status='done'", (migration.NAME,)).fetchone()
    return {"currency": db.SORA, "state": st, "converted_at": rec["finished_at"] if rec else None, "rate": "1 Pal = 1 Sora",
            "text": ("Pals became Sora at 1 Pal = 1 Sora. Every balance was converted once, checked against the ledger, and nobody lost a "
                     "balance or a share. Your Pals history stays readable.")}


def _wallet(c: sqlite3.Connection, owner_kind: str, owner_id: str) -> dict:
    return {"currency": db.SORA, "balance": ledger.balance(c, owner_kind, owner_id), "history": ledger.history(c, owner_kind, owner_id),
            "conversion": _conversion(c, owner_kind, owner_id), "pals_history": ledger.history(c, owner_kind, owner_id, db.PALS, 50)}


def wallet(agent_id: str) -> dict:
    c = con()
    rw = [dict(x) for x in c.execute("SELECT id, rule, ref_type, ref_id, amount, status, reason, day, created_at FROM rewards WHERE agent_id=? ORDER BY id DESC LIMIT 100", (agent_id,))]
    return {**_wallet(c, "agent", agent_id), "rewards": rw, "lifetime_earned": ex.lifetime_earned(c, agent_id),
            "rules": [dict(r) for r in c.execute("SELECT * FROM reward_rules ORDER BY amount DESC")]}


def human_account(user_id: str) -> dict:
    """Every person gets a Sora account the first time they visit (lazy, idempotent: a second call returns the same account)."""
    if not user_id or len(user_id) > 64:
        raise ValueError("bad user id")
    c = con()
    with db.tx(c):
        a = ledger.account(c, "human", user_id, db.SORA, f"user:{user_id}")
    return {"account_id": a["id"], "owner_kind": "human", "owner_id": user_id, "created_at": a["created_at"], **_wallet(c, "human", user_id),
            "note": migration_note(c)}


def portfolio(agent_id: str, owner_kind: str = "agent") -> dict:
    c = con()
    pf = ex.portfolio(c, agent_id, owner_kind)
    pf["orders"] = [dict(o) for o in c.execute("""SELECT o.*, co.ticker, co.name FROM orders o JOIN companies co ON co.id=o.company_id WHERE owner_id=?
                                                   ORDER BY o.id DESC LIMIT 50""", (agent_id,))]
    pf["decisions"] = [dict(d) for d in c.execute("SELECT * FROM decisions WHERE agent_id=? ORDER BY id DESC LIMIT 50", (agent_id,))]
    lim = c.execute("SELECT * FROM trading_limits WHERE agent_id=?", (agent_id,)).fetchone()
    pf["limits"] = dict(lim) if lim else None
    pf["company"] = next((dict(x) for x in c.execute("SELECT * FROM companies WHERE founder_agent_id=? AND status!='delisted'", (agent_id,))), None)
    return pf


def supply_summary(c: sqlite3.Connection) -> dict:
    s = issuance.supply(c)
    burned = c.execute("SELECT COALESCE(SUM(available),0) s FROM accounts WHERE owner_kind='platform' AND owner_id='burn' AND asset=?", (db.SORA,)).fetchone()["s"]
    mints = {r["owner_id"]: -r["available"] for r in c.execute("SELECT owner_id, available FROM accounts WHERE owner_kind='platform' AND owner_id IN ('town_hall','harbour') AND asset=?", (db.SORA,))}
    conv = c.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE asset=? AND kind='issue' AND rule=?", (db.SORA, ledger.MIGRATION_RULE)).fetchone()["s"]
    humans = c.execute("SELECT COUNT(*) n FROM accounts WHERE owner_kind='human' AND asset=?", (db.SORA,)).fetchone()["n"]
    return {"currency": db.SORA, "created": s["created"] / db.CENTS, "destroyed": s["destroyed"] / db.CENTS, "circulating": s["circulating"] / db.CENTS,
            "burn_account": burned / db.CENTS, "by_mint": {k: v / db.CENTS for k, v in mints.items()}, "converted_from_pals": conv / db.CENTS, "human_accounts": humans}


def weekly_budget(c: sqlite3.Connection) -> dict:
    w = issuance.weekly(c)
    return {**w, **{k: w[k] / db.CENTS for k in ("budget", "used", "left", "supply_at_start", "formula_budget", "floor")}}


def admin_stats(days: int = 30) -> dict:
    c = con()
    since = time.time() - days * 86400
    issuance = [dict(r) for r in c.execute("""SELECT day, rule, SUM(CASE WHEN status='issued' THEN amount ELSE 0 END) issued, SUM(status='denied') denied,
                                              SUM(status='reversed') reversed FROM rewards WHERE created_at>=? GROUP BY day, rule ORDER BY day""", (since,))]
    trades = [dict(r) for r in c.execute("""SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') day, market, COUNT(*) n, SUM(qty) shares, SUM(price*qty) pals,
                                            SUM(CASE WHEN buyer_id IN (SELECT owner_id FROM accounts WHERE owner_key LIKE 'user:%') OR seller_id IN (SELECT owner_id FROM accounts WHERE owner_key LIKE 'user:%') THEN 1 ELSE 0 END) user_involved
                                            FROM trades WHERE created_at>=? GROUP BY day, market ORDER BY day""", (since,))]
    orders = [dict(r) for r in c.execute("""SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') day, side, status, COUNT(*) n FROM orders WHERE created_at>=?
                                            AND account_owner_kind='agent' GROUP BY day, side, status ORDER BY day""", (since,))]
    rejects = [dict(r) for r in c.execute("SELECT reject_reason, COUNT(*) n FROM orders WHERE status IN ('rejected','cancelled') GROUP BY reject_reason ORDER BY n DESC LIMIT 10")]
    recs = [dict(r) for r in c.execute("SELECT * FROM reconciliations ORDER BY id DESC LIMIT 30")]
    top = [dict(r) for r in c.execute("""SELECT agent_id, SUM(amount) earned, COUNT(*) n FROM rewards WHERE status='issued' AND created_at>=? GROUP BY agent_id ORDER BY earned DESC LIMIT 15""", (since,))]
    sup = supply_summary(c)
    switches = {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM switches")}
    flows = [dict(r) for r in c.execute("""SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') day,
               SUM(CASE WHEN kind='issue' AND rule != ? THEN amount ELSE 0 END) issued, SUM(CASE WHEN kind='reverse' THEN amount ELSE 0 END) reversed,
               SUM(CASE WHEN kind='fee' THEN amount ELSE 0 END) fees, SUM(CASE WHEN kind='trade_cash' THEN amount ELSE 0 END) traded
               FROM journal WHERE created_at>=? AND asset IN ('SORA','PALS') GROUP BY day ORDER BY day""", (ledger.MIGRATION_RULE, since))]
    supply_before = issuance.supply(c, before=since)["circulating"]
    bal = [r["available"] for r in c.execute("SELECT available FROM accounts WHERE owner_kind='agent' AND asset=?", (db.SORA,))]
    buckets = [("0", 0, 0), ("1-24", 100, 2499), ("25-49", 2500, 4999), ("50-99", 5000, 9999), ("100-249", 10000, 24999), ("250+", 25000, 10**12)]
    balances = [{"label": l, "value": sum(1 for b in bal if lo <= b <= hi)} for l, lo, hi in buckets]
    by_agent_rule = [dict(r) for r in c.execute("""SELECT agent_id, rule, COUNT(*) n FROM rewards WHERE status='issued' AND created_at>=?
                     AND agent_id IN (SELECT agent_id FROM rewards WHERE status='issued' AND created_at>=? GROUP BY agent_id ORDER BY SUM(amount) DESC LIMIT 12)
                     GROUP BY agent_id, rule""", (since, since))]
    comps = companies("ALL")
    holders = c.execute("SELECT COUNT(DISTINCT owner_id) n FROM positions p JOIN companies co ON co.id=p.company_id WHERE p.qty>0 AND p.owner_id != co.founder_agent_id").fetchone()["n"]
    return {"issuance": issuance, "trades": trades, "orders": orders, "rejects": rejects, "reconciliations": recs, "top_earners": top,
            "supply": round(sup["circulating"] * db.CENTS), "supply_detail": sup, "weekly_budget": weekly_budget(c),
            "migration": migration.status(c), "currency": db.SORA, "switches": switches, "markets": markets(), "flows": flows, "supply_before": supply_before,
            "balances": balances, "by_agent_rule": by_agent_rule, "companies": comps, "investors": holders}


def run_reconcile() -> dict:
    return reconcile.run(con())
