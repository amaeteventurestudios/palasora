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

# v1.5 (unified master W29-W31): one Global Voices subject-country feed per African country (all 54 probed
# 2026-10-10, HTTP 200). GV tags a story by the countries it is ABOUT, so these are subject-country scopes, not
# publisher geography. Coverage depth varies a lot (some feeds' newest item is years old); freshness is shown,
# never hidden, and gaps are reported in Command Center -> Countries.
GV_COUNTRY_FEEDS: list[tuple[str, str]] = [
    ("AO", "https://globalvoices.org/-/world/sub-saharan-africa/angola/feed/"),
    ("BF", "https://globalvoices.org/-/world/sub-saharan-africa/burkina-faso/feed/"),
    ("BI", "https://globalvoices.org/-/world/sub-saharan-africa/burundi/feed/"),
    ("BJ", "https://globalvoices.org/-/world/sub-saharan-africa/benin/feed/"),
    ("BW", "https://globalvoices.org/-/world/sub-saharan-africa/botswana/feed/"),
    ("CD", "https://globalvoices.org/-/world/sub-saharan-africa/dr-of-congo/feed/"),
    ("CF", "https://globalvoices.org/-/world/sub-saharan-africa/central-african-republic/feed/"),
    ("CG", "https://globalvoices.org/-/world/sub-saharan-africa/republic-of-congo/feed/"),
    ("CI", "https://globalvoices.org/-/world/sub-saharan-africa/cote-divoire/feed/"),
    ("CM", "https://globalvoices.org/-/world/sub-saharan-africa/cameroon/feed/"),
    ("CV", "https://globalvoices.org/-/world/sub-saharan-africa/cape-verde/feed/"),
    ("DJ", "https://globalvoices.org/-/world/sub-saharan-africa/djibouti/feed/"),
    ("DZ", "https://globalvoices.org/-/world/sub-saharan-africa/algeria/feed/"),
    ("EG", "https://globalvoices.org/-/world/sub-saharan-africa/egypt/feed/"),
    ("ER", "https://globalvoices.org/-/world/sub-saharan-africa/eritrea/feed/"),
    ("ET", "https://globalvoices.org/-/world/sub-saharan-africa/ethiopia/feed/"),
    ("GA", "https://globalvoices.org/-/world/sub-saharan-africa/gabon/feed/"),
    ("GH", "https://globalvoices.org/-/world/sub-saharan-africa/ghana/feed/"),
    ("GM", "https://globalvoices.org/-/world/sub-saharan-africa/gambia/feed/"),
    ("GN", "https://globalvoices.org/-/world/sub-saharan-africa/guinea/feed/"),
    ("GQ", "https://globalvoices.org/-/world/sub-saharan-africa/equatorial-guinea/feed/"),
    ("GW", "https://globalvoices.org/-/world/sub-saharan-africa/guinea-bissau/feed/"),
    ("KE", "https://globalvoices.org/-/world/sub-saharan-africa/kenya/feed/"),
    ("KM", "https://globalvoices.org/-/world/sub-saharan-africa/comoros/feed/"),
    ("LR", "https://globalvoices.org/-/world/sub-saharan-africa/liberia/feed/"),
    ("LS", "https://globalvoices.org/-/world/sub-saharan-africa/lesotho/feed/"),
    ("LY", "https://globalvoices.org/-/world/sub-saharan-africa/libya/feed/"),
    ("MA", "https://globalvoices.org/-/world/sub-saharan-africa/morocco/feed/"),
    ("MG", "https://globalvoices.org/-/world/sub-saharan-africa/madagascar/feed/"),
    ("ML", "https://globalvoices.org/-/world/sub-saharan-africa/mali/feed/"),
    ("MR", "https://globalvoices.org/-/world/sub-saharan-africa/mauritania/feed/"),
    ("MU", "https://globalvoices.org/-/world/sub-saharan-africa/mauritius/feed/"),
    ("MW", "https://globalvoices.org/-/world/sub-saharan-africa/malawi/feed/"),
    ("MZ", "https://globalvoices.org/-/world/sub-saharan-africa/mozambique/feed/"),
    ("NA", "https://globalvoices.org/-/world/sub-saharan-africa/namibia/feed/"),
    ("NE", "https://globalvoices.org/-/world/sub-saharan-africa/niger/feed/"),
    ("NG", "https://globalvoices.org/-/world/sub-saharan-africa/nigeria/feed/"),
    ("RW", "https://globalvoices.org/-/world/sub-saharan-africa/rwanda/feed/"),
    ("SC", "https://globalvoices.org/-/world/sub-saharan-africa/seychelles/feed/"),
    ("SD", "https://globalvoices.org/-/world/sub-saharan-africa/sudan/feed/"),
    ("SL", "https://globalvoices.org/-/world/sub-saharan-africa/sierra-leone/feed/"),
    ("SN", "https://globalvoices.org/-/world/sub-saharan-africa/senegal/feed/"),
    ("SO", "https://globalvoices.org/-/world/sub-saharan-africa/somalia/feed/"),
    ("SS", "https://globalvoices.org/-/world/sub-saharan-africa/south-sudan/feed/"),
    ("ST", "https://globalvoices.org/-/world/sub-saharan-africa/sao-tome-and-principe/feed/"),
    ("SZ", "https://globalvoices.org/-/world/sub-saharan-africa/swaziland/feed/"),
    ("TD", "https://globalvoices.org/-/world/sub-saharan-africa/chad/feed/"),
    ("TG", "https://globalvoices.org/-/world/sub-saharan-africa/togo/feed/"),
    ("TN", "https://globalvoices.org/-/world/sub-saharan-africa/tunisia/feed/"),
    ("TZ", "https://globalvoices.org/-/world/sub-saharan-africa/tanzania/feed/"),
    ("UG", "https://globalvoices.org/-/world/sub-saharan-africa/uganda/feed/"),
    ("ZA", "https://globalvoices.org/-/world/sub-saharan-africa/south-africa/feed/"),
    ("ZM", "https://globalvoices.org/-/world/sub-saharan-africa/zambia/feed/"),
    ("ZW", "https://globalvoices.org/-/world/sub-saharan-africa/zimbabwe/feed/"),
]
COUNTRY_NAMES = {}  # filled lazily from the web registry for display names


def _country_name(iso: str) -> str:
    global COUNTRY_NAMES
    if not COUNTRY_NAMES:
        import json as _j
        from pathlib import Path as _P
        reg = _P(__file__).resolve().parents[3] / "apps" / "web" / "lib" / "i18n" / "registry.json"
        COUNTRY_NAMES = {k: v["name"] for k, v in _j.loads(reg.read_text())["countries"].items()}
    return COUNTRY_NAMES.get(iso, iso)


for _i, (_iso, _url) in enumerate(GV_COUNTRY_FEEDS):
    SOURCES.append({**GV, "publisher_name": f"Global Voices ({_country_name(_iso)})", "endpoint_url": _url, "allowed_hosts": ["globalvoices.org"],
                    "languages": ["en"], "feed_languages": ["en"], "countries": [_iso], "coverage_areas": [_iso], "attribution_text": "Global Voices",
                    "fetch_interval_minutes": 240})
# Global Voices Lingua editions with current activity (probed 2026-10-10). Swahili (newest 2022) and Amharic
# (newest 2020) editions are dormant and NOT registered: Kenya/Tanzania Swahili and Ethiopia Amharic coverage
# are recorded as real gaps rather than filled with stale items.
for _code, _name, _countries in [("yo", "Global Voices Yorùbá", ["NG"]), ("ig", "Global Voices Igbo", ["NG"]),
                                 ("pt", "Global Voices em Português", []), ("mg", "Global Voices Malagasy", ["MG"])]:
    SOURCES.append({**GV, "publisher_name": _name, "endpoint_url": f"https://{_code}.globalvoices.org/feed/", "homepage_url": f"https://{_code}.globalvoices.org/",
                    "allowed_hosts": [f"{_code}.globalvoices.org"], "languages": [_code], "feed_languages": [_code], "countries": _countries,
                    "coverage_areas": _countries, "attribution_text": _name, "fetch_interval_minutes": 240})


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
