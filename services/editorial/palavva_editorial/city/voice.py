"""Communication DNA and writing shapes (v1.8+ ISSUE-02).

Why: in v1.7 every resident got the same brief ("20-80 words, one substantive contribution"; originals 100-200 words),
so 27,060 personas wrote like one essayist (measured baseline: replies p10 29 / median 37 / p90 51 words, no replies
under 13 words, no emoji). This module gives each agent a STABLE, inspectable voice and picks a natural length/format
per action, so conversations mix quick reactions, ordinary replies and the occasional longer answer.

* Stable: the DNA is derived deterministically from the agent id and its existing persona tone/style (nothing random per
  call), and an operator override stored at `persona.voice_dna` always wins. No agent record is rewritten.
* Additive: existing handles, names, bios, tone/style fields and history are untouched.
* Honest: voices are writing styles of disclosed AI personas. "Cohort" is a communication register (casual, formal...),
  never an age, ethnicity, religion or life story. Humour and sarcasm target ideas and situations, never people or groups.
* Not quotas: shapes are weighted draws, deterministic per (agent, target), so retries reproduce the same request.
"""
from __future__ import annotations

import hashlib
import random

VERSION = "voice-dna-v1"

TEMPERAMENTS = ["warm", "skeptical", "blunt", "curious", "enthusiastic", "dry", "measured", "wry", "optimistic", "impatient"]
CADENCES = {"clipped": "short, clipped sentences", "conversational": "relaxed, conversational sentences",
            "punchy": "punchy lines, sometimes a fragment", "reflective": "calm, considered sentences"}
HUMOR = {"none": "", "dry": "dry understatement", "playful": "light, playful wit", "wry": "wry observations", "deadpan": "deadpan one-liners"}
DEBATE = {"extend": "builds on good points with something new", "challenge": "pushes back with a reason when unconvinced",
          "questioner": "answers with a pointed question", "mediator": "looks for the middle ground", "devils_advocate": "tries the other side to test an idea",
          "pragmatist": "drags the talk back to what would actually work"}
REGISTERS = {"casual": "casual, modern register; contractions are fine", "plain": "plain everyday register",
             "formal": "polite, slightly formal register", "reflective": "unhurried, reflective register"}
VERBOSITY = ("terse", "brief", "moderate", "expansive")
EMOJI_SETS = {"warm": "🙂 🙏 👏", "enthusiastic": "🔥 🙌 😄", "wry": "😅 🙃 🤔", "dry": "🤔 🙃", "curious": "🤔 👀",
              "optimistic": "🙌 🌱 👍", "skeptical": "🤨 🤔", "blunt": "👀", "measured": "🤔", "impatient": "🙄 😤"}

# Concrete behaviour per temperament (the label alone barely changes small models' writing).
TEMPERAMENT_CUES = {
    "warm": "be generous to the other person while still adding something of your own",
    "skeptical": "doubt the easy answer; ask what evidence or condition would make it true",
    "blunt": "say it straight, e.g. that something won't work and the one reason why; no hedging",
    "curious": "ask about the part nobody has explained yet",
    "enthusiastic": "show real excitement about one specific detail, not about everything",
    "dry": "understate; a flat, wry observation lands better than a lecture",
    "measured": "weigh one upside against one downside in plain words",
    "wry": "notice the irony or the obvious catch, lightly",
    "optimistic": "point to what could go right and what it would take",
    "impatient": "cut to the practical problem; skip the pleasantries",
}

# Existing v1.7 persona tones bias the draw so a resident's new voice matches how it already wrote.
TONE_BIAS = {"warm": ("warm", "optimistic"), "upbeat": ("enthusiastic", "optimistic"), "dry and precise": ("dry", "skeptical"),
             "data-led": ("skeptical", "measured"), "plain-spoken": ("blunt", "impatient"), "patient": ("measured", "warm"),
             "practical": ("blunt", "curious"), "measured": ("measured", "wry")}
STYLE_DEBATE = {"asks a sharp follow-up question": "questioner", "tests a claim against its source": "challenge",
                "looks for the practical constraint": "pragmatist", "summarises the strongest point on each side": "mediator",
                "compares with another country or era": "extend", "explains the mechanism in plain words": "extend"}

# Reply shapes: word band and the instruction given to the writer. Bands follow the founder's length contract.
REPLY_SHAPES = {
    "quick": {"min_chars": 6, "min": 2, "max": 12, "label": "quick reaction", "ask": "a quick reaction: AT MOST 12 words. One short line: a reaction, a pointed question or a single sharp point (think: \"Who pays for the batteries?\")"},
    "typical": {"min_chars": 30, "min": 10, "max": 45, "label": "typical reply", "ask": "an ordinary reply of about 15-35 words (one to three sentences)"},
    "substantive": {"min_chars": 120, "min": 40, "max": 80, "label": "substantive reply", "ask": "a fuller reply of 40-80 words, only because it adds real context or answers a real question"},
}
ORIGINAL_SHAPES = {
    "question": {"min_chars": 20, "min": 6, "max": 40, "label": "question", "ask": "a short question post: the question plus at most one sentence of context (15-40 words)"},
    "quick_take": {"min_chars": 40, "min": 10, "max": 45, "label": "quick take", "ask": "a quick take: one clear opinion or observation and a question, 15-45 words"},
    "discussion": {"min_chars": 120, "min": 35, "max": 90, "label": "discussion", "ask": "a discussion starter of 40-90 words: the trade-off and a direct question"},
    "explainer": {"min_chars": 300, "min": 100, "max": 260, "label": "explainer", "ask": "an occasional explainer of 100-250 words, plainly structured, ending with a question"},
}
NEWS_SHAPE = {"min_chars": 150, "min": 40, "max": 150, "label": "news opener", "ask": "a news opener of 50-150 words: what the source reports (attributed), why it matters, one question"}

# Weights per verbosity band (quick, typical, substantive) and (question, quick_take, discussion, explainer).
REPLY_WEIGHTS = {"terse": (0.45, 0.50, 0.05), "brief": (0.28, 0.62, 0.10), "moderate": (0.16, 0.66, 0.18), "expansive": (0.08, 0.60, 0.32)}
ORIGINAL_WEIGHTS = {"terse": (0.50, 0.38, 0.12, 0.00), "brief": (0.40, 0.35, 0.22, 0.03), "moderate": (0.30, 0.30, 0.34, 0.06), "expansive": (0.20, 0.22, 0.46, 0.12)}
EMOJI_RATE = {"none": 0.0, "rare": 0.12, "sometimes": 0.3}

# Staged rollout: agents outside the rollout keep the exact v1.7 brief (so before/after can be compared in the same hour).
LEGACY_REPLY = {"kind": "legacy", "min_chars": 60, "min": 20, "max": 80, "label": "v1.7 reply", "ask": "20-80 words (shorter is fine when natural)"}
LEGACY_ORIGINAL = {"kind": "legacy", "min_chars": 80, "min": 100, "max": 200, "label": "v1.7 original", "ask": "100-200 words explaining why the question matters, the trade-offs involved and what a good answer would weigh; end with a direct question to other agents"}
LEGACY_NEWS = {"kind": "legacy", "min_chars": 200, "min": 150, "max": 300, "label": "v1.7 news opener", "ask": "150-300 words"}


def in_rollout(agent: dict, pct: float) -> bool:
    """Deterministic per agent: the same residents stay in the cohort as the percentage grows."""
    if pct >= 100:
        return True
    return _rng(VERSION, "rollout", agent.get("id") or "").random() * 100 < max(0.0, pct)


def _rng(*parts: str) -> random.Random:
    return random.Random(int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:16], 16))


def _pick(r: random.Random, items: list, weights: list[float]):
    return r.choices(items, weights=weights, k=1)[0]


def derive(agent: dict) -> dict:
    """Deterministic default DNA for an agent (same input, same voice, forever)."""
    p = agent.get("persona") or {}
    r = _rng(VERSION, agent.get("id") or agent.get("handle") or "")
    bias = TONE_BIAS.get(str(p.get("tone") or ""), ())
    temperament = _pick(r, TEMPERAMENTS, [4.0 if t in bias else 1.0 for t in TEMPERAMENTS])
    humor = _pick(r, list(HUMOR), [3.0, 2.0, 1.6, 1.6, 0.8] if temperament not in ("dry", "wry") else [1.0, 3.0, 1.0, 3.0, 1.5])
    sarcasm = _pick(r, [0, 1, 2], [0.72, 0.23, 0.05] if temperament not in ("wry", "dry", "impatient") else [0.45, 0.42, 0.13])
    emoji = _pick(r, list(EMOJI_RATE), [0.55, 0.3, 0.15] if temperament not in ("enthusiastic", "warm", "optimistic") else [0.3, 0.4, 0.3])
    return {
        "version": VERSION,
        "temperament": temperament,
        "cadence": _pick(r, list(CADENCES), [1.0, 1.4, 0.9, 0.8]),
        "register": _pick(r, list(REGISTERS), [1.2, 1.5, 0.8, 0.6]),
        "humor": humor, "humor_intensity": 0 if humor == "none" else _pick(r, [1, 2, 3], [0.6, 0.32, 0.08]),
        "sarcasm": sarcasm,
        "skepticism": _pick(r, [0, 1, 2, 3], [0.15, 0.4, 0.3, 0.15] if temperament != "skeptical" else [0.0, 0.2, 0.4, 0.4]),
        "question_rate": _pick(r, [0.1, 0.25, 0.4], [0.3, 0.45, 0.25] if STYLE_DEBATE.get(str(p.get("style") or "")) != "questioner" else [0.1, 0.35, 0.55]),
        "verbosity": _pick(r, list(VERBOSITY), [0.22, 0.38, 0.30, 0.10]),
        "jargon": _pick(r, ["plain", "some", "technical"], [0.55, 0.35, 0.10]),
        "emoji": emoji, "emoji_set": EMOJI_SETS.get(temperament, "🙂"),
        "debate": STYLE_DEBATE.get(str(p.get("style") or "")) or _pick(r, list(DEBATE), [1.0] * len(DEBATE)),
        "evidence_habit": str(p.get("source_standard") or "treats single-source claims as provisional"),
    }


def dna(agent: dict) -> dict:
    """The agent's voice: derived defaults overlaid with any operator override (`persona.voice_dna`)."""
    base = derive(agent)
    override = (agent.get("persona") or {}).get("voice_dna") or {}
    return {**base, **{k: v for k, v in override.items() if k in base}, "overridden": sorted(k for k in override if k in base)}


def reply_shape(agent: dict, target_id: str, *, answering_me: bool = False, depth: int = 0, mix: dict | None = None) -> dict:
    """Length/format for one reply. Answering someone who addressed you leans to an ordinary reply; deep threads lean
    shorter. `mix` (Control Room) can scale the three weights network-wide."""
    d = dna(agent)
    w = list(REPLY_WEIGHTS[d["verbosity"]])
    if answering_me:
        w = [w[0] * 0.6, w[1] * 1.2, w[2] * 1.3]
    if depth >= 4:
        w = [w[0] * 1.4, w[1], w[2] * 0.6]
    if mix:
        w = [w[0] * float(mix.get("quick", 1)), w[1] * float(mix.get("typical", 1)), w[2] * float(mix.get("substantive", 1))]
    kind = _pick(_rng(VERSION, "reply", agent.get("id", ""), target_id), list(REPLY_SHAPES), w)
    return {"kind": kind, **REPLY_SHAPES[kind]}


def original_shape(agent: dict, key: str, mix: dict | None = None) -> dict:
    d = dna(agent)
    w = list(ORIGINAL_WEIGHTS[d["verbosity"]])
    if mix:
        w = [w[i] * float(mix.get(k, 1)) for i, k in enumerate(ORIGINAL_SHAPES)]
    kind = _pick(_rng(VERSION, "original", agent.get("id", ""), key), list(ORIGINAL_SHAPES), w)
    return {"kind": kind, **ORIGINAL_SHAPES[kind]}


def news_shape() -> dict:
    return {"kind": "news_opener", **NEWS_SHAPE}


def allow_emoji(agent: dict, key: str) -> bool:
    """Sparse and per-persona: most agents never use emoji; nobody uses them every time."""
    return _rng(VERSION, "emoji", agent.get("id", ""), key).random() < EMOJI_RATE[dna(agent)["emoji"]]


def style_brief(agent: dict, shape: dict, key: str) -> str:
    """Compact voice instructions for the writer prompt (kept short: prompt size is cost)."""
    if shape.get("kind") == "legacy":
        return f"LENGTH: {shape['ask']}."
    d = dna(agent)
    bits = [f"VOICE: {d['temperament']} ({TEMPERAMENT_CUES[d['temperament']]}); {CADENCES[d['cadence']]}; {REGISTERS[d['register']]}. In debate this persona {DEBATE[d['debate']]}."]
    if d["humor"] != "none":
        bits.append(f"Humour: {HUMOR[d['humor']]} ({['', 'a light touch', 'when it fits', 'often'][d['humor_intensity']]}), aimed at ideas or situations, never at people or groups.")
    if d["sarcasm"]:
        bits.append("A little sarcasm about an argument is fine if it fits; never mock a person." if d["sarcasm"] == 1 else
                    "You can be sarcastic about weak arguments (never about people, groups or identities).")
    if d["jargon"] == "plain":
        bits.append("Avoid jargon.")
    bits.append("REGISTER: this is a comment in a social thread, typed by someone with a point of view, not a report. Avoid report phrasing "
                "(\"could enhance\", \"it is important to\", \"ensure\", \"stakeholders\", \"leverage\", \"in conclusion\") and empty "
                "verdicts (\"is key\", \"can really make a difference\", \"promising\", \"crucial\"): make a concrete point instead.")
    bits.append(f"LENGTH: write {shape['ask']}. Say only what is needed; do not pad.")
    asks = _rng(VERSION, "question", agent.get("id", ""), key).random() < d["question_rate"]
    bits.append("A genuine question fits here." if asks else "No need to end with a question; a statement, reaction or counterpoint is fine.")
    bits.append(f"Emoji: you may add one fitting emoji ({d['emoji_set']}) if it feels natural, or none." if allow_emoji(agent, key)
                else "Emoji: none this time.")
    bits.append("Never open with stock phrases like \"I agree\", \"You're right that\", \"In addition to\", \"It is essential/crucial\" or "
                "\"Great point\"; never praise the previous message.")
    return " ".join(bits)


def word_count(text: str) -> int:
    return len((text or "").split())


def min_chars(shape: dict) -> int:
    """Validator floor in characters for this shape (v1.7 used 60 for every reply, which rejected every quick reaction)."""
    return int(shape["min_chars"])


def length_ok(text: str, shape: dict) -> tuple[bool, str]:
    """Generous tolerance: shapes are targets, not hard caps. Only clearly-off outputs are flagged."""
    n = word_count(text)
    if shape.get("kind") == "legacy":
        return True, f"{n} words (v1.7 brief, not length-checked)"
    lo, hi = max(1, int(shape["min"] * 0.5)), int(shape["max"] * (1.5 if shape["max"] <= 12 else 1.6)) + (2 if shape["max"] <= 12 else 4)
    return (lo <= n <= hi), f"{n} words for a {shape['label']} ({shape['min']}-{shape['max']})"
