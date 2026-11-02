import * as THREE from 'three';
import { G, R, CS } from '../sim/world.js';
import { strataTexture, soilTexture } from './textures.js';
import { mulberry32 } from '../sim/rng.js';

// Grid of vertices at cell centers; vertices outside the floor are pulled onto the rim.
function buildGrid(w) {
  const geo = new THREE.PlaneGeometry(2 * R - CS, 2 * R - CS, G - 1, G - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const map = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z), lim = R * 0.985;
    if (r > lim) { x *= lim / r; z *= lim / r; pos.setXYZ(i, x, 0, z); }
    let k = w.idx(x * 0.97, z * 0.97);
    if (k < 0) k = w.nearestInside(Math.floor((x + R) / CS), Math.floor((z + R) / CS));
    map[i] = k;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
  return { geo, map };
}

const SOILC = {
  dry: new THREE.Color(0xa88760), wet: new THREE.Color(0x4a3524), rich: new THREE.Color(0x2e2117),
  sand: new THREE.Color(0xd8c397), sandWet: new THREE.Color(0x9c8761), clay: new THREE.Color(0x8c7a6c), clayWet: new THREE.Color(0x5b4c42), rock: new THREE.Color(0x8a8780),
};
const LENS = {
  moisture: [new THREE.Color(0xc7a46a), new THREE.Color(0x2f6fa8)],
  light: [new THREE.Color(0x26304a), new THREE.Color(0xf5d26b)],
  nutrients: [new THREE.Color(0xb9ad8f), new THREE.Color(0x3f6b1f)],
};

export class Terrain {
  constructor(parent, w) {
    this.w = w;
    this.group = new THREE.Group(); parent.add(this.group);
    const { geo, map } = buildGrid(w);
    this.map = map;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: soilTexture(), bumpMap: null }));
    this.mesh.receiveShadow = true; this.mesh.name = 'terrain';
    this.group.add(this.mesh);
    const wg = buildGrid(w).geo;
    wg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(wg.attributes.position.count * 4), 4));
    this.water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, roughness: 0.12, metalness: 0.2, envMapIntensity: 0.5, depthWrite: false,
    }));
    this.water.renderOrder = 2;
    this.group.add(this.water);
    // soil cross-section seen through the glass
    const side = new THREE.CylinderGeometry(R * 0.985, R * 0.985, 0.3, 64, 1, true);
    side.translate(0, -0.15 + 0.06, 0);
    this.side = new THREE.Mesh(side, new THREE.MeshStandardMaterial({ map: strataTexture(), roughness: 1, side: THREE.DoubleSide }));
    this.side.material.map.repeat.set(10, 1);
    this.group.add(this.side);
    // rocks as pebbles
    const rnd = mulberry32(9);
    const rockGeo = new THREE.DodecahedronGeometry(0.05, 1);
    const rocks = []; for (const k of w.insideList) if (w.soil[k] === 3) rocks.push(k);
    if (rocks.length) {
      const rm = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.85, flatShading: true }), rocks.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      rocks.forEach((k, i) => {
        e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
        const s = 0.7 + rnd() * 0.6;
        m4.compose(new THREE.Vector3(w.cx[k], w.h[k] - 0.01, w.cz[k]), q, new THREE.Vector3(s, s * 0.7, s));
        rm.setMatrixAt(i, m4);
        rm.setColorAt(i, new THREE.Color().setHSL(0.08, 0.05 + rnd() * 0.05, 0.42 + rnd() * 0.2));
      });
      rm.castShadow = rm.receiveShadow = true;
      this.group.add(rm);
    }
    this.lens = 'natural';
    this.c = new THREE.Color();
    this.updateHeights();
  }

  updateHeights() {
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.w.h[this.map[i]]);
    pos.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
  }

  update(time) {
    const w = this.w, map = this.map, c = this.c;
    const col = this.mesh.geometry.attributes.color;
    const lens = LENS[this.lens];
    for (let i = 0; i < col.count; i++) {
      const k = map[i];
      if (lens) {
        const v = this.lens === 'moisture' ? w.m[k] : this.lens === 'light' ? Math.min(1, w.la[k] / 0.8) : Math.min(1, w.nu[k] / 0.8);
        c.copy(lens[0]).lerp(lens[1], v);
      } else {
        const st = w.soil[k], m = Math.min(1, w.m[k]);
        if (st === 1) c.copy(SOILC.sand).lerp(SOILC.sandWet, m);
        else if (st === 2) c.copy(SOILC.clay).lerp(SOILC.clayWet, m);
        else if (st === 3) c.copy(SOILC.rock);
        else { c.copy(SOILC.dry).lerp(SOILC.wet, Math.pow(m, 0.7)); c.lerp(SOILC.rich, Math.min(0.35, w.nu[k] * 0.3)); }
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    // water
    const wp = this.water.geometry.attributes.position, wc = this.water.geometry.attributes.color;
    for (let i = 0; i < wp.count; i++) {
      const k = map[i];
      const d = w.w[k];
      // pull nearby water so edges blend
      wp.setY(i, w.h[k] + Math.max(d, 0) - (d > 0.0015 ? 0 : 0.004) + 0.0015);
      let algae = 0; if (w.pType[k] === 7) algae = w.pBio[k];
      const a = Math.min(0.7, Math.sqrt(Math.max(0, d)) * 5.5);
      wc.setXYZW(i, 0.12 + algae * 0.05, 0.24 + algae * 0.16, 0.3 - algae * 0.18, a);
    }
    wp.needsUpdate = true; wc.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }
}
