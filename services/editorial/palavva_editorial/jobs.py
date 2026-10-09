"""Durable SQLite job queue (09 §Internal APIs, ADR-008).

Transactional claim with lease, heartbeat, bounded attempts with jittered exponential
backoff, dead letters, and a unique idempotency key so replays never duplicate work.
"""
from __future__ import annotations

import json
import random
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
  lease_owner TEXT, lease_until REAL, next_at REAL NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
  error_class TEXT, result TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_ready ON jobs (state, next_at);
CREATE TABLE IF NOT EXISTS job_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, attempt INTEGER NOT NULL, started_at REAL NOT NULL,
  finished_at REAL, outcome TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS dead_letters (
  job_id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, payload TEXT, error TEXT, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_usage (
  day TEXT NOT NULL, tenant_id TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, tenant_id)
);
"""


class Queue:
    def __init__(self, path: Path | str, lease_seconds: int = 300):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.lease_seconds = lease_seconds
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA busy_timeout=5000")
        try:
            yield c
        finally:
            c.close()

    def enqueue(self, tenant_id: str, type_: str, payload: dict, idempotency_key: str, max_attempts: int = 3, delay: float = 0) -> tuple[str, bool]:
        """Returns (job_id, created). A duplicate idempotency key returns the existing job."""
        now = time.time()
        jid = uuid.uuid4().hex
        with self._conn() as c:
            try:
                c.execute("INSERT INTO jobs (job_id, tenant_id, type, payload, max_attempts, next_at, idempotency_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                          (jid, tenant_id, type_, json.dumps(payload), max_attempts, now + delay, idempotency_key, now, now))
                return jid, True
            except sqlite3.IntegrityError:
                row = c.execute("SELECT job_id FROM jobs WHERE idempotency_key=?", (idempotency_key,)).fetchone()
                return row["job_id"], False

    def claim(self, owner: str, types: list[str] | None = None) -> dict[str, Any] | None:
        now = time.time()
        with self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            try:
                # Expired leases go back to the pool (worker crashed or was restarted).
                c.execute("UPDATE jobs SET state='queued', lease_owner=NULL, lease_until=NULL, updated_at=? WHERE state='running' AND lease_until < ?", (now, now))
                q = "SELECT * FROM jobs WHERE state='queued' AND next_at <= ?"
                args: list[Any] = [now]
                if types:
                    q += f" AND type IN ({','.join('?' * len(types))})"
                    args += types
                row = c.execute(q + " ORDER BY next_at LIMIT 1", args).fetchone()
                if not row:
                    c.execute("COMMIT")
                    return None
                c.execute("UPDATE jobs SET state='running', lease_owner=?, lease_until=?, attempts=attempts+1, updated_at=? WHERE job_id=?",
                          (owner, now + self.lease_seconds, now, row["job_id"]))
                c.execute("INSERT INTO job_attempts (job_id, attempt, started_at) VALUES (?,?,?)", (row["job_id"], row["attempts"] + 1, now))
                c.execute("COMMIT")
            except Exception:
                c.execute("ROLLBACK")
                raise
        job = dict(row)
        job["attempts"] += 1
        job["payload"] = json.loads(job["payload"])
        return job

    def heartbeat(self, job_id: str, owner: str) -> bool:
        with self._conn() as c:
            cur = c.execute("UPDATE jobs SET lease_until=? WHERE job_id=? AND lease_owner=? AND state='running'", (time.time() + self.lease_seconds, job_id, owner))
            return cur.rowcount == 1

    def _finish_attempt(self, c: sqlite3.Connection, job_id: str, outcome: str, error: str = "") -> None:
        c.execute("UPDATE job_attempts SET finished_at=?, outcome=?, error=? WHERE id=(SELECT MAX(id) FROM job_attempts WHERE job_id=?)",
                  (time.time(), outcome, error[:500], job_id))

    def complete(self, job_id: str, owner: str, result: dict | None = None) -> bool:
        with self._conn() as c:
            cur = c.execute("UPDATE jobs SET state='done', lease_owner=NULL, lease_until=NULL, result=?, updated_at=? WHERE job_id=? AND lease_owner=?",
                            (json.dumps(result or {}), time.time(), job_id, owner))
            self._finish_attempt(c, job_id, "done")
            return cur.rowcount == 1

    def defer(self, job_id: str, owner: str, seconds: float, reason: str) -> None:
        """Push back without consuming an attempt (e.g. Qwen offline, budget exhausted)."""
        with self._conn() as c:
            c.execute("UPDATE jobs SET state='queued', lease_owner=NULL, lease_until=NULL, attempts=MAX(attempts-1,0), next_at=?, error_class=?, updated_at=? WHERE job_id=? AND lease_owner=?",
                      (time.time() + seconds, reason[:80], time.time(), job_id, owner))
            self._finish_attempt(c, job_id, "deferred", reason)

    def fail(self, job_id: str, owner: str, error_class: str, error: str = "", retryable: bool = True) -> str:
        now = time.time()
        with self._conn() as c:
            row = c.execute("SELECT * FROM jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row or row["lease_owner"] != owner:
                return "not_owner"
            self._finish_attempt(c, job_id, "failed", f"{error_class}: {error}")
            if retryable and row["attempts"] < row["max_attempts"]:
                backoff = min(3600, (2 ** row["attempts"]) * 30) * (0.75 + random.random() * 0.5)
                c.execute("UPDATE jobs SET state='queued', lease_owner=NULL, lease_until=NULL, next_at=?, error_class=?, updated_at=? WHERE job_id=?",
                          (now + backoff, error_class, now, job_id))
                return "retry"
            c.execute("UPDATE jobs SET state='dead', lease_owner=NULL, lease_until=NULL, error_class=?, updated_at=? WHERE job_id=?", (error_class, now, job_id))
            c.execute("INSERT OR REPLACE INTO dead_letters (job_id, tenant_id, type, payload, error, created_at) VALUES (?,?,?,?,?,?)",
                      (job_id, row["tenant_id"], row["type"], row["payload"], f"{error_class}: {error}"[:1000], now))
            return "dead"

    def requeue_dead(self, job_id: str) -> bool:
        with self._conn() as c:
            cur = c.execute("UPDATE jobs SET state='queued', attempts=0, next_at=?, updated_at=? WHERE job_id=? AND state='dead'", (time.time(), time.time(), job_id))
            c.execute("DELETE FROM dead_letters WHERE job_id=?", (job_id,))
            return cur.rowcount == 1

    def stats(self) -> dict[str, Any]:
        with self._conn() as c:
            by_state = {r["state"]: r["n"] for r in c.execute("SELECT state, COUNT(*) n FROM jobs GROUP BY state")}
            by_type = {f'{r["type"]}:{r["state"]}': r["n"] for r in c.execute("SELECT type, state, COUNT(*) n FROM jobs WHERE state IN ('queued','running','dead') GROUP BY type, state")}
            oldest = c.execute("SELECT MIN(created_at) m FROM jobs WHERE state='queued'").fetchone()["m"]
            dead = [dict(r) for r in c.execute("SELECT job_id, tenant_id, type, error, created_at FROM dead_letters ORDER BY created_at DESC LIMIT 20")]
            recent = [dict(r) for r in c.execute("SELECT job_id, tenant_id, type, state, attempts, error_class, updated_at FROM jobs ORDER BY updated_at DESC LIMIT 25")]
        return {"by_state": by_state, "by_type": by_type, "oldest_queued_age_s": (time.time() - oldest) if oldest else None, "dead_letters": dead, "recent": recent}

    # --- per-tenant daily model budget (T-034: quotas, no surprise usage) ---
    def take_budget(self, tenant_id: str, limit: int) -> bool:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT requests FROM provider_usage WHERE day=? AND tenant_id=?", (day, tenant_id)).fetchone()
            used = row["requests"] if row else 0
            if used >= limit:
                c.execute("COMMIT")
                return False
            c.execute("INSERT INTO provider_usage (day, tenant_id, requests) VALUES (?,?,1) ON CONFLICT(day, tenant_id) DO UPDATE SET requests=requests+1", (day, tenant_id))
            c.execute("COMMIT")
            return True

    def budget_used(self, tenant_id: str) -> int:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self._conn() as c:
            row = c.execute("SELECT requests FROM provider_usage WHERE day=? AND tenant_id=?", (day, tenant_id)).fetchone()
            return row["requests"] if row else 0
