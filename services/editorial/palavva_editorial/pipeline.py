"""Ingest + editorial pipeline orchestration (07, 08).

Gates enforced here (and re-enforced by PocketBase hooks for publication):
- A source is fetched only if enabled AND rights_status=approved AND ingest not paused.
- Nothing this module does can publish: pieces are created as needs_review/held only.
- Qwen unavailable/paused/over budget => the job is deferred, nothing is invented.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Callable

from .config import Settings
from .editorial import prompts as P
from .editorial.validate import clean_claims, distinct_contributions, remap_ids, validate_draft
from .ingest.classify import classify
from .ingest.cluster import ClusterCandidate, choose_cluster
from .ingest.fetch import FetchError, safe_fetch
from .ingest.normalize import canonical_url, content_hash, idempotency_key, title_fingerprint
from .ingest.parse import ParseError, parse_feed
from .jobs import Queue
from .pb import PB, PBError, q
from .providers.base import GenerateRequest, GenerateResult, ModelProvider
from . import analytics_writer
from . import taxonomy as tx

log = logging.getLogger("palavva.pipeline")
PIPELINE_VERSION = "p1"
MAX_ITEMS_PER_FETCH = 25
MAX_AGE = timedelta(days=7)
CARD_MAX_AGE = timedelta(days=30)  # v1.5: verbatim source cards keep sparse editions honest but non-empty


def pbdate(d: datetime | None = None) -> str:
    return (d or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def parse_pbdate(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return None


def tenant_switch(pb: PB, tenant_id: str, key: str) -> bool:
    r = pb.first("tenant_settings", f"tenant_id={q(tenant_id)} && key={q(key)}")
    return bool(r and r.get("value") is True)


# --------------------------------------------------------------------------- ingest

_LAST_HOST_FETCH: dict[str, float] = {}
HOST_DELAY_SEC = 10.0  # publisher robots.txt Crawl-delay (Global Voices: 10); one worker, so this holds globally


def _polite_wait(url: str) -> None:
    import time as _t
    from urllib.parse import urlparse as _u
    host = (_u(url).hostname or "").lower()
    wait = HOST_DELAY_SEC - (_t.monotonic() - _LAST_HOST_FETCH.get(host, -1e9))
    if wait > 0:
        _t.sleep(wait)
    _LAST_HOST_FETCH[host] = _t.monotonic()


class IngestResult(dict):
    pass


def ingest_source(pb: PB, queue: Queue, settings: Settings, source: dict, fetcher: Callable = safe_fetch, force: bool = False) -> IngestResult:
    tid = source["tenant_id"]
    res = IngestResult(source_id=source["id"], fetched=False, new_items=0, duplicates=0, clustered=0, ignored=0, enqueued=0, error=None)
    # Rights gate: an unapproved or disabled source gets ZERO network requests (T-013).
    if source.get("rights_status") != "approved" or (not source.get("enabled") and not force):
        res["error"] = "RIGHTS_OR_DISABLED"
        return res
    if settings.ingest_paused or tenant_switch(pb, tid, "INGEST_PAUSED"):
        res["error"] = "INGEST_PAUSED"
        return res
    _polite_wait(source["endpoint_url"])
    now = datetime.now(timezone.utc)
    pb.update("sources", source["id"], {"last_attempt_at": pbdate(now)})
    try:
        allowed = set(source.get("allowed_hosts") or [])
        fr = fetcher(source["endpoint_url"], allowed or None, timeout=float(source.get("request_timeout_sec") or 15),
                     etag=source.get("etag") or "", last_modified=source.get("last_modified") or "")
        res["fetched"] = True
        items = [] if fr.status == 304 else parse_feed(fr.body)
    except (FetchError, ParseError) as e:
        fails = int(source.get("consecutive_failures") or 0) + 1
        backoff = min(24 * 60, int(source.get("fetch_interval_minutes") or 60) * (2 ** min(fails, 5)))
        pb.update("sources", source["id"], {"last_error_code": e.code, "consecutive_failures": fails, "next_fetch_at": pbdate(now + timedelta(minutes=backoff))})
        pb.audit(tid, "source.fetch_failed", "sources", source["id"], {"code": e.code})
        analytics_writer.write(settings, tid, "source_fetch_failed", source_id=source["id"])
        res["error"] = e.code
        return res
    pb.update("sources", source["id"], {"last_success_at": pbdate(now), "last_error_code": "", "consecutive_failures": 0, "etag": fr.etag, "last_modified": fr.last_modified,
                                        "next_fetch_at": pbdate(now + timedelta(minutes=int(source.get("fetch_interval_minutes") or 60)))})
    items.sort(key=lambda i: i.published or now, reverse=True)
    for it in items[:MAX_ITEMS_PER_FETCH]:
        _ingest_item(pb, queue, settings, source, it, res, now)
    pb.audit(tid, "source.fetched", "sources", source["id"], {k: res[k] for k in ("new_items", "duplicates", "clustered", "ignored", "enqueued")})
    return res


def _ingest_item(pb: PB, queue: Queue, settings: Settings, source: dict, it, res: IngestResult, now: datetime) -> None:
    tid = source["tenant_id"]
    url = canonical_url(it.link) if it.link else ""
    guid = (it.guid or url)[:500]
    if pb.first("source_items", f"tenant_id={q(tid)} && source_id={q(source['id'])} && guid={q(guid)}"):
        res["duplicates"] += 1  # exact replay: no new story (T-016)
        return
    policy = source.get("usage_policy") or "link_only"
    # Cut at a word boundary: a word split mid-way ("Ntsh") invites the model to complete it into an invented name.
    excerpt = word_cut(it.summary, 400) if policy in ("permitted_excerpt", "licensed_full") else ""
    chash = content_hash(it.title, excerpt or it.title)
    if pb.first("source_items", f"tenant_id={q(tid)} && source_id={q(source['id'])} && content_hash={q(chash)}"):
        res["duplicates"] += 1  # same text re-published under a new GUID
        return
    cls = classify(it.title, it.summary, source.get("countries") or [], source.get("topic_ids") or [], it.language)
    status, reason = "classified", "; ".join(cls.reasons)[:1900]
    published = it.published or now
    card_only = False
    if published < now - CARD_MAX_AGE:
        status, reason = "ignored", f"stale: published {published.isoformat()}"
    elif published < now - MAX_AGE and cls.africa_relevant:
        status, reason, card_only = "ignored", f"older than 7 days: source card only, no AI draft (published {published.isoformat()})", True
    elif not cls.africa_relevant:
        status, reason = "ignored", "no African country or Africa reference detected"
    try:
        si = pb.create("source_items", {
            "tenant_id": tid, "source_id": source["id"], "guid": guid, "canonical_url": url, "title": it.title[:1000], "permitted_excerpt": excerpt,
            "published_at": pbdate(published), "fetched_at": pbdate(now), "license_state": policy, "content_hash": chash, "title_fingerprint": title_fingerprint(it.title),
            "language": cls.language, "country_candidates": cls.countries, "topic_candidates": cls.topics, "classification_confidence": cls.confidence,
            "classification_ambiguous": cls.ambiguous, "status": status, "decision_reason": reason, "is_fixture": bool(source.get("is_fixture")),
            "author": it.author,
        })
    except PBError as e:
        if e.status == 400:  # unique index race: someone inserted it first
            res["duplicates"] += 1
            return
        raise
    res["new_items"] += 1
    if status != "ignored" or card_only:
        record_geo(pb, tid, si, it.title, it.summary, cls.countries, source.get("publisher_area") or "")
        from .sourcecards import upsert_source_card
        if upsert_source_card(pb, source, si, cls.countries, cls.topics, cls.risk, published):
            res["cards"] = res.get("cards", 0) + 1
    if status == "ignored":
        res["ignored"] += 1
        return
    # Clustering against open clusters from the last 72h.
    since = pbdate(now - timedelta(hours=72))
    open_clusters = pb.list("story_clusters", f"tenant_id={q(tid)} && latest_material_update_at >= {q(since)} && status != 'rejected' && status != 'merged'", "-latest_material_update_at", 200)
    cands = [ClusterCandidate(c["id"], " ".join(c.get("entity_keys") or []), c.get("primary_country_codes") or [], parse_pbdate(c.get("latest_material_update_at")), c.get("risk_tier") or "low") for c in open_clusters]
    decision = choose_cluster(title_fingerprint(it.title), cls.countries, published, cls.risk, cands)
    if decision.cluster_id:
        cl = pb.update("story_clusters", decision.cluster_id, {"latest_material_update_at": pbdate(max(published, now - timedelta(seconds=1)))})
        pb.create("cluster_sources", {"tenant_id": tid, "cluster_id": cl["id"], "source_item_id": si["id"], "claim_support_type": "update", "observed_at": pbdate(now), "match_reason": decision.explanation})
        pb.update("source_items", si["id"], {"status": "clustered", "cluster_id": cl["id"]})
        res["clustered"] += 1
        # Existing cluster: append coverage; no new public thread (editorial fatigue rule).
        if cl.get("status") in ("drafted", "published"):
            pb.audit(tid, "cluster.material_update", "story_clusters", cl["id"], {"source_item_id": si["id"], "explanation": decision.explanation})
        return
    slug = f"{tx.slugify(it.title)[:60].strip('-')}-{si['id'][:6]}"
    cl = pb.create("story_clusters", {"tenant_id": tid, "slug": slug, "summary": it.title[:2000], "risk_tier": cls.risk, "status": "open",
                                      "primary_country_codes": cls.countries, "topic_slugs": cls.topics, "latest_material_update_at": pbdate(published),
                                      "representative_item_id": si["id"], "match_explanation": decision.explanation, "entity_keys": title_fingerprint(it.title).split(),
                                      "is_fixture": bool(source.get("is_fixture"))})
    pb.create("cluster_sources", {"tenant_id": tid, "cluster_id": cl["id"], "source_item_id": si["id"], "claim_support_type": "origin", "observed_at": pbdate(now), "match_reason": "new cluster"})
    pb.update("source_items", si["id"], {"status": "clustered", "cluster_id": cl["id"]})
    _, created = queue.enqueue(tid, "draft_cluster", {"cluster_id": cl["id"]}, idempotency_key(tid, cl["id"], PIPELINE_VERSION, "draft"))
    res["enqueued"] += int(created)


def attach_geo(pb: PB, tid: str, piece_id: str, items: list[dict]) -> list[str]:
    """Link item-level geo evidence to the canonical piece; area_ids = mappable subject/event places only."""
    codes: set[str] = set()
    for it in items:
        if not pb.first("story_geo_evidence", f"tenant_id={q(tid)} && source_item_id={q(it['id'])}"):
            src = pb.get("sources", it["source_id"])
            record_geo(pb, tid, it, it["title"], it.get("permitted_excerpt") or "", it.get("country_candidates") or [], src.get("publisher_area") or "")
        for e in pb.list("story_geo_evidence", f"tenant_id={q(tid)} && source_item_id={q(it['id'])}", per_page=50):
            if not e.get("piece_id"):
                pb.update("story_geo_evidence", e["id"], {"piece_id": piece_id})
            if e["role"] in ("subject", "event") and e["confidence"] in ("high_confidence", "verified") and e["status"] not in ("rejected", "disputed"):
                codes.add(e["area_code"])
    authors = sorted({it.get("author") for it in items if it.get("author")})
    pb.update("editorial_pieces", piece_id, {"area_ids": sorted(codes), "source_authors": authors})
    return sorted(codes)


def record_geo(pb: PB, tid: str, item: dict, title: str, excerpt: str, countries: list[str], publisher_area: str) -> list[str]:
    """Store evidence-aware geography for a source item; returns mappable area codes."""
    from .geo import classify_geo, mappable, load_area_names
    if pb.first("story_geo_evidence", f"tenant_id={q(tid)} && source_item_id={q(item['id'])}"):
        return [e["area_code"] for e in pb.list("story_geo_evidence", f"tenant_id={q(tid)} && source_item_id={q(item['id'])} && (role='subject' || role='event') && (confidence='high_confidence' || confidence='verified') && status!='rejected'")]
    out = []
    for m in classify_geo(title, excerpt, countries, publisher_area, load_area_names()):
        pb.create("story_geo_evidence", {"tenant_id": tid, "source_item_id": item["id"], "area_code": m.area_code, "role": m.role, "confidence": m.confidence,
                                         "evidence_span": m.span[:480], "method": m.method, "status": "auto"})
        if mappable(m):
            out.append(m.area_code)
    return sorted(set(out))


# --------------------------------------------------------------------------- editorial

ROLE_FOR_TOPIC = {"fintech": "economist", "policy": "economist", "industry": "economist", "telecom": "consumer", "ecommerce": "consumer", "food": "consumer",
                  "ai-software": "technologist", "energy": "technologist", "mobility": "technologist", "logistics": "builder", "agriculture": "builder",
                  "music": "culture", "film-tv": "culture", "sports": "culture", "fashion": "culture", "history-heritage": "historian", "health": "ethics", "education": "ethics"}


class Deferred(Exception):
    def __init__(self, reason: str, seconds: int = 600):
        super().__init__(reason)
        self.reason, self.seconds = reason, seconds


def _run(pb: PB, queue: Queue, settings: Settings, provider: ModelProvider, tid: str, stage: str, user_prompt: str, cluster_id: str, job_id: str,
         role_id: str = "", system_extra: str = "", max_tokens: int = 700, evidence_ids: list[str] | None = None) -> GenerateResult:
    tenant = pb.first("tenants", f"id={q(tid)}") or {}
    limit = int((tenant.get("quotas_json") or {}).get("daily_ai_requests") or settings.model_daily_budget)
    if not queue.take_budget(tid, min(limit, settings.model_daily_budget)):
        raise Deferred("DAILY_BUDGET_EXHAUSTED", 3600)
    stage_prompt = {"curator": P.CURATOR, "researcher": P.RESEARCHER, "writer": P.WRITER, "role": system_extra}[stage]
    req = GenerateRequest(task_id=job_id, role_id=role_id, tenant_id=tid, prompt_version=P.VERSIONS[stage], system_instructions=P.SYSTEM + "\n\n" + stage_prompt,
                          user_prompt=user_prompt, output_schema=P.SCHEMAS[stage], max_output_tokens=max_tokens, timeout_ms=settings.model_timeout_sec * 1000,
                          idempotency_key=f"{job_id}:{stage}:{role_id}")
    r = provider.generate(req)
    status = {"succeeded": "succeeded", "timeout": "timeout", "invalid_output": "invalid_output"}.get(r.status, "failed")
    if r.status == "succeeded" and (r.structured_output or {}).get("decision") == "ABSTAIN" and not (r.structured_output or {}).get("claims"):
        status = "abstained"
    pb.create("ai_runs", {"tenant_id": tid, "task_type": stage, "role_id": role_id, "provider": r.provider, "model": r.model, "prompt_version": P.VERSIONS[stage],
                          "prompt_hash": P.prompt_hash(stage, system_extra), "input_evidence_ids": evidence_ids or [], "status": status, "duration_ms": r.elapsed_ms,
                          "tokens_json": {"input": r.input_tokens, "output": r.output_tokens}, "cost_estimate": 0, "error_code": r.error_code or "",
                          "job_id": job_id, "cluster_id": cluster_id, "is_fixture_provider": r.provider == "fixture"})
    if r.status == "succeeded":
        analytics_writer.write(settings, tid, "ai_generation_completed")
    if r.status in ("unavailable", "timeout", "disabled"):
        raise Deferred(f"MODEL_{r.status.upper()}:{r.error_code}", 600)
    return r


def word_cut(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > limit * 0.6 else cut).rstrip(" ,;:") + "…"


def draft_cluster(pb: PB, queue: Queue, settings: Settings, provider: ModelProvider, job: dict) -> dict:
    tid = job["tenant_id"]
    cid = job["payload"]["cluster_id"]
    if settings.ai_paused or tenant_switch(pb, tid, "AI_PAUSED"):
        raise Deferred("AI_PAUSED", 900)
    cl = pb.get("story_clusters", cid)
    if cl["tenant_id"] != tid:
        raise ValueError("tenant mismatch")
    if pb.first("editorial_pieces", f"tenant_id={q(tid)} && cluster_id={q(cid)}"):
        return {"outcome": "already_drafted"}  # idempotent replay: never a second piece (T-036)
    links = pb.list("cluster_sources", f"tenant_id={q(tid)} && cluster_id={q(cid)}", "created", 20)
    items = [pb.get("source_items", l["source_item_id"]) for l in links]
    sources_meta = {s["id"]: s for s in pb.list("sources", f"tenant_id={q(tid)}", per_page=200)}
    packet_sources = []
    for i, it in enumerate(items):
        src = sources_meta.get(it["source_id"], {})
        if src.get("rights_status") != "approved":
            pb.update("story_clusters", cid, {"status": "held"})
            return {"outcome": "held_rights"}
        packet_sources.append({"source_id": f"S{i + 1}", "publisher": src.get("publisher_name", ""), "title": it["title"], "url": it["canonical_url"],
                               "published_at": it["published_at"], "excerpt": it.get("permitted_excerpt") or "", "item_id": it["id"], "language": it.get("language") or "en",
                               "author": it.get("author") or "", "license": src.get("license_name") or "", "license_url": src.get("license_url") or ""})
    packet = {"cluster_id": cid, "countries": cl.get("primary_country_codes") or [], "topics": cl.get("topic_slugs") or [], "risk_hint": cl.get("risk_tier"),
              "rights_status": "approved", "sources": [{k: v for k, v in s.items() if k in ("source_id", "publisher", "title", "url", "published_at", "excerpt", "language")} for s in packet_sources]}
    packet_text = " ".join(f"{s['publisher']} {s['title']} {s['excerpt']} {s['published_at']}" for s in packet_sources)
    sid_to_item = {s["source_id"]: s["item_id"] for s in packet_sources}
    evidence_ids = [s["item_id"] for s in packet_sources]
    jid = job["job_id"]

    cur = _run(pb, queue, settings, provider, tid, "curator", P.packet_block(packet), cid, jid, max_tokens=300, evidence_ids=evidence_ids)
    cdec = (cur.structured_output or {}).get("decision", "HOLD")
    if cur.status != "succeeded" or cdec in ("IGNORE", "HOLD"):
        pb.update("story_clusters", cid, {"status": "rejected" if cdec == "IGNORE" else "held"})
        pb.audit(tid, "cluster.curator_decision", "story_clusters", cid, {"decision": cdec if cur.status == "succeeded" else cur.status, "reasons": (cur.structured_output or {}).get("reasons", [])})
        return {"outcome": f"curator_{cdec.lower()}"}

    res = _run(pb, queue, settings, provider, tid, "researcher", P.packet_block(packet), cid, jid, max_tokens=700, evidence_ids=evidence_ids)
    claims, flags = clean_claims((res.structured_output or {}).get("claims", []), set(sid_to_item))
    if res.status != "succeeded" or not claims:
        pb.update("story_clusters", cid, {"status": "held"})
        pb.audit(tid, "cluster.no_verifiable_claims", "story_clusters", cid, {"flags": flags})
        return {"outcome": "held_no_claims", "flags": flags}
    for c in claims:
        pb.upsert("evidence_claims", f"tenant_id={q(tid)} && cluster_id={q(cid)} && claim_key={q(c['claim_id'])}", {
            "tenant_id": tid, "cluster_id": cid, "claim_key": c["claim_id"], "statement": c["text"], "kind": c["kind"],
            "source_item_ids": [sid_to_item[s] for s in c["source_ids"]], "verification_status": "needs_review",
            "source_locator": ", ".join(packet_sources[int(s[1:]) - 1]["url"] for s in c["source_ids"]), "uncertainty_note": c["uncertainty"]})
    claims_packet = {"claims": [{"claim_id": c["claim_id"], "text": c["text"], "kind": c["kind"], "source_ids": c["source_ids"]} for c in claims], "sources": packet["sources"]}

    wr = _run(pb, queue, settings, provider, tid, "writer", P.packet_block(claims_packet) + "\nCite only these claim_ids: " + ", ".join(c["claim_id"] for c in claims),
              cid, jid, max_tokens=900, evidence_ids=evidence_ids)
    draft = wr.structured_output or {"decision": "ABSTAIN"}
    draft["what_happened"] = remap_ids(draft.get("what_happened") or [], claims)
    draft["why_it_matters"] = remap_ids(draft.get("why_it_matters") or [], claims)
    verdict = validate_draft(draft, claims, packet_text, cl.get("topic_slugs") or [])
    verdict.flags += flags
    if wr.status != "succeeded" or verdict.verdict == "FAIL" and "WRITER_ABSTAINED" in verdict.flags:
        pb.update("story_clusters", cid, {"status": "held"})
        pb.audit(tid, "cluster.writer_abstained", "story_clusters", cid, {"flags": verdict.flags})
        return {"outcome": "held_writer", "flags": verdict.flags}

    # v1.3: no flat role "analysis" cards. Replies are generated later by the conversation
    # engine, each against a specific parent post (conversation.py).
    kept: list[dict] = []
    injection = any("PROMPT_INJECTION_SUSPECTED" in (it.get("decision_reason") or "") for it in items)
    if injection:
        verdict.flags.append("SOURCE_PROMPT_INJECTION_SUSPECTED")

    held = verdict.verdict == "FAIL"
    rank = {"low": 0, "medium": 1, "high": 2}
    # Re-classify with the CURRENT ruleset (clusters may carry a tier computed by an older classifier).
    fresh = [classify(it["title"], it.get("permitted_excerpt") or "", [], []) for it in items]
    fresh_risk = max((c.risk for c in fresh), key=lambda r: rank.get(r, 0)) if fresh else "high"
    risk_reasons = [r for c in fresh for r in c.reasons if "sensitive" in r or "INJECTION" in r]
    risk = max(verdict.risk, fresh_risk, key=lambda r: rank.get(r, 0))
    tl_status = "NO_VERIFIED_COMPARISON"  # archive registry has no verified records: no model call, nothing invented
    body = {"what_happened": draft["what_happened"], "why_it_matters": draft["why_it_matters"], "unknowns": [str(u)[:300] for u in (draft.get("unknowns") or [])][:4]
            + [str(u)[:300] for u in ((res.structured_output or {}).get("unknowns") or [])][:2],
            "questions": [str(x)[:300] for x in (draft.get("questions") or [])][:2], "history": {"status": tl_status},
            "validation": {"verdict": verdict.verdict, "flags": verdict.flags}}
    slug = cl["slug"]
    if slug.startswith("-"):  # non-Latin source title (e.g. Arabic) slugifies to nothing: use the English headline
        slug = f"{tx.slugify(str(draft.get('headline', '')))[:60].strip('-') or 'topic'}{slug}"
    is_fixture = bool(cl.get("is_fixture")) or provider.name == "fixture"
    piece = pb.create("editorial_pieces", {
        "tenant_id": tid, "cluster_id": cid, "slug": slug, "kind": "discussion", "headline": str(draft.get("headline", ""))[:300] or packet_sources[0]["title"][:300],
        "lede": " ".join(b["text"] for b in draft["what_happened"])[:600], "body_blocks_json": body, "author_type": "editorial_ai_assisted", "risk_tier": risk,
        "review_status": "held" if held else "needs_review", "revision": 1, "is_demo": is_fixture, "country_codes": cl.get("primary_country_codes") or [],
        "topic_slugs": cl.get("topic_slugs") or [], "language": "en", "editor_pick": False,
        "sources_json": [{"name": s["publisher"], "url": s["url"], "title": s["title"], "published_at": s["published_at"], "language": s.get("language", "en"),
                          "author": s.get("author", ""), "license": s.get("license", ""), "license_url": s.get("license_url", "")} for s in packet_sources],
        "evidence_state": "complete" if not held else "incomplete", "claim_check_status": verdict.verdict, "ai_run_ids": "",
        "human_comment_count": 0, "ai_contribution_count": 0, "vote_score": 0, "save_count": 0, "still_developing": True,
        "thread_state": "candidate", "initiator_role": "researcher", "ai_post_count": 0, "original_language": "en",
        "origin_country": ((cl.get("primary_country_codes") or [""])[0]), "risk_basis": "; ".join(risk_reasons)[:1900],
    })
    pb.create("discussions", {"tenant_id": tid, "piece_id": piece["id"], "status": "open", "human_comment_count": 0, "ai_comment_count": 0})
    attach_geo(pb, tid, piece["id"], items)
    pb.update("story_clusters", cid, {"status": "drafted", "risk_tier": risk})
    for it in items:
        pb.update("source_items", it["id"], {"status": "drafted"})
    pb.audit(tid, "piece.drafted", "editorial_pieces", piece["id"], {"verdict": verdict.verdict, "flags": verdict.flags[:20], "provider": provider.name})
    # v1.3 risk-tiered publication (19 §2): only LOW + evidenced topics publish automatically.
    from . import conversation
    rights_ok = all(sources_meta.get(it["source_id"], {}).get("rights_status") == "approved" for it in items)
    tier, dec, reasons = conversation.assess_topic(piece, cl, verdict.flags, claims, rights_ok)
    if injection:
        tier, dec = "uncertain", "hold"
        reasons = reasons + ["prompt injection suspected in source text"]
    rules = {"rights": "PASS" if rights_ok else "FAIL", "risk_tier": risk, "claim_check": verdict.verdict, "claims": len(claims), "injection": "FAIL" if injection else "PASS"}
    if dec == "allow" and not held:
        ok, info = conversation.auto_publish(pb, queue, settings, pb.get("editorial_pieces", piece["id"]), tier, rules, reasons)
        return {"outcome": "auto_published" if ok else "held", "piece_id": piece["id"], "verdict": verdict.verdict, "flags": verdict.flags, "info": info}
    d = conversation.decision(pb, tid, "topic", piece["id"], piece["id"], dec, tier, rules, reasons, piece["headline"], piece["id"][:16])
    pb.update("editorial_pieces", piece["id"], {"thread_state": "held", "auto_decision_id": d["id"], "review_status": "held" if dec == "reject" or held else piece["review_status"]})
    return {"outcome": "held" if held else "needs_review", "piece_id": piece["id"], "verdict": verdict.verdict, "flags": verdict.flags, "tier": tier, "reasons": reasons}
