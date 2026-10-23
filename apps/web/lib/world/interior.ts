// Palasora step 4: "Look inside". A cutaway of a business's floor, built from its records: what kind of business it is,
// its level, how many people work there (the owner plus its staff) and the stock it holds (crates on the shelves). A
// food stall is a kitchen with a counter and tables; a farm a barn with bins and a tool rack; a workshop has benches,
// material stacks and finished tools; a delivery depot has racks of parcels and a van at the loading door; a food factory
// a production line: crops tip from a hopper onto a belt, pass through the cooker and come out as packed meals that are
// stacked for the stalls. The view sways gently and the belt runs (both still for reduced motion); the workers bob at
// their stations.
import * as THREE from "three";
import { Builder, M, createRandom } from "./kit";

export type InteriorSpec = { type: "farm" | "workshop" | "stall" | "delivery" | "factory"; level: number; staff: number; stock: Record<string, number>; reduceMotion?: boolean };

const C = (h: string) => new THREE.Color(h);
const GOOD = { crops: "#7bbf4a", meals: "#e8873a", tools: "#5e7fa8", materials: "#a97c50" } as const;
const APRON = ["#c9724f", "#4f7cac", "#3f9f6f", "#d8a838", "#8a5cb5", "#d9483b"];

export function mountInterior(canvas: HTMLCanvasElement, spec: InteriorSpec) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 7, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  scene.add(sun);

  const B = new Builder();
  const R = createRandom(spec.type.length * 7 + spec.level);
  const W = 4.4, D = 3.2, H = 1.6;
  const floor = { stall: "#d9c3a0", farm: "#b89a6a", workshop: "#9ea4aa", delivery: "#a9adb2", factory: "#c7ccd1" }[spec.type];
  const wall = { stall: "#f4ecdb", farm: "#b8644a", workshop: "#d4c8b1", delivery: "#e3d9c6", factory: "#e9e1d2" }[spec.type];
  B.box(W, 0.12, D, C(floor), M(0, -0.06, 0));
  for (let i = -5; i <= 5; i++) B.box(0.02, 0.005, D, C("#00000010".slice(0, 7)), M(i * 0.4, 0.002, 0)); // floor boards or tiles
  B.box(W, H, 0.1, C(wall), M(0, H / 2, -D / 2)); // back wall
  B.box(0.1, H, D, C(wall), M(-W / 2, H / 2, 0)); // left wall
  B.box(W, 0.06, 0.12, C("#5e6a78"), M(0, H, -D / 2)); B.box(0.12, 0.06, D, C("#5e6a78"), M(-W / 2, H, 0));
  for (const x of [-1.2, 0.2, 1.4]) B.box(0.7, 0.45, 0.02, C("#bfe3ea"), M(x, 1.0, -D / 2 + 0.06)); // windows

  const stations: [number, number][] = [];
  const crates = (good: keyof typeof GOOD, n: number, x0: number, z0: number, cols = 4) => {
    for (let i = 0; i < n; i++) B.box(0.28, 0.2, 0.24, C(GOOD[good]), M(x0 + (i % cols) * 0.32, 0.1 + Math.floor(i / cols) * 0.21, z0));
  };
  const count = (g: string, per: number, max: number) => Math.min(max, Math.ceil((spec.stock[g] ?? 0) / per));

  if (spec.type === "stall") {
    B.box(2.6, 0.5, 0.5, C("#e9e4d8"), M(-0.4, 0.25, -D / 2 + 0.35)); // kitchen counter
    B.box(0.7, 0.52, 0.5, C("#3a4048"), M(-1.4, 0.26, -D / 2 + 0.35)); // stove
    for (const x of [-1.55, -1.25]) B.cyl(0.11, 0.1, 0.16, 10, C("#9aa3ae"), M(x, 0.6, -D / 2 + 0.35));
    for (let i = 0; i < count("meals", 2, 6); i++) B.cyl(0.08, 0.08, 0.02, 10, C(GOOD.meals), M(-0.6 + i * 0.22, 0.52, -D / 2 + 0.38));
    B.box(0.12, 1.0, 0.4, C("#a87b4f"), M(1.6, 0.5, -D / 2 + 0.25)); // shelf
    crates("crops", count("crops", 5, 8), 0.9, -D / 2 + 0.3, 2);
    stations.push([-1.2, -D / 2 + 0.85], [-0.2, -D / 2 + 0.85]);
    for (let t = 0; t < Math.min(4, 2 + spec.level); t++) { // tables and stools for customers
      const x = -1.4 + t * 1.0, z = 0.7;
      B.cyl(0.32, 0.32, 0.04, 14, C("#f4ecdb"), M(x, 0.42, z)); B.cyl(0.04, 0.06, 0.4, 6, C("#5e6a78"), M(x, 0.2, z));
      for (const dx of [-0.42, 0.42]) B.cyl(0.13, 0.13, 0.26, 10, C(R.pick(APRON)), M(x + dx, 0.13, z));
    }
    stations.push([1.2, -0.2], [0.2, 0.0], [-0.8, -0.1]);
  } else if (spec.type === "farm") {
    for (let i = 0; i < 4; i++) B.box(0.5, 0.32, 0.36, C("#e8c36a"), M(-1.7 + (i % 2) * 0.52, 0.16 + Math.floor(i / 2) * 0.33, 0.9)); // hay bales
    B.box(0.08, 1.1, 1.4, C("#8a5a3a"), M(-W / 2 + 0.12, 0.6, -0.4)); // tool rack
    for (let i = 0; i < count("tools", 1, 6); i++) B.box(0.03, 0.7, 0.04, C(GOOD.tools), M(-W / 2 + 0.2, 0.55, -0.95 + i * 0.22));
    for (let b = 0; b < 3; b++) { // crop bins
      const x = 0.0 + b * 0.75;
      B.box(0.6, 0.34, 0.5, C("#8a5a3a"), M(x, 0.17, -D / 2 + 0.4));
      if ((spec.stock.crops ?? 0) > b * 15) B.box(0.54, 0.06, 0.44, C(GOOD.crops), M(x, 0.33, -D / 2 + 0.4));
    }
    B.box(0.9, 0.36, 0.55, C("#c9724f"), M(1.3, 0.3, 0.7)); for (const [dx, dz] of [[-0.3, -0.3], [-0.3, 0.3], [0.3, -0.3], [0.3, 0.3]]) B.cyl(0.13, 0.13, 0.08, 10, C("#3a4048"), M(1.3 + dx, 0.13, 0.7 + dz, 0, Math.PI / 2));
    stations.push([0.4, -D / 2 + 0.95], [-1.4, -0.3], [0.8, 0.3], [-0.6, 0.6]);
  } else if (spec.type === "workshop") {
    for (const x of [-1.2, 0.5]) { // benches with vices
      B.box(1.3, 0.08, 0.55, C("#a87b4f"), M(x, 0.48, -D / 2 + 0.45));
      for (const dx of [-0.58, 0.58]) B.box(0.06, 0.46, 0.5, C("#5e6a78"), M(x + dx, 0.23, -D / 2 + 0.45));
      B.box(0.14, 0.12, 0.14, C("#3a4048"), M(x + 0.45, 0.58, -D / 2 + 0.35));
    }
    crates("materials", count("materials", 2, 8), -1.9, 0.9, 4);
    B.box(0.08, 1.0, 1.2, C("#5e6a78"), M(W / 2 - 0.2, 0.5, -0.2)); // finished tools on the wall rack
    for (let i = 0; i < count("tools", 1, 6); i++) B.box(0.04, 0.5, 0.05, C(GOOD.tools), M(W / 2 - 0.28, 0.6, -0.7 + i * 0.2));
    B.box(0.8, 0.6, 0.5, C("#4f7cac"), M(1.3, 0.3, 0.8)); B.cyl(0.12, 0.12, 0.5, 12, C("#9aa3ae"), M(1.3, 0.75, 0.8, 0, 0, Math.PI / 2)); // lathe
    stations.push([-1.2, -D / 2 + 1.0], [0.5, -D / 2 + 1.0], [1.3, 0.25], [-0.6, 0.4]);
  } else if (spec.type === "factory") {
    // the line runs left to right along the back: hopper, belt, cooker, packing table
    B.box(0.7, 0.5, 0.6, C("#5e6a78"), M(-1.75, 0.55, -0.6)); B.box(0.5, 0.3, 0.4, C("#5e6a78"), M(-1.75, 0.2, -0.6)); // crop hopper
    if ((spec.stock.crops ?? 0) > 0) B.box(0.6, 0.06, 0.5, C(GOOD.crops), M(-1.75, 0.81, -0.6));
    B.box(3.2, 0.06, 0.4, C("#3a4048"), M(0.0, 0.42, -0.6)); // the belt
    for (let x = -1.5; x <= 1.5; x += 0.5) B.box(0.05, 0.4, 0.36, C("#9aa3ae"), M(x, 0.2, -0.6)); // legs
    B.box(0.8, 0.6, 0.6, C("#c0c6cc"), M(0.2, 0.75, -0.6)); B.box(0.6, 0.08, 0.02, C("#e8873a"), M(0.2, 0.85, -0.29)); // cooker, its lamp
    B.cyl(0.07, 0.07, 0.6, 8, C("#9aa3ae"), M(0.4, 1.3, -0.75)); // vent to the roof
    B.box(0.9, 0.08, 0.6, C("#a87b4f"), M(1.75, 0.45, -0.6)); // packing table
    crates("crops", count("crops", 10, 4), -1.9, 0.9, 2);
    const packed = count("meals", 6, 12);
    for (let i = 0; i < packed; i++) B.box(0.22, 0.16, 0.22, C(GOOD.meals), M(0.8 + (i % 4) * 0.26, 0.08 + Math.floor(i / 4) * 0.17, 1.05)); // stacked for the stalls
    stations.push([-1.75, 0.0], [0.2, -0.05], [1.75, -0.05], [1.0, 0.5]);
  } else {
    for (const z of [-D / 2 + 0.35, -0.2]) { // racks of parcels
      B.box(3.0, 0.04, 0.45, C("#5e6a78"), M(-0.3, 0.45, z)); B.box(3.0, 0.04, 0.45, C("#5e6a78"), M(-0.3, 0.9, z));
      for (const x of [-1.75, 1.15]) B.box(0.05, 1.0, 0.45, C("#5e6a78"), M(x, 0.5, z));
      for (let i = 0; i < 7; i++) for (const y of [0.57, 1.02]) if (R.rng() < 0.75) B.box(0.26, 0.18, 0.3, C(R.pick([GOOD.crops, GOOD.tools, GOOD.materials, "#d4c8b1"])), M(-1.5 + i * 0.4, y, z));
    }
    B.box(1.1, 0.5, 0.6, C("#f4f1ea"), M(1.2, 0.35, 1.0)); B.box(0.36, 0.42, 0.58, C("#2f4a63"), M(1.9, 0.3, 1.0)); // van at the door
    for (const [dx, dz] of [[-0.35, -0.3], [-0.35, 0.3], [0.5, -0.3], [0.5, 0.3]]) B.cyl(0.12, 0.12, 0.08, 10, C("#3a4048"), M(1.3 + dx, 0.12, 1.0 + dz, 0, Math.PI / 2));
    stations.push([-1.0, 0.45], [0.3, 0.5], [1.4, 0.3], [-0.2, -0.75]);
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const room = new THREE.Mesh(B.geometry(), mat);
  room.castShadow = room.receiveShadow = true;
  scene.add(room);

  // a factory's belt carries crops in and packed meals out
  const belt = new THREE.Group();
  if (spec.type === "factory") {
    const crop = new THREE.MeshStandardMaterial({ color: GOOD.crops, roughness: 0.8 }), meal = new THREE.MeshStandardMaterial({ color: GOOD.meals, roughness: 0.8 });
    const box = new THREE.BoxGeometry(0.16, 0.1, 0.16);
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(box, crop); m.castShadow = true; m.userData.u = i / 8; belt.add(m); }
    belt.userData.mats = [crop, meal]; belt.userData.geo = box;
    scene.add(belt);
  }
  const runBelt = (t: number) => belt.children.forEach((m) => {
    const u = (m.userData.u + t * 0.08) % 1, x = -1.5 + u * 3.2; // through the cooker at x 0.2 the crops become meals
    m.position.set(x, 0.5, -0.6);
    (m as THREE.Mesh).material = belt.userData.mats[x > 0.2 ? 1 : 0];
  });
  runBelt(0);

  // the people working here: the owner and the staff, each at a station
  const people = new THREE.Group();
  const n = Math.max(1, Math.min(stations.length, 1 + spec.staff));
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 10), new THREE.MeshStandardMaterial({ color: APRON[i % APRON.length], roughness: 0.8 }));
    body.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: ["#7a4a2c", "#5a3622", "#9a6a44"][i % 3], roughness: 0.7 }));
    head.position.y = 0.6;
    body.castShadow = head.castShadow = true;
    g.add(body, head);
    g.position.set(stations[i][0], 0, stations[i][1]);
    people.add(g);
  }
  scene.add(people);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const look = new THREE.Vector3(0, 0.5, 0);
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200, a = w / h, v = 3.4;
    cam.left = (-v * a) / 2; cam.right = (v * a) / 2; cam.top = v / 2; cam.bottom = -v / 2; cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let raf = 0; const t0 = performance.now();
  function frame() {
    const t = (performance.now() - t0) / 1000;
    const yaw = Math.PI / 4 + (spec.reduceMotion ? 0 : 0.18 * Math.sin(t * 0.35));
    cam.position.set(look.x + Math.sin(yaw) * 10, 7.5, look.z + Math.cos(yaw) * 10); cam.lookAt(look);
    if (!spec.reduceMotion) runBelt(t);
    if (!spec.reduceMotion) people.children.forEach((p, i) => { p.position.y = Math.abs(Math.sin(t * 2.2 + i)) * 0.04; p.rotation.y = Math.sin(t * 0.8 + i * 1.7) * 0.6; });
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  }
  frame();
  return {
    people: n,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      room.geometry.dispose(); mat.dispose();
      if (belt.userData.geo) { belt.userData.geo.dispose(); belt.userData.mats.forEach((m: THREE.Material) => m.dispose()); }
      people.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      renderer.dispose();
    },
  };
}
