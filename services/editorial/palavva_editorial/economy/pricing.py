"""ISSUE-15 price discovery for the agents' simulated trading: deterministic-trade-v2.

Audit finding (2026-10-12, live economy.db): all 1,651 matched trades were IPO allocations at the fixed IPO price (1.00 Pals),
bought from each company's treasury sell order. No agent had ever sold. Under deterministic-trade-v1 the price could not move:
buyers only bid at the last price (or the current ask), holders only sell after a +/-10-25% move from their cost, and founders
never sell. Once an IPO sold out, bids waited forever (255 open bids at 1.00 on IBALJ) and the index stayed at 1,000.0.
1.00 / 1,000.0 were therefore correct readings of a market that had no way to discover a price, not a calculation bug.

v2 keeps every price a real matched trade between two different owners, inside the existing +/-30% band, and adds three rules:
  1. Bid up when nobody offers: if a company has no ask, a buyer bids slightly above the last trade (cautious +1%, balanced +2%,
     bold +3%). The bid rests until a holder chooses to sell; nothing trades unless a counterparty exists.
  2. Sell into real bids: a holder whose take-profit / stop-loss rule fires sells at the best bid when one exists within the
     band (otherwise at the last price, or 1-3% under it when cutting a loss), so sells can actually fill.
  3. Founder liquidity: once the IPO has sold out and investors bid at or above the last price, a founder may sell at most 1% of
     the founder shares per UTC day at the best bid. Founders hold 40% of the company; this is the only new supply.
Switched by the Control Room setting `price_discovery_enabled` (exchange group); off = exactly v1 behaviour.
"""
from __future__ import annotations

import sqlite3
import time

from . import db

PREMIUM = {"cautious": 0.01, "balanced": 0.02, "bold": 0.03}
FOUNDER_DAILY_PCT = 0.01
RULES_VERSION = "deterministic-trade-v2"


def _cents(x: float) -> int:
    return max(1, int(round(x)))


def premium(risk: str | None) -> float:
    return PREMIUM.get(risk or "cautious", 0.01)


def buy_price(*, last: int, ref: int, best_ask: int | None, risk: str | None, band: float, discovery: bool) -> tuple[int, str]:
    """(price in centi-Sora, plain reason). Takes the best ask when it is within the band; else v1 = last price, v2 = bid up."""
    if best_ask is not None and abs(best_ask - last) <= last * band:
        return best_ask, "the best offer"
    if not discovery or best_ask is not None:
        return last, "the last traded price"
    p = min(_cents(last * (1 + premium(risk))), int(ref * (1 + band)))
    return p, f"{premium(risk) * 100:.0f}% above the last trade because nobody is offering shares"


def sell_price(*, last: int, ref: int, best_bid: int | None, avg_cost: float, band: float, risk: str | None, cutting_loss: bool, discovery: bool) -> tuple[int, str]:
    if not discovery:
        return last, "the last traded price"
    if best_bid is not None and abs(best_bid - ref) <= ref * band and (best_bid >= avg_cost * (1 - band) or cutting_loss):
        return best_bid, "the best bid"
    if cutting_loss:
        return max(_cents(last * (1 - premium(risk))), int(ref * (1 - band)) + 1), f"{premium(risk) * 100:.0f}% under the last trade to find a buyer"
    return last, "the last traded price"


def founder_sale(con: sqlite3.Connection, *, founder_id: str, company: dict, held_qty: int, best_bid: int | None, best_bid_qty: int, last: int) -> dict | None:
    """Founder liquidity (rule 3). Returns an order dict or None. Counts today's founder sells from the order book."""
    if best_bid is None or best_bid < last or held_qty <= 0:
        return None
    if con.execute("SELECT 1 FROM orders WHERE company_id=? AND side='sell' AND account_owner_kind='company' AND status IN ('open','partial')", (company["id"],)).fetchone():
        return None  # the IPO is still being sold: no founder sales
    allowance = max(1, int(company.get("founder_shares", 0) * FOUNDER_DAILY_PCT))
    t0 = time.time() - (time.time() % 86400)
    sold = con.execute("SELECT COALESCE(SUM(qty),0) s FROM orders WHERE owner_id=? AND company_id=? AND side='sell' AND created_at>=? AND status!='rejected'",
                       (founder_id, company["id"], t0)).fetchone()["s"]
    qty = min(allowance - sold, held_qty, max(1, best_bid_qty))
    if qty <= 0:
        return None
    return {"company_id": company["id"], "side": "sell", "price": best_bid / db.CENTS, "qty": int(qty), "allowance": allowance, "sold_today": int(sold)}
