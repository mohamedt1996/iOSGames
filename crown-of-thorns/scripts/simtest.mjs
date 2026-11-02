// Headless check: the rival houses should learn a scripted player's habits over repeated games.
import { Game } from '../src/game/game.js';
import { HouseAI, newMemory, pReal, trustOf, notes, learn, finishGame } from '../src/game/ai.js';
import { mulberry32 } from '../src/core/rng.js';

class Bot extends HouseAI {
  constructor(realm, id, kind, rand) { super(realm, id, newMemory(), { style: 'conqueror', rand }); this.kind = kind; this.skill = 0.9; }
  score(o) {
    let s = super.score(o);
    if (o.card === 'feint') s = this.kind === 'bluffer' ? s * 3 + 1 : this.kind === 'honest' ? -5 : s;
    if (this.kind === 'turtle' && (o.card === 'hold' || o.card === 'ambush')) s += 1.2;
    return s;
  }
  answer(o) { return o.kind === 'pact'; }
  diplomacy(g) { if (this.kind === 'betrayer') for (const id of Object.keys(g.ais)) if (!g.realm.pact(this.id, id)) g.proposePact(id); }
}
class BetrayerBot extends Bot { score(o) { const t = o.target != null ? this.r.prov(o.target) : null; const pacted = t?.owner && this.r.pact(this.id, t.owner); const s = super.score(o); return pacted && (o.card === 'march') ? s + 6 : s; } }

const N = +(process.argv[2] || 30);
const results = {};
for (const kind of ['bluffer', 'honest', 'betrayer']) {
  const mem = newMemory(); const rand = mulberry32(7);
  const rows = [];
  for (let gi = 0; gi < N; gi++) {
    const cfg = { seed: 100 + gi, radius: 4, houses: [{ id: 'blue', human: true }, { id: 'red' }, { id: 'green' }, { id: 'yellow' }], vpGoal: 18, maxRounds: 20 };
    const g = new Game(cfg, mem, { rand });
    const bot = new (kind === 'betrayer' ? BetrayerBot : Bot)(g.realm, 'blue', kind, rand);
    let defR = 0, nR = 0, defF = 0, nF = 0, acc = 0, accN = 0;
    while (!g.realm.over) {
      const before = g.realm.obs.length;
      g.autoHuman = bot;
      // capture threat outcomes before learning clears obs
      const origLearn = g.resolve.bind(g);
      g.court(); bot.shop(); bot.diplomacy(g);
      for (const o of g.offers) g.answerOffer(o, bot.answer(o));
      g.beginPlacement();
      // measure the council's belief at the moment it answers each threat
      const placeOrig = g.realm.place.bind(g.realm);
      g.realm.place = (hid, o) => {
        const pl = placeOrig(hid, o);
        if (pl && hid === 'blue' && pl.kind === 'threat' && pl.targetHouse && pl.targetHouse !== 'blue') {
          const pr = pReal(mem, { slot: pl.round, value: 5, pacted: false });
          const real = pl.card !== 'feint';
          acc += real ? Math.log(pr) : Math.log(1 - pr); accN++;
        }
        return pl;
      };
      g.runAI(300);
      g.realm.resolve();
      for (const o of g.realm.obs) if (o.t === 'threat' && o.by === 'blue' && o.on && o.on !== 'blue') { if (o.real) { nR++; if (o.answered) defR++; } else if (o.card === 'feint') { nF++; if (o.answered) defF++; } }
      learn(mem, g.realm, 'blue'); if (g.realm.over) finishGame(mem, g.realm, 'blue', g.styleKey);
    }
    const rank = g.realm.ranking.indexOf('blue');
    rows.push({ won: rank === 0, ll: accN ? acc / accN : 0, defR, nR, defF, nF, rounds: g.realm.round });
  }
  const third = Math.max(1, Math.floor(N / 3));
  const pool = (a, k, n) => { const t = a.reduce((s, r) => s + r[n], 0); return t ? `${Math.round(a.reduce((s, r) => s + r[k], 0) / t * 100)}%(${t})` : '-'; };
  const avg = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
  const e = rows.slice(0, third), l = rows.slice(-third);
  console.log(`${kind.padEnd(9)} player wins ${(avg(e, 'won') * 100).toFixed(0)}% -> ${(avg(l, 'won') * 100).toFixed(0)}% | bluff-read log-lik ${avg(e, 'll').toFixed(2)} -> ${avg(l, 'll').toFixed(2)} | guards vs real ${pool(e, 'defR', 'nR')}->${pool(l, 'defR', 'nR')} vs feint ${pool(e, 'defF', 'nF')}->${pool(l, 'defF', 'nF')} | trust ${trustOf(mem).toFixed(2)} | rounds ${avg(rows, 'rounds').toFixed(1)}`);
  console.log('   notes:', notes(mem).join(' | '));
}
