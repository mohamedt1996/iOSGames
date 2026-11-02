// Heuristic "gardener" used for automated playtesting: proves each level is winnable with its tools.
import { PLANTS, PLANT } from '../src/sim/species.js';
import { PLANT_KEYS, R } from '../src/sim/world.js';

const comfort = (v, [lo, hi], m = 0.2) => (v >= lo && v <= hi ? 1 : Math.max(0, 1 - (v < lo ? lo - v : v - hi) / m));

export class Bot {
  constructor(w, level) {
    this.w = w; this.L = level;
    this.lastMist = -1e9; this.lastRot = -1e9; this.lastSeed = -1e9; this.placed = [];
    const want = new Set();
    for (const g of level.goals) {
      if (g.type === 'plant') want.add(g.plant);
      if (g.type === 'blooms' || g.type === 'glow') want.add('bloom');
      if (g.type === 'diversity') Object.keys(level.inventory.seeds || {}).forEach((k) => want.add(k));
      if (g.type === 'creature' && g.creature === 'firefly') { want.add('bloom'); want.add('moss'); }
      if (g.type === 'creature' && g.creature === 'snail') { want.add('moss'); want.add('grass'); }
      if (g.type === 'o2') { want.add('grass'); want.add('moss'); want.add('fern'); }
      if (g.type === 'gnats') want.add('dewtrap');
      if (g.type === 'clean') want.add('mushroom');
    }
    if (level.goals.some((g) => g.type === 'plant' && g.plant === 'grass') && level.inventory.seeds?.mushroom && level.initial?.nut < 0.1) want.add('mushroom');
    this.want = want;
    this.pond = level.goals.some((g) => g.type === 'pond' || g.type === 'frogFed');
  }

  laEst(k, rot) {
    const w = this.w, a = -rot, dx = Math.cos(a), dz = Math.sin(a);
    return 0.68 * w.windowLight * (0.6 + 0.4 * (w.cx[k] * dx + w.cz[k] * dz) / R) * (1 - w.shade[k]) + (w.lampBattery > 4 && w.windowLight < 0.6 ? 0.3 : 0);
  }

  plantScore(k, rot) {
    const w = this.w; const t = w.pType[k]; if (!t) return 0;
    const S = PLANTS[t];
    let wt = this.want.has(S.key) ? 1.5 : 0.5;
    if (S.key === 'bloom') wt = 2.5;
    return wt * comfort(this.laEst(k, rot), S.light, 0.18);
  }

  step() {
    const w = this.w, L = this.L, inv = w.inv, tools = L.tools || [];
    const night = w.isNight();
    // --- rotation
    if (tools.includes('rotate') && L.rotate !== false && w.time - this.lastRot > 360) {
      let best = w.rot, bs = -1;
      for (let i = 0; i < 12; i++) {
        const r = (i / 12) * Math.PI * 2; let s = 0;
        for (const k of w.insideList) {
          s += this.plantScore(k, r);
          if (!w.pType[k] && w.nu[k] > 0.2) for (const key of this.want) { const S = PLANTS[PLANT_KEYS[key]]; if (S.light[0] >= 0.35 && (inv.seeds?.[key] > 0 || w.plantCount(key, 0.3) > 0)) s += 0.6 * comfort(this.laEst(k, r), S.light, 0.18) * Math.min(1, w.nu[k] / 0.35); }
        }
        if (s > bs + 0.5) { bs = s; best = r; }
      }
      w.setRotation(best); this.lastRot = w.time;
    }
    // --- seeds
    if (inv.seeds && w.time - this.lastSeed > 90) {
      for (const [key, n] of Object.entries(inv.seeds)) {
        if (!(n > 0) || !this.want.has(key)) continue;
        const t = PLANT_KEYS[key], S = PLANTS[t];
        if (key === 'bloom' && w.plantCount('bloom', 0.01) >= 7) continue;
        let best = -1, bs = 0.4;
        for (const k of w.insideList) {
          if (w.pType[k] || w.soil[k] === 3) continue;
          if (this.placed.some(([pk, px, pz]) => pk === key && Math.hypot(px - w.cx[k], pz - w.cz[k]) < 0.3)) continue;
          let s = comfort(this.laEst(k, w.rot), S.light, 0.18);
          if (S.aquatic) s *= w.w[k] > 0.012 ? 1 : 0;
          else { if (w.w[k] > S.drown * 0.6) continue; s *= 0.5 + 0.5 * comfort(w.m[k], S.moist); }
          if (S.needsDet) s *= Math.min(1, w.det[k] / 0.2);
          if (S.carnivore) s *= w.nu[k] < 0.6 ? 1 : 0.3;
          if (S.nut > 0.3) s *= 0.5 + Math.min(1, w.nu[k]);
          if (key === 'dewtrap') { let d = 0; for (const c of w.creatures) if (c.type === 'gnat' && Math.hypot(c.x - w.cx[k], c.z - w.cz[k]) < 0.3) d++; s *= 1 + d * 0.2; }
          s += w.rand() * 0.02;
          if (s > bs) { bs = s; best = k; }
        }
        if (best >= 0 && w.act({ tool: 'seed', type: key, x: w.cx[best], z: w.cz[best] })) { this.placed.push([key, w.cx[best], w.cz[best]]); this.lastSeed = w.time; break; }
      }
    }
    // --- creatures
    for (const [type, n] of Object.entries(inv.creatures || {})) {
      if (!(n > 0)) continue;
      let ok = false, x = 0, z = 0;
      const edible = w.plantCount('moss') + w.plantCount('grass');
      if (type === 'snail') ok = edible >= 22;
      if (type === 'pillbug') ok = true;
      if (type === 'firefly') ok = w.plantCount('bloom', 0.4) >= 1 && w.count('firefly') < 6;
      if (type === 'frog') ok = w.pondCells() >= 12 && w.count('gnat') >= 2;
      if (!ok) continue;
      // position: near food
      let bk = w.insideList[0], bv = -1;
      for (const k of w.insideList) {
        let v = 0;
        if (type === 'snail') v = (w.pType[k] === PLANT.MOSS || w.pType[k] === PLANT.GRASS) ? w.pBio[k] + w.m[k] : 0;
        if (type === 'pillbug') v = w.det[k];
        if (type === 'firefly') v = w.pType[k] === PLANT.BLOOM ? 1 : 0;
        if (type === 'frog') v = w.w[k] > 0.005 && w.w[k] < 0.025 ? 1 : 0;
        if (w.w[k] > 0.025 && type !== 'frog') v = -1;
        if (v > bv) { bv = v; bk = k; }
      }
      x = w.cx[bk]; z = w.cz[bk];
      w.act({ tool: 'creature', type, x, z });
    }
    // --- water
    let need = [0, 0, 0], drown = [0, 0, 0];
    for (const k of w.insideList) {
      const t = w.pType[k]; if (!t) continue; const S = PLANTS[t]; if (S.aquatic) continue;
      const def = S.moist[0] + 0.12 - w.m[k];
      const wt = this.want.has(S.key) ? 2 : 1;
      if (def > 0) { need[0] += w.cx[k] * def * wt; need[1] += w.cz[k] * def * wt; need[2] += def * wt; }
      if (w.w[k] > S.drown * 0.7) { drown[0] += w.cx[k]; drown[1] += w.cz[k]; drown[2]++; }
    }
    // dry snails want wet ground near them
    for (const c of w.creatures) if (c.state === 'dormant') { need[0] += c.x * 0.5; need[1] += c.z * 0.5; need[2] += 0.5; }
    let water = [0, 0, 0];
    for (const k of w.insideList) if (w.w[k] > 0.002) { water[0] += w.cx[k] * w.w[k]; water[1] += w.cz[k] * w.w[k]; water[2] += w.w[k]; }
    let tx = 0, tz = 0;
    if (!this.pond && water[2] > 0.01 && need[2] > 0.2) {
      const nx = need[0] / need[2], nz = need[1] / need[2], wx = water[0] / water[2], wz = water[1] / water[2];
      const dx = nx - wx, dz = nz - wz, d = Math.hypot(dx, dz) || 1;
      tx = dx / d; tz = dz / d;
    }
    if (drown[2] > 2) {
      const dx = drown[0] / drown[2], dz = drown[1] / drown[2], d = Math.hypot(dx, dz) || 1;
      if (this.pond) { tx = 0; tz = 0; } else { tx = -dx / d; tz = -dz / d; }
      // herd into basins: tilt toward lowest point
      if (L.terrain?.basins?.length) { const b = L.terrain.basins[0]; const bd = Math.hypot(b.x - dx, b.z - dz) || 1; tx = (b.x - dx) / bd; tz = (b.z - dz) / bd; }
    }
    if (this.pond && L.terrain?.basins?.length && water[2] > 0.005) {
      const b = L.terrain.basins[0]; const wx = water[0] / water[2], wz = water[1] / water[2];
      const dx = b.x - wx, dz = b.z - wz, d = Math.hypot(dx, dz);
      if (d > 0.08) { tx = dx / d * 0.7; tz = dz / d * 0.7; }
    }
    w.setTilt(tx, tz);
    if (inv.mist > 0 && need[2] > 1.5 && w.time - this.lastMist > 150 && water[2] < 0.02) {
      // mist the neediest cell
      let bk = -1, bv = 0;
      for (const k of w.insideList) { const t = w.pType[k]; if (!t || PLANTS[t].aquatic) continue; const v = (PLANTS[t].moist[0] + 0.1 - w.m[k]) * (this.want.has(PLANTS[t].key) ? 2 : 1); if (v > bv) { bv = v; bk = k; } }
      if (bk >= 0) { w.act({ tool: 'mist', x: w.cx[bk], z: w.cz[bk] }); this.lastMist = w.time; }
    }
    const pondG = L.goals.find((g) => g.type === 'pond');
    if (pondG && inv.mist > 0 && w.pondCells() < pondG.min + 4 && w.time - this.lastMist > 120 && L.terrain?.basins?.length) {
      const b = L.terrain.basins[0]; w.act({ tool: 'mist', x: b.x, z: b.z }); this.lastMist = w.time;
    }
    // also mist to raise humidity for humidity goals
    const humG = L.goals.find((g) => g.type === 'humidity');
    if (humG && inv.mist > 0 && w.rh * 100 < humG.min && w.time - this.lastMist > 120) {
      const k = w.argmax(w.m); w.act({ tool: 'mist', x: w.cx[k] * 0.5, z: w.cz[k] * 0.5 }); this.lastMist = w.time;
    }
    // --- vent
    if (inv.vent) {
      const rh = w.rh * 100;
      const hmax = humG ? humG.max - 3 : 90, hmin = humG ? humG.min + 5 : 65;
      let open = w.vent;
      const moldRisk = w.moldCells > 0 || (rh > 95 && w.detAvg > 0.12);
      if ((humG && rh > hmax) || moldRisk || w.co2 > 4000 || w.o2 < 16) open = true;
      if ((humG ? rh < hmin : rh < 80) && !moldRisk && w.co2 < 3000 && w.o2 > 18) open = false;
      if (open !== w.vent) w.act({ tool: 'vent', on: open });
    }
    // --- lamp
    if (w.lampBattery > 0) {
      const wantLamp = (night && w.hour > 18 && w.hour < 23.5) || (w.windowLight < 0.5 && !night);
      if (wantLamp !== w.lamp) w.act({ tool: 'lamp', on: wantLamp });
    }
    // --- prune
    if (inv.prune > 0) {
      if (w.moldCells > 0) { const k = w.argmax(w.mold); w.act({ tool: 'prune', x: w.cx[k], z: w.cz[k] }); }
      const amax = L.goals.find((g) => g.type === 'plantMax');
      if (amax && w.plantCount(amax.plant, 0.15) > amax.max - 8) {
        const t = PLANT_KEYS[amax.plant]; let bk = -1, bv = 0;
        for (const k of w.insideList) if (w.pType[k] === t && w.pBio[k] > bv) { bv = w.pBio[k]; bk = k; }
        if (bk >= 0) w.act({ tool: 'prune', x: w.cx[bk], z: w.cz[bk] });
      }
    }
  }
}
