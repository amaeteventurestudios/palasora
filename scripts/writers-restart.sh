#!/usr/bin/env bash
# Restart only the v1.6 shared writer pool. In-flight jobs finish (SIGTERM); unfinished leases return to the queue.
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"; LOG="$PALAVVA_DATA_DIR/logs"
if [ -f "$RUN/writers.pid" ]; then P=$(cat "$RUN/writers.pid"); kill "$P" 2>/dev/null || true; for i in $(seq 1 120); do kill -0 "$P" 2>/dev/null || break; sleep 1; done; fi
cd "$ROOT/services/editorial"
(exec nohup "$PY" -m palavva_editorial.city.writers >> "$LOG/writers.log" 2>&1 < /dev/null) & echo $! > "$RUN/writers.pid"
sleep 3; kill -0 "$(cat "$RUN/writers.pid")" 2>/dev/null && echo "writers up (pid $(cat "$RUN/writers.pid"))" || echo "writers NOT running; see $LOG/writers.log"
