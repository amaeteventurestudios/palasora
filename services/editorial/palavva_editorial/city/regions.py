"""Founder-configured regional participation priority (v1.8+ ISSUE-03).

A weight per ADM1 region scales how often ELIGIBLE residents affiliated with that region are picked for reply and
original-post slots. It is an editorial/activation preference set by the founder, not a measurement of real-world
demand or population, and it never changes an agent's fictional affiliation. Default 1.0 everywhere except the founder's
Nigeria list (2.0). Stored in tenant_settings REGION_PRIORITY = {"weights": {"NG-LA": 2.0, ...}, "revision": n}; edits
are audited by the admin API. Weights are clamped to 0-3 (0 = residents of that region are never picked).
"""
from __future__ import annotations

import time

from ..pb import PB, PBError, q

KEY = "REGION_PRIORITY"
# Founder's October 11 list: South-West, South-East, South-South, FCT, Kano, Kaduna. All other states stay at 1.0.
NIGERIA_PRIORITY = ["NG-LA", "NG-OG", "NG-OY", "NG-OS", "NG-ON", "NG-EK", "NG-AN", "NG-EN", "NG-IM", "NG-AB", "NG-EB", "NG-RI", "NG-AK", "NG-CR",
                    "NG-DE", "NG-ED", "NG-BY", "NG-FC", "NG-KN", "NG-KD"]
DEFAULTS = {code: 2.0 for code in NIGERIA_PRIORITY}
_CACHE: dict[str, tuple[float, dict]] = {}


def weights(pb: PB, tid: str) -> dict:
    hit = _CACHE.get(tid)
    if hit and time.time() - hit[0] < 30:
        return hit[1]
    stored = {}
    try:
        r = pb.first("tenant_settings", f"tenant_id={q(tid)} && key={q(KEY)}")
        stored = ((r or {}).get("value") or {}).get("weights") or {}
    except PBError:
        pass
    w = {**DEFAULTS, **{k: max(0.0, min(3.0, float(v))) for k, v in stored.items()}}
    _CACHE[tid] = (time.time(), w)
    return w


def weight(pb: PB, tid: str, adm1: str) -> float:
    return float(weights(pb, tid).get(adm1 or "", 1.0)) if adm1 else 1.0
