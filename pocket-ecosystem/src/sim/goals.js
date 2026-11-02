import { PLANTS, CREATURES, plural } from './species.js';
import { PLANT_KEYS } from './world.js';

const pname = (k) => PLANTS[PLANT_KEYS[k]]?.name || k;
const cname = (k) => CREATURES[k]?.name || k;

// Measure the current value of a goal. Returns { v, t, ok, label }.
export function measure(w, g) {
  switch (g.type) {
    case 'plant': { const v = w.plantCount(g.plant, g.bio ?? 0.3); return { v, t: g.min, ok: v >= g.min, label: g.label || `${pname(g.plant)} patches` }; }
    case 'plantMax': { const v = w.plantCount(g.plant, 0.15); return { v, t: g.max, ok: v <= g.max, label: g.label || `${pname(g.plant)} at most`, inverse: true }; }
    case 'creature': { const v = w.count(g.creature); return { v, t: g.min, ok: v >= g.min, label: g.label || plural(cname(g.creature)) }; }
    case 'blooms': { const v = w.bloomCount(); return { v, t: g.min, ok: v >= g.min, label: g.label || 'Starblooms in flower' }; }
    case 'glow': {
      const v = w.isNight() ? w.creatures.filter((c) => c.type === 'firefly' && c.glow > 0.5).length : 0;
      return { v, t: g.min, ok: v >= g.min, label: g.label || 'Fireflies glowing (night)' };
    }
    case 'humidity': { const v = Math.round(w.rh * 100); return { v, t: `${g.min}–${g.max}%`, ok: v >= g.min && v <= g.max, label: g.label || 'Humidity in range', unit: '%' }; }
    case 'o2': { const v = +w.o2.toFixed(1); return { v, t: g.min, ok: v >= g.min, label: g.label || 'Oxygen %' }; }
    case 'pond': { const v = w.pondCells(); return { v, t: g.min, ok: v >= g.min, label: g.label || 'Pond cells' }; }
    case 'diversity': { const v = w.diversity(); return { v, t: g.min, ok: v >= g.min, label: g.label || 'Living species' }; }
    case 'day': { const v = Math.floor(w.day); return { v, t: g.min, ok: w.day >= g.min, label: g.label || 'Days survived' }; }
    case 'noMold': { const v = w.moldCells || 0; return { v, t: g.max ?? 0, ok: v <= (g.max ?? 0), label: g.label || 'Mold patches', inverse: true }; }
    case 'gnats': { const v = w.count('gnat'); return { v, t: g.max, ok: v <= g.max, label: g.label || 'Gnats at most', inverse: true }; }
    case 'clean': { const v = +((w.detAvg || 0) * 100).toFixed(0); return { v, t: g.max, ok: v <= g.max, label: g.label || 'Rot level', inverse: true }; }
    case 'frogFed': {
      const f = w.creatures.find((c) => c.type === 'frog' && c.state === 'active');
      const v = f ? Math.round(f.energy * 100) : 0;
      return { v, t: g.min ?? 60, ok: v >= (g.min ?? 60), label: g.label || 'Frog well fed', unit: '%' };
    }
    default: return { v: 0, t: 0, ok: false, label: '?' };
  }
}

export class GoalTracker {
  constructor(level) {
    this.level = level;
    this.goals = (level.goals || []).map((g) => ({ ...g, mode: g.mode || (g.hours ? 'sustain' : 'reach'), done: false, held: 0 }));
    this.won = false; this.lost = false; this.reason = '';
    this.winDay = null;
  }
  update(w, dtMin) {
    if (this.won || this.lost) return;
    for (const g of this.goals) {
      const m = measure(w, g);
      g.m = m;
      if (g.mode === 'reach') { if (m.ok) g.done = true; }
      else if (g.mode === 'sustain') {
        if (g.done) continue;
        g.held = m.ok ? g.held + dtMin / 60 : 0;
        if (g.held >= g.hours) g.done = true;
      } else if (g.mode === 'hold') g.done = m.ok;
    }
    // fail conditions
    for (const f of this.level.fail || []) {
      if (f.type === 'extinct' && w.count(f.creature, { eggs: true }) === 0) return this.lose(`All the ${plural(cname(f.creature)).toLowerCase()} are gone.`);
      if (f.type === 'plantExtinct' && w.plantCount(f.plant, 0.01) === 0) return this.lose(`The last ${pname(f.plant)} withered.`);
      if (f.type === 'mold' && (w.moldCells || 0) > f.max) return this.lose('Mold has overrun the jar.');
      if (f.type === 'gnats' && w.count('gnat') > f.max) return this.lose('A gnat swarm took over.');
      if (f.type === 'o2' && w.o2 < f.min) return this.lose('The air ran out of oxygen.');
    }
    if (this.goals.every((g) => g.done)) { this.won = true; this.winDay = w.day; return; }
    if (this.level.days && w.day >= this.level.days) this.lose('Time ran out.');
  }
  lose(r) { this.lost = true; this.reason = r; }
  stars(w) {
    if (!this.won) return 0;
    let s = 1;
    if (this.winDay <= (this.level.par ?? Infinity)) s++;
    const b = this.level.bonus;
    if (b) {
      let ok = false;
      if (b.type === 'maxTools') ok = w.toolUses <= b.n;
      else if (b.type === 'noVent') ok = w.ventMinutes === 0;
      else if (b.type === 'noLoss') ok = Object.entries(w.stats.died).every(([t, n]) => t === 'gnat' || n === 0);
      else ok = measure(w, b).ok;
      if (ok) s++;
    }
    return s;
  }
  bonusLabel() {
    const b = this.level.bonus; if (!b) return '';
    if (b.type === 'maxTools') return `Use ${b.n} or fewer tools`;
    if (b.type === 'noVent') return 'Never open the vent';
    if (b.type === 'noLoss') return 'No creature deaths';
    return b.label || '';
  }
}
