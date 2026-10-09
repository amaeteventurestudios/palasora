#!/usr/bin/env bash
# Run every automated suite and write logs to docs/evidence/test-runs/<ts>/.
#   1) web typecheck + vitest   2) pytest (unit + integration on an isolated PocketBase)
#   3) isolated E2E stack (data-test/, :3300) + Playwright (functional, a11y, outage)
# Real-Qwen tests are opt-in: REAL_QWEN=1 scripts/test-all.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS=$(date -u +%Y%m%dT%H%M%SZ); OUT="$ROOT/docs/evidence/test-runs/$TS"; mkdir -p "$OUT"
rc=0
step() { echo "== $1"; shift; if "$@" > "$OUT/$(echo "$1" | tr ' /' '__').log" 2>&1; then echo "   PASS"; else echo "   FAIL (see $OUT)"; rc=1; fi; }
cd "$ROOT/apps/web"
echo "== typecheck"; npx tsc --noEmit > "$OUT/typecheck.log" 2>&1 && echo "   PASS" || { echo "   FAIL"; rc=1; }
echo "== vitest"; npx vitest run > "$OUT/vitest.log" 2>&1 && echo "   PASS ($(grep -Eo 'Tests +[0-9]+ passed' "$OUT/vitest.log"))" || { echo "   FAIL"; rc=1; }
cd "$ROOT/services/editorial"
echo "== pytest"; .venv/bin/python -m pytest -q tests/ > "$OUT/pytest.log" 2>&1 && echo "   PASS ($(tail -1 "$OUT/pytest.log"))" || { echo "   FAIL"; rc=1; }
if [ "${REAL_QWEN:-0}" = "1" ]; then
  echo "== real Qwen"; PALAVVA_REAL_QWEN=1 .venv/bin/python -m pytest -q -s tests/test_real_qwen.py > "$OUT/real-qwen.log" 2>&1 && echo "   PASS" || { echo "   FAIL"; rc=1; }
fi
cd "$ROOT"
echo "== E2E stack (reset + build)"; bash scripts/test-stack.sh reset > /dev/null 2>&1; E2E_BUILD=1 bash scripts/test-stack.sh up > "$OUT/test-stack.log" 2>&1 < /dev/null; grep -q "test stack up" "$OUT/test-stack.log" && echo "   up" || { echo "   FAILED TO START"; rc=1; }
cd "$ROOT/apps/web"
echo "== playwright"; npx playwright test > "$OUT/playwright.log" 2>&1 && echo "   PASS ($(grep -Eo '[0-9]+ passed' "$OUT/playwright.log" | tail -1))" || { echo "   FAIL ($(grep -Eo '[0-9]+ (passed|failed)' "$OUT/playwright.log" | tr '\n' ' '))"; rc=1; }
cd "$ROOT"; bash scripts/test-stack.sh down > /dev/null 2>&1
echo "logs: $OUT"; exit $rc
