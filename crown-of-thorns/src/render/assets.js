import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Loads the CC0 KayKit models (by Kay Lousberg) and hands out clones.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const BASE = './models/';

function load(file) {
  if (!cache.has(file)) cache.set(file, new Promise((res, rej) => loader.load(BASE + file, res, undefined, rej)));
  return cache.get(file);
}

export const Assets = {
  kit: null, weapons: null, chars: {},
  async init(onProgress) {
    const files = ['hexkit.glb', 'weapons.glb', 'knight.glb', 'barbarian.glb', 'rogue.glb', 'rogue_hooded.glb', 'mage.glb'];
    let done = 0;
    const res = await Promise.all(files.map((f) => load(f).then((g) => { onProgress?.(++done / files.length); return [f, g]; })));
    for (const [f, g] of res) {
      if (f === 'hexkit.glb') this.kit = indexKit(g.scene);
      else if (f === 'weapons.glb') this.weapons = indexKit(g.scene);
      else this.chars[f.replace('.glb', '')] = g;
    }
    for (const m of Object.values(this.kit)) m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  },
  // a static model from the hex kit (shared geometry/materials)
  prop(name) {
    const src = this.kit[name] || this.weapons[name];
    if (!src) { console.warn('missing model', name); return new THREE.Group(); }
    return src.clone(true);
  },
  has(name) { return !!(this.kit[name] || this.weapons?.[name]); },
  // an animated character: returns { root, mixer, actions }
  character(model) {
    const g = this.chars[model];
    const root = SkeletonUtils.clone(g.scene);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (o.material) { o.material = o.material.clone(); } } });
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
    return { root, mixer, actions };
  },
  // collect meshes of a kit model with world transforms baked, for merging into static batches
  bakedGeometries(name, matrix) {
    const src = this.kit[name]; if (!src) return [];
    const out = [];
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const g = toFloat(o.geometry.clone());
      const m = new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld);
      g.applyMatrix4(m);
      out.push({ geometry: g, material: o.material });
    });
    return out;
  },
};

// quantized (meshopt) attributes would clamp when transformed: expand to float first
const GET = ['getX', 'getY', 'getZ', 'getW'];
function toFloat(g) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    if (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a[GET[k]](i);
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  return g;
}

function indexKit(scene) {
  const map = {};
  for (const child of scene.children) { map[child.name] = child; child.position.set(0, 0, 0); }
  return map;
}
