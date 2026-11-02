import { Realm } from './realm.js';
import { HouseAI, chooseStyle, learn, finishGame } from './ai.js';

// Drives a realm: court (diplomacy + market), placement turns, resolution and learning.
export class Game {
  constructor(cfg, mem, opts = {}) {
    this.cfg = cfg; this.mem = mem;
    this.realm = new Realm(cfg);
    this.human = cfg.houses.find((h) => h.human)?.id || null;
    this.rand = opts.rand || Math.random;
    this.styleKey = cfg.style || chooseStyle(mem, this.rand);
    this.ais = {};
    for (const h of this.realm.houses) if (!h.human) this.ais[h.id] = new HouseAI(this.realm, h.id, mem, { human: this.human, style: cfg.styles?.[h.id] || this.styleKey, rand: this.rand });
    this.offers = [];
  }

  // court: rivals shop, make deals among themselves and send you offers
  court() {
    const r = this.realm; r.events = [];
    const offers = [];
    for (const ai of Object.values(this.ais)) {
      if (!r.house(ai.id).alive) continue;
      ai.shop();
      const p = ai.proposal(); if (p) offers.push({ from: ai.id, ...p });
    }
    // rivals band together against whoever leads
    const alive = r.houses.filter((h) => h.alive && !h.human);
    const lead = alive.length ? Object.values(this.ais)[0].leader() : null;
    for (const a of alive) for (const b of alive) {
      if (a.id >= b.id || r.pact(a.id, b.id) || a.id === lead || b.id === lead) continue;
      if (this.rand() < 0.15) r.makePact(a.id, b.id, 2);
    }
    this.offers = offers.slice(0, 2);
    return this.offers;
  }

  answerOffer(o, accept) {
    const r = this.realm;
    const ai = this.ais[o.from];
    if (o.kind === 'pact') { if (accept) r.makePact(this.human, o.from, o.rounds); return accept ? `${r.house(o.from).short} and you swear peace for ${o.rounds} rounds.` : `${r.house(o.from).short} notes your refusal.`; }
    if (o.kind === 'tribute') {
      if (accept) { r.tribute(this.human, o.from, o.gold); r.makePact(this.human, o.from, 1); this.mem.trust.pacts = Math.max(0, this.mem.trust.pacts - 1); return `You pay ${o.gold} gold. ${r.house(o.from).short} stays its hand this round.`; }
      ai.style = { ...ai.style, atk: ai.style.atk * 1.25 }; return `${r.house(o.from).short} will take it by force.`;
    }
  }
  proposePact(to) {
    const ai = this.ais[to]; const res = ai.considerPact(this.human);
    if (res.ok) this.realm.makePact(this.human, to, 3);
    return res;
  }

  beginPlacement() { this.realm.beginPlacement(); }

  // run AI turns until it is the human's turn (or placement ends). Returns placements made.
  runAI(maxSteps = 50) {
    const r = this.realm, made = [];
    while (r.phase === 'place' && maxSteps-- > 0) {
      const cur = r.current();
      if (cur.human && !this.autoHuman) break;
      const ctl = cur.human ? this.autoHuman : this.ais[cur.id];
      const o = ctl.decide();
      if (o) made.push(r.place(cur.id, o)); else r.pass(cur.id);
    }
    return made;
  }

  resolve() {
    const ev = this.realm.resolve();
    if (this.human) learn(this.mem, this.realm, this.human);
    if (this.realm.over && this.human) finishGame(this.mem, this.realm, this.human, this.styleKey);
    return ev;
  }

  // a whole round, headless (for tests)
  playRound(humanCtl) {
    this.autoHuman = humanCtl;
    const offers = this.court();
    for (const o of offers) this.answerOffer(o, humanCtl.answer?.(o) ?? false);
    humanCtl.shop?.();
    humanCtl.diplomacy?.(this);
    this.beginPlacement();
    this.runAI(200);
    return this.resolve();
  }
}
