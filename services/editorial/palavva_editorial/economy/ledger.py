"""Double-entry Pals/share ledger. Every function here must be called INSIDE db.tx() by its caller (or uses its own).

A transfer moves `amount` of one asset from (account, bucket) to (account, bucket). Buckets are 'available' and
'reserved'; a reservation is a transfer from an account's own available bucket to its own reserved bucket, so the
journal alone explains every cached balance. Idempotency: each journal row has a unique idem_key; replaying the same
logical operation returns the existing row instead of moving value twice.
"""
from __future__ import annotations

import sqlite3
import uuid

from . import db

ISSUANCE = ("platform", "issuance")   # counter-entry for every Pal issued (may go negative: -1 x total supply)
REVERSALS = ("platform", "reversals")  # Pals clawed back from abuse land here (never re-issued silently)


class LedgerError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def account(con: sqlite3.Connection, owner_kind: str, owner_id: str, asset: str = db.PALS, owner_key: str = "") -> sqlite3.Row:
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
    s = con.execute("SELECT * FROM accounts WHERE id=?", (src,)).fetchone()
    d = con.execute("SELECT * FROM accounts WHERE id=?", (dst,)).fetchone()
    if not s or not d or s["asset"] != asset or d["asset"] != asset:
        raise LedgerError("BAD_ACCOUNT", "unknown account or asset mismatch")
    if s["owner_kind"] != "platform" and s[src_bucket] < amount:
        raise LedgerError("INSUFFICIENT", f"insufficient {src_bucket} {asset}: have {s[src_bucket]}, need {amount}")
    con.execute(f"UPDATE accounts SET {src_bucket} = {src_bucket} - ? WHERE id=?", (amount, src))
    con.execute(f"UPDATE accounts SET {dst_bucket} = {dst_bucket} + ? WHERE id=?", (amount, dst))
    cur = con.execute("""INSERT INTO journal(txn_id, idem_key, kind, from_account, from_bucket, to_account, to_bucket, asset, amount, ref_type, ref_id, rule, memo, created_at)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                      (txn_id or uuid.uuid4().hex, idem_key, kind, src, src_bucket, dst, dst_bucket, asset, amount, ref_type, ref_id, rule, memo, db.now()))
    return int(cur.lastrowid)


def issue(con: sqlite3.Connection, agent_id: str, amount: int, *, idem_key: str, rule: str, ref_type: str, ref_id: str, memo: str = "", owner_key: str = "") -> int:
    src = account(con, *ISSUANCE)
    dst = account(con, "agent", agent_id, db.PALS, owner_key)
    return transfer(con, kind="issue", idem_key=idem_key, src=src["id"], src_bucket="available", dst=dst["id"], dst_bucket="available",
                    asset=db.PALS, amount=amount, ref_type=ref_type, ref_id=ref_id, rule=rule, memo=memo)


def reverse(con: sqlite3.Connection, journal_id: int, *, reason: str) -> tuple[int, int]:
    """Claw back an issuance. Takes what is available (never forces a negative balance); returns (reversed, shortfall)."""
    j = con.execute("SELECT * FROM journal WHERE id=? AND kind='issue'", (journal_id,)).fetchone()
    if not j:
        raise LedgerError("NOT_FOUND", "no such issuance")
    done = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='reverse' AND ref_type='journal' AND ref_id=?", (str(journal_id),)).fetchone()["s"]
    left = j["amount"] - done
    if left <= 0:
        return 0, 0
    acct = con.execute("SELECT * FROM accounts WHERE id=?", (j["to_account"],)).fetchone()
    take = min(left, acct["available"])
    if take > 0:
        dst = account(con, *REVERSALS)
        transfer(con, kind="reverse", idem_key=f"reverse:{journal_id}:{done}", src=acct["id"], src_bucket="available", dst=dst["id"], dst_bucket="available",
                 asset=db.PALS, amount=take, ref_type="journal", ref_id=str(journal_id), memo=reason[:300])
    return take, left - take


def reserve(con: sqlite3.Connection, acct_id: int, asset: str, amount: int, *, idem_key: str, ref_type: str, ref_id: str, txn_id: str = "") -> int:
    return transfer(con, kind="reserve", idem_key=idem_key, src=acct_id, src_bucket="available", dst=acct_id, dst_bucket="reserved", asset=asset, amount=amount,
                    ref_type=ref_type, ref_id=ref_id, txn_id=txn_id)


def release(con: sqlite3.Connection, acct_id: int, asset: str, amount: int, *, idem_key: str, ref_type: str, ref_id: str, txn_id: str = "") -> int:
    return transfer(con, kind="release", idem_key=idem_key, src=acct_id, src_bucket="reserved", dst=acct_id, dst_bucket="available", asset=asset, amount=amount,
                    ref_type=ref_type, ref_id=ref_id, txn_id=txn_id)


def balance(con: sqlite3.Connection, owner_kind: str, owner_id: str, asset: str = db.PALS) -> dict:
    r = con.execute("SELECT available, reserved FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset)).fetchone()
    return {"available": r["available"] if r else 0, "reserved": r["reserved"] if r else 0}


def history(con: sqlite3.Connection, owner_kind: str, owner_id: str, asset: str = db.PALS, limit: int = 100) -> list[dict]:
    a = con.execute("SELECT id FROM accounts WHERE owner_kind=? AND owner_id=? AND asset=?", (owner_kind, owner_id, asset)).fetchone()
    if not a:
        return []
    rows = con.execute("""SELECT * FROM journal WHERE (from_account=? OR to_account=?) AND NOT (kind IN ('reserve','release') ) ORDER BY id DESC LIMIT ?""",
                       (a["id"], a["id"], limit)).fetchall()
    out = []
    for r in rows:
        sign = 1 if r["to_account"] == a["id"] else -1
        out.append({"id": r["id"], "kind": r["kind"], "amount": sign * r["amount"], "rule": r["rule"], "ref_type": r["ref_type"], "ref_id": r["ref_id"],
                    "memo": r["memo"], "created_at": r["created_at"]})
    return out
