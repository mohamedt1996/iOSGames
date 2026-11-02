import { CREATURES, PLANT, PLANTS } from './species.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function spawnCreature(w, type, x, z, o = {}) {
  const r = Math.hypot(x, z);
  if (r > 0.9) { x *= 0.9 / r; z *= 0.9 / r; }
  const c = {
    id: w.nextId++, type, x, z, y: 0, heading: w.rand() * Math.PI * 2,
    energy: o.energy ?? 0.6, age: o.age ?? 0, state: o.state ?? 'active', hatchT: o.hatchT ?? 0,
    tx: x, tz: z, retarget: 0, glow: 0, dormantT: 0, wetT: 0, phase: w.rand() * 10,
  };
  w.creatures.push(c);
  w.stats.born[type] = (w.stats.born[type] || 0) + 1;
  if (c.state !== 'egg') w.events.push({ e: 'born', type, id: c.id });
  return c;
}

function kill(w, c, cause) {
  if (c.state === 'dead') return;
  const k = w.idx(c.x, c.z);
  if (k >= 0 && c.state !== 'egg') w.det[k] += c.type === 'frog' ? 0.6 : c.type === 'gnat' ? 0.01 : 0.15;
  c.state = 'dead';
  w.stats.died[c.type] = (w.stats.died[c.type] || 0) + 1;
  w.events.push({ e: 'die', type: c.type, id: c.id, cause, x: c.x, z: c.z });
}

function pickTarget(w, c, scoreFn, radius = 0.35, samples = 8) {
  let best = null, bs = -Infinity;
  for (let s = 0; s < samples; s++) {
    const a = w.rand() * Math.PI * 2, r = Math.sqrt(w.rand()) * radius;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (Math.hypot(x, z) > 0.9) continue;
    const k = w.idx(x, z); if (k < 0) continue;
    const sc = scoreFn(k, x, z) + w.rand() * 0.05;
    if (sc > bs) { bs = sc; best = [x, z]; }
  }
  if (best) { c.tx = best[0]; c.tz = best[1]; }
}

function nearDewtrap(w, k) {
  if (k < 0) return 0;
  const G = 28, i = k % G, j = (k / G) | 0;
  let s = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= G || b >= G) continue;
    const n = b * G + a;
    if (w.pType[n] === PLANT.DEWTRAP) s += w.pBio[n] * w.pHealth[n];
  }
  return s;
}

function feedDewtrap(w, k) {
  const G = 28, i = k % G, j = (k / G) | 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const n = (j + dj) * G + (i + di);
    if (n >= 0 && n < w.N && w.pType[n] === PLANT.DEWTRAP) { w.pBio[n] = Math.min(1, w.pBio[n] + 0.08); w.pHealth[n] = Math.min(1, w.pHealth[n] + 0.1); w.events.push({ e: 'catch', k: n }); return; }
  }
}

export function stepCreatures(w, dd) {
  let resp = 0;
  const night = w.isNight();
  const RH = w.rh;
  const counts = {};
  for (const c of w.creatures) if (c.state === 'active' || c.state === 'dormant') counts[c.type] = (counts[c.type] || 0) + 1;
  const o2Stress = w.o2 < 15 ? (15 - w.o2) / 4 : 0;
  const co2Stress = w.co2 > 5000 ? (w.co2 - 5000) / 2500 : 0;
  const pond = w.pondCells(0.012);

  for (const c of w.creatures) {
    if (c.state === 'dead') continue;
    const D = CREATURES[c.type];
    if (c.state === 'egg') {
      c.hatchT -= dd;
      if (c.hatchT <= 0) {
        const k = w.idx(c.x, c.z);
        if (c.type === 'firefly' && !(k >= 0 && w.pType[k] === PLANT.MOSS && w.pBio[k] > 0.25)) { kill(w, c, 'larva'); continue; }
        if (k >= 0 && w.w[k] > 0.03) { kill(w, c, 'drowned'); continue; }
        c.state = 'active'; c.energy = 0.5; c.age = 0;
        w.events.push({ e: 'hatch', type: c.type, id: c.id });
      }
      continue;
    }
    c.age += dd;
    resp += D.o2 * 0.004 * dd * 50;
    const k = w.idx(c.x, c.z);
    if (c.age > D.life * (0.85 + 0.3 * ((c.id * 0.618) % 1))) { kill(w, c, 'age'); continue; }
    c.energy -= (o2Stress + co2Stress) * 0.6 * dd;
    if (k >= 0 && w.mold[k] > 0.5 && !D.flier) c.energy -= 0.4 * dd;
    const wet = k >= 0 ? w.w[k] : 0;
    const ground = !D.flier;

    if (c.type === 'snail' || c.type === 'pillbug') {
      const moist = k >= 0 ? w.m[k] : 0;
      const dry = RH < 0.42 && moist < 0.3;
      if (dry) {
        if (c.state !== 'dormant') w.events.push({ e: 'dormant', id: c.id, type: c.type });
        c.state = 'dormant'; c.dormantT += dd; c.energy -= 0.04 * dd;
        if (c.dormantT > 3) { kill(w, c, 'dried'); continue; }
      } else {
        if (c.state === 'dormant') w.events.push({ e: 'wake', id: c.id, type: c.type });
        c.state = 'active'; c.dormantT = Math.max(0, c.dormantT - dd);
        c.energy -= (c.type === 'snail' ? 0.35 : 0.3) * dd;
        if (c.type === 'snail' && k >= 0 && D.diet.includes(w.pType[k]) && w.pBio[k] > 0.08) {
          const S = PLANTS[w.pType[k]];
          const eat = Math.min(w.pBio[k] - 0.04, 0.55 * dd * S.edible) * (c.energy < 1 ? 1 : 0.2);
          if (eat > 0) { w.pBio[k] -= eat; c.energy += eat * 1.3; w.nu[k] = Math.min(1.2, w.nu[k] + eat * 0.35); }
        }
        if (c.type === 'pillbug' && k >= 0) {
          let eat = Math.min(w.det[k], 2.5 * dd);
          if (eat > 0) { w.det[k] -= eat; w.nu[k] = Math.min(1.2, w.nu[k] + eat * 0.8); c.energy += eat * 1.4; }
          if (c.energy < 0.2 && w.pType[k] === PLANT.MOSS && w.pBio[k] > 0.2) { const e2 = 0.3 * dd; w.pBio[k] -= e2; c.energy += e2; }
        }
        c.retarget -= dd;
        const here = c.type === 'snail' ? (k >= 0 && D.diet.includes(w.pType[k]) ? w.pBio[k] : 0) : (k >= 0 ? w.det[k] : 0);
        const arrived = Math.hypot(c.tx - c.x, c.tz - c.z) < 0.03;
        if (c.retarget <= 0 || (here < 0.1 && arrived)) {
          c.retarget = 0.15 + w.rand() * 0.15;
          pickTarget(w, c, (n) => {
            if (w.w[n] > 0.02) return -5;
            const food = c.type === 'snail' ? (D.diet.includes(w.pType[n]) ? w.pBio[n] * PLANTS[w.pType[n]].edible : 0) : w.det[n] * 3;
            return food + w.m[n] * 0.2 - (w.mold[n] > 0.3 ? 1 : 0);
          }, c.energy < 0.6 ? 0.8 : 0.45, 12);
        }
      }
    } else if (c.type === 'firefly') {
      if (night) {
        c.state = 'active';
        c.energy -= 0.45 * dd;
        // find bloom
        c.retarget -= dd;
        const atBloom = k >= 0 && w.pType[k] === PLANT.BLOOM && w.pBloom[k] > 0.4;
        const gravid = c.energy > D.breedEnergy && c.age > D.breedAge && (counts.firefly || 0) >= 2 && w.count('firefly', { eggs: true }) < D.cap;
        if (gravid && k >= 0 && w.pType[k] === PLANT.MOSS && w.pBio[k] > 0.3) {
          c.energy -= 0.3;
          spawnCreature(w, 'firefly', c.x, c.z, { state: 'egg', hatchT: D.hatch, energy: 0.5 });
          w.events.push({ e: 'egg', type: 'firefly', x: c.x, z: c.z });
          c.retarget = 0;
        }
        if (c.retarget <= 0 && !(atBloom && c.energy < 1.1)) {
          c.retarget = 0.04 + w.rand() * 0.05;
          const bl = w.bloomList || [];
          if (gravid) pickTarget(w, c, (n) => (w.pType[n] === PLANT.MOSS ? w.pBio[n] : 0), 1.0, 24);
          else if (bl.length && w.rand() < 0.85) {
            let best = -1, bs = -1;
            for (let s = 0; s < Math.min(6, bl.length); s++) {
              const n = bl[Math.floor(w.rand() * bl.length)];
              const sc = w.pBloom[n] / (0.2 + Math.hypot(w.cx[n] - c.x, w.cz[n] - c.z));
              if (sc > bs) { bs = sc; best = n; }
            }
            c.tx = w.cx[best] + (w.rand() - 0.5) * 0.03; c.tz = w.cz[best] + (w.rand() - 0.5) * 0.03;
          } else pickTarget(w, c, (n) => (w.pType[n] === PLANT.MOSS ? 0.5 : 0) + w.rand() * 0.3, 0.6, 6);
        }
        if (atBloom) c.energy = Math.min(1.2, c.energy + 4 * dd * w.pBloom[k]);
        c.glow = clamp(c.energy * 1.3, 0, 1);
      } else {
        c.state = 'active'; c.glow = 0; c.energy -= 0.06 * dd;
        c.tx = c.x; c.tz = c.z;
      }
      const dt = nearDewtrap(w, k);
      if (dt > 0.2 && w.rand() < dt * 0.5 * dd * 6) { feedDewtrap(w, k); kill(w, c, 'caught'); continue; }
    } else if (c.type === 'gnat') {
      c.energy -= 0.5 * dd;
      if (k >= 0) { const eat = Math.min(w.det[k], 0.4 * dd); w.det[k] -= eat; c.energy += eat * 4; }
      c.retarget -= dd;
      if (c.retarget <= 0) { c.retarget = 0.02; pickTarget(w, c, (n) => w.det[n] * 4 + w.m[n] * 0.3, 0.5); }
      const dt = nearDewtrap(w, k);
      if (dt > 0.15 && w.rand() < dt * 2.5 * dd * 6) { feedDewtrap(w, k); kill(w, c, 'caught'); continue; }
    } else if (c.type === 'frog') {
      c.energy -= 0.45 * dd;
      if (pond < 6) { c.energy -= 0.6 * dd; c.dryWarn = true; } else c.dryWarn = false;
      // hunt insects in reach
      for (const p of w.creatures) {
        if ((p.type !== 'gnat' && p.type !== 'firefly') || p.state !== 'active') continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 0.3 && w.rand() < 0.15) {
          kill(w, p, 'eaten'); c.energy = Math.min(1.3, c.energy + (p.type === 'gnat' ? 0.12 : 0.2));
          w.events.push({ e: 'tongue', id: c.id, x: p.x, z: p.z });
          break;
        }
      }
      c.retarget -= dd;
      if (c.retarget <= 0) {
        c.retarget = 0.15;
        pickTarget(w, c, (n) => {
          let s = w.w[n] > 0.005 && w.w[n] < 0.03 ? 1 : (w.w[n] >= 0.03 ? 0.4 : 0);
          for (const p of w.creatures) if (p.type === 'gnat' && p.state === 'active' && w.idx(p.x, p.z) === n) s += 0.5;
          return s;
        }, 0.6);
      }
    }

    if (ground && wet > 0.03 && c.type !== 'frog') { c.wetT += dd; if (c.wetT > 0.12) { kill(w, c, 'drowned'); continue; } } else c.wetT = Math.max(0, c.wetT - dd);
    if (c.energy <= 0) { kill(w, c, 'starved'); continue; }
    c.energy = Math.min(c.energy, 1.3);

    // breeding
    if (c.type !== 'firefly' && c.state === 'active' && c.energy > D.breedEnergy && c.age > D.breedAge && (counts[c.type] || 0) >= 2
      && w.count(c.type, { eggs: true }) < D.cap && w.rand() < (D.breedRate ?? 0.8) * dd) {
      if (c.type === 'firefly' && !night) continue;
      let ex = c.x, ez = c.z;
      if (c.type === 'firefly') {
        // lay in nearby moss
        let found = false;
        for (let s = 0; s < 12 && !found; s++) {
          const x = c.x + (w.rand() - 0.5) * 0.8, z = c.z + (w.rand() - 0.5) * 0.8, n = w.idx(x, z);
          if (n >= 0 && w.pType[n] === PLANT.MOSS && w.pBio[n] > 0.3) { ex = x; ez = z; found = true; }
        }
        if (!found) continue;
      }
      c.energy -= 0.35;
      const n = c.type === 'gnat' ? 3 : 1;
      for (let i = 0; i < n; i++) spawnCreature(w, c.type, ex, ez, { state: 'egg', hatchT: D.hatch, energy: 0.5 });
      w.events.push({ e: 'egg', type: c.type, x: ex, z: ez });
    }
  }
  // cleanup
  if (w.creatures.some((c) => c.state === 'dead')) w.creatures = w.creatures.filter((c) => c.state !== 'dead');
  for (const t in CREATURES) { const n = w.count(t); w.stats.peak[t] = Math.max(w.stats.peak[t] || 0, n); }
  return resp;
}

export function moveCreatures(w, sdt) {
  const night = w.isNight();
  for (const c of w.creatures) {
    if (c.state === 'egg' || c.state === 'dead') { c.y = w.heightAt(c.x, c.z); continue; }
    const D = CREATURES[c.type];
    c.phase += sdt;
    if (c.state === 'dormant') { c.y = w.heightAt(c.x, c.z); continue; }
    let sp = D.speed;
    if (c.type === 'firefly' && !night) sp = 0;
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
    if (c.type === 'gnat') { c.x += Math.sin(c.phase * 9 + c.id) * 0.004; c.z += Math.cos(c.phase * 7 + c.id * 2) * 0.004; }
    if (d > 0.01 && sp > 0) {
      const want = Math.atan2(dz, dx);
      let da = want - c.heading; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      c.heading += clamp(da, -3 * sdt, 3 * sdt) * (D.flier ? 2 : 1);
      const step = Math.min(d, sp * sdt);
      let nx = c.x + Math.cos(c.heading) * step, nz = c.z + Math.sin(c.heading) * step;
      const k = w.idx(nx, nz);
      if (!D.flier && (k < 0 || (w.soil[k] === 3 && c.type !== 'frog'))) { c.retarget = 0; c.tx = c.x * 0.8; c.tz = c.z * 0.8; }
      else { const r = Math.hypot(nx, nz); if (r > 0.9) { nx *= 0.9 / r; nz *= 0.9 / r; } c.x = nx; c.z = nz; }
    }
    const gy = w.heightAt(c.x, c.z);
    if (D.flier) {
      const hover = c.type === 'firefly' ? (night ? 0.12 + 0.08 * Math.sin(c.phase * 1.3 + c.id) : 0.04) : 0.05 + 0.03 * Math.sin(c.phase * 5 + c.id);
      c.y = gy + hover;
    } else {
      const k = w.idx(c.x, c.z);
      c.y = gy + (c.type === 'frog' && k >= 0 ? Math.max(0, w.w[k] - 0.01) : 0);
    }
  }
}
