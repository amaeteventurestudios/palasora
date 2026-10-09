"""Normalization, fingerprints and idempotency keys (07 §Fetch contract step 4–5)."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING = re.compile(r"^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|igshid|_ga|cmpid)$", re.I)
STOP = set("a an the of to in on for and or but with by at from as is are was were be been it its this that these those how why what who will can could would should has have had not no into over after before about than more most new says say said".split())


def canonical_url(url: str) -> str:
    p = urlsplit(url.strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    host = (p.hostname or "").lower()
    if p.port and not ((p.scheme == "https" and p.port == 443) or (p.scheme == "http" and p.port == 80)):
        host = f"{host}:{p.port}"
    path = p.path or "/"
    if len(path) > 1:
        path = path.rstrip("/")
    return urlunsplit((p.scheme.lower(), host, path, urlencode(q), ""))


def tokens(text: str) -> list[str]:
    t = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return [w for w in re.findall(r"[a-z0-9]+", t) if w not in STOP and len(w) > 1]


def title_fingerprint(title: str) -> str:
    return " ".join(sorted(set(tokens(title))))


def content_hash(title: str, summary: str) -> str:
    return hashlib.sha256((" ".join(tokens(title)) + "|" + " ".join(tokens(summary))).encode()).hexdigest()


def item_key(source_id: str, guid_or_url: str) -> str:
    return hashlib.sha256(f"{source_id}|{guid_or_url}".encode()).hexdigest()


def idempotency_key(tenant_id: str, item_id: str, pipeline_version: str, stage: str) -> str:
    return hashlib.sha256(f"{tenant_id}+{item_id}+{pipeline_version}+{stage}".encode()).hexdigest()


def jaccard(a: str, b: str) -> float:
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)
