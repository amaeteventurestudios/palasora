"""DuckDB ETL: NDJSON events -> daily aggregates in PocketBase aggregated_metrics (ADR-009).

Tenant partition paths come from PocketBase tenant IDs (validated), never from client input.
Raw events older than the retention window (30 days) are deleted.
"""
from __future__ import annotations

import re
import shutil
from datetime import datetime, timedelta, timezone

import duckdb

from .config import Settings
from .pb import PB, q

RETENTION_DAYS = 30


def run(settings: Settings, pb: PB, days: int = 30) -> dict:
    out = {"tenants": 0, "rows": 0, "purged_dirs": 0}
    base = settings.analytics_dir
    if not base.exists():
        return out
    con = duckdb.connect(":memory:")
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=days)
    for t in pb.list("tenants", per_page=50):
        tid = t["id"]
        if not re.fullmatch(r"[a-z0-9]{10,20}", tid):
            continue
        tdir = base / f"tenant={tid}"
        files = sorted(tdir.glob("date=*/*.ndjson")) if tdir.exists() else []
        files = [f for f in files if f.parent.name[5:] >= cutoff.isoformat()]
        out["tenants"] += 1
        if not files:
            continue
        rows = con.execute(
            "SELECT substr(occurred_at,1,10) AS d, event_name, count(*) AS n, count(DISTINCT anonymous_session_id) AS s "
            "FROM read_json_auto(?, format='newline_delimited', union_by_name=true, columns={'occurred_at':'VARCHAR','event_name':'VARCHAR','anonymous_session_id':'VARCHAR','tenant_id':'VARCHAR'}) "
            "WHERE tenant_id = ? GROUP BY 1, 2", [[str(f) for f in files], tid]).fetchall()
        asof = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")
        for d, ev, n, sessions in rows:
            for name, count in ((ev, n), (f"{ev}:sessions", sessions)):
                if name.endswith(":sessions") and not sessions:
                    continue
                pb.upsert("aggregated_metrics", f"tenant_id={q(tid)} && date_bucket={q(d)} && event={q(name)} && country='' && topic=''",
                          {"tenant_id": tid, "date_bucket": d, "event": name, "country": "", "topic": "", "count": int(count), "source": "first-party events (DuckDB ETL)", "asof": asof})
                out["rows"] += 1
        # Retention purge of raw event partitions.
        for p in tdir.glob("date=*"):
            if p.name[5:] < (datetime.now(timezone.utc).date() - timedelta(days=RETENTION_DAYS)).isoformat():
                shutil.rmtree(p, ignore_errors=True)
                out["purged_dirs"] += 1
    con.close()
    return out
