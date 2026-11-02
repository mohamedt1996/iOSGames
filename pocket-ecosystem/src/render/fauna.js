import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowSprite } from './textures.js';

const MAX = 64;

function snailGeo() {
  const shell = new THREE.TorusGeometry(0.014, 0.009, 8, 14, Math.PI * 1.8); shell.rotateY(Math.PI / 2); shell.translate(0, 0.022, 0);
  const shell2 = new THREE.SphereGeometry(0.011, 10, 8); shell2.translate(0, 0.022, 0);
  const body = new THREE.CapsuleGeometry(0.006, 0.03, 4, 8); body.rotateZ(Math.PI / 2); body.translate(0.006, 0.006, 0);
  const st1 = new THREE.CylinderGeometry(0.0012, 0.0012, 0.014, 4); st1.rotateZ(-0.4); st1.translate(0.026, 0.014, 0.003);
  const st2 = st1.clone(); st2.translate(0, 0, -0.006);
  return { shell: mergeGeometries([shell.toNonIndexed(), shell2.toNonIndexed()]), body: mergeGeometries([body.toNonIndexed(), st1.toNonIndexed(), st2.toNonIndexed()]) };
}
function pillbugGeo() {
  const parts = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.SphereGeometry(0.0085 - Math.abs(i - 2.5) * 0.0009, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); s.scale(0.55, 0.8, 1); s.translate(-0.013 + i * 0.0052, 0.001, 0); parts.push(s); }
  return mergeGeometries(parts);
}
function fireflyGeo() {
  const b = new THREE.CapsuleGeometry(0.003, 0.008, 3, 6); b.rotateZ(Math.PI / 2);
  const w1 = new THREE.PlaneGeometry(0.01, 0.005); w1.rotateX(-Math.PI / 2); w1.translate(-0.001, 0.003, 0.004);
  const w2 = w1.clone(); w2.translate(0, 0, -0.008);
  return mergeGeometries([b.toNonIndexed(), w1.toNonIndexed(), w2.toNonIndexed()]);
}
function frogGeo() {
  const body = new THREE.SphereGeometry(0.03, 12, 10); body.scale(1.2, 0.7, 1); body.translate(0, 0.02, 0);
  const head = new THREE.SphereGeometry(0.021, 10, 8); head.scale(1.1, 0.75, 1.2); head.translate(0.03, 0.026, 0);
  const e1 = new THREE.SphereGeometry(0.008, 8, 6); e1.translate(0.035, 0.04, 0.012);
  const e2 = e1.clone(); e2.translate(0, 0, -0.024);
  const legs = [];
  for (const sz of [-1, 1]) { const l = new THREE.CapsuleGeometry(0.007, 0.03, 3, 6); l.rotateZ(Math.PI / 2); l.rotateY(sz * 0.6); l.translate(-0.02, 0.008, sz * 0.025); legs.push(l.toNonIndexed()); }
  return mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), e1.toNonIndexed(), e2.toNonIndexed(), ...legs]);
}

export class Fauna {
  constructor(parent) {
    this.group = new THREE.Group(); parent.add(this.group);
    const sg = snailGeo();
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, MAX); m.count = 0; m.castShadow = true; m.frustumCulled = false; this.group.add(m); return m; };
    this.snailShell = mk(sg.shell, new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.35 }));
    this.snailBody = mk(sg.body, new THREE.MeshStandardMaterial({ color: 0xb7a58a, roughness: 0.4 }));
    this.pillbug = mk(pillbugGeo(), new THREE.MeshStandardMaterial({ color: 0x5c5a5e, roughness: 0.45, metalness: 0.1 }));
    this.firefly = mk(fireflyGeo(), new THREE.MeshStandardMaterial({ color: 0x2d2620, roughness: 0.6, side: THREE.DoubleSide }));
    this.gnat = mk(new THREE.SphereGeometry(0.0028, 5, 4), new THREE.MeshBasicMaterial({ color: 0x1e1b19 }));
    this.frog = mk(frogGeo(), new THREE.MeshStandardMaterial({ color: 0x6f8f3c, roughness: 0.3 }));
    this.egg = mk(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.3 }));
    // firefly glow
    const pg = new THREE.BufferGeometry();
    this.glowPos = new Float32Array(MAX * 3); this.glowSize = new Float32Array(MAX);
    pg.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3));
    pg.setAttribute('size', new THREE.BufferAttribute(this.glowSize, 1));
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowSprite() }, scale: { value: 300 } },
      vertexShader: 'attribute float size; uniform float scale; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/ -mv.z; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb*vec3(1.0,0.95,0.55), c.a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Points(pg, this.glowMat); this.glow.frustumCulled = false; this.glow.renderOrder = 5;
    this.group.add(this.glow);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.smooth = new Map();
  }

  update(w, dt, time) {
    const n = { snail: 0, pillbug: 0, firefly: 0, gnat: 0, frog: 0, egg: 0 };
    let gl = 0;
    const { m4, q, e, v, s } = this;
    const seen = new Set();
    for (const c of w.creatures) {
      seen.add(c.id);
      let sm = this.smooth.get(c.id);
      if (!sm) { sm = { x: c.x, y: c.y, z: c.z, h: c.heading, glow: 0 }; this.smooth.set(c.id, sm); }
      const k = Math.min(1, dt * 8);
      sm.x += (c.x - sm.x) * k; sm.y += (c.y - sm.y) * k; sm.z += (c.z - sm.z) * k;
      let dh = c.heading - sm.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; sm.h += dh * k;
      if (c.state === 'egg') { if (n.egg < MAX) { m4.compose(v.set(sm.x, sm.y + 0.003, sm.z), q.identity(), s.set(1, 1, 1)); this.egg.setMatrixAt(n.egg++, m4); } continue; }
      e.set(0, -sm.h, 0); q.setFromEuler(e);
      const dormant = c.state === 'dormant';
      if (c.type === 'snail' && n.snail < MAX) {
        const sc = 0.7 + Math.min(1, c.age / 2) * 0.5;
        m4.compose(v.set(sm.x, sm.y, sm.z), q, s.set(sc, sc, sc));
        this.snailShell.setMatrixAt(n.snail, m4);
        m4.compose(v.set(sm.x, sm.y, sm.z), q, s.set(dormant ? 0.001 : sc * (1 + Math.sin(time * 3 + c.id) * 0.04), dormant ? 0.001 : sc, dormant ? 0.001 : sc));
        this.snailBody.setMatrixAt(n.snail++, m4);
      } else if (c.type === 'pillbug' && n.pillbug < MAX) {
        const sc = dormant ? 0.7 : 0.8 + Math.min(1, c.age / 2) * 0.3;
        m4.compose(v.set(sm.x, sm.y, sm.z), q, s.set(sc, dormant ? sc * 1.3 : sc, dormant ? sc * 0.6 : sc));
        this.pillbug.setMatrixAt(n.pillbug++, m4);
      } else if (c.type === 'firefly' && n.firefly < MAX) {
        m4.compose(v.set(sm.x, sm.y, sm.z), q, s.set(1, 1, 1));
        this.firefly.setMatrixAt(n.firefly++, m4);
        sm.glow += ((c.glow > 0 ? c.glow * (0.6 + 0.4 * Math.sin(time * 2.2 + c.id * 1.7)) : 0) - sm.glow) * Math.min(1, dt * 4);
        if (sm.glow > 0.02) { this.glowPos.set([sm.x, sm.y + 0.002, sm.z], gl * 3); this.glowSize[gl++] = 0.22 * sm.glow; }
      } else if (c.type === 'gnat' && n.gnat < MAX) {
        m4.compose(v.set(sm.x, sm.y, sm.z), q, s.set(1, 1, 1)); this.gnat.setMatrixAt(n.gnat++, m4);
      } else if (c.type === 'frog' && n.frog < MAX) {
        const hop = Math.max(0, Math.sin(time * 4 + c.id)) * (Math.hypot(c.tx - c.x, c.tz - c.z) > 0.02 ? 0.02 : 0);
        m4.compose(v.set(sm.x, sm.y + hop, sm.z), q, s.set(1, 1, 1)); this.frog.setMatrixAt(n.frog++, m4);
      }
    }
    for (const id of this.smooth.keys()) if (!seen.has(id)) this.smooth.delete(id);
    const set = (m, c) => { m.count = c; m.instanceMatrix.needsUpdate = true; };
    set(this.snailShell, n.snail); set(this.snailBody, n.snail); set(this.pillbug, n.pillbug); set(this.firefly, n.firefly);
    set(this.gnat, n.gnat); set(this.frog, n.frog); set(this.egg, n.egg);
    this.glow.geometry.setDrawRange(0, gl);
    this.glow.geometry.attributes.position.needsUpdate = true; this.glow.geometry.attributes.size.needsUpdate = true;
  }
}
