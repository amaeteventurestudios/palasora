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
    assert len(b) < 900 and "never at people or groups" in b or "Humour" not in b
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
