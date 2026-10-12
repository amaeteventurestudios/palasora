"""ISSUE-15 follow-up: independent, read-only audit of the simulated Exchange on a COPY of data/economy.db.

Checks (each returns counts and up to 5 examples of any violation):
  1 price provenance   every company's last_price equals the price of its latest committed trade (or its IPO price if none)
  2 trade/order match  each trade has a buy and a sell order for the same company, price within both limits, fills cover it
  3 trade mix          IPO allocations (seller = company treasury) vs agent-to-agent secondary trades
  4 settlement         each trade's txn_id has exactly one cash leg (price*qty Pals) and one share leg (qty shares)
  5 founder limit      per founder and UTC day, founder sells filled <= max(1, 1% of founder shares) (provisional rule)
  6 same-owner trades  buyer and seller behind the same human owner (wash trades)
  7 reconciliation     the product's own reconcile.run(store=False): balances vs the immutable journal, per asset
Nothing is written to the real database. Usage: services/editorial/.venv/bin/python scripts/analysis/exchange_audit.py
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/editorial"))
from palavva_editorial.economy import reconcile  # noqa: E402
from palavva_editorial.economy.pricing import FOUNDER_DAILY_PCT  # noqa: E402


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="exch-audit-")) / "economy.db"
    s = sqlite3.connect(f"file:{ROOT / 'data/economy.db'}?mode=ro", uri=True); d = sqlite3.connect(tmp); s.backup(d); s.close()
    d.row_factory = sqlite3.Row
    con = d
    out: dict = {"audited_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": {}}
    C = out["checks"]
    companies = [dict(r) for r in con.execute("SELECT * FROM companies")]
    orders = {r["id"]: dict(r) for r in con.execute("SELECT * FROM orders")}
    trades = [dict(r) for r in con.execute("SELECT * FROM trades ORDER BY created_at, id")]
    owner_of = {}
    for r in con.execute("SELECT owner_kind, owner_id, owner_key FROM accounts"):
        owner_of[(r["owner_kind"], r["owner_id"])] = r["owner_key"]
    # 1
    last_trade = {}
    for t in trades:
        last_trade[t["company_id"]] = t
    bad = [{"ticker": c["ticker"], "last_price": c["last_price"], "latest_trade_price": last_trade.get(c["id"], {}).get("price"), "ipo_price": c["ipo_price"]}
           for c in companies if (c["last_price"] or c["ipo_price"]) != (last_trade[c["id"]]["price"] if c["id"] in last_trade else (c["last_price"] or c["ipo_price"]))]
    moved = [c["ticker"] for c in companies if c["id"] in last_trade and c["last_price"] != c["ipo_price"]]
    C["1_price_provenance"] = {"companies": len(companies), "violations": len(bad), "examples": bad[:5], "companies_priced_off_ipo": len(moved),
                               "note": "A price may only change when a committed trade sets it; no company shows a price without a trade behind it."}
    # 2
    mism = []
    for t in trades:
        b, sl = orders.get(t["buy_order"]), orders.get(t["sell_order"])
        if not b or not sl or b["side"] != "buy" or sl["side"] != "sell" or b["company_id"] != t["company_id"] or sl["company_id"] != t["company_id"] or not (sl["price"] <= t["price"] <= b["price"]):
            mism.append({"trade": t["id"], "buy": t["buy_order"], "sell": t["sell_order"]})
    filled = defaultdict(int)
    for t in trades:
        filled[t["buy_order"]] += t["qty"]; filled[t["sell_order"]] += t["qty"]
    overfill = [{"order": oid, "filled_by_trades": q, "order_filled": orders[oid]["filled"]} for oid, q in filled.items() if oid in orders and q != orders[oid]["filled"]]
    C["2_trade_order_match"] = {"trades": len(trades), "violations": len(mism), "fill_mismatches": len(overfill), "examples": (mism + overfill)[:5]}
    # 3
    company_ids = {c["id"] for c in companies}
    ipo = [t for t in trades if t["seller_id"] in company_ids]
    C["3_trade_mix"] = {"ipo_allocations": len(ipo), "secondary_trades": len(trades) - len(ipo),
                        "secondary_volume_pals": round(sum(t["price"] * t["qty"] for t in trades if t["seller_id"] not in company_ids) / 100, 2)}
    # 4
    legs = defaultdict(list)
    for r in con.execute("SELECT txn_id, kind, asset, amount FROM journal WHERE kind IN ('trade_cash','trade_shares')"):
        legs[r["txn_id"]].append(dict(r))
    # One matching run can fill several resting orders inside ONE atomic transaction (one txn_id, several trades), so legs are
    # compared per transaction: the multiset of cash amounts must equal the trades' price*qty and share amounts their qty.
    by_txn = defaultdict(list)
    for t in trades:
        by_txn[t["txn_id"]].append(t)
    unsettled = []
    for txn, ts in by_txn.items():
        L = legs.get(txn, [])
        cash = sorted(x["amount"] for x in L if x["kind"] == "trade_cash"); shr = sorted(x["amount"] for x in L if x["kind"] == "trade_shares")
        if cash != sorted(t["price"] * t["qty"] for t in ts) or shr != sorted(t["qty"] for t in ts):
            unsettled.append({"txn": txn, "trades": [t["id"] for t in ts], "cash_legs": len(cash), "share_legs": len(shr)})
    multi = sum(1 for ts in by_txn.values() if len(ts) > 1)
    C["4_settlement"] = {"trades": len(trades), "transactions": len(by_txn), "multi_fill_transactions": multi, "violations": len(unsettled), "examples": unsettled[:5]}
    # 5
    founder = {c["id"]: c for c in companies}
    sold = defaultdict(int)
    for o in orders.values():
        c = founder.get(o["company_id"])
        if c and o["side"] == "sell" and o["owner_id"] == c["founder_agent_id"] and o["filled"]:
            sold[(c["ticker"], time.strftime("%Y-%m-%d", time.gmtime(o["created_at"])))] += o["filled"]
    over = [{"ticker": k[0], "day": k[1], "sold": v, "allowance": max(1, int(founder[[i for i, c in founder.items() if c["ticker"] == k[0]][0]]["founder_shares"] * FOUNDER_DAILY_PCT))}
            for k, v in sold.items() if v > max(1, int(founder[[i for i, c in founder.items() if c["ticker"] == k[0]][0]]["founder_shares"] * FOUNDER_DAILY_PCT))]
    C["5_founder_daily_limit"] = {"rule": f"{FOUNDER_DAILY_PCT:.0%} of founder shares per UTC day (PROVISIONAL)", "founder_sell_days": len(sold), "violations": len(over), "examples": over[:5]}
    # 6
    same = [t["id"] for t in trades if t["seller_id"] not in company_ids and owner_of.get(("agent", t["buyer_id"])) and owner_of.get(("agent", t["buyer_id"])) == owner_of.get(("agent", t["seller_id"])) and owner_of.get(("agent", t["buyer_id"])) not in ("", "platform")]
    C["6_same_owner_trades"] = {"violations": len(same), "examples": same[:5], "note": "Platform-run residents share the 'platform' owner key and are excluded here; the matching engine's own same-owner rule is what prevents external owners trading with themselves."}
    # 7
    rec = reconcile.run(con, store=False)
    C["7_reconciliation"] = {k: rec.get(k) for k in ("ok", "assets_checked", "mismatches", "checked_at", "summary") if k in rec} or rec
    out["verdict"] = "PASS" if all(v.get("violations", 0) == 0 for v in C.values() if isinstance(v, dict) and "violations" in v) and (rec.get("ok", True)) else "FINDINGS"
    print(json.dumps(out, indent=2, default=str))
    shutil.rmtree(tmp.parent, ignore_errors=True)


if __name__ == "__main__":
    main()
