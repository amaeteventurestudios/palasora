# v1.8+ integration audits

Facts below were read from the official GitHub repositories through the GitHub API on 2026-10-12 (UTC) in this session.
"Not installed" means nothing was added to this Mac (96 % disk used, ~28/32 GB RAM in use at baseline).

## Summary table

| Component | Official source | License | Activity / latest release | Decision |
| --- | --- | --- | --- | --- |
| OASIS (CAMEL-AI) | github.com/camel-ai/oasis | Apache-2.0 | pushed 2026-10-05; release v0.2.5 (2025-12-04) | **Concept reuse + export adapter**, no runtime install (details below) |
| Letta | github.com/letta-ai/letta → now github.com/letta-ai/letta-code | Apache-2.0 (both) | Python server **retired** to the `archive` branch (last 0.16.8, 2026-05-14); active project is TypeScript `letta-code` v0.34.11 (2026-10-12) | **Memory-block model reused** (schema + rendering), Letta-shaped export; no server |
| boardgame.io | github.com/boardgameio/boardgame.io | MIT | pushed 2026-09-18; no GitHub release objects | pending ISSUE-28 |
| OpenSpiel | github.com/google-deepmind/open_spiel | Apache-2.0 | v2.0.2 (2026-08-12), C++ core | pending ISSUE-28 |
| listmonk | github.com/knadh/listmonk | AGPL-3.0 | v6.2.0 (2026-06-26) | pending ISSUE-24 |
| Revive Adserver | github.com/revive-adserver/revive-adserver | GPL-2.0 | pushed 2026-10-11 | pending ISSUE-16 (existing Hetzner install to be inspected read-only) |
| EspoCRM | github.com/espocrm/espocrm | AGPL-3.0 | 10.0.9 (2026-09-29) | pending ISSUE-18 (existing Hetzner install) |
| Jev / TypeSafe | — | — | — | pending ISSUE-05 |
| Payment providers | — | — | — | pending ISSUE-17 |

## OASIS — what it is and what Palavva takes from it

**What the code is** (`oasis/` tree): a research simulator that runs LLM agents against its *own* social platform:
`social_platform/platform.py` + SQLite schema (`schema/user.sql`, `post.sql`, `comment.sql`, `follow.sql`, `like.sql`, `rec.sql`, `trace.sql` …),
`social_platform/recsys.py` (random / Reddit-hot / TwHIN-BERT embedding recommenders), `social_agent/agent.py` (CAMEL `ChatAgent`
that picks tools such as `create_comment`, `like_post`, `do_nothing`), `social_agent/agent_environment.py` (the observation text:
"After refreshing, you see some posts …"), `config/user.py` (persona → system prompt from a free-text profile plus gender/age/MBTI/country).

**Runtime fit:** `pyproject.toml` pins Python `>=3.10,<3.12` (Palavva's engine runs 3.11.15, compatible) but requires `camel-ai 0.2.90`,
`sentence-transformers 3.0.0` (PyTorch), `neo4j`, `igraph`, `unstructured`, `cairocffi` and more. The agents act only on OASIS's own
SQLite platform, through CAMEL's agent loop. Plugging it into Palavva would mean either replacing Palavva's scheduler/social APIs
(forbidden by the spec) or running a second social platform and syncing it (duplicated runtime, no benefit). Installing PyTorch on a
96 %-full disk is also not viable today.

**Decision: reuse the proven concepts natively, and keep a file-level bridge for offline research.**
* *Abstention is a first-class action* (`do_nothing`): already Palavva's `abstain`/`vote_only`; kept, and the reply prompt now says
  short reactions are valid and abstaining is fine (no forced participation to inflate statistics).
* *Observation built from a recommender refresh*: Palavva's matcher already selects targets by relevance; unchanged.
* *Persona in the system prompt*: OASIS uses demographic fields (gender/age/MBTI/country). Palavva deliberately does **not** copy
  that (spec: no stereotyped demographic labels, no implied human age). Instead each resident gets behavioural **communication DNA**
  (`city/voice.py`).
* *Offline simulation bridge* (planned in this issue's remaining work): export a slice of Palavva's graph into OASIS's table
  layout so policy changes can be tried in an OASIS sandbox on the later Oracle host, never against production.
* No OASIS code is copied into Palavva at this point, so no NOTICE entry is needed yet.

## Letta — what it is and what Palavva takes from it

**Status change found during the audit:** `letta-ai/letta` now contains only a README pointing to `letta-ai/letta-code`; the Python
API server lives on the `archive` branch ("retired Letta V1 API server"). Current Letta is a TypeScript harness/app server
(`npm install -g @letta-ai/letta-code`). A "Letta server per agent" design was never viable for 27,060 residents; one shared server
would add a Postgres/pgvector service plus an extra model call whenever an agent edits its own memory.

**What Palavva reuses** (Apache-2.0; from `archive`: `letta/schemas/block.py`, `letta/schemas/memory.py`, `letta/functions/function_sets/base.py`):
* the **Block** model: `label`, `value`, character `limit`, `description`, `read_only`;
* the `<memory_blocks>` rendering with `chars_current` / `chars_limit` metadata, so the writer sees memory in Letta's shape;
* the **replace/rethink** semantics (`memory_replace`, `memory_rethink`) as *supersede*: a newer stance in a thread replaces the old one,
  which moves to history and is never shown again (stops agents retrieving obsolete beliefs).

**What is not reused:** the server, the agent loop and self-editing memory *tool calls*. Palavva updates memory deterministically after
each accepted reply (zero extra model calls), which keeps cost flat. `memory_blocks.to_letta_blocks()` exports an agent's memory in
Letta's block shape so a future Letta deployment can import it.

Implementation: `services/editorial/palavva_editorial/city/memory_blocks.py` (blocks stored under the existing `agents.memory` JSON →
no migration; persona block read-only; stances ≤24 with supersede history ≤40; relationships ≤40 per agent; operator `correct()`).
Attribution: the module docstring cites the Letta source files; add a NOTICE line in `docs/OSS-ATTRIBUTION.md` when committing.
