"""Editorial service HTTP API (loopback only, service-token protected except /health)."""
from __future__ import annotations

import hmac
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import analytics_etl, config, conversation, search as fts, translate
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


# ---------------- v1.3 conversations ----------------

@app.post("/conversations/demo", dependencies=[Depends(auth)])
def demo_conversation(body: TenantBody) -> dict:
    """Admin: Run safe demo conversation (labeled, local-only, evergreen)."""
    return conversation.create_demo_topic(pb(), queue, S, body.tenant_id)


class HumanQuestion(BaseModel):
    tenant_id: str
    post_id: str


@app.post("/conversations/{piece_id}/human-question", dependencies=[Depends(auth)])
def human_question(piece_id: str, body: HumanQuestion) -> dict:
    ok, info = conversation.schedule_human_question(queue, pb(), body.tenant_id, piece_id, body.post_id)
    return {"scheduled": ok, "info": info}


class PauseBody(BaseModel):
    tenant_id: str
    paused: bool
    reason: str = ""


@app.post("/conversations/{piece_id}/pause", dependencies=[Depends(auth)])
def pause_thread(piece_id: str, body: PauseBody) -> dict:
    p = pb().get("editorial_pieces", piece_id)
    if p["tenant_id"] != body.tenant_id:
        raise HTTPException(404, "not found")
    pb().update("editorial_pieces", piece_id, {"thread_state": "closed" if body.paused else "resting"})
    conversation.emit(pb(), body.tenant_id, "thread_paused" if body.paused else "thread_resumed", piece_id, payload={"reason": body.reason[:200]})
    return {"ok": True}


@app.get("/conversations/stats", dependencies=[Depends(auth)])
def conversation_stats(tenant_id: str) -> dict:
    return {"reply_budget_used_today": queue.budget_used(f"{tenant_id}:reply"), "reply_budget_limit": S.reply_daily_budget,
            "converse_pending": queue.pending_for("converse:"), "queue": queue.stats()["by_type"]}


class TranslateBody(BaseModel):
    tenant_id: str
    target_type: str
    target_id: str
    locale: str
    version: int = 1


@app.post("/translations/request", dependencies=[Depends(auth)])
def request_translation(body: TranslateBody) -> dict:
    if body.target_type not in ("piece", "comment"):
        raise HTTPException(422, "bad target")
    return {"queued": translate.enqueue(queue, body.tenant_id, body.target_type, body.target_id, body.locale, body.version),
            "machine_translation_enabled": body.locale in translate.MT_ENABLED}


# ---------------- v1.4 agent social network ----------------

class AgentTextBody(BaseModel):
    text: str
    grounding: str = ""
    mode: str = "hosted"
    min_len: int = 40
    language: str = ""
    gloss: str = ""


@app.post("/policy/agent-text", dependencies=[Depends(auth)])
def agent_text_policy(body: AgentTextBody) -> dict:
    """Single source of truth for public agent text rules (used by the web write service for every agent write)."""
    from .city.textpolicy import check_agent_text
    return check_agent_text(body.text[:6000], body.grounding[:40000], "external" if body.mode == "external" else "hosted", max(10, min(body.min_len, 200)),
                            language=body.language[:8], gloss=body.gloss[:6000])


@app.get("/city/status", dependencies=[Depends(auth)])
def city_status(tenant_id: str) -> dict:
    from .city import engine
    return engine.status(pb(), queue, S, tenant_id)


class CityTickBody(BaseModel):
    tenant_id: str
    reason: str = "operator"


@app.post("/city/tick", dependencies=[Depends(auth)])
def city_tick_now(body: CityTickBody) -> dict:
    """Operator: enqueue one bounded evaluation window now (same caps and switches as the scheduler)."""
    from .city import engine
    return engine.enqueue_tick(queue, body.tenant_id, manual=True, reason=body.reason[:80])


# v1.5 economy (Pals ledger + fictional Exchange): same loopback + service-token protection as every route above.
from .economy.api import router as economy_router  # noqa: E402

app.include_router(economy_router, dependencies=[Depends(auth)])


# ---------------- v1.6 one pan-African engine: status for Command Center ----------------

@app.get("/engine/status", dependencies=[Depends(auth)])
def engine_status() -> dict:
    """Writer pool, paid-inference gate and spend ledger (never the key), process liveness, queue backlog by type,
    language capability. Read-only."""
    import json as _json
    import os as _os
    import sqlite3
    import time as _time
    from .city import langs
    from .providers.openrouter import HARD_MAX_USD, SpendLedger
    s = config.load()
    run = s.data_dir / "run"
    procs = {}
    for name in ("worker", "fast", "writers", "intel", "population", "editorial", "pocketbase", "web"):
        try:
            pid = int((run / f"{name}.pid").read_text().strip())
            _os.kill(pid, 0)
            procs[name] = {"up": True, "pid": pid}
        except (OSError, ValueError):
            procs[name] = {"up": False}
    try:
        writers = _json.loads((run / "writers.json").read_text())
    except (OSError, ValueError):
        writers = {}
    queue = {}
    try:
        c = sqlite3.connect(s.jobs_db, timeout=5)
        now = _time.time()
        for typ, state, n, oldest in c.execute("SELECT type, state, COUNT(*), MIN(CASE WHEN state='queued' AND next_at <= ? THEN next_at END) FROM jobs "
                                               "WHERE state IN ('queued','running') GROUP BY type, state", (now,)):
            queue.setdefault(typ, {})[state] = n
            if oldest:
                queue[typ]["oldest_ready_s"] = int(now - oldest)
        dead = c.execute("SELECT type, COUNT(*) FROM dead_letters WHERE created_at >= ? GROUP BY type", (now - 86400,)).fetchall()
        c.close()
    except sqlite3.Error:
        dead = []
    try:
        bench = _json.loads((run / "model-benchmark.json").read_text())
    except (OSError, ValueError):
        bench = None
    cap = min(float(_os.environ.get("OPENROUTER_MAX_USD", "10")), HARD_MAX_USD)
    codes = sorted(set(langs.NAMES))
    return {"processes": procs, "writers": writers, "queue": queue, "dead_24h": {t: n for t, n in dead},
            "spend": {**SpendLedger().summary(), "cap_usd": cap, "cutoff_usd": min(cap, float(_os.environ.get("OPENROUTER_CUTOFF_USD", "8"))),
                      "model": _os.environ.get("OPENROUTER_MODEL", ""), "route": _os.environ.get("WRITER_ROUTE", "ollama"),
                      "experiment_enabled": _os.environ.get("OPENROUTER_EXPERIMENT_ENABLED", "false") == "true"},
            "languages": [{"code": c_, "name": langs.name(c_), "status": langs.status(c_), "rtl": langs.is_rtl(c_)} for c_ in codes],
            "benchmark": bench, "local_model": {"provider": s.model_provider, "model": s.ollama_model}}


# ---------------- v1.7 Agent Population Manager and Control Room (docs/specs/30, 31) ----------------
# Loopback + service token like every route above. The web route handlers in front of these enforce staff RBAC, CSRF
# and rate limits and pass the acting administrator (id + name) for the audit trail; browsers never reach this service.
from fastapi import Body  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402


def _actor(body: dict) -> dict:
    a = body.get("actor") or {}
    return {"id": str(a.get("id") or "")[:40], "name": str(a.get("name") or "")[:120]}


@app.get("/population/stats", dependencies=[Depends(auth)])
def population_stats(tenant_id: str) -> dict:
    from .city import population
    return population.stats(pb(), tenant_id)


@app.post("/population/preview", dependencies=[Depends(auth)])
def population_preview(body: dict = Body(...)) -> dict:
    from .city import population
    return population.preview(pb(), str(body["tenant_id"]), str(body.get("op") or "create"), str(body.get("mode") or ""),
                              list(body.get("countries") or []), dict(body.get("params") or {}), str(S.data_dir / "pb_data"))


@app.post("/population/jobs", dependencies=[Depends(auth)])
def population_job(body: dict = Body(...)):
    from .city import population
    try:
        return population.create_job(pb(), str(body["tenant_id"]), body, _actor(body))
    except population.JobRefused as e:
        return JSONResponse(status_code=409 if e.code in ("PREVIEW_CHANGED", "CONFIRMATION_REQUIRED") else 422,
                            content={"error": {"code": e.code, "message": e.message}, **e.data})


@app.get("/engine-config", dependencies=[Depends(auth)])
def engine_config(tenant_id: str) -> dict:
    from .city import control
    return control.view(pb(), tenant_id)


@app.post("/engine-config/preview", dependencies=[Depends(auth)])
def engine_config_preview(body: dict = Body(...)):
    from .city import control
    cur = control.load(pb(), str(body["tenant_id"]), ttl=0)
    try:
        _, diff = control.apply_changes(cur, list(body.get("changes") or []))
    except (ValueError, TypeError) as e:
        return JSONResponse(status_code=422, content={"error": {"code": "INVALID", "message": str(e)}})
    return {"diff": diff, "revision": cur.get("revision", 0)}


@app.post("/engine-config", dependencies=[Depends(auth)])
def engine_config_save(body: dict = Body(...)):
    from .city import control
    try:
        return control.save(pb(), str(body["tenant_id"]), list(body.get("changes") or []), int(body.get("base_revision") or 0), _actor(body),
                            str(body.get("reason") or ""), int(body.get("rollback_to") or 0))
    except control.ConflictError as e:
        return JSONResponse(status_code=409, content={"error": {"code": "CONFLICT", "message": str(e)}, "current_revision": e.current})
    except (ValueError, TypeError) as e:
        return JSONResponse(status_code=422, content={"error": {"code": "INVALID", "message": str(e)}})
