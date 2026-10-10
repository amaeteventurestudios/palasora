#!/usr/bin/env bash
# Run N bounded operator evaluation windows on the DEV stack, one after another (same caps + kill switches as the
# scheduler), waiting for each window's jobs to finish. Prints each window's outcome. Usage: scripts/city-smoke.sh [N] [reason]
source "$(dirname "$0")/lib.sh"
load_env
N="${1:-1}"; REASON="${2:-smoke}"
cd "$ROOT/services/editorial"
T=$("$PY" - <<PY
import os
from palavva_editorial.pb import PB
pb=PB(os.environ["PB_URL"],os.environ["PB_WORKER_EMAIL"],os.environ["PB_WORKER_PASSWORD"])
print(pb.first("tenants","slug='palavva'")["id"])
PY
)
for i in $(seq 1 "$N"); do
  J=$(curl -s -X POST -H "x-service-token: $EDITORIAL_SERVICE_TOKEN" -H "content-type: application/json" -d "{\"tenant_id\":\"$T\",\"reason\":\"operator $REASON $i\"}" "$EDITORIAL_URL/city/tick")
  echo "window $i: $J"
  for k in $(seq 1 120); do
    n=$(sqlite3 "$PALAVVA_DATA_DIR/jobs.db" "select count(*) from jobs where type like 'city%' and state in ('queued','running');")
    [ "$n" = "0" ] && break; sleep 5
  done
  sqlite3 "$PALAVVA_DATA_DIR/jobs.db" "select type, substr(result,1,300) from jobs where type like 'city%' order by updated_at desc limit 4;"
done
