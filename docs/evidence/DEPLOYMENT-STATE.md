# Deployment state (as of 2026-10-09, end of the overnight build)

```
ORACLE_DEPLOYMENT_AUTHORIZED=false
PUBLIC_LAUNCH_AUTHORIZED=false
PAID_FALLBACKS_ENABLED=false
```

**Where Palavva runs:** only on the founder's Mac, natively, loopback-only.

| Service | Bind | Process | Data |
| --- | --- | --- | --- |
| Next.js web/BFF (production build) | 127.0.0.1:3000 | `scripts/dev-up.sh --prod` | n/a |
| PocketBase 0.40.5 | 127.0.0.1:8190 | native binary | `data/pb_data` |
| Editorial API (FastAPI) | 127.0.0.1:8100 | uvicorn | `data/jobs.db`, `data/search.db` |
| Editorial worker | no port | python (single instance, flock) | `data/analytics`, queue |
| E2E test stack (only while tests run) | 127.0.0.1:3300 / 8390 / 8400 | `scripts/test-stack.sh` | `data-test/` |

**Outbound connections made by Palavva:** `https://www.sanews.gov.za/rss.xml` (hourly at most, rights-reviewed) and `http://100.70.149.32:11434` (Qwen over private Tailscale, concurrency 1, ≤100 requests/day). No other external services.

**Not touched:** Oracle (`palavva-prod`, `palavva-vnic`, the `~/.ssh/palavva_oracle` key, OCI), Hetzner Revive/EspoCRM, DNS, registrar, Tailscale ACLs, Simeon's iMac configuration, unrelated local apps (PocketBase on 8090, Next on 3100, the AVS Foundry container).

**Containers:** images `palavva-{web,editorial,pocketbase}:local` built on Colima (linux/amd64) and smoke-tested on 127.0.0.1:3400, then stopped and removed (`docker compose down -v`). No registry push.

**Source approvals:** SAnews.gov.za `approved` (provisional, local dev); 7 other candidates `pending`/disabled.

**Backups:** `backups/` (local only; no off-host destination approved). Restore drill last passed: see `backups/LAST_RESTORE_DRILL_OK`.
