#!/usr/bin/env bash
# Consistent online backup of all local Palasora state (PocketBase pb_data, economy.db, spend.db, jobs.db, search.db,
# DuckDB analytics files and the analytics/ event partitions) into backups/palasora-<UTC ts>/ with MANIFEST.json and a
# SHA-256 manifest (SHA256SUMS). SQLite files use SQLite's online backup API, so it is safe while services run.
# Keeps the newest 14 backup folders. Docs: docs/operations/BACKUP-RESTORE.md
#   scripts/backup.sh                     back up PALAVVA_DATA_DIR from .env.local into backups/
#   scripts/backup.sh <data_dir> [<out>]  back up another data dir (e.g. data-test) into <out> (default backups/)
source "$(dirname "$0")/lib.sh"
if [ $# -ge 1 ]; then DATA="$1"; else load_env; DATA="$PALAVVA_DATA_DIR"; fi
OUT="${2:-$ROOT/backups}"
exec python3 "$ROOT/scripts/backup_tool.py" backup "$DATA" "$OUT" --keep "${BACKUP_KEEP:-14}"
