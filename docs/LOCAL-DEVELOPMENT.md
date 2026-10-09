# Palavva: local development runbook (Mac)

Everything runs on this Mac, on loopback only. Nothing here contacts Oracle or Hetzner.

## First-time setup

```bash
cd /Users/amaeteumanah/Projects/palavva
scripts/setup-local.sh        # creates .env.local with random secrets, data dirs, migrations, service accounts
```

Prerequisites (already present on this Mac): Node 24, pnpm 12, Python 3.11 (`services/editorial/.venv`), the PocketBase binary in `services/pocketbase/bin` (re-download with checksum check per `PHASE-0-AUDIT.md` if missing). For a fresh checkout, run `cd apps/web && pnpm install`, then `cd services/editorial && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.lock`.

## Start, stop, status

```bash
scripts/dev-up.sh --prod      # production build (recommended for review); omit --prod for hot reload
scripts/status.sh             # services, ports, Qwen reachability, policy gates, last backup and drill
scripts/dev-down.sh           # stops only Palavva's own processes (pid files + cwd-checked listeners)
```

| URL | What |
| --- | --- |
| http://127.0.0.1:3000 | Palavva public site |
| http://127.0.0.1:3000/admin | Command Center |
| http://sample.localhost:3000 | Isolated **Sample Africa Community** demo tenant (Chrome/Safari resolve `*.localhost`) |

**Local accounts** (password = `LOCAL_DEMO_PASSWORD` in `.env.local`; never commit it):

| Email | Tenant | Role |
| --- | --- | --- |
| editor@palavva.local | Palavva | editor (can approve medium/high risk) |
| admin@palavva.local | Palavva | platform_admin (switches, rights approval, branding) |
| moderator@palavva.local | Palavva | moderator |
| reader@palavva.local | Palavva | member |
| admin@sample.local / editor@sample.local / reader@sample.local | Sample tenant | tenant_admin / editor / member |

Emails (verification links) go to the local mail sink, `data/mail-sink/`, which you can also view in Command Center → Settings & Audit.

## Data

- Dev data: `data/` (PocketBase `pb_data`, `jobs.db`, `search.db`, `analytics/`, `logs/`). E2E test data: `data-test/`, which is separate and disposable.
- Demo fixtures: `SHOW_DEMO_CONTENT=true` shows the labeled demo stories on the platform tenant. Set it to `false` for the real empty state.
- Reseed reference data (idempotent, never deletes): restart with `scripts/dev-up.sh`.
- Reset **test** data only: `scripts/test-stack.sh reset`. There is deliberately no script that deletes `data/`.

## Backup and restore

```bash
scripts/backup.sh             # online SQLite backup → backups/palavva-<ts>.tar.gz + .sha256 (keeps 14)
scripts/restore-drill.sh      # restores the newest backup into a temp dir on :8399 and verifies counts, integrity, ACLs
```

To actually restore: `scripts/dev-down.sh`, move `data/pb_data` aside (do not delete it), extract the archive's `pb_data/` (and `jobs.db`, `search.db`, `analytics/`) into `data/`, then run `scripts/dev-up.sh --prod`.

## Tests

```bash
scripts/test-all.sh                   # typecheck, vitest, pytest (isolated PocketBase), E2E stack + Playwright
REAL_QWEN=1 scripts/test-all.sh       # also calls the real private Qwen (a few bounded requests)
```

## News ingestion and AI

- Sources: Command Center → News Sources. Only `rights_status=approved` and enabled sources are fetched. SAnews.gov.za is approved provisionally (see `docs/evidence/sources/SANEWS-RIGHTS-REVIEW.md`).
- Drafts appear in Command Center → Editorial Queue. **Nothing publishes without an editor's approval.**
- Kill switches: Settings & Audit (`INGEST_PAUSED`, `AI_PAUSED`, `PUBLISHING_PAUSED`, `AD_SLOTS_DISABLED`, `ANALYTICS_ENABLED`).
- Model: `MODEL_PROVIDER=ollama` (Qwen on Simeon's iMac over Tailscale, concurrency 1) or `fixture` (deterministic test output, labeled).
- Logs: `data/logs/{web,pocketbase,editorial,worker}.log`.

## Containers (build artifacts; not deployed)

```bash
docker build -f infra/docker/pocketbase.Dockerfile -t palavva-pocketbase:local .
docker build -f infra/docker/editorial.Dockerfile  -t palavva-editorial:local .
docker build -f infra/docker/web.Dockerfile        -t palavva-web:local .
# Smoke test on 127.0.0.1:3400 (needs .env.compose; see docs/evidence/phase5/compose-smoke.txt):
cd infra/compose && docker compose -f docker-compose.yml -f docker-compose.smoke.yml up -d
```

ARM64 images need `docker buildx` with QEMU, which is not installed on this Mac (installing it needs approval). The base images publish arm64 variants.

## Code rollback

`git log --oneline` → `scripts/dev-down.sh` → `git checkout <sha>` → `cd apps/web && pnpm install` → `scripts/dev-up.sh --prod`. If the schema changed between versions, restore the matching backup first. Migrations are forward-only, and the MANIFEST in each backup records the commit and migration files.
