import * as THREE from 'three';
import { G, R, CS } from '../sim/world.js';
import { strataTexture, soilTexture, rippleNormalTexture } from './textures.js';
import { mulberry32 } from '../sim/rng.js';

const RES = 64; // render grid resolution (sim is 28x28; fields are bilinearly upsampled)

// Smooth disc grid: each vertex samples the sim cells around it with bilinear weights.
function buildDisc(w, lift = 0) {
  const geo = new THREE.PlaneGeometry(2 * R, 2 * R, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, n = pos.count;
  const idx = new Int32Array(n * 4), wt = new Float32Array(n * 4);
  const lim = R * 0.985;
  for (let i = 0; i < n; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > lim) { x *= lim / r; z *= lim / r; pos.setX(i, x); pos.setZ(i, z); }
    const fx = (x + R) / CS - 0.5, fz = (z + R) / CS - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fz), u = fx - i0, v = fz - j0;
    const cells = [[i0, j0, (1 - u) * (1 - v)], [i0 + 1, j0, u * (1 - v)], [i0, j0 + 1, (1 - u) * v], [i0 + 1, j0 + 1, u * v]];
    let tot = 0;
    cells.forEach(([a, b, ww], q) => {
      a = Math.max(0, Math.min(G - 1, a)); b = Math.max(0, Math.min(G - 1, b));
      let k = b * G + a;
      if (!w.inside[k]) { k = w.nearestInside(a, b); ww *= 0.25; }
      idx[i * 4 + q] = k; wt[i * 4 + q] = ww; tot += ww;
    });
    for (let q = 0; q < 4; q++) wt[i * 4 + q] /= tot || 1;
  }
  return { geo, idx, wt };
}

const SOILC = {
  dry: new THREE.Color(0xb39470), wet: new THREE.Color(0x5a4230), rich: new THREE.Color(0x3e2c1e),
  sand: new THREE.Color(0xdcc89c), sandWet: new THREE.Color(0x8f7b57), clay: new THREE.Color(0x927f6f), clayWet: new THREE.Color(0x574840), rock: new THREE.Color(0x8a8780),
};
const LENS = {
  moisture: [new THREE.Color(0xd2b27a), new THREE.Color(0x2763a8)],
  light: [new THREE.Color(0x1f2945), new THREE.Color(0xf7d36a)],
  nutrients: [new THREE.Color(0xc2b697), new THREE.Color(0x356b1a)],
};

export class Terrain {
  constructor(parent, w) {
    this.w = w;
    this.group = new THREE.Group(); parent.add(this.group);
    const disc = buildDisc(w);
    this.idx = disc.idx; this.wt = disc.wt;
    const geo = disc.geo, n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('wet', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    const soilTex = soilTexture();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: soilTex, bumpMap: soilTex, bumpScale: 1.2 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float wet; varying float vWet;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = wet;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, smoothstep(0.55, 1.0, vWet));');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true; this.mesh.name = 'terrain';
    this.group.add(this.mesh);

    // water surface on the same grid, animated ripples via scrolling normal maps
    const wg = buildDisc(w).geo;
    wg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
    this.ripple = rippleNormalTexture(); this.ripple.repeat.set(5, 5);
    this.waterMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, transparent: true, roughness: 0.04, metalness: 0, ior: 1.33, specularIntensity: 1,
      normalMap: this.ripple, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1, depthWrite: false, clearcoat: 0.6,
    });
    this.waterUni = { time: { value: 0 }, flow: { value: 0 } };
    this.waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.wTime = this.waterUni.time; sh.uniforms.wFlow = this.waterUni.flow;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float wTime; uniform float wFlow;')
        .replace('#include <normal_fragment_maps>', `
          vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(wTime*0.021, wTime*0.013)*(1.0+wFlow*4.0)).xyz*2.0-1.0;
          vec3 n2 = texture2D(normalMap, vNormalMapUv*1.7 - vec2(wTime*0.017, -wTime*0.023)*(1.0+wFlow*4.0)).xyz*2.0-1.0;
          vec3 mapN = normalize(vec3((n1.xy+n2.xy)*normalScale*(1.0+wFlow*2.0), n1.z*n2.z));
          normal = normalize(tbn * mapN);`)
        .replace('#include <opaque_fragment>', `
          float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), -normal)*-1.0, 0.0, 1.0), 3.0);
          diffuseColor.a = clamp(diffuseColor.a + fres*0.35*step(0.02, diffuseColor.a), 0.0, 0.95);
          #include <opaque_fragment>`);
    };
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.renderOrder = 2;
    this.group.add(this.water);

    // soil cross-section seen through the glass
    const side = new THREE.CylinderGeometry(R * 0.985, R * 0.985, 0.32, 96, 1, true);
    side.translate(0, -0.16 + 0.06, 0);
    const st = strataTexture(); st.repeat.set(10, 1);
    this.side = new THREE.Mesh(side, new THREE.MeshStandardMaterial({ map: st, bumpMap: st, bumpScale: 2, roughness: 1, side: THREE.DoubleSide }));
    this.group.add(this.side);
    // rocks and scattered pebbles
    const rnd = mulberry32(9);
    const rockGeo = new THREE.DodecahedronGeometry(0.05, 2);
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) { const s = 1 + (Math.sin(rp.getX(i) * 90) * Math.cos(rp.getZ(i) * 70) + Math.sin(rp.getY(i) * 110)) * 0.08; rp.setXYZ(i, rp.getX(i) * s, rp.getY(i) * s, rp.getZ(i) * s); }
    rockGeo.computeVertexNormals();
    const rocks = []; for (const k of w.insideList) if (w.soil[k] === 3) rocks.push(k);
    const pebbles = []; for (const k of w.insideList) if (w.soil[k] !== 3 && rnd() < 0.05) pebbles.push(k);
    const all = [...rocks.map((k) => [k, 1]), ...pebbles.map((k) => [k, 0.22])];
    if (all.length) {
      const rm = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, map: soilTex }), all.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      all.forEach(([k, sz], i) => {
        e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
        const s = (0.7 + rnd() * 0.6) * sz;
        m4.compose(new THREE.Vector3(w.cx[k] + (rnd() - 0.5) * CS, w.h[k] - 0.01 * sz, w.cz[k] + (rnd() - 0.5) * CS), q, new THREE.Vector3(s, s * 0.7, s));
        rm.setMatrixAt(i, m4);
        rm.setColorAt(i, new THREE.Color().setHSL(0.08 + rnd() * 0.04, 0.06 + rnd() * 0.08, 0.38 + rnd() * 0.25));
      });
      rm.castShadow = rm.receiveShadow = true;
      this.group.add(rm);
    }
    this.lens = 'natural';
    this.cellCol = new Float32Array(G * G * 3);
    this.c = new THREE.Color();
    this.updateHeights();
  }

  sample(arr, i) { const o = i * 4, I = this.idx, W = this.wt; return arr[I[o]] * W[o] + arr[I[o + 1]] * W[o + 1] + arr[I[o + 2]] * W[o + 2] + arr[I[o + 3]] * W[o + 3]; }

  updateHeights() {
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.sample(this.w.h, i));
    pos.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }

  update(time) {
    const w = this.w, c = this.c, cc = this.cellCol;
    const lens = LENS[this.lens];
    for (const k of w.insideList) {
      if (lens) {
        const v = this.lens === 'moisture' ? w.m[k] : this.lens === 'light' ? Math.min(1, w.la[k] / 0.8) : Math.min(1, w.nu[k] / 0.8);
        c.copy(lens[0]).lerp(lens[1], v);
      } else {
        const st = w.soil[k], m = Math.min(1, w.m[k]);
        if (st === 1) c.copy(SOILC.sand).lerp(SOILC.sandWet, m);
        else if (st === 2) c.copy(SOILC.clay).lerp(SOILC.clayWet, m);
        else if (st === 3) c.copy(SOILC.rock);
        else { c.copy(SOILC.dry).lerp(SOILC.wet, Math.pow(m, 0.7)); c.lerp(SOILC.rich, Math.min(0.3, w.nu[k] * 0.25)); }
        if (w.mold[k] > 0.05) c.lerp(new THREE.Color(0xd9d6cc), w.mold[k] * 0.5);
      }
      cc[k * 3] = c.r; cc[k * 3 + 1] = c.g; cc[k * 3 + 2] = c.b;
    }
    const col = this.mesh.geometry.attributes.color, wet = this.mesh.geometry.attributes.wet;
    const I = this.idx, W = this.wt;
    for (let i = 0; i < col.count; i++) {
      let r = 0, g = 0, b = 0;
      for (let q = 0; q < 4; q++) { const k = I[i * 4 + q], ww = W[i * 4 + q]; r += cc[k * 3] * ww; g += cc[k * 3 + 1] * ww; b += cc[k * 3 + 2] * ww; }
      col.setXYZ(i, r, g, b);
      wet.setX(i, lens ? 0 : this.sample(w.m, i) + this.sample(w.w, i) * 40);
    }
    col.needsUpdate = true; wet.needsUpdate = true;
    // water
    const wp = this.water.geometry.attributes.position, wc = this.water.geometry.attributes.color;
    for (let i = 0; i < wp.count; i++) {
      const d = this.sample(w.w, i), h = this.sample(w.h, i);
      let algae = 0;
      for (let q = 0; q < 4; q++) { const k = I[i * 4 + q]; if (w.pType[k] === 7) algae += w.pBio[k] * W[i * 4 + q]; }
      wp.setY(i, h + d + (d > 0.0012 ? 0.0012 : -0.004));
      const a = Math.min(0.82, Math.sqrt(Math.max(0, d)) * 6.5);
      wc.setXYZW(i, 0.1 + algae * 0.08, 0.2 + algae * 0.2, 0.24 - algae * 0.14, a);
    }
    wp.needsUpdate = true; wc.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  animate(dt, time, flow) {
    this.waterUni.time.value = time;
    this.waterUni.flow.value += (Math.min(1, flow * 8) - this.waterUni.flow.value) * Math.min(1, dt * 3);
  }
}
