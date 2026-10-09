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
    for f in feats:
        props = f["properties"]
        code = props.get("shapeISO") or ""
        if iso2 == "ZA":
            code = ZA_CODES.get(code, code)
        if not code.startswith(iso2 + "-"):
            raise SystemExit(f"unexpected code {code!r} for {props.get('shapeName')}")
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
        areas.append({"code": code, "name": props.get("shapeName"), "d": "".join(parts), "cx": round(cx, 1), "cy": round(cy, 1)})
    areas.sort(key=lambda a: a["name"])
    json.dump({"country": iso2, "dataset": "geoBoundaries gbOpen ADM1", "source": source, "license": license_, "version": "9469f09",
               "attribution": f"Boundaries: geoBoundaries (gbOpen ADM1, {source}), {license_}. Simplified for display; not an authoritative border.",
               "viewBox": f"0 0 {W:.0f} {H:.0f}", "areas": areas}, open(out, "w"), separators=(",", ":"))
    print(iso2, len(areas), "areas", f"{len(open(out).read()) // 1024} KB")


if __name__ == "__main__":
    main(*sys.argv[1:6])
