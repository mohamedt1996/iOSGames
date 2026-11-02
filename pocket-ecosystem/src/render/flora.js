import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANT } from '../sim/species.js';
import { G, CS } from '../sim/world.js';
import { mulberry32 } from '../sim/rng.js';
import { fuzzTexture } from './textures.js';

const rnd = mulberry32(42);

// Shared wind uniforms (time + gust strength) injected into foliage vertex shaders.
export const WIND = { time: { value: 0 }, strength: { value: 1 } };
function addWind(mat, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wTime = WIND.time; sh.uniforms.wStrength = WIND.strength;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float wTime; uniform float wStrength;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float ph = wTime * 1.7 + ip.x * 7.0 + ip.y * 5.0;
        float h = max(transformed.y, 0.0) * 18.0;
        float sway = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * ${amount.toFixed(4)} * wStrength * h * h;
        transformed.x += sway; transformed.z += sway * 0.5;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amount;
}

// Paint a vertex-color gradient by a function of local position.
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const strip = (g) => { if (g.index) g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };

function mossGeo() {
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.IcosahedronGeometry(0.016 + rnd() * 0.012, 1);
    g.scale(1, 0.5 + rnd() * 0.25, 1);
    const ox = (rnd() - 0.5) * 0.06, oz = (rnd() - 0.5) * 0.06;
    g.translate(ox, 0.003, oz);
    const tone = 0.85 + rnd() * 0.3;
    paint(g, (x, y) => lerp3([0.55 * tone, 0.75 * tone, 0.45 * tone], [1.1 * tone, 1.15 * tone, 0.8 * tone], Math.min(1, y / 0.02)));
    parts.push(strip(g));
  }
  // a few sporophyte stalks with capsules
  for (let i = 0; i < 4; i++) {
    const h = 0.018 + rnd() * 0.014, ox = (rnd() - 0.5) * 0.05, oz = (rnd() - 0.5) * 0.05;
    const st = new THREE.CylinderGeometry(0.0007, 0.0009, h, 3); st.translate(ox, h / 2 + 0.008, oz);
    const cap = new THREE.SphereGeometry(0.0022, 5, 4); cap.scale(1, 1.6, 1); cap.translate(ox, h + 0.009, oz);
    paint(st, () => [1.3, 1.0, 0.55]); paint(cap, () => [1.2, 0.8, 0.45]);
    parts.push(strip(st), strip(cap));
  }
  const g = mergeGeometries(parts); jitterNormals(g, 0.35); return g;
}

function bladeGeo(h, w, bend, rot, ox, oz) {
  const seg = 5, pos = [], idx = [], col = [], nor = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, y = t * h, x = bend * t * t, ww = w * (1 - Math.pow(t, 1.5) * 0.95);
    pos.push(x - ww / 2, y, 0, x + ww / 2, y, 0);
    const c = lerp3([0.35, 0.45, 0.25], [1.25, 1.2, 0.8], Math.pow(t, 0.8));
    col.push(...c, ...c);
    nor.push(-0.3, 0.8, 0.5, -0.3, 0.8, 0.5);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.rotateY(rot); g.translate(ox, 0, oz);
  return g;
}

function grassGeo() {
  const parts = [];
  for (let i = 0; i < 15; i++) { const r = Math.sqrt(rnd()) * 0.03, a = rnd() * 6.28; parts.push(bladeGeo(0.06 + rnd() * 0.08, 0.007, 0.01 + rnd() * 0.035, a + 1.2, Math.cos(a) * r, Math.sin(a) * r)); }
  return mergeGeometries(parts);
}

function frondGeo(len, rot) {
  const parts = [];
  const N = 13;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const x = t * len, y = Math.sin(t * Math.PI * 0.75) * len * 0.8 - t * t * len * 0.3;
    const s = (1 - t * 0.75) * 0.019;
    for (const side of [-1, 1]) {
      const l = new THREE.CircleGeometry(s, 6); l.scale(1.6, 0.6, 1);
      l.translate(s * 1.3, 0, 0); l.rotateX(-Math.PI / 2 + 0.35); l.rotateY(side * 1.25);
      l.translate(x, y, 0);
      paint(l, () => lerp3([0.55, 0.8, 0.5], [1.15, 1.2, 0.85], t));
      parts.push(strip(l));
    }
    if (i < N) { const r = new THREE.CylinderGeometry(0.0009, 0.0012, len / N, 3); r.rotateZ(Math.PI / 2 - Math.atan2(Math.cos(t * Math.PI * 0.75) * 0.75 * Math.PI * 0.8 - 2 * t * 0.3, 1)); r.translate(x + len / N / 2, y, 0); paint(r, () => [0.6, 0.7, 0.4]); parts.push(strip(r)); }
  }
  const g = mergeGeometries(parts); g.rotateY(rot); return g;
}
function fernGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) parts.push(frondGeo(0.14 + rnd() * 0.06, (i / 7) * Math.PI * 2 + rnd() * 0.4));
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

function bloomStemGeo() {
  const stem = new THREE.CylinderGeometry(0.0025, 0.0035, 0.12, 5, 4); stem.translate(0, 0.06, 0);
  paint(stem, (x, y) => lerp3([0.5, 0.65, 0.35], [0.9, 1.0, 0.6], y / 0.12));
  const parts = [strip(stem)];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.SphereGeometry(0.02, 8, 4); l.scale(1.1, 0.16, 0.42); l.translate(0.021, 0.008 + i * 0.022, 0); l.rotateZ(0.25); l.rotateY(i * 2.4);
    paint(l, (x) => lerp3([0.6, 0.8, 0.45], [1.1, 1.15, 0.75], Math.min(1, Math.abs(x) / 0.04)));
    parts.push(strip(l));
  }
  return mergeGeometries(parts);
}
function bloomHeadGeo() {
  const parts = [];
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 7; i++) {
    const p = new THREE.SphereGeometry(0.016 - ring * 0.004, 8, 4); p.scale(1, 0.2, 0.5); p.translate(0.015 - ring * 0.004, ring * 0.002, 0);
    p.rotateZ(0.25 + ring * 0.3); p.rotateY((i / 7) * Math.PI * 2 + ring * 0.45);
    paint(p, (x, y, z) => lerp3([1.15, 0.85, 1.05], [0.95, 0.55, 0.8], Math.min(1, Math.hypot(x, z) / 0.03)));
    parts.push(strip(p));
  }
  const c = new THREE.SphereGeometry(0.0065, 8, 6); c.scale(1, 0.7, 1); c.translate(0, 0.002, 0); paint(c, () => [1.6, 1.3, 0.55]); parts.push(strip(c));
  const g = mergeGeometries(parts); g.translate(0, 0.122, 0); return g;
}

function mushroomGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const h = 0.025 + rnd() * 0.035, ox = (rnd() - 0.5) * 0.045, oz = (rnd() - 0.5) * 0.045;
    const st = new THREE.CylinderGeometry(0.0025, 0.0038, h, 7); st.translate(ox, h / 2, oz);
    paint(st, () => [1.05, 1.0, 0.9]);
    const pts = []; const r = 0.01 + rnd() * 0.011;
    for (let j = 0; j <= 8; j++) { const a = (j / 8) * Math.PI * 0.55; pts.push(new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * r * 0.55)); }
    pts.push(new THREE.Vector2(r * 0.95, -r * 0.05)); pts.push(new THREE.Vector2(0.002, 0));
    const cap = new THREE.LatheGeometry(pts, 10); cap.translate(ox, h, oz);
    paint(cap, (x, y) => (y < h + 0.001 ? [0.75, 0.62, 0.48] : lerp3([1.05, 0.92, 0.7], [0.75, 0.55, 0.35], Math.min(1, (y - h) / (r * 0.55)))));
    parts.push(strip(st), strip(cap));
  }
  return mergeGeometries(parts);
}

function dewtrapGeo() {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const l = new THREE.SphereGeometry(0.017, 8, 4); l.scale(1.2, 0.18, 0.5); l.translate(0.03, 0.01, 0); l.rotateZ(0.3); l.rotateY((i / 8) * Math.PI * 2);
    paint(l, (x, y, z) => lerp3([0.55, 0.9, 0.45], [1.25, 0.35, 0.3], Math.min(1, Math.hypot(x, z) / 0.045)));
    parts.push(strip(l));
    for (let d = 0; d < 3; d++) {
      const dr = new THREE.SphereGeometry(0.0018, 5, 4); const a = (i / 8) * Math.PI * 2 + (d - 1) * 0.15, rr = 0.03 + d * 0.006;
      dr.translate(Math.cos(a) * rr, 0.022 + d * 0.002, -Math.sin(a) * rr); paint(dr, () => [1.6, 1.5, 1.4]); parts.push(strip(dr));
    }
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

function algaeGeo() { const g = new THREE.CircleGeometry(0.035, 9); g.rotateX(-Math.PI / 2); paint(g, (x, y, z) => lerp3([1.1, 1.1, 0.8], [0.7, 0.85, 0.65], Math.hypot(x, z) / 0.035)); return strip(g); }

function jitterNormals(g, amt) {
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) + (rnd() - 0.5) * amt, n.getY(i) + (rnd() - 0.5) * amt, n.getZ(i) + (rnd() - 0.5) * amt);
}

const BASE = {
  [PLANT.MOSS]: { geo: mossGeo, color: [0.26, 0.42, 0.14], dead: [0.48, 0.4, 0.22], rough: 0.9, sheen: true },
  [PLANT.GRASS]: { geo: grassGeo, color: [0.42, 0.6, 0.22], dead: [0.64, 0.56, 0.32], rough: 0.7, side: THREE.DoubleSide, wind: 0.0016 },
  [PLANT.FERN]: { geo: fernGeo, color: [0.2, 0.44, 0.18], dead: [0.5, 0.4, 0.22], rough: 0.65, side: THREE.DoubleSide, wind: 0.0009 },
  [PLANT.BLOOM]: { geo: bloomStemGeo, color: [0.3, 0.5, 0.24], dead: [0.5, 0.45, 0.28], rough: 0.7, wind: 0.0007 },
  [PLANT.MUSHROOM]: { geo: mushroomGeo, color: [0.92, 0.86, 0.72], dead: [0.5, 0.42, 0.33], rough: 0.55, glow: true },
  [PLANT.DEWTRAP]: { geo: dewtrapGeo, color: [0.72, 0.42, 0.32], dead: [0.4, 0.25, 0.18], rough: 0.2 },
  [PLANT.ALGAE]: { geo: algaeGeo, color: [0.3, 0.55, 0.3], dead: [0.4, 0.42, 0.3], rough: 0.9, transparent: true },
};

export class Flora {
  constructor(parent) {
    this.group = new THREE.Group(); parent.add(this.group);
    this.meshes = {};
    const N = G * G;
    for (const [t, d] of Object.entries(BASE)) {
      const opts = { vertexColors: true, roughness: d.rough, metalness: 0, side: d.side || THREE.FrontSide, transparent: !!d.transparent, opacity: d.transparent ? 0.8 : 1 };
      const mat = d.sheen ? new THREE.MeshPhysicalMaterial({ ...opts, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xc8f0a0) }) : new THREE.MeshStandardMaterial(opts);
      if (d.glow) { mat.emissive = new THREE.Color(0x7fffd0); mat.emissiveIntensity = 0; this.glowMat = mat; }
      if (d.wind) addWind(mat, d.wind);
      const m = new THREE.InstancedMesh(d.geo(), mat, N);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = t != PLANT.ALGAE; m.receiveShadow = true; m.count = 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      m.frustumCulled = false;
      this.group.add(m); this.meshes[t] = m;
    }
    this.headMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xffd6ec), emissive: new THREE.Color(0xe59cc4), emissiveIntensity: 0 });
    addWind(this.headMat, 0.0007);
    this.heads = new THREE.InstancedMesh(bloomHeadGeo(), this.headMat, N); this.heads.castShadow = true; this.heads.count = 0; this.heads.frustumCulled = false;
    this.heads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.group.add(this.heads);
    // mold & litter
    this.moldMat = new THREE.MeshStandardMaterial({ map: fuzzTexture(), transparent: true, depthWrite: false, roughness: 1, color: 0xf2f0e8 });
    const mg = new THREE.PlaneGeometry(CS * 1.6, CS * 1.6); mg.rotateX(-Math.PI / 2);
    this.mold = new THREE.InstancedMesh(mg, this.moldMat, N); this.mold.count = 0; this.mold.frustumCulled = false; this.group.add(this.mold);
    const lg = new THREE.PlaneGeometry(0.018, 0.011); lg.rotateX(-Math.PI / 2);
    this.litter = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1, side: THREE.DoubleSide }), N * 3);
    this.litter.count = 0; this.litter.frustumCulled = false; this.litter.receiveShadow = true;
    this.litter.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 9), 3);
    this.group.add(this.litter);
    // per-cell stable jitter
    this.jit = new Float32Array(N * 4); for (let i = 0; i < this.jit.length; i++) this.jit[i] = rnd();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
    this.grow = new Float32Array(N); // smoothed visual biomass
  }

  update(w, dt, time) {
    const counts = {}; for (const t in this.meshes) counts[t] = 0;
    let hc = 0, mc = 0, lc = 0;
    const night = w.isNight();
    const { m4, q, e, v, s, c, jit } = this;
    for (const k of w.insideList) {
      const t = w.pType[k];
      const target = t ? w.pBio[k] : 0;
      this.grow[k] += (target - this.grow[k]) * Math.min(1, dt * 3);
      const x = w.cx[k] + (jit[k * 4] - 0.5) * CS * 0.5, z = w.cz[k] + (jit[k * 4 + 1] - 0.5) * CS * 0.5;
      const y = w.h[k];
      if (t) {
        const d = BASE[t];
        const g = Math.max(0.05, this.grow[k]);
        let sc = (0.55 + g * 1.0) * 1.35;
        if (t === PLANT.MOSS) sc = 0.95 + g * 0.9;
        e.set(0, jit[k * 4 + 2] * Math.PI * 2, 0);
        q.setFromEuler(e);
        const yy = t === PLANT.ALGAE ? y + w.w[k] + 0.001 : y;
        s.set(sc, t === PLANT.MOSS ? sc * (0.7 + w.m[k] * 0.6) : sc, sc);
        m4.compose(v.set(x, yy, z), q, s);
        const m = this.meshes[t]; const i = counts[t]++;
        m.setMatrixAt(i, m4);
        const hp = Math.max(0, Math.min(1, w.pHealth[k]));
        const dry = t !== PLANT.ALGAE && t !== PLANT.MUSHROOM ? Math.max(0, Math.min(1, (0.45 - w.m[k]) * 3)) : 0;
        const f = Math.min(1, (1 - hp) * 0.9 + dry * 0.25);
        c.setRGB(d.color[0] * (1 - f) + d.dead[0] * f, d.color[1] * (1 - f) + d.dead[1] * f, d.color[2] * (1 - f) + d.dead[2] * f);
        c.offsetHSL(0, 0, (jit[k * 4 + 3] - 0.5) * 0.06);
        m.setColorAt(i, c);
        if (t === PLANT.BLOOM) {
          const b = w.pBloom[k];
          const hs = 0.15 + b * 0.95;
          s.set(sc * hs, sc * Math.max(0.3, hs), sc * hs);
          m4.compose(v.set(x, y, z), q, s);
          this.heads.setMatrixAt(hc, m4);
          c.setRGB(0.6 + 0.35 * b, 0.6 - 0.05 * b, 0.45 + 0.35 * b); this.heads.setColorAt(hc, c); hc++;
        }
      }
      if (w.mold[k] > 0.05 && mc < this.mold.count + 10000) {
        const sc = 0.4 + w.mold[k];
        m4.compose(v.set(w.cx[k], y + 0.004 + (t ? 0.02 : 0), w.cz[k]), q.identity(), s.set(sc, 1, sc));
        this.mold.setMatrixAt(mc++, m4);
      }
      const nl = Math.min(3, Math.floor(w.det[k] * 10));
      for (let l = 0; l < nl; l++) {
        const jj = jit[(k * 4 + l) % jit.length];
        e.set((jj - 0.5) * 0.6, jj * 20 + l, (jit[k * 4 + l] - 0.5) * 0.4); q.setFromEuler(e);
        m4.compose(v.set(w.cx[k] + (jj - 0.5) * CS, y + 0.003, w.cz[k] + (jit[(k * 4 + l + 1) % jit.length] - 0.5) * CS), q, s.set(1, 1, 1));
        this.litter.setMatrixAt(lc, m4);
        c.setRGB(0.32 + jj * 0.15, 0.22 + jj * 0.08, 0.12); this.litter.setColorAt(lc, c); lc++;
      }
    }
    for (const t in this.meshes) { const m = this.meshes[t]; m.count = counts[t]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.heads.count = hc; this.heads.instanceMatrix.needsUpdate = true; this.heads.instanceColor.needsUpdate = true;
    this.mold.count = mc; this.mold.instanceMatrix.needsUpdate = true;
    this.litter.count = lc; this.litter.instanceMatrix.needsUpdate = true; this.litter.instanceColor.needsUpdate = true;
    WIND.time.value = time; WIND.strength.value += ((w.vent ? 2.2 : 1) - WIND.strength.value) * Math.min(1, dt);
    const glowT = night ? 2.2 : 0;
    this.glowMat.emissiveIntensity += (glowT - this.glowMat.emissiveIntensity) * Math.min(1, dt * 2);
    this.headMat.emissiveIntensity += ((night ? 0.35 : 0) - this.headMat.emissiveIntensity) * Math.min(1, dt * 2);
  }
}
