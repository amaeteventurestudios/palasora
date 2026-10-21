"""Palasora Phase 1 (architecture doc 06, sections 5 and 17): people post, reply and vote again; news is retired.

Database side (PocketBase hooks and the publish gate's human path), the shared human text rules, the fast engine and city
engine treating human activity as conversation opportunities, and the news stop: no ingestion scheduling, no discovery,
no news jobs, Control Room news/discovery off."""
from __future__ import annotations

import time

import pytest

from palavva_editorial import config, retired, worker
from palavva_editorial.city import control, engine
from palavva_editorial.city.textpolicy import check_human_text
from palavva_editorial.jobs import Queue
from palavva_editorial.providers.fixture import FixtureProvider
from palavva_editorial.pb import PBError, q

from test_city import _act_job, run


# ------------------------------------------------------------------ helpers

def _user(pb, t, name: str, status: str = "active") -> dict:
    stamp = f"{name}{int(time.time() * 1000)}"
    return pb.create("users", {"tenant_id": t["id"], "email": f"{stamp}@phase1.test", "password": "phase1-password-123", "passwordConfirm": "phase1-password-123",
                               "handle": stamp.lower()[:30], "display_name": name, "account_status": status, "verified": True})


def _human_post(pb, t, user: dict, title: str = "Is the Lagos ferry worth it for a daily commute?") -> dict:
    sp = pb.first("communities", f"tenant_id={q(t['id'])} && slug='epl'")
    p = pb.create("editorial_pieces", {"tenant_id": t["id"], "slug": f"human-{int(time.time() * 1000)}", "kind": "human_post", "headline": title,
                                       "lede": "Asking people who ride it every day.", "body_blocks_json": {"post_body": "Asking people who ride it every day."},
                                       "author_type": "human", "author_user_id": user["id"], "publish_path": "human", "risk_tier": "low", "review_status": "needs_review",
                                       "community_id": sp["id"], "post_label": "community_discussion", "topic_slugs": ["sports"], "is_demo": False, "revision": 1,
                                       "thread_state": "candidate"})
    pb.create("discussions", {"tenant_id": t["id"], "piece_id": p["id"], "community_id": sp["id"], "status": "open"})
    return p


def _allow(pb, t, piece: dict) -> dict:
    return pb.create("moderation_decisions", {"tenant_id": t["id"], "scope": "human_post", "target_id": piece["id"], "piece_id": piece["id"], "decision": "allow",
                                              "tier": "low", "ruleset_version": "human-rules-v1", "actor": "system:human-validator", "overridden": False})


def _publish(pb, piece: dict) -> dict:
    ts = engine.now_pb()
    return pb.update("editorial_pieces", piece["id"], {"review_status": "published", "reviewer_id": "system:human-validator", "published_at": ts,
                                                       "first_published_at": ts, "last_activity_at": ts, "thread_state": "topic_started"})


def _reply(pb, t, piece: dict, user: dict, body: str = "I ride it twice a week; the queue is the real problem.") -> dict:
    disc = pb.first("discussions", f"piece_id={q(piece['id'])}")
    return pb.create("comments", {"tenant_id": t["id"], "discussion_id": disc["id"], "piece_id": piece["id"], "author_id": user["id"], "author_kind": "human",
                                  "body_text": body, "approval_state": "approved", "moderation_status": "visible", "depth": 1})


@pytest.fixture()
def switch(seeded):
    pb, t = seeded["pb"], seeded["palavva"]
    made = []

    def set_(key, value):
        made.append(pb.create("tenant_settings", {"tenant_id": t["id"], "key": key, "value": value}))
    yield set_
    for r in made:
        pb.delete("tenant_settings", r["id"])


# ------------------------------------------------------------------ human text rules (shared moderation)

def test_human_text_rules_block_abuse_and_allow_ordinary_posts():
    ok = check_human_text("I take the ferry from Ikorodu twice a week. Is the new timetable better for anyone else? https://example.org/timetable")
    assert ok["decision"] == "allow" and ok["mode"] == "human" and ok["ruleset"] == "human-rules-v1"
    # agent-only honesty rules (external URLs, unsupported names/numbers, invented testimony) do not apply to people
    assert "external_urls" not in ok["rules"] and "invented_testimony" not in ok["rules"]
    assert check_human_text("You idiot, nobody asked for your opinion on the ferry.")["decision"] == "reject"
    assert check_human_text("Great ferry tips! Call me on +234 803 123 4567 for a discount.")["decision"] == "reject"
    held = check_human_text("Which candidate will win the election, and what should voters expect from the ballot this year?")
    assert held["decision"] == "hold"


# ------------------------------------------------------------------ database hooks: replies and votes

def test_db_accepts_human_reply_and_vote_and_refuses_suspended_paused_and_own_votes(seeded, switch):
    pb, t = seeded["pb"], seeded["palavva"]
    alice, bola = _user(pb, t, "Alice"), _user(pb, t, "Bola")
    post = _human_post(pb, t, alice)
    _allow(pb, t, post)
    post = _publish(pb, post)
    c = _reply(pb, t, post, bola)  # observer rule gone: an active person replies
    assert c["author_kind"] == "human"
    v = pb.create("votes", {"tenant_id": t["id"], "user_id": bola["id"], "target_kind": "piece", "target_id": post["id"], "direction": 1})
    pb.update("votes", v["id"], {"direction": -1})  # changing a vote is allowed
    with pytest.raises(PBError, match="(?i)direction"):
        pb.update("votes", v["id"], {"direction": 0})  # removal is a delete, not direction 0
    with pytest.raises(PBError, match="(?i)own post"):
        pb.create("votes", {"tenant_id": t["id"], "user_id": alice["id"], "target_kind": "piece", "target_id": post["id"], "direction": 1})
    with pytest.raises(PBError, match="(?i)own post"):
        pb.create("votes", {"tenant_id": t["id"], "user_id": bola["id"], "target_kind": "comment", "target_id": c["id"], "direction": 1})
    pb.create("votes", {"tenant_id": t["id"], "user_id": alice["id"], "target_kind": "comment", "target_id": c["id"], "direction": 1})
    # suspended (or banned) people cannot reply or vote, even straight against the database
    pb.update("users", bola["id"], {"account_status": "suspended"})
    with pytest.raises(PBError, match="(?i)suspended"):
        _reply(pb, t, post, bola, "Trying again while suspended.")
    with pytest.raises(PBError, match="(?i)suspended"):
        pb.create("votes", {"tenant_id": t["id"], "user_id": bola["id"], "target_kind": "comment", "target_id": c["id"], "direction": 1})
    pb.update("users", bola["id"], {"account_status": "active"})
    # the staff kill switch stops every human write in the database too
    switch("HUMAN_WRITES_PAUSED", True)
    with pytest.raises(PBError, match="(?i)paused"):
        _reply(pb, t, post, bola, "Posting while paused.")
    with pytest.raises(PBError, match="(?i)paused"):
        pb.create("votes", {"tenant_id": t["id"], "user_id": bola["id"], "target_kind": "comment", "target_id": c["id"], "direction": -1})


# ------------------------------------------------------------------ publish gate: the human path

def test_publish_gate_human_path_requires_rules_decision_active_author_and_no_pause(seeded, switch):
    pb, t = seeded["pb"], seeded["palavva"]
    alice = _user(pb, t, "Ada")
    p = _human_post(pb, t, alice)
    with pytest.raises(PBError):  # no moderation decision on record: refused
        _publish(pb, p)
    d = _allow(pb, t, p)
    pub = _publish(pb, p)
    assert pub["review_status"] == "published" and pub["kind"] == "human_post" and pub["author_user_id"] == alice["id"]
    # a rejected decision cannot publish
    p2 = _human_post(pb, t, alice, "A second post that the rules rejected outright")
    pb.create("moderation_decisions", {"tenant_id": t["id"], "scope": "human_post", "target_id": p2["id"], "piece_id": p2["id"], "decision": "reject",
                                       "tier": "low", "ruleset_version": "human-rules-v1", "actor": "system:human-validator", "overridden": False})
    with pytest.raises(PBError):
        _publish(pb, p2)
    # suspended author: refused
    p3 = _human_post(pb, t, alice, "A third post written before a suspension")
    _allow(pb, t, p3)
    pb.update("users", alice["id"], {"account_status": "suspended"})
    with pytest.raises(PBError, match="(?i)suspended"):
        _publish(pb, p3)
    pb.update("users", alice["id"], {"account_status": "active"})
    # the human path cannot publish a non-human piece (no laundering of agent or news items through it)
    p4 = _human_post(pb, t, alice, "A post pretending to be an agent post via the human path")
    pb.update("editorial_pieces", p4["id"], {"kind": "agent_post"})
    _allow(pb, t, p4)
    with pytest.raises(PBError):
        _publish(pb, p4)
    # kill switch
    switch("HUMAN_WRITES_PAUSED", True)
    p5 = _human_post(pb, t, alice, "A post written while staff paused human writes")
    _allow(pb, t, p5)
    with pytest.raises(PBError, match="(?i)paused"):
        _publish(pb, p5)
    assert d["decision"] == "allow"


# ------------------------------------------------------------------ agents still take part, and answer people

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
    for r in pb.list_all("agent_actions", f"tenant_id={q(t['id'])}"):
        pb.delete("agent_actions", r["id"])
    engine._USAGE.clear()
    for a in pb.list_all("agents", f"tenant_id={q(t['id'])} && is_seed=true"):
        pb.update("agents", a["id"], {"status": "active", "cooldown_until": "", "memory": {"visited": [], "angles": [], "fingerprints": []}})
    return pb, t, s, queue, calls


def test_human_posts_and_questions_are_agent_opportunities_and_agents_reply_to_them(city):
    pb, t, s, queue, calls = city
    person = _user(pb, t, "Chidi")
    post = _human_post(pb, t, person, "What makes a pressing system work for a newly promoted football club?")
    _allow(pb, t, post)
    post = _publish(pb, post)
    q_reply = _reply(pb, t, post, person, "Does a high line really suit a promoted side with slower centre-backs?")
    cands = engine.candidates(pb, t["id"])
    assert any(c["kind"] == "piece" and c["id"] == post["id"] for c in cands)
    assert any(c["kind"] == "comment" and c["id"] == q_reply["id"] and c["trigger"] == "question" for c in cands)
    # an agent answers the person's post through the normal agent write path (labelled agent reply)
    agent = pb.first("agents", f"tenant_id={q(t['id'])} && handle='PitchReader'")
    _act_job(queue, t, agent, post, ":human")
    outs = run(queue, pb, s, FixtureProvider(), ["city_act"])
    assert outs[0][1]["outcome"] == "reply"
    assert calls[0][0] == "/api/v1/agent/replies" and calls[0][1]["_agent"] == agent["id"]
    assert (calls[0][1].get("piece_id") or calls[0][1].get("target_id")) == post["id"]


def test_fast_engine_takes_in_human_events_and_skips_news(city):
    from palavva_editorial import conversation
    from palavva_editorial.city import fast
    pb, t, s, queue, calls = city
    fe = fast.FastEngine(pb, s, queue, t["id"])
    person = _user(pb, t, "Dami")
    post = _publish(pb, (lambda p: (_allow(pb, t, p), p)[1])(_human_post(pb, t, person, "Which midfield shape suits a promoted football club?")))
    conversation.emit(pb, t["id"], "thread_resumed", post["id"])  # ensure a head exists: the first intake only sets the cursor there
    fast.set_setting(pb, t["id"], "FAST_ENGINE_CURSOR", 0)
    assert fe.intake() == 0
    c = _reply(pb, t, post, person, "Would a back three help @TacticsDesk?")
    conversation.emit(pb, t["id"], "topic_published", post["id"], author_kind="human", payload={"headline": post["headline"]})
    conversation.emit(pb, t["id"], "reply_published", post["id"], post_id=c["id"], author_kind="human", payload={"post": {"body_text": c["body_text"]}})
    assert fe.intake() == 2
    evs = pb.list("agent_events", f"tenant_id={q(t['id'])} && piece_id={q(post['id'])}", "thread_seq")
    assert [e["event_type"] for e in evs] == ["new_post", "mention"]
    # a news piece (editorial discussion) is never routed while news is retired
    news = pb.list("editorial_pieces", f"tenant_id={q(t['id'])} && review_status='published' && is_demo=false && kind='discussion'", per_page=1)
    if not news:
        from test_city import football_topic
        news = [football_topic(pb, t, f"phase1-news-{int(time.time() * 1000)}")]
    ev = pb.create("agent_events", {"tenant_id": t["id"], "event_key": f"phase1:{news[0]['id']}:{time.time()}", "event_type": "news_item", "source_kind": "thread_event",
                                    "source_id": "0", "piece_id": news[0]["id"], "status": "queued", "payload": {}})
    out = fe.route(ev)
    assert out == {"skipped": "news retired"}
    assert pb.get("agent_events", ev["id"])["skip_reason"].startswith("news retired")
    # the news schedulers are off
    assert fe.news_tick() == 0
    assert fe.is_breaking(news[0]) == 0


# ------------------------------------------------------------------ news stop: ingestion, discovery, jobs, Control Room

def test_ingestion_does_not_schedule_while_news_is_retired(seeded, tmp_path, monkeypatch):
    pb, t = seeded["pb"], seeded["palavva"]
    assert retired.news_retired() is True  # default
    src = pb.create("sources", {"tenant_id": t["id"], "publisher_name": "Phase 1 probe", "endpoint_url": "https://example.test/feed.xml", "homepage_url": "https://example.test",
                                "endpoint_type": "rss", "enabled": True, "rights_status": "approved", "fetch_interval_minutes": 60, "next_fetch_at": ""})
    try:
        queue = Queue(tmp_path / "jobs.db")
        assert worker.schedule_due_sources(pb, queue) == 0
        assert not any(k.startswith("fetch_source") for k in queue.stats()["by_type"])
        # the gate is the flag: the legacy scheduler still works when news is explicitly un-retired (rollback path)
        monkeypatch.setenv("NEWS_RETIRED", "false")
        assert worker.schedule_due_sources(pb, queue) >= 1
    finally:
        pb.update("sources", src["id"], {"enabled": False})


def test_queued_news_jobs_complete_as_skipped_without_work(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    queue = Queue(tmp_path / "jobs.db")
    for typ in ("fetch_source", "draft_cluster"):
        queue.enqueue(t["id"], typ, {"source_id": "nosuchsource000", "cluster_id": "nosuchcluster00"}, f"phase1:{typ}")
    provider = FixtureProvider()
    assert worker.process_one(pb, queue, s, provider, "w") and worker.process_one(pb, queue, s, provider, "w")
    st = queue.stats()["by_state"]
    assert st.get("done", 0) >= 2 and not st.get("dead") and not st.get("failed")


def test_discovery_exits_immediately(monkeypatch):
    from palavva_editorial.intel import discover

    def boom(*a, **k):
        raise AssertionError("discovery must not load settings or touch PocketBase while news is retired")
    monkeypatch.setattr(discover, "load", boom)
    monkeypatch.setattr(discover, "PB", boom)
    t0 = time.time()
    assert discover.main() is None
    assert time.time() - t0 < 2


def test_control_room_news_and_discovery_default_off(seeded):
    sc = control.schema()
    assert sc["news_enabled"]["default"] is False and sc["discovery_enabled"]["default"] is False
    tid = seeded["palavva"]["id"]
    control._CACHE[tid] = (time.time(), {"revision": 1, "global": {"news_enabled": True, "discovery_enabled": True, "breaking_enabled": True}, "countries": {}})
    try:  # a stored "on" from before the retirement cannot restart news or discovery
        assert control.get(tid, "news_enabled") is False and control.get(tid, "discovery_enabled") is False and control.get(tid, "breaking_enabled") is False
    finally:
        control._CACHE.pop(tid, None)


def test_search_index_leaves_out_news(seeded, tmp_path):
    from palavva_editorial import search as fts
    pb, t = seeded["pb"], seeded["palavva"]
    s = config.load()
    n = worker.reindex_all(pb, s)
    assert n == len(pb.list_all("editorial_pieces", "review_status='published'" + retired.not_news_filter()))
    news_ids = {p["id"] for p in pb.list_all("editorial_pieces", f"tenant_id={q(t['id'])} && review_status='published' && (kind='discussion' || kind='story' || kind='source_link')")}
    hits = set(fts.search(s.search_db, t["id"], "football")) | set(fts.search(s.search_db, t["id"], "market"))
    assert not (hits & news_ids)
