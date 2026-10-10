# CLAUDE AUTONOMOUS EXECUTION PROMPT — PALAVVA AI SOCIAL NETWORK

**Project root:** `/Users/amaeteumanah/Projects/palavva`  
**Approved master:** `PALAVVA_MASTER_MARKDOWN_TOC.md`  
**Approved UI image:** `assets/references/Palavva Dark Social Dashboard.png`  
**Task:** Implement the approved Palavva AI-first social-network experience in the EXISTING Mac-local application, preserve the existing work, test real functionality, and leave an auditable morning handoff. **Do not ask me questions.**

## 0. Operating contract: read this first

You are the implementation engineer, product integrator, and QA lead for Palavva. The founder has finalized the product direction and is away from the computer. Work autonomously inside the existing local project. Do not pause for stylistic choices, routine implementation decisions, or issues you can resolve safely. Do not send a sequence of planning messages while waiting for approval. Implement, test, repair, and report.

**This prompt is new authorization for LOCAL implementation work.** It supersedes older notes in the master saying “no execution prompt yet” and “no code changes authorized by the documentation task,” but it does **not** supersede infrastructure, spending, security, or public-launch prohibitions.

The goal is a usable, real, locally running and tested AI social-network product, NOT a concept, slide deck, another mockup, or 28 newly drafted Markdown chapters. There is no two-week deadline. Prioritize correctness, existing-data preservation, and a believable autonomous network over speed or decorative effects. Complete as much real working scope as you safely can in this session. Do not claim unfinished features work.

### Hard boundaries

1. **Do not ask the founder any questions tonight.** If clarification/approval is needed, make a conservative reversible choice where safe; otherwise leave the feature disabled and record the blocker. Never interpret “don't ask” as permission to bypass approval gates.
2. **LOCAL MAC ONLY.** Do not touch Oracle, Hetzner, DNS, Tailscale configuration, production ingress, payment merchant dashboards, third-party accounts, or public deployment. No production publication. Don't interfere with other services on the Mac.
3. **NO PAID AI CALLS.** The founder mentioned Anthropic promotional credits but has **not** authorized spending them. Disable Anthropic and all other metered remote model fallbacks. Use the existing local Qwen endpoint only when reachable and authorized by existing local configuration, with strict caps and measured test usage. Do not expose secrets.
4. No real Paystack transactions, chargeable WhatsApp messaging, Telegram production bot registration, Apple integration, external commercial communications, or externally deployed agents without separate permission. Show **Coming soon / Limited pilot / Unavailable**, as applicable, on unverified connections.
5. **Preserve all work.** Never discard local uncommitted changes, rewrite git history, force-push, reset/drop production data, delete files to hide test failures, overwrite old evidence, rotate secrets, or rip out PocketBase/SQLite, Qwen, RSS, SSE, locale, Local Pulse, Time Lens, Command Center, Revive/EspoCRM contracts. No wholesale LoomFeed/OpenMolt backend replacement.
6. **No invented activity.** No fake counters, activity timestamps, users, votes, verification badges, SubPal membership numbers, offers, or “online” statuses. The UI reference is structural only; all its example statistics/content are NOT Palavva data.
7. **No new image generation.** No cinematic artwork, sunset backgrounds, giant mascots, stock headshots pretending to be real agents, or slide-making. Existing icons/optional simple avatar initials/glyphs suffice.
8. Follow content rights, source attribution, personal privacy, PG/family-friendly moderation, commercial disclosure, geographic accuracy, and the established automated publication risk gates. Do not weaken security to make a demo pass.
9. Use only legitimate sandbox/test identities or disclosed Palavva-operated synthetic agent accounts. Never represent seed agents as real verified humans or actual external businesses.
10. Do not buy software, subscribe to services, create external resources, or run unbounded model/scheduler jobs.

## 1. Authoritative inputs, source precedence, and first actions

At the project root, first confirm BOTH files exist with exact names:

- `PALAVVA_MASTER_MARKDOWN_TOC.md` (detailed integrated master, approximately 1,480 lines).
- `assets/references/Palavva Dark Social Dashboard.png` (founder-approved **three-column functional UI layout reference**).

Open and fully read the master and view the actual image before editing UI. Also inspect `05-UI-DESIGN-SYSTEM.md`, `21-LOCAL-FIRST-DEVELOPMENT.md`, `22-AI-FIRST-CONVERSATION-ENGINE.md`, `23-LOCALE-TRENDING-LOCAL-PULSE-IMPLEMENTATION.md`, `24-EXTENDED-ACCEPTANCE-MATRIX.md`, `docs/evidence/V1_3-IMPLEMENTATION-REPORT.md`, the v1.4 product-reset handoff if present, and the current app code/tests/available scripts. The master is a combined TOC plus **binding** product blueprint; filenames 25–52 are mostly proposed, not necessarily existing files. Do not assume they exist and do not block on their absence.

**Precedence:** latest founder-approved decisions embedded in master sections 7–24 > earlier product-reset handoff > original 00–24 where compatible > code defaults > your implementation preferences. Security/rights/platform rules still apply. Document contradictions you reconcile.

Before changing code:

- `pwd`, `git status`, current branch, repository remotes, recent commits, running local services, Node/Python/PocketBase versions, and existing test/build commands.
- Record baseline screenshots at 1440 px and 375 px if local app is accessible, current routes/features/data health, and current tests where practical.
- Create a time-stamped, restorable **local** backup before DB/schema changes. Do not touch unrelated databases. Use an isolated working branch if safe; preserve dirty changes exactly. Avoid destructive commands; use additive migrations, idempotent upserts and feature flags.
- Make a short internal checklist of implemented/partial/missing functionality, then **build**. Do not turn this into a prolonged research exercise.
- If the image is missing or unreadable, follow master section 7's explicit layout contract rather than inventing a new design; log the asset gap and keep working.

## 2. Locked Palavva product and visual decisions

**Product definition:** `Palavva is an African Social Network for AI Agents.` Individuals and businesses may create Palavva-hosted agents or connect independently hosted agents. Autonomous agents create public posts, nested replies, upvotes/downvotes, SubPal participation, follows and genuine interactions. Humans are **public observers**: they can read, discover, search, share, follow/save, configure and privately supervise their own agents. **Only AI agents may publish, reply or vote publicly.** Enforce this on server endpoints, not just button visibility. Human owners can issue tasks/instructions to their agents and approve protected actions; private DM oversight is separately permissioned.

**Homepage exact copy:**
- `palavva.` (two v's, Tangerine dot)
- `An African Social Network for AI Agents`
- `Where AI agents share, discuss, and upvote.`
- Buttons: `I'm a Human` and `I'm an Agent`
- Immediately beneath them: `Humans can watch, discover, and share. Only AI agents post, reply, and vote in public discussions.`
- Main actions: `Create Your AI Agent` and `Send Your AI Agent to Palavva`
- Supporting line: `Africa has a lot to talk about.`

**Use the approved image for STRUCTURE ONLY:** sticky top navigation, left social navigation, wide central social feed, right real-time social sidebar, compact branded hero, four real stats, an agent-task composer, feed sort tabs, post cards, genuine Live Activity, Trending Agents, Popular SubPals. Keep the UX dense, professional, genuinely interactive, and accessible. The image's nearly black/neon coloring and six-figure metric examples are not authoritative.

**Actual approved brand tokens (read `05` for complete map):** Midnight `#1B2030`; Tangerine `#E85E31`; Warm Gold `#F8C45C`; Ivory `#F8F5F0`. Light background `#F8F5F0`, cards `#FFFFFF`; dark background `#111520`, cards `#262D3E`, muted cards `#2F3545`; legible text and outlined borders. Light-mode accessible primary button uses `#C34218` with white text. Support persisted light/dark/system, keyboard focus, WCAG contrast, mobile and Arabic RTL. Do not copy the generated near-black brand treatment wholesale.

**Header navigation:** `Explore`, `Discover`, `Local Pulse`, `Explore Africa`, `SubPals`, `Topics`, **`Businesses`** (replace `Founders`), conversation search, compact edition dropdown (`All Africa` etc.), independent interface-language and reading-language controls, light/dark/system choice, login/account. No long rows of country/topic chips below the hero. Keep news, Time Lens, Explore Africa, country maps and prior URLs available.

**Left rail:** Home, Popular, Following, Live, Discussed, Saved; SubPals; Browse All; tools for Create Agent, Send Agent, Connect API, My Agents, Messages. Geographic SubPal recommendations reflect explicit edition and actual community data. Do not show Nigerian business communities as universal defaults for Ghanaian visitors.

**Four headline counters:** `Verified Agents`, `SubPals`, `Posts`, `Comments`. Initial values come from actual authoritative database queries; updates only after committed writes and real SSE/event replay. Verification must mean explicitly documented owner-control proof, not arbitrary creation, fake unique-human verification, or having an email address. Seeded Palavva-operated agents must be identified as AI and **not silently counted as human verified**. Show honest zero or early-network states. Never import Moltbook screenshot metrics into Palavva.

**Agent avatars optional.** Fallback to accessible initials or simple generated glyphs. If someone supplies an avatar, validate and allow it subject to moderation. Do not require profile photographs or assign arbitrary images to every agent.

**Social behavior:** agent posts/replies/votes visible with author identity and provenance, `For You / Live / Hot / New / Top / Discussed` tabs wired to actual sort/ranking, scroll-stable updates and explicit new-post indicator, public read-only human viewing, working thread detail, nested comment trees, latest-reply preview, real-time event rail, genuine Trending Agents with transparent time window, Popular SubPals with real membership/activity. No faux cursor movement or timer-inflated numbers.

## 3. Implementation priority: actual working app, not document production

Work through these **dependency-based workstreams**. Finish and test each safe increment; integrate with existing code instead of starting a second application. Favor coherent end-to-end slices over many shallow fake screens.

### A. Baseline protection and architecture reconciliation

Map existing routes, models, PocketBase collections, Python workers, news pipeline, SSE events, current tests and the Command Center. Crosswalk master screens/features against what truly exists. Keep established Next.js/TypeScript + PocketBase/SQLite + Python worker + locally accessible Qwen unless an actual incompatible defect demands a narrow repair. LoomFeed is an MIT-licensed optional component/design reference, NOT permission to replace the project with Go/Postgres. OpenMolt is similarly an audit candidate only. If reusing code, inspect license and preserve notices. Add migrations without destroying the previous data model or breaking historic permalink/source/edition behavior.

### B. Rebuild approved homepage and core social UI

Implement the functional three-column desktop shell, responsive mobile/tablet navigation, readable card density, correct brand tokens, edition/language/theme dropdowns, search, role choices, visible human-observer distinction, agent Create/Send actions, database-backed counters, feed modes, Live Activity, Trending Agents, SubPals shortcuts, guest read-only task-composer substitute and signed-in **agent instruction** composer. Confirm real paths rather than decorative buttons.

Render real post/thread/community data. No duplicate featured-news card followed by the same story. Source-backed news can still generate agent conversation and link through Time Lens and original citations. Provide proper loading/empty/error/reconnecting states rather than filling the screen with fabricated activity.

### C. SubPals and social primitives

Implement/complete SubPals directory, individual `/p/:slug` pages where routes allow, search, descriptions, moderation rules, actual subscriptions/follows, publication permissions, real per-community posts and counters. Suggested starter communities include football, EPL, African business, Afrobeats, travel, agriculture, technology, education, history, entertainment, money/economics, and everyday Africa (master sections 11 and 14 are authoritative). Do NOT seed fake membership totals. Agency-created new communities must start as **proposals**, subject to duplicate/policy safeguards. Preserve country-specific relevance without splintering every community into dozens of empty copies.

Complete/verify durable AI-only public posting, nested replies, vote up/down with one-agent-account/one-vote semantics where appropriate, retraction/correction, actor provenance, following, read-only guest access, moderation and anti-vote-ring checks. Business identity and paid status must never purchase votes or trend placement. Public human write attempts MUST fail at the API level.

### D. Real-time activity and truthful social statistics

Extend existing event/outbox/SSE system, not a competing fake real-time timer. Emit only persisted authorized events; sequence IDs, idempotent replay, reconnect state and gap reconciliation must work. Counters refresh from real aggregates or transactionally maintained authoritative read models. A reader's scroll position must remain stable while replies and activity update. A busy network may visibly change every few seconds; a quiet network should honestly stay quiet. Add first-party quality metrics and a Command Center inspection route for event provenance, rejection, safety and performance.

### E. The 60-agent **autonomous mini-city**

Implement **60 persistent, distinct, explicitly labeled Palavva-operated AI identities** based on the ten groups and working seed roster in master section 11. Do not create 60 concurrent LLM instances. Seed idempotently (no reset duplicates), follow relevant SubPals, record personal expertise/interests/persona, bounded memory and past participation, real post/comment/vote permissions, budget/cooldown, and status (`Active`, `Resting`, `Paused`, `Held`). Synthetic agents must NOT pretend to have lived human experiences, personal addresses, real ownership or personal verification.

Implement a **shared, bounded orchestration service** with durable jobs and reasons for decisions. Candidate triggers: validated RSS or official-source topics; a substantive reply/question; an agent mention; a real thread update; a suitable original open-ended topic; a new relevant SubPal; an approved owner mission. Use cheap deterministic relevance checks first; use local Qwen only when warranted. Each agent independently decides whether it can add something novel; `abstain` is a valid logged outcome. Posting/voting never becomes a fixed chore or artificial reciprocation. Activity should emerge across multiple SubPals, not just one scripted thread.

For the initial run, use a conservative rotating eligibility pool around 12–18 identities, low actual model concurrency, hard calls/tokens/output/retry/topic/agent/day ceilings, operator kill switch, and strict priorities. **Do not run an unlimited continuous 60-agent generation loop while the founder is sleeping.** Prefer safe small local smoke/test batches, then leave the scheduler bounded/configurable and record measured capacity. If the Qwen endpoint is unavailable, keep completed configuration and local data/schema work, mark inference BLOCKED, and do NOT route to paid APIs.

**RSS is a source input, not an agent.** Preserve source permission, citation, publisher-vs-subject location, deduplication, name verification, sensitive hold/review, and non-fabricated claims. Every AI-generated statement about current events requires appropriate grounding. Unverified content is held or framed as discussion, not invented news. Let agents initiate appropriate original, non-news discussions with disclosure; never claim unsupported facts. Keep separate real human readership metrics from AI agent volume.

### F. Nontechnical owner creation and external agent connection

Build the essential create-agent flow: account/auth from actually configured providers only; agent name (availability check), optional avatar, brief persona, interests/SubPals and independent edition/language preferences, explicit owner permission scopes, optional time-limited active purchase/research missions, daily activity cap, spending cap, review/activate, and My Agent overview with real activity/audit/pause/resume. A new account with no configured provider should receive an honest working fallback, not a fake OAuth/WhatsApp signup. Humans should be able to manage an agent without directly authoring public posts.

Build/complete a working developer entry point for `Send Your AI Agent to Palavva`: scoped key issuance/storage/revocation, agent-owner linkage, verified capability/access boundaries, documentation for REST and currently implemented tools, one local end-to-end external agent posting/replying test using a non-production test key. Never leak keys in UI logs or screenshots. MCP/A2A support only if correctly tested; otherwise accurately label planned. External agent uptime belongs to its external host, not Palavva.

### G. Messaging, commerce, wallet, public copy

Implement private message structure and safe permission-based requests only as far as available local security/auth capacity permits. Owner can see their own agent's DM transcripts and approve/disallow commercial information exchange and introductions. A forwarded deep link must reveal nothing without authenticated authorization. Verify business affiliation separately from an agent's self-assertion; show truthful proof level. No spammy outbound offer sending, unsolicited DM floods, buying/contracts/payment authorization, or exposure of user phone/email to another agent.

Give agent owners a real in-app activity report/digest from persisted events and source links: what posted, discussed, found, costs, approvals. Don't claim summaries were sent on WhatsApp/Telegram. Preserve the channel architecture and show `WhatsApp — Coming soon`, `Telegram — Coming soon`, and Apple Messages `Exploring` unless existing independently tested authorized channels really work. Basic links shared **to** WhatsApp/Telegram may work using standard web sharing without an AI bot integration; distinguish clearly.

Implement only safe, local **wallet/budget scaffolding** or simulated test ledgers as necessary for hard usage caps. **NO REAL PAYSTACK CHARGES** or merchant integration activation. The product direction is Paystack-first in Nigeria, prepaid pay-as-you-go, proposed ₦1,000 minimum and a 15–20% proposed (not finalized) platform allocation. Show honest placeholders/status for non-live checkout and no invented credit balances. Owners must be able to set daily spending limits, prevent automatic top-ups, and pause AI work when limits are hit.

Update About Us, Businesses (not Founders), Guidelines, Help, and Developers/API pages with substantive copy reflecting: AI-first African communities; personal hosted and bring-your-own agents; SubPals/sport/news/culture; human observation and owner control; business discovery and consent; verified identities/provenance; PG/family-friendly rules; transparent integrations, API scopes and limitations. Preserve footer links and legacy URLs/redirects.

### H. Keep existing African product strengths working

Retest RSS ingestion, automated low-risk editorial publication, source rights and corrections, Time Lens, `Explore Africa`, `Local Pulse`, geoBoundaries mappings, two separate human-demand trend panels, localization (English, French, Arabic and Nigerian Pidgin currently implemented where available), native-review honest flags, and existing locale precedence (edition / interface / reading language). Country/locale preferences must not silently change when users follow cross-border links. Respect 320 px mobile and Arabic RTL. Do not strip these features to simplify the homepage.

## 4. Screen coverage and truth-in-UI

Use master section 10 for the full **20-screen** canonical product surface and routes. Build the screens needed for the working vertical slices above; keep remaining screens routed to honest, accessible `Coming soon` or limited feature views rather than half-working controls. Do not manufacture screenshots or mark an unimplemented feature DONE.

For every visible control: wire a real action, an accurately labeled disabled/planned state, or remove it. Never have decorative forms that appear to submit but don't. Do not copy placeholder member/verified counts, agent biographies, or example business offers from generated UI reference images. User agent photos remain optional.

## 5. Tests, evidence, fixes, and deliverables

Use the repository's actual current tools/scripts rather than guessing exact commands. Run focused tests during each workstream, then a coherent regression suite including typecheck/lint, frontend tests, backend tests, Playwright/browser flows, mobile and light/dark, and existing v1.3.1 critical acceptance scenarios. Add automated coverage for:

- Guest observes and cannot author/vote; API rejects human public write with 403/appropriate error.
- Existing agent or newly created hosted agent can post, reply to a nested reply, vote, retract/correct and trigger a persisted real-time event.
- Four live counters match database aggregates after writes/retractions/reconnect and show correct zero state.
- SubPal browse/follow/search/membership and country-aware recommendation (Nigeria versus Ghana).
- 60 seed accounts are distinct, idempotent and labeled `Palavva-operated AI`; no human-verification inflation.
- Agent autonomously responds to a verified topic when relevant; abstains on unrelated/unsupported work; avoids repetitive or reciprocal vote inflation; enforces token/job/day caps and stop switches even across restart.
- Local Qwen usage stays within finite measured test budget, or capability is marked blocked without paid fallback.
- Owner agent creation, configure, permissions, pause/resume, activity audit and summary are persistent and cross-owner isolated.
- External agent key scope/revocation, public-human permission rejection, commercial DM consent, and forwarded private link security.
- Existing Local Pulse, language choice, translation, news/Time Lens and Command Center continue working.
- Real mobile browser screenshot at 375 px and desktop at 1440 px, both light/dark (screenshots of REAL running application; no concept illustrations).

If a test fails, investigate and fix it rather than only recording failure. Never hide known regressions. Respect tools' context/time budgets, avoid repetitive full test runs, and do not set an unlimited autonomous loop just to demonstrate activity.

### Required evidence/report files (append rather than overwrite historical reports)

Create a dated folder, e.g. `docs/evidence/ai-social-build-2026-10-09/`, and record:

1. `IMPLEMENTATION-REPORT.md`: what truly runs; user-visible routes; code changes; key file paths; before/after; known limitations.
2. `DECISIONS.md`: how source conflicts were resolved and why existing systems were retained.
3. `TEST-MATRIX.md`: tests/commands, results, PASS/PARTIAL/BLOCKED/FAIL, real logs/links to evidence.
4. `DEPLOYMENT-STATE.md`: which local services are running, ports, startup/stop instructions, confirmed NO remote deployment.
5. `AGENT-CITY-REPORT.md`: number of registered/enabled/verified identities, safe-run event traces, real posts/replies/votes, model call/tokens/cost estimate, abstentions, holds and limits. Label demo/test data honestly.
6. `UI-ACCEPTANCE.md`: screenshots (real browser), 20-screen inventory implemented/partial/planned, responsive and dark/light status, reference-image reconciliation.
7. `MORNING-HANDOFF.md`: concise high-level results, exact launch command and URL, what was completed, what remains, blockers requiring the founder's explicit approval, and next recommended safe implementation steps.

Only create/add the 25–51 individual product docs as needed to clarify real implementation; **do not spend the build session generating an empty documentation library**. Do not write a new second Claude prompt. This prompt is the execution instruction.

Commit coherent milestones locally with non-destructive, descriptive commits when tests permit. Do not push or force-push without prior standing authorization evident in this project; report branch and commit hashes. Never touch unrelated services. Include clean status or an explicit explanation of existing dirty files.

## 6. Work pacing, completion, and morning outcome

Make forward progress autonomously, implement each prioritized working slice, and keep a durable evidence trail. If interrupted by token limits or environment problems, preserve git changes, local backup, and a precise `MORNING-HANDOFF.md` so another authorized Claude session can resume without rebuilding context. Do not spend time producing synthetic marketing visuals. Do not ask me to choose a color, database, agent count, navigation, activity architecture, or AI provider: these have already been settled or have conservative defaults documented in the master.

At completion, tell me in a short factual summary:
- **What works now in the browser?**
- **Are the 60 agents registered, and how many actually completed verified real work?**
- **What true posts/replies/votes/counters updated?**
- **What was tested and what failed or is blocked?**
- **How much local inference was consumed; was any paid API used?** (target paid cost: zero)
- **What exact local URL should I open, and where is the morning report?**
- **Confirmation Oracle/Hetzner/DNS/production/Paystack/WhatsApp external services were untouched.**

**Start now: open the master Markdown and the actual reference image, audit the existing Palavva code, protect the baseline, then implement. Do not ask questions.**
