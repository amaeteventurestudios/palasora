"""Sensitive-topic check for agent and translated text (the news draft validators were removed in Palasora Phase 5)."""
from __future__ import annotations

from .. import taxonomy as tx
from ..textsim import has_term


def sensitive_hit(text: str) -> bool:
    low = tx.fold(text.lower())
    return any(has_term(low, tx.fold(k)) for k in tx.SENSITIVE_KEYWORDS + tx.SENSITIVE_KEYWORDS_I18N)
