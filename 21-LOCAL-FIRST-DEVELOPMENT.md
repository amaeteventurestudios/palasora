# 21. Local-first development and Mac acceptance gate

**Status:** Founder-approved sequencing change, October 8, 2026, subsequent to the original 2026-10-08 handoff and Midnight + Tangerine brand decision. **This document supersedes any earlier instruction to stage or inspect Oracle during the initial implementation mission.** It does not replace the settled eventual Oracle ARM64 target or the original product scope.

## 1. Absolute execution boundary

**Build, run, review, and test the entire MVP on the founder's Mac first. No deployment, code copying, SSH connections, runtime modifications, read-only inventories or staged jobs to the Palavva Oracle instance during phases 0–5.** Do not attempt `ssh`, `scp`, `rsync`, remote Docker contexts, GitHub actions that deploy to Oracle, registry-to-Oracle delivery, Oracle API/console operations, DNS changes or public internet exposure. The existence of a configured SSH key is not authorization to use it for this local mission.

Treat the previous `palavva-prod` instance and historical service tests as **architecture context only**. Keep `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false` until explicit founder instructions change the respective gate. Recording these values in evidence files does not itself change policy.

A local web app is not an Oracle deployment. Running limited outbound HTTP requests from the Mac to **rights-permitted** sources for development is allowed; optional authorized Tailscale calls to the existing Qwen iMac are allowed, with no changes to that host. Revive/EspoCRM can be represented by **local adapter fixtures**; read-only external connectivity checks may be run if credentials and permission already exist, but make no remote changes or live advertisement purchases. Remote failures do not block unrelated local work. Use a test mail sink, not real unsolicited user emails.

## 2. Correct starting directory

Target existing founder Mac folder `/Users/amaeteumanah/Projects/palavva`. It currently holds design/spec Markdown and assets, not verified application source. **Preserve all existing files**. Inspect current content before adding work. Recommended implementation roots inside that same folder: `apps/web`, `services/pocketbase`, `services/editorial`, `services/analytics`, `infra`, `scripts`, `docs/evidence`. Existing spec files remain in place, whether at root or grouped under `specs` after a reversible, documented change. Do not create a nested `palavva/palavva` clone or delete the Markdown pack.

## 3. Phase 0: inspect the actual Mac, not Oracle

Record (no credentials displayed): operating system/version, CPU architecture (`uname -m`, e.g. `x86_64` or `arm64`), free memory/storage, installed Node/pnpm, Python, Git, Docker CLI **and running daemon**, Compose, available virtualization, networking/loopback ports, existing project tree, Tailscale client and local firewall state. Never guess this Mac is Apple Silicon. Pin a supported Node LTS release, Python minor version and PocketBase binary/platform version based on actual compatibility and security audit. Determine whether any running application or process would conflict; never stop unrelated processes automatically.

**Docker fallback:** use an existing working Docker Engine/Desktop or Colima if available. Docker CLI existing does not mean a daemon runs. If Colima fails because QEMU is missing or VZ is unsupported, inspect available engine/virtualization, then choose the lowest-risk supported route. Do not endlessly retry a broken hypervisor, silently install a massive toolchain, or change host virtualization/system configuration without approval. If no viable Docker daemon, run Next.js, PocketBase and Python services natively for local development, test real integration, and prepare Compose files for later. Containerized acceptance is required when feasible, but must not block useful native work.

Audit OpenMolt upstream license, code and dependencies before reuse. It may be a Prisma/PostgreSQL application and is **not** a PocketBase drop-in. Record reuse decision and pinned versions. Build the settled Next.js/TypeScript + shadcn/Tailwind, PocketBase/SQLite and Python/FastAPI stack and Midnight/Tangerine interface locally.

## 4. Local service diagram

```text
Local browser on the Mac: http://127.0.0.1:3000
    |
    +-- Next.js SSR/BFF (Mac native or local Compose, loopback only)
          |
          +-- PocketBase/SQLite (private service, 127.0.0.1:8090 if native)
          +-- FastAPI editorial + durable SQLite jobs (127.0.0.1:8000 if native)
          +-- first-party events -> local files/Parquet + DuckDB
          +-- local sponsor adapter + mock Revive zones/EspoCRM outbox
          +-- model provider interface:
                A. deterministic fixture provider for hermetic tests
                B. optional existing Qwen on Simeon's iMac via private Tailscale

No Oracle connection or code transfer during local development.
```

If a local Compose bridge is used, only publish web to `127.0.0.1:3000` and bind optional developer-only ports to loopback. Keep app-to-PocketBase/editorial traffic on private Docker networks. Avoid exposing an unrestricted PocketBase admin UI; protect superuser credentials and admin collections. Do not store private tokens in client-visible Next.js variables. Hostname/port defaults are **examples**; detect conflicts and document chosen values.

The browser should never connect directly to Ollama. When Qwen is absent, the worker queues or defers real draft jobs while using deterministic **clearly labeled fixture outputs only in testing/demo mode**, never falsely publishing synthetic editorial as genuine news. Do not download multi-GB model weights to the founder's Mac unless specifically approved. Test real Qwen through tailnet only if private access works, without modifying Simeon's iMac or exhausting its resources.

## 5. Realistic local workflows

- **Fast feedback:** native Next.js dev and Python reload with a private PocketBase process or Compose equivalents; no production hot-reload servers on Oracle.
- **Repeatability:** document exactly how to start, stop, seed, reset only test data, migrate, back up, restore and inspect logs in `LOCAL-DEVELOPMENT.md` generated by the coding agent. Include `scripts/dev-up`, `scripts/dev-down`, `scripts/test-all` or reasonable cross-platform equivalents based on actual host. Never delete a real PocketBase dataset as part of reset scripts; test and dev data must be separately named and backed up.
- **Tests:** run all 42 documented test cases against local software whenever their subject is local. `T-001` becomes a two-part test: Mac compatibility and no remote mutation; Oracle port/ARM runtime checks are deferred until expressly approved. `T-019` requires one **real** Qwen response to pass; hermetic provider tests alone do not satisfy it. Live external Revive/Espo integration is blocked if not available, while outbox/idempotency/labels/fallback can pass locally. Mark each row PASS, FAIL or BLOCKED with evidence. Do not claim an ARM64 image has run on Oracle when it has only been built on Mac.
- **Visual QA:** use the supplied Midnight/Tangerine design SVG/PNG drafts and current copy. Capture actual browser screenshots of the running UI at 320, 390, 768 and 1440, both themes, keyboard navigation, JS-disabled SSR and meaningful real app flows.
- **Editorial QA:** one locally approved, rights-permitted news source if permission can be verified, plus explicitly labeled fixtures for adverse cases. Human editorial approval is mandatory for sensitive content. Preview unpublished/dummy material behind noindex/local-only protection.
- **Security/operations:** test CSRF/XSS/SSRF, auth/tenant boundaries, rate limits, job retries, Qwen offline, durable inquiry storage, PocketBase SQLite backup + restore, disk growth and disabled external provider billing.

## 6. Local acceptance gate

**The coding agent must stop with the app on the Mac, not with an Oracle upload.** Provide:

1. Running local site and exact loopback URL, with real source/editorial data status clearly distinguished from fixture demos.
2. Complete working app code, install/start/stop scripts, actual migrations, lockfiles, `env.example`, attribution and OSS licenses.
3. Screenshots, real E2E/unit/integration reports, 42-case matrix with PASS/FAIL/BLOCKED, quality review and dark/light/mobile checks.
4. Native/Compose health and CPU/RAM/disk measurements on the Mac; no implied measurements from Oracle.
5. Successful local backup/restore and tenant-isolation test; security failure list if unresolved.
6. Deploy-ready **source, Dockerfiles and Compose configuration** for eventual Linux ARM64; where possible multiarch build verification by inspect/buildx. Actual Oracle ARM64 runtime verification is deferred until approval.
7. `docs/evidence/LOCAL-ACCEPTANCE.md`, `docs/evidence/DEPLOYMENT-STATE.md` recording `ORACLE_DEPLOYMENT_AUTHORIZED=false`, plus concise founder handoff instructions for reviewing Palavva locally.

Ask the founder to approve **a new, separate deployment phase** once the app works to their satisfaction. No unattended transition to Oracle, even if all tests pass.

## 7. Post-approval release plan (not part of this mission)

**Phase 6, only after explicit authorization:** read-only Oracle infrastructure/ingress/space/billing audit; backups and deployment change plan; package verified ARM64 images; deploy into isolated Oracle **private staging only** (not live DNS or public port opening); run smoke tests, end-to-end checks, tenant isolation and restore drill. No unrelated server changes. **Phase 7, a second distinct authorization:** public domain/DNS/HTTPS/firewall changes and public publishing after all policy/legal/source checks. Permission to stage does **not** grant permission to launch publicly. Release/rollback instructions should exist before any future transfer.

## 8. Versioning and precedence

`21-LOCAL-FIRST-DEVELOPMENT.md`, and its corresponding updated `19-AUTONOMOUS-BUILD-PROMPT.md`, `18-IMPLEMENTATION-PHASES.md`, `16-DEVOPS-SECURITY-BACKUPS.md`, `17-TEST-PLAN-AND-ACCEPTANCE.md` and `README.md`, supersede **earlier Oracle-first timing or permission language only**. Midnight + Tangerine remains definitive. The original handoff remains an unedited historical record.
