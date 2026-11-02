// Automated playtest: every level must be winnable by the heuristic bot and not won by doing nothing.
import { World } from '../src/sim/world.js';
import { GoalTracker } from '../src/sim/goals.js';
import { LEVELS } from '../src/levels/levels.js';
import { Bot } from './bot.mjs';

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const seeds = +(process.argv[3] || 3);
const verbose = process.env.V;

function run(level, seed, useBot) {
  const w = new World(level, seed), g = new GoalTracker(level);
  const bot = useBot ? new Bot(w, level) : null;
  let botAcc = 0, lastT = w.time;
  const maxSteps = (level.days + 0.5) * 72 * 30;
  for (let s = 0; s < maxSteps && !g.won && !g.lost; s++) {
    w.update(1 / 30, 1);
    botAcc += 1 / 30;
    if (bot && botAcc >= 1.5) { botAcc = 0; bot.step(); }
    if (w.time !== lastT) { g.update(w, w.time - lastT); lastT = w.time; }
    w.events.length = 0;
    if (verbose && s % (72 * 30) === 0) console.log(`  d${w.day.toFixed(1)} RH${(w.rh * 100) | 0} T${w.temp.toFixed(0)} o2 ${w.o2.toFixed(1)} co2 ${w.co2 | 0} mold${w.moldCells} det${(w.detAvg * 100).toFixed(1)} | ${g.goals.map((x) => `${x.label || x.type}:${x.m?.v}/${x.m?.t}${x.done ? '✓' : ''}`).join(' ')} | cre ${['snail', 'pillbug', 'firefly', 'gnat', 'frog'].map((t) => w.count(t)).join('/')} plants ${['moss', 'grass', 'fern', 'bloom', 'mushroom', 'dewtrap', 'algae'].map((t) => w.plantCount(t, 0.15)).join('/')}`);
  }
  return { won: g.won, lost: g.lost, reason: g.reason, day: g.winDay ?? w.day, stars: g.stars(w), goals: g.goals.map((x) => `${x.label || x.type}=${x.m?.v}/${x.m?.t}${x.done ? '✓' : ''}`).join(', ') };
}

let bad = 0;
for (const L of LEVELS) {
  if (only && !only.includes(L.id)) continue;
  const res = [];
  for (let s = 1; s <= seeds; s++) res.push(run(L, s, true));
  const idle = run(L, 1, false);
  const wins = res.filter((r) => r.won).length;
  const ok = wins === seeds && !idle.won;
  const fatal = wins === 0 || idle.won;
  if (fatal) bad++;
  console.log(`${ok ? 'OK ' : fatal ? 'BAD' : 'OK~'} L${String(L.id).padStart(2)} ${L.name.padEnd(17)} bot ${wins}/${seeds} days ${res.map((r) => r.day.toFixed(1)).join(',')} stars ${res.map((r) => r.stars).join(',')} (par ${L.par}/${L.days}) | idle ${idle.won ? 'WON d' + idle.day.toFixed(1) : (idle.lost ? 'lost: ' + idle.reason : 'no win')}`);
  for (const r of res) if (!r.won) console.log(`      fail: ${r.reason || 'timeout'} | ${r.goals}`);
  if (idle.won) console.log(`      idle won: ${idle.goals}`);
}
console.log(bad ? `${bad} level(s) unwinnable or trivially won` : 'All levels winnable and none won by doing nothing');
process.exit(bad ? 1 : 0);
