"""Register rights-reviewed sources (docs/evidence/sources/*.md) in the platform tenant. Idempotent."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from .pb import PB, q

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")
GV = {"license_name": "CC BY 3.0", "license_url": "https://creativecommons.org/licenses/by/3.0/", "rights_status": "approved", "usage_policy": "permitted_excerpt",
      "rights_verified_by": "build-agent (pending founder/legal confirmation)", "rights_verified_at": NOW, "terms_review_date": NOW,
      "license_attribution_rule": "Name the author near the top, link the original story and the CC BY 3.0 license, state that Palavva summarized it (changes made). No third-party media.",
      "rights_notes": "Global Voices attribution policy: CC BY 3.0 unless otherwise stated; media excluded. See docs/evidence/sources/GLOBAL-VOICES-RIGHTS-REVIEW.md",
      "source_class": "media", "trust_tier": "corroborated", "fetch_interval_minutes": 120, "request_timeout_sec": 20, "rate_limit_per_hour": 1,
      "robots_review": "Crawl-delay 10; feeds not disallowed (checked 2026-10-09)", "enabled": True, "is_fixture": False, "consecutive_failures": 0,
      "content_retention_days": 30, "publisher_country": "", "publisher_area": "", "endpoint_type": "rss", "homepage_url": "https://globalvoices.org/"}
SOURCES = [
    {**GV, "publisher_name": "Global Voices (Nigeria, English)", "endpoint_url": "https://globalvoices.org/-/world/sub-saharan-africa/nigeria/feed/",
     "allowed_hosts": ["globalvoices.org"], "languages": ["en"], "feed_languages": ["en"], "countries": ["NG"], "coverage_areas": ["NG"], "attribution_text": "Global Voices"},
    {**GV, "publisher_name": "Global Voices (Sub-Saharan Africa, English)", "endpoint_url": "https://globalvoices.org/-/world/sub-saharan-africa/feed/",
     "allowed_hosts": ["globalvoices.org"], "languages": ["en"], "feed_languages": ["en"], "countries": [], "coverage_areas": [], "attribution_text": "Global Voices"},
    {**GV, "publisher_name": "Global Voices en Français", "endpoint_url": "https://fr.globalvoices.org/feed/", "homepage_url": "https://fr.globalvoices.org/",
     "allowed_hosts": ["fr.globalvoices.org"], "languages": ["fr"], "feed_languages": ["fr"], "countries": [], "coverage_areas": [], "attribution_text": "Global Voices en Français"},
    {**GV, "publisher_name": "Global Voices بالعربية", "endpoint_url": "https://ar.globalvoices.org/feed/", "homepage_url": "https://ar.globalvoices.org/",
     "allowed_hosts": ["ar.globalvoices.org"], "languages": ["ar"], "feed_languages": ["ar"], "countries": [], "coverage_areas": [], "attribution_text": "Global Voices بالعربية"},
]


def main() -> None:
    pb = PB(os.environ["PB_URL"], os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    t = pb.first("tenants", "slug='palavva'")
    for src in SOURCES:
        existing = pb.first("sources", f"tenant_id={q(t['id'])} && endpoint_url={q(src['endpoint_url'])}")
        if existing and existing.get("rights_status") == "revoked":
            print("skip (revoked by a human):", src["publisher_name"])
            continue
        r = pb.update("sources", existing["id"], src) if existing else pb.create("sources", {**src, "tenant_id": t["id"]})
        if not existing:
            pb.audit(t["id"], "source.rights_approved", "sources", r["id"], {"basis": "CC BY 3.0 attribution policy", "scope": "local development"}, actor_type="system", actor_id="build-agent")
        print("registered", src["publisher_name"])
    sa = pb.first("sources", f"tenant_id={q(t['id'])} && endpoint_url='https://www.sanews.gov.za/rss.xml'")
    if sa:
        pb.update("sources", sa["id"], {"publisher_country": "ZA", "publisher_area": "ZA-GP", "coverage_areas": ["ZA"], "feed_languages": ["en"],
                                        "license_name": "SAnews user policy (free use with credit)"})
        print("updated SAnews geo/licence metadata (publisher: Pretoria, ZA-GP)")


if __name__ == "__main__":
    main()
