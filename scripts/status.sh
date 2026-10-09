#!/usr/bin/env bash
# Show Palavva local service status, ports, versions and policy gates (no secrets printed).
source "$(dirname "$0")/lib.sh"
load_env
for svc in pocketbase editorial worker web; do f="$PALAVVA_DATA_DIR/run/$svc.pid"; if [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null; then echo "$svc: running (pid $(cat "$f"))"; else echo "$svc: stopped"; fi; done
echo "web       $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1/health)  http://127.0.0.1:3000"
echo "pocketbase $(curl -s -o /dev/null -w '%{http_code}' "$PB_URL/api/health")  $PB_URL (loopback)"
echo "editorial $(curl -s -o /dev/null -w '%{http_code}' "$EDITORIAL_URL/health")  $EDITORIAL_URL (loopback)"
echo "qwen      $(curl -s -m 5 -o /dev/null -w '%{http_code}' "$OLLAMA_URL/api/tags")  (private Tailscale)"
echo "policy    ORACLE_DEPLOYMENT_AUTHORIZED=$ORACLE_DEPLOYMENT_AUTHORIZED PUBLIC_LAUNCH_AUTHORIZED=$PUBLIC_LAUNCH_AUTHORIZED PAID_FALLBACKS_ENABLED=$PAID_FALLBACKS_ENABLED"
echo "backups   $(ls -1t "$ROOT"/backups/palavva-*.tar.gz 2>/dev/null | head -1 | xargs -I{} basename {}) ; restore drill: $(cat "$ROOT/backups/LAST_RESTORE_DRILL_OK" 2>/dev/null || echo never)"
