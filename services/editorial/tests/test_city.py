"""v1.4 agent city: roster, seeding, policy, deterministic relevance, bounded acting, caps, kill switches, restart safety,
owner tasks, anti-collusion and database guards. Runs against an isolated PocketBase with the real migrations and hooks.
The web write service is replaced by a recording stub here (the full HTTP path is covered by Playwright v14.spec.ts)."""
from __future__ import annotations

import time
from collections import Counter

import pytest

from palavva_editorial import config
from palavva_editorial.city import engine
from palavva_editorial.city.roster import ROSTER, SUBPALS
from palavva_editorial.city.seed import seed_city
from palavva_editorial.city.textpolicy import check_agent_text
from palavva_editorial.jobs import Queue
from palavva_editorial.pb import PBError, q
from palavva_editorial.providers.fixture import FixtureProvider


@pytest.fixture()
def city(seeded, tmp_path, monkeypatch):
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    queue = Queue(tmp_path / "jobs.db")
    calls: list[tuple[str, dict]] = []

    def fake_web(settings, agent_id, path, body, origin="city"):
        calls.append((path, {**body, "_agent": agent_id}))
        return {"status": "published", "id": f"x{len(calls):014d}"}
    monkeypatch.setattr(engine, "web_call", fake_web)
    for k in ("CITY_DAILY_MODEL_CALLS", "CITY_HOURLY_MODEL_CALLS", "CITY_ENABLED"):
        monkeypatch.delenv(k, raising=False)
    # Each test starts with a clean decision log and active agents (the isolated PocketBase is shared per session).
    for r in pb.list_all("agent_actions", f"tenant_id={q(t['id'])}"):
        pb.delete("agent_actions", r["id"])
    engine._USAGE.clear()  # v1.6 in-process usage cache: rows were just deleted underneath it
    for a in pb.list_all("agents", f"tenant_id={q(t['id'])} && is_seed=true"):
        pb.update("agents", a["id"], {"status": "active", "cooldown_until": "", "memory": {"visited": [], "angles": [], "fingerprints": []}})
    for r in pb.list_all("tenant_settings", f"tenant_id={q(t['id'])} && key='CITY_PAUSED'"):
        pb.delete("tenant_settings", r["id"])
    return pb, t, s, queue, calls


def football_topic(pb, t, slug: str, headline: str = "What makes a pressing system work for a newly promoted football club?") -> dict:
    p = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": slug, "kind": "discussion", "headline": headline,
                                       "lede": "Coaches, tactics and midfield pressing in league football: the trade-offs of a high line.", "review_status": "needs_review",
                                       "risk_tier": "low", "claim_check_status": "PASS", "topic_slugs": ["sports"], "is_demo": False, "thread_state": "candidate", "revision": 1})
    pb.create("discussions", {"tenant_id": t["id"], "piece_id": p["id"], "status": "open"})
    editor = pb.first("users", "email='editor@palavva.local'")
    pb.create("editorial_reviews", {"tenant_id": t["id"], "piece_id": p["id"], "decision": "approve", "reviewer_id": editor["id"], "reason": "test topic"})
    ts = engine.now_pb()
    return pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": editor["id"], "publish_path": "human_review",
                                                   "published_at": ts, "last_activity_at": ts, "thread_state": "topic_started"})


def run(queue, pb, s, provider, types=("city_tick", "city_act", "owner_task")):
    outs = []
    while (job := queue.claim("w", list(types))):
        fn = {"city_tick": lambda j: engine.tick(pb, queue, s, j), "city_act": lambda j: engine.act(pb, queue, s, provider, j),
              "owner_task": lambda j: engine.owner_task(pb, queue, s, provider, j)}[job["type"]]
        out = fn(job)
        queue.complete(job["job_id"], "w", out)
        outs.append((job["type"], out))
    return outs


# ------------------------------------------------------------------ roster and seed

def test_roster_is_60_distinct_identities_in_ten_groups():
    assert len(ROSTER) == 60 and len({a["handle"].lower() for a in ROSTER}) == 60
    assert Counter(a["group"] for a in ROSTER) == {"business": 10, "football": 8, "culture": 6, "mobility": 6, "agriculture": 6, "technology": 6,
                                                   "learning": 6, "society": 4, "everyday": 4, "discovery": 4}
    # Distinct, not one script copied 60 times: every agent has its own interest set and persona tuple.
    assert len({tuple(sorted(a["interests"])) for a in ROSTER}) == 60
    assert all(a["persona"]["focus"] for a in ROSTER)
    assert {s[0] for s in SUBPALS} >= {"football", "epl", "naijabusiness", "africanbusiness", "afrobeats", "travel", "technology", "agriculture", "history",
                                       "entertainment", "money", "everydayafrica", "education"}


def test_seed_is_idempotent_labeled_and_never_counted_verified(seeded):
    pb, t = seeded["pb"], seeded["palavva"]
    again = seed_city(pb, t)
    assert again["created"] == 0 and again["existing"] == 60 and again["memberships_added"] == 0
    agents = pb.list_all("agents", f"tenant_id={q(t['id'])} && is_seed=true")
    assert len([a for a in agents if a["seed_key"].startswith("seed:")]) == 60  # the original v1.4 roster is preserved
    assert len(agents) in (60, 1000)  # 1,000 when the v1.5 registry is seeded (SEED_CITY_V15, default on)
    assert all(a["kind"] == "palavva_ai" and a["verification_level"] == "platform_operated" and a["owner_type"] == "platform" for a in agents)
    assert all("not a person" in a["bio"].lower() for a in agents)
    assert pb.list("agents", f"tenant_id={q(t['id'])} && (verification_level='owner_control' || verification_level='org_verified') && is_seed=true") == []
    ng = pb.first("communities", f"tenant_id={q(t['id'])} && slug='naijabusiness'")
    assert ng["edition_focus"] == ["NG"] and ng["kind"] == "subpal"
    # Membership counts are recomputed from rows, not typed in.
    rows = pb.list_all("agent_memberships", f"tenant_id={q(t['id'])} && target_id={q(ng['id'])}")
    assert ng["member_agent_count"] == len(rows)


# ------------------------------------------------------------------ policy

def test_agent_text_policy():
    good = ("The practical question this raises is who keeps the system working once the launch money runs out, and whether the smallest users can "
            "afford to wait for repairs. What would make that follow-through possible?")
    assert check_agent_text(good, "", "hosted", 80)["decision"] == "allow"
    assert check_agent_text("You idiot, " + good, "", "external")["decision"] == "reject"
    assert check_agent_text(good + " Call me on +234 803 123 4567.", "", "external")["decision"] == "reject"
    assert check_agent_text(good + " Lots of nsfw content here.", "", "external")["decision"] == "reject"
    held = check_agent_text("Which candidate will win the election, and what should voters expect from the ballot this year in practice?", "", "external")
    assert held["decision"] == "hold"
    # Hosted agents must ground names; external agents are labeled unverified instead.
    named = "Minister Okonkwo said the programme failed, which raises a practical question about who maintains it after launch and who pays for repairs."
    assert check_agent_text(named, "the programme", "hosted", 80)["decision"] == "reject"
    assert check_agent_text(named, "", "external")["decision"] == "allow"


# ------------------------------------------------------------------ deterministic selection

def test_pool_rotation_covers_everyone_and_relevance_is_deterministic(seeded):
    pb, t = seeded["pb"], seeded["palavva"]
    agents = pb.list_all("agents", f"tenant_id={q(t['id'])} && is_seed=true")
    seen = set()
    for w in range(4):
        pool = engine.pool_for(agents, w, 15)
        assert len(pool) == 15
        seen |= {a["id"] for a in pool}
    assert len(seen) == 60
    fb = next(a for a in agents if a["handle"] == "TacticsDesk")
    farm = next(a for a in agents if a["handle"] == "HarvestLogic")
    text = "Coaches and midfield pressing tactics in league football"
    assert engine.relevance(fb, text, ["sports"], "", set(), {"sports"})[0] >= 2.5
    assert engine.relevance(farm, text, ["sports"], "", set(), {"agriculture"})[0] < 2.5


def test_tick_selects_relevant_agents_abstains_otherwise_and_respects_kill_switch(city):
    pb, t, s, queue, calls = city
    p = football_topic(pb, t, f"city-pressing-{int(time.time())}")
    # CITY_ENABLED is false: the scheduler would not run, but an operator smoke tick may.
    out = engine.tick(pb, queue, s, {"tenant_id": t["id"], "payload": {"window": 0, "reason": "scheduler"}})
    assert out["outcome"] == "blocked"
    outs = run(queue, pb, s, FixtureProvider("city_abstain"), ["city_tick"]) or []
    engine.enqueue_tick(queue, t["id"], manual=True, reason="operator test")
    ticked = dict(run(queue, pb, s, FixtureProvider(), ["city_tick"]))["city_tick"]
    assert ticked["outcome"] == "ticked" and ticked["pool"] == 15
    assert len(ticked["acts"]) <= int(engine.cfg()["max_acts_per_tick"])
    # The decision summary is durable and explains every agent's outcome (including no-model abstentions).
    a = pb.list("audit_events", f"tenant_id={q(t['id'])} && action='city.tick'", "-created", 1)[0]
    assert len(a["metadata_safe"]["summary"]) >= 1
    # Kill switch: CITY_PAUSED stops even an operator tick and every queued act before any model call.
    sw = pb.create("tenant_settings", {"tenant_id": t["id"], "key": "CITY_PAUSED", "value": True})
    engine.enqueue_tick(queue, t["id"], manual=True, reason="operator test 2")
    assert dict(run(queue, pb, s, FixtureProvider(), ["city_tick"]))["city_tick"]["outcome"] == "blocked"
    for agent in pb.list("agents", f"tenant_id={q(t['id'])} && handle='TacticsDesk'"):
        queue.enqueue(t["id"], "city_act", {"agent_id": agent["id"], "trigger": "rss_topic", "target_kind": "piece", "target_id": p["id"], "piece_id": p["id"]}, f"city:{agent['id']}:piece:{p['id']}:k")
    before = len(pb.list_all("ai_runs", f"tenant_id={q(t['id'])} && task_type='agent_city'"))
    outs = run(queue, pb, s, FixtureProvider(), ["city_act"])
    assert all(o["outcome"] == "blocked" for _, o in outs)
    assert len(pb.list_all("ai_runs", f"tenant_id={q(t['id'])} && task_type='agent_city'")) == before
    pb.delete("tenant_settings", sw["id"])


# ------------------------------------------------------------------ acting

def _act_job(queue, t, agent, piece, key_suffix="", **extra):
    payload = {"agent_id": agent["id"], "trigger": "rss_topic", "target_kind": "piece", "target_id": piece["id"], "piece_id": piece["id"], "score": 4.0,
               "why": ["interest match: tactics"], "reason": "operator test", **extra}
    queue.enqueue(t["id"], "city_act", payload, f"city:{agent['id']}:piece:{piece['id']}{key_suffix}")


def test_act_replies_votes_records_usage_and_never_repeats(city):
    pb, t, s, queue, calls = city
    p = football_topic(pb, t, f"city-act-{int(time.time() * 1000)}")
    agent = pb.first("agents", f"tenant_id={q(t['id'])} && handle='PitchReader'")
    _act_job(queue, t, agent, p)
    outs = run(queue, pb, s, FixtureProvider(), ["city_act"])
    assert outs[0][1]["outcome"] == "reply" and outs[0][1]["vote"] == "recorded"
    assert [c[0] for c in calls] == ["/api/v1/agent/replies", "/api/v1/agent/votes"]
    assert calls[0][1]["piece_id"] == p["id"] and calls[1][1]["direction"] == 1
    row = pb.first("agent_actions", f"tenant_id={q(t['id'])} && agent_id={q(agent['id'])} && target_id={q(p['id'])}")
    assert row["decision"] == "reply" and row["model_run_id"] and row["tokens_out"] > 0
    assert pb.first("wallet_ledger", f"tenant_id={q(t['id'])} && idempotency_key={q('usage:' + row['job_key'])}")["simulated"] is True
    mem = pb.get("agents", agent["id"])["memory"]
    assert p["id"] in mem["visited"] and mem["fingerprints"]
    # Same agent + same target is never evaluated twice (idempotency key), and a replay does not call the model again.
    _act_job(queue, t, agent, p)
    assert run(queue, pb, s, FixtureProvider(), ["city_act"]) == []
    runs = len(pb.list_all("ai_runs", f"tenant_id={q(t['id'])} && job_id={q(row['job_key'])}"))
    assert runs == 1


def test_crash_after_model_call_reuses_output_without_second_charge(city, monkeypatch):
    pb, t, s, queue, calls = city
    p = football_topic(pb, t, f"city-crash-{int(time.time() * 1000)}")
    agent = pb.first("agents", f"tenant_id={q(t['id'])} && handle='TacticsDesk'")
    boom = {"n": 0}
    real = engine.web_call

    def flaky(settings, agent_id, path, body, origin="city"):
        if boom["n"] == 0:
            boom["n"] += 1
            raise RuntimeError("web restarted mid-commit")
        return real(settings, agent_id, path, body, origin)
    monkeypatch.setattr(engine, "web_call", flaky)
    _act_job(queue, t, agent, p)
    job = queue.claim("w", ["city_act"])
    with pytest.raises(RuntimeError):
        engine.act(pb, queue, s, FixtureProvider(), job)
    queue.fail(job["job_id"], "w", "RuntimeError")
    row = pb.first("agent_actions", f"tenant_id={q(t['id'])} && agent_id={q(agent['id'])} && target_id={q(p['id'])}")
    assert row["reason"] == "in progress" and row["rules"]["pending_output"]["decision"] == "reply"
    job = queue.claim("w", ["city_act"]) or (time.sleep(0) or None)
    if job is None:  # backoff: force immediate retry for the test
        queue.requeue_dead(row["job_key"])
    with queue._conn() as c:
        c.execute("UPDATE jobs SET next_at=0, state='queued' WHERE idempotency_key=?", (row["job_key"],))
    run(queue, pb, s, FixtureProvider(), ["city_act"])
    assert len(pb.list_all("ai_runs", f"tenant_id={q(t['id'])} && job_id={q(row['job_key'])}")) == 1  # model called once in total
    assert len(pb.list_all("wallet_ledger", f"tenant_id={q(t['id'])} && idempotency_key={q('usage:' + row['job_key'])}")) == 1
    assert pb.get("agent_actions", row["id"])["decision"] == "reply"


def test_daily_caps_hold_across_restart_and_stop_before_model(city, monkeypatch):
    pb, t, s, queue, calls = city
    monkeypatch.setenv("CITY_DAILY_MODEL_CALLS", "1")
    a1 = pb.first("agents", f"tenant_id={q(t['id'])} && handle='EPLRoundtable'")
    a2 = pb.first("agents", f"tenant_id={q(t['id'])} && handle='LaLigaLens'")
    p1 = football_topic(pb, t, f"city-cap1-{int(time.time() * 1000)}")
    p2 = football_topic(pb, t, f"city-cap2-{int(time.time() * 1000)}", "Should clubs rotate squads more in congested football fixture periods?")
    _act_job(queue, t, a1, p1)
    run(queue, pb, s, FixtureProvider(), ["city_act"])
    # A fresh Queue object (worker restart) still sees the cap: usage is counted from durable rows.
    queue2 = Queue(queue.path)
    _act_job(queue2, t, a2, p2)
    job = queue2.claim("w", ["city_act"])
    from palavva_editorial.pipeline import Deferred
    with pytest.raises(Deferred, match="CITY_BUDGET"):  # deferred, not thrown away; no model call made
        engine.act(pb, queue2, s, FixtureProvider(), job)
    row = pb.first("agent_actions", f"tenant_id={q(t['id'])} && agent_id={q(a2['id'])}")
    assert row["reason"] == "in progress" and not row["model_run_id"]
    # A tick while the shared budget is exhausted queues no model work at all.
    engine.enqueue_tick(queue2, t["id"], manual=True, reason="operator cap test")
    ticked = dict(run(queue2, pb, s, FixtureProvider(), ["city_tick"]))["city_tick"]
    assert ticked["acts"] == []


def test_paused_agent_never_acts_and_unsafe_model_text_is_rejected(city):
    pb, t, s, queue, calls = city
    p = football_topic(pb, t, f"city-pause-{int(time.time() * 1000)}")
    a = pb.first("agents", f"tenant_id={q(t['id'])} && handle='GrassrootsSport'")
    pb.update("agents", a["id"], {"status": "paused"})
    _act_job(queue, t, a, p)
    assert run(queue, pb, s, FixtureProvider(), ["city_act"])[0][1]["outcome"] == "agent_not_active"
    pb.update("agents", a["id"], {"status": "active"})
    b = pb.first("agents", f"tenant_id={q(t['id'])} && handle='WomenInFootball'")
    _act_job(queue, t, b, p)
    outs = run(queue, pb, s, FixtureProvider("city_abuse"), ["city_act"])
    assert outs[0][1]["outcome"] == "rejected"
    assert not [c for c in calls if c[0] == "/api/v1/agent/replies" and c[1]["_agent"] == b["id"]]


def test_reciprocal_upvotes_are_suppressed(city):
    pb, t, s, queue, calls = city
    a = pb.first("agents", f"tenant_id={q(t['id'])} && handle='MatchNumbers'")
    b = pb.first("agents", f"tenant_id={q(t['id'])} && handle='WestAfricaFootball'")
    for i in range(2):
        pb.create("agent_votes", {"tenant_id": t["id"], "agent_id": b["id"], "target_kind": "piece", "target_id": f"recip{i}{int(time.time())}", "direction": 1,
                                  "target_author_agent_id": a["id"], "owner_key": "platform"})
    assert engine._reciprocal(pb, t["id"], a["id"], b["id"]) is True
    assert engine._reciprocal(pb, t["id"], b["id"], a["id"]) is False


# ------------------------------------------------------------------ owner tasks and database guards

def test_owner_task_runs_for_owner_and_isolates_others(city):
    pb, t, s, queue, calls = city
    reader = pb.first("users", "email='reader@palavva.local'")
    sp = pb.first("communities", f"tenant_id={q(t['id'])} && slug='epl'")
    ag = pb.create("agents", {"tenant_id": t["id"], "handle": f"OwnerBot{int(time.time())}", "handle_key": f"ownerbot{int(time.time())}", "kind": "personal", "hosting": "palavva",
                              "owner_type": "user", "owner_user_id": reader["id"], "status": "active", "verification_level": "owner_control",
                              "permissions": {"post": True, "reply": True}, "daily_action_cap": 3, "daily_ai_call_cap": 5})
    task = pb.create("agent_tasks", {"tenant_id": t["id"], "agent_id": ag["id"], "owner_user_id": reader["id"], "mode": "question", "instruction": "Ask the EPL community a fair question about squad rotation.",
                                     "subpal_id": sp["id"], "status": "queued"})
    forged = pb.create("agent_tasks", {"tenant_id": t["id"], "agent_id": ag["id"], "owner_user_id": "someoneelse000", "mode": "text", "instruction": "Post something for me please.",
                                       "subpal_id": sp["id"], "status": "queued"})
    engine.poll_owner_tasks(pb, queue, t["id"])
    run(queue, pb, s, FixtureProvider(), ["owner_task"])
    assert pb.get("agent_tasks", task["id"])["status"] == "done"
    assert pb.get("agent_tasks", forged["id"])["status"] == "rejected"
    assert any(c[0] == "/api/v1/agent/posts" and c[1]["_agent"] == ag["id"] for c in calls)
    debit = pb.list("wallet_ledger", f"tenant_id={q(t['id'])} && wallet_owner={q(reader['id'])} && entry_type='usage_debit'")
    assert debit, "owner tasks draw on the owner's simulated allowance, not the platform's"


def test_database_refuses_human_public_writes_and_bad_agent_votes(seeded):
    pb, t = seeded["pb"], seeded["palavva"]
    piece = pb.list("editorial_pieces", f"tenant_id={q(t['id'])} && review_status='published'", per_page=1)[0]
    disc = pb.first("discussions", f"piece_id={q(piece['id'])}")
    reader = pb.first("users", "email='reader@palavva.local'")
    with pytest.raises(PBError, match="(?i)observer"):
        pb.create("comments", {"tenant_id": t["id"], "discussion_id": disc["id"], "piece_id": piece["id"], "author_id": reader["id"], "author_kind": "human",
                               "body_text": "a human reply", "approval_state": "approved", "moderation_status": "visible"})
    with pytest.raises(PBError, match="(?i)observer"):
        pb.create("votes", {"tenant_id": t["id"], "user_id": reader["id"], "target_kind": "piece", "target_id": piece["id"], "direction": 1})
    a = pb.first("agents", f"tenant_id={q(t['id'])} && handle='CivicContext'")
    with pytest.raises(PBError):
        pb.create("agent_votes", {"tenant_id": t["id"], "agent_id": a["id"], "target_kind": "piece", "target_id": piece["id"], "direction": 5})
    pb.update("agents", a["id"], {"status": "paused"})
    try:
        with pytest.raises(PBError, match="(?i)active agent"):
            pb.create("comments", {"tenant_id": t["id"], "discussion_id": disc["id"], "piece_id": piece["id"], "author_kind": "agent", "agent_id": a["id"],
                                   "body_text": "paused agents cannot reply", "approval_state": "approved", "moderation_status": "visible"})
    finally:
        pb.update("agents", a["id"], {"status": "active"})


def test_db_gate_honours_json_switches(seeded):
    """Kill switches stored as JSON in tenant_settings must be read correctly by the PocketBase hooks."""
    pb, t = seeded["pb"], seeded["palavva"]
    editor = pb.first("users", "email='editor@palavva.local'")
    p = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": f"gate-switch-{int(time.time() * 1000)}", "headline": "Switch probe", "review_status": "needs_review",
                                       "risk_tier": "low", "kind": "discussion", "revision": 1})
    pb.create("editorial_reviews", {"tenant_id": t["id"], "piece_id": p["id"], "decision": "approve", "reviewer_id": editor["id"], "reason": "probe"})
    row = pb.first("tenant_settings", f"tenant_id={q(t['id'])} && key='PUBLISHING_PAUSED'")
    sw = pb.update("tenant_settings", row["id"], {"value": True}) if row else pb.create("tenant_settings", {"tenant_id": t["id"], "key": "PUBLISHING_PAUSED", "value": True})
    try:
        with pytest.raises(PBError, match="(?i)paused"):
            pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": editor["id"]})
    finally:
        pb.update("tenant_settings", sw["id"], {"value": False})
    pb.update("editorial_pieces", p["id"], {"review_status": "published", "reviewer_id": editor["id"]})


def test_v15_registry_is_idempotent_distinct_and_pan_african(seeded):
    """W17: 1,000 persistent identities; 54 countries; unique handles; proposed 500/500 persona voices; cohorts."""
    from palavva_editorial.city.seed import seed_city_v15
    pb, t = seeded["pb"], seeded["palavva"]
    seed_city_v15(pb, t)
    again = seed_city_v15(pb, t)
    assert again["created"] == 0
    agents = pb.list_all("agents", f"tenant_id={q(t['id'])} && is_seed=true")
    assert len(agents) == 1000 and len({a["handle_key"] for a in agents}) == 1000
    assert sum(a["gender_persona"] == "female" for a in agents) == 500 and sum(a["gender_persona"] == "male" for a in agents) == 500
    from collections import Counter
    per = Counter(a["edition"] for a in agents if a["seed_key"].startswith("seed15:"))
    assert len(per) == 54 and min(per.values()) >= 6
    assert all(a["verification_level"] == "platform_operated" and a["kind"] == "palavva_ai" for a in agents)
    # No two identical personas: interests, voice, habit, source standard and secondary subjects together.
    sig = {(tuple(a["interests"]), a["voice"], a["persona"]["style"], a["persona"]["source_standard"], tuple(a["secondary_subjects"]))
           for a in agents if a["seed_key"].startswith("seed15:")}
    assert len(sig) == 940
    # Cohorts 1-10 exist so activation can be measured step by step (other tests may change statuses, so status is not asserted here).
    assert {a["cohort"] for a in agents if a["seed_key"].startswith("seed15:")} == set(range(1, 11))


def test_v18_voice_rollout_reply_uses_voice_shape_and_memory_blocks(city, monkeypatch):
    """ISSUE-02: an agent inside the voice rollout gets its own voice + length shape + MEMORY; the reply is short when the
    shape asks for it, is recorded with its shape/word count, and the agent's stance is stored as a Letta-style block."""
    from palavva_editorial.city import engine as eng, voice
    pb, t, s, queue, calls = city
    monkeypatch.setattr(eng, "_v18", lambda agent: True)
    monkeypatch.setattr(voice, "reply_shape", lambda *a, **k: {"kind": "quick", **voice.REPLY_SHAPES["quick"]})
    seen = {}
    real = FixtureProvider.generate
    def spy(self, req):
        seen["system"], seen["user"] = req.system_instructions, req.user_prompt
        return real(self, req)
    monkeypatch.setattr(FixtureProvider, "generate", spy)
    p = football_topic(pb, t, f"city-v18-{int(time.time() * 1000)}")
    agent = pb.first("agents", f"tenant_id={q(t['id'])} && handle='PitchReader'")
    _act_job(queue, t, agent, p)
    outs = run(queue, pb, s, FixtureProvider(), ["city_act"])
    assert outs[0][1]["outcome"] == "reply"
    assert "LENGTH: write a quick reaction" in seen["system"] and "VOICE:" in seen["system"] and "20-80 words" not in seen["system"]
    assert "<memory_blocks>" in seen["user"]
    assert len(calls[0][1]["body"].split()) <= 12
    row = pb.first("agent_actions", f"tenant_id={q(t['id'])} && agent_id={q(agent['id'])} && target_id={q(p['id'])}")
    assert row["rules"]["shape"] == "quick" and row["rules"]["voice"] == voice.VERSION and row["rules"]["words"] <= 12
    blocks = pb.get("agents", agent["id"])["memory"]["blocks"]
    assert blocks["stances"][-1]["thread"] == p["id"] and blocks["stances"][-1]["stance"] == "question"


def test_v18_agents_outside_rollout_keep_the_v17_brief(city, monkeypatch):
    from palavva_editorial.city import engine as eng
    pb, t, s, queue, calls = city
    monkeypatch.setattr(eng, "_v18", lambda agent: False)
    seen = {}
    real = FixtureProvider.generate
    def spy(self, req):
        seen["system"], seen["user"] = req.system_instructions, req.user_prompt
        return real(self, req)
    monkeypatch.setattr(FixtureProvider, "generate", spy)
    p = football_topic(pb, t, f"city-v17-{int(time.time() * 1000)}")
    agent = pb.first("agents", f"tenant_id={q(t['id'])} && handle='PitchReader'")
    _act_job(queue, t, agent, p)
    assert run(queue, pb, s, FixtureProvider(), ["city_act"])[0][1]["outcome"] == "reply"
    assert "Reply text: 20-80 words" in seen["system"] and "VOICE:" not in seen["system"] and "MEMORY" not in seen["user"]
    row = pb.first("agent_actions", f"tenant_id={q(t['id'])} && agent_id={q(agent['id'])} && target_id={q(p['id'])}")
    assert row["rules"]["voice"] == "v1.7"
