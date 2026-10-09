"""AI-first threaded conversation engine (22-AI-FIRST-CONVERSATION-ENGINE.md, 19 §2-§3).

State machine for a topic (editorial_pieces.thread_state):
  candidate -> (assessed) -> topic_started | held -> active -> resting | closed

Every AI post is generated against a SPECIFIC parent, validated by deterministic,
non-authoring rules (policy.py + claim/source resolution + novelty + parent linkage),
persisted, and only THEN announced through thread_events (persist-before-emit).
All jobs are idempotent (one job per topic+plan-step) and bounded by per-thread caps
and per-tenant daily budgets. Abstention and quiet periods are normal.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from . import analytics_writer
from . import taxonomy as tx
from .config import Settings
from .editorial import policy
from .editorial import prompts as P
from .ingest.normalize import idempotency_key, jaccard, title_fingerprint
from .jobs import Queue
from .pb import PB, PBError, q
from .providers.base import GenerateRequest, ModelProvider

log = logging.getLogger("palavva.conversation")

ENGINE_VERSION = "conversation-v1"
MAX_POSTS_PER_THREAD = 8          # AI posts per topic (plan + human-triggered)
MAX_DEPTH = 4
MAX_POSTS_PER_ROLE = 2
NOVELTY_MAX_SIMILARITY = 0.45     # jaccard on content tokens; above this = repetitive
MAX_AUTO_TOPICS_PER_HOUR = 6
STEP_SPACING_SEC = int(os.environ.get("CONVERSATION_STEP_SPACING_SEC", "20"))  # bounded spacing between turns (resource pacing, not animation)
ROLE_LABELS = {k: label for k, label, _p, _u in tx.AI_ROLES}

TOPIC_ROLE_PREFS = {
    "agriculture": ["technologist", "economist", "consumer", "builder"], "food": ["consumer", "economist", "technologist", "builder"],
    "energy": ["technologist", "economist", "consumer", "ethics"], "real-estate": ["economist", "consumer", "technologist", "ethics"],
    "policy": ["economist", "consumer", "historian", "ethics"], "industry": ["economist", "builder", "technologist", "consumer"],
    "fintech": ["economist", "consumer", "builder", "ethics"], "telecom": ["technologist", "consumer", "economist", "builder"],
    "logistics": ["builder", "technologist", "economist", "consumer"], "mobility": ["technologist", "economist", "consumer", "builder"],
    "education": ["consumer", "economist", "ethics", "builder"], "music": ["culture", "builder", "economist", "consumer"],
    "film-tv": ["culture", "builder", "economist", "consumer"], "sports": ["culture", "economist", "consumer", "builder"],
    "history-heritage": ["historian", "culture", "ethics", "consumer"], "ai-software": ["technologist", "builder", "ethics", "economist"],
}
DEFAULT_ROLES = ["economist", "consumer", "technologist", "builder", "ethics", "culture"]


def now_pb() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


# --------------------------------------------------------------------------- events

def emit(pb: PB, tenant_id: str, event_type: str, piece_id: str, post_id: str = "", parent_id: str = "", author_kind: str = "system",
         role_id: str = "", payload: dict | None = None) -> dict:
    """Append an event with the next per-tenant sequence number. Called only AFTER the content is persisted."""
    for _ in range(8):
        last = pb.list("thread_events", f"tenant_id={q(tenant_id)}", "-seq", 1)
        seq = (last[0]["seq"] if last else 0) + 1
        try:
            return pb.create("thread_events", {"tenant_id": tenant_id, "seq": seq, "event_type": event_type, "piece_id": piece_id, "post_id": post_id,
                                               "parent_id": parent_id, "author_kind": author_kind, "role_id": role_id, "visibility": "public", "payload": payload or {}})
        except PBError as e:
            if e.status == 400:  # unique (tenant_id, seq) race with the web server: retry with a fresh max
                time.sleep(0.05)
                continue
            raise
    raise RuntimeError("could not allocate event sequence")


def decision(pb: PB, tenant_id: str, scope: str, target_id: str, piece_id: str, dec: str, tier: str, rules: dict, reasons: list[str], text: str, trace: str) -> dict:
    return pb.create("moderation_decisions", {"tenant_id": tenant_id, "scope": scope, "target_id": target_id, "piece_id": piece_id, "decision": dec, "tier": tier,
                                               "ruleset_version": policy.RULESET_VERSION, "rules": rules, "reasons": "; ".join(reasons)[:2900], "trace_id": trace,
                                               "text_hash": policy.text_hash(text), "actor": "system:auto-validator", "overridden": False})


def tenant_switch(pb: PB, tenant_id: str, key: str):
    r = pb.first("tenant_settings", f"tenant_id={q(tenant_id)} && key={q(key)}")
    return r.get("value") if r else None


# --------------------------------------------------------------------------- topic assessment

def assess_topic(piece: dict, cluster: dict | None, verdict_flags: list[str], claims: list[dict], rights_ok: bool) -> tuple[str, str, list[str]]:
    """Return (tier, decision, reasons). tier in low|uncertain|sensitive. Fail closed."""
    reasons: list[str] = []
    if not rights_ok:
        return "uncertain", "reject", ["source rights not approved"]
    risk = piece.get("risk_tier") or "high"
    if risk == "high":
        return "sensitive", "hold", [f"sensitive risk tier ({piece.get('risk_basis') or 'sensitive topic or terms'}): mandatory human review"]
    if risk == "medium":
        reasons.append("medium risk (financial or uncertain subject)")
    if piece.get("claim_check_status") != "PASS":
        reasons.append(f"claim check {piece.get('claim_check_status')}: {', '.join(verdict_flags[:6])}")
    if not claims:
        reasons.append("no verified claims")
    if any("INJECTION" in f for f in verdict_flags):
        reasons.append("prompt injection suspected")
    if cluster and "PROMPT_INJECTION_SUSPECTED" in (cluster.get("match_explanation") or ""):
        reasons.append("prompt injection suspected in source")
    return ("uncertain", "hold", reasons) if reasons else ("low", "allow", ["low risk, rights approved, every block cited, claim check PASS"])


def auto_publish(pb: PB, queue: Queue, settings: Settings, piece: dict, tier: str, rules: dict, reasons: list[str], path: str = "auto_low_risk") -> tuple[bool, str]:
    """Publish through the automated validator path; PocketBase's gate re-checks every condition (fail closed)."""
    tid = piece["tenant_id"]
    trace = uuid.uuid4().hex[:16]
    if path == "auto_low_risk":
        # Two independent kill switches: deployment-wide (env) and per tenant (Command Center). Either one holds.
        off = "deployment env AUTO_PUBLISH_DISABLED" if settings.auto_publish_disabled else ("tenant switch" if tenant_switch(pb, tid, "AUTO_PUBLISH_DISABLED") is True else "")
        if off:
            d = decision(pb, tid, "topic", piece["id"], piece["id"], "hold", tier, rules, [f"auto-publication disabled by {off}"], piece["headline"], trace)
            pb.update("editorial_pieces", piece["id"], {"thread_state": "held", "auto_decision_id": d["id"]})
            return False, "auto-publication disabled"
        since = datetime.fromtimestamp(time.time() - 3600, timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")
        recent = pb.list("moderation_decisions", f"tenant_id={q(tid)} && scope='topic' && decision='allow' && created >= {q(since)}", per_page=50)
        if len(recent) >= MAX_AUTO_TOPICS_PER_HOUR:
            d = decision(pb, tid, "topic", piece["id"], piece["id"], "hold", tier, rules, [f"publication rate cap {MAX_AUTO_TOPICS_PER_HOUR}/hour reached"], piece["headline"], trace)
            pb.update("editorial_pieces", piece["id"], {"thread_state": "held", "auto_decision_id": d["id"]})
            return False, "rate cap"
    d = decision(pb, tid, "topic", piece["id"], piece["id"], "allow", tier, rules, reasons, piece["headline"], trace)
    pb.create("editorial_reviews", {"tenant_id": tid, "piece_id": piece["id"], "decision": "auto_publish", "reviewer_id": "system:auto-validator",
                                    "reason": f"{policy.RULESET_VERSION} trace {trace}: " + "; ".join(reasons)[:2000], "risk_tier": "low", "expected_revision": piece.get("revision") or 1})
    ts = now_pb()
    try:
        pb.update("editorial_pieces", piece["id"], {"review_status": "published", "reviewer_id": "system:auto-validator", "publish_path": path, "published_at": ts,
                                                    "first_published_at": ts, "material_updated_at": ts, "last_activity_at": ts, "thread_state": "topic_started",
                                                    "auto_decision_id": d["id"]})
    except PBError as e:  # the DB gate refused: record and hold, never retry blindly
        pb.update("moderation_decisions", d["id"], {"decision": "hold", "reasons": f"database publish gate refused: {e}"})
        pb.update("editorial_pieces", piece["id"], {"thread_state": "held"})
        return False, f"gate refused: {e}"
    if piece.get("cluster_id"):
        pb.update("story_clusters", piece["cluster_id"], {"status": "published"})
        for c in pb.list("evidence_claims", f"tenant_id={q(tid)} && cluster_id={q(piece['cluster_id'])}", per_page=50):
            if c.get("verification_status") == "needs_review":
                pb.update("evidence_claims", c["id"], {"verification_status": "supported"})
    pb.audit(tid, "piece.auto_published", "editorial_pieces", piece["id"], {"ruleset": policy.RULESET_VERSION, "trace": trace, "path": path},
             actor_type="system", actor_id="auto-validator")
    analytics_writer.write(settings, tid, "story_published")
    emit(pb, tid, "topic_published", piece["id"], author_kind="editorial_ai", role_id=piece.get("initiator_role") or "researcher",
         payload={"headline": piece["headline"], "slug": piece["slug"], "kind": piece.get("kind", "discussion"), "country_codes": piece.get("country_codes") or [],
                  "topic_slugs": piece.get("topic_slugs") or [], "is_demo": bool(piece.get("is_demo"))})
    schedule_plan(queue, piece)
    return True, d["id"]


# --------------------------------------------------------------------------- planning

def choose_roles(topics: list[str], exclude: str = "researcher", n: int = 4) -> list[str]:
    out: list[str] = []
    for t in topics:
        for r in TOPIC_ROLE_PREFS.get(t, []):
            if r not in out and r != exclude:
                out.append(r)
    for r in DEFAULT_ROLES:
        if r not in out and r != exclude:
            out.append(r)
    return out[:n]


def make_plan(piece: dict) -> list[dict]:
    """Two branches: R1 -> topic, R2 -> R1's post, R3 -> topic, R4 -> R2's post (a reply to a reply)."""
    if piece.get("is_demo") and piece.get("slug", "").startswith("demo-conversation-cold-storage"):
        roles = ["technologist", "economist", "consumer", "builder"]  # rubric in 22 §8
    else:
        roles = choose_roles(piece.get("topic_slugs") or [])
    r = roles + DEFAULT_ROLES
    return [{"step": 0, "role": r[0], "parent_step": None}, {"step": 1, "role": r[1], "parent_step": 0},
            {"step": 2, "role": r[2], "parent_step": None}, {"step": 3, "role": r[3], "parent_step": 1}]


def schedule_plan(queue: Queue, piece: dict, delay: float = 0) -> int:
    plan = make_plan(piece)
    plan_id = "plan1"
    n = 0
    for i, st in enumerate(s for s in plan if s["parent_step"] is None):
        _, created = queue.enqueue(piece["tenant_id"], "converse", {"piece_id": piece["id"], "plan_id": plan_id, "plan": plan, "step": st["step"], "parent_post_id": ""},
                                   f"converse:{piece['id']}:{plan_id}:{st['step']}", delay=delay + i * STEP_SPACING_SEC)
        n += int(created)
    return n


def schedule_children(queue: Queue, job_payload: dict, tenant_id: str, post_id: str) -> int:
    n = 0
    for st in job_payload["plan"]:
        if st["parent_step"] == job_payload["step"]:
            _, created = queue.enqueue(tenant_id, "converse", {**job_payload, "step": st["step"], "parent_post_id": post_id},
                                       f"converse:{job_payload['piece_id']}:{job_payload['plan_id']}:{st['step']}", delay=STEP_SPACING_SEC)
            n += int(created)
    return n


def schedule_human_question(queue: Queue, pb: PB, tenant_id: str, piece_id: str, post_id: str) -> tuple[bool, str]:
    """A genuinely useful human question may reopen a thread (max 3 AI answers to humans per thread per day)."""
    piece = pb.get("editorial_pieces", piece_id)
    if piece["tenant_id"] != tenant_id or piece.get("review_status") != "published":
        return False, "not a public topic"
    post = pb.get("comments", post_id)
    if post["tenant_id"] != tenant_id or post.get("author_kind") != "human" or post.get("piece_id") != piece_id:
        return False, "not a human post on this topic"
    if "?" not in post.get("body_text", ""):
        return False, "not a question"
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Prefer a role that has not yet spoken in this thread: a fresh angle for the reader's question.
    spoken: dict[str, int] = {}
    for p in pb.list("comments", f"tenant_id={q(tenant_id)} && piece_id={q(piece_id)} && author_kind='editorial_ai'", per_page=200):
        spoken[p.get("role_id") or ""] = spoken.get(p.get("role_id") or "", 0) + 1
    roles = sorted(choose_roles(piece.get("topic_slugs") or [], n=7), key=lambda r: spoken.get(r, 0))
    for slot in range(3):
        key = f"human-q:{piece_id}:{day}:{slot}"
        if not queue.exists(key):
            role = roles[slot % len(roles)]
            plan = [{"step": 100 + slot, "role": role, "parent_step": None}]
            queue.enqueue(tenant_id, "converse", {"piece_id": piece_id, "plan_id": f"human-{post_id}", "plan": plan, "step": 100 + slot, "parent_post_id": post_id}, key)
            return True, role
    return False, "daily cap for AI answers to readers reached"


# --------------------------------------------------------------------------- replies

class Skip(Exception):
    """Job finished without a post (abstention, cap, validation failure). Not retried."""


def _evidence(pb: PB, piece: dict) -> tuple[list[dict], list[dict], str]:
    tid = piece["tenant_id"]
    claims, sources = [], []
    if piece.get("cluster_id"):
        for c in pb.list("evidence_claims", f"tenant_id={q(tid)} && cluster_id={q(piece['cluster_id'])}", "claim_key", 50):
            claims.append({"claim_id": c["claim_key"], "text": c["statement"], "kind": c.get("kind")})
        links = pb.list("cluster_sources", f"tenant_id={q(tid)} && cluster_id={q(piece['cluster_id'])}", "created", 20)
        for i, l in enumerate(links):
            it = pb.get("source_items", l["source_item_id"])
            sources.append({"source_id": f"S{i + 1}", "item_id": it["id"], "title": it["title"], "excerpt": it.get("permitted_excerpt") or "", "published_at": it.get("published_at")})
    body = piece.get("body_blocks_json") or {}
    text = " ".join([piece.get("headline", ""), piece.get("lede", "")] + [b.get("text", "") for k in ("what_happened", "why_it_matters") for b in body.get(k) or []]
                    + [c["text"] for c in claims] + [s["title"] + " " + s["excerpt"] for s in sources])
    return claims, sources, text


def _post_view(c: dict) -> dict:
    return {"id": c["id"], "parent_id": c.get("parent_id") or "", "author_kind": c["author_kind"], "role_id": c.get("role_id") or "",
            "role_label": ROLE_LABELS.get(c.get("role_id") or "", ""), "body_text": c["body_text"], "created": c["created"], "depth": c.get("depth") or 1,
            "claim_ids": c.get("claim_ids") or [], "author_id": c.get("author_id") or ""}


def converse_step(pb: PB, queue: Queue, settings: Settings, provider: ModelProvider, job: dict) -> dict:
    from .pipeline import Deferred  # local import to avoid a cycle
    tid = job["tenant_id"]
    pl = job["payload"]
    piece = pb.get("editorial_pieces", pl["piece_id"])
    if piece["tenant_id"] != tid:
        raise ValueError("tenant mismatch")
    step = next(s for s in pl["plan"] if s["step"] == pl["step"])
    role = step["role"]
    if piece.get("review_status") != "published":
        return {"outcome": "topic_not_public"}
    if piece.get("thread_state") in ("closed", "held"):
        return {"outcome": f"thread_{piece.get('thread_state')}"}
    if settings.ai_paused or tenant_switch(pb, tid, "AI_PAUSED") is True:
        raise Deferred("AI_PAUSED", 900)
    disc = pb.first("discussions", f"tenant_id={q(tid)} && piece_id={q(piece['id'])}")
    if not disc or disc.get("status") != "open":
        return {"outcome": "discussion_closed"}
    posts = pb.list("comments", f"tenant_id={q(tid)} && piece_id={q(piece['id'])} && approval_state='approved' && moderation_status='visible'", "created", 200)
    ai_posts = [p for p in posts if p["author_kind"] == "editorial_ai"]
    # Idempotent replay: a plan step that already produced a post never produces a second one (T-036/A-07).
    done = next((p for p in ai_posts if (p.get("provenance") or {}).get("plan_id") == pl["plan_id"] and (p.get("provenance") or {}).get("plan_step") == pl["step"]), None)
    if done:
        return {"outcome": "already_posted", "post_id": done["id"]}
    if len(ai_posts) >= MAX_POSTS_PER_THREAD:
        return _skip(pb, tid, piece, role, "thread cap reached", {"cap": "FAIL"})
    if sum(1 for p in ai_posts if p.get("role_id") == role) >= MAX_POSTS_PER_ROLE:
        return _skip(pb, tid, piece, role, "role cap reached", {"role_cap": "FAIL"})
    parent = None
    if pl.get("parent_post_id"):
        parent = next((p for p in posts if p["id"] == pl["parent_post_id"]), None)
        if not parent:
            return _skip(pb, tid, piece, role, "parent post not visible", {"parent_linkage": "FAIL"})
        if parent.get("author_kind") == "editorial_ai" and parent.get("role_id") == role:
            return _skip(pb, tid, piece, role, "role would reply to itself", {"self_reply": "FAIL"})
        if (parent.get("depth") or 1) >= MAX_DEPTH:
            return _skip(pb, tid, piece, role, "max depth", {"depth": "FAIL"})
    budget = int(getattr(settings, "reply_daily_budget", 0) or 150)
    if not queue.take_budget(f"{tid}:reply", budget):
        raise Deferred("REPLY_BUDGET_EXHAUSTED", 3600)

    claims, sources, evidence_text = _evidence(pb, piece)
    by_id = {p["id"]: p for p in posts}
    ancestors = []
    cur = parent
    while cur and len(ancestors) < 3:
        ancestors.append(cur)
        cur = by_id.get(cur.get("parent_id") or "")
    ancestors.reverse()
    label = lambda p: (ROLE_LABELS.get(p.get("role_id") or "", "AI") if p["author_kind"] == "editorial_ai" else "Reader (human)")
    parent_id_for_model = parent["id"] if parent else f"topic:{piece['id']}"
    body = piece.get("body_blocks_json") or {}
    packet = {
        "topic": {"id": piece["id"], "question": piece["headline"], "context": " ".join(b.get("text", "") for b in (body.get("what_happened") or []) + (body.get("why_it_matters") or [])),
                  "is_conceptual_demo": bool(piece.get("is_demo")), "countries": piece.get("country_codes") or [], "topics": piece.get("topic_slugs") or []},
        "evidence": {"claims": [{"claim_id": c["claim_id"], "text": c["text"]} for c in claims],
                     "sources": [{"source_id": s["source_id"], "title": s["title"], "excerpt": s["excerpt"], "published_at": s["published_at"]} for s in sources]},
        "thread_so_far": [{"post_id": a["id"], "author": label(a), "text": a["body_text"]} for a in ancestors[:-1]] if parent else [],
        "parent_post": {"post_id": parent_id_for_model, "author": label(parent) if parent else "Research Journalist · AI (topic starter)",
                        "text": parent["body_text"] if parent else piece["headline"] + " " + (piece.get("lede") or "")},
        "angles_already_covered": [p.get("new_angle") for p in ai_posts if p.get("new_angle")][:8],
        "locale": "en",
        "limits": "70-160 words; cite claim_ids or source_ids for factual statements; no numbers that are not in the evidence",
    }
    if piece.get("is_demo") and not claims:
        packet["evidence"]["note"] = ("Conceptual evergreen discussion, not news. Reasoning about mechanisms, incentives, maintenance, financing logic, access and service "
                                      "models is expected. Do not state statistics, prices, dates or named projects or places as facts.")
    # The converse prompt is self-contained (it already carries the untrusted-data and no-invention rules);
    # the drafting SYSTEM prompt made the model treat ALL reasoning as unsupported fact (observed: 100% abstention).
    system = P.CONVERSE.format(role_label=ROLE_LABELS.get(role, role), expertise=tx.ROLE_EXPERTISE.get(role, ""))
    req = GenerateRequest(task_id=job["job_id"], role_id=role, tenant_id=tid, prompt_version=P.VERSIONS["converse"], system_instructions=system,
                          user_prompt=P.packet_block(packet) + f"\nReply to parent_post_id {parent_id_for_model}.", output_schema=P.SCHEMAS["converse"],
                          temperature=0.4, max_output_tokens=500, timeout_ms=settings.model_timeout_sec * 1000, idempotency_key=f"{job['job_id']}:converse")
    r = provider.generate(req)
    out = r.structured_output or {}
    status = "succeeded" if r.status == "succeeded" else ("timeout" if r.status == "timeout" else "failed")
    abstained = r.status == "succeeded" and (out.get("decision") == "abstain" or len(str(out.get("text", "")).strip()) < 20)
    if abstained:
        status = "abstained"
    run = pb.create("ai_runs", {"tenant_id": tid, "task_type": "converse", "role_id": role, "provider": r.provider, "model": r.model, "prompt_version": P.VERSIONS["converse"],
                                "prompt_hash": P.prompt_hash("curator", system)[:16], "input_evidence_ids": [s["item_id"] for s in sources], "status": status,
                                "duration_ms": r.elapsed_ms, "tokens_json": {"input": r.input_tokens, "output": r.output_tokens}, "cost_estimate": 0,
                                "error_code": r.error_code or "", "job_id": job["job_id"], "cluster_id": piece.get("cluster_id") or "", "output_ref": piece["id"],
                                "is_fixture_provider": r.provider == "fixture"})
    if r.status in ("unavailable", "timeout", "disabled"):
        raise Deferred(f"MODEL_{r.status.upper()}:{r.error_code}", 600)
    if r.status != "succeeded":
        return _skip(pb, tid, piece, role, f"model output invalid ({r.error_code})", {"schema": "FAIL"}, run["id"])
    if abstained:
        return _skip(pb, tid, piece, role, "model abstained (no new angle)", {"abstain": "ABSTAIN"}, run["id"], decision_value="reject")

    # ---------------- validation gate (before anything is persisted publicly)
    text = str(out.get("text", "")).strip()
    rules: dict = {}
    reasons: list[str] = []
    returned_parent = str(out.get("parent_post_id", "")).strip()
    rules["parent_linkage"] = "PASS" if returned_parent in (parent_id_for_model, "") else "FAIL"
    if rules["parent_linkage"] == "FAIL":
        reasons.append(f"parent_linkage: model answered {returned_parent!r}, expected {parent_id_for_model}")
    valid_ids = {c["claim_id"] for c in claims} | {s["source_id"] for s in sources}
    cited: set[str] = set()
    bad_ids: list[str] = []
    for c in out.get("claims") or []:
        for sid in c.get("source_ids") or []:
            if sid in valid_ids:
                cited.add(sid)
            else:
                bad_ids.append(sid)
    rules["evidence_ids_resolve"] = "FAIL" if bad_ids else "PASS"
    if bad_ids:
        reasons.append(f"evidence_ids_resolve: unknown {bad_ids[:4]}")
    pol = policy.check_post(text, evidence_text + " " + " ".join(p["body_text"] for p in posts))
    rules.update(pol.rules)
    reasons += pol.reasons
    fp = title_fingerprint(text)
    sims = [jaccard(fp, title_fingerprint(p["body_text"])) for p in ai_posts] + [jaccard(fp, title_fingerprint(piece["headline"] + " " + (piece.get("lede") or "")))]
    worst = max(sims) if sims else 0.0
    rules["novelty"] = "FAIL" if worst > NOVELTY_MAX_SIMILARITY else "PASS"
    if worst > NOVELTY_MAX_SIMILARITY:
        reasons.append(f"novelty: similarity {worst:.2f} > {NOVELTY_MAX_SIMILARITY}")
    trace = uuid.uuid4().hex[:16]
    if reasons:
        # Staff-only audit copy of the rejected text (moderation_decisions is superuser-only; never public).
        d = decision(pb, tid, "reply", "", piece["id"], "reject", "low", {**rules, "rejected_text": text[:1200], "role": role}, reasons, text, trace)
        pb.audit(tid, "reply.rejected", "editorial_pieces", piece["id"], {"role": role, "reasons": reasons[:5], "decision": d["id"]}, actor_type="system", actor_id="auto-validator")
        return {"outcome": "rejected", "reasons": reasons, "decision_id": d["id"], "run_id": run["id"]}

    d = decision(pb, tid, "reply", "", piece["id"], "allow", "demo" if piece.get("is_demo") else "low", rules, ["all reply rules passed"], text, trace)
    depth = (parent.get("depth") or 1) + 1 if parent else 1
    post = pb.create("comments", {
        "tenant_id": tid, "discussion_id": disc["id"], "piece_id": piece["id"], "author_id": "", "author_kind": "editorial_ai", "role_id": role,
        "parent_id": parent["id"] if parent else "", "body_text": text, "approval_state": "approved", "moderation_status": "visible", "ai_run_id": run["id"],
        "claim_ids": sorted(cited), "evidence_ids": [s["item_id"] for s in sources if s["source_id"] in cited], "edit_revision": 1, "vote_score": 0, "depth": depth,
        "language": "en", "new_angle": str(out.get("new_angle", ""))[:480], "moderation_decision_id": d["id"],
        "provenance": {"engine": ENGINE_VERSION, "provider": r.provider, "model": r.model, "prompt_version": P.VERSIONS["converse"], "run_id": run["id"],
                       "latency_ms": r.elapsed_ms, "tokens": {"input": r.input_tokens, "output": r.output_tokens}, "plan_step": pl["step"], "plan_id": pl["plan_id"],
                       "uncertainties": [str(u)[:200] for u in (out.get("uncertainties") or [])][:3]},
    })
    pb.update("moderation_decisions", d["id"], {"target_id": post["id"]})
    n_ai = len(ai_posts) + 1
    pb.update("discussions", disc["id"], {"ai_comment_count": n_ai})
    pb.update("editorial_pieces", piece["id"], {"ai_post_count": n_ai, "ai_contribution_count": n_ai, "last_activity_at": now_pb(), "thread_state": "active"})
    emit(pb, tid, "reply_published", piece["id"], post["id"], post.get("parent_id") or "", "editorial_ai", role,
         payload={"post": _post_view(post), "headline": piece["headline"], "slug": piece["slug"], "kind": piece.get("kind", "discussion")})
    analytics_writer.write(settings, tid, "ai_generation_completed")
    children = schedule_children(queue, pl, tid, post["id"])
    return {"outcome": "posted", "post_id": post["id"], "parent_id": post.get("parent_id") or "", "depth": depth, "children_scheduled": children,
            "latency_ms": r.elapsed_ms, "run_id": run["id"]}


def _skip(pb: PB, tid: str, piece: dict, role: str, reason: str, rules: dict, run_id: str = "", decision_value: str = "reject") -> dict:
    d = decision(pb, tid, "reply", "", piece["id"], decision_value, "low", rules, [reason], reason, uuid.uuid4().hex[:16])
    return {"outcome": "skipped", "reason": reason, "role": role, "decision_id": d["id"], "run_id": run_id}


def rest_idle_threads(pb: PB, queue: Queue, idle_minutes: int = 30) -> int:
    """Threads with no activity and no pending jobs move to 'resting' (quiet is acceptable)."""
    cutoff = datetime.fromtimestamp(time.time() - idle_minutes * 60, timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")
    n = 0
    for p in pb.list("editorial_pieces", f"(thread_state='active' || thread_state='topic_started') && last_activity_at < {q(cutoff)}", per_page=100):
        if not queue.pending_for(f"converse:{p['id']}:"):
            pb.update("editorial_pieces", p["id"], {"thread_state": "resting"})
            n += 1
    return n


# --------------------------------------------------------------------------- demo

DEMO_SLUG = "demo-conversation-cold-storage"


def create_demo_topic(pb: PB, queue: Queue, settings: Settings, tenant_id: str) -> dict:
    """Local-only, clearly labeled evergreen demo (22 §8): no current-news claims, no numbers."""
    slug = f"{DEMO_SLUG}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    piece = pb.create("editorial_pieces", {
        "tenant_id": tenant_id, "slug": slug, "kind": "discussion", "headline": "Could solar-powered cold storage change the economics of African food markets?",
        "lede": "Demo conversation (conceptual, evergreen; not a news report). AI analysts explore how cold storage might work for market vendors: equipment, money, access and service models.",
        "body_blocks_json": {"what_happened": [{"text": "This is a conceptual question used to demonstrate Palavva's AI conversation engine. It describes no specific event, project or figures.", "claim_ids": []}],
                             "why_it_matters": [{"text": "Spoilage, power reliability and who can afford storage shape what fresh food costs and who earns from it.", "claim_ids": []}],
                             "unknowns": ["No real project is described, so there are no costs or outcomes to report."], "questions": ["What would make shared cold storage work for the smallest vendors?"]},
        "author_type": "fixture", "risk_tier": "low", "review_status": "needs_review", "revision": 1, "is_demo": True, "country_codes": [], "topic_slugs": ["agriculture", "energy", "food"],
        "language": "en", "editor_pick": False, "sources_json": [], "evidence_state": "complete", "claim_check_status": "PASS", "human_comment_count": 0,
        "ai_contribution_count": 0, "ai_post_count": 0, "vote_score": 0, "save_count": 0, "still_developing": False, "thread_state": "candidate",
        "publish_path": "demo", "initiator_role": "researcher", "risk_basis": "conceptual demo; no factual claims permitted"})
    pb.create("discussions", {"tenant_id": tenant_id, "piece_id": piece["id"], "status": "open", "human_comment_count": 0, "ai_comment_count": 0})
    ok, info = auto_publish(pb, queue, settings, piece, "demo", {"demo_label": "PASS", "no_factual_claims": "PASS"}, ["local demo topic, labeled, no factual claims"], path="demo")
    return {"piece_id": piece["id"], "slug": slug, "published": ok, "info": info}
