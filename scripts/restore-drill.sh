#!/usr/bin/env bash
# Restore drill (T-037 local, Palasora Phase 1): restore the newest (or given) backup folder into an ISOLATED temp dir
# with scripts/restore.sh (checksums verified), boot PocketBase on a spare loopback port, and verify integrity, that the
# record counts equal the counts recorded in the backup's MANIFEST.json, migrations, and that anonymous API access is
# still denied. Never touches the live data directory.
#   scripts/restore-drill.sh [<backup_dir>] [--service-login]
source "$(dirname "$0")/lib.sh"
BK="${1:-$(ls -1d "$ROOT"/backups/palasora-*/ 2>/dev/null | sort | tail -1)}"
BK="${BK%/}"
[ -d "$BK" ] || { echo "no backup folder found (run scripts/backup.sh first)"; exit 1; }
R=$(mktemp -d "${TMPDIR:-/tmp}/palasora-restore.XXXXXX")
PORT="${RESTORE_DRILL_PORT:-8399}"
fail() { echo "RESTORE DRILL FAILED: $*"; exit 1; }
if command -v lsof >/dev/null && lsof -iTCP:$PORT -sTCP:LISTEN -nP >/dev/null 2>&1; then echo "port $PORT busy"; exit 1; fi
bash "$ROOT/scripts/restore.sh" "$BK" "$R/data" || fail "restore"
"$PB_BIN" serve --dir="$R/data/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" --hooksDir="$ROOT/services/pocketbase/pb_hooks" --http=127.0.0.1:$PORT >"$R/pb.log" 2>&1 &
PID=$!; trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$R"' EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:$PORT/api/health >/dev/null && break; sleep 0.25; done
curl -sf http://127.0.0.1:$PORT/api/health >/dev/null || fail "PocketBase did not start on the restored data"
echo "  PocketBase healthy on the restored data (127.0.0.1:$PORT)"
# Record counts: restored databases vs the counts the backup recorded at backup time (after PocketBase opened them).
python3 - "$BK" "$R/data" <<'EOF' || fail "record counts differ"
import json, sqlite3, sys
from pathlib import Path
bk, tgt = Path(sys.argv[1]), Path(sys.argv[2])
man = json.loads((bk / "MANIFEST.json").read_text())
bad = 0
for f in man["files"]:
    if not f.get("counts"):
        continue
    c = sqlite3.connect(f"file:{tgt / f['path']}?mode=ro", uri=True)
    assert c.execute("pragma integrity_check").fetchone()[0] == "ok", f["path"]
    for t, n in f["counts"].items():
        got = c.execute(f'select count(*) from "{t}"').fetchone()[0]
        print(f"  {f['path']} {t}: backup={n} restored={got}" + ("" if got == n else "  MISMATCH"))
        bad += got != n
    c.close()
sys.exit(1 if bad else 0)
EOF
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/collections/editorial_pieces/records"); [ "$code" = "403" ] || fail "ACL: anonymous got $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/collections/users/records"); [ "$code" = "403" ] || fail "ACL users: $code"
echo "  anonymous access still denied (403)"
if [ "${2:-}" = "--service-login" ] || [ -f "$ENV_FILE" ]; then
  if [ -f "$ENV_FILE" ]; then
    set -a; . "$ENV_FILE"; set +a
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d "{\"identity\":\"$PB_SERVICE_EMAIL\",\"password\":\"$PB_SERVICE_PASSWORD\"}" "http://127.0.0.1:$PORT/api/collections/_superusers/auth-with-password")
    echo "  service account login on restored data: HTTP $code"
  fi
fi
mkdir -p "$ROOT/backups"
date -u +%Y-%m-%dT%H:%M:%SZ > "$ROOT/backups/LAST_RESTORE_DRILL_OK"
echo "RESTORE DRILL OK: $(basename "$BK")"
