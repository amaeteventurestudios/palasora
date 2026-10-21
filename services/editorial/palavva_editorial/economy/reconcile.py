"""Daily/on-demand reconciliation (W49, VA-08, VA-09; Phase 2). Read-only checks, result stored in `reconciliations`.

1. Every cached account bucket equals the sum of its journal movements (rebuild from scratch).
2. Conservation: for every asset, sum(available + reserved) over ALL accounts is 0 (the mints hold the negative).
3. Reservations: each account's reserved bucket equals the reserved_left of its open orders (Exchange and Market Hall).
4. Positions: each position qty equals the holder's share balance (available + reserved).
5. No negative balance outside a mint (also enforced by CHECK constraints).
6. Phase 2: no Pals moved after the ledger switched to Sora (except the migration's own entries).
Supply (Doc 04 section 5, invariant 1): Sora held = Sora created by the mints minus Sora destroyed (back to a mint, or
to platform:burn). A mismatch never triggers silent rebalancing: it is recorded for a human (Command Center -> Sora).

`fingerprint()` is the migration's evidence: balances per account, share balances per company, open orders and totals,
plus a SHA-256 over a canonical form, so two states can be compared by one line.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from collections import defaultdict

from . import db, issuance
from .ledger import MIGRATION_RULE, is_mint


def run(con: sqlite3.Connection, store: bool = True) -> dict:
    mism: list[dict] = []
    calc: dict[tuple[int, str], int] = defaultdict(int)
    for j in con.execute("SELECT from_account, from_bucket, to_account, to_bucket, amount FROM journal"):
        calc[(j["from_account"], j["from_bucket"])] -= j["amount"]
        calc[(j["to_account"], j["to_bucket"])] += j["amount"]
    accts = con.execute("SELECT * FROM accounts").fetchall()
    total: dict[str, int] = defaultdict(int)
    for a in accts:
        for b in ("available", "reserved"):
            if a[b] != calc.get((a["id"], b), 0):
                mism.append({"check": "journal_rebuild", "account": a["id"], "bucket": b, "cached": a[b], "journal": calc.get((a["id"], b), 0)})
        total[a["asset"]] += a["available"] + a["reserved"]
        if not is_mint(a) and (a["available"] < 0 or a["reserved"] < 0):
            mism.append({"check": "negative", "account": a["id"], "owner": f"{a['owner_kind']}:{a['owner_id']}", "asset": a["asset"]})
    for asset, t in total.items():
        if t != 0:
            mism.append({"check": "conservation", "asset": asset, "sum": t})
    res: dict[tuple[str, str, str], int] = defaultdict(int)
    for o in con.execute("SELECT id, account_owner_kind k, owner_id, side, company_id, reserved_left FROM orders WHERE status IN ('open','partial')"):
        if o["side"] == "buy":
            r = con.execute("SELECT asset FROM journal WHERE idem_key=?", (f"reserve:{o['id']}",)).fetchone()
            asset = r["asset"] if r else db.SORA
        else:
            asset = f"SHR:{o['company_id']}"
        res[(o["k"], o["owner_id"], asset)] += o["reserved_left"]
    # Phase 3: Market Hall goods orders reserve Sora for a buy (the goods side is checked by town.market.check_reservations)
    for o in con.execute("SELECT holder, reserved_left FROM goods_orders WHERE side='buy' AND status IN ('open','partial')"):
        k, oid = o["holder"].split(":", 1)
        res[(k, oid, db.SORA)] += o["reserved_left"]
    for a in accts:
        if a["owner_kind"] in ("agent", "company", "human") and a["reserved"] != res.get((a["owner_kind"], a["owner_id"], a["asset"]), 0):
            mism.append({"check": "reservation", "account": a["id"], "reserved": a["reserved"], "open_orders": res.get((a["owner_kind"], a["owner_id"], a["asset"]), 0)})
    for p in con.execute("SELECT owner_id, company_id, qty FROM positions"):
        b = con.execute("SELECT SUM(available+reserved) s FROM accounts WHERE owner_kind IN ('agent','human') AND owner_id=? AND asset=?",
                        (p["owner_id"], f"SHR:{p['company_id']}")).fetchone()
        if b and b["s"] is not None and b["s"] != p["qty"]:
            mism.append({"check": "position", "owner": p["owner_id"], "company": p["company_id"], "position": p["qty"], "balance": b["s"]})
    state = db.currency_state(con)
    since = float(db.meta(con, "currency_since", "0") or 0)
    if state == "sora":
        moved = con.execute("SELECT COUNT(*) n FROM journal WHERE asset=? AND rule != ? AND created_at > ?", (db.PALS, MIGRATION_RULE, since)).fetchone()["n"]
        if moved:
            mism.append({"check": "pals_moved_after_sora", "entries": moved})
    sup = issuance.supply(con)
    pals_issued = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='issue' AND asset=?", (db.PALS,)).fetchone()["s"]
    pals_reversed = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='reverse' AND asset=?", (db.PALS,)).fetchone()["s"]
    out = {"ok": not mism, "accounts": len(accts), "journal_rows": con.execute("SELECT COUNT(*) n FROM journal").fetchone()["n"], "mismatches": mism[:200],
           "currency": db.SORA if state == "sora" else db.PALS, "currency_state": state,
           "issued_sora": sup["created"], "destroyed_sora": sup["destroyed"], "supply_sora": sup["circulating"],
           "legacy_pals": {"issued": pals_issued, "reversed": pals_reversed},
           # Pre-Sora field names, kept for older clients: they now carry the Sora figures.
           "issued_pals": sup["created"], "reversed_pals": sup["destroyed"], "supply_pals": sup["circulating"], "ran_at": db.now()}
    if store:
        with db.tx(con):
            con.execute("INSERT INTO reconciliations(ran_at, ok, accounts, journal_rows, mismatches, supply_pals, issued_pals) VALUES (?,?,?,?,?,?,?)",
                        (out["ran_at"], int(out["ok"]), out["accounts"], out["journal_rows"], json.dumps(out["mismatches"]), out["supply_sora"], out["issued_sora"]))
    return out


def _digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def fingerprint(con: sqlite3.Connection, coin: str | None = None) -> dict:
    """Balances per account (one coin), share balances per company and holder, open orders, and totals.

    `coin` picks the coin (PALS before the migration, SORA after; default: the ledger's current coin). Mints and the
    conversion account are listed under `platform` and left out of `balances`, so the "before" Pals balances and the
    "after" Sora balances of the same accounts can be compared one to one: `money_sha256` is equal exactly when every
    account holds the same amount of the new coin as it held of the old one."""
    coin = coin or (db.SORA if db.currency_state(con) == "sora" else db.PALS)
    balances: dict[str, int] = {}
    platform: dict[str, int] = {}
    for a in con.execute("SELECT * FROM accounts WHERE asset=? ORDER BY owner_kind, owner_id", (coin,)):
        key = f"{a['owner_kind']}:{a['owner_id']}"
        amt = a["available"] + a["reserved"]
        if is_mint(a) or (a["owner_kind"] == "platform" and a["owner_id"] == "conversion"):
            platform[key] = amt
        elif amt:
            balances[key] = amt
    shares: dict[str, dict[str, int]] = defaultdict(dict)
    for a in con.execute("SELECT * FROM accounts WHERE asset LIKE 'SHR:%' ORDER BY asset, owner_kind, owner_id"):
        amt = a["available"] + a["reserved"]
        if is_mint(a):
            platform[f"{a['owner_kind']}:{a['owner_id']}"] = amt
        elif amt:
            shares[a["asset"][4:]][f"{a['owner_kind']}:{a['owner_id']}"] = amt
    orders = [dict(o) for o in con.execute("SELECT id, side, company_id, status, qty, filled, reserved_left FROM orders WHERE status IN ('open','partial') ORDER BY id")]
    companies = {r["id"]: {"shares_outstanding": r["shares_outstanding"], "status": r["status"]} for r in con.execute("SELECT id, shares_outstanding, status FROM companies")}
    totals = {"accounts_with_balance": len(balances), "money_total": sum(balances.values()), "share_holdings": sum(len(v) for v in shares.values()),
              "shares_total": sum(sum(v.values()) for v in shares.values()), "open_orders": len(orders), "companies": len(companies)}
    fp = {"coin": coin, "balances": balances, "platform": platform, "shares": dict(shares), "open_orders": orders, "companies": companies, "totals": totals}
    fp["money_sha256"] = _digest(balances)
    fp["shares_sha256"] = _digest(dict(shares))
    fp["sha256"] = _digest({k: fp[k] for k in ("balances", "shares", "open_orders", "companies")})
    return fp
