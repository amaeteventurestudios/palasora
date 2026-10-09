"""Runtime configuration from environment. Secrets are never logged."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    env: str
    pb_url: str
    pb_email: str
    pb_password: str
    service_token: str
    model_provider: str
    ollama_url: str
    ollama_model: str
    model_max_concurrency: int
    model_timeout_sec: int
    model_daily_budget: int
    paid_fallbacks_enabled: bool
    ingest_paused: bool
    ai_paused: bool
    auto_publish_disabled: bool
    reply_daily_budget: int = 150

    @property
    def jobs_db(self) -> Path:
        return self.data_dir / "jobs.db"

    @property
    def search_db(self) -> Path:
        return self.data_dir / "search.db"

    @property
    def analytics_dir(self) -> Path:
        return self.data_dir / "analytics"


def load() -> Settings:
    data = Path(os.environ.get("PALAVVA_DATA_DIR", "./data")).resolve()
    return Settings(
        data_dir=data,
        env=os.environ.get("PALAVVA_ENV", "development"),
        pb_url=os.environ.get("PB_URL", "http://127.0.0.1:8190"),
        pb_email=os.environ.get("PB_WORKER_EMAIL", ""),
        pb_password=os.environ.get("PB_WORKER_PASSWORD", ""),
        service_token=os.environ.get("EDITORIAL_SERVICE_TOKEN", ""),
        model_provider=os.environ.get("MODEL_PROVIDER", "ollama"),
        ollama_url=os.environ.get("OLLAMA_URL", "http://100.70.149.32:11434"),
        ollama_model=os.environ.get("OLLAMA_MODEL", "qwen3.5:4b"),
        model_max_concurrency=max(1, int(os.environ.get("MODEL_MAX_CONCURRENCY", "1"))),
        model_timeout_sec=int(os.environ.get("MODEL_TIMEOUT_SEC", "90")),
        model_daily_budget=int(os.environ.get("MODEL_DAILY_REQUEST_BUDGET", "60")),
        paid_fallbacks_enabled=_bool("PAID_FALLBACKS_ENABLED"),
        ingest_paused=_bool("INGEST_PAUSED"),
        ai_paused=_bool("AI_PAUSED"),
        auto_publish_disabled=_bool("AUTO_PUBLISH_DISABLED", True),
        reply_daily_budget=int(os.environ.get("CONVERSATION_DAILY_REPLY_BUDGET", "150")),
    )
