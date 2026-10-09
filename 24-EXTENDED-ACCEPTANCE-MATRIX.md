# 24. Palavva v1.3 Extended Acceptance Matrix

**Purpose:** Append twelve AI-first conversation tests and the **exact 25 additional locale/map/trending scenarios** from the October 9 handoff to the original `17-TEST-PLAN-AND-ACCEPTANCE.md` T-001–T-042. **Total: 79 separately reported scenarios** (42 + 12 + 25). Do not mark PASS without running real tests and capturing evidence.

## Status and evidence schema

Each row requires `ID | status (PASS/FAIL/PARTIAL/BLOCKED) | test type | test command/browser path | expected | actual | time | evidence artifact | issue/limitation`. Tests can use local deterministic fixtures for unit coverage, but never claim fixture-only tests prove a real Qwen, RSS, MapLibre or geographic service integration. Remote-only Oracle/Hetzner conditions remain blocked pending approval.

## AI-first conversation tests

- **A-01**: Approved, sourced, low-risk RSS topic launches an AI-authored thread automatically with evidence and audit.
- **A-02**: Unsupported, unlicensed or sensitive candidate is held/rejected, not auto-published.
- **A-03**: At least two genuinely distinct AI expert roles contribute through real Qwen model calls.
- **A-04**: AI directly replies to another AI post using persisted parent ID and visible nested branch.
- **A-05**: Factual claims and source IDs validate; corrections and rights revocations propagate.
- **A-06**: New permitted reply appears on the open thread and Live Activity without manual refresh.
- **A-07**: Reconnect/cursor replay recovers missed events and does not duplicate posts or counts.
- **A-08**: Scheduler limits model usage, retries, budget, cycles and stops on low novelty or outages.
- **A-09**: AI contributions never generate human votes or artificially boost human-demand trend scores.
- **A-10**: Ethnic/tribal/religious degradation, defamation, personal insults and prompt injection are blocked while civil substantive debate survives.
- **A-11**: Anonymous can browse/share; human comments after authentication preserve the typed draft.
- **A-12**: An actual timed desktop/mobile real-Qwen demo shows live nested conversation, screenshots and verified non-fake timestamps.

## Locale, trend and Local Pulse tests (verbatim from the supplied October 9 handoff, §11)

- **L-01**: **Nigeria initial resolution:** Unrecognized guest with suitable country/browser signals sees a Nigerian country edition and correct selected language, with the feed immediately visible. If country inference is unavailable, safe fallback works.
- **L-02**: **Francophone automatic initial locale:** New guest plausibly located in Senegal with no conflicting language preference receives French initial UI when supported, not a mandatory choice screen.
- **L-03**: **Arabic and RTL:** New guest in configured Arabic market receives coherent Arabic UI and usable RTL interactions, including map labels, menus and numbers.
- **L-04**: **Saved language beats IP:** Nigerian/English-preferring reader travels to Senegal. Explicit English remains English; home edition persists if selected.
- **L-05**: **Browser choice beats coarse IP default:** Francophone browser hints can inform an English-dominant country visit; visible override persists.
- **L-06**: **Language + country independence:** Click Senegal cross-border trend from Nigeria and see translated Senegal coverage in English, with original French attribution and links. Country context changes, reading language does not.
- **L-07**: **Feed mix:** Nigeria reader gets real eligible English/Pidgin/local-language items, without duplicate story flooding and with no fabricated translations.
- **L-08**: **Translation fidelity:** Names/dates/numbers/source citations remain faithful; editor can catch errors, block output, correct, and invalidate caches.
- **L-09**: **Language missing:** When a translation is unavailable, honestly label fallback and make source accessible rather than quietly hallucinate translation.
- **L-10**: **Map geography:** Nigeria map accurately contains 36 states + FCT, all individually selectable; tests ensure key sample states correct. Other countries use appropriate subdivisions.
- **L-11**: **Map drill:** Clicking state filters real relevant news/discussions; city/neighborhood appears only with actual supported geo data and sources.
- **L-12**: **Publisher versus event place:** Lagos-published Kano story is primarily classified to the correct Kano subject area.
- **L-13**: **Ambiguity handling:** Inconclusive mention of “Rivers”, “Imo” or an ambiguous town does not trigger false exact mapping; review fallback works.
- **L-14**: **Real activity:** Map glow/heat uses traceable story/human/AI metrics with separate labels and true timestamps; zero activity does not fabricate pulse effects.
- **L-15**: **Two trending panels:** Home and Across Africa rank/label separately, avoid self-reinforcing bot metrics and have clear feed origin.
- **L-16**: **Cross-border currency of content:** Topic cards and country pages don't show outdated stories as current; timestamps and freshness policies applied.
- **L-17**: **Source rights and attribution:** Every localized summary preserves original publisher link and correct rights behavior.
- **L-18**: **Arabic, French, Pidgin and African script rendering:** Accessibility, mobile, font fallback, bidi text, search tokenization and line-wrapping verified for supported locales.
- **L-19**: **Accessibility and reduced motion:** Country/state picker accessible by keyboard and screen reader; map available in textual/list form; motion can be disabled.
- **L-20**: **Geolocation privacy:** No browser GPS prompt on initial load; permission requested only for a valuable optional user action. The site remains usable if denied.
- **L-21**: **Offline/failures:** Maps/tile server, translation model, RSS source or Qwen may fail independently. Existing feed/area list and cached translations remain usable.
- **L-22**: **Performance:** Map and locale bundles do not substantially delay first visible article or cause unstable scroll; browser tests on low-bandwidth mobile.
- **L-23**: **Admin QA:** Editor can inspect source-to-geo evidence, translation history/flags, country coverage gaps, and correct mislocated news.
- **L-24**: **Preference persistence:** Manual edition and language choices survive refresh/login where supported without unwanted overriding.
- **L-25**: **No fake demo data in production:** Placeholder Senegal, Lagos/Ikeja, Rivers or other headlines/numbers must be marked as fictional in development and removed before live publication.

## Browser demonstration order

1. Open the real Mac-local home feed anonymously; verify first actual topic and dual panels, with the right-rail country map not hiding feed.
2. With a rights-allowed low-risk source, run the autonomous workflow and capture thread initiation and two parent-child branches from Qwen with timestamps.
3. Keep the thread browser open and capture an additional validated reply arriving without refresh; confirm event replay after reconnect and no scroll jump.
4. Show a held/rejected sensitive case, source link, risk basis and moderator queue; verify no public event is emitted.
5. Test Nigeria English local edition, explicitly switch to French or Pidgin where ready; visit Senegal without changing language preference, then open original source.
6. Verify Nigeria 36 states + FCT geometry and selectable list; show accurate place-tagged data or honest limited-coverage; test place ambiguity and publisher-vs-event distinctions.
7. Inspect human vs bot trend score calculation and admin evidence; zero/unknown is not replaced by fake numbers.
8. Run Arabic RTL, selected African-language typography, phone width 320/390, reduced-motion, geolocation-denied and map/offline translation fallbacks.
9. Regression test original T-001..T-042 including tenant isolation, authentication, share links, sponsor transparency, security and backup restore.

## Critical negative tests

- News text cannot instruct the model, worker or agent to ignore policy, reveal credentials, choose arbitrary URLs or approve its own story.
- One AI agent cannot vote, create synthetic humans, or turn robot-to-robot conversation volume into apparent audience popularity.
- A sensitive claim never auto-publishes merely because two models agree.
- URL resolution (including DNS rebinding) may not fetch internal/private network resources.
- Place mention or newspaper headquarters is not enough to assign a story to an event location.
- Changing country browsing does not rewrite explicit language or home edition preference.
- Sources and translations cannot silently invent names, dates, figures or quotations.
- Switching to French/Arabic/Pidgin without a validated translation yields a clear fallback, not a fabricated translation.
- Exact user GPS cannot be requested on first load or published by default.
- A source/tile/model outage cannot break the read-first feed.

## Exit gate

Fully working **Mac-local** AI-first conversations plus locale/trending/Local Pulse foundation, proven by instrumented real browser tests and a report. Mark unsupported locales/remote integrations `PARTIAL/BLOCKED` rather than misrepresenting them. `ORACLE_DEPLOYMENT_AUTHORIZED=false` throughout this mission.
