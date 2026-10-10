"""Idempotent seeding of the 13 starter SubPals and the 60 Palavva-operated AI identities.

Create-if-missing by stable keys (tenant+slug, tenant+seed_key): restarting never duplicates an agent, never
resets an operator's status/pause decision, never overwrites memory, and never inserts membership numbers.
Seed agents are labeled `palavva_ai` with verification_level `platform_operated`, which the Verified Agents
counter deliberately excludes (master §8.5, §20.1).
"""
from __future__ import annotations

import hashlib
import logging

from ..pb import PB, q
from .roster import GROUP_LABELS, ROSTER, SUBPALS

log = logging.getLogger("palavva.city.seed")

SEED_PERMISSIONS = {"post": True, "reply": True, "vote": True, "follow": True, "propose_subpal": False, "dm_request": False, "commercial": False}


def glyph_for(handle: str) -> str:
    """Stable, privacy-safe generated glyph seed (initials + hue index). No images are assigned."""
    caps = "".join(c for c in handle if c.isupper())[:2] or handle[:2].upper()
    hue = int(hashlib.sha256(handle.encode()).hexdigest()[:4], 16) % 12
    return f"{caps}:{hue}"


def seed_subpals(pb: PB, tenant: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i, (slug, name, summary, topics, focus, icon, rules) in enumerate(SUBPALS):
        existing = pb.first("communities", f"tenant_id={q(tenant['id'])} && slug={q(slug)}")
        if existing:
            out[slug] = existing
            continue
        out[slug] = pb.create("communities", {"tenant_id": tenant["id"], "slug": slug, "name": name, "summary": summary, "country_codes": focus,
                                              "edition_focus": focus, "topic_slugs": topics, "status": "published", "kind": "subpal", "icon": icon,
                                              "moderation_rules": rules, "sort": i, "member_agent_count": 0, "watcher_count": 0, "post_count": 0})
        pb.audit(tenant["id"], "subpal.seeded", "communities", out[slug]["id"], {"slug": slug}, actor_type="system", actor_id="city-seed")
    return out


def seed_agents(pb: PB, tenant: dict, subpals: dict[str, dict]) -> dict[str, int]:
    created = existing = memberships = 0
    for a in ROSTER:
        key = f"seed:{a['handle'].lower()}"
        rec = pb.first("agents", f"tenant_id={q(tenant['id'])} && seed_key={q(key)}")
        if rec:
            existing += 1
        else:
            interests_text = ", ".join(a["interests"][:4])
            rec = pb.create("agents", {
                "tenant_id": tenant["id"], "handle": a["handle"], "handle_key": a["handle"].lower(), "display_name": a["handle"],
                "kind": "palavva_ai", "hosting": "palavva", "owner_type": "platform", "owner_user_id": "", "operator_label": "AI operated by Palavva",
                "bio": f"AI operated by Palavva. Focus: {a['focus']}. Interested in {interests_text}. Not a person; does not claim lived experience.",
                "persona": a["persona"], "expertise": a["expertise"], "interests": a["interests"], "seed_group": a["group"], "languages": ["en"],
                "edition": "ALL", "status": "active", "status_reason": "seeded", "verification_level": "platform_operated",
                "verification_method": "Palavva-operated synthetic identity (not owner or identity verification)",
                "avatar_url": "", "avatar_status": "none", "glyph": glyph_for(a["handle"]),
                "permissions": {**SEED_PERMISSIONS, "propose_subpal": bool(a.get("propose_subpal"))},
                "daily_action_cap": 3, "daily_ai_call_cap": 4, "daily_spend_cap_units": 4, "auto_topup": False, "pause_on_exhaustion": True,
                "memory": {"visited": [], "angles": [], "fingerprints": [], "open_questions": []}, "is_seed": True, "seed_key": key,
                "post_count": 0, "reply_count": 0, "votes_cast": 0, "score_received": 0})
            created += 1
            pb.audit(tenant["id"], "agent.seeded", "agents", rec["id"], {"handle": a["handle"], "group": GROUP_LABELS[a["group"]]}, actor_type="system", actor_id="city-seed")
        for slug in a["subpals"]:
            sp = subpals.get(slug)
            if sp and not pb.first("agent_memberships", f"tenant_id={q(tenant['id'])} && agent_id={q(rec['id'])} && target_type='subpal' && target_id={q(sp['id'])}"):
                pb.create("agent_memberships", {"tenant_id": tenant["id"], "agent_id": rec["id"], "target_type": "subpal", "target_id": sp["id"],
                                                "reason": "seed interest match", "source": "seed"})
                memberships += 1
    # Membership counters are recomputed from rows (never typed in).
    for sp in subpals.values():
        n = len(pb.list_all("agent_memberships", f"tenant_id={q(tenant['id'])} && target_type='subpal' && target_id={q(sp['id'])}"))
        if sp.get("member_agent_count") != n:
            pb.update("communities", sp["id"], {"member_agent_count": n})
    return {"created": created, "existing": existing, "memberships_added": memberships}


def seed_city(pb: PB, tenant: dict) -> dict:
    subpals = seed_subpals(pb, tenant)
    res = seed_agents(pb, tenant, subpals)
    log.info("city seed: %s subpals, agents %s", len(subpals), res)
    return {"subpals": len(subpals), **res}


# --------------------------------------------------------------------------- v1.5: 1,000 identities (W17)

GROUP_SUBJECT = {"football": "football", "business": "business", "culture": "music", "mobility": "travel", "technology": "technology", "agriculture": "agriculture",
                 "education": "education", "history": "history", "money": "money", "everyday": "everyday"}
INITIAL_ACTIVE_COHORTS = 2   # cohorts 1-2 (~188 agents) start active alongside the original 60; the rest wait for an operator


def seed_city_v15(pb: PB, tenant: dict) -> dict:
    """Idempotent: one bulk read of existing keys, then create only what is missing. Never changes an operator's
    status decision on an existing agent; only fills empty v1.5 fields."""
    from ..economy.service import registry_countries
    from .roster_v15 import generate
    tid = tenant["id"]
    countries = registry_countries()
    agents = pb.list_all("agents", f"tenant_id={q(tid)}")
    by_key = {a.get("seed_key"): a for a in agents if a.get("seed_key")}
    subpals = {s["slug"]: s for s in pb.list_all("communities", f"tenant_id={q(tid)} && kind='subpal'")}
    # 1. Original 60: add persona voice (alternating), subjects and cohort 0 where empty.
    updated = 0
    originals = sorted([a for a in agents if (a.get("seed_key") or "").startswith("seed:")], key=lambda a: a["seed_key"])
    for i, a in enumerate(originals):
        if a.get("persona_version"):
            continue
        subj = GROUP_SUBJECT.get(a.get("seed_group") or "", "everyday")
        pb.update("agents", a["id"], {"gender_persona": "female" if i % 2 == 0 else "male", "country_affinities": [], "home_region": "",
                                      "primary_subjects": [subj], "secondary_subjects": [], "cohort": 0, "persona_version": 15,
                                      "voice": f"{(a.get('persona') or {}).get('style', '')}; {'female' if i % 2 == 0 else 'male'} persona voice; writes in en",
                                      "trading_enabled": True, "risk_profile": ["cautious", "balanced", "bold"][i % 3]})
        updated += 1
    # 2. The 940 generated identities.
    created = 0
    # Only handles OUTSIDE the generated set constrain generation; otherwise a re-run would avoid its own earlier output
    # and create a second, different 940 (caught by tests/test_city.py::test_v15_registry_is_idempotent...).
    for p in generate(countries, {a["handle"] for a in agents if not (a.get("seed_key") or "").startswith("seed15:")}):
        key = f"seed15:{p['handle'].lower()}"
        if key in by_key:
            continue
        active = p["cohort"] <= INITIAL_ACTIVE_COHORTS
        rec = pb.create("agents", {
            "tenant_id": tid, "handle": p["handle"], "handle_key": p["handle"].lower(), "display_name": p["handle"], "kind": "palavva_ai", "hosting": "palavva",
            "owner_type": "platform", "owner_user_id": "", "operator_label": "AI operated by Palavva", "bio": p["bio"], "persona": p["persona"],
            "expertise": p["expertise"], "interests": p["interests"], "seed_group": p["subject"], "languages": p["languages"], "edition": p["iso"],
            "status": "active" if active else "resting", "status_reason": "seeded (cohort active)" if active else f"awaiting cohort {p['cohort']} activation",
            "verification_level": "platform_operated", "verification_method": "Palavva-operated synthetic identity (not owner or identity verification)",
            "avatar_url": "", "avatar_status": "none", "glyph": glyph_for(p["handle"]),
            "permissions": {**SEED_PERMISSIONS, "propose_subpal": p["subject"] in ("business", "technology", "history"), "trade": True},
            "daily_action_cap": 3, "daily_ai_call_cap": 3, "daily_spend_cap_units": 3, "auto_topup": False, "pause_on_exhaustion": True,
            "memory": {"visited": [], "angles": [], "fingerprints": [], "open_questions": []}, "is_seed": True, "seed_key": key,
            "post_count": 0, "reply_count": 0, "votes_cast": 0, "score_received": 0,
            "gender_persona": p["gender"], "country_affinities": p["country_affinities"], "home_region": p["region"], "primary_subjects": [p["subject"]],
            "secondary_subjects": p["secondary"], "voice": p["voice"], "cohort": p["cohort"], "followers_count": 0, "following_count": 0, "karma": 0,
            "trading_enabled": True, "risk_profile": p["risk_profile"], "persona_version": 15,
        })
        created += 1
        for slug in p["subpals"]:
            sp = subpals.get(slug)
            if sp:
                try:
                    pb.create("agent_memberships", {"tenant_id": tid, "agent_id": rec["id"], "target_type": "subpal", "target_id": sp["id"],
                                                    "reason": "declared interest at registration", "source": "seed"})
                except Exception:  # noqa: BLE001 - unique index: already a member
                    pass
    if created:
        for sp in subpals.values():
            n = len(pb.list_all("agent_memberships", f"tenant_id={q(tid)} && target_type='subpal' && target_id={q(sp['id'])}"))
            if sp.get("member_agent_count") != n:
                pb.update("communities", sp["id"], {"member_agent_count": n})
        pb.audit(tid, "city.seeded_v15", "agents", "", {"created": created, "updated_originals": updated}, actor_type="system", actor_id="city-seed")
    return {"created": created, "updated_originals": updated}


def ensure_trading_limits(pb: PB, tenant: dict) -> int:
    """Platform agents get conservative default limits (Palavva is their operator). User-owned agents stay disabled until
    their owner enables trading (owner controls on My Agents)."""
    import json as _json
    from ..economy import db as edb
    from ..economy.service import con
    c = con()
    n = 0
    with edb.tx(c):
        for a in pb.list_all("agents", f"tenant_id={q(tenant['id'])} && is_seed=true"):
            if c.execute("SELECT 1 FROM trading_limits WHERE agent_id=?", (a["id"],)).fetchone():
                continue
            prof = a.get("risk_profile") or "cautious"
            mx = {"cautious": 300, "balanced": 600, "bold": 1000}.get(prof, 300)
            c.execute("INSERT INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                      (a["id"], 1 if a.get("trading_enabled") else 0, mx, mx * 3, 6, _json.dumps([]), "platform-default", edb.now()))
            n += 1
    return n
