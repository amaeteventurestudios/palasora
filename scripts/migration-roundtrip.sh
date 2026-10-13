#!/usr/bin/env bash
# usage: scripts/migration-roundtrip.sh <migration-file-name> [steps] [extra-sql-for-down-state]
# Round-trips the newest N data.db migrations on a COPY of live PocketBase (never touches data/).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; S="${TMPDIR:-/tmp}/palavva-migtest"; MIG=$1; N=${2:-1}; EXTRA=${3:-select 1}
rm -rf "$S"; mkdir -p "$S/pb_data"
sqlite3 "$ROOT/data/pb_data/data.db" ".backup '$S/pb_data/data.db'"
PB=$ROOT/services/pocketbase/bin/pocketbase
M=(--dir="$S/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" --hooksDir="$ROOT/services/pocketbase/pb_hooks")
q(){ sqlite3 "$S/pb_data/data.db" "select 'collections='||(select count(*) from _collections)||' mig_applied='||(select count(*) from _migrations where file='$MIG')||' agents='||(select count(*) from agents)||' users='||(select count(*) from users); pragma integrity_check; $EXTRA;" | tr '\n' ' '; }
echo "before:  $(q)"
"$PB" migrate up "${M[@]}" 2>&1 | tail -1
sqlite3 "$S/pb_data/data.db" "update _migrations set applied=1 where file like '%aux%'"   # fresh empty aux db: keep its init out of 'down'
echo "up:      $(q)"
yes | "$PB" migrate down "$N" "${M[@]}" 2>&1 | tail -1; echo
echo "down $N:  $(q)"
"$PB" migrate up "${M[@]}" 2>&1 | tail -1
echo "re-up:   $(q)"
