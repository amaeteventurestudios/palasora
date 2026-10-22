"""Idempotent seed: reference taxonomy, tenants, local accounts, source registry, demo fixtures.

Demo fixtures are ALWAYS `is_demo=true`, carry a visible "Demo content" badge in the UI,
use obviously fictional framing, and cite only `example.invalid` URLs. They are never
indexed or put in sitemaps. No real-world political headlines, sponsors or metrics are seeded.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone

from . import taxonomy as tx
from .config import shared_path
from .pb import PB, PBError, q


def now_iso(delta_hours: float = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=delta_hours)).strftime("%Y-%m-%d %H:%M:%S.000Z")


def hostnames_for(slug: str) -> list[str]:
    hosts = json.loads(os.environ.get("TENANT_HOSTS", "{}"))
    return sorted(h for h, s in hosts.items() if s == slug)


def seed_reference(pb: PB) -> None:
    for iso2, name, region, prio in tx.COUNTRIES:
        pb.upsert("countries", f"iso2={q(iso2)}", {"iso2": iso2, "slug": tx.slugify(name), "name": name, "region": region,
                                                    "enabled": True, "priority": prio})
    for i, (slug, name, desc) in enumerate(tx.TOPIC_GROUPS):
        pb.upsert("topic_groups", f"slug={q(slug)}", {"slug": slug, "name": name, "sort": i, "enabled": True, "description": desc})
    for i, (slug, group, name, desc, kws) in enumerate(tx.TOPICS):
        pb.upsert("topics", f"slug={q(slug)}", {"slug": slug, "group_slug": group, "name": name, "description": desc,
                                                "keywords_json": kws, "enabled": True, "sort": i})


def ensure_tenant(pb: PB, slug: str, data: dict) -> dict:
    """Create a tenant once. Never overwrite admin-edited branding, features or quotas on later runs
    (bug found in v1.3: re-seeding reset quotas/branding on every restart). Only hostnames are refreshed."""
    existing = pb.first("tenants", f"slug={q(slug)}")
    if existing:
        return pb.update("tenants", existing["id"], {"hostnames": data["hostnames"], "canonical_host": data["canonical_host"]})
    return pb.create("tenants", data)


def seed_geo(pb: PB) -> int:
    """geo_areas from versioned boundary files (country -> admin1). Aliases stay empty: the news gazetteer that filled
    them was removed in Palasora Phase 5."""
    import json
    d = shared_path("public/geo")
    n = 0
    for f in sorted(d.glob("*.json")) if d.exists() else []:
        j = json.loads(f.read_text())
        cc = j["country"]
        name = next((c[1] for c in tx.COUNTRIES if c[0] == cc), cc)
        pb.upsert("geo_areas", f"code={q(cc)}", {"code": cc, "country": cc, "level": "country", "kind": "country", "name": name, "names": {"en": name}, "aliases": [],
                                                  "ambiguous_aliases": [], "parent_code": "", "dataset": j["dataset"], "dataset_version": j["version"], "geometry_available": True})
        kind = {"NG": "state", "ZA": "province", "KE": "county", "GH": "region", "SN": "region"}.get(cc, "admin1")
        for a in j["areas"]:
            g = None
            aliases: list[str] = []
            pb.upsert("geo_areas", f"code={q(a['code'])}", {"code": a["code"], "country": cc, "level": "admin1", "kind": "federal capital territory" if a["code"] == "NG-FC" else kind,
                                                            "name": g[0] if g else a["name"], "names": {"en": g[0] if g else a["name"]}, "aliases": aliases,
                                                            "ambiguous_aliases": g[2] if g else [], "parent_code": cc, "centroid": [a["cx"], a["cy"]],
                                                            "dataset": j["dataset"], "dataset_version": j["version"], "geometry_available": True})
            n += 1
    return n


def seed_tenants(pb: PB) -> dict[str, dict]:
    palavva = ensure_tenant(pb, "palavva", {
        "slug": "palavva", "name": "Palavva", "status": "active", "canonical_host": (hostnames_for("palavva") or ["127.0.0.1:3000"])[0],
        "hostnames": hostnames_for("palavva"), "default_locale": "en", "is_demo": False,
        "branding_json": {"wordmark_text": "palavva", "primary_color": "#C34218", "accent_color": "#E85E31", "masthead_color": "#1B2030", "theme": "system"},
        "enabled_features": {"public_feed": True, "discussions": True, "human_comments": True, "editorial_ai": True, "history": True,
                             "business_directory": True, "revive_ads": False, "crm_bridge": False, "newsletter_future": False, "external_agents_future": False},
        "quotas_json": {"daily_ai_requests": 60, "max_agent_replies_per_story": 3},
    })
    sample = ensure_tenant(pb, "sample-community", {
        "slug": "sample-community", "name": "Sample Africa Community", "status": "active",
        "canonical_host": (hostnames_for("sample-community") or ["sample.localhost:3000"])[0],
        "hostnames": hostnames_for("sample-community"), "default_locale": "en", "is_demo": True,
        "branding_json": {"wordmark_text": "Sample Africa Community", "primary_color": "#2F5D8A", "accent_color": "#F8C45C", "masthead_color": "#16324F", "theme": "system"},
        "enabled_features": {"public_feed": True, "discussions": True, "human_comments": True, "editorial_ai": True, "history": False,
                             "business_directory": True, "revive_ads": False, "crm_bridge": False, "newsletter_future": False, "external_agents_future": False},
        "quotas_json": {"daily_ai_requests": 10, "max_agent_replies_per_story": 2},
    })
    for t in (palavva, sample):
        pb.upsert("tenant_entitlements", f"tenant_id={q(t['id'])}", {"tenant_id": t["id"], "plan_key": "platform" if t["slug"] == "palavva" else "sample",
                                                                   "cycle": "monthly", "billing_status": "not_enabled", "feature_flags_json": {}})
        for key, val in {"AI_PAUSED": False, "AUTO_PUBLISH_DISABLED": False, "AD_SLOTS_DISABLED": False,
                         "PUBLISHING_PAUSED": False, "ANALYTICS_ENABLED": True, "DEMO_THREADS_ENABLED": True}.items():
            if not pb.first("tenant_settings", f"tenant_id={q(t['id'])} && key={q(key)}"):
                pb.create("tenant_settings", {"tenant_id": t["id"], "key": key, "value": val, "changed_by": "seed", "reason": "initial default"})
        # v1.3 founder decision (19 §2): low-risk, evidenced topics publish automatically. Only flip a value
        # that no human has touched; any explicit admin choice is preserved.
        ap = pb.first("tenant_settings", f"tenant_id={q(t['id'])} && key='AUTO_PUBLISH_DISABLED'")
        if ap and ap.get("value") is True and ap.get("changed_by") == "seed":
            pb.update("tenant_settings", ap["id"], {"value": False, "changed_by": "seed-v1.3", "reason": "v1.3: risk-tiered automation for LOW/evidenced topics (19 §2)"})
            pb.audit(t["id"], "settings.switch", "tenant_settings", "AUTO_PUBLISH_DISABLED", {"value": False, "reason": "v1.3 founder decision"}, actor_type="system", actor_id="seed")
        for key, label, purpose, use_when in tx.AI_ROLES:
            pb.upsert("ai_roles", f"tenant_id={q(t['id'])} && key={q(key)}", {"tenant_id": t["id"], "key": key, "label": label, "short_label": label.replace(" · AI", ""),
                                                                              "purpose": purpose, "use_when": use_when, "prompt_version": "converse-v1", "enabled": True,
                                                                              "expertise": tx.ROLE_EXPERTISE.get(key, ""), "daily_quota": 40, "novelty_threshold": 0.45,
                                                                              "refusal_rules": "Abstain without a distinct new angle; no group generalizations, insults, invented testimony or unsupported numbers."})
        for pos in ("home_rail", "topic_hub", "country_hub", "feed_inline"):
            if not pb.first("sponsor_placements", f"tenant_id={q(t['id'])} && position_key={q(pos)}"):
                pb.create("sponsor_placements", {"tenant_id": t["id"], "position_key": pos, "revive_zone_id": "", "enabled": False,
                                                 "disclosure": "Sponsored", "allowed_topics": [], "allowed_countries": [], "approved_by": ""})
    return {"palavva": palavva, "sample": sample}


def ensure_user(pb: PB, tenant: dict, email: str, password: str, handle: str, name: str, role: str, bio: str = "") -> dict:
    existing = pb.first("users", f"email={q(email)}")
    data = {"tenant_id": tenant["id"], "handle": handle, "display_name": name, "bio": bio, "account_status": "active",
            "profile_kind": "human", "locale": "en", "verified": True, "emailVisibility": False}
    if existing:
        user = pb.update("users", existing["id"], data)
    else:
        user = pb.create("users", {**data, "email": email, "password": password, "passwordConfirm": password})
    pb.upsert("memberships", f"tenant_id={q(tenant['id'])} && user_id={q(user['id'])}",
              {"tenant_id": tenant["id"], "user_id": user["id"], "role": role, "status": "active"})
    return user


def seed_communities(pb: PB, tenant: dict) -> None:
    for slug, name, desc in tx.TOPIC_GROUPS:
        if not pb.first("communities", f"tenant_id={q(tenant['id'])} && slug={q(slug)}"):
            topics = [t[0] for t in tx.TOPICS if t[1] == slug]
            pb.create("communities", {"tenant_id": tenant["id"], "slug": slug, "name": name, "summary": desc, "country_codes": [],
                                      "topic_slugs": topics, "status": "published", "kind": "hub",
                                      "moderation_rules": "Challenge ideas, not people's dignity. Source factual claims when you can."})


def seed_demo_business(pb: PB, tenant: dict) -> None:
    if pb.first("businesses", f"tenant_id={q(tenant['id'])} && slug='demo-solar-repair-collective'"):
        return
    b = pb.create("businesses", {"tenant_id": tenant["id"], "name": "Demo Solar Repair Collective", "slug": "demo-solar-repair-collective",
                                 "country_code": "RW", "topic_slugs": ["energy"], "website": "https://example.invalid/solar-repair",
                                 "about": "Demo content: a fictional repair collective used to test the Founder Spotlight layout. Not a real business.",
                                 "profile_json": {"building": "A fictional repair service for small home solar kits.",
                                                  "for_whom": "Households with small solar systems (fictional).",
                                                  "why_started": "Used to test how Palavva separates business-submitted claims from editorial reporting.",
                                                  "learned": "Demo fixture: no real lessons are claimed.", "where": "example.invalid"},
                                 "verification_state": "unverified", "assets_rights": "none", "profile_status": "published", "is_demo": True})
    pb.create("spotlights", {"tenant_id": tenant["id"], "business_id": b["id"], "placement_type": "editorial",
                             "disclosure_text": "Independent editorial spotlight", "approval_status": "approved"})


def main() -> int:
    url = os.environ["PB_URL"]
    pb = PB(url, os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    if not pb.health():
        print("PocketBase is not reachable at", url, file=sys.stderr)
        return 1
    seed_reference(pb)
    seed_geo(pb)
    tenants = seed_tenants(pb)
    pw = os.environ.get("LOCAL_DEMO_PASSWORD", "")
    if len(pw) < 12:
        print("LOCAL_DEMO_PASSWORD missing or too short; skipping local accounts", file=sys.stderr)
        return 1
    p, s = tenants["palavva"], tenants["sample"]
    ensure_user(pb, p, "editor@palavva.local", pw, "editor", "Local Editor", "editor", "Local development editor account.")
    ensure_user(pb, p, "admin@palavva.local", pw, "admin", "Local Platform Admin", "platform_admin", "Local platform administrator.")
    ensure_user(pb, p, "moderator@palavva.local", pw, "moderator", "Local Moderator", "moderator")
    ensure_user(pb, p, "reader@palavva.local", pw, "reader", "Local Reader", "member", "A local test member.")
    ensure_user(pb, s, "admin@sample.local", pw, "admin", "Sample Tenant Admin", "tenant_admin", "Sample tenant administrator.")
    ensure_user(pb, s, "editor@sample.local", pw, "editor", "Sample Editor", "editor")
    ensure_user(pb, s, "reader@sample.local", pw, "reader", "Sample Reader", "member")
    seed_communities(pb, p)
    seed_communities(pb, s)
    if os.environ.get("SEED_AGENT_CITY", "true").lower() == "true":
        from .city.seed import ensure_trading_limits, seed_city, seed_city_v15
        print("city", seed_city(pb, p))
        if os.environ.get("SEED_CITY_V15", "true").lower() == "true":  # the 1,000-identity registry (isolated test stacks may opt out)
            print("city v15", seed_city_v15(pb, p), "trading limits", ensure_trading_limits(pb, p))
    if os.environ.get("SEED_DEMO_CONTENT", "true").lower() == "true":
        seed_demo_business(pb, p)
    print("seed ok")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PBError as e:
        print("seed failed:", e, e.data, file=sys.stderr)
        sys.exit(1)
