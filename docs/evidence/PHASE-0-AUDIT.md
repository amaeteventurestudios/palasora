# Phase 0 audit: Mac environment, OSS reuse, architecture

**Executed:** 2026-10-08 (US Pacific) / 2026-10-09T04:5xZ UTC, by the autonomous build agent on the founder's Mac.
**Oracle:** not contacted. No `ssh`, `scp`, OCI or remote Docker commands were run. `~/.ssh/palavva_oracle` was not read or used.
**Hetzner (Revive/EspoCRM):** not contacted. No credentials exist in this workspace; integrations are built as local adapters (see Phase 4).

## 1. Mac inventory (T-001 part 1)

Raw capture: `docs/evidence/phase0/t001-mac-inventory.txt`.

| Item | Observed |
| --- | --- |
| OS | macOS 12.7.6 (21H1320) |
| CPU | **x86_64** Intel Core i7-6700K, 8 logical cores (not Apple Silicon) |
| RAM | 32 GiB |
| Disk | 466 GiB volume, **34 GiB free (93% used)**. Risk: keep build artifacts, images and backups small |
| Node / pnpm | v24.14.1 / 12.10.1 (pnpm has a `minimumReleaseAge` supply-chain policy; respected) |
| Python | 3.11.15 used for services (3.14.8 also present) |
| Git | 2.56.0 |
| Docker | client 29.8.2, server 29.5.2 via **Colima 0.10.3** (Ubuntu VM, x86_64, 4 vCPU, ~5.8 GiB). Compose 5.5.1. **`docker buildx` is not installed** |
| Tailscale | 1.102.4, logged in; Simeon's iMac peer visible |
| macOS application firewall | **Disabled**. Palavva therefore binds every service to `127.0.0.1` explicitly |

### Port inventory and chosen ports

Pre-existing, **unrelated** listeners were found and left untouched: a PocketBase on `127.0.0.1:8090`, a Next.js server on `*:3100`, Dropbox, an AVS Foundry worker container, Colima/Lima and several loopback Node/Python dev processes.

Palavva's chosen loopback ports (all verified free at audit time):

| Service | Bind |
| --- | --- |
| Next.js web/BFF | `127.0.0.1:3000` |
| PocketBase | `127.0.0.1:8190` (8090 already used by an unrelated app) |
| Editorial/FastAPI worker API | `127.0.0.1:8100` |

## 2. Qwen probe (read-only)

`GET http://100.70.149.32:11434/api/tags` over Tailscale returned `qwen3.5:4b` (Q4_K_M, 4.2B params). `tailscale ping`: pong via **DERP(dfw) relay, ~132 ms**, no direct connection. No generation was requested during the audit; bounded generation tests happen in Phase 2. Simeon's iMac was not modified.

## 3. OpenMolt audit (T-002)

See `DECISION-OPENMOLT.md` for the full decision. Summary of observed facts:

- Upstream `https://github.com/ImGoodBai/openmolt`, commit **`1be0e2804fe63f53b4308762842ae90d7ca41052`** (2026-02-04), 35 commits total, first 2026-02-02. Package name `goodmolt-web`.
- `LICENSE`: MIT, "Copyright (c) 2025 Moltbook". Confirmed from the file, not only the README.
- Actual architecture: Next.js **14.1.0** + React 18 frontend, **Express** backend (`src/backend`), **PostgreSQL via `pg` and Prisma 5.22**, Google OAuth only, agent API-key accounts ("social network for AI agents").
- Baseline (bounded, local, `--ignore-scripts`): `npm ci` OK (894 packages); `jest` **3 failed / 33 passed** (2 suites failing); `tsc --noEmit` **fails** (Prisma client not generated); `npm audit --omit=dev`: **21 vulnerabilities (3 critical, 12 high, 6 moderate)**, including the Next.js middleware authorization bypass (GHSA-f82v-jwr5-mffw) and several Next.js cache-poisoning/DoS advisories.
- Upstream commits a `.env.production` containing a Vercel OIDC token (value not printed). Security-hygiene red flag.
- Logs: `.audit/openmolt-*.log` (gitignored; the clone lives in `.audit/openmolt`).

## 4. PocketBase audit

- Pinned **v0.40.5** (released 2026-10-08). Chosen over v0.40.4 because the release notes say it is built with Go 1.27.2, which includes `net/http` security fixes, "one of the fixes is for a DoS that could potentially affect PocketBase applications and it is advised to update".
- Binary `pocketbase_0.40.5_darwin_amd64.zip` downloaded from GitHub releases; **SHA-256 verified against upstream `checksums.txt`** (`3640f0c4…5105f`). A `linux_arm64` asset exists for the eventual Oracle target.
- License: MIT. Pre-1.0: the docs warn that backward compatibility isn't guaranteed. Mitigation: exact pin, migrations in-repo, backup before each migration.
- JS migration API (`migrate((app) => { new Collection({...}); app.save(c) })`) and record request hooks (`onRecordCreateRequest`, `onRecordUpdateRequest`) were verified against the pinned binary in a scratch directory before use.

## 5. Dependency pins and supply chain

- Web: next 15.5.27, react/react-dom 19.2.8, tailwindcss 4.3.3, lucide-react 1.47.0, zod 4.6.5, typescript 5.9.3, vitest 3.2.7, @playwright/test 1.61.1. `pnpm audit --prod`: **No known vulnerabilities found** (after a `postcss@8.5.29` override for the copy nested inside Next).
- Next 16.4.0 exists but is two days old. 15.5.27 is the patched 15.x line and the same version already runs on this Mac.
- Playwright 1.64 refuses to install Chromium on macOS 12. 1.61.1 uses the already-cached `chromium-1228` build.
- Python (3.11 venv): fastapi 0.115.14, uvicorn 0.32.1, httpx 0.28.1, defusedxml 0.7.1, duckdb 1.1.3, pydantic 2.10.6, pytest 8.3.5 (`services/editorial/requirements.lock`). SQLite 3.53.4 with FTS5 confirmed.

## 6. Architecture chosen

```text
Browser → http://127.0.0.1:3000 Next.js 15 (SSR + /api/v1 BFF, host→tenant resolution, sessions)
            ├─ PocketBase 0.40.5 @127.0.0.1:8190 (all collections locked to superuser; Next is the only client)
            ├─ Editorial FastAPI @127.0.0.1:8100 (SQLite job queue, ingest, Qwen adapter, FTS5 search sidecar)
            │     └─ Ollama qwen3.5:4b @ Simeon's iMac via Tailscale (concurrency 1) | fixture provider (tests only)
            ├─ analytics: NDJSON append (tenant/date partitioned) → DuckDB ETL → PocketBase aggregated_metrics
            └─ sponsor adapters: local inquiry outbox + EspoCRM adapter (disabled, no creds) + Revive zone adapter (disabled)
```

## 7. Risks found during Phase 0

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Disk 93% full (34 GiB free) | Medium | No large images/model weights; backups compressed and rotated |
| macOS firewall disabled | Medium | Explicit `127.0.0.1` binding for every Palavva service; verified by `lsof` in Phase 5 |
| No `docker buildx` → no ARM64 build on this Mac | Medium | Dockerfiles/Compose prepared; ARM64 build verification marked BLOCKED (installing buildx/QEMU needs approval) |
| Qwen over DERP relay (no direct path) | Low | Timeouts, concurrency 1, offline fallback |
| OpenMolt critical advisories | High if reused | Not reused as code (see decision) |
