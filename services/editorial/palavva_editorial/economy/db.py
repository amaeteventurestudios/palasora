"""Economy database: schema, connection policy and helpers.

Amounts are INTEGER centi-Pals (1 Pal = 100) and integer shares, so no float rounding ever touches a balance.
Every balance change is a row in `journal` (double entry: from one account bucket to another). The cached balances on
`accounts` are updated in the same transaction and can be rebuilt from the journal (reconcile.py).
"""
from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 1
CENTS = 100  # centi-Pals per Pal
PALS = "PALS"

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('agent','platform','company')),
  owner_id TEXT NOT NULL,
  asset TEXT NOT NULL,                       -- 'PALS' or 'SHR:<company_id>'
  available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  owner_key TEXT NOT NULL DEFAULT '',        -- human owner (or 'platform') behind an agent: wash-trade / collusion checks
  created_at REAL NOT NULL,
  UNIQUE (owner_kind, owner_id, asset),
  -- only the platform issuance account may go negative (it is the counter-entry of every issued Pal)
  CHECK (available >= 0 OR owner_kind = 'platform')
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY,
  txn_id TEXT NOT NULL,
  idem_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('issue','reverse','reserve','release','trade_cash','trade_shares','refund','ipo_shares','fee','treasury')),
  from_account INTEGER NOT NULL REFERENCES accounts(id),
  from_bucket TEXT NOT NULL CHECK (from_bucket IN ('available','reserved')),
  to_account INTEGER NOT NULL REFERENCES accounts(id),
  to_bucket TEXT NOT NULL CHECK (to_bucket IN ('available','reserved')),
  asset TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  ref_type TEXT NOT NULL DEFAULT '',
  ref_id TEXT NOT NULL DEFAULT '',
  rule TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_ref ON journal (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_journal_from ON journal (from_account, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_to ON journal (to_account, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_txn ON journal (txn_id);

CREATE TABLE IF NOT EXISTS reward_rules (
  code TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK (amount > 0), per_agent_daily_cap INTEGER NOT NULL, description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, one_time INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY, agent_id TEXT NOT NULL, rule TEXT NOT NULL REFERENCES reward_rules(code), ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
  amount INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('issued','denied','reversed')), reason TEXT NOT NULL DEFAULT '',
  journal_id INTEGER REFERENCES journal(id), day TEXT NOT NULL, created_at REAL NOT NULL,
  UNIQUE (agent_id, rule, ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_rewards_day ON rewards (day, agent_id, rule);

CREATE TABLE IF NOT EXISTS markets (
  code TEXT PRIMARY KEY,                       -- ISO-3166 alpha-2, one fictional market per African country
  name TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','halted')),
  halted_reason TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, ticker TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE COLLATE NOCASE, market TEXT NOT NULL REFERENCES markets(code),
  founder_agent_id TEXT NOT NULL, sector TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('listed','halted','delisted')),
  shares_outstanding INTEGER NOT NULL CHECK (shares_outstanding > 0), founder_shares INTEGER NOT NULL, ipo_price INTEGER NOT NULL CHECK (ipo_price > 0),
  last_price INTEGER, prev_close INTEGER, eligibility TEXT NOT NULL DEFAULT '{}', created_at REAL NOT NULL, listed_at REAL
);
CREATE INDEX IF NOT EXISTS idx_companies_market ON companies (market, status);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, idem_key TEXT NOT NULL UNIQUE, account_owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, owner_key TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id), market TEXT NOT NULL, side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  price INTEGER NOT NULL CHECK (price > 0), qty INTEGER NOT NULL CHECK (qty > 0), filled INTEGER NOT NULL DEFAULT 0 CHECK (filled >= 0),
  status TEXT NOT NULL CHECK (status IN ('open','partial','filled','cancelled','rejected')),
  reserved_left INTEGER NOT NULL DEFAULT 0 CHECK (reserved_left >= 0),
  reason TEXT NOT NULL DEFAULT '', reject_reason TEXT NOT NULL DEFAULT '', decision_ref TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL, updated_at REAL NOT NULL,
  CHECK (filled <= qty)
);
CREATE INDEX IF NOT EXISTS idx_orders_book ON orders (company_id, side, status, price, id);
CREATE INDEX IF NOT EXISTS idx_orders_owner ON orders (owner_id, created_at);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), market TEXT NOT NULL,
  buy_order INTEGER NOT NULL REFERENCES orders(id), sell_order INTEGER NOT NULL REFERENCES orders(id),
  buyer_id TEXT NOT NULL, seller_id TEXT NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL, txn_id TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_company ON trades (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades (market, created_at);
CREATE TABLE IF NOT EXISTS positions (
  owner_id TEXT NOT NULL, company_id TEXT NOT NULL REFERENCES companies(id), qty INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0,
  realized INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (owner_id, company_id)
);
CREATE TABLE IF NOT EXISTS index_values (market TEXT NOT NULL, day TEXT NOT NULL, value REAL NOT NULL, constituents INTEGER NOT NULL, PRIMARY KEY (market, day));
CREATE TABLE IF NOT EXISTS trading_limits (
  agent_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, max_order_pals INTEGER NOT NULL DEFAULT 5000, daily_pals INTEGER NOT NULL DEFAULT 20000,
  daily_orders INTEGER NOT NULL DEFAULT 10, markets TEXT NOT NULL DEFAULT '[]', updated_by TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY, agent_id TEXT NOT NULL, kind TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('buy','sell','hold','create_company','abstain')),
  company_id TEXT, inputs TEXT NOT NULL DEFAULT '{}', explanation TEXT NOT NULL DEFAULT '', decider TEXT NOT NULL DEFAULT 'deterministic',
  order_id INTEGER, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_agent ON decisions (agent_id, created_at);
-- ISSUE-14: every reward-policy change (rule amount/cap/active, network budget) with before/after, reason and the preview shown.
-- Changes apply to FUTURE rewards only; past rows in `rewards` and `journal` are never rewritten.
CREATE TABLE IF NOT EXISTS reward_policy_changes (
  id INTEGER PRIMARY KEY, target TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, reason TEXT NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '{}', changed_by TEXT NOT NULL, rollback_of INTEGER, created_at REAL NOT NULL
);
-- ISSUE-14: a person's disposition of an integrity signal (signals are warnings, not proof).
CREATE TABLE IF NOT EXISTS integrity_reviews (
  id INTEGER PRIMARY KEY, signal_key TEXT NOT NULL, disposition TEXT NOT NULL CHECK (disposition IN ('looks_fine','investigating','action_taken')),
  note TEXT NOT NULL, reviewed_by TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integrity_reviews_key ON integrity_reviews (signal_key, created_at);
CREATE TABLE IF NOT EXISTS switches (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS reconciliations (
  id INTEGER PRIMARY KEY, ran_at REAL NOT NULL, ok INTEGER NOT NULL, accounts INTEGER NOT NULL, journal_rows INTEGER NOT NULL,
  mismatches TEXT NOT NULL DEFAULT '[]', supply_pals INTEGER NOT NULL, issued_pals INTEGER NOT NULL
);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    """One connection per caller. WAL + full sync: committed settlements survive a crash or power loss."""
    con = sqlite3.connect(str(path), timeout=15, isolation_level=None, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=15000")
    return con


def init(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA)
    con.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))


@contextmanager
def tx(con: sqlite3.Connection):
    """BEGIN IMMEDIATE: one writer at a time; everything inside commits or nothing does."""
    con.execute("BEGIN IMMEDIATE")
    try:
        yield con
    except BaseException:
        con.execute("ROLLBACK")
        raise
    else:
        con.execute("COMMIT")


def now() -> float:
    return time.time()


def day(ts: float | None = None) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts if ts is not None else time.time()))
