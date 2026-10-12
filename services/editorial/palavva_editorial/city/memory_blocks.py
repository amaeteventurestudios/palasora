"""Selective persistent agent memory, modelled on Letta's core-memory blocks (v1.8+ ISSUE-02).

What is reused from Letta (Apache-2.0, https://github.com/letta-ai/letta, `archive` branch: letta/schemas/block.py and
letta/schemas/memory.py): the BLOCK concept (label, value, character limit, description, read-only flag) and the
`<memory_blocks>` rendering with `chars_current/chars_limit` metadata, so the writer sees its memory in the same shape a
Letta agent would. What is NOT reused: Letta's server, agent loop or self-editing tool calls. Memory edits here are
deterministic (no extra model call per action), which keeps cost flat for 27,060 residents; see INTEGRATION-AUDITS.md.

Blocks (all inside the existing `agents.memory` JSON under "blocks"; nothing else in the record changes):
* persona (read-only): the voice DNA summary; rendered, never edited by the agent.
* stances: the agent's positions per thread. A newer position on the same thread SUPERSEDES the old one (kept in
  `history` for audit, never shown to the writer again), so obsolete beliefs are not retrieved.
* relationships: per other agent, how many exchanges and the last stance/excerpt, so an agent remembers an earlier
  argument with the same counterpart instead of meeting them fresh every time.
Operators can correct or delete any entry (`correct()`), which is audited by the caller.
"""
from __future__ import annotations

import time

STANCE_LIMIT = 1200       # chars rendered for the stances block
REL_LIMIT = 900           # chars rendered for relationships relevant to this action
MAX_STANCES, MAX_RELS, MAX_HISTORY = 24, 40, 40
STANCES = ("agree", "disagree", "partly", "question", "joke", "neutral")


def _blocks(agent: dict) -> dict:
    b = ((agent.get("memory") or {}).get("blocks") or {})
    return {"stances": list(b.get("stances") or []), "relationships": dict(b.get("relationships") or {}), "history": list(b.get("history") or [])}


def remember(agent: dict, *, thread_id: str, topic: str, stance: str, excerpt: str, other_agent_id: str = "", other_handle: str = "", now: float | None = None) -> dict:
    """Return the updated `memory` JSON (pure; the caller persists it). One stance per thread: the newest wins."""
    now = now or time.time()
    b = _blocks(agent)
    stance = stance if stance in STANCES else "neutral"
    for old in [s for s in b["stances"] if s.get("thread") == thread_id]:
        b["history"].append({**old, "superseded_at": now})
    b["stances"] = [s for s in b["stances"] if s.get("thread") != thread_id] + [{"thread": thread_id, "topic": topic[:90], "stance": stance, "said": excerpt[:140], "at": now}]
    b["stances"] = b["stances"][-MAX_STANCES:]
    b["history"] = b["history"][-MAX_HISTORY:]
    if other_agent_id:
        r = b["relationships"].get(other_agent_id) or {"handle": other_handle, "n": 0}
        b["relationships"][other_agent_id] = {"handle": other_handle or r.get("handle", ""), "n": int(r.get("n", 0)) + 1, "last_stance": stance,
                                              "last_topic": topic[:90], "last_at": now}
        if len(b["relationships"]) > MAX_RELS:
            for k, _ in sorted(b["relationships"].items(), key=lambda kv: kv[1].get("last_at", 0))[: len(b["relationships"]) - MAX_RELS]:
                b["relationships"].pop(k, None)
    return {**(agent.get("memory") or {}), "blocks": b}


def correct(agent: dict, *, thread_id: str, stance: str | None = None, delete: bool = False, now: float | None = None) -> dict:
    """Operator correction: replace or remove the stance held for a thread; the previous value goes to history."""
    now = now or time.time()
    b = _blocks(agent)
    cur = next((s for s in b["stances"] if s.get("thread") == thread_id), None)
    if cur:
        b["history"].append({**cur, "superseded_at": now, "corrected": True})
        b["stances"] = [s for s in b["stances"] if s.get("thread") != thread_id]
        if not delete and stance in STANCES:
            b["stances"].append({**cur, "stance": stance, "at": now, "corrected": True})
    return {**(agent.get("memory") or {}), "blocks": b}


def _block(label: str, description: str, value: str, limit: int, read_only: bool = False) -> str:
    value = value[:limit]
    meta = ("- read_only=true\n" if read_only else "") + f"- chars_current={len(value)}\n- chars_limit={limit}"
    return f"<{label}>\n<description>\n{description}\n</description>\n<metadata>\n{meta}\n</metadata>\n<value>\n{value}\n</value>\n</{label}>"


def render(agent: dict, persona_line: str, *, thread_id: str = "", counterpart_ids: list[str] | None = None) -> str:
    """Letta-style memory text for one action: the persona, this agent's current stance in THIS thread plus its most
    recent other stances, and its history with the people it is about to answer."""
    b = _blocks(agent)
    here = [s for s in b["stances"] if s.get("thread") == thread_id]
    others = [s for s in b["stances"] if s.get("thread") != thread_id][-4:]
    st = "\n".join(f"- {'THIS THREAD: ' if s in here else ''}{s['stance']} on \"{s.get('topic', '')}\" (you said: \"{s.get('said', '')}\")" for s in here + others) or "- none yet"
    rels = [b["relationships"][i] for i in (counterpart_ids or []) if i in b["relationships"]]
    rl = "\n".join(f"- @{r.get('handle', '?')}: {r.get('n', 0)} earlier exchange(s); last time you were {r.get('last_stance', 'neutral')} on \"{r.get('last_topic', '')}\"" for r in rels) \
        or "- no earlier exchanges with these participants"
    return "<memory_blocks>\n" + "\n".join([
        _block("persona", "Your stable voice. Read-only.", persona_line, 600, read_only=True),
        _block("stances", "Positions you have taken. Stay consistent, or say plainly that you changed your mind and why.", st, STANCE_LIMIT),
        _block("relationships", "Your history with the agents in this exchange. Remember it; do not invent more.", rl, REL_LIMIT),
    ]) + "\n</memory_blocks>"


def to_letta_blocks(agent: dict, persona_line: str) -> list[dict]:
    """Export in Letta's Block shape (label/value/limit/description/read_only) for an optional external Letta server."""
    b = _blocks(agent)
    return [
        {"label": "persona", "value": persona_line[:600], "limit": 600, "description": "Stable voice (Palavva voice DNA).", "read_only": True},
        {"label": "stances", "value": "\n".join(f"{s['stance']}: {s.get('topic', '')}" for s in b["stances"])[:STANCE_LIMIT], "limit": STANCE_LIMIT,
         "description": "Current positions per thread; superseded ones excluded.", "read_only": False},
        {"label": "relationships", "value": "\n".join(f"@{r.get('handle', '?')}: {r.get('n', 0)} exchanges, last {r.get('last_stance')}" for r in b["relationships"].values())[:REL_LIMIT],
         "limit": REL_LIMIT, "description": "History with other agents.", "read_only": False},
    ]
