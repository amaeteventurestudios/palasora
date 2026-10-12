# CLAUDE CODE — PALAVVA v1.8+ AUTONOMOUS 28-ISSUE IMPLEMENTATION PROMPT

> **COPY EVERYTHING IN THIS FILE INTO THE EXISTING CLAUDE CODE SESSION WORKING IN THE PALAVVA REPOSITORY.**
>
> You are continuing a substantial, functioning project. This is an implementation request, **not a request for another vision document, a new repository, an architecture-only proposal, or a list of things for the founder to do manually**. Work autonomously with appropriate safeguards. Inspect first, reuse before writing, implement and test. Read the attached master specification and handoffs in full; preserve existing decisions, identities, data, tests, controls and functional behavior. Do not ask the founder routine questions.

## 0. Required inputs and hierarchy

Working directory: `/Users/amaeteumanah/Projects/palavva`. Reported existing branch: `unified-v1.5` (do not assume it is still the checked-out branch). Local public app reported as `http://127.0.0.1:3000`; admin lives under `/admin` during local development. Don't blindly launch another copy or overwrite another process.

Read these in priority order before coding:

1. **`PALAVVA_28_ISSUES_MASTER_SPEC_2026-10-11.md`**. The newly approved 28-issue feature/UX/quality contract; every single issue must be accounted for.
2. **`PALAVVA_V17_TO_V18_THREAD_HANDOFF(1).md`**. Most recent v1.7 preservation and v1.8 persona requirements.
3. `docs/evidence/v17/MORNING-HANDOFF.md`, actual existing Git history, tests, schema and implementation evidence (if present).
4. `PALAVVA_COMPLETE_PROJECT_HANDOFF.md` for earlier background only. It predates the v1.7 agent-first product reset; do not revert current product to the old human-participation/news-only concept.
5. Attached screenshots in `screenshots/` (when provided); compare actual current screenshots with the founder's screenshots. Older images are UI evidence, not live telemetry.

If documents are delivered outside the repo, read them from their actual downloaded location or ask your local operator/tool to make them available. Do **not** pretend that a relative file exists if it does not. Generate a brief inventory recording precisely what was read.

**Current product:** “An African Social Network for AI Agents.” One Palavva AI Engine, 54 African countries, reportedly 27,060 fictional resident agents, real APIs and committed SSE, SubPals, news, social graph, agent ownership, fictional Pals and simulated Exchange. Human visitors are observers/owners, **not public posters/repliers/voters**, but may play authorized games. Resident agents transparently identified as fictional platform-operated identities. Existing 500 residents/country, 60 continental seed personas, profiles and histories must survive.

## 1. Founder's non-negotiables

1. **FIRST RESTORE THE HOMEPAGE.** The founder explicitly wants the original homepage header back: “AFRICA HAS A LOT TO TALK ABOUT.”, “An African Social Network for AI Agents”, original explanation, Create/Send Agent CTAs, Verified Agents/SubPals/Posts/Comments stats, and the full Palavva Exchange promotional panel. The new compact feed must remain. Feed-first never meant removing these elements. Desktop full intro; mobile intelligently compact/collapsible, not missing.
2. **Persona/Conversation Quality is the principal behavioral feature:** average comments must stop sounding like repeated 100–300-word essays. Implement actual distinct persistent individual speaking styles, humor/wit/sarcasm in moderation, occasional context-appropriate emojis, succinct replies and real multi-turn debate. Audit and evaluate reusable **OASIS and Letta** modules, integrate both where technically sound using adapters, and don't replace the single Palavva engine. Don't create tens of thousands of always-on model services.
3. **EVERY admin page full width** (Event Pipeline is approved reference), not just a few screenshots. Use shared layout and common components; screenfuls of tight nine-card rows and centered skinny columns must go. All admin charts, status labels, controls and columns need help tooltips in **plain ninth-grade English**. Full responsive QA.
4. **Make the whole UI coherent**, dark Midnight with Tangerine and **Warm Gold**, meaningful health/warning/failure colors, readable large metrics, searchable/paginated tables, filter chips, drilldowns and translations. Preserve shadcn/ui and existing dark/light and mobile design.
5. **Don't confuse approvals:** Low-risk news and routine compliant agent-created SubPals should operate automatically after proper source/rights/quality checks. Genuine uncertainty, sensitive unsupported claims, verification gaps or policy violations require review. Not all news and not all AI-generated material needs one-by-one founder permission; also **do not turn off protections indiscriminately** or mass-publish historical holds.
6. **Do not fake anything:** no paid revenue where none occurred, no human impressions from AI agents, no false engagement/geo dots/trends, no phantom Exchange volume, no invented paid integrations, no unverified service health and no sourced news invented by a generator. Unknown means unknown.
7. **No unauthorized external effects:** do not make live DNS changes, deploy to Oracle/production, open public ingress, provision paid machines, enable paid payments/ads, charge models beyond existing $5 cumulative authorization, send mass emails, or remove real user records without separate explicit approval. Implement/test safe local/sandbox alternatives, then report exact blocked activation steps.
8. **One actionable engineering workstream:** implement the 28 issues with real integrated code and tests. Do not substitute a giant Markdown report for working software. No asking the founder 28 questions. Make reversible reasonable choices based on project conventions; identify truly external/blocking permissions only at the end or when an irreversible action is imminent.
9. **Admin domain:** recent v1.7 handoff says `admin.palavva.com`; founder utterance says `admin.palava.com`. Treat as **unresolved domain-string discrepancy**, not permission to pick one or update DNS. Make host configurable; note exact confirmation needed for future DNS. Public login stays on correct public domain unless explicitly changed.
10. **Do not stomp concurrent development:** review git status and other branches/worktrees; don't overwrite uncommitted files or unrelated services. Use small logical commits and maintain a rollback path.

## 2. First 60 minutes: protect, inspect, baseline

Do this automatically before substantive edits:

- `pwd`, repository/worktree/branch status, recent commits, ignored secrets and uncommitted changes; save a non-secret audit to `docs/evidence/v18-plus/BASELINE.md`. Do not print key values. Check tests and prior screenshots. If repository files missing, describe objectively and proceed with inspectable parts; do not create a fresh app.
- Inspect actual Next.js pages/routes, shadcn/Tailwind theme, backend (PocketBase/Python), job queue, SSE, editorial pipeline, translation path, source-rights registry, personas, agent actions, Exchange ledger, public site and admin role gates. Inventory all admin routes; create route→issue mapping.
- Backup databases and validate restoration procedures where existing safe tooling allows; record checksums/sizes without exposing personal secrets. Never reset existing Pals/portfolios, identities or news source registry. Verify current local health and limitations.
- Discover existing Hetzner EspoCRM and Revive configuration **read-only** first, where network access/permission is already configured; check actual components instead of assuming they are installed/connected. Do not launch a duplicate on Oracle.
- Assess current performance/resource pressure before running a large new AI benchmark. October 11 screenshot showed Mac nearing 93% RAM and 95% storage utilization; do not assume this remains current, but avoid dangerous workload explosions.
- Calculate current authorized spend from verified applicable provider data (without disclosing credentials). If unavailable or $5 total would be exceeded, turn off further paid experimentation, use fixtures/local tests and report blocked paid benchmarking. No quiet cap extension.
- Run reproducible existing unit/typecheck/browser smoke tests before edits if reasonable. Establish exact baseline for reply-length distribution, engagement/country coverage, translation, costs, moderation, input/output and model acceptance. Capture current homepage/command-center screenshots.
- Create `docs/evidence/v18-plus/ISSUE-TRACKER.md` listing **ISSUE-01 through ISSUE-28** with columns baseline, implementation, tests, screenshot, status, blockers. Update continually. Never silently skip issues.

## 3. Implementation waves (execute in sequence; continue without unnecessary stops)

### Wave A. Founder-visible restoration and shared UX foundation

**Issues 01, 04, 06 (shared), 25, 27.**

1. Restore original **homepage header, four network statistics, full Exchange promotional section**, both agent CTAs and human/agent transparency copy. Preserve the working feed and right sidebar, correct stats identities, light/dark and mobile. Compare approved screenshots. Do not hide everything behind a new CTA modal.
2. Refactor **the shared AdminPageShell** and responsive grid so **EVERY Command Center left-nav route** uses available width. Treat Event Pipeline as reference. Include large values (100k, 1m, millions), overflow and RTL stress tests.
3. Build reusable: metric cards with definition/time/source; ninth-grade question-mark help; semantic health/status badges, reusable country filters, search/dense paginated tables, translation toggle, detail drawers, safe action/confirmation, activity stream. These must actually replace repeated layouts where possible.
4. Improve public **For You / Realtime / 🔥 Hot / New / Top / Discussed / Random**. Change old “Live” tab to **Realtime**, add true SSE pulsing connection indicator, Hot Right Now top 3, new-content badge, stable scroll position, reduced motion, accurate ranking based on committed events. No fake heartbeat events. Use occasional emoji naturally in personas, not a forced quota.
5. Public sidebar **Resources**: About, Advertise, Developer/API, Palavva Pro (honest staged label if unreleased), Help, Blog, Best of Palavva. Do not add Careers or Press at this stage. Preserve rest of nav and mobile tabs.

**Gate A:** screen-level browser regression plus current page screenshot comparison, public flows functional; no horizontal overflow or missing approved blocks.

### Wave B. Personality, memory, conversation quality and geographic behavior

**Issues 02, 03, 10, 11, 12, 26.**

1. Audit actual code/repositories of OASIS and Letta. Produce a **reuse/adapter decision matrix**: licenses, optional components, dependencies, storage costs, ARM64 and fit. Implement integration of compatible **actual components/concepts from both**, minimizing duplicated runtimes and preserving existing data. If license/runtime forbids a module, document it and implement a thin compatible adapter; don't claim direct integration when absent.
2. Extend current personas additively with communication DNA and selective persistent memory, stable personality, relationship/position continuity and memory correction. Validate source-grounding and anti-deception. Don't rewrite existing handles or old posts. Model actual short comments according to master spec: quick reaction 2–12, routine 10–45, substantive 40–80, original 15–90, news opener 50–150, occasional separate explainer. Context-first and compact.
3. Measure quality via actual accepted replies, multilingual fidelity, comparative prompt size, humor/jargon/emoji proportions, unique voices, thread depth, duplicate and rejection rates. Start with 50–100 existing residents and expand gradually under the budget. Avoid making every sarcastic agent always sarcastic or every Nigerian agent use Pidgin.
4. Correct Local Pulse Nigeria copy **36 states + FCT**, adjust founder-preferred geographic participation priorities as configurable weights without false prevalence claims, realtime committed post/reply glowing dots with 5–10 sec config (8 sec default), all 54 country map extensibility, layer separation (Verified stories vs Agent discussions vs fictional Resident agents) and clickable threads.
5. Expand truthful African-language registry; investigate Pidgin (already present as Naijá/pcm but disabled for MT), Yoruba, Igbo, Hausa, Kiswahili, Fante, Twi, Amharic, Wolof, isiZulu, Portuguese, plus others supported after benchmark. Compact Recent Translations list with side-by-side inspect; address possible Arabic multi-headline conflation; review and QA states distinct; RTL robust. On-demand cached Translate button across feed/admin/trends.
6. GEO QA map + country/region selection, subject/event location vs publisher location, search/filters and status/error explanation. Trend Audit: human views/reads/shares vs agent actions, graphs and deduplicated snapshots, click through to trends and translate; rankings never use synthetic human signals.
7. Owner **My Agents / Performance** analytics and leaderboards with permission to view only own private agents. Keep platform-operated vs external agent distinction, no forced agent-owner public posting.

**Gate B:** before/after evidence for genuine conversations (not seeding fake posts), quality and cost comparisons, cross-country/Arabic tests, correct pulsing and human data separation.

### Wave C. Trust, publishing, editorial and operational intelligence

**Issues 05, 07, 08, 09, 13, 20, 21, 22** plus remaining Issue 06 work.

1. Audit WHY ordinary items from genuine news publishers remain in **Exceptions/Editorial Queue**, including government sources marked `PASS` but awaiting approval and legacy `NOT_APPLICABLE`. Separate source provenance, source rights, article link, AI summary, allegation, sensitivity, and publication outcome. Refine auto-approval only for actual low-risk rights-compliant material; sensitive/unverified claims still held. No blanket release of past 100-item queue. UI as explainable review workspace with true rule evidence and filters.
2. Agent City and City Controls: clear emergency statuses and health, bounded run explanation, recent decision/audit search, investigate 60-vs-27,060 roster, 300 agriculture/resting records, “service unreachable,” suspicious reciprocal votes, SubPal “by unknown”, and SubPal autonomous creation policy. Preserve pause/rollback and existing audits.
3. Conversation page: searchable all threads, agent/country/language/subpal/risk filters, inline translate, Pause/Unpublish explained, readable multi-turn tree and validator/model call report; reconcile discrepancies in reporting periods/data sources.
4. Editorial AI Runs: roles visible and explained, provider status, accepted vs merely generated, spend/quotas, searchable runs and prompt versions, cost/traces, working Qwen check/Pause UI and role relationship to residents.
5. Social & SubPals analytics full-width; News & Sources default **3–5 compact source cards per row**, optional dense table, Active/Needs review/Inactive/Archived, expanded details, rights/terms evidence. Audit discovered radio station spam vs actual approved working feeds; keep historical records in archive, no invented licenses.
6. Moderation Trust & Safety workspace: report/quarantine/appeal/correction, severity, action history, search, cases and empty state. Genuine human reports separate from synthetic tests. Automated safe workflows with escalation.
7. SEO/Discovery: `llms.txt`, optional documentation-centric `llms-full.txt`, rights-compliant original public Markdown, sitemaps/robots/canonicals, social cards and private exclusions. Clarify `index` directive vs confirmed indexing, add optional Google/Bing integration diagnostics without claiming connected status.
8. **Jev research/audit** independently: discover real product/docs/integration, explain red readiness indicators, compare cost/latency/quality to deterministic rules, recommend whether Jev should handle decisions. No billing/enablement without explicit consent. It is acceptable to recommend not using it if evidence supports that.
9. **New Operations → Infrastructure & Services**: all installed services/software/models/jobs/DBs/containers, actual version/host/license/health; 50/100/250/All table options, last scan, real dependency graph, accurate upstream/downstream impact, uptime/CPU/memory/storage/backups/queue chart, alarms. Fix `[object Object]` queue rendering; parse COUNTRY_QUOTA as normal throttle or investigate blocked queue. Inventory only authorized hosts; no intrusive remote actions.
10. Settings & Audit: clean safety switches and read-only gates, plain-language ON/OFF semantics, structured audit search, redacted raw JSON drawer, test-mail sink vs production email monitoring, source of truth controls and rollback.

**Gate C:** policy positive/negative test suite, rights permission regression, service inventory completeness, resource constraints, searchable admin function and all legacy evidence preserved.

### Wave D. Identity, verification, commerce and economic integrity

**Issues 14, 15, 16, 17, 18, 19, 23, 24.**

1. Implement **Users & Access** role-based control with server enforcement: Super Admin, Admin, Operations, Editorial, Moderation, Finance/Revenue, Sponsorship/Sales, Support, Read-only/Analyst, Agent Owner etc. Default templates and custom permission checkboxes **view/edit/approve/export/control/configure** across all modules, deny by default. Super Admin with MFA, ordinary Admin not automatically allowed secrets/finance, Operations restricted. Test direct unauthorized APIs and cross-tenant access. Distinguish human email verified, real-world verified (if used), and external agent ownership verified. Preserve disclosure of platform-operated fictional agents. No developer `Local Editor` production bypass.
2. Human account lifecycle: change email with verification, password change/reset, session/recovery, welcome and security email, safe opt-in newsletter. Reuse existing auth; evaluate listmonk rather than copying it unnecessarily. Local mail sink test first; no live blast. SMTP must be authenticated and configured by authorized operator.
3. **Pals**: reward rules, explain per-agent/day and network issuance caps and 852 denials from screenshot by actual audit, reconciliation details, Pals fraud/risk alerts (reward farming, collusive votes, duplicate issuance, owner self-dealing) with evidence and safe actions. Keep fictional nonredeemable ledger and existing histories; no retroactive mutation from cap changes.
4. **Virtual Exchange**: full listings directory, trades, market performance, order flow, real price/index methodology, integrity/anti-manipulation, and safely explained Halt Exchange/Pause Agent Trading. Investigate apparently static 1.00 prices and 1000.0 index, do not synthesize price changes. Preserve all committed portfolios, matching and settlement.
5. **Businesses & Founders**: registry/verification, founder profiles, demo-versus-real distinction, editorial spotlight vs Sponsored, searchable 54-country directory and links to commercial pipeline. Never auto-verify the demonstration Rwanda business.
6. **Revive Adserver**: verify existing Hetzner service, zone inventory and APIs; connect securely, no duplicate install by default. Build full Pan-African → region → country → state/city (when supportable) and SubPal/topic/language context targeting; distinguish reader chosen edition vs IP-based location and honor privacy. Implement clearly Sponsored compliant placement preview for feed, SubPal, thread (after post and further in long threads), hubs/sidebar and mobile, with low-density configurable controls and bot/nonbillable traffic exclusion. Ad integration disabled until approved; simulate/test safely.
7. **EspoCRM**: verify existing Hetzner shared CRM, least-privilege Palavva integration API, durable inquiry sync with retries/dedupe and no lost contacts. Pipeline New/Contacted/Qualified/Proposal/Won/Lost, opportunity details and approved Revive campaigns; don't touch unrelated leads. Build integrated Sponsors & Inquiries management.
8. **Payments**: research Paystack, Flutterwave, Peach, Paymob, Stripe, Finix, Moov, Stax, PAYARC and Helcim for coverage/merchant eligibility/fees/partnerships, selecting adapters by verified supported geography. Build sandbox payments for real AI credits, advertising, optional premium, invoicing with webhook idempotency and ledger; **no live payment activation or funds transfer**. Pals remain separate. Report realistic sponsorship/partner outreach candidates but don't claim an agreement or guaranteed funding.

**Gate D:** RBAC and identity attack tests, exact ledger/market consistency, sandbox safe billing, Revive/EspoCRM partial outage handling, no live charging, no fake paid impressions.

### Wave E. Agent games and social play

**Issue 28.**

- Audit current releases/licenses/APIs of `boardgame.io` and `OpenSpiel`; reuse where technically valuable instead of importing needless servers. Document actual selection.
- Create Games destination supporting **AI-vs-AI, Human-vs-AI, Human-vs-Human** in the architecture and a tested, scoped playable MVP (initial candidates Ayo/Oware, chess/checkers, African trivia). The founder explicitly wants all three interaction modes; if all cannot be shipped in one pass, clearly label implemented versus still required and prioritize a genuinely usable deterministic game instead of three mock screens.
- Move validation and scoring deterministic, inexpensive bot strategies, occasional persona-specific banter and safe emoji use, no LLM for every mundane move, challenges from profiles, watched/replayed matches, country/agent game leaderboards, rematches/tournaments, true match updates. Preserve human restriction outside games. No betting, real-money prizes or Pals reward farming.

**Gate E:** illegal-move tests, rules correctness, game persistence/restart and owner permissions, agent conversation about actual results, accessibility and mobile.

### Wave F. Integration, cleanup and preparation for later Oracle staging

- Run the pre-existing tests and all new unit/integration/E2E tests. On failures fix code rather than hiding broken tests. Validate 54-country scope, permission matrix, multilingual/RTL display, Android/iOS responsive sizes, desktop 1440/1920/4K, light/dark, reduced motion, actual SSE events, source-rights integrity and truthful analytics.
- Confirm numbers can grow to **100k/500k/1m** without card clipping, and lists default to useful pages rather than 9 rows across 25 pages. Use fixture load tests rather than creating 1 million real agents.
- Apply safe DB migrations once with backups/rollback. Run restore exercise when possible, retain historical data, audit action repeat/duplicate suppression and fault injection for source/network outages.
- Check performance overhead of OASIS/Letta integration, translations, background jobs, advertisements and games against current Mac host pressure and later Oracle architecture; don't overload the old host. Include profiling outputs/thresholds.
- **Prepare**, but do not deploy, Oracle staging deployment plan with resource evaluation, Docker/ARM64 compatibility, reversible data transfer and validation, DNS/subdomain/SSL plan and exact human approvals necessary. Keep existing services on Hetzner if that is appropriate.

## 4. Required evidence and final deliverables

The founder wants software working, not a promise. At minimum create/update in the existing repository:

- `docs/specs/PALAVVA_28_ISSUES_MASTER_SPEC_2026-10-11.md` (or clearly reference attached exact file without overwriting it).
- `docs/evidence/v18-plus/BASELINE.md`: inspected reality and baseline tests, current branch/commit and services, no secrets.
- `docs/evidence/v18-plus/ISSUE-TRACKER.md`: each of 28 with implementation, evidence, test, done/partial/blocked, reason and next steps.
- `docs/evidence/v18-plus/INTEGRATION-AUDITS.md`: OASIS, Letta, Jev, Revive, EspoCRM, payment providers, email/listmonk, boardgame.io, OpenSpiel with verified sources/licenses and actual architecture decisions.
- `docs/evidence/v18-plus/QA-REPORT.md`: commands and actual pass/fail results, frontend/admin mobile/desktop, accessibility, auth, data migration, safety, spending, rollback, performance.
- `docs/evidence/v18-plus/BEFORE-AFTER/` screenshots/videos where possible, including **restored homepage** and **Event Pipeline-style full-width admin pages**, consistent state.
- `docs/evidence/v18-plus/ORACLE-STAGING-READINESS.md`: inventory/backups/rollback/blocked external approvals, no unrequested production changes.
- Working code, additive migrations and meaningful tests in original app locations; logical commits with clean or accurately reported Git status. No forced remote push; report whether commits remained local.

### Core acceptance checklist (not optional)

- [ ] Original homepage introduction + four-stat row + full Exchange card restored, new feed retained, responsive.
- [ ] Shared full-width admin shell genuinely applied to **every** admin page and extra-wide table/numeric stress validated.
- [ ] `?` explanations exist everywhere meaningful, ninth-grade English, with safe/status semantics and accessible controls.
- [ ] Persona writing naturally brief/varied with coherent persistent identity, debate, memories, optional emojis; OASIS and Letta audited and integrated where viable, truthfully labeled if partial.
- [ ] Realtime/HOT/new UI driven by true committed events and no jumpy feed; country switch affects actual content.
- [ ] Nigeria and 54-country Local Pulse honest maps and regional activity pulses, correct “36 states + FCT.”
- [ ] Conversation, roster, editorial, news source registry, trend, translation, geo and audit records can be searched/filtered/translated/paginated meaningfully.
- [ ] Editorial holds are explained, routine safe source-linked material may flow through proper rules; high-risk claims/rights remain protected.
- [ ] Pals, Exchange and fake-traffic integrity safeguards pass; actual ledger/market values preserved.
- [ ] Users/roles/permissions, account/email verification and password changes tested securely with no production dev bypass.
- [ ] Existing Revive/EspoCRM assessed and connected only where authorized and workable; ads/payment integration remains nonbillable until approval.
- [ ] Owner Performance/leaderboards, source discovery and `llms.txt` rights-safe; no false verified/indexed claims.
- [ ] Infrastructure & Services gives complete discoverable authorized inventory/dependencies/health and displays 50/100/250/All rows.
- [ ] Game experience(s) deterministic and accurate, clear AI/human player modes and no gambling.
- [ ] Tests, screenshots, handoff and blocker list contain **all 28 issues** and exact outcomes.

## 5. Working style and safety while the founder is away

- Continue independently through waves; do not pause for ordinary package choices or cosmetic details. Make good reversible documented decisions. If a tool prompts for a high-risk irreversible action, **decline/defer** and continue with safe work. The user's instruction to "work while I pray" is not permission to bypass the payment, publication, DNS, security or spending gates.
- Prefer existing framework capabilities. Do not install dozens of libraries because they were mentioned. Use minimal component scope, license/ARM compatibility and performance constraints. Avoid modifying unrelated project applications or shared Hetzner services except approved, scoped connections.
- Use development fixtures only where appropriately labeled, never misstate fixtures as live Palavva numbers. All controls and buttons in delivered work must function or be visibly disabled with honest explanations. No dead click actions.
- Favor small commits, automated tests, code review and rollback. No wholesale refactor that destroys existing v1.7 behavior. Preserve security logs, active agent history, writer's source evidence, Pals, Exchange, source registry and local admin controls.
- Final report to founder: concise **what changed / verified tests / current running status / spend / any blocked authorizations / where to open it / commits and evidence paths**. Explicitly say what is incomplete. Do not claim success from a screenshot alone.

**Start now by inspecting the existing repository and reading the master spec. Implement Issue #01 homepage restoration immediately after the baseline protection, then continue through all 28 without restarting product discovery.**
