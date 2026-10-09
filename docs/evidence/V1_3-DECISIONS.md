# v1.3 decisions (ADR-style)

Scope: Mac-local build only. `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false` throughout. Nothing was deployed. No Oracle or Hetzner access, no paid API.

Each entry gives the decision, why, and how to reverse it.

---

## D-01 Risk-tiered automatic publication (founder clarification, 22 §2)

**Decision.** A topic publishes without a human only when **every** condition holds:
- the source is rights-approved;
- every summary block cites a claim and the claim check is `PASS`;
- the ruleset puts it in the LOW tier;
- no prompt injection is detected in the source;
- the publication-rate cap allows it (6 per hour per tenant);
- both auto-publication kill switches are off.

Everything else goes to the exception queue (`/admin/exceptions`).

**Enforcement is at two layers:**
- **Python validator** (`conversation.assess_topic`, `auto_publish`).
- **PocketBase JSVM gate** (`pb_hooks/lib/gate.js`). It refuses a `system:auto-validator` publish unless all of these exist: an `editorial_reviews` `auto_publish` record, a `moderation_decisions` `allow` record with a ruleset version, LOW risk, and claim check `PASS`. It also refuses whenever `PUBLISHING_PAUSED` is set.

**Reverse:** set `AUTO_PUBLISH_DISABLED=true` (env, deployment-wide) or flip the tenant switch in Command Center → Settings.

## D-02 Two independent auto-publish kill switches (fix found during v1.3 acceptance)

**Finding.** `AUTO_PUBLISH_DISABLED` in the env was loaded but never consulted; only the tenant switch was checked. An ignored kill switch is a safety defect.

**Decision.** Either switch now holds publication:
- the env var is deployment-wide;
- the tenant setting is per tenant.

`.env.example` keeps the fail-closed default `true`. `.env.local` and `.env.test` set `false`, matching the v1.3 founder decision and the behaviour they already had. The hold reason names which switch fired.

Test: `test_auto_publish_env_kill_switch_holds_even_when_tenant_allows`.

## D-03 Seed no longer overwrites tenant data

**Finding.** `seed.py` upserted tenants on every restart, which reset quotas and branding that admins had changed.

**Decision.** `ensure_tenant()` creates a tenant only if it is missing. The `AUTO_PUBLISH_DISABLED` seed flip to `false` applies only when the current value was written by `seed`. Any human choice is preserved.

## D-04 Model budget raised to 250 requests per day (local only)

**Decision.** The tenant quota `daily_ai_requests` and env `MODEL_DAILY_REQUEST_BUDGET` were raised from 100 to 250. Two other budgets are separate:
- conversation replies have their own budget, `CONVERSATION_DAILY_REPLY_BUDGET=150`;
- each role has a quota of 40 per day.

The model is the free local Qwen on the iMac, so there is no monetary cost.

**Reverse:** lower the values in Command Center or the env.

## D-05 Conversation prompt is standalone; JSON property order matters

**Findings with real `qwen3.5:4b`:**
- **Shared prompt.** Converse calls initially abstained 100% of the time. The editorial drafting SYSTEM prompt ("only state what the packet says") conflicted with reasoning-based replies.
- **Reply schema order.** Constrained decoding generates fields in schema order. A leading `decision` enum made the model commit to "abstain" before writing anything. With `new_angle` ahead of `text`, it put its reply in the wrong field.

**Decisions:**
- `CONVERSE` (converse-v3) is a standalone prompt.
- The schema order is `parent_post_id`, `text`, `new_angle`, `claims`, `uncertainties`, with no decision enum. Empty text means abstain.
- The researcher schema (researcher-v3) now generates `claims` **before** `decision`.

**Researcher outcome.** Real Qwen had abstained on every Global Voices commentary piece and on a French/Arabic packet. After the change it produced attributed claims on all of them, e.g. "Global Voices بالعربية reported that the term 'Mozambican' emerged with independence."

**Guard.** Unit test `test_researcher_schema_generates_claims_before_decision`. A run that says `ABSTAIN` but returns claims is recorded as succeeded. Its claims still go through `clean_claims` and the claim check.

## D-06 Deterministic validator false positives fixed

`conv-rules-v1` had three false positives:
- inline citation tokens (`claim_1`, `S2`) counted as unsupported numbers;
- "October 9, 2026" failed against "2026-10-09";
- enumerated points ("1.", "2.") were flagged.

**Decisions:**
- Citation tokens are stripped before the number check.
- Numbers are compared by digit component.
- The converse prompt asks for prose with no digits unless they appear in the evidence.

Unsupported figures are still blocked. Ten real replies were rejected for this reason; see `docs/evidence/v13/conversation-state.json`.

## D-07 Policy topics are no longer automatically HIGH risk

**Finding.** The v1.2 classifier marked any government or policy mention HIGH. No SAnews item could ever qualify as low risk.

**Decision.** Topic sensitivity is now: health HIGH, fintech MEDIUM, everything else LOW. Sensitive **terms** still force the sensitive tier, including killed, police, court phrasing ("on trial", "trial court") and the French/Arabic equivalents. Bare "trial" was removed after it matched "fishers trial".

**Result.** Police, crime, GBV and court stories are held. A provincial industrial-plan announcement and a careers message auto-published.

## D-08 Language: text evidence beats a mislabelled feed hint

**Finding.** The Global Voices Arabic feed declares an English `<language>`, so Arabic items were stored as `en`.

**Decision.** When script or word evidence in the text is strong (more than 30% Arabic letters, or French function words in a sentence of at least 6 words), it overrides the feed hint. The hint decides only when the text is inconclusive. Existing items were re-detected; one was corrected.

## D-09 Locale resolution is cookie-based (no locale URL prefixes); country only from a trusted header

**Decision.** Interface language, reading language and home edition are three independent preferences. They are resolved in this order:
1. explicit choice (`pv_prefs` cookie, httpOnly, first-party);
2. saved account preference;
3. supported browser `Accept-Language`;
4. coarse-country default;
5. `en`.

Viewing another country never rewrites them (L-04, L-06, L-15 tests).

**Country signal.** Country comes only from the header named in `TRUSTED_GEO_HEADER`, for example an edge proxy's country header. There is no GeoIP database, no IP geolocation in the app, and no GPS. The test stack uses `x-test-country`.

**Why no `/fr/...` URL prefixes.** They would duplicate every route and every canonical URL. Content language is per story, so canonical story URLs stay language-neutral.

**Trade-off.** Search engines see the English canonical. Proper `hreflang` alternates would need locale routes and are a future step.

## D-10 Machine translation enabled only for French and Arabic; Pidgin UI is beta, with no MT

**Decision.** `registry.json` gates each of the 13 locales separately for UI (`ready`/`beta`/`planned`) and MT (`enabled`/`disabled`).

| Locale | UI | MT |
| --- | --- | --- |
| French | beta | enabled |
| Arabic | beta | enabled |
| Nigerian Pidgin | beta, written by the build agent | disabled: no tested model quality, no native QA |
| Yoruba, Igbo, Hausa, Kiswahili, Amharic, Portuguese and others | planned | disabled |

Translations are always labelled "machine translation, not yet reviewed". They pass a fidelity gate (numbers, citation tokens, Latin-script names). A failure is stored as `failed` and the original is shown. Readers asking for a disabled language get an explicit "not available, showing the original" notice, never a fabricated translation (L-09).

**Not claimed:** native-speaker quality for any language.

## D-11 Maps: geoBoundaries ADM1 → static SVG paths, not MapLibre and not tiles

**Decision.** Boundaries come from geoBoundaries gbOpen ADM1, simplified with Douglas–Peucker and served as small JSON per country:
- NG: 37 areas, 42 KB;
- ZA: 9;
- KE: 47;
- GH: 16;
- SN: 14.

The map is rendered as accessible SVG `<a>` areas with a full text list equivalent. There is no tile server and no third-party map requests.

**Why:**
- zero network dependency and no tile-terms exposure;
- works on the future ARM host;
- keyboard and screen-reader addressable;
- an outage of any map service cannot break the page (L-21).

**Licences.** These come from each dataset's geoBoundaries metadata and are stored in each JSON file:

| Country | Source | Licence |
| --- | --- | --- |
| NG | GRID3 | CC BY 4.0 |
| ZA | OCHA ROSEA / Municipal Demarcation Board | CC BY 3.0 IGO |
| SN | Government of Senegal / OCHA ROWCA | CC BY 3.0 IGO |
| KE | RCMRD / Africa GeoPortal | Public Domain |
| GH | OpenStreetMap | CC BY-SA 2.0 |

Attribution is in the footer and on the pulse page.

**Boundaries.** Boundaries are as published by geoBoundaries, with no editorial position on disputed lines. Ghana uses the 16-region layout.

**Reverse:** MapLibre plus self-hosted PMTiles can replace the SVG later. The component boundary is `PulseMap`.

## D-12 Story geography: subject/event place vs publisher place

**Decision.** The gazetteer classifier records an evidence span for each place mention:

| Mention | Recorded as |
| --- | --- |
| Place in the title | subject, high confidence |
| Place only in the excerpt | affected, provisional |
| Publisher's location | `publisher` role, never mapped |

**Ambiguous names** are never mapped alone: Rivers, Imo, Niger, Delta, Edo, Plateau and the other base names listed in `geo.py`. They need a qualifier ("Rivers State") or an unambiguous city alias (Port Harcourt). Only subject or event mentions at high-confidence or verified level light the map.

Editors confirm, reject or move evidence in `/admin/geo`. Area IDs are recomputed after each decision.

## D-13 Trending: `trend-v1`, human demand only

**Decision.** Trend score inputs:
- human comments and human votes within a time window;
- source count;
- freshness decay.

These are always excluded: AI posts (shown separately as "AI replies"), demo items and fixtures. Every ranking is written to `trending_snapshots` with its components and basis. With no human activity, the panel says so ("Not enough recent activity…") and shows latest verified stories, labelled as such. It never shows invented numbers.

Human views and shares were not instrumented in v1.3 (stored as 0, labelled). **Superseded by D-19/D-20 (v1.3.1):** real deduplicated reads and shares now feed `trend-v2`.

## D-14 Source additions: Global Voices (CC BY 3.0) and SAnews metadata

**Decision.** Four Global Voices feeds were added:
- Nigeria (English);
- Sub-Saharan Africa (English);
- French;
- Arabic.

They are added under CC BY 3.0. Each piece carries the author, a licence link and "changes made: summarized/translated". The rights review is in `docs/evidence/sources/GLOBAL-VOICES-RIGHTS-REVIEW.md`. SAnews gained publisher-area (ZA-GP) and coverage metadata.

**Freshness.** Items older than the freshness window are ignored. Most Global Voices French and Nigeria items were older than 7 days and were correctly not drafted (L-16).

## D-15 DNS rebinding closed (supersedes ADR-012's residual risk)

**Finding.** The v1.3 baseline note said this was addressed, but the fetcher still let httpx resolve DNS a second time after the check.

**Decision.** `safe_fetch` now connects to the exact IP that passed the public-address check. The request URL host is the IP. The `Host` header and the TLS SNI / certificate hostname are the original name. A rebinding answer is therefore never used.

**Verification:**
- unit test `test_dns_rebinding_connection_is_pinned_to_checked_ip`;
- real HTTPS fetches of SAnews and Global Voices succeed with certificate verification (2026-10-09).

## D-16 Live updates: SSE over an ordered event log, not WebSockets

**Decision.** Every committed post emits a `thread_events` row with a per-tenant monotonic `seq` (unique index), written **after** the post is persisted.

The SSE endpoint `/api/v1/events`:
- polls the log every 1.5 s;
- honours `Last-Event-ID` for gap-free replay;
- recycles connections every 5 minutes.

`/api/v1/events/replay` serves the same data as JSON. Clients merge by post id, so a replay never duplicates a post (A-07 test).

**Why:** works through any HTTP proxy, needs no extra service, and replays exactly after a reconnect.

## D-17 Header at 320 px; RTL skip link

**Findings from v1.3 acceptance:**
- Adding the language menu made the header 26 px too wide at 320 px.
- The skip link used `left:-9999px`. In RTL, overflow to the left is scrollable, so Arabic pages gained 9,999 px of horizontal scroll.

**Decisions:**
- Below `sm`, Search and the theme toggle move into the menu, where they were already listed.
- The skip link uses a logical inset plus `translateY(-200%)`.

Both are covered by the T-005 and L-03 tests.

---

# v1.3.1 decisions (2026-10-09, afternoon)

## D-18 Repository history and the GitHub push

**What happened.** An empty test SQLite file, `services/editorial/data/jobs.db` (no rows), had been committed in Phase 2. Before the first push, `main` was rewritten (`git filter-branch`) to drop it, and pushed without force to `github.com/amaeteventurestudios/palavva`. The rewrite was local only, and the pre-rewrite tip is kept at `refs/backup/pre-jobsdb-purge`.

**Verification:**
- `origin/main` matched local `main` (`043fe79`) before v1.3.1 work began.
- A scan of every pushed blob found no secrets: only `__generated__` placeholders in `.env.example`, no private keys, no API tokens.

**Residue (not removed, because removal would need a force-push):** two pushed commits still carry `jobs.db-shm`, a 32 KB SQLite WAL index with no rows and no strings, and an empty `jobs.db-wal`.

**Docs:** documentation now cites the rewritten commit hashes.

## D-19 Real human engagement: reads and shares

**What counts:**
- A **read** counts after 5 s of actual visibility (client beacon). Prefetch and background tabs never count.
- A **share** counts on a share click (WhatsApp, X, Facebook, copy, native share).

**Privacy:**
- Nothing identifying is stored. Deduplication is one per visitor per story per day, via `sha256(daily-rotating random salt | day | network key | UA | story | event)`.
- The salt changes every UTC day, so visitors cannot be linked across days.
- Hash rows are purged after 48 h. Only per-story daily counters remain (`engagement_daily`).
- This means no consent cookie is needed. Global Privacy Control and Do Not Track are honoured: nothing is counted.

**Anti-inflation:**
- not counted: bots, crawlers, link-preview fetchers, scripts and **headless browsers**; staff sessions (editors reviewing content);
- not possible: cross-origin requests (403);
- enforced: per-client rate limit; refusals are themselves counted (`rejected_bot`, `rejected_duplicate`) and shown in `/admin/trends`.

**Consequence for tests.** Automated browser tests and the dev regression script run headless, so they are refused, which is why they cannot inflate trends.

**Limit.** Local dev has no proxy, so every local visitor shares one network key. Deduplication is therefore per user agent locally; behind a proxy with `x-forwarded-for` it is per network plus user agent.

## D-20 trend-v2

Formula:

```
(2*human_comments + human_votes + 1.5*human_shares + 0.5*log2(1 + human_views)
  + 0.5*(sources - 1) + 1) / (age_h + 2)^1.2
```

- AI posts are still excluded.
- Views are log-scaled: a read is a weaker signal than a reply or a share, and log-scaling stops raw traffic from dominating.
- Snapshots now store real `human_views` and `human_shares`.

## D-21 Reply grounding: `conv-rules-v2`

**New rule, `unsupported_entities`.** An AI reply is rejected if it contains any of the following that are not in the topic's evidence or the visible thread:
- a capitalised name (person, organisation, programme), including at sentence start when it begins a multi-word name;
- an acronym;
- a quotation;
- a factual superlative ("the largest… in Africa").

**Allowed:** countries, demonyms and regions, because geographic comparison is reasoning.

**Prompt.** The converse prompt (`converse-v4`/`v5`) now tells the model these limits explicitly.

**Live observation.** A real-Qwen reply naming "Committee" was rejected.

## D-22 Cross-thread diversity

**Problem.** The 4B model recycled the same framing ("power reliability", "operating conditions") across unrelated topics.

**Rules (`editorial/diversity.py`):**
- **Overused themes.** Content bigrams used by AI posts in at least 3 other topics in the past 7 days, and not grounded in this topic's evidence, are passed to the model as themes to avoid. A reply hitting 2 or more of them is rejected.
- **Cross-topic restatement.** A reply more than 0.5 similar to a post in another topic is rejected.
- **Near-duplicate topics.** A new topic more than 0.5 similar to one published in the last 72 h is held for an editor rather than auto-published.

**Exclusions:**
- Re-runs of the *same* question (the evergreen demo) are not "other topics".
- The deterministic test stub is excluded from comparison; it is templated by design and never runs with the real provider.

**Live observation.** A reply leaning on "practical constraint" and "operating conditions" was rejected. Both phrases came from our own prompt's list of insight types, so `converse-v5` rephrases that list and forbids stock labels.

## D-23 Rate-capped topics are retried automatically

A LOW-risk topic held only by the 6-per-hour cap gets a scheduled `retry_auto_publish` job, timed for when the window frees up, with up to 6 attempts.

**At retry time everything is re-checked:**
- still untouched by any human;
- still LOW risk;
- claim check PASS;
- no sensitive terms under the *current* ruleset.

The database gate checks again on publish.

**Live:** two topics held by the cap before this existed were back-filled and both auto-published on retry.

## D-24 Translation pipeline v2.x

1. **Repair pass.** On a fidelity failure, the model gets the exact missing names, numbers and citations and one chance to fix them. The same gate decides.
2. **Arabic names.** Arabic output must keep every Latin-script person or organisation name in Latin letters after the Arabic form, e.g. رامافوزا (Ramaphosa). This makes names machine-verifiable and catches mis-transliterations like "يرامبوسا".
3. **Name test.** A capitalised token is a *name* only if it isn't an ordinary word. The test uses the public-domain web2 list, plus modern words, stems, British spellings, and country/demonym names. Title Case headlines and ministry names may therefore be translated, while proper names must survive.
4. **Automatic re-tries:**
   - failures from older pipeline versions are re-queued once;
   - accepted translations from older pipelines are **re-validated** against the current gate, and any that now fail are withdrawn (readers see the original) and re-queued.

   **Live:** 10 Arabic v1 translations were withdrawn this way.
5. Rejected machine output is kept for editors only, and can be corrected into a reviewed translation in `/admin/translations`.

**Limit.** Names that are also ordinary words ("Bloom", "Grace") are not checked. Meaning and register still need a native speaker.

## D-25 Shared-asset resolver (container crash fix)

**Finding.** The editorial service read the locale registry and boundary files via `Path(__file__).parents[3]/apps/web/...`. Inside the image that path has only 3 levels, so `translate.py` raised `IndexError` on import, and translations would have been silently disabled even if it hadn't crashed.

**Fix:**
- `config.shared_path()`, driven by `PALAVVA_SHARED_DIR`, with the repo layout as fallback;
- the Dockerfile copies `registry.json` and `public/geo` into the image;
- a missing registry now fails loudly.

Verified by the container smoke test.

## D-26 Comment self-edit (T-012 "edit")

- Authors can edit their own visible reply for 15 minutes. Posting rules apply again; a reply with too many links goes back to moderation.
- The previous text is kept in the staff-only audit trail.
- Readers see "edited", and open threads update live via `post_corrected`.
- Other members never see an Edit control.

## D-27 Outbound URL safety (T-032)

`safeExternalUrl` replaces the scheme-only check on business pages, the business API and sponsor inquiries. It blocks:
- non-http(s) schemes;
- embedded credentials;
- loopback, private, link-local and CGNAT IP literals, plus integer and hex IP encodings;
- IPv6 literals;
- `localhost`, `.local` and `.internal` hosts;
- control characters, quotes and spaces.

Unit-tested with 22 malicious cases.

## D-28 Raw-event retention purge (T-028)

**Bug fixed.** The 30-day purge ran only for tenants that also had *recent* events, so a tenant with only old data was never purged. The purge now runs first. Integration test added.

## D-29 Container smoke and rollback drill

**`scripts/compose-smoke.sh`** builds the three images and runs the stack on `127.0.0.1:3400`, using the fixture model with ingestion paused (no external calls). It checks v1.3 pages, live events (SSE), the RTL page, translation and geo assets, migrations, and a containerised nested conversation. It confirms with `docker port` that only web is published, on loopback. Then it removes everything.

**`scripts/rollback-drill.sh`** boots a prior commit in an isolated git worktree with the matching pre-change backup on spare ports, verifies it, and tears down. Neither script pushes images or deploys.
