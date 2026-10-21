"""Economy database: schema, connection policy and helpers.

Amounts are INTEGER centi-Sora (1 Sora = 100) and integer shares, so no float rounding ever touches a balance.
Every balance change is a row in `journal` (double entry: from one account bucket to another). The cached balances on
`accounts` are updated in the same transaction and can be rebuilt from the journal (reconcile.py).

Currency (Phase 2, Doc 06 section 7): the coin is the Sora. The old unit, the Pal (asset 'PALS'), is kept as readable
history only. A ledger that held Pals is converted once by `migration.py` (1 Pal = 1 Sora); a new ledger starts in Sora.
`currency_state()` tells which: 'sora' (fresh or converted) or 'pending' (Pals not converted yet: money cannot move).
"""
from __future__ import annotations

import contextvars
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 3
CENTS = 100  # centi-Sora per Sora (and, historically, centi-Pals per Pal)
PALS = "PALS"  # legacy unit: history only after the migration
SORA = "SORA"  # the coin
CURRENCY = SORA

# Mint accounts. Only these may hold a negative balance: they are the counter-entry of every coin (or share) created.
# Sora: the Town Hall and the Harbour (Doc 04 section 4). Pals (legacy): platform:issuance. Shares: platform:mint:<cid>.
MINT_IDS = ("town_hall", "harbour")
_MINT_CHECK = "(owner_kind = 'platform' AND (owner_id IN ('town_hall','harbour','issuance') OR owner_id LIKE 'mint:%'))"

ACCOUNTS_DDL = f"""CREATE TABLE IF NOT EXISTS {{t}} (
  id INTEGER PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('agent','platform','company','human')),
  owner_id TEXT NOT NULL,
  asset TEXT NOT NULL,                       -- 'SORA', legacy 'PALS', or 'SHR:<company_id>'
  available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  owner_key TEXT NOT NULL DEFAULT '',        -- identity behind the account (user:<id>, seed:<id>, platform): wash-trade / collusion checks
  created_at REAL NOT NULL,
  UNIQUE (owner_kind, owner_id, asset),
  -- only a mint may go negative (it is the counter-entry of every coin or share it created)
  CHECK (available >= 0 OR {_MINT_CHECK})
)"""
JOURNAL_KINDS = ("issue", "reverse", "reserve", "release", "trade_cash", "trade_shares", "refund", "ipo_shares", "fee", "treasury",
                 "convert", "burn", "revenue",
                 # Phase 3 (the town economy): wages, payments into a mint (destroyed: imports, upkeep, building, decor), plain
                 # transfers between one owner's accounts or for an approved business sale, and Market Hall goods settlements.
                 "wage", "sink", "transfer", "goods_cash")
JOURNAL_DDL = f"""CREATE TABLE IF NOT EXISTS {{t}} (
  id INTEGER PRIMARY KEY,
  txn_id TEXT NOT NULL,
  idem_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ({",".join(f"'{k}'" for k in JOURNAL_KINDS)})),
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
)"""
COMPANIES_DDL = """CREATE TABLE IF NOT EXISTS {t} (
  id TEXT PRIMARY KEY, ticker TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE COLLATE NOCASE, market TEXT NOT NULL REFERENCES markets(code),
  founder_agent_id TEXT NOT NULL, sector TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('private','listed','halted','delisted')),
  shares_outstanding INTEGER NOT NULL CHECK (shares_outstanding > 0), founder_shares INTEGER NOT NULL, ipo_price INTEGER NOT NULL CHECK (ipo_price > 0),
  last_price INTEGER, prev_close INTEGER, eligibility TEXT NOT NULL DEFAULT '{{}}', created_at REAL NOT NULL, listed_at REAL,
  founding INTEGER NOT NULL DEFAULT 0          -- 1 = one of the founding companies (10,000 shares, listed before Sora); 0 = Doc 04 rules
)"""
INDEXES = """
CREATE INDEX IF NOT EXISTS idx_journal_ref ON journal (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_journal_from ON journal (from_account, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_to ON journal (to_account, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_txn ON journal (txn_id);
CREATE INDEX IF NOT EXISTS idx_journal_rule ON journal (rule);
CREATE INDEX IF NOT EXISTS idx_companies_market ON companies (market, status);
"""

# --------------------------------------------------------------------------- Phase 3: the town economy (Doc 05 section 3)
# Goods are whole units. Every change to `stock` has a `goods_log` row (made, eaten, worn, imported, exported, moved), so
# stock = made + imported - eaten - worn - exported for every good, holder and tick (Doc 04 section 5, invariant 2).
# Holders are 'kind:id' keys matching ledger accounts (company:b001, agent:h001, human:p001) plus platform:transit.
TOWN_SCHEMA = """
CREATE TABLE IF NOT EXISTS issuance_carry (week_start REAL PRIMARY KEY, carry INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS starter_grants (
  person TEXT PRIMARY KEY, agent TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0), queued_tick INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','paid')), paid_tick INTEGER
);
CREATE TABLE IF NOT EXISTS town_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stock (
  holder TEXT NOT NULL, good TEXT NOT NULL CHECK (good IN ('crops','meals','tools','materials')),
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0), reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= qty),
  PRIMARY KEY (holder, good)
);
CREATE TABLE IF NOT EXISTS goods_log (
  id INTEGER PRIMARY KEY, tick INTEGER NOT NULL, holder TEXT NOT NULL, good TEXT NOT NULL, change INTEGER NOT NULL CHECK (change != 0),
  cause TEXT NOT NULL CHECK (cause IN ('made','eaten','worn','imported','exported','moved')), ref_type TEXT NOT NULL DEFAULT '', ref_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_goods_log_tick ON goods_log (tick);
CREATE TABLE IF NOT EXISTS plots (
  id TEXT PRIMARY KEY, area TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, size INTEGER NOT NULL DEFAULT 1, prime INTEGER NOT NULL DEFAULT 0,
  use TEXT NOT NULL CHECK (use IN ('home','business','civic')), owner TEXT NOT NULL DEFAULT '', building TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS town_agents (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('house','player')), role TEXT NOT NULL, owner_kind TEXT NOT NULL, owner_key TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT '{}', limits TEXT NOT NULL DEFAULT '{}', mode TEXT NOT NULL DEFAULT 'rules',
  ai_budget_left INTEGER NOT NULL DEFAULT 0, arrived_tick INTEGER NOT NULL DEFAULT 0, home TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('farm','workshop','stall','delivery')), plot TEXT NOT NULL, owner TEXT NOT NULL,
  price INTEGER NOT NULL, wage INTEGER NOT NULL, level INTEGER NOT NULL DEFAULT 1, health TEXT NOT NULL DEFAULT 'green',
  status TEXT NOT NULL CHECK (status IN ('open','closed')), cost INTEGER NOT NULL, shares_issued INTEGER NOT NULL DEFAULT 1000,
  rating REAL NOT NULL DEFAULT 1.0, opened_tick INTEGER NOT NULL, closed_tick INTEGER, beside_curve INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, employer TEXT NOT NULL, worker TEXT NOT NULL, wage INTEGER NOT NULL, start_tick INTEGER NOT NULL, end_tick INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs (worker, end_tick);
CREATE TABLE IF NOT EXISTS goods_orders (
  id INTEGER PRIMARY KEY, idem_key TEXT NOT NULL UNIQUE, holder TEXT NOT NULL, owner_key TEXT NOT NULL, good TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')), price INTEGER NOT NULL CHECK (price > 0), qty INTEGER NOT NULL CHECK (qty > 0),
  filled INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL CHECK (status IN ('open','partial','filled','cancelled')),
  reserved_left INTEGER NOT NULL DEFAULT 0 CHECK (reserved_left >= 0), tick INTEGER NOT NULL, expires_tick INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '',
  CHECK (filled <= qty)
);
CREATE INDEX IF NOT EXISTS idx_goods_orders_book ON goods_orders (good, side, status, price, id);
CREATE TABLE IF NOT EXISTS goods_trades (
  id INTEGER PRIMARY KEY, good TEXT NOT NULL, buy_order INTEGER NOT NULL, sell_order INTEGER NOT NULL, buyer TEXT NOT NULL, seller TEXT NOT NULL,
  price INTEGER NOT NULL, qty INTEGER NOT NULL, tick INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY, seller TEXT NOT NULL, buyer TEXT NOT NULL, good TEXT NOT NULL, qty_per_day INTEGER NOT NULL, price INTEGER NOT NULL,
  start_day INTEGER NOT NULL, end_day INTEGER NOT NULL, terms TEXT NOT NULL DEFAULT '{}', due INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0,
  breaches INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL CHECK (status IN ('active','ended','breached')), related_party INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY, src TEXT NOT NULL, dst TEXT NOT NULL, good TEXT NOT NULL, qty INTEGER NOT NULL, cart TEXT NOT NULL, fee INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('moving','arrived')), created_tick INTEGER NOT NULL, due_tick INTEGER NOT NULL, ref_type TEXT NOT NULL DEFAULT '', ref_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries (status, due_tick);
CREATE TABLE IF NOT EXISTS agent_decisions (
  id INTEGER PRIMARY KEY, agent TEXT NOT NULL, tick INTEGER NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('rules','recorded','live','fixture','mischief')),
  trigger TEXT NOT NULL DEFAULT 'plan', prompt_hash TEXT NOT NULL DEFAULT '', actions TEXT NOT NULL DEFAULT '[]', reason TEXT NOT NULL DEFAULT '',
  tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, fallback INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY, tick INTEGER NOT NULL, actor TEXT NOT NULL, via TEXT NOT NULL DEFAULT 'agent', type TEXT NOT NULL, inputs TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (result IN ('done','refused')), refusal TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_actions_actor ON actions (actor, tick);
CREATE TABLE IF NOT EXISTS world_events (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, tick INTEGER NOT NULL, kind TEXT NOT NULL, who TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL CHECK (visibility IN ('public','town','owner','staff')), refs TEXT NOT NULL DEFAULT '{}', text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_world_events_tick ON world_events (tick);
CREATE TABLE IF NOT EXISTS outbox (
  event_id TEXT NOT NULL REFERENCES world_events(id), destination TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_try REAL NOT NULL DEFAULT 0,
  delivered_at REAL, status TEXT NOT NULL CHECK (status IN ('pending','delivered','held')), last_error TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (event_id, destination)
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, destination);
CREATE TABLE IF NOT EXISTS event_receipts (consumer TEXT NOT NULL, event_id TEXT NOT NULL, applied_at REAL NOT NULL, PRIMARY KEY (consumer, event_id));
CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY, rule TEXT NOT NULL, accused TEXT NOT NULL, detecting_rule TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '{}',
  opened_tick INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, agent TEXT NOT NULL, tick INTEGER NOT NULL, channel TEXT NOT NULL DEFAULT 'morning', text TEXT NOT NULL,
  stories TEXT NOT NULL DEFAULT '[]', quiet INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'written'
);
CREATE TABLE IF NOT EXISTS votes (week TEXT PRIMARY KEY, options TEXT NOT NULL, asked_by TEXT NOT NULL DEFAULT '[]', ballots TEXT NOT NULL DEFAULT '{}', winner TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS town_metrics (day INTEGER NOT NULL, key TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (day, key));
CREATE TABLE IF NOT EXISTS growth_weeks (
  week TEXT PRIMARY KEY, measured REAL NOT NULL, band TEXT NOT NULL CHECK (band IN ('below','in','above')), multiplier REAL NOT NULL, next_multiplier REAL NOT NULL
);
-- Doc 05 `mint`: every coin a mint created or destroyed, read straight from the journal (one truth, no second copy).
CREATE VIEW IF NOT EXISTS mint AS
  SELECT j.id, j.created_at, CASE WHEN fa.owner_id IN ('town_hall','harbour') AND fa.owner_kind='platform' THEN fa.owner_id ELSE ta.owner_id END AS account,
         CASE WHEN fa.owner_kind='platform' AND fa.owner_id IN ('town_hall','harbour') THEN j.amount ELSE -j.amount END AS amount, j.rule
  FROM journal j JOIN accounts fa ON fa.id=j.from_account JOIN accounts ta ON ta.id=j.to_account
  WHERE j.asset='SORA' AND ((fa.owner_kind='platform' AND fa.owner_id IN ('town_hall','harbour')) <> (ta.owner_kind='platform' AND ta.owner_id IN ('town_hall','harbour','burn')));
"""

SCHEMA = f"""
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
{ACCOUNTS_DDL.format(t="accounts")};
{JOURNAL_DDL.format(t="journal")};

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
{COMPANIES_DDL.format(t="companies")};
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
  company_id TEXT, inputs TEXT NOT NULL DEFAULT '{{}}', explanation TEXT NOT NULL DEFAULT '', decider TEXT NOT NULL DEFAULT 'deterministic',
  order_id INTEGER, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_agent ON decisions (agent_id, created_at);
-- ISSUE-14: every reward-policy change (rule amount/cap/active, network budget) with before/after, reason and the preview shown.
-- Changes apply to FUTURE rewards only; past rows in `rewards` and `journal` are never rewritten.
CREATE TABLE IF NOT EXISTS reward_policy_changes (
  id INTEGER PRIMARY KEY, target TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, reason TEXT NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '{{}}', changed_by TEXT NOT NULL, rollback_of INTEGER, created_at REAL NOT NULL
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
-- Phase 2: the Town Hall's weekly issuance budget, fixed when first computed in a week (Doc 04 section 4A, rule 2).
CREATE TABLE IF NOT EXISTS issuance_budgets (
  week TEXT NOT NULL, mint TEXT NOT NULL, supply_at_start INTEGER NOT NULL, growth REAL NOT NULL, formula_budget INTEGER NOT NULL,
  floor INTEGER NOT NULL, computed_at REAL NOT NULL, PRIMARY KEY (week, mint)
);
-- Phase 2: one-time ledger migrations (pals-to-sora), with the before/after fingerprints.
CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY, status TEXT NOT NULL, started_at REAL NOT NULL, finished_at REAL, backup_dir TEXT NOT NULL DEFAULT '',
  fingerprint_before TEXT NOT NULL DEFAULT '', fingerprint_after TEXT NOT NULL DEFAULT '', report TEXT NOT NULL DEFAULT '{{}}'
);
{INDEXES}
""" + TOWN_SCHEMA



def connect(path: str | Path) -> sqlite3.Connection:
    """One connection per caller. WAL + full sync: committed settlements survive a crash or power loss."""
    con = sqlite3.connect(str(path), timeout=15, isolation_level=None, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=15000")
    return con


def _needs_upgrade(con: sqlite3.Connection) -> bool:
    acc = con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").fetchone()
    jr = con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal'").fetchone()
    co = con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='companies'").fetchone()
    return bool((acc and "'human'" not in acc["sql"]) or (jr and "'goods_cash'" not in jr["sql"]) or (co and "founding" not in co["sql"]))


def upgrade(con: sqlite3.Connection) -> bool:
    """Schema v1/v2 -> v3, in place and atomic (v3 only widens the journal kinds for the Phase 3 town economy): rebuild accounts, journal and companies with the widened CHECKs (owner kind
    'human', mint-only negatives, the new journal kinds, private companies and the `founding` flag). Every row and id is
    copied unchanged; nothing about a balance changes. Returns True when it upgraded."""
    if not _needs_upgrade(con):
        return False
    con.execute("PRAGMA foreign_keys=OFF")  # only outside a transaction; the rebuild keeps every id, so references stay valid
    try:
        con.execute("BEGIN IMMEDIATE")
        try:
            if _needs_upgrade(con):  # another process may have upgraded while we waited for the lock
                for name, ddl, extra in (("accounts", ACCOUNTS_DDL, {}), ("journal", JOURNAL_DDL, {}), ("companies", COMPANIES_DDL, {"founding": "0"})):
                    old_cols = [r["name"] for r in con.execute(f"PRAGMA table_info({name})")]
                    con.execute(ddl.format(t=f"{name}_v2"))
                    cols = old_cols + [c for c in extra if c not in old_cols]
                    sel = [c if c in old_cols else extra[c] for c in cols]
                    con.execute(f"INSERT INTO {name}_v2 ({','.join(cols)}) SELECT {','.join(sel)} FROM {name}")
                    con.execute(f"DROP TABLE {name}")
                    con.execute(f"ALTER TABLE {name}_v2 RENAME TO {name}")
                for stmt in INDEXES.strip().split(";"):
                    if stmt.strip():
                        con.execute(stmt)
                bad = con.execute("PRAGMA foreign_key_check").fetchall()
                if bad:
                    raise sqlite3.IntegrityError(f"foreign key check failed after upgrade: {[tuple(b) for b in bad[:5]]}")
                con.execute("INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(SCHEMA_VERSION),))
        except BaseException:
            con.execute("ROLLBACK")
            raise
        else:
            con.execute("COMMIT")
    finally:
        con.execute("PRAGMA foreign_keys=ON")
    return True


def init(con: sqlite3.Connection) -> None:
    exists = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").fetchone() is not None
    if exists:
        upgrade(con)  # before SCHEMA: its new indexes name columns that only exist after the upgrade
    con.executescript(SCHEMA)
    con.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
    # A ledger that never held Pals starts in Sora. One that did stays 'pending' until migration.py converts it.
    if not con.execute("SELECT 1 FROM meta WHERE key='currency'").fetchone():
        held_pals = con.execute("SELECT 1 FROM journal WHERE asset=? LIMIT 1", (PALS,)).fetchone()
        if not held_pals:
            con.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('currency', ?)", (SORA,))
            con.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('currency_since', ?)", (str(now()),))


def meta(con: sqlite3.Connection, key: str, default: str = "") -> str:
    r = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return r["value"] if r else default


def currency_state(con: sqlite3.Connection) -> str:
    """'sora' when the ledger runs in Sora (new, or converted); 'pending' when it still holds unconverted Pals."""
    return "sora" if meta(con, "currency") == SORA else "pending"


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


_clock: contextvars.ContextVar = contextvars.ContextVar("economy_clock", default=None)


@contextmanager
def clock(fn):
    """Run with a seeded clock (Doc 05 section 4: no real clock in the simulation). `fn()` returns the simulated time."""
    tok = _clock.set(fn)
    try:
        yield
    finally:
        _clock.reset(tok)


def now() -> float:
    f = _clock.get()
    return f() if f is not None else time.time()


def day(ts: float | None = None) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts if ts is not None else now()))
