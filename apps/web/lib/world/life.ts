// Town life: everything in the world viewer that moves, run at believable speeds on the town clock. One world unit is
// ten metres, so a car at 30 km/h covers about 0.8 units a second and a person on foot about 0.14.
// - Cars drive the right-hand lane, brake for lights, corners and the car ahead, and pull into their driveways when the
//   hour is quiet (traffic is heavy at 7 to 9 and 17 to 19, light at night).
// - Buses run the ring road and stop at every shelter; the monorail runs a loop with four stations and a timetable.
//   At each stop, passengers step off and walk away, then the people who were waiting walk to the doors and board.
// - Residents walk the pavements between their home, their work and the market, following the hour of the day, and
//   spend the rest of their time indoors.
// - The ferry docks at the harbour pier, waits, sails out and comes back; wind turbines turn.
import * as THREE from "three";
import { Builder, M } from "./kit";
import { PLOT, ROAD, plotAt, plotCenter, type WorldPlot } from "./layout";

type P2 = [number, number];
type Path = { total: number; at(d: number): { x: number; z: number; yaw: number; dx: number; dz: number } };
export type Station = { name: string; d: number };
export type LifeInfo = {
  moving: number; parked: number; walking: number; indoors: number; waiting: number; riding: number;
  buses: { state: string; stop: string; load: number }[]; train: { state: string; station: string; load: number; v: number; dist: number }; ferry: string;
  stations: { name: string; waiting: number; boarding: number; sign: string }[];
};

export type LifeCtx = {
  scene: THREE.Scene; mat: THREE.Material; keep<T extends { dispose(): void }>(x: T): T; rng(): number; lite: boolean;
  streets: { v: number[]; h: number[] }; busStops: P2[]; plots: WorldPlot[]; mono: Path; stations: Station[];
  turbines: { x: number; y: number; z: number }[]; ferry: { dock: P2; out: P2[]; y: number };
};

const CAR_V = [0.65, 0.9], BUS_V = 0.6, WALK_V = [0.12, 0.16], TRAIN_V = 1.1;
/** Top speeds in world units a second (1 unit = 10 m): cars about 30 km/h, buses 22, people 5, the monorail 40. */
export const SPEED = { car: CAR_V, bus: BUS_V, walk: WALK_V, train: TRAIN_V };
const ACC = 0.35, BRK = 0.9, TRAIN_ACC = 0.22, TRAIN_BRK = 0.3;
const LIGHT_CYCLE = 22, AMBER = 3; // seconds of green per direction, the last three amber
const C = (h: string) => new THREE.Color(h);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const stopCap = (d: number, brk: number) => Math.sqrt(Math.max(0, 2 * brk * d));

/** How busy the streets are at an hour: 0..1. Rush hours at 7 to 9 and 17 to 19, quiet at night. */
export function busy(h: number): number {
  const bump = (c: number, w: number) => Math.exp(-Math.pow((h - c) / w, 2));
  const day = h >= 6 && h < 22 ? 0.42 : 0.08;
  return clamp(day + 0.55 * bump(8, 1.1) + 0.55 * bump(18, 1.2) + 0.15 * bump(12.8, 1.0), 0.06, 1);
}
/** Share of residents out on foot at an hour. */
export function outdoors(h: number): number {
  if (h < 5.5 || h >= 23) return 0.03;
  return clamp(busy(h) * 0.62, 0.05, 0.6);
}

export function createLife(ctx: LifeCtx) {
  const { scene, keep, rng, streets: S } = ctx;
  const rr = (a: number, b: number) => a + (b - a) * rng();
  const pick = <T,>(a: T[]) => a[(rng() * a.length) | 0];
  const VX = S.v, HZ = S.h;
  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const carMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }));
  const hide = (m: THREE.InstancedMesh, i: number) => { tmp.compose(pos.set(0, -50, 0), q.identity(), zero); m.setMatrixAt(i, tmp); };

  // ------------------------------------------------------------------ traffic lights
  const crossings: { x: number; z: number; ph: number }[] = [];
  for (let i = 1; i < VX.length - 1; i++) for (let j = 1; j < HZ.length - 1; j++) crossings.push({ x: VX[i], z: HZ[j], ph: (i + j) % 2 });
  const bulbs = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.075, 8, 6)), keep(new THREE.MeshBasicMaterial({ toneMapped: false })), Math.max(1, crossings.length * 2));
  crossings.forEach((c, k) => {
    const o = ROAD / 2 - 0.1;
    bulbs.setMatrixAt(k * 2, M(c.x + o, 1.02, c.z + o)); bulbs.setMatrixAt(k * 2 + 1, M(c.x - o, 1.02, c.z - o));
  });
  bulbs.frustumCulled = false;
  scene.add(bulbs);
  /** "green" | "amber" | "red" for traffic moving along an axis through a crossing. */
  const light = (c: { ph: number }, axis: "x" | "z", time: number) => {
    const slot = Math.floor(time / LIGHT_CYCLE), inSlot = time - slot * LIGHT_CYCLE;
    const xGreen = (slot + c.ph) % 2 === 0;
    if ((axis === "x") !== xGreen) return "red";
    return inSlot > LIGHT_CYCLE - AMBER ? "amber" : "green";
  };
  const LIGHT_COL = { green: C("#41d07a"), amber: C("#f2b134"), red: C("#e2483b") };

  // ------------------------------------------------------------------ cars and buses
  type Car = {
    loop: P2[]; seg: number; t: number; v: number; vmax: number; bus: boolean; rank: number; lane: number;
    mode: "drive" | "park" | "parked" | "unpark"; dwell: number; served: number; stop: number; load: number; yawOff: number;
  };
  const carGeo = (() => { const b = new Builder(); b.box(0.62, 0.2, 0.32, C("#ffffff"), M(0, 0.17, 0)); b.box(0.36, 0.16, 0.28, C("#ffffff"), M(-0.04, 0.34, 0));
    b.box(0.3, 0.12, 0.29, C("#3b4a5a"), M(-0.04, 0.35, 0)); b.box(0.64, 0.06, 0.33, C("#2b2f35"), M(0, 0.06, 0));
    b.box(0.03, 0.05, 0.07, C("#fff4d0"), M(0.315, 0.17, 0.1)); b.box(0.03, 0.05, 0.07, C("#fff4d0"), M(0.315, 0.17, -0.1)); return keep(b.geometry()); })();
  const busGeo = (() => { const b = new Builder(); b.box(1.25, 0.42, 0.38, C("#ffffff"), M(0, 0.3, 0)); b.box(1.2, 0.12, 0.39, C("#2f3d4c"), M(0, 0.38, 0));
    b.box(1.27, 0.06, 0.39, C("#2b2f35"), M(0, 0.08, 0)); b.box(0.16, 0.3, 0.02, C("#e9e4d8"), M(0.35, 0.25, 0.195)); return keep(b.geometry()); })();
  const NCARS = ctx.lite ? 22 : 40, NBUS = 2, LANE = 0.3, DRIVEWAY = 1.05;
  const cars: Car[] = [];
  const loopRect = (i0: number, i1: number, j0: number, j1: number, cw: boolean): P2[] => {
    const pts: P2[] = [[VX[i0], HZ[j0]], [VX[i1], HZ[j0]], [VX[i1], HZ[j1]], [VX[i0], HZ[j1]]];
    return cw ? pts : pts.reverse();
  };
  const segLen = (loop: P2[], s: number) => { const a = loop[s], b = loop[(s + 1) % 4]; return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]); };
  for (let i = 0; i < NCARS; i++) {
    const i0 = (rng() * (VX.length - 1)) | 0, j0 = (rng() * (HZ.length - 1)) | 0;
    const i1 = Math.min(VX.length - 1, i0 + 1 + ((rng() * 3) | 0)), j1 = Math.min(HZ.length - 1, j0 + 1 + ((rng() * 3) | 0));
    cars.push({ loop: loopRect(i0, i1, j0, j1, rng() < 0.5), seg: (rng() * 4) | 0, t: rr(0.3, 0.7), v: 0, vmax: rr(CAR_V[0], CAR_V[1]), bus: false, rank: (i + 0.5) / NCARS,
      lane: LANE, mode: "drive", dwell: 0, served: -1, stop: -1, load: 0, yawOff: 0 });
  }
  // both buses run clockwise on the ring road, so the right-hand lane is the kerb with the shelters; half a loop apart
  const ringLoop = loopRect(0, VX.length - 1, 0, HZ.length - 1, true);
  for (let k = 0; k < NBUS; k++) cars.push({ loop: ringLoop, seg: k * 2, t: 0.1, v: 0, vmax: BUS_V, bus: true, rank: 0, lane: LANE, mode: "drive", dwell: 0, served: -1, stop: -1, load: 4, yawOff: 0 });
  const carMesh = new THREE.InstancedMesh(carGeo, carMat, NCARS), busMesh = new THREE.InstancedMesh(busGeo, carMat, NBUS);
  const carCols = ["#e9e4d8", "#c9724f", "#4f7cac", "#2f3540", "#d8a838", "#7a9e7e", "#b9c2cc", "#9a3f3f"];
  for (let i = 0; i < NCARS; i++) carMesh.setColorAt(i, C(pick(carCols)));
  for (let i = 0; i < NBUS; i++) busMesh.setColorAt(i, C("#3f8f8f"));
  carMesh.frustumCulled = busMesh.frustumCulled = false;
  scene.add(carMesh, busMesh);

  const where = (c: Car) => {
    const a = c.loop[c.seg], b = c.loop[(c.seg + 1) % 4];
    const nx = Math.sign(b[0] - a[0]), nz = Math.sign(b[1] - a[1]);
    const L = segLen(c.loop, c.seg);
    return { x: a[0] + (b[0] - a[0]) * c.t, z: a[1] + (b[1] - a[1]) * c.t, nx, nz, L, toEnd: (1 - c.t) * L, fromStart: c.t * L };
  };

  /** A car pulls in only where a plot's driveway is on its right, and never at a bus stop. */
  const canPark = (w: ReturnType<typeof where>) => {
    const rx = -w.nz, rz = w.nx;
    if (!plotAt(w.x + rx * (ROAD / 2 + PLOT / 2), w.z + rz * (ROAD / 2 + PLOT / 2))) return false;
    return !stops.some((s) => Math.hypot(s.x - w.x, s.z - w.z) < 1.4);
  };

  // bus stops: the shelter (where people wait) sits on the outer pavement beside each stop
  // in the order the shelters are built: west side (north, south), east, south, north
  const stopNames = ["Harbour Road", "Beach Walk", "Exchange Square", "Tower Row", "Campus Gate", "Arena", "Farm Lane", "Mill Road"];
  type Stop = { name: string; x: number; z: number; y: number; wait: P2[]; exit: P2[]; bus: boolean; queue: number[] };
  const minX = Math.min(...VX), maxX = Math.max(...VX), maxZ = Math.max(...HZ), minZ = Math.min(...HZ);
  const stops: Stop[] = ctx.busStops.map((s, i) => {
    const vert = Math.abs(s[0] - minX) < 0.01 || Math.abs(s[0] - maxX) < 0.01;
    const out = vert ? (s[0] < 0 ? -1 : 1) : (s[1] > 0 ? 1 : -1);
    const o = ROAD / 2 - 0.15; // under the shelter, on the outer pavement
    const wx = vert ? s[0] + out * o : s[0], wz = vert ? s[1] : s[1] + out * o;
    const along = (k: number): P2 => (vert ? [wx, wz + k] : [wx + k, wz]);
    return { name: stopNames[i % stopNames.length], x: s[0], z: s[1], y: 0.06, bus: true, queue: [],
      wait: [-0.45, -0.25, -0.05, 0.15, 0.35, 0.55].map(along), exit: [along(-2.4), along(2.4)] };
  });

  // ------------------------------------------------------------------ monorail
  const path = ctx.mono;
  type Train = { d: number; v: number; state: "run" | "dwell"; dwell: number; next: number; load: number; at: number; served: number };
  const trainStops: Stop[] = ctx.stations.map((s) => {
    const p = path.at(s.d), nx = -p.dz, nz = p.dx; // the platform is on the outer side
    const off = (k: number, side: number): P2 => [p.x + p.dx * k + nx * side, p.z + p.dz * k + nz * side];
    return { name: s.name, x: p.x, z: p.z, y: 2.32, bus: false, queue: [],
      wait: [-1.3, -0.8, -0.3, 0.2, 0.7, 1.2].map((k) => off(k, 0.72)), exit: [off(-1.9, 0.75), off(1.9, 0.75)] };
  });
  const order = ctx.stations.map((s, i) => ({ d: s.d, i })).sort((a, b) => a.d - b.d);
  const CAR_GAP = 1.2;
  const train: Train = { d: (order[0].d + CAR_GAP + 3) % path.total, v: TRAIN_V, state: "run", dwell: 0, next: 0, load: 6, at: -1, served: -1 };
  /** The next station ahead, skipping the one the train just left. */
  const nextStation = (d: number) => {
    // the head stops CAR_GAP past the mark, so the middle car is at the platform
    let best = order[0].i, bd = Infinity;
    for (const o of order) { if (o.i === train.served) continue; let dd = (o.d + CAR_GAP - d) % path.total; if (dd < 0) dd += path.total; if (dd < bd) { bd = dd; best = o.i; } }
    return { i: best, dist: bd };
  };
  train.next = nextStation(train.d).i;

  // ------------------------------------------------------------------ people: residents and passengers
  type Walker = {
    home: P2; work: P2; at: "home" | "work" | "market"; path: P2[] | null; seg: number; s: number; v: number; until: number; agent: boolean; trip: number;
  };
  const doorOf = (cx: number, cz: number): P2 => {
    const off = ROAD / 2 - 0.14;
    let i = 0; while (i < VX.length - 2 && cx > VX[i + 1]) i++;
    let j = 0; while (j < HZ.length - 2 && cz < HZ[j + 1]) j++;
    const x0 = VX[i] + off, x1 = VX[i + 1] - off, zS = HZ[j] - off, zN = HZ[j + 1] + off;
    const d = [Math.abs(cx - x0), Math.abs(cx - x1), Math.abs(cz - zS), Math.abs(cz - zN)];
    const k = d.indexOf(Math.min(...d));
    if (k < 2) return [k === 0 ? x0 : x1, clamp(cz, zN, zS)];
    return [clamp(cx, x0, x1), k === 2 ? zS : zN];
  };
  const blockCorners = (p: P2): P2[] => {
    const off = ROAD / 2 - 0.14;
    let i = 0; while (i < VX.length - 2 && p[0] > VX[i + 1]) i++;
    let j = 0; while (j < HZ.length - 2 && p[1] < HZ[j + 1]) j++;
    const x0 = VX[i] + off, x1 = VX[i + 1] - off, zS = HZ[j] - off, zN = HZ[j + 1] + off;
    const onX = Math.abs(p[0] - x0) < 0.01 || Math.abs(p[0] - x1) < 0.01;
    return onX ? [[p[0], zS], [p[0], zN]] : [[x0, p[1]], [x1, p[1]]];
  };
  /** A walk along the pavements: to a corner of this block, along one street, along a cross street, to the door. */
  const route = (a: P2, b: P2): P2[] => {
    let best: P2[] = [a, b], bl = Infinity;
    for (const ca of blockCorners(a)) for (const cb of blockCorners(b)) {
      const pts: P2[] = [a, ca, [cb[0], ca[1]], cb, b];
      let l = 0; for (let k = 1; k < pts.length; k++) l += Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
      if (l < bl) { bl = l; best = pts; }
    }
    return best.filter((p, k) => k === 0 || Math.hypot(p[0] - best[k - 1][0], p[1] - best[k - 1][1]) > 0.01);
  };
  const homes = ctx.plots.filter((p) => p.use === "home" && p.area !== "suburb").map((p) => doorOf(...plotCenter(p.x, p.y)));
  const works = ctx.plots.filter((p) => p.use !== "home").map((p) => doorOf(...plotCenter(p.x, p.y)));
  const marketPlot = ctx.plots.find((p) => p.area === "market_hall");
  const market: P2 = marketPlot ? doorOf(...plotCenter(marketPlot.x, marketPlot.y)) : works[0] ?? [0, 0];
  const NPEOPLE = ctx.lite ? 150 : 300, NRIDERS = ctx.lite ? 40 : 72;
  const pGeo = (() => { const b = new Builder(); b.cyl(0.07, 0.09, 0.32, 6, C("#ffffff"), M(0, 0.2, 0)); b.sphere(0.075, C("#e8c9a8"), M(0, 0.44, 0), 6, 5); return keep(b.geometry()); })();
  const people = new THREE.InstancedMesh(pGeo, carMat, NPEOPLE + NRIDERS);
  const agentMarks = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.07)), keep(new THREE.MeshBasicMaterial({ color: "#d8a838", toneMapped: false })), NPEOPLE);
  const shirt = ["#4f7cac", "#c9724f", "#6f9e7a", "#e0a458", "#f4ecdb", "#6d597a", "#3f8f8f", "#b5838d", "#2f3540"];
  for (let i = 0; i < NPEOPLE + NRIDERS; i++) people.setColorAt(i, C(pick(shirt)));
  people.frustumCulled = agentMarks.frustumCulled = false;
  scene.add(people, agentMarks);
  const walkers: Walker[] = [];
  for (let i = 0; i < NPEOPLE; i++) {
    walkers.push({ home: homes.length ? pick(homes) : [0, 0], work: works.length ? pick(works) : market, at: "home", path: null, seg: 0, s: 0, v: rr(WALK_V[0], WALK_V[1]),
      until: 0, agent: rng() < 0.18, trip: 200 });
  }
  const pathLen = (p: P2[]) => { let l = 0; for (let k = 1; k < p.length; k++) l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return l; };
  const placeOf = (w: Walker, at: Walker["at"]) => (at === "home" ? w.home : at === "work" ? w.work : market);
  /** Where a resident heads next at this hour, or null to stay put. */
  const nextPlace = (w: Walker, h: number): Walker["at"] | null => {
    if (w.at === "home") return h >= 6 && h < 10 ? (rng() < 0.85 ? "work" : "market") : h >= 10 && h < 21 ? (rng() < 0.5 ? "market" : null) : null;
    if (w.at === "work") return h >= 11.5 && h < 14 ? (rng() < 0.5 ? "market" : null) : h >= 16.5 || h < 6 ? (rng() < 0.8 ? "home" : "market") : null;
    return h >= 9 && h < 16 ? "work" : "home";
  };
  const stayFor = (w: Walker, h: number) => { const f = outdoors(h); return clamp(w.trip * (1 - f) / f * rr(0.6, 1.4), 8, 900); };

  type Rider = { state: "hidden" | "walk" | "wait" | "board" | "alight"; x: number; z: number; y: number; to: P2; stop: number; slot: number; v: number; after: "wait" | "hide" | "board" };
  const riders: Rider[] = Array.from({ length: NRIDERS }, () => ({ state: "hidden" as const, x: 0, z: 0, y: 0, to: [0, 0] as P2, stop: -1, slot: -1, v: rr(0.18, 0.24), after: "hide" as const }));
  const allStops = [...stops, ...trainStops];
  const freeRider = () => riders.find((r) => r.state === "hidden");
  const freeSlot = (s: Stop) => { for (let k = 0; k < s.wait.length; k++) if (!riders.some((r) => r.stop === allStops.indexOf(s) && r.slot === k && r.state !== "hidden" && r.state !== "alight")) return k; return -1; };

  // ------------------------------------------------------------------ ferry and turbines
  type Ferry = { leg: P2[]; seg: number; s: number; v: number; state: "dock" | "out" | "turn" | "back"; wait: number; x: number; z: number; yaw: number };
  const ferryMesh = new THREE.Mesh((() => { const b = new Builder(); b.box(2.2, 0.35, 0.8, C("#fbfaf6"), M(0, 0.1, 0)); b.box(1.2, 0.35, 0.62, C("#f4ecdb"), M(-0.2, 0.45, 0));
    b.box(1.1, 0.1, 0.64, C("#3f8f8f"), M(-0.2, 0.5, 0)); b.box(2.25, 0.08, 0.82, C("#c9724f"), M(0, -0.04, 0)); return keep(b.geometry()); })(), ctx.mat);
  ferryMesh.castShadow = true;
  scene.add(ferryMesh);
  const fOut: P2[] = [ctx.ferry.dock, ...ctx.ferry.out];
  const ferry: Ferry = { leg: fOut, seg: 0, s: 0, v: 0, state: "dock", wait: 12, x: fOut[0][0], z: fOut[0][1], yaw: 0 };
  const trainMesh = new THREE.Mesh((() => { const b = new Builder(); for (let k = 0; k < 3; k++) { b.box(1.1, 0.42, 0.5, C("#fbfaf6"), M(-k * CAR_GAP, 0, 0)); b.box(0.95, 0.16, 0.51, C("#3f8f8f"), M(-k * CAR_GAP, 0.06, 0)); }
    return keep(b.geometry()); })(), ctx.mat);
  trainMesh.castShadow = true;
  scene.add(trainMesh);
  const rotorGeo = (() => { const b = new Builder(); for (let k = 0; k < 3; k++) b.box(0.08, 1.5, 0.03, C("#fbfaf6"), M(0, 0, 0, 0, 0, (k * Math.PI * 2) / 3).multiply(M(0, 0.75, 0))); b.sphere(0.1, C("#fbfaf6")); return keep(b.geometry()); })();
  const rotors = new THREE.InstancedMesh(rotorGeo, ctx.mat, Math.max(1, ctx.turbines.length));
  rotors.frustumCulled = false;
  scene.add(rotors);

  // ------------------------------------------------------------------ station timetable signs
  const signs = trainStops.map((s, i) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 72;
    const tex = keep(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthWrite: false })));
    const p = path.at(ctx.stations[i].d);
    sp.position.set(p.x - p.dz * 1.05, 3.55, p.z + p.dx * 1.05); sp.scale.set(2.2, 0.62, 1);
    scene.add(sp);
    return { cv, tex, text: "" };
  });
  const drawSign = (k: number, line2: string) => {
    const s = signs[k]; const text = `${trainStops[k].name}|${line2}`;
    if (s.text === text) return;
    s.text = text;
    const g = s.cv.getContext("2d"); if (!g) return;
    g.fillStyle = "#1d2433"; g.fillRect(0, 0, 256, 72);
    g.fillStyle = "#d8a838"; g.font = "bold 22px system-ui, sans-serif"; g.fillText(trainStops[k].name.toUpperCase(), 12, 28);
    g.fillStyle = "#ffffff"; g.font = "20px system-ui, sans-serif"; g.fillText(line2, 12, 58);
    s.tex.needsUpdate = true;
  };

  // ------------------------------------------------------------------ the step
  let signClock = 0;
  function step(dt: number, hour: number, time: number) {
    const dens = busy(hour);
    // --- cars
    const moving: { x: number; z: number; nx: number; nz: number }[] = [];
    for (const c of cars) if (c.mode === "drive" || c.mode === "unpark") { const w = where(c); moving.push({ x: w.x, z: w.z, nx: w.nx, nz: w.nz }); }
    for (const c of cars) {
      const w = where(c);
      const want = c.bus || c.rank < dens;
      if (c.mode === "parked") { if (want) c.mode = "unpark"; else continue; }
      if (c.mode === "drive" && !want && w.fromStart > ROAD + 0.3 && w.toEnd > ROAD + 0.6 && canPark(w)) c.mode = "park";
      let cap = c.vmax;
      if (c.mode === "park") cap = 0.25;
      // slow for the corner at the end of this side
      cap = Math.min(cap, Math.sqrt(0.12 + 2 * BRK * w.toEnd));
      // lights: stop before the crossing on red, and on amber when there is room to stop
      const axis: "x" | "z" = w.nx !== 0 ? "x" : "z";
      for (const k of crossings) {
        const ahead = axis === "x" ? (k.x - w.x) * w.nx : (k.z - w.z) * w.nz;
        const lateral = axis === "x" ? Math.abs(k.z - w.z) : Math.abs(k.x - w.x);
        if (lateral > 0.6 || ahead < ROAD / 2 - 0.05 || ahead > ROAD / 2 + 4) continue;
        const l = light(k, axis, time), dist = ahead - ROAD / 2 - 0.1;
        if (l === "red" || (l === "amber" && dist > (c.v * c.v) / (2 * BRK))) cap = Math.min(cap, stopCap(dist, BRK));
      }
      // keep a gap to the vehicle ahead in the same lane
      for (const o of moving) {
        if (o.nx !== w.nx || o.nz !== w.nz) continue;
        const ahead = (o.x - w.x) * w.nx + (o.z - w.z) * w.nz, lateral = Math.abs((o.x - w.x) * w.nz) + Math.abs((o.z - w.z) * w.nx);
        if (lateral < 0.2 && ahead > 0.01) cap = Math.min(cap, stopCap(ahead - (c.bus ? 1.15 : 0.8), BRK));
      }
      // buses: brake into each stop, open the doors, let people off and on
      if (c.bus) {
        if (c.dwell > 0) {
          c.dwell -= dt; cap = 0;
          const st = stops[c.stop];
          // people who reach the stop while the doors are open get on too; then the doors close once the last is aboard
          if (c.dwell > 0 && st.queue.length) boardAll(st, c.stop, doorPoint(c, w), 18 - c.load, (n) => { c.load += n; });
          const boarding = riders.some((r) => r.state === "board" && r.stop === c.stop);
          if (c.dwell <= 0 && boarding) c.dwell = 0.3;
          if (c.dwell <= 0) { c.dwell = 0; c.served = c.stop; c.stop = -1; }
        } else {
          stops.forEach((s, si) => {
            if (si === c.served) return;
            const ahead = axis === "x" ? (s.x - w.x) * w.nx : (s.z - w.z) * w.nz;
            const lateral = axis === "x" ? Math.abs(s.z - w.z) : Math.abs(s.x - w.x);
            if (lateral > 0.5 || ahead < -0.02 || ahead > 4) return;
            cap = Math.min(cap, stopCap(ahead, BRK) + 0.02);
            // stop on the mark (a slow bus would otherwise creep past it between two steps)
            if (ahead < Math.max(0.06, c.v * dt + 0.02) && c.v < 0.3) { c.stop = si; c.dwell = rr(6, 9); c.v = 0; cap = 0; arrive(c, si, w); }
          });
        }
      }
      if (c.mode === "park") {
        c.lane = Math.min(DRIVEWAY, c.lane + dt * 0.35);
        c.yawOff = -Math.sin(((c.lane - LANE) / (DRIVEWAY - LANE)) * Math.PI) * 0.7;
        if (c.lane >= DRIVEWAY) { c.mode = "parked"; c.v = 0; c.yawOff = 0; continue; }
      } else if (c.mode === "unpark") {
        c.lane = Math.max(LANE, c.lane - dt * 0.35);
        c.yawOff = Math.sin(((c.lane - LANE) / (DRIVEWAY - LANE)) * Math.PI) * 0.7;
        cap = Math.min(cap, 0.3);
        if (c.lane <= LANE) { c.mode = "drive"; c.yawOff = 0; }
      }
      c.v = c.v < cap ? Math.min(cap, c.v + ACC * dt) : Math.max(cap, c.v - BRK * 1.6 * dt);
      c.t += (c.v * dt) / Math.max(0.01, w.L);
      if (c.t >= 1) { c.t -= 1; c.seg = (c.seg + 1) % 4; }
    }
    // --- residents
    for (const w of walkers) {
      if (!w.path) {
        if (time < w.until) continue;
        const to = nextPlace(w, hour);
        if (!to) { w.until = time + stayFor(w, hour) * 0.5; continue; }
        w.path = route(placeOf(w, w.at), placeOf(w, to)); w.seg = 0; w.s = 0; w.at = to;
        w.trip = pathLen(w.path) / w.v;
        continue;
      }
      let left = w.v * dt;
      while (left > 0 && w.path) {
        const a = w.path[w.seg], b = w.path[w.seg + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (w.s + left < L) { w.s += left; left = 0; }
        else { left -= L - w.s; w.s = 0; w.seg++; if (w.seg >= w.path.length - 1) { w.path = null; w.until = time + stayFor(w, hour); } }
      }
    }
    // --- passengers turn up at stops through the day
    for (let si = 0; si < allStops.length; si++) {
      const st = allStops[si];
      const rate = (st.bus ? 0.012 : 0.03) * dens;
      if (rng() < rate * dt) {
        const k = freeSlot(st), r = freeRider();
        if (k >= 0 && r) { const e = pick(st.exit); Object.assign(r, { state: "walk", x: e[0], z: e[1], y: st.y, to: st.wait[k], stop: si, slot: k, after: "wait" }); }
      }
    }
    for (const r of riders) {
      if (r.state !== "walk" && r.state !== "board" && r.state !== "alight") continue;
      const dx = r.to[0] - r.x, dz = r.to[1] - r.z, L = Math.hypot(dx, dz), s = r.v * dt;
      if (L > s) { r.x += (dx / L) * s; r.z += (dz / L) * s; continue; }
      r.x = r.to[0]; r.z = r.to[1];
      if (r.state === "walk") { r.state = "wait"; allStops[r.stop].queue.push(riders.indexOf(r)); }
      else { r.state = "hidden"; r.stop = -1; r.slot = -1; }
    }
    // --- the monorail
    if (train.state === "dwell") {
      train.dwell -= dt;
      const si = stops.length + train.at, st = trainStops[train.at];
      if (train.dwell > 0 && st.queue.length) boardAll(st, si, [0, 0], 40 - train.load, (n) => { train.load += n; }, trainDoors());
      const busyDoors = riders.some((r) => r.state === "board" && r.stop === si);
      if (train.dwell <= 0 && !busyDoors) { train.state = "run"; train.served = train.at; train.at = -1; train.next = nextStation(train.d).i; }
    } else {
      const nx = nextStation(train.d);
      train.next = nx.i;
      const cap = Math.min(TRAIN_V, stopCap(nx.dist, TRAIN_BRK) + 0.01);
      train.v = train.v < cap ? Math.min(cap, train.v + TRAIN_ACC * dt) : Math.max(cap, train.v - TRAIN_BRK * 1.5 * dt);
      if (nx.dist < Math.max(0.05, train.v * dt + 0.02) && train.v < 0.35) {
        train.d = (train.d + nx.dist) % path.total; // stop exactly on the mark
        train.v = 0; train.state = "dwell"; train.at = nx.i; train.dwell = rr(12, 16);
        arriveTrain(nx.i);
      } else train.d = (train.d + train.v * dt) % path.total;
    }
    // --- ferry
    stepFerry(dt);
    // --- signs once a second
    signClock -= dt;
    if (signClock <= 0) {
      signClock = 1;
      trainStops.forEach((_, k) => drawSign(k, train.state === "dwell" && train.at === k ? "Boarding now" : etaText(k)));
    }
  }

  function doorPoint(c: Car, w: ReturnType<typeof where>): P2 {
    const nx = w.nx, nz = w.nz, o = LANE + 0.22;
    return [w.x - nz * o + nx * 0.35, w.z + nx * o + nz * 0.35];
  }
  function arrive(c: Car, si: number, w: ReturnType<typeof where>) {
    const st = stops[si], door = doorPoint(c, w);
    const off = Math.min(c.load, Math.round(c.load * rr(0.25, 0.6)));
    for (let k = 0; k < off; k++) {
      const r = freeRider(); if (!r) break;
      Object.assign(r, { state: "alight", x: door[0] + rr(-0.05, 0.05), z: door[1] + rr(-0.05, 0.05), y: st.y, to: pick(st.exit), stop: si, slot: -1, after: "hide" });
    }
    c.load -= off;
    boardAll(st, si, door, 18 - c.load, (n) => { c.load += n; });
  }
  /** One door per car, on the platform side. */
  function trainDoors(): P2[] {
    return [0, CAR_GAP, 2 * CAR_GAP].map((k) => { const q2 = path.at((train.d - k + path.total) % path.total); return [q2.x - q2.dz * 0.3, q2.z + q2.dx * 0.3]; });
  }
  function arriveTrain(i: number) {
    const st = trainStops[i], si = stops.length + i;
    const doors = trainDoors();
    const off = Math.min(train.load, Math.round(train.load * rr(0.3, 0.6)));
    for (let k = 0; k < off; k++) {
      const r = freeRider(); if (!r) break;
      const d = pick(doors);
      Object.assign(r, { state: "alight", x: d[0], z: d[1], y: st.y, to: pick(st.exit), stop: si, slot: -1, after: "hide" });
    }
    train.load -= off;
    boardAll(st, si, pick(doors), 40 - train.load, (n) => { train.load += n; }, doors);
  }
  function boardAll(st: Stop, si: number, door: P2, room: number, took: (n: number) => void, doors?: P2[]) {
    let n = 0;
    for (const idx of st.queue.splice(0)) {
      const r = riders[idx];
      if (r.state !== "wait") continue;
      if (n >= room) { st.queue.push(idx); continue; }
      r.state = "board"; r.to = doors ? doors[n % doors.length] : door; n++;
    }
    took(n);
  }
  function etaText(k: number): string {
    // distance to this station's stopping mark, plus a dwell at each station in between
    let d = (ctx.stations[k].d + CAR_GAP - train.d) % path.total; if (d < 0) d += path.total;
    let between = 0;
    for (const o of order) { let dd = (o.d + CAR_GAP - train.d) % path.total; if (dd < 0) dd += path.total; if (dd > 0.1 && dd < d - 0.1) between++; }
    const secs = d / (TRAIN_V * 0.85) + between * 15 + (train.state === "dwell" ? Math.max(0, train.dwell) : 0);
    return secs < 60 ? "Next train under 1 min" : `Next train ${Math.round(secs / 60)} min`;
  }
  function stepFerry(dt: number) {
    const f = ferry;
    if (f.state === "dock" || f.state === "turn") {
      f.wait -= dt; f.v = 0;
      if (f.wait <= 0) { if (f.state === "dock") { f.state = "out"; f.leg = fOut; } else { f.state = "back"; f.leg = [...fOut].reverse(); } f.seg = 0; f.s = 0; }
      return;
    }
    const a = f.leg[f.seg], b = f.leg[f.seg + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let remain = L - f.s; for (let k = f.seg + 1; k < f.leg.length - 1; k++) remain += Math.hypot(f.leg[k + 1][0] - f.leg[k][0], f.leg[k + 1][1] - f.leg[k][1]);
    const cap = Math.min(0.45, stopCap(remain, 0.06) + 0.01);
    f.v = f.v < cap ? Math.min(cap, f.v + 0.05 * dt) : Math.max(cap, f.v - 0.1 * dt);
    f.s += f.v * dt;
    if (f.s >= L) { f.s -= L; f.seg++; if (f.seg >= f.leg.length - 1) { f.state = f.state === "out" ? "turn" : "dock"; f.wait = f.state === "dock" ? rr(18, 24) : 6; f.seg = f.leg.length - 2; f.s = Math.hypot(f.leg[f.seg + 1][0] - f.leg[f.seg][0], f.leg[f.seg + 1][1] - f.leg[f.seg][1]); } }
    const a2 = f.leg[f.seg], b2 = f.leg[f.seg + 1], L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1, t = Math.min(1, f.s / L2);
    f.x = a2[0] + (b2[0] - a2[0]) * t; f.z = a2[1] + (b2[1] - a2[1]) * t;
    const target = Math.atan2(-(b2[1] - a2[1]), b2[0] - a2[0]);
    f.yaw += Math.atan2(Math.sin(target - f.yaw), Math.cos(target - f.yaw)) * Math.min(1, dt * 0.8);
  }

  // ------------------------------------------------------------------ draw
  function draw(time: number) {
    let ci = 0, bi = 0;
    for (const c of cars) {
      const m = c.bus ? busMesh : carMesh, i = c.bus ? bi++ : ci++;
      if (c.mode === "parked") { hide(m, i); continue; }
      const w = where(c);
      const x = w.x - w.nz * c.lane, z = w.z + w.nx * c.lane;
      q.setFromAxisAngle(yAxis, Math.atan2(-w.nz, w.nx) + c.yawOff); tmp.compose(pos.set(x, 0.04, z), q, one);
      m.setMatrixAt(i, tmp);
    }
    carMesh.instanceMatrix.needsUpdate = busMesh.instanceMatrix.needsUpdate = true;
    crossings.forEach((k, i) => { bulbs.setColorAt(i * 2, LIGHT_COL[light(k, "x", time)]); bulbs.setColorAt(i * 2 + 1, LIGHT_COL[light(k, "z", time)]); });
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    let ai = 0;
    walkers.forEach((w, i) => {
      if (!w.path) { hide(people, i); return; }
      const a = w.path[w.seg], b = w.path[w.seg + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = w.s / L;
      const bob = Math.abs(Math.sin(time * 7 + i)) * 0.02;
      q.setFromAxisAngle(yAxis, Math.atan2(-(b[1] - a[1]), b[0] - a[0])); pos.set(a[0] + (b[0] - a[0]) * t, 0.06 + bob, a[1] + (b[1] - a[1]) * t);
      tmp.compose(pos, q, one); people.setMatrixAt(i, tmp);
      if (w.agent) { pos.y += 0.62; tmp.compose(pos, q.setFromAxisAngle(yAxis, time * 2), one); agentMarks.setMatrixAt(ai++, tmp); }
    });
    agentMarks.count = ai;
    riders.forEach((r, k) => {
      const i = NPEOPLE + k;
      if (r.state === "hidden") { hide(people, i); return; }
      const moving = r.state !== "wait";
      const bob = moving ? Math.abs(Math.sin(time * 7 + k)) * 0.02 : 0;
      q.setFromAxisAngle(yAxis, moving ? Math.atan2(-(r.to[1] - r.z), r.to[0] - r.x) : k); tmp.compose(pos.set(r.x, r.y + bob, r.z), q, one);
      people.setMatrixAt(i, tmp);
    });
    people.instanceMatrix.needsUpdate = agentMarks.instanceMatrix.needsUpdate = true;
    const tp = path.at(train.d);
    trainMesh.position.set(tp.x, 2.55, tp.z); trainMesh.rotation.y = tp.yaw;
    ferryMesh.position.set(ferry.x, ctx.ferry.y, ferry.z); ferryMesh.rotation.y = ferry.yaw;
    ctx.turbines.forEach((t, i) => { tmp.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(zAxis, time * 1.3 + i), one); rotors.setMatrixAt(i, tmp); });
    rotors.instanceMatrix.needsUpdate = true;
  }

  // start mid-day-ish: residents already out are partway through a trip, parked cars match the hour
  function settle(hour: number) {
    const f = outdoors(hour), dens = busy(hour);
    for (const c of cars) if (!c.bus && c.rank >= dens) { c.mode = "parked"; c.lane = DRIVEWAY; }
    for (const w of walkers) {
      const to = (["home", "work", "market"] as const)[(rng() * 3) | 0];
      if (rng() < f) {
        const from = to === "home" ? "work" : "home";
        w.path = route(placeOf(w, from), placeOf(w, to)); w.at = to; w.trip = pathLen(w.path) / w.v;
        w.seg = (rng() * (w.path.length - 1)) | 0; w.s = 0;
      } else { w.at = hour >= 9 && hour < 17 && rng() < 0.7 ? "work" : "home"; w.until = rr(2, stayFor(w, hour)); }
    }
    for (let si = 0; si < allStops.length; si++) {
      const st = allStops[si], n = Math.round(rr(0, allStops[si].bus ? 2 : 4) * dens);
      for (let k = 0; k < n; k++) { const r = freeRider(); if (!r) break; Object.assign(r, { state: "wait", x: st.wait[k][0], z: st.wait[k][1], y: st.y, to: st.wait[k], stop: si, slot: k }); st.queue.push(riders.indexOf(r)); }
    }
  }

  function info(): LifeInfo {
    return {
      moving: cars.filter((c) => !c.bus && c.mode !== "parked").length, parked: cars.filter((c) => c.mode === "parked").length,
      walking: walkers.filter((w) => w.path).length, indoors: walkers.filter((w) => !w.path).length,
      waiting: riders.filter((r) => r.state === "wait").length, riding: cars.filter((c) => c.bus).reduce((s, c) => s + c.load, 0) + train.load,
      buses: cars.filter((c) => c.bus).map((c) => ({ state: c.dwell > 0 ? "dwell" : "run", stop: c.stop >= 0 ? stops[c.stop].name : "", load: c.load })),
      train: { state: train.state, station: train.at >= 0 ? trainStops[train.at].name : trainStops[train.next].name, load: train.load, v: Math.round(train.v * 100) / 100,
        dist: train.state === "run" ? Math.round(nextStation(train.d).dist * 10) / 10 : 0 },
      ferry: ferry.state,
      stations: trainStops.map((st, k) => ({ name: st.name, waiting: st.queue.length, boarding: riders.filter((r) => r.state === "board" && r.stop === stops.length + k).length,
        sign: signs[k].text.split("|")[1] ?? "" })),
    };
  }

  return {
    step, draw, settle, info, counts: { people: NPEOPLE, cars: NCARS + NBUS },
    dispose() { for (const m of [carMesh, busMesh, bulbs, people, agentMarks, rotors]) m.dispose(); },
  };
}
