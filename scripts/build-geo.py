#!/usr/bin/env python3
"""Convert geoBoundaries ADM1 GeoJSON (gbOpen) into compact, versioned SVG-path files for Local Pulse.

Usage: python3 -I scripts/build-geo.py <in.geojson> <ISO2> <license> <source> <out.json>
Input files are untrusted data: parsed as JSON only, numbers validated, nothing executed.
Projection: equirectangular with cos(mean latitude) x-scaling; Douglas-Peucker simplification.
"""
import json
import math
import sys

ZA_CODES = {"EC": "ZA-EC", "FS": "ZA-FS", "GT": "ZA-GP", "KZ": "ZA-KZN", "LI": "ZA-LP", "MP": "ZA-MP", "NC": "ZA-NC", "NW": "ZA-NW", "WC": "ZA-WC"}


def dp(points, eps):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return dp(points[: idx + 1], eps)[:-1] + dp(points[idx:], eps)
    return [points[0], points[-1]]


# v1.7 (all 54 countries): geoBoundaries gbOpen omits or duplicates ISO 3166-2 codes for a few countries, truncates
# Seychelles names at 10 characters and carries mojibake. Corrections are explicit and listed here (COUNTRY-COVERAGE.md).
CODE_FIX = {("CF", "Sangha-Mbaéré"): "CF-SE", ("CF", "Ouham-Pendé"): "CF-OP", ("BJ", "Kouffo"): "BJ-KO", ("SD", "Abyei PCA"): "SD-ABYEI",
            ("GM", "Kanifing"): "GM-KANIFING", ("GM", "Kuntaur"): "GM-KUNTAUR"}
CI_CODES = {"Abidjan": "CI-AB", "Bas-Sassandra": "CI-BS", "Comoé": "CI-CM", "Denguélé": "CI-DN", "Gôh-Djiboua": "CI-GD", "Lacs": "CI-LC", "Lagunes": "CI-LG",
            "Montagnes": "CI-MG", "Sassandra-Marahoué": "CI-SM", "Savanes": "CI-SV", "Vallée du Bandama": "CI-VB", "Woroba": "CI-WR", "Yamoussoukro": "CI-YM", "Zanzan": "CI-ZZ"}
NAME_FIX = {
    "CI": {"Denguele": "Denguélé", "District Autonome D'Abidjan": "Abidjan", "District Autonome De Yamoussoukro": "Yamoussoukro", "Goh-Djiboua": "Gôh-Djiboua",
           "Sassandra-Marahoue": "Sassandra-Marahoué", "Valle Du Bandama": "Vallée du Bandama", "Comoe": "Comoé"},
    "BJ": {"Atlanique": "Atlantique", "Oueme": "Ouémé"},
    "SC": {"Outer Isla": "Outer Islands", "Baie Saint": "Baie Sainte Anne", "Grand Anse": "Grand Anse Praslin", "La Digue a": "La Digue and Inner Islands",
           "Anse Aux P": "Anse aux Pins", "Anse Boile": "Anse Boileau", "Anse Etoil": "Anse Etoile", "Anse Royal": "Anse Royale", "Baie Lazar": "Baie Lazare",
           "Beau Vallo": "Beau Vallon", "Grand'Anse": "Grand Anse Mahé", "La RiviÃ¨re": "English River", "Les Mamell": "Les Mamelles", "Mont Buxto": "Mont Buxton",
           "Mont Fleur": "Mont Fleuri", "Pointe La": "Pointe La Rue", "Roche CaÃ¯m": "Roche Caïman", "Saint Loui": "Saint Louis"},
}


def slug_code(iso2: str, name: str) -> str:
    import unicodedata
    a = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return f"{iso2}-" + "".join(ch for ch in a.upper() if ch.isalnum())[:14]


def fix_name(iso2: str, name: str) -> str:
    return NAME_FIX.get(iso2, {}).get(name, name)


def fix_code(iso2: str, raw: str, name: str, seen: set) -> str:
    if (iso2, name) in CODE_FIX:
        return CODE_FIX[(iso2, name)]
    if iso2 == "CI":
        return CI_CODES[name]
    if iso2 == "ZA":
        return ZA_CODES.get(raw, raw)
    if iso2 == "ZW" and raw.startswith("ZW") and not raw.startswith("ZW-"):
        raw = "ZW-" + raw[2:]
    if raw.startswith(iso2 + "-") and raw not in seen:
        return raw
    return slug_code(iso2, name)  # missing, malformed or duplicated in the source: stable code from the name


def rings(geom):
    t = geom["type"]
    if t == "Polygon":
        return [geom["coordinates"][0]]
    if t == "MultiPolygon":
        return [poly[0] for poly in geom["coordinates"]]
    raise ValueError(t)


def main(src, iso2, license_, source, out):
    d = json.load(open(src))
    feats = d["features"]
    lats = [float(p[1]) for f in feats for r in rings(f["geometry"]) for p in r]
    lons = [float(p[0]) for f in feats for r in rings(f["geometry"]) for p in r]
    k = math.cos(math.radians((min(lats) + max(lats)) / 2))
    minx, maxx, miny, maxy = min(lons) * k, max(lons) * k, -max(lats), -min(lats)
    W = 1000.0
    s = W / (maxx - minx)
    H = (maxy - miny) * s
    eps = (maxx - minx) / 900  # ~1 px at 1000 px width
    areas = []
    seen: set[str] = set()
    for f in feats:
        props = f["properties"]
        name = fix_name(iso2, props.get("shapeName") or "")
        code = fix_code(iso2, props.get("shapeISO") or "", name, seen)
        seen.add(code)
        parts, area_sum, cx_sum, cy_sum = [], 0.0, 0.0, 0.0
        for ring in rings(f["geometry"]):
            pts = [((float(x) * k - minx) * s, (-float(y) - miny) * s) for x, y in ring[:-1]]  # drop the closing point
            if len(pts) < 3:
                continue
            # Split the closed ring at its farthest point so neither half is degenerate.
            far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
            pts = dp(pts[: far + 1], eps * s)[:-1] + dp(pts[far:] + [pts[0]], eps * s)[:-1]
            if len(pts) < 4:
                continue
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
            a = 0.0
            for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1]):
                cr = xa * yb - xb * ya
                a += cr
                cx_sum += (xa + xb) * cr
                cy_sum += (ya + yb) * cr
            area_sum += a
        cx, cy = (cx_sum / (3 * area_sum), cy_sum / (3 * area_sum)) if area_sum else (0, 0)
        areas.append({"code": code, "name": name, "d": "".join(parts), "cx": round(cx, 1), "cy": round(cy, 1)})
    areas.sort(key=lambda a: a["name"])
    json.dump({"country": iso2, "dataset": "geoBoundaries gbOpen ADM1", "source": source, "license": license_, "version": "9469f09",
               "attribution": f"Boundaries: geoBoundaries (gbOpen ADM1, {source}), {license_}. Simplified for display; not an authoritative border.",
               "viewBox": f"0 0 {W:.0f} {H:.0f}", "areas": areas}, open(out, "w"), separators=(",", ":"))
    print(iso2, len(areas), "areas", f"{len(open(out).read()) // 1024} KB")


if __name__ == "__main__":
    main(*sys.argv[1:6])
