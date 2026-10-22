"""Cross-thread diversity (v1.3.1): stop the model recycling the same themes across topics.

Within-thread novelty (conversation.NOVELTY_MAX_SIMILARITY) already rejects a reply that repeats its
own thread. The observed failure was different: a small model brings the same framing ("power
reliability", "maintenance costs") to unrelated topics. This module gives the engine a memory of
what AI posts said recently in OTHER threads:

- `overused_themes`: content-word bigrams that appear in AI posts of at least `min_threads`
  different topics in the window and are NOT grounded in the current topic's evidence. They are
  passed to the model as themes to avoid, and a reply leaning on them is rejected.
- `cross_thread_similarity`: a reply that closely restates a post from another thread is rejected.
- `similar_recent_topic`: a candidate topic whose headline/lede nearly duplicates a topic published
  recently is held for an editor instead of auto-publishing (repetitive topics).

Everything is deterministic and explainable; nothing here calls a model.
"""
from __future__ import annotations

import re
from collections import Counter

from ..textsim import jaccard, title_fingerprint

STOP = set("""a an the and or but if then than that this these those there their they them it its of to in on at by for from with without into onto over under
about across after before during between among per via as is are was were be been being has have had do does did can could should would may might must will
shall not no nor so such very more most less least much many few some any each every other another same own also just only even still yet already
who whom whose which what when where why how here our your his her we you i he she my me us one two first second new old
would could make makes made making get gets got take takes took see seen look looks way ways thing things issue issues point points
question questions really perhaps likely rather whether while because since though although however therefore thus""".split())
WORD = re.compile(r"[a-z][a-z'\-]{2,}")


def content_words(text: str) -> list[str]:
    return [w.strip("'-") for w in WORD.findall(text.lower()) if w.strip("'-") not in STOP and len(w.strip("'-")) > 2]


def bigrams(text: str) -> set[str]:
    w = content_words(text)
    return {f"{a} {b}" for a, b in zip(w, w[1:])}


def overused_themes(recent_other_posts: list[dict], evidence_text: str, min_threads: int = 3, limit: int = 8) -> list[str]:
    """Bigrams used by AI posts in >= min_threads distinct other topics, excluding any grounded in this topic's evidence."""
    by_thread: dict[str, set[str]] = {}
    for p in recent_other_posts:
        by_thread.setdefault(p.get("piece_id") or "", set()).update(bigrams((p.get("new_angle") or "") + " " + (p.get("body_text") or "")))
    counts: Counter[str] = Counter()
    for grams in by_thread.values():
        counts.update(grams)
    grounded = bigrams(evidence_text)
    ev_words = set(content_words(evidence_text))
    out = []
    for g, n in counts.most_common():
        if n < min_threads:
            break
        a, b = g.split(" ", 1)
        # A theme the topic itself is about (both words in its evidence) is legitimate, not recycled.
        if g in grounded or (a in ev_words and b in ev_words):
            continue
        out.append(g)
        if len(out) >= limit:
            break
    return out


def theme_hits(text: str, themes: list[str]) -> list[str]:
    grams = bigrams(text)
    return [t for t in themes if t in grams]


def cross_thread_similarity(text: str, recent_other_posts: list[dict]) -> tuple[float, str]:
    fp = title_fingerprint(text)
    best, which = 0.0, ""
    for p in recent_other_posts:
        s = jaccard(fp, title_fingerprint(p.get("body_text") or ""))
        if s > best:
            best, which = s, p.get("id") or ""
    return best, which


def similar_recent_topic(headline: str, lede: str, recent_topics: list[dict], threshold: float = 0.5) -> tuple[float, dict | None]:
    fp = title_fingerprint(f"{headline} {lede}")
    best, which = 0.0, None
    for t in recent_topics:
        s = jaccard(fp, title_fingerprint(f"{t.get('headline', '')} {t.get('lede', '')}"))
        if s > best:
            best, which = s, t
    return (best, which) if best >= threshold else (best, None)
