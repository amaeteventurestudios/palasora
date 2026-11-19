// Palasora build lab: a build tray that people and AI agents share.
// One rule book (canPlace / place / drawRoad / fillArea / remove) runs every placement, whoever asks for it.
// Traffic keeps to the right-hand lane, keeps its distance, gives way at junctions and stops at red lights.
import * as THREE from 'three';

// ---------------------------------------------------------------- setup
const LITE = /[?&]lite\b/.test(location.search) || matchMedia('(pointer:coarse)').matches;
const STILL = /[?&]still\b/.test(location.search);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, powerPreference: 'high-performance', preserveDrawingBuffer: STILL });
let pixelRatio = Math.min(devicePixelRatio || 1, LITE ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const SKY = new THREE.Color('#e9c99a');
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 70, 140);

const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
const hemi = new THREE.HemisphereLight('#fff3dc', '#7a5a3a', 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- grid and land
const N = 44, OI = 22, OJ = 19;           // grid size, town centre
const W = (i) => i - N / 2 + 0.5, Z = (j) => j - N / 2 + 0.5; // tile centre in world
const coastJ = (u) => 35.2 + 2.0 * Math.sin(u * 0.2) + 1.1 * Math.sin(u * 0.53 + 1.3);
const heightAt = (u, v) => { const d = v - coastJ(u); return d < 0 ? 0 : -0.45 * Math.min(1, d / 2.4); };
const cells = [];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const R = Math.random;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const c = coastJ(i + 0.5), kind = j + 1 <= c - 1 ? 'land' : j + 1 <= c ? 'beach' : 'sea';
  cells.push({ i, j, kind, surf: kind === 'beach' ? 'sand' : 'grass', road: null, obj: null, field: null, light: null, tone: rnd() });
}
const cell = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? null : cells[j * N + i]);
const inBuild = (i, j) => i >= 1 && j >= 1 && i < N - 1 && j < N - 1;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N
const isRoad = (i, j) => !!cell(i, j)?.road;
const roadNeighbours = (i, j) => DIRS.map((d, k) => (isRoad(i + d[0], j + d[1]) ? k : -1)).filter((k) => k >= 0);
const isJunction = (i, j) => isRoad(i, j) && roadNeighbours(i, j).length >= 3;

// outer terrain (vertex colours) + sea
{
  const M = 150, S = 1; const g = new THREE.PlaneGeometry(M, M, M, M); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const grassA = new THREE.Color('#a7b65e'), grassB = new THREE.Color('#bdb767'), sand = new THREE.Color('#e7cf98'), wet = new THREE.Color('#c7ae7c');
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k), u = x + N / 2, v = z + N / 2, h = heightAt(u, v), d = v - coastJ(u);
    p.setY(k, h - 0.004);
    const n = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23 - x * 0.11);
    c.copy(grassA).lerp(grassB, n * 0.8);
    if (d > -1.6) c.lerp(sand, Math.min(1, (d + 1.6) / 0.8));
    if (d > 0.4) c.lerp(wet, Math.min(1, (d - 0.4) / 1.2));
    col.set([c.r, c.g, c.b], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true; scene.add(m);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#2e8f9e', transparent: true, opacity: 0.86 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.07; sea.receiveShadow = true; scene.add(sea);
  // a soft foam line along the shore
  const pts = []; for (let u = -60; u <= 104; u += 0.5) pts.push(new THREE.Vector3(u - N / 2, -0.06, coastJ(u) + 0.35 - N / 2));
  const foam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.05, 4), new THREE.MeshBasicMaterial({ color: '#f4efe0', transparent: true, opacity: 0.35 }));
  foam.scale.y = 0.2; scene.add(foam);
}

// the buildable overlay: one canvas texture, one pixel block per tile
const TP = 32;
const ground = document.createElement('canvas'); ground.width = ground.height = N * TP;
const gx = ground.getContext('2d');
const groundTex = new THREE.CanvasTexture(ground); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = 4;
{
  const g = new THREE.PlaneGeometry(N, N, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) p.setY(k, heightAt(p.getX(k) + N / 2, p.getZ(k) + N / 2) + 0.002);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: groundTex, transparent: true }));
  m.receiveShadow = true; m.renderOrder = 1; scene.add(m);
}

const SURF = {
  grass: ['#a8b75f', '#b4ba64'], meadow: ['#9fc06a', '#a9c873'], flowers: ['#a6bd66', '#b3c46e'], sand: ['#e8d29e', '#e3c991'],
  paving: ['#d8cbb6', '#cfc1aa'], gravel: ['#b9b2a6', '#aea79b'], mud: ['#8d6a4a', '#86623f'], rocky: ['#a9a08f', '#9d9483'],
};
const CROPS = {
  maize: { name: 'Maize', a: '#c9c25a', b: '#8f9a3e' }, cassava: { name: 'Cassava', a: '#5e8f43', b: '#7aa553' },
  sorghum: { name: 'Sorghum', a: '#b5703c', b: '#c99a55' }, rice: { name: 'Rice paddy', a: '#7fb86a', b: '#6aa4a0' },
  sunflower: { name: 'Sunflowers', a: '#f2c230', b: '#6f8a3a' }, groundnut: { name: 'Groundnuts', a: '#86a64c', b: '#9c7a4f' },
  yam: { name: 'Yam mounds', a: '#8a6845', b: '#6f9a45' }, cocoa: { name: 'Cocoa grove', a: '#3f7a3c', b: '#557f3a', grove: 1 },
  oilpalm: { name: 'Oil palm grove', a: '#4f8f3d', b: '#6a9a3e', grove: 1 }, orchard: { name: 'Mango orchard', a: '#4d8a3f', b: '#77a24c', grove: 1 },
};
const ROADS = {
  dirt: { name: 'Dirt track', cost: 4, speed: 0.55, w: 0.56, color: '#bd7640', lanes: 2 },
  country: { name: 'Country road', cost: 10, speed: 0.8, w: 0.6, color: '#8b8a85', lanes: 2 },
  city: { name: 'City road', cost: 24, speed: 1, w: 0.66, color: '#4e5058', lanes: 2, kerb: 1 },
  avenue: { name: 'Avenue', cost: 48, speed: 1.15, w: 0.84, color: '#45474f', lanes: 4, kerb: 1 },
};

function drawTileTo(ctx, x0, y0, s, c, nb) {
  const [a, b] = SURF[c.surf] || SURF.grass;
  ctx.fillStyle = a; ctx.fillRect(x0, y0, s, s);
  ctx.globalAlpha = 0.35 + 0.3 * c.tone; ctx.fillStyle = b; ctx.fillRect(x0 + s * 0.1 * c.tone, y0, s * 0.6, s * 0.7); ctx.globalAlpha = 1;
  if (c.surf === 'flowers') { const cl = ['#f06a6a', '#f3c13a', '#ffffff', '#b07ad8']; for (let k = 0; k < 14; k++) { ctx.fillStyle = cl[k % 4]; ctx.fillRect(x0 + ((k * 7.3 + c.tone * 13) % 1) * s, y0 + ((k * 3.7 + c.tone * 5) % 1) * s, 2, 2); } }
  if (c.surf === 'paving') { ctx.strokeStyle = 'rgba(120,100,80,.25)'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x0 + k * s / 4, y0); ctx.lineTo(x0 + k * s / 4, y0 + s); ctx.moveTo(x0, y0 + k * s / 4); ctx.lineTo(x0 + s, y0 + k * s / 4); ctx.stroke(); } }
  if (c.field) {
    const cr = CROPS[c.field]; ctx.fillStyle = cr.b; ctx.fillRect(x0 + 1, y0 + 1, s - 2, s - 2);
    ctx.fillStyle = cr.a;
    if (cr.grove) { for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(x0 + s * (0.2 + 0.3 * q), y0 + s * (0.2 + 0.3 * r), s * 0.11, 0, 7); ctx.fill(); } }
    else for (let r = 0; r < 6; r++) ctx.fillRect(x0 + 2, y0 + 2 + r * (s - 4) / 6, s - 4, (s - 4) / 12);
  }
  if (c.road) {
    const R0 = ROADS[c.road], w = R0.w * s, h = (s - w) / 2, cx = x0 + s / 2, cy = y0 + s / 2;
    const arms = nb || [];
    const rect = (dx, dy, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(dx, dy, ww, hh); };
    const shape = (pad, col) => {
      rect(x0 + h - pad, y0 + h - pad, w + 2 * pad, w + 2 * pad, col);
      for (const k of arms) {
        if (k === 0) rect(cx, y0 + h - pad, s / 2, w + 2 * pad, col);
        if (k === 2) rect(x0, y0 + h - pad, s / 2, w + 2 * pad, col);
        if (k === 1) rect(x0 + h - pad, cy, w + 2 * pad, s / 2, col);
        if (k === 3) rect(x0 + h - pad, y0, w + 2 * pad, s / 2, col);
      }
    };
    if (R0.kerb) shape(s * 0.08, '#d9d2c4');
    shape(0, R0.color);
    if (c.road === 'dirt') { ctx.fillStyle = 'rgba(90,45,20,.25)'; for (const k of arms) { const v = k % 2 === 0; for (const o of [-0.13, 0.13]) v ? rect(k === 0 ? cx : x0, cy + o * s - 1, s / 2, 2, 'rgba(90,45,20,.25)') : rect(cx + o * s - 1, k === 1 ? cy : y0, 2, s / 2, 'rgba(90,45,20,.25)'); } }
    const junction = arms.length >= 3;
    if (c.road !== 'dirt') {
      ctx.fillStyle = c.road === 'avenue' ? '#f2c94c' : c.road === 'country' ? '#f1ead8' : '#f6f1e4';
      for (const k of arms) {
        if (junction) continue;
        const v = k % 2 === 0;
        for (let q = 0; q < 2; q++) {
          const t = 0.06 + q * 0.24;
          if (v) rect(k === 0 ? cx + t * s : cx - (t + 0.12) * s, cy - 1, s * 0.12, 2, ctx.fillStyle);
          else rect(cx - 1, k === 1 ? cy + t * s : cy - (t + 0.12) * s, 2, s * 0.12, ctx.fillStyle);
        }
      }
      if (c.road === 'avenue' && !junction) { // lane dividers
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        for (const k of arms) { const v = k % 2 === 0; for (const o of [-0.21, 0.21]) v ? rect(k === 0 ? cx + 3 : x0 + 3, cy + o * s, s / 2 - 6, 1, ctx.fillStyle) : rect(cx + o * s, k === 1 ? cy + 3 : y0 + 3, 1, s / 2 - 6, ctx.fillStyle); }
      }
      if (junction && R0.kerb) { // zebra crossings on each arm
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (const k of arms) for (let q = 0; q < 5; q++) {
          const o = -w / 2 + (q + 0.25) * w / 5;
          if (k === 0) rect(x0 + s - 6, cy + o, 4, w / 10, ctx.fillStyle);
          if (k === 2) rect(x0 + 2, cy + o, 4, w / 10, ctx.fillStyle);
          if (k === 1) rect(cx + o, y0 + s - 6, w / 10, 4, ctx.fillStyle);
          if (k === 3) rect(cx + o, y0 + 2, w / 10, 4, ctx.fillStyle);
        }
      }
    }
  }
}
let groundDirty = true;
function paint(i, j) {
  const c = cell(i, j); if (!c) return;
  const x0 = i * TP, y0 = j * TP;
  gx.clearRect(x0, y0, TP, TP);
  if (c.kind === 'sea') return;
  if (c.kind === 'beach' && !c.road) { gx.fillStyle = 'rgba(232,210,158,0)'; return; }
  drawTileTo(gx, x0, y0, TP, c, c.road ? roadNeighbours(i, j) : null);
  // fade the outer ring into the open land
  if (!inBuild(i, j)) { gx.globalCompositeOperation = 'destination-out'; gx.fillStyle = 'rgba(0,0,0,.6)'; gx.fillRect(x0, y0, TP, TP); gx.globalCompositeOperation = 'source-over'; }
  groundDirty = true;
}
const paintAround = (i, j) => { paint(i, j); for (const d of DIRS) paint(i + d[0], j + d[1]); };

// ---------------------------------------------------------------- models (merged, vertex-coloured)
const objMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const winMat = new THREE.MeshLambertMaterial({ color: '#2b3550', emissive: '#ffcf6e', emissiveIntensity: 0 });
const tmpC = new THREE.Color();
class Kit {
  constructor() { this.parts = []; this.wins = []; }
  add(geo, color, x = 0, y = 0, z = 0, ry = 0, win = false) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(x, y, z); g.applyMatrix4(m);
    if (!win) { tmpC.set(color); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) a.set([tmpC.r, tmpC.g, tmpC.b], k * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    (win ? this.wins : this.parts).push(g); return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return this.add(g, color, x, y, z, ry); }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); return this.add(g, color, x, y, z); }
  cone(r, h, color, x = 0, y = 0, z = 0, seg = 10) { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return this.add(g, color, x, y, z); }
  ball(r, color, x = 0, y = 0, z = 0, sy = 1) { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, sy, 1); g.translate(0, r * sy, 0); return this.add(g, color, x, y, z); }
  gable(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { // ridge along x
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-w / 2, 0, 0);
    return this.add(g, color, x, y, z, ry);
  }
  win(w, h, x, y, z, face = 0) { const g = new THREE.PlaneGeometry(w, h); g.rotateY(face * Math.PI / 2); g.translate(0, h / 2, 0); return this.add(g, null, x, y, z, 0, true); }
  windows(bw, bd, floors, fh, y0, cols = 2, faces = [0, 1, 2, 3]) {
    for (let f = 0; f < floors; f++) for (const face of faces) for (let q = 0; q < cols; q++) {
      const span = face % 2 === 0 ? bw : bd, o = -span / 2 + (q + 0.5) * span / cols, y = y0 + f * fh + fh * 0.3;
      if (face === 0) this.win(span / cols * 0.45, fh * 0.42, o, y, bd / 2 + 0.003, 0);
      if (face === 2) this.win(span / cols * 0.45, fh * 0.42, o, y, -bd / 2 - 0.003, 2);
      if (face === 1) this.win(span / cols * 0.45, fh * 0.42, bw / 2 + 0.003, y, o, 1);
      if (face === 3) this.win(span / cols * 0.45, fh * 0.42, -bw / 2 - 0.003, y, o, 3);
    }
    return this;
  }
  build() {
    const g = new THREE.Group();
    const merge = (list) => {
      let n = 0; for (const p of list) n += p.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = list[0]?.attributes.color ? new Float32Array(n * 3) : null; let o = 0;
      for (const p of list) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); if (col) col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
      const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m;
    };
    if (this.parts.length) { const m = new THREE.Mesh(merge(this.parts), objMat); m.castShadow = m.receiveShadow = true; g.add(m); }
    if (this.wins.length) { const m = new THREE.Mesh(merge(this.wins), winMat); g.add(m); }
    return g;
  }
}
const pick = (arr, k) => arr[Math.abs(Math.floor(k)) % arr.length];
const WALLS = ['#f1e6d2', '#e7a64a', '#cf6a4c', '#4a5c9a', '#2f8f88', '#df9a86', '#f4d9a8', '#8fb3a8'];
const ROOFS = ['#9aa3a8', '#a5603a', '#7b8a92', '#b6814a'];
const TRUNK = '#7a5636';

function treeKit(k, type, x = 0, z = 0, s = 1) {
  if (type === 'baobab') { k.cyl(0.13 * s, 0.2 * s, 0.55 * s, '#9c8471', x, 0, z, 9); for (let q = 0; q < 5; q++) { const a = q * 1.26; k.box(0.05 * s, 0.05 * s, 0.24 * s, '#8c7663', x + Math.cos(a) * 0.1 * s, 0.55 * s, z + Math.sin(a) * 0.1 * s, a); } k.ball(0.22 * s, '#6f8f3c', x, 0.58 * s, z, 0.45); }
  else if (type === 'acacia') { k.cyl(0.03 * s, 0.045 * s, 0.42 * s, TRUNK, x, 0, z, 6); k.cyl(0.32 * s, 0.26 * s, 0.09 * s, '#6e8d3a', x, 0.42 * s, z, 9); }
  else if (type === 'palm') { k.cyl(0.03 * s, 0.045 * s, 0.62 * s, '#8a6a46', x, 0, z, 6); for (let q = 0; q < 6; q++) { const a = q * 1.05; k.box(0.06 * s, 0.03 * s, 0.32 * s, '#4f8f3d', x + Math.cos(a) * 0.12 * s, 0.6 * s, z + Math.sin(a) * 0.12 * s, -a + Math.PI / 2); } }
  else if (type === 'mango') { k.cyl(0.04 * s, 0.05 * s, 0.22 * s, TRUNK, x, 0, z, 6); k.ball(0.25 * s, '#3f7a3a', x, 0.16 * s, z, 0.9); }
  else if (type === 'neem') { k.cyl(0.03 * s, 0.04 * s, 0.28 * s, TRUNK, x, 0, z, 6); k.ball(0.2 * s, '#5c8f42', x, 0.24 * s, z, 1.1); }
  else if (type === 'flame') { k.cyl(0.03 * s, 0.04 * s, 0.3 * s, TRUNK, x, 0, z, 6); k.ball(0.24 * s, '#e0582f', x, 0.24 * s, z, 0.6); }
  else { k.cyl(0.03 * s, 0.04 * s, 0.25 * s, TRUNK, x, 0, z, 6); k.cone(0.16 * s, 0.5 * s, '#4e7a3c', x, 0.2 * s, z, 7); }
}
function fence(k, w, d, color = '#c9b48a') { const h = 0.08, t = 0.025; k.box(w, h, t, color, 0, 0, -d / 2); k.box(t, h, d, color, -w / 2, 0, 0); k.box(t, h, d, color, w / 2, 0, 0); k.box(w * 0.35, h, t, color, -w * 0.32, 0, d / 2); k.box(w * 0.35, h, t, color, w * 0.32, 0, d / 2); }
function roundHut(k, x, z, r, wall, h = 0.24) { k.cyl(r, r, h, wall, x, 0, z, 12); k.cone(r * 1.28, r * 1.15, '#c9a35a', x, h, z, 12); k.win(0.07, 0.14, x, 0, z + r + 0.003); }
function house(k, w, d, h, wall, roof, x = 0, z = 0, flat = false) {
  k.box(w, h, d, wall, x, 0, z);
  if (flat) { k.box(w + 0.03, 0.04, d + 0.03, '#e9dcc6', x, h, z); }
  else k.gable(w + 0.06, h * 0.55, d + 0.08, roof, x, h, z);
  k.win(0.08, 0.15, x, 0, z + d / 2 + 0.003);
}

// item catalogue ---------------------------------------------------------------
// tool: 'road' (drag line), 'area' (drag rectangle), 'obj' (tap). size in tiles. road: needs a road beside it.
const CAT = [
  { id: 'roads', name: 'Roads', subs: [
    { name: '2 lanes', items: ['dirt', 'country', 'city'] }, { name: '4 lanes', items: ['avenue'] }, { name: 'Signs', items: ['lights'] }] },
  { id: 'nature', name: 'Nature', subs: [
    { name: 'Land', items: ['meadow', 'flowers', 'sand', 'paving', 'gravel', 'mud'] },
    { name: 'Trees', items: ['t_baobab', 't_acacia', 't_mango', 't_palm', 't_neem', 't_flame'] }, { name: 'Water', items: ['pond'] }] },
  { id: 'fields', name: 'Fields', subs: [
    { name: 'Crops', items: ['f_maize', 'f_cassava', 'f_sorghum', 'f_rice', 'f_sunflower', 'f_groundnut', 'f_yam'] },
    { name: 'Groves', items: ['f_cocoa', 'f_oilpalm', 'f_orchard'] }] },
  { id: 'farms', name: 'Farms', subs: [
    { name: 'Animals', items: ['goat', 'chicken', 'pig', 'cow', 'fish', 'croc'] },
    { name: 'Buildings', items: ['farmstead', 'greenhouse', 'silos', 'turbine'] }] },
  { id: 'homes', name: 'Homes', subs: [{ name: 'All homes', items: ['compound', 'bungalow', 'courtyard', 'townhouse', 'apartment', 'villa'] }] },
  { id: 'work', name: 'Shops & work', subs: [
    { name: 'Shops', items: ['market', 'shop', 'barber', 'fuel'] }, { name: 'Services', items: ['clinic', 'school', 'bank', 'techhub'] }] },
  { id: 'leisure', name: 'Leisure', subs: [{ name: 'Leisure', items: ['park', 'pitch', 'beachbar'] }] },
];
const ITEMS = {
  dirt: { tool: 'road', road: 'dirt' }, country: { tool: 'road', road: 'country' }, city: { tool: 'road', road: 'city' }, avenue: { tool: 'road', road: 'avenue' },
  lights: { name: 'Traffic lights', tool: 'lights', cost: 150 },
  meadow: { name: 'Meadow', tool: 'area', surf: 'meadow', cost: 2 }, flowers: { name: 'Wildflowers', tool: 'area', surf: 'flowers', cost: 3 },
  sand: { name: 'Sand', tool: 'area', surf: 'sand', cost: 2 }, paving: { name: 'Paving stones', tool: 'area', surf: 'paving', cost: 6 },
  gravel: { name: 'Gravel', tool: 'area', surf: 'gravel', cost: 2 }, mud: { name: 'Mud', tool: 'area', surf: 'mud', cost: 1 },
  t_baobab: { name: 'Baobab', tree: 'baobab', cost: 20 }, t_acacia: { name: 'Acacia', tree: 'acacia', cost: 12 }, t_mango: { name: 'Mango tree', tree: 'mango', cost: 14 },
  t_palm: { name: 'Palm', tree: 'palm', cost: 12, beach: 1 }, t_neem: { name: 'Neem', tree: 'neem', cost: 10 }, t_flame: { name: 'Flame tree', tree: 'flame', cost: 16 },
  pond: { name: 'Pond', cost: 60, size: 1 },
  goat: { name: 'Goat farm', cost: 140, size: 2, road: 1, income: 10, critter: 'goat', isNew: 1 }, chicken: { name: 'Chicken farm', cost: 110, size: 2, road: 1, income: 9, critter: 'chicken', isNew: 1 },
  pig: { name: 'Pig farm', cost: 130, size: 2, road: 1, income: 10, critter: 'pig', isNew: 1 }, cow: { name: 'Cattle ranch', cost: 180, size: 2, road: 1, income: 13, critter: 'cow' },
  fish: { name: 'Fish farm', cost: 160, size: 2, road: 1, income: 12, isNew: 1 }, croc: { name: 'Crocodile farm', cost: 260, size: 2, road: 1, income: 18, critter: 'croc', isNew: 1 },
  farmstead: { name: 'Farmstead', cost: 160, size: 2, road: 1, income: 8, pop: 4 }, greenhouse: { name: 'Greenhouses', cost: 150, size: 2, road: 1, income: 11 },
  silos: { name: 'Grain silos', cost: 120, size: 1, road: 1, income: 6 }, turbine: { name: 'Wind turbine', cost: 220, size: 1, income: 7 },
  compound: { name: 'Family compound', cost: 90, size: 2, road: 1, pop: 9, income: 6, isNew: 1 }, bungalow: { name: 'Bungalow', cost: 70, size: 1, road: 1, pop: 4, income: 4 },
  courtyard: { name: 'Courtyard house', cost: 120, size: 1, road: 1, pop: 6, income: 6 }, townhouse: { name: 'Townhouse', cost: 140, size: 1, road: 1, pop: 8, income: 7 },
  apartment: { name: 'Apartments', cost: 320, size: 1, road: 1, pop: 30, income: 16 }, villa: { name: 'Villa', cost: 400, size: 2, road: 1, pop: 6, income: 12 },
  market: { name: 'Open market', cost: 220, size: 2, road: 1, income: 18, jobs: 14 }, shop: { name: 'Corner shop', cost: 80, size: 1, road: 1, income: 7, jobs: 3 },
  barber: { name: 'Barber', cost: 60, size: 1, road: 1, income: 5, jobs: 2 }, fuel: { name: 'Fuel station', cost: 200, size: 1, road: 1, income: 12, jobs: 4 },
  clinic: { name: 'Clinic', cost: 300, size: 1, road: 1, income: 10, jobs: 10 }, school: { name: 'School', cost: 380, size: 2, road: 1, income: 6, jobs: 18 },
  bank: { name: 'Bank', cost: 520, size: 1, road: 1, income: 24, jobs: 20 }, techhub: { name: 'Tech hub', cost: 450, size: 1, road: 1, income: 22, jobs: 24 },
  park: { name: 'Pocket park', cost: 40, size: 1 }, pitch: { name: 'Football pitch', cost: 180, size: 2, road: 1, income: 4 }, beachbar: { name: 'Beach bar', cost: 90, size: 1, beach: 1, income: 6 },
};
for (const k of Object.keys(CROPS)) ITEMS['f_' + k] = {};
for (const [id, it] of Object.entries(ITEMS)) {
  it.id = id;
  if (it.tool === 'road') { const r = ROADS[it.road]; it.name = r.name; it.cost = r.cost; }
  if (id.startsWith('f_')) { it.tool = 'area'; it.field = id.slice(2); it.name = CROPS[it.field].name; it.cost = CROPS[it.field].grove ? 16 : 8; }
  if (!it.tool) it.tool = 'obj';
  if (it.tree) it.size = 1;
}

function modelFor(id, rot = 0, v = R()) {
  const it = ITEMS[id], k = new Kit(), s = it.size || 1, half = s / 2;
  const wall = pick(WALLS, v * 8), roof = pick(ROOFS, v * 4);
  switch (id) {
    case 'pond': k.cyl(0.4, 0.4, 0.015, '#3e9aa6', 0, 0, 0, 16); k.cyl(0.43, 0.43, 0.01, '#8a7a55', 0, 0, 0, 16); k.box(0.12, 0.02, 0.12, '#6aa84f', 0.18, 0.015, 0.1); break;
    case 'goat': case 'pig': case 'cow': case 'chicken': case 'croc': {
      fence(k, 1.8, 1.8, id === 'croc' ? '#6b6b5a' : '#c9b48a');
      if (id === 'croc') { k.box(1.0, 0.012, 0.8, '#3d8f84', -0.2, 0, 0.1); k.box(0.5, 0.18, 0.4, '#d9cbb0', 0.55, 0, -0.55); k.box(0.56, 0.05, 0.46, '#7b6b55', 0.55, 0.18, -0.55); }
      else if (id === 'chicken') { k.box(0.8, 0.22, 0.45, '#efe2c8', -0.3, 0, -0.55); k.gable(0.86, 0.16, 0.5, '#a5603a', -0.3, 0.22, -0.55); k.win(0.08, 0.1, -0.3, 0.04, -0.32); }
      else { k.box(0.55, 0.26, 0.45, id === 'pig' ? '#e7c3a8' : '#b55a3c', 0.5, 0, -0.55); k.gable(0.6, 0.2, 0.5, '#7b8a92', 0.5, 0.26, -0.55); k.box(0.3, 0.05, 0.12, '#8fb6c9', -0.4, 0, 0.5); }
      treeKit(k, 'acacia', -0.6, -0.55, 0.8); break; }
    case 'fish': for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) { k.box(0.74, 0.03, 0.74, '#9a8a66', x, 0, z); k.box(0.66, 0.035, 0.66, '#3a8fa0', x, 0.002, z); } k.box(0.3, 0.2, 0.3, '#f1e6d2', 0, 0, 0); k.gable(0.34, 0.12, 0.34, '#7b8a92', 0, 0.2, 0); break;
    case 'farmstead': house(k, 0.7, 0.5, 0.32, '#f1e6d2', '#a5603a', -0.3, 0.2); k.box(0.6, 0.38, 0.5, '#b55a3c', 0.45, 0, -0.4); k.gable(0.64, 0.24, 0.56, '#5d5f63', 0.45, 0.38, -0.4); fence(k, 1.85, 1.85); treeKit(k, 'mango', -0.6, -0.55, 0.9); break;
    case 'greenhouse': for (const z of [-0.45, 0.45]) { k.box(1.6, 0.18, 0.62, '#cfe3dc', 0, 0, z); k.gable(1.6, 0.14, 0.62, '#e3f1ec', 0, 0.18, z); } break;
    case 'silos': for (const x of [-0.18, 0.18]) { k.cyl(0.15, 0.15, 0.6, '#c9ccd0', x, 0, -0.05, 12); k.cone(0.16, 0.12, '#9aa3a8', x, 0.6, -0.05, 12); } k.box(0.5, 0.18, 0.2, '#a5603a', 0, 0, 0.3); break;
    case 'turbine': k.cyl(0.03, 0.05, 1.5, '#eeeeea', 0, 0, 0, 8); k.box(0.07, 0.07, 0.14, '#eeeeea', 0, 1.47, 0.02); break;
    case 'compound': { // a walled family compound with round huts around a yard
      const wl = '#c78a5a'; fence(k, 1.8, 1.8, wl); k.box(1.8, 0.16, 0.06, wl, 0, 0, -0.87); k.box(0.06, 0.16, 1.8, wl, -0.87, 0, 0); k.box(0.06, 0.16, 1.8, wl, 0.87, 0, 0);
      k.box(0.62, 0.16, 0.06, wl, -0.58, 0, 0.87); k.box(0.62, 0.16, 0.06, wl, 0.58, 0, 0.87);
      roundHut(k, -0.5, -0.45, 0.2, '#e0b07a'); roundHut(k, 0.05, -0.55, 0.22, '#d98a5a'); roundHut(k, 0.5, -0.2, 0.19, '#e7c08e');
      house(k, 0.5, 0.36, 0.26, pick(['#e7a64a', '#f1e6d2', '#df9a86'], v * 3), '#9aa3a8', -0.45, 0.35); treeKit(k, 'mango', 0.45, 0.45, 0.8); k.box(0.3, 0.012, 0.3, '#c9a96e', 0.05, 0, 0.15); break; }
    case 'bungalow': house(k, 0.62, 0.48, 0.28, wall, roof, 0, 0.05); k.box(0.2, 0.012, 0.25, '#d8cbb6', 0, 0, 0.38); treeKit(k, 'neem', 0.33, -0.3, 0.6); break;
    case 'courtyard': { const h = 0.34; k.box(0.78, h, 0.24, wall, 0, 0, -0.27); k.box(0.24, h, 0.4, wall, -0.27, 0, 0.1); k.box(0.24, h, 0.4, wall, 0.27, 0, 0.1); k.box(0.82, 0.04, 0.28, '#e9dcc6', 0, h, -0.27); k.box(0.28, 0.04, 0.44, '#e9dcc6', -0.27, h, 0.1); k.box(0.28, 0.04, 0.44, '#e9dcc6', 0.27, h, 0.1); k.windows(0.24, 0.4, 1, h, 0, 1, [0]); k.win(0.08, 0.15, -0.27, 0, 0.303); k.win(0.08, 0.15, 0.27, 0, 0.303); treeKit(k, 'palm', 0, 0.12, 0.55); break; }
    case 'townhouse': { const h = 0.62; for (const [x, c] of [[-0.2, wall], [0.2, pick(WALLS, v * 8 + 3)]]) { k.box(0.38, h, 0.6, c, x, 0, 0); k.box(0.4, 0.05, 0.62, '#e9dcc6', x, h, 0); } k.windows(0.78, 0.6, 2, 0.3, 0.02, 3, [0, 2]); k.box(0.7, 0.03, 0.1, '#5a4636', 0, 0.3, 0.33); break; }
    case 'apartment': { const fl = 5, fh = 0.3, h = fl * fh; k.box(0.74, h, 0.66, pick(['#f1e6d2', '#e9d4b4', '#d8c7ae', '#cfe0dc'], v * 4), 0, 0, 0); k.box(0.78, 0.06, 0.7, '#cbbba3', 0, h, 0); k.box(0.2, 0.14, 0.2, '#9aa3a8', 0.18, h + 0.06, -0.15); for (let f = 1; f < fl; f++) k.box(0.7, 0.025, 0.1, pick(['#cf6a4c', '#2f8f88', '#4a5c9a'], v * 3), 0, f * fh, 0.37); k.windows(0.74, 0.66, fl, fh, 0, 3); break; }
    case 'villa': house(k, 0.9, 0.6, 0.36, '#f4ede0', '#a5603a', -0.3, -0.35, true); k.box(0.5, 0.36, 0.4, '#f4ede0', 0.45, 0, -0.45); k.box(0.54, 0.04, 0.44, '#e9dcc6', 0.45, 0.36, -0.45); k.windows(0.9, 0.6, 1, 0.36, 0, 3, [0]); k.box(0.7, 0.03, 0.42, '#5ec1d0', 0.25, 0, 0.45); k.box(0.78, 0.02, 0.5, '#e9dcc6', 0.25, 0, 0.45); treeKit(k, 'palm', -0.65, 0.5, 0.8); treeKit(k, 'palm', -0.35, 0.65, 0.7); fence(k, 1.85, 1.85, '#e9dcc6'); break;
    case 'market': { const cl = ['#cf6a4c', '#2f8f88', '#e7a64a', '#4a5c9a', '#7a9a3a', '#df9a86']; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { const x = -0.55 + a * 0.55, z = -0.35 + b * 0.7; k.box(0.36, 0.12, 0.3, '#a5835a', x, 0, z); k.box(0.02, 0.26, 0.02, '#6b5a45', x - 0.17, 0, z - 0.14); k.box(0.02, 0.26, 0.02, '#6b5a45', x + 0.17, 0, z + 0.14); k.gable(0.44, 0.1, 0.38, cl[(a * 2 + b + Math.floor(v * 6)) % 6], x, 0.26, z); } k.box(1.8, 0.01, 1.7, '#d4b78a', 0, 0, 0); break; }
    case 'shop': house(k, 0.66, 0.56, 0.36, wall, roof, 0, -0.04, true); k.box(0.66, 0.04, 0.16, pick(['#cf6a4c', '#2f8f88', '#f4b324'], v * 3), 0, 0.26, 0.3); k.windows(0.66, 0.56, 1, 0.36, 0, 2, [0]); break;
    case 'barber': house(k, 0.5, 0.48, 0.32, '#4a5c9a', roof, 0, 0, true); k.cyl(0.03, 0.03, 0.26, '#e2553f', 0.3, 0, 0.28, 8); k.box(0.42, 0.06, 0.02, '#f1e6d2', 0, 0.22, 0.25); break;
    case 'fuel': k.box(0.8, 0.012, 0.8, '#bdb6aa', 0, 0, 0); k.box(0.7, 0.05, 0.5, '#e2553f', 0, 0.36, 0.08); for (const x of [-0.25, 0.25]) { k.box(0.03, 0.36, 0.03, '#eeeeea', x, 0, 0.08); k.box(0.08, 0.14, 0.06, '#f4b324', x, 0, 0.08); } k.box(0.4, 0.22, 0.22, '#f1e6d2', 0, 0, -0.3); break;
    case 'clinic': k.box(0.8, 0.42, 0.62, '#f4f1ea', 0, 0, -0.04); k.box(0.84, 0.04, 0.66, '#d9d2c4', 0, 0.42, -0.04); k.box(0.16, 0.05, 0.05, '#2f9e6a', 0, 0.32, 0.29); k.box(0.05, 0.16, 0.05, '#2f9e6a', 0, 0.26, 0.29); k.windows(0.8, 0.62, 2, 0.21, 0, 3, [0, 1, 3]); break;
    case 'school': k.box(1.5, 0.36, 0.5, '#e7a64a', 0, 0, -0.55); k.gable(1.56, 0.2, 0.58, '#7b8a92', 0, 0.36, -0.55); k.windows(1.5, 0.5, 1, 0.36, 0, 5, [0]); k.box(1.2, 0.012, 0.8, '#bfa77b', 0, 0, 0.35); k.box(0.02, 0.5, 0.02, '#cccccc', -0.7, 0, 0.6); k.box(0.16, 0.1, 0.01, '#2f9e6a', -0.62, 0.42, 0.6); break;
    case 'bank': { const h = 1.25; k.box(0.7, h, 0.62, '#dfe3e6', 0, 0, 0); k.box(0.74, 0.05, 0.66, '#b7c0c6', 0, h, 0); k.box(0.74, 0.16, 0.66, '#2f5f7f', 0, 0, 0); for (let q = 0; q < 4; q++) k.box(0.04, 0.3, 0.04, '#f4f1ea', -0.27 + q * 0.18, 0.16, 0.34); k.windows(0.7, 0.62, 4, 0.27, 0.16, 3); break; }
    case 'techhub': { k.box(0.76, 0.5, 0.66, '#2f8f88', 0, 0, 0); k.box(0.6, 0.5, 0.5, '#e9f0ee', -0.05, 0.5, -0.05); k.box(0.64, 0.04, 0.54, '#9fb7b2', -0.05, 1.0, -0.05); for (let q = 0; q < 3; q++) k.box(0.12, 0.012, 0.2, '#30415e', -0.2 + q * 0.15, 1.04, -0.05); k.windows(0.76, 0.66, 1, 0.5, 0, 3); k.windows(0.6, 0.5, 1, 0.5, 0.5, 3); break; }
    case 'park': k.box(0.92, 0.012, 0.92, '#8fbf5f', 0, 0, 0); k.box(0.12, 0.014, 0.92, '#d8cbb6', 0, 0, 0); treeKit(k, 'flame', -0.25, -0.25, 0.75); treeKit(k, 'neem', 0.27, 0.22, 0.7); k.box(0.2, 0.04, 0.06, '#7a5636', 0.25, 0, -0.25); break;
    case 'pitch': k.box(1.7, 0.012, 1.2, '#5fa84a', 0, 0, 0); k.box(1.6, 0.014, 0.02, '#f1f1e8', 0, 0, 0); k.box(0.02, 0.014, 1.1, '#f1f1e8', 0, 0, 0); for (const x of [-0.8, 0.8]) k.box(0.03, 0.12, 0.3, '#ffffff', x, 0, 0); k.box(1.7, 0.1, 0.08, '#cf6a4c', 0, 0, -0.75); break;
    case 'beachbar': k.box(0.5, 0.22, 0.36, '#c9a35a', 0, 0, -0.1); k.cone(0.42, 0.24, '#d9b56a', 0, 0.22, -0.1, 8); for (const x of [-0.25, 0.25]) { k.cyl(0.015, 0.015, 0.28, '#eeeeea', x, 0, 0.32, 6); k.cone(0.15, 0.06, x < 0 ? '#e2553f' : '#2f8f88', x, 0.27, 0.32, 8); } break;
    default: if (it.tree) treeKit(k, it.tree, 0, 0, 1.1); else k.box(0.6, 0.3, 0.6, wall);
  }
  const g = k.build();
  const inner = new THREE.Group(); inner.add(g); inner.rotation.y = rot * Math.PI / 2;
  const outer = new THREE.Group(); outer.add(inner);
  if (id === 'turbine') { const rot0 = new THREE.Group(); const rk = new Kit(); for (let q = 0; q < 3; q++) rk.add(new THREE.BoxGeometry(0.04, 0.62, 0.015).translate(0, 0.31, 0), '#f6f6f2', 0, 0, 0, 0); const rm = rk.build(); for (let q = 0; q < 3; q++) { const b = rm.clone(); b.rotation.z = q * 2.094; rot0.add(b); } rot0.children.forEach((b, q) => (b.rotation.z = q * 2.094)); rot0.position.set(0, 1.5, 0.1); inner.add(rot0); outer.userData.spin = rot0; }
  return outer;
}

// ---------------------------------------------------------------- the rule book
const objects = new Map(); let nextId = 1;
const town = { coins: 9000, pop: 0, jobs: 0, t: 7 * 60, day: 1 };
const owners = { you: { name: 'You', color: '#f6efe2', coins: 9000 } };
const footprint = (it, i, j) => { const s = it.size || 1, out = []; for (let b = 0; b < s; b++) for (let a = 0; a < s; a++) out.push([i + a, j + b]); return out; };
function sideRoads(it, i, j) { // which sides of the footprint touch a road (for the front door)
  const s = it.size || 1, sides = [];
  const chk = (list) => list.some(([x, y]) => isRoad(x, y));
  const rng = [...Array(s).keys()];
  if (chk(rng.map((a) => [i + a, j + s]))) sides.push(0);       // south → rot 0
  if (chk(rng.map((b) => [i + s, j + b]))) sides.push(1);       // east  → rot 1
  if (chk(rng.map((a) => [i + a, j - 1]))) sides.push(2);       // north → rot 2
  if (chk(rng.map((b) => [i - 1, j + b]))) sides.push(3);       // west  → rot 3
  return sides;
}
function canPlace(id, i, j) {
  const it = ITEMS[id]; if (!it) return { ok: false, why: 'Unknown item' };
  for (const [x, y] of footprint(it, i, j)) {
    const c = cell(x, y);
    if (!c || !inBuild(x, y)) return { ok: false, why: 'Outside the building land' };
    if (c.kind === 'sea') return { ok: false, why: 'That is the sea' };
    if (c.kind === 'beach' && !it.beach) return { ok: false, why: 'Too close to the water' };
    if (c.road) return { ok: false, why: 'A road is there' };
    if (c.obj || c.field) return { ok: false, why: 'Something is already there' };
  }
  if (it.road && !sideRoads(it, i, j).length) return { ok: false, why: 'Needs a road beside it' };
  return { ok: true };
}
const ownerOf = (who) => owners[who] || owners.you;
function pay(who, amount) { const o = ownerOf(who); if (o.coins < amount) return false; o.coins -= amount; if (who === 'you') town.coins = o.coins; return true; }
function place(who, id, i, j, opts = {}) {
  const it = ITEMS[id]; const chk = canPlace(id, i, j); if (!chk.ok) return chk;
  if (!pay(who, it.cost)) return { ok: false, why: 'Not enough coins' };
  const sides = sideRoads(it, i, j); const rot = sides.length ? sides[Math.floor(R() * sides.length)] : Math.floor(R() * 4);
  const m = modelFor(id, it.tree ? Math.floor(R() * 4) : rot);
  const s = it.size || 1; m.position.set(W(i) + (s - 1) / 2, 0, Z(j) + (s - 1) / 2);
  scene.add(m);
  const o = { id: nextId++, item: id, i, j, who, m, born: clock, critters: [] };
  objects.set(o.id, o);
  for (const [x, y] of footprint(it, i, j)) cell(x, y).obj = o.id;
  if (!opts.instant) { m.scale.set(1, 0.01, 1); o.rise = 0; dust(m.position, s); } else o.rise = 1;
  if (it.critter) spawnCritters(o);
  recount(); return { ok: true, obj: o };
}
function drawRoad(who, kind, path) {
  const r = ROADS[kind]; const todo = path.filter(([x, y]) => { const c = cell(x, y); return c && inBuild(x, y) && c.kind === 'land' && !c.obj && !c.field && c.road !== kind; });
  for (const [x, y] of path) { const c = cell(x, y); if (!c || !inBuild(x, y) || c.kind !== 'land' || c.obj || c.field) return { ok: false, why: !c || c.kind !== 'land' ? 'Roads stay on dry land' : 'Something is in the way' }; }
  if (!todo.length) return { ok: false, why: 'Already built' };
  const cost = todo.length * r.cost; if (!pay(who, cost)) return { ok: false, why: 'Not enough coins' };
  for (const [x, y] of todo) { cell(x, y).road = kind; paintAround(x, y); }
  roadsChanged(); return { ok: true, tiles: todo.length, cost };
}
function fillArea(who, id, a, b) {
  const it = ITEMS[id], tiles = rectTiles(a, b).filter(([x, y]) => { const c = cell(x, y); return c && inBuild(x, y) && (c.kind === 'land' || (it.surf === 'sand' && c.kind === 'beach')) && !c.road && !c.obj && (it.field ? !c.field : c.surf !== it.surf); });
  if (!tiles.length) return { ok: false, why: 'Nothing to cover here' };
  const cost = tiles.length * it.cost; if (!pay(who, cost)) return { ok: false, why: 'Not enough coins' };
  for (const [x, y] of tiles) { const c = cell(x, y); if (it.field) { c.field = it.field; c.fieldBy = who; } else c.surf = it.surf; paint(x, y); }
  recount(); return { ok: true, tiles: tiles.length, cost };
}
function setLights(who, i, j) {
  const c = cell(i, j); if (!c || !isJunction(i, j)) return { ok: false, why: 'Lights go on a junction' };
  if (c.light) return { ok: false, why: 'Already has lights' };
  if (!pay(who, ITEMS.lights.cost)) return { ok: false, why: 'Not enough coins' };
  c.light = { off: R() * 10, m: lightModel(i, j) }; return { ok: true };
}
function remove(i, j) {
  const c = cell(i, j); if (!c) return { ok: false };
  if (c.obj) { const o = objects.get(c.obj); const it = ITEMS[o.item]; for (const [x, y] of footprint(it, o.i, o.j)) cell(x, y).obj = null; scene.remove(o.m); o.critters.forEach((k) => critterFree(k)); objects.delete(o.id); ownerOf(o.who).coins += Math.floor(it.cost / 2); if (o.who === 'you') town.coins = owners.you.coins; recount(); return { ok: true }; }
  if (c.light) { scene.remove(c.light.m); c.light = null; return { ok: true }; }
  if (c.road) { c.road = null; paintAround(i, j); roadsChanged(); return { ok: true }; }
  if (c.field) { c.field = null; paint(i, j); recount(); return { ok: true }; }
  if (c.surf !== 'grass' && c.kind === 'land') { c.surf = 'grass'; paint(i, j); return { ok: true }; }
  return { ok: false };
}
function rectTiles(a, b) { const out = []; for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, y]); return out; }
function linePath(a, b) { // L-shaped: along the longer axis first
  const out = [], dx = b[0] - a[0], dy = b[1] - a[1];
  const along = Math.abs(dx) >= Math.abs(dy);
  const corner = along ? [b[0], a[1]] : [a[0], b[1]];
  let x = a[0], y = a[1]; out.push([x, y]);
  while (x !== corner[0] || y !== corner[1]) { x += Math.sign(corner[0] - x); y += Math.sign(corner[1] - y); out.push([x, y]); }
  while (x !== b[0] || y !== b[1]) { x += Math.sign(b[0] - x); y += Math.sign(b[1] - y); out.push([x, y]); }
  return out;
}
function roadsChanged() { // vehicles re-plan their current tile when the roads around them change
  for (const car of cars) { if (!isRoad(car.i, car.j)) continue; const ni = car.i + DIRS[car.dout][0], nj = car.j + DIRS[car.dout][1]; if (!isRoad(ni, nj) && car.s < car.len * 0.5) { car.dout = chooseOut(car.i, car.j, car.din); tilePath(car); } }
  for (const c of cells) if (c.light && !isJunction(c.i, c.j)) { scene.remove(c.light.m); c.light = null; }
}
function recount() {
  let pop = 0, jobs = 0; for (const o of objects.values()) { pop += ITEMS[o.item].pop || 0; jobs += ITEMS[o.item].jobs || 0; }
  town.pop = pop; town.jobs = jobs; uiDirty = true;
}

// traffic lights
const lightGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6).translate(0, 0.17, 0);
const lampGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const poleMat = new THREE.MeshLambertMaterial({ color: '#3a3a40' });
const lampMats = { g: new THREE.MeshBasicMaterial({ color: '#46e07a' }), r: new THREE.MeshBasicMaterial({ color: '#ff4a3a' }), a: new THREE.MeshBasicMaterial({ color: '#ffb52e' }) };
function lightModel(i, j) {
  const g = new THREE.Group(); g.position.set(W(i), 0, Z(j)); g.userData.lamps = [];
  [[0.42, 0.42, 0], [-0.42, -0.42, 0], [0.42, -0.42, 1], [-0.42, 0.42, 1]].forEach(([x, z, axis]) => {
    const p = new THREE.Mesh(lightGeo, poleMat); p.position.set(x, 0, z); p.castShadow = true; g.add(p);
    const l = new THREE.Mesh(lampGeo, lampMats.r); l.position.set(x, 0.36, z); l.userData.axis = axis; g.add(l); g.userData.lamps.push(l);
  });
  scene.add(g); return g;
}
const PHASE = 7; // seconds per green
function lightState(c, axis) { // axis 0 = east-west travel, 1 = north-south
  const t = (simTime + c.light.off) % (PHASE * 2), green = t < PHASE ? 0 : 1, local = t % PHASE;
  if (green !== axis) return 'r';
  return local < PHASE - 1.6 ? 'g' : local < PHASE - 0.6 ? 'a' : 'r';
}

// ---------------------------------------------------------------- dust and construction
const dustGeo = new THREE.IcosahedronGeometry(0.12, 0);
const dustMat = new THREE.MeshLambertMaterial({ color: '#e8d6b4', transparent: true, opacity: 0.8, depthWrite: false });
const puffs = [];
function dust(p, s) { if (REDUCED) return; for (let q = 0; q < 6 + s * 3; q++) { const m = new THREE.Mesh(dustGeo, dustMat.clone()); m.position.set(p.x + (R() - 0.5) * s, 0.05, p.z + (R() - 0.5) * s); m.userData.v = new THREE.Vector3((R() - 0.5) * 0.6, 0.4 + R() * 0.4, (R() - 0.5) * 0.6); m.userData.life = 0; scene.add(m); puffs.push(m); } }

// ---------------------------------------------------------------- vehicles
// Each vehicle drives tile to tile on the right-hand lane. In a tile it follows a short curve from the lane point on the entry edge
// to the lane point on the exit edge. It slows for the vehicle ahead, waits for a free junction, and stops at red lights.
const VTYPES = [
  { k: 'car', len: 0.3, wid: 0.15, h: 0.08, cab: 0.07, v: [1.35, 1.75], w: 40, cols: ['#d94a3a', '#3a6fd9', '#f1f1ec', '#2b2b30', '#9aa3a8', '#2f8f6a', '#e7a64a'] },
  { k: 'taxi', len: 0.3, wid: 0.15, h: 0.08, cab: 0.07, v: [1.45, 1.8], w: 14, cols: ['#f4c021'] },
  { k: 'minibus', len: 0.42, wid: 0.17, h: 0.14, cab: 0, v: [1.2, 1.45], w: 12, cols: ['#f2b01e', '#e9e3d6'] },
  { k: 'bus', len: 0.62, wid: 0.18, h: 0.16, cab: 0, v: [0.95, 1.15], w: 5, cols: ['#2f8f88', '#cf4a3a'] },
  { k: 'truck', len: 0.52, wid: 0.18, h: 0.15, cab: 0, v: [0.85, 1.05], w: 8, cols: ['#4a5c9a', '#7b5a3a', '#e2553f'] },
  { k: 'okada', len: 0.16, wid: 0.06, h: 0.1, cab: 0, v: [1.6, 2.05], w: 14, cols: ['#2b2b30', '#c0392b'] },
];
const MAXV = LITE ? 46 : 80;
const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), MAXV);
const cabMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#30384a' }), MAXV);
const lampMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }), MAXV);
for (const m of [bodyMesh, cabMesh]) { m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
lampMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lampMesh.frustumCulled = bodyMesh.frustumCulled = cabMesh.frustumCulled = false;
bodyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXV * 3), 3);
scene.add(bodyMesh, cabMesh, lampMesh);
const cars = []; const reserve = new Map(); // junction key → car
const key = (i, j) => j * N + i;
const LANE = 0.16, LANE4 = 0.22;
const right = (d) => [-DIRS[d][1], DIRS[d][0]];
function lanePoint(i, j, d, edge, laneOff) { // point on tile edge for travel direction d; edge = -1 entry side, +1 exit side
  const r = right(d), cx = W(i), cz = Z(j);
  return [cx + DIRS[d][0] * 0.5 * edge + r[0] * laneOff, cz + DIRS[d][1] * 0.5 * edge + r[1] * laneOff];
}
function tilePath(car) {
  const c = cell(car.i, car.j); const off = c && c.road === 'avenue' ? (car.fast ? LANE4 * 0.55 : LANE4) : LANE;
  const p0 = lanePoint(car.i, car.j, car.din, -1, off), p2 = lanePoint(car.i, car.j, car.dout, 1, off);
  let p1;
  if (car.din === car.dout) p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  else if ((car.din + 2) % 4 === car.dout) { const f = DIRS[car.din]; p1 = [W(car.i) + f[0] * 0.55, Z(car.j) + f[1] * 0.55]; }
  else { const f = DIRS[car.din]; const t = (p2[0] - p0[0]) * f[0] + (p2[1] - p0[1]) * f[1]; p1 = [p0[0] + f[0] * t, p0[1] + f[1] * t]; }
  let len = 0, px = p0[0], pz = p0[1];
  for (let q = 1; q <= 10; q++) { const t = q / 10, x = bez(p0[0], p1[0], p2[0], t), z = bez(p0[1], p1[1], p2[1], t); len += Math.hypot(x - px, z - pz); px = x; pz = z; }
  car.p0 = p0; car.p1 = p1; car.p2 = p2; car.len = len;
}
const bez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
const dbez = (a, b, c, t) => 2 * (1 - t) * (b - a) + 2 * t * (c - b);
function chooseOut(i, j, din) {
  const opts = roadNeighbours(i, j).filter((k) => k !== (din + 2) % 4);
  if (!opts.length) return (din + 2) % 4;
  if (opts.includes(din) && R() < 0.55) return din;
  return opts[Math.floor(R() * opts.length)];
}
function spawnCar() {
  const roads = cells.filter((c) => c.road && !isJunction(c.i, c.j));
  for (let tries = 0; tries < 12 && roads.length; tries++) {
    const c = roads[Math.floor(R() * roads.length)], nb = roadNeighbours(c.i, c.j); if (!nb.length) continue;
    const d = nb[Math.floor(R() * nb.length)], x = W(c.i), z = Z(c.j);
    if (cars.some((o) => Math.hypot(o.x - x, o.z - z) < 0.9)) continue;
    let tw = 0; const wsum = VTYPES.reduce((s, t) => s + t.w, 0), roll = R() * wsum; let type = VTYPES[0]; for (const t of VTYPES) { tw += t.w; if (roll <= tw) { type = t; break; } }
    if ((type.k === 'bus' || type.k === 'truck') && c.road === 'dirt') type = VTYPES[0];
    const car = { type, i: c.i, j: c.j, din: (d + 2) % 4, dout: d, s: 0.05, v: 0, vmax: type.v[0] + R() * (type.v[1] - type.v[0]), col: new THREE.Color(pick(type.cols, R() * 9)), wait: 0, x, z, hx: 1, hz: 0, alpha: 0, fast: R() < 0.5 };
    car.din = d; // start already heading out along d
    car.dout = chooseOut(c.i, c.j, d);
    tilePath(car); place3(car); cars.push(car); return true;
  }
  return false;
}
function place3(car) {
  const t = Math.min(1, car.s / car.len);
  car.x = bez(car.p0[0], car.p1[0], car.p2[0], t); car.z = bez(car.p0[1], car.p1[1], car.p2[1], t);
  let hx = dbez(car.p0[0], car.p1[0], car.p2[0], t), hz = dbez(car.p0[1], car.p1[1], car.p2[1], t); const l = Math.hypot(hx, hz) || 1; car.hx = hx / l; car.hz = hz / l;
}
function releaseAll(car) { for (const [k, v] of reserve) if (v === car) reserve.delete(k); }
let simTime = 0;
function stepCars(dt) {
  // car following: distance to the nearest vehicle ahead in the same lane
  for (const a of cars) {
    let gap = 9;
    for (const b of cars) {
      if (a === b) continue;
      const rx = b.x - a.x, rz = b.z - a.z; if (Math.abs(rx) > 1.6 || Math.abs(rz) > 1.6) continue;
      const along = rx * a.hx + rz * a.hz; if (along <= 0) continue;
      const lat = Math.abs(rx * a.hz - rz * a.hx); if (lat > 0.15) continue;
      if (a.hx * b.hx + a.hz * b.hz < -0.3) continue; // oncoming
      gap = Math.min(gap, along - (a.type.len + b.type.len) / 2);
    }
    a.gap = gap;
  }
  for (let n = cars.length - 1; n >= 0; n--) {
    const car = cars[n], c = cell(car.i, car.j);
    if (!c || !c.road) { releaseAll(car); cars.splice(n, 1); continue; }
    const rs = ROADS[c.road].speed * car.vmax * (car.type.k === 'okada' && c.road === 'dirt' ? 1.4 : 1);
    let stopAt = 99; // distance to where we must stop
    const ni = car.i + DIRS[car.dout][0], nj = car.j + DIRS[car.dout][1], nc = cell(ni, nj);
    const toEnd = car.len - car.s;
    if (!nc || !nc.road) { if (toEnd < 0.05) { releaseAll(car); cars.splice(n, 1); continue; } }
    else if (isJunction(ni, nj)) {
      const k = key(ni, nj), holder = reserve.get(k);
      let ok = !holder || holder === car;
      if (ok && nc.light && reserve.get(k) !== car) { const st = lightState(nc, car.dout % 2 === 0 ? 0 : 1); if (st !== 'g' && !(st === 'a' && toEnd < 0.12)) ok = false; }
      // don't enter the box unless there is room to leave it
      if (ok && toEnd < 0.6) {
        if (holder !== car) { const out = cars.some((o) => o !== car && Math.abs(o.x - W(ni)) < 0.62 && Math.abs(o.z - Z(nj)) < 0.62 && o.i === ni && o.j === nj); if (out) ok = false; }
        if (ok) reserve.set(k, car);
      }
      if (!ok) stopAt = Math.max(0, toEnd - 0.04);
    }
    const free = Math.min(car.gap - 0.1, stopAt);
    const target = Math.max(0, Math.min(rs, Math.sqrt(Math.max(0, 2 * 3.2 * free))));
    if (car.v < target) car.v = Math.min(target, car.v + 1.4 * dt); else car.v = Math.max(target, car.v - 4.5 * dt);
    if (free <= 0.005) car.v = 0;
    car.wait = car.v < 0.02 ? car.wait + dt : 0;
    car.s += car.v * dt;
    if (car.s >= car.len) {
      if (!nc || !nc.road) { releaseAll(car); cars.splice(n, 1); continue; }
      if (isJunction(car.i, car.j) && reserve.get(key(car.i, car.j)) === car) reserve.delete(key(car.i, car.j));
      car.s -= car.len; car.i = ni; car.j = nj; car.din = car.dout; car.dout = chooseOut(ni, nj, car.din); tilePath(car);
      if (isJunction(ni, nj)) reserve.set(key(ni, nj), car);
    }
    place3(car);
    car.alpha = Math.min(1, car.alpha + dt * 2);
    if (car.wait > 14) { releaseAll(car); cars.splice(n, 1); } // a stuck vehicle quietly turns off the road
  }
  // drop stale reservations (holder gone)
  for (const [k, v] of reserve) if (!cars.includes(v)) reserve.delete(k);
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function drawCars(night) {
  let n = 0;
  for (const car of cars) {
    const T = car.type, ang = Math.atan2(car.hx, car.hz);
    Q.setFromAxisAngle(UP, ang);
    M4.compose(V3.set(car.x, 0.03, car.z), Q, S3.set(T.wid, T.h * car.alpha, T.len)); bodyMesh.setMatrixAt(n, M4); bodyMesh.setColorAt(n, car.col);
    if (T.cab) { M4.compose(V3.set(car.x - car.hx * 0.02, 0.03 + T.h, car.z - car.hz * 0.02), Q, S3.set(T.wid * 0.86, T.cab * car.alpha, T.len * 0.5)); }
    else if (T.k === 'okada') { M4.compose(V3.set(car.x, 0.03 + T.h, car.z), Q, S3.set(0.05, 0.09, 0.05)); }
    else { M4.compose(V3.set(car.x + car.hx * T.len * 0.36, 0.03 + T.h * 0.55, car.z + car.hz * T.len * 0.36), Q, S3.set(T.wid * 1.01, T.h * 0.35, T.len * 0.12)); }
    cabMesh.setMatrixAt(n, M4);
    if (night) { M4.compose(V3.set(car.x + car.hx * (T.len / 2 + 0.22), 0.02, car.z + car.hz * (T.len / 2 + 0.22)), Q, S3.set(T.wid * 1.4, 1, 0.4)); } else M4.makeScale(0, 0, 0);
    lampMesh.setMatrixAt(n, M4);
    n++;
  }
  bodyMesh.count = cabMesh.count = lampMesh.count = n;
  bodyMesh.instanceMatrix.needsUpdate = cabMesh.instanceMatrix.needsUpdate = lampMesh.instanceMatrix.needsUpdate = true;
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- people on the pavements
const MAXP = LITE ? 40 : 70;
const pplMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 6).translate(0, 0.06, 0), new THREE.MeshLambertMaterial(), MAXP);
const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 6, 5).translate(0, 0.15, 0), new THREE.MeshLambertMaterial({ color: '#5a3a26' }), MAXP);
pplMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
pplMesh.castShadow = true; pplMesh.frustumCulled = headMesh.frustumCulled = false; scene.add(pplMesh, headMesh);
const people = []; const CLOTH = ['#e2553f', '#f4b324', '#2f8f88', '#4a5c9a', '#7a9a3a', '#df5a8a', '#f1e6d2', '#8a4fb0'];
function spawnPerson() {
  const roads = cells.filter((c) => c.road && c.road !== 'dirt'); if (!roads.length) return;
  const c = roads[Math.floor(R() * roads.length)], nb = roadNeighbours(c.i, c.j); if (!nb.length) return;
  const d = nb[Math.floor(R() * nb.length)];
  const p = { i: c.i, j: c.j, din: d, dout: d, s: R() * 0.5, side: R() < 0.5 ? 1 : -1, v: 0.22 + R() * 0.14, col: new THREE.Color(pick(CLOTH, R() * 8)), x: 0, z: 0, hx: 0, hz: 1, len: 1 };
  p.dout = chooseOut(c.i, c.j, d); pathPerson(p); people.push(p);
}
function pathPerson(p) {
  const off = 0.44 * p.side, p0 = lanePoint(p.i, p.j, p.din, -1, off), p2 = lanePoint(p.i, p.j, p.dout, 1, off);
  let p1; if (p.din === p.dout) p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  else if ((p.din + 2) % 4 === p.dout) { const f = DIRS[p.din]; p1 = [W(p.i) + f[0] * 0.5, Z(p.j) + f[1] * 0.5]; p.side *= -1; }
  else { const f = DIRS[p.din]; const t = (p2[0] - p0[0]) * f[0] + (p2[1] - p0[1]) * f[1]; p1 = [p0[0] + f[0] * t, p0[1] + f[1] * t]; }
  p.p0 = p0; p.p1 = p1; p.p2 = p2; p.len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
}
function stepPeople(dt) {
  for (let n = people.length - 1; n >= 0; n--) {
    const p = people[n], c = cell(p.i, p.j);
    if (!c || !c.road) { people.splice(n, 1); continue; }
    // wait at the kerb when a vehicle is close
    const near = cars.some((o) => Math.abs(o.x - p.x) < 0.32 && Math.abs(o.z - p.z) < 0.32);
    const crossing = isJunction(p.i, p.j);
    if (!(near && crossing)) p.s += p.v * dt;
    if (p.s >= p.len) { const ni = p.i + DIRS[p.dout][0], nj = p.j + DIRS[p.dout][1]; if (!isRoad(ni, nj)) { p.din = (p.dout + 2) % 4; p.s = 0; p.dout = chooseOut(p.i, p.j, p.din); pathPerson(p); continue; } p.s -= p.len; p.i = ni; p.j = nj; p.din = p.dout; p.dout = chooseOut(ni, nj, p.din); pathPerson(p); }
    const t = Math.min(1, p.s / p.len); p.x = bez(p.p0[0], p.p1[0], p.p2[0], t); p.z = bez(p.p0[1], p.p1[1], p.p2[1], t);
  }
  let n = 0; for (const p of people) { const bob = Math.abs(Math.sin(simTime * 9 + n)) * 0.012; M4.makeTranslation(p.x, 0.005 + bob, p.z); pplMesh.setMatrixAt(n, M4); headMesh.setMatrixAt(n, M4); pplMesh.setColorAt(n, p.col); n++; }
  pplMesh.count = headMesh.count = n; pplMesh.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = true; pplMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- animals
const CRIT = {
  goat: { geo: new THREE.BoxGeometry(0.09, 0.06, 0.13).translate(0, 0.06, 0), cols: ['#f1ece2', '#8a5a3a', '#2b2b2b'], n: 6, v: 0.18 },
  chicken: { geo: new THREE.BoxGeometry(0.04, 0.04, 0.05).translate(0, 0.03, 0), cols: ['#f6f2ea', '#b5703c'], n: 10, v: 0.22 },
  pig: { geo: new THREE.BoxGeometry(0.1, 0.07, 0.15).translate(0, 0.045, 0), cols: ['#efb8a6', '#d99a88'], n: 5, v: 0.12 },
  cow: { geo: new THREE.BoxGeometry(0.12, 0.1, 0.22).translate(0, 0.08, 0), cols: ['#f1ece2', '#6a4a32', '#2b2b2b'], n: 4, v: 0.1 },
  croc: { geo: new THREE.BoxGeometry(0.06, 0.03, 0.26).translate(0, 0.015, 0), cols: ['#4a6a3a', '#5a7a42'], n: 4, v: 0.05 },
};
const critMats = {};
function spawnCritters(o) {
  const c = CRIT[ITEMS[o.item].critter]; if (!c) return;
  for (let q = 0; q < c.n; q++) {
    const col = pick(c.cols, R() * 3); const m = new THREE.Mesh(c.geo, critMats[col] ||= new THREE.MeshLambertMaterial({ color: col }));
    m.castShadow = true; const cx = o.m.position.x, cz = o.m.position.z;
    m.position.set(cx + (R() - 0.3) * 1.2, 0, cz + (R() - 0.2) * 1.0);
    m.userData = { cx, cz, tx: m.position.x, tz: m.position.z, v: c.v * (0.7 + R() * 0.6), rest: R() * 3, croc: o.item === 'croc' };
    scene.add(m); o.critters.push(m);
  }
}
const critterFree = (m) => scene.remove(m);
function stepCritters(dt) {
  for (const o of objects.values()) for (const m of o.critters) {
    const u = m.userData; if (o.rise < 1) { m.visible = false; continue; } m.visible = true;
    if (u.rest > 0) { u.rest -= dt; continue; }
    const dx = u.tx - m.position.x, dz = u.tz - m.position.z, d = Math.hypot(dx, dz);
    if (d < 0.02) { u.rest = 1 + R() * 4; const sp = u.croc ? 0.35 : 0.7; u.tx = u.cx - 0.1 + (R() - 0.5) * 2 * sp; u.tz = u.cz + 0.1 + (R() - 0.5) * 2 * sp; continue; }
    const st = Math.min(d, u.v * dt); m.position.x += dx / d * st; m.position.z += dz / d * st; m.rotation.y = Math.atan2(dx, dz);
  }
}

// boats along the shore
const boats = [];
{
  const k = new Kit(); k.box(0.12, 0.05, 0.5, '#7a4a2a'); k.box(0.1, 0.012, 0.42, '#e7a64a', 0, 0.05, 0); k.box(0.012, 0.3, 0.012, '#eeeeea', 0, 0.05, 0.05);
  const proto = k.build();
  for (let q = 0; q < 4; q++) { const b = proto.clone(); b.userData = { u: 4 + q * 11, dir: q % 2 ? 1 : -1, off: 2.6 + q * 1.4, v: 0.25 + R() * 0.2 }; scene.add(b); boats.push(b); }
}
function stepBoats(dt) { for (const b of boats) { const u = b.userData; u.u += u.dir * u.v * dt; if (u.u > N - 2 || u.u < 2) u.dir *= -1; const z = coastJ(u.u) + u.off - N / 2; b.position.set(u.u - N / 2, -0.06 + Math.sin(simTime * 2 + u.off) * 0.01, z); b.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } }

// ---------------------------------------------------------------- AI agents
// Each agent reads the town, picks a move, and calls the same rule book a person does. Nothing is placed any other way.
const AGENTS = [
  { id: 'amara', name: 'Amara', role: 'Road planner', color: '#f4b324', coins: 3600 },
  { id: 'kofi', name: 'Kofi', role: 'Farmer', color: '#7fd18b', coins: 2600 },
  { id: 'zainab', name: 'Zainab', role: 'Home builder', color: '#ff9a7a', coins: 3000 },
  { id: 'tunde', name: 'Tunde', role: 'Shopkeeper', color: '#8fb6ff', coins: 2800 },
];
for (const a of AGENTS) { owners[a.id] = a; a.next = 1.5 + R() * 3; a.last = 'Getting ready'; }
let agentsOn = true;
const STREETS = ['Palm', 'Harbour', 'Kola', 'Baobab', 'Lagoon', 'Sunrise', 'Indigo', 'Coral', 'Mango', 'Acacia', 'Savanna', 'Market', 'Cowrie', 'Unity'];
const streetName = (i, j) => { const ew = isRoad(i - 1, j) || isRoad(i + 1, j); return ew ? `${STREETS[j % STREETS.length]} Street` : `${STREETS[(i * 3) % STREETS.length]} Avenue`; };
const distC = (i, j) => Math.hypot(i - OI, (j - OJ) * 1.1);
const onGridI = (i) => (((i - OI) % 5) + 5) % 5 === 0, onGridJ = (j) => (((j - OJ) % 5) + 5) % 5 === 0;
const roadKindFor = (i, j) => (distC(i, j) < 8 ? 'city' : distC(i, j) < 14 ? 'country' : 'dirt');
function freeLand(x, y) { const c = cell(x, y); return c && inBuild(x, y) && c.kind === 'land' && !c.road && !c.obj && !c.field; }
function weightedPick(list, score) { if (!list.length) return null; let best = null, bs = -1e9; for (const x of list) { const s = score(x) + R() * 3; if (s > bs) { bs = s; best = x; } } return best; }
function roadSideSpots(size, filter) {
  const out = []; for (const c of cells) { if (!freeLand(c.i, c.j)) continue; if (filter && !filter(c.i, c.j)) continue; for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) { const i = c.i - a, j = c.j - b; out.push([i, j]); } }
  return out;
}
const AI = {
  amara(a) {
    // 1) extend the street grid from its frontier, 2) upgrade busy dirt, 3) add lights to a busy city junction
    if (R() < 0.12) { // lights
      const js = cells.filter((c) => c.road === 'city' && isJunction(c.i, c.j) && roadNeighbours(c.i, c.j).length === 4 && !c.light);
      const c = weightedPick(js, (c) => -distC(c.i, c.j)); if (c) { const r = setLights(a.id, c.i, c.j); if (r.ok) return { at: [c.i, c.j], text: `put up traffic lights on ${streetName(c.i, c.j)}`, cost: ITEMS.lights.cost }; }
    }
    if (R() < 0.18) { // upgrade
      const cand = cells.filter((c) => (c.road === 'dirt' || c.road === 'country') && distC(c.i, c.j) < (c.road === 'dirt' ? 14 : 8));
      const c = weightedPick(cand, (c) => -distC(c.i, c.j)); if (c) {
        const kind = c.road === 'dirt' ? 'country' : 'city'; const horiz = isRoad(c.i - 1, c.j) || isRoad(c.i + 1, c.j);
        const path = []; for (let q = -2; q <= 2; q++) { const x = horiz ? c.i + q : c.i, y = horiz ? c.j : c.j + q; if (cell(x, y)?.road === c.road) path.push([x, y]); }
        const r = drawRoad(a.id, kind, path); if (r.ok) return { at: [c.i, c.j], text: `upgraded ${streetName(c.i, c.j)} to a ${ROADS[kind].name.toLowerCase()}`, cost: r.cost };
      }
    }
    const fronts = [];
    for (const c of cells) {
      if (!c.road) continue;
      for (let d = 0; d < 4; d++) {
        const along = d % 2 === 0 ? onGridJ(c.j) : onGridI(c.i); if (!along) continue;
        const x = c.i + DIRS[d][0], y = c.j + DIRS[d][1]; if (!freeLand(x, y)) continue;
        fronts.push({ c, d });
      }
    }
    const f = weightedPick(fronts, (f) => -distC(f.c.i, f.c.j) * 0.9);
    if (!f) return null;
    const path = []; let x = f.c.i, y = f.c.j;
    for (let q = 0; q < 5; q++) { x += DIRS[f.d][0]; y += DIRS[f.d][1]; if (!freeLand(x, y) && !isRoad(x, y)) break; path.push([x, y]); if (isRoad(x, y)) break; }
    if (!path.length) return null;
    const kind = roadKindFor(path[path.length - 1][0], path[path.length - 1][1]);
    const r = drawRoad(a.id, kind, path.filter(([x, y]) => !isRoad(x, y)));
    if (!r.ok) return null;
    const [ex, ey] = path[Math.floor(path.length / 2)];
    return { at: [ex, ey], text: `laid a ${ROADS[kind].name.toLowerCase()} on ${streetName(ex, ey)}`, cost: r.cost };
  },
  kofi(a) {
    const roll = R();
    if (roll < 0.5) {
      const ids = ['goat', 'chicken', 'pig', 'cow', 'fish', 'croc', 'farmstead', 'greenhouse', 'silos'];
      const id = pick(ids, R() * ids.length);
      const spots = roadSideSpots(2, (i, j) => distC(i, j) > 9).filter(([i, j]) => canPlace(id, i, j).ok);
      const s = weightedPick(spots, ([i, j]) => -Math.abs(distC(i, j) - 12) * 0.6); if (s) { const r = place(a.id, id, s[0], s[1]); if (r.ok) return { at: [s[0] + 0.5, s[1] + 0.5], text: `started a ${ITEMS[id].name.toLowerCase()}`, cost: ITEMS[id].cost }; }
    }
    if (roll < 0.85) {
      const crops = Object.keys(CROPS); const crop = pick(crops, R() * crops.length);
      const cand = cells.filter((c) => freeLand(c.i, c.j) && distC(c.i, c.j) > 10 && distC(c.i, c.j) < 19);
      const c = weightedPick(cand, (c) => -distC(c.i, c.j) * 0.3 + (cells.some((d) => d.field && Math.abs(d.i - c.i) + Math.abs(d.j - c.j) === 1) ? 2 : 0));
      if (c) { const w = 1 + Math.floor(R() * 3), h = 1 + Math.floor(R() * 2); const r = fillArea(a.id, 'f_' + crop, [c.i, c.j], [c.i + w, c.j + h]); if (r.ok) return { at: [c.i + w / 2, c.j + h / 2], text: `planted ${CROPS[crop].name.toLowerCase()}`, cost: r.cost }; }
    }
    const trees = ['t_baobab', 't_acacia', 't_mango', 't_neem', 't_flame'], id = pick(trees, R() * 5);
    const cand = cells.filter((c) => freeLand(c.i, c.j) && distC(c.i, c.j) > 6 && !onGridI(c.i) && !onGridJ(c.j));
    const c = weightedPick(cand, (c) => -Math.abs(distC(c.i, c.j) - 10)); if (c) { const r = place(a.id, id, c.i, c.j); if (r.ok) return { at: [c.i, c.j], text: `planted a ${ITEMS[id].name.toLowerCase()}`, cost: ITEMS[id].cost }; }
    return null;
  },
  zainab(a) {
    const dist = (i, j) => distC(i, j);
    const choices = [['apartment', 0, 6], ['townhouse', 0, 9], ['courtyard', 3, 12], ['bungalow', 5, 15], ['compound', 5, 15], ['villa', 8, 16]];
    const [id, lo, hi] = pick(choices, R() * choices.length);
    const it = ITEMS[id];
    const spots = roadSideSpots(it.size, (i, j) => dist(i, j) >= lo && dist(i, j) < hi).filter(([i, j]) => canPlace(id, i, j).ok);
    const s = weightedPick(spots, ([i, j]) => -dist(i, j) * 0.5); if (!s) return null;
    const r = place(a.id, id, s[0], s[1]); if (!r.ok) return null;
    return { at: [s[0] + (it.size - 1) / 2, s[1] + (it.size - 1) / 2], text: `built ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name.toLowerCase()} on ${streetName(...nearRoad(s[0], s[1]))}`, cost: it.cost };
  },
  tunde(a) {
    const choices = ['shop', 'shop', 'barber', 'market', 'fuel', 'clinic', 'bank', 'techhub', 'school', 'park', 'pitch'];
    const id = pick(choices, R() * choices.length), it = ITEMS[id];
    if (id === 'bank' || id === 'techhub') { if (town.pop < 120) return null; }
    const spots = roadSideSpots(it.size, (i, j) => distC(i, j) < 11).filter(([i, j]) => canPlace(id, i, j).ok);
    const s = weightedPick(spots, ([i, j]) => -distC(i, j) * 0.7 + (isJunction(...nearRoad(i, j)) ? 1.5 : 0)); if (!s) return null;
    const r = place(a.id, id, s[0], s[1]); if (!r.ok) return null;
    return { at: [s[0] + (it.size - 1) / 2, s[1] + (it.size - 1) / 2], text: `opened ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name.toLowerCase()}`, cost: it.cost };
  },
};
function nearRoad(i, j) { for (const d of DIRS) if (isRoad(i + d[0], j + d[1])) return [i + d[0], j + d[1]]; for (const d of [[2, 0], [0, 2], [-1, 1], [1, -1], [2, 1], [1, 2]]) if (isRoad(i + d[0], j + d[1])) return [i + d[0], j + d[1]]; return [i, j]; }
function stepAgents(dt) {
  if (!agentsOn) return;
  for (const a of AGENTS) {
    a.next -= dt; if (a.next > 0) continue;
    a.next = 2.6 + R() * 3.4;
    let res = null; try { res = AI[a.id](a); } catch (e) { console.warn(e); }
    if (res) { a.last = res.text; tag(a, res.at, res.text); log(a, res.text, res.cost); }
    else if (a.coins < 60) a.last = 'Saving up';
  }
}

// ---------------------------------------------------------------- economy tick
let lastHour = Math.floor(town.t / 60);
function econ() {
  const h = Math.floor(town.t / 60); if (h === lastHour) return; lastHour = h;
  for (const o of objects.values()) { const inc = ITEMS[o.item].income || 0; if (inc) ownerOf(o.who).coins += inc; }
  for (const c of cells) if (c.field && c.fieldBy) ownerOf(c.fieldBy).coins += 1;
  town.coins = owners.you.coins; uiDirty = true;
}

// ---------------------------------------------------------------- starting town
function seedTown() {
  const path = (a, b, k) => drawRoad('seed', k, linePath(a, b));
  owners.seed = { coins: 1e9 };
  path([OI - 10, OJ], [OI + 10, OJ], 'city'); path([OI, OJ - 5], [OI, OJ + 10], 'city');
  path([OI - 5, OJ], [OI - 5, OJ + 5], 'city'); path([OI + 5, OJ], [OI + 5, OJ + 5], 'city'); path([OI - 5, OJ + 5], [OI + 5, OJ + 5], 'city');
  path([OI - 20, OJ], [OI - 11, OJ], 'dirt'); path([OI + 11, OJ], [OI + 20, OJ], 'country'); path([OI, OJ - 6], [OI, OJ - 17], 'dirt');
  const put = (id, i, j) => place('seed', id, i, j, { instant: true });
  put('market', OI + 1, OJ + 1); put('compound', OI - 4, OJ + 1); put('courtyard', OI - 1, OJ + 1); put('apartment', OI + 1, OJ - 1); put('shop', OI - 1, OJ - 1);
  put('townhouse', OI + 4, OJ - 1); put('bungalow', OI - 4, OJ - 1); put('compound', OI + 3, OJ + 3); put('clinic', OI - 1, OJ + 4); put('courtyard', OI + 4, OJ + 1);
  put('goat', OI - 9, OJ + 1); put('farmstead', OI + 12, OJ - 2);
  setLights('seed', OI, OJ);
  for (let q = 0; q < 70; q++) { const i = 2 + Math.floor(rnd() * (N - 4)), j = 2 + Math.floor(rnd() * (N - 4)); if (distC(i, j) > 7 && freeLand(i, j) && !onGridI(i) && !onGridJ(j)) put(pick(['t_baobab', 't_acacia', 't_acacia', 't_neem', 't_mango'], rnd() * 5), i, j); }
  for (let q = 0; q < 14; q++) { const u = 2 + Math.floor(rnd() * (N - 4)); const j = Math.floor(coastJ(u + 0.5)) - 1; if (cell(u, j)?.kind === 'beach' && !cell(u, j).obj) put('t_palm', u, j); }
  fillArea('seed', 'f_maize', [OI - 14, OJ + 2], [OI - 12, OJ + 3]); fillArea('seed', 'f_cassava', [OI + 13, OJ + 2], [OI + 15, OJ + 3]);
  fillArea('seed', 'flowers', [OI - 1, OJ - 4], [OI - 1, OJ - 3]);
  owners.seed.coins = 0;
  for (const o of objects.values()) o.who = 'seed';
}

// ---------------------------------------------------------------- camera
const cam = { tx: 0, tz: 1.2, az: Math.PI / 4, azTarget: Math.PI / 4, zoom: 1, view: 26 };
function fitView() {
  const w = innerWidth, h = innerHeight, asp = w / h;
  // keep about 22 tiles across on portrait phones and 34 on wide screens
  cam.view = asp < 1 ? Math.max(18, 15 / asp) : h < 480 ? 15 : Math.max(16, Math.min(28, 34 / asp));
  renderer.setSize(w, h, false);
}
function updateCamera() {
  const v = cam.view / cam.zoom, asp = innerWidth / innerHeight;
  // centre the town in the space left between the top bar and the tray
  const tb = document.getElementById('top')?.getBoundingClientRect(), tr = document.getElementById('tray')?.getBoundingClientRect();
  const freeMid = tb && tr ? (tb.bottom + tr.top) / 2 : innerHeight / 2, sh = (innerHeight / 2 - freeMid) * v / innerHeight;
  camera.left = -v * asp / 2; camera.right = v * asp / 2; camera.top = v / 2 - sh; camera.bottom = -v / 2 - sh;
  const el = 0.66, d = 80; // elevation
  camera.position.set(cam.tx + Math.sin(cam.az) * Math.cos(el) * d, Math.sin(el) * d, cam.tz + Math.cos(cam.az) * Math.cos(el) * d);
  camera.lookAt(cam.tx, 0, cam.tz); camera.updateProjectionMatrix();
}
addEventListener('resize', () => { fitView(); updateCamera(); updateTrayArrows(); placeHint(); });

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function tileAt(cx, cy) { ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(plane, hit)) return null; return [Math.floor(hit.x + N / 2), Math.floor(hit.z + N / 2), hit.x, hit.z]; }
let mode = 'look', selected = null; const pointers = new Map(); let drag = null;
const ghostMat = new THREE.MeshLambertMaterial({ color: '#f4b324', transparent: true, opacity: 0.55, emissive: '#7a5200', depthWrite: false });
const badMat = new THREE.MeshLambertMaterial({ color: '#e2553f', transparent: true, opacity: 0.55, emissive: '#5a0d00', depthWrite: false });
let ghost = null; const ghostTiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f4b324', transparent: true, opacity: 0.45, depthWrite: false }), 400);
ghostTiles.count = 0; ghostTiles.renderOrder = 3; ghostTiles.frustumCulled = false; scene.add(ghostTiles);
ghostTiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
const priceEl = document.getElementById('price');
function showPrice(x, y, text, bad) { priceEl.style.display = 'block'; priceEl.textContent = text; priceEl.classList.toggle('bad', !!bad); priceEl.style.left = Math.min(innerWidth - priceEl.offsetWidth - 20, x) + 'px'; priceEl.style.top = Math.max(60, y) + 'px'; }
const hidePrice = () => (priceEl.style.display = 'none');
function setGhost(id) {
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (!id || ITEMS[id].tool !== 'obj') return;
  ghost = modelFor(id, 0, 0.3); ghost.traverse((m) => { if (m.isMesh) { m.material = ghostMat; m.castShadow = false; } }); ghost.visible = false; scene.add(ghost);
}
function previewAt(cx, cy) {
  const t = tileAt(cx, cy); ghostTiles.count = 0; if (ghost) ghost.visible = false;
  if (!t || !selected) { hidePrice(); return; }
  const it = ITEMS[selected];
  if (it.tool === 'obj') {
    const s = it.size || 1, i = t[0] - (s > 1 ? Math.round(t[2] + N / 2 - t[0] - 0.5 < 0 ? 1 : 0) : 0), j = t[1] - (s > 1 ? Math.round(t[3] + N / 2 - t[1] - 0.5 < 0 ? 1 : 0) : 0);
    const ok = canPlace(selected, i, j); const sides = sideRoads(it, i, j);
    ghost.visible = true; ghost.position.set(W(i) + (s - 1) / 2, 0.01, Z(j) + (s - 1) / 2); ghost.children[0].rotation.y = (sides[0] ?? 0) * Math.PI / 2;
    const afford = owners.you.coins >= it.cost;
    ghost.traverse((m) => { if (m.isMesh) m.material = ok.ok && afford ? ghostMat : badMat; });
    showPrice(cx, cy, ok.ok ? (afford ? `${it.name} · ${it.cost}` : 'Not enough coins') : ok.why, !(ok.ok && afford));
    return [i, j, ok.ok && afford];
  }
  if (it.tool === 'lights') { const ok = isJunction(t[0], t[1]) && !cell(t[0], t[1]).light; tileMarks([[t[0], t[1]]], ok); showPrice(cx, cy, ok ? `Traffic lights · ${it.cost}` : 'Lights go on a junction', !ok); return [t[0], t[1], ok]; }
  tileMarks([[t[0], t[1]]], true); showPrice(cx, cy, `${it.name} · ${it.cost} per tile`); return [t[0], t[1], true];
}
function tileMarks(list, ok) { const c = new THREE.Color(ok ? '#f4b324' : '#e2553f'); let n = 0; for (const [x, y] of list.slice(0, 400)) { if (!cell(x, y)) continue; M4.makeTranslation(W(x), 0.03 + Math.max(0, heightAt(x + 0.5, y + 0.5)), Z(y)); ghostTiles.setMatrixAt(n, M4); ghostTiles.setColorAt(n, c); n++; } ghostTiles.count = n; ghostTiles.instanceMatrix.needsUpdate = true; ghostTiles.instanceColor.needsUpdate = true; }
function dragPreview(a, b) {
  const it = ITEMS[selected];
  if (it.tool === 'road') { const p = linePath(a, b); const ok = p.every(([x, y]) => { const c = cell(x, y); return c && inBuild(x, y) && c.kind === 'land' && !c.obj && !c.field; }); const n = p.filter(([x, y]) => cell(x, y)?.road !== it.road).length; tileMarks(p, ok && owners.you.coins >= n * it.cost); return { ok, n, cost: n * it.cost, label: `${it.name} · ${n} tiles · ${n * it.cost}` }; }
  const p = rectTiles(a, b); tileMarks(p, true); return { ok: true, n: p.length, cost: p.length * it.cost, label: `${it.name} · ${p.length} tiles · ${p.length * it.cost}` };
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [p, q] = [...pointers.values()]; drag = { pinch: Math.hypot(p.x - q.x, p.y - q.y), zoom0: cam.zoom }; ghostTiles.count = 0; return; }
  const t = tileAt(e.clientX, e.clientY);
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, start: t, pan: mode === 'look' || (selected && ITEMS[selected].tool === 'obj') || (selected && ITEMS[selected].tool === 'lights') };
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag && drag.pinch && pointers.size === 2) { const [p, q] = [...pointers.values()]; cam.zoom = THREE.MathUtils.clamp(drag.zoom0 * Math.hypot(p.x - q.x, p.y - q.y) / drag.pinch, 0.55, 3); updateCamera(); return; }
  if (drag && !drag.pinch) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) drag.moved = true;
    if (drag.pan || mode === 'remove' && e.pointerType !== 'mouse') {
      if (drag.moved) { const k = (cam.view / cam.zoom) / innerHeight; const ca = Math.cos(cam.az), sa = Math.sin(cam.az); cam.tx -= (dx * ca + dy * sa / Math.sin(0.66)) * k; cam.tz -= (-dx * sa + dy * ca / Math.sin(0.66)) * k; cam.tx = THREE.MathUtils.clamp(cam.tx, -N / 2, N / 2); cam.tz = THREE.MathUtils.clamp(cam.tz, -N / 2, N / 2); updateCamera(); hidePrice(); if (ghost) ghost.visible = false; }
      drag.x = e.clientX; drag.y = e.clientY; return;
    }
    if (selected && drag.start) { const t = tileAt(e.clientX, e.clientY); if (t) { const r = dragPreview(drag.start, t); showPrice(e.clientX, e.clientY, r.label, !r.ok); } }
    return;
  }
  if (e.pointerType === 'mouse' && selected && mode === 'build') previewAt(e.clientX, e.clientY);
  if (e.pointerType === 'mouse' && mode === 'remove') { const t = tileAt(e.clientX, e.clientY); if (t) { tileMarks([[t[0], t[1]]], false); showPrice(e.clientX, e.clientY, 'Remove'); } }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return; const d = drag; if (d.pinch) { if (!pointers.size) drag = null; return; } drag = null;
  const t = tileAt(e.clientX, e.clientY);
  if (mode === 'remove') { if (!d.moved && t) { const r = remove(t[0], t[1]); if (r.ok) toast('Removed'); } ghostTiles.count = 0; hidePrice(); return; }
  if (mode !== 'build' || !selected || !t) { return; }
  const it = ITEMS[selected];
  if (it.tool === 'obj' || it.tool === 'lights') {
    if (d.moved) return;
    const p = previewAt(e.clientX, e.clientY); if (!p) return;
    const r = it.tool === 'lights' ? setLights('you', p[0], p[1]) : place('you', selected, p[0], p[1]);
    if (r.ok) { log(owners.you, it.tool === 'lights' ? 'put up traffic lights' : `built ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name.toLowerCase()}`, it.cost); } else toast(r.why);
    if (e.pointerType !== 'mouse') { setTimeout(() => { if (ghost) ghost.visible = false; hidePrice(); }, 900); }
    return;
  }
  if (!d.start) return;
  const r = it.tool === 'road' ? drawRoad('you', it.road, linePath(d.start, [t[0], t[1]])) : fillArea('you', selected, d.start, [t[0], t[1]]);
  ghostTiles.count = 0; hidePrice();
  if (r.ok) log(owners.you, it.tool === 'road' ? `laid ${r.tiles} tiles of ${it.name.toLowerCase()}` : it.field ? `planted ${it.name.toLowerCase()}` : `laid ${it.name.toLowerCase()}`, r.cost); else toast(r.why);
}
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) { hidePrice(); if (ghost) ghost.visible = false; ghostTiles.count = 0; } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.55, 3); updateCamera(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); const t = tileAt(e.clientX, e.clientY); if (t && remove(t[0], t[1]).ok) toast('Removed'); });

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
let uiDirty = true;
const icons = {};
function makeIcons() {
  const size = 160, rt = new THREE.WebGLRenderTarget(size, size * 0.75); const sc2 = new THREE.Scene(); sc2.add(new THREE.HemisphereLight('#fff6e6', '#8a6a4a', 1.6)); const dl = new THREE.DirectionalLight('#ffffff', 2.2); dl.position.set(3, 5, 4); sc2.add(dl);
  const c2 = new THREE.OrthographicCamera(-1, 1, 0.75, -0.75, -20, 20); c2.position.set(2, 1.7, 2); c2.lookAt(0, 0.2, 0);
  const buf = new Uint8Array(size * size * 0.75 * 4), cv = document.createElement('canvas'); cv.width = size; cv.height = size * 0.75; const cx = cv.getContext('2d'); const img = cx.createImageData(size, size * 0.75);
  const prevTone = renderer.toneMapping;
  for (const [id, it] of Object.entries(ITEMS)) {
    let obj;
    if (it.tool === 'obj') { obj = modelFor(id, 0, 0.35); const s = it.size || 1; const h = id === 'turbine' ? 2.2 : id === 'apartment' || id === 'bank' ? 1.6 : 1; obj.scale.setScalar(1.25 / Math.max(s, h)); obj.position.y = -0.25; }
    else { // a tile swatch drawn with the same painter as the ground
      const cvs = document.createElement('canvas'); cvs.width = cvs.height = 64; const g = cvs.getContext('2d');
      const fake = { surf: it.surf || 'grass', field: it.field || null, road: it.road || (it.tool === 'lights' ? 'city' : null), tone: 0.4 };
      drawTileTo(g, 0, 0, 64, fake, it.road || it.tool === 'lights' ? (it.tool === 'lights' ? [0, 1, 2, 3] : [0, 2]) : null);
      const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace;
      obj = new THREE.Group(); const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1), [new THREE.MeshLambertMaterial({ color: '#b08a5e' }), new THREE.MeshLambertMaterial({ color: '#b08a5e' }), new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ color: '#b08a5e' }), new THREE.MeshLambertMaterial({ color: '#b08a5e' }), new THREE.MeshLambertMaterial({ color: '#b08a5e' })]);
      obj.add(slab); obj.position.y = -0.1; if (it.tool === 'lights') { const l = lightModel(0, 0); scene.remove(l); l.position.set(0, 0.06, 0); l.scale.setScalar(1.3); l.children.forEach((m) => { if (m.userData.axis !== undefined) m.material = lampMats.g; }); obj.add(l); }
    }
    sc2.add(obj); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc2, c2); renderer.readRenderTargetPixels(rt, 0, 0, size, size * 0.75, buf); sc2.remove(obj);
    for (let y = 0; y < size * 0.75; y++) img.data.set(buf.subarray((size * 0.75 - 1 - y) * size * 4, (size * 0.75 - y) * size * 4), y * size * 4);
    cx.putImageData(img, 0, 0); icons[id] = cv.toDataURL();
  }
  renderer.setRenderTarget(null); renderer.toneMapping = prevTone; rt.dispose();
}
let catIdx = 0, subIdx = 0;
function renderCats() {
  $('cats').innerHTML = CAT.map((c, k) => `<button class="chip ${k === catIdx ? 'on' : ''}" data-k="${k}">${c.name}</button>`).join('');
  const subs = CAT[catIdx].subs; $('subs').innerHTML = subs.map((s, k) => `<button class="chip ${k === subIdx ? 'on' : ''}" data-k="${k}">${s.name}</button>`).join('');
  $('subs').style.display = subs.length > 1 ? 'flex' : 'none';
  $('items').innerHTML = subs[subIdx].items.map((id) => { const it = ITEMS[id]; return `<button class="item ${id === selected ? 'on' : ''} ${it.isNew ? 'new' : ''}" data-id="${id}" title="${it.name}"><img alt="" src="${icons[id] || ''}"><b>${it.name}</b><span><i class="coin"></i>${it.cost}${it.tool === 'road' || it.tool === 'area' ? '/tile' : ''}</span></button>`; }).join('');
  $('items').scrollLeft = 0; updateTrayArrows();
}
$('cats').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; catIdx = +b.dataset.k; subIdx = 0; renderCats(); });
$('subs').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; subIdx = +b.dataset.k; renderCats(); });
$('items').addEventListener('click', (e) => { const b = e.target.closest('.item'); if (!b) return; const id = b.dataset.id; if (selected === id) { setMode('look'); return; } selected = id; setMode('build'); renderCats(); setGhost(id); });
$('items').addEventListener('scroll', updateTrayArrows);
$('arrL').onclick = () => ($('items').scrollLeft -= 300); $('arrR').onclick = () => ($('items').scrollLeft += 300);
function updateTrayArrows() { const el = $('items'), more = el.scrollWidth - el.clientWidth > 4; const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4, atStart = el.scrollLeft <= 4; $('fadeR').classList.toggle('show', more && !atEnd); $('arrR').classList.toggle('show', more && !atEnd); $('fadeL').classList.toggle('show', more && !atStart); $('arrL').classList.toggle('show', more && !atStart); }
function setMode(m) {
  mode = m; if (m !== 'build') { selected = null; setGhost(null); renderCats(); }
  document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  ghostTiles.count = 0; hidePrice();
  const touch = matchMedia('(pointer:coarse)').matches;
  $('hint').textContent = m === 'look' ? (touch ? 'Drag to look. Pinch to zoom. Pick below to build.' : 'Drag to look around. Scroll to zoom. Pick something below to build.')
    : m === 'remove' ? 'Tap anything to remove it. You get half its price back.'
    : ITEMS[selected].tool === 'road' ? 'Drag to draw the road. It turns one corner.' : ITEMS[selected].tool === 'area' ? 'Drag across the land to cover it.' : ITEMS[selected].tool === 'lights' ? 'Tap a junction to put up lights.' : touch ? 'Tap a spot beside a road to build. Drag to look around.' : 'Click a spot beside a road to build.';
}
document.querySelectorAll('.mode').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
let speed = 1;
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b)); }));
$('agentsBtn').onclick = () => { agentsOn = !agentsOn; $('agentsBtn').classList.toggle('on', agentsOn); $('agentsBtn').querySelector('.lbl').textContent = agentsOn ? 'Agents on' : 'Agents off'; toast(agentsOn ? 'Agents are building again' : 'Agents paused. The town is yours.'); };
$('rotBtn').onclick = () => { cam.azTarget += Math.PI / 2; };
$('sunBtn').onclick = () => { const h = town.t / 60 % 24; town.t = Math.floor(town.t / 1440) * 1440 + (h < 17 || h >= 23 ? (h >= 23 ? 1440 : 0) + 18.2 * 60 : 1440 + 6.5 * 60); lastHour = Math.floor(town.t / 60); };
let toastT = 0; function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800); }
function renderAgents() {
  $('agentList').innerHTML = AGENTS.map((a) => `<div class="agent"><div class="dot" style="background:${a.color}">${a.name[0]}</div><div class="who"><b>${a.name} <small style="color:var(--dim);font-weight:500">· ${a.role}</small></b><span>${a.last}</span></div><div class="bal"><i class="coin"></i>${fmt(a.coins)}</div></div>`).join('');
}
const feedEl = $('feed'); feedEl.innerHTML = '<li style="color:var(--dim)">Nothing built yet. Pick something from the tray.</li>';
function log(a, text, cost) {
  const li = document.createElement('li'); li.innerHTML = `<i style="color:${a.color}">${a.name}</i> ${text}${cost ? ` <small>· ${fmt(cost)}</small>` : ''}`;
  if (feedEl.firstChild && !feedEl.firstChild.querySelector('i')) feedEl.innerHTML = '';
  feedEl.prepend(li); while (feedEl.children.length > 6) feedEl.lastChild.remove();
  $('tickText').innerHTML = `<b style="color:${a.color}">${a.name}</b> ${text}`;
  uiDirty = true;
}
// floating name tags where agents build (kept apart so they never pile up)
const tagsEl = $('tags'); const liveTags = [];
function tag(a, at, text) {
  if (liveTags.length >= 4) { liveTags[0].el.remove(); liveTags.shift(); }
  const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<span class="d" style="background:${a.color}">${a.name[0]}</span>${a.name}`;
  tagsEl.appendChild(el); liveTags.push({ el, x: W(at[0]), z: Z(at[1]), born: performance.now(), a });
  ring(a.color, W(at[0]), Z(at[1]));
}
const P = new THREE.Vector3();
function placeTags() {
  const now = performance.now(), boxes = [];
  for (let n = liveTags.length - 1; n >= 0; n--) {
    const t = liveTags[n], age = (now - t.born) / 1000;
    if (age > 4.5) { t.el.remove(); liveTags.splice(n, 1); continue; }
    P.set(t.x, 0.9, t.z).project(camera);
    let x = (P.x + 1) / 2 * innerWidth, y = (1 - P.y) / 2 * innerHeight;
    const w = t.el.offsetWidth || 80, h = 26;
    for (let q = 0; q < 6; q++) { const hitB = boxes.find((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 4 && Math.abs(b.y - y) < h + 2); if (!hitB) break; y = hitB.y - h - 4; }
    const topB = document.getElementById('top').getBoundingClientRect().bottom, trayT = document.getElementById('tray').getBoundingClientRect().top;
    x = Math.max(w / 2 + 6, Math.min(innerWidth - w / 2 - 6, x));
    if (y < topB + 34 || y > trayT - 4) { t.el.style.opacity = '0'; continue; }
    boxes.push({ x, y, w });
    t.el.style.left = x + 'px'; t.el.style.top = y + 'px'; t.el.style.opacity = age > 3.6 ? String(Math.max(0, (4.5 - age) / 0.9)) : '1';
  }
}
const rings = []; const ringGeo = new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2);
function ring(color, x, z) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, 0.05, z); m.renderOrder = 4; scene.add(m); rings.push({ m, t: 0 }); }
function updateUI() {
  $('coins').textContent = fmt(owners.you.coins);
  const h = Math.floor(town.t / 60) % 24, mi = Math.floor(town.t % 60); town.day = Math.floor(town.t / 1440) + 1;
  $('clock').innerHTML = `Day ${town.day} <small>${String(h).padStart(2, '0')}:${String(Math.floor(mi / 10) * 10).padStart(2, '0')}</small>`;
  $('pop').textContent = fmt(town.pop); $('cars').textContent = cars.length;
  if (uiDirty) { renderAgents(); uiDirty = false; }
}
function placeHint() {
  const tray = $('tray').getBoundingClientRect(); const tick = $('ticker');
  const tickVisible = getComputedStyle(tick).display !== 'none';
  const land = matchMedia('(max-height:480px) and (orientation:landscape)').matches;
  if (tickVisible) { tick.style.bottom = land ? '' : (innerHeight - tray.top + 6) + 'px'; if (land) { tick.style.top = ($('top').getBoundingClientRect().bottom + 6) + 'px'; } }
  const above = tickVisible && !land ? tick.getBoundingClientRect().height + 6 : 0;
  $('hint').style.bottom = (innerHeight - tray.top + 8 + above) + 'px';
}

// ---------------------------------------------------------------- day and night
const DAY = { sky: new THREE.Color('#e9c99a'), dusk: new THREE.Color('#e39a6a'), night: new THREE.Color('#2a3358') };
const sunCol = new THREE.Color();
function light(h) {
  const a = (h - 6) / 12 * Math.PI; // 6h sunrise, 18h sunset
  const up = Math.sin(a), day = THREE.MathUtils.clamp(up * 2.2, 0, 1), dusk = THREE.MathUtils.clamp(1 - Math.abs(up) * 3, 0, 1) * (up > -0.25 ? 1 : 0);
  const night = 1 - THREE.MathUtils.clamp((up + 0.15) * 3, 0, 1);
  const azs = cam.az + Math.PI * 0.35 + Math.cos(a) * 0.9;
  sun.position.set(cam.tx + Math.sin(azs) * 40, Math.max(6, up * 50 + 8), cam.tz + Math.cos(azs) * 40); sun.target.position.set(cam.tx, 0, cam.tz);
  sun.intensity = 0.55 + 1.8 * day; sunCol.set('#fff1d6').lerp(new THREE.Color('#ffae6a'), dusk * 0.8).lerp(new THREE.Color('#8fa0d8'), night);
  sun.color.copy(sunCol);
  hemi.intensity = 0.95 + 0.25 * day + 0.15 * dusk; hemi.color.set('#fff3dc').lerp(new THREE.Color('#8f9ad0'), night * 0.85);
  scene.background.copy(DAY.sky).lerp(DAY.dusk, dusk * 0.7).lerp(DAY.night, night); scene.fog.color.copy(scene.background);
  winMat.emissiveIntensity = night * 1.4 + dusk * 0.3;
  renderer.toneMappingExposure = 1.05 - night * 0.12;
  return night > 0.35;
}

// ---------------------------------------------------------------- loop
let clock = 0, last = performance.now(), fpsT = 0, frames = 0, spawnT = 0;
function step(dt) {
  simTime += dt; clock += dt;
  town.t += dt * 4; // one real second = four town minutes
  econ(); stepAgents(dt); stepCars(dt); stepPeople(dt); stepCritters(dt); stepBoats(dt);
  spawnT -= dt; if (spawnT <= 0) { spawnT = 0.35; const roadTiles = cells.filter((c) => c.road).length; const want = Math.min(MAXV, Math.floor(roadTiles / 3.2)); if (cars.length < want) spawnCar(); else if (cars.length > want + 2) cars.shift(); const wantP = Math.min(MAXP, Math.floor(roadTiles / 3)); if (people.length < wantP) spawnPerson(); }
}
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = real * speed;
  if (dt > 0) { const n = Math.ceil(dt / 0.034); for (let q = 0; q < n; q++) step(dt / n); }
  // construction rise, dust, rings, turbines, lights
  for (const o of objects.values()) { if (o.rise < 1) { o.rise = Math.min(1, o.rise + real * 0.9 * Math.max(speed, 0.5)); const e = 1 - Math.pow(1 - o.rise, 3); o.m.scale.set(1, Math.max(0.01, e), 1); } if (o.m.userData.spin) o.m.userData.spin.rotation.z += real * speed * 2.4; }
  for (let n = puffs.length - 1; n >= 0; n--) { const m = puffs[n], u = m.userData; u.life += real; m.position.addScaledVector(u.v, real); m.scale.setScalar(1 + u.life * 1.5); m.material.opacity = Math.max(0, 0.8 - u.life * 0.8); if (u.life > 1) { scene.remove(m); m.material.dispose(); puffs.splice(n, 1); } }
  for (let n = rings.length - 1; n >= 0; n--) { const r = rings[n]; r.t += real; r.m.scale.setScalar(1 + r.t * 1.8); r.m.material.opacity = Math.max(0, 0.9 - r.t * 0.6); if (r.t > 1.5) { scene.remove(r.m); rings.splice(n, 1); } }
  for (const c of cells) if (c.light) for (const l of c.light.m.userData.lamps) l.material = lampMats[lightState(c, l.userData.axis)];
  if (Math.abs(cam.azTarget - cam.az) > 0.001) { cam.az += (cam.azTarget - cam.az) * Math.min(1, real * 6); updateCamera(); }
  const night = light((town.t / 60) % 24);
  drawCars(night);
  if (groundDirty) { groundTex.needsUpdate = true; groundDirty = false; }
  renderer.render(scene, camera);
  placeTags(); updateUI();
  // adaptive pixel ratio from measured frame rate
  frames++; fpsT += real; if (fpsT > 2) { const fps = frames / fpsT; frames = 0; fpsT = 0; if (fps < 40 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); fitView(); } else if (fps > 58 && pixelRatio < Math.min(devicePixelRatio, LITE ? 1.5 : 2)) { pixelRatio = Math.min(Math.min(devicePixelRatio, LITE ? 1.5 : 2), pixelRatio + 0.25); renderer.setPixelRatio(pixelRatio); fitView(); } }
  if (!STILL) requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) paint(i, j);
seedTown();
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) paint(i, j);
fitView(); updateCamera(); makeIcons(); renderCats(); setMode('look'); renderAgents(); placeHint();
for (let q = 0; q < 14; q++) spawnCar(); for (let q = 0; q < 16; q++) spawnPerson();
for (let q = 0; q < 60; q++) { stepCars(0.05); stepPeople(0.05); }
if (REDUCED) { speed = 1; }
$('goWatch').onclick = () => { $('intro').remove(); toast('Agents are building. Tap anything in the tray to join in.'); };
$('goBuild').onclick = () => { $('intro').remove(); agentsOn = false; $('agentsBtn').classList.remove('on'); $('agentsBtn').querySelector('.lbl').textContent = 'Agents off'; catIdx = 0; subIdx = 0; renderCats(); };
requestAnimationFrame((t) => { last = t; frame(t); });

// hooks for automated checks
window.__town = {
  skipIntro() { $('intro')?.remove(); },
  ff(sec) { for (let t = 0; t < sec; t += 0.033) step(0.033); for (const o of objects.values()) { o.rise = 1; o.m.scale.set(1, 1, 1); } for (const m of puffs) scene.remove(m); puffs.length = 0; for (const r of rings) scene.remove(r.m); rings.length = 0; },
  setTime(h) { town.t = Math.floor(town.t / 1440) * 1440 + h * 60; lastHour = Math.floor(town.t / 60); },
  render() { const night = light((town.t / 60) % 24); drawCars(night); if (groundDirty) { groundTex.needsUpdate = true; groundDirty = false; } renderer.render(scene, camera); placeTags(); updateUI(); placeHint(); },
  agents(on) { agentsOn = on; },
  place, drawRoad, fillArea, canPlace, remove, setLights, linePath,
  overlaps() { let worst = 0, pairs = 0; for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) { const A = cars[a], B = cars[b], d = Math.hypot(A.x - B.x, A.z - B.z); const min = Math.min(A.type.len, B.type.len) * 0.5 + 0.04; const lat = Math.abs((B.x - A.x) * A.hz - (B.z - A.z) * A.hx); if (d < min && lat < 0.12) { pairs++; worst = Math.max(worst, min - d); } } return { pairs, worst, cars: cars.length }; },
  get state() { return { coins: owners.you.coins, pop: town.pop, objects: objects.size, roads: cells.filter((c) => c.road).length, cars: cars.length, people: people.length, agents: AGENTS.map((a) => ({ name: a.name, coins: a.coins, last: a.last })) }; },
  cam,
  look(z, x = cam.tx, zz = cam.tz) { cam.zoom = z; cam.tx = x; cam.tz = zz; updateCamera(); },
  screenOf(i, j) { P.set(W(i), 0, Z(j)).project(camera); return [(P.x + 1) / 2 * innerWidth, (1 - P.y) / 2 * innerHeight]; },
  select(id) { selected = id; setMode('build'); renderCats(); setGhost(id); },
};
