"""Word-set similarity for agent writing (novelty and repetition checks). Moved from the retired news ingester."""
from __future__ import annotations

import re
import unicodedata

STOP = set("a an the of to in on for and or but with by at from as is are was were be been it its this that these those how why what who will can could would should has have had not no into over after before about than more most new says say said".split())


def tokens(text: str) -> list[str]:
    t = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return [w for w in re.findall(r"[a-z0-9]+", t) if w not in STOP and len(w) > 1]


def title_fingerprint(title: str) -> str:
    return " ".join(sorted(set(tokens(title))))


def jaccard(a: str, b: str) -> float:
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def has_term(text: str, term: str) -> bool:
    """Keyword match on folded text: Arabic by substring, `stem*` as a prefix, otherwise a whole word."""
    if re.search(r"[؀-ۿ]", term):  # Arabic: substring match (clitics attach to words)
        return term in text
    if term.endswith("*"):  # explicit stem: "xenophob*" matches xenophobia / xenophobic
        return re.search(r"(?<![a-z])" + re.escape(term[:-1]), text) is not None
    return re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", text) is not None
