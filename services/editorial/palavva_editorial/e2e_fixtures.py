"""E2E fixture scenario for the isolated TEST stack only (refuses to run unless PALAVVA_ENV=test).

Ingests the synthetic fixture feed from disk (no network), drafts with the deterministic
FIXTURE provider, and creates an unverified member. All output is is_fixture/is_demo.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from . import config
from .ingest.fetch import FetchResult
from .jobs import Queue
from .pb import PB, q
from .pipeline import draft_cluster, ingest_source
from .providers.fixture import FixtureProvider
from .seed import ensure_user
from .worker import reindex_all

FX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def main() -> None:
    if os.environ.get("PALAVVA_ENV") != "test":
        raise SystemExit("e2e_fixtures only runs against the test stack")
    s = config.load()
    pb = PB(s.pb_url, os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    t = pb.first("tenants", "slug='palavva'")
    if pb.first("sources", f"tenant_id={q(t['id'])} && publisher_name='Fixture Wire (synthetic)'"):
        print("fixtures present")
        return
    src = pb.create("sources", {"tenant_id": t["id"], "publisher_name": "Fixture Wire (synthetic)", "endpoint_url": "https://fixture.example/feed.xml", "endpoint_type": "rss",
                                "rights_status": "approved", "usage_policy": "permitted_excerpt", "enabled": False, "source_class": "media", "trust_tier": "corroborated",
                                "fetch_interval_minutes": 60, "request_timeout_sec": 5, "allowed_hosts": ["fixture.example"], "is_fixture": True, "consecutive_failures": 0,
                                "rights_notes": "Synthetic test fixture; not a real publisher.", "license_url": "https://fixture.example/terms"})
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000").encode()
    body = (FX / "rss_good.xml").read_bytes().replace(b"{NOW}", now)
    queue = Queue(s.jobs_db)
    ingest_source(pb, queue, s, src, fetcher=lambda url, allowed=None, **kw: FetchResult(200, body, url, "application/rss+xml"), force=True)
    while (job := queue.claim("e2e", ["draft_cluster"])):
        queue.complete(job["job_id"], "e2e", draft_cluster(pb, queue, s, FixtureProvider(), job))
    pw = os.environ["LOCAL_DEMO_PASSWORD"]
    u = ensure_user(pb, t, "unverified@palavva.local", pw, "unverified", "Unverified Member", "member")
    pb.update("users", u["id"], {"verified": False})
    reindex_all(pb, s)
    print("e2e fixtures ok")


if __name__ == "__main__":
    main()
