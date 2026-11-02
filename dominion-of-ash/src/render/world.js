import * as THREE from 'three';
import { Assets } from './assets.js';
import { offsetToAxial, toWorld } from '../core/hex.js';
import { COLS, ROWS, TERRAIN } from '../battle/maps.js';
import { mulberry32 } from '../core/rng.js';
import { bakeParts, grassTint, Water, Foliage } from './look.js';

export const HILL_Y = 0.55;
const M = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));

// Static terrain is baked into a few merged meshes (one draw call per material);
// trees, flags and burn marks stay separate so they can change during battle.
export class BattleWorld {
  constructor(scene, field) {
    this.scene = scene; this.field = field;
    this.group = new THREE.Group(); scene.add(this.group);
    this.rand = mulberry32(field.recipe?.seed ?? 5);
    this.trees = new Map(); this.burnMarks = new Map();
    const parts = [];
    const add = (name, m, tint) => { for (const p of Assets.bakedGeometries(name, m)) parts.push({ ...p, tint }); };
    const G = () => grassTint(r);
    const r = this.rand;
    for (const c of field.grid) {
      const rot = Math.floor(r() * 6) * (Math.PI / 3);
      const y = this.cellY(c);
      switch (c.type) {
        case 'water': break; // the animated water surface shows through
        case 'river': add('hex_river_crossing_A', M(c.x, 0, c.z, Math.PI / 6)); break;
        case 'bridge': add('hex_river_A', M(c.x, 0, c.z, Math.PI / 2)); add('building_bridge_A', M(c.x, 0, c.z, Math.PI / 2)); break;
        case 'hill': add('hex_grass', M(c.x, y, c.z, rot), G()); add('hex_grass_bottom', M(c.x, y - 0.5, c.z, rot)); add(r() < 0.5 ? 'rock_single_A' : 'rock_single_C', M(c.x + (r() - 0.5), y, c.z + (r() - 0.5), rot, 0.6)); break;
        case 'mountain': add('hex_grass', M(c.x, 0, c.z, rot), G()); add(r() < 0.5 ? 'mountain_A_grass_trees' : 'mountain_B_grass', M(c.x, 0, c.z, rot)); break;
        case 'town': add('hex_grass', M(c.x, 0, c.z, rot), G()); add(r() < 0.5 ? 'building_home_A_yellow' : 'building_home_B_yellow', M(c.x + 0.25, 0, c.z - 0.3, rot, 0.85)); add('barrel', M(c.x - 0.55, 0, c.z + 0.4, rot, 0.8)); break;
        case 'ruin': add('hex_grass', M(c.x, 0, c.z, rot), G()); add('building_destroyed', M(c.x, 0, c.z, rot, 0.85)); break;
        case 'road': add('hex_road_A', M(c.x, 0, c.z, Math.PI / 6)); break;
        default: add('hex_grass', M(c.x, 0, c.z, rot), G());
      }
      if (c.type === 'forest') this.plantForest(c);
      else if (c.type === 'grass' && r() < 0.12) add(['rock_single_D', 'rock_single_E', 'tree_single_A_cut'][Math.floor(r() * 3)], M(c.x + (r() - 0.5) * 1.2, 0, c.z + (r() - 0.5) * 1.2, rot, 0.7));
    }
    this.landPts = [...field.grid].filter((c) => c.type !== 'water').map((c) => [c.x, c.z]);
    this.addBorder(add);
    // banner tower
    const b = field.banner;
    add('building_tower_base_yellow', M(b.x + 0.5, this.cellY(b), b.z - 0.55, 0, 0.45));
    this.bake(parts);
    this.water = new Water(this.group, this.landPts, { night: field.night });
    // grass tufts and wildflowers on open ground
    const spots = [];
    for (const c of field.grid) {
      if (['grass', 'hill', 'road', 'ruin', 'town', 'forest'].includes(c.type)) spots.push({ x: c.x, z: c.z, y: this.cellY(c), n: c.type === 'grass' ? 9 : c.type === 'hill' ? 7 : c.type === 'forest' ? 6 : 5, radius: c.type === 'road' ? 0.95 : 0.85 });
    }
    this.foliage = new Foliage(this.group, spots, this.rand);
    this.flags = {};
    for (const [side, name] of [['ember', 'flag_blue'], ['ash', 'flag_red'], ['none', 'flag_yellow']]) {
      const f = Assets.prop(name); f.position.set(b.x - 0.35, this.cellY(b), b.z + 0.1); f.scale.setScalar(1.1); f.visible = side === 'none';
      this.group.add(f); this.flags[side] = f;
    }
    // hover/selection hex outline
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3, rr = 1.12; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (i) hexShape.lineTo(x, z); else hexShape.moveTo(x, z); }
    const hg = new THREE.ShapeGeometry(hexShape); hg.rotateX(Math.PI / 2);
    this.hexGeo = hg;
    this.deployMat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.22, depthWrite: false });
    this.deployMarks = new THREE.Group(); this.group.add(this.deployMarks);
    for (const row of field.deploy.ember) for (let col = 0; col < COLS; col++) {
      const c = field.cell(col, row); if (!TERRAIN[c.type].pass) continue;
      const m = new THREE.Mesh(hg, this.deployMat); m.position.set(c.x, this.cellY(c) + 0.02, c.z); m.scale.setScalar(0.92); this.deployMarks.add(m);
    }
  }

  cellY(c) { return c && c.type === 'hill' ? HILL_Y : 0; }
  heightAt(x, z) {
    const c = this.field.grid.at(x, z); if (!c) return 0;
    if (c.type !== 'hill') {
      // ease onto neighbouring hills
      let h = 0; for (const n of this.field.grid.neighbors(c)) if (n.type === 'hill') { const d = Math.hypot(n.x - x, n.z - z); h = Math.max(h, HILL_Y * Math.max(0, 1 - (d - 1.1) / 0.5)); }
      return Math.min(HILL_Y, h);
    }
    return HILL_Y;
  }

  plantForest(c) {
    const g = new THREE.Group();
    const r = this.rand;
    const n = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const t = Assets.prop(['trees_A_medium', 'trees_B_medium', 'trees_A_small', 'trees_B_large'][Math.floor(r() * 4)]);
      t.position.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6); t.rotation.y = r() * 6.28; t.scale.setScalar(0.8 + r() * 0.25);
      g.add(t);
    }
    g.position.set(c.x, 0, c.z); this.group.add(g); this.trees.set(c, g);
  }

  addBorder(add) {
    const r = this.rand;
    for (let row = -4; row < ROWS + 4; row++) for (let col = -4; col < COLS + 4; col++) {
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) continue;
      const [q, rr] = offsetToAxial(col, row); const [x, z] = toWorld(q, rr);
      const ring = Math.max(-row, row - ROWS + 1, -col, col - COLS + 1);
      const rot = Math.floor(r() * 6) * (Math.PI / 3);
      if (ring >= 3) continue;
      this.landPts.push([x, z]);
      add('hex_grass', M(x, 0, z, rot), grassTint(r).map((v) => v * 0.92));
      const k = r();
      if (ring >= 2 || k < 0.35) add(['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass', 'hills_A_trees', 'hills_B_trees'][Math.floor(r() * 5)], M(x, 0, z, rot));
      else if (k < 0.8) add(['trees_A_large', 'trees_B_large', 'trees_A_medium'][Math.floor(r() * 3)], M(x, 0, z, rot));
    }
    // a little life on the far shore
    add('building_windmill_yellow', M(...toWorld(...offsetToAxial(-2, 3)).flatMap((v, i) => (i ? [0, v] : [v])), 0.6));
    add('building_watermill_yellow', M(...toWorld(...offsetToAxial(COLS + 1, 11)).flatMap((v, i) => (i ? [0, v] : [v])), 2.1));
  }

  bake(parts) { this.terrainMeshes = bakeParts(parts, this.group); }

  // fire and banner state from the battle each frame
  sync(battle) {
    for (const c of this.field.grid) {
      const g = this.trees.get(c);
      if (g && c.burnt && !g.userData.burnt) {
        g.userData.burnt = true;
        for (const t of g.children) t.visible = false;
        const stump = Assets.prop('tree_single_A_cut'); stump.scale.setScalar(0.7); g.add(stump);
        const mark = new THREE.Mesh(this.hexGeo, new THREE.MeshBasicMaterial({ color: 0x1b1612, transparent: true, opacity: 0.55, depthWrite: false }));
        mark.position.set(c.x, 0.015, c.z); this.group.add(mark);
      }
      if (g && c.burn > 0) for (const t of g.children) t.traverse((o) => { if (o.isMesh && !o.userData.char) { o.material = o.material.clone(); o.material.color.setRGB(0.35, 0.25, 0.18); o.userData.char = true; } });
    }
    const h = battle.hold;
    const lead = h.ember > 1 ? 'ember' : h.ash > 1 ? 'ash' : 'none';
    for (const k in this.flags) this.flags[k].visible = k === lead;
  }

  animate(time, sunDir) { this.water.update(time, sunDir); this.foliage.update(time); }
  dispose() { this.water.dispose(); this.foliage.dispose(); this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry && o.name === 'terrain') { o.geometry.dispose(); if (o.material.vertexColors) o.material.dispose(); } }); }
}
