"""Jev (TypeSafe) structured-decision adapter (unified master W22). Feature-flagged; FAILS CLOSED.

What is verified (2026-10-10, public descriptions incl. braintrust.dev/articles/what-is-jev): Jev takes a `state` text and
typed questions (choice: up to 255 options; score: 2-10 ordered levels; noul: yes/no probability) and returns, per
question, the selected value with probabilities and a confidence. It writes no prose. Reported (unverified) price:
$0.042 per 1M input tokens, output free; reported latency 70-500 ms. Direct API access is waitlisted; it is also listed on
OpenRouter.

What is NOT verified: the exact HTTP endpoint, auth header and JSON field names (docs.typesafe.ai was not reachable for
this build) and whether this account has access. Therefore:
  - Disabled unless JEV_ENABLED=true AND JEV_API_KEY AND JEV_BASE_URL are set AND a model_budgets row key='jev' is open
    and authorised. Jev is billed separately from Anthropic and never charged against the $10 experiment.
  - Any transport/shape error returns None, and the caller uses the deterministic decider (recorded as such).
"""
from __future__ import annotations

import os
import time

import httpx

from .router import Meter

JEV_INPUT_USD_PER_M = 0.042  # reported, unverified; recorded so Command Center can reconcile once billing is visible


def enabled() -> bool:
    return (os.environ.get("JEV_ENABLED", "false").lower() == "true" and bool(os.environ.get("JEV_API_KEY")) and bool(os.environ.get("JEV_BASE_URL")))


def decide(meter: Meter, state: str, questions: list[dict], *, agent_id: str = "", event_id: str = "") -> dict | None:
    """questions: [{"id": "action", "type": "choice", "question": "...", "options": [...]}, {"id": "upvote", "type": "noul", ...}].
    Returns {question_id: {"value": ..., "p": float, "confidence": float}} or None (caller falls back, recorded)."""
    if not enabled():
        return None
    b = meter.budget("jev")
    if not b or b.get("status") != "open" or not b.get("authorized_by"):
        meter.record(provider="jev", model=os.environ.get("JEV_MODEL", "jev-latest"), purpose="decide", agent_id=agent_id, event_id=event_id,
                     status="blocked_policy", error="no open, authorised model_budgets row 'jev'")
        return None
    est_in = len(state) // 3 + sum(len(str(qq)) for qq in questions) // 3
    cost = est_in * JEV_INPUT_USD_PER_M / 1e6
    if meter.spent("jev") + cost > float(b.get("limit_usd") or 0):
        meter.record(provider="jev", model="jev", purpose="decide", agent_id=agent_id, status="blocked_budget", error="jev budget reached")
        return None
    t0 = time.time()
    try:
        r = httpx.post(os.environ["JEV_BASE_URL"].rstrip("/") + "/decide", timeout=float(os.environ.get("JEV_TIMEOUT_SEC", "3")),
                       headers={"Authorization": f"Bearer {os.environ['JEV_API_KEY']}"},
                       json={"model": os.environ.get("JEV_MODEL", "jev-latest"), "state": state[:12000], "questions": questions})
        r.raise_for_status()
        data = r.json()
        out = {}
        for qq in questions:
            a = (data.get("answers") or data.get("results") or {}).get(qq["id"]) if isinstance(data, dict) else None
            if not isinstance(a, dict):
                raise ValueError(f"missing answer for {qq['id']}")
            out[qq["id"]] = {"value": a.get("value", a.get("choice", a.get("score", a.get("p")))), "p": float(a.get("p", a.get("probability", 0)) or 0),
                             "confidence": float(a.get("confidence", 0) or 0)}
        meter.record(provider="jev", model=os.environ.get("JEV_MODEL", "jev-latest"), purpose="decide", agent_id=agent_id, event_id=event_id, tokens_in=est_in,
                     cost=cost, latency_ms=int((time.time() - t0) * 1000), status="ok", billable=True)
        return out
    except (httpx.HTTPError, ValueError, KeyError) as e:
        meter.record(provider="jev", model="jev", purpose="decide", agent_id=agent_id, event_id=event_id, latency_ms=int((time.time() - t0) * 1000),
                     status="error", error=f"{type(e).__name__}: {e}"[:400])
        return None
