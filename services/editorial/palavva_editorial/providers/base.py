"""ModelProvider contract (08 §Provider adapter contract)."""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class GenerateRequest:
    task_id: str
    role_id: str
    tenant_id: str
    prompt_version: str
    system_instructions: str
    user_prompt: str
    output_schema: dict
    temperature: float = 0.2
    max_output_tokens: int = 700
    timeout_ms: int = 90_000
    idempotency_key: str = ""


@dataclass
class GenerateResult:
    status: str  # succeeded | failed | timeout | unavailable | invalid_output | disabled
    structured_output: dict | None
    provider: str
    model: str
    elapsed_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    estimated_cost: float | None = 0.0
    fallback_used: bool = False
    error_code: str | None = None
    retries: int = 0
    safety_flags: list[str] = field(default_factory=list)
    raw_text: str = ""


class ModelProvider(Protocol):
    name: str
    model: str
    def generate(self, req: GenerateRequest) -> GenerateResult: ...
    def health(self) -> dict[str, Any]: ...


# Max in-flight inference across the process (MODEL_MAX_CONCURRENCY, default 1).
_sem: threading.BoundedSemaphore | None = None


def semaphore(n: int) -> threading.BoundedSemaphore:
    global _sem
    if _sem is None:
        _sem = threading.BoundedSemaphore(max(1, n))
    return _sem
