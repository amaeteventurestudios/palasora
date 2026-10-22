"""Unit tests: durable queue, search and the public text policy. (The news ingest, SSRF fetch, feed parsing, clustering
and draft validation tests left with the news code in Palasora Phase 5.)"""
from __future__ import annotations

import time

from palavva_editorial.jobs import Queue
from palavva_editorial import search as fts


def test_queue_idempotency_retry_dead_letter_and_lease(tmp_path):
    q = Queue(tmp_path / "jobs.db", lease_seconds=1)
    jid, created = q.enqueue("t1", "draft_cluster", {"cluster_id": "c"}, "key-1", max_attempts=2)
    assert created and q.enqueue("t1", "draft_cluster", {}, "key-1") == (jid, False)
    j = q.claim("w1")
    assert j and j["attempts"] == 1
    assert q.claim("w2") is None
    time.sleep(1.1)  # lease expiry: crashed worker's job is reclaimed
    j2 = q.claim("w2")
    assert j2 and j2["job_id"] == jid and j2["attempts"] == 2
    assert q.complete(jid, "w1") is False  # stale owner cannot complete
    assert q.fail(jid, "w2", "Boom", "x") == "dead"
    assert q.stats()["dead_letters"][0]["job_id"] == jid
    assert q.requeue_dead(jid)


def test_queue_defer_does_not_burn_attempts_and_budget(tmp_path):
    q = Queue(tmp_path / "jobs.db")
    jid, _ = q.enqueue("t1", "draft_cluster", {}, "k2")
    j = q.claim("w")
    q.defer(jid, "w", 0, "MODEL_UNAVAILABLE")
    j = q.claim("w")
    assert j["attempts"] == 1
    assert q.take_budget("t1", 2) and q.take_budget("t1", 2) and not q.take_budget("t1", 2)
    assert q.take_budget("t2", 2)  # per-tenant budgets


def test_fts_is_tenant_scoped_and_injection_safe(tmp_path):
    db = tmp_path / "s.db"
    fts.reindex(db, [{"id": "p1", "tenant_id": "ta", "headline": "Cold room for tomatoes in Nigéria", "lede": "", "country_codes": ["NG"], "topic_slugs": ["agriculture"]},
                     {"id": "p2", "tenant_id": "tb", "headline": "Cold room secret for tenant B", "lede": "", "country_codes": ["NG"], "topic_slugs": ["agriculture"]}])
    assert fts.search(db, "ta", "cold room") == ["p1"]
    assert fts.search(db, "ta", "nigeria") == ["p1"]  # accent folding
    assert fts.search(db, "ta", "tomato") == ["p1"]   # prefix match handles simple variants
    assert "p2" not in fts.search(db, "ta", 'cold" OR tenant_id:tb OR "x')  # syntax neutralized, no cross-tenant hit
    assert fts.search(db, "tb", "tomatoes") == []
    assert fts.search(db, "ta", "") == []
    assert fts.search(db, "ta", "cold", country="KE") == []


def test_policy_numbers_ignore_citations_and_match_date_components():
    from palavva_editorial.editorial.policy import check_post
    ev = "The event took place on 2026-10-09. R120 billion investment."
    ok = check_post("The directive is clear (claim_1, S1). It was announced on October 9, 2026 with a R120 billion plan; the real question is who maintains the projects over time and how communities are consulted.", ev)
    assert ok.rules["unsupported_numbers"] == "PASS", ok.reasons
    bad = check_post("The plan will create 45000 jobs within a few years, which is a bold figure that nobody can check yet and that deserves careful scrutiny by readers.", ev)
    assert bad.rules["unsupported_numbers"] == "FAIL"


def test_policy_blocks_degradation_but_allows_institutional_critique():
    from palavva_editorial.editorial.policy import check_post
    civil = check_post("The ministry's plan has a weak point: it assumes reliable power that many rural schools lack, so the department should publish a maintenance budget before promising new labs to learners.", "")
    assert civil.ok, civil.reasons
    for txt in ["All Hausas are lazy and that is why this programme will fail across the whole region, frankly.",
                "Muslims are more dangerous than others here, so the officials should simply exclude them from this whole programme.",
                "Anyone who supports this is an idiot and should stop talking about matters they clearly do not understand at all."]:
        assert not check_post(txt, "").ok, txt


def test_T034_unreachable_endpoint_is_unavailable_not_invented():
    from palavva_editorial.providers.base import GenerateRequest
    from palavva_editorial.providers.ollama import OllamaProvider
    schema = {"type": "object", "properties": {"decision": {"type": "string"}}, "required": ["decision"]}
    t0 = time.time()
    r = OllamaProvider("http://127.0.0.1:9", "qwen3.5:4b", 1, 5).generate(GenerateRequest("t", "", "x", "probe-v1", "s", "u", schema, timeout_ms=5000))
    assert r.status == "unavailable" and r.structured_output is None and r.error_code.startswith("UNREACHABLE")
    assert time.time() - t0 < 10
