"""Build lib/geo/africa-paths.json: one simplified SVG path per African country (54 + Western Sahara, no data).

Source: Natural Earth 1:50m Admin-0 countries (public domain, naturalearthdata.com). Projection: equirectangular
over Africa's bounding box (cos(latitude) correction at 5 deg N), scaled to a 1000-unit-wide viewBox. Douglas-Peucker
simplification keeps the file small for low-bandwidth phones. Somaliland is drawn as part of Somalia (UN-recognised
boundaries); Western Sahara is drawn neutral, without data. Usage: python3 scripts/build-africa-map.py <ne_50m.geojson>
"""
import json, math, sys
from pathlib import Path

src = json.load(open(sys.argv[1]))
reg = json.load(open(Path(__file__).resolve().parents[1] / "apps/web/lib/i18n/registry.json"))["countries"]
W0, E0, S0, N0 = -26.0, 64.0, -36.0, 38.5
K = math.cos(math.radians(5))
SCALE = 1000 / ((E0 - W0) * K)
H = (N0 - S0) * SCALE

def proj(lon, lat):
    return ((lon - W0) * K * SCALE, (N0 - lat) * SCALE)

def dp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    i, dmax = 0, 0.0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            i, dmax = k, d
    if dmax > eps:
        return dp(pts[: i + 1], eps)[:-1] + dp(pts[i:], eps)
    return [pts[0], pts[-1]]

def ring_path(ring):
    raw = [proj(*p[:2]) for p in ring]
    if len(raw) > 3 and raw[0] == raw[-1]:
        raw = raw[:-1]  # closed ring: simplify the two halves separately (a zero-length baseline would collapse it)
    mid = len(raw) // 2
    pts = dp(raw[: mid + 1], 0.6)[:-1] + dp(raw[mid:] + [raw[0]], 0.6)
    if len(pts) < 3:
        return ""
    return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"

out = {}
for f in src["features"]:
    p = f["properties"]
    if p.get("CONTINENT") != "Africa" and p.get("ISO_A2_EH") not in reg:
        continue
    iso = p.get("ISO_A2_EH") or p.get("ISO_A2")
    if p.get("ADMIN") == "Somaliland":
        iso = "SO"
    if p.get("ADMIN") == "Western Sahara":
        iso = "EH"
    if iso not in reg and iso != "EH":
        continue
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    d = "".join(ring_path(poly[0]) for poly in polys)
    # tiny islands may vanish under simplification: keep a small marker path instead of nothing
    if not d:
        x, y = proj(*polys[0][0][0][:2])
        d = f"M{x-2:.1f},{y:.1f}a2,2 0 1,0 4,0a2,2 0 1,0 -4,0Z"
    out[iso] = out.get(iso, "") + d
missing = sorted(set(reg) - set(out))
json.dump({"viewBox": f"0 0 1000 {H:.0f}", "source": "Natural Earth 1:50m Admin-0 (public domain)", "paths": out}, open(Path(__file__).resolve().parents[1] / "apps/web/lib/geo/africa-paths.json", "w"))
print("countries", len(out), "missing", missing, "bytes", Path(Path(__file__).resolve().parents[1] / "apps/web/lib/geo/africa-paths.json").stat().st_size)
