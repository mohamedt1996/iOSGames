import { CARDS, HOSTILE } from './cards.js';
import { PROVINCE, provValue } from './realm.js';

// The Council: every rival house shares one memory of you, across every game you play.
export function newMemory() {
  return {
    v: 1, games: 0, wins: 0, rounds: 0,
    bluff: {},                       // ctx -> { real, fake }: are your face-down threats real?
    answer: { yes: 2, no: 2 },       // do you answer a threat with a card on that province?
    answerFeint: { yes: 1, no: 1 },  // ... and when it was only a feint
    selfThreat: { hold: 1, ambush: 1, levy: 1, fortify: 0.5, rally: 0.5, harvest: 0.5 }, // your hidden cards on threatened provinces
    selfCalm: { hold: 0.5, ambush: 0.5, levy: 1, fortify: 1, rally: 0.5, harvest: 1 },
    trust: { pacts: 0, broken: 0 }, betrayals: [],
    targets: { leader: 1, weakest: 1, other: 1 },
    seq: {}, styles: {}, notes: [], log: [], lastStyle: null,
  };
}

const beta = (a, b) => (a + 1) / (a + b + 2);
const bucket = (v) => (v >= 7 ? 'hi' : v >= 4 ? 'mid' : 'lo');
export const bluffCtx = (o) => `${o.slot}-${bucket(o.value)}-${o.pacted ? 'p' : 'n'}`;

// probability one of your threats is real, given what it looks like
export function pReal(mem, o) {
  const k = bluffCtx(o), b = mem.bluff[k] || { real: 0, fake: 0 }, g = mem.bluff._all || { real: 2, fake: 1 };
  // blend specific context with your overall habit
  const r = b.real + g.real * 0.3 + 2, f = b.fake + g.fake * 0.3 + 1;
  return r / (r + f);
}
export function trustOf(mem) { return Math.max(0, Math.min(1, (mem.trust.pacts - mem.trust.broken * 4 + 1.5) / (mem.trust.pacts + 2))); }

// ---------------- styles ----------------
export const STYLES = {
  conqueror: { name: 'Conqueror', atk: 1.4, def: 0.8, feint: 0.7, eco: 0.8, pactBias: -0.2 },
  guardian: { name: 'Guardian', atk: 0.8, def: 1.4, feint: 0.6, eco: 1.0, pactBias: 0.3 },
  trickster: { name: 'Trickster', atk: 1.0, def: 1.0, feint: 1.7, eco: 0.9, pactBias: 0.1 },
  merchant: { name: 'Merchant', atk: 0.9, def: 1.0, feint: 0.8, eco: 1.5, pactBias: 0.4 },
};
const STYLE_KEYS = Object.keys(STYLES);
export function profileOf(mem) {
  const g = mem.bluff._all || { real: 2, fake: 1 };
  const bl = g.fake / (g.real + g.fake);
  const ans = beta(mem.answer.yes, mem.answer.no);
  return `${bl > 0.3 ? 'bluffer' : 'honest'}-${ans > 0.55 ? 'wary' : 'bold'}`;
}
export function chooseStyle(mem, rand = Math.random) {
  const ctx = profileOf(mem), arms = (mem.styles[ctx] ||= {});
  let best = null, bv = -1;
  for (const s of STYLE_KEYS) {
    const a = arms[s] || { n: 0, r: 0 };
    const v = betaSample(1 + a.r, 1 + a.n - a.r, rand);
    if (v > bv) { bv = v; best = s; }
  }
  return best;
}
function gammaSample(k, rand) {
  if (k < 1) return gammaSample(k + 1, rand) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { const u1 = rand() || 1e-9, u2 = rand(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rand(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function betaSample(a, b, rand) { const x = gammaSample(a, rand), y = gammaSample(b, rand); return x / (x + y); }

// ---------------- the house mind ----------------
export class HouseAI {
  constructor(realm, hid, mem, opts = {}) {
    this.r = realm; this.id = hid; this.mem = mem; this.human = opts.human || null;
    this.style = STYLES[opts.style || 'conqueror']; this.styleKey = opts.style || 'conqueror';
    this.rand = opts.rand || Math.random;
    this.skill = Math.min(1, 0.35 + mem.games / 25);
  }
  get h() { return this.r.house(this.id); }

  // probability attack strength n beats defence d (with the realm's two dice)
  static pWin(n, d) { if (n <= 0) return 0; const x = n - d; return 1 / (1 + Math.exp(-x * 1.25)); }

  hiddenSelfOn(pid, owner) {
    // face-down cards of the owner sitting on this province (unknown unless spied)
    return this.r.placements.filter((p) => p.kind === 'self' && p.target === pid && p.house === owner);
  }
  expectedDefBonus(pid, owner, threatened) {
    let bonus = 0, amb = 0;
    for (const p of this.hiddenSelfOn(pid, owner)) {
      const seen = this.r.visible(p, this.id);
      if (seen) { if (seen === 'hold') bonus += 4 + this.r.prov(pid).walls; if (seen === 'ambush') amb += 4; if (seen === 'levy') bonus += 2.5; continue; }
      const mix = owner === this.human ? (threatened ? this.mem.selfThreat : this.mem.selfCalm) : { hold: 1, ambush: 0.6, levy: 1, fortify: 0.6, rally: 0.4, harvest: 0.8 };
      const tot = Object.values(mix).reduce((a, b) => a + b, 0);
      bonus += (mix.hold / tot) * (4 + this.r.prov(pid).walls) + (mix.levy / tot) * 2.5 + (mix.rally / tot) * 2;
      amb += (mix.ambush / tot) * 4;
    }
    return { bonus, amb };
  }

  // incoming danger on one of my provinces
  danger(p) {
    let worst = 0, pr = 0;
    for (const t of this.r.placements) {
      if (t.kind !== 'threat' || t.target !== p.id || t.house === this.id) continue;
      const seen = this.r.visible(t, this.id);
      let real;
      if (seen) real = HOSTILE.includes(seen) && seen !== 'raid' ? 1 : 0;
      else if (t.house === this.human) real = pReal(this.mem, { slot: t.round, value: provValue(p), pacted: this.r.pact(t.house, this.id) }) * (0.5 + 0.5 * this.skill) + 0.6 * (1 - (0.5 + 0.5 * this.skill));
      else real = 0.62;
      const n = Math.max(0, this.r.prov(t.from).troops - 1);
      worst = Math.max(worst, n * real); pr = Math.max(pr, real);
    }
    return { n: worst, p: pr };
  }

  myDefence(p, extra = 0) { return p.troops + p.walls + PROVINCE[p.type].def + extra; }

  score(o) {
    const r = this.r, S = this.style, me = this.h;
    const c = o.card;
    if (CARDS[c].kind === 'threat') {
      const s = r.prov(o.from), t = r.prov(o.target);
      const owner = t.owner;
      const pacted = owner && r.pact(this.id, owner);
      let pactPen = 0;
      if (pacted) pactPen = owner === this.human ? 6 * (0.3 + trustOf(this.mem)) : 5;
      // don't stack two threats on the same province
      if (r.placements.some((p) => p.house === this.id && p.kind === 'threat' && p.target === t.id)) return -1;
      const threatened = r.placements.some((p) => p.kind === 'threat' && p.target === t.id && p.house !== owner);
      const { bonus, amb } = owner ? this.expectedDefBonus(t.id, owner, threatened) : { bonus: 0, amb: 0 };
      const n = s.troops - 1;
      const exposed = this.danger(s).n; // leaving home empty is dangerous
      if (c === 'march' || c === 'siege') {
        const def = t.troops + (c === 'siege' ? 0 : t.walls) + PROVINCE[t.type].def + bonus;
        const pw = HouseAI.pWin(n - amb, def);
        const v = provValue(t) * (owner === null ? 0.8 : 1.1) + (owner && owner === this.leader() ? 1.5 : 0) + (owner === this.human ? this.grudge() : 0);
        return (pw * v * 1.3 - (1 - pw) * n * 0.25 - exposed * 0.35 * provValue(s) / 4) * S.atk - pactPen + (c === 'siege' ? t.walls * 0.4 : 0);
      }
      if (c === 'feint') {
        if (!owner) return 0.05;
        const ans = owner === this.human ? beta(this.mem.answerFeint.yes + this.mem.answer.yes * 0.3, this.mem.answerFeint.no + this.mem.answer.no * 0.3) : 0.5;
        const mask = r.placements.some((p) => p.house === this.id && p.kind === 'threat') ? 0.3 : 0;
        return (ans * 1.5 + mask + (provValue(t) > 5 ? 0.3 : 0)) * S.feint - (pacted ? pactPen * 0.3 : 0);
      }
      if (c === 'raid') {
        if (!owner) return -1;
        const g = Math.min(3, r.house(owner).gold);
        const mix = owner === this.human ? this.mem.selfThreat : { hold: 1, ambush: 1, levy: 1, fortify: 1, rally: 1, harvest: 1 };
        const pHold = this.hiddenSelfOn(t.id, owner).length ? mix.hold / Object.values(mix).reduce((a, b) => a + b, 0) : 0.1;
        return g * 0.55 * (1 - pHold) * S.eco - pactPen;
      }
      if (c === 'plague') return owner ? t.troops * 0.35 * S.atk - pactPen : -1;
    }
    if (CARDS[c].kind === 'self') {
      const p = r.prov(o.target);
      const d = this.danger(p);
      const v = provValue(p);
      const lose = (extra, amb = 0) => HouseAI.pWin(d.n - amb, this.myDefence(p, extra));
      const base = lose(0);
      const already = r.placements.filter((x) => x.house === this.id && x.kind === 'self' && x.target === p.id).length;
      if (already >= 2) return -1;
      switch (c) {
        case 'hold': return d.p ? (base - lose(4 + p.walls)) * v * 1.4 * S.def : 0.05;
        case 'ambush': return d.p ? (base - lose(0, 4)) * v * 1.4 * S.def + d.p * 0.6 : 0.03;
        case 'levy': { const n = ['castle', 'town', 'crown'].includes(p.type) ? 3 : 2; const front = r.adj(p).some((a) => a.owner && a.owner !== this.id) ? 1 : 0.4; return (base - lose(n)) * v * 1.2 * S.def + n * 0.25 * front + (p.seat === this.id ? 0.2 : 0); }
        case 'fortify': return p.walls >= 3 ? -1 : (0.5 + (p.type === 'castle' || p.type === 'crown' ? 0.6 : 0) + (base - lose(1)) * v) * S.def * (1 - r.round / (r.maxRounds + 4));
        case 'rally': { let n = 0; for (const a of r.adj(p)) if (a.owner === this.id) n += Math.max(0, a.troops - 1 - this.danger(a).n); return d.p ? (base - lose(n)) * v * 1.2 : n * 0.08; }
        case 'harvest': return (((p.type === 'farm' || p.type === 'mine') ? 5 : 3) * 0.22 * S.eco) + (me.gold < 3 ? 0.3 : 0) + (d.p ? -0.2 : 0);
      }
    }
    if (CARDS[c].kind === 'spy') {
      const t = r.placements[o.spyOn];
      if (t.kind === 'threat' && t.target != null && r.prov(t.target).owner === this.id) {
        const pr = t.house === this.human ? pReal(this.mem, { slot: t.round, value: provValue(r.prov(t.target)), pacted: r.pact(t.house, this.id) }) : 0.6;
        return pr * (1 - pr) * 4 * provValue(r.prov(t.target)) / 4 + 0.2;
      }
      if (t.kind === 'self') return 0.25;
      return 0.1;
    }
    return 0;
  }

  leader() { const s = this.r.houses.filter((h) => h.alive).sort((a, b) => b.vp - a.vp || this.r.owned(b.id).length - this.r.owned(a.id).length); return s[0]?.id; }
  grudge() { return this.mem.betrayals.filter((b) => b.on === this.id).length * 0.4 + (this.mem.trust.broken > 1 ? 0.5 : 0); }

  // pick a placement (or null to pass)
  decide() {
    const opts = this.r.options(this.id);
    if (!opts.length) return null;
    let best = null, bs = 0.12;
    for (const o of opts) {
      const s = this.score(o) + (this.rand() - 0.5) * 0.25 * (1.2 - this.skill);
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }

  // buying at court: cards first, then soldiers where they are needed
  shop() {
    this.buyCards();
    const r = this.r, h = this.h;
    const reserve = Math.round(2 * this.style.eco);
    const spots = r.owned(this.id).filter((p) => ['castle', 'town', 'crown'].includes(p.type))
      .map((p) => ({ p, need: r.adj(p).filter((a) => a.owner !== this.id).reduce((x, a) => x + a.troops + (a.owner ? 2 : 0), 0) - p.troops + (p.seat === this.id ? 2 : 0) }))
      .sort((a, b) => b.need - a.need);
    for (const { p } of spots) while (h.gold - 2 >= reserve && r.recruit(this.id, p.id)) { /* recruit */ }
  }
  buyCards() {
    const r = this.r, h = this.h;
    for (let tries = 0; tries < 3; tries++) {
      let best = -1, bv = 0.5;
      r.market.forEach((c, i) => {
        if (CARDS[c].cost > h.gold) return;
        let v = { march: 1.2, siege: 1.1, raid: 0.9, feint: 0.8, hold: 1, ambush: 1, levy: 1.1, fortify: 0.8, rally: 0.8, harvest: 0.7, spy: 0.8, plague: 0.9 }[c];
        if (CARDS[c].kind === 'threat') v *= this.style.atk; else if (c === 'harvest') v *= this.style.eco; else v *= this.style.def;
        if (c === 'feint') v *= this.style.feint;
        // what it has learned about you shapes its shopping
        if (c === 'spy') v *= 0.7 + (1 - pReal(this.mem, { slot: 1, value: 5, pacted: false })) * 2;
        if (c === 'siege') v *= 0.8 + this.mem.selfThreat.hold / (this.mem.selfThreat.hold + this.mem.selfThreat.levy + 1);
        if (c === 'ambush') v *= 0.8 + beta(this.mem.bluff._all?.real || 2, this.mem.bluff._all?.fake || 1) * 0.6;
        v -= CARDS[c].cost * 0.08;
        if (v > bv) { bv = v; best = i; }
      });
      if (best < 0 || h.gold - CARDS[r.market[best]].cost < 1 && r.round < 3) break;
      r.buy(this.id, best);
    }
  }

  // diplomacy: answer a pact offer
  considerPact(from) {
    const r = this.r;
    const strength = (id) => r.owned(id).reduce((a, p) => a + p.troops + provValue(p), 0);
    const me = strength(this.id), them = strength(from);
    let want = 0.25 + this.style.pactBias + (them > me ? 0.3 : -0.1) + (this.leader() === this.id ? -0.25 : 0) + (this.leader() !== from ? 0.15 : -0.25);
    if (from === this.human) {
      const t = trustOf(this.mem);
      want += (t - 0.5) * 1.2;
      const betrayedMe = this.mem.betrayals.some((b) => b.on === this.id);
      if (betrayedMe) want -= 0.35;
    }
    const ok = want + (this.rand() - 0.5) * 0.3 > 0.3;
    let line;
    if (from === this.human) {
      if (!ok && this.mem.trust.broken > 0) line = `${this.h.short} remembers your broken word.`;
      else if (!ok) line = `${this.h.short} sees no profit in your friendship.`;
      else if (this.mem.trust.pacts > 2 && this.mem.trust.broken === 0) line = `${this.h.short} accepts. You have always kept faith.`;
      else line = `${this.h.short} accepts, for now.`;
    }
    return { ok, line };
  }

  // diplomacy: what the house asks of you this round
  proposal() {
    const r = this.r, hum = this.human; if (!hum || !r.house(hum)?.alive) return null;
    const border = r.owned(this.id).some((p) => r.adj(p).some((a) => a.owner === hum));
    if (!border || r.pact(this.id, hum)) return null;
    const mine = r.owned(this.id).reduce((a, p) => a + p.troops, 0), theirs = r.owned(hum).reduce((a, p) => a + p.troops, 0);
    if (mine > theirs * 1.35 && r.house(hum).gold >= 3 && this.rand() < 0.5 * this.style.atk) return { kind: 'tribute', gold: Math.min(5, Math.max(3, Math.floor(r.house(hum).gold / 2))) };
    if (trustOf(this.mem) > 0.45 && this.rand() < 0.35 * (1 + this.style.pactBias)) return { kind: 'pact', rounds: 3 };
    return null;
  }
}

// ---------------- learning ----------------
export function learn(mem, realm, human) {
  for (const o of realm.obs) {
    if (o.t === 'threat' && o.by === human && o.on && o.on !== human) {
      const k = bluffCtx(o);
      const b = (mem.bluff[k] ||= { real: 0, fake: 0 }), g = (mem.bluff._all ||= { real: 0, fake: 0 });
      if (o.card === 'feint') { b.fake++; g.fake++; } else if (o.real) { b.real++; g.real++; }
    }
    if (o.t === 'threat' && o.on === human && o.by !== human) {
      if (o.answered) mem.answer.yes++; else mem.answer.no++;
      if (o.card === 'feint') { if (o.answered) mem.answerFeint.yes++; else mem.answerFeint.no++; }
    }
    if (o.t === 'self' && o.by === human) { const m = o.threatened ? mem.selfThreat : mem.selfCalm; m[o.card] = (m[o.card] || 0) + 1; }
    if (o.t === 'betray' && o.by === human) { mem.trust.broken++; mem.betrayals.push({ on: o.on, round: o.round, game: mem.games + 1 }); mem.betrayals = mem.betrayals.slice(-20); }
    if (o.t === 'pact' && (o.a === human || o.b === human)) mem.trust.pacts++;
    if (o.t === 'threat' && o.by === human && o.on && HOSTILE.includes(o.card)) {
      const leader = realm.houses.filter((h) => h.alive && h.id !== human).sort((a, b) => b.vp - a.vp)[0]?.id;
      const weakest = realm.houses.filter((h) => h.alive && h.id !== human).sort((a, b) => realm.owned(a.id).length - realm.owned(b.id).length)[0]?.id;
      mem.targets[o.on === leader ? 'leader' : o.on === weakest ? 'weakest' : 'other']++;
    }
  }
  // decay so old habits fade and new ones show
  const decay = (m, k = 0.985) => { for (const x in m) if (typeof m[x] === 'number') m[x] *= k; };
  decay(mem.answer); decay(mem.answerFeint); decay(mem.selfThreat); decay(mem.selfCalm);
  for (const k in mem.bluff) decay(mem.bluff[k], 0.99);
  realm.obs = [];
  mem.rounds++;
}

export function finishGame(mem, realm, human, styleKey) {
  mem.games++;
  mem.trust.pacts *= 0.85; mem.trust.broken *= 0.97;
  const rank = realm.ranking.indexOf(human);
  if (rank === 0) mem.wins++;
  // the council rewards the style that kept you from winning
  const ctx = profileOf(mem), a = ((mem.styles[ctx] ||= {})[styleKey] ||= { n: 0, r: 0 });
  a.n++; a.r += rank === 0 ? 0 : Math.min(1, rank / Math.max(1, realm.houses.length - 1) + 0.3);
  mem.lastStyle = styleKey;
  mem.log.unshift({ game: mem.games, won: rank === 0, winner: realm.winner, style: STYLES[styleKey].name, rounds: realm.round - 1 });
  mem.log = mem.log.slice(0, 20);
  mem.notes = notes(mem);
}

export function notes(mem) {
  const out = [];
  const g = mem.bluff._all;
  if (g && g.real + g.fake > 3) {
    const f = g.fake / (g.real + g.fake);
    out.push(f > 0.35 ? `You bluff often: ${Math.round(f * 100)}% of your threats were feints. We have stopped flinching.` : f < 0.12 ? 'You almost never bluff. When you point a sword, we raise a shield.' : `About ${Math.round(f * 100)}% of your threats are feints. We weigh each one.`);
    const late = mem.bluff['2-hi-n'] || mem.bluff['2-mid-n'];
    if (late && late.real + late.fake > 2) out.push(late.fake > late.real ? 'Your last card of a round is usually a lie.' : 'Your last card of a round is usually the real blow.');
  }
  const ans = beta(mem.answer.yes, mem.answer.no);
  if (mem.answer.yes + mem.answer.no > 6) out.push(ans > 0.6 ? 'You answer every threat. One feint costs us a card and you a whole defence.' : ans < 0.35 ? 'You ignore our threats. Next time they will be real.' : 'You defend some borders and gamble on others.');
  const st = mem.selfThreat, tot = Object.values(st).reduce((a, b) => a + b, 0);
  if (tot > 6) { const top = Object.entries(st).sort((a, b) => b[1] - a[1])[0][0]; out.push(`When threatened, your hidden card is most often ${CARDS[top].name}.${top === 'ambush' ? ' We send the expendable first.' : top === 'hold' ? ' We bring siege engines.' : ''}`); }
  if (mem.trust.broken) out.push(`You have broken ${mem.trust.broken} pact${mem.trust.broken > 1 ? 's' : ''}. The houses speak of it.`);
  else if (mem.trust.pacts > 2) out.push('You keep your word. The houses trust you, which is its own weapon.');
  const t = mem.targets, tt = t.leader + t.weakest + t.other;
  if (tt > 8) out.push(t.weakest > t.leader ? 'You prey on the weakest house. The weak now guard their borders with you first.' : t.leader > t.weakest ? 'You strike at whoever leads. The leader expects you.' : 'You strike wherever it is convenient.');
  return out;
}
