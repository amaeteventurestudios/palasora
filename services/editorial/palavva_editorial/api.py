"""Editorial service HTTP API (loopback only, service-token protected except /health)."""
from __future__ import annotations

import hmac
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import analytics_etl, config, search as fts
from .ingest.fetch import FetchError, safe_fetch
from .ingest.parse import ParseError, parse_feed
from .jobs import Queue
from .pb import PB, q
from .providers import make_provider
from .worker import reindex_all

S = config.load()
app = FastAPI(title="Palavva editorial", docs_url=None, redoc_url=None, openapi_url=None)
queue = Queue(S.jobs_db, lease_seconds=900)
_pb: PB | None = None
_provider_cache: dict = {"at": 0.0, "value": None}


def pb() -> PB:
    global _pb
    if _pb is None:
        _pb = PB(S.pb_url, S.pb_email, S.pb_password)
    return _pb


def auth(x_service_token: str = Header(default="")) -> None:
    if not S.service_token or not hmac.compare_digest(x_service_token, S.service_token):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def provider_health(force: bool = False) -> dict:
    if force or time.time() - _provider_cache["at"] > 60:
        p = make_provider(S)
        _provider_cache.update(at=time.time(), value={"provider": p.name, "model": p.model, **p.health(), "checked_at": time.time()})
    return _provider_cache["value"]


@app.get("/status", dependencies=[Depends(auth)])
def status(tenant_id: str = "") -> dict:
    return {
        "queue": queue.stats(), "provider": provider_health(), "budget_used_today": queue.budget_used(tenant_id) if tenant_id else None,
        "budget_limit": S.model_daily_budget, "max_concurrency": S.model_max_concurrency, "timeout_sec": S.model_timeout_sec,
        "flags": {"AI_PAUSED_ENV": S.ai_paused, "INGEST_PAUSED_ENV": S.ingest_paused, "AUTO_PUBLISH_DISABLED": S.auto_publish_disabled, "PAID_FALLBACKS_ENABLED": S.paid_fallbacks_enabled},
        "cloud_providers": {"openai": "disabled", "anthropic": "disabled", "openrouter": "disabled"}, "pocketbase": pb().health(),
    }


@app.post("/provider/probe", dependencies=[Depends(auth)])
def provider_probe() -> dict:
    return provider_health(force=True)


@app.get("/search", dependencies=[Depends(auth)])
def search(tenant_id: str, q: str, country: str | None = None, topic: str | None = None) -> dict:
    return {"ids": fts.search(S.search_db, tenant_id, q[:120], country, topic)}


@app.post("/reindex", dependencies=[Depends(auth)])
def reindex() -> dict:
    return {"indexed": reindex_all(pb(), S)}


class TenantBody(BaseModel):
    tenant_id: str


@app.post("/sources/{source_id}/test", dependencies=[Depends(auth)])
def test_source(source_id: str, body: TenantBody) -> dict:
    src = pb().get("sources", source_id)
    if src["tenant_id"] != body.tenant_id:
        raise HTTPException(404, "not found")
    if src.get("rights_status") != "approved":
        return {"ok": False, "network_request_made": False, "message": "Rights not approved: no network request was made."}
    if not src.get("endpoint_url"):
        return {"ok": False, "network_request_made": False, "message": "No endpoint configured."}
    try:
        fr = safe_fetch(src["endpoint_url"], set(src.get("allowed_hosts") or []) or None, timeout=float(src.get("request_timeout_sec") or 15))
        items = parse_feed(fr.body) if fr.status != 304 else []
        return {"ok": True, "network_request_made": True, "status": fr.status, "content_type": fr.content_type, "bytes": len(fr.body), "items": len(items),
                "sample": [{"title": i.title, "published": i.published.isoformat() if i.published else None, "link": i.link} for i in items[:3]], "hops": fr.hops}
    except (FetchError, ParseError) as e:
        return {"ok": False, "network_request_made": True, "error": e.code}


@app.post("/sources/{source_id}/ingest", dependencies=[Depends(auth)])
def ingest_now(source_id: str, body: TenantBody) -> dict:
    src = pb().get("sources", source_id)
    if src["tenant_id"] != body.tenant_id:
        raise HTTPException(404, "not found")
    jid, created = queue.enqueue(body.tenant_id, "fetch_source", {"source_id": source_id}, f"manual:{source_id}:{int(time.time() // 60)}")
    return {"job_id": jid, "created": created}


@app.post("/jobs/{job_id}/requeue", dependencies=[Depends(auth)])
def requeue(job_id: str) -> dict:
    return {"requeued": queue.requeue_dead(job_id)}


@app.post("/analytics/etl", dependencies=[Depends(auth)])
def etl() -> dict:
    return analytics_etl.run(S, pb())
