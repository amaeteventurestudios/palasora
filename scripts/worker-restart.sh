#!/usr/bin/env bash
# Restart only the editorial worker (and optionally the editorial API with --api). Loopback only.
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"; LOG="$PALAVVA_DATA_DIR/logs"
stop() { [ -f "$RUN/$1.pid" ] && { kill "$(cat "$RUN/$1.pid")" 2>/dev/null || true; }; }
stop worker; [ "${1:-}" = "--api" ] && stop editorial; sleep 1
cd "$ROOT/services/editorial"
(exec nohup "$PY" -m palavva_editorial.worker >> "$LOG/worker.log" 2>&1 < /dev/null) & echo $! > "$RUN/worker.pid"
if [ "${1:-}" = "--api" ]; then
  EP="${EDITORIAL_URL##*:}"
  (exec nohup "$PY" -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port "$EP" >> "$LOG/editorial.log" 2>&1 < /dev/null) & echo $! > "$RUN/editorial.pid"
fi
sleep 2; kill -0 "$(cat "$RUN/worker.pid")" && echo "worker up (pid $(cat "$RUN/worker.pid"))"
