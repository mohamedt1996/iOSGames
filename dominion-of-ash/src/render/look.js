import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Particles } from './particles.js';

// Shared visual polish: tinted baking, soft contact shadows and ambient air particles.

// a lush, slightly varied tint for ground tiles (the kit's grass reads yellow under ACES)
export function grassTint(r) {
  const k = 0.86 + r() * 0.12, g = 0.9 + r() * 0.05;
  return [0.72 * k, g * k, 0.68 * k + r() * 0.04];
}

// Merge baked parts into one mesh per material, keeping a per-part vertex colour tint.
export function bakeParts(parts, group, { shadows = true } = {}) {
  const by = new Map();
  for (const p of parts) { const k = p.material.uuid; if (!by.has(k)) by.set(k, { mat: p.material, g: [] }); by.get(k).g.push(p); }
  const meshes = [];
  for (const { mat, g } of by.values()) {
    const norm = g.map((p) => {
      const y = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
      for (const a of Object.keys(y.attributes)) if (!['position', 'normal', 'uv'].includes(a)) y.deleteAttribute(a);
      // tint, plus baked occlusion: tile cliffs darken toward the water line
      const t = p.tint || [1, 1, 1], pos = y.attributes.position, n = pos.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const h = pos.getY(i);
        const ao = h >= -0.02 ? 1 : 0.42 + 0.58 * Math.pow(Math.max(0, Math.min(1, (h + 0.9) / 0.9)), 1.4);
        c[i * 3] = t[0] * ao; c[i * 3 + 1] = t[1] * ao; c[i * 3 + 2] = t[2] * ao;
      }
      y.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return y;
    });
    const merged = mergeGeometries(norm, false); if (!merged) continue;
    const m = mat.clone(); m.vertexColors = true; m.userData = { owned: true };
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
    blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2); blobGeo.userData.shared = true;
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


// ---------------------------------------------------------------------------------------------
// Water: one animated surface under the land tiles. Colour deepens away from shore, foam laps the
// cliffs, the sun glints off moving ripples. `land` is a list of [x, z] hex centres.
export class Water {
  constructor(parent, land, { pad = 30, y = -0.17, night = false } = {}) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of land) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const N = 256, W = x1 - x0, D = z1 - z0;
    // shore-distance mask: land hexes painted, then blurred into a soft gradient
    const a = new Float32Array(N * N);
    const R = 1.16 / W * N;
    for (const [x, z] of land) {
      const cx = (x - x0) / W * N, cz = (z - z0) / D * N, rz = 1.16 / D * N;
      for (let j = Math.floor(cz - rz); j <= cz + rz; j++) for (let i = Math.floor(cx - R); i <= cx + R; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const dx = (i - cx) / R, dz = (j - cz) / rz; if (dx * dx + dz * dz <= 1) a[j * N + i] = 1;
      }
    }
    const blur = (src, r) => {
      const t = new Float32Array(N * N), o = new Float32Array(N * N);
      for (let j = 0; j < N; j++) { let acc = 0; for (let i = -r; i < N + r; i++) { if (i + r < N) acc += src[j * N + Math.min(N - 1, i + r)]; if (i - r - 1 >= 0) acc -= src[j * N + i - r - 1]; if (i >= 0 && i < N) t[j * N + i] = acc / (2 * r + 1); } }
      for (let i = 0; i < N; i++) { let acc = 0; for (let j = -r; j < N + r; j++) { if (j + r < N) acc += t[Math.min(N - 1, j + r) * N + i]; if (j - r - 1 >= 0) acc -= t[(j - r - 1) * N + i]; if (j >= 0 && j < N) o[j * N + i] = acc / (2 * r + 1); } }
      return o;
    };
    let m = blur(blur(a, 3), 3);
    const far = blur(blur(a, 14), 14);
    const data = new Uint8Array(N * N * 4);
    for (let k = 0; k < N * N; k++) { data[k * 4] = Math.min(255, m[k] * 255); data[k * 4 + 1] = Math.min(255, far[k] * 400); data[k * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); tex.needsUpdate = true; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, mask: { value: null }, box: { value: new THREE.Vector4(x0, z0, W, D) },
      deep: { value: new THREE.Color() }, shallow: { value: new THREE.Color() }, foam: { value: new THREE.Color() }, sky: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0.6, 0.6, 0.4).normalize() }, sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    }]);
    this.uniforms.mask.value = tex;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, fog: true, transparent: false,
      vertexShader: `
        varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_vertex>
        uniform vec4 box;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = (w.xz - box.xy) / box.zw;
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float time; uniform sampler2D mask; uniform vec3 deep, shallow, foam, sky, sunDir, sunCol;
        varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float waves(vec2 p){ return n2(p*0.9 + vec2(time*0.25, time*0.18)) * 0.6 + n2(p*2.1 - vec2(time*0.35, -time*0.2)) * 0.3 + n2(p*4.7 + vec2(-time*0.5, time*0.4)) * 0.1; }
        void main(){
          vec2 m = texture2D(mask, vUv).rg;
          float shore = m.r, near = m.g;
          float e = 0.08; vec2 p = vW.xz;
          float c0 = waves(p), cx = waves(p + vec2(e, 0.0)), cz = waves(p + vec2(0.0, e));
          vec3 N = normalize(vec3((c0 - cx) * 2.2, 1.0, (c0 - cz) * 2.2));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 col = mix(deep, shallow, smoothstep(0.0, 0.85, near));
          col = mix(col, sky, fres * 0.55);
          vec3 Hh = normalize(sunDir + V);
          float spec = pow(max(dot(N, Hh), 0.0), 180.0) * 2.2 + pow(max(dot(N, Hh), 0.0), 24.0) * 0.12;
          col += sunCol * spec;
          // foam: a soft band hugging the cliffs plus moving lines that wash in
          float band = smoothstep(0.18, 0.55, shore) * (1.0 - smoothstep(0.75, 0.98, shore));
          float lines = smoothstep(0.55, 0.9, sin(shore * 26.0 - time * 1.6 + n2(p * 1.7) * 4.0) * 0.5 + 0.5) * smoothstep(0.05, 0.4, shore);
          float f = clamp(band * (0.55 + 0.45 * n2(p * 3.0 + time * 0.3)) + lines * 0.45 * (1.0 - shore), 0.0, 1.0);
          col = mix(col, foam, f * 0.85);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1).rotateX(-Math.PI / 2), mat);
    this.mesh.position.set(x0 + W / 2, y, z0 + D / 2); this.mesh.renderOrder = -1; this.mesh.name = 'water';
    parent.add(this.mesh);
    this.setMood(night);
  }
  setMood(night) {
    const u = this.uniforms;
    if (night) { u.deep.value.set(0x0b1a33); u.shallow.value.set(0x1f4e6b); u.foam.value.set(0x9fb6d6); u.sky.value.set(0x2a3558); u.sunCol.value.setRGB(0.6, 0.7, 1.0); }
    else { u.deep.value.set(0x1d5f9c); u.shallow.value.set(0x3fb6c9); u.foam.value.set(0xf4fbff); u.sky.value.set(0xa9d4ea); u.sunCol.value.setRGB(1, 0.94, 0.82); }
  }
  update(time, sunDir) { this.uniforms.time.value = time; if (sunDir) this.uniforms.sunDir.value.copy(sunDir); }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.uniforms.mask.value.dispose(); }
}

// ---------------------------------------------------------------------------------------------
// Grass tufts and wildflowers: one instanced draw call, swaying in the wind on the GPU.
let tuftGeo = null;
function tuftGeometry() {
  if (tuftGeo) return tuftGeo;
  const pos = [], col = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + Math.random() * 0.6, r = 0.04 + Math.random() * 0.05;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, h = 0.12 + Math.random() * 0.12, w = 0.022;
    const lx = Math.cos(a) * (r + 0.07), lz = Math.sin(a) * (r + 0.07);
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, lx, h, lz);
    col.push(0.22, 0.3, 0.16, 0.22, 0.3, 0.16, 0.62, 0.74, 0.36);
  }
  tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tuftGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tuftGeo.computeVertexNormals();
  // blades face up for lighting so they read like the ground they grow from
  const nrm = tuftGeo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return tuftGeo;
}
export class Foliage {
  // spots: [{ x, z, y = 0, n = 8, radius = 0.85 }]
  constructor(parent, spots, rand = Math.random) {
    const list = [];
    for (const s of spots) for (let i = 0; i < (s.n ?? 8); i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (s.radius ?? 0.85);
      list.push([s.x + Math.cos(a) * d, s.y ?? 0, s.z + Math.sin(a) * d * 0.92]);
    }
    this.uniforms = { time: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = this.uniforms.time;
      sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float sway = sin(time * 1.7 + ip.x * 0.7 + ip.z * 0.45) * 0.5 + sin(time * 3.1 + ip.x * 1.9) * 0.25;
        transformed.x += sway * 0.06 * position.y / 0.25; transformed.z += sway * 0.03 * position.y / 0.25;`);
    };
    mat.customProgramCacheKey = () => 'tuft-sway';
    const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, Math.max(1, list.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    const FLOWERS = [0xffe066, 0xffffff, 0xff9ec7, 0xb99cff];
    list.forEach(([x, y, z], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28); const s = 0.75 + rand() * 0.7; sc.set(s, s * (0.8 + rand() * 0.5), s);
      m4.compose(new THREE.Vector3(x, y, z), q, sc); mesh.setMatrixAt(i, m4);
      if (rand() < 0.06) c.setHex(FLOWERS[Math.floor(rand() * FLOWERS.length)]).multiplyScalar(1.6);
      else c.setRGB(0.8 + rand() * 0.15, 0.95 + rand() * 0.1, 0.7 + rand() * 0.1);
      mesh.setColorAt(i, c);
    });
    mesh.count = list.length; mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false; mesh.name = 'foliage';
    this.mesh = mesh; parent.add(mesh);
  }
  update(time) { this.uniforms.time.value = time; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.dispose(); this.mesh.material.dispose(); this.mesh.material.userData.done = true; }
}

// ---------------------------------------------------------------------------------------------
// Sky dome with a horizon glow toward the sun (replaces the flat gradient background).
export class Sky {
  constructor(scene) {
    this.u = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.6, 0.35, 0.5).normalize() }, sunCol: { value: new THREE.Color() }, glow: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 top, mid, bottom, sunDir, sunCol; uniform float glow; varying vec3 vD;
        void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.6)) : mix(mid, bottom, pow(-y, 0.4));
          float s = max(dot(normalize(vD), sunDir), 0.0);
          c += sunCol * (pow(s, 8.0) * 0.35 + pow(s, 400.0) * 3.0) * glow;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }
  setMood(night) {
    const u = this.u;
    if (night) { u.top.value.set(0x070b18); u.mid.value.set(0x223056); u.bottom.value.set(0x141a2c); u.sunCol.value.setRGB(0.5, 0.6, 0.9); u.glow.value = 0.5; }
    else { u.top.value.set(0x3f7fc4); u.mid.value.set(0xcfe3ee); u.bottom.value.set(0x9fb8c6); u.sunCol.value.setRGB(1.0, 0.82, 0.55); u.glow.value = 1; }
  }
  follow(camera) { this.mesh.position.copy(camera.position); }
}

// Gentle rim light on characters so they separate from the ground at small sizes.
export function addRim(material, color = 0xfff1d6, strength = 0.32) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.rimCol = { value: new THREE.Color(color).multiplyScalar(strength) };
    sh.fragmentShader = 'uniform vec3 rimCol;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
      totalEmissiveRadiance += rimCol * rimF;`);
  };
  material.customProgramCacheKey = () => 'rim';
}

// ---------------------------------------------------------------------------------------------
// GPU memory hygiene. Everything loaded by Assets is marked shared and survives; per-screen geometry,
// cloned materials, skeleton bone textures and textures marked `owned` are freed when a screen closes.
export function disposeTree(root) {
  if (!root) return;
  root.parent?.remove(root);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k]?.userData?.owned) m[k].dispose();
      m.dispose();
    }
  });
}
export function markShared(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.userData.shared = true;
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.userData.shared = true;
  });
}
