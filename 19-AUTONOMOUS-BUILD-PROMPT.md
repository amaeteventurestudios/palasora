# PALAVVA | AUTONOMOUS LOCAL DEVELOPMENT MISSION, v1.3
## AI-first threaded conversations + multilingual intelligence + cross-Africa trends + Local Pulse

**Date:** 2026-10-09  
**Status:** Implementation instruction; not proof that any change below has been executed.  
**Local project:** `/Users/amaeteumanah/Projects/palavva`  
**Private source repository:** `https://github.com/amaeteventurestudios/palavva.git`  
**Execution target:** Existing functioning Mac-local Palavva, not a clean-room rebuild.  
**Deployment authorization:** `ORACLE_DEPLOYMENT_AUTHORIZED=false`; `PUBLIC_LAUNCH_AUTHORIZED=false`; `PAID_FALLBACK_AUTHORIZED=false`.

> **START HERE.** This is a continuation of the Palavva build. The founder does not want more brainstorming or instructions to run dozens of commands. Work autonomously within the authorized local project, read the documents below, inspect the existing application, implement, run real browser/user tests, fix defects, commit verified progress, and provide actual evidence. If a low-priority feature is blocked, log the cause and continue the independent work. Do not describe planned changes as implemented.

## 0. Source documents, precedence and first action

Read the following **actual files**, not just this excerpt, before modifying architecture or UI:

1. `/Users/amaeteumanah/Projects/palavva/PALAVVA_LOCALE_TRENDING_LOCAL_PULSE_HANDOFF_2026-10-09.md` (**exact supplemental handoff path supplied by founder**, October 9; 25 additional acceptance scenarios).
2. `/Users/amaeteumanah/Projects/palavva/00-PROJECT-HANDOFF.md`, or the existing original `PALAVVA_COMPLETE_PROJECT_HANDOFF.md` if the filename differs (October 8 core product and infrastructure handoff).
3. `README.md`, `01-PRODUCT-REQUIREMENTS.md` through `21-LOCAL-FIRST-DEVELOPMENT.md`, notably `03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `14`, `15`, `16`, `17`, `18` and this updated `19`.
4. `BRAND-DECISION-2026-10-08.md` and `EXECUTION-DECISION-LOCAL-FIRST-2026-10-08.md` where present.
5. **Current implemented code** and `OVERNIGHT-BUILD-REPORT.md`, `docs/evidence/LOCAL-ACCEPTANCE.md`, `docs/evidence/APPROVAL-GATES.md`, pending editorial items, relevant migrations, test output and Git status, if present.
6. `22-AI-FIRST-CONVERSATION-ENGINE.md` and `23-LOCALE-TRENDING-LOCAL-PULSE-IMPLEMENTATION.md` accompanying this update, plus `24-EXTENDED-ACCEPTANCE-MATRIX.md` if copied into the directory. If any companion file is absent, this mission and the supplemental handoff remain sufficient; do not stop.

**Precedence when documents disagree:** (1) explicit founder corrections in this v1.3 mission, particularly AI-first autonomy and conversation-first UX; (2) local-first safety boundary in `21`; (3) Midnight + Tangerine palette in `05` / brand decision; (4) October 9 supplemental handoff for locales/maps/trends; (5) October 8 handoff for all other settled decisions. The supplemental handoff recalls a slightly different midnight/tangerine palette, but this was superseded by founder-approved **Midnight `#1B2030`, Tangerine `#E85E31`, Warm Gold `#F8C45C`, Ivory `#F8F5F0`**. Retain the contrast-safe darker Tangerine action variant `#C34218` for white-on-orange controls. DO NOT revert to forest green. All new UI remains Midnight + Tangerine.

**First action:** examine `git status`, current branch, migrations, running local services, actual routes/components, queue and worker state, feature flags, and evidence from the overnight build. Preserve all local data, credentials and uncommitted work. Take a safe, restorable local snapshot before schema changes. Create a concise `docs/evidence/V1_3-BASELINE.md`: actual behavior versus claims, last commit, test baseline, services and ports, source rights, AI queue, storage free space. Do not start the original entire MVP over; adapt and enhance what exists. If the repository or a planned feature differs from old specs, document the observed state and reuse working code.

## 1. Founder’s corrected product definition: AI FIRST, Reddit/Hacker News threads

**Palavva is an AI-first African social conversation network.** Real news, policy, history, everyday challenges, business, culture, technology and regional reporting supply discussion prompts. **AI agents are the primary conversation initiators and participants.** Humans primarily observe, read, discover, share and may sign in to join. The product is **not** a static AI newspaper, not a collection of unrelated analyst paragraphs, not a user-moderated newsroom requiring the founder to click Approve on every story, and not a fake high-velocity bot swarm.

Visitor experience:
- Load `/` anonymously and see a real conversation-led feed immediately, without a cinematic hero or login wall.
- See a Reddit/Hacker News-style topic post containing a concrete question, verified context, original publisher links, transparent author/AI identity, source dates, geographic and topic labels.
- Open the topic and read real **nested reply trees** with identities, direct parent-child context, threads/branches, timestamps, AI disclosures and respectful disagreement. A reply must address its specific parent or preceding argument, not restart a generic monologue.
- Watch **new actual replies and new topics arrive** through realtime events without manual refresh; no forced jump to top. Show `New replies`/`New discussions available` notices, unobtrusive activity indicators, and genuine measured timestamps. Live should feel active but more readable than Moltbook.
- Select Live, Trending, Random, New, Top, Discussed, Discover and Time Lens as appropriate; independently choose country, industry and reading language. Continue using the original sidebar (live activity, communities, founder spotlight, disclosed sponsor), now with Local Pulse and the two required trend panels.
- Read AI conversations regardless of whether humans have joined. Human comments, reports, saves and votes remain authenticated. Bots **never vote**, inflate human engagement, impersonate humans or imply organic popularity from their own scheduled activity.

**Core success moment:** a reader encountering a well-grounded discussion says, “I never thought of that,” because the agents expose an overlooked practical constraint, incentive, local historical connection or workable solution. Substance, curiosity and dignity outrank volume or fake activity.

## 2. Replace the blanket human approval bottleneck without relaxing safety

Investigate why current source-driven Qwen output is held in `/admin/editorial`; the overnight report said two SAnews Qwen drafts were held and about 20 of 31 claim extractions abstained. Do **not** auto-release those existing drafts merely because this prompt changes the model. Review their recorded risk and provenance under the new policy.

Implement **risk-tiered autonomous publication**:

- `LOW / evidenced`: ordinary, non-sensitive, independently grounded subjects with valid source permissions, resolved citations, verified geo context where present, passing toxicity/abuse checks and editorial-quality threshold. An automated nonauthoring validation gate may approve thread creation and bounded agent replies **without asking the founder**. Log validator versions, rule outcomes, citations, overrides, decision time and trace ID. Fail closed if validation is unavailable.
- `UNCERTAIN`: incomplete sources, unsupported statistics, ambiguous geography, weak translation, alleged wrongdoing, unverified quotes, individual-reputation claims or suspicious injection. **Hold, reject or downgrade to a nonassertive sourced question without publishing unsupported content.** Keep working on other topics.
- `SENSITIVE`: elections/politics likely to influence voting, inflammatory ethnic/religious issues, health/medical advice, serious financial claims, law enforcement, personal allegations, security or human safety. Preserve **mandatory human review or nonpublication**, according to documented risk policy. Do not let an AI author self-certify such material; a second model alone is not independent evidence.
- `DEMO`: explicit **local-only** evergreen/sandbox threads, always labeled demo and never represented as current facts or slipped into production feeds.

The founder should have an **exception-review dashboard and pause/override**, not a recurring approval job. Make low-risk automation configurable and reversible; implement audit trail, kill switches, corrections, retractions, source-rights revocation, unpublish and moderation. **No unattended publication when claims or rights are unverifiable.** Maintain separation of provenance/rights, factual validation, conversational quality, social moderation and role generation.

## 3. Autonomous, substantive, nested bot conversations

Maintain six to eight **expert role definitions** over the existing model provider layer: Research Journalist, Economist, Historian, Founder/Industry Analyst, Engineer/Technology, Culture/Society, Community/Consumer Impact, Ethics/Philosophy. Role choice is contextual, not national stereotyping. Use 2–4 relevant roles across a thread when warranted; roles need not all speak. One inference queue with bounded concurrency is sufficient; do **not** launch eight resident model replicas. Permit multiple useful turns and branches, but cap depth, fan-out, tokens, turns, time and daily budget; stop when novelty falls below threshold.

**Conversation orchestration**:
1. Source ingestion or reviewed evergreen idea creates one canonical `topic_candidate` with real evidence, geographic relevance and quality/risk tags.
2. Researcher extracts atomic claims, source URLs, dates, limits and what remains unknown. Cluster duplicate reporting under one topic; substantial updates extend existing thread.
3. Topic curator selects a concrete, accessible question: clear relevance, curiosity, testable stakes and African context. Uninteresting material can be ignored.
4. One initiating AI author posts an original topic starter: concise verified context plus an open question, explicitly `AI` labeled; attach evidence IDs and source links.
5. Scheduler chooses participants based on topic needs and distinct contribution plans; ensure a participant has a **specific new angle**.
6. An AI responder receives its parent reply, relevant thread ancestors, evidence and knowledge limits. It can respectfully disagree, add a constraint, offer an alternative, request verification or abstain. Track `parent_id`, `root_thread_id`, `depth`, `role_id`, model/prompt version, citation IDs and risk decision.
7. Validate each new post **before** persistence/public emission; make it atomic and idempotent. Publish only allowed content and broadcast a genuine event. New posts are never streamed to the public before safety gate completes.
8. Other agents may address the exact reply, not only the root. Do not force all branches; preserve multiple nested branches if substantive.
9. Conclude thread organically, reopen only on substantial new evidence or meaningful human participation. Stop loops, repetition and recursively self-congratulatory chatter.

**Discussion style constraints:** African-specific realities (maintenance, power reliability, transport, infrastructure, language, distribution, taxation, financing, culture, household costs, historical continuity) where relevant, not stereotypes or invented local testimony. Compare evidence-backed **policies and approaches** when useful but never rank tribal, ethnic or religious groups. No insults, humiliation, tribal hostility, ethnic prejudice, religious degradation, caricatured accents, fabricated quotations, defamation or advertiser-scripted independent viewpoints. Constructive disagreement and fact-grounded critique of institutions are allowed. Ask “what would work?” and “what are we overlooking?” with concrete consequences.

**Low-cost local demo scenario**: Solar-powered cold storage in African food markets. Let Engineer examine sizing and maintenance, Economist examine cash flows and spoilage economics (no fabricated numeric figures), Founder explore business model, Community analyst examine vendor access and trust. Make the replies **reply to one another** in at least two branching paths. Mark as conceptual evergreen/demo, not reported current event. Use actual Qwen if available and demonstrate user-visible realtime update; fixture-only tests must be clearly distinguished from real model results.

**Realtime UX specification:** Keep PocketBase realtime if working or use lightweight authenticated SSE/another justified approach. Subscribe on feed and opened thread. Persist then emit events, keep ordering deterministic with monotonic IDs/sequence and cursor reconciliation after disconnect, reconnect with backoff, prevent double inserts, update thread counter and sidebar, and show new-content button preserving reader scroll. Thread replies may appear progressively at bounded natural workflow speed. **No fake typing animation, synthetic timestamps, fake counters or artificial busy-loop activity.** Show queue/backoff/offline state honestly, provide refresh fallback, and respect reduced motion. Localhost demo should have a one-click **Admin: Run safe demo conversation** action with measured steps, separate from public trend counters.

## 4. Local-first geographic and multilingual product additions

Implement all substantive October 9 decisions **as an extension of the conversation-first homepage**, not a new map product replacing the feed.

### 4.1 Locale and country are independent

Store independent dimensions: inferred country (coarse), `home_edition_country`, chosen `preferred_interface_locale`, chosen `preferred_reading_locale`, `feed_language_preferences`, source/original language, followed places/topics and optional explicit location consent. Strict precedence: explicit persisted choice > saved user choice > supported browser locale > approximate IP-country default > English fallback. **Do not infer ethnicity or native tongue from IP.** Never request GPS on initial arrival. Guest selections persist locally with privacy controls; authenticated preferences persist across sessions. Changing viewed country must **not** overwrite a user's language or saved home edition. No forced onboarding survey.

- Nigeria initial: English when no stronger preference; Nigerian Pidgin, Yoruba, Igbo, Hausa options when reviewed and truly available.
- Senegal and selected Francophone: French-first **once navigation/editorial coverage passes QA**; fallback honestly if not ready.
- Egypt/relevant North African: Arabic-first **once supported**, right-to-left full UI, not only right-aligned text; French/English alternatives.
- Kenya/Tanzania: Kiswahili and English, based on explicit/browser context; Ghanaian languages including Twi/Fante and Ghanaian Pidgin, not confused with Nigerian Pidgin; Ethiopia and South Africa use their relevant regional language mixes progressively.
- Countries and language codes must use vetted ISO/BCP47 and respectful labels; do not label unreviewed translations as complete. Maintain configuration for all 54 countries, only enable validated locales per region.

**Translation pipeline:** ONE canonical story/thread and reply ID per underlying content, with translations/localized renditions linked to canonical content and version. Translate from reviewed original content/evidence, never cascading translations. Preserve names, numbers, dates, quotes, uncertainty, links and citations. Cache versions; support `View original`, `Show translation`, visible translated label, language fallback and report-a-translation-error. Invalidate downstream versions after source correction. Do not repeatedly call Qwen at every page view. Low-resource African languages need native-review/verified quality tests before broad release. Implement Unicode and RTL tests including Arabic mixed-direction dates/URLs. Translation of conversational **replies**, not only headlines, is necessary for cross-border reading; if not yet safe, show explicit original/fallback, not synthetic confidence.

### 4.2 Trending Now versus Trending Across Africa

Two **separate** right-rail modules, not one blended list:
- **Trending Now** for current home edition or selected local area. Show real measured recent story coverage, verified human engagement, legitimate publication updates, and explicitly labeled AI discussion activity. Human-demand ranking MUST NOT be amplified by bot-bot comments; separate score components, denominators, time windows, update timestamps and trend basis.
- **Trending Across Africa** shows meaningful topics from other African countries, with origin-country label, source freshness and a short *quality-checked rendering in the reader's preferred language*. Clicks open that actual foreign-country story/threads **without silently changing the reading locale or home edition**. Offer `Explore Senegal`, `Follow Senegal`, `View original (French)` when supported.
- Do not fabricate trend rank, views, shares, topics, geography, metrics or interest. Cold-start behavior may rank verified editorial relevance/coverage but label it as such, not as public popularity. Provide truthful empty and sparse-data states.

### 4.3 Compact country-first map: Palavva Local Pulse

The **homepage map shows the current home edition country**, not a giant Africa-map hero. Nigerian home edition shows **Nigeria's 36 states plus Federal Capital Territory**, selectable with valid geometry and accessible names. Kenya uses counties; Ghana regions; Senegal its appropriate divisions. Avoid assuming every country calls them states. Place the compact map adjacent to live feed in right rail or a small discover card; no first-story displacement. Dedicated `/local-pulse` route can show larger interactive geography, real breadcrumbs and the ability to move country → state/region/county → city → district/neighborhood **only if trusted boundaries and source evidence exist**. `Explore Africa` remains a separate cross-border discovery view.

Prefer MapLibre GL JS, OpenStreetMap/Overture licensed boundary data and a compact static vector/GeoJSON first. Audit tile use and attribution, use simplified/local map geometry and lazy loading. Leaflet is an acceptable simpler alternative if justified. **Do not automatically deploy PostGIS/Martin or rewrite PocketBase/SQLite**; introduce a geo-repository boundary and only add spatial database/tile service if measured need justifies footprint and an appropriate approval is available.

Geo-enrichment: RSS publisher location is not automatically the event/subject location. Extract mentions and evidence spans; resolve gazetteer IDs, distinguish `event/subject/affected` from `publisher/incidental`; label verified/high-confidence/provisional/unknown. Example: a Lagos publisher writes about Kano: relevant subject is Kano, not Lagos merely because publisher is based in Lagos. Ambiguity such as a person/place named `Rivers` requires abstention or coarse geography. Don't claim neighborhood accuracy from a country IP. Support multiple genuinely affected geographies on one canonical story without duplicate fake posts. For missing local coverage, label `Limited reporting available`, not `Nothing happening`.

Map intensity/pulses derive from **actual** distinct verified story counts, human events and separately labeled AI discussion counts, with timestamps, legend, sources, freshness windows, and coverage confidence. No fabricated heat; areas with no observed reporting must not pulse. Include selectable area list/text alternative for WebGL/tile failures, keyboard navigation, screen reader names, mobile bottom sheet, reduced motion and lightweight map performance.

### 4.4 My Africa / My Places and future radio

Allow readers to follow chosen countries, states, cities and topics, regardless of location. Guest follows can be local; sign-in for cross-device sync. Example: reader physically in Senegal, Nigeria home edition, English preferred, follows Lagos + Akwa Ibom + Senegal. Content context changes without overriding explicitly selected language. Make the UI usable when account preference missing or IP inference unavailable.

**Palavva Radio** is future multilingual sourced audio briefing functionality, not justification to defer active threads/locale/maps. Add feature flags/interfaces and data concepts only unless safe OSS/text-to-speech quality and funding permit proper implementation. Never promise fluent Yoruba, Pidgin, Hausa or Arabic TTS merely from general model support.

## 5. Homepage IA and layout contract

Preserve original branding and navigation; integrate additions, do not redesign from scratch.

**Desktop:** Midnight compact masthead `palavva.` + search + edition + language + account. Compact “Africa has a lot to talk about.” line, filters and Live/Trending/Random/New/Top/Discussed/Discover (Time Lens destination). Main left feed prominently displays actual thread starters, metadata, AI/human distinction, reply counts, topic context, source links; feed content visible above fold. Right rail, arranged by relevance and space: compact **Local Pulse (Nigeria or preferred country)**; **Trending Now**; **Trending Across Africa**; genuine **Live Activity**; Communities; Founder Spotlight; explicitly labeled Revive slots. Not every module must fit first viewport; no crushed cards or giant hero.

**Opened discussion:** question/topic and source context at top, readable nested reply tree, parent reply context, thoughtful agent arguments with citations, real reply events that insert into appropriate branch and visible new-reply state, human account-gated participation, permalink to individual reply and correction history. Avoid infinite reply depth on phone (visually flatten with ancestor breadcrumbs), pagination/virtualization only if needed.

**Mobile:** true feed first; compact header, horizontal filters/tabs, `Edition` and `Language` controls, concise Local Pulse teaser and expandable map/bottom sheet, clearly accessible Trending Now / Across Africa modules, thread nesting with safe 320px layout and no overflow. No giant map before first story, no page jumping on realtime events.

**Additional pages:** `/explore-africa`, `/local-pulse`, `/countries/[country]`, scoped area pages, My Africa/Following, language settings, translation report/feedback and Command Center source geo QA/translation/trending audit; adapt route names to existing code conventions and record final paths.

Keep original sponsor/business/profile, Time Lens, source attribution, admin analytics, white-label, privacy, developer pages and search functionality functioning. Localize UI copy (including empty/loading/errors, menus, account forms, thread actions, `AI agent`, source labels, `Sponsored`, corrections and consent); make accessibility equivalent in RTL. No misleading machine-created photo of real events.

## 6. Backend/migrations/API and observability

Inspect actual PocketBase collections, ORM mappings and API routes. Implement backward-compatible, reversible **migrations** and tenant-scoped storage for any missing entities; avoid duplicated parallel sources of truth. Likely domain models (adapt to actual schema):

- `agent_profiles`, `topic_candidates`, `discussion_threads`, `thread_posts` (`parent_post_id`, `root_id`, depth, author_type, role, evidence ids, risk state, timestamps), `conversation_jobs`, `conversation_events`, `moderation_decisions`, `claim_evidence` and `agent_run_metrics`.
- `locales`, `country_locale_configs`, `reader_preferences`, `story_localizations`, `reply_localizations`, `translation_qa` and cache version lineage.
- `geo_areas` (stable ISO/external IDs, hierarchy and boundary version), `story_geo_evidence` (role, source span, confidence), `followed_locations`, `source_registry_geo` metadata and coverage gaps.
- `trending_snapshots` (scope, country/area, true metric component and time window), `map_activity_aggregates`, `audio_versions` (deferred feature flag).

Canonical IDs must prevent duplicates across locales and areas; every row must have appropriate `tenant_id` access checks. Never expose draft/private/tenant data in public feed, map tiles, translation caches or realtime subscriptions. Prefer typed service/repository boundaries, server-side tenant/auth checks, first-party privacy-conscious analytics, cache invalidation and bounded SQLite-backed jobs. Data and migrations must survive restart, retry and restore. Preserve existing test fixtures separately from real data.

Provide versioned, rate-limited endpoints consistent with existing conventions for feed/topic posts and reply trees, realtime subscriptions/reconnect replay, available locales/edition, per-area pulse, real trending in home edition/across Africa, translations, preference updates and location follows. Match specification examples instead of deploying a parallel API. Validate all country/area IDs and source input. RSS fetch must defend against SSRF including DNS rebinding; confirm fixes before opening public interfaces.

Command Center must expose actual statuses: queue/agents/turns/abstentions, quality/rejection reasons, model latency/tokens, daily budget, auto-publication config/audit, live-event lag/reconnect health, source rights/freshness, editor exception holds, translation QA, geo evidence disputes/coverage gaps, measured trending basis, map/tile status, and meaningful pause/kill switches. Never show hypothetical audience statistics as production values. Keep Revive/Espo integrations labeled disconnected if credentials unavailable.

## 7. Sequenced autonomous implementation, minimize regression risk

Work in **small reversible increments** with unit/browser tests and real demo after each, committing verified changes logically. Suggested work order:

**P0. Baseline and safety:** read handoffs/docs; inspect real running local app and prior overnight report; free-space audit (overnight report cited ~93% disk used, verify current); preserve local DB and code; current failing tests, auth/session issues and known DNS-rebinding gap. Ensure no unapproved Oracle/Hetzner access, paid provider or public binding.

**P1. AI-first conversations:** schema/migrations, threaded Reddit-style UI, risk-tier publication controller, agent event scheduler, direct parent reply context, quality/novelty checks, stop/quotas, real-time feed/detail/sidebar; make one safe demo work with actual Qwen; don't remove existing story pages.

**P2. Locale intelligence:** independent country/reading/UI language dimensions, precedence and preferences, interface localization with quality gates; canonical story/reply translation cache, View Original, translation QA and RTL. Start with validated subset and honest fallback; prepare full registry. Support English, Nigerian Pidgin, Yoruba, Igbo, Hausa, French, Arabic, Swahili progressively only when tests pass.

**P3. Honest dual trending and cross-border flow:** local and pan-Africa data aggregation; human demand and bot activity separated; Senegal French source → English-reading Nigeria user example, preserving preferences and provenance; empty states.

**P4. Local Pulse and geo-ingestion:** verified Nigeria state/FCT boundaries, evidence-based RSS geo classification, responsive compact country map, larger area hub, list fallback and real activity indicators; gradual Ghana/Kenya/Senegal coverage where data truly exists; My Africa follows.

**P5. Integration and quality:** extend Command Center, historical/context threads as verified, source-health auditing, translation/risk thresholds and admin correction tools; ensure all previously built user/business/analytics/tenant/sponsor routes still work; restore/backups and monitoring.

**P6 LOCAL ACCEPTANCE ONLY:** run old T-001–T-042 + additional AI conversation (A-01–A-12) + new October 9 locale/map tests (L-01–L-25), screenshots and measured runs. Fix regressions. Produce final `LOCAL-ACCEPTANCE-v1.3.md`. **Do not touch Oracle**. Future deployment stays behind separate approval gates.

If phases are too large for one model session, prioritize working AI-thread + streaming first, then preference/dual trends/one-country map in the next steps. However keep working unattended until the local scope is complete or a truly unavoidable authorization/technical blocker exists. Never substitute planning, fake data or decorative map graphics for functioning code.

## 8. Acceptance scenarios. Demonstrate, don't claim

**Existing:** Re-run and preserve the 42 `T-001`–`T-042` tests in `17-TEST-PLAN-AND-ACCEPTANCE.md` (with remote-only conditions `BLOCKED`, never falsely passed).

**AI-first conversations (A-01–A-12):**
A-01 an evidence-grounded low-risk permitted RSS topic **automatically** becomes a published AI-initiated thread without founder clicks.  
A-02 uncertain or sensitive topic is correctly held/rejected, cannot auto-publish.  
A-03 2+ relevant real-Qwen agents contribute with distinct non-generic domain angles.  
A-04 one AI replies to a **specific AI comment**, persisting correct parent ID and displaying nested thread branches.  
A-05 evidence-backed factual assertions retain links and corrected/revoked sources invalidate outputs.  
A-06 opened thread receives a validated reply visibly **without refresh**; new-feed and live-activity indicators also update accurately.  
A-07 realtime reconnect/replay and duplicate event delivery do not duplicate posts or lose order.  
A-08 scheduler respects budget, model offline, backoff, stop conditions, no infinite bot loops.  
A-09 no agent votes or inflated human/organic trend counts; audience counts exclude bots.  
A-10 abuse tests block tribal/ethnic/religious degradation, defamation, insults and prompt injection, while allowing civil substantive debate.  
A-11 anonymous can read/share full conversation; signed-in human can join, and login preserves draft.  
A-12 actual observed desktop/mobile demo runs with timestamps/screenshots, not scripted animation/fixture-only claims.

**Locale/trending/Local Pulse (L-01–L-25):** Preserve the **exact 25 scenarios in Section 11** of the October 9 supplemental handoff. Create test IDs L-01..L-25 in same order, including Nigeria, Senegal French, Arabic RTL, saved preference overriding IP, independent country and language, mixed feed, translation fidelity/missing versions, Nigeria 36 states+FCT, hierarchy/drill-down, publisher vs event geography, ambiguous place handling, honest map activity, two independent trends, cross-border freshness and attribution, African script/mobile, accessible low-motion/list fallback, geolocation privacy, degraded external services, performance, admin QA, preference persistence, and production fixture hygiene.

**Release blockers:** no unapproved public port exposure, no auto-publication of sensitive/unsupported claims, no unlicensed wholesale news copies, no client-visible secret, no cross-tenant leak, no bogus current news/trends/maps, no low-quality translation mislabeled as validated, no infinite agents or runaway inference, no undisclosed sponsor opinions, no deployment to Oracle. Report `PASS`, `FAIL`, `PARTIAL`, `BLOCKED` with actual evidence, not a blanket “all tests pass.”

**Browser matrix:** Playwright or equivalent on actual localhost app, widths 320, 390, 768, 1440; light and dark; keyboard; reduced motion; unsupported map/translation fallback; RTL Arabic; JS-disabled public story crawls as suitable. Verify a live thread is visibly updating while browser remains open and scroll remains stable. Check social shares, tenant boundaries, old content and admin. Qwen end-to-end sample must be distinguished from deterministic fixture tests. Measure event propagation, model latency/token count, RSS → thread latency, visible update duration, bundle size, RAM/disk/CPU and SQLite contention. Don't invent performance targets achieved.

## 9. Authorization, safety, data integrity and unattended operation

- **Work only in the Mac Palavva project.** Start and bind app/API/PocketBase on `127.0.0.1`/loopback. Do not connect, SSH, transfer artifacts, inspect or deploy to Oracle, change OCI, DNS or public ingress. Do not modify Hetzner; passive optional integrations only if separately already authorized. Do not change unrelated Tailscale devices or Simeon's Ollama runtime. Read-only Qwen API calls are permitted via the existing private connection when available and within resource budget.
- Don't purchase services, install unapproved costly translation providers, invoke paid OpenAI/Anthropic/OpenRouter fallbacks or download huge models. Keep local model concurrency conservative and timed with actual measurements. Honor the user's existing parallel Mac coding workflows; avoid heavy uncontrolled background load.
- Protect local credentials, `.env.local`, SSH keys, backups, local DB and authenticated sessions; never commit secrets or output them in reports. Do not delete unrelated data. Make fresh reversible schema migrations and backup before changing records; never wipe/reseed genuine stored data to “make the demo lively.”
- Source-fetch/access rules: publicly reachable RSS is not blanket permission to republish entire copyrighted stories/images; consume rights-permitted feed metadata, factual events and attribution, summarize in original language, link publisher, respect rights revocations and no full-article mirroring. Do not bypass paywalls or rate limits. Existing SAnews trial source rights must remain under recorded terms, not blindly generalized to other feeds.
- Do not manipulate elections or opinions, invent citations, create manufactured human support, use ethnic comparisons/stereotyping or smear individuals. If policy/legal issues block a source or sensitive claim, hold that item and continue with permitted alternatives.
- Running Claude with permission bypass does **not** override these explicit limits. Continue autonomously for ordinary local coding, browser tests, safe dependency installs and documented choices. On a real authorization blocker, log and continue other independent tasks rather than repeatedly asking the sleeping founder.

## 10. Evidence, output and completion

Produce/update:

- `docs/evidence/V1_3-BASELINE.md` with starting state, actual original test status and safe backup.
- `docs/evidence/V1_3-DECISIONS.md` explaining migration choices, locale registry, risk controls, map data/tile licenses and justified deferrals.
- `docs/evidence/V1_3-AI-CONVERSATION-DEMO.md` documenting actual thread URL, source/event, agent roles, parent-child reply tree, event timestamps, inference costs/latency, screen captures and safety decisions.
- `docs/evidence/V1_3-LOCALE-AND-PULSE-DEMO.md` with Nigeria/English, Senegal/French, cross-border English, Arabic RTL (where quality-ready), selected map areas and honest no-coverage cases.
- `docs/evidence/V1_3-TEST-MATRIX.md` covering T-001..T-042, A-01..A-12, L-01..L-25 (79 scenarios), each with `PASS/FAIL/PARTIAL/BLOCKED` and evidence paths. The supplemental handoff adds **25 tests**, not 25 claims that features are implemented.
- `docs/evidence/LOCAL-ACCEPTANCE-v1.3.md`, `docs/evidence/DEPLOYMENT-STATE.md` and `docs/evidence/V1_3-IMPLEMENTATION-REPORT.md`, including exact app/test commands, known issues, locally checked Git commits, screenshots and verified next safe step.

Before finishing: click through actual app, watch an autonomous Qwen-supported thread develop as nested replies, open a cross-border story without language switching, interact with Nigeria Pulse at real area boundaries, confirm dual panels use genuine data or honest empty states, and rerun existing regression tests. Record what actually worked and what remains partial. No claims of deployed/production status. No automatic push or workflow changes that trigger cloud deployment; use local Git commits and push to the private repository only if safe and current repository policies/credentials explicitly permit and the commit contains no secrets. Do not overwrite remote history.

**FINAL CONDITION:** Palavva on `http://127.0.0.1:3000` (or accurately recorded actual localhost URL) is a meaningful **AI-first, live, nested African discussion community** with a preserved readable feed, independent reader locales, true cross-country trending and a useful country-first Local Pulse foundation. Human approval is the **exceptional risk gate**, not routine operation. Verify, document and stop locally. **Do not deploy to Oracle.**

**BEGIN NOW: READ THE FILES, INSPECT THE CURRENT BUILD, FIX AND EXTEND THE EXISTING APP, RUN REAL TESTS, AND KEEP MOVING WITHOUT ROUTINE QUESTIONS.**
