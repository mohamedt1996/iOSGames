import { HexGrid, DIRS, key, dist } from '../core/hex.js';
import { mulberry32, makeNoise } from '../core/rng.js';
import { CARDS, STARTER, MARKET_POOL, THREATS, HOSTILE } from './cards.js';

export const HOUSES = {
  blue: { name: 'House Aurel', short: 'Aurel', color: '#4f86d9', kit: 'blue', model: 'knight', motto: 'Light holds the line.' },
  red: { name: 'House Vorn', short: 'Vorn', color: '#d0503a', kit: 'red', model: 'barbarian', motto: 'Take, and keep taking.' },
  green: { name: 'House Thorne', short: 'Thorne', color: '#4fa35a', kit: 'green', model: 'rogue', motto: 'Every rose has its thorn.' },
  yellow: { name: 'House Solenne', short: 'Solenne', color: '#d9b23c', kit: 'yellow', model: 'mage', motto: 'Patience is a blade.' },
};
export const PROVINCE = {
  castle: { name: 'Castle', income: 2, vp: 1, def: 1 },
  crown: { name: 'The Crown Seat', income: 3, vp: 2, def: 2 },
  town: { name: 'Town', income: 2, vp: 0, def: 0 },
  mine: { name: 'Mine', income: 3, vp: 0, def: 0 },
  farm: { name: 'Farmland', income: 1, vp: 0, def: 0 },
  forest: { name: 'Forest', income: 0, vp: 0, def: 1 },
  hills: { name: 'Hills', income: 0, vp: 0, def: 1 },
  plain: { name: 'Plains', income: 1, vp: 0, def: 0 },
};
export const HAND = 5, PLACEMENTS = 3, RECRUIT_COST = 2, RECRUIT_MAX = 3;

// A realm: provinces on a hex island, houses with decks, a shared market, pacts and a round loop.
export class Realm {
  constructor(cfg) {
    this.cfg = cfg;
    this.rand = mulberry32(cfg.seed ?? 1);
    this.round = 1; this.maxRounds = cfg.maxRounds ?? 20; this.vpGoal = cfg.vpGoal ?? 12;
    this.phase = 'court'; this.over = false; this.winner = null;
    this.log = []; this.obs = []; this.events = [];
    this.genMap();
    this.houses = cfg.houses.map((h, i) => ({ id: h.id, human: !!h.human, ...HOUSES[h.id], gold: cfg.startGold ?? 4, vp: 0, alive: true, deck: [], hand: [], discard: [], seat: null, order: i, style: h.style }));
    this.pacts = {}; // "a|b" -> rounds left
    this.trustLog = [];
    for (const [a, b, n] of cfg.startPacts || []) this.pacts[this.pairKey(a, b)] = n;
    this.placeSeats();
    for (const h of this.houses) { h.deck = this.shuffle([...STARTER, ...(cfg.extraCards?.[h.id] || [])]); this.draw(h); }
    this.marketDeck = this.shuffle([...MARKET_POOL, ...MARKET_POOL]);
    this.market = [];
    this.refillMarket();
    this.placements = []; this.placeRound = 0; this.turnIdx = 0;
  }

  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  house(id) { return this.houses.find((h) => h.id === id); }
  prov(id) { return this.provinces[id]; }
  owned(hid) { return this.provinces.filter((p) => p.owner === hid); }
  adj(p) { return p.adj.map((i) => this.provinces[i]); }
  near(p) { const out = new Set(p.adj); for (const a of p.adj) for (const b of this.provinces[a].adj) if (b !== p.id) out.add(b); return [...out].map((i) => this.provinces[i]); }
  pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
  pact(a, b) { return (this.pacts[this.pairKey(a, b)] || 0) > 0; }

  // ---------------- map ----------------
  genMap() {
    const R = this.cfg.radius ?? 4, rand = this.rand, noise = makeNoise(rand);
    const g = new HexGrid(); this.grid = g; this.provinces = [];
    const land = [];
    for (let q = -R - 1; q <= R + 1; q++) for (let r = -R - 1; r <= R + 1; r++) {
      const d = dist([0, 0], [q, r]);
      if (d > R + 1) continue;
      const n = noise(q * 0.7 + 5, r * 0.7 + 9);
      const isLand = d <= R - 1 || (d === R && n > 0.38);
      const cell = { q, r, land: isLand && !(this.cfg.lakes && d === 2 && n < 0.25) };
      g.set(q, r, cell);
      if (cell.land) land.push(cell);
    }
    // keep the largest connected island
    const seen = new Set(); let best = [];
    for (const c of land) {
      if (seen.has(key(c.q, c.r))) continue;
      const comp = [], st = [c]; seen.add(key(c.q, c.r));
      while (st.length) { const x = st.pop(); comp.push(x); for (const n of g.neighbors(x)) if (n.land && !seen.has(key(n.q, n.r))) { seen.add(key(n.q, n.r)); st.push(n); } }
      if (comp.length > best.length) best = comp;
    }
    for (const c of land) if (!best.includes(c)) c.land = false;
    for (const c of best) {
      const n = noise(c.q * 0.9 + 21, c.r * 0.9 + 2);
      const type = n > 0.68 ? 'forest' : n < 0.22 ? 'hills' : rand() < 0.22 ? 'farm' : 'plain';
      c.pid = this.provinces.length;
      this.provinces.push({ id: c.pid, q: c.q, r: c.r, type, owner: null, troops: 1 + Math.floor(rand() * 2), walls: 0, name: '' });
    }
    for (const p of this.provinces) p.adj = g.neighbors(p).filter((n) => n.land).map((n) => n.pid);
    const center = this.provinces.reduce((a, p) => (dist([0, 0], [p.q, p.r]) < dist([0, 0], [a.q, a.r]) ? p : a));
    center.type = 'crown'; center.troops = this.cfg.crownGuard ?? 5; center.walls = 1;
    // sprinkle towns and mines
    const others = this.shuffle(this.provinces.filter((p) => p !== center));
    const nTown = Math.round(this.provinces.length / 7), nMine = Math.round(this.provinces.length / 10);
    others.slice(0, nTown).forEach((p) => { p.type = 'town'; p.troops += 1; });
    others.slice(nTown, nTown + nMine).forEach((p) => { p.type = 'mine'; });
    for (const p of this.provinces) p.name = provinceName(p, this.rand);
  }

  placeSeats() {
    const n = this.houses.length;
    const outer = this.provinces.filter((p) => p.type !== 'crown').sort((a, b) => dist([0, 0], [b.q, b.r]) - dist([0, 0], [a.q, a.r]));
    const R = dist([0, 0], [outer[0].q, outer[0].r]);
    const ring = outer.filter((p) => dist([0, 0], [p.q, p.r]) >= R - 1);
    const offset = this.rand() * Math.PI * 2;
    this.houses.forEach((h, i) => {
      const ang = offset + (i / n) * Math.PI * 2;
      const tx = Math.cos(ang) * 10, tz = Math.sin(ang) * 10;
      const pos = (p) => [Math.sqrt(3) * (p.q + p.r / 2), 1.5 * p.r];
      const seat = ring.filter((p) => !p.owner).sort((a, b) => Math.hypot(pos(a)[0] - tx, pos(a)[1] - tz) - Math.hypot(pos(b)[0] - tx, pos(b)[1] - tz))[0];
      seat.type = 'castle'; seat.owner = h.id; seat.troops = this.cfg.startTroops ?? 5; seat.walls = 1; seat.seat = h.id; h.seat = seat.id;
      seat.name = `${h.short}hold`;
      // a starting province next to the seat
      const nb = this.adj(seat).filter((x) => !x.owner && x.type !== 'crown').sort((a, b) => (b.type === 'town') - (a.type === 'town'))[0];
      if (nb) { nb.owner = h.id; nb.troops = 2; }
    });
    // neutral castles between houses
    const free = this.provinces.filter((p) => !p.owner && p.type !== 'crown' && this.adj(p).every((a) => !a.owner));
    this.shuffle(free).slice(0, this.cfg.neutralCastles ?? 2).forEach((p) => { p.type = 'castle'; p.troops = 4; p.walls = 1; });
  }

  // ---------------- cards ----------------
  draw(h) {
    while (h.hand.length < HAND) {
      if (!h.deck.length) { if (!h.discard.length) break; h.deck = this.shuffle(h.discard); h.discard = []; }
      h.hand.push(h.deck.pop());
    }
  }
  refillMarket() { while (this.market.length < 5 && this.marketDeck.length) this.market.push(this.marketDeck.pop()); }
  buy(hid, idx) {
    const h = this.house(hid), c = this.market[idx];
    if (!c || h.gold < CARDS[c].cost) return false;
    h.gold -= CARDS[c].cost; h.discard.push(c); this.market.splice(idx, 1); this.refillMarket();
    this.events.push({ t: 'buy', house: hid, card: c });
    return true;
  }

  // ---------------- recruiting (court) ----------------
  canRecruit(hid, pid) { const p = this.prov(pid); return p.owner === hid && ['castle', 'town', 'crown'].includes(p.type) && (p.recruited || 0) < RECRUIT_MAX && this.house(hid).gold >= RECRUIT_COST; }
  recruit(hid, pid) {
    if (!this.canRecruit(hid, pid)) return false;
    const p = this.prov(pid); this.house(hid).gold -= RECRUIT_COST; p.troops++; p.recruited = (p.recruited || 0) + 1;
    this.events.push({ t: 'recruit', house: hid, prov: pid });
    return true;
  }

  // ---------------- placement ----------------
  get order() {
    const alive = this.houses.filter((h) => h.alive);
    const k = (this.round - 1) % alive.length;
    return [...alive.slice(k), ...alive.slice(0, k)];
  }
  current() { return this.phase === 'place' ? this.order[this.turnIdx] : null; }
  beginPlacement() { this.phase = 'place'; this.placements = []; this.placeRound = 0; this.turnIdx = 0; this.passed = new Set(); }

  // every legal (card, from, target) for a house
  options(hid) {
    const h = this.house(hid), out = [];
    const mine = this.owned(hid);
    const used = new Set(this.placements.filter((p) => p.house === hid).map((p) => `${p.from ?? ''}>${p.target}`));
    for (const [hi, c] of h.hand.entries()) {
      const k = CARDS[c].kind;
      if (k === 'threat') {
        // a threat may come from any of your provinces within two hexes of the target
        const seenT = new Set();
        for (const s of mine.filter((x) => x.troops >= (c === 'march' || c === 'siege' ? 2 : 1)).sort((a, b) => b.troops - a.troops)) {
          for (const t of this.near(s)) if (t.owner !== hid && !seenT.has(t.id) && !used.has(`${s.id}>${t.id}`)) { seenT.add(t.id); out.push({ hand: hi, card: c, from: s.id, target: t.id }); }
        }
      } else if (k === 'self') {
        for (const s of mine) if (!used.has(`>${s.id}`)) out.push({ hand: hi, card: c, target: s.id });
      } else if (k === 'spy') {
        for (const [pi, p] of this.placements.entries()) if (p.house !== hid && !p.seenBy.includes(hid)) out.push({ hand: hi, card: c, spyOn: pi });
      }
    }
    return out;
  }

  place(hid, o) {
    const h = this.house(hid);
    if (this.current()?.id !== hid) return false;
    const c = h.hand[o.hand]; if (c !== o.card) return false;
    h.hand.splice(o.hand, 1);
    const pl = { house: hid, card: c, kind: CARDS[c].kind, from: o.from ?? null, target: o.target ?? null, spyOn: o.spyOn ?? null, round: this.placeRound, seenBy: [hid], idx: this.placements.length };
    // what everyone can see: the slot and where it points, never the card
    if (pl.kind === 'threat') {
      const tgt = this.prov(pl.target);
      // record what the target house did *before* this threat for the defend-rate model
      pl.targetHouse = tgt.owner;
    }
    if (pl.kind === 'spy') { const seen = this.placements[pl.spyOn]; if (seen && !seen.seenBy.includes(hid)) seen.seenBy.push(hid); pl.peek = seen ? { idx: seen.idx, card: seen.card } : null; }
    this.placements.push(pl);
    this.events.push({ t: 'place', house: hid, idx: pl.idx, kind: pl.kind, from: pl.from, target: pl.target, spyOn: pl.spyOn });
    this.advance();
    return pl;
  }
  pass(hid) { if (this.current()?.id !== hid) return false; this.passed.add(`${hid}:${this.placeRound}`); this.advance(); return true; }
  advance() {
    this.turnIdx++;
    if (this.turnIdx >= this.order.length) { this.turnIdx = 0; this.placeRound++; }
    if (this.placeRound >= PLACEMENTS) this.phase = 'resolve';
  }

  // public view of a placement for a given viewer
  visible(pl, viewer) { return pl.seenBy.includes(viewer) ? pl.card : null; }

  // ---------------- resolution ----------------
  resolve() {
    const ev = []; const P = this.placements;
    ev.push({ t: 'reveal' });
    const selfOn = (pid, card) => P.some((p) => p.kind === 'self' && p.target === pid && p.card === card && p.house === this.prov(pid).owner);
    // observations for the learners: every threat and every self card
    for (const p of P) {
      if (p.kind === 'threat') {
        const t = this.prov(p.target);
        const answered = P.some((q) => q.kind === 'self' && q.target === p.target && q.house === p.targetHouse && q.idx > p.idx);
        const preDefended = P.some((q) => q.kind === 'self' && q.target === p.target && q.house === p.targetHouse && q.idx < p.idx);
        this.obs.push({ t: 'threat', by: p.house, on: p.targetHouse, card: p.card, real: HOSTILE.includes(p.card), slot: p.round, value: provValue(t), src: this.prov(p.from).troops, pacted: p.targetHouse ? this.pact(p.house, p.targetHouse) : false, answered, preDefended, round: this.round });
      }
      if (p.kind === 'self') this.obs.push({ t: 'self', by: p.house, card: p.card, threatened: P.some((q) => q.kind === 'threat' && q.target === p.target && q.idx < p.idx) });
    }
    // 1. economy and preparation
    for (const p of P) {
      const pr = p.target != null ? this.prov(p.target) : null, h = this.house(p.house);
      if (p.kind === 'self' && pr.owner !== p.house) continue;
      if (p.card === 'harvest') { const g = pr.type === 'farm' || pr.type === 'mine' ? 5 : 3; h.gold += g; ev.push({ t: 'gold', house: h.id, prov: pr.id, n: g }); }
      if (p.card === 'levy') { const n = ['castle', 'town', 'crown'].includes(pr.type) ? 3 : 2; pr.troops += n; ev.push({ t: 'levy', house: h.id, prov: pr.id, n }); }
      if (p.card === 'fortify' && pr.walls < 3) { pr.walls++; ev.push({ t: 'fortify', house: h.id, prov: pr.id }); }
    }
    // 2. plague and raids
    for (const p of P) {
      const pr = this.prov(p.target);
      if (p.card === 'plague' && pr.owner !== p.house) { const k = Math.floor(pr.troops / 2); pr.troops -= k; ev.push({ t: 'plague', house: p.house, prov: pr.id, n: k }); }
      if (p.card === 'raid' && pr.owner && pr.owner !== p.house) {
        if (selfOn(pr.id, 'hold')) ev.push({ t: 'raid', house: p.house, prov: pr.id, n: 0, blocked: true });
        else { const v = this.house(pr.owner); const n = Math.min(v.gold, 3); v.gold -= n; this.house(p.house).gold += n; ev.push({ t: 'raid', house: p.house, prov: pr.id, n }); }
      }
      if (p.card === 'feint') ev.push({ t: 'feint', house: p.house, prov: pr.id, from: p.from, wasted: P.some((q) => q.kind === 'self' && q.target === pr.id && q.house === pr.owner && ['hold', 'ambush'].includes(q.card)) });
    }
    // 3. marches: soldiers leave at once, then battles resolve strongest first
    const moves = [];
    for (const p of P) {
      if (p.card !== 'march' && p.card !== 'siege') continue;
      const s = this.prov(p.from);
      if (s.owner !== p.house || s.troops < 2) { ev.push({ t: 'fizzle', house: p.house, prov: p.target, from: p.from }); continue; }
      const n = s.troops - 1; s.troops = 1;
      moves.push({ p, n, from: s.id, to: p.target, house: p.house, siege: p.card === 'siege' });
    }
    moves.sort((a, b) => b.n - a.n);
    for (const m of moves) {
      const t = this.prov(m.to), src = this.prov(m.from);
      if (t.owner === m.house) { t.troops += m.n; ev.push({ t: 'reinforce', house: m.house, from: m.from, prov: t.id, n: m.n }); continue; }
      let atk = m.n;
      const ambushed = t.owner && selfOn(t.id, 'ambush');
      if (ambushed) atk -= 4;
      const held = t.owner && selfOn(t.id, 'hold');
      const walls = m.siege ? 0 : t.walls * (held ? 2 : 1);
      const def = t.troops + walls + (held ? 4 : 0) + PROVINCE[t.type].def;
      const ra = this.rand() * 2.5, rd = this.rand() * 2.5;
      const A = atk + ra, D = def + rd;
      const defender = t.owner;
      const b = { t: 'battle', house: m.house, from: m.from, prov: t.id, defender, atk: m.n, ambushed, held, walls, def, A: +A.toFixed(1), D: +D.toFixed(1) };
      if (atk > 0 && A > D) {
        const surv = Math.max(1, Math.round(atk - def * 0.6));
        b.won = true; b.left = surv; b.lost = t.troops;
        t.owner = m.house; t.troops = surv; if (t.walls > 0 && !m.siege) t.walls = Math.max(0, t.walls - 1);
      } else {
        const back = atk > 0 ? Math.floor(atk * 0.25) : 0;
        t.troops = Math.max(1, t.troops - Math.max(0, Math.round(Math.max(0, atk) * 0.55)));
        if (src.owner === m.house) src.troops += back;
        b.won = false; b.left = t.troops; b.back = back;
      }
      ev.push(b);
    }
    // 4. rally after battles
    for (const p of P) {
      if (p.card !== 'rally') continue;
      const pr = this.prov(p.target); if (pr.owner !== p.house) continue;
      let n = 0; for (const a of this.adj(pr)) if (a.owner === p.house && a.troops > 1) { n += a.troops - 1; a.troops = 1; }
      pr.troops += n; ev.push({ t: 'rally', house: p.house, prov: pr.id, n });
    }
    // 5. betrayals: a hostile card against a house you have a pact with breaks it
    for (const p of P) {
      if (!HOSTILE.includes(p.card) || !p.targetHouse || !this.pact(p.house, p.targetHouse)) continue;
      this.pacts[this.pairKey(p.house, p.targetHouse)] = 0;
      ev.push({ t: 'betray', house: p.house, victim: p.targetHouse });
      this.obs.push({ t: 'betray', by: p.house, on: p.targetHouse, round: this.round });
      this.trustLog.push({ by: p.house, on: p.targetHouse, round: this.round });
    }
    // 6. discard played cards
    for (const p of P) this.house(p.house).discard.push(p.card);
    this.endRound(ev);
    this.events.push(...ev);
    return ev;
  }

  endRound(ev) {
    for (const h of this.houses) {
      if (!h.alive) continue;
      const mine = this.owned(h.id);
      if (!mine.length) { h.alive = false; ev.push({ t: 'fallen', house: h.id }); h.discard.push(...h.hand); h.hand = []; continue; }
      let inc = 0, vp = 0; for (const p of mine) { inc += PROVINCE[p.type].income; vp += p.seat === h.id ? 0 : p.seat ? 2 : PROVINCE[p.type].vp; }
      vp += Math.floor(mine.length / 4);
      h.gold += inc; h.vp += vp; h.lastIncome = inc; h.lastVp = vp;
      // keep up to 1 card, then draw
      h.discard.push(...h.hand.splice(1)); this.draw(h);
    }
    ev.push({ t: 'income' });
    // neutrals slowly regrow
    for (const p of this.provinces) { p.recruited = 0; if (!p.owner && p.troops < 3 && this.rand() < 0.25) p.troops++; }
    for (const k in this.pacts) if (this.pacts[k] > 0) this.pacts[k]--;
    // market churn: the oldest card leaves
    if (this.market.length) { this.market.shift(); this.refillMarket(); }
    const alive = this.houses.filter((h) => h.alive);
    const top = [...alive].sort((a, b) => b.vp - a.vp || this.owned(b.id).length - this.owned(a.id).length);
    if (top[0].vp >= this.vpGoal || alive.length === 1 || this.round >= this.maxRounds || !alive.some((h) => h.human) && this.houses.some((h) => h.human)) {
      this.over = true; this.winner = top[0].id; this.ranking = top.map((h) => h.id).concat(this.houses.filter((h) => !h.alive).map((h) => h.id));
      ev.push({ t: 'over', winner: this.winner });
    }
    this.round++; this.phase = 'court';
    this.placements = [];
  }

  // ---------------- diplomacy ----------------
  makePact(a, b, rounds = 3) { this.pacts[this.pairKey(a, b)] = rounds; this.events.push({ t: 'pact', a, b, rounds }); this.obs.push({ t: 'pact', a, b, round: this.round }); }
  tribute(from, to, gold) { const f = this.house(from); const n = Math.min(f.gold, gold); f.gold -= n; this.house(to).gold += n; return n; }

  standings() { return this.houses.map((h) => ({ id: h.id, vp: h.vp, provinces: this.owned(h.id).length, troops: this.owned(h.id).reduce((a, p) => a + p.troops, 0), gold: h.gold, alive: h.alive })); }
}

export function provValue(p) { return 1 + PROVINCE[p.type].income + PROVINCE[p.type].vp * 3 + (p.seat ? 3 : 0); }

const SYL1 = ['Ash', 'Bram', 'Cold', 'Dun', 'Elder', 'Fen', 'Gull', 'Hart', 'Ivy', 'Kest', 'Lark', 'Mire', 'Nettle', 'Oak', 'Pike', 'Raven', 'Sable', 'Thorn', 'Wold', 'Yew'];
const SYL2 = { plain: ['field', 'lea', 'moor'], farm: ['acre', 'stead', 'furrow'], forest: ['wood', 'holt', 'shaw'], hills: ['crag', 'fell', 'tor'], town: ['bury', 'wick', 'ford'], mine: ['delve', 'pit', 'deep'], castle: ['keep', 'hold', 'gate'], crown: ['crown'] };
function provinceName(p, r) {
  if (p.type === 'crown') return 'The Thorn Crown';
  const a = SYL1[Math.floor(r() * SYL1.length)], b = SYL2[p.type] || SYL2.plain;
  return a + b[Math.floor(r() * b.length)];
}
export { THREATS, HOSTILE };
