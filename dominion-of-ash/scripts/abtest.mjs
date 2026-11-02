// A/B: same brain-free Legion with different tactical options, many battles per player style.
import { Battle, deployPositions, DT } from '../src/battle/sim.js';
import { makeBattlefield, RECIPES } from '../src/battle/maps.js';
import { Commander, PLAN_KEYS } from '../src/ai/tactics.js';
import { newBrain, chooseArmy } from '../src/ai/rival.js';
import { mulberry32 } from '../src/core/rng.js';
const STYLES = {
  rusher: { plan: { lanes: { melee: 'left', ranged: 'center', caster: 'center', flanker: 'left', hero: 'left' }, aggression: 1 }, army: ['knight', 'knight', 'barbarian', 'barbarian', 'shade', 'ranger', 'ranger', 'pyromancer'] },
  turtle: { plan: { lanes: { melee: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' }, aggression: 0.2, hold: true }, army: ['knight', 'knight', 'knight', 'pyromancer', 'pyromancer', 'pyromancer', 'ranger', 'ranger'] },
  archers: { plan: { lanes: { melee: 'right', ranged: 'right', caster: 'center', flanker: 'right', hero: 'right' }, aggression: 0.7 }, army: ['knight', 'barbarian', 'ranger', 'ranger', 'ranger', 'ranger', 'shade', 'shade'] },
};
const R = Object.keys(RECIPES).filter((k) => k !== 'citadel');
export function run(opts, plan, arch, n = 40) {
  const out = {};
  for (const [name, st] of Object.entries(STYLES)) {
    let w = 0;
    for (let i = 0; i < n; i++) {
      const rand = mulberry32(i * 31 + 5);
      const field = makeBattlefield({ ...RECIPES[R[i % R.length]], night: i % 4 === 3 }, i + 1);
      const brain = newBrain(); if (arch) brain.army = { _all: { [arch]: { n: 50, r: 50 } } };
      const ashArmy = ['ashking', ...chooseArmy(brain, 520, ['commander', ...st.army], rand)];
      const pc = new Commander(null, 'ember', st.plan, {});
      const ac = new Commander(null, 'ash', plan, opts);
      const b = new Battle(field, { ember: deployPositions(field, 'ember', pc.layout(['commander', ...st.army])), ash: deployPositions(field, 'ash', ac.layout(ashArmy)) }, { seed: i * 7 + 3 });
      pc.b = b; ac.b = b; let k = 0;
      while (!b.over && k++ < 7000) { pc.tick(DT); ac.tick(DT); b.step(); b.events.length = 0; }
      if (b.winner === 'ash') w++;
    }
    out[name] = Math.round((w / n) * 100);
  }
  return out;
}
const mode = process.argv[2];
if (mode === 'skill') for (const sk of [0, 0.5, 1]) console.log('skill', sk, JSON.stringify(run({ skill: sk, abilityUse: 0.9 }, 'overwhelm')));
if (mode === 'plans') for (const p of PLAN_KEYS) console.log(p.padEnd(12), JSON.stringify(run({ skill: 0.2 }, p, null, 30)));
if (mode === 'arch') for (const a of ['shieldwall', 'horde', 'crossbows', 'necropolis', 'balanced', 'counter']) console.log(a.padEnd(12), JSON.stringify(run({ skill: 0.2 }, 'overwhelm', a, 30)));
