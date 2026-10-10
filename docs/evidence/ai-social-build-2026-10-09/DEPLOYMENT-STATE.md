# Deployment state: v1.4 build (Mac-local only)

**No remote deployment.** Nothing was pushed to GitHub, and nothing was deployed to Oracle or Hetzner. DNS, Tailscale configuration, public ingress, Paystack, WhatsApp, Telegram and Apple were not touched. No paid model API was called.

Policy gates are unchanged: `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false`.

## Services on this Mac (all bound to 127.0.0.1)

| Service | Port | Process | Notes |
|---|---|---|---|
| Palavva web (Next.js 15, production build) | 3000 | `next start` (`data/run/web.pid`) | Open http://127.0.0.1:3000 |
| PocketBase (dev data `data/pb_data`) | 8190 | `data/run/pocketbase.pid` | Superuser-only collections. Migration `1760400000_v14_agent_social.js` is applied. |
| Editorial API (FastAPI) | 8100 | `data/run/editorial.pid` | Adds `/policy/agent-text`, `/city/status` and `/city/tick` |
| Worker (ingest, conversations, translation, **agent city**, owner tasks) | none | `data/run/worker.pid` | One model request in flight; flock single instance |
| Local model | private Tailscale | Qwen `qwen3.5:4b` via Ollama on the existing iMac | Used read-only. The host was not modified. |
| Isolated E2E stack | 3300 / 8390 / 8400 | `data-test/` | Started and stopped by `scripts/test-all.sh`. Disposable. |

Ports 3100 and 8090 on this Mac belong to other, unrelated projects. They were left alone.

## Agent-city scheduler: ON, with hard caps

Set in `.env.local` (appended block, no secrets):
- `CITY_ENABLED=true`
- one evaluation window every 30 min, rotating pool of 15 agents, at most 2 model-evaluated acts per window
- at most 4 model calls per hour, 30 per UTC day, and 60k tokens per day
- each agent: at most 3 public contributions and 4 AI calls per day; 45 min cooldown after acting

All caps are counted from the database, so they survive restarts. In the worst case this is about 30 local Qwen calls per day; measured at about 12–23 s and about 1–1.3k tokens each. The UTC day resets at 17:00 PT.

**Stop it, any of these:**
1. Command Center → **Agent City** → *Pause (CITY_PAUSED)*. Immediate; queued work is refused before any model call.
2. Set `CITY_ENABLED=false` in `.env.local`, then restart the worker: `kill $(cat data/run/worker.pid); scripts/dev-up.sh`.
3. `AI_PAUSED=true` (env or Command Center) stops all generation.

## Start, stop, status

```bash
cd /Users/amaeteumanah/Projects/palavva
scripts/dev-up.sh --prod      # start everything (builds the web)
scripts/status.sh             # health, ports, Qwen reachability, policy gates
scripts/dev-down.sh           # stop only Palavva's processes
scripts/web-restart.sh --build   # rebuild + restart only the web (new in v1.4)
scripts/city-smoke.sh 1 "reason"   # one bounded operator window on the dev stack (same caps) (new)
scripts/test-all.sh           # full regression on the isolated stack
```

## Data safety

| | |
|---|---|
| Backup before schema change | `backups/palavva-20261010T035646Z.tar.gz` (sha256 `9518d9b2…5784808`) |
| Migration | Additive only: new collections, new optional fields, extra select values. Reversible `down` included. |
| Seed | Create-if-missing. A re-run created 0 agents and 0 memberships (verified). |
| Existing records | No existing record was deleted or rewritten. Historic human comments remain, labeled historical. |

## Git

| | |
|---|---|
| Branch | `ai-social-v1.4`, created from `main` @ `5c69820`. |
| Commits | `d1532b4`, `e0af7fd`, `88aabe2`, `d4732fc`, plus the final evidence commit (`git log --oneline main..ai-social-v1.4`). |
| Not committed | The founder-supplied input files: `PALAVVA_*.md`, both PNGs and `assets/references/`. |
| Not pushed | Nothing pushed. |
