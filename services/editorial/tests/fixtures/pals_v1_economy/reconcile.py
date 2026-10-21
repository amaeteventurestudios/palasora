"""Daily/on-demand reconciliation (W49, VA-08, VA-09). Read-only checks, result stored in `reconciliations`.

1. Every cached account bucket equals the sum of its journal movements (rebuild from scratch).
2. Conservation: for every asset, sum(available + reserved) over ALL accounts is 0 (issuance/mint accounts hold the negative).
3. Reservations: each account's reserved bucket equals the reserved_left of its open orders.
4. Positions: each position qty equals the holder's share balance (available + reserved).
5. No negative non-platform balance (also enforced by CHECK constraints).
A mismatch never triggers silent rebalancing: it is recorded for a human (Command Center -> Pals / Exchange).
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict

from . import db


def run(con: sqlite3.Connection, store: bool = True) -> dict:
    mism: list[dict] = []
    calc: dict[tuple[int, str], int] = defaultdict(int)
    for j in con.execute("SELECT from_account, from_bucket, to_account, to_bucket, amount FROM journal"):
        calc[(j["from_account"], j["from_bucket"])] -= j["amount"]
        calc[(j["to_account"], j["to_bucket"])] += j["amount"]
    accts = con.execute("SELECT * FROM accounts").fetchall()
    supply: dict[str, int] = defaultdict(int)
    for a in accts:
        for b in ("available", "reserved"):
            if a[b] != calc.get((a["id"], b), 0):
                mism.append({"check": "journal_rebuild", "account": a["id"], "bucket": b, "cached": a[b], "journal": calc.get((a["id"], b), 0)})
        supply[a["asset"]] += a["available"] + a["reserved"]
        if a["owner_kind"] != "platform" and (a["available"] < 0 or a["reserved"] < 0):
            mism.append({"check": "negative", "account": a["id"]})
    for asset, total in supply.items():
        if total != 0:
            mism.append({"check": "conservation", "asset": asset, "sum": total})
    res: dict[tuple[str, str, str], int] = defaultdict(int)
    for o in con.execute("SELECT account_owner_kind k, owner_id, side, company_id, reserved_left FROM orders WHERE status IN ('open','partial')"):
        asset = db.PALS if o["side"] == "buy" else f"SHR:{o['company_id']}"
        res[(o["k"], o["owner_id"], asset)] += o["reserved_left"]
    for a in accts:
        if a["owner_kind"] in ("agent", "company") and a["reserved"] != res.get((a["owner_kind"], a["owner_id"], a["asset"]), 0):
            mism.append({"check": "reservation", "account": a["id"], "reserved": a["reserved"], "open_orders": res.get((a["owner_kind"], a["owner_id"], a["asset"]), 0)})
    for p in con.execute("SELECT owner_id, company_id, qty FROM positions"):
        b = con.execute("SELECT available+reserved s FROM accounts WHERE owner_kind='agent' AND owner_id=? AND asset=?", (p["owner_id"], f"SHR:{p['company_id']}")).fetchone()
        if b and b["s"] != p["qty"]:
            mism.append({"check": "position", "owner": p["owner_id"], "company": p["company_id"], "position": p["qty"], "balance": b["s"]})
    issued = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='issue'").fetchone()["s"]
    reversed_ = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='reverse'").fetchone()["s"]
    out = {"ok": not mism, "accounts": len(accts), "journal_rows": con.execute("SELECT COUNT(*) n FROM journal").fetchone()["n"], "mismatches": mism[:200],
           "issued_pals": issued, "reversed_pals": reversed_, "supply_pals": issued - reversed_, "ran_at": db.now()}
    if store:
        with db.tx(con):
            con.execute("INSERT INTO reconciliations(ran_at, ok, accounts, journal_rows, mismatches, supply_pals, issued_pals) VALUES (?,?,?,?,?,?,?)",
                        (out["ran_at"], int(out["ok"]), out["accounts"], out["journal_rows"], json.dumps(out["mismatches"]), out["supply_pals"], issued))
    return out
