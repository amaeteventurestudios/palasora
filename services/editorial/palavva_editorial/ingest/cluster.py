"""Story clustering (07 §Dedup and clustering rules).

Exact GUID/URL duplicates collapse deterministically (handled at insert by a unique index).
A new item joins an existing cluster only with an auditable explanation: title-token
similarity >= threshold AND shared country (when known) AND close publication date.
Similarity alone is a *candidate* signal; high-risk candidates are left for an editor.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from .normalize import jaccard

THRESHOLD = 0.5
WINDOW = timedelta(hours=72)


@dataclass
class ClusterCandidate:
    id: str
    fingerprint: str
    countries: list[str]
    updated_at: datetime | None
    risk: str


@dataclass
class ClusterDecision:
    cluster_id: str | None
    score: float
    explanation: str


def choose_cluster(fp: str, countries: list[str], published: datetime | None, risk: str, candidates: list[ClusterCandidate]) -> ClusterDecision:
    best: tuple[float, ClusterCandidate] | None = None
    for c in candidates:
        if published and c.updated_at and abs(published - c.updated_at) > WINDOW:
            continue
        if countries and c.countries and not set(countries) & set(c.countries):
            continue
        s = jaccard(fp, c.fingerprint)
        if s >= THRESHOLD and (best is None or s > best[0]):
            best = (s, c)
    if not best:
        return ClusterDecision(None, 0.0, "no similar open cluster within 72h")
    s, c = best
    if risk == "high" and s < 0.8:
        return ClusterDecision(None, s, f"high-risk candidate similarity {s:.2f} below 0.80: left separate for editor merge")
    return ClusterDecision(c.id, s, f"title similarity {s:.2f}, shared country {sorted(set(countries) & set(c.countries)) or 'n/a'}, within 72h")
