# Palavva v1.3 implementation report (Mac-local)

**Period:** 2026-10-09, 09:30–14:45 PT.

**Commits:** `b850f60` → final (see `git log 6120cfa..HEAD`).

**Policy:**
- `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false`.
- No Oracle, Hetzner, paid API or remote changes.
- The Oracle SSH key was never read.
- A safety backup was taken before schema changes (`backups/palavva-20261009T163013Z.tar.gz`).

## Outcome in one paragraph

Palavva now publishes low-risk, fully evidenced African news topics by itself. Disclosed AI expert roles then debate each topic in a real nested reply tree, replies stream to open browsers within about 2 seconds, and sensitive, unsupported or unlicensed items wait for the founder. Around that, the app now has:
- three independent reader choices: interface language, reading language and home edition;
- honest machine translation for French and Arabic;
- two separate trend panels based on human demand;
- cross-border discovery;
- country-first Local Pulse maps for Nigeria (36 states + FCT), South Africa, Kenya, Ghana and Senegal;
- My Africa follows;
- Command Center QA for conversations, exceptions, translations, geography and trends.

All 79 acceptance scenarios were run: 67 PASS, 11 PARTIAL, 1 BLOCKED, 0 FAIL, with the gaps named in `V1_3-TEST-MATRIX.md`.

## What was built

| Area | Delivered | Key files |
| --- | --- | --- |
| Conversation engine | Risk-tiered auto-publication (validator plus a PocketBase JSVM gate, both fail-closed); nested AI replies with parent linkage; deterministic content policy `conv-rules-v1`; novelty, caps and budgets; human-question re-activation; idle → resting; demo topic | `conversation.py`, `editorial/policy.py`, `pb_hooks/lib/gate.js`, migration `1760100000` |
| Realtime | Ordered `thread_events` (seq) emitted after persist; SSE with Last-Event-ID replay; JSON replay; live thread, "new discussions" banner, Live activity | `api/v1/events/*`, `components/live/*` |
| Locale | 13-locale and 54-country registry; precedence resolution; `pv_prefs` cookie plus account sync; en/fr/ar/pcm UI dictionaries; RTL (logical CSS, Arabic font, bidi plaintext) | `lib/i18n/*`, `PrefsMenu.tsx` |
| Translation | Canonical-source cache keyed by target, locale, source version, model and prompt; fidelity gate (numbers, citations, names); honest states (original, pending, machine, reviewed, unavailable); reader reports; editor approve, block and correct | `translate.py`, `lib/repo/localize.ts`, `TranslationBar.tsx`, `/admin/translations` |
| Geography | geoBoundaries ADM1 → SVG (NG 37, ZA 9, KE 47, GH 16, SN 14); gazetteer with evidence spans, publisher vs. subject roles and ambiguity refusal; editor QA; coverage gaps | `geo.py`, `scripts/build-geo.py`, `PulseMap.tsx`, `/local-pulse`, `/admin/geo` |
| Trending | `trend-v1` with human demand only, snapshots, honest empty states, "Across Africa" panel with origin and Explore links | `lib/repo/trending.ts`, `TrendPanels.tsx`, `/admin/trends` |
| Discovery | `/explore-africa`, `/my-africa` (country, area and topic follows; guest local follows), edition boost in the feed | pages and `GuestFollows.tsx` |
| Sources | Global Voices ×4 (CC BY 3.0, attribution with author and changes); SAnews publisher area; multilingual classification | `register_sources.py`, `taxonomy.py`, `ingest/*` |

## Real-world verification (real Qwen, real feeds)

- **Timed demo:** 4 roles, 2 nested branches to depth 3, browser arrival 1.5–3 s after each commit, desktop and mobile (`V1_3-AI-CONVERSATION-DEMO.md`).
- **Real topics:** 8 SAnews and Global Voices topics auto-published; 18 held with reasons; 12 AI replies rejected before anyone saw them; 31 AI replies live on real topics.
- **Real translations:** Arabic accepted 13, failed 1; French accepted 5, failed 6 (failed ones are never shown).
- **Real map:** Free State and Gauteng lit from published stories, with publisher headquarters excluded.

## Defects found during v1.3 acceptance and fixed

The point of the acceptance run was to find these, so they are listed rather than hidden.

1. **Invented name in an auto-published headline.** "Minister Ntshau": the excerpt was cut mid-name and the model completed it.
   - **Fix:** word-boundary excerpts, a proper-name fidelity check on headline and blocks, and migration and xenophobia terms moved to the sensitive tier.
   - **Remediation:** both affected topics were withdrawn through the Command Center, with a public correction.
2. **Env kill switch ignored.** `AUTO_PUBLISH_DISABLED` in the env was not consulted. Now enforced (D-02).
3. **DNS rebinding.** The window was still open despite a baseline note claiming otherwise. Now pinned to the validated IP (D-15).
4. **Stem keywords never matched.** Entries like `xenophob` failed against "xenophobia". Explicit `*` stems are now supported.
5. **Translation display:**
   - failed and blocked translations showed "pending" forever; they now get the honest fallback;
   - the name gate rejected legitimate French inflection;
   - titled names ("Minister …") went unchecked.
6. **Researcher abstained** on commentary and non-English packets: schema field order caused it, plus a missing commentary rule (researcher-v3).
7. **Language mislabelling.** The Arabic Global Voices feed declares English, so text evidence now beats the hint.
8. **Blank slug** for non-Latin source titles.
9. **UI defects:**
   - RTL pages gained 9,999 px of horizontal scroll from the skip link;
   - the 320 px header overflowed;
   - mobile menus opened off-screen in RTL;
   - bidi punctuation was misplaced;
   - "1 stories" plural.
10. **Test infrastructure:**
    - re-running `up` rotated superuser tokens under a live worker; `up` is now idempotent, and the PocketBase client re-authenticates on 403;
    - the editorial stop script failed on a `set -e` race;
    - the test stack had no worker.
11. **Seed overwrote tenant data on every restart.** Now create-if-missing (D-03).

## Known limitations and open items

- **Real-data PARTIALs:**
  - L-06: no fresh Senegalese French item;
  - L-07: no Nigerian rights-approved source;
  - L-18: no native script QA, and Ge'ez/Amharic not enabled.
- **Language quality:** French, Arabic and Pidgin UI strings are agent-written (beta). French machine translation fails the fidelity gate about half the time; Arabic names are not checked in Arabic script.
- **Model quality:** the 4B model repeats themes across threads ("power reliability"). Quality is acceptable for a demo; a larger model or role-specific angle prompts would improve it.
- **Not built yet:**
  - human views and shares for trending are not instrumented;
  - rate-capped topics are held, not retried;
  - no `hreflang` locale routes;
  - SSE load (one PocketBase poll per stream every 1.5 s) not load-tested;
  - containers not rebuilt for v1.3.
- **Remote work:** Oracle and Hetzner remain BLOCKED pending approval.

## Evidence index

| Document | Contents |
| --- | --- |
| `V1_3-BASELINE.md` | State before v1.3 |
| `V1_3-DECISIONS.md` | D-01 to D-17 |
| `V1_3-AI-CONVERSATION-DEMO.md` | Real-Qwen conversation demo |
| `V1_3-LOCALE-AND-PULSE-DEMO.md` | Locale, translation, trends, maps |
| `V1_3-TEST-MATRIX.md` | 79 scenarios |
| `LOCAL-ACCEPTANCE-v1.3.md` | Founder checklist and decisions |
| `DEPLOYMENT-STATE.md` | What runs where |

Raw evidence:
- `docs/evidence/v13/`: demo run, conversation export, locale demo;
- `docs/evidence/screenshots/v13-*`;
- `docs/evidence/test-runs/20261009T212100Z/`;
- `docs/evidence/restore-drill-v13-20261009.txt`.

---

# v1.3.1 continuation (2026-10-09, 14:55–16:20 PT)

**Scope.** The founder's 8-step follow-up:
- GitHub push;
- keep low-risk auto-publication;
- conversation-engine quality;
- real engagement for trending;
- translation fixes;
- containers and locally solvable partials;
- full regression;
- report and push.

**Same policy:** no Oracle, no Hetzner, no paid APIs, no publication of unreviewed sensitive material.

## Results

| Step | Outcome |
| --- | --- |
| 1. GitHub | `main` pushed to `github.com/amaeteventurestudios/palavva` without force; remote = local verified (`043fe79` before v1.3.1). History scan: no secrets. An empty `jobs.db` was purged before the first push; a harmless 32 KB WAL index residue remains in two pushed commits (removal would need a force-push) (D-18). |
| 2. Auto-publication | Still on for LOW-risk, evidenced topics; both kill switches honoured. Sensitive topics are still held: 16 real topics await review, and 2 were withdrawn with a correction. |
| 3. Engine | Entity/acronym/quote/superlative grounding (`conv-rules-v2`); cross-thread theme and similarity checks; near-duplicate topic hold; `converse-v5`; automatic re-checked retry of rate-capped topics (D-21 to D-23). |
| 4. Engagement | Real reads (after 5 s visible) and shares, deduplicated daily with no stored identifiers; bots, headless browsers, staff and GPC/DNT excluded; feeds `trend-v2`; audit numbers in `/admin/trends` (D-19, D-20). |
| 5. Translation | Repair pass, Arabic Latin-name rule, dictionary-based name test, re-validation of older outputs, automatic re-tries (D-24). French: 17 accepted, **0 failed** (all earlier French failures fixed automatically). Arabic: 12 accepted, 5 held for native review. See `v131/TRANSLATION-REVIEW.md`. |
| 6. Containers and partials | Images rebuilt; container smoke 18/18. A container import crash was found and fixed (D-25). Rollback rehearsed. T-009, T-012, T-026, T-028, T-032 and T-042 moved to PASS; external dependencies recorded separately (`v131/EXTERNAL-DEPENDENCIES.md`). |
| 7. Regression | Canonical run `20261009T231434Z`: typecheck clean, vitest 54/54, pytest 77 (+3 opt-in skipped), Playwright **57/57**. Real-Qwen dev browser regression 6/6: live nested replies, Local Pulse, language switching, trending, Command Center. |
| 8. Report and push | This section; matrix totals now **73 PASS, 5 PARTIAL, 1 BLOCKED, 0 FAIL** of 79. |

## Real-Qwen evidence (dev stack)

**Live demo, 22:39 UTC** (`v131/dev-regression/`). Four expert roles replied, nested to depth 3:
- Engineer → topic;
- Community → topic;
- Economist → Engineer;
- Founder → Economist.

Each reply was seen in the browser 0.5 to 2.8 s after it was committed, with no reload. The replies were on-topic and civil, with fewer stock phrases than before `converse-v5`.

**New rules on live output** since the v1.3.1 restart:
- 6 replies allowed;
- 3 rejected: an unsupported entity ("Committee"), recycled cross-thread themes ("practical constraint", "operating conditions"), and a near-copy within the thread.

**Rate-cap retry.** Two topics held by the cap were back-filled into the new retry path; both were re-checked and auto-published.

**Engagement.** The dev stack had 0 human reads (no real people have browsed it) and refused 2 automated reads. The counting path itself is proven in `v131.spec.ts`: counted, duplicate, share, bot refused, staff refused.

## Defects found and fixed during v1.3.1

1. **Editorial container crashed on import.** `parents[3]` didn't exist inside the image, and translations would have been silently disabled (D-25).
2. **Retention purge skipped tenants whose events were all old** (D-28).
3. **Translation gate false positives** on Title Case and institutional words, sentence-initial names, British spellings, modern words and demonyms. Meanwhile real names went unchecked when preceded by a title (D-24).
4. **Older accepted Arabic translations** had never been name-checked. 10 were withdrawn and re-translated under the current gate.
5. **Model echoing the prompt.** The converse prompt's own list of insight types was being parroted across threads ("practical constraint"), so it was rephrased (`converse-v5`).
6. **Test infrastructure:**
   - compose checks were false negatives (`grep -q` under `pipefail`, and a port probe that saw an unrelated app on host :8090);
   - the rollback drill couldn't build through a `node_modules` symlink, fixed with an APFS clone;
   - the engagement test filtered on beacon bodies Playwright can't see.
7. **My own process error.** I twice started overlapping test runs that reset each other's shared test stack, which produced spurious failures. Those runs are discarded; the canonical run above was executed alone.

## Still open

All of these need something external; details are in `v131/EXTERNAL-DEPENDENCIES.md`.

- **L-06:** a fresh Senegalese French source.
- **L-07:** Nigerian rights-approved sources.
- **L-18 and translation quality:** native reviewers.
- **T-023:** archival data.
- **T-040:** a human screen-reader pass.
- **T-031:** Revive.
- **Remote halves:** real email, sponsors, off-host backup, Oracle/ARM64.

Known engineering limits:
- names that are ordinary words are not name-checked;
- local engagement dedupe is per user agent (no proxy locally);
- the 4B model's replies are better but still generic at times.
