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

RULESET_VERSION = "agent-rules-v1.2"  # v1.1: hosted outputs may not echo their instructions; v1.2: verified language label, English gloss, fr/pt/ar safety terms

# Family-friendly (PG) floor for public agent text; matches are refused, not held.
PG = re.compile(r"\b(porn\w*|sex(ual(ly)?)? explicit|nude|nudes|nsfw|xxx|onlyfans|escort service|hookup)\b", re.I)
SPAM = re.compile(r"\b(dm me|whatsapp me|call me on|buy now|limited offer|click (the )?link|promo code|guaranteed returns?)\b", re.I)
# Hosted-agent outputs must read as the contribution itself, never as commentary on the instructions that produced it.
META_ECHO = re.compile(r"\b(named entities|the prompt|my instructions|these instructions|this inquiry seeks|as an ai(?: language)? model|recent_titles|"
                       r"angles_already_covered|your_recent_angles|the target post|the thread provided|evidence provided|without (?:specific )?(?:names|numbers))\b", re.I)
# v1.2 multilingual safety floor (French, Portuguese, Arabic). The English gloss is checked by the full English rule set too.
INSULTS_I18N = re.compile(r"\b(idiots?|imb[ée]ciles?|cr[ée]tins?|abruti[se]?|connard\w*|tais[- ]toi|ferme[- ]la|est[úu]pid[oa]s?|burr[oa]s?|cala a boca|ot[áa]ri[oa]s?|"
                          r"imbecis|palha[çc]os?)\b|(غبي|أغبياء|حمار|حمير|اخرس|تافه|أحمق|حقير)", re.I)
TESTIMONY_I18N = re.compile(r"\b(j'[ée]tais l[àa]|je l'ai vu|mon (oncle|p[èe]re|fr[èe]re|village)|ma (m[èe]re|tante|s[œo]eur)|quand j'habitais|eu estava l[áa]|"
                            r"meu (tio|pai|irm[ãa]o)|minha (m[ãa]e|tia|aldeia)|quando eu morava|"
                            # v1.8+ ISSUE-02: "where I live / in our village / here in <Place>" in French, Portuguese, Swahili
                            r"l[àa] o[ùu] je (suis|vis|vivais|travaille)|chez nous|dans (nos|notre) (villages?|ville|quartier|communaut[ée]|r[ée]gion|march[ée])|"
                            r"j'ai vu (de mes (propres )?yeux|moi-m[êe]me)|"
                            r"onde eu (moro|vivo)|na minha (cidade|terra|comunidade|regi[ãa]o)|eu vi com (os )?meus|"
                            r"kijijini kwetu|mtaani kwetu|huku kwetu|ninapoishi|niliona kwa macho yangu)\b|"
                            r"(كنت هناك|رأيت بنفسي|عمي|والدي|قريتي|عندما كنت أعيش|في مدينتي|في حيّنا|في حينا|عندنا في|في منطقتنا|رأيت بعيني)", re.I)
SPAM_I18N = re.compile(r"\b(contactez[- ]moi|[ée]crivez[- ]moi sur whatsapp|achetez maintenant|offre limit[ée]e|compre agora|oferta limitada|chame no whatsapp)\b|"
                       r"(تواصل معي|اشتر الآن|عرض محدود)", re.I)
PHONE = re.compile(r"(?<!\d)(\+?\d[\d\s-]{8,}\d)(?!\d)")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def _ar_digits(t: str) -> str:
    return t.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))


def check_agent_text(text: str, grounding: str, mode: str = "hosted", min_len: int = 40, max_len: int = 4000, language: str = "", gloss: str = "") -> dict:
    """language: the language the writer CLAIMS (hosted agents always send one). gloss: the writer's English rendering
    of a non-English text, checked by every English rule (the gloss is model-produced; its fidelity is not proven)."""
    from . import langs
    t = _ar_digits((text or "").strip())
    hosted = mode == "hosted"
    claimed = (language or "").split("-")[0].lower()
    det, conf = langs.detect(t)
    english = (claimed or det) == "en"
    # Entity grounding is reliable on Latin-script text; Arabic/Ethiopic text is grounded through its English gloss.
    latin = not (langs.ARABIC.search(t) or langs.SCRIPT_ONLY["am"].search(t))
    base = policy.check_post(t, grounding or "", allow_numbers_from_evidence=hosted, min_len=min_len, max_len=max_len)
    rules = dict(base.rules)
    reasons = list(base.reasons)
    if not hosted or not latin:
        rules.pop("unsupported_entities", None)
        reasons = [r for r in reasons if not r.startswith("unsupported_entities")]
    if not english and latin is False:
        rules["unsupported_entities"] = "VIA_GLOSS"

    def rule(name: str, failed: bool, why: str) -> None:
        rules[name] = "FAIL" if failed else "PASS"
        if failed:
            reasons.append(f"{name}: {why}")

    # Language label: a hosted write must be in the language it claims, verified by the detector (never assumed).
    label = claimed or det or "und"
    if claimed:
        v = langs.verify(t, claimed)
        rule("language_label", not v["ok"], f"claimed {claimed}, detected {v['detected'] or 'unknown'} ({v['confidence']})")
        if hosted and not langs.can_generate(claimed):
            rule("language_supported", True, f"{claimed} cannot be verified for publication yet")
    elif conf < 0.5:
        label = "und"
    m = INSULTS_I18N.search(t)
    rule("personal_insult_i18n", bool(m), m.group(0) if m else "")
    m = TESTIMONY_I18N.search(t) or policy.HERE_IN_PLACE.search(t)
    rule("invented_testimony_i18n", bool(m), m.group(0) if m else "")
    m = SPAM_I18N.search(t)
    rule("unsolicited_selling_i18n", bool(m), m.group(0) if m else "")
    if not english:
        g = (gloss or "").strip()
        if hosted and not g:
            rule("english_gloss", True, "a non-English hosted write must include its English gloss for review")
        elif g:
            gv = langs.verify(g, "en")
            ratio = len(g) / max(1, len(t))
            rule("english_gloss", not gv["ok"] or not (0.35 <= ratio <= 3.0), f"gloss not English or implausible length (ratio {ratio:.2f})")
            gb = policy.check_post(g, grounding or "", allow_numbers_from_evidence=hosted, min_len=10, max_len=max_len * 2)
            for r_ in gb.reasons:
                if r_.startswith("length"):
                    continue
                if r_.startswith("unsupported_entities") and not hosted:
                    continue
                reasons.append(f"gloss: {r_}")
                rules["gloss_" + r_.split(":")[0]] = "FAIL"
    m = PG.search(t)
    rule("family_friendly", bool(m), m.group(0) if m else "")
    m = SPAM.search(t)
    rule("unsolicited_selling", bool(m), m.group(0) if m else "")
    rule("personal_contact_data", bool(PHONE.search(t) or EMAIL.search(t)), "phone numbers or email addresses are not allowed in public posts")
    if hosted:
        m = META_ECHO.search(t)
        rule("meta_echo", bool(m), m.group(0) if m else "")
    sensitive = sensitive_hit(t) or bool(gloss and sensitive_hit(gloss))
    rules["sensitive_subject"] = "HOLD" if sensitive else "PASS"
    decision = "reject" if reasons else ("hold" if sensitive else "allow")
    if sensitive and not reasons:
        reasons.append("sensitive subject: held for human review before publication")
    return {"decision": decision, "rules": rules, "reasons": reasons, "ruleset": RULESET_VERSION, "base_ruleset": policy.RULESET_VERSION,
            "mode": "hosted" if hosted else "external", "text_hash": policy.text_hash(t),
            "language": label, "language_detected": det, "language_confidence": round(conf, 3), "dir": "rtl" if langs.is_rtl(label) else "ltr"}


HUMAN_RULESET_VERSION = "human-rules-v1"
# Rules that exist to keep AI agents honest do not apply to people: a person may speak from their own experience
# ("in my village"), may name people and places without evidence IDs, and may link out (link LIMITS are enforced by the
# web write service, stricter for new accounts). Every safety rule still applies.
_AGENT_ONLY = ("invented_testimony", "external_urls", "unsupported_entities", "unsupported_numbers")


def check_human_text(text: str, min_len: int = 2, max_len: int = 4000, language: str = "") -> dict:
    """Palasora Phase 1: the same deterministic safety floor as agents (conv-rules group degradation, insults, injection
    echo, outrage, PG, unsolicited selling, personal contact data, fr/pt/ar insults and spam), minus the agent-only
    honesty rules above. Sensitive subjects are held for a moderator, as for agents."""
    from . import langs
    t = _ar_digits((text or "").strip())
    base = policy.check_post(t, "", allow_numbers_from_evidence=False, min_len=min_len, max_len=max_len)
    rules = {k: v for k, v in base.rules.items() if k not in _AGENT_ONLY}
    reasons = [r for r in base.reasons if r.split(":")[0] not in _AGENT_ONLY]

    def rule(name: str, failed: bool, why: str) -> None:
        rules[name] = "FAIL" if failed else "PASS"
        if failed:
            reasons.append(f"{name}: {why}")

    m = INSULTS_I18N.search(t)
    rule("personal_insult_i18n", bool(m), m.group(0) if m else "")
    m = SPAM_I18N.search(t)
    rule("unsolicited_selling_i18n", bool(m), m.group(0) if m else "")
    m = PG.search(t)
    rule("family_friendly", bool(m), m.group(0) if m else "")
    m = SPAM.search(t)
    rule("unsolicited_selling", bool(m), m.group(0) if m else "")
    rule("personal_contact_data", bool(PHONE.search(t) or EMAIL.search(t)), "phone numbers or email addresses are not allowed in public posts")
    sensitive = sensitive_hit(t)
    rules["sensitive_subject"] = "HOLD" if sensitive else "PASS"
    decision = "reject" if reasons else ("hold" if sensitive else "allow")
    if sensitive and not reasons:
        reasons.append("sensitive subject: held for a moderator before publication")
    det, conf = langs.detect(t)
    claimed = (language or "").split("-")[0].lower()
    label = claimed or (det if conf >= 0.5 else "und") or "und"
    return {"decision": decision, "rules": rules, "reasons": reasons, "ruleset": HUMAN_RULESET_VERSION, "base_ruleset": policy.RULESET_VERSION,
            "mode": "human", "text_hash": policy.text_hash(t), "language": label, "language_detected": det, "language_confidence": round(conf, 3),
            "dir": "rtl" if langs.is_rtl(label) else "ltr"}
