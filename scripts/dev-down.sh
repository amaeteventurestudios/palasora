#!/usr/bin/env bash
# Stop only the Palavva processes this repo started (by pid file). Never kills unrelated apps.
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"
for svc in web worker editorial pocketbase; do
  f="$RUN/$svc.pid"
  if [ -f "$f" ]; then
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
      for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
      echo "stopped $svc ($pid)"
    fi
    rm -f "$f"
  fi
done
