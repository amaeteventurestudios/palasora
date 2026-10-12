"""Rule-level disposition for publisher cards (v1.8+ ISSUE-07).

v1 (current default): any of ~90 "sensitive" keywords (court, police, vote, candidate, shares, corruption, ...) or a
sensitive topic made an item high risk, and a publisher card was published only at LOW risk. So a verbatim, attributed
headline like "Court dismisses Palapye chair challenge" was held exactly like incitement or health misinformation.

v2 (behind the tenant switch LINK_POLICY_V2, default OFF until the founder enables it): a publisher card shows the
publisher's own headline (and permitted excerpt) VERBATIM with attribution and a link; Palavva asserts nothing. Such
cards publish automatically when every sensitive match is ROUTINE ATTRIBUTED NEWS (politics, elections, courts,
police statements, institutional corruption/fraud reporting, markets). They stay held when any match is in a HOLD
class: incitement/identity, violence and casualties, coups and conflict, health misinformation risk, financial
advice, kidnapping, migration enforcement, or suspected prompt injection. AI-written text never uses this path.

Every outcome names its rule and the matched words, so editors can see exactly why.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .. import taxonomy as tx

POLICY_VERSION = "card-disposition-v2"

# Matched terms that keep a card for a person, by class (plain-language reason shown to editors).
HOLD_CLASSES: dict[str, tuple[str, list[str]]] = {
    "identity_incitement": ("names ethnic, religious or migrant groups: risk of incitement", ["ethnic", "tribal", "religious", "xenophob*", "illegal immigra*", "irregular migra*",
                            "illegal foreigner*", "illegal migrant*", "undocumented", "asylum", "deport*", "foreign nationals", "ethnique", "religieux", "sans-papiers",
                            "immigration clandestine", "immigration irreguliere", "expulsion*", "demandeur* d'asile", "عرقي", "طائفي", "كراهية الأجانب", "الهجرة غير الشرعية", "ترحيل", "لجوء"]),
    "violence": ("violence or casualties: details often unverified early", ["killed", "murder", "shooting", "riot", "attack", "explosion", "massacre", "tue", "tues", "meurtre",
                 "attaque", "attentat", "emeute", "قتل", "مقتل", "هجوم"]),
    "conflict": ("coup, war, terrorism or armed groups", ["coup", "war", "militant", "terror", "terroris*", "coup d'etat", "putsch", "guerre", "انقلاب", "حرب", "إرهاب"]),
    "kidnapping": ("kidnapping or abduction", ["kidnap", "kidnap*", "enlevement", "اختطاف"]),
    "health": ("disease, outbreak or vaccine claims: misinformation risk", ["vaccine", "outbreak", "disease", "epidemic", "pandemic", "cure", "miracle", "vaccin", "epidemie", "maladie",
               "ebola", "cholera", "mpox", "monkeypox", "marburg", "lassa", "measles", "polio", "meningitis", "virus", "covid*", "malaria outbreak",
               "وباء", "لقاح"]),
    "financial_advice": ("investment advice", ["investment advice", "buy now", "guaranteed returns"]),
}
# Routine attributed news: allowed on verbatim publisher cards under v2.
ROUTINE = ["election", "elections", "electoral", "campaign", "ballot", "voters", "vote", "candidate", "ruling party", "opposition party", "protest", "protesters",
           "arrest", "arrested", "police", "court", "on trial", "trial court", "charged with", "allegation", "alleged", "accused", "fraud", "corruption", "bribe",
           "scandal", "stock", "shares", "bankrupt", "medical", "campagne electorale", "scrutin", "manifestation", "manifestants", "gendarmerie", "tribunal", "proces",
           "arrete", "arrestation", "detenu", "corruption", "fraude", "repression", "opposant", "انتخابات", "انتخابي", "احتجاج", "احتجاجات", "مظاهرة", "مظاهرات",
           "الشرطة", "محكمة", "اعتقال", "معتقل", "فساد", "قمع"]
INJECTION = re.compile(r"ignore (all |any )?(previous|prior) instructions|you are now|system:|reveal (the )?(api key|secret|password)|publish (this )?(now|immediately)", re.I)


@dataclass
class Disposition:
    decision: str            # "publish" | "hold"
    rule: str                # machine rule id
    reason: str              # plain-language reason for editors
    matched: list[str]

    @property
    def basis(self) -> str:
        return f"{POLICY_VERSION} {self.rule}: {self.reason}" + (f" (matched: {', '.join(self.matched[:5])})" if self.matched else "")


def _hits(text: str, terms: list[str]) -> list[str]:
    from ..ingest.classify import _has
    return [t for t in terms if _has(text, tx.fold(t))]


def card_disposition(title: str, excerpt: str, *, rights_ok: bool, verbatim: bool = True) -> Disposition:
    """Decide a publisher card under v2. `verbatim` must be True (publisher's own words, no AI text)."""
    if not rights_ok:
        return Disposition("hold", "rights", "publisher rights not confirmed for this use", [])
    if not verbatim:
        return Disposition("hold", "not_verbatim", "contains text that is not the publisher's own words", [])
    text = tx.fold(f" {title} {excerpt} ")
    if INJECTION.search(f"{title} {excerpt}"):
        return Disposition("hold", "prompt_injection", "the text looks like instructions to an AI system", ["injection"])
    for cls, (why, terms) in HOLD_CLASSES.items():
        h = _hits(text, terms)
        if h:
            return Disposition("hold", cls, why, h)
    routine = _hits(text, ROUTINE)
    if routine:
        return Disposition("publish", "routine_attributed", "routine news shown as the publisher's own attributed headline", routine)
    return Disposition("publish", "low_risk", "no sensitive terms", [])
