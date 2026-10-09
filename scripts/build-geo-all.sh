#!/usr/bin/env bash
# Rebuild apps/web/public/geo/<ISO2>.json from downloaded geoBoundaries gbOpen ADM1 files.
# Usage: scripts/build-geo-all.sh <download-dir containing NGA.geojson, NGA-meta.json, ...>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$1"
mkdir -p "$ROOT/apps/web/public/geo"
for pair in NGA:NG ZAF:ZA KEN:KE GHA:GH SEN:SN; do
  iso3="${pair%%:*}"; iso2="${pair##*:}"
  meta="$SRC_DIR/$iso3-meta.json"
  lic=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["boundaryLicense"])' "$meta")
  src=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["boundarySource"])' "$meta")
  python3 -I "$ROOT/scripts/build-geo.py" "$SRC_DIR/$iso3.geojson" "$iso2" "$lic" "$src" "$ROOT/apps/web/public/geo/$iso2.json"
done
