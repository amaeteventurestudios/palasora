#!/usr/bin/env bash
# Rebuild apps/web/public/geo/<ISO2>.json for all 54 countries from downloaded geoBoundaries gbOpen ADM1 files, then
# the ADM1 index used by the persona generator and Local Pulse (scripts/build-adm1-index.py).
# Usage: scripts/build-geo-all.sh <download-dir containing NGA.geojson, NGA-meta.json, ...>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$1"
mkdir -p "$ROOT/apps/web/public/geo"
PAIRS="DZA:DZ AGO:AO BEN:BJ BWA:BW BFA:BF BDI:BI CPV:CV CMR:CM CAF:CF TCD:TD COM:KM COG:CG COD:CD CIV:CI DJI:DJ EGY:EG GNQ:GQ ERI:ER SWZ:SZ ETH:ET
GAB:GA GMB:GM GHA:GH GIN:GN GNB:GW KEN:KE LSO:LS LBR:LR LBY:LY MDG:MG MWI:MW MLI:ML MRT:MR MUS:MU MAR:MA MOZ:MZ NAM:NA NER:NE NGA:NG RWA:RW
STP:ST SEN:SN SYC:SC SLE:SL SOM:SO SSD:SS ZAF:ZA SDN:SD TZA:TZ TGO:TG TUN:TN UGA:UG ZMB:ZM ZWE:ZW"
for pair in $PAIRS; do
  iso3="${pair%%:*}"; iso2="${pair##*:}"
  meta="$SRC_DIR/$iso3-meta.json"
  lic=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["boundaryLicense"])' "$meta")
  src=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["boundarySource"])' "$meta")
  python3 -I "$ROOT/scripts/build-geo.py" "$SRC_DIR/$iso3.geojson" "$iso2" "$lic" "$src" "$ROOT/apps/web/public/geo/$iso2.json"
done
python3 -I "$ROOT/scripts/build-adm1-index.py" "$ROOT"
