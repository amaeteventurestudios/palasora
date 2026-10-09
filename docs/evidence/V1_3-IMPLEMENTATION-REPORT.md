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
