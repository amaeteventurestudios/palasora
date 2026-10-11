"""Deterministic, non-authoring content policy for AI conversation posts (22 §4, §7; A-10).

The model never certifies its own output: every generated post passes these rules
before persistence. Rules are explicit and versioned so each decision is auditable.
Civil, evidence-grounded disagreement and critique of institutions/policies are allowed;
group degradation, personal insults, invented testimony and injection echoes are not.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

RULESET_VERSION = "conv-rules-v2"  # v2 (v1.3.1): named-entity, acronym, quotation and superlative grounding; cross-thread diversity

# Groups that must never be generalized about or ranked (ethnic, tribal, religious, national, regional).
GROUPS = r"(igbos?|yorubas?|hausas?|fulanis?|ijaws?|tivs?|kikuyus?|luos?|kalenjins?|zulus?|xhosas?|amharas?|oromos?|tigrayans?|somalis?|wolofs?|ashantis?|ewes?|" \
         r"muslims?|christians?|jews?|hindus?|pagans?|traditionalists?|arabs?|africans|blacks?|whites?|northerners|southerners|easterners|westerners|" \
         r"nigerians|ghanaians|kenyans|south africans|senegalese|egyptians|ethiopians|tribes?men|natives)"
NEGATIVE_TRAITS = r"(lazy|thieves|thieving|criminals?|corrupt|stupid|dirty|savages?|primitive|backward|violent|terrorists?|inferior|uncivili[sz]ed|greedy|liars?|cheats?|" \
                  r"animals?|parasites?|vermin|dangerous|cannot be trusted|can'?t be trusted|ruin everything|are the problem)"
GROUP_DEGRADATION = [
    re.compile(rf"\b(all|most|typical|those|these|the)?\s*{GROUPS}\s+(are|is|were|always|never|tend to be|by nature)\b[^.]{{0,40}}\b{NEGATIVE_TRAITS}\b", re.I),
    re.compile(rf"\b{NEGATIVE_TRAITS}\s+(like|as)\s+(all|most|typical)?\s*{GROUPS}\b", re.I),
    re.compile(rf"\b{GROUPS}\b[^.]{{0,30}}\b(are|is)\s+(better|superior|smarter|more civili[sz]ed)\s+than\s+[^.]{{0,20}}\b{GROUPS}\b", re.I),
]
INSULTS = re.compile(r"\b(idiots?|idiotic|morons?|stupid|fool(s|ish)?|dumb|clowns?|shut up|pathetic|ignorant (people|fools)|you people|nonsense argument|imbeciles?|retards?)\b", re.I)
# A disclosed AI must not claim lived experience or invent witnesses.
TESTIMONY = re.compile(r"\b(I (was|am) (there|a farmer|a trader|a vendor|from|born in|living in)|my (uncle|aunt|mother|father|brother|sister|cousin|village|neighbou?r)|"
                       r"as a (farmer|trader|mother|father|nigerian|ghanaian|kenyan) myself|I personally (saw|witnessed|know)|when I lived)\b", re.I)
INJECTION_ECHO = re.compile(r"ignore (all |any )?(previous|prior) instructions|system prompt|api[_ ]?key|password|publish (this|now) immediately|as an admin|BEGIN SYSTEM", re.I)
OUTRAGE = re.compile(r"\b(outrageous|disgusting|shameful|evil|wicked)\b", re.I)
NUM = re.compile(r"(?<![A-Za-z])\d[\d,.]*%?")
URL = re.compile(r"https?://\S+")
CITATION = re.compile(r"\b(claim_\d+|S\d+)\b")
DIGITS = re.compile(r"\d+")


# ---- Named-entity grounding (v2). Proper names, acronyms, quotations and factual superlatives in an AI
# reply must be found in the topic's evidence or the visible thread. Reasoning in plain words needs no
# citation; naming a person, place, organisation or programme is a factual claim.
NAME_TOK = re.compile(r"[A-Z][A-Za-z'\u2019\-]{2,}")
ACRONYM = re.compile(r"\b[A-Z][A-Z0-9&]{1,6}s?\b")
QUOTE = re.compile(r"[\"\u201c\u201d]([^\"\u201c\u201d]{12,})[\"\u201c\u201d]")
SUPERLATIVE = re.compile(r"\b(?:the\s+)?(largest|biggest|first|only|fastest|oldest|newest|highest|lowest|cheapest|most\s+expensive|leading)\s+"
                         r"(?:[a-z\-]+\s+){0,3}(?:in|on|across|of)\s+(africa|the\s+continent|the\s+country|the\s+world|the\s+region|[A-Z][a-z]+)", re.I)
GENERIC_ACRONYMS = set("AI SMS GDP VAT ICT NGO NGOS SME SMES USSD IOT ID IDS OK TV FM PV LED LEDS ATM ATMS QR GPS USB CEO CEOS HR IT PDF FAQ DIY UV EV EVS "
                       "KM KG KWH KW MW GW AM PM".split())
ENTITY_STOP = set(("The This That These Those They There Their Then When What Why How While Without With After Before During Under Over And But For From Into "
                   "Will Would Could Should Can May Might Must Has Have Had Does Did Not Its Our Your Who Whom Which Where Yet Also Still Even Instead However Perhaps "
                   "Africa African Africans January February March April May June July August September October November December "
                   "Monday Tuesday Wednesday Thursday Friday Saturday Sunday I If Is It As At By In On Of Or So To Up We You He She One Two A An No Yes "
                   "Economist Technologist Consumer Builder Ethics Culture Historian Researcher Analyst Advocate Journalist Reader Readers AI "
                   # v1.6 French / Portuguese / Swahili capitalised function words and institution nouns (not names)
                   "État Etat États Etats Estado Estados Governo Gouvernement Afrique África Afrika Je Nous Vous Il Elle Ils Elles Le La Les Un Une Des Ce Cette Ces "
                   "Mais Et Ou Donc Pourquoi Comment Quand Qui Que Quel Quelle Quels Quelles Selon Pour Avec Sans Dans Sur Chez Entre Aussi Peut Faut "
                   "Os As Um Uma Mas Porque Quando Quem Como Este Esta Isso Eu Nós Para Com Sem Sobre Entre Também Pode Segundo "
                   "Serikali Kwa Lakini Je Nani Vipi Kwanini Wakati Hii Hizi Sisi Wao").split())


REGION_WORDS = ("africa", "sahel", "maghreb", "sub-saharan", "west", "east", "north", "south", "southern", "central", "continent", "horn",
                # v1.6: world regions and demonyms used in comparative reasoning are geography, not factual claims
                "europe", "european", "asia", "asian", "america", "american", "latin", "caribbean", "gulf", "middle", "arab", "china", "chinese",
                "india", "indian", "global", "western", "eastern", "afrique", "africain", "áfrica", "africano", "europa", "européen", "asiatique")
_GEO: set[str] = set()


def _is_geo(word: str) -> bool:
    """Countries, demonyms and regions are allowed without evidence: geographic comparison is reasoning,
    a named person, organisation or programme is a factual claim (prefix match covers Nigeria/Nigerian, Kenya/Kenyan)."""
    from .. import taxonomy as tx
    if not _GEO:
        _GEO.update(w[:5] for w in REGION_WORDS)
        for _iso, name, region, _p in tx.COUNTRIES:
            _GEO.update(tx.fold(w)[:5] for w in f"{name} {region}".split() if len(w) >= 4)
            # v1.6: French/Portuguese/Arabic country names and aliases (Côte d'Ivoire, Sénégal, Moçambique, ...)
            for alias in tx.COUNTRY_ALIASES.get(_iso, []) + tx.COUNTRY_ALIASES_I18N.get(_iso, []):
                _GEO.update(tx.fold(w.strip("'’"))[:5] for w in re.split(r"[\s'’-]+", alias) if len(w) >= 4)
        try:
            from ..city import langs as _l
            for c in _l.registry().get("countries", {}).values():
                _GEO.update(tx.fold(w)[:5] for w in re.split(r"[\s'’-]+", c.get("name", "")) if len(w) >= 4)
        except Exception:  # noqa: BLE001 - registry is optional here
            pass
    return tx.fold(word)[:5] in _GEO


def unsupported_entities(text: str, grounding: str) -> list[str]:
    """Names, acronyms, quotes and superlatives not found in the grounding text (evidence + visible thread)."""
    low = grounding.lower()
    out: list[str] = []
    for sent in re.split(r"(?<=[.!?:;])\s+|\n+", text):
        toks = list(NAME_TOK.finditer(sent))
        for i, m in enumerate(toks):
            base = re.sub(r"['\u2019]s$", "", m.group(0)).strip("-")
            if base in ENTITY_STOP or base.upper() == base or len(base) < 3:
                continue
            if m.start() == 0:
                # Sentence-initial capitals are ordinary words unless they start a multi-word name or are possessive.
                nxt = toks[i + 1] if i + 1 < len(toks) else None
                multi = nxt is not None and sent[m.end():nxt.start()].strip() == "" and nxt.group(0) not in ENTITY_STOP and not _is_geo(nxt.group(0))
                if not (multi or re.search(r"['\u2019]s$", m.group(0))):
                    continue
            if base.lower() not in low and not _is_geo(base):
                out.append(base)
    for m in ACRONYM.finditer(text):
        a = m.group(0)
        if a.rstrip("s").upper() in GENERIC_ACRONYMS or a.upper() in GENERIC_ACRONYMS or len(a.rstrip("s")) < 2:
            continue
        if re.fullmatch(r"(claim_\d+|S\d+)", a) or a.lower() in low:
            continue
        out.append(a)
    for qt in QUOTE.findall(text):
        if qt.strip().lower() not in low:
            out.append(f"quote:{qt[:30]}")
    for m in SUPERLATIVE.finditer(text):
        if m.group(0).lower() not in low:
            out.append(f"superlative:{m.group(0)[:40]}")
    seen: list[str] = []
    for o in out:
        if o not in seen:
            seen.append(o)
    return seen


def _norm(n: str) -> str:
    n = n.strip(".,%")
    return n.lstrip("0") or ("0" if n else "")


@dataclass
class PolicyResult:
    decision: str  # allow | reject
    rules: dict = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.decision == "allow"


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:24]


def check_post(text: str, evidence_text: str, *, allow_numbers_from_evidence: bool = True, min_len: int = 120, max_len: int = 1400) -> PolicyResult:
    """Return allow/reject with every rule outcome recorded (PASS/FAIL)."""
    rules: dict[str, str] = {}
    reasons: list[str] = []

    def rule(name: str, failed: bool, why: str = "") -> None:
        rules[name] = "FAIL" if failed else "PASS"
        if failed:
            reasons.append(f"{name}: {why}" if why else name)

    t = text.strip()
    rule("length", not (min_len <= len(t) <= max_len), f"{len(t)} chars")
    rule("group_degradation", any(p.search(t) for p in GROUP_DEGRADATION), "generalizes or ranks an ethnic/religious/national group")
    m = INSULTS.search(t)
    rule("personal_insult", bool(m), m.group(0) if m else "")
    m = TESTIMONY.search(t)
    rule("invented_testimony", bool(m), m.group(0) if m else "")
    rule("injection_echo", bool(INJECTION_ECHO.search(t)), "repeats control instructions")
    rule("external_urls", bool(URL.search(t)), "posts must cite evidence IDs, not URLs")
    rule("outrage_language", len(OUTRAGE.findall(t)) >= 2, "repeated outrage words")
    if allow_numbers_from_evidence:
        # Citation tokens (claim_1, S2) are not figures; dates match by component ("October 9, 2026" vs "2026-10-09").
        body = CITATION.sub(" ", t)
        ev_nums = {_norm(n) for n in NUM.findall(evidence_text)} | {_norm(n) for n in DIGITS.findall(evidence_text)}
        bad = [n for n in NUM.findall(body) if _norm(n) and _norm(n) not in ev_nums]
        rule("unsupported_numbers", bool(bad), ", ".join(bad[:5]))
    ents = unsupported_entities(CITATION.sub(" ", t), evidence_text)
    rule("unsupported_entities", bool(ents), ", ".join(ents[:5]))
    return PolicyResult("reject" if reasons else "allow", rules, reasons)
