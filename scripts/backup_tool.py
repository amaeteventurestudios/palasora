#!/usr/bin/env python3
"""Palasora local backup and restore (Phase 1, "baseline and backup").

Standard library only, so it runs with any python3 (no venv, no sqlite3 CLI needed).

  backup   <data_dir> <out_root>                 -> <out_root>/palasora-<UTC ts>/ with MANIFEST.json + SHA256SUMS
  verify   <backup_dir>                          -> re-hash every file against SHA256SUMS and MANIFEST.json
  restore  <backup_dir> <target_dir> [--force]   -> verify, then copy into target_dir (refuses a non-empty target
                                                    unless --force; with --force the old contents are MOVED aside
                                                    into <target_dir>/.pre-restore-<ts>/, never deleted)

What is backed up from the data dir (PALAVVA_DATA_DIR):
  * SQLite, with SQLite's ONLINE backup API (consistent while services write): pb_data/data.db, pb_data/auxiliary.db,
    economy.db, spend.db, jobs.db, search.db (economy.db may live elsewhere via ECONOMY_DB; it is still stored as economy.db)
  * every *.duckdb file in the data dir (DuckDB analytics cache) and the analytics/ event partitions (NDJSON), copied
  * pb_data/storage/ (uploaded files), copied
Each SQLite copy is integrity-checked; MANIFEST.json records size, SHA-256, integrity and row counts of key tables.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

FORMAT = "palasora-backup-v1"
SQLITE = [("pb_data/data.db", "pocketbase"), ("pb_data/auxiliary.db", "pocketbase-aux"), ("economy.db", "economy"), ("spend.db", "spend"),
          ("jobs.db", "jobs"), ("search.db", "search")]
TREES = ["pb_data/storage", "analytics"]
# Row counts recorded for the restore check (only tables that exist are counted).
COUNT_TABLES = {
    "pb_data/data.db": ["users", "tenants", "agents", "editorial_pieces", "comments", "votes", "agent_votes", "communities", "thread_events", "audit_events"],
    "economy.db": ["accounts", "journal", "rewards", "companies", "orders", "trades", "positions"],
    "spend.db": ["calls"],
    "jobs.db": ["jobs"],
}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def online_backup(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=30)
    d = sqlite3.connect(str(dst))
    try:
        s.backup(d, pages=1024, sleep=0.005)
        # A copy of a WAL database is itself in WAL mode; store it as a single self-contained file (no -wal/-shm sidecars).
        d.execute("PRAGMA journal_mode=DELETE").fetchone()
    finally:
        d.close()
        s.close()


def _ro(p: Path) -> sqlite3.Connection:
    # immutable=1: read without creating -wal/-shm files next to a backup copy
    return sqlite3.connect(f"file:{p}?mode=ro&immutable=1", uri=True)


def integrity(p: Path) -> str:
    c = _ro(p)
    try:
        return str(c.execute("pragma integrity_check").fetchone()[0])
    finally:
        c.close()


def counts(p: Path, tables: list[str]) -> dict[str, int]:
    c = _ro(p)
    try:
        have = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
        return {t: int(c.execute(f'select count(*) from "{t}"').fetchone()[0]) for t in tables if t in have}
    finally:
        c.close()


def _git(root: Path) -> str:
    try:
        return subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _pb_version(root: Path) -> str:
    pb = root / "services/pocketbase/bin/pocketbase"
    try:
        return subprocess.run([str(pb), "--version"], capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def backup(data_dir: Path, out_root: Path, economy_db: Path | None = None, root: Path | None = None) -> Path:
    data_dir = data_dir.resolve()
    if not (data_dir / "pb_data" / "data.db").exists():
        raise SystemExit(f"backup: no PocketBase data at {data_dir}/pb_data/data.db")
    root = root or Path(__file__).resolve().parents[1]
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_root.mkdir(parents=True, exist_ok=True)
    final = out_root / f"palasora-{ts}"
    n = 1
    while final.exists():
        final = out_root / f"palasora-{ts}-{n}"
        n += 1
    tmp = out_root / f".{final.name}.partial"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    files: list[dict] = []
    for rel, kind in SQLITE:
        src = (economy_db if rel == "economy.db" and economy_db else data_dir / rel)
        if not src.exists():
            continue
        dst = tmp / rel
        online_backup(src, dst)
        ok = integrity(dst)
        if ok != "ok":
            shutil.rmtree(tmp, ignore_errors=True)
            raise SystemExit(f"backup: integrity check failed for {rel}: {ok}")
        files.append({"path": rel, "kind": kind, "method": "sqlite-online-backup", "integrity": ok, "counts": counts(dst, COUNT_TABLES.get(rel, []))})
    for p in sorted(data_dir.glob("*.duckdb")):
        shutil.copy2(p, tmp / p.name)
        files.append({"path": p.name, "kind": "duckdb", "method": "copy"})
    for rel in TREES:
        src = data_dir / rel
        if src.is_dir():
            shutil.copytree(src, tmp / rel)
            for f in sorted((tmp / rel).rglob("*")):
                if f.is_file():
                    files.append({"path": str(f.relative_to(tmp)), "kind": rel.split("/")[-1], "method": "copy"})
    for f in files:
        p = tmp / f["path"]
        f["bytes"] = p.stat().st_size
        f["sha256"] = sha256(p)
    migs = sorted(x.name for x in (root / "services/pocketbase/pb_migrations").glob("*.js")) if (root / "services/pocketbase/pb_migrations").exists() else []
    manifest = {"format": FORMAT, "created_utc": ts, "git_commit": _git(root), "pocketbase": _pb_version(root), "migrations": migs,
                "source_data_dir": str(data_dir), "files": files}
    (tmp / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    lines = [f"{f['sha256']}  {f['path']}" for f in files] + [f"{sha256(tmp / 'MANIFEST.json')}  MANIFEST.json"]
    (tmp / "SHA256SUMS").write_text("\n".join(lines) + "\n")
    os.replace(tmp, final)  # atomic: a backup folder only ever appears complete
    return final


def verify(bdir: Path) -> dict:
    """Raise SystemExit on any mismatch; return the manifest when every file matches."""
    sums_p, man_p = bdir / "SHA256SUMS", bdir / "MANIFEST.json"
    if not sums_p.exists() or not man_p.exists():
        raise SystemExit(f"verify: {bdir} is not a Palasora backup (SHA256SUMS or MANIFEST.json missing)")
    expected: dict[str, str] = {}
    for line in sums_p.read_text().splitlines():
        if line.strip():
            digest, rel = line.split("  ", 1)
            expected[rel] = digest
    if "MANIFEST.json" not in expected:
        raise SystemExit("verify: SHA256SUMS does not cover MANIFEST.json")
    bad = [rel for rel, d in expected.items() if not (bdir / rel).is_file() or sha256(bdir / rel) != d]
    if bad:
        raise SystemExit(f"verify: checksum mismatch or missing file: {', '.join(bad[:10])}")
    man = json.loads(man_p.read_text())
    if man.get("format") != FORMAT:
        raise SystemExit(f"verify: unknown backup format {man.get('format')!r}")
    listed = {f["path"]: f["sha256"] for f in man["files"]}
    if set(listed) != set(expected) - {"MANIFEST.json"} or any(listed[k] != expected[k] for k in listed):
        raise SystemExit("verify: MANIFEST.json and SHA256SUMS disagree")
    present = {str(p.relative_to(bdir)) for p in bdir.rglob("*") if p.is_file()} - {"SHA256SUMS", "MANIFEST.json"}
    extra = present - set(listed)
    if extra:
        raise SystemExit(f"verify: files not in the manifest: {', '.join(sorted(extra)[:10])}")
    for f in man["files"]:
        if f.get("method") == "sqlite-online-backup" and integrity(bdir / f["path"]) != "ok":
            raise SystemExit(f"verify: integrity check failed for {f['path']}")
    return man


def restore(bdir: Path, target: Path, force: bool = False) -> dict:
    man = verify(bdir)
    target.mkdir(parents=True, exist_ok=True)
    existing = [p for p in target.iterdir() if not p.name.startswith(".pre-restore-")]
    if existing:
        if not force:
            raise SystemExit(f"restore: {target} is not empty ({len(existing)} entries); refusing to overwrite. Use --force to move the "
                             f"current contents aside into {target}/.pre-restore-<ts>/ (nothing is deleted).")
        aside = target / f".pre-restore-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        aside.mkdir()
        for p in existing:
            shutil.move(str(p), str(aside / p.name))
    for f in man["files"]:
        dst = target / f["path"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bdir / f["path"], dst)
        if sha256(dst) != f["sha256"]:
            raise SystemExit(f"restore: copy of {f['path']} does not match its checksum")
    for d in ("run", "logs", "mail-sink"):
        (target / d).mkdir(exist_ok=True)
    (target / "RESTORED_FROM.json").write_text(json.dumps({"backup": str(bdir), "created_utc": man["created_utc"], "git_commit": man["git_commit"],
                                                           "restored_utc": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}, indent=2) + "\n")
    return man


def prune(out_root: Path, keep: int) -> list[str]:
    dirs = sorted((p for p in out_root.glob("palasora-*") if p.is_dir()), key=lambda p: p.name, reverse=True)
    gone = []
    for p in dirs[keep:]:
        shutil.rmtree(p)
        gone.append(p.name)
    return gone


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("backup"); b.add_argument("data_dir"); b.add_argument("out_root"); b.add_argument("--keep", type=int, default=14)
    b.add_argument("--economy-db", default=os.environ.get("ECONOMY_DB") or None)
    v = sub.add_parser("verify"); v.add_argument("backup_dir")
    r = sub.add_parser("restore"); r.add_argument("backup_dir"); r.add_argument("target_dir"); r.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)
    t0 = time.time()
    if a.cmd == "backup":
        out = backup(Path(a.data_dir), Path(a.out_root), Path(a.economy_db) if a.economy_db else None)
        man = json.loads((out / "MANIFEST.json").read_text())
        total = sum(f["bytes"] for f in man["files"])
        pruned = prune(Path(a.out_root), a.keep) if a.keep > 0 else []
        print(f"backup: {out} ({len(man['files'])} files, {total / 1e6:.1f} MB, {time.time() - t0:.1f}s)" + (f"; pruned {len(pruned)} old" if pruned else ""))
        for f in man["files"]:
            if f.get("counts"):
                print(f"  {f['path']}: " + ", ".join(f"{k}={n}" for k, n in f["counts"].items()))
    elif a.cmd == "verify":
        man = verify(Path(a.backup_dir))
        print(f"verify: OK {a.backup_dir} ({len(man['files'])} files + manifest, created {man['created_utc']}, commit {man['git_commit'][:7]})")
    else:
        man = restore(Path(a.backup_dir), Path(a.target_dir), a.force)
        print(f"restore: OK {len(man['files'])} files from {a.backup_dir} into {a.target_dir} (checksums verified before and after copy)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
