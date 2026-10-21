"""Double-entry Sora/share ledger. Every function here must be called INSIDE db.tx() by its caller (or uses its own).

A transfer moves `amount` of one asset from (account, bucket) to (account, bucket). Buckets are 'available' and
'reserved'; a reservation is a transfer from an account's own available bucket to its own reserved bucket, so the
journal alone explains every cached balance. Idempotency: each journal row has a unique idem_key; replaying the same
logical operation returns the existing row instead of moving value twice.

Phase 2 rules (Doc 04 sections 4 and 5, Doc 06 section 7.3):
  * Only two accounts can create Sora: the Town Hall and the Harbour (the mints). Only a mint may go negative, in code
    and in the database CHECK. Every other account, platform accounts included, can only move what it holds.
  * Fees (and, later, imports) are destroyed: they go to platform:burn, which supply counts as destroyed.
  * Pals (the old unit) never move again once the ledger runs in Sora; their history stays readable. While a ledger
    still holds unconverted Pals ('pending'), nothing moves except the migration itself.
"""
from __future__ import annotations

import contextvars
import sqlite3
import uuid
from contextlib import contextmanager

from . import db

TOWN_HALL = ("platform", "town_hall")   # mint: social rewards, grants, civic wages, the Pals conversion
HARBOUR = ("platform", "harbour")       # mint: floor-price buying, imports (Phase 3)
BURN = ("platform", "burn")             # fees, imports and clawbacks land here and count as destroyed
CONVERSION = ("platform", "conversion")  # every converted Pal rests here (history; never moves again)
ISSUANCE = ("platform", "issuance")     # legacy Pals mint (history only)
REVERSALS = ("platform", "reversals")   # legacy Pals clawback holding account (history only)
MIGRATION_RULE = "migration:pals-to-sora"

_migrating: contextvars.ContextVar[bool] = contextvars.ContextVar("economy_migrating", default=False)


@contextmanager
def migrating():
    """Only the Pals-to-Sora migration runs inside this: it may cancel Pals orders and convert Pals."""
    tok = _migrating.set(True)
    try:
        yield
    finally:
        _migrating.reset(tok)


def trade_owner(owner_key: str) -> str:
    """The owner used for self-trade checks (Doc 04 section 5). Every house agent (a Palasora-operated identity, owner key
    'seed:<id>' or 'platform') maps to the one platform owner, so two house agents can never trade with each other. A person
    and their own agents share 'user:<id>'."""
    k = owner_key or ""
    return "platform" if k == "platform" or k.startswith("seed:") else k


TRADE_OWNER_SQL = "(CASE WHEN owner_key = 'platform' OR owner_key LIKE 'seed:%' THEN 'platform' ELSE owner_key END)"


class LedgerError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def is_mint(row: sqlite3.Row | dict) -> bool:
    """A mint is the counter-entry of what it creates: Sora (Town Hall, Harbour), legacy Pals (issuance), shares (mint:<cid>)."""
    if row["owner_kind"] != "platform":
        return False
    asset, oid = row["asset"], row["owner_id"]
    if asset == db.SORA:
        return oid in db.MINT_IDS
    if asset == db.PALS:
        return oid == "issuance"
    return asset.startswith("SHR:") and oid == f"mint:{asset[4:]}"


def account(con: sqlite3.Connection, owner_kind: str, owner_id: str, asset: str = db.SORA, owner_key: str = "") -> sqlite3.Row:
    row = con.execute("SELECT * FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset)).fetchone()
    if row:
        if owner_key and not row["owner_key"]:
            con.execute("UPDATE accounts SET owner_key=? WHERE id=?", (owner_key, row["id"]))
        return row
    con.execute("INSERT INTO accounts(owner_kind, owner_id, asset, owner_key, created_at) VALUES (?,?,?,?,?)", (owner_kind, owner_id, asset, owner_key, db.now()))
    return con.execute("SELECT * FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset)).fetchone()


def transfer(con: sqlite3.Connection, *, kind: str, idem_key: str, src: int, src_bucket: str, dst: int, dst_bucket: str, asset: str, amount: int,
             txn_id: str = "", ref_type: str = "", ref_id: str = "", rule: str = "", memo: str = "") -> int:
    """Move value; returns the journal id. Raises LedgerError('INSUFFICIENT') rather than letting a balance go negative."""
    if amount <= 0:
        raise LedgerError("BAD_AMOUNT", "amount must be positive")
    prior = con.execute("SELECT id FROM journal WHERE idem_key=?", (idem_key,)).fetchone()
    if prior:
        return prior["id"]
    if not _migrating.get():
        if asset == db.PALS:
            raise LedgerError("PALS_RETIRED", "Pals were converted to Sora (1 Pal = 1 Sora) and can no longer move; their history stays readable")
        if db.currency_state(con) != "sora":
            raise LedgerError("MIGRATION_PENDING", "the ledger still holds Pals: run the Pals-to-Sora migration before anything moves")
    s = con.execute("SELECT * FROM accounts WHERE id=?", (src,)).fetchone()
    d = con.execute("SELECT * FROM accounts WHERE id=?", (dst,)).fetchone()
    if not s or not d or s["asset"] != asset or d["asset"] != asset:
        raise LedgerError("BAD_ACCOUNT", "unknown account or asset mismatch")
    if kind == "issue" and not is_mint(s):
        raise LedgerError("NOT_A_MINT", "only the Town Hall and the Harbour can create Sora")
    if not is_mint(s) and s[src_bucket] < amount:
        raise LedgerError("INSUFFICIENT", f"insufficient {src_bucket} {asset}: have {s[src_bucket]}, need {amount}")
    con.execute(f"UPDATE accounts SET {src_bucket} = {src_bucket} - ? WHERE id=?", (amount, src))
    con.execute(f"UPDATE accounts SET {dst_bucket} = {dst_bucket} + ? WHERE id=?", (amount, dst))
    cur = con.execute("""INSERT INTO journal(txn_id, idem_key, kind, from_account, from_bucket, to_account, to_bucket, asset, amount, ref_type, ref_id, rule, memo, created_at)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                      (txn_id or uuid.uuid4().hex, idem_key, kind, src, src_bucket, dst, dst_bucket, asset, amount, ref_type, ref_id, rule, memo, db.now()))
    return int(cur.lastrowid)


def issue(con: sqlite3.Connection, agent_id: str, amount: int, *, idem_key: str, rule: str, ref_type: str, ref_id: str, memo: str = "", owner_key: str = "",
          owner_kind: str = "agent", mint: tuple[str, str] = TOWN_HALL, txn_id: str = "") -> int:
    """Create Sora: from a mint (the Town Hall by default) to an account. Callers enforce the mint's budget."""
    if mint not in (TOWN_HALL, HARBOUR):
        raise LedgerError("NOT_A_MINT", "only the Town Hall and the Harbour can create Sora")
    src = account(con, *mint)
    dst = account(con, owner_kind, agent_id, db.SORA, owner_key)
    return transfer(con, kind="issue", idem_key=idem_key, src=src["id"], src_bucket="available", dst=dst["id"], dst_bucket="available",
                    asset=db.SORA, amount=amount, ref_type=ref_type, ref_id=ref_id, rule=rule, memo=memo, txn_id=txn_id)


def burn(con: sqlite3.Connection, src_id: int, amount: int, *, kind: str = "burn", idem_key: str, rule: str = "", ref_type: str = "", ref_id: str = "",
         memo: str = "", txn_id: str = "") -> int:
    """Destroy Sora: move it to platform:burn, which supply counts as destroyed (fees, imports, clawbacks)."""
    dst = account(con, *BURN)
    return transfer(con, kind=kind, idem_key=idem_key, src=src_id, src_bucket="available", dst=dst["id"], dst_bucket="available", asset=db.SORA,
                    amount=amount, rule=rule, ref_type=ref_type, ref_id=ref_id, memo=memo, txn_id=txn_id)


def reverse(con: sqlite3.Connection, journal_id: int, *, reason: str) -> tuple[int, int]:
    """Claw back an issuance. Takes what is available (never forces a negative balance); returns (reversed, shortfall).
    Clawed-back Sora is destroyed (platform:burn), never re-issued silently."""
    j = con.execute("SELECT * FROM journal WHERE id=? AND kind='issue'", (journal_id,)).fetchone()
    if not j:
        raise LedgerError("NOT_FOUND", "no such issuance")
    if j["asset"] != db.SORA:
        raise LedgerError("PALS_RETIRED", "a Pals issuance was converted to Sora and cannot be reversed as Pals")
    done = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='reverse' AND ref_type='journal' AND ref_id=?", (str(journal_id),)).fetchone()["s"]
    left = j["amount"] - done
    if left <= 0:
        return 0, 0
    acct = con.execute("SELECT * FROM accounts WHERE id=?", (j["to_account"],)).fetchone()
    take = min(left, acct["available"])
    if take > 0:
        burn(con, acct["id"], take, kind="reverse", idem_key=f"reverse:{journal_id}:{done}", ref_type="journal", ref_id=str(journal_id), memo=reason[:300])
    return take, left - take


def reserve(con: sqlite3.Connection, acct_id: int, asset: str, amount: int, *, idem_key: str, ref_type: str, ref_id: str, txn_id: str = "") -> int:
    return transfer(con, kind="reserve", idem_key=idem_key, src=acct_id, src_bucket="available", dst=acct_id, dst_bucket="reserved", asset=asset, amount=amount,
                    ref_type=ref_type, ref_id=ref_id, txn_id=txn_id)


def release(con: sqlite3.Connection, acct_id: int, asset: str, amount: int, *, idem_key: str, ref_type: str, ref_id: str, txn_id: str = "") -> int:
    return transfer(con, kind="release", idem_key=idem_key, src=acct_id, src_bucket="reserved", dst=acct_id, dst_bucket="available", asset=asset, amount=amount,
                    ref_type=ref_type, ref_id=ref_id, txn_id=txn_id)


def balance(con: sqlite3.Connection, owner_kind: str, owner_id: str, asset: str = db.SORA) -> dict:
    r = con.execute("SELECT available, reserved FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset)).fetchone()
    return {"available": r["available"] if r else 0, "reserved": r["reserved"] if r else 0}


def label(r: sqlite3.Row | dict) -> str:
    """A plain label for a history line."""
    if r["rule"] == MIGRATION_RULE:
        return "Pals converted to Sora (1 Pal = 1 Sora)"
    return {"issue": "Reward" if r["rule"] else "Issued", "reverse": "Reward reversed", "trade_cash": "Exchange trade", "fee": "Fee (destroyed)",
            "burn": "Destroyed", "convert": "Pals converted to Sora", "refund": "Refund", "revenue": "Revenue"}.get(r["kind"], r["kind"].replace("_", " "))


def history(con: sqlite3.Connection, owner_kind: str, owner_id: str, asset: str = db.SORA, limit: int = 100) -> list[dict]:
    a = con.execute("SELECT id FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset)).fetchone()
    if not a:
        return []
    rows = con.execute("""SELECT * FROM journal WHERE (from_account=? OR to_account=?) AND NOT (kind IN ('reserve','release') ) ORDER BY id DESC LIMIT ?""",
                       (a["id"], a["id"], limit)).fetchall()
    out = []
    for r in rows:
        sign = 1 if r["to_account"] == a["id"] else -1
        out.append({"id": r["id"], "kind": r["kind"], "amount": sign * r["amount"], "rule": r["rule"], "ref_type": r["ref_type"], "ref_id": r["ref_id"],
                    "memo": r["memo"], "created_at": r["created_at"], "asset": r["asset"], "label": label(r)})
    return out
