import * as THREE from 'three';
import { Particles } from './particles.js';
import { Assets } from './assets.js';
import { ringTexture } from './textures.js';

const RING = ringTexture();

// Visual effects driven by battle events: projectiles, fire, explosions, ability flourishes.
export class FX {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.group = new THREE.Group(); scene.add(this.group);
    this.sparks = new Particles(this.group, { max: 900, additive: true, gravity: 0.6, drag: 1.4 });
    this.dust = new Particles(this.group, { max: 600, additive: false, gravity: -1.2, drag: 2 });
    this.smoke = new Particles(this.group, { max: 500, additive: false, gravity: 0.35, drag: 0.6 });
    this.proj = new Map();
    this.rings = [];
    this.flashes = []; this.fireL = [];
    this.fireLights = new Map();
    this.markers = [];
  }

  // pooled flash lights for explosions
  flash(x, y, z, color, intensity = 12, dur = 0.35) {
    const l = new THREE.PointLight(color, intensity, 7, 2); l.position.set(x, y, z); this.group.add(l);
    this.flashes.push({ l, t: 0, dur, i0: intensity });
  }
  ring(x, z, color, r0, r1, dur = 0.6, y = 0.05) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: RING, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, this.world.heightAt(x, z) + y, z); this.group.add(m);
    this.rings.push({ m, t: 0, dur, r0, r1 });
  }
  marker(x, z, color = 0xffe39a) { this.ring(x, z, color, 0.9, 0.2, 0.45, 0.08); }

  burst(x, y, z, n, col, speed = 2, life = 0.6, size = 0.08, sys = this.sparks) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2, s = speed * (0.4 + Math.random() * 0.6);
      sys.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 0.5, Math.sin(a) * Math.cos(e) * s, life * (0.6 + Math.random() * 0.8), col[0], col[1], col[2], col[3] ?? 1, size * (0.6 + Math.random() * 0.8));
    }
  }

  onEvent(e, battle) {
    const H = (x, z) => this.world.heightAt(x, z);
    switch (e.e) {
      case 'hit': {
        const u = battle.units.find((v) => v.id === e.id);
        const ash = u?.side === 'ash';
        this.burst(e.x, H(e.x, e.z) + 0.55, e.z, e.behind ? 14 : 7, ash ? [0.95, 0.92, 0.85, 1] : [1, 0.7, 0.35, 1], 2.4, 0.35, 0.06);
        if (e.behind) this.burst(e.x, H(e.x, e.z) + 0.6, e.z, 6, [1.8, 0.9, 0.3, 1], 3, 0.4, 0.1);
        break;
      }
      case 'death': this.burst(e.x, H(e.x, e.z) + 0.2, e.z, 20, [0.55, 0.5, 0.45, 0.8], 1.6, 0.9, 0.16, this.dust); break;
      case 'explode':
        this.burst(e.x, H(e.x, e.z) + 0.4, e.z, 70, [3, 1.4, 0.4, 1], 5, 0.8, 0.16);
        this.burst(e.x, H(e.x, e.z) + 0.4, e.z, 30, [0.25, 0.22, 0.2, 0.7], 1.5, 2, 0.4, this.smoke);
        this.flash(e.x, H(e.x, e.z) + 1, e.z, 0xff8a3a, 30, 0.5);
        this.ring(e.x, e.z, 0xff9a4a, 0.4, e.r * 1.1, 0.5);
        this.shake = Math.max(this.shake || 0, 0.35);
        break;
      case 'ignite': this.fireLights.set(`${e.q},${e.r}`, { x: e.x, z: e.z }); break;
      case 'burnout': this.fireLights.delete(`${e.q},${e.r}`); break;
      case 'raise': this.burst(e.x, H(e.x, e.z) + 0.2, e.z, 40, [0.4, 1.8, 0.6, 1], 1.4, 1.2, 0.12); this.ring(e.x, e.z, 0x6aff9a, 0.2, 1.2, 0.9); break;
      case 'rout': break;
      case 'ability': {
        const u = battle.units.find((v) => v.id === e.id); if (!u) break;
        const y = H(u.x, u.z);
        if (e.ab === 'rally') { this.ring(u.x, u.z, 0xffd27a, 0.5, 6, 1.1); this.burst(u.x, y + 1, u.z, 50, [2, 1.6, 0.6, 1], 2.5, 1.2, 0.1); this.flash(u.x, y + 1.5, u.z, 0xffd27a, 18, 0.8); }
        if (e.ab === 'wail') { this.ring(u.x, u.z, 0xb04aff, 0.5, 7, 1.2); this.burst(u.x, y + 1, u.z, 60, [0.9, 0.3, 1.6, 1], 3, 1.1, 0.12); this.shake = 0.3; }
        if (e.ab === 'shieldwall') this.ring(u.x, u.z, 0x7fb8ff, 1.2, 0.8, 0.6);
        if (e.ab === 'cleave') { this.ring(u.x, u.z, 0xffffff, 0.4, 2.2, 0.35); this.burst(u.x, y + 0.6, u.z, 24, [1.6, 1.4, 1.2, 1], 4, 0.4, 0.08); }
        if (e.ab === 'smoke') this.burst(u.x, y + 0.5, u.z, 40, [0.55, 0.55, 0.6, 0.7], 1.2, 2.2, 0.45, this.smoke);
        if (e.ab === 'raise') this.ring(u.x, u.z, 0x6aff9a, 0.3, 7, 1.0);
        break;
      }
    }
  }

  update(battle, dt, time) {
    // projectiles mirror the battle's list
    const seen = new Set();
    for (const p of battle.projectiles) {
      if (p.t < 0) continue;
      const key = p; seen.add(key);
      let v = this.proj.get(key);
      if (!v) {
        if (p.kind === 'arrow') { v = Assets.prop(Assets.has('Skeleton_Arrow') && p.side === 'ash' ? 'Skeleton_Arrow' : 'arrow'); v.scale.setScalar(0.55); }
        else { const col = p.kind === 'fireball' ? 0xff7a2a : p.kind === 'bonebolt' ? 0x7bff9a : 0xffb46a; v = new THREE.Mesh(new THREE.SphereGeometry(p.kind === 'fireball' ? 0.22 : 0.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3) })); v.userData.col = col; }
        this.group.add(v); this.proj.set(key, v);
      }
      const f = p.f ?? 0;
      const sx = p.sx ?? p.x, sz = p.sz ?? p.z;
      const y0 = this.world.heightAt(sx, sz) + 0.7, y1 = this.world.heightAt(p.tx ?? p.x, p.tz ?? p.z) + 0.5;
      const arc = p.kind === 'fireball' ? 2.2 : p.kind === 'arrow' ? 0.8 + Math.hypot((p.tx ?? 0) - sx, (p.tz ?? 0) - sz) * 0.06 : 0.3;
      const y = y0 + (y1 - y0) * f + Math.sin(Math.PI * f) * arc;
      const prev = v.position.clone();
      v.position.set(p.x, y, p.z);
      if (p.kind === 'arrow') { const dir = v.position.clone().sub(prev); if (dir.lengthSq() > 1e-6) v.lookAt(v.position.clone().add(dir)); v.rotateX(Math.PI / 2); }
      else {
        const c = new THREE.Color(v.userData.col);
        this.sparks.emit(p.x, y, p.z, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, 0.35, c.r * 2.5, c.g * 2.5, c.b * 2.5, 1, p.kind === 'fireball' ? 0.22 : 0.1);
        if (p.kind === 'fireball') this.smoke.emit(p.x, y, p.z, 0, 0.3, 0, 0.8, 0.2, 0.18, 0.16, 0.5, 0.25);
      }
    }
    for (const [k, v] of this.proj) if (!seen.has(k)) { this.group.remove(v); this.proj.delete(k); }
    // burning forests
    let li = 0;
    for (const f of this.fireLights.values()) {
      const y = this.world.heightAt(f.x, f.z);
      for (let i = 0; i < 2; i++) this.sparks.emit(f.x + (Math.random() - 0.5) * 1.4, y + 0.2 + Math.random() * 0.4, f.z + (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.4, 3, 1.2 + Math.random() * 0.6, 0.3, 1, 0.22 + Math.random() * 0.15);
      if (Math.random() < 0.5) this.smoke.emit(f.x + (Math.random() - 0.5), y + 1.2, f.z + (Math.random() - 0.5), 0.1, 0.8, 0, 2.5, 0.16, 0.14, 0.13, 0.55, 0.55);
      if (li < 4) {
        let l = this.fireL[li];
        if (!l) { l = this.fireL[li] = new THREE.PointLight(0xff7a2a, 0, 6, 2); this.group.add(l); }
        l.position.set(f.x, y + 1, f.z); l.intensity = 6 + Math.sin(time * 17 + li) * 2;
      }
      li++;
    }
    for (let i = li; i < this.fireL.length; i++) this.fireL[i].intensity = 0;
    // ambient necro glow / auras: shield bubbles
    for (const u of battle.units) if (u.alive && u.status.shield > 0 && Math.random() < 0.2) this.sparks.emit(u.x + (Math.random() - 0.5) * 0.6, this.world.heightAt(u.x, u.z) + Math.random() * 0.9, u.z + (Math.random() - 0.5) * 0.6, 0, 0.3, 0, 0.5, 0.6, 1.2, 2.2, 0.8, 0.06);
    // rings and flash lights
    this.rings = this.rings.filter((r) => {
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { this.group.remove(r.m); r.m.geometry.dispose(); return false; }
      const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)); r.m.scale.set(s, 1, s); r.m.material.opacity = 1 - k; return true;
    });
    this.flashes = this.flashes.filter((L) => {
      L.t += dt; L.l.intensity = L.i0 * Math.max(0, 1 - L.t / L.dur);
      if (L.t >= L.dur) { this.group.remove(L.l); return false; } return true;
    });
    this.sparks.update(dt); this.dust.update(dt); this.smoke.update(dt);
  }
  setScale(px) { for (const p of [this.sparks, this.dust, this.smoke]) p.mat.uniforms.scale.value = px * 0.5; }
  dispose() { this.scene.remove(this.group); }
}
