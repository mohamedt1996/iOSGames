import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Post, QUALITY } from './post.js';
import { skyTexture } from './textures.js';
import { Assets } from './assets.js';

// Renderer, lights, sky and an RTS camera rig shared by the war map and battles.
export class Stage {
  constructor(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9; r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.1).texture;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.post = new Post(r, this.scene, this.camera);
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x5a4a38, 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = true; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0x9ab8ff, 0.5); this.fill.position.set(-20, 15, -10); this.scene.add(this.fill);
    this.clouds = new THREE.Group(); this.scene.add(this.clouds);
    this.rig = { tx: 0, tz: 0, dist: 26, yaw: 0, pitch: 0.95, minD: 9, maxD: 42, bounds: null, shake: 0 };
    this.raycaster = new THREE.Raycaster();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.setQuality('high');
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high; this.qualityName = name;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.post.setup(q); this.resize();
  }

  setMood(night) {
    this.night = night;
    this.scene.background = skyTexture(night);
    this.scene.fog = new THREE.Fog(night ? 0x1a2036 : 0xb9cbd8, 45, 120);
    this.hemi.intensity = night ? 0.45 : 0.75; this.hemi.color.set(night ? 0x8ea0ff : 0xdfe8ff);
    this.sun.intensity = night ? 0.7 : 1.9; this.sun.color.set(night ? 0x9fb4ff : 0xfff6ea);
    this.scene.environmentIntensity = night ? 0.15 : 0.3;
    this.fill.intensity = night ? 0.25 : 0.5;
  }

  addClouds(spread = 40, n = 10) {
    this.clouds.clear();
    for (let i = 0; i < n; i++) {
      const c = Assets.prop(Math.random() < 0.5 ? 'cloud_big' : 'cloud_small');
      c.position.set((Math.random() - 0.5) * spread * 2, 23 + Math.random() * 4, (Math.random() - 0.5) * spread * 2);
      c.scale.setScalar(2 + Math.random() * 2); c.userData.v = 0.3 + Math.random() * 0.4;
      c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      this.clouds.add(c);
    }
    this.cloudSpread = spread;
  }

  frame(bounds, dist) {
    this.rig.bounds = bounds; this.rig.tx = (bounds.x0 + bounds.x1) / 2; this.rig.tz = (bounds.z0 + bounds.z1) / 2 + 2;
    if (dist) this.rig.dist = dist;
    const s = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0);
    const sc = this.sun.shadow.camera; sc.left = -s * 0.7; sc.right = s * 0.7; sc.top = s * 0.7; sc.bottom = -s * 0.7; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post.resize(w, h);
    this.onResize?.(this.renderer.domElement.height);
  }

  pan(dx, dy) {
    const k = this.rig.dist * 0.0022;
    const c = Math.cos(this.rig.yaw), s = Math.sin(this.rig.yaw);
    this.rig.tx -= (dx * c + dy * s) * k; this.rig.tz -= (-dx * s + dy * c) * k;
    this.clamp();
  }
  zoom(f) { this.rig.dist = Math.max(this.rig.minD, Math.min(this.rig.maxD, this.rig.dist * f)); }
  rotate(da) { this.rig.yaw += da; }
  clamp() { const b = this.rig.bounds; if (!b) return; this.rig.tx = Math.max(b.x0, Math.min(b.x1, this.rig.tx)); this.rig.tz = Math.max(b.z0, Math.min(b.z1 + 4, this.rig.tz)); }

  updateCamera(dt) {
    const r = this.rig;
    const pitch = r.pitch - (r.dist - r.minD) / (r.maxD - r.minD) * 0.05;
    const sh = r.shake > 0 ? r.shake : 0; r.shake = Math.max(0, r.shake - dt * 1.5);
    const jx = (Math.random() - 0.5) * sh * 0.4, jz = (Math.random() - 0.5) * sh * 0.4;
    this.camera.position.set(r.tx + Math.sin(r.yaw) * Math.cos(pitch) * r.dist + jx, Math.sin(pitch) * r.dist, r.tz + Math.cos(r.yaw) * Math.cos(pitch) * r.dist + jz);
    this.camera.lookAt(r.tx, 0, r.tz);
    // sun follows the view so shadows stay crisp where you look
    this.sun.position.set(r.tx + 18, 30, r.tz + 10); this.sun.target.position.set(r.tx, 0, r.tz);
    for (const c of this.clouds.children) { c.position.x += c.userData.v * dt; if (c.position.x > (this.cloudSpread || 40) + r.tx) c.position.x = r.tx - (this.cloudSpread || 40); }
  }

  render(dt, time) { this.updateCamera(dt); this.post.render(dt, time, this.night ? 1 : 0); }

  ground(clientX, clientY, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (objects) { const h = this.raycaster.intersectObjects(objects, false)[0]; if (h) return h.point; }
    const p = new THREE.Vector3(); this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return p;
  }
}
