import { PLANT, PLANTS, CREATURES } from './species.js';
import { mulberry32, makeNoise } from './rng.js';
import { stepCreatures, moveCreatures, spawnCreature } from './creatures.js';

export const G = 28;            // grid resolution
export const R = 1;             // jar floor radius (world units)
export const CS = (2 * R) / G;  // cell size
export const DAY = 1440;        // minutes
export const MIN_PER_SEC = 20;  // game minutes per real second at 1x (72 s per day)
export const SOILCAP = 0.04;    // water depth that saturates soil
export const TICK = 5;          // ecology tick, game minutes
const TILT_K = 0.16;
const PERM = [0.0025, 0.009, 0.000005, 0];   // soil, sand, clay, rock
const SOIL = { SOIL: 0, SAND: 1, CLAY: 2, ROCK: 3 };
const PLANT_KEYS = Object.fromEntries(Object.entries(PLANTS).map(([id, s]) => [s.key, +id]));
export { PLANT_KEYS, SOIL };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function comfort(v, [lo, hi], margin = 0.2) {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return clamp(1 - d / margin, 0, 1);
}
export const satVapor = (T) => 0.004 * Math.exp(0.065 * (T - 20));

export class World {
  constructor(level, seed = 1) {
    this.level = level;
    this.rand = mulberry32(seed * 7919 + (level.id || 1) * 104729);
    const N = G * G;
    this.N = N;
    this.inside = new Uint8Array(N);
    this.rim = new Uint8Array(N);
    this.cx = new Float32Array(N); this.cz = new Float32Array(N);
    this.h = new Float32Array(N); this.soil = new Uint8Array(N);
    this.w = new Float32Array(N); this.m = new Float32Array(N);
    this.nu = new Float32Array(N); this.det = new Float32Array(N);
    this.light = new Float32Array(N); this.la = new Float32Array(N); this.shade = new Float32Array(N);
    this.pType = new Uint8Array(N); this.pBio = new Float32Array(N); this.pAge = new Float32Array(N);
    this.pHealth = new Float32Array(N); this.pBloom = new Float32Array(N); this.pBloomT = new Float32Array(N);
    this.mold = new Float32Array(N);
    this.flux = new Float32Array(N * 4);
    this.nbr = new Int32Array(N * 4).fill(-1);
    this.insideList = [];
    this.rimList = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const k = j * G + i;
      const x = -R + (i + 0.5) * CS, z = -R + (j + 0.5) * CS;
      this.cx[k] = x; this.cz[k] = z;
      const r = Math.hypot(x, z);
      if (r < R * 0.97) { this.inside[k] = 1; this.insideList.push(k); if (r > R * 0.8) { this.rim[k] = 1; this.rimList.push(k); } }
    }
    for (const k of this.insideList) {
      const i = k % G, j = (k / G) | 0;
      const ns = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
      ns.forEach(([a, b], d) => { if (a >= 0 && b >= 0 && a < G && b < G && this.inside[b * G + a]) this.nbr[k * 4 + d] = b * G + a; });
    }
    this.nIn = this.insideList.length;

    // Global state
    const air = level.air || {};
    this.time = (level.startHour ?? 7) * 60;
    this.temp = air.temp ?? 21;
    this.vapor = satVapor(this.temp) * (air.hum ?? 0.6);
    this.glass = 0;
    this.o2 = air.o2 ?? 21; this.co2 = air.co2 ?? 600;
    this.windowLight = level.window ?? 1;
    this.rot = level.rot ?? 0;
    this.tiltX = 0; this.tiltZ = 0;
    this.vent = false; this.lamp = false;
    this.inv = JSON.parse(JSON.stringify(level.inventory || {}));
    this.lampBattery = this.inv.lamp ?? 0;   // hours
    this.creatures = [];
    this.nextId = 1;
    this.events = [];
    this.tickAcc = 0;
    this.sunI = 0;
    this.toolUses = 0;
    this.ventMinutes = 0;
    this.stats = { born: {}, died: {}, peak: {} };
    this.wildSpawns = level.wild ?? true;
    this.buildTerrain(level.terrain || {});
    this.seedInitial(level);
    this.computeLight();
    for (const k of this.insideList) this.la[k] = this.dayLightEstimate(k);
  }

  idx(x, z) {
    const i = Math.floor((x + R) / CS), j = Math.floor((z + R) / CS);
    if (i < 0 || j < 0 || i >= G || j >= G) return -1;
    const k = j * G + i;
    return this.inside[k] ? k : -1;
  }

  heightAt(x, z) {
    // bilinear over cell centers
    const fx = (x + R) / CS - 0.5, fz = (z + R) / CS - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const H = (a, b) => {
      a = clamp(a, 0, G - 1); b = clamp(b, 0, G - 1);
      const k = b * G + a; return this.inside[k] ? this.h[k] : this.h[this.nearestInside(a, b)];
    };
    return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v;
  }
  nearestInside(a, b) {
    const x = -R + (a + 0.5) * CS, z = -R + (b + 0.5) * CS, r = Math.hypot(x, z) || 1;
    const s = (R * 0.9) / r;
    const k = this.idx(x * s, z * s);
    return k < 0 ? this.insideList[0] : k;
  }

  regionCells({ x = 0, z = 0, r = 0.2 }) {
    const out = [];
    for (const k of this.insideList) if (Math.hypot(this.cx[k] - x, this.cz[k] - z) <= r) out.push(k);
    return out;
  }

  buildTerrain(t) {
    const noise = makeNoise(this.rand);
    const base = t.base ?? 0.08;
    const [sx, sz] = t.slope || [0, 0];
    for (const k of this.insideList) {
      const x = this.cx[k], z = this.cz[k];
      let h = base + sx * x + sz * z + (noise(x * 2.2 + 9, z * 2.2 + 3) - 0.5) * (t.noise ?? 0.03);
      for (const hl of t.hills || []) { const d = Math.hypot(x - hl.x, z - hl.z) / hl.r; if (d < 1) h += hl.h * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
      for (const b of t.basins || []) { const d = Math.hypot(x - b.x, z - b.z) / b.r; if (d < 1) h -= b.d * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
      this.h[k] = Math.max(0.005, h);
      this.soil[k] = SOIL.SOIL;
    }
    const paint = (list, type, lift = 0) => (list || []).forEach((p) => this.regionCells(p).forEach((k) => {
      this.soil[k] = type;
      if (lift) this.h[k] += lift * (1 - Math.hypot(this.cx[k] - p.x, this.cz[k] - p.z) / (p.r * 1.3));
    }));
    paint(t.sand, SOIL.SAND); paint(t.clay, SOIL.CLAY); paint(t.rocks, SOIL.ROCK, 0.07);
  }

  seedInitial(L) {
    const ini = L.initial || {};
    for (const k of this.insideList) {
      this.m[k] = this.soil[k] === SOIL.ROCK ? 0 : (ini.moist ?? 0.5);
      this.nu[k] = this.soil[k] === SOIL.ROCK ? 0 : (ini.nut ?? 0.45) * (this.soil[k] === SOIL.SAND ? 0.5 : 1);
    }
    for (const p of ini.moistPatches || []) this.regionCells(p).forEach((k) => { if (this.soil[k] !== SOIL.ROCK) this.m[k] = p.v; });
    for (const p of ini.nutPatches || []) this.regionCells(p).forEach((k) => { if (this.soil[k] !== SOIL.ROCK) this.nu[k] = p.v; });
    for (const p of ini.det || []) this.regionCells(p).forEach((k) => { this.det[k] += p.a; });
    for (const p of ini.water || []) this.regionCells(p).forEach((k) => { this.w[k] += p.d; });
    if (ini.fillPond) this.fillBasins(ini.fillPond);
    for (const p of L.plants || []) {
      const t = PLANT_KEYS[p.type];
      this.regionCells(p).forEach((k) => {
        if (this.rand() > (p.density ?? 1)) return;
        this.plantAt(k, t, p.bio ?? 0.6, true);
        if (p.age != null) this.pAge[k] = p.age;
      });
    }
    for (const c of L.creatures || []) {
      for (let n = 0; n < c.n; n++) {
        const a = this.rand() * Math.PI * 2, rr = Math.sqrt(this.rand()) * (c.r ?? 0.5);
        spawnCreature(this, c.type, (c.x ?? 0) + Math.cos(a) * rr, (c.z ?? 0) + Math.sin(a) * rr, { energy: 0.7, age: 1 + this.rand() });
      }
    }
  }

  fillBasins(depth) {
    // fill cells below a water level
    for (const k of this.insideList) { const d = depth - this.h[k]; if (d > 0) { this.w[k] = d; this.m[k] = 1; if (this.soil[k] !== SOIL.ROCK) this.soil[k] = SOIL.CLAY; } }
  }

  plantAt(k, type, bio = 0.15, force = false) {
    if (k < 0 || !this.inside[k] || this.soil[k] === SOIL.ROCK) return false;
    const S = PLANTS[type];
    if (!force) {
      if (this.pType[k]) return false;
      if (S.aquatic ? this.w[k] < 0.006 : this.w[k] > S.drown) return false;
    }
    this.pType[k] = type; this.pBio[k] = bio; this.pAge[k] = 0; this.pHealth[k] = 1; this.pBloom[k] = 0; this.pBloomT[k] = 0;
    return true;
  }

  killPlant(k, cause = 'stress') {
    const t = this.pType[k];
    if (!t) return;
    this.det[k] += this.pBio[k] * 0.55 + 0.05;
    this.events.push({ e: 'plantDie', k, t, cause });
    this.pType[k] = 0; this.pBio[k] = 0; this.pBloom[k] = 0;
  }

  // ---------- Player actions ----------
  act(a) {
    const inv = this.inv;
    if (a.tool === 'mist') {
      if (!(inv.mist > 0)) return false;
      inv.mist--; this.toolUses++;
      for (const k of this.regionCells({ x: a.x, z: a.z, r: 0.17 })) { this.w[k] += 0.012; }
      this.events.push({ e: 'mist', x: a.x, z: a.z });
      return true;
    }
    if (a.tool === 'seed') {
      const t = PLANT_KEYS[a.type];
      if (!(inv.seeds?.[a.type] > 0)) return false;
      const cells = this.regionCells({ x: a.x, z: a.z, r: 0.09 });
      let any = false;
      for (const k of cells) any = this.plantAt(k, t, 0.15) || any;
      if (!any) { const k = this.idx(a.x, a.z); any = this.plantAt(k, t, 0.15); }
      if (!any) return false;
      inv.seeds[a.type]--; this.toolUses++;
      this.events.push({ e: 'seed', x: a.x, z: a.z, type: a.type });
      return true;
    }
    if (a.tool === 'creature') {
      if (!(inv.creatures?.[a.type] > 0)) return false;
      if (this.idx(a.x, a.z) < 0) return false;
      inv.creatures[a.type]--; this.toolUses++;
      const n = a.type === 'frog' ? 1 : 2;
      for (let i = 0; i < n; i++) spawnCreature(this, a.type, a.x + (this.rand() - 0.5) * 0.08, a.z + (this.rand() - 0.5) * 0.08, { energy: 0.8, age: 1.2 });
      this.events.push({ e: 'release', x: a.x, z: a.z, type: a.type });
      return true;
    }
    if (a.tool === 'prune') {
      if (!(inv.prune > 0)) return false;
      const cells = this.regionCells({ x: a.x, z: a.z, r: 0.1 });
      let any = false;
      for (const k of cells) if (this.pType[k]) { this.killPlant(k, 'prune'); any = true; }
      for (const k of cells) if (this.mold[k] > 0) { this.det[k] += this.mold[k] * 0.2; this.mold[k] = 0; any = true; }
      if (any) { inv.prune--; this.toolUses++; this.events.push({ e: 'prune', x: a.x, z: a.z }); }
      return any;
    }
    if (a.tool === 'vent') {
      if (!inv.vent) return false;
      this.vent = a.on ?? !this.vent; this.toolUses++;
      this.events.push({ e: 'vent', on: this.vent });
      return true;
    }
    if (a.tool === 'lamp') {
      if (!(this.lampBattery > 0)) { this.lamp = false; return false; }
      this.lamp = a.on ?? !this.lamp; this.toolUses++;
      this.events.push({ e: 'lamp', on: this.lamp });
      return true;
    }
    return false;
  }

  setTilt(x, z) { this.tiltX = clamp(x, -1, 1); this.tiltZ = clamp(z, -1, 1); }
  setRotation(r) { if (this.level.rotate !== false) this.rot = r; }

  // ---------- Simulation ----------
  update(realDt, speed = 1) {
    const sdt = Math.min(realDt, 0.1) * speed;
    // water physics, substepped
    let rem = sdt;
    while (rem > 1e-6) { const d = Math.min(rem, 1 / 30); this.flowWater(d); rem -= d; }
    moveCreatures(this, sdt);
    this.tickAcc += sdt * MIN_PER_SEC;
    while (this.tickAcc >= TICK) { this.tickAcc -= TICK; this.ecoTick(TICK); }
  }

  flowWater(dt) {
    const { w, h, flux, nbr, cx, cz } = this;
    const tx = this.tiltX * TILT_K, tz = this.tiltZ * TILT_K;
    const C = 5.5;
    for (const k of this.insideList) {
      const wk = w[k];
      if (wk <= 1e-6) { flux[k * 4] = flux[k * 4 + 1] = flux[k * 4 + 2] = flux[k * 4 + 3] = 0; continue; }
      const sk = h[k] + wk - (tx * cx[k] + tz * cz[k]);
      let tot = 0;
      for (let d = 0; d < 4; d++) {
        const n = nbr[k * 4 + d];
        let f = 0;
        if (n >= 0) { const sn = h[n] + w[n] - (tx * cx[n] + tz * cz[n]); const diff = sk - sn; if (diff > 0) f = Math.min(diff, wk) * C * dt; }
        flux[k * 4 + d] = f; tot += f;
      }
      if (tot > wk * 0.9) { const s = (wk * 0.9) / tot; for (let d = 0; d < 4; d++) flux[k * 4 + d] *= s; }
    }
    let moved = 0;
    for (const k of this.insideList) for (let d = 0; d < 4; d++) {
      const f = flux[k * 4 + d]; if (f <= 0) continue;
      const n = nbr[k * 4 + d]; w[k] -= f; w[n] += f; moved += f;
    }
    this.flowRate = moved / dt;
    // infiltration
    for (const k of this.insideList) {
      const wk = w[k]; if (wk <= 0) continue;
      const cap = (1 - this.m[k]) * SOILCAP;
      const inf = Math.min(wk, PERM[this.soil[k]] * dt, cap);
      if (inf > 0) { w[k] -= inf; this.m[k] += inf / SOILCAP; }
      if (w[k] < 1e-6) w[k] = 0;
    }
  }

  sunIntensity(t = this.time) {
    const f = (t % DAY) / DAY;
    const s = Math.sin(2 * Math.PI * (f - 0.25));
    return s > 0 ? Math.pow(s, 0.8) * this.windowLight : 0;
  }
  isNight() { return this.sunI < 0.05; }
  sunDirLocal() { const a = -this.rot; return [Math.cos(a), Math.sin(a)]; }

  computeLight() {
    this.sunI = this.sunIntensity();
    const [dx, dz] = this.sunDirLocal();
    const lampI = this.lamp ? 0.65 : 0;
    // shading from tall plants toward the sun
    for (const k of this.insideList) {
      let sh = 0;
      for (let s = 1; s <= 2; s++) {
        const n = this.idx(this.cx[k] + dx * CS * s, this.cz[k] + dz * CS * s);
        if (n >= 0 && this.pType[n]) sh += PLANTS[this.pType[n]].tall * this.pBio[n] * (s === 1 ? 0.45 : 0.25);
      }
      if (this.pType[k] === PLANT.FERN) sh += 0; // own canopy not self-shading
      this.shade[k] = Math.min(0.75, sh);
      const pos = (this.cx[k] * dx + this.cz[k] * dz) / R;
      const r = Math.hypot(this.cx[k], this.cz[k]) / R;
      const sun = this.sunI * (0.6 + 0.4 * pos) * (1 - this.shade[k]);
      const lamp = lampI * (1 - 0.35 * r) * (1 - this.shade[k] * 0.5);
      this.light[k] = Math.min(1.2, sun + lamp);
    }
  }
  dayLightEstimate(k) {
    const [dx, dz] = this.sunDirLocal();
    const pos = (this.cx[k] * dx + this.cz[k] * dz) / R;
    return 0.68 * this.windowLight * (0.6 + 0.4 * pos);
  }

  ecoTick(dtMin) {
    const dd = dtMin / DAY;
    this.time += dtMin;
    this.computeLight();
    const lightOn = this.sunI > 0.05 || this.lamp;
    if (this.lamp) { this.lampBattery -= dtMin / 60; if (this.lampBattery <= 0) { this.lampBattery = 0; this.lamp = false; this.events.push({ e: 'lamp', on: false }); } }
    if (this.vent) this.ventMinutes += dtMin;

    // --- temperature ---
    const target = 20 + 9 * this.sunI + (this.lamp ? 4 : 0) + (this.vent ? 0 : 1.5 * this.sunI);
    const room = 21;
    this.temp += (target - this.temp) * 0.06 + (this.vent ? (room - this.temp) * 0.05 : 0);
    const sat = satVapor(this.temp);
    let RH = this.vapor / sat;

    // --- plants ---
    const fc = clamp((this.co2 - 150) / 250, 0, 1);
    let photo = 0, resp = 0;
    const nIn = this.nIn;
    for (const k of this.insideList) {
      if (lightOn) this.la[k] += (this.light[k] - this.la[k]) * Math.min(1, dd / 0.35);
      const t = this.pType[k];
      if (!t) continue;
      const S = PLANTS[t];
      const L = this.light[k];
      const fm = S.aquatic ? (this.w[k] > 0.006 ? 1 : 0) : comfort(this.m[k], S.moist, S.dryMargin ?? 0.2);
      const fl = comfort(this.la[k], S.light, 0.18);
      let fn = S.nut > 0 ? clamp(this.nu[k] / (S.nut * 0.6), 0, 1) : 1;
      let dark = 1;
      if (S.needsDet) { fn = clamp(this.det[k] / 0.12, 0, 1); dark = clamp(1 - L * 2.5, 0, 1); }
      const photoInst = S.needsDet ? dark * 0.6 : L * fc;
      const bio = this.pBio[k];
      let dBio = S.growth * 3.6 * fm * fl * fn * photoInst * (1 - bio) * dd;
      if (S.carnivore && this.nu[k] > 0.75) dBio *= 0.3;
      if (dBio > 0) {
        this.pBio[k] = bio + dBio;
        if (S.nut > 0) this.nu[k] = Math.max(0, this.nu[k] - dBio * S.nut * 0.5);
        if (S.needsDet) { const c = Math.min(this.det[k], dBio * 0.8 + bio * 2.2 * dd); this.det[k] -= c; this.nu[k] = Math.min(1.2, this.nu[k] + c * 0.9); }
        else photo += dBio + bio * L * fc * dd * 0.6;
      }
      // transpiration (adds humidity)
      if (!S.aquatic && !S.needsDet && L > 0.05) {
        const tr = Math.min(this.m[k], bio * (0.1 + S.tall * 0.15) * L * dd * clamp(1.1 - RH, 0.1, 1) * 2);
        this.m[k] -= tr; this.vapor += (tr * SOILCAP) / nIn;
      }
      resp += bio * 0.12 * dd;
      // leaf litter
      if (!S.aquatic && !S.needsDet) { const lit = this.pBio[k] * 0.035 * dd; this.pBio[k] -= lit * 0.5; this.det[k] += lit; }
      // stress / health
      let stress = (1 - fm) * 1.6 + (1 - fl) * 0.7;
      if (!S.aquatic && this.w[k] > S.drown) stress += 2.2;
      if (S.aquatic && this.w[k] < 0.004) stress += 3;
      if (this.temp > S.heatMax) stress += (this.temp - S.heatMax) * 0.4;
      if (t === PLANT.MOSS && L > 0.75 && this.m[k] < 0.55) stress += 1.1;
      if (S.nut > 0 && this.nu[k] < 0.04) stress += 0.35;
      if (S.carnivore && this.nu[k] > 0.85) stress += 0.5;
      if (S.needsDet && this.det[k] < 0.02) stress += 0.5;
      stress += this.mold[k] * 1.6;
      const hp = this.pHealth[k] + (stress > 0.08 ? -stress * 0.9 : 0.6) * dd;
      this.pHealth[k] = Math.min(1, hp);
      this.pAge[k] += dd;
      if (hp <= 0 || this.pAge[k] > S.maxAge) { this.killPlant(k, hp <= 0 ? 'stress' : 'age'); continue; }
      // blooming
      if (t === PLANT.BLOOM) {
        const ok = this.pAge[k] >= S.matureAge && this.pHealth[k] > 0.55 && fl > 0.6 && this.nu[k] > 0.12 && this.pBio[k] > 0.5;
        if (ok) { const b0 = this.pBloom[k]; this.pBloom[k] = Math.min(1, b0 + dd * 2.5); if (b0 < 0.7 && this.pBloom[k] >= 0.7) this.events.push({ e: 'bloom', k }); }
        else this.pBloom[k] = Math.max(0, this.pBloom[k] - dd * 1.5);
        if (this.pBloom[k] > 0.7) {
          this.pBloomT[k] += dd;
          if (this.pBloomT[k] > 1.6) {
            for (let s = 0; s < 4; s++) this.trySpread(k, t, 1.6);
            this.pBloom[k] = 0; this.pBloomT[k] = 0; this.pAge[k] = S.matureAge - 0.7;
            this.nu[k] = Math.max(0, this.nu[k] - 0.1);
            this.events.push({ e: 'seedBurst', k });
          }
        }
      }
      // spreading
      const vig = fm * fl * fn;
      if (this.pBio[k] > 0.55 && this.pHealth[k] > 0.5 && this.rand() < S.spread * dd * 6 * vig) this.trySpread(k, t, 1);
    }

    // --- soil processes ---
    this.bloomList = [];
    for (const k of this.insideList) if (this.pType[k] === PLANT.BLOOM && this.pBloom[k] > 0.3) this.bloomList.push(k);
    let detTot = 0;
    for (const k of this.insideList) {
      if (this.soil[k] === SOIL.ROCK) { this.m[k] = 0; continue; }
      const d = this.det[k];
      if (d > 0) {
        const dec = d * 0.12 * dd * (0.3 + this.m[k]);
        this.det[k] -= dec; this.nu[k] = Math.min(1.2, this.nu[k] + dec * 0.8); resp += dec * 1.2;
      }
      detTot += this.det[k];
      // saturated soil seeps out as surface water
      if (this.m[k] > 0.86 && this.soil[k] !== SOIL.CLAY) { const ex = (this.m[k] - 0.86) * 0.5; this.m[k] -= ex; this.w[k] += ex * SOILCAP; }
      // evaporation from soil & surface water
      const dry = clamp(1 - RH, 0, 1) * (0.6 + this.temp / 40);
      const cover = this.pType[k] ? 0.5 : 1;
      if (this.w[k] > 0) {
        const e = Math.min(this.w[k], 0.008 * dry * dd * (0.4 + this.sunI));
        this.w[k] -= e; this.vapor += e / nIn;
      }
      const es = Math.min(this.m[k], 0.9 * dry * cover * dd * (0.3 + this.light[k]) * this.m[k]);
      this.m[k] -= es; this.vapor += (es * SOILCAP) / nIn;
    }
    this.detAvg = detTot / nIn;
    // lateral diffusion of moisture & nutrients
    this.diffuse(this.m, 1.6 * dd, true); this.diffuse(this.nu, 0.15 * dd, true);

    // --- humidity, glass condensation, drips ---
    RH = this.vapor / sat;
    const glassCool = this.isNight() ? 1 : 0.25;
    let cond = 0;
    if (RH > 1) cond += (this.vapor - sat) * 0.6;
    if (RH > 0.82) cond += (RH - 0.82) * sat * 0.5 * glassCool * dd * 30;
    cond = Math.min(cond, this.vapor * 0.5);
    this.vapor -= cond; this.glass += cond;
    if (this.glass > 0.0007) {
      const drip = (this.glass - 0.0005) * 0.35;
      this.glass -= drip;
      const perCell = (drip * nIn) / this.rimList.length;
      const [tx, tz] = [this.tiltX, this.tiltZ];
      for (const k of this.rimList) {
        const bias = 1 + 0.8 * (tx * this.cx[k] + tz * this.cz[k]);
        this.w[k] += perCell * clamp(bias, 0.2, 1.8);
      }
      if (drip > 0.00003) this.events.push({ e: 'drip' });
    }
    // glass also slowly re-evaporates when warm & dry
    if (!this.isNight() && RH < 0.8 && this.glass > 0) { const ev = Math.min(this.glass, this.glass * 0.4 * dd * 10); this.glass -= ev; this.vapor += ev; }

    // --- vent ---
    if (this.vent) {
      const outV = satVapor(this.temp) * 0.35;
      this.vapor += (outV - this.vapor) * 0.08;
      this.glass *= 0.9;
      this.o2 += (21 - this.o2) * 0.1; this.co2 += (420 - this.co2) * 0.1;
    }

    // --- mold ---
    RH = this.vapor / satVapor(this.temp);
    this.RH = RH;
    let moldTot = 0;
    for (const k of this.insideList) {
      let mo = this.mold[k];
      if (RH > 0.9 && this.det[k] > 0.2 && this.temp > 17 && this.level.mold !== false) mo += 0.5 * dd * (RH - 0.85) * 8 * Math.min(1, this.det[k]);
      if (mo > 0.5 && RH > 0.88) for (let d = 0; d < 4; d++) { const n = this.nbr[k * 4 + d]; if (n >= 0 && this.rand() < 0.6 * dd * 6) this.mold[n] = Math.max(this.mold[n], 0.12); }
      if (RH < 0.78) mo -= 1.0 * dd * (0.8 - RH) * 6;
      mo -= this.pType[k] === PLANT.MUSHROOM ? 0.3 * dd : 0;
      this.mold[k] = clamp(mo, 0, 1);
      if (this.mold[k] > 0.05) { this.det[k] += 0.02 * dd; moldTot++; }
    }
    this.moldCells = moldTot;

    // --- gases ---
    const crRes = stepCreatures(this, dd);
    resp += crRes;
    if (!this.vent) {
      this.co2 += (resp - photo) * 9000 / Math.max(80, nIn);
      this.o2 += (photo - resp) * 20 / Math.max(80, nIn);
    }
    this.co2 = clamp(this.co2, 80, 9000); this.o2 = clamp(this.o2, 4, 32);

    // --- wild spawns ---
    if (this.wildSpawns) {
      let pool = 0, bk = -1, bv = 0;
      for (const k of this.insideList) { const e = this.det[k] - 0.12; if (e > 0) { pool += e; if (e > bv) { bv = e; bk = k; } } }
      if (bk >= 0 && this.rand() < pool * 0.25 * dd && this.count('gnat') < CREATURES.gnat.cap) spawnCreature(this, 'gnat', this.cx[bk], this.cz[bk], { energy: 0.6, age: 0.5 });
      if (this.isNight()) for (const k of this.insideList) {
        if (!this.pType[k] && this.det[k] > 0.25 && this.m[k] > 0.6 && this.rand() < 0.15 * dd && this.w[k] < 0.02) this.plantAt(k, PLANT.MUSHROOM, 0.1);
      }
    }
  }

  trySpread(k, t, boost) {
    const S = PLANTS[t];
    const i = k % G, j = (k / G) | 0;
    const di = Math.floor(this.rand() * 3) - 1, dj = Math.floor(this.rand() * 3) - 1;
    const r2 = boost > 1 ? 2 : 1;
    const a = i + di * r2, b = j + dj * r2;
    if (a < 0 || b < 0 || a >= G || b >= G) return;
    const n = b * G + a;
    if (!this.inside[n] || this.pType[n] || this.soil[n] === SOIL.ROCK) return;
    if (S.aquatic ? this.w[n] < 0.008 : this.w[n] > S.drown * 0.8) return;
    if (!S.aquatic && comfort(this.m[n], S.moist) < 0.3) return;
    if (S.needsDet && this.det[n] < 0.08) return;
    if (comfort(this.la[n], S.light, 0.18) < 0.3) return;
    this.plantAt(n, t, 0.12);
    this.events.push({ e: 'sprout', k: n, t });
  }

  diffuse(arr, rate, skipRock) {
    const tmp = this._tmp || (this._tmp = new Float32Array(this.N));
    tmp.set(arr);
    for (const k of this.insideList) {
      if (skipRock && this.soil[k] === SOIL.ROCK) continue;
      for (let d = 0; d < 2; d++) {
        const n = this.nbr[k * 4 + d * 2]; if (n < 0 || (skipRock && this.soil[n] === SOIL.ROCK)) continue;
        const cl = (this.soil[k] === SOIL.CLAY || this.soil[n] === SOIL.CLAY) ? 0.02 : 1;
        const f = (arr[k] - arr[n]) * Math.min(0.24, rate * cl);
        tmp[k] -= f; tmp[n] += f;
      }
    }
    arr.set(tmp);
  }

  argmax(arr) { let b = this.insideList[0], bv = -1; for (const k of this.insideList) if (arr[k] > bv) { bv = arr[k]; b = k; } return b; }
  count(type, opts = {}) {
    let n = 0;
    for (const c of this.creatures) if (c.type === type && c.state !== 'dead' && (opts.eggs || c.state !== 'egg')) n++;
    return n;
  }
  plantCount(key, minBio = 0.3) { const t = PLANT_KEYS[key]; let n = 0; for (const k of this.insideList) if (this.pType[k] === t && this.pBio[k] >= minBio) n++; return n; }
  bloomCount() { let n = 0; for (const k of this.insideList) if (this.pType[k] === PLANT.BLOOM && this.pBloom[k] > 0.7) n++; return n; }
  pondCells(minDepth = 0.012) { let n = 0; for (const k of this.insideList) if (this.w[k] >= minDepth) n++; return n; }
  totalWater() { let s = 0; for (const k of this.insideList) s += this.w[k] + this.m[k] * SOILCAP; return s / this.nIn + this.vapor + this.glass; }
  diversity() {
    const set = new Set();
    for (const k of this.insideList) if (this.pType[k] && this.pBio[k] > 0.25) set.add(this.pType[k]);
    for (const c of this.creatures) if (c.state === 'active' || c.state === 'dormant') if (c.type !== 'gnat') set.add(c.type);
    return set.size;
  }
  get day() { return this.time / DAY; }
  get hour() { return (this.time % DAY) / 60; }
  get rh() { return this.vapor / satVapor(this.temp); }
}
