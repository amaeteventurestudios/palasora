"""Sora Exchange: one matching/settlement core, 54 country-scoped fictional markets (W46-W50; Phase 2 rules).

Mechanics (all documented in docs/evidence/v15/EXCHANGE-POLICY.md; values marked PROPOSED need founder approval):
  - Limit orders only, price-time priority, partial fills. Trade price = the resting order's price.
  - Reservation first: a buy reserves price x qty Sora, a sell reserves the shares. No borrowing, no leverage, no shorting.
  - Settlement: shares (seller reserved -> buyer available) and Sora (buyer reserved -> seller available) move in the SAME
    SQLite transaction as the order/trade rows, so a crash leaves either the whole match or none of it.
  - Self-trade / wash prevention: orders never match another order with the same trade owner (ledger.trade_owner): a
    person and their own agents share one owner, and ALL house agents share the one platform owner (Doc 04 section 5),
    so two house agents can never trade with each other.
  - Price band: an order more than BAND away from the reference price (last trade, else IPO price) is rejected.
  - Prices move ONLY through matched orders. There is no market maker, no simulated earnings, no dividends.
  - Company rules (Doc 04 section 8, Doc 06 section 7.3):
      * Founding companies (the companies listed before Sora; `founding = 1`) keep their 10,000 shares, holders and listing.
      * New companies follow Doc 04: the founder holds 1,000 shares, the company is private (no order book, no IPO), and it
        can list only after 30 days with revenue (`list_company`). The registration fee is destroyed (platform:burn).
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid

from . import db
from .ledger import TRADE_OWNER_SQL, LedgerError, account, burn, release, reserve, trade_owner, transfer

BAND = 0.30                       # PROPOSED: +/-30% from the reference price per order
SHARES_OUTSTANDING = 10_000       # founding companies: 10,000 shares (kept from before Sora)
FOUNDER_SHARE_PCT = 0.40          # founding companies: founder kept 40%, treasury offered 60% at IPO
NEW_FOUNDER_SHARES = 1_000        # Doc 04 section 8: a new company's founder holds 1,000 shares
LISTING_REVENUE_DAYS = 30         # Doc 04 section 8: listing after 30 days of operations with revenue
LISTING_FEE = 25 * db.CENTS       # PROPOSED: 25 Sora registration fee, destroyed (platform:burn)
MIN_LIFETIME_EARNED = 50 * db.CENTS  # PROPOSED eligibility: founder has earned >= 50 Sora from quality rules
ORDER_TTL_SEC = 3 * 86400         # resting orders expire after 3 days (reservation released)
SECTORS = ["agriculture", "fintech", "logistics", "energy", "media", "education", "health", "retail", "tourism", "manufacturing", "technology", "creative"]
# Fictional names must not borrow real brands, listed companies or exchanges (no implied affiliation). Not exhaustive:
# the creation path also requires an explicit "fictional" disclosure and is logged for moderation review.
REAL_NAME_DENYLIST = {"dangote", "mtn", "safaricom", "jumia", "flutterwave", "paystack", "andela", "ecobank", "access bank", "zenith", "gtbank", "guaranty",
                      "first bank", "equity bank", "kcb", "airtel", "glo", "orange", "vodacom", "naspers", "shoprite", "standard bank", "absa", "nedbank",
                      "sasol", "anglo", "ethiopian airlines", "kenya airways", "nse", "jse", "ngx", "brvm", "gse", "nairobi securities", "johannesburg stock",
                      "interswitch", "opay", "moniepoint", "palmpay", "kuda", "chipper", "mpesa", "m-pesa", "bua", "olam", "nestle", "unilever", "coca", "pepsi"}


class ExchangeError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def ensure_markets(con: sqlite3.Connection, countries: dict[str, dict]) -> int:
    n = 0
    for iso, c in countries.items():
        cur = con.execute("INSERT OR IGNORE INTO markets(code, name, region, updated_at) VALUES (?,?,?,?)", (iso, c["name"], c.get("region", ""), db.now()))
        n += cur.rowcount
    return n


def switch_on(con: sqlite3.Connection, key: str) -> bool:
    r = con.execute("SELECT value FROM switches WHERE key=?", (key,)).fetchone()
    return bool(r and r["value"] == "1")


def set_switch(con: sqlite3.Connection, key: str, on: bool, by: str) -> None:
    con.execute("INSERT INTO switches(key, value, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at",
                (key, "1" if on else "0", by, db.now()))


def lifetime_earned(con: sqlite3.Connection, agent_id: str) -> int:
    return con.execute("SELECT COALESCE(SUM(amount),0) s FROM rewards WHERE agent_id=? AND status='issued'", (agent_id,)).fetchone()["s"]


# --------------------------------------------------------------------------- companies

def create_company(con: sqlite3.Connection, *, founder_agent_id: str, owner_key: str, name: str, ticker: str, market: str, sector: str, description: str,
                   ipo_price: int, fictional_ack: bool, founder_status: str = "active", founding: bool = False) -> dict:
    """Eligibility (PROPOSED policy) + registration, in one transaction (the caller's).

    A new company (the default; the only kind the API and agents can create) is private: 1,000 founder shares, no order
    book, listing only after 30 days with revenue. `founding=True` builds a company under the founding rules (10,000
    shares, listed at once with its treasury offered at the IPO price); it exists for fixtures and tests that need a
    listed company, because the real founding companies came from before Sora."""
    name = re.sub(r"\s+", " ", name).strip()
    ticker = ticker.strip().upper()
    if not fictional_ack:
        raise ExchangeError("DISCLOSURE", "the company must be declared fictional")
    if founder_status != "active":
        raise ExchangeError("FOUNDER_INACTIVE", "founder agent is not active")
    if not (3 <= len(name) <= 60) or not re.fullmatch(r"[A-Za-z0-9&' .-]+", name):
        raise ExchangeError("BAD_NAME", "name must be 3-60 letters, digits or & ' . -")
    low = name.lower()
    if any(re.search(rf"\b{re.escape(w)}\b", low) for w in REAL_NAME_DENYLIST):
        raise ExchangeError("REAL_NAME", "names that resemble real companies, brands or exchanges are not allowed")
    if not re.fullmatch(r"[A-Z]{3,5}", ticker):
        raise ExchangeError("BAD_TICKER", "ticker must be 3-5 letters")
    if sector not in SECTORS:
        raise ExchangeError("BAD_SECTOR", f"sector must be one of {', '.join(SECTORS)}")
    if not (50 <= ipo_price <= 500):
        raise ExchangeError("BAD_PRICE", "the share price must be between 0.50 and 5.00 Sora")
    m = con.execute("SELECT * FROM markets WHERE code=?", (market,)).fetchone()
    if not m:
        raise ExchangeError("BAD_MARKET", "unknown market")
    if m["status"] != "open" or switch_on(con, "EXCHANGE_HALTED") or switch_on(con, "LISTINGS_PAUSED"):
        raise ExchangeError("HALTED", "listings are paused")
    if con.execute("SELECT 1 FROM companies WHERE founder_agent_id=? AND status != 'delisted'", (founder_agent_id,)).fetchone():
        raise ExchangeError("ONE_COMPANY", "an agent may found one active company")
    if con.execute("SELECT 1 FROM companies WHERE ticker=? OR name=? COLLATE NOCASE", (ticker, name)).fetchone():
        raise ExchangeError("DUPLICATE", "name or ticker already used")
    earned = lifetime_earned(con, founder_agent_id)
    if earned < MIN_LIFETIME_EARNED:
        raise ExchangeError("NOT_ELIGIBLE", f"founder has earned {earned / db.CENTS:.2f} Sora; {MIN_LIFETIME_EARNED / db.CENTS:.0f} needed from quality contributions")
    cid = "c" + uuid.uuid4().hex[:14]
    txn = uuid.uuid4().hex
    founder_cash = account(con, "agent", founder_agent_id, db.SORA, owner_key)
    try:
        burn(con, founder_cash["id"], LISTING_FEE, kind="fee", idem_key=f"listing-fee:{cid}", txn_id=txn, ref_type="company", ref_id=cid, rule="registration_fee")
    except LedgerError as e:
        raise ExchangeError("INSUFFICIENT", f"registration fee of {LISTING_FEE / db.CENTS:.0f} Sora: {e}") from e
    if founding:
        outstanding, founder_shares, status = SHARES_OUTSTANDING, int(SHARES_OUTSTANDING * FOUNDER_SHARE_PCT), "listed"
        policy = "founding company (10,000 shares, listed)"
    else:
        outstanding, founder_shares, status = NEW_FOUNDER_SHARES, NEW_FOUNDER_SHARES, "private"
        policy = f"Doc 04 section 8: {NEW_FOUNDER_SHARES:,} founder shares, private until {LISTING_REVENUE_DAYS} days with revenue"
    t = db.now()
    con.execute("""INSERT INTO companies(id, ticker, name, market, founder_agent_id, sector, description, status, shares_outstanding, founder_shares, ipo_price,
                   eligibility, created_at, listed_at, founding) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (cid, ticker, name, market, founder_agent_id, sector, description[:600], status, outstanding, founder_shares, ipo_price,
                 json.dumps({"lifetime_earned": earned, "policy": policy, "fee": LISTING_FEE}), t, t if status == "listed" else None, int(founding)))
    asset = f"SHR:{cid}"
    mint = account(con, "platform", f"mint:{cid}", asset)
    founder_shr = account(con, "agent", founder_agent_id, asset, owner_key)
    account(con, "company", cid, db.SORA, owner_key)
    transfer(con, kind="ipo_shares", idem_key=f"mint-founder:{cid}", src=mint["id"], src_bucket="available", dst=founder_shr["id"], dst_bucket="available",
             asset=asset, amount=founder_shares, txn_id=txn, ref_type="company", ref_id=cid)
    con.execute("INSERT INTO positions(owner_id, company_id, qty, cost) VALUES (?,?,?,0)", (founder_agent_id, cid, founder_shares))
    if founding:
        treasury_shr = account(con, "company", cid, asset, owner_key)
        transfer(con, kind="ipo_shares", idem_key=f"mint-treasury:{cid}", src=mint["id"], src_bucket="available", dst=treasury_shr["id"], dst_bucket="available",
                 asset=asset, amount=outstanding - founder_shares, txn_id=txn, ref_type="company", ref_id=cid)
        # Primary offering: treasury shares rest as one sell order at the IPO price (company-owned, so the founder's owner
        # blocks the founder's own agents, and every house agent, from buying it).
        _place(con, owner_kind="company", owner_id=cid, owner_key=owner_key, company_id=cid, side="sell", price=ipo_price, qty=outstanding - founder_shares,
               idem_key=f"ipo:{cid}", reason="primary offering", decision_ref="", check_limits=False)
    return dict(con.execute("SELECT * FROM companies WHERE id=?", (cid,)).fetchone())


def revenue_days(con: sqlite3.Connection, cid: str) -> int:
    """Distinct UTC days on which the company's Sora account received revenue (journal kind 'revenue'; Phase 3 sales)."""
    a = con.execute("SELECT id FROM accounts WHERE owner_kind='company' AND owner_id=? AND asset=?", (cid, db.SORA)).fetchone()
    if not a:
        return 0
    return con.execute("SELECT COUNT(DISTINCT CAST(created_at / 86400 AS INTEGER)) n FROM journal WHERE to_account=? AND kind='revenue'", (a["id"],)).fetchone()["n"]


def listing_status(con: sqlite3.Connection, cid: str) -> dict:
    c = con.execute("SELECT * FROM companies WHERE id=?", (cid,)).fetchone()
    if not c:
        raise ExchangeError("UNKNOWN_COMPANY")
    days = revenue_days(con, cid)
    return {"company_id": cid, "status": c["status"], "founding": bool(c["founding"]), "revenue_days": days, "needed_days": LISTING_REVENUE_DAYS,
            "eligible": c["status"] == "private" and days >= LISTING_REVENUE_DAYS,
            "conditions": f"A new company lists after {LISTING_REVENUE_DAYS} days of operations with revenue (it has {days})."}


def list_company(con: sqlite3.Connection, cid: str) -> dict:
    """Move a private company onto the Exchange once it has 30 days with revenue. Call inside db.tx()."""
    st = listing_status(con, cid)
    if st["status"] != "private":
        raise ExchangeError("NOT_PRIVATE", f"company is {st['status']}")
    if switch_on(con, "EXCHANGE_HALTED") or switch_on(con, "LISTINGS_PAUSED"):
        raise ExchangeError("HALTED", "listings are paused")
    if not st["eligible"]:
        raise ExchangeError("NOT_ELIGIBLE", st["conditions"])
    con.execute("UPDATE companies SET status='listed', listed_at=? WHERE id=?", (db.now(), cid))
    return dict(con.execute("SELECT * FROM companies WHERE id=?", (cid,)).fetchone())


# --------------------------------------------------------------------------- orders

def ref_price(c: sqlite3.Row) -> int:
    return c["last_price"] or c["ipo_price"]


def _limits_check(con: sqlite3.Connection, agent_id: str, value: int, market: str) -> None:
    lim = con.execute("SELECT * FROM trading_limits WHERE agent_id=?", (agent_id,)).fetchone()
    if not lim or not lim["enabled"]:
        raise ExchangeError("TRADING_DISABLED", "trading is not enabled for this agent by its owner/operator")
    mk = json.loads(lim["markets"] or "[]")
    if mk and market not in mk:
        raise ExchangeError("MARKET_NOT_ALLOWED", "the owner has not allowed this market")
    if value > lim["max_order_pals"] * db.CENTS:
        raise ExchangeError("ORDER_LIMIT", "order exceeds the per-order limit")
    since = db.now() - 86400
    used = con.execute("SELECT COALESCE(SUM(price*qty),0) v, COUNT(*) n FROM orders WHERE owner_id=? AND created_at>=? AND status != 'rejected'", (agent_id, since)).fetchone()
    if used["v"] + value > lim["daily_pals"] * db.CENTS:
        raise ExchangeError("DAILY_LIMIT", "order exceeds the daily trading limit")
    if used["n"] + 1 > lim["daily_orders"]:
        raise ExchangeError("DAILY_ORDERS", "daily order count limit reached")


def place_order(con: sqlite3.Connection, *, agent_id: str, owner_key: str, company_id: str, side: str, price: int, qty: int, idem_key: str,
                reason: str = "", decision_ref: str = "", owner_kind: str = "agent") -> dict:
    """An agent's order (its owner's trading limits apply) or a person's own order (owner_kind 'human': balance only).
    Both go through the same checks otherwise, and get the same refusals."""
    if owner_kind not in ("agent", "human"):
        raise ExchangeError("BAD_ORDER", "orders come from an agent or a person")
    with db.tx(con):
        return _place(con, owner_kind=owner_kind, owner_id=agent_id, owner_key=owner_key, company_id=company_id, side=side, price=price, qty=qty,
                      idem_key=idem_key, reason=reason, decision_ref=decision_ref, check_limits=owner_kind == "agent")


def _place(con: sqlite3.Connection, *, owner_kind: str, owner_id: str, owner_key: str, company_id: str, side: str, price: int, qty: int, idem_key: str,
           reason: str, decision_ref: str, check_limits: bool) -> dict:
    prior = con.execute("SELECT * FROM orders WHERE idem_key=?", (idem_key,)).fetchone()
    if prior:
        return {"order": dict(prior), "trades": [], "replayed": True}
    if side not in ("buy", "sell") or qty <= 0 or price <= 0:
        raise ExchangeError("BAD_ORDER", "side, price and quantity are required")
    c = con.execute("SELECT * FROM companies WHERE id=?", (company_id,)).fetchone()
    if not c:
        raise ExchangeError("UNKNOWN_COMPANY")
    m = con.execute("SELECT * FROM markets WHERE code=?", (c["market"],)).fetchone()
    if c["status"] == "private":
        raise ExchangeError("NOT_LISTED", f"this company is private: it lists after {LISTING_REVENUE_DAYS} days of operations with revenue")
    if c["status"] != "listed" or m["status"] != "open" or switch_on(con, "EXCHANGE_HALTED"):
        raise ExchangeError("HALTED", "trading in this company or market is halted")
    rp = ref_price(c)
    if abs(price - rp) > rp * BAND:
        raise ExchangeError("PRICE_BAND", f"price must be within {int(BAND * 100)}% of {rp / db.CENTS:.2f} Sora")
    if check_limits:
        _limits_check(con, owner_id, price * qty, c["market"])
    t = db.now()
    txn = uuid.uuid4().hex
    asset_shr = f"SHR:{company_id}"
    if side == "buy":
        acct = account(con, owner_kind, owner_id, db.SORA, owner_key)
        need = price * qty
    else:
        acct = account(con, owner_kind, owner_id, asset_shr, owner_key)
        need = qty
    cur = con.execute("""INSERT INTO orders(idem_key, account_owner_kind, owner_id, owner_key, company_id, market, side, price, qty, status, reserved_left, reason,
                         decision_ref, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?)""",
                      (idem_key, owner_kind, owner_id, owner_key, company_id, c["market"], side, price, qty, need, reason[:500], decision_ref, t, t))
    oid = int(cur.lastrowid)
    try:
        reserve(con, acct["id"], db.SORA if side == "buy" else asset_shr, need, idem_key=f"reserve:{oid}", ref_type="order", ref_id=str(oid), txn_id=txn)
    except LedgerError as e:
        raise ExchangeError(e.code if e.code in ("MIGRATION_PENDING", "PALS_RETIRED") else "INSUFFICIENT", str(e)) from e
    trades = _match(con, oid, txn)
    return {"order": dict(con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()), "trades": trades, "replayed": False}


def _match(con: sqlite3.Connection, oid: int, txn: str) -> list[dict]:
    o = con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    cid = o["company_id"]
    asset_shr = f"SHR:{cid}"
    trades: list[dict] = []
    me = trade_owner(o["owner_key"])
    if o["side"] == "buy":
        book = con.execute(f"""SELECT * FROM orders WHERE company_id=? AND side='sell' AND status IN ('open','partial') AND price<=? AND {TRADE_OWNER_SQL} != ? AND id != ?
                              ORDER BY price ASC, id ASC""", (cid, o["price"], me, oid)).fetchall()
    else:
        book = con.execute(f"""SELECT * FROM orders WHERE company_id=? AND side='buy' AND status IN ('open','partial') AND price>=? AND {TRADE_OWNER_SQL} != ? AND id != ?
                              ORDER BY price DESC, id ASC""", (cid, o["price"], me, oid)).fetchall()
    remaining = o["qty"] - o["filled"]
    for r in book:
        if remaining <= 0:
            break
        q = min(remaining, r["qty"] - r["filled"])
        p = r["price"]  # resting order sets the price
        buy, sell = (o, r) if o["side"] == "buy" else (r, o)
        b_pals = account(con, buy["account_owner_kind"], buy["owner_id"], db.SORA, buy["owner_key"])
        b_shr = account(con, buy["account_owner_kind"], buy["owner_id"], asset_shr, buy["owner_key"])
        s_pals = account(con, sell["account_owner_kind"], sell["owner_id"], db.SORA, sell["owner_key"])
        s_shr = account(con, sell["account_owner_kind"], sell["owner_id"], asset_shr, sell["owner_key"])
        tag = f"{buy['id']}:{sell['id']}:{buy['filled']}:{sell['filled']}"
        transfer(con, kind="trade_shares", idem_key=f"tshr:{tag}", src=s_shr["id"], src_bucket="reserved", dst=b_shr["id"], dst_bucket="available",
                 asset=asset_shr, amount=q, txn_id=txn, ref_type="order", ref_id=str(oid))
        transfer(con, kind="trade_cash", idem_key=f"tcash:{tag}", src=b_pals["id"], src_bucket="reserved", dst=s_pals["id"], dst_bucket="available",
                 asset=db.SORA, amount=p * q, txn_id=txn, ref_type="order", ref_id=str(oid))
        # The buyer reserved at its own limit; any improvement is released back at once.
        improve = (buy["price"] - p) * q
        if improve > 0:
            release(con, b_pals["id"], db.SORA, improve, idem_key=f"improve:{tag}", ref_type="order", ref_id=str(buy["id"]), txn_id=txn)
        t = db.now()
        for side_row, consumed in ((buy, buy["price"] * q), (sell, q)):
            filled = side_row["filled"] + q
            con.execute("UPDATE orders SET filled=?, status=?, reserved_left=reserved_left-?, updated_at=? WHERE id=?",
                        (filled, "filled" if filled == side_row["qty"] else "partial", consumed, t, side_row["id"]))
        cur = con.execute("INSERT INTO trades(company_id, market, buy_order, sell_order, buyer_id, seller_id, price, qty, txn_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                          (cid, o["market"], buy["id"], sell["id"], buy["owner_id"], sell["owner_id"], p, q, txn, t))
        _position(con, buy["owner_id"], cid, q, p, buying=True)
        _position(con, sell["owner_id"], cid, q, p, buying=False)
        con.execute("UPDATE companies SET last_price=? WHERE id=?", (p, cid))
        trades.append({"id": cur.lastrowid, "price": p, "qty": q, "buyer": buy["owner_id"], "seller": sell["owner_id"]})
        remaining -= q
        o = con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    return trades


def _position(con: sqlite3.Connection, owner: str, cid: str, q: int, p: int, buying: bool) -> None:
    pos = con.execute("SELECT * FROM positions WHERE owner_id=? AND company_id=?", (owner, cid)).fetchone()
    if not pos:
        con.execute("INSERT INTO positions(owner_id, company_id, qty, cost, realized) VALUES (?,?,0,0,0)", (owner, cid))
        pos = con.execute("SELECT * FROM positions WHERE owner_id=? AND company_id=?", (owner, cid)).fetchone()
    if buying:
        con.execute("UPDATE positions SET qty=qty+?, cost=cost+? WHERE owner_id=? AND company_id=?", (q, p * q, owner, cid))
    else:
        avg_cost = (pos["cost"] * q // pos["qty"]) if pos["qty"] > 0 else 0
        con.execute("UPDATE positions SET qty=qty-?, cost=cost-?, realized=realized+? WHERE owner_id=? AND company_id=?", (q, avg_cost, p * q - avg_cost, owner, cid))


def cancel_order(con: sqlite3.Connection, oid: int, owner_id: str | None, reason: str = "cancelled") -> dict:
    with db.tx(con):
        return _cancel(con, oid, owner_id, reason)


def _cancel(con: sqlite3.Connection, oid: int, owner_id: str | None, reason: str) -> dict:
    o = con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    if not o or (owner_id and o["owner_id"] != owner_id):
        raise ExchangeError("NOT_FOUND")
    if o["status"] not in ("open", "partial"):
        return dict(o)
    asset = order_asset(con, o)
    acct = account(con, o["account_owner_kind"], o["owner_id"], asset)
    if o["reserved_left"] > 0:
        release(con, acct["id"], asset, o["reserved_left"], idem_key=f"cancel:{oid}", ref_type="order", ref_id=str(oid))
    con.execute("UPDATE orders SET status='cancelled', reserved_left=0, reject_reason=?, updated_at=? WHERE id=?", (reason[:200], db.now(), oid))
    return dict(con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())


def order_asset(con: sqlite3.Connection, o: sqlite3.Row | dict) -> str:
    """The asset an order reserved: shares for a sell; for a buy, the coin of its reservation (Pals for an order placed
    before the Sora conversion, which only the migration cancels; Sora otherwise)."""
    if o["side"] == "sell":
        return f"SHR:{o['company_id']}"
    r = con.execute("SELECT asset FROM journal WHERE idem_key=?", (f"reserve:{o['id']}",)).fetchone()
    return r["asset"] if r else db.SORA


def expire_orders(con: sqlite3.Connection) -> int:
    with db.tx(con):
        old = con.execute("SELECT id FROM orders WHERE status IN ('open','partial') AND account_owner_kind='agent' AND created_at < ?", (db.now() - ORDER_TTL_SEC,)).fetchall()
        for r in old:
            _cancel(con, r["id"], None, "expired after 3 days")
        return len(old)


# --------------------------------------------------------------------------- reads

def book(con: sqlite3.Connection, cid: str, depth: int = 10) -> dict:
    bids = con.execute("SELECT price, SUM(qty-filled) qty, COUNT(*) n FROM orders WHERE company_id=? AND side='buy' AND status IN ('open','partial') GROUP BY price ORDER BY price DESC LIMIT ?", (cid, depth)).fetchall()
    asks = con.execute("SELECT price, SUM(qty-filled) qty, COUNT(*) n FROM orders WHERE company_id=? AND side='sell' AND status IN ('open','partial') GROUP BY price ORDER BY price ASC LIMIT ?", (cid, depth)).fetchall()
    return {"bids": [dict(r) for r in bids], "asks": [dict(r) for r in asks]}


def candles(con: sqlite3.Connection, cid: str, bucket_sec: int = 86400, limit: int = 120) -> list[dict]:
    rows = con.execute(f"""SELECT CAST(created_at/{bucket_sec} AS INTEGER)*{bucket_sec} t, price, qty, id FROM trades WHERE company_id=? ORDER BY id""", (cid,)).fetchall()
    out: dict[int, dict] = {}
    for r in rows:
        c = out.get(r["t"])
        if not c:
            out[r["t"]] = {"t": r["t"], "o": r["price"], "h": r["price"], "l": r["price"], "c": r["price"], "v": r["qty"], "n": 1}
        else:
            c["h"] = max(c["h"], r["price"]); c["l"] = min(c["l"], r["price"]); c["c"] = r["price"]; c["v"] += r["qty"]; c["n"] += 1
    return list(out.values())[-limit:]


def compute_index(con: sqlite3.Connection, market: str | None) -> list[dict]:
    """Sora Market Index (SMI): 1000 x (sum of last-trade market caps) / (sum of IPO market caps) over listed companies
    with at least one trade, evaluated at the end of each UTC day that had trades. Stored and returned as daily points."""
    q = "SELECT id, market, shares_outstanding, ipo_price FROM companies WHERE status != 'delisted'" + (" AND market=?" if market else "")
    comps = {r["id"]: r for r in con.execute(q, (market,) if market else ())}
    if not comps:
        return []
    trades = con.execute(f"SELECT company_id, price, created_at FROM trades WHERE company_id IN ({','.join('?' * len(comps))}) ORDER BY id", list(comps)).fetchall()
    last: dict[str, int] = {}
    points: dict[str, tuple[float, int]] = {}
    for t in trades:
        last[t["company_id"]] = t["price"]
        d = db.day(t["created_at"])
        num = sum(comps[c]["shares_outstanding"] * p for c, p in last.items())
        den = sum(comps[c]["shares_outstanding"] * comps[c]["ipo_price"] for c in last)
        points[d] = (round(1000 * num / den, 2), len(last))
    key = market or "ALL"
    for d, (v, n) in points.items():
        con.execute("INSERT INTO index_values(market, day, value, constituents) VALUES (?,?,?,?) ON CONFLICT(market, day) DO UPDATE SET value=excluded.value, constituents=excluded.constituents",
                    (key, d, v, n))
    return [{"day": d, "value": v, "constituents": n} for d, (v, n) in sorted(points.items())]


def portfolio(con: sqlite3.Connection, owner_id: str, owner_kind: str = "agent") -> dict:
    rows = con.execute("""SELECT p.*, c.ticker, c.name, c.market, c.last_price, c.ipo_price, c.founder_agent_id, c.founder_shares FROM positions p
                          JOIN companies c ON c.id=p.company_id WHERE p.owner_id=? AND (p.qty > 0 OR p.realized != 0) ORDER BY c.market, c.ticker""", (owner_id,)).fetchall()
    holdings = []
    for r in rows:
        px = r["last_price"] or r["ipo_price"]
        value = r["qty"] * px
        founder = r["founder_agent_id"] == owner_id
        # Founder shares were minted at listing at no cost: they are shown, but never reported as a gain (no P&L on minted shares).
        alloc = min(r["qty"], r["founder_shares"]) if founder else 0
        bought_value = (r["qty"] - alloc) * px
        holdings.append({"company_id": r["company_id"], "ticker": r["ticker"], "name": r["name"], "market": r["market"], "qty": r["qty"], "price": px,
                         "priced_by": "last trade" if r["last_price"] else "IPO price (no trade yet)", "value": value, "cost": r["cost"],
                         "founder_allocation": alloc, "unrealized": (bought_value - r["cost"]) if (r["qty"] - alloc) > 0 else 0, "realized": r["realized"]})
    from .ledger import balance
    cash = balance(con, owner_kind, owner_id)
    # "pals" is the pre-Sora name of the same Sora balance, kept as an alias for older clients.
    return {"holdings": holdings, "sora": cash, "pals": cash, "currency": db.SORA, "market_value": sum(h["value"] for h in holdings),
            "unrealized": sum(h["unrealized"] for h in holdings), "realized": sum(h["realized"] for h in holdings)}
