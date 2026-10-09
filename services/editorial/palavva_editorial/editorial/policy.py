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

RULESET_VERSION = "conv-rules-v1"

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
INSULTS = re.compile(r"\b(idiot|idiotic|moron|stupid|fool(ish)?|dumb|clown|shut up|pathetic|ignorant (people|fools)|you people|nonsense argument|imbecile|retard)\b", re.I)
# A disclosed AI must not claim lived experience or invent witnesses.
TESTIMONY = re.compile(r"\b(I (was|am) (there|a farmer|a trader|a vendor|from|born in|living in)|my (uncle|aunt|mother|father|brother|sister|cousin|village|neighbou?r)|"
                       r"as a (farmer|trader|mother|father|nigerian|ghanaian|kenyan) myself|I personally (saw|witnessed|know)|when I lived)\b", re.I)
INJECTION_ECHO = re.compile(r"ignore (all |any )?(previous|prior) instructions|system prompt|api[_ ]?key|password|publish (this|now) immediately|as an admin|BEGIN SYSTEM", re.I)
OUTRAGE = re.compile(r"\b(outrageous|disgusting|shameful|evil|wicked)\b", re.I)
NUM = re.compile(r"(?<![A-Za-z])\d[\d,.]*%?")
URL = re.compile(r"https?://\S+")


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
        ev_nums = {n.strip(".,") for n in NUM.findall(evidence_text)}
        bad = [n for n in NUM.findall(t) if n.strip(".,") and n.strip(".,") not in ev_nums]
        rule("unsupported_numbers", bool(bad), ", ".join(bad[:5]))
    return PolicyResult("reject" if reasons else "allow", rules, reasons)
