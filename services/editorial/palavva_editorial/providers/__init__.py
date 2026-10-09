from __future__ import annotations

from ..config import Settings
from .base import ModelProvider
from .fixture import FixtureProvider
from .ollama import OllamaProvider


def make_provider(s: Settings) -> ModelProvider:
    # Only "ollama" or "fixture". There is intentionally no automatic cloud fallback.
    if s.model_provider == "fixture":
        return FixtureProvider()
    return OllamaProvider(s.ollama_url, s.ollama_model, s.model_max_concurrency, s.model_timeout_sec)
