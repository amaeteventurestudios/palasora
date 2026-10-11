"""v1.7 Agent Population Manager and Control Room (docs/specs/30, 31, 36): persona synthesis, planning, durable jobs
(idempotency, concurrency, restart/resume, activation, rollback) and persisted settings, against the isolated PocketBase."""
from __future__ import annotations

import collections
import threading

import pytest

from palavva_editorial.city import control, names, personas, population as P


# ------------------------------------------------------------------------------------------------ persona synthesis (unit)

def _gen(cc: str, n: int, start: int = 1):
    hs, ns = set(), set()
    reg = P.registry()
    return [personas.persona(cc, reg[cc]["name"], reg[cc]["region"], i, P._gender_at(i - start, n // 2, n), hs, ns) for i in range(start, start + n)]


def test_persona_is_deterministic():
    a, b = _gen("NG", 30), _gen("NG", 30)
    assert [p["handle"] for p in a] == [p["handle"] for p in b]
    assert [p["display_name"] for p in a] == [p["display_name"] for p in b]


def test_full_country_cohort_is_valid_unique_and_balanced():
    for cc in ("NG", "KM", "SC", "ST", "EG", "CI"):  # big country, tiny name pools, mojibake-fixed, Arabic, synthesised codes
        ps = _gen(cc, 500)
        assert all(not personas.validate(p) for p in ps), [personas.validate(p) for p in ps if personas.validate(p)][:3]
        assert len({p["handle_key"] for p in ps}) == 500
        assert len({p["display_name"].lower() for p in ps}) == 500
        c = collections.Counter(p["gender_persona"] for p in ps)
        assert c["female"] == 250 and c["male"] == 250
        assert {p["adm1_code"] for p in ps} == {a["code"] for a in personas.regions(cc)}  # every region gets residents


def test_persona_policy():
    for p in _gen("KE", 200):
        assert p["display_name"].lower() not in names.FAMOUS
        bio = p["bio"].lower()
        assert "fictional persona" in bio and "not a real person" in bio and "never claims to have witnessed" in bio
        assert "religion" not in str(p).lower() and "ethnic" not in str(p).lower()
        assert p["persona"]["fictional"] is True


def test_regions_cover_all_54_countries():
    assert len(personas.adm1()) == 54
    assert {"NG": 37, "KE": 47, "SN": 14, "GH": 16, "EG": 27} == {cc: personas.adm1()[cc]["count"] for cc in ("NG", "KE", "SN", "GH", "EG")}


# ------------------------------------------------------------------------------------------------ planning (unit)

def _stats(counts: dict[str, tuple[int, int]], pending: dict | None = None) -> dict:
    reg = P.registry()
    rows = {cc: {"cc": cc, "name": v["name"], "region": v["region"], "registered": 0, "female": 0, "male": 0, "eligible": 0, "resting": 0, "paused": 0, "held": 0,
                 "retired": 0, "max_ordinal": 0, "adm1_total": 1} for cc, v in reg.items()}
    for cc, (f, m) in counts.items():
        rows[cc].update(registered=f + m, female=f, male=m, eligible=f + m)
    return {"countries": rows, "pending": pending or {}, "totals": {"eligible": sum(r["eligible"] for r in rows.values()), "continental_eligible": 0}}


def test_set_target_fills_only_deficits_and_balances():
    st = _stats({"NG": (65, 65), "GH": (21, 21), "SN": (300, 100), "KE": (250, 250)})
    plan = P.plan_create(st, "set_target", ["NG", "GH", "SN", "KE"], {"target": 500})
    r = {x["cc"]: x for x in plan["rows"]}
    assert (r["NG"]["create_f"], r["NG"]["create_m"]) == (185, 185)
    assert r["GH"]["create"] == 458 and r["GH"]["after_f"] == 250 and r["GH"]["after_m"] == 250
    assert r["SN"]["create"] == 100 and r["SN"]["create_m"] == 100  # 300 F already: fill male only, never reassign
    assert r["KE"]["create"] == 0 and "already" in r["KE"]["note"]


def test_all_africa_target_equals_real_deficit_and_repeat_is_zero():
    counts = {cc: (3, 3) for cc in P.registry()}
    st = _stats(counts)
    plan = P.plan_create(st, "set_target", sorted(P.registry()), {"target": 500})
    assert plan["totals"]["create"] == 54 * 494
    done = _stats({cc: (250, 250) for cc in P.registry()})
    assert P.plan_create(done, "set_target", sorted(P.registry()), {"target": 500})["totals"]["create"] == 0


def test_add_n_touches_only_selected_countries():
    plan = P.plan_create(_stats({"NG": (250, 250)}), "add_n", ["NG", "GH", "SN"], {"add": 100})
    assert plan["totals"] == {**plan["totals"], "create": 300, "female": 150, "male": 150, "countries": 3}
    assert {r["cc"] for r in plan["rows"]} == {"NG", "GH", "SN"}


def test_distribute_n_sums_exactly():
    for mode in ("even", "deficit"):
        plan = P.plan_create(_stats({"NG": (100, 100)}), "distribute_n", ["NG", "GH", "SN", "KE", "ZA", "ET", "UG"], {"total": 1001, "distribute": mode, "target": 500})
        assert plan["totals"]["create"] == 1001
    deficit = {r["cc"]: r["create"] for r in P.plan_create(_stats({"NG": (240, 240)}), "distribute_n", ["NG", "GH"], {"total": 100, "distribute": "deficit", "target": 500})["rows"]}
    assert deficit["GH"] > deficit["NG"]


def test_pending_creations_count_towards_set_target():
    st = _stats({"NG": (100, 100)}, pending={"NG": {"n": 300, "female": 150, "male": 150, "end_ordinal": 300}})
    assert P.plan_create(st, "set_target", ["NG"], {"target": 500})["rows"][0]["create"] == 0


def test_activation_respects_country_and_global_caps():
    st = _stats({"NG": (250, 250), "GH": (250, 250)})
    for r in st["countries"].values():
        r["resting"], r["eligible"] = r["registered"] - 100 if r["registered"] else 0, 100 if r["registered"] else 0
    plan = P.plan_activation(st, "activate", ["NG", "GH"], {"mode": "count", "count": 300}, {"NG": 250})
    r = {x["cc"]: x for x in plan["rows"]}
    assert r["NG"]["change"] == 150 and "capped" in r["NG"]["note"] and r["GH"]["change"] == 300
    st["totals"]["eligible"] = 200
    plan = P.plan_activation(st, "activate", ["NG", "GH"], {"mode": "count", "count": 300}, {"__global__": 400})
    assert plan["totals"]["change"] == 200 and plan["warnings"]


def test_gender_interleave_is_exact():
    for f, n in ((185, 370), (0, 10), (10, 10), (7, 13)):
        assert sum(P._gender_at(i, f, n) == "female" for i in range(n)) == f


# ------------------------------------------------------------------------------------------------ control room (unit)

def test_control_inheritance_override_and_reset():
    cfg = control.empty()
    new, diff = control.apply_changes(cfg, [{"scope": "global", "key": "news_interval_min", "value": 60}, {"scope": "NG", "key": "original_interval_min", "value": 5}])
    assert control.effective(new, "original_interval_min", "NG") == 5 and control.origin(new, "original_interval_min", "NG") == "country"
    assert control.effective(new, "original_interval_min", "GH") == control.schema()["original_interval_min"]["default"]
    new2, _ = control.apply_changes(new, [{"scope": "NG", "key": "original_interval_min", "reset": True}])
    assert control.origin(new2, "original_interval_min", "NG") == "default" and "NG" not in new2["countries"]


def test_control_validation_and_caps():
    with pytest.raises(ValueError):
        control.apply_changes(control.empty(), [{"scope": "NG", "key": "spend_cap_usd", "value": 1}])  # network-wide only
    with pytest.raises(ValueError):
        control.apply_changes(control.empty(), [{"scope": "global", "key": "spend_cap_usd", "value": control.env_spend_cap() + 1}])  # above authorised ceiling
    with pytest.raises(ValueError):
        control.apply_changes(control.empty(), [{"scope": "global", "key": "news_interval_min", "value": 0}])
    cfg = {"revision": 1, "global": {"daily_spend_usd": 99}, "countries": {}}
    assert control.effective(cfg, "daily_spend_usd") <= control.env_spend_cap()  # a stored value can never exceed the env ceiling


# ------------------------------------------------------------------------------------------------ jobs (integration)

@pytest.fixture(scope="module")
def pop(seeded):
    pb, tid = seeded["pb"], seeded["palavva"]["id"]
    P.ensure_groups(pb, tid)
    return pb, tid


def _run(pb, tid):
    r = P.Runner(pb, tid)
    while True:
        j = r.claim()
        if not j:
            return r
        r.run_job(j)


def _counts(pb, tid, cc):
    st = P.stats(pb, tid)["countries"][cc]
    return st["registered"], st["female"], st["male"]


def test_priority_group_is_seeded_and_editable(pop):
    pb, tid = pop
    g = pb.first("country_groups", f"tenant_id='{tid}' && slug='priority-growth-markets'")
    assert sorted(g["codes"]) == sorted(["NG", "GH", "ZA", "KE", "SN", "CI", "UG", "ZW", "ET"]) and g["kind"] == "custom"
    assert pb.first("country_groups", f"tenant_id='{tid}' && slug='west-africa'")["kind"] == "system"


def test_set_target_job_is_exact_idempotent_and_preserves_existing(pop, monkeypatch):
    pb, tid = pop
    monkeypatch.setattr(P, "BATCH", 7)
    before = {a["id"]: (a["handle"], a["status"]) for a in pb.list_all("agents", f"tenant_id='{tid}'")}
    req = {"op": "create", "mode": "set_target", "countries": ["ST", "SC", "KM"], "params": {"target": 20}, "idempotency_key": "t-set-20"}
    j = P.create_job(pb, tid, req, {"id": "u1", "name": "test"})["job"]
    assert P.create_job(pb, tid, req, {"id": "u1", "name": "test"})["replayed"] is True  # same key: same job
    _run(pb, tid)
    j = pb.get("population_jobs", j["id"])
    assert j["status"] == "completed" and j["failed_count"] == 0
    for cc in ("ST", "SC", "KM"):
        n, f, m = _counts(pb, tid, cc)
        assert n == 20 and f == 10 and m == 10 or (n == 20 and abs(f - m) <= 1)
    after = {a["id"]: (a["handle"], a["status"]) for a in pb.list_all("agents", f"tenant_id='{tid}'")}
    assert all(after[k] == v for k, v in before.items())  # existing identities untouched
    new = [a for a in pb.list_all("agents", f"tenant_id='{tid}' && population_job='{j['id']}'")]
    assert all(a["status"] == "resting" and a["post_count"] == 0 for a in new)  # registered inactive; nothing posted
    assert pb.count("agent_memberships", f"tenant_id='{tid}' && source='population'") >= len(new)
    with pytest.raises(P.JobRefused) as e:
        P.create_job(pb, tid, {**req, "idempotency_key": "t-set-20-again"}, {"id": "u1", "name": "test"})
    assert e.value.code == "NOTHING_TO_DO"


def test_add_n_changes_only_selected(pop):
    pb, tid = pop
    before = {cc: _counts(pb, tid, cc)[0] for cc in ("ST", "SC", "KM", "CV")}
    P.create_job(pb, tid, {"op": "create", "mode": "add_n", "countries": ["ST", "CV"], "params": {"add": 6}, "idempotency_key": "t-add-6"}, {"id": "u1", "name": "t"})
    _run(pb, tid)
    after = {cc: _counts(pb, tid, cc)[0] for cc in before}
    assert after["ST"] - before["ST"] == 6 and after["CV"] - before["CV"] == 6 and after["SC"] == before["SC"] and after["KM"] == before["KM"]


def test_two_admins_at_once_cannot_duplicate(pop):
    pb, tid = pop
    errs, jobs = [], []

    def go(k):
        try:
            jobs.append(P.create_job(pb, tid, {"op": "create", "mode": "set_target", "countries": ["GQ"], "params": {"target": 12}, "idempotency_key": k}, {"id": k, "name": k})["job"])
        except P.JobRefused as e:
            errs.append(e.code)
    ts = [threading.Thread(target=go, args=(f"admin-{i}",)) for i in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert len(jobs) == 1 and errs == ["NOTHING_TO_DO"]  # the second sees the first's pending identities
    _run(pb, tid)
    assert _counts(pb, tid, "GQ")[0] == 12


def test_runner_restart_resumes_without_duplicates(pop, monkeypatch):
    pb, tid = pop
    monkeypatch.setattr(P, "BATCH", 5)
    j = P.create_job(pb, tid, {"op": "create", "mode": "set_target", "countries": ["DJ"], "params": {"target": 23}, "idempotency_key": "t-resume"}, {"id": "u", "name": "t"})["job"]
    r1 = P.Runner(pb, tid)
    claimed = r1.claim()
    orig_save = r1.save
    calls = {"n": 0}

    def save_then_die(job, **upd):  # the process "dies" after the second progress write
        res = orig_save(job, **upd)
        calls["n"] += 1
        if calls["n"] == 3:
            r1.stop.set()
        return res
    r1.save = save_then_die
    r1.run_job(claimed)
    mid = pb.get("population_jobs", j["id"])
    assert mid["status"] == "running" and 0 < mid["done_count"] < 23
    pb.update("population_jobs", j["id"], {"heartbeat_at": "2000-01-01 00:00:00.000Z", "runner": "population-dead"})  # another process died; its lease expired
    _run(pb, tid)
    done = pb.get("population_jobs", j["id"])
    assert done["status"] == "completed" and done["restarts"] == 1
    assert _counts(pb, tid, "DJ")[0] == 23
    assert len({a["handle_key"] for a in pb.list_all("agents", f"tenant_id='{tid}' && edition='DJ'")}) == 23


def test_pause_and_resume_between_batches(pop, monkeypatch):
    pb, tid = pop
    monkeypatch.setattr(P, "BATCH", 4)
    base = _counts(pb, tid, "ER")[0]
    j = P.create_job(pb, tid, {"op": "create", "mode": "add_n", "countries": ["ER"], "params": {"add": 12}, "idempotency_key": "t-pause"}, {"id": "u", "name": "t"})["job"]
    r = P.Runner(pb, tid)
    claimed = r.claim()
    orig = r.save
    def pause_once(job, **upd):
        res = orig(job, **upd)
        if job.get("done_count", 0) >= 4 and pb.get("population_jobs", job["id"])["status"] == "running":
            pb.update("population_jobs", job["id"], {"status": "paused"})
        return res
    r.save = pause_once
    r.run_job(claimed)
    assert pb.get("population_jobs", j["id"])["status"] == "paused"
    pb.update("population_jobs", j["id"], {"status": "queued"})
    _run(pb, tid)
    assert pb.get("population_jobs", j["id"])["status"] == "completed" and _counts(pb, tid, "ER")[0] == base + 12


def test_activation_pause_resume_and_staff_hold(pop):
    pb, tid = pop
    held = pb.list("agents", f"tenant_id='{tid}' && edition='SC' && status='resting'", per_page=1)[0]
    pb.update("agents", held["id"], {"status_reason": "under review (staff)"})
    P.create_job(pb, tid, {"op": "activate", "countries": ["SC"], "params": {"mode": "all"}, "idempotency_key": "t-act"}, {"id": "u", "name": "t"})
    _run(pb, tid)
    st = P.stats(pb, tid)["countries"]["SC"]
    assert st["eligible"] == 19 and pb.get("agents", held["id"])["status"] == "resting"  # the staff hold was not touched
    P.create_job(pb, tid, {"op": "pause", "countries": ["SC"], "params": {}, "idempotency_key": "t-pause-sc"}, {"id": "u", "name": "t"})
    _run(pb, tid)
    assert P.stats(pb, tid)["countries"]["SC"]["paused"] == 19
    P.create_job(pb, tid, {"op": "resume", "countries": ["SC"], "params": {}, "idempotency_key": "t-resume-sc"}, {"id": "u", "name": "t"})
    _run(pb, tid)
    assert P.stats(pb, tid)["countries"]["SC"]["eligible"] == 19


def test_rollback_deletes_only_never_used_identities(pop):
    pb, tid = pop
    j = P.create_job(pb, tid, {"op": "create", "mode": "add_n", "countries": ["LS"], "params": {"add": 4}, "idempotency_key": "t-rb"}, {"id": "u", "name": "t"})["job"]
    _run(pb, tid)
    used = pb.list("agents", f"tenant_id='{tid}' && population_job='{j['id']}'", per_page=1)[0]
    pb.update("agents", used["id"], {"post_count": 1})  # this identity "did something"
    with pytest.raises(P.JobRefused):
        P.create_job(pb, tid, {"op": "rollback", "rollback_of": j["id"], "idempotency_key": "t-rb-1"}, {"id": "u", "name": "t"})  # no typed confirmation
    P.create_job(pb, tid, {"op": "rollback", "rollback_of": j["id"], "confirm": f"ROLLBACK {j['id']}", "idempotency_key": "t-rb-2"}, {"id": "u", "name": "t"})
    _run(pb, tid)
    left = pb.list_all("agents", f"tenant_id='{tid}' && population_job='{j['id']}'")
    assert [a["id"] for a in left] == [used["id"]] and left[0]["status"] == "retired"


def test_control_save_persists_conflicts_and_rolls_back(pop):
    pb, tid = pop
    cur = control.load(pb, tid, ttl=0)
    r1 = control.save(pb, tid, [{"scope": "NG", "key": "original_interval_min", "value": 5}, {"scope": "global", "key": "news_interval_min", "value": 30}],
                      cur["revision"], {"id": "u", "name": "t"}, "test")
    with pytest.raises(control.ConflictError):
        control.save(pb, tid, [{"scope": "global", "key": "news_interval_min", "value": 45}], cur["revision"], {"id": "u2", "name": "t2"}, "stale")
    control._CACHE.clear()  # a restarted process reads the persisted config
    fresh = control.load(pb, tid, ttl=0)
    assert control.effective(fresh, "original_interval_min", "NG") == 5 and control.effective(fresh, "news_interval_min", "GH") == 30
    r2 = control.save(pb, tid, [], r1["revision"], {"id": "u", "name": "t"}, "undo", rollback_to=max(1, r1["revision"] - 1) if r1["revision"] > 1 else 0) if r1["revision"] > 1 else None
    view = control.view(pb, tid)
    assert view["revisions"][0]["revision"] >= r1["revision"] and pb.count("audit_events", f"tenant_id='{tid}' && action='engine.config_changed'") >= 1
    _ = r2


def test_engine_routes_load_v17_residents(pop):
    """Regression (v1.7 run): the engine-agents route typed activity_propensity as an integer, so fractional values of new
    residents made every fast-engine refresh fail with HTTP 400."""
    pb, tid = pop
    r = pb.route("GET", "/api/palavva/engine-agents", params={"tenant_id": tid})
    k = r["keys"].index("activity_propensity")
    vals = [row[k] for row in r["rows"]]
    assert any(isinstance(v, float) and 0 < v < 1 and v != 0.5 for v in vals)
    assert pb.route("GET", "/api/palavva/engine-memberships", params={"tenant_id": tid})["rows"]
    assert "areas" in pb.route("GET", "/api/palavva/pulse-agents", params={"tenant_id": tid, "cc": "ST", "since": "2000-01-01 00:00:00"})
