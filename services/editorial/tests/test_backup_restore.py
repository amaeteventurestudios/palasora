"""Palasora Phase 1: backup and restore (scripts/backup_tool.py, scripts/backup.sh, scripts/restore.sh).

Real round trip against the isolated, seeded test PocketBase: online backup while PocketBase runs, restore into a
scratch dir, checksums verified, PocketBase boots on the restored data and the record counts match the source."""
from __future__ import annotations

import importlib.util
import json
import shutil
import sqlite3
import subprocess
import time

import httpx
import pytest

from conftest import PB_BIN, ROOT

spec = importlib.util.spec_from_file_location("backup_tool", ROOT / "scripts/backup_tool.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

RESTORE_PORT = 8293


def _count(db, table):
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return c.execute(f'select count(*) from "{table}"').fetchone()[0]
    finally:
        c.close()


@pytest.fixture()
def data_dir(seeded, pb_server, tmp_path):
    """A data dir shaped like PALAVVA_DATA_DIR: live pb_data (symlink to the running test PocketBase) + economy/spend/jobs DBs."""
    d = tmp_path / "data"
    d.mkdir()
    (d / "pb_data").symlink_to(pb_server["data"], target_is_directory=True)
    from palavva_editorial.economy import db as edb, ledger
    con = edb.connect(d / "economy.db")
    edb.init(con)
    ledger.account(con, "agent", "backup-test")
    con.commit()
    con.close()
    from palavva_editorial.jobs import Queue
    Queue(d / "jobs.db").enqueue("t", "noop", {"x": 1}, "backup-test")
    s = sqlite3.connect(d / "spend.db")
    s.execute("create table calls (id integer primary key, usd real)")
    s.execute("insert into calls (usd) values (0.01)")
    s.commit()
    s.close()
    (d / "analytics" / "tenant=x" / "date=2026-10-21").mkdir(parents=True)
    (d / "analytics" / "tenant=x" / "date=2026-10-21" / "e.ndjson").write_text('{"event_name":"page_view"}\n')
    (d / "analytics.duckdb").write_bytes(b"DUCK-test")
    return d


def test_backup_restore_round_trip(data_dir, tmp_path):
    out = tmp_path / "backups"
    bdir = bt.backup(data_dir, out)
    man = json.loads((bdir / "MANIFEST.json").read_text())
    paths = {f["path"] for f in man["files"]}
    assert {"pb_data/data.db", "pb_data/auxiliary.db", "economy.db", "spend.db", "jobs.db", "analytics.duckdb"} <= paths
    assert any(p.startswith("analytics/") for p in paths)
    assert all(f["integrity"] == "ok" for f in man["files"] if f["method"] == "sqlite-online-backup")
    # SHA-256 manifest is sha256sum-compatible
    r = subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=bdir, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    # counts in the manifest equal the live source
    pbc = next(f for f in man["files"] if f["path"] == "pb_data/data.db")["counts"]
    assert pbc["users"] > 0 and pbc["tenants"] >= 2 and pbc["agents"] > 0
    for t, n in pbc.items():
        assert n == _count(data_dir / "pb_data/data.db", t), t

    target = tmp_path / "restored"
    bt.restore(bdir, target)
    for f in man["files"]:
        assert bt.sha256(target / f["path"]) == f["sha256"]
    proc = subprocess.Popen([str(PB_BIN), "serve", f"--dir={target / 'pb_data'}", f"--migrationsDir={ROOT / 'services/pocketbase/pb_migrations'}",
                             f"--hooksDir={ROOT / 'services/pocketbase/pb_hooks'}", f"--http=127.0.0.1:{RESTORE_PORT}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ok = False
        for _ in range(60):
            try:
                ok = httpx.get(f"http://127.0.0.1:{RESTORE_PORT}/api/health", timeout=1).status_code == 200
            except httpx.HTTPError:
                ok = False
            if ok:
                break
            time.sleep(0.25)
        assert ok, "PocketBase did not start on the restored data"
        tok = httpx.post(f"http://127.0.0.1:{RESTORE_PORT}/api/collections/_superusers/auth-with-password",
                         json={"identity": "svc@test.local", "password": "test-password-123"}).json()["token"]
        for t in ("users", "agents", "tenants"):
            r = httpx.get(f"http://127.0.0.1:{RESTORE_PORT}/api/collections/{t}/records", params={"perPage": 1}, headers={"Authorization": tok})
            assert r.status_code == 200 and r.json()["totalItems"] == pbc[t], t
        assert httpx.get(f"http://127.0.0.1:{RESTORE_PORT}/api/collections/users/records").status_code == 403  # ACLs survive
    finally:
        proc.terminate()
        proc.wait(10)
    assert _count(target / "economy.db", "accounts") == _count(data_dir / "economy.db", "accounts")
    assert _count(target / "jobs.db", "jobs") == 1


def test_restore_refuses_non_empty_target_and_tampering(data_dir, tmp_path):
    bdir = bt.backup(data_dir, tmp_path / "b")
    target = tmp_path / "t"
    target.mkdir()
    (target / "keep.txt").write_text("existing data")
    with pytest.raises(SystemExit, match="not empty"):
        bt.restore(bdir, target)
    bt.restore(bdir, target, force=True)  # moved aside, never deleted
    aside = [p for p in target.iterdir() if p.name.startswith(".pre-restore-")]
    assert len(aside) == 1 and (aside[0] / "keep.txt").read_text() == "existing data"
    # tampering with any file (or the manifest) is detected before anything is restored
    bad = tmp_path / "bad"
    shutil.copytree(bdir, bad)
    with open(bad / "economy.db", "ab") as f:
        f.write(b"x")
    with pytest.raises(SystemExit, match="checksum mismatch"):
        bt.restore(bad, tmp_path / "t2")
    assert not (tmp_path / "t2").exists() or not any((tmp_path / "t2").iterdir())
    bad2 = tmp_path / "bad2"
    shutil.copytree(bdir, bad2)
    (bad2 / "extra.db").write_text("planted")
    with pytest.raises(SystemExit, match="not in the manifest"):
        bt.verify(bad2)


def test_shell_wrappers(data_dir, tmp_path):
    r = subprocess.run(["bash", str(ROOT / "scripts/backup.sh"), str(data_dir), str(tmp_path / "out")], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    bdir = next((tmp_path / "out").glob("palasora-*"))
    r = subprocess.run(["bash", str(ROOT / "scripts/restore.sh"), "--verify", str(bdir)], capture_output=True, text=True)
    assert r.returncode == 0 and "verify: OK" in r.stdout, r.stdout + r.stderr
    tgt = tmp_path / "tgt"
    tgt.mkdir()
    (tgt / "x").write_text("1")
    r = subprocess.run(["bash", str(ROOT / "scripts/restore.sh"), str(bdir), str(tgt)], capture_output=True, text=True)
    assert r.returncode != 0 and "refusing to overwrite" in (r.stdout + r.stderr)
