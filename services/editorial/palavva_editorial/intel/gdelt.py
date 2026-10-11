"""GDELT DOC 2.0 article-list client (discovery layer for all 54 countries; no key; open data with attribution).

GDELT monitors news sites worldwide and returns, per article, the URL, the publisher's own title, the domain, the
source language and the publisher's country (FIPS 10-4 code). Palavva uses it for two things only:
  1. finding which publishers in each African country are active (source discovery);
  2. link-only signals: the publisher's headline + a link out, never the article text.
GDELT asks for at most one request every 5 seconds; a cross-process spacing lock enforces 6 s.
"""
from __future__ import annotations

import fcntl
import os
import time
from pathlib import Path

import httpx

API = "https://api.gdeltproject.org/api/v2/doc/doc"
SPACING_SEC = float(os.environ.get("GDELT_SPACING_SEC", "10"))

# ISO 3166-1 alpha-2 -> FIPS 10-4 (GDELT's sourcecountry codes) for all 54 African Union member states in the registry.
FIPS = {"DZ": "AG", "AO": "AO", "BJ": "BN", "BW": "BC", "BF": "UV", "BI": "BY", "CM": "CM", "CV": "CV", "CF": "CT", "TD": "CD", "KM": "CN", "CG": "CF",
        "CD": "CG", "DJ": "DJ", "EG": "EG", "GQ": "EK", "ER": "ER", "SZ": "WZ", "ET": "ET", "GA": "GB", "GM": "GA", "GH": "GH", "GN": "GV", "GW": "PU",
        "CI": "IV", "KE": "KE", "LS": "LT", "LR": "LI", "LY": "LY", "MG": "MA", "MW": "MI", "ML": "ML", "MR": "MR", "MU": "MP", "MA": "MO", "MZ": "MZ",
        "NA": "WA", "NE": "NG", "NG": "NI", "RW": "RW", "ST": "TP", "SN": "SG", "SC": "SE", "SL": "SL", "SO": "SO", "ZA": "SF", "SS": "OD", "SD": "SU",
        "TZ": "TZ", "TG": "TO", "TN": "TS", "UG": "UG", "ZM": "ZA", "ZW": "ZI"}
LANG = {"English": "en", "French": "fr", "Arabic": "ar", "Portuguese": "pt", "Swahili": "sw", "Amharic": "am", "Hausa": "ha", "Somali": "so",
        "Afrikaans": "af", "Spanish": "es", "Tigrinya": "ti", "Yoruba": "yo", "Zulu": "zu", "Malagasy": "mg", "Kinyarwanda": "rw"}


class GdeltError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}")
        self.code = code


def _spacing() -> None:
    p = Path(os.environ.get("PALAVVA_DATA_DIR", "./data")).resolve() / "run" / "gdelt.lock"
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.seek(0)
            last = float(f.read().strip() or 0)
        except ValueError:
            last = 0.0
        wait = SPACING_SEC - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
        f.seek(0)
        f.truncate()
        f.write(str(time.time()))
        f.flush()
        fcntl.flock(f, fcntl.LOCK_UN)


def articles(iso: str, timespan: str = "24h", maxrecords: int = 75, client: httpx.Client | None = None) -> list[dict]:
    """Recent articles published BY outlets in `iso` (publisher country, not story country)."""
    fips = FIPS.get(iso.upper())
    if not fips:
        raise GdeltError("UNKNOWN_COUNTRY", iso)
    _spacing()
    params = {"query": f"sourcecountry:{fips}", "mode": "artlist", "format": "json", "maxrecords": str(maxrecords), "timespan": timespan, "sort": "datedesc"}
    try:
        r = (client or httpx).get(API, params=params, timeout=30, headers={"User-Agent": "PalavvaBot/0.1 (+local development; source discovery)"})
    except httpx.HTTPError as e:
        raise GdeltError("NETWORK", type(e).__name__) from e
    if r.status_code == 429 or r.text.lstrip().startswith("Please limit"):
        raise GdeltError("RATE_LIMITED", "GDELT asked to slow down")
    if r.status_code != 200:
        raise GdeltError(f"HTTP_{r.status_code}", r.text[:120])
    if r.text.lstrip().startswith("Please limit"):
        raise GdeltError("RATE_LIMITED", "GDELT asked to slow down")
    try:
        data = r.json() if r.text.strip() else {}
    except ValueError as e:
        raise GdeltError("BAD_JSON", r.text[:120]) from e
    out = []
    for a in data.get("articles") or []:
        if not a.get("url") or not a.get("title"):
            continue
        out.append({"url": a["url"], "title": " ".join(str(a["title"]).split()), "domain": (a.get("domain") or "").lower(),
                    "language": LANG.get(a.get("language") or "", ""), "language_name": a.get("language") or "", "seendate": a.get("seendate") or "",
                    "publisher_country": iso.upper()})
    return out
