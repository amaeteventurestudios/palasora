// Palasora Phase 6: the world viewer (Doc 06 section 8, Doc 03 sections 2 to 5, 8 and 9).
// One coastal town on a rounded block, seen through an orthographic, isometric camera. The plot grid and everything on it
// come from the economy service (WorldData); the ring around it (towers, the Exchange, the arena, the campus, the beach,
// the marina, wind turbines and the monorail) is set dressing. Built on our diorama kit: merged vertex-coloured geometry,
// a glow mesh for windows and lamps, instancing for cars, buses and people, static shadows, and a light tier for phones.
// Draw calls stay far under the phone budget of 150: the whole town is a handful of meshes.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Builder, M, createAdaptiveDpr, createRandom, detectQuality, glowMaterial, hashStr } from "./kit";
import { COLS, PLOT, ROAD, ROWS, TOWN_D, TOWN_W, plotAt, plotCenter, streets, type WorldBusiness, type WorldData, type WorldPlot } from "./layout";

export type Selection = { kind: "plot"; id: string } | { kind: "landmark"; id: string; title: string; text: string };
export type Label = { id: string; text: string; x: number; y: number; tone: "mine" | "selected" | "marker" };
export type CameraState = { tx: number; tz: number; zoom: number; theta: number; phi: number };
export type WorldOptions = {
  reduceMotion?: boolean; hour?: number; initialCamera?: CameraState | null;
  onSelect(sel: Selection | null): void; onLabels?(labels: Label[]): void; onReady?(): void;
};
export type WorldHandle = {
  flyTo(plotId: string, zoom?: number): void; select(plotId: string | null): void; setPaused(p: boolean): void; tour(plots: string[], onDone: () => void): void;
  stopTour(): void; info(): { calls: number; triangles: number; fps: number; dpr: number; lite: boolean; people: number; cars: number }; camera(): CameraState;
  setHour(h: number): void; dispose(): void;
};

const PAL = {
  lawn: "#a8c597", lawnDark: "#94b383", park: "#8db97c", soil: "#94704f", soilDark: "#6b5039", asphalt: "#646d78", lane: "#f6f3ea", pavement: "#e6e0d2",
  kerb: "#cfc7b5", sand: "#efdcae", sea: "#4fa3a5", cream: "#f4ecdb", stone: "#e3d9c6", stone2: "#d4c8b1", terracotta: "#c9724f", slate: "#5e6a78",
  glass: "#a6d8da", glassDark: "#7fb9c4", gold: "#d8a838", wood: "#a07752", white: "#fbfaf6", trunk: "#7c5b41", leaf: "#6d9e5e", leaf2: "#88b26c",
  fallow: "#b39470", crop: "#7fa95a", wheat: "#d8c070", solar: "#2f4a6b", rubber: "#30353c", hedge: "#6f9a63", sign: "#c9724f",
};
const OWNER = ["#4f7cac", "#c9724f", "#6f9e7a", "#b5838d", "#e0a458", "#6d597a", "#3f8f8f", "#a35d6a"];
const HEALTH: Record<string, string> = { green: "#3fae6a", yellow: "#e8c33c", orange: "#ec8a3a", red: "#d9483b" };
const C = (h: string) => new THREE.Color(h);

// Block extents around the town grid: sea and beach to the west, the Exchange quarter east, campus and arena south,
// farms and wind turbines north.
const WEST = 15, EAST = 13, NORTH = 11, SOUTH = 12;
const X0 = -TOWN_W / 2 - WEST, X1 = TOWN_W / 2 + EAST, Z0 = -TOWN_D / 2 - NORTH, Z1 = TOWN_D / 2 + SOUTH;
const COAST = -TOWN_W / 2 - 3.2; // land starts here; sea to the west
const SEA_Y = -0.42;

export function mountWorld(canvas: HTMLCanvasElement, data: WorldData, opts: WorldOptions): WorldHandle {
  const Q = detectQuality();
  const reduceMotion = opts.reduceMotion ?? Q.reduceMotion;
  // automated browsers keep the last frame so screenshots never catch a cleared canvas
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.LITE, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!navigator.webdriver });
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); throw new Error("webgl2"); }
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the town is static; shadows are redrawn only when the sun moves
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ---------- lights
  const hemi = new THREE.HemisphereLight(0xf3f6ff, 0x9a8a6a, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.LITE ? 1024 : 2048, Q.LITE ? 1024 : 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ---------- static town
  const plotsById = new Map(data.plots.map((p) => [p.id, p]));
  const bizById = new Map(data.businesses.map((b) => [b.id, b]));
  const bizOnPlot = new Map<string, WorldBusiness>();
  for (const b of data.businesses) if (b.status === "open" || !bizOnPlot.has(b.plot)) bizOnPlot.set(b.plot, b);
  const B = new Builder(), G = new Builder(), W = new Builder();
  const R = createRandom(20261022);
  const uGlow = { value: 0 };
  const landmarks: { id: string; title: string; text: string; x0: number; x1: number; z0: number; z1: number }[] = [];
  const S = streets();
  const busStops: [number, number][] = [];

  buildGround(B, R);
  buildStreets(B, W, R, S, busStops);
  for (const p of data.plots) buildPlot(B, G, W, p, bizOnPlot.get(p.id), data.founded || data.businesses.length > 0, data.tick);
  buildDressing(B, G, W, R, landmarks);

  const mat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, flatShading: true }));
  const town = new THREE.Mesh(keep(B.geometry()), mat);
  town.castShadow = true; town.receiveShadow = true;
  const glassMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.88, flatShading: true }));
  const glass = new THREE.Mesh(keep(G.geometry()), glassMat);
  glass.castShadow = true; glass.receiveShadow = true;
  const glow = new THREE.Mesh(keep(W.geometry()), keep(glowMaterial(uGlow)));
  scene.add(town, glass, glow);

  // the sea: one gently lit surface inside the block
  const seaGeo = keep(new THREE.BoxGeometry(COAST - X0 - 0.5, 0.1, Z1 - Z0 - 1));
  const seaMat = keep(new THREE.MeshStandardMaterial({ color: PAL.sea, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }));
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.set((X0 + 0.25 + COAST) / 2, SEA_Y - 0.05, (Z0 + Z1) / 2);
  sea.receiveShadow = true;
  scene.add(sea);

  // ---------- health rings, "since you left" beacons, selection ring, your plot
  const ringGeo = keep(new THREE.RingGeometry(1.02, 1.2, 32).rotateX(-Math.PI / 2));
  const open = data.businesses.filter((b) => b.status === "open" && plotsById.has(b.plot));
  const rings = new THREE.InstancedMesh(ringGeo, keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false })), Math.max(1, open.length));
  rings.count = open.length;
  open.forEach((b, i) => {
    const p = plotsById.get(b.plot)!; const [x, z] = plotCenter(p.x, p.y);
    rings.setMatrixAt(i, M(x, 0.1, z)); rings.setColorAt(i, C(HEALTH[b.health] ?? HEALTH.green));
  });
  rings.frustumCulled = false;
  scene.add(rings);

  const markerPlots = data.markers.map((m) => plotsById.get(m.plot)).filter(Boolean) as WorldPlot[];
  const beaconGeo = keep(new THREE.CylinderGeometry(0.16, 0.5, 5, 12, 1, true).translate(0, 2.5, 0));
  const beaconMat = keep(new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, Math.max(1, markerPlots.length));
  beacons.count = markerPlots.length;
  markerPlots.forEach((p, i) => { const [x, z] = plotCenter(p.x, p.y); beacons.setMatrixAt(i, M(x, 0, z)); });
  beacons.frustumCulled = false;
  scene.add(beacons);

  const selRing = new THREE.Mesh(keep(new THREE.RingGeometry(1.3, 1.46, 40).rotateX(-Math.PI / 2)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })));
  selRing.visible = false;
  scene.add(selRing);

  const mine = data.mine.plot ? plotsById.get(data.mine.plot) : undefined;
  if (mine) {
    const fb = new Builder(); const [x, z] = plotCenter(mine.x, mine.y);
    fb.cyl(0.035, 0.035, 2.2, 6, C(PAL.white), M(x + 0.95, 1.1, z - 0.95));
    fb.box(0.62, 0.38, 0.03, C(PAL.gold), M(x + 0.95 + 0.31, 1.98, z - 0.95));
    const flag = new THREE.Mesh(keep(fb.geometry()), mat);
    flag.castShadow = true;
    scene.add(flag);
  }

  // ---------- traffic: cars and buses drive loops on the right-hand lane and stop at red lights
  const { v: VX, h: HZ } = S;
  type Car = { loop: [number, number][]; seg: number; t: number; speed: number; v: number; bus: boolean; dwell: number; len: number };
  const carGeo = (() => { const b = new Builder(); b.box(0.62, 0.2, 0.32, C("#ffffff"), M(0, 0.17, 0)); b.box(0.36, 0.16, 0.28, C("#ffffff"), M(-0.04, 0.34, 0));
    b.box(0.3, 0.12, 0.29, C("#3b4a5a"), M(-0.04, 0.35, 0)); b.box(0.64, 0.06, 0.33, C("#2b2f35"), M(0, 0.06, 0)); return keep(b.geometry()); })();
  const busGeo = (() => { const b = new Builder(); b.box(1.25, 0.42, 0.38, C("#ffffff"), M(0, 0.3, 0)); b.box(1.2, 0.12, 0.39, C("#2f3d4c"), M(0, 0.38, 0));
    b.box(1.27, 0.06, 0.39, C("#2b2f35"), M(0, 0.08, 0)); return keep(b.geometry()); })();
  const carMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }));
  const NCARS = Q.LITE ? 22 : 40, NBUS = 3;
  const cars: Car[] = [];
  const loopRect = (i0: number, i1: number, j0: number, j1: number, cw: boolean): [number, number][] => {
    const pts: [number, number][] = [[VX[i0], HZ[j0]], [VX[i1], HZ[j0]], [VX[i1], HZ[j1]], [VX[i0], HZ[j1]]];
    return cw ? pts : pts.reverse();
  };
  for (let i = 0; i < NCARS + NBUS; i++) {
    const bus = i >= NCARS;
    let loop: [number, number][];
    if (bus) loop = loopRect(0, VX.length - 1, 0, HZ.length - 1, i % 2 === 0);
    else {
      const i0 = (R.rng() * (VX.length - 1)) | 0, j0 = (R.rng() * (HZ.length - 1)) | 0;
      const i1 = Math.min(VX.length - 1, i0 + 1 + ((R.rng() * 3) | 0)), j1 = Math.min(HZ.length - 1, j0 + 1 + ((R.rng() * 3) | 0));
      loop = loopRect(i0, i1, j0, j1, R.rng() < 0.5);
    }
    const len = loop.reduce((s, p, k) => { const q = loop[(k + 1) % 4]; return s + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]); }, 0);
    cars.push({ loop, seg: (R.rng() * 4) | 0, t: R.rng(), speed: bus ? 1.5 : R.rr(1.9, 2.8), v: 0, bus, dwell: 0, len });
  }
  const carMesh = new THREE.InstancedMesh(carGeo, carMat, NCARS);
  const busMesh = new THREE.InstancedMesh(busGeo, carMat, NBUS);
  const carCols = ["#e9e4d8", "#c9724f", "#4f7cac", "#2f3540", "#d8a838", "#7a9e7e", "#b9c2cc", "#9a3f3f"];
  for (let i = 0; i < NCARS; i++) carMesh.setColorAt(i, C(R.pick(carCols)));
  for (let i = 0; i < NBUS; i++) busMesh.setColorAt(i, C("#3f8f8f"));
  carMesh.castShadow = busMesh.castShadow = false;
  carMesh.frustumCulled = busMesh.frustumCulled = false;
  scene.add(carMesh, busMesh);

  // traffic lights: one bulb per approach; north-south and east-west alternate every 7 s
  const crossings: { x: number; z: number; ph: number }[] = [];
  for (let i = 1; i < VX.length - 1; i++) for (let j = 1; j < HZ.length - 1; j++) crossings.push({ x: VX[i], z: HZ[j], ph: (i + j) % 2 });
  const bulbGeo = keep(new THREE.SphereGeometry(0.075, 8, 6));
  const bulbs = new THREE.InstancedMesh(bulbGeo, keep(new THREE.MeshBasicMaterial({ toneMapped: false })), crossings.length * 2);
  crossings.forEach((c, k) => {
    const o = ROAD / 2 - 0.1;
    bulbs.setMatrixAt(k * 2, M(c.x + o, 1.02, c.z + o)); bulbs.setMatrixAt(k * 2 + 1, M(c.x - o, 1.02, c.z - o));
  });
  bulbs.frustumCulled = false;
  scene.add(bulbs);
  const lightGreen = (c: { ph: number }, axis: "x" | "z", time: number) => ((Math.floor(time / 7) + c.ph) % 2 === 0) === (axis === "z");

  // ---------- people on the pavements; agents carry a gold marker
  const NPEOPLE = Q.LITE ? 150 : 300;
  const pGeo = (() => { const b = new Builder(); b.cyl(0.07, 0.09, 0.32, 6, C("#ffffff"), M(0, 0.2, 0)); b.sphere(0.075, C("#e8c9a8"), M(0, 0.44, 0), 6, 5); return keep(b.geometry()); })();
  const people = new THREE.InstancedMesh(pGeo, carMat, NPEOPLE);
  const agentMarkGeo = keep(new THREE.OctahedronGeometry(0.07));
  const agentMarks = new THREE.InstancedMesh(agentMarkGeo, keep(new THREE.MeshBasicMaterial({ color: PAL.gold, toneMapped: false })), NPEOPLE);
  type Walker = { loop: [number, number][]; seg: number; t: number; speed: number; agent: boolean };
  const walkers: Walker[] = [];
  const shirt = ["#4f7cac", "#c9724f", "#6f9e7a", "#e0a458", "#f4ecdb", "#6d597a", "#3f8f8f", "#b5838d", "#2f3540"];
  const off = ROAD / 2 - 0.14;
  for (let i = 0; i < NPEOPLE; i++) {
    const bi = (R.rng() * (VX.length - 1)) | 0, bj = (R.rng() * (HZ.length - 1)) | 0;
    const x0 = VX[bi] + off, x1 = VX[bi + 1] - off, z0 = HZ[bj] - off, z1 = HZ[bj + 1] + off; // HZ decreases northward
    const loop: [number, number][] = R.rng() < 0.5 ? [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] : [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
    walkers.push({ loop, seg: (R.rng() * 4) | 0, t: R.rng(), speed: R.rr(0.22, 0.42), agent: R.rng() < 0.18 });
    people.setColorAt(i, C(R.pick(shirt)));
  }
  people.frustumCulled = agentMarks.frustumCulled = false;
  scene.add(people, agentMarks);

  // ---------- ferry and monorail
  const ferry = new THREE.Mesh((() => { const b = new Builder(); b.box(2.2, 0.35, 0.8, C(PAL.white), M(0, 0.1, 0)); b.box(1.2, 0.35, 0.62, C(PAL.cream), M(-0.2, 0.45, 0));
    b.box(1.1, 0.1, 0.64, C("#3f8f8f"), M(-0.2, 0.5, 0)); b.box(2.25, 0.08, 0.82, C("#c9724f"), M(0, -0.04, 0)); return keep(b.geometry()); })(), mat);
  ferry.castShadow = true;
  scene.add(ferry);
  const mono = monorailPath();
  const train = new THREE.Mesh((() => { const b = new Builder(); for (let k = 0; k < 3; k++) { b.box(1.1, 0.42, 0.5, C(PAL.white), M(-k * 1.2, 0, 0)); b.box(0.95, 0.16, 0.51, C("#3f8f8f"), M(-k * 1.2, 0.06, 0)); }
    return keep(b.geometry()); })(), mat);
  train.castShadow = true;
  scene.add(train);
  const rotorGeo = (() => { const b = new Builder(); for (let k = 0; k < 3; k++) b.box(0.08, 1.5, 0.03, C(PAL.white), M(0, 0, 0, 0, 0, (k * Math.PI * 2) / 3).multiply(M(0, 0.75, 0))); b.sphere(0.1, C(PAL.white)); return keep(b.geometry()); })();
  const turbines = turbineSpots();
  const rotors = new THREE.InstancedMesh(rotorGeo, mat, turbines.length);
  rotors.frustumCulled = false;
  scene.add(rotors);

  // ---------- camera: orthographic, isometric three-quarter view; tilt 25 to 60 degrees; eases back after 4 s idle
  const HOME = { theta: Math.PI / 4 + 0.08, phi: 0.92 };
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const controls = new OrbitControls(cam, canvas);
  controls.enableDamping = !reduceMotion; controls.dampingFactor = 0.09;
  controls.minPolarAngle = THREE.MathUtils.degToRad(30); controls.maxPolarAngle = THREE.MathUtils.degToRad(65);
  controls.minZoom = 0.8; controls.maxZoom = 6; controls.zoomSpeed = 1.1;
  controls.screenSpacePanning = false;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  const sph = new THREE.Spherical();
  function placeCamera(s: CameraState) {
    controls.target.set(s.tx, 0, s.tz);
    sph.set(120, s.phi, s.theta);
    cam.position.setFromSpherical(sph).add(controls.target);
    cam.zoom = s.zoom; cam.updateProjectionMatrix();
    controls.update();
  }
  const init = opts.initialCamera;
  const portrait = (canvas.clientWidth || 1) < (canvas.clientHeight || 1);
  placeCamera(init ?? { tx: portrait ? 3.5 : 3, tz: portrait ? 1.5 : 1, zoom: portrait ? 0.9 : 1.35, theta: HOME.theta, phi: HOME.phi });
  let lastInput = performance.now();
  controls.addEventListener("start", () => { lastInput = performance.now(); stopFly(); });
  controls.addEventListener("change", () => {
    const t = controls.target; // keep the target over the block
    t.x = THREE.MathUtils.clamp(t.x, X0 + 6, X1 - 6); t.z = THREE.MathUtils.clamp(t.z, Z0 + 6, Z1 - 6);
  });

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, a = w / h;
    // portrait screens see the whole town grid; landscape and desktop frame the town with some of the ring
    const V = a >= 1 ? 50 : Math.min(110, 50 / a * 0.62);
    cam.left = (-V * a) / 2; cam.right = (V * a) / 2; cam.top = V / 2; cam.bottom = -V / 2; cam.updateProjectionMatrix();
    renderer.setPixelRatio(dpr.dpr);
    renderer.setSize(w, h, false);
  }
  const dpr = createAdaptiveDpr(Q.maxDpr, () => resize());
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();

  // ---------- fly-to and the "since you left" tour
  let fly: { from: CameraState; to: CameraState; t: number; dur: number } | null = null;
  function camState(): CameraState {
    sph.setFromVector3(cam.position.clone().sub(controls.target));
    return { tx: controls.target.x, tz: controls.target.z, zoom: cam.zoom, theta: sph.theta, phi: sph.phi };
  }
  function stopFly() { fly = null; }
  function flyTo(id: string, zoom = 2.4) {
    const p = plotsById.get(id); if (!p) return;
    const [x, z] = plotCenter(p.x, p.y);
    const to = { tx: x, tz: z, zoom, theta: HOME.theta, phi: HOME.phi };
    if (reduceMotion) { placeCamera(to); return; }
    fly = { from: camState(), to, t: 0, dur: 0.9 };
  }
  let tourTimer: ReturnType<typeof setTimeout> | null = null;
  function stopTour() { if (tourTimer) clearTimeout(tourTimer); tourTimer = null; }
  function tour(ids: string[], onDone: () => void) {
    stopTour();
    const list = ids.filter((id) => plotsById.has(id)).slice(0, 10);
    const each = Math.min(3000, 30000 / Math.max(1, list.length));
    let k = 0;
    const next = () => { if (k >= list.length) { tourTimer = null; onDone(); return; } select(list[k]); flyTo(list[k], 2.8); k++; tourTimer = setTimeout(next, each); };
    next();
  }

  // ---------- picking: a tap (not a drag) selects the plot or landmark under it
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1), hit = new THREE.Vector3();
  let down: { x: number; y: number; t: number } | null = null;
  let selected: string | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; lastInput = performance.now(); };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 8 || !quick) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    if (!ray.ray.intersectPlane(ground, hit)) return;
    const c = plotAt(hit.x, hit.z);
    if (c) {
      const p = data.plots.find((q) => q.x === c.x && q.y === c.y);
      if (p) { select(p.id); opts.onSelect({ kind: "plot", id: p.id }); return; }
    }
    const lm = landmarks.find((l) => hit.x >= l.x0 && hit.x <= l.x1 && hit.z >= l.z0 && hit.z <= l.z1);
    select(null);
    opts.onSelect(lm ? { kind: "landmark", id: lm.id, title: lm.title, text: lm.text } : null);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  function select(id: string | null) {
    selected = id;
    const p = id ? plotsById.get(id) : undefined;
    selRing.visible = !!p;
    if (p) { const [x, z] = plotCenter(p.x, p.y); selRing.position.set(x, 0.12, z); }
  }

  // ---------- time of day: the real clock (or ?hour= for checks)
  let hour = opts.hour ?? new Date().getHours() + new Date().getMinutes() / 60;
  const sky = new THREE.Color();
  function applyHour(h: number) {
    hour = ((h % 24) + 24) % 24;
    const day = THREE.MathUtils.smoothstep(Math.sin(((hour - 6) / 12) * Math.PI), -0.15, 0.35);
    const golden = Math.exp(-Math.pow((hour - 6.5) / 1.2, 2)) + Math.exp(-Math.pow((hour - 18.3) / 1.2, 2));
    const az = ((hour - 6) / 12) * Math.PI;
    const el = Math.max(0.18, Math.sin(az) * 1.05);
    sun.position.set(Math.cos(az) * 60, 25 + el * 50, -30 + Math.sin(az) * 10);
    sun.intensity = 0.7 + 1.95 * day;
    sun.color.set(0xfff1dc).lerp(C("#ffb27a"), Math.min(1, golden * 0.8)).lerp(C("#8fa3d8"), 1 - day);
    hemi.intensity = 1.0 + 0.3 * day;
    hemi.color.set(0xf3f6ff).lerp(C("#7f90c4"), 1 - day);
    sky.set("#bfe3ea").lerp(C("#f3c9a0"), Math.min(1, golden * 0.7)).lerp(C("#27345a"), 1 - day);
    scene.background = sky;
    seaMat.color.set(PAL.sea).lerp(C("#1f3f55"), (1 - day) * 0.8);
    uGlow.value = THREE.MathUtils.clamp(1 - day * 1.6, 0, 1);
    renderer.toneMappingExposure = 1.0 + 0.1 * day;
    renderer.shadowMap.needsUpdate = true;
  }
  applyHour(hour);
  const clockTimer = opts.hour == null ? setInterval(() => applyHour(new Date().getHours() + new Date().getMinutes() / 60), 60_000) : null;

  // ---------- loop
  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
  const proj = new THREE.Vector3();
  let raf = 0, last = performance.now(), time = 0, paused = false, lastPaused = 0, frames = 0, readySent = false;
  function moveOnLoop(loop: [number, number][], seg: number, t: number, laneOff: number): { x: number; z: number; yaw: number } {
    const a = loop[seg], b = loop[(seg + 1) % 4];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = dx / L, nz = dz / L;
    return { x: a[0] + dx * t - nz * laneOff, z: a[1] + dz * t + nx * laneOff, yaw: Math.atan2(-nz, nx) }; // right-hand lane
  }
  function stepTraffic(dt: number) {
    const placed: { x: number; z: number; nx: number; nz: number }[] = [];
    for (const c of cars) {
      const a = c.loop[c.seg], b = c.loop[(c.seg + 1) % 4];
      const L = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      const p = moveOnLoop(c.loop, c.seg, c.t, 0.3);
      const nx = Math.sign(b[0] - a[0]), nz = Math.sign(b[1] - a[1]);
      let target = c.speed;
      if (c.dwell > 0) { c.dwell -= dt; target = 0; }
      // red light ahead on this street?
      const axis: "x" | "z" = nx !== 0 ? "x" : "z";
      for (const k of crossings) {
        const ahead = axis === "x" ? (k.x - p.x) * nx : (k.z - p.z) * nz;
        const lateral = axis === "x" ? Math.abs(k.z - p.z) : Math.abs(k.x - p.x);
        if (lateral < 0.6 && ahead > ROAD / 2 && ahead < ROAD / 2 + 0.5 && !lightGreen(k, axis, time)) target = 0;
      }
      // keep a gap to the car in front
      for (const o of placed) {
        if (o.nx !== nx || o.nz !== nz) continue;
        const ahead = (o.x - p.x) * nx + (o.z - p.z) * nz, lateral = Math.abs((o.x - p.x) * nz) + Math.abs((o.z - p.z) * nx);
        if (lateral < 0.2 && ahead > 0 && ahead < (c.bus ? 1.3 : 0.85)) target = 0;
      }
      // buses pause at stops
      if (c.bus && c.dwell <= 0) for (const s of busStops) if (Math.hypot(s[0] - p.x, s[1] - p.z) < 0.25) { c.dwell = 2.2; target = 0; }
      c.v += (target - c.v) * Math.min(1, dt * (target < c.v ? 6 : 1.6));
      c.t += (c.v * dt) / Math.max(0.01, L);
      if (c.t >= 1) { c.t -= 1; c.seg = (c.seg + 1) % 4; }
      placed.push({ x: p.x, z: p.z, nx, nz });
    }
    let ci = 0, bi = 0;
    for (const c of cars) {
      const p = moveOnLoop(c.loop, c.seg, c.t, 0.3);
      q.setFromAxisAngle(yAxis, p.yaw); pos.set(p.x, 0.04, p.z);
      tmp.compose(pos, q, one);
      if (c.bus) busMesh.setMatrixAt(bi++, tmp); else carMesh.setMatrixAt(ci++, tmp);
    }
    carMesh.instanceMatrix.needsUpdate = true; busMesh.instanceMatrix.needsUpdate = true;
    const on = C("#41d07a"), off = C("#e2483b");
    crossings.forEach((k, i) => { bulbs.setColorAt(i * 2, lightGreen(k, "x", time) ? on : off); bulbs.setColorAt(i * 2 + 1, lightGreen(k, "z", time) ? on : off); });
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  }
  function stepPeople(dt: number) {
    let ai = 0;
    walkers.forEach((w, i) => {
      const a = w.loop[w.seg], b = w.loop[(w.seg + 1) % 4];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      w.t += (w.speed * dt) / L;
      if (w.t >= 1) { w.t -= 1; w.seg = (w.seg + 1) % 4; }
      const p = moveOnLoop(w.loop, w.seg, w.t, 0);
      const bob = Math.abs(Math.sin(time * 9 + i)) * 0.025;
      q.setFromAxisAngle(yAxis, p.yaw); pos.set(p.x, 0.06 + bob, p.z); tmp.compose(pos, q, one);
      people.setMatrixAt(i, tmp);
      if (w.agent) { pos.y += 0.62; tmp.compose(pos, q.setFromAxisAngle(yAxis, time * 2), one); agentMarks.setMatrixAt(ai++, tmp); }
    });
    agentMarks.count = ai;
    people.instanceMatrix.needsUpdate = true; agentMarks.instanceMatrix.needsUpdate = true;
  }
  function stepRest(dt: number) {
    // the ferry crosses between the harbour pier and the open sea
    const [hx, hz] = plotCenter(0, 5);
    const u = (Math.sin(time * 0.06) + 1) / 2;
    ferry.position.set(COAST - 3 - u * 7.5, SEA_Y + 0.12, hz - 1.6 + Math.sin(time * 0.06 + 1) * 1.5);
    ferry.rotation.y = Math.cos(time * 0.06) > 0 ? Math.PI : 0;
    void hx;
    const m = mono(time * 0.035);
    train.position.set(m.x, 2.55, m.z); train.rotation.y = m.yaw;
    turbines.forEach((t, i) => { tmp.compose(pos.set(t.x, t.y, t.z), q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), time * 1.4 + i), one); rotors.setMatrixAt(i, tmp); });
    rotors.instanceMatrix.needsUpdate = true;
    beaconMat.opacity = 0.28 + 0.2 * Math.sin(time * 2.4);
    void dt;
  }
  function labels() {
    if (!opts.onLabels) return;
    const out: Label[] = [];
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const put = (p: WorldPlot, text: string, tone: Label["tone"], id: string) => {
      const [x, z] = plotCenter(p.x, p.y); proj.set(x, 1.6, z).project(cam);
      if (proj.x < -1 || proj.x > 1 || proj.y < -1 || proj.y > 1) return;
      out.push({ id, text, x: ((proj.x + 1) / 2) * w, y: ((1 - proj.y) / 2) * h, tone });
    };
    if (mine) put(mine, "Your plot", "mine", "mine");
    const s = selected ? plotsById.get(selected) : undefined;
    if (s && s !== mine) put(s, s.id, "selected", "sel");
    opts.onLabels(out);
  }
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused && now - lastPaused < 250) return; // a menu or page covers the world: about 4 fps
    lastPaused = now;
    const dt = paused ? 0 : real;
    time += dt;
    if (fly) {
      fly.t = Math.min(1, fly.t + real / fly.dur);
      const k = fly.t * fly.t * (3 - 2 * fly.t), f = fly.from, t2 = fly.to;
      placeCamera({ tx: f.tx + (t2.tx - f.tx) * k, tz: f.tz + (t2.tz - f.tz) * k, zoom: f.zoom + (t2.zoom - f.zoom) * k, theta: f.theta + (t2.theta - f.theta) * k, phi: f.phi + (t2.phi - f.phi) * k });
      if (fly.t >= 1) fly = null;
    } else if (!reduceMotion && now - lastInput > 4000) {
      const s = camState(); // ease back toward the home angle
      const dth = Math.atan2(Math.sin(HOME.theta - s.theta), Math.cos(HOME.theta - s.theta)), dph = HOME.phi - s.phi;
      if (Math.abs(dth) > 0.002 || Math.abs(dph) > 0.002) placeCamera({ ...s, theta: s.theta + dth * Math.min(1, real * 1.2), phi: s.phi + dph * Math.min(1, real * 1.2) });
    }
    controls.update();
    if (dt > 0) { stepTraffic(dt); stepPeople(dt); stepRest(dt); }
    renderer.render(scene, cam);
    dpr.tick(real, now);
    labels();
    if (!readySent && ++frames >= 2) { readySent = true; opts.onReady?.(); }
  }
  stepTraffic(0.001); stepPeople(0.001); stepRest(0.001);
  raf = requestAnimationFrame(frame);
  const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", onVis);

  return {
    flyTo, select, tour, stopTour,
    setPaused(p) { paused = p; },
    setHour(h) { applyHour(h); },
    camera: camState,
    info() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps: dpr.fps, dpr: dpr.dpr, lite: Q.LITE, people: NPEOPLE, cars: NCARS + NBUS };
    },
    dispose() {
      cancelAnimationFrame(raf); stopTour(); if (clockTimer) clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
      ro.disconnect(); controls.dispose();
      for (const d of disposables) d.dispose();
      for (const m of [rings, beacons, carMesh, busMesh, bulbs, people, agentMarks, rotors]) m.dispose();
      renderer.dispose();
    },
  };
}

// ======================================================================================================================
// Static geometry
// ======================================================================================================================

type Rand = ReturnType<typeof createRandom>;

function buildGround(B: Builder, R: Rand) {
  const W = X1 - X0, D = Z1 - Z0, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  // the block: soil skirt (darker toward the bottom), then lawn on land and a sea floor under the water
  B.box(W, 2.2, D, (_x, y) => C(PAL.soil).lerp(C(PAL.soilDark), THREE.MathUtils.clamp(-y / 2.2 + 0.5, 0, 1)), M(cx, -1.1 - 0.62, cz));
  B.box(X1 - COAST, 0.62, D, C(PAL.lawn), M((COAST + X1) / 2, -0.31, cz));
  B.box(COAST - X0, 0.12, D, C("#3f7f86"), M((X0 + COAST) / 2, -0.62 + 0.06, cz)); // sea floor
  B.box(COAST - X0, 0.5, 0.3, C(PAL.soil), M((X0 + COAST) / 2, -0.62 + 0.25, Z1 - 0.15)); // sea wall at the block's edges
  B.box(COAST - X0, 0.5, 0.3, C(PAL.soil), M((X0 + COAST) / 2, -0.62 + 0.25, Z0 + 0.15));
  B.box(0.3, 0.5, D, C(PAL.soil), M(X0 + 0.15, -0.62 + 0.25, cz));
  // the town base: pavement under the whole grid
  B.box(TOWN_W, 0.06, TOWN_D, C(PAL.pavement), M(0, 0.03, 0));
  // beach (south-west) sloping into the sea, promenade north of it
  const beachZ0 = 2, beachZ1 = Z1 - 0.5;
  B.box(3.4, 0.5, beachZ1 - beachZ0, C(PAL.sand), M(COAST + 0.1, -0.3, (beachZ0 + beachZ1) / 2, 0, 0, -0.12));
  B.box(TOWN_W / 2 + COAST + 3.2 + 0.02, 0.07, Z1 - Z0 - 1, C(PAL.pavement), M((COAST + -TOWN_W / 2) / 2, 0.035, cz));
  B.box(0.25, 0.75, beachZ0 - Z0 - 0.5, C(PAL.stone2), M(COAST, -0.3, (Z0 + 0.5 + beachZ0) / 2)); // quay wall
  for (let i = 0; i < 9; i++) { // beach umbrellas and towels
    const x = COAST + R.rr(-0.9, 0.9), z = R.rr(beachZ0 + 1, beachZ1 - 1);
    B.cyl(0.02, 0.02, 0.6, 4, C(PAL.white), M(x, -0.05, z));
    B.cone(0.38, 0.18, 8, C(R.pick(["#c9724f", "#f4ecdb", "#4f7cac", "#e0a458"])), M(x, 0.3, z));
  }
}

function buildStreets(B: Builder, W: Builder, R: Rand, S: { v: number[]; h: number[] }, busStops: [number, number][]) {
  const AS = 1.18; // asphalt width; the rest of ROAD is pavement
  const asphalt = C(PAL.asphalt), lane = C(PAL.lane);
  for (const x of S.v) B.box(AS, 0.02, TOWN_D - 0.2, asphalt, M(x, 0.065, 0));
  for (const z of S.h) B.box(TOWN_W - 0.2, 0.02, AS, asphalt, M(0, 0.066, z));
  const near = (val: number, list: number[]) => list.some((s) => Math.abs(s - val) < ROAD / 2 + 0.25);
  // centre lines: dashed, broken at junctions
  for (const x of S.v) for (let z = -TOWN_D / 2 + 0.6; z < TOWN_D / 2 - 0.4; z += 0.7) if (!near(z, S.h)) B.box(0.05, 0.005, 0.34, lane, M(x, 0.078, z));
  for (const z of S.h) for (let x = -TOWN_W / 2 + 0.6; x < TOWN_W / 2 - 0.4; x += 0.7) if (!near(x, S.v)) B.box(0.34, 0.005, 0.05, lane, M(x, 0.079, z));
  // zebra crossings on every side of every junction
  for (const x of S.v) for (const z of S.h) {
    for (let k = -4; k <= 4; k++) {
      B.box(0.07, 0.005, 0.34, lane, M(x + k * 0.13, 0.08, z + ROAD / 2 + 0.05)); B.box(0.07, 0.005, 0.34, lane, M(x + k * 0.13, 0.08, z - ROAD / 2 - 0.05));
      B.box(0.34, 0.005, 0.07, lane, M(x + ROAD / 2 + 0.05, 0.08, z + k * 0.13)); B.box(0.34, 0.005, 0.07, lane, M(x - ROAD / 2 - 0.05, 0.08, z + k * 0.13));
    }
  }
  // traffic light poles at inner junctions (bulbs are instanced and change colour)
  const pole = C("#3a4048");
  for (let i = 1; i < S.v.length - 1; i++) for (let j = 1; j < S.h.length - 1; j++) {
    const o = ROAD / 2 - 0.1;
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const x = S.v[i] + sx * o, z = S.h[j] + sz * o;
      B.cyl(0.025, 0.025, 1.0, 5, pole, M(x, 0.55, z));
      B.box(0.12, 0.26, 0.12, pole, M(x, 1.0, z));
    }
  }
  // street lamps and trees along the pavements; lamp heads glow at night
  const lampC = C("#ffd59a");
  const lamp = (x: number, z: number) => { B.cyl(0.02, 0.025, 0.95, 5, pole, M(x, 0.52, z)); W.box(0.12, 0.05, 0.12, lampC, M(x, 1.0, z)); };
  const tree = (x: number, z: number, s = 1) => { B.cyl(0.04 * s, 0.05 * s, 0.4 * s, 5, C(PAL.trunk), M(x, 0.25 * s, z)); B.sphere(0.26 * s, R.col(R.pick([PAL.leaf, PAL.leaf2]), 0.06), M(x, 0.58 * s, z), 7, 5); };
  for (const x of S.v) for (let z = -TOWN_D / 2 + 1; z < TOWN_D / 2 - 0.8; z += 1.6) {
    if (near(z, S.h)) continue;
    const side = ((z * 7) | 0) % 2 ? 1 : -1;
    if (R.rng() < 0.55) tree(x + side * (ROAD / 2 - 0.1), z, R.rr(0.85, 1.1)); else lamp(x + side * (ROAD / 2 - 0.08), z);
  }
  for (const z of S.h) for (let x = -TOWN_W / 2 + 1; x < TOWN_W / 2 - 0.8; x += 1.6) {
    if (near(x, S.v)) continue;
    const side = ((x * 7) | 0) % 2 ? 1 : -1;
    if (R.rng() < 0.45) tree(x, z + side * (ROAD / 2 - 0.1), R.rr(0.85, 1.1)); else lamp(x, z + side * (ROAD / 2 - 0.08));
  }
  // bus stops on the ring road: glass-roofed shelters
  const ring: [number, number, number][] = [[S.v[0], 0, 0], [S.v[S.v.length - 1], 0, 0], [0, S.h[0], 1], [0, S.h[S.h.length - 1], 1]];
  for (const [x0, z0, horiz] of ring) {
    for (const t of [-0.25, 0.25]) {
      const x = horiz ? t * TOWN_W + 0.8 : x0, z = horiz ? z0 : t * TOWN_D + 0.8;
      const ox = horiz ? 0 : (x0 < 0 ? -1 : 1) * (ROAD / 2 - 0.12), oz = horiz ? (z0 > 0 ? 1 : -1) * (ROAD / 2 - 0.12) : 0;
      const sx = horiz ? 0.7 : 0.22, sz = horiz ? 0.22 : 0.7;
      B.box(sx, 0.04, sz, C(PAL.glassDark), M(x + ox, 0.62, z + oz));
      B.cyl(0.02, 0.02, 0.6, 4, pole, M(x + ox + (horiz ? 0.32 : 0), 0.32, z + oz + (horiz ? 0 : 0.32)));
      B.cyl(0.02, 0.02, 0.6, 4, pole, M(x + ox - (horiz ? 0.32 : 0), 0.32, z + oz - (horiz ? 0 : 0.32)));
      B.box(horiz ? 0.5 : 0.08, 0.06, horiz ? 0.08 : 0.5, C(PAL.wood), M(x + ox, 0.2, z + oz));
      B.box(0.08, 0.3, 0.08, C("#3f8f8f"), M(x + ox + (horiz ? 0.45 : 0), 0.25, z + oz + (horiz ? 0 : 0.45))); // stop sign
      busStops.push([horiz ? x : x0 + (x0 < 0 ? -0.3 : 0.3) * 0, horiz ? z0 : z]);
    }
  }
}

function windowRow(W: Builder, x: number, y: number, z: number, w: number, d: number, n: number, face: "z" | "x", c: THREE.Color) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    if (face === "z") W.box(0.16, 0.16, 0.02, c, M(x + t * w, y, z + d / 2 + 0.005));
    else W.box(0.02, 0.16, 0.16, c, M(x + w / 2 + 0.005, y, z + t * d));
  }
}

function buildPlot(B: Builder, G: Builder, W: Builder, p: WorldPlot, biz: WorldBusiness | undefined, lived: boolean, tick = 0) {
  const [cx, cz] = plotCenter(p.x, p.y);
  const R = createRandom(hashStr(p.id));
  const IN = PLOT - 0.24;
  const warm = C("#ffcf8a");
  const lawn = p.area === "farmland" ? PAL.fallow : p.area === "market" ? PAL.stone : p.area === "harbourside" ? "#cfc6b2" : PAL.lawn;
  B.box(IN, 0.05, IN, R.col(lawn, 0.02), M(cx, 0.085, cz));

  // buildings are drawn at the plot's origin and scaled up a little to fill the plot
  const sb = new Builder(), sg = new Builder(), sw = new Builder();
  const place = (k: number) => {
    const T = M(cx, 0.11, cz, 0, 0, 0, k, k, k).multiply(M(0, -0.11, 0));
    B.absorb(sb, T); G.absorb(sg, T); W.absorb(sw, T);
  };
  if (p.use === "civic") {
    if (p.area === "town_hall") {
      B.box(IN, 0.08, IN, C(PAL.stone), M(cx, 0.12, cz));
      sb.box(1.5, 0.5, 1.5, C(PAL.cream), M(0, 0.36, 0));
      for (let k = -2; k <= 2; k++) sb.cyl(0.05, 0.05, 0.5, 6, C(PAL.white), M(k * 0.28, 0.36, 0.8));
      sb.cyl(0.62, 0.65, 0.4, 20, C(PAL.stone), M(0, 0.8, 0));
      sg.dome(0.62, C(PAL.glass), M(0, 1.0, 0), 20);
      sb.cyl(0.02, 0.02, 0.45, 4, C(PAL.gold), M(0, 1.8, 0)); sb.sphere(0.06, C(PAL.gold), M(0, 2.05, 0));
      windowRow(sw, 0, 0.4, 0, 1.2, 1.5, 5, "z", warm);
      place(1.3);
    } else if (p.area === "market_hall") {
      B.box(IN, 0.08, IN, C(PAL.stone), M(cx, 0.12, cz));
      sb.box(1.7, 0.5, 1.2, C(PAL.cream), M(0, 0.36, -0.15));
      sg.gable(1.75, 0.45, 1.3, C(PAL.glass), M(0, 0.61, -0.15, Math.PI / 2));
      sb.box(1.8, 0.04, 1.32, C(PAL.slate), M(0, 0.61, -0.15));
      for (let k = -2; k <= 2; k++) { sb.box(0.26, 0.16, 0.18, C(PAL.wood), M(k * 0.34, 0.19, 0.7)); sb.box(0.3, 0.03, 0.24, C(R.pick(OWNER)), M(k * 0.34, 0.38, 0.7)); }
      windowRow(sw, 0, 0.4, -0.15, 1.4, 1.2, 6, "z", warm);
      place(1.25);
    } else { // harbour: quay, warehouse, crane, pier into the sea
      B.box(IN, 0.08, IN, C(PAL.stone2), M(cx, 0.12, cz));
      B.box(1.3, 0.75, 1.0, C(PAL.stone), M(cx + 0.3, 0.5, cz - 0.4)); B.gable(1.35, 0.35, 1.05, C(PAL.slate), M(cx + 0.3, 0.88, cz - 0.4));
      B.box(0.12, 1.8, 0.12, C(PAL.gold), M(cx - 0.6, 1.0, cz + 0.5)); B.box(1.6, 0.1, 0.1, C(PAL.gold), M(cx - 1.05, 1.9, cz + 0.5));
      B.box(0.06, 0.6, 0.06, C("#3a4048"), M(cx - 1.7, 1.55, cz + 0.5));
      const pierLen = cx - COAST + 6;
      B.box(pierLen, 0.1, 0.7, C(PAL.wood), M(cx - pierLen / 2 - 0.6, 0.0, cz + 0.6));
      for (let k = 0; k < pierLen; k += 0.9) B.cyl(0.05, 0.05, 0.8, 5, C(PAL.trunk), M(cx - 0.8 - k, -0.3, cz + 0.95));
      for (let k = 0; k < 3; k++) boat(B, COAST - 2 - k * 1.6, cz - 0.3, R);
      for (let k = 0; k < 4; k++) B.box(0.3, 0.25, 0.3, C(R.pick(OWNER)), M(cx + 0.5 + (k % 2) * 0.32, 0.25, cz + 0.55 + ((k / 2) | 0) * 0.32));
      windowRow(W, cx + 0.3, 0.5, cz - 0.4, 1.0, 1.0, 4, "z", warm);
    }
    return;
  }

  if (biz && biz.status === "open") {
    buildBusiness(sb, sg, sw, 0, 0, biz, R);
    if (biz.type !== "farm" && biz.opened_tick != null && tick - biz.opened_tick < 24) scaffold(sb); // opened in the last day: still being finished
    place(biz.type === "farm" ? 1 : 1.28); sign(B, cx, cz, biz); return;
  }
  if (biz) { // closed: the building stands empty and shuttered
    sb.box(1.4, 0.5, 1.2, C("#bdb6a8"), M(0, 0.36, 0)); sb.box(1.5, 0.05, 1.3, C(PAL.slate), M(0, 0.63, 0));
    sb.box(0.7, 0.3, 0.02, C("#8d8678"), M(0, 0.3, 0.61));
    place(1.25);
    return;
  }
  if (p.use === "home" && (lived || p.owner)) {
    house(sb, sw, 0, 0, R, p.level); place(1.32);
    for (let k = -4; k <= 4; k++) B.box(0.03, 0.16, 0.03, C(PAL.white), M(cx + k * 0.25, 0.19, cz + IN / 2 - 0.04)); // front fence
    B.box(IN - 0.1, 0.03, 0.02, C(PAL.white), M(cx, 0.24, cz + IN / 2 - 0.04));
    return;
  }

  // an empty plot: tidy, with a "for sale" sign
  if (p.area === "farmland") { for (let k = -3; k <= 3; k++) B.box(IN - 0.2, 0.04, 0.1, C("#a3845f"), M(cx, 0.12, cz + k * 0.28)); }
  else if (p.area === "market") { // a paved lot with planters
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, 0.6]]) { B.box(0.42, 0.14, 0.42, C(PAL.stone2), M(cx + dx, 0.18, cz + dz)); B.sphere(0.26, R.col(PAL.leaf2, 0.06), M(cx + dx, 0.45, cz + dz), 7, 5); }
    B.box(0.5, 0.06, 0.16, C(PAL.wood), M(cx - 0.4, 0.2, cz + 0.6));
  } else { // a green with a few trees and a bench
    B.box(IN - 0.1, 0.02, IN - 0.1, R.col(PAL.park, 0.03), M(cx, 0.115, cz));
    const n = 2 + ((R.rng() * 2) | 0);
    for (let k = 0; k < n; k++) { const x = cx + R.rr(-0.75, 0.75), z = cz + R.rr(-0.75, 0.75);
      B.cyl(0.04, 0.05, 0.4, 5, C(PAL.trunk), M(x, 0.3, z)); B.sphere(R.rr(0.26, 0.36), R.col(R.pick([PAL.leaf, PAL.leaf2]), 0.06), M(x, 0.66, z), 7, 5); }
    B.box(0.5, 0.06, 0.16, C(PAL.wood), M(cx + 0.3, 0.2, cz + 0.75));
  }
  B.cyl(0.015, 0.015, 0.36, 4, C(PAL.white), M(cx + 0.92, 0.28, cz + 0.92)); // "for sale"
  B.box(0.24, 0.15, 0.02, C(PAL.sign), M(cx + 0.92, 0.44, cz + 0.92));
}

function boat(B: Builder, x: number, z: number, R: Rand) {
  B.box(0.9, 0.18, 0.32, C(R.pick([PAL.white, "#e9e4d8", "#4f7cac"])), M(x, SEA_Y + 0.12, z));
  B.box(0.4, 0.2, 0.26, C(PAL.cream), M(x - 0.1, SEA_Y + 0.3, z));
  B.cyl(0.015, 0.015, 0.8, 4, C(PAL.white), M(x + 0.15, SEA_Y + 0.6, z));
}

function house(B: Builder, W: Builder, cx: number, cz: number, R: Rand, level: number) {
  const wall = R.col(R.pick([PAL.cream, PAL.stone, "#efe3cf", "#e9d8c0"]), 0.03), roof = C(R.pick([PAL.terracotta, PAL.slate, "#b8644a"]));
  const floors = 1 + Math.min(2, level), w = R.rr(1.0, 1.3), d = R.rr(0.85, 1.05), h = 0.42 * floors, yaw = R.pick([0, Math.PI / 2]);
  B.box(w, h, d, wall, M(cx - 0.2, 0.11 + h / 2, cz - 0.15, yaw));
  B.gable(w + 0.12, 0.38, d + 0.12, roof, M(cx - 0.2, 0.11 + h, cz - 0.15, yaw));
  if (R.rng() < 0.4) B.box(0.38, 0.03, 0.24, C(PAL.solar), M(cx - 0.2, 0.11 + h + 0.2, cz - 0.15 + 0.18, yaw, -0.45));
  B.box(0.2, 0.3, 0.02, C(PAL.wood), M(cx - 0.2, 0.26, cz - 0.15 + d / 2 + 0.01));
  for (let f = 0; f < floors; f++) windowRow(W, cx - 0.2, 0.36 + f * 0.42, cz - 0.15, w * 0.8, d, 3, "z", C("#ffcf8a"));
  B.sphere(0.18, R.col(PAL.leaf2, 0.06), M(cx + 0.62, 0.3, cz + 0.5), 7, 5); // garden shrub
}

function buildBusiness(B: Builder, G: Builder, W: Builder, cx: number, cz: number, b: WorldBusiness, R: Rand) {
  const own = C(OWNER[hashStr(b.owner) % OWNER.length]);
  const warm = C("#ffcf8a");
  const lv = Math.max(1, Math.min(5, b.level));
  if (b.type === "stall") {
    const floors = lv >= 2 ? 2 : 1;
    B.box(1.1, 0.45 * floors, 0.8, C(PAL.cream), M(cx, 0.11 + (0.45 * floors) / 2, cz - 0.2));
    B.box(1.2, 0.05, 0.9, C(PAL.slate), M(cx, 0.13 + 0.45 * floors, cz - 0.2));
    for (let k = 0; k < 6; k++) B.box(0.2, 0.03, 0.46, k % 2 ? C(PAL.white) : own, M(cx - 0.5 + k * 0.2, 0.52, cz + 0.4, 0, 0.32)); // striped awning
    B.box(0.9, 0.16, 0.2, C(PAL.wood), M(cx, 0.2, cz + 0.28));
    for (let k = 0; k < (lv >= 3 ? 3 : 2); k++) { const x = cx - 0.6 + k * 0.6, z = cz + 0.85; B.cyl(0.14, 0.14, 0.03, 10, C(PAL.white), M(x, 0.27, z)); B.cyl(0.015, 0.015, 0.16, 4, C(PAL.white), M(x, 0.18, z));
      B.cone(0.3, 0.12, 8, own, M(x, 0.62, z)); B.cyl(0.01, 0.01, 0.42, 4, C(PAL.white), M(x, 0.4, z)); }
    for (let f = 0; f < floors; f++) windowRow(W, cx, 0.32 + f * 0.45, cz - 0.2, 0.8, 0.8, 3, "z", warm);
  } else if (b.type === "farm") {
    for (let k = -3; k <= 3; k++) B.box(PLOT - 0.5, 0.08, 0.13, C(k % 2 ? PAL.crop : PAL.wheat), M(cx, 0.14, cz + 0.2 + k * 0.14 * 1.1));
    for (let g = 0; g < Math.min(3, lv); g++) {
      G.box(0.5, 0.32, 0.36, C(PAL.glass), M(cx - 0.75 + g * 0.6, 0.27, cz - 0.75));
      B.box(0.52, 0.02, 0.38, C(PAL.white), M(cx - 0.75 + g * 0.6, 0.44, cz - 0.75));
    }
    B.box(0.5, 0.4, 0.4, C("#b8644a"), M(cx + 0.8, 0.31, cz - 0.75)); B.gable(0.55, 0.22, 0.44, C(PAL.slate), M(cx + 0.8, 0.51, cz - 0.75));
  } else if (b.type === "workshop") {
    B.box(1.6, 0.6, 1.1, C(PAL.stone), M(cx, 0.41, cz - 0.2));
    for (let k = 0; k < 4; k++) B.gable(0.4, 0.22, 1.12, C(k % 2 ? PAL.slate : PAL.terracotta), M(cx - 0.6 + k * 0.4, 0.71, cz - 0.2));
    B.box(0.5, 0.4, 0.02, own, M(cx + 0.3, 0.31, cz + 0.36));
    if (lv >= 2) { B.box(0.7, 0.45, 0.6, C(PAL.cream), M(cx - 0.55, 0.33, cz + 0.65)); B.box(0.75, 0.04, 0.65, C(PAL.slate), M(cx - 0.55, 0.57, cz + 0.65)); }
    for (let k = 0; k < 3; k++) B.box(0.22, 0.2, 0.22, C(PAL.wood), M(cx + 0.55 + (k % 2) * 0.25, 0.21 + ((k / 2) | 0) * 0.2, cz + 0.7));
    windowRow(W, cx, 0.5, cz - 0.2, 1.3, 1.1, 5, "x", warm);
  } else { // delivery depot with roller doors and carts
    B.box(1.7, 0.55, 1.0, C(PAL.cream), M(cx, 0.38, cz - 0.35)); B.box(1.75, 0.05, 1.05, C(PAL.slate), M(cx, 0.68, cz - 0.35));
    for (let k = 0; k < 3; k++) B.box(0.4, 0.38, 0.02, own, M(cx - 0.55 + k * 0.55, 0.3, cz + 0.16));
    for (let k = 0; k < Math.min(4, lv + 1); k++) { B.box(0.36, 0.18, 0.22, own, M(cx - 0.6 + k * 0.4, 0.2, cz + 0.65)); B.box(0.16, 0.14, 0.2, C(PAL.white), M(cx - 0.68 + k * 0.4, 0.33, cz + 0.65)); }
  }
  void R;
}

/** Scaffolding on a building opened in the last town day: poles, two decks of planks and a hoist. */
function scaffold(B: Builder) {
  const pole = C("#c9a24a"), plank = C("#a87b4f");
  for (const x of [-0.8, 0, 0.8]) for (const z of [-0.75, 0.55]) B.cyl(0.018, 0.018, 1.1, 4, pole, M(x, 0.66, z));
  for (const y of [0.55, 0.98]) { B.box(1.7, 0.03, 0.16, plank, M(0, y, 0.55)); B.box(1.7, 0.03, 0.16, plank, M(0, y, -0.75)); B.box(0.02, 0.02, 1.32, pole, M(-0.8, y + 0.2, -0.1)); }
  B.box(0.04, 0.04, 0.5, pole, M(0.8, 1.22, 0.35)); B.cyl(0.006, 0.006, 0.5, 3, C("#3a4048"), M(0.8, 0.97, 0.58));
}

/** The shop sign at the plot's corner carries the owner's colour. */
function sign(B: Builder, cx: number, cz: number, b: WorldBusiness) {
  const own = C(OWNER[hashStr(b.owner) % OWNER.length]);
  B.cyl(0.02, 0.02, 0.7, 4, C(PAL.white), M(cx + 0.95, 0.45, cz + 0.95));
  B.box(0.36, 0.22, 0.03, own, M(cx + 0.95, 0.75, cz + 0.95));
}

function buildDressing(B: Builder, G: Builder, W: Builder, R: Rand, landmarks: { id: string; title: string; text: string; x0: number; x1: number; z0: number; z1: number }[]) {
  const E0 = TOWN_W / 2 + 0.2, EW = X1 - 0.6 - E0; // the Exchange quarter, east of the ring road
  const warm = C("#ffd59a"), cool = C("#cfe8ff"), asphalt = C(PAL.asphalt), lane = C(PAL.lane);
  const SS = streets();
  B.box(EW, 0.06, TOWN_D, C(PAL.pavement), M(E0 + EW / 2, 0.03, 0));
  for (const z of SS.h) { // the town's east-west streets run on through the quarter
    B.box(EW, 0.02, 1.18, asphalt, M(E0 + EW / 2, 0.065, z));
    for (let x = E0 + 0.6; x < E0 + EW - 0.3; x += 0.7) B.box(0.34, 0.005, 0.05, lane, M(x, 0.078, z));
  }
  const tower = (x: number, z: number, h: number) => {
    B.cyl(1.2, 1.25, 0.3, 20, C(PAL.stone), M(x, 0.2, z));
    G.cyl(1.0, 1.05, h, 20, C(PAL.glass), M(x, 0.35 + h / 2, z));
    for (let f = 1; f < h / 0.6; f++) B.cyl(1.07, 1.07, 0.05, 20, C(PAL.white), M(x, 0.35 + f * 0.6, z));
    B.cyl(0.85, 1.0, 0.25, 20, C(PAL.white), M(x, 0.48 + h, z));
    B.box(0.5, 0.06, 0.5, C(PAL.park), M(x, 0.64 + h, z)); B.sphere(0.2, C(PAL.leaf), M(x, 0.78 + h, z), 7, 5); // roof garden
    for (let f = 1; f < h / 0.6; f++) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) if (R.rng() < 0.5)
      W.box(0.5, 0.18, 0.04, R.rng() < 0.5 ? warm : cool, M(x + Math.sin(a) * 1.01, 0.35 + f * 0.6 - 0.3, z + Math.cos(a) * 1.01, a));
  };
  const apartments = (x: number, z: number) => { // apartment blocks with rooftop gardens and solar
    const h = R.rr(2.2, 3.6);
    B.box(2.3, h, 2.2, R.col(R.pick([PAL.cream, "#efe3cf", "#e7d6c1"]), 0.03), M(x, h / 2 + 0.06, z));
    B.box(2.4, 0.08, 2.3, C(PAL.white), M(x, h + 0.1, z));
    B.box(1.0, 0.1, 1.9, C(PAL.park), M(x - 0.55, h + 0.18, z)); B.sphere(0.25, C(PAL.leaf), M(x - 0.6, h + 0.4, z - 0.4), 7, 5); B.sphere(0.22, C(PAL.leaf2), M(x - 0.5, h + 0.38, z + 0.5), 7, 5);
    for (let k = 0; k < 3; k++) B.box(0.3, 0.03, 0.9, C(PAL.solar), M(x + 0.35 + k * 0.32, h + 0.25, z, 0, 0, 0.4));
    for (let f = 0; f < h / 0.5 - 1; f++) { windowRow(W, x, 0.45 + f * 0.5, z, 1.9, 2.2, 5, "z", warm); windowRow(W, x, 0.45 + f * 0.5, z, 2.3, 1.9, 5, "x", warm); }
  };
  const cols = [E0 + EW * 0.2, E0 + EW * 0.5, E0 + EW * 0.8];
  const ex = [cols[1], 0];
  for (let i = 0; i < SS.h.length - 1; i++) {
    const zc = (SS.h[i] + SS.h[i + 1]) / 2;
    if (i === 2) { ex[1] = zc; tower(cols[0], zc, 6); apartments(cols[2], zc); continue; }
    const plan = [[tower, apartments, tower], [apartments, tower, apartments]][i % 2];
    plan.forEach((f, k) => (f === tower ? tower(cols[k], zc, R.rr(4, 8)) : apartments(cols[k], zc)));
  }
  // the gold-topped Sora Exchange
  B.cyl(1.5, 1.6, 0.4, 24, C(PAL.stone), M(ex[0], 0.22, ex[1]));
  G.cyl(1.15, 1.3, 10.5, 24, C("#b5e0dc"), M(ex[0], 0.4 + 5.25, ex[1]));
  for (let f = 1; f < 17; f++) B.cyl(1.27 - f * 0.009, 1.27 - f * 0.009, 0.06, 24, C(PAL.white), M(ex[0], 0.4 + f * 0.62, ex[1]));
  B.cyl(0.6, 1.2, 1.2, 24, C(PAL.gold), M(ex[0], 11.5, ex[1]));
  B.cone(0.6, 1.0, 24, C(PAL.gold), M(ex[0], 12.6, ex[1]));
  B.cyl(0.03, 0.03, 1.2, 4, C(PAL.gold), M(ex[0], 13.6, ex[1]));
  landmarks.push({ id: "exchange", title: "Sora Exchange", text: "The gold-topped tower. Closed until the Exchange opens.", x0: ex[0] - 1.7, x1: ex[0] + 1.7, z0: ex[1] - 1.7, z1: ex[1] + 1.7 });
  landmarks.push({ id: "towers", title: "Downtown towers", text: "Offices and apartments around the Exchange.", x0: E0, x1: X1, z0: -TOWN_D / 2, z1: TOWN_D / 2 });
  // two avenues run south from the ring road, between the arena and the campus
  for (const x of [SS.v[4], SS.v[SS.v.length - 2]]) {
    B.box(1.7, 0.06, Z1 - 0.6 - TOWN_D / 2, C(PAL.pavement), M(x, 0.03, (TOWN_D / 2 + Z1 - 0.6) / 2));
    B.box(1.18, 0.02, Z1 - 0.6 - TOWN_D / 2, asphalt, M(x, 0.065, (TOWN_D / 2 + Z1 - 0.6) / 2));
    for (let z = TOWN_D / 2 + 0.5; z < Z1 - 0.8; z += 0.7) B.box(0.05, 0.005, 0.34, lane, M(x, 0.078, z));
    for (let z = TOWN_D / 2 + 1.2; z < Z1 - 1; z += 1.5) for (const sd of [-1, 1]) {
      B.cyl(0.04, 0.05, 0.4, 5, C(PAL.trunk), M(x + sd * 0.75, 0.25, z)); B.sphere(0.26, R.col(R.pick([PAL.leaf, PAL.leaf2]), 0.06), M(x + sd * 0.75, 0.58, z), 7, 5);
    }
  }
  // south: arena, campus, drone vertiport
  const sz = TOWN_D / 2 + 1.0;
  const ar = [-6.5, sz + 5.5];
  B.cyl(4.2, 4.6, 1.3, 28, C(PAL.stone), M(ar[0], 0.7, ar[1]));
  B.cyl(3.4, 3.4, 0.05, 28, C("#7fbf6a"), M(ar[0], 1.36, ar[1]));
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; B.box(0.12, 0.6, 0.12, C(PAL.white), M(ar[0] + Math.cos(a) * 4.4, 1.6, ar[1] + Math.sin(a) * 4.4)); }
  B.box(2.4, 0.01, 1.4, C("#f6f3ea"), M(ar[0], 1.39, ar[1]));
  landmarks.push({ id: "arena", title: "Arena", text: "Matches and festivals. Set dressing in the first town.", x0: ar[0] - 4.6, x1: ar[0] + 4.6, z0: ar[1] - 4.6, z1: ar[1] + 4.6 });
  const cp = [8, sz + 5];
  B.box(7, 0.06, 6, C(PAL.park), M(cp[0], 0.05, cp[1]));
  B.box(5.8, 1.1, 1.2, C("#d9a77f"), M(cp[0], 0.6, cp[1] - 2.2)); B.box(1.2, 1.1, 4, C("#d9a77f"), M(cp[0] - 2.6, 0.6, cp[1] + 0.2));
  B.box(5.9, 0.08, 1.3, C(PAL.slate), M(cp[0], 1.2, cp[1] - 2.2)); B.box(1.3, 0.08, 4.1, C(PAL.slate), M(cp[0] - 2.6, 1.2, cp[1] + 0.2));
  B.cyl(0.35, 0.35, 2.2, 10, C(PAL.stone), M(cp[0] + 2.4, 1.1, cp[1] + 1.8)); B.cone(0.45, 0.6, 10, C(PAL.terracotta), M(cp[0] + 2.4, 2.5, cp[1] + 1.8));
  windowRow(W, cp[0], 0.55, cp[1] - 2.2, 5.2, 1.2, 10, "z", warm); windowRow(W, cp[0], 0.95, cp[1] - 2.2, 5.2, 1.2, 10, "z", warm);
  landmarks.push({ id: "campus", title: "Campus", text: "The town's college. Set dressing in the first town.", x0: cp[0] - 3.5, x1: cp[0] + 3.5, z0: cp[1] - 3, z1: cp[1] + 3 });
  const vp = [-17, sz + 6];
  B.cyl(1.6, 1.6, 0.6, 16, C(PAL.stone2), M(vp[0], 0.3, vp[1]));
  B.box(0.25, 0.01, 1.0, C(PAL.white), M(vp[0] - 0.3, 0.61, vp[1])); B.box(0.25, 0.01, 1.0, C(PAL.white), M(vp[0] + 0.3, 0.61, vp[1])); B.box(0.6, 0.01, 0.2, C(PAL.white), M(vp[0], 0.61, vp[1]));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; W.box(0.08, 0.04, 0.08, C("#7fd0ff"), M(vp[0] + Math.cos(a) * 1.45, 0.62, vp[1] + Math.sin(a) * 1.45)); }
  landmarks.push({ id: "vertiport", title: "Drone vertiport", text: "Drones come and go from here. Set dressing in the first town.", x0: vp[0] - 1.7, x1: vp[0] + 1.7, z0: vp[1] - 1.7, z1: vp[1] + 1.7 });
  // parks and trees around the south strip
  for (let k = 0; k < 70; k++) {
    const x = R.rr(-TOWN_W / 2 - 2, TOWN_W / 2 + EAST - 1), z = R.rr(sz + 0.5, Z1 - 0.8);
    if (Math.abs(x - SS.v[4]) < 1.2 || Math.abs(x - SS.v[SS.v.length - 2]) < 1.2) continue;
    if (Math.hypot(x - ar[0], z - ar[1]) < 5 || (Math.abs(x - cp[0]) < 3.8 && Math.abs(z - cp[1]) < 3.3) || Math.hypot(x - vp[0], z - vp[1]) < 2) continue;
    B.cyl(0.05, 0.06, 0.45, 5, C(PAL.trunk), M(x, 0.22, z)); B.sphere(R.rr(0.28, 0.4), R.col(R.pick([PAL.leaf, PAL.leaf2]), 0.06), M(x, 0.62, z), 7, 5);
  }
  // north: farms with greenhouses on a low hill, wind turbines
  const nz = -TOWN_D / 2 - 1.0;
  for (let k = 0; k < 6; k++) {
    const x = -TOWN_W / 2 + 2 + k * 6.2, z = nz - 4.5;
    for (let r = -3; r <= 3; r++) B.box(5, 0.06, 0.32, C(r % 2 ? PAL.crop : PAL.wheat), M(x + 1.5, 0.05, z + r * 0.42));
    G.box(1.6, 0.6, 0.9, C(PAL.glass), M(x + 0.4, 0.33, z - 2.6)); B.box(1.62, 0.03, 0.92, C(PAL.white), M(x + 0.4, 0.64, z - 2.6));
  }
  for (const t of turbineSpots()) {
    B.cyl(0.08, 0.16, t.y, 8, C(PAL.white), M(t.x, t.base + (t.y - t.base) / 2, t.z));
    B.box(0.5, 0.2, 0.22, C(PAL.white), M(t.x + 0.2, t.y, t.z));
  }
  // the marina: pontoons and small boats north of the harbour
  const mz = -TOWN_D / 2 + 3;
  for (let k = 0; k < 3; k++) {
    B.box(4.5, 0.08, 0.3, C(PAL.wood), M(COAST - 2.4, SEA_Y + 0.08, mz + k * 2.2));
    for (let j = 0; j < 3; j++) boat(B, COAST - 1.2 - j * 1.35, mz + k * 2.2 + 0.55, R);
  }
  landmarks.push({ id: "marina", title: "Marina and fishing port", text: "Boats and the ferry pier. Cargo arrives here on real imports.", x0: X0, x1: COAST, z0: Z0, z1: Z1 });
  // monorail: an elevated loop around the town on white pillars
  const path = monorailPath();
  for (let i = 0; i < 64; i++) {
    const a = path(i / 64), b = path((i + 1) / 64);
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    B.box(L + 0.05, 0.16, 0.36, C(PAL.white), M((a.x + b.x) / 2, 2.25, (a.z + b.z) / 2, Math.atan2(-(b.z - a.z), b.x - a.x)));
    if (i % 2 === 0) B.cyl(0.1, 0.14, 2.2, 6, C(PAL.stone), M(a.x, 1.1, a.z));
  }
}

/** The monorail loop: a rounded rectangle just outside the ring road. Returns position and heading at u in [0, 1). */
function monorailPath() {
  const hw = TOWN_W / 2 + 0.55, hd = TOWN_D / 2 + 0.55, r = 2.5;
  const segs: { len: number; at(t: number): [number, number] }[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => segs.push({ len: Math.hypot(x1 - x0, z1 - z0), at: (t) => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t] });
  line(-hw + r, hd, hw - r, hd);
  segs.push({ len: (Math.PI / 2) * r, at: (t) => { const a = Math.PI / 2 - (t * Math.PI) / 2; return [hw - r + Math.cos(a) * r, hd - r + Math.sin(a) * r]; } });
  line(hw, hd - r, hw, -hd + r);
  segs.push({ len: (Math.PI / 2) * r, at: (t) => { const a = -(t * Math.PI) / 2; return [hw - r + Math.cos(a) * r, -hd + r + Math.sin(a) * r]; } });
  line(hw - r, -hd, -hw + r, -hd);
  segs.push({ len: (Math.PI / 2) * r, at: (t) => { const a = -Math.PI / 2 - (t * Math.PI) / 2; return [-hw + r + Math.cos(a) * r, -hd + r + Math.sin(a) * r]; } });
  line(-hw, -hd + r, -hw, hd - r);
  segs.push({ len: (Math.PI / 2) * r, at: (t) => { const a = Math.PI - (t * Math.PI) / 2; return [-hw + r + Math.cos(a) * r, hd - r + Math.sin(a) * r]; } });
  const total = segs.reduce((s, x) => s + x.len, 0);
  return (u: number) => {
    let d = (((u % 1) + 1) % 1) * total;
    for (const s of segs) {
      if (d <= s.len) {
        const t = d / s.len, [x, z] = s.at(t), [x2, z2] = s.at(Math.min(1, t + 0.01));
        return { x, z, yaw: Math.atan2(-(z2 - z), x2 - x) };
      }
      d -= s.len;
    }
    const [x, z] = segs[0].at(0);
    return { x, z, yaw: 0 };
  };
}

/** Wind turbines: three on the northern hills, three offshore. `y` is the hub height, `base` the foot. */
function turbineSpots() {
  const nz = -TOWN_D / 2 - 8.5;
  return [
    { x: -6, z: nz, y: 4.2, base: 0 }, { x: 3, z: nz - 0.5, y: 4.6, base: 0 }, { x: 12, z: nz, y: 4.2, base: 0 },
    { x: X0 + 3, z: -6, y: 3.8, base: SEA_Y }, { x: X0 + 4.5, z: 2, y: 3.8, base: SEA_Y }, { x: X0 + 3, z: 10, y: 3.8, base: SEA_Y },
  ].map((t) => ({ ...t, x: t.x, z: t.z }));
}

export const WORLD_BOUNDS = { X0, X1, Z0, Z1, COLS, ROWS };
