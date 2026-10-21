# Backup and restore (Palasora)

Local, file-based backups of all Palasora state. Standard library Python only (`scripts/backup_tool.py`), so they run with any `python3` and need no `sqlite3` CLI.

## What a backup contains

A backup is a folder `backups/palasora-<UTC yyyymmddThhmmssZ>/` (a `-N` suffix is added if two run in the same second) with:

| Path in the backup | Source in the data dir (`PALAVVA_DATA_DIR`) | How it is copied |
| --- | --- | --- |
| `pb_data/data.db`, `pb_data/auxiliary.db` | PocketBase | SQLite online backup API |
| `economy.db` | the Exchange ledger (`ECONOMY_DB` if set elsewhere) | SQLite online backup API |
| `spend.db`, `jobs.db`, `search.db` | AI spend, job queue, search index | SQLite online backup API |
| `*.duckdb` | analytics cache | file copy |
| `analytics/` | analytics event partitions (NDJSON) | tree copy |
| `pb_data/storage/` | uploaded files | tree copy |
| `MANIFEST.json` | | format `palasora-backup-v1`, git commit, PocketBase version, migration files, and for every file its size, SHA-256, SQLite `integrity_check` result and row counts of key tables |
| `SHA256SUMS` | | `sha256sum -c` compatible |

The SQLite online backup API takes a consistent snapshot while services keep writing, so **no downtime is needed to back up**. Files that do not exist are skipped. The backup is built in a hidden `.partial` folder and renamed into place, so a `palasora-*` folder only ever appears complete. A backup also refuses to run if a copied SQLite file fails its integrity check. The newest 14 folders are kept (`BACKUP_KEEP` overrides), and older `palasora-*` folders are pruned. Nothing else in `backups/` is touched. `backups/` is git-ignored. Never commit a backup.

## Commands

```bash
scripts/backup.sh                              # back up PALAVVA_DATA_DIR (.env.local) into backups/
scripts/backup.sh data-test /tmp/bk            # back up another data dir into another folder
scripts/restore.sh --verify backups/palasora-<ts>    # re-hash every file; exits non-zero on any mismatch
scripts/restore.sh backups/palasora-<ts> <target>    # verify, then restore into an EMPTY target
scripts/restore.sh backups/palasora-<ts> <target> --force   # target not empty: old contents moved aside, never deleted
scripts/restore-drill.sh [backups/palasora-<ts>]     # isolated drill (below); never touches live data
```

`scripts/status.sh` and the admin host page show the newest backup and the last successful drill (`backups/LAST_RESTORE_DRILL_OK`).

## Restoring production data (step by step)

1. `scripts/dev-down.sh` to stop every service that uses the data dir.
2. `scripts/restore.sh --verify backups/palasora-<ts>`. Stop here if it fails, and pick an older backup.
3. `scripts/restore.sh backups/palasora-<ts> data --force`. The current contents of `data/` are **moved** into `data/.pre-restore-<ts>/`. Each restored file is hashed again after copying.
4. If the backup's `MANIFEST.json` `git_commit` differs from the checked-out code and the schema changed, check out that commit first. Migrations are forward-only and additive.
5. `scripts/dev-up.sh --prod`, then `scripts/status.sh`.
6. When the restored system is confirmed good, the `.pre-restore-<ts>` folder may be archived. The scripts never delete it.

## The drill

`scripts/restore-drill.sh` restores a backup (by default the newest) into a fresh temp dir using `restore.sh`, with checksums verified. It then boots PocketBase on `127.0.0.1:8399` against the restored data, using the repo's migrations and hooks, and checks:

- `/api/health` answers
- every SQLite file passes `integrity_check`, and the row counts equal the counts recorded in `MANIFEST.json` at backup time
- anonymous reads of `editorial_pieces` and `users` are still refused (403)
- if `.env.local` exists, the service account can log in

Finally it writes `backups/LAST_RESTORE_DRILL_OK` and removes the temp dir.

Run it after any change to backups and at least weekly.

`scripts/rollback-drill.sh` accepts either a `palasora-<ts>` folder (restored with `restore.sh`) or a legacy `.tar.gz` archive.

## Tests

`services/editorial/tests/test_backup_restore.py` covers three cases:

- **Round trip.** It backs up a seeded data dir and checks:
  - the expected files are present
  - every SQLite file reports integrity `ok`
  - `sha256sum -c SHA256SUMS` passes
  - the manifest counts match the source

  It then restores the backup, boots PocketBase on it, and compares `totalItems` with the manifest counts. It also confirms anonymous access is 403 and the economy and jobs rows are intact.
- **Refusals.** A non-empty target is refused without `--force`. With `--force` the old contents are moved into `.pre-restore-*`. A tampered file or manifest is detected before anything is copied.
- **Shell wrappers.** It runs `backup.sh <dir> <out>`, `restore.sh --verify` and `restore.sh <dir> <target>` end to end.

The real drill on the E2E data set is recorded in `docs/PHASE-1-REPORT.md`.
