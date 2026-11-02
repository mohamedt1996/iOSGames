// Headless check: the Ashen King should beat scripted player styles more often as it learns.
import { Battle, deployPositions, DT } from '../src/battle/sim.js';
import { makeBattlefield, RECIPES } from '../src/battle/maps.js';
import { Commander } from '../src/ai/tactics.js';
import { newBrain, choosePlan, chooseArmy, commanderOpts, learn, contextOf } from '../src/ai/rival.js';
import { mulberry32 } from '../src/core/rng.js';

const STYLES = {
  'left-hook rusher': { plan: { name: 'p', lanes: { melee: 'left', swarm: 'left', ranged: 'center', caster: 'center', flanker: 'left', hero: 'left' }, aggression: 1 }, army: ['knight', 'knight', 'barbarian', 'barbarian', 'shade', 'ranger', 'ranger', 'pyromancer'] },
  'mage turtle': { plan: { name: 'p', lanes: { melee: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' }, aggression: 0.2, hold: true }, army: ['knight', 'knight', 'knight', 'pyromancer', 'pyromancer', 'pyromancer', 'ranger', 'ranger'] },
  'right-flank archers': { plan: { name: 'p', lanes: { melee: 'right', ranged: 'right', caster: 'center', flanker: 'right', hero: 'right' }, aggression: 0.7 }, army: ['knight', 'barbarian', 'ranger', 'ranger', 'ranger', 'ranger', 'shade', 'shade'] },
};

const N = +(process.argv[2] || 30);
const R = Object.keys(RECIPES).filter((k) => k !== 'citadel');
let fail = 0;
for (const [name, style] of Object.entries(STYLES)) {
  const brain = newBrain(), rand = mulberry32(42);
  const results = [];
  for (let i = 0; i < N; i++) {
    if (process.env.DUMP && i % 5 === 0) console.log('  ', i, JSON.stringify({ spread: brain.spread.toFixed(2), focus: brain.focus, hero: brain.weights.hero.toFixed(2) }));
    const field = makeBattlefield({ ...RECIPES[R[i % R.length]], night: i % 4 === 3 }, i + 1);
    const { plan, ctx } = choosePlan(brain, rand);
    const playerArmy = ['commander', ...style.army];
    const ashArmy = ['ashking', ...(process.env.FIXARMY ? chooseArmy(newBrain(), 520, playerArmy, rand) : chooseArmy(brain, 520, playerArmy, rand))];
    const pc = new Commander(null, 'ember', style.plan, { planKey: 'player' });
    const ac = new Commander(null, 'ash', process.env.FIXPLAN || plan, process.env.FIXTAC ? commanderOpts(newBrain()) : commanderOpts(brain));
    const battle = new Battle(field, { ember: deployPositions(field, 'ember', pc.layout(playerArmy)), ash: deployPositions(field, 'ash', ac.layout(ashArmy)) }, { seed: i * 7 + 3 });
    pc.b = battle; ac.b = battle;
    let steps = 0;
    while (!battle.over && steps++ < 7000) { pc.tick(DT); ac.tick(DT); battle.step(); battle.events.length = 0; }
    const s = battle.summary();
    learn(brain, { summary: s, plan, ctx, playerArmy, night: field.night, playerWon: s.winner === 'ember' });
    results.push({ ai: s.winner === 'ash', t: s.t, plan, ctx, reason: s.reason });
  }
  const third = Math.floor(N / 3);
  const early = results.slice(0, third).filter((r) => r.ai).length / third;
  const late = results.slice(-third).filter((r) => r.ai).length / third;
  const plans = {}; for (const r of results.slice(-third)) plans[r.plan] = (plans[r.plan] || 0) + 1;
  console.log(`${name.padEnd(22)} AI win rate early ${(early * 100).toFixed(0)}% -> late ${(late * 100).toFixed(0)}% | avg len ${(results.reduce((a, r) => a + r.t, 0) / N).toFixed(0)}s | ctx ${contextOf(brain.model)} | late plans ${JSON.stringify(plans)}`);
  const rc = {}; for (const r of results) rc[r.reason.slice(0, 30)] = (rc[r.reason.slice(0, 30)] || 0) + 1; console.log('   reasons:', JSON.stringify(rc));
  console.log('   notes:', (brain.notes || []).map((n) => n.text).join(' | '));
  if (late + 0.001 < early) fail++;
}
process.exit(0);
