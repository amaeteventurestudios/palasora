#!/usr/bin/env bash
# Restart ONLY Palavva's Next.js process (pid file + cwd-checked), optionally rebuilding first. Loopback only.
# Usage: scripts/web-restart.sh [--build]
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"; LOG="$PALAVVA_DATA_DIR/logs"
cd "$ROOT/apps/web"
if [ "${1:-}" = "--build" ]; then pnpm -s build >> "$LOG/web-build.log" 2>&1 || { echo "build failed; see $LOG/web-build.log"; exit 1; }; fi
if [ -f "$RUN/web.pid" ] && kill -0 "$(cat "$RUN/web.pid")" 2>/dev/null; then
  pkill -TERM -P "$(cat "$RUN/web.pid")" 2>/dev/null || true; kill "$(cat "$RUN/web.pid")" 2>/dev/null || true
fi
# Any leftover listener on :3000 must be OUR next-server (cwd under apps/web) before we touch it.
for pid in $(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null); do
  if lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | grep -q "$ROOT/apps/web"; then kill "$pid" 2>/dev/null || true; else echo "port 3000 held by a non-Palavva process ($pid); aborting"; exit 1; fi
done
for i in $(seq 1 20); do lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.5; done
if [ "${1:-}" = "--dev" ]; then nohup pnpm -s dev >> "$LOG/web.log" 2>&1 < /dev/null & else nohup pnpm -s start >> "$LOG/web.log" 2>&1 < /dev/null & fi
echo $! > "$RUN/web.pid"
for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3000/api/v1/health && { echo "web up http://127.0.0.1:3000"; exit 0; }; sleep 0.5; done
echo "web did not become healthy; see $LOG/web.log"; exit 1
