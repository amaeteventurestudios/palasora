#!/usr/bin/env bash
# Run a Python module/script from services/editorial with the local .env.local loaded. Usage: scripts/pyenv.sh -m palavva_editorial.x | scripts/pyenv.sh path.py
source "$(dirname "$0")/lib.sh"
load_env
cd "$ROOT/services/editorial" && PYTHONPATH="$ROOT/services/editorial" exec "$PY" "$@"
