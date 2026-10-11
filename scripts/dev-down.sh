#!/usr/bin/env bash
# Stop only the Palavva processes this repo started (by pid file). Never kills unrelated apps.
source "$(dirname "$0")/lib.sh"
load_env
RUN="$PALAVVA_DATA_DIR/run"
for svc in web intel writers fast worker editorial pocketbase; do
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
# Next.js renames its server process; stop any listener on our ports whose cwd is inside this repo.
for port in 3000 "${EDITORIAL_URL##*:}" "${PB_URL##*:}"; do
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    case "$cwd" in "$ROOT"*) kill -TERM "$pid" 2>/dev/null && echo "stopped listener on $port ($pid)";; esac
  done
done
