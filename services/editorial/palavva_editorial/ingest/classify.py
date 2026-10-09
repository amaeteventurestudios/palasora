"""Keyword classifier for country / topic / language / risk (07 §Classification).

Deliberately simple and auditable: every decision records its matched terms. Confidence is
a flag, not an accuracy guarantee; ambiguous items are marked for editor review.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .. import taxonomy as tx

FRENCH = set("le la les des une est et du dans pour sur avec au aux par qui que".split())
ARABIC = re.compile("[\u0600-\u06FF]")
# Source text that tries to instruct the model is kept as data but forces high-risk human review (T-020).
INJECTION = re.compile(r"ignore (all |any )?(previous|prior) instructions|you are now|system:|reveal (the )?(api key|secret|password)|publish (this )?(now|immediately)", re.I)


@dataclass
class Classification:
    countries: list[str]
    topics: list[str]
    language: str
    risk: str
    confidence: float
    ambiguous: bool
    reasons: list[str] = field(default_factory=list)
    africa_relevant: bool = True


def _has(text: str, term: str) -> bool:
    if re.search(r"[\u0600-\u06FF]", term):  # Arabic: substring match (clitics attach to words)
        return term in text
    if term.endswith("*"):  # explicit stem: "xenophob*" matches xenophobia / xenophobic
        return re.search(r"(?<![a-z])" + re.escape(term[:-1]), text) is not None
    return re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", text) is not None


def detect_language(text: str, hint: str = "") -> str:
    """Clear evidence in the text beats the feed's <language> hint (some feeds mislabel it,
    e.g. an Arabic-language feed declaring en-US); the hint decides only when text is inconclusive."""
    letters = [c for c in text if c.isalpha()]
    if letters and sum(bool(ARABIC.match(c)) for c in letters) / len(letters) > 0.3:
        return "ar"
    words = re.findall(r"[a-zàâçéèêëîïôûùüÿœ]+", text.lower())
    if len(words) >= 6 and sum(w in FRENCH for w in words) / len(words) > 0.12:
        return "fr"
    if hint:
        return hint.split("-")[0].lower()[:2]
    if ARABIC.search(text):
        return "ar"
    if words and sum(w in FRENCH for w in words) / len(words) > 0.12:
        return "fr"
    return "en"


def classify(title: str, summary: str, source_countries: list[str] | None = None, source_topics: list[str] | None = None, lang_hint: str = "") -> Classification:
    text = tx.fold(f" {title} {summary} ")
    reasons: list[str] = []
    countries: list[str] = []
    for iso, name, _region, _p in tx.COUNTRIES:
        terms = [tx.fold(name)] + tx.COUNTRY_ALIASES.get(iso, []) + tx.COUNTRY_ALIASES_I18N.get(iso, [])
        hit = next((t for t in terms if _has(text, t)), None)
        if hit:
            countries.append(iso)
            reasons.append(f"country {iso}: '{hit}'")
    if not countries and source_countries:
        countries = list(source_countries)
        reasons.append("country from source registry")
    topic_scores: dict[str, int] = {}
    for slug, _g, _n, _d, kws in tx.TOPICS:
        hits = [k for k in kws if _has(text, k.strip())]
        if hits:
            topic_scores[slug] = len(hits)
            reasons.append(f"topic {slug}: {hits[:3]}")
    topics = [s for s, _ in sorted(topic_scores.items(), key=lambda kv: -kv[1])][:3]
    if not topics and source_topics:
        topics = list(source_topics)[:2]
        reasons.append("topic from source registry")
    risk = "low"
    for t in topics:
        level = tx.SENSITIVE_TOPICS.get(t)
        if level == "high" or (level == "medium" and risk == "low"):
            risk = level
    sens = [k for k in tx.SENSITIVE_KEYWORDS + tx.SENSITIVE_KEYWORDS_I18N if _has(text, tx.fold(k))]
    if sens:
        risk = "high"
        reasons.append(f"sensitive terms: {sens[:3]}")
    if INJECTION.search(text):
        risk = "high"
        reasons.append("PROMPT_INJECTION_SUSPECTED")
    africa = bool(countries) or any(_has(text, tx.fold(a)) for a in tx.AFRICA_TERMS)
    conf = min(1.0, 0.3 * bool(countries) + 0.3 * bool(topics) + 0.1 * min(len(reasons), 4))
    ambiguous = len(countries) > 3 or not topics or not countries
    return Classification(countries[:4], topics, detect_language(title + " " + summary, lang_hint), risk, round(conf, 2), ambiguous, reasons, africa)
