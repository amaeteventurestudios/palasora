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

Human views and shares are **not yet instrumented**. They are stored as 0 and labelled, not estimated.

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
