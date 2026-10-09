# v1.3 acceptance matrix: 79 scenarios (T-001 to T-042, A-01 to A-12, L-01 to L-25)

## Canonical run

`scripts/test-all.sh` → `docs/evidence/test-runs/20261009T212100Z/` (2026-10-09 21:21–21:35 UTC) on the founder's Mac (x86_64, macOS 12):

| Suite | Result |
| --- | --- |
| Web typecheck | clean |
| vitest | 27/27 |
| pytest (unit + integration on isolated PocketBase) | 66 passed, 3 skipped (the opt-in real-Qwen tests) |
| Playwright on the isolated test stack (`:3300`, fixture model, production build) | **53/53** |

Two small fixes landed after that run and were verified by targeted suites: a pytest rule for a word after a colon (pytest now 67 passed), and the admin view of rejected translation output (typecheck clean).

**Real-model evidence.** This comes from the dev stack (`:3000`) with real `qwen3.5:4b`. See `V1_3-AI-CONVERSATION-DEMO.md` and `V1_3-LOCALE-AND-PULSE-DEMO.md`.

**Status meanings:**
- **PASS**: executed and observed.
- **PARTIAL**: the executed part passed, and the gap is named.
- **BLOCKED**: needs an external system or founder approval.

Fixture-provider tests prove control flow only, never model quality.

**Test types:**
- **E2E**: Playwright (`apps/web/tests/e2e/*.spec.ts`).
- **PY**: pytest (`services/editorial/tests`).
- **VT**: vitest.
- **LIVE**: dev stack with real Qwen and real feeds.
- **DOC**: inspection or record.

## AI-first conversation (A-01 to A-12)

| ID | Status | Type | Command / path | Expected | Actual | Evidence | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A-01 | **PASS** | PY + LIVE | `test_A01_A04_low_risk_topic_auto_publishes…`; dev worker | Low-risk, sourced, rights-approved RSS topic auto-publishes, with audit and evidence | 8 real SAnews / Global Voices topics auto-published by `system:auto-validator`, each with a moderation decision (`conv-rules-v1`) and claim IDs. 2 were later withdrawn by an editor (see the Ntshau note) | `v13/conversation-state.json`, `V1_3-AI-CONVERSATION-DEMO.md` §2 | Low volume (two live sources) |
| A-02 | **PASS** | PY + E2E + LIVE | `test_A02_sensitive_and_injected…`; E2E "A-02/A-10" | Sensitive, unsupported or unlicensed topics are held with no public event | 18 real topics held (police, fraud, GBV, courts, migration, uncited, unsupported numbers); no `topic_published` event for any of them | moderation export; `/admin/exceptions` screenshot | — |
| A-03 | **PASS** | LIVE | Demo run 17:03Z; real topics | ≥2 distinct expert roles via real Qwen calls | 5 roles (Engineer, Community, Economist, Founder, Ethics) across real-Qwen threads; 24+ converse calls, median 14.5 s | `demo-run.json`, `ai_runs` | 4B model is thematically repetitive |
| A-04 | **PASS** | E2E + LIVE | E2E "A-04/A-06/A-07"; demo | AI replies to AI using a persisted parent ID, in a visible nested branch | Demo P1→P3→P4 (depth 3) and real topics to depth 3. E2E checks `data-parent-id` and DOM nesting | `v13-live-thread-1440.png`, `v13/screens/*` | — |
| A-05 | **PASS** | PY + E2E | `test_A10_A05_validation_blocks_bad_replies`; E2E "A-05 rights revocation propagates" | Claims and sources validate; corrections and revocations propagate | Bad parent or evidence IDs rejected. Revoking the source withdrew the topic (404), added a public correction and emitted `thread_paused` | Playwright log | — |
| A-06 | **PASS** | E2E + LIVE | E2E "A-06 human reply…"; demo | New replies appear without a refresh | Live: 4 replies arrived in 1.5–3.0 s with no reload; E2E for human and AI replies | `demo-run.json` | — |
| A-07 | **PASS** | E2E | "A-04/A-06/A-07…" | Replay after a cursor, no duplicates | Replay seq strictly increasing and unique; no duplicate post IDs after reload | Playwright log | SSE reconnect replay is tested at API level, not by cutting the network |
| A-08 | **PASS** | PY + LIVE | `test_A08_caps_switches_and_outage`, env kill-switch test | Budgets, caps, novelty, outage stop | Caps 8 posts / depth 4 / 2 per role, novelty ≤0.45, daily budgets. Live: rate cap 6/hour held a topic; 2 abstentions recorded | pytest log; job results | A rate-capped topic isn't retried automatically |
| A-09 | **PASS** | E2E + VT + DOC | E2E "A-09"; `/admin/trends` | AI never counts as human demand | Trend formula uses human comments and votes only; AI posts stored as excluded; AI cannot vote | `trending_snapshots` | Views and shares not instrumented |
| A-10 | **PASS** | PY + LIVE | parametrized `test_A10_A05…`; unit policy tests | Degradation, insult, injection blocked; civil debate survives | All adversarial fixtures blocked; civil disagreement allowed. Live: 12 real replies rejected (numbers, abstain) | pytest log; moderation export | Policy is a deterministic ruleset, not a classifier model |
| A-11 | **PASS** | E2E | T-010/T-011 | Anonymous browse; draft survives sign-in | Exact draft restored and posted once | Playwright log | — |
| A-12 | **PASS** | LIVE | demo 17:03:08–17:04:37Z, desktop and mobile | Real-Qwen timed demo with screenshots and true timestamps | DB and browser timestamps recorded per reply; mobile 390 px with 0 overflow | `demo-run.json`, `v13/screens/` | — |

## Locale, trending, Local Pulse (L-01 to L-25)

| ID | Status | Type | Command / path | Expected | Actual | Evidence | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L-01 | **PASS** | E2E + VT | "L-01 Nigeria guest" | NG edition, English, feed visible; safe fallback | `en`/`NG`, first card visible, no dialog; no country → `ALL` | Playwright; `i18n.test.ts` | Country needs a trusted edge header; none on the dev stack |
| L-02 | **PASS** | E2E | "L-02 Senegal guest" | French UI without a chooser | Wolof browser plus SN → `fr` | Playwright | French UI is beta (agent-written) |
| L-03 | **PASS** | E2E | "L-03/L-18 Arabic market", "L-03 header menus…" | Coherent Arabic RTL | `ar`/`rtl`, Arabic font, 0 overflow, menus inside the viewport at 320/390, map list usable | `v13-ar-rtl-*.png` | Area names stay in Latin script |
| L-04 | **PASS** | E2E | "L-04 saved explicit…" | Saved language beats country; edition persists | Stays `en`/`NG` after visiting Senegal | Playwright | — |
| L-05 | **PASS** | E2E | "L-05/L-24…" | Browser beats country default; override persists | fr-FR in NG → French; switch persists | Playwright | — |
| L-06 | **PARTIAL** | LIVE + E2E | locale-demo step 3; "L-15/L-16…" click-through | Cross-border topic in reading language with original attribution; context changes, language doesn't | Arabic-source Mozambique topic shown in English to an NG reader, with an "original (العربية)" link, author and licence; prefs unchanged | `crossborder-MZ-*.png` | No fresh Senegalese French item exists (Global Voices French items are older than the freshness window) |
| L-07 | **PARTIAL** | LIVE | home NG/en | Real eligible items, no flooding, no fabricated translations | Edition boost works; there is no Nigerian real source yet, so the NG feed is mostly cross-border plus demo | `home-NG-en-1440.png` | Needs Nigerian rights-approved sources; Pidgin and local-language items don't exist |
| L-08 | **PASS** | PY + E2E + VT + LIVE | `test_translate.py`, "L-08/L-23…", `i18n.test` | Names, numbers and citations faithful; editor can block, correct and invalidate | Gate checks numbers, citations and names (titles stripped, cross-language inflection). 7 real fidelity failures held. Block and correct work; new source version re-translates | `/admin/translations` screenshot | Arabic-script name check missing (e.g. "يرامبوسا") |
| L-09 | **PASS** | E2E + VT | "L-08/L-09/L-17…" | Honest fallback | Pidgin shows "isn't available… showing the original"; failed or blocked show the same, never pending forever | Playwright | — |
| L-10 | **PASS** | E2E | "L-10/L-19 Nigeria map" | 36 states + FCT, each selectable | 37 areas with sample codes verified; ZA 9, KE 47, GH 16, SN 14 | `v13-pulse-ng-1440.png` | Simplified boundaries, not authoritative |
| L-11 | **PASS** | E2E + LIVE | "L-11/L-14…"; ZA-FS drill | State filter shows real stories or limited reporting | Live ZA-FS: 1 story with activity line; empty areas show "Limited reporting available"; cities not offered | `pulse-ZA-ZA-FS-1440.png` | — |
| L-12 | **PASS** | PY | `test_geo.py` | Lagos-published Kano story maps to Kano | NG-KN subject; Lagos recorded as publisher only | pytest | — |
| L-13 | **PASS** | PY | `test_geo.py` | Ambiguous names not mapped | Bare "Rivers"/"Imo" unmapped; qualifiers map | pytest | — |
| L-14 | **PASS** | E2E + LIVE | "L-11/L-14…" | Traceable activity; no fake glow | Zero-story areas never animate; activity line separates AI and human counts with a window | Playwright | — |
| L-15 | **PASS** | E2E + LIVE | "L-15/L-16…" | Two separately labelled panels; no bot inflation | "Trending in Nigeria" plus "Trending across Africa"; with no human activity, honest "latest verified" label | `home-NG-en-1440.png` | Real human activity path untested live |
| L-16 | **PASS** | E2E + PY | "L-15/L-16…"; freshness ignore | No stale stories as current; timestamps | Panel times have ISO `datetime`; items older than 7 days ignored at ingest | Playwright; `source_items.decision_reason` | — |
| L-17 | **PASS** | E2E + LIVE | "L-08/L-09/L-17…" | Publisher link and rights kept | "Read the sources" with publisher link; CC BY author, licence and "changes made" | `crossborder-MZ-*.png` | — |
| L-18 | **PARTIAL** | E2E | "L-03/L-18…" | Script rendering for supported locales | Arabic (Noto Sans Arabic, bidi plaintext), French and Pidgin render at 390 px | screenshots | No native QA; Ge'ez/Amharic and other scripts not enabled |
| L-19 | **PASS** | E2E | "L-10/L-19…", "L-19 reduced motion" | Keyboard and screen-reader picker, list form, motion off | Areas focusable with labels; text list; 0 running animations with reduced motion | Playwright | — |
| L-20 | **PASS** | E2E | "L-20 no geolocation…" | No GPS prompt; usable if denied | 0 geolocation calls on 4 pages | Playwright | — |
| L-21 | **PASS** | E2E + PY | T-034/T-035 outage; translation fallback | Independent failures don't break the feed | Editorial or model down: site 200, search degrades honestly. Maps are local SVG (no tile dependency). Failed translation → original | Playwright | — |
| L-22 | **PASS** | E2E | "L-22 performance" | Map and locale don't delay the first article | Home visible ~1.1 s, FCP 0.8 s, CLS 0; pulse ~1.3 s, CLS 0 (throttled mobile) | Playwright log | Emulated network, not a real device |
| L-23 | **PASS** | E2E | "L-08/L-23…" | Editor sees geo evidence, translation flags, coverage gaps, can correct | `/admin/geo` (confirm/reject/move, gaps) and `/admin/translations` (block, correct, rejected output) | `v13-admin-geo-1440.png`, `v13-admin-translations-1440.png` | — |
| L-24 | **PASS** | E2E + VT | "L-05/L-24…" | Preferences survive refresh and login | Persist via cookie and account fields | Playwright | — |
| L-25 | **PASS** | E2E + DOC | "L-25 demo content…" | Placeholders marked fictional, kept out of trends and sitemap | "Demo content" labels; demo excluded from trends and sitemap (T-026) | Playwright | Demo items must be disabled before any public launch (`SHOW_DEMO_CONTENT`) |

## Original regression (T-001 to T-042)

Re-run in v1.3 unless noted. v1.2 evidence is in `TEST-MATRIX.md`.

| ID | Status | Type | Evidence (v1.3) | Notes |
| --- | --- | --- | --- | --- |
| T-001 | PASS (local) / BLOCKED (Oracle) | DOC | `phase0/` | No remote access performed |
| T-002 | PASS | DOC | `DECISION-OPENMOLT.md` | Unchanged |
| T-003 | PASS | PY + DOC | `test_seed…`; `restore-drill-v13-20261009.txt` | Seed now non-destructive (D-03) |
| T-004 | PASS | E2E | public.spec T-004 | — |
| T-005 | PASS | E2E | T-005 + v1.3 screenshots at 320–1440 | 320 px header fixed (D-17) |
| T-006 | PASS | E2E | T-006 | — |
| T-007 | PASS | E2E | T-007 | — |
| T-008 | PASS | E2E + PY | T-008 | — |
| T-009 | PARTIAL | E2E | member.spec T-009 | As in v1.2: no real email delivery (mail sink) |
| T-010 | PASS | E2E | T-010/T-011 | Updated for the threaded UI |
| T-011 | PASS | E2E | T-011 | — |
| T-012 | PARTIAL | E2E | T-012 | As in v1.2 |
| T-013 | PASS | E2E + PY | T-013, A-05 | Revocation now also withdraws published topics |
| T-014 | PASS (rights caveat) | DOC | `sources/*RIGHTS-REVIEW.md` | Global Voices CC BY added |
| T-015 | PASS | PY | fetch tests + `test_dns_rebinding_connection_is_pinned…` | Rebinding window closed (D-15) |
| T-016 | PASS | PY | integration | — |
| T-017 | PASS | PY | classify tests + multilingual, stem and migration tests | — |
| T-018 | PASS | PY | claim tests + `test_name_fidelity…` | Name fidelity added after the live "Ntshau" incident |
| T-019 | PASS | LIVE | `ai_runs` (real Qwen, dev) | Opt-in real-Qwen pytest not re-run in v1.3; live runs used throughout |
| T-020 | PASS | PY + LIVE | injection tests; A-02 | — |
| T-021 | PASS | E2E + PY | T-021/T-022, gate tests | Low-risk now auto-publishes by policy (22 §2); others need an editor |
| T-022 | PASS | E2E | T-021/T-022 | Roles are now threaded replies |
| T-023 | PARTIAL | E2E | time-lens pages | As in v1.2 |
| T-024 | PASS | E2E | T-024 | — |
| T-025 | PASS | E2E | T-025 | — |
| T-026 | PARTIAL | E2E | T-026 | As in v1.2: no `hreflang` (D-09) |
| T-027 | PASS | E2E | T-027/T-028 | — |
| T-028 | PARTIAL | E2E | T-027/T-028 | As in v1.2 |
| T-029 | PASS | E2E | admin.spec | New admin pages: Conversations, Exceptions, Translations, Geography, Trend audit |
| T-030 | PASS (local) / BLOCKED (EspoCRM) | E2E | T-030 | — |
| T-031 | BLOCKED (Revive) / local fallback PASS | DOC | — | — |
| T-032 | PARTIAL | E2E | a11y pages | — |
| T-033 | PASS | E2E | tenant.spec | SSE and replay are tenant-scoped |
| T-034 | PASS | E2E + PY | outage.spec | Stop-script race fixed |
| T-035 | PASS | E2E | outage | — |
| T-036 | PASS | PY | queue idempotency; converse `already_posted` | — |
| T-037 | PASS (local) / BLOCKED (off-host) | DOC | `restore-drill-v13-20261009.txt` (backup `palavva-20261009T212118Z.tar.gz`) | Re-run in v1.3 |
| T-038 | PASS (local) / BLOCKED (Oracle) | DOC | `phase5/` | Not re-run in v1.3 (no network changes) |
| T-039 | PASS (local) | DOC | `phase5/load-test*.txt` | Not re-run in v1.3; SSE adds 1 PocketBase poll per 1.5 s per open stream (unmeasured under load) |
| T-040 | PARTIAL | E2E | a11y.spec (axe light and dark, keyboard, reduced motion) | — |
| T-041 | PASS | DOC | OG route | — |
| T-042 | PARTIAL | DOC | dev-up/down, status, backup | — |

## Totals

| Group | PASS | PARTIAL | BLOCKED |
| --- | --- | --- | --- |
| A-01–A-12 | 12 | 0 | 0 |
| L-01–L-25 | 22 | 3 (L-06, L-07, L-18) | 0 |
| T-001–T-042 | 33 | 8 | 1 (T-031) |

Four of the 33 T-group passes are local-only and also BLOCKED for their remote or external part: T-001, T-030, T-037 and T-038.
