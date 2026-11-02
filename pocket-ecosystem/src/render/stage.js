import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { R } from '../sim/world.js';
import { woodTexture, dropletTexture, skyCanvas, paintBackdrop, shaftTexture, fabricTexture } from './textures.js';
import { Terrain } from './terrain.js';
import { Flora } from './flora.js';
import { Fauna } from './fauna.js';
import { Particles } from './particles.js';
import { Post, QUALITY } from './post.js';

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));

export class Stage {
  constructor(container, quality = 'high') {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene(); this.scene = scene; scene.background = new THREE.Color(0x3a2f26);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.12).texture;
    scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
    this.post = new Post(renderer, scene, this.camera);

    this.buildRoom();
    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5640, 0.6); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -1.5; sc.right = 1.5; sc.top = 1.6; sc.bottom = -1.4; sc.near = 0.5; sc.far = 14;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target); this.sun = sun;
    this.rim = new THREE.DirectionalLight(0xbcd4ff, 0.6); this.rim.position.set(-3, 2, -3); scene.add(this.rim);
    this.lampLight = new THREE.SpotLight(0xffd29a, 0, 6, 0.6, 0.6, 1.2);
    this.lampLight.position.set(-0.9, 2.2, 0.6); this.lampLight.target.position.set(0, 0, 0);
    scene.add(this.lampLight); scene.add(this.lampLight.target);
    this.fireflyLight = new THREE.PointLight(0xfff0a0, 0, 1.6, 1.5); scene.add(this.fireflyLight);
    this.buildLamp();

    // jar root: tilts with the phone, the jar inside rotates with the player
    this.tiltRoot = new THREE.Group(); scene.add(this.tiltRoot);
    this.jar = new THREE.Group(); this.tiltRoot.add(this.jar);
    this.buildGlass();

    // particles (in jar space so they turn with it)
    this.fx = new Particles(this.jar, { max: 700, additive: false, gravity: -0.9, drag: 1.2 });
    this.glowFx = new Particles(this.jar, { max: 500, additive: true, gravity: 0.05, drag: 0.8 });
    this.dripFx = new Particles(this.tiltRoot, { max: 200, additive: false, gravity: -0.25, drag: 3 });

    this.raycaster = new THREE.Raycaster();
    this.cam = { zoom: 1.6, pitch: 0.85, yaw: 0, intro: 0, introDur: 0, orbit: 0 };
    this.setQuality(quality);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.qualityName = name; this.q = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.glassMat.transmission = q.transmission ? 1 : 0;
    this.glassMat.opacity = q.transmission ? 1 : 0.16;
    this.glassMat.transparent = !q.transmission;
    this.glassMat.needsUpdate = true;
    this.post.setup(q);
    this.resize();
  }

  buildRoom() {
    const scene = this.scene;
    // painted view outside the window
    const [skyC, skyG] = skyCanvas(); this.skyC = skyC; this.skyG = skyG;
    this.skyTex = new THREE.CanvasTexture(skyC); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial({ map: this.skyTex, toneMapped: false, fog: false }));
    back.position.set(0, 2.6, -5.2); scene.add(back); this.back = back;
    // wall with the window opening, painted plaster
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.95 }); this.wallMat = wallMat;
    const wall = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallMat); m.position.set(x, y, -4.7); m.receiveShadow = true; scene.add(m); };
    wall(6, 12, -6.6, 2.5); wall(6, 12, 6.6, 2.5); wall(8, 3, 0, 8.3);
    // window frame and mullions
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.6 });
    const mk = (w, h, x, y, d = 0.12) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat); m.position.set(x, y, -4.55); m.castShadow = true; scene.add(m); };
    mk(0.12, 9, 0, 2.5); mk(7.4, 0.12, 0, 3.0); mk(0.3, 9.2, -3.65, 2.5, 0.25); mk(0.3, 9.2, 3.65, 2.5, 0.25); mk(7.6, 0.3, 0, 6.9, 0.25);
    // linen curtains catching the light
    const fab = fabricTexture();
    const curtainMat = new THREE.MeshStandardMaterial({ map: fab, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
    const curtain = (x) => {
      const g = new THREE.PlaneGeometry(1.6, 8, 24, 1); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.08);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, curtainMat); m.position.set(x, 2.8, -4.3); scene.add(m);
    };
    curtain(-3.2); curtain(3.2);
    // oak sill
    const wood = woodTexture(); wood.repeat.set(3, 2);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(16, 0.24, 12), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.45, metalness: 0, envMapIntensity: 0.6 }));
    sill.position.set(0, -0.34, 1.2); sill.receiveShadow = true; scene.add(sill);
    // a small potted cactus and a book for scale, out of focus on the sill
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.32, 24), new THREE.MeshStandardMaterial({ color: 0xb4654a, roughness: 0.8 }));
    pot.position.set(-2.3, -0.06, -2.4); pot.castShadow = true; scene.add(pot);
    const cac = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 6, 12), new THREE.MeshStandardMaterial({ color: 0x4f7a43, roughness: 0.7 }));
    cac.position.set(-2.3, 0.33, -2.4); cac.castShadow = true; scene.add(cac);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.62), new THREE.MeshStandardMaterial({ color: 0x2d4a57, roughness: 0.7 }));
    book.position.set(2.2, -0.15, -2.1); book.rotation.y = 0.35; book.castShadow = true; scene.add(book);
    const book2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.56), new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 0.8 }));
    book2.position.set(2.18, -0.03, -2.1); book2.rotation.y = 0.2; book2.castShadow = true; scene.add(book2);
    // light shafts through the window
    const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide, fog: false });
    this.shaftMat = shaftMat; this.shafts = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + i * 0.25, 7), shaftMat);
      m.position.set(1.3 + i * 0.6, 2.2, -2.6 + i * 0.35); m.rotation.set(0, -0.3, 0.55 + i * 0.04);
      this.shafts.add(m);
    }
    scene.add(this.shafts);
    // dust motes drifting in the window light
    const N = 160, mp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) mp.set([(Math.random() - 0.3) * 4, Math.random() * 3.5 - 0.2, -Math.random() * 3.6], i * 3);
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.012, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false; scene.add(this.motes);
  }

  buildLamp() {
    const g = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.85, roughness: 0.28 });
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 32, 1, true), brass); shade.material.side = THREE.DoubleSide;
    shade.rotation.z = 0.5;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 8), brass); arm.position.set(-0.25, 0.6, 0); arm.rotation.z = 0.25;
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x5a5040, emissive: new THREE.Color(0xffe2a0), emissiveIntensity: 0 });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), this.bulbMat);
    this.bulb.position.set(0.02, -0.08, 0);
    g.add(shade, arm, this.bulb); g.position.set(-0.95, 2.15, 0.6);
    g.visible = false; this.lampObj = g; this.scene.add(g);
  }

  buildGlass() {
    const pts = [];
    const H = 1.55;
    pts.push(new THREE.Vector2(R * 0.98, -0.28));
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, y = -0.28 + t * H;
      const r = t < 0.62 ? R * 1.0 : R * (1.0 - Math.pow((t - 0.62) / 0.38, 2) * 0.48);
      pts.push(new THREE.Vector2(r + 0.012, y));
    }
    pts.push(new THREE.Vector2(R * 0.52 + 0.025, H - 0.24)); pts.push(new THREE.Vector2(R * 0.52 + 0.035, H - 0.2)); pts.push(new THREE.Vector2(R * 0.52 + 0.03, H - 0.16));
    const lathe = new THREE.LatheGeometry(pts, 96);
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4fbf8, roughness: 0.07, metalness: 0, transmission: 1, thickness: 0.04, ior: 1.5,
      attenuationColor: new THREE.Color(0xd8efe6), attenuationDistance: 1.5, specularIntensity: 0.8, envMapIntensity: 0.75,
      clearcoat: 0.6, clearcoatRoughness: 0.08, side: THREE.FrontSide, depthWrite: false,
    });
    this.glass = new THREE.Mesh(lathe, this.glassMat); this.glass.renderOrder = 10;
    this.tiltRoot.add(this.glass);
    // inner surface catches reflections on the far side
    this.innerMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.05, side: THREE.BackSide, depthWrite: false, envMapIntensity: 1.6 });
    const inner = new THREE.Mesh(lathe, this.innerMat); inner.renderOrder = 8; this.tiltRoot.add(inner);
    // condensation shell
    const drops = dropletTexture(); drops.repeat.set(5, 2);
    this.fogMat = new THREE.MeshStandardMaterial({ map: drops, transparent: true, opacity: 0, depthWrite: false, roughness: 0.15, color: 0xffffff, side: THREE.BackSide });
    const fog = new THREE.Mesh(lathe.clone().scale(0.994, 1, 0.994), this.fogMat); fog.renderOrder = 9;
    this.tiltRoot.add(fog);
    // cork stopper with grain
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xb48a5c, roughness: 0.95 });
    corkMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float n = fract(sin(dot(floor(vViewPosition.xy*180.0), vec2(12.9898,78.233)))*43758.5453);
        diffuseColor.rgb *= 0.85 + n*0.3;`);
    };
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.53, R * 0.5, 0.2, 48), corkMat);
    cork.position.y = H - 0.13; cork.castShadow = true;
    this.cork = cork; this.corkY = cork.position.y; this.tiltRoot.add(cork);
    // thick glass foot
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.035, R * 1.055, 0.07, 96), new THREE.MeshPhysicalMaterial({ color: 0xd6ebe3, transmission: 1, thickness: 0.2, roughness: 0.08, ior: 1.5 }));
    base.position.y = -0.275; base.receiveShadow = true; this.tiltRoot.add(base); this.baseMesh = base;
  }

  attachWorld(w) {
    this.clearWorld();
    this.w = w;
    this.terrain = new Terrain(this.jar, w);
    this.flora = new Flora(this.jar);
    this.fauna = new Fauna(this.jar);
    this.fauna.glowMat.uniforms.scale.value = this.renderer.domElement.height * 0.55;
    this.accum = 1; this._skyStep = -1;
  }
  clearWorld() {
    const keep = new Set([this.fx?.points, this.glowFx?.points]);
    for (let i = this.jar.children.length - 1; i >= 0; i--) {
      const c = this.jar.children[i]; if (keep.has(c)) continue;
      this.jar.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.fx?.clear(); this.glowFx?.clear(); this.dripFx?.clear();
    this.w = null;
  }

  // camera choreography
  intro(dur = 2.2) { this.cam.intro = 0; this.cam.introDur = dur; this.cam.zoom = 1.75; this.cam.pitch = 0.95; }
  celebrate(on = true) { this.cam.orbit = on ? 1 : 0; }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.resize(w, h);
    const px = this.renderer.domElement.height;
    if (this.fauna) this.fauna.glowMat.uniforms.scale.value = px * 0.55;
    for (const f of [this.fx, this.glowFx, this.dripFx]) if (f) f.mat.uniforms.scale.value = px * 0.55;
  }

  // ---------- particle effects ----------
  burstMist(x, z) {
    const y0 = 1.1;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.28, r = Math.random() * 0.12;
      this.fx.emit(x + Math.cos(a) * r * 0.3, y0 + Math.random() * 0.1, z + Math.sin(a) * r * 0.3, Math.cos(a) * r * 1.2, -0.6 - Math.random() * 0.8, Math.sin(a) * r * 1.2, 1.2 + Math.random() * 0.5, 0.82, 0.9, 0.96, 0.75, 0.012 + Math.random() * 0.012);
    }
  }
  burstSeed(x, z, color) {
    const y = this.w ? this.w.heightAt(x, z) : 0.08;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.28, s = 0.1 + Math.random() * 0.25;
      this.fx.emit(x, y + 0.01, z, Math.cos(a) * s, 0.4 + Math.random() * 0.5, Math.sin(a) * s, 0.9 + Math.random() * 0.4, color.r, color.g, color.b, 0.9, 0.008 + Math.random() * 0.008);
    }
  }
  burstSparkle(x, z, color = { r: 1, g: 0.95, b: 0.7 }, n = 30, y) {
    y = y ?? (this.w ? this.w.heightAt(x, z) + 0.05 : 0.15);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 0.05 + Math.random() * 0.15;
      this.glowFx.emit(x, y, z, Math.cos(a) * s, 0.1 + Math.random() * 0.3, Math.sin(a) * s, 1 + Math.random(), color.r * 2, color.g * 2, color.b * 2, 0.9, 0.01 + Math.random() * 0.015);
    }
  }
  burstPrune(x, z) {
    const y = this.w ? this.w.heightAt(x, z) + 0.03 : 0.1;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.28, s = 0.15 + Math.random() * 0.3;
      this.fx.emit(x, y, z, Math.cos(a) * s, 0.3 + Math.random() * 0.4, Math.sin(a) * s, 0.8 + Math.random() * 0.5, 0.45, 0.55 + Math.random() * 0.2, 0.25, 1, 0.009 + Math.random() * 0.006);
    }
  }
  drip() {
    // a bead rolling down the inside of the glass
    const a = Math.random() * 6.28, y = 0.3 + Math.random() * 0.7;
    this.dripFx.emit(Math.cos(a) * R * 0.99, y, Math.sin(a) * R * 0.99, 0, -0.15, 0, 1.6, 0.9, 0.95, 1, 0.8, 0.014);
  }
  celebrationTick(dt) {
    if (Math.random() < dt * 30) {
      const a = Math.random() * 6.28, r = Math.random() * 0.8;
      const hue = Math.random();
      const col = new THREE.Color().setHSL(hue < 0.5 ? 0.12 : 0.9, 0.8, 0.7);
      this.glowFx.emit(Math.cos(a) * r, 0.1 + Math.random() * 0.2, Math.sin(a) * r, 0, 0.25 + Math.random() * 0.3, 0, 2.5, col.r * 2, col.g * 2, col.b * 2, 0.9, 0.012 + Math.random() * 0.012);
    }
  }

  updateSky(hour, windowLight) { paintBackdrop(this.skyC, this.skyG, hour, windowLight); this.skyTex.needsUpdate = true; }

  render(dt, time, opts = {}) {
    const w = this.w;
    let night = 0;
    if (w) {
      // camera: framing + intro ease + optional slow orbit
      const c = this.cam;
      if (c.introDur) {
        c.intro += dt; const t = ease(c.intro / c.introDur);
        c.zoom = 1.75 + (1 - 1.75) * t; c.pitch = 0.95 + (0.5 - 0.95) * t;
        if (c.intro >= c.introDur) c.introDur = 0;
      } else { c.zoom += (1 - c.zoom) * Math.min(1, dt * 3); c.pitch += ((opts.pitch ?? 0.5) - c.pitch) * Math.min(1, dt * 3); }
      if (c.orbit) c.yaw += dt * 0.25; else c.yaw += (Math.round(c.yaw / (Math.PI * 2)) * Math.PI * 2 - c.yaw) * Math.min(1, dt * 2);
      const aspect = this.camera.aspect, z = (opts.zoom ?? 1) * c.zoom;
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
      const pitch = opts.pitch != null && !c.introDur ? c.pitch : c.pitch;
      const sway = Math.sin(time * 0.21) * 0.015;
      this.camera.position.set(Math.sin(c.yaw + sway) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + 0.2, Math.cos(c.yaw + sway) * Math.cos(pitch) * dist);
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
      this.sun.position.set(Math.cos(Math.max(0.15, elev) * 1.1) * 4 * Math.cos(az), Math.max(0.3, elev * 4), -Math.sin(az) * 2.5 - 1.5);
      const day = Math.max(0, elev);
      this.sun.intensity = Math.pow(day, 0.7) * 3.2 * w.windowLight;
      const warm = 1 - Math.min(1, day * 2.2);
      this.sun.color.setRGB(1, 0.95 - warm * 0.28, 0.86 - warm * 0.45);
      night = Math.max(0, Math.min(1, -elev * 3 + 0.3));
      this.hemi.intensity = 0.45 + 0.5 * day * w.windowLight - night * 0.1;
      this.hemi.color.setRGB(0.78 - night * 0.38, 0.84 - night * 0.3, 1);
      this.rim.intensity = 0.25 + night * 0.5;
      this.scene.environmentIntensity = 0.14 + 0.32 * day;
      this.wallMat.color.setRGB(0.85 - night * 0.45, 0.83 - night * 0.42, 0.78 - night * 0.3);
      this.shaftMat.opacity = Math.max(0, Math.min(1, (day - 0.15) * 1.4)) * 0.18 * w.windowLight;
      this.motes.material.opacity = this.shaftMat.opacity * 3.5;
      const mp = this.motes.geometry.attributes.position;
      for (let i = 0; i < mp.count; i++) { let y = mp.getY(i) + dt * 0.03 * (0.5 + (i % 7) / 7); if (y > 3.4) y = -0.2; mp.setY(i, y); mp.setX(i, mp.getX(i) + Math.sin(time * 0.3 + i) * dt * 0.01); }
      mp.needsUpdate = true;
      const step = Math.floor(hour * 4);
      if (step !== this._skyStep) { this._skyStep = step; this.updateSky(hour, w.windowLight); }
      // lamp
      this.lampObj.visible = (w.level.inventory?.lamp ?? 0) > 0;
      this.lampLight.intensity += ((w.lamp ? 14 : 0) - this.lampLight.intensity) * Math.min(1, dt * 5);
      this.bulbMat.emissiveIntensity += ((w.lamp ? 4 : 0) - this.bulbMat.emissiveIntensity) * Math.min(1, dt * 5);
      // vent
      this.cork.position.y += ((w.vent ? this.corkY + 0.14 : this.corkY) - this.cork.position.y) * Math.min(1, dt * 5);
      this.cork.rotation.z += ((w.vent ? 0.25 : 0) - this.cork.rotation.z) * Math.min(1, dt * 5);
      // condensation and drips
      const fog = Math.min(0.9, w.glass * 1100 + Math.max(0, w.rh - 0.8) * 1.2);
      this.fogMat.opacity += (fog - this.fogMat.opacity) * Math.min(1, dt * 1.5);
      if (Math.random() < dt * fog * 3) this.drip();
      // fireflies light up the jar
      let glowN = 0, gx = 0, gy = 0, gz = 0;
      for (const cr of w.creatures) if (cr.type === 'firefly' && cr.glow > 0.3) { glowN++; gx += cr.x; gy += cr.y; gz += cr.z; }
      this.fireflyLight.intensity += ((glowN ? Math.min(3, glowN * 0.4) : 0) - this.fireflyLight.intensity) * Math.min(1, dt * 3);
      if (glowN) { const p = new THREE.Vector3(gx / glowN, gy / glowN + 0.1, gz / glowN); this.jar.localToWorld(p); this.fireflyLight.position.copy(p); }
      // world visuals
      this.accum += dt;
      if (this.accum > 0.2) { this.accum = 0; this.terrain.update(time); }
      this.terrain.animate(dt, time, w.flowRate || 0);
      this.flora.update(w, dt, time);
      this.fauna.update(w, dt, time);
      if (this.cam.orbit) this.celebrationTick(dt);
      this.fx.update(dt); this.glowFx.update(dt); this.dripFx.update(dt);
    }
    this.post.render(dt, time, night);
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

  dispose() { window.removeEventListener('resize', this._onResize); this.post.dispose(); this.renderer.dispose(); }
}
