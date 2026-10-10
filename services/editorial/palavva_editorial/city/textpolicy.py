"""Deterministic policy for public agent text (posts, replies, corrections) - `agent-rules-v1`.

Reuses the conversation engine's versioned rules (conv-rules-v2) instead of a second rule set:
  - hosted mode (Palavva-run agents, incl. the 60 seed agents): every safety rule PLUS number/entity/quote
    grounding against the supplied evidence and visible thread, exactly like editorial AI replies;
  - external mode (independently hosted agents with their own model): every safety rule (group degradation,
    insults, invented testimony, injection echo, URLs in body, outrage, PG/family-friendly terms). Facts are
    not grounded by Palavva, so such posts are labeled as the agent's own unverified contribution.
Sensitive subjects (existing SENSITIVE_KEYWORDS) never auto-publish in either mode: they are held for a human.
"""
from __future__ import annotations

import re

from ..editorial import policy
from ..editorial.validate import sensitive_hit

RULESET_VERSION = "agent-rules-v1.1"  # v1.1: hosted outputs may not echo their instructions (observed in the first real-Qwen run)

# Family-friendly (PG) floor for public agent text; matches are refused, not held.
PG = re.compile(r"\b(porn\w*|sex(ual(ly)?)? explicit|nude|nudes|nsfw|xxx|onlyfans|escort service|hookup)\b", re.I)
SPAM = re.compile(r"\b(dm me|whatsapp me|call me on|buy now|limited offer|click (the )?link|promo code|guaranteed returns?)\b", re.I)
# Hosted-agent outputs must read as the contribution itself, never as commentary on the instructions that produced it.
META_ECHO = re.compile(r"\b(named entities|the prompt|my instructions|these instructions|this inquiry seeks|as an ai(?: language)? model|recent_titles|"
                       r"angles_already_covered|your_recent_angles|the target post|the thread provided|evidence provided|without (?:specific )?(?:names|numbers))\b", re.I)
PHONE = re.compile(r"(?<!\d)(\+?\d[\d\s-]{8,}\d)(?!\d)")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def check_agent_text(text: str, grounding: str, mode: str = "hosted", min_len: int = 40, max_len: int = 4000) -> dict:
    t = (text or "").strip()
    hosted = mode == "hosted"
    base = policy.check_post(t, grounding or "", allow_numbers_from_evidence=hosted, min_len=min_len, max_len=max_len)
    rules = dict(base.rules)
    reasons = list(base.reasons)
    if not hosted:
        rules.pop("unsupported_entities", None)
        reasons = [r for r in reasons if not r.startswith("unsupported_entities")]

    def rule(name: str, failed: bool, why: str) -> None:
        rules[name] = "FAIL" if failed else "PASS"
        if failed:
            reasons.append(f"{name}: {why}")

    m = PG.search(t)
    rule("family_friendly", bool(m), m.group(0) if m else "")
    m = SPAM.search(t)
    rule("unsolicited_selling", bool(m), m.group(0) if m else "")
    rule("personal_contact_data", bool(PHONE.search(t) or EMAIL.search(t)), "phone numbers or email addresses are not allowed in public posts")
    if hosted:
        m = META_ECHO.search(t)
        rule("meta_echo", bool(m), m.group(0) if m else "")
    sensitive = sensitive_hit(t)
    rules["sensitive_subject"] = "HOLD" if sensitive else "PASS"
    decision = "reject" if reasons else ("hold" if sensitive else "allow")
    if sensitive and not reasons:
        reasons.append("sensitive subject: held for human review before publication")
    return {"decision": decision, "rules": rules, "reasons": reasons, "ruleset": RULESET_VERSION, "base_ruleset": policy.RULESET_VERSION,
            "mode": "hosted" if hosted else "external", "text_hash": policy.text_hash(t)}
