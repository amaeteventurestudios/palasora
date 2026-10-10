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
