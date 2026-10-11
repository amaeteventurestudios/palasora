"""GDELT 2.0 bulk GKG reader (v1.6): the same discovery as the DOC API, from the public 15-minute files.

The DOC API allows one request every 5 s and throttled this IP for hours; the bulk files are published every 15
minutes for download and carry, per article: URL, source domain, page title (<PAGE_TITLE>), date and locations.
Palavva keeps only articles whose publisher is African: a domain in the publisher registry (Wikidata/GDELT-seeded) or
an African country-code domain. Publisher country comes from the registry or the ccTLD; SUBJECT countries are
classified from the headline later (same rules as every other source). Only metadata is kept (link-only).
English stream + translation stream (French, Arabic, Portuguese and other source languages; titles stay original).
"""
from __future__ import annotations

import csv
import html
import io
import json
import re
import time
import zipfile
from pathlib import Path

import httpx

BASE = "https://data.gdeltproject.org/gdeltv2/"
ISO_TLD = {"dz", "ao", "bj", "bw", "bf", "bi", "cm", "cv", "cf", "td", "km", "cg", "cd", "dj", "eg", "gq", "er", "sz", "et", "ga", "gm", "gh", "gn",
           "gw", "ci", "ke", "ls", "lr", "ly", "mg", "mw", "ml", "mr", "mu", "ma", "mz", "na", "ne", "ng", "rw", "st", "sn", "sc", "sl", "so", "za", "ss",
           "sd", "tz", "tg", "tn", "ug", "zm", "zw"}
TITLE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.S)
SRCLC = re.compile(r"srclc:([a-z]{3})")
ISO3 = {"eng": "en", "fra": "fr", "ara": "ar", "por": "pt", "swa": "sw", "amh": "am", "hau": "ha", "som": "so", "afr": "af", "spa": "es", "yor": "yo",
        "zul": "zu", "mlg": "mg", "kin": "rw", "tir": "ti"}
MAX_BYTES = 40 * 1024 * 1024
csv.field_size_limit(50 * 1024 * 1024)


def _stamps(stream: str, n: int, client: httpx.Client) -> list[str]:
    """The n most recent 15-minute stamps for a stream (the newest listed file can lag its upload; we keep a few)."""
    idx = "lastupdate-translation.txt" if stream == "translation" else "lastupdate.txt"
    r = client.get(BASE + idx, timeout=20)
    r.raise_for_status()
    m = re.search(r"/(\d{14})\.", r.text)
    if not m:
        return []
    t = time.mktime(time.strptime(m.group(1), "%Y%m%d%H%M%S")) - time.timezone
    return [time.strftime("%Y%m%d%H%M%S", time.gmtime(t - i * 900)) for i in range(n)]


def read(stamp: str, stream: str, client: httpx.Client) -> list[list[str]] | None:
    name = f"{stamp}.translation.gkg.csv.zip" if stream == "translation" else f"{stamp}.gkg.csv.zip"
    r = client.get(BASE + name, timeout=90)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    if len(r.content) > MAX_BYTES:
        raise ValueError("GKG file larger than expected")
    z = zipfile.ZipFile(io.BytesIO(r.content))
    with z.open(z.namelist()[0]) as f:
        return [row for row in csv.reader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"), delimiter="\t") if len(row) >= 27]


def african_articles(rows: list[list[str]], registry: dict[str, list[str]], stream: str = "english") -> list[dict]:
    """registry: domain (no www.) -> publisher countries. Language comes from GDELT's own source-language field
    (translation stream) or is English (English stream); a match by country-code domain ALONE is marked cctld_only,
    because vanity uses exist (felvidek.ma is a Hungarian site)."""
    out = []
    for r in rows:
        dom = (r[3] or "").lower().removeprefix("www.")
        if not dom:
            continue
        countries = registry.get(dom)
        cctld_only = False
        if not countries:
            tld = dom.rsplit(".", 1)[-1]
            countries = [tld.upper()] if tld in ISO_TLD else None
            cctld_only = True
        if not countries:
            continue
        m = TITLE.search(r[26] or "")
        title = " ".join(html.unescape(m.group(1)).split()) if m else ""
        if not title or not r[4].startswith("http"):
            continue
        d = r[1]
        if stream == "translation":
            m2 = SRCLC.search(r[25] if len(r) > 25 else "")
            lang = ISO3.get(m2.group(1), f"x-{m2.group(1)}") if m2 else ""
        else:
            lang = "en"
        out.append({"url": r[4], "title": title[:300], "domain": dom, "language": lang, "seendate": f"{d[:8]}T{d[8:14]}Z", "publisher_country": countries[0],
                    "cctld_only": cctld_only})
    return out


def cycle(state_path: Path, registry: dict[str, list[str]], client: httpx.Client | None = None, back: int = 4) -> tuple[list[dict], dict]:
    """New African articles from bulk files not yet processed (both streams). Returns (articles, stats)."""
    own = client is None
    client = client or httpx.Client(follow_redirects=True)
    try:
        state = json.loads(state_path.read_text())
    except (OSError, ValueError):
        state = {}
    done = set(state.get("done", []))
    arts, stats = [], {"files": 0, "rows": 0, "missing": 0}
    try:
        for stream in ("english", "translation"):
            for st in _stamps(stream, back, client):
                key = f"{stream}:{st}"
                if key in done:
                    continue
                rows = read(st, stream, client)
                if rows is None:
                    stats["missing"] += 1
                    continue
                stats["files"] += 1
                stats["rows"] += len(rows)
                arts += african_articles(rows, registry, stream)
                done.add(key)
    finally:
        if own:
            client.close()
    state_path.write_text(json.dumps({"done": sorted(done)[-400:], "at": time.time()}))
    return arts, stats
