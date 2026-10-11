"""Metered model router (unified master W23-W24, §9 "Model spending").

Every generation attempt (local or paid, successful or refused) is recorded in PocketBase `model_usage`; paid providers
also need an authorised `model_budgets` row. Rules:
  - The route is explicit configuration (WRITER_ROUTE, e.g. "ollama" or "anthropic,ollama"). There is NO implicit or
    silent paid fallback: a provider is only tried if it is named in the route.
  - Anthropic (the founder's proposed $10 experiment) runs only when ALL hold: ANTHROPIC_EXPERIMENT_ENABLED=true, an
    API key is present, a model_budgets row key='anthropic' exists with status='open', a non-empty authorized_by and a
    limit_usd (hard-capped at ANTHROPIC_MAX_USD, default 10). Before each call the WORST-CASE cost (input estimate +
    max_tokens at the output price) must fit inside the remaining global, per-agent-daily and per-call limits; after the
    call the actual usage is billed. When the limit is reached the row flips to 'exhausted' and paid calls stop.
  - SDK retries are disabled (max_retries=0): one attempt, one bill.
  - Prices are a local table (verified 2026-10-10 from the Claude API reference bundled with Claude Code); the budget
    row stores the limit, model_usage stores the computed cost so Command Center can reconcile against the provider
    console once the founder supplies it.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass

from ..pb import PB, PBError, q
from .base import GenerateRequest, GenerateResult, ModelProvider

log = logging.getLogger("palavva.router")

# USD per 1M tokens (input, output). Haiku 5.5: $0.10 / $0.50 for prompts up to 100K tokens.
PRICES = {"claude-haiku-5-5": (0.10, 0.50)}
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5")


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


@dataclass
class Route:
    providers: list[str]


def route() -> Route:
    return Route([p.strip() for p in os.environ.get("WRITER_ROUTE", "ollama").split(",") if p.strip()])


class Meter:
    def __init__(self, pb: PB, tenant_id: str):
        self.pb, self.tid = pb, tenant_id

    def record(self, *, provider: str, model: str, purpose: str, agent_id: str = "", event_id: str = "", tokens_in: int = 0, tokens_out: int = 0,
               cost: float = 0.0, latency_ms: int = 0, status: str = "ok", error: str = "", billable: bool = False, request_id: str = "") -> None:
        try:
            self.pb.create("model_usage", {"tenant_id": self.tid, "provider": provider, "model": model, "purpose": purpose, "agent_id": agent_id, "event_id": event_id,
                                           "tokens_in": tokens_in, "tokens_out": tokens_out, "cost_usd": round(cost, 6), "latency_ms": latency_ms, "status": status,
                                           "request_id": request_id or uuid.uuid4().hex[:24], "day": _today(), "error": error[:500], "billable": billable})
        except PBError as e:  # metering must never crash generation, but a failed meter BLOCKS paid calls (see spent())
            log.warning("model_usage write failed: %s", e)

    def budget(self, key: str) -> dict | None:
        return self.pb.first("model_budgets", f"tenant_id={q(self.tid)} && key={q(key)}")

    def spent(self, provider: str, agent_id: str | None = None, day: str | None = None) -> float:
        f = f"tenant_id={q(self.tid)} && provider={q(provider)} && billable=true"
        if agent_id:
            f += f" && agent_id={q(agent_id)}"
        if day:
            f += f" && day={q(day)}"
        return sum(float(r.get("cost_usd") or 0) for r in self.pb.list_all("model_usage", f))


class AnthropicWriter:
    """Claude via the official SDK (raw retries off). Disabled unless every gate in the module docstring passes."""
    name = "anthropic"

    def __init__(self, meter: Meter):
        self.meter = meter
        self.model = ANTHROPIC_MODEL

    def gate(self, agent_id: str, est_in: int, max_out: int) -> str:
        if os.environ.get("ANTHROPIC_EXPERIMENT_ENABLED", "false").lower() != "true":
            return "blocked_policy: ANTHROPIC_EXPERIMENT_ENABLED is not true"
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return "blocked_no_key: no ANTHROPIC_API_KEY configured"
        if self.model not in PRICES:
            return f"blocked_policy: no verified price for {self.model}"
        b = self.meter.budget("anthropic")
        if not b or b.get("status") != "open" or not b.get("authorized_by"):
            return "blocked_policy: no open, authorised model_budgets row 'anthropic'"
        cap = min(float(b.get("limit_usd") or 0), float(os.environ.get("ANTHROPIC_MAX_USD", "10")))
        pin, pout = PRICES[self.model]
        worst = (est_in * pin + max_out * pout) / 1e6
        if b.get("per_call_max_usd") and worst > float(b["per_call_max_usd"]):
            return f"blocked_budget: worst-case call cost ${worst:.5f} exceeds per-call max"
        spent = self.meter.spent("anthropic")
        if spent + worst > cap:
            try:
                self.meter.pb.update("model_budgets", b["id"], {"status": "exhausted", "note": f"exhausted at ${spent:.4f} of ${cap:.2f}"})
            except PBError:
                pass
            return f"blocked_budget: ${spent:.4f} spent of ${cap:.2f}"
        if b.get("per_agent_daily_usd") and agent_id and self.meter.spent("anthropic", agent_id, _today()) + worst > float(b["per_agent_daily_usd"]):
            return "blocked_budget: agent daily limit"
        if b.get("daily_calls"):
            n = len(self.meter.pb.list_all("model_usage", f"tenant_id={q(self.meter.tid)} && provider='anthropic' && day={q(_today())}"))
            if n >= int(b["daily_calls"]):
                return "blocked_budget: daily call limit"
        return ""

    def generate(self, req: GenerateRequest, agent_id: str = "", purpose: str = "write") -> GenerateResult:
        est_in = (len(req.system_instructions) + len(req.user_prompt)) // 3 + 50
        why = self.gate(agent_id, est_in, req.max_output_tokens)
        if why:
            status = why.split(":")[0]
            self.meter.record(provider=self.name, model=self.model, purpose=purpose, agent_id=agent_id, status=status, error=why)
            return GenerateResult("disabled", None, self.name, self.model, 0, error_code=why)
        import anthropic  # imported lazily: the dependency is only needed once the experiment is authorised
        client = anthropic.Anthropic(max_retries=0, timeout=req.timeout_ms / 1000)
        t0 = time.time()
        try:
            msg = client.messages.create(
                model=self.model, max_tokens=req.max_output_tokens, system=req.system_instructions,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": req.output_schema}},
                messages=[{"role": "user", "content": req.user_prompt}],
            )
        except anthropic.APIStatusError as e:
            self.meter.record(provider=self.name, model=self.model, purpose=purpose, agent_id=agent_id, status="error", error=f"{e.status_code}: {e.message}",
                              latency_ms=int((time.time() - t0) * 1000))
            return GenerateResult("failed", None, self.name, self.model, int((time.time() - t0) * 1000), error_code=f"HTTP_{e.status_code}")
        except anthropic.APIConnectionError as e:
            self.meter.record(provider=self.name, model=self.model, purpose=purpose, agent_id=agent_id, status="error", error=str(e)[:300])
            return GenerateResult("unavailable", None, self.name, self.model, int((time.time() - t0) * 1000), error_code="CONNECTION")
        ms = int((time.time() - t0) * 1000)
        u = msg.usage
        pin, pout = PRICES[self.model]
        cost = (u.input_tokens * pin + u.output_tokens * pout) / 1e6
        if msg.stop_reason == "refusal":
            self.meter.record(provider=self.name, model=self.model, purpose=purpose, agent_id=agent_id, tokens_in=u.input_tokens, tokens_out=u.output_tokens,
                              cost=cost, latency_ms=ms, status="rejected_output", error="refusal", billable=True, request_id=msg._request_id or "")
            return GenerateResult("invalid_output", None, self.name, self.model, ms, u.input_tokens, u.output_tokens, cost, error_code="REFUSAL")
        text = next((b.text for b in msg.content if b.type == "text"), "")
        try:
            out = json.loads(text)
            status = "ok"
        except ValueError:
            out, status = None, "rejected_output"
        self.meter.record(provider=self.name, model=self.model, purpose=purpose, agent_id=agent_id, tokens_in=u.input_tokens, tokens_out=u.output_tokens,
                          cost=cost, latency_ms=ms, status=status, billable=True, request_id=msg._request_id or "")
        return GenerateResult("succeeded" if out is not None else "invalid_output", out, self.name, self.model, ms, u.input_tokens, u.output_tokens, cost, raw_text=text)


_OR = {}


def shared_openrouter(meter: "Meter"):
    """One OpenRouterWriter per process and tenant, so the concurrency semaphore and auth cache are shared by all threads."""
    from .openrouter import OpenRouterWriter
    if meter.tid not in _OR:
        _OR[meter.tid] = OpenRouterWriter(meter)
    return _OR[meter.tid]


class MeteredRouter:
    """Drop-in ModelProvider: tries the configured route in order and meters every attempt."""

    def __init__(self, pb: PB, tenant_id: str, local: ModelProvider):
        self.meter = Meter(pb, tenant_id)
        self.local = local
        self.anthropic = AnthropicWriter(self.meter)
        self._openrouter = None
        self.name, self.model = local.name, local.model

    @property
    def openrouter(self):
        if self._openrouter is None:
            from .openrouter import OpenRouterWriter
            self._openrouter = shared_openrouter(self.meter)
        return self._openrouter

    def health(self) -> dict:
        return self.local.health()

    def generate(self, req: GenerateRequest, agent_id: str = "", purpose: str = "write", event_id: str = "") -> GenerateResult:
        last: GenerateResult | None = None
        for p in route().providers:
            if p == "anthropic":
                r = self.anthropic.generate(req, agent_id, purpose)
            elif p == "openrouter":
                r = self.openrouter.generate(req, agent_id, purpose, event_id)
            elif p in ("ollama", "fixture", self.local.name):
                r = self.local.generate(req)
                self.meter.record(provider=self.local.name, model=self.local.model, purpose=purpose, agent_id=agent_id, event_id=event_id,
                                  tokens_in=r.input_tokens or 0, tokens_out=r.output_tokens or 0, latency_ms=r.elapsed_ms,
                                  status={"succeeded": "ok", "timeout": "timeout", "invalid_output": "rejected_output"}.get(r.status, "error"), billable=False)
            else:
                continue
            last = r
            if r.status == "succeeded":
                self.name, self.model = r.provider, r.model
                return r
        return last or GenerateResult("disabled", None, "none", "none", 0, error_code="NO_PROVIDER_IN_ROUTE")
