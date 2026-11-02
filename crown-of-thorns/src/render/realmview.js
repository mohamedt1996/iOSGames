import * as THREE from 'three';
import { Assets } from './assets.js';
import { Particles } from './particles.js';
import { cardBack, cardFace } from './cardtex.js';
import { toWorld, dist } from '../core/hex.js';
import { mulberry32 } from '../core/rng.js';
import { HOUSES } from '../game/realm.js';
import { bakeParts, grassTint, blobShadow, Atmosphere } from './look.js';

const M = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
const SHOW = { knight: ['1H_Sword', 'Round_Shield'], barbarian: ['2H_Axe'], rogue: ['2H_Crossbow'], mage: ['2H_Staff'], rogue_hooded: ['Knife', 'Knife_Offhand'] };

// The kingdom on the table: baked land, coloured holdings, soldiers, face-down cards and threat arrows.
let dashTex = null;
function dashTexture() {
  if (dashTex) return dashTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0); grd.addColorStop(0, 'rgba(255,255,255,0.25)'); grd.addColorStop(0.55, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0.25)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 8);
  dashTex = new THREE.CanvasTexture(c); dashTex.wrapS = THREE.RepeatWrapping; return dashTex;
}

export class RealmView {
  constructor(scene, realm) {
    this.scene = scene; this.r = realm;
    this.group = new THREE.Group(); scene.add(this.group);
    const parts = [], add = (n, m, tint) => { for (const p of Assets.bakedGeometries(n, m)) parts.push({ ...p, tint }); };
    const rand = mulberry32(realm.cfg.seed ?? 3);
    let R = 0;
    for (const p of realm.provinces) {
      const [x, z] = toWorld(p.q, p.r); p.x = x; p.z = z; R = Math.max(R, dist([0, 0], [p.q, p.r]));
      const rot = Math.floor(rand() * 6) * Math.PI / 3;
      add('hex_grass', M(x, 0, z, rot), p.type === 'farm' ? grassTint(rand).map((v, i) => v * [1.08, 1.0, 0.85][i]) : grassTint(rand));
      if (p.type === 'forest') { add(['trees_A_large', 'trees_B_large', 'trees_A_medium'][Math.floor(rand() * 3)], M(x + 0.3, 0, z - 0.2, rot, 0.9)); add('trees_B_small', M(x - 0.5, 0, z + 0.4, rot, 0.8)); }
      else if (p.type === 'hills') add(['hills_A_trees', 'hills_B', 'hills_C_trees'][Math.floor(rand() * 3)], M(x, 0, z, rot, 0.95));
      else if (p.type === 'farm') { add('building_grain', M(x + 0.45, 0, z + 0.35, rot, 0.9)); add('building_grain', M(x - 0.5, 0, z - 0.3, rot + 1, 0.8)); }
      else if (p.type === 'plain' && rand() < 0.6) add(['tree_single_A', 'rock_single_B', 'tree_single_B', 'rock_single_D'][Math.floor(rand() * 4)], M(x + (rand() - 0.5) * 1.2, 0, z + (rand() - 0.5) * 1.2, rot, 0.8));
    }
    this.R = R;
    // sea and far shores
    for (let q = -R - 5; q <= R + 5; q++) for (let r = -R - 5; r <= R + 5; r++) {
      const d = dist([0, 0], [q, r]); if (d > R + 5) continue;
      const cell = realm.grid.get(q, r); if (cell?.land) continue;
      const [x, z] = toWorld(q, r);
      add('hex_water', M(x, 0, z));
      if (d >= R + 4) { add('hex_grass', M(x, 0, z), grassTint(rand).map((v) => v * 0.85)); add(rand() < 0.5 ? 'mountain_A_grass_trees' : 'hills_A_trees', M(x, 0, z, rand() * 6, 0.9)); }
      else if (rand() < 0.04) add('waterlily_A', M(x, 0, z, rand() * 6));
    }
    this.bake(parts);
    // outline ring geometry
    const sh = new THREE.Shape(), hole = new THREE.Path();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const o = [Math.cos(a) * 1.13, Math.sin(a) * 1.13], n = [Math.cos(a) * 0.98, Math.sin(a) * 0.98]; i ? sh.lineTo(...o) : sh.moveTo(...o); i ? hole.lineTo(...n) : hole.moveTo(...n); }
    sh.holes.push(hole);
    this.ringGeo = new THREE.ShapeGeometry(sh); this.ringGeo.rotateX(Math.PI / 2);
    const fill = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const o = [Math.cos(a) * 1.12, Math.sin(a) * 1.12]; i ? fill.lineTo(...o) : fill.moveTo(...o); }
    this.fillGeo = new THREE.ShapeGeometry(fill); this.fillGeo.rotateX(Math.PI / 2);
    this.prov = new Map();
    for (const p of realm.provinces) {
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      ring.position.set(p.x, 0.04, p.z); this.group.add(ring);
      const hl = new THREE.Mesh(this.fillGeo, new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0, depthWrite: false }));
      hl.position.set(p.x, 0.05, p.z); this.group.add(hl);
      this.prov.set(p.id, { ring, hl, site: null, siteKey: '', figs: [], figKey: '' });
    }
    this.mixers = new Set();
    this.tokens = new Map();
    this.fx = new Particles(this.group, { max: 700, additive: true, gravity: 0.8, drag: 1.2 });
    this.dust = new Particles(this.group, { max: 300, additive: false, gravity: -0.6, drag: 2 });
    this.anims = [];
    const B = R * 1.8 + 2;
    this.air = new Atmosphere(this.group, { x0: -B, x1: B, z0: -B, z1: B }, 'day');
    this.glints = new Particles(this.group, { max: 140, additive: true, gravity: 0, drag: 0 });
    this.sea = [];
    for (let q = -R - 4; q <= R + 4; q++) for (let r = -R - 4; r <= R + 4; r++) { const d = dist([0, 0], [q, r]); const c = realm.grid.get(q, r); if (d <= R + 3 && !c?.land) this.sea.push(toWorld(q, r)); }
    this.sync();
  }

  bake(parts) { this.ground = bakeParts(parts, this.group); }

  kitColor(owner) { return owner ? HOUSES[owner].kit : null; }
  site(p) {
    const col = this.kitColor(p.owner) || 'yellow';
    const g = new THREE.Group();
    const put = (n, x, z, s = 1, ry = 0) => { const o = Assets.prop(n); o.position.set(x, 0, z); o.scale.setScalar(s); o.rotation.y = ry; g.add(o); return o; };
    switch (p.type) {
      case 'crown': put(`building_castle_${col}`, 0, -0.1, 0.95); put(`building_tower_catapult_${col}`, -0.65, 0.45, 0.55); put(`building_tower_A_${col}`, 0.65, 0.45, 0.55); break;
      case 'castle': put(`building_castle_${col}`, 0, 0, p.seat ? 0.9 : 0.75); if (p.seat) put(`building_tower_B_${col}`, 0.7, 0.4, 0.5); break;
      case 'town': put(`building_market_${col}`, -0.3, 0.1, 0.65); put(`building_home_A_${col}`, 0.45, -0.35, 0.55, 1); put(`building_home_B_${col}`, 0.35, 0.5, 0.5, 2); break;
      case 'mine': put(`building_mine_${col}`, 0, 0, 0.7); put('resource_stone', 0.55, 0.45, 0.7); break;
      case 'farm': put(`building_windmill_${col}`, 0, 0, 0.6); break;
      default: if (!p.walls) return null;
    }
    for (let i = 0; i < p.walls; i++) put('wall_straight', Math.cos(i * 2.1 + 0.6) * 0.82, Math.sin(i * 2.1 + 0.6) * 0.82, 0.32, -i * 2.1 - 0.6 + Math.PI / 2);
    if (!p.owner) g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setRGB(0.55, 0.52, 0.5); } });
    if (p.owner && p.type !== 'plain' && p.type !== 'forest' && p.type !== 'hills') { const f = put(`flag_${col}`, -0.75, -0.35, 0.7); f.userData.flag = true; }
    g.position.set(p.x, 0, p.z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  figure(model) {
    const c = Assets.character(model);
    c.root.scale.setScalar(0.3);
    c.root.traverse((o) => { if (o.parent && /handslot/.test(o.parent.name)) o.visible = (SHOW[model] || []).includes(o.name); });
    const a = c.actions.Idle_Combat || c.actions.Idle; a?.play(); if (a) a.time = Math.random() * 2;
    this.mixers.add(c.mixer);
    c.root.userData.c = c;
    const blob = blobShadow(2.6, 0.45); c.root.add(blob);
    return c.root;
  }

  sync() {
    for (const p of this.r.provinces) {
      const v = this.prov.get(p.id);
      const sk = `${p.owner}|${p.walls}`;
      if (sk !== v.siteKey) { if (v.site) this.group.remove(v.site); v.site = this.site(p); if (v.site) this.group.add(v.site); v.siteKey = sk; }
      v.ring.material.color.set(p.owner ? HOUSES[p.owner].color : '#ffffff');
      v.ring.material.opacity = p.owner ? 0.9 : 0.1;
      const n = p.owner ? Math.min(3, 1 + Math.floor(p.troops / 5)) : 0;
      const fk = `${p.owner}|${n}`;
      if (fk !== v.figKey) {
        for (const f of v.figs) { this.group.remove(f); this.mixers.delete(f.userData.c.mixer); }
        v.figs = [];
        const hasSite = !!v.site && !['plain', 'forest', 'hills'].includes(p.type);
        for (let i = 0; i < n; i++) {
          const f = this.figure(HOUSES[p.owner].model);
          const a = i * 2.1 + 2.4, rr = hasSite ? 0.62 : 0.3 + (i ? 0.25 : 0);
          f.position.set(p.x + Math.cos(a) * rr, 0, p.z + Math.sin(a) * rr + (hasSite ? 0.1 : 0)); f.rotation.y = Math.PI * 0.15 + i * 0.4;
          this.group.add(f); v.figs.push(f);
        }
        v.figKey = fk;
      }
    }
  }

  highlight(ids, color = 0xffe39a) { for (const [id, v] of this.prov) { const on = ids?.has(id); v.hl.material.color.setHex(color); v.hl.userData.on = on; if (!on) v.hl.material.opacity = 0; } }

  // ---------------- cards on the table ----------------
  addToken(pl) {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.62, 0.025, 0.86);
    const back = new THREE.MeshStandardMaterial({ map: cardBack(HOUSES[pl.house].color), roughness: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x1b1410 });
    const face = new THREE.MeshStandardMaterial({ map: cardFace(pl.card), roughness: 0.7 });
    // box faces: +x -x +y -y +z -z ; +y shows the back (face-down), -y the face
    const card = new THREE.Mesh(geo, [edge, edge, back, face, edge, edge]); card.castShadow = true;
    g.add(card);
    const t = this.r.prov(pl.target ?? this.r.placements[pl.spyOn]?.target ?? 0);
    const stack = [...this.tokens.values()].filter((x) => x.pid === t.id).length;
    g.position.set(t.x + 0.15 * stack, 1.25 + stack * 0.12, t.z - 0.2 + stack * 0.08);
    g.rotation.x = -0.5; g.scale.setScalar(1.5);
    this.group.add(g);
    const tok = { g, card, pl, pid: t.id, t0: performance.now() / 1000, flip: 0, flipping: false };
    if (pl.kind === 'threat') {
      const s = this.r.prov(pl.from);
      const a = new THREE.Vector3(s.x, 0.3, s.z), b = new THREE.Vector3(t.x, 0.3, t.z);
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = 1.2 + a.distanceTo(b) * 0.15;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b.clone().lerp(a, 0.12));
      const tex = dashTexture().clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(2, a.distanceTo(b) * 1.6), 1);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.07, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(HOUSES[pl.house].color).multiplyScalar(1.6), map: tex, transparent: true, opacity: 0.95, depthWrite: false }));
      tube.userData.tex = tex;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(HOUSES[pl.house].color).multiplyScalar(1.6), transparent: true }));
      const end = curve.getPoint(1), before = curve.getPoint(0.94);
      tip.position.copy(end); tip.lookAt(end.clone().add(end.clone().sub(before))); tip.rotateX(Math.PI / 2);
      this.group.add(tube, tip); tok.arrow = [tube, tip];
    }
    if (pl.kind === 'spy') { card.material[2].color.setRGB(0.7, 0.7, 0.9); }
    this.tokens.set(pl.idx, tok);
    return tok;
  }
  reveal(idx) { const t = this.tokens.get(idx); if (t) t.flipping = true; }
  peek(idx) { const t = this.tokens.get(idx); if (t) t.peek = 1; }
  clearTokens() { for (const t of this.tokens.values()) { this.group.remove(t.g); if (t.arrow) this.group.remove(...t.arrow); } this.tokens.clear(); }

  // ---------------- resolution animations ----------------
  march(fromId, toId, house, n, won) {
    const s = this.r.prov(fromId), t = this.r.prov(toId);
    const k = Math.min(4, 1 + Math.floor(n / 4));
    for (let i = 0; i < k; i++) {
      const f = this.figure(HOUSES[house].model);
      const c = f.userData.c; c.actions.Idle_Combat?.stop(); c.actions.Idle?.stop(); (c.actions.Running_A || c.actions.Walking_A)?.play();
      const off = new THREE.Vector3((i % 2 - 0.5) * 0.4, 0, Math.floor(i / 2) * 0.35);
      f.position.set(s.x + off.x, 0, s.z + off.z); f.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
      this.group.add(f);
      this.anims.push({ f, from: new THREE.Vector3(s.x + off.x, 0, s.z + off.z), to: new THREE.Vector3(t.x + off.x * 0.6, 0, t.z + off.z * 0.6), t: -i * 0.08, dur: 1.1, won, house, pid: toId });
    }
  }
  burst(x, y, z, n, col, speed = 3, life = 0.7, size = 0.12, sys = this.fx) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.3, sp = speed * (0.4 + Math.random() * 0.6); sys.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 0.6, Math.sin(a) * Math.cos(e) * sp, life * (0.6 + Math.random() * 0.8), col[0], col[1], col[2], 1, size * (0.6 + Math.random() * 0.8)); }
  }
  clash(pid) { const p = this.r.prov(pid); this.burst(p.x, 0.6, p.z, 60, [2.4, 1.5, 0.6], 4, 0.6, 0.12); this.burst(p.x, 0.2, p.z, 24, [0.5, 0.45, 0.4], 1.6, 1.2, 0.3, this.dust); }
  sparkle(pid, col) { const p = this.r.prov(pid); this.burst(p.x, 0.8, p.z, 40, col, 2, 1, 0.1); }

  update(dt, time) {
    for (const m of this.mixers) m.update(dt);
    for (const t of this.tokens.values()) {
      const age = time - t.t0;
      if (t.flipping && t.flip < 1) t.flip = Math.min(1, t.flip + dt * 2.2);
      const lift = t.flip > 0 && t.flip < 1 ? Math.sin(t.flip * Math.PI) * 0.6 : 0;
      t.g.position.y = 1.45 + Math.sin(age * 2 + t.pl.idx) * 0.06 + lift;
      t.card.rotation.z = t.flip * Math.PI;
      t.g.rotation.y = Math.sin(age * 0.7 + t.pl.idx) * 0.15;
      if (t.peek) { t.peek = Math.max(0, t.peek - dt * 0.3); t.card.material[2].emissive = new THREE.Color(0x6a5aff).multiplyScalar(t.peek * 0.6); }
      if (t.arrow) t.arrow[0].userData.tex.offset.x = -age * 1.2;
      if (t.arrow) t.arrow[0].material.opacity = t.flip >= 1 && t.pl.card === 'feint' ? Math.max(0.15, 0.9 - (t.flip - 0) * 0.6) : 0.85 + Math.sin(age * 4) * 0.1;
    }
    this.anims = this.anims.filter((a) => {
      a.t += dt; if (a.t < 0) return true;
      const k = Math.min(1, a.t / a.dur);
      a.f.position.lerpVectors(a.from, a.to, k); a.f.position.y = Math.abs(Math.sin(k * Math.PI * 4)) * 0.06;
      if (k >= 1) { this.group.remove(a.f); this.mixers.delete(a.f.userData.c.mixer); return false; }
      return true;
    });
    for (const v of this.prov.values()) if (v.hl.userData.on) v.hl.material.opacity = 0.28 + Math.sin(time * 4) * 0.12;
    this.fx.update(dt); this.dust.update(dt);
    this.air.update(dt, time);
    if (this.sea.length && Math.random() < dt * 30) { const [x, z] = this.sea[Math.floor(Math.random() * this.sea.length)]; this.glints.emit(x + (Math.random() - 0.5) * 1.6, 0.12, z + (Math.random() - 0.5) * 1.6, 0, 0, 0, 0.8 + Math.random() * 0.6, 1.6, 1.7, 1.8, 0.9, 0.06 + Math.random() * 0.05); }
    this.glints.update(dt);
  }

  pick(point) {
    const c = this.r.grid.at(point.x, point.z);
    return c && c.land ? this.r.prov(c.pid) : null;
  }
  project(camera, w, h) {
    const v = new THREE.Vector3(), out = [];
    for (const p of this.r.provinces) { v.set(p.x, 0.15, p.z + 0.55); v.project(camera); out.push({ p, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }); }
    return out;
  }
  setScale(px) { for (const p of [this.fx, this.dust, this.glints]) p.mat.uniforms.scale.value = px * 0.5; this.air.setScale(px); }
  dispose() { this.scene.remove(this.group); this.mixers.clear(); }
}
