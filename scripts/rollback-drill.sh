#!/usr/bin/env bash
# Rollback drill (T-042): prove we can return to a prior known-good version end to end, without touching the
# live checkout or the live data. Steps:
#   1. check out the known-good commit into an isolated git worktree (detached, removed afterwards)
#   2. restore the matching pre-change backup into a temporary data directory (checksum verified)
#   3. boot THAT version's PocketBase (its own migrations + hooks), editorial API and a production web build
#      on spare loopback ports (8397 / 8398 / 3398)
#   4. verify health, data, an anonymous ACL denial and real pages; then tear everything down
# Usage: scripts/rollback-drill.sh [<commit-ish>] [<backup.tar.gz> | <backups/palasora-<ts> folder>]
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_env
SHA=$(git -C "$ROOT" rev-parse "${1:-043fe79}")
ARCH="${2:-$ROOT/backups/palavva-20261009T221255Z.tar.gz}"
[ -e "$ARCH" ] || { echo "backup not found: $ARCH"; exit 1; }
if [ -f "$ARCH" ]; then [ "$(shasum -a 256 "$ARCH" | awk '{print $1}')" = "$(cat "$ARCH.sha256")" ] || { echo "checksum mismatch"; exit 1; }; fi
for p in 8397 8398 3398; do lsof -iTCP:$p -sTCP:LISTEN -nP >/dev/null && { echo "port $p busy"; exit 1; }; done
W=$(mktemp -d "${TMPDIR:-/tmp}/palavva-rollback.XXXXXX")
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && { pkill -TERM -P "$p" 2>/dev/null || true; kill -TERM "$p" 2>/dev/null || true; }; done
  for p in 8397 8398 3398; do for pid in $(lsof -tiTCP:$p -sTCP:LISTEN 2>/dev/null); do kill -TERM "$pid" 2>/dev/null || true; done; done
  git -C "$ROOT" worktree remove --force "$W/src" 2>/dev/null || true
  rm -rf "$W"
}
trap cleanup EXIT
fail() { echo "ROLLBACK DRILL FAILED: $*"; exit 1; }
echo "# Rollback drill $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "current HEAD: $(git -C "$ROOT" rev-parse --short HEAD)  ->  rolling back to: $(git -C "$ROOT" rev-parse --short "$SHA") ($(git -C "$ROOT" log -1 --format=%s "$SHA" | cut -c1-80))"
echo "backup: $(basename "$ARCH")"
git -C "$ROOT" worktree add --detach "$W/src" "$SHA" >/dev/null 2>&1 || fail "worktree"
# Palasora Phase 1: a palasora-<ts>/ folder is restored (and checksum-verified) by restore.sh; older .tar.gz archives are unpacked.
if [ -d "$ARCH" ]; then "$ROOT/scripts/restore.sh" "$ARCH" "$W/data" >/dev/null || fail "restore"; else mkdir -p "$W/data" && tar -C "$W/data" -xzf "$ARCH"; fi
mkdir -p "$W/data/run" "$W/data/logs"
S="$W/src"
"$PB_BIN" serve --dir="$W/data/pb_data" --migrationsDir="$S/services/pocketbase/pb_migrations" --hooksDir="$S/services/pocketbase/pb_hooks" --http=127.0.0.1:8397 > "$W/data/logs/pb.log" 2>&1 &
PIDS+=($!)
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8397/api/health >/dev/null && break; sleep 0.5; done
curl -sf http://127.0.0.1:8397/api/health >/dev/null || fail "pocketbase did not start"
echo "PASS pocketbase (rolled-back migrations/hooks) healthy on 127.0.0.1:8397"
[ "$(sqlite3 "$W/data/pb_data/data.db" 'pragma integrity_check')" = "ok" ] || fail "integrity"
echo "PASS restored data integrity_check ok; pieces=$(sqlite3 "$W/data/pb_data/data.db" 'select count(*) from editorial_pieces') comments=$(sqlite3 "$W/data/pb_data/data.db" 'select count(*) from comments')"
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8397/api/collections/users/records); [ "$code" = "403" ] || fail "ACL $code"
echo "PASS anonymous access still denied (403)"
( cd "$S/services/editorial" && PALAVVA_DATA_DIR="$W/data" PB_URL=http://127.0.0.1:8397 MODEL_PROVIDER=fixture INGEST_PAUSED=true AI_PAUSED=true \
    exec "$ROOT/services/editorial/.venv/bin/python" -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port 8398 > "$W/data/logs/editorial.log" 2>&1 ) &
PIDS+=($!)
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8398/health >/dev/null && break; sleep 0.5; done
curl -sf http://127.0.0.1:8398/health >/dev/null || fail "editorial did not start"
echo "PASS editorial API from the rolled-back code healthy on 127.0.0.1:8398"
# APFS copy-on-write clone (instant, near-zero disk); a symlink outside the worktree breaks standalone tracing.
cp -cR "$ROOT/apps/web/node_modules" "$S/apps/web/node_modules" 2>/dev/null || cp -R "$ROOT/apps/web/node_modules" "$S/apps/web/node_modules"
( cd "$S/apps/web" && PALAVVA_DATA_DIR="$W/data" PB_URL=http://127.0.0.1:8397 EDITORIAL_URL=http://127.0.0.1:8398 WEB_ORIGIN=http://127.0.0.1:3398 \
    TENANT_HOSTS='{"127.0.0.1:3398":"palavva"}' NEXT_DIST_DIR=.next-rollback ./node_modules/.bin/next build > "$W/data/logs/build.log" 2>&1 ) || { tail -20 "$W/data/logs/build.log"; fail "web build"; }
echo "PASS production web build of the rolled-back commit"
( cd "$S/apps/web" && PALAVVA_DATA_DIR="$W/data" PB_URL=http://127.0.0.1:8397 EDITORIAL_URL=http://127.0.0.1:8398 WEB_ORIGIN=http://127.0.0.1:3398 \
    TENANT_HOSTS='{"127.0.0.1:3398":"palavva"}' NEXT_DIST_DIR=.next-rollback exec ./node_modules/.bin/next start -H 127.0.0.1 -p 3398 > "$W/data/logs/web.log" 2>&1 ) &
PIDS+=($!)
for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3398/api/v1/health && break; sleep 0.5; done
for path in / /local-pulse /explore-africa; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3398$path"); [ "$code" = "200" ] || fail "$path -> $code"; echo "PASS GET $path -> 200"
done
slug=$(sqlite3 "$W/data/pb_data/data.db" "select slug from editorial_pieces where review_status='published' and is_demo=0 order by published_at desc limit 1")
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3398/discussion/$slug"); [ "$code" = "200" ] || fail "story $slug -> $code"
echo "PASS real published topic renders on the rolled-back version: /discussion/$slug"
echo "ROLLBACK DRILL OK: code $(git -C "$ROOT" rev-parse --short "$SHA") + data $(basename "$ARCH"); live checkout and live data untouched"
