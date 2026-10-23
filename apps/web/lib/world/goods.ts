// Palasora step 4: visible logistics. Every goods route the town's records hold (a contract's daily delivery, or the last
// day's deliveries, from the economy service's `flows`) gets a delivery van that drives it along the streets: out of the
// seller's plot to its street, along to the nearest cross street, up or down to the buyer's street, and in. It loads for
// a moment at each end, carries a crate in the colour of the good, and drives back empty. The Goods layer also draws
// each route on the road and names it ("40 crops a day").
import * as THREE from "three";
import { M } from "./kit";
import { plotCenter, streets, type GoodsFlow, type WorldPlot } from "./layout";

export const GOOD_COLOR: Record<string, string> = { crops: "#7bbf4a", meals: "#e8873a", tools: "#5e7fa8", materials: "#a97c50" };
const SPEED = 1.6, LOAD = 3; // units a second; seconds loading at each end
type Route = { flow: GoodsFlow; pts: THREE.Vector3[]; seg: number[]; len: number; vans: number; phase: number };

export type GoodsLabel = { id: string; text: string; x: number; z: number; color: string };

export function createGoods({ scene, flows, plots, lite }: { scene: THREE.Scene; flows: GoodsFlow[]; plots: Map<string, WorldPlot>; lite: boolean }) {
  const S = streets();
  const near = (list: number[], v: number) => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);
  const routes: Route[] = [];
  for (const f of flows.slice(0, lite ? 16 : 32)) {
    const a = plots.get(f.from), b = plots.get(f.to);
    if (!a || !b) continue;
    const [ax, az] = plotCenter(a.x, a.y), [bx, bz] = plotCenter(b.x, b.y);
    const ha = near(S.h, az), hb = near(S.h, bz), v = near(S.v, (ax + bx) / 2);
    const raw = [[ax, az], [ax, ha], [v, ha], [v, hb], [bx, hb], [bx, bz]];
    const pts: THREE.Vector3[] = [];
    for (const [x, z] of raw) { const p = new THREE.Vector3(x, 0.12, z); if (!pts.length || pts[pts.length - 1].distanceTo(p) > 0.01) pts.push(p); }
    if (pts.length < 2) continue;
    const seg = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + pts[i].distanceTo(pts[i - 1]));
    routes.push({ flow: f, pts, seg, len: seg[seg.length - 1], vans: f.qty > 60 && !lite ? 2 : 1, phase: (hash(f.from + f.to + f.good) % 1000) / 1000 });
  }
  const total = Math.max(1, routes.reduce((n, r) => n + r.vans, 0));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true });
  const bodyGeo = new THREE.BoxGeometry(0.62, 0.34, 0.34).translate(0, 0.3, 0);
  const cabGeo = new THREE.BoxGeometry(0.22, 0.26, 0.32).translate(0.42, 0.26, 0);
  const crateGeo = new THREE.BoxGeometry(0.4, 0.2, 0.26).translate(-0.05, 0.57, 0);
  const body = new THREE.InstancedMesh(bodyGeo, mat, total), cab = new THREE.InstancedMesh(cabGeo, mat, total), crate = new THREE.InstancedMesh(crateGeo, mat, total);
  const white = new THREE.Color("#f4f1ea"), cabC = new THREE.Color("#2f4a63");
  for (const m of [body, cab, crate]) { m.frustumCulled = false; m.castShadow = !lite; scene.add(m); }
  let k = 0;
  for (const r of routes) for (let i = 0; i < r.vans; i++) { body.setColorAt(k, white); cab.setColorAt(k, cabC); crate.setColorAt(k, new THREE.Color(GOOD_COLOR[r.flow.good] ?? "#999")); k++; }
  body.count = cab.count = crate.count = k;

  // the Goods layer: each route drawn on the road in its good's colour
  const lines = new THREE.Group(); lines.visible = false; scene.add(lines);
  const lineMats: THREE.Material[] = [];
  for (const r of routes) {
    const g = new THREE.BufferGeometry().setFromPoints(r.pts.map((p) => new THREE.Vector3(p.x, 0.2, p.z)));
    const lm = new THREE.LineDashedMaterial({ color: GOOD_COLOR[r.flow.good] ?? "#999", dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.95 });
    lineMats.push(lm);
    const l = new THREE.Line(g, lm); l.computeLineDistances(); l.renderOrder = 4; lines.add(l);
  }

  const at = (r: Route, d: number, out: THREE.Vector3) => {
    let i = 1; while (i < r.seg.length - 1 && r.seg[i] < d) i++;
    const t = (d - r.seg[i - 1]) / Math.max(1e-6, r.seg[i] - r.seg[i - 1]);
    out.lerpVectors(r.pts[i - 1], r.pts[i], Math.min(1, Math.max(0, t)));
    return Math.atan2(-(r.pts[i].z - r.pts[i - 1].z), r.pts[i].x - r.pts[i - 1].x);
  };
  const p = new THREE.Vector3(), side = new THREE.Vector3();
  let moving = 0;
  function step(time: number, hour: number) {
    const night = hour < 5.5 || hour > 21.5;
    let n = 0; moving = 0;
    for (const r of routes) for (let i = 0; i < r.vans; i++) {
      const cycle = 2 * (r.len / SPEED + LOAD);
      let t = ((time / cycle + r.phase + i / r.vans) % 1) * cycle;
      const out = t < r.len / SPEED + LOAD; // loaded, seller to buyer
      if (!out) t -= r.len / SPEED + LOAD;
      const d = Math.max(0, Math.min(r.len, (t - LOAD / 2) * SPEED));
      let yaw = at(r, out ? d : r.len - d, p);
      if (!out) yaw += Math.PI;
      // keep to the right-hand lane
      side.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.28);
      const s = night ? 0.0001 : 1;
      const m = M(p.x + side.x, 0, p.z + side.z, yaw, 0, 0, s, s, s);
      body.setMatrixAt(n, m); cab.setMatrixAt(n, m);
      const loaded = out && !night ? 1 : 0.0001;
      crate.setMatrixAt(n, M(p.x + side.x, 0, p.z + side.z, yaw, 0, 0, loaded, loaded, loaded));
      if (!night && d > 0 && d < r.len) moving++;
      n++;
    }
    for (const m of [body, cab, crate]) m.instanceMatrix.needsUpdate = true;
  }
  return {
    step,
    show(on: boolean) { lines.visible = on; },
    get shown() { return lines.visible; },
    labels(): GoodsLabel[] {
      return routes.slice(0, 12).map((r) => {
        const mid = r.pts[Math.floor(r.pts.length / 2)];
        return { id: `g-${r.flow.from}-${r.flow.to}-${r.flow.good}`, text: `${r.flow.qty} ${r.flow.good}${r.flow.kind === "contract" ? " a day" : ""}`, x: mid.x, z: mid.z, color: GOOD_COLOR[r.flow.good] };
      });
    },
    info() { return { routes: routes.length, vans: k, moving }; },
    dispose() {
      for (const m of [body, cab, crate]) { scene.remove(m); m.dispose(); }
      for (const g of [bodyGeo, cabGeo, crateGeo]) g.dispose();
      mat.dispose();
      for (const l of lines.children as THREE.Line[]) l.geometry.dispose();
      for (const lm of lineMats) lm.dispose();
      scene.remove(lines);
    },
  };
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
