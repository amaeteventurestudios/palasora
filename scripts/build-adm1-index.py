#!/usr/bin/env python3
"""Write the 54-country ADM1 index (codes, names, licence, dataset vintage) from apps/web/public/geo/*.json.

Outputs (same content): apps/web/lib/geo/adm1.json (web) and services/editorial/palavva_editorial/city/data/adm1.json
(persona generator). Usage: python3 -I scripts/build-adm1-index.py <repo-root>
"""
import json
import os
import sys

root = sys.argv[1]
geo = os.path.join(root, "apps/web/public/geo")
out = {}
for f in sorted(os.listdir(geo)):
    if not f.endswith(".json"):
        continue
    d = json.load(open(os.path.join(geo, f)))
    out[d["country"]] = {"dataset": d["dataset"], "license": d["license"], "source": d["source"], "attribution": d["attribution"], "count": len(d["areas"]),
                         "areas": [{"code": a["code"], "name": a["name"]} for a in d["areas"]]}
for path in ("apps/web/lib/geo/adm1.json", "services/editorial/palavva_editorial/city/data/adm1.json"):
    p = os.path.join(root, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(out, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(out)} countries, {sum(v['count'] for v in out.values())} ADM1 areas")
