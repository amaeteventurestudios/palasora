#!/usr/bin/env bash
# Restart only PocketBase (applies new migrations). Loopback only.
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"; LOG="$PALAVVA_DATA_DIR/logs"
[ -f "$RUN/pocketbase.pid" ] && { kill "$(cat "$RUN/pocketbase.pid")" 2>/dev/null || true; }; sleep 1
nohup "$PB_BIN" serve --dir="$PALAVVA_DATA_DIR/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" \
  --hooksDir="$ROOT/services/pocketbase/pb_hooks" --http="127.0.0.1:$(pb_port)" >> "$LOG/pocketbase.log" 2>&1 < /dev/null &
echo $! > "$RUN/pocketbase.pid"
for i in $(seq 1 40); do curl -sf "$PB_URL/api/health" >/dev/null && { echo "pocketbase up"; exit 0; }; sleep 0.25; done
echo "pocketbase failed; see $LOG/pocketbase.log"; tail -5 "$LOG/pocketbase.log"; exit 1
