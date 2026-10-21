# Palasora Phase 3 handoff: the economy engine and the headless simulation

Written 21 Oct 2026 by the Claude cloud thread "Meadowvale city review" for the next Claude session on the owner's other account. Read this file first.

## Where things stand

- **Repo:** github.com/amaeteventurestudios/palasora (private). Work from `main`.
- **Done and merged:**
  - **Phase 1 (PR #1):** people post, reply and vote; news is retired in stages 1 and 2; backups and restore are tested. Report: `docs/PHASE-1-REPORT.md`.
  - **Phase 2 (PR #2):** Pals become Sora. That means the migration tool, human Sora accounts, one platform owner for all house agents, Town Hall and Harbour as the only mints with a weekly budget, a burn account, and founding and new company rules. Report: `docs/PHASE-2-REPORT.md`. Runbook: `docs/operations/SORA-MIGRATION.md`.
- **Never deployed.** Palasora still runs only locally. The migration has never been run on real data (see "Deploying" below).
- **Old repo:** github.com/amaeteventurestudios/palavva. Leave it untouched.

## Read before coding

1. `docs/palasora/Palasora-04-Economy-and-Agents.md` (v0.5), all of it, especially section 4A (balance rules) and section 9.
2. `docs/palasora/Palasora-05-Headless-Simulation-Plan.md` (v0.4), all of it. This is the Phase 3 spec.
3. `docs/palasora/Palasora-06-Unified-Platform-Architecture.md` (v0.3): sections 7.4, 13 (one event, many views), 16.2 (J0 records) and 19 (phases and gates).
4. `docs/PHASE-1-REPORT.md`, `docs/PHASE-2-REPORT.md` and `docs/LOCAL-DEVELOPMENT.md`.
5. The economy code in `services/editorial/palavva_editorial/economy/`.

## Phase 3 scope (Doc 06 phase table)

Goods, the tick, the Harbour, the Market Hall, contracts, the outbox and relay, the headless simulation, and justice J0 records. The gate is **Document 05 gates A to D**.

Build it in Python inside the existing economy service, as Doc 05 sections 2 to 9 describe:
- **Records:** goods (crops, tools, meals, materials), stock and a goods log, plots, supply contracts as their own records, deliveries, world events with an outbox row in the same transaction, and the J0 candidate violations table.
- **The hourly tick,** in the order Doc 05 section 4 sets. Use a seeded clock: the same seed gives the same fingerprint.
- **The Harbour:** imports at a fixed price, and surplus bought at a floor price that counts against the issuance budget. **The Market Hall** goods order book, built on the existing matching engine.
- **Balance rules (Doc 04 4A):** the payback lanes, the money growth target with the issuance thermostat, playing beats sitting, and no savings interest.
- **The simulation:** `sim run --scenario <name> --seed <n> --days <d>` and `sim gates`. Run scenarios 1 to 10 on 10 seeds each, plus a 180-day baseline. Produce one HTML run report per run with the payback curve, money growth against the target, and a three-way leaderboard.
- **Gates A to D.** Gate A uses rules-only agents. Gates B and C use recorded AI answers. For Gate D, measure cost with a small live AI sample.

Defaults for open decisions (note each one in the PR):
- 3 businesses per player before the Exchange opens.
- No rent yet.
- Harbour floor price at 60%.
- Free-player AI budget: 1 plan and 3 event calls a day, about $1 a month.

**Not in Phase 3:**
- Town events in the feed (phase 4).
- Removing the news code (phase 5).
- Anything 3D (phases 6 and 7).
- SpacetimeDB (phase 8).
- Justice beyond J0 (phase 9).

## Rules

- Work on a branch such as `phase-3-economy-engine`. Push to GitHub often, at least at each milestone, so the cloud thread can follow along.
- Keep `docs/PHASE-3-PROGRESS.md` up to date with what is done, what is next, and the test results so far.
- Open a PR against `main` when the gates pass. The owner has said not to stop and ask; tell them when it is ready, and merge when they say so.
- Commit messages and the PR say what changed. Never commit secrets, `.env*` files, `services/editorial/.venv`, `apps/web/tsconfig.tsbuildinfo`, or `data*/` folders.
- **Paid AI:** the OpenRouter spend ledger has a $5 cap. Stay within it. Use the fixture or recorded provider for the simulation runs.
- **Do not:**
  - deploy;
  - run the Sora migration on real data;
  - force-push;
  - skip or disable tests to get green;
  - touch the palavva repo.
- The owner (Amaete) is careful with tokens. Report briefly: what changed, the exact test counts, and what you need from them.

## Testing

- Typecheck: `cd apps/web && npx tsc --noEmit`.
- Vitest: `cd apps/web && npx vitest run`.
- Pytest: `cd services/editorial && .venv/bin/python -m pytest`.
- Playwright: `E2E_BUILD=1 bash scripts/test-stack.sh reset`, then `cd apps/web && npx playwright test`. The full run takes about 20 minutes.
- **Known failures that are not yours:** v18 ISSUE-24 and ISSUE-28 time out on sign-up in slow environments, and ISSUE-23 then does not run. The baseline counts are in `docs/PHASE-2-REPORT.md`.
- Re-run every suite on your final code. Never present old results as new.
- After a Playwright run, restore any tracked screenshots the suite rewrote (`git checkout -- docs/evidence/screenshots`) unless they are evidence you meant to update.

## Deploying (only when the owner says so)

- Deploying is a separate step from Phase 3. The plan is the Oracle server, with Docker files in `infra/compose`, `infra/docker` and `infra/caddy`.
- **Important:** once the Phase 2 code is deployed, a ledger that still holds Pals refuses every movement until the migration runs. So deploying Phase 2 means running the migration on the real data straight after the deploy, using the runbook in `docs/operations/SORA-MIGRATION.md`:
  1. Run the dry run on a copy first.
  2. Make a full backup.
  3. Run the migration with every service stopped.
  4. Lift the freeze.
- The owner must approve that step explicitly.
- A later option: put the web front end on Vercel and keep PocketBase, the economy service and the workers on the Oracle server.
