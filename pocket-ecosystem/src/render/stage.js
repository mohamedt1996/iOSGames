import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { R } from '../sim/world.js';
import { woodTexture, dropletTexture, skyCanvas } from './textures.js';
import { Terrain } from './terrain.js';
import { Flora } from './flora.js';
import { Fauna } from './fauna.js';

const SKY = [ // hour -> [top, bottom]
  [0, '#0d1630', '#1d2a48'], [5, '#1b2547', '#4a4a6a'], [6.5, '#6f86b5', '#f2b98c'], [9, '#8fb8dd', '#dfe9ea'],
  [15, '#8cb4da', '#e2ecec'], [18, '#6b7fae', '#f0a77b'], [19.5, '#2a3462', '#6b5a7a'], [21, '#0f1834', '#22304f'], [24, '#0d1630', '#1d2a48'],
];
function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) if (h >= SKY[i][0] && h <= SKY[i + 1][0]) {
    const t = (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
    return [new THREE.Color(SKY[i][1]).lerp(new THREE.Color(SKY[i + 1][1]), t), new THREE.Color(SKY[i][2]).lerp(new THREE.Color(SKY[i + 1][2]), t)];
  }
  return [new THREE.Color('#0d1630'), new THREE.Color('#1d2a48')];
}

export class Stage {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene(); this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50);
    this.camDist = 3.4; this.camPitch = 0.62;

    // window backdrop
    const [skyC, skyG] = skyCanvas(); this.skyC = skyC; this.skyG = skyG;
    this.skyTex = new THREE.CanvasTexture(skyC); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshBasicMaterial({ map: this.skyTex, toneMapped: false }));
    back.position.set(0, 2.2, -4.5); scene.add(back); this.back = back;
    // window mullions
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 });
    const mk = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat); m.position.set(x, y, -4.4); scene.add(m); };
    mk(0.12, 9, 0, 2.2); mk(14, 0.12, 0, 2.6); mk(0.25, 9, -3.6, 2.2); mk(0.25, 9, 3.6, 2.2);
    // sill
    const wood = woodTexture(); wood.repeat.set(3, 2);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 6), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }));
    sill.position.set(0, -0.32, -1); sill.receiveShadow = true; scene.add(sill);

    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5640, 0.6); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -1.4; sc.right = 1.4; sc.top = 1.4; sc.bottom = -1.4; sc.near = 0.5; sc.far = 12;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target); this.sun = sun;
    this.lampLight = new THREE.SpotLight(0xffd29a, 0, 6, 0.6, 0.6, 1.2);
    this.lampLight.position.set(-0.9, 2.2, 0.6); this.lampLight.target.position.set(0, 0, 0);
    this.lampLight.castShadow = false; scene.add(this.lampLight); scene.add(this.lampLight.target);
    this.fireflyLight = new THREE.PointLight(0xfff0a0, 0, 1.4, 1.5); scene.add(this.fireflyLight);
    this.buildLamp();

    // jar root (tilts with the phone, rotates with the player)
    this.tiltRoot = new THREE.Group(); scene.add(this.tiltRoot);
    this.jar = new THREE.Group(); this.tiltRoot.add(this.jar);
    this.buildGlass();

    this.raycaster = new THREE.Raycaster();
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  buildLamp() {
    const g = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.8, roughness: 0.3 });
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 24, 1, true), brass); shade.material.side = THREE.DoubleSide;
    shade.rotation.z = 0.5;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 8), brass); arm.position.set(-0.25, 0.6, 0); arm.rotation.z = 0.25;
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5a5040 }));
    this.bulb.position.set(0.02, -0.08, 0);
    g.add(shade, arm, this.bulb); g.position.set(-0.95, 2.15, 0.6);
    g.visible = false; this.lampObj = g; this.scene.add(g);
  }

  buildGlass() {
    // cloche-shaped jar profile
    const pts = [];
    const H = 1.55;
    pts.push(new THREE.Vector2(R * 0.98, -0.28));
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, y = -0.28 + t * H;
      const r = t < 0.62 ? R * 1.0 : R * (1.0 - Math.pow((t - 0.62) / 0.38, 2) * 0.48);
      pts.push(new THREE.Vector2(r + 0.01, y));
    }
    pts.push(new THREE.Vector2(R * 0.52 + 0.02, H - 0.25)); pts.push(new THREE.Vector2(R * 0.52 + 0.02, H - 0.17));
    const lathe = new THREE.LatheGeometry(pts, 72);
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe9f4f0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.03,
      side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6, specularIntensity: 1,
    });
    this.glass = new THREE.Mesh(lathe, this.glassMat); this.glass.renderOrder = 10;
    this.tiltRoot.add(this.glass);
    // condensation shell
    const drops = dropletTexture(); drops.repeat.set(5, 2);
    this.fogMat = new THREE.MeshStandardMaterial({ map: drops, transparent: true, opacity: 0, depthWrite: false, roughness: 0.2, color: 0xffffff, side: THREE.BackSide });
    const fog = new THREE.Mesh(lathe.clone().scale(0.995, 1, 0.995), this.fogMat); fog.renderOrder = 9;
    this.tiltRoot.add(fog);
    // cork
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.53, R * 0.5, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0xb48a5c, roughness: 0.9 }));
    cork.position.y = H - 0.15; cork.castShadow = true;
    this.cork = cork; this.corkY = cork.position.y; this.tiltRoot.add(cork);
    // glass base rim
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.06, 0.06, 64), new THREE.MeshPhysicalMaterial({ color: 0xcfe3dc, transparent: true, opacity: 0.35, roughness: 0.1 }));
    base.position.y = -0.27; this.tiltRoot.add(base);
  }

  attachWorld(w) {
    this.clearWorld();
    this.w = w;
    this.terrain = new Terrain(this.jar, w);
    this.flora = new Flora(this.jar);
    this.fauna = new Fauna(this.jar);
    this.fauna.glowMat.uniforms.scale.value = this.renderer.domElement.height * 0.55;
    this.accum = 1;
  }
  clearWorld() {
    while (this.jar.children.length) {
      const c = this.jar.children.pop();
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.w = null;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // portrait: pull back so the whole jar fits the width
    this.camDistBase = w / h < 0.7 ? 3.0 + (0.7 - w / h) * 3.2 : 3.0;
    this.camera.updateProjectionMatrix();
    if (this.fauna) this.fauna.glowMat.uniforms.scale.value = this.renderer.domElement.height * 0.55;
  }

  updateSky(hour, windowLight) {
    const [top, bot] = skyAt(hour);
    const dim = 0.55 + 0.45 * Math.min(1, windowLight);
    const g = this.skyG, c = this.skyC;
    const grd = g.createLinearGradient(0, 0, 0, c.height);
    grd.addColorStop(0, `#${top.clone().multiplyScalar(dim).getHexString()}`);
    grd.addColorStop(1, `#${bot.clone().multiplyScalar(dim).getHexString()}`);
    g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
    this.skyTex.needsUpdate = true;
  }

  render(dt, time, opts = {}) {
    const w = this.w;
    if (w) {
      // camera
      const aspect = this.camera.aspect, z = opts.zoom ?? 1;
      let dist, ty;
      if (aspect < 1) {
        const hf = THREE.MathUtils.degToRad(34);
        const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / aspect));
        if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
        dist = (1.3 / Math.tan(hf / 2)) * z; ty = opts.lookY ?? 0.75;
      } else {
        if (this.camera.fov !== 38) { this.camera.fov = 38; this.camera.updateProjectionMatrix(); }
        dist = 3.9 * z; ty = opts.lookY ?? 0.35;
      }
      const pitch = opts.pitch ?? 0.5;
      this.camera.position.set(0, Math.sin(pitch) * dist + 0.2, Math.cos(pitch) * dist);
      this.camera.lookAt(0, ty, 0);
      // jar orientation and tilt feedback
      this.jar.rotation.y = -w.rot;
      this.tiltRoot.rotation.z += ((-w.tiltX * 0.07) - this.tiltRoot.rotation.z) * Math.min(1, dt * 6);
      this.tiltRoot.rotation.x += ((w.tiltZ * 0.07) - this.tiltRoot.rotation.x) * Math.min(1, dt * 6);
      // sun
      const hour = w.hour;
      const f = (w.time % 1440) / 1440;
      const elev = Math.sin(2 * Math.PI * (f - 0.25));
      const az = (f - 0.5) * 1.2;
      this.sun.position.set(Math.cos(Math.max(0.15, elev) * 1.1) * 4 * Math.cos(az), Math.max(0.3, elev * 4), -Math.sin(az) * 2.5 - 1);
      this.sun.intensity = Math.max(0, elev) * 3.0 * w.windowLight;
      const warm = 1 - Math.min(1, Math.max(0, elev) * 2.2);
      this.sun.color.setRGB(1, 0.94 - warm * 0.25, 0.85 - warm * 0.4);
      const nightK = Math.max(0, Math.min(1, -elev * 3 + 0.3));
      this.hemi.intensity = 0.5 + 0.5 * Math.max(0, elev) * w.windowLight - nightK * 0.12;
      this.hemi.color.setRGB(0.75 - nightK * 0.35, 0.82 - nightK * 0.3, 1);
      this.scene.environmentIntensity = 0.12 + 0.3 * Math.max(0, elev);
      if (Math.floor(hour * 6) !== this._skyStep) { this._skyStep = Math.floor(hour * 6); this.updateSky(hour, w.windowLight); }
      // lamp
      this.lampObj.visible = (w.level.inventory?.lamp ?? 0) > 0;
      this.lampLight.intensity += ((w.lamp ? 14 : 0) - this.lampLight.intensity) * Math.min(1, dt * 5);
      this.bulb.material.color.set(w.lamp ? 0xfff2c0 : 0x5a5040);
      // vent
      this.cork.position.y += ((w.vent ? this.corkY + 0.14 : this.corkY) - this.cork.position.y) * Math.min(1, dt * 5);
      this.cork.rotation.z += ((w.vent ? 0.25 : 0) - this.cork.rotation.z) * Math.min(1, dt * 5);
      // condensation
      const fog = Math.min(0.9, w.glass * 1100 + Math.max(0, w.rh - 0.8) * 1.2);
      this.fogMat.opacity += (fog - this.fogMat.opacity) * Math.min(1, dt * 1.5);
      // fireflies light up the jar a little
      let glowN = 0, gx = 0, gy = 0, gz = 0;
      for (const c of w.creatures) if (c.type === 'firefly' && c.glow > 0.3) { glowN++; gx += c.x; gy += c.y; gz += c.z; }
      this.fireflyLight.intensity += ((glowN ? Math.min(2.5, glowN * 0.35) : 0) - this.fireflyLight.intensity) * Math.min(1, dt * 3);
      if (glowN) { const p = new THREE.Vector3(gx / glowN, gy / glowN + 0.1, gz / glowN); this.jar.localToWorld(p); this.fireflyLight.position.copy(p); }
      // world visuals: terrain colors are throttled
      this.accum += dt;
      if (this.accum > 0.2) { this.accum = 0; this.terrain.update(time); }
      this.flora.update(w, dt, time);
      this.fauna.update(w, dt, time);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // screen point -> jar-local floor coordinates
  pick(clientX, clientY) {
    if (!this.terrain) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain.mesh, false)[0];
    if (!hit) return null;
    const p = this.jar.worldToLocal(hit.point.clone());
    return { x: p.x, z: p.z, world: hit.point };
  }

  dispose() { window.removeEventListener('resize', this._onResize); this.renderer.dispose(); }
}
