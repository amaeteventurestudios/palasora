"""Automated validation gates (08 §Automated validation gates). Deterministic first.

A model's agreement is never treated as corroboration. Every gate emits a named flag so
editors see exactly why an item is held.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..ingest.normalize import jaccard, title_fingerprint
from .. import taxonomy as tx

NUM = re.compile(r"(?<![A-Za-z])\d[\d,.]*%?")
QUOTE = re.compile(r"[\"“”]([^\"“”]{12,})[\"“”]")
INJECTION_ECHO = re.compile(r"ignore (all |any )?(previous|prior) instructions|system prompt|api[_ ]?key|password|publish (this|now) immediately|BEGIN SYSTEM", re.I)


@dataclass
class Verdict:
    verdict: str  # PASS | NEEDS_REVIEW | FAIL
    flags: list[str] = field(default_factory=list)
    risk: str = "low"

    def add(self, flag: str, severity: str) -> None:
        self.flags.append(flag)
        order = {"PASS": 0, "NEEDS_REVIEW": 1, "FAIL": 2}
        if order[severity] > order[self.verdict]:
            self.verdict = severity


def clean_claims(raw: list[dict], packet_source_ids: set[str]) -> tuple[list[dict], list[str]]:
    """Drop researcher claims that cite unknown sources; re-key claims deterministically."""
    out, flags = [], []
    for c in raw or []:
        sids = [s for s in (c.get("source_ids") or []) if s in packet_source_ids]
        if not sids:
            flags.append(f"DROPPED_CLAIM_UNKNOWN_SOURCE:{str(c.get('claim_id'))[:20]}")
            continue
        text = str(c.get("text", "")).strip()[:600]
        if not text:
            continue
        kind = c.get("kind") if c.get("kind") in ("observation", "interpretation", "projection") else "observation"
        out.append({"claim_id": f"claim_{len(out) + 1}", "model_claim_id": str(c.get("claim_id", ""))[:40], "text": text, "kind": kind,
                    "source_ids": sids, "uncertainty": str(c.get("uncertainty", ""))[:300]})
    return out, flags


def remap_ids(blocks: list[dict], claims: list[dict]) -> list[dict]:
    """Writers cite the researcher's original IDs or our normalized IDs; accept both, map to normalized."""
    m = {c["model_claim_id"]: c["claim_id"] for c in claims}
    m.update({c["claim_id"]: c["claim_id"] for c in claims})
    out = []
    for b in blocks or []:
        ids = [str(i) for i in (b.get("claim_ids") or [])]
        out.append({"text": str(b.get("text", "")).strip()[:900], "claim_ids": [m.get(i, i) for i in ids]})
    return out


NAME_TOK = re.compile(r"[A-Z][A-Za-z'\u2019\-]{2,}")
NAME_STOP = set(("The This That These Those They There Their When What Why How While Without With After Before During Under Over And But For From Into "
                 "Will Would Could Should Can May Might Must Has Have Had Does Did Not Its Our Your Who Whom Which Where Africa African "
                 "January February March April May June July August September October November December "
                 "Monday Tuesday Wednesday Thursday Friday Saturday Sunday "
                 "President Minister Deputy Premier Mayor Governor Senator Chief Department Ministry Government Commissioner Director "
                 "Speaker Parliament Assembly Presidency Cabinet Council").split())


def unsupported_names(headline: str, blocks: list[str], packet_text: str) -> list[str]:
    """Proper-name fidelity: capitalised mid-sentence words must occur in the evidence. Catches invented or
    mis-completed names (e.g. an excerpt cut at "Ntsh" completed as "Ntshau"). Title-Case headlines are checked
    only for the truncation pattern (a word that extends a shorter capitalised word of the evidence)."""
    low = packet_text.lower()
    caps = {w for w in NAME_TOK.findall(packet_text)}
    out: list[str] = []
    def check(text: str, full: bool) -> None:
        for sent in re.split(r"(?<=[.!?:])\s+", text):
            for m in NAME_TOK.finditer(sent):
                base = re.sub(r"['\u2019]s$", "", m.group(0)).strip("-")
                if m.start() == 0 or base in NAME_STOP or len(base) < 4 or base.lower() in low:
                    continue
                if full or any(len(c) >= 3 and base.startswith(c) and base != c for c in caps):
                    out.append(base)
    words = [w for w in re.findall(r"[A-Za-z]{4,}", headline)]
    title_case = bool(words) and sum(w[0].isupper() for w in words) / len(words) > 0.6
    check(headline, not title_case)
    for b in blocks:
        check(b, True)
    return sorted(set(out))


def validate_draft(draft: dict, claims: list[dict], packet_text: str, topics: list[str]) -> Verdict:
    v = Verdict("PASS")
    known = {c["claim_id"] for c in claims}
    if draft.get("decision") != "DRAFT":
        v.add("WRITER_ABSTAINED", "FAIL")
        return v
    headline = str(draft.get("headline", "")).strip()
    if not headline or len(headline) > 160:
        v.add("BAD_HEADLINE_LENGTH", "NEEDS_REVIEW")
    blocks = (draft.get("what_happened") or []) + (draft.get("why_it_matters") or [])
    if not draft.get("what_happened"):
        v.add("MISSING_WHAT_HAPPENED", "FAIL")
    for b in blocks:
        ids = b.get("claim_ids") or []
        if not ids:
            v.add("UNCITED_SENTENCE", "NEEDS_REVIEW")
        for i in ids:
            if i not in known:
                v.add(f"UNKNOWN_CLAIM_ID:{i}", "FAIL")
    all_text = " ".join([headline] + [b.get("text", "") for b in blocks])
    src_nums = set(NUM.findall(packet_text))
    for n in NUM.findall(all_text):
        if n.strip(".,") and n not in src_nums and n.strip(".,") not in src_nums:
            v.add(f"UNSUPPORTED_NUMBER:{n}", "NEEDS_REVIEW")
    for name in unsupported_names(headline, [b.get("text", "") for b in blocks], packet_text):
        v.add(f"UNSUPPORTED_NAME:{name}", "NEEDS_REVIEW")
    for qt in QUOTE.findall(all_text):
        if qt.lower() not in packet_text.lower():
            v.add("POSSIBLE_FABRICATED_QUOTE", "NEEDS_REVIEW")
    if INJECTION_ECHO.search(all_text):
        v.add("INJECTION_ECHO", "FAIL")
    # Risk: sensitive topics and keywords always require human approval (all pieces do in staging).
    risk = "low"
    for t in topics:
        lvl = tx.SENSITIVE_TOPICS.get(t)
        if lvl == "high" or (lvl == "medium" and risk == "low"):
            risk = lvl
    low = all_text.lower()
    from ..ingest.classify import _has
    if any(_has(tx.fold(low), tx.fold(k)) for k in tx.SENSITIVE_KEYWORDS + tx.SENSITIVE_KEYWORDS_I18N):
        risk = "high"
        v.flags.append("SENSITIVE_TERMS")
    v.risk = risk
    return v


def distinct_contributions(draft_text: str, contribs: list[dict], max_roles: int = 3, threshold: float = 0.6) -> tuple[list[dict], list[str]]:
    """Keep at most 3 contributions; drop any that repeat the draft or each other (08 'if two roles restate the same point, discard one')."""
    kept, dropped = [], []
    base = title_fingerprint(draft_text)
    for c in contribs:
        fp = title_fingerprint(c["text"])
        if jaccard(fp, base) >= threshold or any(jaccard(fp, title_fingerprint(k["text"])) >= threshold for k in kept):
            dropped.append(f"ROLE_DUPLICATE:{c['role_id']}")
            continue
        if len(kept) >= max_roles:
            dropped.append(f"ROLE_LIMIT:{c['role_id']}")
            continue
        kept.append(c)
    return kept, dropped
