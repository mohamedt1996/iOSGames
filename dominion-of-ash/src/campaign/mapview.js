import * as THREE from 'three';
import { Assets } from '../render/assets.js';
import { ringTexture } from '../render/textures.js';
import { mulberry32 } from '../core/rng.js';
import { toWorld } from '../core/hex.js';
import { bakeParts, grassTint, blobShadow, Water, Foliage, disposeTree } from '../render/look.js';

const M = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
const COLOR = { ember: 'blue', ash: 'red', null: 'yellow' };
const RING = ringTexture();

// The 3D war map: baked terrain, ownership-coloured settlements, the army and Legion warbands.
export class MapView {
  constructor(scene, campaign) {
    this.scene = scene; this.c = campaign;
    this.group = new THREE.Group(); scene.add(this.group);
    const parts = [], add = (n, m, tint) => { for (const p of Assets.bakedGeometries(n, m)) parts.push({ ...p, tint }); };
    const r = mulberry32(campaign.s.seed);
    const G = () => grassTint(r);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const reg of campaign.grid) {
      const [x, z] = toWorld(reg.q, reg.r); reg.x = x; reg.z = z;
      const rot = Math.floor(r() * 6) * Math.PI / 3;
      if (reg.type !== 'sea') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      switch (reg.type) {
        case 'sea': if (r() < 0.06) add('waterlily_A', M(x, -0.17, z, rot)); break;
        case 'forest': add('hex_grass', M(x, 0, z, rot), G()); add(['trees_A_large', 'trees_B_large', 'trees_A_medium'][Math.floor(r() * 3)], M(x, 0, z, rot)); break;
        case 'hills': add('hex_grass', M(x, 0, z, rot), G()); add(['hills_A_trees', 'hills_B', 'hills_C_trees'][Math.floor(r() * 3)], M(x, 0, z, rot)); break;
        case 'mountain': add('hex_grass', M(x, 0, z, rot), G()); add(['mountain_A_grass_trees', 'mountain_B_grass', 'mountain_C_grass_trees'][Math.floor(r() * 3)], M(x, 0, z, rot)); break;
        case 'river': add('hex_river_crossing_A', M(x, 0, z, Math.PI / 6)); break;
        case 'marsh': add('hex_river_crossing_B', M(x, 0, z, rot)); add('waterplant_A', M(x + 0.4, 0, z, rot)); add('waterlily_B', M(x - 0.3, 0, z + 0.3, rot)); break;
        default: add('hex_grass', M(x, 0, z, rot), G()); if (reg.type === 'plains' && r() < 0.5) add(['tree_single_A', 'rock_single_B', 'building_grain', 'tree_single_B'][Math.floor(r() * 4)], M(x + (r() - 0.5), 0, z + (r() - 0.5), rot, 0.8));
      }
    }
    this.bounds = { x0, x1, z0, z1 };
    this.bake(parts);
    const land = [...campaign.grid].filter((g) => g.type !== 'sea');
    this.water = new Water(this.group, land.map((g) => [g.x, g.z]), { night: campaign.isNight() });
    this.foliage = new Foliage(this.group, land.filter((g) => ['plains', 'town', 'mine', 'shrine', 'river'].includes(g.type)).map((g) => ({ x: g.x, z: g.z, n: g.type === 'plains' ? 12 : 5 })), r);
    // settlements are live objects so their colours can change hands
    this.sites = new Map();
    // ownership tint and selection
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const p = [Math.cos(a) * 1.1, Math.sin(a) * 1.1]; i ? shape.lineTo(...p) : shape.moveTo(...p); }
    this.hexGeo = new THREE.ShapeGeometry(shape); this.hexGeo.rotateX(Math.PI / 2);
    this.edgeGeo = new THREE.EdgesGeometry(this.hexGeo);
    this.tints = new Map();
    for (const reg of campaign.grid) {
      if (reg.type === 'sea') continue;
      const m = new THREE.LineSegments(this.edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      m.position.set(reg.x, 0.06, reg.z); m.scale.setScalar(0.94); this.group.add(m); this.tints.set(reg, m);
    }
    this.reach = new THREE.Group(); this.group.add(this.reach);
    this.selMesh = new THREE.Mesh(this.hexGeo, new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0.25, depthWrite: false }));
    this.selMesh.visible = false; this.group.add(this.selMesh);
    // army
    this.army = this.figure('knight', 'flag_blue', 0.5, [['1H_Sword', 'Badge_Shield']]);
    this.bands = new Map();
    this.mixers = [];
    this.sync();
  }

  bake(parts) { this.ground = bakeParts(parts, this.group); }

  figure(model, flag, scale, show) {
    const g = new THREE.Group();
    const c = Assets.character(model);
    c.root.scale.setScalar(scale);
    c.root.traverse((o) => { if (o.parent && /handslot/.test(o.parent.name)) o.visible = show[0].includes(o.name); if (o.isMesh && /Eyes/.test(o.name) && /skeleton/.test(model)) { o.material.emissive = new THREE.Color(0x7bff9a); o.material.emissiveIntensity = 2.5; } });
    g.add(c.root); g.add(blobShadow(1.1));
    const a = c.actions.Idle_Combat || c.actions.Idle; a?.play();
    const f = Assets.prop(flag); f.position.set(-0.45, 0, -0.2); f.scale.setScalar(0.9); g.add(f);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: RING, color: flag === 'flag_blue' ? 0x6fa8ff : 0xff6a3a, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 0.05; g.add(ring);
    g.userData.char = c; this.group.add(g);
    (this.mixers ||= []).push(c.mixer);
    return g;
  }

  siteModel(reg) {
    const col = COLOR[reg.owner] || 'yellow';
    const g = new THREE.Group();
    const put = (n, x, z, s = 1, ry = 0) => { const o = Assets.prop(n); o.position.set(x, 0, z); o.scale.setScalar(s); o.rotation.y = ry; g.add(o); };
    switch (reg.type) {
      case 'capital': put(`building_castle_${col}`, 0, 0, 0.85); put(`building_tower_A_${col}`, 0.7, 0.45, 0.6); break;
      case 'citadel': put('building_castle_red', 0, -0.1, 0.95); put('building_tower_catapult_red', -0.7, 0.4, 0.6); put('building_tower_B_red', 0.7, 0.4, 0.6); break;
      case 'town': put(`building_market_${col}`, -0.25, 0.1, 0.7); put(`building_home_A_${col}`, 0.45, -0.3, 0.6, 1); put(`building_home_B_${col}`, 0.35, 0.5, 0.55, 2); break;
      case 'mine': put(`building_mine_${col}`, 0, 0, 0.75); put('resource_stone', 0.6, 0.4, 0.8); break;
      case 'shrine': put(reg.relicTaken ? 'building_destroyed' : `building_church_${col}`, 0, 0, 0.75); break;
      default: return null;
    }
    if (reg.owner === 'ash' && reg.type !== 'citadel') put('flag_red', -0.7, -0.4, 0.8);
    const baked = new THREE.Group(); bakeParts(Assets.bakeObject(g), baked); disposeTree(g);
    baked.position.set(reg.x, 0, reg.z);
    return baked;
  }

  sync() {
    const c = this.c;
    for (const reg of c.grid) {
      const k = `${reg.owner}|${reg.relicTaken}`;
      const s = this.sites.get(reg);
      if (!s || s.k !== k) {
        if (s?.obj) disposeTree(s.obj);
        const obj = this.siteModel(reg); if (obj) this.group.add(obj);
        this.sites.set(reg, { k, obj });
      }
      const t = this.tints.get(reg);
      if (t) { t.material.color.setHex(reg.owner === 'ember' ? 0x7fb6ff : reg.owner === 'ash' ? 0xff6a4a : 0xffffff); t.material.opacity = reg.owner ? 0.85 : 0.12; }
    }
    const ar = c.armyRegion(); this.army.userData.goal = new THREE.Vector3(ar.x, 0, ar.z);
    if (!this.army.userData.placed) { this.army.position.copy(this.army.userData.goal); this.army.userData.placed = true; }
    const live = new Set();
    for (const b of c.s.warbands) {
      live.add(b.id);
      let v = this.bands.get(b.id);
      if (!v) {
        v = this.figure('skeleton_warrior', 'flag_red', 0.5, [[]]);
        const s = Assets.character('skeleton_minion'); s.root.scale.setScalar(0.38); s.root.position.set(0.45, 0, 0.35); (s.actions.Idle_Combat || s.actions.Idle)?.play(); v.add(s.root); this.mixers.push(s.mixer);
        s.root.traverse((o) => { if (o.parent && /handslot/.test(o.parent.name)) o.visible = false; });
        const w = Assets.prop('Skeleton_Blade'); v.userData.char.root.traverse((o) => { if (o.name === 'handslot.r' && !o.userData.armed) { o.add(w); o.userData.armed = true; } });
        const reg = c.region(b.q, b.r); v.position.set(reg.x, 0, reg.z);
        this.bands.set(b.id, v);
      }
      const reg = c.region(b.q, b.r); v.userData.goal = new THREE.Vector3(reg.x + 0.1, 0, reg.z);
      v.userData.band = b;
    }
    for (const [id, v] of this.bands) if (!live.has(id)) { disposeTree(v); this.bands.delete(id); }
    // reachable regions
    this.reach.clear();
    for (const n of c.reachable()) {
      const hostile = c.bandAt(n.q, n.r) || n.type === 'citadel';
      const m = new THREE.Mesh(this.hexGeo, new THREE.MeshBasicMaterial({ color: hostile ? 0xff5a3a : 0xffe39a, transparent: true, opacity: 0.28, depthWrite: false }));
      m.position.set(n.x, 0.07, n.z); m.scale.setScalar(0.9); m.userData.reg = n; this.reach.add(m);
    }
  }

  select(reg) { this.selMesh.visible = !!reg; if (reg) this.selMesh.position.set(reg.x, 0.08, reg.z); }

  update(dt, time, camera, sunDir) {
    this.water.update(time, sunDir); this.foliage.update(time); this.water.setMood(this.c.isNight());
    for (const m of this.mixers) m.update(dt);
    for (const v of [this.army, ...this.bands.values()]) {
      const g = v.userData.goal; if (!g) continue;
      const d = g.clone().sub(v.position); const L = d.length();
      if (L > 0.02) { v.position.addScaledVector(d, Math.min(1, dt * 3)); v.userData.char.root.rotation.y = Math.atan2(d.x, d.z); }
    }
    for (const m of this.reach.children) m.material.opacity = 0.2 + Math.sin(time * 3) * 0.1;
  }

  // screen positions for DOM labels
  project(camera, w, h) {
    const out = [];
    const v = new THREE.Vector3();
    for (const b of this.bands.values()) { v.copy(b.position); v.y += 1.4; v.project(camera); out.push({ band: b.userData.band, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, vis: v.z < 1 }); }
    v.copy(this.army.position); v.y += 1.5; v.project(camera);
    out.push({ army: true, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, vis: v.z < 1 });
    return out;
  }
  dispose() { this.water.dispose(); this.foliage.dispose(); disposeTree(this.group); }
}
