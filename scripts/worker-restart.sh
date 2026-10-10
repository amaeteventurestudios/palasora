#!/usr/bin/env bash
# Restart only the editorial worker (and optionally the editorial API with --api). Loopback only.
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"; LOG="$PALAVVA_DATA_DIR/logs"
stop() { if [ -f "$RUN/$1.pid" ]; then kill "$(cat "$RUN/$1.pid")" 2>/dev/null || true; fi; return 0; }
OLD=$(cat "$RUN/worker.pid" 2>/dev/null || echo "")
stop worker; stop fast; if [ "${1:-}" = "--api" ]; then stop editorial; fi; sleep 1
# The worker finishes its current job before exiting (it may be mid-generation): wait up to 3 min for the lock to free.
for p in $OLD $(pgrep -f "palavva_editorial.worker" || true); do for i in $(seq 1 180); do kill -0 "$p" 2>/dev/null || break; sleep 1; done; done
cd "$ROOT/services/editorial"
(exec nohup "$PY" -m palavva_editorial.worker >> "$LOG/worker.log" 2>&1 < /dev/null) & echo $! > "$RUN/worker.pid"
(exec nohup "$PY" -m palavva_editorial.city.fast >> "$LOG/fast.log" 2>&1 < /dev/null) & echo $! > "$RUN/fast.pid"
if [ "${1:-}" = "--api" ]; then
  EP="${EDITORIAL_URL##*:}"
  (exec nohup "$PY" -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port "$EP" >> "$LOG/editorial.log" 2>&1 < /dev/null) & echo $! > "$RUN/editorial.pid"
fi
sleep 3; for x in worker fast; do kill -0 "$(cat "$RUN/$x.pid")" 2>/dev/null && echo "$x up (pid $(cat "$RUN/$x.pid"))" || echo "$x NOT running; see $LOG/$x.log"; done
