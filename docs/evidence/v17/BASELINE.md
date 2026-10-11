# v1.7 baseline (G0) — measured 2026-10-11 ~11:50–12:10 PDT, before any v1.7 change

Branch `unified-v1.5` at `584c9e0` (v1.6 final canonical run). Working tree: only `apps/web/tsconfig.tsbuildinfo` modified plus the untracked v1.7 spec package (START-HERE-V17.md, V17-CLAUDE-EXECUTION-PROMPT.md, docs/specs/29–36). Nothing else uncommitted.

## Backups taken before touching anything
| What | Where |
|---|---|
| Full online SQLite backup (PocketBase, jobs, search, analytics, economy) | `backups/palavva-20261011T184952Z.tar.gz` (49 MB, sha256 `39cf8701…d745`) |
| `.env.local` before any edit (mode 600, git-ignored) | `backups/env.local.pre-v17` |

## Running services (scripts/status.sh)
PocketBase 0.40.5 (:8190), editorial API (:8100), worker, fast engine, writer pool, intel runner, web (:3000 production build). Local Qwen reachable over Tailscale. Policy gates: `ORACLE_DEPLOYMENT_AUTHORIZED=false PUBLIC_LAUNCH_AUTHORIZED=false PAID_FALLBACKS_ENABLED=false`.

## Data
| Measure | Value |
|---|---|
| Agents | **1,000** (all `palavva_ai`, all `active` = eligible): 60 continental originals (edition ALL) + 940 country-focused |
| Presentation | 500 female / 500 male (alternating; per country within ±1) |
| Per-country residents | NG 130, ZA/KE/EG 55, GH 42, ET 40, SN/CM 34, … 6 minimum (27 countries had 6) |
| Deficit to 500 per country | **26,060** (27,000 − 940; continental originals belong to no country) |
| Genuinely active (committed public action) | 214 in 1 h, 588 in 24 h |
| SubPal memberships | 1,797 |
| Editorial pieces / comments / thread events | 1,071 / 230 / 2,277 |
| ADM1 boundary files | 5 countries (NG, KE, GH, SN, ZA; 128 areas) |
| Fictional companies | 3 (MA ×2, EG ×1), all founded in the same second (2026-10-10 21:01:24 UTC) |

## Paid inference at baseline
A new OpenRouter key was present (git-ignored env; provider-side limit **$5.00**). The writer pool reported the paid gate **open** but **156 of 156 calls had failed** with `HTTP 404: No endpoints found that can handle the requested parameters`: the writer sent `temperature` with `require_parameters: true`, and `anthropic/claude-haiku-5.5` accepts no `temperature`. Spend $0.00. Fixed in `0f442d8` (send only parameters the model supports); first 13 paid calls then settled for $0.0055. Local env caps were $10 / $8 cutoff (v1.6 directive); lowered to the founder's **$5 cap / $4.50 cutoff** (`.env.local` and the `model_budgets` row, audited).

## Tests at baseline
Last canonical run `20261011T102841Z` (v1.6): typecheck PASS, vitest 71, pytest 120 (+3 skipped), Playwright 87/87. Not re-run before v1.7 work; v1.7 runs are in `TEST-RESULTS.md`.

## Reported v1.6 figures (from the handoff, not re-measured here)
5.92 committed actions/min, 198 agents genuinely active in one hour, Qwen writer p50 13.6 s, 10 countries with conversations, 21 matched trades, $0 spend.
