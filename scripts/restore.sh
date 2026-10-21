#!/usr/bin/env bash
# Restore a Palasora backup folder into a target data directory. Verifies every file against SHA256SUMS and
# MANIFEST.json (and SQLite integrity) BEFORE copying, and re-checks each copy. Refuses a non-empty target unless
# --force; with --force the current contents are moved aside into <target>/.pre-restore-<ts>/ (never deleted).
# Stop the services that use the target first (scripts/dev-down.sh). Docs: docs/operations/BACKUP-RESTORE.md
#   scripts/restore.sh <backup_dir> <target_data_dir> [--force]
#   scripts/restore.sh --verify <backup_dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${1:-}" = "--verify" ]; then exec python3 "$ROOT/scripts/backup_tool.py" verify "${2:?backup dir}"; fi
[ $# -ge 2 ] || { echo "usage: scripts/restore.sh <backup_dir> <target_data_dir> [--force] | --verify <backup_dir>" >&2; exit 2; }
exec python3 "$ROOT/scripts/backup_tool.py" restore "$1" "$2" ${3:+"$3"}
