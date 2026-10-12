# v1.8+ baseline — 28-issue package (2026-10-11 local / 2026-10-12 UTC)

Observed directly in this session before substantive edits. No secret values recorded.

## Inputs read
| File (docs/handoffs/2026-10-11-28-issues/) | Read | Integrity |
| --- | --- | --- |
| `README.md` | full | sha256 matches `SHA256SUMS.txt` |
| `PALAVVA_CLAUDE_AUTONOMOUS_EXECUTION_PROMPT_2026-10-11.md` | full | matches |
| `PALAVVA_28_ISSUES_MASTER_SPEC_2026-10-11.md` | full | matches |
| `PALAVVA_V17_TO_V18_THREAD_HANDOFF(1).md` | full | matches |
| `PALAVVA_COMPLETE_PROJECT_HANDOFF.md` | not yet (historical background only; read before Wave B) | matches |
| `screenshots/` (43 files) | homepage pair viewed (`4.44.54 PM`, `WhatsApp …12.05.54`); others viewed per issue | all 48 package files match |
| `docs/evidence/v17/MORNING-HANDOFF.md` | full | — |

Spec copy for the repo: `docs/specs/PALAVVA_28_ISSUES_MASTER_SPEC_2026-10-11.md` is a byte-identical copy (sha256 `e9cefc22…`).
The 25 MB screenshot folder stays in `docs/handoffs/…/screenshots/` on disk and is **not committed** (keeps history small; commit it if you want it in Git).

## Repository
* Path `/Users/amaeteumanah/Projects/palavva`, branch **`unified-v1.5`**, HEAD `9d0464c` at start; 65 commits; single worktree; other local branches `main`, `ai-social-v1.4`; remote `origin/main`. Nothing pushed by this work.
* Uncommitted at start: `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo` (build artefacts, left as-is); untracked `docs/handoffs/`.
* Layout: `apps/web` (Next.js + shadcn/ui), `services/editorial` (Python: editorial, city/engine, writers, population, economy), `services/pocketbase`, `infra/`, `scripts/`, `data/` (git-ignored live data), `backups/` (git-ignored).

## Services (scripts/status.sh)
pocketbase, editorial, worker, fast, writers, intel, population, web all running; web `:3000` 200, PocketBase `:8190` 200, editorial `:8100` 200, Qwen (Tailscale) 200.
Policy gates: `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false`.
Unrelated processes on `:8123`/`:8124` (`tools/serve.py`, another project) — not touched.

## Host pressure
* Data volume: 466 GiB, **96 % used, 21 GiB free**. RAM 32 GB, ~28 GB used. Load average ~8.6, CPU ~94 % busy (mostly Chrome/CapCut/WindowServer, not Palavva).
* Consequence: no heavyweight installs (no Letta server, no OpenSpiel build, no duplicate Revive/EspoCRM) on this Mac; adapters and audits instead.

## Backups (before any change)
* `backups/palavva-20261012T033352Z.tar.gz` (128 MB, sha256 `9a49aeeb174ab422297317a95bf3f1ca8eef512188f965918b90f7e978fbb48d`) via `scripts/backup.sh` (SQLite online backup + integrity_check of PocketBase, jobs, search, economy, analytics).
* `scripts/backup.sh` does **not** include `data/spend.db`; separately backed up as `backups/spend-20261012T033427Z.db` (sha256 `125a8253…1909`). Gap logged against ISSUE-21.
* Last restore drill on record: 2026-10-09T21:21:19Z (`backups/LAST_RESTORE_DRILL_OK`).

## Paid-model spend (verified from `data/spend.db`, provider-reported)
* OpenRouter settled calls 1,671 = **$0.2996**; provider usage $0.2996; provider limit $5, **remaining $4.70**. 171 reserved-then-released calls cost $0.
* Writers are live at the existing $1.50/day pace; no cap was changed.

## Live data snapshot (homepage counters = DB aggregates, 20:40 PDT)
27,060 registered agents (all Palavva-operated), 3,450 eligible, 0 verified external agents, 13 SubPals (16 proposals in review), ~1,736 posts (256 by agents, 1,456 sourced news), ~1,033 comments (969 by agents). Exchange: 54 markets, 5 with listings, 6 virtual companies, ~390 trades today, PMI shows **1,000 / +0.0 %** despite trades (investigate under ISSUE-15).

## Tests at baseline (this session)
| Suite | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| vitest | 71/71 |
| pytest (`services/editorial`) | 145 passed, 3 skipped (210 s) |
| Playwright (public, v14, v15, v17 specs; isolated stack :3300) | 46/46 after ISSUE-01 test-contract update |

## Admin route → issue map
| Route (`apps/web/app/admin/…`) | Issues |
| --- | --- |
| `/admin` (Overview), `reports`, `audience`, `analytics` | 04, 06 |
| `engine` (AI Engine, population, controls) | 02, 04, 06 |
| `agent-city`, `city` | 06 |
| `conversations` | 06, 10 |
| `exceptions`, `editorial` | 07 |
| `ai`, `models` | 05, 08 |
| `social`, `sources` | 09 |
| `translations` | 10 |
| `geo`, `geography` | 03, 11 |
| `trends` | 12 |
| `moderation` | 13 |
| `pals` | 14 |
| `exchange` | 15 |
| `revenue`, `sponsors` | 16, 17, 18 |
| `businesses` | 19 |
| `distribution` | 20 |
| `ops`, `health` | 21 |
| `settings`, `audit` | 22 |
| `tenants` | 23 |
| new: Users & Access | 23 |
| new: Infrastructure & Services | 21 |
| all of the above | 04 (full-width shell), 06 (help/`?`) |
