// Palasora world kit: the pieces of our Three.js diorama kit (github.com/amaeteventurestudios/diorama, kit/builder.js,
// kit/util.js, kit/quality.js) ported to TypeScript for the world viewer. Same approach: everything procedural, merged
// vertex-coloured geometry, a light tier for touch screens and an adaptive pixel ratio.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Col = THREE.Color | ((x: number, y: number, z: number) => THREE.Color);

/** Merges boxes, cylinders and other shapes into one vertex-coloured geometry: one draw call for a whole town. */
export class Builder {
  geos: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: Col, m?: THREE.Matrix4): THREE.BufferGeometry {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const cc = typeof color === "function" ? color(p.getX(i), p.getY(i), p.getZ(i)) : color;
      c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    if (m) g.applyMatrix4(m);
    this.geos.push(g);
    return g;
  }
  box(w: number, h: number, d: number, color: Col, m?: THREE.Matrix4) { return this.add(new THREE.BoxGeometry(w, h, d), color, m); }
  cyl(rt: number, rb: number, h: number, seg: number, color: Col, m?: THREE.Matrix4) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, m); }
  sphere(r: number, color: Col, m?: THREE.Matrix4, ws = 8, hs = 6) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, m); }
  dome(r: number, color: Col, m?: THREE.Matrix4, seg = 16) { return this.add(new THREE.SphereGeometry(r, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2), color, m); }
  cone(r: number, h: number, seg: number, color: Col, m?: THREE.Matrix4) { return this.add(new THREE.ConeGeometry(r, h, seg), color, m); }
  /** A gable roof: a triangular prism `w` wide (x), `d` deep (z), `h` tall, sitting on y = 0. */
  gable(w: number, h: number, d: number, color: Col, m?: THREE.Matrix4) {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return this.add(g, color, m);
  }
  /** Moves another builder's pieces in, transformed by `m` (build a part at the origin, then place and scale it). */
  absorb(other: Builder, m: THREE.Matrix4) { for (const g of other.geos) { g.applyMatrix4(m); this.geos.push(g); } other.geos = []; }
  get count() { return this.geos.length; }
  geometry(): THREE.BufferGeometry {
    const g = this.geos.length ? mergeGeometries(this.geos, false)! : new THREE.BufferGeometry();
    for (const x of this.geos) x.dispose();
    this.geos = [];
    return g;
  }
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion();
/** A transform from position, yaw / pitch / roll (YXZ) and scale. */
export function M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, "YXZ"); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

export function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** One seeded stream: rng, a range helper, a jittered colour and a pick. */
export function createRandom(seed: number) {
  const rng = mulberry32(seed);
  const rr = (a: number, b: number) => a + (b - a) * rng();
  const col = (hex: THREE.ColorRepresentation, j = 0.04) => { const c = new THREE.Color(hex); if (j) c.offsetHSL(rr(-j, j) * 0.3, rr(-j, j), rr(-j, j)); return c; };
  const pick = <T,>(a: T[]) => a[(rng() * a.length) | 0];
  return { rng, rr, col, pick };
}
export const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** The light tier: touch screens (or `?lite`) get a lower pixel ratio, no MSAA and fewer figures. */
export function detectQuality() {
  const params = new URLSearchParams(location.search);
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LITE = isTouch || params.has("lite");
  return { isTouch, reduceMotion, LITE, maxDpr: LITE ? 1.5 : 2 };
}

/** Measures frame rate every 2 s and nudges the pixel ratio down below 42 fps and up above 58. */
export function createAdaptiveDpr(maxDpr: number, onChange: (dpr: number) => void) {
  const s = { dpr: Math.min(devicePixelRatio || 1, maxDpr), acc: 0, n: 0, last: performance.now(), fps: 0 };
  return {
    get dpr() { return s.dpr; }, get fps() { return s.fps; },
    tick(dt: number, now: number) {
      s.acc += dt; s.n++;
      if (now - s.last < 2000) return;
      s.fps = s.n / Math.max(1e-3, s.acc); s.acc = 0; s.n = 0; s.last = now;
      const maxD = Math.min(devicePixelRatio || 1, maxDpr);
      if (s.fps < 42 && s.dpr > 0.75) { s.dpr = Math.max(0.75, s.dpr - 0.15); onChange(s.dpr); }
      else if (s.fps > 58 && s.dpr < maxD - 0.01) { s.dpr = Math.min(maxD, s.dpr + 0.1); onChange(s.dpr); }
    },
  };
}

/** Lit windows and lamps: dark by day, bright by `uGlow` at night. Vertex colours, one draw call. */
export function glowMaterial(uGlow: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow },
    vertexShader: "attribute vec3 color; varying vec3 vC; void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform float uGlow; varying vec3 vC; void main(){ vec3 day = vec3(.20,.24,.28)+vC*.08; gl_FragColor = vec4(mix(day, vC*1.6, uGlow), 1.);\n#include <colorspace_fragment>\n}",
  });
}
