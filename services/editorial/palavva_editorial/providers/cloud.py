"""Cloud provider adapters (OpenAI / Anthropic / OpenRouter): present but DISABLED.

They refuse to run unless PAID_FALLBACKS_ENABLED=true AND a key is configured AND an
operator explicitly selects them. No code path selects them automatically (T-034).
"""
from __future__ import annotations

from .base import GenerateRequest, GenerateResult


class DisabledCloudProvider:
    def __init__(self, name: str, enabled: bool = False, has_key: bool = False):
        self.name = name
        self.model = "n/a"
        self.enabled = enabled and has_key

    def health(self) -> dict:
        return {"reachable": False, "disabled": True, "reason": "paid providers disabled by policy (PAID_FALLBACKS_ENABLED=false)"}

    def generate(self, req: GenerateRequest) -> GenerateResult:
        return GenerateResult("disabled", None, self.name, self.model, 0, error_code="PAID_PROVIDER_DISABLED")
