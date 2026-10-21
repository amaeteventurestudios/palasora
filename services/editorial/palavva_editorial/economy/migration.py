"""One-time Pals-to-Sora migration (Doc 06 section 7.2). Runbook: docs/operations/SORA-MIGRATION.md.

  1. Freeze: PALS_ISSUANCE_PAUSED and EXCHANGE_HALTED on; every open order cancelled and its reservation released (the
     published rule, Doc 04 section 10).
  2. Back up: scripts/backup.sh (economy.db, all PocketBase data, the git commit, SHA-256 checksums), then verified.
  3. Reconcile before: reconcile.run() must pass; its fingerprint is recorded (balances per account, share balances per
     company, open orders, totals).
  4. Convert at 1 Pal = 1 Sora, in ONE transaction: for every account holding Pals, two journal entries tagged
     `migration:pals-to-sora`: the Pals move to platform:conversion, and the Town Hall issues the same amount of Sora to
     the account. Pals history stays readable; Pals can no longer move (ledger.transfer refuses them).
  5. Shares stay as they are. The companies that exist now become the founding companies (10,000 shares, listed).
  6. Reconcile after: every account's Sora equals its old Pals; the Pals in platform:conversion equal the Sora issued by
     the migration; share balances equal the "before" fingerprint. Checked inside the transaction (a difference rolls
     it back) and again after the commit. Any difference stops the migration and restores the backup.

Idempotent: a ledger that is already converted (or never held Pals) is left alone. `--dry-run` copies economy.db and
runs every step on the copy (the backup goes to a temporary folder); the real database is only read.

    python -m palavva_editorial.economy.migration --dry-run [--data-dir D] [--economy-db P] [--out report.json]
    python -m palavva_editorial.economy.migration --yes     [--data-dir D] [--economy-db P] [--backup-root B] [--out report.json]
    python -m palavva_editorial.economy.migration status | unfreeze --by NAME
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

from . import db, exchange as ex, ledger, reconcile

NAME = "pals-to-sora"
RULE = ledger.MIGRATION_RULE
ROOT = Path(__file__).resolve().parents[4]
CANCEL_REASON = "cancelled for the Pals-to-Sora migration (published rule: open orders are cancelled and reservations released)"


class MigrationError(Exception):
    pass


def _log(msg: str, quiet: bool) -> None:
    if not quiet:
        print(msg, flush=True)


def _record(con: sqlite3.Connection) -> sqlite3.Row | None:
    return con.execute("SELECT * FROM migrations WHERE name=?", (NAME,)).fetchone()


def status(con: sqlite3.Connection) -> dict:
    r = _record(con)
    held = con.execute("SELECT COALESCE(SUM(available+reserved),0) s FROM accounts WHERE asset=? AND NOT (owner_kind='platform' AND owner_id IN ('issuance','conversion'))",
                       (db.PALS,)).fetchone()["s"]
    out = {"currency_state": db.currency_state(con), "pals_held_outside_conversion": held,
           "switches": {k: ex.switch_on(con, k) for k in ("PALS_ISSUANCE_PAUSED", "EXCHANGE_HALTED")}}
    if r:
        out.update({"migration": r["status"], "finished_at": r["finished_at"], "backup_dir": r["backup_dir"],
                    "fingerprint_before": r["fingerprint_before"], "fingerprint_after": r["fingerprint_after"]})
    else:
        out["migration"] = "not needed (this ledger started in Sora)" if out["currency_state"] == "sora" else "pending"
    return out


# ------------------------------------------------------------------------------------------------ steps

def freeze(con: sqlite3.Connection, by: str) -> dict:
    """Step 1. Idempotent: switches on, every open/partial order cancelled with its reservation released."""
    cancelled = []
    with ledger.migrating(), db.tx(con):
        ex.set_switch(con, "PALS_ISSUANCE_PAUSED", True, by)
        ex.set_switch(con, "EXCHANGE_HALTED", True, by)
        for o in con.execute("SELECT * FROM orders WHERE status IN ('open','partial') ORDER BY id").fetchall():
            asset = ex.order_asset(con, o)
            ex._cancel(con, o["id"], None, CANCEL_REASON)
            cancelled.append({"order": o["id"], "owner": f"{o['account_owner_kind']}:{o['owner_id']}", "side": o["side"], "company": o["company_id"],
                              "released": o["reserved_left"], "asset": asset})
    return {"orders_cancelled": len(cancelled), "released": cancelled}


def backup(data_dir: Path, economy_db: Path, backup_root: Path) -> dict:
    """Step 2. scripts/backup.sh (Phase 1) with economy.db taken from `economy_db`; then scripts/restore.sh --verify."""
    env = {**os.environ, "ECONOMY_DB": str(economy_db), "BACKUP_KEEP": "0"}  # 0: never prune other backups from here
    r = subprocess.run(["bash", str(ROOT / "scripts/backup.sh"), str(data_dir), str(backup_root)], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise MigrationError(f"backup failed: {r.stderr.strip() or r.stdout.strip()}")
    line = next((x for x in r.stdout.splitlines() if x.startswith("backup: ")), "")
    bdir = Path(line[len("backup: "):].split(" (")[0])
    v = subprocess.run(["bash", str(ROOT / "scripts/restore.sh"), "--verify", str(bdir)], capture_output=True, text=True)
    if v.returncode != 0:
        raise MigrationError(f"backup did not verify: {v.stderr.strip() or v.stdout.strip()}")
    man = json.loads((bdir / "MANIFEST.json").read_text())
    eco = next((f for f in man["files"] if f["path"] == "economy.db"), None)
    if not eco:
        raise MigrationError("backup has no economy.db")
    return {"dir": str(bdir), "files": len(man["files"]), "economy_sha256": eco["sha256"], "git_commit": man.get("git_commit", ""), "verify": v.stdout.strip()}


def restore(economy_db: Path, bk: dict) -> None:
    """Put economy.db back from the backup, checked against its SHA-256. Services must be stopped (the runbook says so)."""
    src = Path(bk["dir"]) / "economy.db"
    from importlib import util
    spec = util.spec_from_file_location("backup_tool", ROOT / "scripts/backup_tool.py")
    bt = util.module_from_spec(spec)
    spec.loader.exec_module(bt)  # type: ignore[union-attr]
    if bt.sha256(src) != bk["economy_sha256"]:
        raise MigrationError("backup economy.db does not match its checksum; restore by hand (docs/operations/BACKUP-RESTORE.md)")
    for suffix in ("-wal", "-shm"):
        Path(str(economy_db) + suffix).unlink(missing_ok=True)
    tmp = economy_db.with_name(economy_db.name + ".restoring")
    shutil.copy2(src, tmp)
    os.replace(tmp, economy_db)
    if bt.sha256(economy_db) != bk["economy_sha256"]:
        raise MigrationError("restored economy.db does not match the backup checksum")


def _pals_accounts(con: sqlite3.Connection) -> list[sqlite3.Row]:
    return [a for a in con.execute("SELECT * FROM accounts WHERE asset=? ORDER BY id", (db.PALS,)).fetchall()
            if not ledger.is_mint(a) and not (a["owner_kind"] == "platform" and a["owner_id"] == "conversion")]


def convert(con: sqlite3.Connection) -> dict:
    """Step 4 (call inside db.tx and ledger.migrating). Two entries per account holding Pals, one txn id for all."""
    txn = f"{NAME}:{uuid.uuid4().hex}"
    conv = ledger.account(con, *ledger.CONVERSION, db.PALS)
    n = total = 0
    for a in _pals_accounts(con):
        if a["reserved"]:
            raise MigrationError(f"account {a['id']} still has {a['reserved']} Pals reserved after the freeze")
        amt = a["available"]
        if amt <= 0:
            continue
        memo = "1 Pal = 1 Sora (Doc 06 section 7.2)"
        ledger.transfer(con, kind="convert", idem_key=f"{RULE}:pals:{a['id']}", src=a["id"], src_bucket="available", dst=conv["id"], dst_bucket="available",
                        asset=db.PALS, amount=amt, txn_id=txn, ref_type="migration", ref_id=NAME, rule=RULE, memo=memo)
        ledger.issue(con, a["owner_id"], amt, idem_key=f"{RULE}:sora:{a['id']}", rule=RULE, ref_type="migration", ref_id=NAME, memo=memo,
                     owner_key=a["owner_key"], owner_kind=a["owner_kind"], mint=ledger.TOWN_HALL, txn_id=txn)
        n += 1
        total += amt
    founding = con.execute("UPDATE companies SET founding=1").rowcount
    t = str(db.now())
    for k, v in (("currency", db.SORA), ("currency_since", t), ("sora_migration_txn", txn)):
        con.execute("INSERT INTO meta(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))
    return {"accounts_converted": n, "total_converted": total, "txn_id": txn, "founding_companies": founding}


def verify(con: sqlite3.Connection, before: dict) -> dict:
    """Step 6: the three checks of Doc 06 section 7.2, plus a clean reconciliation."""
    after = reconcile.fingerprint(con, db.SORA)
    diffs: list[dict] = []
    for k in sorted(set(before["balances"]) | set(after["balances"])):
        if before["balances"].get(k, 0) != after["balances"].get(k, 0):
            diffs.append({"check": "account_sora_equals_old_pals", "account": k, "pals_before": before["balances"].get(k, 0), "sora_after": after["balances"].get(k, 0)})
    conv = con.execute("SELECT COALESCE(SUM(available+reserved),0) s FROM accounts WHERE owner_kind='platform' AND owner_id='conversion' AND asset=?", (db.PALS,)).fetchone()["s"]
    issued = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE asset=? AND kind='issue' AND rule=?", (db.SORA, RULE)).fetchone()["s"]
    if conv != issued or issued != before["totals"]["money_total"]:
        diffs.append({"check": "conversion_equals_sora_issued", "pals_in_conversion": conv, "sora_issued": issued, "pals_total_before": before["totals"]["money_total"]})
    if after["shares"] != before["shares"]:
        changed = sorted(c for c in set(before["shares"]) | set(after["shares"]) if before["shares"].get(c) != after["shares"].get(c))
        diffs.append({"check": "shares_identical", "companies": changed})
    left = [f"{a['owner_kind']}:{a['owner_id']}" for a in _pals_accounts(con) if a["available"] or a["reserved"]]
    if left:
        diffs.append({"check": "no_pals_left", "accounts": left[:50]})
    if after["open_orders"]:
        diffs.append({"check": "no_open_orders", "orders": [o["id"] for o in after["open_orders"]][:50]})
    rec = reconcile.run(con, store=False)
    if not rec["ok"]:
        diffs.append({"check": "reconcile", "mismatches": rec["mismatches"][:20]})
    match = before["sha256"] == after["sha256"] and before["money_sha256"] == after["money_sha256"] and before["shares_sha256"] == after["shares_sha256"]
    if not match and not diffs:
        diffs.append({"check": "fingerprint", "before": before["sha256"], "after": after["sha256"]})
    return {"ok": not diffs, "differences": diffs, "after": after, "fingerprints_match": match}


def _summary(fp: dict) -> dict:
    return {"coin": fp["coin"], "sha256": fp["sha256"], "money_sha256": fp["money_sha256"], "shares_sha256": fp["shares_sha256"], "totals": fp["totals"],
            "platform": fp["platform"]}


# ------------------------------------------------------------------------------------------------ the run

def migrate(economy_db: Path, *, data_dir: Path, backup_root: Path, by: str = "operator", quiet: bool = False,
            _fault=None, _post_commit_fault=None) -> dict:
    """Run steps 1 to 6 on `economy_db`. Returns the report (status: done, already_done, nothing_to_do, aborted_*)."""
    t0 = time.time()
    economy_db = Path(economy_db).resolve()
    con = db.connect(economy_db)
    db.init(con)  # schema v2 (widened CHECKs, new tables); no balance changes
    rep: dict = {"name": NAME, "economy_db": str(economy_db), "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    rec = _record(con)
    if rec and rec["status"] == "done":
        rep.update(status="already_done", message="the ledger was converted on a previous run; nothing was changed", previous=json.loads(rec["report"] or "{}").get("summary"))
        con.close()
        _log("already converted: nothing to do", quiet)
        return rep
    if db.currency_state(con) == "sora":
        rep.update(status="nothing_to_do", message="this ledger never held Pals (it started in Sora); nothing was changed")
        con.close()
        _log("ledger started in Sora: nothing to do", quiet)
        return rep

    _log("1/6 freeze: issuance paused, exchange halted, open orders cancelled", quiet)
    rep["freeze"] = freeze(con, f"migration:{by}"[:80])
    _log(f"    {rep['freeze']['orders_cancelled']} open orders cancelled", quiet)

    _log("2/6 backup", quiet)
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    bk = backup(Path(data_dir), economy_db, Path(backup_root))
    rep["backup"] = bk
    _log(f"    {bk['dir']} ({bk['files']} files, verified)", quiet)

    _log("3/6 reconcile before", quiet)
    rb = reconcile.run(con, store=False)
    if not rb["ok"]:
        rep.update(status="aborted_before", message="reconciliation failed before the conversion; nothing was converted (the freeze stays on)",
                   mismatches=rb["mismatches"][:50])
        con.close()
        return rep
    before = reconcile.fingerprint(con, db.PALS)
    rep["before"] = _summary(before)
    _log(f"    fingerprint {before['sha256']}  money {before['money_sha256'][:16]}  {before['totals']}", quiet)

    _log("4/6 convert 1 Pal = 1 Sora, one transaction  5/6 shares untouched  6/6 reconcile after", quiet)
    try:
        with ledger.migrating(), db.tx(con):
            conv = convert(con)
            if _fault:
                _fault(con)
            chk = verify(con, before)
            if not chk["ok"]:
                raise MigrationError(json.dumps(chk["differences"])[:4000])
            rep["convert"] = conv
            rep["after"] = _summary(chk["after"])
            rep["fingerprints_match"] = chk["fingerprints_match"]
            rep["summary"] = {"before": rep["before"]["sha256"], "after": rep["after"]["sha256"], "money_before": rep["before"]["money_sha256"],
                              "money_after": rep["after"]["money_sha256"], "accounts_converted": conv["accounts_converted"],
                              "sora_issued": conv["total_converted"], "backup": bk["dir"]}
            con.execute("INSERT INTO migrations(name, status, started_at, finished_at, backup_dir, fingerprint_before, fingerprint_after, report) VALUES (?,?,?,?,?,?,?,?)",
                        (NAME, "done", t0, db.now(), bk["dir"], before["sha256"], chk["after"]["sha256"], json.dumps({"summary": rep["summary"], "freeze": rep["freeze"]})))
    except Exception as e:  # noqa: BLE001 - any failure: the transaction rolled back; restore the backup to be certain
        con.close()
        restore(economy_db, bk)
        rep.update(status="aborted_restored", message=f"the conversion failed its checks and was rolled back; economy.db was restored from {bk['dir']}",
                   error=str(e)[:4000])
        _log(f"ABORTED, backup restored: {e}", quiet)
        return rep
    if _post_commit_fault:
        _post_commit_fault(con)
    post = verify(con, before)
    if not post["ok"] or not reconcile.run(con)["ok"]:
        con.close()
        restore(economy_db, bk)
        rep.update(status="aborted_restored", message=f"the reconciliation after the commit found a difference; economy.db was restored from {bk['dir']}",
                   differences=post["differences"][:50])
        _log("ABORTED after commit, backup restored", quiet)
        return rep
    con.close()
    rep.update(status="done", seconds=round(time.time() - t0, 2),
               message="converted; the freeze stays on until an operator unfreezes (python -m palavva_editorial.economy.migration unfreeze --by NAME)")
    _log(f"    fingerprint after {rep['after']['sha256']}  match: {rep['fingerprints_match']}", quiet)
    return rep


def dry_run(economy_db: Path, *, data_dir: Path, quiet: bool = False) -> dict:
    """Every step on a copy of economy.db; the backup goes to a temp folder. The real database is only read."""
    tmp = Path(tempfile.mkdtemp(prefix="sora-dry-run-"))
    try:
        copy = tmp / "economy.db"
        src = sqlite3.connect(f"file:{Path(economy_db).resolve()}?mode=ro", uri=True)
        dst = sqlite3.connect(str(copy))
        with dst:
            src.backup(dst)
        src.close(); dst.close()
        rep = migrate(copy, data_dir=data_dir, backup_root=tmp / "backups", by="dry-run", quiet=quiet)
        rep["dry_run"] = True
        rep["source_db"] = str(Path(economy_db).resolve())
        if rep.get("status") == "done":  # the converted copy must also hold on a second run (idempotent)
            rep["second_run"] = migrate(copy, data_dir=data_dir, backup_root=tmp / "backups", by="dry-run", quiet=True)["status"]
        return rep
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def unfreeze(con: sqlite3.Connection, by: str) -> dict:
    r = _record(con)
    if db.currency_state(con) != "sora" or (r and r["status"] != "done"):
        raise MigrationError("the ledger is not converted; keep the freeze on")
    with db.tx(con):
        ex.set_switch(con, "PALS_ISSUANCE_PAUSED", False, by)
        ex.set_switch(con, "EXCHANGE_HALTED", False, by)
    return status(con)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="One-time Pals-to-Sora migration (docs/operations/SORA-MIGRATION.md)")
    ap.add_argument("cmd", nargs="?", default="run", choices=["run", "status", "unfreeze"])
    ap.add_argument("--dry-run", action="store_true", help="run every step on a copy; never writes the real database")
    ap.add_argument("--yes", action="store_true", help="required for a real run")
    ap.add_argument("--data-dir", default=os.environ.get("PALAVVA_DATA_DIR", "./data"))
    ap.add_argument("--economy-db", default=os.environ.get("ECONOMY_DB", ""))
    ap.add_argument("--backup-root", default=str(ROOT / "backups"))
    ap.add_argument("--by", default=os.environ.get("USER", "operator"))
    ap.add_argument("--out", default="", help="write the JSON report here")
    a = ap.parse_args(argv)
    data_dir = Path(a.data_dir).resolve()
    eco = Path(a.economy_db).resolve() if a.economy_db else data_dir / "economy.db"
    if not eco.exists():
        print(f"no economy database at {eco}", file=sys.stderr)
        return 2
    if a.cmd in ("status", "unfreeze"):
        con = db.connect(eco)
        db.init(con)
        try:
            out = status(con) if a.cmd == "status" else unfreeze(con, a.by)
        except MigrationError as e:
            print(str(e), file=sys.stderr)
            return 1
        print(json.dumps(out, indent=2))
        return 0
    if a.dry_run:
        rep = dry_run(eco, data_dir=data_dir)
    else:
        if not a.yes:
            print("A real run converts the ledger. Read docs/operations/SORA-MIGRATION.md, stop the services, then re-run with --yes "
                  "(or use --dry-run).", file=sys.stderr)
            return 2
        rep = migrate(eco, data_dir=data_dir, backup_root=Path(a.backup_root), by=a.by)
    text = json.dumps(rep, indent=2, default=str)
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(text + "\n")
    print(json.dumps({k: rep.get(k) for k in ("status", "message", "summary", "fingerprints_match", "second_run") if k in rep}, indent=2, default=str))
    return 0 if rep["status"] in ("done", "already_done", "nothing_to_do") else 1


if __name__ == "__main__":
    raise SystemExit(main())
