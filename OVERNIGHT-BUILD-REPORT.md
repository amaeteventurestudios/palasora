# Palavva overnight build report

**Night of 2026-10-08 → 09 (PT).** Built and tested entirely on your Mac at `/Users/amaeteumanah/Projects/palavva`. **Oracle was not contacted. Hetzner was not contacted. No money was spent.** `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false`.

## Start here (2 minutes)

```bash
cd /Users/amaeteumanah/Projects/palavva
scripts/status.sh                 # everything should already be running (production build)
open http://127.0.0.1:3000        # public site
open http://127.0.0.1:3000/admin  # Command Center: log in as editor@palavva.local
```

The password for all local accounts is `LOCAL_DEMO_PASSWORD` in `.env.local` (generated; not committed). If the stack is down, run `scripts/dev-up.sh --prod`. The full runbook is in `docs/LOCAL-DEVELOPMENT.md`, and a 20-minute review checklist is in `docs/evidence/LOCAL-ACCEPTANCE.md`.

**Your first decision:** two **real** SAnews.gov.za stories, drafted overnight by **real Qwen**, are waiting in **Editorial Queue**. I deliberately did not approve them; publishing real news needs a human editor.

## What was completed

| Phase | Status | Highlights |
| --- | --- | --- |
| 0 Audit | Done | Mac inventory (x86_64, macOS 12.7.6, 32 GB, **31 GB disk free, 93% full**); unrelated apps on 8090/3100 left alone, so Palavva uses 3000/8190/8100. OpenMolt audited at `1be0e28`: MIT, but Next 14.1 + Express/Postgres, 3 failing tests, typecheck failure and 21 advisories (3 critical), so **ideas reused, no code copied**. PocketBase 0.40.5 pinned and checksum-verified. Web deps: `pnpm audit` 0 known vulnerabilities. |
| 1 Public app | Done | Next.js 15.5 SSR, Midnight + Tangerine tokens (light/dark), every route in `03`, the 7 feed modes, country/topic URL filters, FTS search, story/discussion pages (What happened / Why it matters / sources / evidence anchors / AI analysis / unknowns / Time Lens / conversation), profiles, communities, founders, trust pages with the `06` copy, tenant-bound sessions, sign-up with mail-sink verification, draft-preserving sign-in sheet, votes/saves/follows/reports/corrections/submissions. |
| 2 News + AI | Done (real) | Rights-gated registry, SSRF-safe fetch, XXE-safe parsing, dedup/clustering, durable SQLite queue, Qwen provider (concurrency 1) plus a labeled fixture provider, curator→researcher→writer→validator→≤3 roles, a DB-level publish gate. **Real run:** SAnews RSS → 10 items → 74 real Qwen calls → **2 drafts in review**, 8 held. |
| 3 Distribution + analytics | Done | Canonical/OG/Twitter metadata, 1200×630 share cards, sitemap/robots (noindex until launch), JSON-LD rules, share intents, consent-gated first-party events → DuckDB → dashboard. |
| 4 Commerce + tenancy | Done locally | Honest `/advertise` with a durable inquiry and EspoCRM adapter (`NOT_CONFIGURED`), a Revive slot that only renders when approved (otherwise collapses), founder/business verification labels, **Sample Africa Community** tenant with its own branding and fully isolated data. |
| 5 Hardening | Done locally | Backup + verified restore drill, loopback-only check, load test, outage drill, axe WCAG 2.2 AA, Dockerfiles + Compose (amd64 build and loopback smoke test passed), runbook, `scripts/test-all.sh`. |

## Tests (all actually run; logs in `docs/evidence/test-runs/20261009T065138Z/`)

| Suite | Result |
| --- | --- |
| TypeScript typecheck | clean |
| Vitest (web units) | **17/17** |
| pytest (unit + integration against an isolated PocketBase) | **39 passed**, 3 opt-in skipped |
| pytest real Qwen (`PALAVVA_REAL_QWEN=1`) | **4/4** (structured output, role abstention, prompt injection, outage) |
| Playwright E2E (functional, tenant isolation, analytics, outage, axe a11y both themes) | **32/32** |

**42-test matrix** (`docs/evidence/TEST-MATRIX.md`): **29 PASS, 4 PASS-local with the external half BLOCKED, 8 PARTIAL, 1 BLOCKED, 0 FAIL.** All 10 end-to-end demonstrations work, except #4 on real news, which waits for your approval (it is proven on fixtures).

**Real bugs the tests caught and I fixed:** duplicate dialog label IDs (screen readers would have read the wrong field), a stale header after sign-in plus a lost `next` destination (server-action redirect rendering), same-page `#hash` navigation not reloading, a concurrent vote-delete race, a footer ARIA violation, an inaccessible scrollable table, two editorial workers running at once (now prevented with a lock), and a fixture mis-detection that hid AI role output.

## Measurements

- **Qwen (real, over DERP relay):** curator 12–36 s (mean 17.7 s), researcher ~23 s, writer ~21 s; about 46k input / 14k output tokens across 74 calls; no timeouts. **Finding:** the 4B model abstained in 20 of 31 researcher calls. That's safe but low-yield. Richer permitted excerpts or a larger local model would raise output.
- **Load (production build on this Mac):** home 68–76 req/s, p95 192 ms at 10 concurrent and 1.36 s at 100 concurrent; zero errors; zero SQLite lock contention; web RSS ≤ 0.95 GB, PocketBase ≤ 123 MB.
- **Containers (idle):** ~205 MB total across 4 services.

## Screenshots (`docs/evidence/screenshots/`, from the running app)

Home and story at 320/390/768/1440 in light and dark (`home-*`, `story-*`); Command Center modules (`admin-*`); **the real SAnews draft under review** (`dev-real-draft-review-1-1440.png`, `dev-real-editorial-queue-1440.png`); the published fixture story (`e2e-published-fixture-story-1440.png`); the sample tenant site and admin (`tenant-sample-*`).

## Git commits

| Commit | Summary |
| --- | --- |
| `83e9855` | Import Palavva specification package v1.2 and brand assets |
| `05cdcb0` | Phase 0: Mac audit, OpenMolt decision, PocketBase schema/hooks, seed, local scripts |
| `34ba065` | Phase 1: Next.js app shell, design tokens, feed modes, story detail, member actions |
| `733ce0c` | Phase 1: all public, member, trust and commerce routes; tenant-bound sessions |
| `804f028` | Phase 2: editorial service with 38 passing tests |
| `bb4de61` | Phase 2–4: Command Center, publish gate, corrections, SEO/OG, API v1, SAnews rights review |
| `a3dc5e9` | E2E test stack, Playwright + vitest; fixes |
| `438cb70` | Full E2E suite; auth navigation fix |
| `80f7515` | Phase 5: backup/restore, Docker/Compose, load tests, feed cache, axe suite |
| `c87369f` | Outage E2E, real-Qwen tests, network evidence, SBOM, scripts |
| `6d384de` | Evidence docs, ADRs, real-draft screenshots |
| *(final)* | This report |

The repo has no remote; nothing was pushed.

## Decisions I made that you should know about

1. **SAnews.gov.za approved provisionally** for local ingestion, based on its published user policy ("free of charge… credit SAnews.gov.za"; photos credited to the DOC, and I copy none). Verifier is recorded as "build-agent (pending founder/legal confirmation)". Evidence: `docs/evidence/sources/SANEWS-RIGHTS-REVIEW.md`. One click on **Revoke** undoes it. All other candidates stay pending/disabled.
2. **Prompt clarifications** (researcher-v2, writer-v2) after real Qwen refused to use valid excerpts; the validation gates were not loosened (ADR-013).
3. **AI quota raised 60 → 100 requests/day** (audited) so the remaining real clusters could be drafted; concurrency stayed at 1 (ADR-016).
4. **Demo fixtures** (six fictional stories plus one business) are visible on the platform tenant with gold "Demo content" badges, `noindex` and `example.invalid` sources. Set `SHOW_DEMO_CONTENT=false` for the real empty state (ADR-010).
5. Native services rather than Compose for the running stack (Colima VM is small and amd64-only); Compose is built and smoke-tested (ADR-001).
6. All decisions are recorded in `docs/evidence/DECISIONS.md` (ADR-001…019).

## Blockers and items needing your approval

| Item | Status | Needed from you |
| --- | --- | --- |
| Real news publication | 2 drafts waiting | Review/approve in the Editorial Queue |
| SAnews rights | Provisional | Confirm, or revoke |
| ARM64 images | BLOCKED: `docker buildx`/QEMU not installed | Approve installing buildx (Homebrew) |
| Off-host backups | BLOCKED | Choose a destination |
| EspoCRM / Revive live integration | BLOCKED: no credentials, Hetzner untouched | Provide read-only access when ready |
| Oracle Phase 6 private staging | Not started (by policy) | Explicit approval; plan in `docs/evidence/APPROVAL-GATES.md` |
| Terms / Privacy | Placeholder "not yet published" pages | Counsel-approved text |

## Remaining work (honest gaps)

- Session-expiry time-travel test; member self-edit of comments; malicious-business-URL test; 30-day analytics purge exercise; manual screen-reader pass; code-rollback rehearsal (T-009/012/032/028/040/042 PARTIAL).
- Time Lens has no verified archival records, so only the honest empty state exists (T-023). The Article JSON-LD path gets exercised once a non-demo piece is published (T-026).
- SSRF DNS-rebinding hardening (pin the validated IP) before any public launch (ADR-012).
- Editorial QA panel on 30+ rights-cleared evaluation packets (`08`) has not been done.
- The disk is 93% full (31 GB free). Watch it before building multi-arch images.
- Newsletter, premium, payments, external agents and Arabic/French/Swahili localization are deferred per `18`.

## Where everything is

`apps/web` (Next.js), `services/editorial` (FastAPI + worker + tests), `services/pocketbase` (migrations, hooks, pinned binary), `infra/` (Docker/Compose/Caddy example), `scripts/` (dev-up/down, status, test-all, test-stack, backup, restore-drill), `docs/LOCAL-DEVELOPMENT.md`, `docs/evidence/` (audit, decisions, matrix, acceptance, deployment state, approval gates, phase results, progress log, screenshots, test runs), `docs/OSS-SBOM.md`, `docs/OSS-ATTRIBUTION.md`.
