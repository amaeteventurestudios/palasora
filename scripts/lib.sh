#!/usr/bin/env bash
# Shared helpers for Palavva local scripts. Loopback only; never touches remote hosts.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PALAVVA_ENV_FILE:-$ROOT/.env.local}"
load_env() {
  [ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Run scripts/setup-local.sh first." >&2; exit 1; }
  set -a; . "$ENV_FILE"; set +a
  case "$PALAVVA_DATA_DIR" in /*) ;; *) PALAVVA_DATA_DIR="$ROOT/${PALAVVA_DATA_DIR#./}";; esac
  export PALAVVA_DATA_DIR
  if [ "${ORACLE_DEPLOYMENT_AUTHORIZED:-false}" != "false" ]; then echo "Refusing: ORACLE_DEPLOYMENT_AUTHORIZED must be false for local work" >&2; exit 1; fi
}
PB_BIN="$ROOT/services/pocketbase/bin/pocketbase"
PY="$ROOT/services/editorial/.venv/bin/python"
pb_port() { echo "${PB_URL##*:}"; }
