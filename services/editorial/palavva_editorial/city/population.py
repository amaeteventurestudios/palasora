"""Agent Population Manager backend (docs/specs/30): plan, preview, durable jobs, resumable runner, activation.

Process model
  * The editorial API (palavva_editorial.api) answers previews and turns a confirmed intent into ONE population_jobs
    row (idempotency key unique in the DB). Planning is serialised by a process lock, so two admins confirming at the
    same moment get disjoint ordinal ranges for "Add N", and a second "Set Target" sees the first one's pending rows.
  * The runner (`python -m palavva_editorial.city.population`) claims queued/running jobs, works in batches of up to
    250 identities through the transactional PocketBase route /api/palavva/agents-batch, writes progress after every
    batch, honours pause/cancel between batches, and resumes after any restart from the stored per-country cursor.
    Re-running a batch is harmless: seed_key pop17:<CC>:<ordinal> is unique, so a repeat is reported as a duplicate.

Counting rules
  * "Registered" per country = Palavva resident identities whose primary country (edition) is that country, any status
    except retired. The 60 original continental identities (edition ALL) belong to no country.
  * "Eligible" = status active (the engines may consider them). "Active" = distinct agents with a committed public action
    in a window (agent-stats route); identities, schedules and drafts never count as activity.
  * Creating identities never creates posts, votes, trades, Sora or model calls.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import signal
import threading
import time
from datetime import datetime, timezone

from ..config import load
from ..pb import PB, PBError, q
from . import personas

log = logging.getLogger("palavva.population")
PLAN_LOCK = threading.Lock()
BATCH = 250
MAX_PER_COUNTRY = 5000          # one job may not plan more than this many new identities for one country
MAX_TOTAL = 60000               # one job may not plan more than this many identities in total
TWO_STEP_THRESHOLD = 10000      # larger creations (or any rollback) need the typed confirmation phrase
PRIORITY_GROUP = ("priority-growth-markets", "Priority Growth Markets",
                  "Founder priority set (v1.7). Editable: other countries remain fully eligible for the baseline.",
                  ["NG", "GH", "ZA", "KE", "SN", "CI", "UG", "ZW", "ET"])
REGION_GROUPS = [("west-africa", "West Africa"), ("east-africa", "East Africa"), ("north-africa", "North Africa"),
                 ("central-africa", "Central Africa"), ("southern-africa", "Southern Africa")]


def now_pb(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts if ts is not None else time.time(), timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def ts_of(s: str) -> float:
    try:
        return datetime.strptime((s or "")[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return 0.0


def registry() -> dict[str, dict]:
    from ..economy.service import registry_countries
    return registry_countries()


# ------------------------------------------------------------------------------------------------ groups

def ensure_groups(pb: PB, tid: str) -> int:
    """Seed the editable Priority Growth Markets group and read-only regional groups (create-if-missing)."""
    reg = registry()
    n = 0
    rows = [(*PRIORITY_GROUP, "custom")] + [(slug, name, f"All {name} countries in the Palavva registry.",
                                             sorted(c for c, v in reg.items() if v.get("region") == name), "system") for slug, name in REGION_GROUPS]
    for slug, name, desc, codes, kind in rows:
        if not pb.first("country_groups", f"tenant_id={q(tid)} && slug={q(slug)}"):
            pb.create("country_groups", {"tenant_id": tid, "slug": slug, "name": name, "description": desc, "codes": codes, "kind": kind, "updated_by": "seed v1.7"})
            n += 1
    return n


def ensure_geo_areas(pb: PB) -> int:
    """Register every geoBoundaries ADM1 area of the 54 countries (create-if-missing by code), so any region can be selected,
    followed and shown on Local Pulse. Aliases stay EMPTY: verified-story tagging keeps using the curated gazetteer (geo.py),
    so a generic name such as "Centre" can never mis-tag a story."""
    have = {r["code"] for r in pb.list_all("geo_areas")}
    n = 0
    for cc, meta in personas.adm1().items():
        for a in meta["areas"]:
            if a["code"] in have:
                continue
            pb.create("geo_areas", {"code": a["code"], "country": cc, "level": "admin1", "kind": "region", "name": a["name"], "names": {"en": a["name"]},
                                    "aliases": [], "ambiguous_aliases": [], "dataset": meta["dataset"], "dataset_version": "geoBoundaries current (2026-10-11)",
                                    "geometry_available": True})
            n += 1
    return n


# ------------------------------------------------------------------------------------------------ stats

def stats(pb: PB, tid: str) -> dict:
    """Per-country registered/eligible/paused/resting/retired and presentation counts + active windows (one SQL pass)."""
    raw = pb.route("GET", "/api/palavva/agent-stats", params={"tenant_id": tid})
    reg = registry()
    rows: dict[str, dict] = {cc: {"cc": cc, "name": v["name"], "region": v.get("region", ""), "registered": 0, "female": 0, "male": 0, "eligible": 0,
                                  "resting": 0, "paused": 0, "held": 0, "retired": 0, "active_1h": 0, "active_24h": 0, "active_7d": 0,
                                  "max_ordinal": 0, "adm1_total": len(personas.regions(cc)), "adm1_covered": 0} for cc, v in reg.items()}
    continental = {"registered": 0, "eligible": 0}
    for g in raw["groups"]:
        if g["cc"] not in rows:
            if g["s"] != "retired":
                continental["registered"] += g["n"]
                continental["eligible"] += g["n"] if g["s"] == "active" else 0
            continue
        r = rows[g["cc"]]
        if g["s"] == "retired":
            r["retired"] += g["n"]
            continue
        r["registered"] += g["n"]
        if g["g"] in ("female", "male"):
            r[g["g"]] += g["n"]
        key = {"active": "eligible", "resting": "resting", "paused": "paused", "held": "held"}.get(g["s"])
        if key:
            r[key] += g["n"]
    for cc, mx in raw["maxOrdinal"].items():
        if cc in rows:
            rows[cc]["max_ordinal"] = int(mx or 0)
    for cc, n in raw["adm1Covered"].items():
        if cc in rows:
            rows[cc]["adm1_covered"] = n
    for k, col in (("h1", "active_1h"), ("h24", "active_24h"), ("d7", "active_7d")):
        for cc, n in raw["active"][k].items():
            if cc in rows:
                rows[cc][col] = n
    tot = {k: sum(r[k] for r in rows.values()) for k in ("registered", "female", "male", "eligible", "resting", "paused", "held", "retired",
                                                        "active_1h", "active_24h", "active_7d")}
    tot["continental_registered"], tot["continental_eligible"] = continental["registered"], continental["eligible"]
    tot["continental_active_1h"] = raw["active"]["h1"].get("ALL", 0)
    tot["continental_active_24h"] = raw["active"]["h24"].get("ALL", 0)
    tot["continental_active_7d"] = raw["active"]["d7"].get("ALL", 0)
    tot["external"] = sum(o["n"] for o in raw["others"] if o["s"] != "retired")
    tot["writers_24h"] = int(raw.get("writers24h") or 0)
    return {"countries": rows, "totals": tot, "at": raw["at"], "pending": pending(pb, tid)}


def pending(pb: PB, tid: str) -> dict[str, dict]:
    """Identities planned by unfinished create jobs and not yet written: {cc: {n, female, male}}."""
    out: dict[str, dict] = {}
    for j in pb.list("population_jobs", f"tenant_id={q(tid)} && op='create' && (status='queued' || status='running' || status='paused')", "created", 50):
        for cc, cp in (j.get("country_progress") or {}).items():
            left_f = max(0, int(cp.get("f", 0)) - int(cp.get("done_f", 0)))
            left_m = max(0, int(cp.get("m", 0)) - int(cp.get("done_m", 0)))
            if cp.get("closed"):
                left_f = left_m = 0
            o = out.setdefault(cc, {"n": 0, "female": 0, "male": 0, "end_ordinal": 0})
            o["n"] += left_f + left_m
            o["female"] += left_f
            o["male"] += left_m
            o["end_ordinal"] = max(o["end_ordinal"], int(cp.get("start", 0)) + int(cp.get("planned", 0)) - 1)
    return out


# ------------------------------------------------------------------------------------------------ planning

def _split(n: int, female_pct: float, female_now: int, male_now: int) -> tuple[int, int]:
    f = round(n * female_pct / 100.0)
    if female_pct == 50 and n % 2 == 1:  # odd balanced split: the extra goes to the presentation that has fewer today
        f = n // 2 + (1 if female_now <= male_now else 0)
    return max(0, min(n, f)), n - max(0, min(n, f))


def plan_create(st: dict, mode: str, codes: list[str], params: dict) -> dict:
    """Pure planning over a stats snapshot. Returns rows + totals + warnings (no writes)."""
    rows, warns = [], []
    pct = float(params.get("female_pct", 50))
    countries = st["countries"]
    pend = st["pending"]
    codes = [c for c in dict.fromkeys(codes) if c in countries]
    if not codes:
        return {"rows": [], "totals": {"create": 0, "female": 0, "male": 0, "countries": 0}, "warnings": ["No countries selected."]}
    alloc: dict[str, int] = {}
    if mode == "distribute_n":
        total = int(params.get("total") or 0)
        if params.get("distribute") == "deficit":
            ref = int(params.get("target") or 500)
            need = {c: max(0, ref - countries[c]["registered"] - pend.get(c, {}).get("n", 0)) for c in codes}
            sneed = sum(need.values())
            if sneed == 0:
                warns.append(f"Every selected country already has {ref} or more; distributing evenly instead.")
                need = {c: 1 for c in codes}
                sneed = len(codes)
            raw = {c: total * need[c] / sneed for c in codes}
        else:
            raw = {c: total / len(codes) for c in codes}
        alloc = {c: int(raw[c]) for c in codes}
        rest = total - sum(alloc.values())
        for c in sorted(codes, key=lambda c: (-(raw[c] - int(raw[c])), countries[c]["registered"], c))[:rest]:
            alloc[c] += 1
    for cc in codes:
        r = countries[cc]
        p = pend.get(cc, {"n": 0, "female": 0, "male": 0})
        cur, fem, mal = r["registered"] + p["n"], r["female"] + p["female"], r["male"] + p["male"]
        note = ""
        if mode == "set_target":
            target = int(params.get("target") or 0)
            deficit = max(0, target - cur)
            f_goal = round(target * pct / 100.0)
            f_need, m_need = max(0, f_goal - fem), max(0, (target - f_goal) - mal)
            if f_need + m_need > deficit:
                f = min(f_need, round(deficit * f_need / (f_need + m_need))) if (f_need + m_need) else 0
                m = deficit - f
                if deficit:
                    note = "presentation balance limited by existing identities (none are reassigned)"
            else:
                extra = deficit - f_need - m_need
                ef, em = _split(extra, pct, fem + f_need, mal + m_need)
                f, m = f_need + ef, m_need + em
            if cur >= target:
                note = f"already at or above {target}" + (" (including pending creations)" if p["n"] else "")
        elif mode == "add_n":
            n = int(params.get("add") or 0)
            f, m = _split(n, pct, fem, mal)
        else:
            f, m = _split(alloc.get(cc, 0), pct, fem, mal)
        n = f + m
        if n > MAX_PER_COUNTRY:
            warns.append(f"{r['name']}: {n} exceeds the per-job limit of {MAX_PER_COUNTRY}; split into several jobs.")
        rows.append({"cc": cc, "name": r["name"], "region": r["region"], "registered": r["registered"], "female": r["female"], "male": r["male"],
                     "eligible": r["eligible"], "pending": p["n"], "create": n, "create_f": f, "create_m": m, "after": cur + n, "after_f": fem + f,
                     "after_m": mal + m, "adm1_total": r["adm1_total"], "note": note})
    tot = {"create": sum(x["create"] for x in rows), "female": sum(x["create_f"] for x in rows), "male": sum(x["create_m"] for x in rows),
           "countries": len(rows), "countries_changed": sum(1 for x in rows if x["create"]), "registered_before": sum(x["registered"] for x in rows),
           "after": sum(x["after"] for x in rows)}
    if tot["create"] > MAX_TOTAL:
        warns.append(f"{tot['create']:,} identities exceed the per-job limit of {MAX_TOTAL:,}.")
    return {"rows": rows, "totals": tot, "warnings": warns}


def preview_hash(plan: dict, op: str, mode: str, params: dict) -> str:
    """Identity of WHAT will happen (counts per country and presentation, parameters), not of internal ordinals, so a
    confirmation is refused when the numbers the operator saw are no longer the numbers that would run."""
    sig = {"op": op, "mode": mode, "params": {k: params.get(k) for k in sorted(params) if k not in ("reason", "confirm")},
           "rows": [[r["cc"], r.get("create", r.get("change", 0)), r.get("create_f", 0), r.get("create_m", 0)] for r in plan["rows"]]}
    return hashlib.sha256(json.dumps(sig, sort_keys=True).encode()).hexdigest()[:24]


def examples(pb: PB, tid: str, plan: dict, k: int = 6) -> list[dict]:
    """The first identities the job would really create (same deterministic function the runner uses)."""
    keys = pb.route("GET", "/api/palavva/agent-keys", params={"tenant_id": tid})["rows"]
    handles = {h for h, *_ in keys}
    reg = registry()
    out = []
    for r in plan["rows"]:
        if not r["create"] or len(out) >= k:
            continue
        names = {(d or "").lower() for h, cc, d, _ in keys if cc == r["cc"]}
        start = r.get("start") or 1
        g = "female" if r["create_f"] >= r["create_m"] else "male"
        p = personas.persona(r["cc"], reg[r["cc"]]["name"], reg[r["cc"]].get("region", ""), start, g, set(handles), names)
        out.append({k2: p[k2] for k2 in ("display_name", "handle", "edition", "adm1_name", "settlement", "profession", "languages", "primary_subjects",
                                          "gender_persona", "bio", "subpal_slugs")})
    return out


def resources(pb_dir: str, create: int) -> dict:
    try:
        free = shutil.disk_usage(pb_dir).free
    except OSError:
        free = 0
    try:
        size = os.path.getsize(os.path.join(pb_dir, "data.db"))
    except OSError:
        size = 0
    per_agent = 3200  # measured: agent row + ~2.5 memberships + indexes (docs/evidence/v17/PERFORMANCE.md)
    return {"disk_free_bytes": free, "db_bytes": size, "estimated_new_bytes": create * per_agent, "ok": free > create * per_agent * 20}


def observed_rate(pb: PB, tid: str) -> float | None:
    """Identities per minute measured on the most recent completed create job (None before any job ran)."""
    j = pb.list("population_jobs", f"tenant_id={q(tid)} && op='create' && status='completed' && per_minute > 0", "-finished_at", 1)
    return float(j[0]["per_minute"]) if j else None


# ------------------------------------------------------------------------------------------------ activation planning

ACT_FROM = {"activate": ["resting"], "pause": ["active"], "resume": ["paused"], "deactivate": ["active"], "retire": ["resting", "paused"]}
ACT_TO = {"activate": "active", "pause": "paused", "resume": "active", "deactivate": "resting", "retire": "retired"}
PAUSE_TAG = "[population pause]"


def plan_activation(st: dict, op: str, codes: list[str], params: dict, caps: dict | None = None) -> dict:
    """activate: Count per country (`count`), percent of registered (`percent`) or all resting; capped by the Control Room
    max-eligible settings (country override, then global). pause/resume/deactivate/retire: every identity in scope."""
    caps = caps or {}
    rows, warns = [], []
    countries = st["countries"]
    for cc in [c for c in dict.fromkeys(codes) if c in countries]:
        r = countries[cc]
        avail = {"activate": r["resting"], "pause": r["eligible"], "resume": r["paused"], "deactivate": r["eligible"], "retire": r["resting"] + r["paused"]}[op]
        n, note = avail, ""
        if op == "activate":
            mode = params.get("mode") or "count"
            if mode == "count":
                n = min(avail, int(params.get("count") or 0))
            elif mode == "percent":
                want = int(round(r["registered"] * float(params.get("percent") or 0) / 100.0))
                n = min(avail, max(0, want - r["eligible"]))
                note = f"{params.get('percent')}% of {r['registered']} registered = {want} eligible"
            cap = caps.get(cc)
            if cap is not None and r["eligible"] + n > cap:
                n2 = max(0, cap - r["eligible"])
                note = f"capped at {cap} eligible by Control Room setting ({n - n2} not activated)"
                n = n2
            if n < int(params.get("count") or 0) and mode == "count" and not note:
                note = f"only {avail} registered identities are waiting"
        elif op == "resume":
            note = "only identities paused by a population operation; staff holds are never touched"
        rows.append({"cc": cc, "name": r["name"], "registered": r["registered"], "eligible": r["eligible"], "paused": r["paused"],
                     "resting": r["resting"], "change": n, "eligible_after": r["eligible"] + (n if ACT_TO[op] == "active" else -n if op in ("pause", "deactivate") else 0),
                     "note": note})
    gcap = caps.get("__global__")
    if op == "activate" and gcap is not None:
        cur = st["totals"]["eligible"] + st["totals"]["continental_eligible"]
        room = max(0, gcap - cur)
        want = sum(x["change"] for x in rows)
        if want > room:
            warns.append(f"Global max eligible is {gcap:,}; {cur:,} are eligible now, so only {room:,} of {want:,} can be activated (largest rows trimmed first).")
            over = want - room
            for x in sorted(rows, key=lambda x: -x["change"]):
                cut = min(over, x["change"])
                x["change"] -= cut
                x["eligible_after"] -= cut
                over -= cut
                if cut:
                    x["note"] = (x["note"] + "; " if x["note"] else "") + f"trimmed {cut} by global cap"
                if not over:
                    break
    return {"rows": rows, "totals": {"change": sum(x["change"] for x in rows), "countries": len(rows),
                                     "countries_changed": sum(1 for x in rows if x["change"])}, "warnings": warns}


# ------------------------------------------------------------------------------------------------ job creation

class JobRefused(Exception):
    def __init__(self, code: str, message: str, data: dict | None = None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data or {}


def caps_from_config(pb: PB, tid: str) -> dict:
    from . import control
    cfg = control.load(pb, tid, ttl=0)
    out: dict = {}
    g = cfg["global"].get("max_eligible_per_country")
    for cc in registry():
        v = control.effective(cfg, "max_eligible_per_country", cc)
        if v is not None:
            out[cc] = int(v)
    if cfg["global"].get("max_eligible_total") is not None:
        out["__global__"] = int(cfg["global"]["max_eligible_total"])
    _ = g
    return out


def preview(pb: PB, tid: str, op: str, mode: str, codes: list[str], params: dict, pb_dir: str = "") -> dict:
    st = stats(pb, tid)
    if op == "create":
        plan = plan_create(st, mode, codes, params)
        reserve(plan, st)
        plan["examples"] = examples(pb, tid, plan)
        plan["resources"] = resources(pb_dir, plan["totals"]["create"]) if pb_dir else {}
        rate = observed_rate(pb, tid)
        plan["estimate"] = {"per_minute": rate, "minutes": round(plan["totals"]["create"] / rate, 1) if rate else None,
                            "operations": plan["totals"]["create"] * 3, "model_calls": 0, "cost_usd": 0.0,
                            "basis": "measured on the last completed job" if rate else "measured after the first batch of this job"}
        plan["two_step"] = plan["totals"]["create"] > TWO_STEP_THRESHOLD
    else:
        plan = plan_activation(st, op, codes, params, caps_from_config(pb, tid))
        plan["two_step"] = op in ("retire",) or plan["totals"]["change"] > TWO_STEP_THRESHOLD
    plan["hash"] = preview_hash(plan, op, mode, params)
    plan["stats_at"] = st["at"]
    plan["confirm_phrase"] = f"{op.upper()} {plan['totals'].get('create', plan['totals'].get('change', 0))}" if plan["two_step"] else ""
    return plan


def reserve(plan: dict, st: dict) -> None:
    """Assign ordinal ranges: after every existing v1.7 identity AND every range an unfinished job has reserved."""
    for r in plan["rows"]:
        cc = r["cc"]
        top = max(st["countries"][cc]["max_ordinal"], st["pending"].get(cc, {}).get("end_ordinal", 0))
        r["start"] = top + 1


def create_job(pb: PB, tid: str, req: dict, actor: dict) -> dict:
    """Confirmed intent -> one durable job. Idempotent per key; refuses if the numbers changed since the preview."""
    op, mode = req.get("op", "create"), req.get("mode", "")
    codes, params = list(req.get("countries") or []), dict(req.get("params") or {})
    key = str(req.get("idempotency_key") or "")[:120]
    if not key:
        raise JobRefused("BAD_REQUEST", "idempotency_key required")
    existing = pb.first("population_jobs", f"tenant_id={q(tid)} && idempotency_key={q(key)}")
    if existing:
        return {"job": existing, "replayed": True}
    with PLAN_LOCK:
        existing = pb.first("population_jobs", f"tenant_id={q(tid)} && idempotency_key={q(key)}")
        if existing:
            return {"job": existing, "replayed": True}
        plan = preview(pb, tid, op, mode, codes, params) if op != "rollback" else None
        if op == "rollback":
            return _rollback_job(pb, tid, req, actor, key)
        if req.get("preview_hash") and req["preview_hash"] != plan["hash"]:
            raise JobRefused("PREVIEW_CHANGED", "The counts changed since your preview. Review the new preview and confirm again.", {"preview": plan})
        total = plan["totals"].get("create", plan["totals"].get("change", 0))
        if total <= 0:
            raise JobRefused("NOTHING_TO_DO", "This operation would not change anything.", {"preview": plan})
        if plan["two_step"] and (req.get("confirm") or "").strip().upper() != plan["confirm_phrase"]:
            raise JobRefused("CONFIRMATION_REQUIRED", f"Type {plan['confirm_phrase']} to confirm an operation of this size.", {"preview": plan})
        if any(w for w in plan.get("warnings", []) if "exceed" in w):
            raise JobRefused("LIMIT", "; ".join(plan["warnings"]), {"preview": plan})
        if op == "create":
            progress = {r["cc"]: {"planned": r["create"], "f": r["create_f"], "m": r["create_m"], "start": r["start"], "next": 0, "done": 0,
                                  "done_f": 0, "done_m": 0, "dup": 0, "skipped": 0, "failed": 0} for r in plan["rows"] if r["create"]}
            baseline = {r["cc"]: {"registered": r["registered"], "female": r["female"], "male": r["male"], "eligible": r["eligible"]} for r in plan["rows"]}
        else:
            progress = {r["cc"]: {"planned": r["change"], "done": 0, "skipped": 0, "failed": 0} for r in plan["rows"] if r["change"]}
            baseline = {r["cc"]: {"registered": r["registered"], "eligible": r["eligible"], "paused": r["paused"], "resting": r["resting"]} for r in plan["rows"]}
        job = pb.create("population_jobs", {
            "tenant_id": tid, "idempotency_key": key, "op": op, "mode": mode or "", "scope_kind": req.get("scope_kind") or "countries",
            "scope_label": str(req.get("scope_label") or "")[:200], "countries": sorted(progress), "params": params,
            "plan": {"rows": plan["rows"], "totals": plan["totals"], "warnings": plan.get("warnings", []), "estimate": plan.get("estimate")},
            "baseline": baseline, "preview_hash": plan["hash"], "status": "queued", "phase": "queued: waiting for the population runner",
            "total_planned": total, "done_count": 0, "skipped_count": 0, "duplicate_count": 0, "failed_count": 0, "country_progress": progress,
            "errors": [], "actor_id": actor.get("id", ""), "actor_name": actor.get("name", "")[:120], "reason": str(req.get("reason") or "")[:500],
            "per_minute": 0, "runner": "", "restarts": 0})
    pb.audit(tid, f"population.{op}_queued", "population_jobs", job["id"], {"mode": mode, "countries": len(progress), "total": total, "params": params,
                                                                           "scope": req.get("scope_label"), "reason": req.get("reason")},
             actor_type="user", actor_id=actor.get("id") or "admin")
    return {"job": job, "replayed": False}


def _rollback_job(pb: PB, tid: str, req: dict, actor: dict, key: str) -> dict:
    src = pb.get("population_jobs", str(req.get("rollback_of") or ""))
    if not src or src.get("tenant_id") != tid or src.get("op") != "create" or src.get("status") not in ("completed", "canceled", "failed", "paused"):
        raise JobRefused("BAD_REQUEST", "Rollback applies to a finished, canceled, failed or paused create job.")
    if (req.get("confirm") or "").strip().upper() != f"ROLLBACK {src['id']}".upper():
        raise JobRefused("CONFIRMATION_REQUIRED", f"Type ROLLBACK {src['id']} to confirm. Never-used identities are deleted; any identity with history is retired.")
    if src.get("status") == "paused":
        pb.update("population_jobs", src["id"], {"status": "canceled", "phase": "canceled for rollback"})
    n = pb.count("agents", f"tenant_id={q(tid)} && population_job={q(src['id'])} && status!='retired'")
    job = pb.create("population_jobs", {
        "tenant_id": tid, "idempotency_key": key, "op": "rollback", "mode": "", "scope_kind": "countries", "scope_label": f"rollback of {src['id']}",
        "countries": src.get("countries") or [], "params": {}, "plan": {"rollback_of": src["id"], "identities": n}, "baseline": {}, "preview_hash": "",
        "status": "queued", "phase": "queued", "total_planned": n, "done_count": 0, "skipped_count": 0, "duplicate_count": 0, "failed_count": 0,
        "country_progress": {}, "errors": [], "actor_id": actor.get("id", ""), "actor_name": actor.get("name", "")[:120],
        "reason": str(req.get("reason") or "")[:500], "per_minute": 0, "runner": "", "restarts": 0, "rollback_of": src["id"]})
    pb.audit(tid, "population.rollback_queued", "population_jobs", job["id"], {"rollback_of": src["id"], "identities": n}, actor_type="user",
             actor_id=actor.get("id") or "admin")
    return {"job": job, "replayed": False}


# ------------------------------------------------------------------------------------------------ runner

def _gender_at(i: int, f: int, total: int) -> str:
    """Deterministic interleave of f female among `total` identities (i-th is female when the running quota steps)."""
    if total <= 0:
        return "female"
    return "female" if ((i + 1) * f) // total > (i * f) // total else "male"


class Runner:
    def __init__(self, pb: PB, tid: str):
        self.pb, self.tid = pb, tid
        self.name = f"population-{os.getpid()}"
        self.stop = threading.Event()

    # -- claim
    def claim(self) -> dict | None:
        for j in self.pb.list("population_jobs", f"tenant_id={q(self.tid)} && (status='queued' || status='running')", "created", 20):
            if j["status"] == "running" and j.get("runner") and j["runner"] != self.name and ts_of(j.get("heartbeat_at") or "") > time.time() - 60:
                continue  # another live runner owns it
            restarted = j["status"] == "running" and j.get("runner") != self.name
            upd = {"status": "running", "runner": self.name, "heartbeat_at": now_pb(), "phase": "starting"}
            if not j.get("started_at"):
                upd["started_at"] = now_pb()
            if restarted:
                upd["restarts"] = int(j.get("restarts") or 0) + 1
                upd["phase"] = "resumed after a runner restart"
            return self.pb.update("population_jobs", j["id"], upd)
        return None

    def fresh_status(self, job: dict) -> str:
        return self.pb.get("population_jobs", job["id"]).get("status", "")

    def save(self, job: dict, **upd) -> dict:
        upd["heartbeat_at"] = now_pb()
        started = ts_of(job.get("started_at") or "") or time.time()
        done = int(upd.get("done_count", job.get("done_count") or 0))
        mins = max(1e-6, (time.time() - started) / 60)
        upd["per_minute"] = round(done / mins, 1) if done else 0
        job.update(upd)
        return self.pb.update("population_jobs", job["id"], upd)

    def err(self, job: dict, msg: str) -> None:
        errs = (job.get("errors") or [])[-49:] + [{"at": now_pb(), "message": msg[:300]}]
        job["errors"] = errs

    # -- run
    def run_job(self, job: dict) -> None:
        log.info("running job %s op=%s planned=%s", job["id"], job["op"], job.get("total_planned"))
        try:
            if job["op"] == "create":
                self.run_create(job)
            elif job["op"] == "rollback":
                self.run_rollback(job)
            else:
                self.run_status(job)
        except (OSError, __import__("httpx").HTTPError) as e:  # dependency down mid-job: leave it 'running'; it resumes later
            log.warning("job %s interrupted by %s; it will resume", job["id"], type(e).__name__)
            raise
        except Exception as e:  # noqa: BLE001 - the job records why; the runner keeps serving
            log.exception("job %s failed", job["id"])
            self.err(job, f"{type(e).__name__}: {e}")
            self.save(job, status="failed", phase=f"failed: {type(e).__name__}", finished_at=now_pb(), errors=job["errors"])
            self.pb.audit(self.tid, f"population.{job['op']}_failed", "population_jobs", job["id"], {"error": str(e)[:300]}, actor_type="system", actor_id=self.name)

    def _interrupted(self, job: dict) -> bool:
        s = self.fresh_status(job)
        if s in ("paused", "canceled"):
            job["status"] = s
            self.save(job, phase=("paused by an administrator" if s == "paused" else "canceled by an administrator"),
                      country_progress=job["country_progress"], errors=job.get("errors") or [], **({"finished_at": now_pb()} if s == "canceled" else {}))
            self.pb.audit(self.tid, f"population.job_{s}", "population_jobs", job["id"], {"done": job.get("done_count")}, actor_type="system", actor_id=self.name)
            return True
        return self.stop.is_set()

    def run_create(self, job: dict) -> None:
        reg = registry()
        params = job.get("params") or {}
        status_after = "active" if params.get("status_after") == "active" else "resting"
        keys = self.pb.route("GET", "/api/palavva/agent-keys", params={"tenant_id": self.tid})["rows"]
        handles = {h for h, *_ in keys}
        names_by_cc: dict[str, set[str]] = {}
        for h, cc, d, _ in keys:
            names_by_cc.setdefault(cc, set()).add((d or "").lower())
        subpals = self.pb.list_all("communities", f"tenant_id={q(self.tid)} && kind='subpal' && status='published'")
        by_slug = {s["slug"]: s for s in subpals}
        cohort = 100 + int(time.time() // 86400) % 1000  # v1.7 cohorts are >= 100 (v1.5 used 0-10)
        prog = job["country_progress"]
        target = int(params.get("target") or 0) if job.get("mode") == "set_target" else 0
        self.save(job, phase="creating identities")
        while True:
            open_cc = [cc for cc, cp in sorted(prog.items()) if not cp.get("closed") and cp["next"] < cp["planned"]]
            if not open_cc:
                break
            current = None
            if target:
                current = {cc: r["registered"] for cc, r in stats(self.pb, self.tid)["countries"].items()}
            for cc in open_cc:
                if self._interrupted(job):
                    return
                cp = prog[cc]
                if target and current is not None and current.get(cc, 0) >= target:
                    left = cp["planned"] - cp["next"]
                    cp["skipped"] += left
                    cp["next"] = cp["planned"]
                    cp["closed"] = "target already met at run time"
                    job["skipped_count"] = int(job.get("skipped_count") or 0) + left
                    continue
                n = min(BATCH, cp["planned"] - cp["next"])
                if target and current is not None:
                    n = min(n, max(0, target - current[cc]))
                batch, meta = [], []
                neighbours = [c for c in reg if reg[c].get("region") == reg[cc].get("region") and c != cc]
                for i in range(cp["next"], cp["next"] + n):
                    g = _gender_at(i, cp["f"], cp["planned"])
                    p = personas.persona(cc, reg[cc]["name"], reg[cc].get("region", ""), cp["start"] + i, g, handles, names_by_cc.setdefault(cc, set()), neighbours)
                    probs = personas.validate(p)
                    if probs:
                        cp["failed"] += 1
                        self.err(job, f"{p['seed_key']}: {', '.join(probs)}")
                        continue
                    sps = [by_slug[s]["id"] for s in p["subpal_slugs"] if s in by_slug]
                    sps += [s["id"] for s in subpals if cc in (s.get("edition_focus") or []) and set(s.get("topic_slugs") or []) &
                            {t for slug in p["subpal_slugs"] if slug in by_slug for t in (by_slug[slug].get("topic_slugs") or [])} and s["id"] not in sps][:1]
                    batch.append({"agent": personas.record(p, tenant_id=self.tid, job_id=job["id"], status=status_after, cohort=cohort), "subpals": sps})
                    meta.append((p, g))
                res = self._send(job, batch)
                for (p, g), r in zip(meta, res):
                    if r["status"] == "created":
                        cp["done"] += 1
                        cp["done_f" if g == "female" else "done_m"] += 1
                    elif r["status"] == "duplicate":
                        cp["dup"] += 1
                        cp["done_f" if g == "female" else "done_m"] += 1  # already exists from an earlier attempt of this job
                    else:
                        cp["failed"] += 1
                        self.err(job, f"{p['seed_key']}: {r.get('status')} {r.get('error', '')}")
                cp["next"] += n
                if current is not None:
                    current[cc] = current.get(cc, 0) + sum(1 for r in res if r["status"] == "created")
                tot = lambda k: sum(int(c.get(k, 0)) for c in prog.values())  # noqa: E731
                self.save(job, country_progress=prog, done_count=tot("done"), duplicate_count=tot("dup"), failed_count=tot("failed"),
                          skipped_count=tot("skipped"), errors=job.get("errors") or [],
                          phase=f"creating identities: {cc} {cp['next']}/{cp['planned']}")
        self.finish_create(job, by_slug, status_after)

    def _send(self, job: dict, batch: list[dict]) -> list[dict]:
        if not batch:
            return []
        for attempt in range(4):
            try:
                res = self.pb.route("POST", "/api/palavva/agents-batch", json={"tenant_id": self.tid, "agents": batch}, timeout=120)["results"]
                break
            except (PBError, OSError) as e:
                self.err(job, f"batch attempt {attempt + 1} failed: {e}")
                time.sleep(2 * (attempt + 1))
        else:
            return [{"status": "failed", "error": "batch failed 4 times"} for _ in batch]
        # A handle taken between generation and insert (e.g. an owner created an agent meanwhile): retry once with a new handle.
        out = []
        for item, r in zip(batch, res):
            if r["status"] == "handle_taken":
                a = dict(item["agent"])
                a["handle"] = f"{a['handle'][:24]}{int(hashlib.sha256(a['seed_key'].encode()).hexdigest()[:4], 16) % 9000 + 1000}"
                a["handle_key"] = a["handle"].lower()
                try:
                    r = self.pb.route("POST", "/api/palavva/agents-batch", json={"tenant_id": self.tid, "agents": [{**item, "agent": a}]})["results"][0]
                except PBError as e:
                    r = {"status": "failed", "error": str(e)[:200]}
            out.append(r)
        return out

    def finish_create(self, job: dict, by_slug: dict, status_after: str) -> None:
        self.save(job, phase="recounting SubPal memberships")
        for sp in by_slug.values():
            n = self.pb.count("agent_memberships", f"tenant_id={q(self.tid)} && target_type='subpal' && target_id={q(sp['id'])}")
            if sp.get("member_agent_count") != n:
                self.pb.update("communities", sp["id"], {"member_agent_count": n})
        if status_after == "active":
            self._trading_limits(job["id"])
        prog = job["country_progress"]
        self.save(job, status="completed", finished_at=now_pb(), country_progress=prog,
                  phase=f"completed: {job.get('done_count', 0):,} created, {job.get('duplicate_count', 0):,} already existed, "
                        f"{job.get('skipped_count', 0):,} skipped, {job.get('failed_count', 0):,} failed")
        self.pb.audit(self.tid, "population.create_completed", "population_jobs", job["id"],
                      {"created": job.get("done_count"), "duplicates": job.get("duplicate_count"), "skipped": job.get("skipped_count"),
                       "failed": job.get("failed_count"), "per_minute": job.get("per_minute")}, actor_type="system", actor_id=self.name)

    def _trading_limits(self, job_id: str = "", ids: list[str] | None = None) -> None:
        """Conservative default Exchange limits for platform identities that become eligible (as seed.ensure_trading_limits)."""
        from ..economy import db as edb
        from ..economy.service import con
        c = con()
        flt = f"tenant_id={q(self.tid)} && population_job={q(job_id)} && status='active'" if job_id else ""
        rows = self.pb.list_all("agents", flt) if job_id else [self.pb.get("agents", i) for i in (ids or [])]
        with edb.tx(c):
            for a in rows:
                if c.execute("SELECT 1 FROM trading_limits WHERE agent_id=?", (a["id"],)).fetchone():
                    continue
                mx = {"cautious": 300, "balanced": 600, "bold": 1000}.get(a.get("risk_profile") or "cautious", 300)
                c.execute("INSERT INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                          (a["id"], 1 if a.get("trading_enabled") else 0, mx, mx * 3, 6, json.dumps([]), "platform-default v1.7", edb.now()))

    def run_status(self, job: dict) -> None:
        op = job["op"]
        to, frm = ACT_TO[op], ACT_FROM[op]
        prog = job["country_progress"]
        self.save(job, phase=f"{op}: changing status")
        reason_like = PAUSE_TAG if op == "resume" else ""
        tag = f"{PAUSE_TAG} by population job {job['id']}" if op == "pause" else f"{op} by population job {job['id']}"
        activated: list[str] = []
        for cc in sorted(prog):
            cp = prog[cc]
            while cp["done"] + cp["skipped"] < cp["planned"]:
                if self._interrupted(job):
                    return
                want = min(500, cp["planned"] - cp["done"] - cp["skipped"])
                ids = self.pb.route("GET", "/api/palavva/agent-pick", params={"tenant_id": self.tid, "cc": cc, "status": frm[0], "limit": want,
                                                                              "reason_like": reason_like})["ids"]
                if op == "retire" and len(ids) < want and len(frm) > 1:
                    ids += self.pb.route("GET", "/api/palavva/agent-pick", params={"tenant_id": self.tid, "cc": cc, "status": frm[1], "limit": want - len(ids)})["ids"]
                if not ids:
                    cp["skipped"] += cp["planned"] - cp["done"] - cp["skipped"]
                    break
                r = self.pb.route("POST", "/api/palavva/agents-status", json={"tenant_id": self.tid, "ids": ids, "status": to, "from": frm, "reason": tag})
                cp["done"] += r["changed"]
                cp["skipped"] += r["skipped"]
                if to == "active":
                    activated += ids
                self.save(job, country_progress=prog, done_count=sum(c["done"] for c in prog.values()), skipped_count=sum(c["skipped"] for c in prog.values()),
                          phase=f"{op}: {cc} {cp['done']}/{cp['planned']}")
        if activated:
            self.save(job, phase="setting Exchange limits for newly eligible identities")
            for i in range(0, len(activated), 500):
                self._trading_limits(ids=activated[i:i + 500])
        self.save(job, status="completed", finished_at=now_pb(), country_progress=prog,
                  phase=f"completed: {job.get('done_count', 0):,} changed to {to}, {job.get('skipped_count', 0):,} skipped")
        self.pb.audit(self.tid, f"population.{op}_completed", "population_jobs", job["id"], {"changed": job.get("done_count"), "to": to},
                      actor_type="system", actor_id=self.name)

    def run_rollback(self, job: dict) -> None:
        from ..economy.service import con
        src = job.get("rollback_of")
        c = con()
        deleted = retired = 0
        self.save(job, phase="rollback: checking history")
        while True:
            if self._interrupted(job):
                return
            ids = [a["id"] for a in self.pb.list("agents", f"tenant_id={q(self.tid)} && population_job={q(src)} && status!='retired'", per_page=500)]
            # Anything in the fictional ledger (a balance, a reservation, an order) is history: retire, never delete.
            keep = [i for i in ids if c.execute("SELECT 1 FROM accounts WHERE owner_id=? AND (available != 0 OR reserved != 0) LIMIT 1", (i,)).fetchone()
                    or c.execute("SELECT 1 FROM orders WHERE owner_id=? LIMIT 1", (i,)).fetchone()]
            r = self.pb.route("POST", "/api/palavva/agents-rollback", json={"tenant_id": self.tid, "job_id": src, "keep": keep, "limit": 500})
            deleted += r["deleted"]
            retired += r["retired"]
            self.save(job, done_count=deleted + retired, phase=f"rollback: {deleted:,} never-used identities deleted, {retired:,} with history retired")
            if not r["remaining"]:
                break
        self.save(job, status="completed", finished_at=now_pb(), plan={**(job.get("plan") or {}), "deleted": deleted, "retired": retired},
                  phase=f"completed: {deleted:,} never-used identities deleted, {retired:,} retired (history kept)")
        self.pb.audit(self.tid, "population.rollback_completed", "population_jobs", job["id"], {"rollback_of": src, "deleted": deleted, "retired": retired},
                      actor_type="system", actor_id=self.name)

    def loop(self) -> None:
        """Never dies on a dependency restart (PocketBase / economy unavailable): wait and retry. A job interrupted that way is
        still 'running' with a stale heartbeat and is resumed from its saved per-country position."""
        backoff = 2.0
        while not self.stop.is_set():
            try:
                job = self.claim()
                if job:
                    self.run_job(job)
                    backoff = 2.0
                    continue
            except Exception as e:  # noqa: BLE001 - httpx.ConnectError, PBError, sqlite busy...
                log.warning("runner turn failed (%s: %s); retrying in %.0fs", type(e).__name__, e, backoff)
                self.stop.wait(backoff)
                backoff = min(60.0, backoff * 2)
                continue
            self.stop.wait(2.0)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    while True:  # PocketBase may still be starting (dev-up order) or restarting
        try:
            t = pb.first("tenants", "slug='palavva'")
            ensure_groups(pb, t["id"])
            log.info("geo areas registered: %s", ensure_geo_areas(pb))
            break
        except Exception as e:  # noqa: BLE001
            log.warning("startup waiting for PocketBase: %s", e)
            time.sleep(5)
    r = Runner(pb, t["id"])
    signal.signal(signal.SIGTERM, lambda *_: r.stop.set())
    signal.signal(signal.SIGINT, lambda *_: r.stop.set())
    log.info("population runner %s started", r.name)
    r.loop()
    log.info("population runner stopped")


if __name__ == "__main__":
    main()
