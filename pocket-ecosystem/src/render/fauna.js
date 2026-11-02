import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowSprite } from './textures.js';

const MAX = 64;

function paint(g, fn) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c.set(v, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function snailGeo() {
  const shell = new THREE.TorusGeometry(0.0135, 0.0095, 10, 24, Math.PI * 1.85); shell.rotateY(Math.PI / 2); shell.translate(0, 0.022, 0);
  const core = new THREE.SphereGeometry(0.0105, 12, 10); core.translate(0, 0.022, 0);
  const stripes = (x, y, z) => { const a = Math.atan2(y - 0.022, z); const band = Math.sin(a * 5 + Math.hypot(y - 0.022, z) * 400); return band > 0.55 ? [0.45, 0.28, 0.16] : band < -0.7 ? [0.95, 0.8, 0.55] : [0.72, 0.5, 0.3]; };
  const body = new THREE.CapsuleGeometry(0.0062, 0.032, 6, 10); body.rotateZ(Math.PI / 2); body.scale(1, 0.8, 1); body.translate(0.007, 0.005, 0);
  const parts = [paint(body, (x, y) => (y < 0.003 ? [0.62, 0.55, 0.45] : [0.78, 0.7, 0.58]))];
  for (const sz of [0.003, -0.003]) {
    const st = new THREE.CylinderGeometry(0.0011, 0.0011, 0.015, 5); st.rotateZ(-0.45); st.translate(0.027, 0.014, sz);
    const eye = new THREE.SphereGeometry(0.0018, 6, 4); eye.translate(0.031, 0.021, sz);
    parts.push(paint(st, () => [0.72, 0.64, 0.52]), paint(eye, () => [0.15, 0.12, 0.1]));
  }
  return { shell: mergeGeometries([paint(shell, stripes), paint(core, stripes)]), body: mergeGeometries(parts) };
}
function pillbugGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.SphereGeometry(0.0085 - Math.abs(i - 3) * 0.0008, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    s.scale(0.5, 0.82, 1); s.translate(-0.015 + i * 0.005, 0.001, 0);
    const tone = i % 2 ? [0.42, 0.41, 0.45] : [0.5, 0.49, 0.53];
    parts.push(paint(s, (x, y, z) => (Math.abs(z) > 0.006 ? [0.62, 0.58, 0.55] : tone)));
  }
  for (const sz of [1, -1]) { const a = new THREE.CylinderGeometry(0.0006, 0.0006, 0.009, 3); a.rotateZ(1.2); a.rotateY(sz * 0.5); a.translate(0.02, 0.003, sz * 0.003); parts.push(paint(a, () => [0.3, 0.3, 0.32])); }
  return mergeGeometries(parts);
}
function fireflyGeo() {
  const b = new THREE.CapsuleGeometry(0.0028, 0.006, 3, 8); b.rotateZ(Math.PI / 2); b.translate(0.002, 0, 0);
  const tail = new THREE.SphereGeometry(0.0032, 8, 6); tail.scale(1.3, 1, 1); tail.translate(-0.005, -0.0005, 0);
  const w1 = new THREE.CircleGeometry(0.0055, 8); w1.scale(1.6, 0.6, 1); w1.rotateX(-Math.PI / 2); w1.rotateY(0.5); w1.translate(-0.001, 0.003, 0.004);
  const w2 = new THREE.CircleGeometry(0.0055, 8); w2.scale(1.6, 0.6, 1); w2.rotateX(-Math.PI / 2); w2.rotateY(-0.5); w2.translate(-0.001, 0.003, -0.004);
  return mergeGeometries([paint(b, () => [0.25, 0.2, 0.17]), paint(tail, () => [1.4, 1.3, 0.5]), paint(w1, () => [0.75, 0.72, 0.65]), paint(w2, () => [0.75, 0.72, 0.65])]);
}
function frogGeo() {
  const spots = (x, y, z) => { const s = Math.sin(x * 260) * Math.sin(z * 230) * Math.sin(y * 180); return y < 0.014 ? [0.85, 0.82, 0.55] : s > 0.45 ? [0.22, 0.32, 0.12] : [0.42, 0.62, 0.22]; };
  const body = new THREE.SphereGeometry(0.03, 18, 14); body.scale(1.2, 0.7, 1); body.translate(0, 0.02, 0);
  const head = new THREE.SphereGeometry(0.021, 16, 12); head.scale(1.1, 0.72, 1.2); head.translate(0.03, 0.026, 0);
  const parts = [paint(body, spots), paint(head, spots)];
  for (const sz of [1, -1]) {
    const e = new THREE.SphereGeometry(0.0078, 10, 8); e.translate(0.035, 0.039, sz * 0.012);
    const pu = new THREE.SphereGeometry(0.0042, 8, 6); pu.scale(0.6, 1, 1); pu.translate(0.0418, 0.04, sz * 0.0135);
    const l = new THREE.CapsuleGeometry(0.0068, 0.03, 4, 8); l.rotateZ(Math.PI / 2); l.rotateY(sz * 0.6); l.translate(-0.02, 0.008, sz * 0.025);
    const f = new THREE.CapsuleGeometry(0.004, 0.016, 3, 6); f.rotateZ(Math.PI / 2 + 0.6); f.rotateY(-sz * 0.4); f.translate(0.032, 0.006, sz * 0.02);
    parts.push(paint(e, () => [0.95, 0.78, 0.25]), paint(pu, () => [0.05, 0.05, 0.05]), paint(l, spots), paint(f, spots));
  }
  return mergeGeometries(parts);
}

export class Fauna {
  constructor(parent) {
    this.group = new THREE.Group(); parent.add(this.group);
    const sg = snailGeo();
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, MAX); m.count = 0; m.castShadow = true; m.frustumCulled = false; this.group.add(m); return m; };
    this.snailShell = mk(sg.shell, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    this.snailBody = mk(sg.body, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
    this.pillbug = mk(pillbugGeo(), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
    this.firefly = mk(fireflyGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, transparent: false }));
    this.gnat = mk(new THREE.SphereGeometry(0.0028, 5, 4), new THREE.MeshBasicMaterial({ color: 0x1e1b19 }));
    this.frog = mk(frogGeo(), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 }));
    this.egg = mk(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.3 }));
    // firefly glow
    const pg = new THREE.BufferGeometry();
    this.glowPos = new Float32Array(MAX * 3); this.glowSize = new Float32Array(MAX);
    pg.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3));
    pg.setAttribute('size', new THREE.BufferAttribute(this.glowSize, 1));
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowSprite() }, scale: { value: 300 } },
      vertexShader: 'attribute float size; uniform float scale; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/ -mv.z; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb*vec3(2.6,2.3,1.1), c.a); }',
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
