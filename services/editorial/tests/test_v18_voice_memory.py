"""v1.8+ ISSUE-02: per-agent voice DNA, writing shapes and Letta-style memory blocks (pure; no network, no model)."""
from collections import Counter

from palavva_editorial.city import langs, memory_blocks, voice


def agents(n=2000, tone="warm"):
    return [{"id": f"agent{i:05d}", "handle": f"h{i}", "persona": {"tone": tone, "style": "asks a sharp follow-up question"}} for i in range(n)]


def test_dna_is_stable_per_agent_and_differs_between_agents():
    a = {"id": "abc", "persona": {"tone": "dry and precise"}}
    assert voice.dna(a) == voice.dna(dict(a))
    combos = {tuple(sorted((k, str(v)) for k, v in voice.dna(x).items() if k not in ("version", "overridden"))) for x in agents(500)}
    assert len(combos) > 400  # hundreds of distinct voices, not one essayist


def test_operator_override_wins_and_is_reported():
    a = {"id": "abc", "persona": {"voice_dna": {"verbosity": "terse", "emoji": "none", "not_a_field": 1}}}
    d = voice.dna(a)
    assert d["verbosity"] == "terse" and d["emoji"] == "none" and d["overridden"] == ["emoji", "verbosity"]


def test_reply_mix_is_mostly_short_with_some_longer_answers():
    shapes = Counter(voice.reply_shape(a, f"t{i}")["kind"] for i, a in enumerate(agents(3000)))
    total = sum(shapes.values())
    assert 0.15 < shapes["quick"] / total < 0.40
    assert shapes["typical"] / total > 0.45
    assert 0.05 < shapes["substantive"] / total < 0.25


def test_shape_is_deterministic_and_control_room_mix_applies():
    a = agents(1)[0]
    assert voice.reply_shape(a, "t1") == voice.reply_shape(a, "t1")
    never_quick = Counter(voice.reply_shape(x, "t")["kind"] for x in agents(500, "upbeat"))
    assert never_quick["quick"] > 0
    zero = Counter(voice.reply_shape(x, "t", mix={"quick": 0, "typical": 1, "substantive": 1})["kind"] for x in agents(500, "upbeat"))
    assert zero["quick"] == 0


def test_originals_are_mostly_short_and_explainers_rare():
    kinds = Counter(voice.original_shape(a, f"k{i}")["kind"] for i, a in enumerate(agents(3000)))
    short = kinds["question"] + kinds["quick_take"]
    assert short / 3000 > 0.55 and kinds["explainer"] / 3000 < 0.1


def test_emoji_is_sparse_and_many_agents_never_use_it():
    a_list = agents(2000)
    rate = sum(voice.allow_emoji(a, "k") for a in a_list) / len(a_list)
    assert 0.03 < rate < 0.25
    assert sum(voice.dna(a)["emoji"] == "none" for a in a_list) / len(a_list) > 0.25


def test_style_brief_is_short_and_safe():
    a = agents(1)[0]
    b = voice.style_brief(a, voice.reply_shape(a, "t"), "k")
    assert len(b) < 1300  # prompt size is cost
    assert "Humour" not in b or "never at people or groups" in b
    assert "stock phrases" in b


def test_quick_reactions_pass_length_rules_and_essays_do_not():
    quick = voice.REPLY_SHAPES["quick"]
    assert voice.length_ok("That sounds expensive.", quick)[0]
    assert voice.min_chars(quick) <= len("Exactly.")
    assert not voice.length_ok(" ".join(["word"] * 60), quick)[0]
    assert voice.length_ok(" ".join(["word"] * 30), voice.REPLY_SHAPES["typical"])[0]


def test_short_text_language_check_still_requires_agreement():
    assert langs.verify("Quem paga as baterias?", "pt")["ok"]
    assert not langs.verify("Who pays for the batteries?", "pt")["ok"]


def test_memory_supersedes_old_stance_and_keeps_history():
    a = {"id": "x", "memory": {"angles": ["kept"]}}
    a["memory"] = memory_blocks.remember(a, thread_id="T1", topic="Solar co-ops", stance="agree", excerpt="Makes sense.", other_agent_id="B", other_handle="bee", now=1)
    a["memory"] = memory_blocks.remember(a, thread_id="T1", topic="Solar co-ops", stance="disagree", excerpt="Changed my mind: batteries.", other_agent_id="B", other_handle="bee", now=2)
    b = a["memory"]["blocks"]
    assert a["memory"]["angles"] == ["kept"]  # existing memory untouched
    assert [s["stance"] for s in b["stances"]] == ["disagree"]
    assert b["history"][0]["stance"] == "agree" and b["history"][0]["superseded_at"] == 2
    assert b["relationships"]["B"]["n"] == 2
    text = memory_blocks.render(a, "x: wry", thread_id="T1", counterpart_ids=["B"])
    assert "THIS THREAD: disagree" in text and "agree on" not in text.replace("disagree", "")
    assert "@bee: 2 earlier exchange(s)" in text and "chars_limit=" in text and "read_only=true" in text


def test_memory_correction_and_letta_export():
    a = {"id": "x", "memory": {}}
    a["memory"] = memory_blocks.remember(a, thread_id="T1", topic="t", stance="agree", excerpt="e", now=1)
    a["memory"] = memory_blocks.correct(a, thread_id="T1", delete=True, now=2)
    assert a["memory"]["blocks"]["stances"] == [] and a["memory"]["blocks"]["history"][-1]["corrected"]
    blocks = memory_blocks.to_letta_blocks(a, "persona")
    assert [b["label"] for b in blocks] == ["persona", "stances", "relationships"] and all({"value", "limit", "description", "read_only"} <= set(b) for b in blocks)


def test_relationship_block_is_bounded():
    a = {"id": "x", "memory": {}}
    for i in range(memory_blocks.MAX_RELS + 15):
        a["memory"] = memory_blocks.remember(a, thread_id=f"T{i}", topic="t", stance="neutral", excerpt="e", other_agent_id=f"o{i}", now=i)
    assert len(a["memory"]["blocks"]["relationships"]) == memory_blocks.MAX_RELS
    assert len(a["memory"]["blocks"]["stances"]) == memory_blocks.MAX_STANCES


def test_invented_place_of_life_claims_are_rejected_in_several_languages():
    from palavva_editorial.city.textpolicy import check_agent_text
    bad = [("Where I live, roads flood every year.", "en", ""), ("In our village the co-op works.", "en", ""), ("Here in Lagos traffic decides everything.", "en", ""),
           ("Dans nos villages, la formation compte.", "fr", "Training matters."), ("Là où je suis, les silos fonctionnent.", "fr", "Silos work."),
           ("Onde eu moro, a estrada alaga.", "pt", "The road floods."), ("عندنا في القرية الطريق سيئ", "ar", "The road is bad.")]
    for text, lang, gloss in bad:
        r = check_agent_text(text, "roads co-op traffic silos formation estrada الطريق", "hosted", 6, language=lang, gloss=gloss)
        assert any("testimony" in x for x in r["reasons"]), text
    ok = ["In my view, the costs matter more than the hardware.", "Here in this thread nobody has priced the batteries.", "Who maintains it in year two?"]
    for text in ok:
        r = check_agent_text(text, "costs hardware batteries", "hosted", 6, language="en")
        assert not any("testimony" in x for x in r["reasons"]), text


def test_language_registry_generation_status_matches_the_engine():
    """ISSUE-10: the admin's 'agents write in it' column must say exactly what the engine can verify."""
    reg = {l["code"]: l for l in langs.registry()["locales"]}
    for code in langs.VERIFIED:
        assert reg[code]["generation"] == "verified", code
    for code in langs.PILOT_DETECTABLE:
        assert reg[code]["generation"] == "pilot", code
    for code in langs.SCRIPT_ONLY:
        assert reg[code]["generation"] == "script_only", code
    for code in ("pcm", "ha", "ig", "wo", "tw", "fat"):
        assert reg[code]["generation"] == "none" and reg[code]["mt"] == "disabled", code
    assert all(l["human_review"] == "none" for l in reg.values())  # nobody has done native-speaker QA yet: say so
    assert {"fat", "tw", "yo", "ig", "ha", "sw", "am", "pt", "wo", "zu", "pcm"} <= set(reg)
