# 10. Technical architecture, OSS reuse and integration boundaries


> **Execution order v1.2:** This document's original diagram below describes **future Oracle deployment**, not where phases 0–5 run. The founder approved Mac local-first development. `21-LOCAL-FIRST-DEVELOPMENT.md` is authoritative for local runtime, loopback binding and the no-Oracle boundary. Do not connect to Oracle during this mission.

## Current development topology, on the Mac

```text
Mac localhost browser http://127.0.0.1:3000
  → Next.js (SSR + typed BFF)
      → PocketBase/SQLite (local, internal/loopback only)
      → FastAPI source/editorial jobs + SQLite queue (local)
      → Analytics event buffer / Parquet + DuckDB (local)
      → Revive/EspoCRM adapter fixtures / durable inquiry outbox (local)
      → Qwen provider: test double for hermetic QA or existing private Tailscale iMac

Oracle ARM64 = eventual staging deployment ONLY AFTER new approval.
```

The Mac hardware architecture is unknown until inspected. First select native local runtimes/containers that work with **this actual Mac**, then produce multiarch/ARM64 Dockerfiles without making an ARM64 laptop a prerequisite. Never silently target Oracle during build, CI or tests. Avoid automatic cloud billing, DNS changes and modifications to unrelated machines.


## System diagram

```text
Public browsers / social preview bots / search crawlers
                 |
           HTTPS + CDN optional (not yet configured)
                 |
       Caddy reverse proxy (Oracle ARM64)
                 |
     Next.js / TypeScript SSR + Server BFF
        |         |              |
 PocketBase private |       first-party events collector
 (SQLite, auth,    |       buffered events -> Parquet/DuckDB
 files, data)      |
        |       Python/FastAPI editorial worker + SQLite durable job queue
        |                    |
        |               provider adapter (bounded)
        |                    |
        |        PRIVATE Tailscale / Ollama -> Qwen on Simeon's iMac
        |
        +-- secure outbound bridge -> existing Revive/EspoCRM on Hetzner
                 |
            external backups (configured before acceptance)
```

All non-public services are private-only Docker networks or loopback bindings, not Oracle public IP interfaces. Next SSR accesses data through a typed repository; do not send PocketBase admin, CRM or inference credentials to the browser. No direct in-browser AI call. No model weights on Oracle.

## Runtime stack and status as of handoff

- Oracle compute `palavva-prod` / SSH host `palavva-vnic`, Ubuntu 24.04.5 ARM64, 2 A1 OCPU / 12 GB configured, public IP `129.146.26.28`, Docker 29.1.3 and Compose 2.40.3 previously tested, Tailscale address `100.107.93.83`.
- Ollama Qwen `qwen3.5:4b` on Simeon's iMac at previously tested tailnet address `100.70.149.32:11434`; successful single generation previously recorded, **not** sustained load verification; Tailscale link was DERP relayed at check time.
- Existing Revive Adserver and EspoCRM previously deployed on Hetzner with unrelated services; must inspect health and integration capabilities, not redeploy.
- OpenMolt not verified checked out or adapted. PocketBase not installed; no Palavva app deployed. DNS/HTTPS not configured.

## Repository shape [implementation default]

```text
palavva/
├── apps/web/                  # Next.js app router + shadcn/Tailwind
│   ├── app/(public)/          # SSR public site
│   ├── app/(auth)/            # member auth
│   ├── app/admin/             # admin/editor access
│   ├── app/api/v1/            # thin typed BFF routes
│   ├── components/            # reusable feed/source/AI/sponsor UI
│   └── lib/                   # data repository + auth + tenant resolution
├── services/editorial/        # FastAPI + worker jobs + source plugins + AI
│   ├── providers/            # Ollama and disabled cloud adapters
│   ├── ingestion/            # safe RSS, normalization, clustering
│   ├── editorial/            # prompts, claims, stages, review
│   ├── jobs/                 # durable bounded scheduler
│   └── tests/
├── services/pocketbase/       # pinned binary, migrations, hooks, ACL tests
├── services/analytics/        # event ingest + safe ETL + report exports
├── packages/contracts/        # OpenAPI/Zod JSON schema shared types
├── infrastructure/compose/    # ARM64-friendly Docker Compose variants
├── infrastructure/caddy/      # reverse proxy configs
├── scripts/                   # audit, backup, restore, smoke, test helpers
├── tests/e2e/                 # Playwright full-browser tests
├── docs/specs/                # this package
├── docs/evidence/             # executed results and decisions
└── .env.example               # keys omitted, documented expected vars
```

Do not spend first week restructuring OpenMolt just to match this ideal tree. Reuse real upstream structure where it is simpler; preserve traceability to origins.

## OpenMolt: mandatory empirical decision procedure

1. Clone a fixed commit to isolated working directory and record commit SHA, license text, external images/assets licenses, last meaningful commits, package manifests, lockfile, update status and dependency advisories. **README can disagree with source.** Do not assert MIT license solely because README says MIT; confirm `LICENSE` and reuse obligations.
2. Locate actual Next.js roots, package scripts, Prisma schema/Express/Postgres use, auth/session implementation, feed logic, comment/vote/moderation, server routes and test suite. Run baseline build/test in bounded environment; document broken components and architecture.
3. Create a feature-by-feature reuse matrix: `as-is UI`, `adapt`, `replace incompatible data calls`, `drop unsafe`, `not present`. Reuse useful feed and social UI/actions when license/quality support.
4. Compare two **feasible** paths, without silently changing founder's SQLite decision: (A) fork OpenMolt UI/social flows and implement repository adapters to PocketBase; (B) selectively extract proven feed/UI components and build thin Palavva service around PocketBase. Score work hours/complexity, data dependencies, access control, maintainability, risk, ARM64 build.
5. Choose the safer least-invasive path; record `DECISION-OPENMOLT.md`, exact reused files/commit, provenance/attribution and any dependency/security limitations. If no license or unacceptable security, do **not** copy unlicensed/unsafe code; implement only compliant equivalents and explain.
6. Keep store adapters for user, feed, comment, vote, community, AI contribution, source records and tenancy so a later PostgreSQL migration is deliberate, not magical.

**Do not** try to point unmodified Prisma/PostgreSQL at PocketBase. **Do not** run an unapproved parallel Postgres production stack as a shortcut. Actual upstream README reviewed in research described Next.js 14, React 18, Express and Postgres, but this description is *not* a completed code audit (https://github.com/ImGoodBai/openmolt).

## Container/runtime sizing [initial caps; benchmark and adjust]

| Service | Process count | Memory planning cap | Notes |
| --- | --- | --- | --- |
| Caddy | 1 | 128 MiB | Only bind public ports upon approval |
| Next.js web/BFF | 1 | ~512–768 MiB | Runtime image only; build elsewhere if possible |
| PocketBase | 1 | ~256–512 MiB | DB volume, WAL, backups; writer pressure measured |
| FastAPI worker+scheduler | 1 each or one combined initially | ~384–768 MiB total | Max 1 local inference in flight |
| Analytics collector/ETL | 1 bounded scheduled process | ~128–512 MiB | Batch, rotate; DuckDB heavier in short windows |

These are **design starting limits, not verified current consumption**. Avoid hard cgroup values that cause boot loops; tune after staging measurements. Keep disk reserve for Oracle's ~45 GB root. Build images on an off-host developer machine if ARM64 builds strain CPU/RAM.

## Data boundaries

- Browser ↔ Next.js BFF only for protected actions; public SSR cached carefully per tenant; sanitized HTML rendering.
- Next.js server ↔ internal PocketBase with tenant-safe collection/query layer, no direct admin API to user.
- Editorial workers ↔ explicitly scoped write/read service; private Ollama over tailnet only, no public port forwarding.
- First-party analytics collector append-only with no arbitrary personal payload; scheduled aggregated reporting.
- Revive receives approved zone requests; EspoCRM receives approved inquiry fields through server-only API. If these are down, site remains usable.
- Key material injected at runtime from server secret store, never saved in `public/`, source, browser or screenshots.

## Web performance

SSR published stories and cached navigation on public routes. Cursor pagination capped at 20. Prefer request coalescing and appropriate ETag/cache headers, invalidate on publish/correction. Don't cache per-user data into shared public response. Lazy-load nonessential scripts, ad slots and media below fold; set explicit image sizes. No `fetch()` of LLM from render path or user-facing AI token streams in MVP.

## Robust availability states

- Qwen down → serve already approved content, queue pending jobs, show real admin warning.
- Source feed down → retry with backoff, mark source stale and do not delete past stories.
- PocketBase write lock → bounded retry for idempotent mutations only, error visibility, load benchmark and alert.
- Analytics unavailable → queue or bounded drop policy; no public page outage due to metrics.
- Revive unavailable → clear or collapse sponsored slot, **never insert fabricated sponsor**.
- EspoCRM unavailable → durable local inquiry with retry and secure admin notice.
- Unknown tenant hostname → reject, not fallback to platform data.

## Open-source/adoption audit checklist

For PocketBase, Next.js, Caddy, feedparser, FastAPI, DuckDB, Playwright, Lucide, shadcn/ui, OpenMolt, Revive/Espo and optional Invoice Ninja, inspect repository license, trademark/branding restrictions, updated patches, CVEs/transitive dependencies, ARM64 images, support cadence, installation complexity, API permissions, active maintenance, and true cost. Record each in an OSS bill of materials with pinned versions and redistribution obligations. No unexamined runtime `latest` tags.

## Architecture decision records

Write brief ADRs for: OpenMolt reuse path, PocketBase collection/hook model, durable worker queue SQLite file, first-party analytics storage, Caddy HTTPS, secure tenant host mapping, editorial publish gate, Revive tags, off-host backups. Each ADR must state options, constraints, why chosen, rollback, verified test evidence and what would trigger change.
