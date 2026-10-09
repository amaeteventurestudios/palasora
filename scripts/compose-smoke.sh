#!/usr/bin/env bash
# Local container smoke test (T-038 local half). Builds the images, runs the Compose stack on 127.0.0.1:3400 with
# the deterministic fixture provider and ingestion paused, verifies v1.3 features inside containers, then removes
# everything (`down -v`). Never pushes images, never deploys. Output: docs/evidence/v131/compose-smoke.txt
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/evidence/v131/compose-smoke.txt"; mkdir -p "$(dirname "$OUT")"
DC=(docker compose -f "$ROOT/infra/compose/docker-compose.yml" -f "$ROOT/infra/compose/docker-compose.smoke.yml")
set -a; . "$ROOT/.env.compose"; set +a
ok=0; fail=0
# Checks run WITHOUT pipefail: `curl | grep -q` exits early by design (curl then reports a broken pipe or the -m timeout
# on a stream), which must not count as a failure. Each check's own condition decides.
check() { if ( set +o pipefail; eval "$2" ) >/dev/null 2>&1; then echo "PASS $1"; ok=$((ok+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
{
  echo "# Compose smoke $(date -u +%Y-%m-%dT%H:%M:%SZ) on Colima ($(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')). Local only; not deployed."
  echo "## build"; "${DC[@]}" build 2>&1 | grep -E "naming to|DONE|ERROR|error" | tail -8
  "${DC[@]}" up -d 2>&1 | tail -6
  for i in $(seq 1 60); do docker exec palavva_local-pocketbase-1 wget -qO- http://127.0.0.1:8090/api/health >/dev/null 2>&1 && break; sleep 2; done
  docker exec palavva_local-pocketbase-1 pocketbase superuser upsert "$PB_SERVICE_EMAIL" "$PB_SERVICE_PASSWORD" --dir=/pb/pb_data >/dev/null
  docker exec palavva_local-pocketbase-1 pocketbase superuser upsert "$PB_WORKER_EMAIL" "$PB_WORKER_PASSWORD" --dir=/pb/pb_data >/dev/null
  "${DC[@]}" restart editorial worker >/dev/null 2>&1
  docker exec palavva_local-editorial-1 python -m palavva_editorial.seed 2>&1 | tail -1
  for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3400/api/v1/health && break; sleep 2; done
  echo "## status"; "${DC[@]}" ps --format '{{.Service}} {{.Status}} {{.Ports}}'
  echo "## checks"
  check "web /" "curl -sf -o /dev/null http://127.0.0.1:3400/"
  check "web /local-pulse NG has 37 areas" "[ \$(curl -s 'http://127.0.0.1:3400/local-pulse?country=NG' | grep -o 'data-area=\"NG-' | wc -l) -eq 37 ]"
  check "web /explore-africa" "curl -sf -o /dev/null http://127.0.0.1:3400/explore-africa"
  check "web /my-africa" "curl -sf -o /dev/null http://127.0.0.1:3400/my-africa"
  check "web Arabic RTL via prefs cookie" "curl -s -H 'Cookie: pv_prefs=%7B%22ui%22%3A%22ar%22%7D' http://127.0.0.1:3400/ | grep -q 'dir=\"rtl\"'"
  check "web SSE /api/v1/events streams" "curl -s -m 4 http://127.0.0.1:3400/api/v1/events | grep -q 'connected cursor'"
  check "web events replay JSON" "curl -sf http://127.0.0.1:3400/api/v1/events/replay | grep -q latest_seq"
  check "web engagement refuses cross-origin" "[ \$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://evil.example' -d '{}' http://127.0.0.1:3400/api/v1/engagement) = 403 ]"
  check "editorial imports translate with registry (MT fr/ar enabled)" "docker exec palavva_local-editorial-1 python -c \"import palavva_editorial.translate as t; assert {'fr','ar'} <= t.MT_ENABLED\""
  check "editorial geo boundary names available" "docker exec palavva_local-editorial-1 python -c \"import palavva_editorial.geo as g; assert len(g.load_area_names()) == 5\""
  check "seed created 5-country geo areas" "docker exec palavva_local-editorial-1 python -c \"import os; from palavva_editorial.pb import PB; pb=PB(os.environ['PB_URL'],os.environ['PB_SERVICE_EMAIL'],os.environ['PB_SERVICE_PASSWORD']); assert pb._req('GET','/api/collections/geo_areas/records',params={'perPage':1})['totalItems'] >= 123\""
  check "v1.3.1 migrations applied (engagement_daily)" "docker exec palavva_local-editorial-1 python -c \"import os; from palavva_editorial.pb import PB; pb=PB(os.environ['PB_URL'],os.environ['PB_SERVICE_EMAIL'],os.environ['PB_SERVICE_PASSWORD']); pb._req('GET','/api/collections/engagement_daily/records')\""
  check "demo conversation publishes inside containers" "docker exec palavva_local-editorial-1 python -c \"import os,json,urllib.request as u; from palavva_editorial.pb import PB; pb=PB(os.environ['PB_URL'],os.environ['PB_SERVICE_EMAIL'],os.environ['PB_SERVICE_PASSWORD']); t=pb.first('tenants','slug=\\\"palavva\\\"'); r=u.Request('http://127.0.0.1:8000/conversations/demo',data=json.dumps({'tenant_id':t['id']}).encode(),headers={'content-type':'application/json','x-service-token':os.environ['EDITORIAL_SERVICE_TOKEN']}); assert json.load(u.urlopen(r))['published']\""
  sleep 25
  check "worker posted nested AI replies (fixture) inside containers" "docker exec palavva_local-editorial-1 python -c \"import os; from palavva_editorial.pb import PB; pb=PB(os.environ['PB_URL'],os.environ['PB_SERVICE_EMAIL'],os.environ['PB_SERVICE_PASSWORD']); assert len(pb.list('comments','author_kind=\\\"editorial_ai\\\" && depth>=2',per_page=5))>=1\""
  # Ask Docker what is published (an unrelated local app already listens on host :8090, so probing the port proves nothing).
  check "PocketBase container publishes NO host port" "[ -z \"\$(docker port palavva_local-pocketbase-1)\" ]"
  check "editorial container publishes NO host port" "[ -z \"\$(docker port palavva_local-editorial-1)\" ]"
  check "worker container publishes NO host port" "[ -z \"\$(docker port palavva_local-worker-1)\" ]"
  check "web published on loopback only (127.0.0.1:3400)" "[ \"\$(docker port palavva_local-web-1 3000/tcp)\" = '127.0.0.1:3400' ]"
  echo "## resources"; docker stats --no-stream --format '{{.Name}} mem={{.MemUsage}} cpu={{.CPUPerc}}' $(docker ps -q --filter name=palavva_local) 2>/dev/null
  echo "## images"; docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep palavva_local
  echo "## result: $ok passed, $fail failed"
  "${DC[@]}" down -v 2>&1 | tail -2
} 2>&1 | tee "$OUT"
grep -q "result: .* 0 failed" "$OUT"
