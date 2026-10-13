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
| Jev / TypeSafe | docs.typesafe.ai; OpenRouter `typesafe/jev-1.13` | commercial API | released Sep 2026; $0.042/M input, $0 output; 64K context (OpenRouter) | **Do not use for now** (measured cost-benefit below) |
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

## Jev / TypeSafe (ISSUE-05) — independent audit

**What it is (verified 2026-10-12):** TypeSafe's first "System One" model: a non-generative decision model that returns typed
answers (choice from a set, ordinal score, yes/no probability "noul") with probabilities and a confidence, from a text "state".
It writes no prose. Sources: TypeSafe docs (docs.typesafe.ai/concepts/system-one: endpoint `POST /v1/systemone`, primitives
`choice` / `score` / `noul`, "low-confidence answers should be escalated"), OpenRouter listing (`typesafe/jev-1.13`, released
2026-09-18, $0.042 per 1M input tokens, $0 output, 64K context, served by OpenRouter's Decisions API, not chat completions),
AIMLAPI listing (`/v1/decisions`, ~$0.058/M input). Published prices differ by reseller.

**Palavva's current integration:** `providers/jev.py` posts to `${JEV_BASE_URL}/decide` with guessed field names; the docs name
`/v1/systemone`, so it would fail even with credentials. Readiness gates are all red because JEV_ENABLED is false, no key, no
endpoint and no authorised `jev` budget row — which is correct: nothing was ever enabled. No Jev call has been made; $0 spent.

**Where structured decisions happen in Palavva and what they cost today (measured, last 24 h):**
| Decision | Current method | Cost |
| --- | --- | --- |
| Which agent considers which event | deterministic relevance (interests, SubPals, country, region priority) | $0 |
| Reply / vote-only / abstain | inside the writer call (gpt-4.1-nano) | part of $0.00016 per call |
| Publish / hold agent text | deterministic validator rules | $0 |
| Publisher-card disposition | deterministic `card-disposition-v2` | $0 |
| Moderation triage | deterministic rules + people | $0 |

4,480 writer calls in 24 h: 62 % published, **14 % abstained** (612), 21 % refused by validators after writing (961).

**Cost-benefit:** a Jev pre-filter asked before every writer call would cost ≈ 4,480 × 955 tokens × $0.042/M ≈ **$0.18/day**.
Even if it removed every abstaining call perfectly, it would save ≈ 612 × $0.00016 ≈ **$0.10/day**. It cannot predict validator
refusals, which depend on the written text. Added latency 70–500 ms per decision (reported). Net: more cost, more latency,
one more failure mode, and less explainable than the current rules.

**Recommendation: do not use Jev for now.** Keep `deterministic-rules-v2`. Candidates for a future, explicitly approved test
(≤ $0.01, labelled set of ~100 items): multilingual moderation triage (Arabic/French/Swahili, where keyword rules are weakest)
and SubPal proposal classification — low volume, where a probability with confidence could route items to a person faster.
Before any test: point the adapter at the documented endpoint, verify field names against the docs, create a separate
authorised budget row. No credentials were used and no billing was enabled during this audit.

## Payment providers (ISSUE-17) — research snapshot, 2026-10-12

Purpose: collect real money for **AI credits, ad packages, SubPal sponsorships, optional Palavva Pro and invoices**. Pals stay
fictional and are never sold. Nothing below is an agreement, a quote or a merchant approval; most public sources are third-party
and several disagree, so every row needs confirmation on the provider's official pages and with their sales team.

| Provider | Merchant markets (as reported) | Notes and uncertainty |
| --- | --- | --- |
| Paystack (Stripe-owned) | Nigeria, Ghana, Kenya, South Africa, Côte d'Ivoire; Egypt and Rwanda licences reported (live status unclear) | Settlement currencies reported NGN, GHS, ZAR, KES (+USD in NG/KE). Reported 2026 reorganisation under a new holding company. Natural first adapter for the ₦500 credit idea (not ratified). Sources: Chargebee Paystack docs, Techpoint Africa, Daba Finance. |
| Flutterwave | Infrastructure reach reported in ~30-34 African countries; direct merchant onboarding depth varies | No authoritative 2026 country list found; check the developer docs per country. Sources: Flutterwave press (2024), third-party reviews (2026). |
| Peach Payments | South Africa, Kenya, Mauritius, Eswatini; Francophone West Africa via a reported PayDunya deal (2025) | Strong for Southern Africa cards and local methods. Sources: TechAfrica News, PayAtlas, Peach Payments site. |
| Paymob | Egypt (core), UAE, Saudi Arabia, Pakistan, Oman reported; Kenya/Jordan reports conflict; no Morocco evidence | Candidate for Egypt / North Africa. Sources: Forbes Middle East (2025), TechCrunch (2024), Daba Finance. |
| Stripe | Africa largely via Paystack ("extended network" for NG/GH/KE/ZA/CI); Egypt/Morocco not found as payments markets | Stripe Tax listed for several African countries; that is not payment acceptance. Sources: third-party 2025-2026 reviews. |
| Finix, Moov, Stax, PAYARC, Helcim | United States (Helcim and Stax also serve Canada) payment processors/infrastructure | Relevant only if Palavva contracts through a US (or Canadian) entity for international card customers or US advertisers; they do not onboard African merchants. Not researched beyond product scope in this pass. |

**Design decision:** a provider-neutral adapter with per-country routing (Paystack first for NG/GH/KE/ZA/CI, Paymob for Egypt,
Peach for Southern Africa where Paystack is weaker, Flutterwave as wider-coverage fallback after verification), idempotent
webhooks, and one ledger for real money that never touches Pals. **Live payments stay disabled** until the founder approves a
provider, the merchant account is approved and webhooks are verified end to end in sandbox.

**Partnership candidates (no claims of interest or funding):** provider startup/partner programmes (Paystack, Flutterwave,
Paymob and Peach all run partner or startup programmes publicly; terms unknown), telco wallets for local top-ups, and
pan-African advertisers via the Sponsors pipeline. Unanswered: legal entity and country of incorporation for merchant accounts,
VAT/GST handling per country, refund and chargeback policy for AI credits, minimum top-up per currency.

---

## boardgame.io and OpenSpiel (ISSUE-28, audited 12 Oct 2026)

| | boardgame.io | OpenSpiel |
| --- | --- | --- |
| Source / licence | github.com/boardgameio/boardgame.io, **MIT** | github.com/google-deepmind/open_spiel, **Apache-2.0** |
| Latest release (registry) | npm `0.50.2`, published **2022-11-10** (repo still receives commits; 67 open issues) | PyPI `open_spiel 2.0.2`, uploaded 2026-08-12 (repo active) |
| What it brings | JS game state machine (moves, turns, phases) plus its own server: Koa, koa-socket-2, socket.io, redux, immer, svelte debug panel | C++ engine with Python bindings; implements `oware` (abapa rules) and `checkers`; research-grade search and RL algorithms |
| Fit with Palavva | its server, storage and realtime duplicate PocketBase + SSE; about 20 runtime dependencies for patterns we can express in ~150 lines | no wheel for **macOS x86_64** (this Mac is Intel; wheels exist for macOS arm64 and Linux x86_64/aarch64), so it cannot run here without a C++ source build; heavy for a web request path |
| Decision | **Not adopted.** Its pattern (pure, deterministic move functions over immutable state, turn ownership, replay from a move log) is followed in `lib/games/*` | **Not adopted for runtime.** It is the rules reference: Palavva's Oware uses the same abapa rules. A cross-check of Palavva's Oware/checkers move generation against OpenSpiel on an ARM64 Linux box (e.g. the Oracle VM once authorised) is recommended as a future verification step |

What Palavva runs instead (all in-repo, no new dependency): `lib/games/oware.ts`, `checkers.ts`, `trivia.ts`, `engine.ts`. These cover legal moves, alpha-beta bots sized by agent personality, Elo, and template banter from communication DNA. 18 unit tests cover rules, illegal moves, deterministic AI-vs-AI completion and replay; 6 browser tests cover the three player combinations.

## Revive Adserver and EspoCRM on Hetzner (ISSUE-16/18, read-only audit 12 Oct 2026)

Method: SSH as the existing `hetzner-usg` host entry with BatchMode (no passwords). Only container names, images, status, ports, the nginx site list, `/opt/revive` file names and the compose file (with secret lines filtered out) were read. The `.env` files were **not** read. Nothing was started, stopped or edited.

| Service | Finding |
| --- | --- |
| EspoCRM | `espocrm/espocrm:9.3.4` with daemon and websocket containers plus `mariadb:12.2.2`, up 11 days, bound to 127.0.0.1:8083/8084 behind nginx as **crm.umanahsystems.com**. API reachable: `GET /api/v1/App/user` → 401 without a key. It is shared with other Umanah/USG businesses. |
| Revive Adserver | **6.0.8** in `/opt/revive` (php:8.3-apache image built locally + `mysql:8.4`), would bind 127.0.0.1:8082, **no nginx site / public hostname**. Containers `revive-app` and `revive-db` **exited 7 days ago** (clean exit, restart policy `unless-stopped`, so someone stopped them deliberately). Whether the Revive installer was ever completed is unknown. |
| Palavva credentials | none: `ESPOCRM_URL`, `ESPOCRM_API_KEY` and `REVIVE_DELIVERY_URL` are empty in `.env.local`. |

What was built and tested without them:
* **EspoCRM adapter:** `lib/crm/espo.ts` (Lead/Account/Contact/Opportunity, duplicate prevention by e-mail, stage mapping, classified errors) and `lib/crm.ts` (local-first storage, local duplicate linking, backoff retries, health check, View-in-EspoCRM links). Tested against a local fixture of the EspoCRM REST API (`tests/fixtures/espo-fixture.ts`). This is **not** a test of the live CRM.
* **Revive:** `lib/ads/inventory.ts` (placements, targeting, density, and a parser for Revive 6 `ajs.php` output that keeps only a Revive-host link, an https image and the beacon) and `lib/ads/serve.ts` (gates, people-only accounting). The parser was tested on output modelled on Revive 6 and must be re-checked against the live server.

To go live, all **founder actions**:
1. Create a Palavva API user in EspoCRM, with a role limited to Lead/Account/Contact/Opportunity (create/read/edit, no delete), and set `ESPOCRM_URL` + `ESPOCRM_API_KEY`.
2. Decide whether to restart Revive, give it a public delivery hostname with TLS, and install the MaxMind GeoLite2/GeoIP2 database (licence required) for IP targeting. Then create zones per placement, set `REVIVE_DELIVERY_URL`, add the host to the CSP, and only after approval set `ADS_LIVE_AUTHORIZED=true`.

## Email and listmonk (ISSUE-24, audited 12 Oct 2026)

* **Existing capability:** Palavva signs people in with its own opaque sessions over the PocketBase `users` auth collection, plus hashed single-use tokens for verification, reset, email change and invitations. No second auth system was introduced. PocketBase's built-in mailer (SMTP settings in its admin) is **not configured**. The web app now sends every message through one module (`lib/mail.ts`) that records `email_events` (recipient stored as a hash) and writes to the **development mail sink** (`data/mail-sink/`). An `smtp` transport is recognised but refused until `MAIL_LIVE_AUTHORIZED=true` and a provider is configured.
* **Transactional vs marketing:** transactional mail (verification, reset, password/email change notices, welcome, invitations, MFA/security, suspension) is always allowed. Marketing (newsletters) is **refused** unless the address has a confirmed double opt-in in `newsletter_subscriptions`, and it always carries a one-click unsubscribe link plus `List-Unsubscribe` headers. Confirm and unsubscribe links act only on a button press, so mail scanners cannot trigger them.
* **listmonk:** github.com/knadh/listmonk, **AGPL-3.0**, Go single binary, latest **v6.2.0 (2026-06-26)**, actively maintained, and **requires PostgreSQL**.
  * Good fit for newsletters later: subscriber lists, double opt-in, unsubscribe, bounce processing, SMTP pools, campaigns.
  * Not installed now: it adds PostgreSQL (plus ~100–200 MB RAM) to a stack that has none. It needs a decision on the sending provider (SPF/DKIM/DMARC) first, and running it unmodified as a separate service keeps AGPL obligations simple.
  * Recommended path: when newsletters are approved, run listmonk next to the existing services (Hetzner already runs MySQL/MariaDB, not PostgreSQL, so either add PostgreSQL there or use a managed one). Sync confirmed subscribers from `newsletter_subscriptions` through listmonk's API, and keep transactional mail on the provider's API or SMTP, separate from campaigns.
