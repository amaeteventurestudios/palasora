"""ISSUE-15 market intelligence read models (read-only; every figure is a query over committed rows).

* price_audit():  why prices are where they are: IPO allocations vs secondary trades, distinct prices, sold-out companies with
                  bids waiting and nobody offering, agent sell orders ever placed, and whether price discovery is on.
* ownership():    per company: holders, founder share, largest outside holder, treasury left, concentration (HHI 0-10,000).
* trade_trail():  one trade end to end: both orders (who, price, the agent's stated reason, decision id), the settlement journal
                  entries written in the same transaction, and whether shares and Sora both moved.
* recent_trades() / open_book(): tables for the admin Trades & Orders tab.
"""
from __future__ import annotations

import sqlite3

from . import db


def _mk(market: str | None) -> tuple[str, tuple]:
    return (" AND t.market=?", (market,)) if market and market != "ALL" else ("", ())


def price_audit(con: sqlite3.Connection, market: str | None = None, discovery: bool | None = None) -> dict:
    w, a = _mk(market)
    rows = con.execute(f"""SELECT t.price, t.seller_id, t.company_id, co.ipo_price FROM trades t JOIN companies co ON co.id=t.company_id WHERE 1=1{w}""", a).fetchall()
    ipo = sum(1 for r in rows if r["seller_id"] == r["company_id"])
    prices = {r["price"] for r in rows}
    at_ipo = sum(1 for r in rows if r["price"] == r["ipo_price"])
    comps = []
    for c in con.execute("SELECT * FROM companies WHERE status!='delisted'" + (" AND market=?" if market and market != "ALL" else "") + " ORDER BY ticker", a):
        treasury = con.execute("SELECT COALESCE(SUM(qty-filled),0) q FROM orders WHERE company_id=? AND account_owner_kind='company' AND side='sell' AND status IN ('open','partial')", (c["id"],)).fetchone()["q"]
        bids = con.execute("SELECT COUNT(*) n, COALESCE(SUM(qty-filled),0) q, MAX(price) p FROM orders WHERE company_id=? AND side='buy' AND status IN ('open','partial')", (c["id"],)).fetchone()
        asks = con.execute("SELECT COUNT(*) n, COALESCE(SUM(qty-filled),0) q, MIN(price) p FROM orders WHERE company_id=? AND side='sell' AND status IN ('open','partial')", (c["id"],)).fetchone()
        sec = con.execute("SELECT COUNT(*) n FROM trades WHERE company_id=? AND seller_id != company_id", (c["id"],)).fetchone()["n"]
        comps.append({"company_id": c["id"], "ticker": c["ticker"], "market": c["market"], "ipo_price": c["ipo_price"] / db.CENTS,
                      "last_price": (c["last_price"] or c["ipo_price"]) / db.CENTS, "ipo_left": treasury, "ipo_sold_out": treasury == 0,
                      "open_bids": bids["n"], "bid_qty": bids["q"], "best_bid": (bids["p"] or 0) / db.CENTS or None,
                      "open_asks": asks["n"], "ask_qty": asks["q"], "best_ask": (asks["p"] or 0) / db.CENTS or None, "secondary_trades": sec})
    agent_sells = con.execute("SELECT COUNT(*) n FROM orders WHERE account_owner_kind='agent' AND side='sell'").fetchone()["n"]
    waiting = [c for c in comps if c["ipo_sold_out"] and c["open_bids"] and not c["open_asks"]]
    if not rows:
        verdict = "No matched trades yet, so there is no traded price and the index has no value."
    elif ipo == len(rows):
        verdict = (f"All {len(rows):,} matched trades were IPO allocations bought from the companies' own offers at the fixed IPO price, and "
                   f"{'no agent has placed a sell order' if agent_sells == 0 else f'{agent_sells} agent sell orders exist but none matched'}. Prices showing the IPO price and an index of "
                   "1,000.0 are therefore correct, not a calculation error: no shares have changed hands between agents yet.")
    else:
        verdict = (f"{len(rows) - ipo:,} of {len(rows):,} matched trades were between agents (secondary market) at {len(prices)} different prices; "
                   "prices and the index follow those trades.")
    if waiting:
        verdict += (f" {len(waiting)} sold-out compan{'y has' if len(waiting) == 1 else 'ies have'} bids waiting with nobody offering shares "
                    f"({', '.join(c['ticker'] for c in waiting[:5])}).")
    if discovery is not None:
        verdict += (" Price discovery (trading rules v2) is ON: buyers may bid slightly above the last trade and founders may sell up to 1% of their shares per day into real bids."
                    if discovery else " Price discovery is OFF (v1 rules): a sold-out company's price cannot move.")
    return {"trades": len(rows), "ipo_trades": ipo, "secondary_trades": len(rows) - ipo, "distinct_prices": len(prices), "trades_at_ipo_price": at_ipo,
            "agent_sell_orders": agent_sells, "companies": comps, "waiting": len(waiting), "verdict": verdict}


def ownership(con: sqlite3.Connection, market: str | None = None) -> list[dict]:
    out = []
    for c in con.execute("SELECT * FROM companies WHERE status!='delisted'" + (" AND market=?" if market and market != "ALL" else "") + " ORDER BY ticker",
                         (market,) if market and market != "ALL" else ()):
        pos = con.execute("SELECT owner_id, qty FROM positions WHERE company_id=? AND qty>0 ORDER BY qty DESC", (c["id"],)).fetchall()
        treasury = con.execute("SELECT available+reserved s FROM accounts WHERE owner_kind='company' AND owner_id=? AND asset=?", (c["id"], f"SHR:{c['id']}")).fetchone()
        tq = treasury["s"] if treasury else 0
        total = c["shares_outstanding"]
        founder = next((p["qty"] for p in pos if p["owner_id"] == c["founder_agent_id"]), 0)
        outside = [p for p in pos if p["owner_id"] != c["founder_agent_id"]]
        shares = [p["qty"] for p in pos] + ([tq] if tq else [])
        hhi = round(sum((100 * q / total) ** 2 for q in shares)) if total else 0
        out.append({"company_id": c["id"], "ticker": c["ticker"], "market": c["market"], "holders": len(pos), "outside_holders": len(outside),
                    "founder_pct": round(100 * founder / total, 1), "treasury_pct": round(100 * tq / total, 1),
                    "top_outside_holder": outside[0]["owner_id"] if outside else None, "top_outside_pct": round(100 * outside[0]["qty"] / total, 1) if outside else 0.0, "hhi": hhi})
    return out


def recent_trades(con: sqlite3.Connection, market: str | None = None, limit: int = 500) -> list[dict]:
    w, a = _mk(market)
    return [dict(r) for r in con.execute(f"""SELECT t.id, co.ticker, t.market, t.price / {db.CENTS}.0 AS price, t.qty, t.buyer_id, t.seller_id, t.txn_id, t.created_at,
                                               CASE WHEN t.seller_id=t.company_id THEN 'ipo' ELSE 'secondary' END AS kind
                                               FROM trades t JOIN companies co ON co.id=t.company_id WHERE 1=1{w} ORDER BY t.id DESC LIMIT ?""", (*a, max(1, min(limit, 2000))))]


def trade_trail(con: sqlite3.Connection, trade_id: int) -> dict | None:
    t = con.execute("SELECT t.*, co.ticker, co.name FROM trades t JOIN companies co ON co.id=t.company_id WHERE t.id=?", (trade_id,)).fetchone()
    if not t:
        return None
    orders = {o["id"]: dict(o) for o in con.execute("SELECT id, account_owner_kind, owner_id, side, price, qty, filled, status, reason, decision_ref, created_at FROM orders WHERE id IN (?,?)",
                                                         (t["buy_order"], t["sell_order"]))}
    entries = [dict(j) for j in con.execute("""SELECT j.id, j.kind, j.asset, j.amount, fa.owner_id AS from_owner, j.from_bucket, ta.owner_id AS to_owner, j.to_bucket, j.created_at
                                                 FROM journal j JOIN accounts fa ON fa.id=j.from_account JOIN accounts ta ON ta.id=j.to_account WHERE j.txn_id=? ORDER BY j.id""", (t["txn_id"],))]
    cash = [e for e in entries if e["kind"] == "trade_cash"]
    shares = [e for e in entries if e["kind"] == "trade_shares"]
    paid = sum(e["amount"] for e in cash if e["to_owner"] == t["seller_id"])
    moved = sum(e["amount"] for e in shares if e["to_owner"] == t["buyer_id"])
    return {"trade": {**dict(t), "price": t["price"] / db.CENTS, "kind": "ipo" if t["seller_id"] == t["company_id"] else "secondary"},
            "buy_order": {**orders.get(t["buy_order"], {}), "price": orders.get(t["buy_order"], {}).get("price", 0) / db.CENTS},
            "sell_order": {**orders.get(t["sell_order"], {}), "price": orders.get(t["sell_order"], {}).get("price", 0) / db.CENTS},
            "journal": [{**e, "amount": e["amount"] / db.CENTS if e["asset"] in (db.SORA, db.PALS) else e["amount"]} for e in entries],
            "settled": paid == t["price"] * t["qty"] and moved == t["qty"],
            "settlement": f"{moved} shares to the buyer and {paid / db.CENTS:.2f} {"Pals (before the Sora conversion)" if cash and cash[0]["asset"] == db.PALS else "Sora"} to the seller in one transaction ({len(entries)} journal entries)."}
