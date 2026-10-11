"""v1.6 unit tests: OpenRouter spend controls (mock provider, no key, no money), language policy, queue routing."""
from __future__ import annotations

import json
import threading

import httpx
import pytest

from palavva_editorial.jobs import Queue
from palavva_editorial.providers import openrouter as orw
from palavva_editorial.providers.base import GenerateRequest

MODEL = "anthropic/claude-haiku-5.5"
CATALOG = {"data": [{"id": MODEL, "pricing": {"prompt": "0.0000001", "completion": "0.0000005"}, "supported_parameters": ["structured_outputs", "response_format"]},
                    {"id": "openai/gpt-4.1-nano", "pricing": {"prompt": "0.0000001", "completion": "0.0000004"}, "supported_parameters": ["structured_outputs"]},
                    {"id": "openai/gpt-oss-20b:batch", "pricing": {"prompt": "0.00000001", "completion": "0.00000001"}, "supported_parameters": ["structured_outputs"]},
                    {"id": "google/gemini-x", "pricing": {"prompt": "0.00000001", "completion": "0.00000001"}, "supported_parameters": ["structured_outputs"]}]}


class FakePB:
    def __init__(self):
        self.settings = {}
        self.updates = []

    def first(self, coll, flt):
        return None

    def update(self, coll, rid, data):
        self.updates.append((coll, rid, data))


class FakeMeter:
    def __init__(self, budget=None):
        self.pb, self.tid = FakePB(), "t1"
        self._budget = budget
        self.rows = []

    def budget(self, key):
        return self._budget

    def record(self, **kw):
        self.rows.append(kw)


def mock_client(handler=None, key_usage=0.0, calls=None):
    def h(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/models"):
            return httpx.Response(200, json=CATALOG)
        if req.url.path.endswith("/key"):
            return httpx.Response(200, json={"data": {"usage": key_usage, "limit": 10, "limit_remaining": 10 - key_usage}})
        if calls is not None:
            calls.append(json.loads(req.content))
        if handler:
            return handler(req)
        return httpx.Response(200, json={"id": "gen-1", "model": MODEL, "choices": [{"message": {"content": json.dumps({"decision": "reply", "text": "ok"})}}],
                                         "usage": {"prompt_tokens": 800, "completion_tokens": 120, "cost": 0.00014}})
    return httpx.Client(transport=httpx.MockTransport(h))


def req(max_out=300):
    return GenerateRequest(task_id="k", role_id="a", tenant_id="t1", prompt_version="v", system_instructions="s" * 1200, user_prompt="u" * 1500,
                           output_schema={"type": "object", "properties": {"decision": {"type": "string"}, "text": {"type": "string"}}, "required": ["decision"]},
                           max_output_tokens=max_out, timeout_ms=5000)


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("PALAVVA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("OPENROUTER_EXPERIMENT_ENABLED", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-" + "a" * 40)
    monkeypatch.setenv("OPENROUTER_MODEL", MODEL)
    orw._catalog.clear()
    orw._catalog_at = 0.0
    return tmp_path


BUDGET = {"id": "b1", "status": "open", "authorized_by": "founder", "limit_usd": 10}


def test_ledger_cutoff_is_atomic_across_threads(tmp_path):
    led = orw.SpendLedger(tmp_path / "spend.db")
    ok = []

    def go():
        for _ in range(50):
            rid, _ = led.reserve(model="m", agent_id="a", purpose="write", worst=0.01, cutoff=0.5)
            if rid:
                ok.append(rid)
    ts = [threading.Thread(target=go) for _ in range(8)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(ok) == 50  # exactly cutoff / worst, never more, despite 8 concurrent writers
    assert led.committed() == pytest.approx(0.5)
    assert "cutoff" in led.get("killed")
    led.settle(ok[0], status="settled", actual=0.001)
    assert led.committed() == pytest.approx(0.491)
    rid, _ = led.reserve(model="m", agent_id="a", purpose="write", worst=0.0001, cutoff=0.5)
    assert rid is None  # once killed, no further paid calls until an operator resets the experiment


def test_gate_blocks_without_key_budget_or_with_compromised_key(env, monkeypatch):
    w = orw.OpenRouterWriter(FakeMeter(BUDGET), client=mock_client())
    assert w.gate() == ""
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    assert w.gate().startswith("blocked_no_key")
    key = "sk-or-v1-" + "b" * 40
    monkeypatch.setenv("OPENROUTER_API_KEY", key)
    (env / "run").mkdir(exist_ok=True)
    (env / "run" / "compromised-keys.sha256").write_text("# test\n" + orw.fingerprint(key) + "\n")
    assert "denylist" in w.gate()
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-" + "c" * 40)
    assert orw.OpenRouterWriter(FakeMeter(None), client=mock_client()).gate().startswith("blocked_policy: no open")
    monkeypatch.setenv("OPENROUTER_EXPERIMENT_ENABLED", "false")
    assert "not true" in w.gate()


def test_successful_call_settles_provider_cost_and_sends_price_cap(env):
    calls = []
    m = FakeMeter(BUDGET)
    w = orw.OpenRouterWriter(m, client=mock_client(calls=calls))
    r = w.generate(req(), agent_id="ag1")
    assert r.status == "succeeded" and r.structured_output["decision"] == "reply"
    assert r.estimated_cost == pytest.approx(0.00014)
    s = w.ledger.summary()
    assert s["committed_usd"] == pytest.approx(0.00014) and s["reserved"] == 0
    body = calls[0]
    assert body["provider"]["max_price"] == {"prompt": 0.1, "completion": 0.5}
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["response_format"]["json_schema"]["schema"]["additionalProperties"] is False
    assert any(r_["billable"] and r_["status"] == "ok" and r_["agent_id"] == "ag1" for r_ in m.rows)


def test_timeout_is_charged_at_worst_case_and_never_retried(env):
    n = {"c": 0}

    def h(req_):
        n["c"] += 1
        raise httpx.ReadTimeout("slow", request=req_)
    w = orw.OpenRouterWriter(FakeMeter(BUDGET), client=mock_client(handler=h))
    r = w.generate(req(max_out=400), agent_id="a")
    assert r.status == "timeout" and n["c"] == 1
    s = w.ledger.summary()
    assert s["unknown"] == 1 and s["committed_usd"] > 0.0002  # worst case (input estimate + 400 output tokens), not zero


def test_429_retried_once_then_released(env):
    n = {"c": 0}

    def h(req_):
        n["c"] += 1
        return httpx.Response(429, json={"error": {"message": "rate limited"}})
    w = orw.OpenRouterWriter(FakeMeter(BUDGET), client=mock_client(handler=h))
    r = w.generate(req())
    assert r.status == "failed" and n["c"] == 2
    assert w.ledger.summary()["committed_usd"] == 0  # not processed by the provider: costs nothing


def test_cutoff_blocks_before_sending(env, monkeypatch):
    monkeypatch.setenv("OPENROUTER_CUTOFF_USD", "0.0003")
    calls = []
    w = orw.OpenRouterWriter(FakeMeter(BUDGET), client=mock_client(calls=calls))
    assert w.generate(req()).status == "succeeded"
    r = w.generate(req())
    assert r.status == "disabled" and r.error_code == "BUDGET_CUTOFF"
    assert len(calls) == 1


def test_provider_reported_usage_trips_the_kill_switch(env):
    m = FakeMeter(BUDGET)
    w = orw.OpenRouterWriter(m, client=mock_client(key_usage=1.0))
    assert w.gate() == ""  # baseline recorded at $1.00
    w.client = mock_client(key_usage=9.5)  # someone else spent on this key: $8.50 since baseline >= $8 cutoff
    assert "cutoff" in w.validate_auth(force=True)
    assert "blocked_budget" in w.gate()


def test_cheapest_excludes_batch_and_other_vendors(env):
    ids = [r["model"] for r in orw.cheapest(client=mock_client())]
    assert ids == ["openai/gpt-4.1-nano", MODEL]


# ------------------------------------------------------------------ language policy

def test_language_label_is_verified_not_assumed():
    from palavva_editorial.city.textpolicy import check_agent_text as c
    g = "Senegal farmers fertiliser prices season cooperatives state"
    fr = "Les agriculteurs paient plus cher les engrais cette saison. Qui devrait partager ce coût, l'État ou les coopératives ?"
    gloss = "Farmers pay more for fertiliser this season. Who should share this cost, the state or the cooperatives?"
    assert c(fr, g, "hosted", 40, language="fr", gloss=gloss)["decision"] == "allow"
    bad = c(fr, g, "hosted", 40, language="ar", gloss=gloss)
    assert bad["decision"] == "reject" and any(r.startswith("language_label") for r in bad["reasons"])
    assert any(r.startswith("english_gloss") for r in c(fr, g, "hosted", 40, language="fr", gloss="")["reasons"])
    ar = c("يدفع المزارعون المزيد مقابل الأسمدة هذا الموسم. من يجب أن يتحمل هذه التكلفة؟", g, "hosted", 40, language="ar",
           gloss="Farmers pay more for fertiliser this season. Who should bear this cost?")
    assert ar["decision"] == "allow" and ar["dir"] == "rtl" and ar["language"] == "ar"
    ext = c("Os agricultores pagam mais pelos fertilizantes nesta temporada e procuram alternativas.", g, "external", 20)
    assert ext["language"] == "pt"  # an external agent's text is labeled with what it really is


def test_gloss_is_checked_by_english_rules():
    from palavva_editorial.city.textpolicy import check_agent_text as c
    r = c("Les agriculteurs paient plus cher les engrais cette saison, il faut en parler calmement.", "farmers fertiliser", "hosted", 40, language="fr",
          gloss="Farmers pay more for fertiliser this season; all those people are lazy idiots.")
    assert r["decision"] == "reject" and any(x.startswith("gloss:") for x in r["reasons"])


def test_unverifiable_language_is_never_published_by_hosted_agents():
    from palavva_editorial.city.textpolicy import check_agent_text as c
    r = c("Manoma suna biyan karin kudin taki a wannan lokacin, wa ya kamata ya dauki nauyin?", "farmers", "hosted", 40, language="ha", gloss="Farmers pay more for fertiliser.")
    assert r["decision"] == "reject"


def test_language_choice_follows_thread_and_edition():
    from palavva_editorial.city import langs
    sn = {"languages": ["fr", "wo"], "country_affinities": ["SN"]}
    assert langs.for_reply(sn, "fr") == "fr"
    assert langs.for_reply(sn, "wo") == "fr"  # Wolof cannot be verified yet: writes French, labeled French
    assert langs.for_original(sn, "SN") == "fr"
    cm = {"languages": ["en", "fr"], "country_affinities": ["CM"]}
    assert {langs.for_original(cm, "CM", i) for i in range(2)} == {"en", "fr"}
    eg = {"languages": ["ar", "en"]}
    assert langs.for_reply(eg, "ar") == "ar" and langs.for_reply(eg, "en") == "en"
    assert langs.country_langs("AO")[0] == "pt" and len(langs.registry()["countries"]) == 54


def test_queue_exclude_and_turns_first(tmp_path):
    qu = Queue(tmp_path / "jobs.db")
    qu.enqueue("t", "city_act", {"trigger": "rss_topic"}, "a")
    qu.enqueue("t", "city_act", {"trigger": "new_reply"}, "b")
    qu.enqueue("t", "fetch_source", {}, "c")
    assert qu.claim("w", exclude=["city_act"])["type"] == "fetch_source"
    assert qu.claim("w", types=["city_act"])["payload"]["trigger"] == "new_reply"


def test_subject_lexicon_matches_in_the_items_language_without_false_friends():
    from palavva_editorial.city import lexicon as L
    assert "engrais" in L.hits(["agriculture"], "Les agriculteurs sénégalais face à la hausse du prix des engrais", ["fr"])
    assert L.hits(["football"], "المنتخب المصري يستعد لمباراة حاسمة", ["ar"])
    assert L.hits(["logistics", "energy"], "Moçambique: novo corredor ferroviário e apagão em Maputo", ["pt"])
    assert L.hits(["agriculture"], "Wakulima wanahitaji mbolea zaidi msimu huu", ["sw"])
    assert L.hits(["technology"], "Report on approval of Portugal budget", ["en"]) == []  # no 'app*' / 'port*' false friends
    assert L.hits(["agriculture"], "Mais le gouvernement a dit non", ["fr"]) == []        # French 'mais' (but) is not maize


def test_shared_run_copy_check_and_title_softening():
    from palavva_editorial.city.engine import _shared_run, policy_title
    a = "Enquanto países como Quênia usam drones para colocar antenas em locais inacessíveis, muitas soluções em Moçambique"
    b = "O texto toca no ponto certo. Enquanto países como Quênia usam drones para colocar antenas em locais inacessíveis, muitas"
    assert _shared_run(a, [b]) >= 8 and _shared_run("farming seeds and storage costs this season", [b]) == 0
    assert policy_title("New Awards Recognize Farmers Who Store Grain") == "New awards recognize farmers who store grain"
    assert "Dangote" in policy_title("How Should Dangote Prices Affect Transport?")


def test_arabic_source_names_ground_their_transliteration_only():
    from palavva_editorial.editorial.policy import unsupported_entities as u
    g = "بالفيديو.. بن رحمة ينقذ نيوم من الهزيمة أمام الحزم"
    assert u("Ben Rahma rescued the team while Zidane watched.", g) == ["Zidane"]


def test_gkg_language_from_gdelt_and_vanity_cctld_flagged():
    from palavva_editorial.intel import gkg
    row = [""] * 27
    row[1], row[3], row[4] = "20261011073000", "felvidek.ma", "https://felvidek.ma/x"
    row[25], row[26] = "srclc:hun;eng:GT-HUN 1.0", "<PAGE_TITLE>A rendőrség újfent figyelmeztet</PAGE_TITLE>"
    a = gkg.african_articles([row], {}, "translation")[0]
    assert a["language"] == "x-hun" and a["cctld_only"] is True and a["publisher_country"] == "MA"
    row[3], row[4], row[25] = "myjoyonline.com", "https://myjoyonline.com/y", ""
    b = gkg.african_articles([row], {"myjoyonline.com": ["GH"]}, "english")[0]
    assert b["language"] == "en" and b["cctld_only"] is False and b["publisher_country"] == "GH"
