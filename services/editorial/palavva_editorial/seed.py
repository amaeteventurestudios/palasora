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


def seed_tenants(pb: PB) -> dict[str, dict]:
    palavva = pb.upsert("tenants", "slug='palavva'", {
        "slug": "palavva", "name": "Palavva", "status": "active", "canonical_host": (hostnames_for("palavva") or ["127.0.0.1:3000"])[0],
        "hostnames": hostnames_for("palavva"), "default_locale": "en", "is_demo": False,
        "branding_json": {"wordmark_text": "palavva", "primary_color": "#C34218", "accent_color": "#E85E31", "masthead_color": "#1B2030", "theme": "system"},
        "enabled_features": {"public_feed": True, "discussions": True, "human_comments": True, "editorial_ai": True, "history": True,
                             "business_directory": True, "revive_ads": False, "crm_bridge": False, "newsletter_future": False, "external_agents_future": False},
        "quotas_json": {"daily_ai_requests": 60, "max_agent_replies_per_story": 3},
    })
    sample = pb.upsert("tenants", "slug='sample-community'", {
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
        for key, val in {"INGEST_PAUSED": False, "AI_PAUSED": False, "AUTO_PUBLISH_DISABLED": False, "AD_SLOTS_DISABLED": False,
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


CANDIDATE_SOURCES = [
    # publisher, homepage, endpoint, type, class, tier, countries, topics, notes
    ("AllAfrica", "https://allafrica.com", "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf", "rss", "media", "discovery", [], [],
     "Candidate from 07. Syndication/attribution permission not verified."),
    ("Africanews", "https://www.africanews.com", "https://www.africanews.com/feed/rss", "rss", "media", "corroborated", [], [],
     "Candidate from 07. Live RSS and usage rights not verified."),
    ("Business Day (South Africa)", "https://www.businessday.co.za", "", "rss", "media", "corroborated", ["ZA"], ["fintech", "industry"],
     "Candidate from 07. Endpoint and licensing not verified."),
    ("GSMA Newsroom", "https://www.gsma.com/newsroom/", "", "rss", "media", "corroborated", [], ["telecom"],
     "Candidate from 07. Feed terms and reuse permission not verified."),
    ("Central Bank of Nigeria", "https://www.cbn.gov.ng", "", "manual", "official", "primary", ["NG"], ["fintech", "policy"],
     "Candidate from 07. Approved announcement access and reuse rules not identified."),
    ("African Union press releases", "https://au.int/en/press-releases", "", "manual", "official", "primary", [], ["policy"],
     "Candidate from 07. Automated access eligibility and terms not verified."),
    ("African Development Bank", "https://www.afdb.org", "", "manual", "official", "primary", [], ["industry", "energy"],
     "Candidate from 07. Document license not verified."),
]


def seed_sources(pb: PB, tenant: dict) -> None:
    for name, home, endpoint, etype, cls, tier, countries, topics, notes in CANDIDATE_SOURCES:
        existing = pb.first("sources", f"tenant_id={q(tenant['id'])} && publisher_name={q(name)}")
        if existing:
            continue  # never overwrite rights decisions made later
        pb.create("sources", {"tenant_id": tenant["id"], "publisher_name": name, "homepage_url": home, "endpoint_url": endpoint,
                              "endpoint_type": etype, "languages": ["en"], "countries": countries, "topic_ids": topics, "source_class": cls,
                              "trust_tier": tier, "rights_status": "pending", "usage_policy": "link_only", "rights_notes": notes,
                              "attribution_text": name, "content_retention_days": 30, "fetch_interval_minutes": 60, "request_timeout_sec": 15,
                              "rate_limit_per_hour": 4, "enabled": False, "consecutive_failures": 0, "allowed_hosts": [], "is_fixture": False})


DEMO_STORIES = [
    {
        "slug": "demo-cold-storage-coop-tomatoes", "countries": ["NG"], "topics": ["agriculture", "food"], "hours": 2, "kind": "discussion", "pick": True,
        "headline": "Could a shared cold room keep more tomatoes from spoiling before market?",
        "lede": "Demo content: a fictional farmers' co-op used to test Palavva's story layout. It is not a real news report.",
        "what": "In this fictional example, a farmers' co-operative near a market town pools money for one solar-powered cold room and books shelf space by the crate.",
        "why": "Post-harvest loss is a common question in agriculture coverage. The example shows how Palavva separates what happened from why it matters, with each point tied to a source.",
        "unknowns": ["This is fictional, so there are no real costs, yields or outcomes to report."],
        "role": ("economist", "If this were real, the useful question would be who carries the electricity and maintenance cost when prices fall, and whether smaller growers can afford a share."),
        "question": "What would make a shared cold room fair for the smallest farmers?",
    },
    {
        "slug": "demo-rainy-season-delivery-routes", "countries": ["KE"], "topics": ["logistics", "ai-software"], "hours": 5, "kind": "discussion", "pick": False,
        "headline": "How does a delivery rider plan a route when the rains close the shortcut?",
        "lede": "Demo content: a fictional delivery team in a made-up neighbourhood, used to test feed cards and filters.",
        "what": "A fictional last-mile delivery team shares a simple rule: riders mark flooded roads on a shared map, and dispatch reroutes orders for the rest of the afternoon.",
        "why": "Last-mile logistics stories often turn on small operating details. This sample shows how a Builder's View contribution is labeled as AI.",
        "unknowns": ["No real company, rider or route data is described here."],
        "role": ("builder", "The hard part in a real version is trust: riders need a reason to report closures quickly, and dispatch needs to expire old reports."),
        "question": "What makes a shared map trustworthy when everyone is in a hurry?",
    },
    {
        "slug": "demo-pricing-custom-kente-orders", "countries": ["GH"], "topics": ["fashion"], "hours": 9, "kind": "short", "pick": True,
        "headline": "What goes into the price of a custom woven order?",
        "lede": "Demo content: a fictional weaver's pricing checklist used to test Palavva's short story format.",
        "what": "A fictional weaver lists what she counts before quoting a custom order: thread, loom hours, design time, finishing and delivery.",
        "why": "Pricing explainers help small makers and their customers understand each other. The example is here to test layout, not to describe a real business.",
        "unknowns": ["Prices are deliberately omitted because this example is fictional."],
        "role": None, "question": "Which costs do customers most often forget?",
    },
    {
        "slug": "demo-data-bundle-expiry-explainer", "countries": ["ZA"], "topics": ["telecom"], "hours": 20, "kind": "discussion", "pick": False,
        "headline": "Why does unused mobile data expire, and who decides when?",
        "lede": "Demo content: a sample explainer used to test the Everyday Impact role label and source list.",
        "what": "This sample explainer walks through how a prepaid data bundle usually carries a validity period printed in its terms.",
        "why": "Data costs matter for households. The sample shows how Palavva would point readers to the original terms rather than paraphrase them loosely.",
        "unknowns": ["No real operator, regulator or tariff is referenced in this demo."],
        "role": ("consumer", "In a real version, the useful detail is the exact validity rule in the terms, and whether rollover is offered."),
        "question": "Would you rather have longer validity or a lower price?",
    },
    {
        "slug": "demo-neighbourhood-music-archive", "countries": ["SN"], "topics": ["music", "history-heritage"], "hours": 30, "kind": "story", "pick": True,
        "headline": "What would it take to build a neighbourhood music archive?",
        "lede": "Demo content: a fictional community project used to test the Time Lens empty state and the Culture Desk label.",
        "what": "In this fictional example, a community radio volunteer starts cataloguing cassette recordings donated by neighbours, noting who recorded each tape and when.",
        "why": "Cultural archives depend on careful provenance. The demo shows why Palavva will not invent historical records when none have been verified.",
        "unknowns": ["No real archive, recording or institution is described."],
        "role": ("culture", "A real archive would need permission from performers or their families before anything is shared publicly."),
        "question": "Who should decide what goes into a community archive?",
    },
    {
        "slug": "demo-home-bakery-cost-tracking", "countries": ["EG"], "topics": ["food", "ecommerce"], "hours": 44, "kind": "short", "pick": False,
        "headline": "How can a home bakery tell which orders actually make money?",
        "lede": "Demo content: a fictional home bakery used to test cross-topic filtering (Food + E-commerce).",
        "what": "A fictional baker tracks ingredients per batch and adds delivery fees separately, so a large order that looks profitable is checked before it is accepted.",
        "why": "Small food businesses often sell online before they have bookkeeping. This example exercises Palavva's country and topic filters.",
        "unknowns": ["No real business or figures are described."],
        "role": None, "question": "What simple habit helped your small business most?",
    },
]

SAMPLE_TENANT_STORIES = [
    {
        "slug": "sample-tenant-welcome", "countries": ["NG", "GH"], "topics": ["fintech", "food"], "hours": 3, "kind": "discussion", "pick": True,
        "headline": "Sample community: what should members discuss first?",
        "lede": "Demo content for the isolated Sample Africa Community tenant. Its existence proves tenant branding and data separation.",
        "what": "This sample tenant has its own branding, members, stories and metrics, all separate from the main Palavva tenant.",
        "why": "White-label customers will need their own communities without seeing anyone else's data.",
        "unknowns": ["This is a demonstration tenant with no real customer."],
        "role": None, "question": "Which topic should this sample community start with?",
    },
]


def seed_demo_story(pb: PB, tenant: dict, editor: dict, s: dict) -> None:
    tid = tenant["id"]
    if pb.first("editorial_pieces", f"tenant_id={q(tid)} && slug={q(s['slug'])}"):
        return
    src_url = f"https://example.invalid/demo/{s['slug']}"
    cluster = pb.create("story_clusters", {"tenant_id": tid, "slug": s["slug"], "summary": s["what"], "risk_tier": "low", "status": "published",
                                           "primary_country_codes": s["countries"], "topic_slugs": s["topics"], "latest_material_update_at": now_iso(s["hours"]),
                                           "match_explanation": "demo fixture", "entity_keys": [], "is_fixture": True})
    c1 = pb.create("evidence_claims", {"tenant_id": tid, "cluster_id": cluster["id"], "claim_key": "claim_1", "statement": s["what"], "kind": "observation",
                                       "source_item_ids": ["demo"], "verification_status": "supported", "source_locator": src_url})
    c2 = pb.create("evidence_claims", {"tenant_id": tid, "cluster_id": cluster["id"], "claim_key": "claim_2", "statement": s["why"], "kind": "interpretation",
                                       "source_item_ids": ["demo"], "verification_status": "supported", "source_locator": src_url})
    body = {
        "what_happened": [{"text": s["what"], "claim_ids": ["claim_1"]}],
        "why_it_matters": [{"text": s["why"], "claim_ids": ["claim_2"]}],
        "unknowns": s["unknowns"],
        "questions": [s["question"]] if s.get("question") else [],
        "history": {"status": "NO_VERIFIED_COMPARISON"},
    }
    risk = "low"
    piece = pb.create("editorial_pieces", {
        "tenant_id": tid, "cluster_id": cluster["id"], "slug": s["slug"], "kind": s["kind"], "headline": s["headline"], "lede": s["lede"],
        "body_blocks_json": body, "author_type": "fixture", "risk_tier": risk, "review_status": "needs_review", "revision": 1,
        "is_demo": True, "country_codes": s["countries"], "topic_slugs": s["topics"], "language": "en", "editor_pick": bool(s.get("pick")),
        "sources_json": [{"name": "Example Publisher (demo fixture)", "url": src_url, "title": "Demo fixture source", "published_at": now_iso(s["hours"] + 1)}],
        "evidence_state": "complete", "claim_check_status": "PASS", "human_comment_count": 0, "ai_contribution_count": 1 if s.get("role") else 0,
        "vote_score": 0, "save_count": 0, "still_developing": False,
    })
    pb.create("editorial_reviews", {"tenant_id": tid, "piece_id": piece["id"], "decision": "approve", "reviewer_id": editor["id"],
                                    "reason": "Seeded demo fixture (is_demo=true); approved for local layout testing only.", "risk_tier": risk, "expected_revision": 1})
    published = now_iso(s["hours"])
    pb.update("editorial_pieces", piece["id"], {"review_status": "published", "reviewer_id": editor["id"], "published_at": published, "first_published_at": published,
                                                "material_updated_at": published})
    disc = pb.create("discussions", {"tenant_id": tid, "piece_id": piece["id"], "status": "open", "human_comment_count": 0,
                                     "ai_comment_count": 1 if s.get("role") else 0})
    if s.get("role"):
        role_id, text = s["role"]
        run = pb.create("ai_runs", {"tenant_id": tid, "task_type": "role_contribution", "role_id": role_id, "provider": "fixture", "model": "demo-fixture",
                                    "prompt_version": "role-contribution-v1", "status": "succeeded", "duration_ms": 0, "is_fixture_provider": True,
                                    "input_evidence_ids": [c1["id"], c2["id"]], "cluster_id": cluster["id"]})
        pb.create("comments", {"tenant_id": tid, "discussion_id": disc["id"], "piece_id": piece["id"], "author_id": "", "author_kind": "editorial_ai",
                               "role_id": role_id, "body_text": text, "approval_state": "approved", "moderation_status": "visible",
                               "ai_run_id": run["id"], "claim_ids": ["claim_1"], "edit_revision": 1, "vote_score": 0})
    pb.audit(tid, "seed.demo_piece_published", "editorial_pieces", piece["id"], {"is_demo": True}, actor_type="system", actor_id="seed")


def seed_communities(pb: PB, tenant: dict) -> None:
    for slug, name, desc in tx.TOPIC_GROUPS:
        if not pb.first("communities", f"tenant_id={q(tenant['id'])} && slug={q(slug)}"):
            topics = [t[0] for t in tx.TOPICS if t[1] == slug]
            pb.create("communities", {"tenant_id": tenant["id"], "slug": slug, "name": name, "summary": desc, "country_codes": [],
                                      "topic_slugs": topics, "status": "published",
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
    tenants = seed_tenants(pb)
    pw = os.environ.get("LOCAL_DEMO_PASSWORD", "")
    if len(pw) < 12:
        print("LOCAL_DEMO_PASSWORD missing or too short; skipping local accounts", file=sys.stderr)
        return 1
    p, s = tenants["palavva"], tenants["sample"]
    editor = ensure_user(pb, p, "editor@palavva.local", pw, "editor", "Local Editor", "editor", "Local development editor account.")
    ensure_user(pb, p, "admin@palavva.local", pw, "admin", "Local Platform Admin", "platform_admin", "Local platform administrator.")
    ensure_user(pb, p, "moderator@palavva.local", pw, "moderator", "Local Moderator", "moderator")
    ensure_user(pb, p, "reader@palavva.local", pw, "reader", "Local Reader", "member", "A local test member.")
    s_admin = ensure_user(pb, s, "admin@sample.local", pw, "admin", "Sample Tenant Admin", "tenant_admin", "Sample tenant administrator.")
    ensure_user(pb, s, "editor@sample.local", pw, "editor", "Sample Editor", "editor")
    ensure_user(pb, s, "reader@sample.local", pw, "reader", "Sample Reader", "member")
    seed_sources(pb, p)
    seed_communities(pb, p)
    seed_communities(pb, s)
    if os.environ.get("SEED_DEMO_CONTENT", "true").lower() == "true":
        for story in DEMO_STORIES:
            seed_demo_story(pb, p, editor, story)
        for story in SAMPLE_TENANT_STORIES:
            seed_demo_story(pb, s, s_admin, story)
        seed_demo_business(pb, p)
    print("seed ok")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PBError as e:
        print("seed failed:", e, e.data, file=sys.stderr)
        sys.exit(1)
