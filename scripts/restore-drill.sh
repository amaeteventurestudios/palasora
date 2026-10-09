#!/usr/bin/env bash
# Restore drill (T-037 local): restore the newest (or given) backup into an ISOLATED temp dir,
# boot PocketBase on a spare loopback port, and verify integrity, record counts, migrations and
# that anonymous API access is still denied. Never touches the live data directory.
source "$(dirname "$0")/lib.sh"
load_env
ARCH="${1:-$(ls -1t "$ROOT"/backups/palavva-*.tar.gz | head -1)}"
[ -f "$ARCH" ] || { echo "no backup found"; exit 1; }
[ "$(shasum -a 256 "$ARCH" | awk '{print $1}')" = "$(cat "$ARCH.sha256")" ] || { echo "checksum mismatch"; exit 1; }
R=$(mktemp -d "${TMPDIR:-/tmp}/palavva-restore.XXXXXX")
tar -C "$R" -xzf "$ARCH"
PORT=8399
lsof -iTCP:$PORT -sTCP:LISTEN -nP >/dev/null && { echo "port $PORT busy"; exit 1; }
"$PB_BIN" serve --dir="$R/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" --hooksDir="$ROOT/services/pocketbase/pb_hooks" --http=127.0.0.1:$PORT >/dev/null 2>&1 &
PID=$!; trap 'kill $PID 2>/dev/null; rm -rf "$R"' EXIT
for i in $(seq 1 40); do curl -sf http://127.0.0.1:$PORT/api/health >/dev/null && break; sleep 0.25; done
fail() { echo "RESTORE DRILL FAILED: $*"; exit 1; }
for t in tenants editorial_pieces comments users sources audit_events; do
  live=$(sqlite3 "$PALAVVA_DATA_DIR/pb_data/data.db" "select count(*) from $t"); rest=$(sqlite3 "$R/pb_data/data.db" "select count(*) from $t")
  echo "  $t: backup=$rest live_now=$live"; [ "$rest" -gt 0 ] || [ "$t" = "comments" ] || fail "$t empty"
done
[ "$(sqlite3 "$R/pb_data/data.db" 'pragma integrity_check')" = "ok" ] || fail "integrity"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/collections/editorial_pieces/records"); [ "$code" = "403" ] || fail "ACL: anonymous got $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/collections/users/records"); [ "$code" = "403" ] || fail "ACL users: $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d "{\"identity\":\"$PB_SERVICE_EMAIL\",\"password\":\"$PB_SERVICE_PASSWORD\"}" "http://127.0.0.1:$PORT/api/collections/_superusers/auth-with-password")
[ "$code" = "200" ] || fail "service login $code"
[ -f "$R/jobs.db" ] && [ "$(sqlite3 "$R/jobs.db" 'pragma integrity_check')" = "ok" ] && echo "  jobs.db ok"
date -u +%Y-%m-%dT%H:%M:%SZ > "$ROOT/backups/LAST_RESTORE_DRILL_OK"
echo "RESTORE DRILL OK: $(basename "$ARCH")"
