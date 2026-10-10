#!/usr/bin/env bash
# Consistent online backup of all Palavva local state into backups/palavva-<ts>.tar.gz (+ .sha256).
# Uses SQLite's online backup API (safe while services run). Keeps the newest 14 archives.
source "$(dirname "$0")/lib.sh"
load_env
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$ROOT/backups"; mkdir -p "$OUT"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/palavva-backup.XXXXXX"); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/pb_data"
for db in data.db auxiliary.db; do sqlite3 "$PALAVVA_DATA_DIR/pb_data/$db" ".backup '$TMP/pb_data/$db'"; done
for db in jobs.db search.db economy.db; do [ -f "$PALAVVA_DATA_DIR/$db" ] && sqlite3 "$PALAVVA_DATA_DIR/$db" ".backup '$TMP/$db'"; done
[ -d "$PALAVVA_DATA_DIR/pb_data/storage" ] && cp -R "$PALAVVA_DATA_DIR/pb_data/storage" "$TMP/pb_data/storage"
[ -d "$PALAVVA_DATA_DIR/analytics" ] && cp -R "$PALAVVA_DATA_DIR/analytics" "$TMP/analytics"
for db in "$TMP"/pb_data/*.db "$TMP"/*.db; do [ -f "$db" ] && [ "$(sqlite3 "$db" 'pragma integrity_check')" = "ok" ] || { [ -f "$db" ] && { echo "integrity check failed: $db"; exit 1; }; }; done
{ echo "created_utc=$TS"; echo "git_commit=$(git -C "$ROOT" rev-parse HEAD)"; echo "pocketbase=$("$PB_BIN" --version)";
  echo "migrations=$(ls "$ROOT/services/pocketbase/pb_migrations" | tr '\n' ' ')"; echo "data_dir=$PALAVVA_DATA_DIR"; } > "$TMP/MANIFEST"
ARCH="$OUT/palavva-$TS.tar.gz"
tar -C "$TMP" -czf "$ARCH" .
shasum -a 256 "$ARCH" | awk '{print $1}' > "$ARCH.sha256"
ls -1t "$OUT"/palavva-*.tar.gz | tail -n +15 | while read -r f; do rm -f "$f" "$f.sha256"; done
echo "backup: $ARCH ($(du -h "$ARCH" | cut -f1)), sha256 $(cat "$ARCH.sha256")"
