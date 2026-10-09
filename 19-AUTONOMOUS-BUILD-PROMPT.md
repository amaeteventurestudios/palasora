# 19. ONE AUTONOMOUS IMPLEMENTATION PROMPT FOR CLAUDE CODE / CODEX / AVS FACTORY

> **Usage:** Provide the entire `palavva-specs` directory to the coding agent, then paste the text below as **one mission**. The agent should execute inside an authorized local worktree with existing SSH connectivity. This document is the requested command prompt, **not evidence that execution has occurred**.

---

## BEGIN AUTONOMOUS BUILD MISSION


### STOP: founder-approved Mac-first execution boundary (highest priority)

The founder has approved **local development and complete local testing FIRST**. Working directory on the founder's Mac: `/Users/amaeteumanah/Projects/palavva`. Build and run all Phase 0–5 services here, not on Oracle, using an existing working Docker daemon/Compose or safe native processes. The existing folder contains the specification and assets; do not remove/overwrite them or create a redundant nested checkout.

**DO NOT CONTACT, INSPECT, SSH INTO, UPLOAD TO, DEPLOY ON, RECONFIGURE OR CHANGE ORACLE AT ALL DURING THIS MISSION.** This restriction includes read-only audit, `ssh`, `scp`, `rsync`, remote Docker, OCI control-plane access, DNS/ingress, GitHub deployment automation and transferring artifacts to Oracle by any route. The key at `~/.ssh/palavva_oracle` is **not authorized for use in phases 0–5**. Do not treat prior handoff statements about Oracle as permission. All instructions elsewhere in this prompt/docs that previously granted local-agent permission to stage on Oracle are superseded by `21-LOCAL-FIRST-DEVELOPMENT.md`.

The private Qwen service on Simeon's iMac may be called **from the Mac over existing Tailscale** when safely available, without changing that host. A deterministic fake provider is okay for isolated tests only, explicitly labeled fixture. The Revive/EspoCRM adapters should work locally with sandbox/fixture behavior; never modify Hetzner. All cloud paid providers disabled. Actual integration status must be reported honestly.

**STOP when the complete app is demonstrably running and tested on the Mac.** Produce `docs/evidence/LOCAL-ACCEPTANCE.md`, screenshots and local runbook, report all failed/blocked checks. Then request a new explicit approval to begin **Phase 6: Oracle private staging**. That authorization is not implied here. Public launch is still a later, separately approved Phase 7.


You are the principal engineering, product, editorial-systems, security, UI/UX, QA and DevOps implementation agent for **PALAVVA**. Work autonomously through the complete documented MVP **on the founder's Mac**, create real working code, test as a human user and deliver a working **Mac-local acceptance environment**, not an Oracle staging deployment, with reproducible evidence. Do not merely generate plans or empty files. Do not make the founder issue commands one by one. Do not restart product discovery, ask the founder to reconfirm settled brand/stack/behavior or claim work is done because a file changed. **Use `README.md`, `00-PROJECT-HANDOFF.md` through `21-LOCAL-FIRST-DEVELOPMENT.md` as one binding package. Read `21` FIRST for the mandatory Mac-only execution boundary.** Read them in full, not only headings. Preserve decisions in the handoff.

### Founder-approved design override, binding before any frontend work

**BRAND CHANGE (2026-10-08): MIDNIGHT + TANGERINE IS FINAL FOR THIS BUILD.** The original handoff recorded an **exploratory** forest-green direction. The founder subsequently rejected green and selected **Midnight `#1B2030`, Tangerine `#E85E31`, Warm Gold `#F8C45C`, Ivory `#F8F5F0`**. `05-UI-DESIGN-SYSTEM.md` (new visual source of truth), `04-UX-SCREEN-SPECIFICATIONS.md` and `15-VISUAL-ASSET-BRIEFS.md` override **only** older color/style sketches in `00-PROJECT-HANDOFF.md`. All original product, architecture, news/editorial, ethics and staging decisions remain intact. Do not ask to reconfirm the palette and do not reuse the obsolete green assets or hex values.

**MUST IMPLEMENT:** Midnight masthead with white `palavva` wordmark and Tangerine dot; rich Ivory editorial canvas; clear dark type; restrained Gold Time Lens accents; high-contrast Tangerine selected tabs. `#E85E31` with white small text is ~3.46:1, so use `#C34218` for white-label primary buttons or use Midnight text on the bright Tangerine surface. Apply semantic tokens to Next/shadcn CSS, page variants, login sheets, admin, white-label platform template, share card/meta images, and light/dark mode. Do not just change a mockup or swap CSS variables in one screen.

**Design QA gate:** inspect desktop/mobile **actual running UI** and captured screenshots. First credible story begins above the fold. UI must feel like a confident modern African newsroom plus conversation platform, not a cold or institutional dashboard, generic white card grid, finance dashboard or oversized cinematic hero. Preserve all content-trust and sponsor labels. Check WCAG AA contrast, keyboard focus, reduced-motion, 320px horizontal overflow, nav/filters and both themes. The six `.svg` and `.png` concepts in `assets/` are design **starters**, not proof of a finished functional application. Future visual generation should use `15` separately for all VIS-01 to VIS-18 rather than a single collage.

### A. Mission summary

Build **palavva.**, an Africa-first AI-powered news, culture, history, entrepreneurship and discussion platform, target domain `palavva.com`. Canonical homepage line **“Africa has a lot to talk about.”** It must feel like a substantively richer, culturally relevant Moltbook/Hacker News: real, currently sourced news at the top, public read/share without logging in, country/industry filters, genuinely useful researched AI perspectives, contextual history, human community, honest founder discovery, active admin Command Center, analytics and transparent sponsor integrations.

Do not build a self-referential bot network. Do not fill the feed with fictional activity, shallow bot exchanges, synthetic comments, manufactured gossip, fake publisher quotes, unlicensed articles, invented metrics or bought endorsements. Human dignity, verified provenance, cultural specificity, accessibility and cost discipline are requirements.

### B. Settled stack and deployment topology

- Next.js + TypeScript SSR, Tailwind and shadcn/ui. Reuse secure usable components and flows from `https://github.com/ImGoodBai/openmolt` **after inspecting the actual commit, LICENSE, dependency tree and code**. Its README suggests a Postgres/Express arrangement; do not pretend Prisma/Postgres drop in to PocketBase. Record a feature reuse map and reasoned adaptation path. Do not rewrite valuable OSS reflexively.
- PocketBase + embedded SQLite is the intended auth/data/files MVP with migrations, hooks and server-side tenant access checks. Build typed repository interfaces for future PostgreSQL migration, not a database connection-string replacement story.
- Python/FastAPI worker: RSS/API/official source ingestion, rights registry, normalization, exact and semantic candidate dedup, story clustering, evidence retrieval, editorial drafts, safety/review, selective AI analyst roles and Time Lens. Durable minimal SQLite job queue, no Redis by default. SQLite FTS search initially.
- Local **Ollama `qwen3.5:4b`** on Simeon's iMac over private Tailscale is the first provider. Configure low concurrency (start one) and budgets, with OpenAI/Anthropic/OpenRouter optional provider adapters **disabled** unless operator explicitly activates with legitimate configured keys. Do not silently charge a paid fallback or send sensitive source material to cloud providers.
- Public app runs **only in a future separately authorized phase** on existing Oracle ARM64 Ubuntu 24.04 VM, 2 OCPUs/12 GB configured RAM, historical `palavva-prod` instance / `palavva-vnic` OS hostname, IPv4 `129.146.26.28`, SSH user `ubuntu`. Docker Compose was previously installed; verify. Known Mac-local SSH key alias is `~/.ssh/palavva_oracle`. Do not read/show/copy its secret contents or commit it. Host Tailscale was previously `100.107.93.83`, iMac previously `100.70.149.32:11434`; **these are context, recheck current reachability**. Tailscale model API must **never** be publicly exposed.
- Existing **Revive Adserver and EspoCRM on separate Hetzner** supply campaigns and advertiser leads. **Do not deploy duplicates, replace or restart unrelated Hetzner containers.** Use safe API/invocation integration and fallback. Do not build an ad server or CRM.
- Caddy HTTPS proxy when authorized, Compose ARM64 stages, first-party batched analytics/Parquet + DuckDB, PocketBase summary views, source rights, external encrypted backups, scoped tenancy and one distinct sample demo tenant.
- AVS Factory/Foundry, if available, is a **development aid**, not a permanent public AI editorial runtime. Preserve external Factory architecture.

### C. Authority / safety policy. Read before executing

You are authorized to inspect the Mac and local project source, edit/create app files in that Mac project workspace, build local containers or native processes, start a **loopback-only Mac development/testing environment**, run bounded unit/integration/E2E/QA tests, add schema/fixtures to local development data, and create masked local reports/backups. **You are NOT authorized to connect to Oracle, even for read-only SSH, or to stage anything there.** You have **no authority** to:

1. Purchase services, upgrade Oracle tenancy/resources, incur paid model API calls, or claim Oracle permanently free.
2. Make **any Oracle connection or deployment** without a new explicit founder approval after local acceptance. Do not change registrar/DNS or publish/enable internet ingress. Use Mac localhost during phases 0–5; Oracle private staging and public launch each require **separate founder approvals**.
3. Run destructive migrations without validated backup, remove unrelated files, alter existing Hetzner projects/Tailscale peers/Qwen host configuration, or disable firewalls as a shortcut.
4. Exfiltrate/print/upload secrets or private SSH key contents, commit `.env` values, show API secrets in UI/logs, or embed keys in screenshots. Ask for an authorized credential only through an appropriate secure means when genuinely required. Never ask to paste secrets into chat.
5. Silently publish unreviewed AI-generated political, personal-allegation, health or financial material. No source with ambiguous rights or synthesized historical quotations. No auto-publishing until a defined, reviewed policy exists.
6. Treat demo numbers/users/brands/news as true production data. Mark demo fixtures and never index them publicly.

When permission is required, **stop only that irreversible or high-risk operation**, explain exact requested change, effect and rollback, and continue other safe independent work. If external integration is inaccessible, build/test a genuine safe fallback, mark it **BLOCKED/DEGRADED** and proceed with nondependent phases. Do not ask routine implementation preference questions. Make reversible defaults and record them in ADR/evidence.

### D. Phase 0, inspect and choose reuse path before implementation

Perform read-only inventory of **this Mac**, including CPU architecture, macOS, disk, memory, Node/pnpm, Python, Git, working Docker daemon/Compose or native fallback, Tailscale capability and local loopback ports. **Do not run any Oracle SSH/API/host checks.** Verify live source candidates' rights and date context when allowed. Optional bounded Qwen probe from the Mac over private Tailscale; do not modify its iMac host. Existing Hetzner Revive/EspoCRM integrations may be tested through safe read-only calls only if already authorized; otherwise implement local fixture adapters and durable fallback.

Clone/pin OpenMolt in an isolated branch. Inspect actual Next/Express/Prisma code vs README; license file and third-party assets; maintenance/security; test baseline. Compare adaptation-to-PocketBase vs selective-reuse paths, score risk/effort, choose lowest-risk. Audit PocketBase version/ARM64, licensing, migration hooks/API and limitations. Create `evidence/PHASE-0-AUDIT.md`, OSS SBOM, `evidence/DECISIONS.md`, `DECISION-OPENMOLT.md`, baseline resource table, chosen stack/ADR, safe secret plan and rollback. Do not assume anything was already deployed beyond handoff observations.

### E. Implement in bounded increments, genuinely working

**Phase 1 public product:** implement the approved Midnight + Tangerine brand through a single semantic token system; inspect actual 320/390/1440 captures against the new asset references before passing the phase. Build all screens/routes described in `03`/`04`; code UI from `05`, actual copy from `06`; preserve brand name and both v's. Desktop homepage with above-fold first real story and small headline, responsive phone at 320/390, feed modes Live/Trending/Random/New/Top/Discussed/Discover, `All Africa` + independent country/topic/language filters, FTS search, published detail with source and dates, AI vs human vs sponsored labels, public profiles/communities, sign-in sheet restoring comment draft, member votes/comments/saves/follows, basic moderation. Real PocketBase migration, auth, server-side tenant checks and repository boundary. Source fixture data only in marked local/demo environment; don't present invented live headlines.

**Phase 2 ingestion/editorial:** implement the complete `07` source registry with rights allowlist, SSRF-safe RSS/API fetch, source normalization, dates, rights, idempotency, dedup, update clustering and source health. Connect 1–3 **actually verified permitted** sources; if rights unavailable, don't scrape them anyway. `08` defines Curator, Researcher, Editorial Writer, 8 selectable **role configurations over one model**, Time Lens, Claim Validator and Distributor. Select 1–3 **distinct** contributions, with abstention and stop rules. Evidence claim IDs must resolve to actual source records; gate invalid claims/citations and all medium/high-risk items for human approval. Build reviewed stories with `What happened?`, `Why it matters`, optional sourced historical comparisons, corrections and publisher links. Realtime AI generation is NOT part of public page render. Implement pauses/quotas and Qwen-unreachable behavior; never promote AI approval as journalism.

**Phase 3 organic reach + real telemetry:** canonical SSR pages, source timestamps and links, search metadata, sitemap/robots/index guards, proper Article vs genuine human forum schema, working OG 1200×630 social cards, WhatsApp/Facebook/X/copy share buttons with real canonical links, first-party analytics events with consent and privacy, DuckDB/Parquet aggregates and actual admin cards. Zero, missing and not-connected are distinct states. No fictional growth/SEO claims.

**Phase 4 sponsors + tenancy:** honest Advertise page/form, secure durable inquiry storing and retry to existing EspoCRM when accessible; Revive preapproved zone tags only, visible `Sponsored`, honest Revive data source or connection warning. Founder/business verification foundation, independent vs sponsored spotlight distinction. Create platform tenant and **one actually separate branded sample tenant** with scoped auth, files, feeds, search, caches, events and quotas; run hostile cross-tenant tests. Defer full billing (schema placeholders only) and external agent economy.

**Phase 5 harden + Mac local acceptance:** run the complete application on Mac localhost through safe Compose or native processes; verify scoped secrets, health checks, local SQLite backup and restore, monitoring, retries/idempotency/dead letters, security, actual browser E2E/viewport screenshots, source/copyright/quality, accessibility, Mac performance/load and rollback. Prepare multiarch/ARM64 Dockerfiles and Compose manifests as **local build artifacts only**, no transfer or remote execution. All services except explicitly permitted outbound provider/rights-cleared source requests must be Mac local. Confirm no sensitive local services listening publicly. **STOP before Oracle**; prepare a written proposal for a separately authorized Phase 6.

### F. Editorial quality rules that cannot be compromised

- Make news interesting because of factual relevance, plain-English explanation and a meaningful question, not sensationalism. Nigeria, Ghana, Kenya, South Africa, Egypt and other African countries matter; allow later Senegal, Côte d'Ivoire, Rwanda, Tanzania, Morocco, Ethiopia, DRC and eventual 54-country reach. English first; do not claim full Arabic/French/Swahili localization already works.
- Include culture, music, fashion, history, food, events, telecom, banking, industry, entrepreneurship, mobility, manufacturing, technology, policy and philosophy. Not every item is a debate. Silence beats empty posting.
- Sourcing and human dignity win. Claims and citations must be traceable. Pay special attention to time, currency, source rights and what historical parallels cannot establish.
- Every AI card labels its role as **AI**, never a synthetic human or pretend source. Maximum 1–3 useful specialists/story, usually fewer. No AI voting or comments to manufacture engagement; human metrics exclude generated agent posts.
- Sponsors buy labeled placement, not opinions or favorable AI conclusions. AI source text is untrusted input and cannot control shell/tools, credentials or publication state.

### G. Required objective acceptance tests

Run and record the 42 individual tests `T-001`–`T-042` in `17-TEST-PLAN-AND-ACCEPTANCE.md` plus the 10 E2E launch demonstrations; no substitute such as compiled code or canned screenshots. Unit, integration, browser, security, privacy, tenant, SEO, load, outages and restore. Confirm source rights and at least one genuine approved feed as a **separate gate**. Test browser UI like a human by clicking all significant controls, entering forms, logging in/out, viewing dark/light at 320/390/768/1440 and inspecting screenshot results. Confirm links and actions are working, not just styled. Measure real **Mac** resources, Qwen latency/timeout/token data when available and SQLite contention; do not report unexecuted tests as passed. Explicitly mark Oracle/ARM runtime tests blocked pending Phase 6 permission, not passed.

At minimum prove: approved external event comes in → classified/clustered/no duplicate → sourced Qwen analysis → reviewer sees evidence and approves → human-readable SSR page → anonymous WhatsApp/Facebook share → preserved draft after sign-in → human comment and accurate count → real admin observability → sponsor inquiry/revived ad integration or genuine fallback → isolated sample tenant → Qwen outage resilience and restored backup.

### H. Work tracking and final deliverables

Create committed **Mac-local** source repo, pinned lockfiles/dependencies, verified OSS attribution, actual PocketBase migrations, worker tests/prompt versions, safe `.env.example` (NO SECRET VALUES), future ARM64 Compose and Docker build recipes (not deployed), Mac `localhost` startup/shutdown/test scripts, responsive UI, generated/approved share/brand files, visual asset inventory, real browser screenshots, source registry and approved examples, localhost URLs, rollback instructions, audit and tests.

Maintain continuously:

- `docs/evidence/DECISIONS.md`: all implementation defaults and code audit deviations from source, with reasons and rollback.
- `docs/evidence/PHASE-0-AUDIT.md` and one `PHASE-n-RESULT.md` per phase: inspected context, implemented code, pass/fail and measured metrics.
- `docs/evidence/TEST-MATRIX.md`: all `T-001`–`T-042`, status **PASS/FAIL/BLOCKED**, actual evidence references and issue IDs.
- `docs/evidence/DEPLOYMENT-STATE.md`: **Mac only**, local processes/containers, ports, backup/restore status, source approvals, `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`.
- `docs/evidence/LOCAL-ACCEPTANCE.md`: actual working Mac URL, all real user flows, screenshots, PASS/FAIL/BLOCKED matrix, Mac performance/health, missing external integration, approval request for future Oracle stage.
- `docs/evidence/IMPLEMENTATION-REPORT.md`: concise executive summary, what works for a real user, changes by phase, services touched/not touched, measured health and costs, screenshots, known blockers/severity, high-risk unresolved rights/security, next safe step and exact approvals needed.

When problems occur, diagnose and fix within safe authority, rerun tests, record evidence. Never hide failures or mark them complete. Make progress with local fixtures when remote access unavailable, and report the exact untested remote gate. Do not stop at a broad to-do list, installation notes, or a repository skeleton. Do not ask redundant questions or require the founder to babysit terminal execution.

### I. Completion criterion and stop condition

Stop when the entire **Mac-local MVP** and all locally feasible tests are genuinely complete or a material, specifically documented external/legal/authorization blocker prevents further safe implementation. **DO NOT continue to Oracle automatically under any circumstances.** If some optional capability is deferred, report that plainly; do not fake revenue, connectivity, feeds, admin metrics or customer tenants. Request new explicit authorization **before even inspecting or transferring to Oracle (Phase 6)**, then a separate permission before public DNS/firewall/launch (Phase 7), paid resources or destructive cross-service changes. Your last answer must be an evidence-backed implementation report, not promises to do it later.

**START PHASE 0 NOW. DO NOT RESTART BRAINSTORMING. BUILD AND TEST PALAVVA.**

## END AUTONOMOUS BUILD MISSION
