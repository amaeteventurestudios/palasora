# 18. Autonomous implementation phases, dependencies and exit gates

**Project context:** Palavva MVP implementation specification.

## Project management contract

Execution goes through **bounded working phases 0–5 on the founder's Mac only**, with logged commits and verification after each phase. Do not ask founder to run 50 commands. **STOP at local acceptance; do not connect to Oracle or deploy there until the founder grants explicit permission for a separate Phase 6.** Only interrupt for permission-sensitive operations (spend, DNS/public ingress, changes to unrelated production systems, destructive actions) or a genuinely unrecoverable blocker. Keep progress checkpoint file and resume. Design isn't complete until full active controls work.

## Dependency diagram

```text
P0 Mac environment/security/license audit, no Oracle access
  ↓
P1 Working public SSR social foundation + schema/auth
  ├──→ P2 Real rights-cleared source ingest / Qwen editorial review
  ├──→ P3 SEO/share + first-party analytics
  └──→ P4 sponsor inquiry + Revive + demo tenant/isolation
                        ↓
P5 full Mac-local hardening + browser/security/restore/load gates
                        ↓
STOP: Founder reviews real local app and evidence
                        ↓ (new explicit approval required)
P6 Future Oracle private staging + ARM64 runtime re-test
                        ↓ (separate new explicit approval required)
P7 Future public DNS/HTTPS launch
```

## Phase 0. Audit, protect, architecture decision

**Input:** `00`–`21` docs and Mac local worktree; **no Oracle access, including read-only SSH.** **Work:** inventory Mac OS/CPU/RAM/disk, local tools/Docker daemon/virtualization, available loopback ports and source tree; audit OpenMolt license and actual app vs README; select PocketBase adaptation; verify rights-approved sources. Optional bounded Qwen over existing Tailscale; no remote host changes. External Revive/Espo access is optional and read-only only when already authorized; use adapters otherwise. Set project structure, pin toolchain/dependencies, version control, `.env.example`, ADRs and measured baseline. Create admin action/tenant service boundaries and source approval registry.

**Outputs:** `evidence/PHASE-0-AUDIT.md`, OSS SBOM/attribution, `DECISION-OPENMOLT.md`, baseline test/build output, architecture diagram and port inventory, local-first execution plan. **Exit:** license fit demonstrated or compliant alternative recorded, all work remains on the Mac; no Oracle connection attempted. Unavailable local Docker can use an audited native-development fallback without blocking app work.

## Phase 1. Real public social app

**Work:** clone/adapt approved OpenMolt components, implement Next.js SSR, Tailwind/shadcn visual tokens, brand, countries/topics, 6 feed modes, source-anchored story/discussion views, public profiles, search and responsive layouts; PocketBase schemas/auth/hooks and typed repositories; member comment/vote/save/follow, draft-preserving login, moderation starter, separate labeled demo tenant. Follow `04`, `05`, `06`, `09` exactly for route and language. Add content fixtures in tests/demo only, never disguise fixture as live article.

**Exit:** JS-disabled public read, mobile, main controls and deep links pass browser tests; unauthorized writes denied; no hot-path local LLM requests; real admin/editor auth available. Evidence screenshots at 320/390/1440, both themes and real API tests.

## Phase 2. Real news, evidence and AI editorial

**Work:** validate rights and connect 1–3 actual sources; safe parser, dedup/classification/story clustering and source health; job queue; Qwen provider over private tailnet with latency/quotas, optional cloud adapters disabled; researcher/curator/writer/role prompts, strict claim evidence IDs, human review and corrections; Times Lens archival registry with only verified records. Add pause switches and source revocation handling.

**Exit:** single approved source story produces accurate draft → human approval → published page with citations, actual Qwen latency trace; duplicate updates don't spam; high-risk cannot auto publish; Qwen offline doesn't break feed. If source rights incomplete, show verified hold and can test on permitted fixtures without claiming real-feed completion.

## Phase 3. Discovery and analytics

**Work:** metadata/canonical/OG generator and share intents (X, Facebook, WhatsApp, copy); sitemaps/robots, article-vs-forum schema rules; first-party event collector and DuckDB batches/aggregates, content/referral/AI metrics, admin charts with real empty states. Exact public and admin copy, correction and transparency pages.

**Exit:** crawler sees approved content without JS, share link works and preview file exists, period/source of metric displayed; consent privacy checks pass, AI actions excluded from human metrics; test report includes time/identity definitions.

## Phase 4. Business model and isolated sample tenant

**Work:** business and founder profiles, verification queue, independent vs paid spotlight labels, honest `/advertise` form, durable lead queue, EspoCRM API bridge or recorded retriable fallback; approved Revive zone integration (external service untouched except authorized configuration), strict sponsor label and privacy; isolate demo tenant by host/session/query/files/cache/analytics, theme change preview, quota placeholders.

**Exit:** inquiry saved with exact forward state, approved ad renders disclosure or safely absent; no independent AI sponsorship manipulation; hostile tenant A→B requests denied. No Hetzner writes; any external health status must be observed to be claimed, otherwise UNKNOWN. No live payments built.

## Phase 5. Local Mac acceptance, harden, prove (stop before Oracle)

**Work:** run full Mac-local site, native or local Compose. Prepare multiarch/ARM64 Dockerfiles and reproducible release instructions **without deploying**. Test loopback health, secrets, log rotation, rate limits, local backup/restore, source/AI outages, security, mobile/accessibility, load/SQLite contention, 42 cases with accurate BLOCKED status for external-only checks, real user-style E2E, screenshots and Mac resource metrics. Produce `LOCAL-ACCEPTANCE.md`. **No Oracle access or data transfer, no DNS/ingress changes.**

**Exit:** `evidence/IMPLEMENTATION-REPORT.md`, `LOCAL-ACCEPTANCE.md`, `TEST-MATRIX`, `DEPLOYMENT-STATE` stating `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `APPROVAL-GATES`, local run/stop commands, screenshots and risk/rollback evidence. Security/tenant/publishing failures must be identified; the stage remains local. Request founder review of the functioning Mac application and **stop**.

## Minimum acceptance slice (must work before polishing)

A real approved Africa-related source item → safe ingest → no duplicate spam → Qwen sourced concise explanation → editor review/approval → anonymous SSR page → WhatsApp share link → authenticated human response preserving draft → Command Center trace/source/performance → graceful Qwen offline. Then add sponsor and multi-tenant proofs.

## Phase 6. FUTURE ONLY, separately authorized Oracle private staging

No Phase 6 commands may be executed during the local-first mission. After founder approves moving beyond Mac, perform read-only Oracle and billing/firewall/port inventory, create rollback backup, transfer a known image/build through approved channels, run pinned ARM64 Compose privately, perform staging browser/inference/integration/security/restore tests and report differences. This stage is not a public launch.

## Phase 7. FUTURE ONLY, separately authorized public launch

A new explicit authorization after Oracle private-stage acceptance is required for DNS, public 80/443 ingress, live source publication, sponsors and any real payment integration. Legal, copyright, editorial and privacy sign-offs are launch blockers.

## Deliberate phase deferrals

- No fully autonomous publishing of contentious political/health/financial content.
- No constant resident 8-model agent cluster or auto-generated public bot discussions.
- No rewritten ad server/CRM, payment processor or enterprise billing system.
- No full national localization in Arabic/French/Swahili before real coverage/translation QA.
- No video studio, huge BI cluster, multi-region stack or bot engagement farming.

## Budget and environment safety

Where performance defaults conflict with real measured available resources, agent must tune down concurrency, delay nonessential analytics, build elsewhere, and record measured findings. No surprise paid API calls or free-tier upgrade. If code audit proves OpenMolt nonviable, record ADR and continue with feasible PocketBase-centered functional implementation rather than waiting for product brainstorming.

## Progress record format

Per phase: `commit SHA`, checked assumptions, artifacts made, test commands/output, real UX screenshots, failures/mitigation, measured resource use, known access blockers, exact next safe step. Final report must not claim a license, QA result, source permission or service health unless observed.
