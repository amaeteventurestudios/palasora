#!/usr/bin/env bash
# Isolated, disposable E2E stack: data-test/, ports 3300 (web), 8390 (PocketBase), 8400 (editorial),
# deterministic FIXTURE model provider. Never touches data/ (the dev dataset).
# Usage: scripts/test-stack.sh up|down|reset
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/.env.test"
CMD="${1:-up}"
if [ "$CMD" = "editorial-stop" ] || [ "$CMD" = "editorial-start" ]; then
  set -a; . "$ENVF"; set +a; D="$ROOT/data-test"; export PALAVVA_DATA_DIR="$D"
  if [ "$CMD" = "editorial-stop" ]; then
    kill -TERM "$(cat "$D/run/editorial.pid")" 2>/dev/null || true
    for pid in $(lsof -tiTCP:8400 -sTCP:LISTEN 2>/dev/null); do
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'); case "$cwd" in "$ROOT"*) kill -TERM "$pid";; esac; done
    for i in $(seq 1 20); do lsof -tiTCP:8400 -sTCP:LISTEN >/dev/null 2>&1 || exit 0; sleep 0.25; done; exit 1
  fi
  (cd "$ROOT/services/editorial" && exec nohup "$ROOT/services/editorial/.venv/bin/python" -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port 8400 >> "$D/logs/editorial.log" 2>&1 < /dev/null) &
  echo $! > "$D/run/editorial.pid"
  for i in $(seq 1 40); do curl -sf http://127.0.0.1:8400/health >/dev/null && exit 0; sleep 0.25; done; exit 1
fi
if [ "$CMD" = "down" ] || [ "$CMD" = "reset" ]; then
  for f in "$ROOT"/data-test/run/*.pid; do [ -f "$f" ] && { pkill -TERM -P "$(cat "$f")" 2>/dev/null || true; kill -TERM "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; }; done
  for port in 3300 8390 8400; do for pid in $(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'); case "$cwd" in "$ROOT"*) kill -TERM "$pid";; esac; done; done
  sleep 1
  [ "$CMD" = "reset" ] && rm -rf "$ROOT/data-test"
  [ "$CMD" = "down" ] && exit 0
fi
if [ ! -f "$ENVF" ]; then
  sed -e "s|^PALAVVA_DATA_DIR=.*|PALAVVA_DATA_DIR=./data-test|" -e "s|^PALAVVA_ENV=.*|PALAVVA_ENV=test|" \
      -e "s|^PB_URL=.*|PB_URL=http://127.0.0.1:8390|" -e "s|^EDITORIAL_URL=.*|EDITORIAL_URL=http://127.0.0.1:8400|" \
      -e "s|^WEB_ORIGIN=.*|WEB_ORIGIN=http://127.0.0.1:3300|" -e "s|^MODEL_PROVIDER=.*|MODEL_PROVIDER=fixture|" \
      -e "s|^TENANT_HOSTS=.*|TENANT_HOSTS='{\"127.0.0.1:3300\":\"palavva\",\"localhost:3300\":\"palavva\",\"sample.localhost:3300\":\"sample-community\"}'|" \
      "$ROOT/.env.local" > "$ENVF"
  chmod 600 "$ENVF"
fi
set -a; . "$ENVF"; set +a
D="$ROOT/data-test"; export PALAVVA_DATA_DIR="$D"
mkdir -p "$D"/{pb_data,analytics,mail-sink,logs,run}
PB="$ROOT/services/pocketbase/bin/pocketbase"; PY="$ROOT/services/editorial/.venv/bin/python"
"$PB" migrate up --dir="$D/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" >/dev/null
"$PB" superuser upsert "$PB_SERVICE_EMAIL" "$PB_SERVICE_PASSWORD" --dir="$D/pb_data" >/dev/null
"$PB" superuser upsert "$PB_WORKER_EMAIL" "$PB_WORKER_PASSWORD" --dir="$D/pb_data" >/dev/null
nohup "$PB" serve --dir="$D/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" --hooksDir="$ROOT/services/pocketbase/pb_hooks" --http=127.0.0.1:8390 >> "$D/logs/pocketbase.log" 2>&1 < /dev/null &
echo $! > "$D/run/pocketbase.pid"
for i in $(seq 1 40); do curl -sf http://127.0.0.1:8390/api/health >/dev/null && break; sleep 0.25; done
(cd "$ROOT/services/editorial" && "$PY" -m palavva_editorial.seed && "$PY" -m palavva_editorial.e2e_fixtures) >> "$D/logs/seed.log" 2>&1
(cd "$ROOT/services/editorial" && exec nohup "$PY" -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port 8400 >> "$D/logs/editorial.log" 2>&1 < /dev/null) &
echo $! > "$D/run/editorial.pid"
cd "$ROOT/apps/web"
if [ "${E2E_BUILD:-1}" = "1" ]; then NEXT_DIST_DIR=.next-test pnpm -s build >> "$D/logs/web-build.log" 2>&1; fi
NEXT_DIST_DIR=.next-test nohup ./node_modules/.bin/next start -H 127.0.0.1 -p 3300 >> "$D/logs/web.log" 2>&1 < /dev/null &
echo $! > "$D/run/web.pid"
for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3300/api/v1/health && break; sleep 0.5; done
curl -sf -o /dev/null http://127.0.0.1:3300/api/v1/health && echo "test stack up on http://127.0.0.1:3300"
