import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANT } from '../sim/species.js';
import { G, CS } from '../sim/world.js';
import { mulberry32 } from '../sim/rng.js';
import { fuzzTexture } from './textures.js';

const rnd = mulberry32(42);

function mossGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.IcosahedronGeometry(0.022 + rnd() * 0.012, 1);
    g.scale(1, 0.45 + rnd() * 0.2, 1);
    g.translate((rnd() - 0.5) * 0.05, 0.004, (rnd() - 0.5) * 0.05);
    parts.push(g);
  }
  const g = mergeGeometries(parts); jitterNormals(g, 0.3); return g;
}

function bladeGeo(h, w, bend, rot, ox, oz) {
  const seg = 4, pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, y = t * h, x = bend * t * t, ww = w * (1 - t * 0.9);
    pos.push(x - ww / 2, y, 0, x + ww / 2, y, 0);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.rotateY(rot); g.translate(ox, 0, oz); g.computeVertexNormals();
  return g;
}

function grassGeo() {
  const parts = [];
  for (let i = 0; i < 9; i++) parts.push(bladeGeo(0.07 + rnd() * 0.06, 0.008, 0.015 + rnd() * 0.03, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05));
  return mergeGeometries(parts);
}

function frondGeo(len, rot) {
  // arching rachis with paired leaflets
  const parts = [];
  const N = 9;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const x = t * len, y = Math.sin(t * Math.PI * 0.75) * len * 0.75 - t * t * len * 0.25;
    const s = (1 - t * 0.7) * 0.022;
    for (const side of [-1, 1]) {
      const l = new THREE.PlaneGeometry(s * 1.8, s);
      l.translate(s * 0.9, 0, 0); l.rotateY(side * 1.1); l.rotateX(-0.3);
      l.translate(x, y, 0); parts.push(l);
    }
  }
  const g = mergeGeometries(parts); g.rotateY(rot); return g;
}
function fernGeo() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(frondGeo(0.15 + rnd() * 0.05, (i / 6) * Math.PI * 2 + rnd() * 0.4));
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

function bloomStemGeo() {
  const stem = new THREE.CylinderGeometry(0.003, 0.004, 0.12, 5); stem.translate(0, 0.06, 0);
  const parts = [stem];
  for (let i = 0; i < 3; i++) { const l = new THREE.SphereGeometry(0.02, 6, 4); l.scale(1, 0.2, 0.45); l.translate(0.02, 0.01 + i * 0.025, 0); l.rotateY(i * 2.1); parts.push(l); }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}
function bloomHeadGeo() {
  const parts = [];
  for (let i = 0; i < 6; i++) { const p = new THREE.SphereGeometry(0.016, 6, 4); p.scale(1, 0.25, 0.55); p.translate(0.016, 0, 0); p.rotateY((i / 6) * Math.PI * 2); parts.push(p); }
  const c = new THREE.SphereGeometry(0.008, 6, 4); parts.push(c);
  const g = mergeGeometries(parts); g.translate(0, 0.122, 0); return g;
}

function mushroomGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const h = 0.03 + rnd() * 0.03, ox = (rnd() - 0.5) * 0.04, oz = (rnd() - 0.5) * 0.04;
    const st = new THREE.CylinderGeometry(0.003, 0.004, h, 6); st.translate(ox, h / 2, oz);
    const pts = []; const r = 0.012 + rnd() * 0.01;
    for (let j = 0; j <= 6; j++) { const a = (j / 6) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * r * 0.6)); }
    const cap = new THREE.LatheGeometry(pts, 8); cap.translate(ox, h, oz);
    parts.push(st.toNonIndexed(), cap.toNonIndexed());
  }
  return mergeGeometries(parts);
}

function dewtrapGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.SphereGeometry(0.018, 6, 4); l.scale(1, 0.2, 0.5); l.translate(0.03, 0.012, 0); l.rotateZ(0.25); l.rotateY((i / 7) * Math.PI * 2);
    parts.push(l);
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

function algaeGeo() { const g = new THREE.CircleGeometry(0.035, 7); g.rotateX(-Math.PI / 2); return g; }

function jitterNormals(g, amt) {
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) + (rnd() - 0.5) * amt, n.getY(i) + (rnd() - 0.5) * amt, n.getZ(i) + (rnd() - 0.5) * amt);
}

const BASE = {
  [PLANT.MOSS]: { geo: mossGeo, color: [0.24, 0.42, 0.13], dead: [0.45, 0.38, 0.22], rough: 1 },
  [PLANT.GRASS]: { geo: grassGeo, color: [0.48, 0.64, 0.25], dead: [0.62, 0.55, 0.33], rough: 0.8, side: THREE.DoubleSide },
  [PLANT.FERN]: { geo: fernGeo, color: [0.22, 0.45, 0.2], dead: [0.5, 0.4, 0.22], rough: 0.7, side: THREE.DoubleSide },
  [PLANT.BLOOM]: { geo: bloomStemGeo, color: [0.3, 0.5, 0.25], dead: [0.5, 0.45, 0.28], rough: 0.8 },
  [PLANT.MUSHROOM]: { geo: mushroomGeo, color: [0.86, 0.8, 0.66], dead: [0.5, 0.42, 0.33], rough: 0.6, glow: true },
  [PLANT.DEWTRAP]: { geo: dewtrapGeo, color: [0.72, 0.24, 0.2], dead: [0.4, 0.25, 0.18], rough: 0.3 },
  [PLANT.ALGAE]: { geo: algaeGeo, color: [0.3, 0.55, 0.3], dead: [0.4, 0.42, 0.3], rough: 0.9, transparent: true },
};

export class Flora {
  constructor(parent) {
    this.group = new THREE.Group(); parent.add(this.group);
    this.meshes = {};
    const N = G * G;
    for (const [t, d] of Object.entries(BASE)) {
      const mat = new THREE.MeshStandardMaterial({ roughness: d.rough, metalness: 0, side: d.side || THREE.FrontSide, transparent: !!d.transparent, opacity: d.transparent ? 0.8 : 1 });
      if (d.glow) { mat.emissive = new THREE.Color(0x9fe0c0); mat.emissiveIntensity = 0; this.glowMat = mat; }
      const m = new THREE.InstancedMesh(d.geo(), mat, N);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = t != PLANT.ALGAE; m.receiveShadow = true; m.count = 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      m.frustumCulled = false;
      this.group.add(m); this.meshes[t] = m;
    }
    this.headMat = new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: new THREE.Color(0xe59cc4), emissiveIntensity: 0 });
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
    const wave = Math.sin(time * 1.3);
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
        e.set(t === PLANT.GRASS || t === PLANT.FERN ? wave * 0.03 * jit[k * 4 + 3] : 0, jit[k * 4 + 2] * Math.PI * 2, 0);
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
          c.setRGB(0.55 + 0.4 * b, 0.62 - 0.05 * b, 0.42 + 0.35 * b); this.heads.setColorAt(hc, c); hc++;
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
    const glowT = night ? 0.9 : 0;
    this.glowMat.emissiveIntensity += (glowT - this.glowMat.emissiveIntensity) * Math.min(1, dt * 2);
    this.headMat.emissiveIntensity += ((night ? 0.25 : 0) - this.headMat.emissiveIntensity) * Math.min(1, dt * 2);
  }
}
