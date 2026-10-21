# Palasora Phase 2 report: Pals become Sora

- **Branch:** `phase-2-sora-migration`, based on `main` at `6582473`. The first five commits were merged into `main` as PR #2 (`b67675c`). This report, the runbook, the evidence and one test fix come on top. Nothing is deployed.
- **Scope:** Doc 06 sections 4, 7.1 to 7.3 and 19, and Doc 04 v0.5 sections 4, 4A, 5 and 8.
- **Not built:**
  - Phase 3: goods, the economy tick, the Market Hall goods order book and the simulation.
  - Anything 3D.
- **Not run:** the migration was never run against real data. There is none in this environment. It ran only on test copies (see Evidence).

## What changed

### 1. Migration tool (Doc 06 section 7.2)
Code: `services/editorial/palavva_editorial/economy/migration.py`. Runbook: `docs/operations/SORA-MIGRATION.md`.

1. **Freeze.** Turns on `PALS_ISSUANCE_PAUSED` and `EXCHANGE_HALTED`. Cancels every open order and releases its reservation.
2. **Back up** with `scripts/backup.sh` (checksums), then verify with `scripts/restore.sh --verify`.
3. **Reconcile before** and record a fingerprint: balances per account, shares per company and holder, open orders, companies and totals, with SHA-256 hashes.
4. **Convert in one transaction.** Each account that holds Pals gets two journal entries tagged `migration:pals-to-sora`. Its Pals go to `platform:conversion`, and the Town Hall issues the same amount of Sora to it.
5. **Shares** are untouched.
6. **Reconcile after**, inside the transaction and again after the commit:
   - each account's Sora equals its old Pals
   - the Pals in `platform:conversion` equal the Sora issued, which equals the Pals total before
   - shares are identical
   - no Pals remain outside the conversion account
   - no orders are open
   - reconciliation passes
   - the fingerprints match

   Any difference rolls back, and economy.db is restored from the backup.

How the tool behaves:
- **Idempotent.** A converted ledger reports `already_done`. A ledger that never held Pals reports `nothing_to_do`.
- **`--dry-run`** works on a copy made with the SQLite backup API. It runs the whole migration, then runs it again to prove idempotency, and prints the fingerprints. A real run needs `--yes`.
- **Commands:** `status` and `unfreeze` (refused until the ledger is converted).
- **Pals after the migration.** The history stays readable. `ledger.transfer` refuses Pals (`PALS_RETIRED`). A ledger that still holds Pals refuses every movement (`MIGRATION_PENDING`) until it is migrated.
- **Schema v2.** The upgrade is an atomic in-place rebuild, run at `db.init` before the freeze. It adds the `human` owner kind, limits negative balances to mints (in code and in a CHECK), adds the journal kinds `convert`, `burn` and `revenue`, adds `companies.founding`, and adds the `issuance_budgets` and `migrations` tables.

### 2. Human accounts
- A new owner kind, `human`, keyed `user:<id>`. `POST /economy/humans/{id}/account` is lazy and idempotent. `GET /economy/humans/{id}/portfolio` returns the person's portfolio.
- The web creates the account on sign-in, on sign-up and on the wallet visit (`ensureSoraAccount`).
- The wallet shows the person's own Sora, the 1 Pal = 1 Sora note, their conversion line and their old Pals history, then their agents' wallets.
- People can trade in the Python API (`place_order(owner_kind="human")`). There is no UI for it yet.

### 3. Platform owner
`ledger.trade_owner()` and `TRADE_OWNER_SQL` map every house agent (`seed:*` and `platform`) to one owner for self-trade checks. Two house agents can never trade with each other. A person and their own agents share `user:<id>`. The integrity self-trade signal uses the same mapping for trades after the switch to Sora.

### 4. Rule changes (Doc 06 section 7.3)
- **Two mints.** Only `platform:town_hall` and `platform:harbour` can create Sora: `kind='issue'` from any other account is refused (`NOT_A_MINT`). Only a mint can go negative, which the code and the database both enforce.
- **Burn.** Fees, the listing fee and clawbacks go to `platform:burn`, and supply counts them as destroyed. Supply is computed from the journal: created by the mints, minus what went back to a mint or to burn. Reconciliation reports `issued_sora`, `destroyed_sora` and `supply_sora`, and keeps the old `*_pals` names as aliases.
- **Weekly Town Hall budget** (`issuance.py`, Doc 04 4A):
  - `ceil(supply at week start x ((1 + g)^(7/365) - 1))`
  - g = `SORA_GROWTH_TARGET`, default 0.20, clamped to 0.15 to 0.25
  - at least `SORA_WEEKLY_FLOOR` (default 5,000 Sora)
  - `SORA_WEEKLY_BUDGET` overrides it
  - the week runs Monday to Sunday UTC, and each week's numbers are stored in `issuance_budgets`

  Rewards are denied with "Town Hall weekly issuance budget reached", a new `weekly_budget` denial category. Operators read and set the budget at `GET` and `POST /economy/admin/issuance`, and each change is audited in `reward_policy_changes`. The conversion does not count against the budget.
- **`sourced_reply` retired.** It is forced inactive and cannot be turned back on. The city engine no longer awards it.
- **Companies:**
  - A new company gets 1,000 founder shares and stays private: there is no IPO, and orders on it are refused (`NOT_LISTED`).
  - It can list after 30 days with revenue: `GET` and `POST /economy/companies/{id}/listing`.
  - The companies that exist at the migration become founding companies and keep 10,000 shares and their listings.
  - Listings leave out private companies unless `include_private=true` is passed.

### 5. Pals renamed to Sora
- About 55 web files: every user-facing "Pals" is now "Sora", and PMI is now SMI (Sora Market Index).
- `fmtSora` replaces `fmtPals`, which is kept as a deprecated alias.
- `/admin/pals` moved to `/admin/sora`, and `next.config.ts` redirects the old path.
- The Sora admin page has a new section: supply from the two mints, the weekly budget and the migration state.
- The Exchange explains the listing rule.
- **Kept for compatibility:**
  - the API accepts `max_order_pals` and `daily_pals` as well as the new `*_sora` names
  - summaries return `pals_invested` beside `sora_invested`
  - the internal `/api/admin/pals-policy` route and the database column names are unchanged

## Evidence: the dry runs (on the final code, `37b40cf`)
**Pals-era E2E data set.** The Phase 1 code ran its full Playwright suite in a copy of the repo, which left a real Pals ledger: 15 accounts, 23 journal rows, 2 companies, 5 orders (3 open) and 2 trades. Report: `docs/evidence/phase-2/dry-run-pals-era-e2e.json`.

| | Before (Pals) | After (Sora) |
| --- | --- | --- |
| Fingerprint SHA-256 | `81f8780a244253b4479804841bc9e7dc6af9b8ea676e114c33b3b799349c4662` | `81f8780a244253b4479804841bc9e7dc6af9b8ea676e114c33b3b799349c4662` |
| Money SHA-256 | `1a8b6632751c000beb71808a749fb932df3064f2497a2de227cf7ac4bd704f3a` | same |
| Shares SHA-256 | `10c729a5e8b3c2f223e804d0029082d0b580b156342e42b74ce01358fb028168` | same |
| Accounts with a balance | 6 | 6 |
| Money total (centi-units) | 19,500 Pals | 19,500 Sora |
| Share holdings / shares | 6 / 20,000 | 6 / 20,000 |
| Open orders | 0 (3 cancelled by the freeze: 2 IPO treasury offers and 1 bid that released 180) | 0 |
| Mint | `platform:issuance` -19,500 | `platform:town_hall` -19,500 |

- Status `done`, 6 accounts converted, and both founding companies marked.
- The second run reported `already_done`.
- The source database's SHA-256 was the same before and after (`d11c7bf4...`), so the dry run only read it.

**Phase 2 E2E stack** (`data-test` after the final Playwright run): `nothing_to_do`, because that ledger started in Sora. Report: `docs/evidence/phase-2/dry-run-e2e-stack.json`.

**Screenshots** from the final run are in `docs/evidence/phase-2/`: `wallet-desktop.png`, `wallet-phone.png`, `admin-sora.png` and `exchange.png`.

## Test results (all re-run on the final code)

| Suite | Baseline (Phase 1) | Phase 2 |
| --- | --- | --- |
| tsc | clean | clean |
| Vitest | 146 passed | **146 passed** (19 files) |
| Pytest | 195 passed, 3 skipped | **210 passed, 3 skipped** (226 s) |
| Playwright | only ISSUE-24 and ISSUE-28 fail; ISSUE-23 does not run | **149 passed, 3 failed, 5 skipped, 1 did not run** (158 tests, 20.5 min) |

The Playwright results are in `docs/evidence/e2e/results.json`, from the final full run.

### Remaining Playwright failures
- **v18-access ISSUE-24** (forgotten password) and **v18-games ISSUE-28** (Games workspace). Both are on the baseline list and both time out at 2.5 minutes, as before.
- **v18-wave-b ISSUE-10** (stored translation). It passed in the two earlier full runs on this branch. It failed once in the final run because the feed's short cache did not show the toggle within the test's 30-second retry. Translation code is untouched by Phase 2.
- **Did not run:** v18-access ISSUE-23 "external agent ownership". It runs serially after ISSUE-24, as in the baseline. The other four ISSUE-23 tests now pass.

### What the earlier full runs found (fixed)
- **Run 1.** `GET /economy/admin/stats` returned 500: a local list shadowed the `issuance` module. Fixed, with a route test added. This also caused the ISSUE-14 and ISSUE-15 admin failures.
- **Run 1.** The person's agent created by the tests used a hyphenated handle, which the public profile route rejects.
- **Run 1.** An admin sign-in hit the 6-per-minute sign-in limit. `signIn()` now waits out the window once.
- **Run 2.** V15-04 got a 429 from the event stream (60 connections a minute per client), and the six serial v15 tests after it did not run. The test now waits out the window once and retries. In the final run it passed in 12 s without needing the retry. This guards against a limit the suite itself exhausts. It does not change what the test asserts.

### New tests
- **`services/editorial/tests/test_phase2.py`** (15). The migration tests use a seeded Pals ledger built with the frozen Phase 1 economy code (`tests/fixtures/pals_v1_economy/`):
  - one-to-one conversion, fingerprints, idempotency, orders cancelled, shares untouched, and unfreeze
  - abort and restore on an injected mismatch, both inside the transaction and after the commit, and the migration runs again afterwards
  - dry run
  - a fresh ledger reports `nothing_to_do`
  - the schema upgrade keeps every row
  - a Hypothesis conservation property across random ledgers and the migration
  - human accounts, with HTTP routes, limits aliases, admin stats and issuance
  - the platform-owner self-trade rule
  - house agents never trade with each other, and a person gets the same refusal for trading with their own agent
  - the mint restriction
  - burn counted as destroyed
  - the weekly budget: floor, override, formula, clamp, and no rollback of a weekly change
  - `sourced_reply` retired
  - the company rule split
- **`apps/web/tests/e2e/phase2.spec.ts`** (5):
  - Sora state, mints and the weekly budget
  - the wallet shows Sora, the note and the person's lazily created account (desktop and phone)
  - `/admin/pals` lands on `/admin/sora`, showing supply, the weekly budget and the migration state
  - the Exchange speaks Sora and shows the listing rule

### Changed tests
- **V15-06 and ISSUE-15** now trade the founding fixture company VHCO, created by `e2e_fixtures.seed_founding_company`, using a person's agent. V15-06 also checks that a new company is private with 1,000 shares, is refused with `NOT_LISTED`, and is not listed. It also checks that a house agent cannot buy from a house agent's company.
- The Pals wording in v15, v17, v18-access, v18-games and v18-wave-d now reads Sora, and `/admin/pals` is now `/admin/sora`.
- **Pytest:** existing exchange tests create founding companies, and buyers use `user:` keys.

## Decisions the owner should know
1. **Every open order is cancelled at the freeze,** including the founding companies' IPO treasury offers. The tool does not re-offer them, so whether to re-offer is an operator decision (see the runbook).
2. **Platform accounts that held Pals** (fees, reversals) were converted like any other and keep their Sora. From now on, fees and clawbacks are burned.
3. **The old daily pacing budget** (`PALS_DAILY_BUDGET`) still applies on top of the weekly Town Hall budget. The floor defaults to 5,000 Sora a week.
4. **House agents can now trade only with people and people's agents,** so expect much less Exchange activity until people take part. The city engine's house agents will mostly see unmatched orders.
5. **The schema upgrade runs when the Phase 2 code first opens economy.db.** A ledger that still holds Pals is then frozen (`MIGRATION_PENDING`) until the migration runs. Run the migration straight after deploying, before starting the services.
6. **The test stack's founding company comes from a fixture.** A fresh Phase 2 ledger has no companies from before Sora.
7. **Unchanged:** the "Palavva Exchange" name, the internal `/api/admin/pals-policy` route and the database column names.
8. **The wallet's conversion note shows for everyone,** including people who joined after the switch.

## Outstanding
- Human trading has an API but no UI.
- The weekly budget can be set through the API only. There is no admin form.
- Not built: the new-player grant, Harbour floor buying and growth feedback (Phase 3).
- **Real-migration steps:** follow `docs/operations/SORA-MIGRATION.md`:
  1. back up with the running code
  2. stop the services
  3. deploy
  4. dry run
  5. `--yes`
  6. `status`
  7. start the services and check them
  8. `unfreeze`
  9. decide on the IPO re-offer
