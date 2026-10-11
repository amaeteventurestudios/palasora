#!/usr/bin/env bash
# Start Palavva locally: PocketBase, seed, editorial API + worker, Next.js. Loopback only.
# Usage: scripts/dev-up.sh [--prod]   (--prod runs `next start` on a fresh build)
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"; LOG="$PALAVVA_DATA_DIR/logs"; mkdir -p "$RUN" "$LOG"
PBP=$(pb_port)
is_up() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }
port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -nP >/dev/null 2>&1; }

if ! is_up pocketbase; then
  port_busy "$PBP" && { echo "Port $PBP busy (not ours). Aborting."; exit 1; }
  nohup "$PB_BIN" serve --dir="$PALAVVA_DATA_DIR/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" \
    --hooksDir="$ROOT/services/pocketbase/pb_hooks" --http="127.0.0.1:$PBP" >> "$LOG/pocketbase.log" 2>&1 < /dev/null &
  echo $! > "$RUN/pocketbase.pid"
fi
for i in $(seq 1 40); do curl -sf "$PB_URL/api/health" >/dev/null && break; sleep 0.25; done
curl -sf "$PB_URL/api/health" >/dev/null || { echo "PocketBase failed to start; see $LOG/pocketbase.log"; exit 1; }
(cd "$ROOT/services/editorial" && "$PY" -m palavva_editorial.seed) >> "$LOG/seed.log" 2>&1 || { echo "Seed failed; see $LOG/seed.log"; tail -5 "$LOG/seed.log"; exit 1; }

EP="${EDITORIAL_URL##*:}"
if ! is_up editorial; then
  port_busy "$EP" && { echo "Port $EP busy (not ours). Aborting."; exit 1; }
  (cd "$ROOT/services/editorial" && exec nohup "$PY" -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port "$EP" >> "$LOG/editorial.log" 2>&1 < /dev/null) &
  echo $! > "$RUN/editorial.pid"
fi
if ! is_up worker; then
  (cd "$ROOT/services/editorial" && exec nohup "$PY" -m palavva_editorial.worker >> "$LOG/worker.log" 2>&1 < /dev/null) &
  echo $! > "$RUN/worker.pid"
fi
if ! is_up fast; then  # v1.5 fast action engine (model-free decisions, rewards sweep, simulated trading)
  (cd "$ROOT/services/editorial" && exec nohup "$PY" -m palavva_editorial.city.fast >> "$LOG/fast.log" 2>&1 < /dev/null) &
  echo $! > "$RUN/fast.pid"
fi
if [ "${WRITER_POOL_ENABLED:-false}" = "true" ] && ! is_up writers; then  # v1.6 shared writer pool
  (cd "$ROOT/services/editorial" && exec nohup "$PY" -m palavva_editorial.city.writers >> "$LOG/writers.log" 2>&1 < /dev/null) &
  echo $! > "$RUN/writers.pid"
fi
if [ "${INTEL_ENABLED:-false}" = "true" ] && ! is_up intel; then  # v1.6 pan-African intelligence runner
  (cd "$ROOT/services/editorial" && exec nohup "$PY" -m palavva_editorial.intel.discover >> "$LOG/intel.log" 2>&1 < /dev/null) &
  echo $! > "$RUN/intel.pid"
fi
if ! is_up web; then
  port_busy 3000 && { echo "Port 3000 busy (not ours). Aborting."; exit 1; }
  cd "$ROOT/apps/web"
  if [ "${1:-}" = "--prod" ]; then
    pnpm -s build >> "$LOG/web-build.log" 2>&1 || { echo "Web build failed; see $LOG/web-build.log"; exit 1; }
    nohup pnpm -s start >> "$LOG/web.log" 2>&1 < /dev/null &
  else
    nohup pnpm -s dev >> "$LOG/web.log" 2>&1 < /dev/null &
  fi
  echo $! > "$RUN/web.pid"
fi
for i in $(seq 1 120); do curl -sf -o /dev/null http://127.0.0.1:3000/api/v1/health && break; sleep 0.5; done
echo "Palavva is up:"
echo "  Web        http://127.0.0.1:3000        (sample tenant: http://sample.localhost:3000)"
echo "  Command Center http://127.0.0.1:3000/admin"
echo "  PocketBase 127.0.0.1:$PBP (loopback, superuser only)   Editorial 127.0.0.1:$EP"
echo "  Logs: $LOG"
