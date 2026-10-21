"""Supply contracts: a record of their own (Doc 04 section 7; Doc 06 sections 10 and 16).

A contract names the seller, the buyer, the good, a daily quantity, the price and the days it runs. Each morning (06:00)
the seller dispatches the day's quantity; the buyer pays on dispatch. A short delivery or an unpaid one is a breach:
it is counted on the contract and recorded as a J0 candidate violation (no penalty in Phase 3). Three breaches end it.

Contracts between two house agents are allowed and marked `related_party`: the self-trade rule covers Market Hall
order matching (price discovery); a supply contract is a bilateral record with its terms in the open.
"""
from __future__ import annotations

import json

from .. import ledger
from . import delivery, goods
from .params import C

BREACH_LIMIT = 3


def sign(w, *, seller, buyer, good: str, qty: int, price: int, days: int) -> str:
    cid = f"k{w.seq():07d}"
    related = ledger.trade_owner(w.agents[seller.owner].owner_key) == ledger.trade_owner(w.agents[buyer.owner].owner_key)
    w.con.execute("""INSERT INTO contracts(id, seller, buyer, good, qty_per_day, price, start_day, end_day, terms, status, related_party)
                     VALUES (?,?,?,?,?,?,?,?,?, 'active', ?)""",
                  (cid, seller.id, buyer.id, good, qty, price, w.day + 1, w.day + days,
                   json.dumps({"payment": "on dispatch", "delivery": "06:00 daily", "breach_limit": BREACH_LIMIT}), int(related)))
    w.event("contract_signed", [seller.owner, buyer.owner, seller.id, buyer.id],
            f"{buyer.id} will buy {qty} {good} a day from {seller.id} at {price / C:.2f} Sora for {days} days", visibility="town", refs={"contract": cid})
    seller.last_change_day = buyer.last_change_day = w.day
    return cid


def violation(w, *, rule: str, accused: str, detecting: str, evidence: dict) -> int:
    cur = w.con.execute("INSERT INTO violations(rule, accused, detecting_rule, evidence, opened_tick) VALUES (?,?,?,?,?)",
                        (rule, accused, detecting, json.dumps(evidence, sort_keys=True), w.tick))
    return cur.lastrowid


def dispatch_day(w) -> None:
    con = w.con
    for k in con.execute("SELECT * FROM contracts WHERE status='active' ORDER BY id").fetchall():
        if w.day > k["end_day"]:
            con.execute("UPDATE contracts SET status='ended' WHERE id=?", (k["id"],))
            continue
        if w.day < k["start_day"]:
            continue
        s, b = w.biz[k["seller"]], w.biz[k["buyer"]]
        if s.status != "open" or b.status != "open":
            con.execute("UPDATE contracts SET status='ended' WHERE id=?", (k["id"],))
            continue
        qty = k["qty_per_day"]
        have = goods.free(con, s.holder, k["good"])
        cash = w.bal(b.acct)
        if cash < k["price"] * qty:
            from .business import top_up
            top_up(w, b, k["price"] * qty - cash)
            cash = w.bal(b.acct)
        send = min(qty, have, cash // k["price"] if k["price"] else qty)
        if send > 0:
            amt = k["price"] * send
            jid = w.pay(b.acct, s.acct, amt, kind="revenue", rule="contract", ref_type="contract", ref_id=k["id"])
            b.day["costs"] = b.day.get("costs", 0) + amt
            b.day["inputs"] = b.day.get("inputs", 0) + amt
            s.day["revenue"] = s.day.get("revenue", 0) + amt
            s.day["sold"] = s.day.get("sold", 0) + send
            delivery.dispatch(w, src=s.holder, dst=b.holder, good=k["good"], qty=send, payer=b.acct, ref_type="contract", ref_id=k["id"])
        con.execute("UPDATE contracts SET due=due+?, delivered=delivered+? WHERE id=?", (qty, send, k["id"]))
        if send < qty:
            at_fault = s if have < qty else b
            why = "seller short of stock" if at_fault is s else "buyer could not pay"
            breaches = k["breaches"] + 1
            con.execute("UPDATE contracts SET breaches=?, status=? WHERE id=?", (breaches, "breached" if breaches >= BREACH_LIMIT else "active", k["id"]))
            vid = violation(w, rule="contract_delivery", accused=at_fault.id, detecting="contracts.dispatch_day",
                            evidence={"contract": k["id"], "due": qty, "sent": send, "day": w.day})
            w.event("contract_breached", [s.owner, b.owner, s.id, b.id], f"Contract {k['id']}: {send} of {qty} {k['good']} sent ({why})",
                    visibility="owner", refs={"contract": k["id"], "violation": vid})
            if w.metrics is not None:
                w.metrics.count("contract_short", qty - send)


def active_for(w, biz_id: str, side: str) -> list:
    col = "seller" if side == "seller" else "buyer"
    return w.con.execute(f"SELECT * FROM contracts WHERE {col}=? AND status='active' ORDER BY id", (biz_id,)).fetchall()
