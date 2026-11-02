import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Particles } from './particles.js';

// Shared visual polish: tinted baking, soft contact shadows and ambient air particles.

// a lush, slightly varied tint for ground tiles (the kit's grass reads yellow under ACES)
export function grassTint(r) {
  const k = 0.84 + r() * 0.14, g = 0.93 + r() * 0.05;
  return [0.8 * k, g * k, 0.8 * k + r() * 0.04];
}

// Merge baked parts into one mesh per material, keeping a per-part vertex colour tint.
export function bakeParts(parts, group, { shadows = true } = {}) {
  const by = new Map();
  for (const p of parts) { const k = p.material.uuid; if (!by.has(k)) by.set(k, { mat: p.material, g: [] }); by.get(k).g.push(p); }
  const meshes = [];
  for (const { mat, g } of by.values()) {
    const tinted = g.some((p) => p.tint);
    const norm = g.map((p) => {
      const y = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
      for (const a of Object.keys(y.attributes)) if (!['position', 'normal', 'uv'].includes(a)) y.deleteAttribute(a);
      if (tinted) {
        const t = p.tint || [1, 1, 1], n = y.attributes.position.count, c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { c[i * 3] = t[0]; c[i * 3 + 1] = t[1]; c[i * 3 + 2] = t[2]; }
        y.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      return y;
    });
    const merged = mergeGeometries(norm, false); if (!merged) continue;
    let m = mat;
    if (tinted) { m = mat.clone(); m.vertexColors = true; }
    const mesh = new THREE.Mesh(merged, m); mesh.receiveShadow = true; mesh.castShadow = shadows; mesh.name = 'terrain';
    group.add(mesh); meshes.push(mesh);
  }
  return meshes;
}

// soft dark disc that grounds characters even where the shadow map is coarse
let blobTex = null, blobGeo = null;
export function blobShadow(size = 1, opacity = 0.42) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
    blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.scale.setScalar(size); m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

// Drifting motes over the whole scene: pollen and dust by day, fireflies by night, ash or embers on demand.
export class Atmosphere {
  constructor(parent, bounds, mode = 'day') {
    this.b = bounds; this.mode = mode;
    this.soft = new Particles(parent, { max: 260, additive: false, gravity: 0, drag: 0 });
    this.glow = new Particles(parent, { max: 160, additive: true, gravity: 0, drag: 0 });
    this.t = 0;
  }
  setMode(mode) { this.mode = mode; this.soft.clear?.(); this.glow.clear?.(); }
  spawn(sys, n, f) { for (let i = 0; i < n; i++) f(sys); }
  update(dt, time) {
    const b = this.b, m = this.mode;
    const rx = () => b.x0 + Math.random() * (b.x1 - b.x0), rz = () => b.z0 + Math.random() * (b.z1 - b.z0);
    this.t += dt;
    // spawn rates are per second
    const want = (rate) => { let n = rate * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
    if (m === 'day') {
      for (let i = want(14); i--;) this.soft.emit(rx(), 0.4 + Math.random() * 2.5, rz(), 0.25 + Math.random() * 0.2, (Math.random() - 0.4) * 0.1, (Math.random() - 0.5) * 0.15, 7 + Math.random() * 5, 1, 0.97, 0.85, 0.55, 0.05 + Math.random() * 0.04);
    } else if (m === 'night') {
      for (let i = want(9); i--;) this.glow.emit(rx(), 0.3 + Math.random() * 1.6, rz(), (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.25, 4 + Math.random() * 4, 1.4, 2.2, 0.6, 1, 0.08 + Math.random() * 0.06);
    } else if (m === 'ash') {
      for (let i = want(18); i--;) this.soft.emit(rx(), 3 + Math.random() * 3, rz(), 0.35 + Math.random() * 0.2, -0.25 - Math.random() * 0.2, (Math.random() - 0.5) * 0.2, 9 + Math.random() * 5, 0.42, 0.4, 0.4, 0.7, 0.05 + Math.random() * 0.05);
      for (let i = want(5); i--;) this.glow.emit(rx(), 0.2 + Math.random() * 1.2, rz(), 0.2 + Math.random() * 0.2, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, 2.5 + Math.random() * 2, 2.6, 1.0, 0.3, 1, 0.05 + Math.random() * 0.04);
    }
    // a gentle sway
    const sway = Math.sin(time * 0.7) * 0.003;
    for (const s of [this.soft, this.glow]) { for (let i = 0; i < s.n; i++) s.vel[i * 3] += sway; s.update(dt); }
    // fireflies blink
    if (m === 'night') for (let i = 0; i < this.glow.n; i++) this.glow.col[i * 4 + 3] *= 0.6 + 0.4 * Math.sin(time * 5 + i * 1.7) ** 2;
  }
  setScale(px) { for (const s of [this.soft, this.glow]) s.mat.uniforms.scale.value = px * 0.5; }
}
