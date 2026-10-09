"""Record the SAnews rights review (docs/evidence/sources/SANEWS-RIGHTS-REVIEW.md) in the source registry."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from .pb import PB, q


def main() -> None:
    pb = PB(os.environ["PB_URL"], os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    t = pb.first("tenants", "slug='palavva'")
    data = {
        "tenant_id": t["id"], "publisher_name": "SAnews.gov.za (South African Government News Agency)", "homepage_url": "https://www.sanews.gov.za/",
        "endpoint_url": "https://www.sanews.gov.za/rss.xml", "endpoint_type": "rss", "languages": ["en"], "countries": ["ZA"], "topic_ids": ["policy"],
        "source_class": "official", "trust_tier": "primary", "rights_status": "approved", "usage_policy": "permitted_excerpt",
        "license_url": "https://www.sanews.gov.za/node/64094", "rights_verified_by": "build-agent (pending founder/legal confirmation)",
        "rights_verified_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z"),
        "rights_notes": "User policy: media may use content free of charge with credit to SAnews.gov.za; photos credited to DOC (not copied). Local development only until founder confirms. See docs/evidence/sources/SANEWS-RIGHTS-REVIEW.md",
        "attribution_text": "SAnews.gov.za", "content_retention_days": 30, "fetch_interval_minutes": 60, "request_timeout_sec": 15, "rate_limit_per_hour": 2,
        "robots_review": "rss.xml not disallowed (checked 2026-10-08)", "terms_review_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z"),
        "enabled": True, "allowed_hosts": ["www.sanews.gov.za"], "is_fixture": False, "consecutive_failures": 0,
    }
    r = pb.upsert("sources", f"tenant_id={q(t['id'])} && endpoint_url={q(data['endpoint_url'])}", data)
    pb.audit(t["id"], "source.rights_approved", "sources", r["id"], {"basis": "published user policy", "scope": "local development"}, actor_type="system", actor_id="build-agent")
    print("registered", r["id"])


if __name__ == "__main__":
    main()
