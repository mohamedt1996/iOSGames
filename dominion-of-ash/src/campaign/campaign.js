import { HexGrid, offsetToAxial, key, dist } from '../core/hex.js';
import { mulberry32, makeNoise } from '../core/rng.js';
import { UNITS } from '../data/units.js';

export const MAP_COLS = 9, MAP_ROWS = 12;
export const REGION = {
  plains: { name: 'Plains', recipe: 'plains', pass: true },
  forest: { name: 'Forest', recipe: 'forest', pass: true },
  hills: { name: 'Hills', recipe: 'hills', pass: true },
  mountain: { name: 'Mountains', pass: false },
  river: { name: 'River crossing', recipe: 'river', pass: true },
  marsh: { name: 'Blackmere', recipe: 'marsh', pass: true },
  town: { name: 'Town', recipe: 'village', pass: true, income: 35, recruit: true },
  mine: { name: 'Iron mine', recipe: 'hills', pass: true, income: 25 },
  shrine: { name: 'Ember shrine', recipe: 'forest', pass: true, relic: true },
  capital: { name: 'Emberhold', recipe: 'village', pass: true, income: 50, recruit: true },
  citadel: { name: 'The Ashen Citadel', recipe: 'citadel', pass: true },
  sea: { name: 'Sea', pass: false },
};

export const PERKS = {
  vanguard: { name: 'Vanguard', text: 'Your army deploys one row further forward.' },
  surgeon: { name: 'Field Surgeons', text: 'Survivors heal fully after every battle.' },
  firestorm: { name: 'Firestorm', text: 'Fireballs burn wider and hit 20% harder.' },
  quartermaster: { name: 'Quartermaster', text: 'Recruits cost 20% less.' },
  discipline: { name: 'Iron Discipline', text: 'Your soldiers start battles with 30% more nerve.' },
  march: { name: 'Forced March', text: 'Your army can move two regions per turn.' },
  banners: { name: 'Ember Banners', text: 'Your units deal 8% more damage.' },
  scouts: { name: 'Scout Network', text: 'See the exact makeup of Legion warbands before you fight.' },
};

const EVENTS = [
  { id: 'refugees', title: 'Refugees at the gate', text: 'Villagers fleeing the ash beg for shelter. Some can hold a spear.',
    a: { label: 'Take them in (−25 gold, +1 Shieldknight)', fx: { gold: -25, unit: 'knight' } }, b: { label: 'Send them south (+15 gold from their goods)', fx: { gold: 15 } } },
  { id: 'deserter', title: 'A deserter from the Legion', text: 'A pale man claims he served the Ashen King and knows his mind.',
    a: { label: 'Pay him (−30 gold): the King forgets one lesson', fx: { gold: -30, forget: true } }, b: { label: 'Turn him away', fx: {} } },
  { id: 'harvest', title: 'Late harvest', text: 'The fields south of Emberhold came in heavy this year.',
    a: { label: 'Sell the surplus (+40 gold)', fx: { gold: 40 } }, b: { label: 'Feed the army (all units heal)', fx: { heal: true } } },
  { id: 'smith', title: 'The wandering smith', text: 'A smith offers to temper your soldiers\' steel.',
    a: { label: 'Pay 35 gold: two soldiers gain a rank', fx: { gold: -35, vet: 2 } }, b: { label: 'Decline', fx: {} } },
  { id: 'omens', title: 'Ash on the wind', text: 'The sky turns grey. The Legion grows bolder in the dark.',
    a: { label: 'Light the beacons (−20 gold, no night this turn)', fx: { gold: -20, day: true } }, b: { label: 'Let it pass', fx: {} } },
];

const NAMES = ['the Hollow Host', 'the Grey Procession', 'the Bone Choir', 'the Cinder March', 'the Pale Tide', 'the Ninth Grave', 'the Rattling Few'];

export function newCampaign(seed = Date.now() % 100000) {
  const rand = mulberry32(seed), noise = makeNoise(rand);
  const g = new HexGrid();
  const cx = (MAP_COLS - 1) / 2, cy = (MAP_ROWS - 1) / 2;
  for (let row = 0; row < MAP_ROWS; row++) for (let col = 0; col < MAP_COLS; col++) {
    const [q, r] = offsetToAxial(col, row);
    const dx = (col - cx) / (MAP_COLS / 2), dy = (row - cy) / (MAP_ROWS / 2);
    const edge = Math.hypot(dx * 0.95, dy * 0.85) + (noise(col * 0.6, row * 0.6) - 0.5) * 0.45;
    let type = edge > 1 ? 'sea' : 'plains';
    if (type !== 'sea') {
      const n = noise(col * 0.5 + 11, row * 0.5 + 4);
      if (n > 0.66) type = 'forest'; else if (n < 0.24) type = 'hills';
      if (noise(col * 0.9 + 30, row * 0.9) > 0.8) type = 'mountain';
      if (row === 6 || row === 5 && col % 3 === 0) type = rand() < 0.5 ? 'river' : type;
      if (row === 3 && col > 5) type = rand() < 0.4 ? 'marsh' : type;
    }
    g.set(q, r, { type, col, row, owner: row >= 8 ? 'ember' : row <= 2 ? 'ash' : null });
  }
  const at = (col, row) => g.get(...offsetToAxial(col, row));
  const place = (col, row, type, owner) => { const c = at(col, row); c.type = type; if (owner !== undefined) c.owner = owner; return c; };
  const capital = place(4, 10, 'capital', 'ember');
  const citadel = place(4, 1, 'citadel', 'ash');
  for (const [c, r] of [[2, 9], [6, 8], [1, 6], [7, 5], [3, 4], [5, 2]]) place(c, r, 'town');
  for (const [c, r] of [[6, 10], [2, 3], [7, 7]]) place(c, r, 'mine');
  for (const [c, r] of [[1, 8], [8, 4]]) place(c, r, 'shrine');
  // make sure land connects capital to citadel
  for (let row = 1; row <= 10; row++) { const c = at(4, row); if (!REGION[c.type].pass) c.type = 'plains'; }
  for (const c of g) if (c.type !== 'sea') for (const n of g.neighbors(c)) if (n.type === 'sea' && rand() < 0.04) n.type = 'plains';
  const state = {
    seed, turn: 1, gold: 120, legionGold: 80, over: false, won: false,
    regions: [...g].map((c) => ({ q: c.q, r: c.r, type: c.type, owner: c.owner, relicTaken: false })),
    army: { q: capital.q, r: capital.r, moves: 1, units: ['knight', 'knight', 'ranger', 'ranger', 'barbarian', 'pyromancer'].map((t) => ({ type: t, vet: 0, xp: 0 })), hero: { level: 1, xp: 0, perks: [] } },
    warbands: [
      { id: 1, q: citadel.q, r: citadel.r + 1, strength: 360, name: NAMES[0] },
      { id: 2, ...nearest(g, 6, 3), strength: 300, name: NAMES[1] },
    ],
    nextBand: 3, log: [`Turn 1. The ash clouds gather over the north.`], pendingEvent: null, pendingPerk: null, relics: 0, battlesWon: 0, battlesLost: 0,
  };
  return state;
}
function nearest(g, col, row) { const [q, r] = offsetToAxial(col, row); return { q, r }; }

export class Campaign {
  constructor(state) { this.s = state; this.grid = new HexGrid(); for (const r of state.regions) this.grid.set(r.q, r.r, r); }
  region(q, r) { return this.grid.get(q, r); }
  get army() { return this.s.army; }
  armyRegion() { return this.region(this.s.army.q, this.s.army.r); }
  bandAt(q, r) { return this.s.warbands.find((b) => b.q === q && b.r === r); }
  isNight(turn = this.s.turn) { return this.s.dayOverride === turn ? false : turn % 3 === 0; }
  has(perk) { return this.s.army.hero.perks.includes(perk); }
  income() { let g = 0; for (const r of this.grid) if (r.owner === 'ember') g += REGION[r.type].income || 0; return g; }
  legionIncome() { let g = 20; for (const r of this.grid) if (r.owner === 'ash') g += (REGION[r.type].income || 0) * 0.8; return Math.round(g); }
  recruitCost(type) { return Math.round(UNITS[type].cost * (this.has('quartermaster') ? 0.8 : 1)); }
  canRecruit() { const r = this.armyRegion(); return r.owner === 'ember' && REGION[r.type].recruit && this.s.army.units.length < 8; }

  reachable() {
    const a = this.s.army; if (a.moves <= 0) return [];
    return this.grid.neighbors(this.armyRegion()).filter((n) => REGION[n.type].pass);
  }

  // Move the army one region. Returns { battle } if a fight starts, else null.
  move(q, r) {
    const dest = this.region(q, r), a = this.s.army;
    if (!dest || !this.reachable().includes(dest)) return null;
    const band = this.bandAt(q, r);
    if (band || dest.type === 'citadel') return { battle: this.battleAt(dest, band, false) };
    a.q = q; a.r = r; a.moves--;
    this.capture(dest);
    return null;
  }

  capture(dest) {
    if (dest.owner !== 'ember') { dest.owner = 'ember'; this.log(`You take ${REGION[dest.type].name.toLowerCase()} at ${dest.col + 1}:${dest.row + 1}.`); }
    if (REGION[dest.type].relic && !dest.relicTaken) { dest.relicTaken = true; this.s.relics++; this.s.army.hero.xp += 40; this.log('An ember relic kindles your Commander (+40 experience).'); this.checkLevel(); }
  }

  battleAt(region, band, legionAttacks) {
    const strength = band ? band.strength : 620 + this.s.turn * 12;
    return { q: region.q, r: region.r, recipe: REGION[region.type].recipe || 'plains', strength, bandId: band?.id ?? null, final: region.type === 'citadel' && !band, legionAttacks, night: this.isNight(), regionName: REGION[region.type].name, bandName: band?.name || 'the Citadel guard' };
  }

  recruit(type) {
    const c = this.recruitCost(type);
    if (!this.canRecruit() || this.s.gold < c) return false;
    this.s.gold -= c; this.s.army.units.push({ type, vet: 0, xp: 0 }); return true;
  }

  // Apply a battle's outcome. survivors: [{index, kills}] for units that lived (by roster index)
  resolve(b, { won, survivors, heroAlive }) {
    const a = this.s.army;
    const before = a.units.length;
    const live = new Map(survivors.map((s) => [s.index, s]));
    a.units = a.units.map((u, i) => (live.has(i) ? { ...u, xp: u.xp + 10 + live.get(i).kills * 8, hp: live.get(i).hp ?? 1 } : null)).filter(Boolean);
    for (const u of a.units) { const need = [40, 100, 180][u.vet]; if (need != null && u.xp >= need && u.vet < 3) u.vet++; }
    a.hero.xp += won ? 60 : 25;
    this.checkLevel();
    const lost = before - a.units.length;
    if (won) {
      this.s.battlesWon++;
      if (b.final) { this.s.over = true; this.s.won = true; this.log('The Citadel falls. The Ashen King is scattered to the wind... for now.'); return; }
      if (b.bandId) this.s.warbands = this.s.warbands.filter((w) => w.id !== b.bandId);
      const dest = this.region(b.q, b.r);
      if (!b.legionAttacks) { a.q = b.q; a.r = b.r; a.moves = Math.max(0, a.moves - 1); }
      this.capture(dest);
      this.s.gold += 30;
      this.log(`Victory at ${b.regionName}. ${lost ? `${lost} fell.` : 'No losses.'} +30 gold in spoils.`);
    } else {
      this.s.battlesLost++;
      const band = this.s.warbands.find((w) => w.id === b.bandId); if (band) band.strength = Math.round(band.strength * 0.7);
      // fall back toward the capital
      const cap = [...this.grid].find((r) => r.type === 'capital');
      const back = this.grid.neighbors(this.armyRegion()).filter((n) => REGION[n.type].pass && !this.bandAt(n.q, n.r)).sort((x, y) => dist([x.q, x.r], [cap.q, cap.r]) - dist([y.q, y.r], [cap.q, cap.r]))[0];
      if (b.legionAttacks && back) { a.q = back.q; a.r = back.r; }
      a.moves = 0;
      if (!a.units.length) { a.units = [{ type: 'knight', vet: 0, xp: 0 }, { type: 'ranger', vet: 0, xp: 0 }]; this.log('Your army is shattered. Militia gather around the Commander.'); }
      this.log(`Defeat at ${b.regionName}. ${lost} soldiers lost.`);
    }
    if (this.has('surgeon')) for (const u of a.units) u.hp = 1;
    this.s.lastResult = { won, lost };
  }

  checkLevel() {
    const h = this.s.army.hero; const need = 80 + (h.level - 1) * 60;
    if (h.xp >= need) {
      h.xp -= need; h.level++;
      const pool = Object.keys(PERKS).filter((p) => !h.perks.includes(p));
      const r = mulberry32(this.s.seed + h.level * 17);
      const a = pool.splice(Math.floor(r() * pool.length), 1)[0], b = pool.splice(Math.floor(r() * pool.length), 1)[0];
      if (a) this.s.pendingPerk = [a, b].filter(Boolean);
      this.log(`The Commander reaches level ${h.level}.`);
    }
  }
  choosePerk(p) { this.s.army.hero.perks.push(p); this.s.pendingPerk = null; if (p === 'march') this.s.army.moves = 2; }

  applyEvent(choice, brain) {
    const ev = EVENTS.find((e) => e.id === this.s.pendingEvent); if (!ev) return;
    const fx = ev[choice].fx;
    if (fx.gold) this.s.gold = Math.max(0, this.s.gold + fx.gold);
    if (fx.unit && this.s.army.units.length < 8) this.s.army.units.push({ type: fx.unit, vet: 0, xp: 0 });
    if (fx.vet) { const us = [...this.s.army.units].sort((x, y) => x.vet - y.vet).slice(0, fx.vet); for (const u of us) u.vet = Math.min(3, u.vet + 1); }
    if (fx.day) this.s.dayOverride = this.s.turn;
    if (fx.forget && brain) { const ctxs = Object.keys(brain.bandit).filter((k) => k !== '_all'); if (ctxs.length) delete brain.bandit[ctxs[Math.floor(Math.random() * ctxs.length)]]; brain.model.side = { left: 0.33, center: 0.34, right: 0.33 }; }
    this.s.pendingEvent = null;
  }
  event() { return EVENTS.find((e) => e.id === this.s.pendingEvent); }

  // End the player's turn: income, Legion moves. Returns a battle if a warband attacks the army.
  endTurn(brain) {
    const s = this.s;
    s.gold += this.income();
    s.legionGold += this.legionIncome();
    const ar = this.armyRegion();
    const rest = ar.owner === 'ember' && REGION[ar.type].recruit;
    for (const u of s.army.units) u.hp = rest ? 1 : Math.min(1, (u.hp ?? 1) + 0.25);
    // Legion: grow warbands, sometimes raise a new one
    for (const b of s.warbands) b.strength += Math.round(s.legionGold * 0.15);
    s.legionGold = Math.round(s.legionGold * 0.55);
    if (s.turn % 4 === 0 && s.warbands.length < 4) {
      const cit = [...this.grid].find((r) => r.type === 'citadel');
      const spot = this.grid.neighbors(cit).find((n) => REGION[n.type].pass && !this.bandAt(n.q, n.r));
      if (spot) { s.warbands.push({ id: s.nextBand++, q: spot.q, r: spot.r, strength: 320 + s.turn * 18, name: NAMES[(s.nextBand - 1) % NAMES.length] }); this.log('A new warband marches out of the Citadel.'); }
    }
    let attack = null;
    const heat = (brain.campaign ||= { defend: {} }).defend;
    heat[key(ar.q, ar.r)] = (heat[key(ar.q, ar.r)] || 0) * 0.8 + 1;
    for (const b of [...s.warbands]) {
      const here = this.region(b.q, b.r);
      const opts = this.grid.neighbors(here).filter((n) => REGION[n.type].pass && n.type !== 'citadel' && !s.warbands.some((o) => o !== b && o.q === n.q && o.r === n.r));
      let best = null, bs = -Infinity;
      const playerStr = s.army.units.reduce((a, u) => a + UNITS[u.type].cost * (1 + u.vet * 0.15), 0) + 150;
      for (const n of opts) {
        let v = n.owner === 'ember' ? 3 + (REGION[n.type].income || 0) / 10 : n.owner == null ? 1.2 : 0.2;
        if (n.type === 'capital') v += 6;
        const isArmy = n.q === s.army.q && n.r === s.army.r;
        if (isArmy) v += b.strength > playerStr * (0.85 - 0.1 * Math.min(3, brain.streak || 0)) ? 4 : -6;
        v -= (heat[key(n.q, n.r)] || 0) * 0.6;   // avoid where you usually stand guard
        const cap = [...this.grid].find((r) => r.type === 'capital');
        v -= dist([n.q, n.r], [cap.q, cap.r]) * 0.15;
        v += Math.random() * 0.8;
        if (v > bs) { bs = v; best = n; }
      }
      if (!best || bs < 0.3) continue;
      if (best.q === s.army.q && best.r === s.army.r) { if (!attack) attack = { battle: this.battleAt(best, b, true) }; continue; }
      b.q = best.q; b.r = best.r;
      if (best.owner === 'ember') { best.owner = 'ash'; this.log(`${cap1(b.name)} burns ${REGION[best.type].name.toLowerCase()} at ${best.col + 1}:${best.row + 1}.`); }
      if (best.type === 'capital') { s.over = true; s.won = false; this.log('Emberhold has fallen.'); }
    }
    s.turn++;
    s.army.moves = this.has('march') ? 2 : 1;
    if (s.turn % 3 === 2 && !s.pendingEvent) s.pendingEvent = EVENTS[Math.floor(Math.random() * EVENTS.length)].id;
    this.log(`Turn ${s.turn}${this.isNight() ? ' — night falls' : ''}. Treasury ${s.gold} gold.`);
    return attack;
  }

  log(t) { this.s.log.unshift(t); this.s.log = this.s.log.slice(0, 40); }
}
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);
