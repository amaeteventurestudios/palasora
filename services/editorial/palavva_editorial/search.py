"""FTS5 search sidecar (ADR-007). Indexes only published pieces, partitioned by tenant_id.

Every search is parameterized; user input is reduced to quoted prefix terms so FTS syntax
cannot be injected. Next.js re-checks each hit against the public filter before showing it.
"""
from __future__ import annotations

import re
import sqlite3
import unicodedata
from pathlib import Path

SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
  piece_id UNINDEXED, tenant_id UNINDEXED, countries UNINDEXED, topics UNINDEXED,
  headline, lede, body, tags, tokenize = 'unicode61 remove_diacritics 2'
);
"""


def _conn(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(path), timeout=10)
    c.executescript(SCHEMA)
    return c


def fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def build_query(term: str) -> str:
    words = re.findall(r"[\w]+", fold(term).lower())[:8]
    return " ".join(f'"{w}"*' for w in words if len(w) > 1)


def reindex(path: Path, pieces: list[dict]) -> int:
    c = _conn(path)
    with c:
        c.execute("DELETE FROM docs")
        for p in pieces:
            body = p.get("body_blocks_json") or {}
            text = " ".join(b.get("text", "") for k in ("what_happened", "why_it_matters") for b in (body.get(k) or []))
            c.execute("INSERT INTO docs (piece_id, tenant_id, countries, topics, headline, lede, body, tags) VALUES (?,?,?,?,?,?,?,?)",
                      (p["id"], p["tenant_id"], ",".join(p.get("country_codes") or []), ",".join(p.get("topic_slugs") or []),
                       fold(p.get("headline", "")), fold(p.get("lede", "")), fold(text), " ".join((p.get("topic_slugs") or []) + (p.get("country_codes") or []))))
    n = c.execute("SELECT COUNT(*) FROM docs").fetchone()[0]
    c.close()
    return n


def search(path: Path, tenant_id: str, term: str, country: str | None = None, topic: str | None = None, limit: int = 20) -> list[str]:
    fq = build_query(term)
    if not fq:
        return []
    c = _conn(path)
    sql = "SELECT piece_id, countries, topics FROM docs WHERE docs MATCH ? AND tenant_id = ? ORDER BY bm25(docs, 0, 0, 0, 0, 5.0, 2.0, 1.0, 1.0) LIMIT 200"
    rows = c.execute(sql, (fq, tenant_id)).fetchall()
    c.close()
    out = []
    for pid, cs, ts in rows:
        if country and country not in cs.split(","):
            continue
        if topic and topic not in ts.split(","):
            continue
        out.append(pid)
    return out[:limit]
