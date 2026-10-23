// Palasora world: the land beyond the first town, built in square chunks as the camera moves, so the map has no edge.
// Each chunk is two by two blocks of the outer street grid (districts.ts); what stands on a block follows its zone:
// homes and gardens, shops and apartment towers, workshops and warehouses, fields with barns and wind turbines, or woods.
// A chunk is two meshes (buildings, and window glow at night); chunks far from the camera are dropped and rebuilt later
// from the same seed, so they always look the same. Through traffic on the outer roads is a steady flow: every lane
// carries evenly spaced cars at one speed, so nobody overtakes and nothing jumps, and how many show follows the clock.
import * as THREE from "three";
import { Builder, M, createRandom } from "./kit";
import { CELL, COAST, GX, GZ, SEA_Y, WORLD_R, Z0, Z1, X0, X1, cellNoise, coastAt, zoneAt, type Zone } from "./districts";
import { busy } from "./life";

const CH = 2 * CELL;
const ROAD = 1.7, AS = 1.18;
const C = (h: string) => new THREE.Color(h);
const PAL = {
  lawn: "#a8c597", meadow: "#9fc08b", pavement: "#e6e0d2", asphalt: "#646d78", lane: "#f6f3ea", sand: "#efdcae", cream: "#f4ecdb", stone: "#e3d9c6",
  stone2: "#d4c8b1", terracotta: "#c9724f", slate: "#5e6a78", glass: "#a6d8da", white: "#fbfaf6", trunk: "#7c5b41", leaf: "#6d9e5e", leaf2: "#88b26c",
  pine: "#4f7f55", fallow: "#b39470", crop: "#7fa95a", wheat: "#d8c070", solar: "#2f4a6b", wood: "#a07752", yard: "#cfc8b8", metal: "#9aa4ae",
};
const GROUND: Record<Zone, string> = {
  residential: PAL.lawn, commercial: PAL.pavement, industrial: PAL.yard, farmland: PAL.meadow, countryside: PAL.meadow, civic: PAL.pavement,
  park: PAL.lawn, sea: PAL.lawn,
};

type Rand = ReturnType<typeof createRandom>;
export type ChunkCtx = { scene: THREE.Scene; mat: THREE.Material; glowMat: THREE.Material; lite: boolean };
type Chunk = { key: string; i: number; j: number; mesh: THREE.Mesh | null; glow: THREE.Mesh | null; turbines: { x: number; y: number; z: number }[]; seen: number };

/** The core block, where the town builds itself (chunks leave it alone). */
const coreCell = (x0: number, z0: number) => x0 < X1 - 0.01 && x0 + CELL > X0 + 0.01 && z0 < Z1 - 0.01 && z0 + CELL > Z0 + 0.01;
/** Whether a street of the outer grid runs at this point (not through the town, not in the sea). */
export function roadAt(x: number, z: number): boolean {
  if (x < coastAt(z) + 1.2) return false;
  return !(x > X0 && x < X1 - 0.5 && z > Z0 + 0.5 && z < Z1 - 0.5);
}

export function createChunks(ctx: ChunkCtx) {
  const { scene } = ctx;
  const chunks = new Map<string, Chunk>();
  const MAX_KEEP = ctx.lite ? 40 : 80;
  let clock = 0;

  // ------------------------------------------------------------------ building one chunk
  function build(i: number, j: number): Chunk {
    const B = new Builder(), W = new Builder();
    const turbines: Chunk["turbines"] = [];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const ci = i * 2 + a, cj = j * 2 + b;
      const x0 = GX + ci * CELL, z0 = GZ + cj * CELL;
      if (coreCell(x0, z0)) continue;
      const R = createRandom((ci * 73856093) ^ (cj * 19349663) ^ 0x5eed);
      buildCell(B, W, R, x0, z0, ci, cj, turbines);
    }
    const c: Chunk = { key: `${i},${j}`, i, j, mesh: null, glow: null, turbines, seen: clock };
    if (B.count) {
      c.mesh = new THREE.Mesh(B.geometry(), ctx.mat);
      c.mesh.castShadow = true; c.mesh.receiveShadow = true;
      scene.add(c.mesh);
    }
    if (W.count) { c.glow = new THREE.Mesh(W.geometry(), ctx.glowMat); scene.add(c.glow); }
    return c;
  }

  function buildCell(B: Builder, W: Builder, R: Rand, x0: number, z0: number, ci: number, cj: number, turbines: Chunk["turbines"]) {
    const x1 = x0 + CELL, z1 = z0 + CELL, cx = x0 + CELL / 2, cz = z0 + CELL / 2;
    const zone = zoneAt(cx, cz);
    const coastMax = Math.max(coastAt(z0), coastAt(z1), coastAt(cz));
    // land along the coast: strips from the shoreline, with a sloping beach
    if (coastMax > x0 - 1) {
      for (let z = z0; z < z1 - 0.01; z += 1) {
        const zm = z + 0.5, xs = Math.max(x0, coastAt(zm));
        const xe = Math.min(x1, COAST + 6.5);
        if (xs < xe) B.box(xe - xs + 0.02, 0.62, 1.02, C(PAL.lawn), M((xs + xe) / 2, -0.31, zm));
        if (xs > x0 && xs < x1) B.box(3.0, 0.5, 1.04, C(PAL.sand), M(xs + 0.1, -0.3, zm, 0, 0, -0.12));
      }
    }
    const landX = (z: number) => Math.max(x0, coastAt(z) + 1.6);
    if (zone === "sea") {
      if (R.rng() < 0.12) boat(B, R, cx + R.rr(-4, 4), cz + R.rr(-4, 4));
      return;
    }
    // streets on the west and north edges of every block (and the south edge just north of the town)
    const country = zone === "farmland" || zone === "countryside";
    if (roadAt(x0, cz)) street(B, W, x0, z0, x0, z1, country);
    const nx = landX(z0);
    if (nx < x1 - 1) street(B, W, nx, z0, x1, z0, country);
    if (Math.abs(z1 - Z0) < 0.01) { const sx = landX(z1); if (sx < x1 - 1) street(B, W, sx, z1, x1, z1, country); }
    // what stands on the block
    const ix0 = Math.max(x0 + ROAD / 2 + 0.25, landX(cz) + 0.6), ix1 = x1 - ROAD / 2 - 0.25, iz0 = z0 + ROAD / 2 + 0.25, iz1 = z1 - ROAD / 2 - 0.25;
    if (ix1 - ix0 < 2.5) return;
    B.box(ix1 - ix0, 0.03, iz1 - iz0, C(GROUND[zone]), M((ix0 + ix1) / 2, 0.012, (iz0 + iz1) / 2));
    if (zone === "residential") residential(B, W, R, ix0, ix1, iz0, iz1);
    else if (zone === "commercial") commercial(B, W, R, ix0, ix1, iz0, iz1);
    else if (zone === "industrial") industrial(B, W, R, ix0, ix1, iz0, iz1);
    else if (zone === "farmland") farm(B, R, ix0, ix1, iz0, iz1, turbines, cellNoise(ci, cj, 3) < 0.3);
    else woods(B, R, ix0, ix1, iz0, iz1);
  }

  function street(B: Builder, W: Builder, xa: number, za: number, xb: number, zb: number, country: boolean) {
    const vert = Math.abs(xa - xb) < 0.01, L = vert ? zb - za : xb - xa, mx = (xa + xb) / 2, mz = (za + zb) / 2;
    if (L <= 0.5) return;
    const lane = C(PAL.lane), asphalt = C(PAL.asphalt);
    if (!country) B.box(vert ? ROAD : L + ROAD, 0.05, vert ? L + ROAD : ROAD, C(PAL.pavement), M(mx, 0.025, mz));
    B.box(vert ? AS : L + AS, 0.02, vert ? L + AS : AS, asphalt, M(mx, 0.06, mz));
    for (let s = 1.2; s < L - 1.0; s += 1.4) B.box(vert ? 0.05 : 0.5, 0.005, vert ? 0.5 : 0.05, lane, M(vert ? xa : xa + s, 0.072, vert ? za + s : za));
    if (!country) for (let s = 2; s < L - 1; s += 3.2) { // street lamps
      const px = vert ? xa + ROAD / 2 - 0.1 : xa + s, pz = vert ? za + s : za + ROAD / 2 - 0.1;
      B.cyl(0.02, 0.025, 0.95, 5, C("#3a4048"), M(px, 0.5, pz)); W.box(0.12, 0.05, 0.12, C("#ffd59a"), M(px, 0.98, pz));
    }
  }

  function residential(B: Builder, W: Builder, R: Rand, ax0: number, ax1: number, az0: number, az1: number) {
    const n = 3, lw = (ax1 - ax0) / n, ld = (az1 - az0) / n;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const cx = ax0 + lw * (a + 0.5), cz = az0 + ld * (b + 0.5);
      if (a === 1 && b === 1) { park(B, R, cx, cz, lw, ld); continue; }
      house(B, W, R, cx, cz);
      B.box(lw - 0.3, 0.02, 0.05, C(PAL.white), M(cx, 0.08, cz + ld / 2 - 0.15)); // garden fence
    }
  }
  function park(B: Builder, R: Rand, cx: number, cz: number, w: number, d: number) {
    B.box(w - 0.4, 0.04, d - 0.4, C("#8db97c"), M(cx, 0.03, cz));
    for (let k = 0; k < 5; k++) tree(B, R, cx + R.rr(-w / 2 + 0.6, w / 2 - 0.6), cz + R.rr(-d / 2 + 0.6, d / 2 - 0.6), R.rr(0.9, 1.3));
    B.box(0.5, 0.06, 0.15, C(PAL.wood), M(cx, 0.15, cz));
  }
  function house(B: Builder, W: Builder, R: Rand, cx: number, cz: number) {
    const wall = R.col(R.pick([PAL.cream, PAL.stone, "#efe3cf", "#e9d8c0"]), 0.03), roof = C(R.pick([PAL.terracotta, PAL.slate, "#b8644a"]));
    const floors = R.rng() < 0.3 ? 2 : 1, w = R.rr(1.4, 1.9), d = R.rr(1.1, 1.4), h = 0.45 * floors, yaw = R.pick([0, Math.PI / 2]);
    B.box(w, h, d, wall, M(cx, h / 2 + 0.03, cz, yaw));
    B.gable(w + 0.14, 0.45, d + 0.14, roof, M(cx, h + 0.03, cz, yaw));
    B.box(0.22, 0.32, 0.03, C(PAL.wood), M(cx, 0.19, cz + d / 2, 0));
    for (let f = 0; f < floors; f++) for (let k = -1; k <= 1; k += 2) W.box(0.18, 0.16, 0.03, C("#ffcf8a"), M(cx + k * w * 0.28, 0.28 + f * 0.45, cz + d / 2 + 0.01));
    if (R.rng() < 0.5) tree(B, R, cx + R.rr(0.9, 1.3) * (R.rng() < 0.5 ? -1 : 1), cz + R.rr(-0.6, 0.6), 0.9);
  }
  function commercial(B: Builder, W: Builder, R: Rand, ax0: number, ax1: number, az0: number, az1: number) {
    const lw = (ax1 - ax0) / 2, ld = (az1 - az0) / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const cx = ax0 + lw * (a + 0.5), cz = az0 + ld * (b + 0.5), r = R.rng();
      if (r < 0.35) { // an apartment or office tower
        const h = R.rr(3, 8), w = Math.min(lw, ld) - 1.2;
        B.box(w, h, w, R.col(R.pick([PAL.cream, "#e7d6c1", "#d9e3ea", PAL.stone]), 0.03), M(cx, h / 2, cz));
        B.box(w + 0.1, 0.1, w + 0.1, C(PAL.white), M(cx, h + 0.05, cz));
        B.box(w * 0.4, 0.1, w * 0.4, C("#8db97c"), M(cx, h + 0.15, cz)); // roof garden
        for (let f = 0.5; f < h - 0.3; f += 0.55) {
          W.box(w * 0.85, 0.16, 0.03, R.rng() < 0.5 ? C("#ffd59a") : C("#cfe8ff"), M(cx, f, cz + w / 2 + 0.01));
          W.box(0.03, 0.16, w * 0.85, C("#ffd59a"), M(cx + w / 2 + 0.01, f, cz));
        }
      } else { // a row of shops under awnings with flats above
        const w = lw - 0.8, d = ld - 1.6, h = R.rr(1.0, 1.8);
        B.box(w, h, d, R.col(R.pick([PAL.cream, "#efe3cf", "#f0d9c4"]), 0.03), M(cx, h / 2, cz));
        B.box(w + 0.1, 0.08, d + 0.1, C(PAL.slate), M(cx, h + 0.04, cz));
        for (let k = 0; k < 3; k++) {
          const sx = cx - w / 3 + (k * w) / 3;
          B.box(w / 3 - 0.15, 0.04, 0.35, C(R.pick(["#c9724f", "#4f7cac", "#6f9e7a", "#e0a458", "#b5838d"])), M(sx, 0.55, cz + d / 2 + 0.17, 0, 0.35));
          W.box(w / 3 - 0.3, 0.3, 0.03, C("#ffe4b0"), M(sx, 0.25, cz + d / 2 + 0.01));
        }
        if (h > 1.3) W.box(w * 0.8, 0.15, 0.03, C("#ffd59a"), M(cx, h - 0.4, cz + d / 2 + 0.01));
      }
    }
    for (let k = 0; k < 4; k++) tree(B, R, R.rr(ax0 + 0.4, ax1 - 0.4), az1 - 0.3, 0.8);
  }
  function industrial(B: Builder, W: Builder, R: Rand, ax0: number, ax1: number, az0: number, az1: number) {
    const lw = (ax1 - ax0) / 2, ld = (az1 - az0) / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const cx = ax0 + lw * (a + 0.5), cz = az0 + ld * (b + 0.5), r = R.rng();
      if (r < 0.4) { // a factory hall with a saw-tooth roof and a chimney
        const w = lw - 0.8, d = ld - 1.0, h = R.rr(1.0, 1.5), wall = R.col(R.pick(["#d9cfc0", "#c7cdd3", "#e0d2bd"]), 0.03);
        B.box(w, h, d, wall, M(cx, h / 2, cz));
        for (let k = 0; k < 4; k++) B.gable(d, 0.45, w / 4, C(PAL.slate), M(cx - w / 2 + w / 8 + (k * w) / 4, h, cz, Math.PI / 2));
        B.cyl(0.14, 0.2, 3.2, 8, C("#b5523b"), M(cx + w / 2 - 0.4, 1.6, cz - d / 2 + 0.4));
        B.cyl(0.16, 0.16, 0.12, 8, C(PAL.white), M(cx + w / 2 - 0.4, 2.9, cz - d / 2 + 0.4));
        W.box(w * 0.7, 0.18, 0.03, C("#ffe9b8"), M(cx, h * 0.6, cz + d / 2 + 0.01));
      } else if (r < 0.7) { // a warehouse with loading doors and a parked truck
        const w = lw - 0.8, d = ld - 1.4, h = R.rr(0.9, 1.2);
        B.box(w, h, d, R.col(R.pick(["#c9b79c", "#b9c2cc", "#d8c7a9"]), 0.03), M(cx, h / 2, cz));
        B.box(w + 0.1, 0.06, d + 0.1, C(PAL.metal), M(cx, h + 0.03, cz));
        for (let k = 0; k < 3; k++) B.box(0.5, 0.6, 0.03, C("#5e6a78"), M(cx - w / 3 + (k * w) / 3, 0.3, cz + d / 2 + 0.01));
        truck(B, R, cx + R.rr(-w / 3, w / 3), cz + d / 2 + 0.7);
      } else if (r < 0.85) { // storage tanks
        for (let k = 0; k < 3; k++) {
          const tx = cx - 1.2 + k * 1.2;
          B.cyl(0.5, 0.5, 1.2, 14, C("#e8e6e0"), M(tx, 0.6, cz)); B.cyl(0.52, 0.52, 0.06, 14, C(PAL.metal), M(tx, 1.22, cz));
        }
      } else { // containers waiting to move
        for (let k = 0; k < 6; k++) B.box(1.0, 0.4, 0.4, C(R.pick(["#c9724f", "#4f7cac", "#3f8f8f", "#d8a838", "#7a9e7e"])), M(cx - 0.6 + (k % 2) * 1.15, 0.2 + ((k / 4) | 0) * 0.4, cz - 0.9 + (((k / 2) | 0) % 2) * 0.5));
      }
    }
  }
  function farm(B: Builder, R: Rand, ax0: number, ax1: number, az0: number, az1: number, turbines: Chunk["turbines"], turbine: boolean) {
    const rows = Math.floor((az1 - az0) / 0.45);
    const crop = R.pick([PAL.crop, PAL.wheat, PAL.fallow]);
    for (let r = 0; r < rows; r++) B.box(ax1 - ax0 - 3.2, 0.05, 0.3, C(r % 2 ? crop : PAL.meadow), M((ax0 + ax1) / 2 + 1.5, 0.05, az0 + 0.3 + r * 0.45));
    // farmyard: a barn, a silo and a greenhouse
    const fx = ax0 + 1.4, fz = az0 + 2;
    B.box(1.6, 0.8, 1.1, C("#b5523b"), M(fx, 0.4, fz)); B.gable(1.7, 0.5, 1.2, C(PAL.slate), M(fx, 0.8, fz));
    B.cyl(0.32, 0.32, 1.6, 10, C("#e3dfd6"), M(fx, 0.8, fz + 1.4)); B.dome(0.32, C(PAL.metal), M(fx, 1.6, fz + 1.4));
    B.box(1.3, 0.5, 0.8, C(PAL.glass), M(fx, 0.25, fz + 3)); B.box(1.32, 0.03, 0.82, C(PAL.white), M(fx, 0.51, fz + 3));
    if (turbine) {
      const tx = ax1 - 1.5, tz = az1 - 1.5;
      B.cyl(0.08, 0.16, 4.2, 8, C(PAL.white), M(tx, 2.1, tz)); B.box(0.5, 0.2, 0.22, C(PAL.white), M(tx + 0.2, 4.2, tz));
      turbines.push({ x: tx, y: 4.2, z: tz + 0.13 });
    }
  }
  function woods(B: Builder, R: Rand, ax0: number, ax1: number, az0: number, az1: number) {
    const n = ctx.lite ? 18 : 30;
    for (let k = 0; k < n; k++) {
      const x = R.rr(ax0 + 0.3, ax1 - 0.3), z = R.rr(az0 + 0.3, az1 - 0.3);
      if (R.rng() < 0.5) { B.cyl(0.05, 0.06, 0.4, 5, C(PAL.trunk), M(x, 0.2, z)); B.cone(R.rr(0.35, 0.5), R.rr(1.0, 1.5), 7, R.col(PAL.pine, 0.05), M(x, 0.95, z)); }
      else tree(B, R, x, z, R.rr(1, 1.5));
    }
    if (R.rng() < 0.3) { // a pond
      B.cyl(1.2, 1.2, 0.03, 16, C("#6fb3b5"), M(R.rr(ax0 + 2, ax1 - 2), 0.03, R.rr(az0 + 2, az1 - 2)));
    }
  }
  function tree(B: Builder, R: Rand, x: number, z: number, s = 1) {
    B.cyl(0.04 * s, 0.05 * s, 0.4 * s, 5, C(PAL.trunk), M(x, 0.22 * s, z));
    B.sphere(0.28 * s, R.col(R.pick([PAL.leaf, PAL.leaf2]), 0.06), M(x, 0.6 * s, z), 7, 5);
  }
  function truck(B: Builder, R: Rand, x: number, z: number) {
    B.box(0.9, 0.42, 0.36, C(R.pick(["#e9e4d8", "#c9724f", "#4f7cac"])), M(x - 0.15, 0.3, z)); B.box(0.3, 0.3, 0.34, C("#2f3540"), M(x + 0.45, 0.24, z));
  }
  function boat(B: Builder, R: Rand, x: number, z: number) {
    B.box(0.9, 0.18, 0.32, C(R.pick([PAL.white, "#e9e4d8", "#4f7cac"])), M(x, SEA_Y + 0.12, z, R.rr(0, Math.PI)));
  }

  // ------------------------------------------------------------------ through traffic on the outer grid
  const carGeo = (() => { const b = new Builder(); b.box(0.62, 0.2, 0.32, C("#ffffff"), M(0, 0.17, 0)); b.box(0.36, 0.16, 0.28, C("#ffffff"), M(-0.04, 0.34, 0));
    b.box(0.3, 0.12, 0.29, C("#3b4a5a"), M(-0.04, 0.35, 0)); b.box(0.64, 0.06, 0.33, C("#2b2f35"), M(0, 0.06, 0)); return b.geometry(); })();
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
  const NCARS = ctx.lite ? 220 : 480;
  const cars = new THREE.InstancedMesh(carGeo, carMat, NCARS);
  cars.frustumCulled = false; cars.count = 0;
  const carCols = ["#e9e4d8", "#c9724f", "#4f7cac", "#2f3540", "#d8a838", "#7a9e7e", "#b9c2cc", "#9a3f3f"].map(C);
  scene.add(cars);
  const P = CH, PER = 3; // each lane repeats every chunk with three car slots
  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
  const DENS: Record<Zone, number> = { commercial: 1, industrial: 0.8, residential: 0.6, civic: 0.6, park: 0.4, farmland: 0.3, countryside: 0.25, sea: 0 };
  let visibleCars = 0;
  function traffic(time: number, hour: number, box: { x0: number; x1: number; z0: number; z1: number }) {
    const dens = busy(hour);
    let n = 0;
    const lane = (vert: boolean, line: number, dir: 1 | -1) => {
      const k = Math.round((line - (vert ? GX : GZ)) / CELL);
      const v = 0.65 + 0.25 * cellNoise(k, vert ? 1 : 2, dir > 0 ? 5 : 6);
      const lo = vert ? box.z0 : box.x0, hi = vert ? box.z1 : box.x1;
      for (let slot = 0; slot < PER; slot++) {
        const phase = (slot / PER + cellNoise(k, slot, vert ? 11 : 12) * 0.25) * P;
        const base = (((phase + dir * v * time) % P) + P) % P;
        for (let s = Math.floor((lo - base) / P) * P + base; s < hi; s += P) {
          const rep = Math.round((s - base) / P);
          const x = vert ? line - dir * 0.3 : s, z = vert ? s : line + dir * 0.3;
          if (!roadAt(vert ? line : x, vert ? z : line)) continue;
          if (cellNoise(rep, k * 4 + slot, dir > 0 ? 21 : 22) > dens * DENS[zoneAt(x + (vert ? 3 : 0), z + (vert ? 0 : 3))] * 1.4) continue;
          if (n >= NCARS) return;
          const yaw = vert ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : dir > 0 ? 0 : Math.PI;
          q.setFromAxisAngle(yAxis, yaw); tmp.compose(pos.set(x, 0.04, z), q, one);
          cars.setMatrixAt(n, tmp); cars.setColorAt(n, carCols[(rep * 7 + slot * 3 + k) & 7]); n++;
        }
      }
    };
    for (let x = gridFloor(box.x0, GX); x <= box.x1; x += CELL) { lane(true, x, 1); lane(true, x, -1); }
    for (let z = gridFloor(box.z0, GZ); z <= box.z1; z += CELL) { lane(false, z, 1); lane(false, z, -1); }
    cars.count = n; visibleCars = n;
    cars.instanceMatrix.needsUpdate = true;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  }
  const gridFloor = (v: number, o: number) => o + Math.floor((v - o) / CELL) * CELL;

  // ------------------------------------------------------------------ outer wind turbines
  const rotorGeo = (() => { const b = new Builder(); for (let k = 0; k < 3; k++) b.box(0.08, 1.5, 0.03, C(PAL.white), M(0, 0, 0, 0, 0, (k * Math.PI * 2) / 3).multiply(M(0, 0.75, 0))); b.sphere(0.1, C(PAL.white)); return b.geometry(); })();
  const rotors = new THREE.InstancedMesh(rotorGeo, ctx.mat, 64);
  rotors.frustumCulled = false; rotors.count = 0;
  scene.add(rotors);

  // ------------------------------------------------------------------ the update: build what the camera sees, drop what it left
  const zAxis = new THREE.Vector3(0, 0, 1);
  function update(box: { x0: number; x1: number; z0: number; z1: number }, time: number, hour: number, budget: number) {
    clock++;
    const i0 = Math.floor((box.x0 - GX) / CH) - 1, i1 = Math.floor((box.x1 - GX) / CH) + 1;
    const j0 = Math.floor((box.z0 - GZ) / CH) - 1, j1 = Math.floor((box.z1 - GZ) / CH) + 1;
    const want: { i: number; j: number; d: number }[] = [];
    const mx = (box.x0 + box.x1) / 2, mz = (box.z0 + box.z1) / 2;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = GX + (i + 0.5) * CH, z = GZ + (j + 0.5) * CH;
      if (Math.abs(x) > WORLD_R + CH || Math.abs(z) > WORLD_R + CH) continue;
      const c = chunks.get(`${i},${j}`);
      if (c) { c.seen = clock; continue; }
      want.push({ i, j, d: Math.hypot(x - mx, z - mz) });
    }
    want.sort((a, b) => a.d - b.d);
    for (const w of want.slice(0, budget)) { const c = build(w.i, w.j); chunks.set(c.key, c); }
    if (chunks.size > MAX_KEEP) { // drop the chunks seen longest ago
      const old = [...chunks.values()].sort((a, b) => a.seen - b.seen).slice(0, chunks.size - MAX_KEEP);
      for (const c of old) { if (c.seen === clock) break; drop(c); }
    }
    traffic(time, hour, box);
    let r = 0;
    for (const c of chunks.values()) for (const t of c.turbines) {
      if (r >= 64) break;
      tmp.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(zAxis, time * 1.3 + t.x), one); rotors.setMatrixAt(r++, tmp);
    }
    rotors.count = r; rotors.instanceMatrix.needsUpdate = true;
    return Math.min(budget, want.length); // chunks built this frame
  }
  function drop(c: Chunk) {
    for (const m of [c.mesh, c.glow]) if (m) { scene.remove(m); m.geometry.dispose(); }
    chunks.delete(c.key);
  }
  return {
    update,
    info: () => ({ chunks: chunks.size, outerCars: visibleCars }),
    dispose() { for (const c of [...chunks.values()]) drop(c); cars.dispose(); rotors.dispose(); carGeo.dispose(); rotorGeo.dispose(); carMat.dispose(); },
  };
}
