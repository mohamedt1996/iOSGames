import * as THREE from 'three';
import { Assets } from './assets.js';
import { UNITS, FACTIONS } from '../data/units.js';
import { ringTexture } from './textures.js';

const RING = ringTexture();
const FADE = 0.18;

// One animated KayKit character per battle unit, plus its ring, health bar and veteran pips.
export class UnitViews {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.views = new Map();
    this.group = new THREE.Group(); scene.add(this.group);
    this.ringGeo = new THREE.PlaneGeometry(1.25, 1.25); this.ringGeo.rotateX(-Math.PI / 2);
    this.barGeo = new THREE.PlaneGeometry(0.9, 0.09);
  }

  make(u) {
    const def = UNITS[u.type];
    const c = Assets.character(def.model);
    const root = new THREE.Group();
    const S = def.scale * 1.3; c.root.scale.setScalar(S);
    root.add(c.root);
    // weapons: show the named ones; attach skeleton weapons to hand slots
    const lo = def.loadout || {};
    const slots = {};
    c.root.traverse((o) => {
      if (o.name === 'handslot.r') slots.r = o; if (o.name === 'handslot.l') slots.l = o;
      if (o.parent && /handslot/.test(o.parent.name) && lo.show) o.visible = lo.show.includes(o.name);
      if (o.isMesh && lo.tint) { o.material.color.multiply(new THREE.Color(lo.tint).lerp(new THREE.Color(1, 1, 1), 0.55)); }
      if (o.isMesh && /Eyes/.test(o.name) && def.faction === 'ash') { o.material.emissive = new THREE.Color(def.hero ? 0xff5a2a : 0x7bff9a); o.material.emissiveIntensity = def.hero ? 4 : 2.5; }
    });
    for (const side of ['r', 'l']) if (lo.attach?.[side] && slots[side]) { const w = Assets.prop(lo.attach[side]); slots[side].add(w); }
    if (def.hero) {
      const crownCol = def.faction === 'ash' ? 0xff6a2a : 0xffd27a;
      const light = new THREE.PointLight(crownCol, 1.6, 2.4, 2); light.position.y = 1.3; root.add(light);
    }
    // team ring
    const ringMat = new THREE.MeshBasicMaterial({ map: RING, color: new THREE.Color(FACTIONS[def.faction].tint), transparent: true, opacity: 0.55, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat); ring.position.y = 0.03; ring.scale.setScalar(def.hero ? 1.45 : 1.15); root.add(ring);
    // health bar (billboarded each frame)
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(this.barGeo, new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.7, depthTest: false }));
    const fg = new THREE.Mesh(this.barGeo, new THREE.MeshBasicMaterial({ color: def.faction === 'ember' ? 0x7fd06a : 0xe0613c, depthTest: false }));
    fg.position.z = 0.001; bg.renderOrder = 20; fg.renderOrder = 21;
    bar.add(bg, fg); bar.position.y = 1.35 * (S / 0.42) + 0.1; root.add(bar);
    // veteran pips
    if (u.vet) for (let i = 0; i < u.vet; i++) { const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xffd36a, depthTest: false })); p.position.set((i - (u.vet - 1) / 2) * 0.14, 0.12, 0); p.renderOrder = 22; bar.add(p); }
    this.group.add(root);
    const v = { u, root, char: c, ring, ringMat, bar, fg, state: '', action: null, dead: false, deadT: 0, prevAttack: 0, lastHp: u.hp, opacity: 1 };
    this.play(v, u.raised ? (c.actions.Skeletons_Awaken_Floor ? 'Skeletons_Awaken_Floor' : 'Spawn_Ground_Skeletons') : (def.anims.idle || 'Idle'), u.raised);
    root.position.set(u.x, this.world.heightAt(u.x, u.z), u.z);
    this.views.set(u.id, v);
    return v;
  }

  play(v, name, once = false, speed = 1) {
    const a = v.char.actions[name] || v.char.actions.Idle;
    if (!a || v.action === a && !once) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed;
    if (v.action && v.action !== a) a.crossFadeFrom(v.action, FADE, false);
    a.play(); v.action = a; v.state = name; v.once = once;
  }

  sync(battle, dt, camera, selected) {
    for (const u of battle.units) {
      let v = this.views.get(u.id);
      if (!v) v = this.make(u);
      const def = u.def;
      if (!u.alive) {
        if (!v.dead) { v.dead = true; this.play(v, def.faction === 'ash' && v.char.actions.Death_C_Skeletons ? 'Death_C_Skeletons' : Math.random() < 0.5 ? 'Death_A' : 'Death_B', true); v.bar.visible = false; v.ring.visible = false; }
        v.deadT += dt;
        if (v.deadT > 8) { v.root.position.y -= dt * 0.08; if (v.deadT > 14) { v.root.visible = false; } }
        v.char.mixer.update(dt);
        continue;
      }
      // smooth position + facing
      const y = this.world.heightAt(u.x, u.z);
      v.root.position.x += (u.x - v.root.position.x) * Math.min(1, dt * 14);
      v.root.position.z += (u.z - v.root.position.z) * Math.min(1, dt * 14);
      v.root.position.y += (y - v.root.position.y) * Math.min(1, dt * 10);
      const targetRot = -u.facing + Math.PI / 2;
      let d = targetRot - v.char.root.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      v.char.root.rotation.y += d * Math.min(1, dt * 10);
      // animation state
      if (v.cheer) { v.char.mixer.update(dt); continue; }
      const attacking = u.attackAnim > v.prevAttack + 0.01; v.prevAttack = u.attackAnim;
      if (attacking) {
        const list = def.anims.attack; this.play(v, list[Math.floor(Math.random() * list.length)], true, 1.2);
      } else if (u.hp < v.lastHp - 1 && !v.once && Math.random() < 0.35) this.play(v, 'Hit_A', true, 1.3);
      else if (!v.once || (v.action && !v.action.isRunning())) {
        if (u.routing > 0) this.play(v, 'Running_B');
        else if (u.moving) this.play(v, def.faction === 'ash' && u.type !== 'ashking' ? (def.anims.walk || 'Running_A') : 'Running_A', false, 0.9 + def.speed * 0.08);
        else if (u.status.shield > 0) this.play(v, 'Block');
        else this.play(v, def.anims.idle || 'Idle');
      }
      v.lastHp = u.hp;
      v.char.mixer.update(dt);
      // smoke: fade out
      const op = u.status.smoke > 0 ? (u.side === 'ember' ? 0.35 : 0.05) : 1;
      if (Math.abs(op - v.opacity) > 0.01) {
        v.opacity += (op - v.opacity) * Math.min(1, dt * 6);
        v.char.root.traverse((o) => { if (o.isMesh) { o.material.transparent = v.opacity < 0.99; o.material.opacity = v.opacity; } });
      }
      // health bar
      const f = Math.max(0, u.hp / u.maxHp);
      v.fg.scale.x = f; v.fg.position.x = -(1 - f) * 0.45;
      v.bar.quaternion.copy(camera.quaternion);
      v.bar.visible = f < 0.999 || selected.has(u.id);
      v.fg.material.color.setHex(u.routing > 0 ? 0xd8c06a : def.faction === 'ember' ? 0x7fd06a : 0xe0613c);
      v.ringMat.opacity = selected.has(u.id) ? 1 : 0.4;
      v.ringMat.color.setHex(selected.has(u.id) ? 0xffe39a : FACTIONS[def.faction].tint);
    }
  }

  cheer(side) { for (const v of this.views.values()) if (!v.dead && v.u.side === side) { v.cheer = true; this.play(v, side === 'ash' ? 'Taunt' : 'Cheer', false); } }
  pick(raycaster, battle) {
    let best = null, bd = 0.9;
    for (const v of this.views.values()) {
      if (v.dead) continue;
      const p = v.root.position.clone(); p.y += 0.5;
      const d = raycaster.ray.distanceToPoint(p);
      if (d < bd) { bd = d; best = v.u; }
    }
    return best;
  }
  dispose() { this.scene.remove(this.group); this.views.clear(); }
}
