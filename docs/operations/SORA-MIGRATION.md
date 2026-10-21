# Pals to Sora migration (runbook)

The one-time conversion of the ledger from Pals to Sora at 1 Pal = 1 Sora (Doc 06 section 7.2). The tool is `services/editorial/palavva_editorial/economy/migration.py`. It is run once, by an operator, with every service stopped. It has never been run against real data.

## What the tool does

| Step | What happens | If it fails |
| --- | --- | --- |
| 0. Schema | `db.init` upgrades economy.db to schema v2 in one transaction: the `human` owner kind, the mint-only negative-balance CHECK, the new journal kinds, the `founding` column, and the `issuance_budgets` and `migrations` tables. No balance changes. | The transaction rolls back and nothing changes. |
| 1. Freeze | Turns on `PALS_ISSUANCE_PAUSED` and `EXCHANGE_HALTED`. Cancels every open or partial order and releases its reservation (the published rule). This includes the founding companies' IPO treasury offers. | Rolls back. Nothing else runs. |
| 2. Back up | Runs `scripts/backup.sh` (economy.db, all PocketBase data, the git commit, SHA-256 checksums), then `scripts/restore.sh --verify`. | The migration stops before converting anything. |
| 3. Reconcile before | `reconcile.run()` must pass. The tool then records the fingerprint: balances per account, share balances per company, open orders, companies and totals, each with a SHA-256. | Stops with `aborted_before`. Nothing is converted and the freeze stays on. |
| 4. Convert | One transaction. Each account that holds Pals gets two journal entries tagged `migration:pals-to-sora`: its Pals move to `platform:conversion`, and the Town Hall issues the same amount of Sora to it. Every existing company becomes a founding company and keeps its 10,000 shares and its listing. `meta.currency` becomes `SORA`. | The transaction rolls back and economy.db is restored from the step 2 backup (`aborted_restored`). |
| 5. Shares | Untouched. | |
| 6. Reconcile after | Runs inside the transaction and again after the commit. Each account's Sora must equal its old Pals. The Pals in `platform:conversion` must equal the Sora issued, which must equal the Pals total before. Shares must be identical, no Pals may remain outside the conversion account, no order may be open, `reconcile.run()` must pass, and the fingerprints must match. | Any difference rolls back, or after the commit restores the backup (`aborted_restored`). |

The tool is idempotent. On a converted ledger it reports `already_done`. On a ledger that never held Pals, such as a fresh install or the E2E stack, it reports `nothing_to_do`. The freeze stays on after a successful run, and an operator lifts it with `unfreeze`.

After the conversion, the Pals history stays readable in the wallet and the admin pages. Pals can no longer move: `ledger.transfer` refuses them with `PALS_RETIRED`.

Between deploying the Phase 2 code and running the migration, a ledger that still holds Pals is in the **pending** state. The Phase 2 code refuses every movement in that state (`MIGRATION_PENDING`): rewards, orders and fees. So run the migration straight after the deploy, before you start the services.

## Before the day

1. Run the dry run on a recent copy of production and read the report (below). The two fingerprints must match and `second_run` must be `already_done`.
2. Decide whether the founding companies should offer their IPO treasury shares again after the freeze. The freeze cancels those offers. The tool does not re-offer them, and the report lists each cancelled order and what it released.
3. Announce the window. Orders that are open at the freeze are cancelled.

## Dry run

The dry run copies economy.db to a temporary folder with the SQLite backup API and runs every step on the copy. It backs up to the temporary folder, converts, verifies, and then runs the tool a second time to prove idempotency. The real database is only read.

```bash
cd services/editorial
.venv/bin/python -m palavva_editorial.economy.migration run --dry-run \
  --data-dir /path/to/data \
  --out /tmp/sora-dry-run.json
```

Pass `--economy-db` when economy.db is not inside the data dir (`ECONOMY_DB`). Pass `--data-dir` explicitly. The default is `PALAVVA_DATA_DIR` or `./data`, relative to the current folder. The backup step needs `pb_data/data.db` in the data dir.

What to check in the printed summary:
- `status` is `done`
- `fingerprints_match` is `true`
- `before` equals `after` (the fingerprint SHA-256)
- `money_before` equals `money_after`
- `accounts_converted` and `sora_issued` are what you expect
- `second_run` is `already_done`

The full JSON also lists each cancelled order (`freeze.released`) and the platform accounts (`before.platform` and `after.platform`). After the run, the legacy Pals mint total equals the Town Hall total.

## The real run

1. **Back up with the code that is running now.** Run `scripts/backup.sh`, then `scripts/restore.sh --verify backups/palasora-<ts>`. This is the rollback point from before the deploy, the freeze and the schema upgrade.
2. **Stop every service** that uses the data dir: `scripts/dev-down.sh` (web, PocketBase, the editorial API, the worker and the city engine).
3. **Deploy the Phase 2 code**, but do not start the services.
4. **Dry run** against the real data dir as above. Stop here if anything is not as expected.
5. **Run it:**
   ```bash
   cd services/editorial
   .venv/bin/python -m palavva_editorial.economy.migration run --yes \
     --data-dir /path/to/data --backup-root /path/to/backups --by "<your name>" \
     --out /path/to/backups/sora-migration-report.json
   ```
   The exit code is 0 for `done`, `already_done` and `nothing_to_do`, and 1 for `aborted_before` and `aborted_restored`. A real run without `--yes` refuses to start.
6. **Check:**
   ```bash
   .venv/bin/python -m palavva_editorial.economy.migration status --data-dir /path/to/data
   ```
   Expect `currency_state: "sora"`, `migration: "done"`, `pals_held_outside_conversion: 0`, and the two fingerprints equal. The migration also stores both fingerprints in the `migrations` table.
7. **Start the services** (`scripts/dev-up.sh --prod`). The ledger is still frozen. Check these:
   - The wallet shows "Pals are now Sora" and the conversion line.
   - Command Center, Sora economy shows "Converted at 1 Pal = 1 Sora" under Pals to Sora, and the reconciliation is clean.
   - `curl -s -H "x-service-token: $EDITORIAL_SERVICE_TOKEN" http://127.0.0.1:8400/economy/migration`
8. **Unfreeze:**
   ```bash
   .venv/bin/python -m palavva_editorial.economy.migration unfreeze --by "<your name>" --data-dir /path/to/data
   ```
   This turns off `PALS_ISSUANCE_PAUSED` and `EXCHANGE_HALTED`. It refuses while the ledger is not converted.
9. Optional: re-offer the founding companies' treasury shares, if you decided to do so.

## If it goes wrong

- **`aborted_before`.** Reconciliation failed before anything was converted. Nothing changed except the freeze and the cancelled orders. Fix the cause (see Command Center, Sora economy, reconciliation history) and run again.
- **`aborted_restored`.** economy.db is back to its state at step 2: frozen, with the orders cancelled, still in Pals. The report's `error` or `differences` says what failed. Do not unfreeze. Keep the report and investigate.
- **Full rollback to before the deploy.** Stop the services. Check out the Phase 1 code. Then run `scripts/restore.sh --verify backups/palasora-<ts>` and `scripts/restore.sh backups/palasora-<ts> data --force` with the backup from step 1 of the real run (see `BACKUP-RESTORE.md`). Phase 1 code cannot read a schema v2 database safely, so restore the backup. Do not downgrade the schema in place.

## After the migration

- Sora is created only by the Town Hall (rewards, grants and the conversion) and the Harbour (Phase 3). Fees and clawbacks go to `platform:burn` and count as destroyed.
- Rewards are paid from the Town Hall's weekly budget. The budget is `ceil(supply at the start of the week x ((1 + g)^(7/365) - 1))`, with g = `SORA_GROWTH_TARGET` (default 0.20, clamped to 0.15 to 0.25). It is at least `SORA_WEEKLY_FLOOR` (default 5,000 Sora), unless an operator sets `SORA_WEEKLY_BUDGET`. Read it at `GET /economy/admin/issuance` and change it at `POST /economy/admin/issuance`, which is audited. The old daily pacing budget still applies on top.
- The conversion entries do not count against the weekly budget.
