import { UNITS, ROSTER } from '../data/units.js';
import { PLANS, PLAN_KEYS } from './tactics.js';

// The Ashen King's memory. Everything here persists between battles and campaigns.
// - a model of the player's habits (exponential moving averages over every battle)
// - a contextual bandit that learns which battle plan beats which kind of player
// - a matchup table that learns which of its unit types trade well against yours
// - target-priority and spacing weights nudged by what killed it and what it killed
const EMA = 0.25;
const ema = (old, v, k = EMA) => (old == null ? v : old + (v - old) * k);

export function newBrain() {
  return {
    version: 1, battles: 0, wins: 0, losses: 0, streak: 0,
    model: { comp: {}, side: { left: 0.33, center: 0.34, right: 0.33 }, aggression: 0.5, ranged: 0.2, caster: 0.15, flank: 0.15,
      fireRate: 0, focusCaster: 0.2, focusHero: 0.1, night: { n: 0, win: 0 }, banner: 0, avgLen: 120 },
    bandit: {},          // ctx -> plan -> { n, r }
    match: {},           // ashType -> emberType -> { dmg, taken }
    weights: { low: 1.2, hero: 0.8, engaged: 0.6, dist: 1 }, focus: { caster: 1.4, ranged: 1.2, melee: 1, flanker: 1, hero: 1 },
    spread: 0.4, abilityUse: 0.6,
    log: [],             // dated observations for the Ledger
    lastPlan: null, lastCtx: null, mood: 'curious',
  };
}

export function contextOf(m) {
  const side = m.side.left > 0.45 ? 'L' : m.side.right > 0.45 ? 'R' : 'C';
  const pace = m.aggression > 0.6 ? 'fast' : m.aggression < 0.35 ? 'slow' : 'even';
  const mix = m.caster > 0.25 ? 'mage' : m.ranged > 0.3 ? 'bow' : m.flank > 0.25 ? 'shade' : 'line';
  return `${side}-${pace}-${mix}`;
}

// Prior hunches before any data: counters a rival would reason its way to.
function prior(plan, ctx) {
  const [side, pace, mix] = ctx.split('-');
  let p = 0;
  if (plan === 'hook_left' && side === 'R') p += 0.25;   // strike the flank the player leaves thin
  if (plan === 'hook_right' && side === 'L') p += 0.25;
  if (plan === 'assassinate' && (mix === 'mage' || mix === 'bow')) p += 0.3;
  if (plan === 'ridge' && pace === 'fast') p += 0.25;
  if (plan === 'overwhelm' && pace === 'slow') p += 0.2;
  if (plan === 'bait' && pace === 'fast') p += 0.15;
  if (plan === 'banner' && pace === 'slow') p += 0.15;
  return p;
}

// Thompson sampling: draw a plausible win-rate for each plan from what it has seen, pick the best draw.
function gammaSample(k, rand) {
  if (k < 1) return gammaSample(k + 1, rand) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = rand(), u2 = rand(); x = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const betaSample = (a, b, rand) => { const x = gammaSample(a, rand), y = gammaSample(b, rand); return x / (x + y); };
function thompson(arms, glob, keys, priorFn, rand) {
  let best = keys[0], bs = -1;
  for (const k of keys) {
    const a = arms[k] || { n: 0, r: 0 }, g = glob[k] || { n: 0, r: 0 };
    const pr = Math.min(0.8, 0.4 + priorFn(k));
    const wins = a.r + 0.35 * g.r + pr * 2, n = a.n + 0.35 * g.n + 2;
    const v = betaSample(1 + wins, 1 + Math.max(0, n - wins), rand);
    if (v > bs) { bs = v; best = k; }
  }
  return best;
}
export function choosePlan(brain, rand = Math.random) {
  const ctx = contextOf(brain.model);
  const plan = thompson((brain.bandit[ctx] ||= {}), (brain.bandit._all ||= {}), PLAN_KEYS, (k) => prior(k, ctx), rand);
  return { plan, ctx };
}

// Learned effectiveness of one of its types against one of yours: damage dealt per damage taken.
function eff(brain, a, e) {
  const m = brain.match[a]?.[e];
  const base = BASE_EFF[a]?.[UNITS[e].role] ?? 1;
  if (!m || m.dmg + m.taken < 200) return base;
  const learned = (m.dmg + 50) / (m.taken + 50);
  const w = Math.min(1, (m.dmg + m.taken) / 2000);
  return base * (1 - w) + learned * w;
}
const BASE_EFF = {
  bonewarden: { melee: 1.1, ranged: 1.3, caster: 1.3, flanker: 1.1, hero: 0.8 },
  thrall: { melee: 0.6, ranged: 1.2, caster: 1.3, flanker: 0.7, hero: 0.5 },
  boneshot: { melee: 1.2, ranged: 1, caster: 1.3, flanker: 0.7, hero: 0.9 },
  necromancer: { melee: 1.1, ranged: 0.9, caster: 1, flanker: 0.6, hero: 1 },
};

// Army archetypes: weights per unit type. Which archetype works is learned per player context,
// so credit goes to the whole army instead of to whichever unit happened to survive.
export const ARCHETYPES = {
  shieldwall: { name: 'Shieldwall', w: { bonewarden: 5, thrall: 2, boneshot: 2, necromancer: 1 } },
  horde: { name: 'The Horde', w: { bonewarden: 1, thrall: 7, boneshot: 1, necromancer: 2 } },
  crossbows: { name: 'Bone Crossbows', w: { bonewarden: 3, thrall: 2, boneshot: 5, necromancer: 0.5 } },
  necropolis: { name: 'Necropolis', w: { bonewarden: 2, thrall: 4, boneshot: 1, necromancer: 4 } },
  balanced: { name: 'Balanced host', w: { bonewarden: 3, thrall: 3, boneshot: 3, necromancer: 2 } },
  counter: { name: 'Counter-host', w: null },
};
const ARCH_KEYS = Object.keys(ARCHETYPES);
function archPrior(k, exp) {
  const role = (r) => Object.entries(exp).reduce((a, [t, v]) => a + (UNITS[t]?.role === r ? v : 0), 0);
  let p = 0;
  if (k === 'shieldwall' && role('ranged') + role('caster') > 0.4) p += 0.2;
  if (k === 'horde' && role('caster') < 0.12) p += 0.15;
  if (k === 'crossbows' && role('melee') > 0.5) p += 0.15;
  if (k === 'necropolis' && role('melee') + role('flanker') > 0.5) p += 0.1;
  if (k === 'counter') p += 0.12;
  return p;
}
export function chooseArmy(brain, budget, expected, rand = Math.random, ctx = contextOf(brain.model)) {
  const exp = expected && expected.length ? countShare(expected.filter((t) => !UNITS[t]?.hero)) : (Object.keys(brain.model.comp).length ? brain.model.comp : { knight: 0.3, ranger: 0.3, barbarian: 0.2, pyromancer: 0.2 });
  const arch = thompson(((brain.army ||= {})[ctx] ||= {}), (brain.army._all ||= {}), ARCH_KEYS, (k) => archPrior(k, exp), rand);
  let W = ARCHETYPES[arch].w;
  if (!W) { // counter-host: weight each type by how well it should fare against the expected army
    W = {};
    for (const t of ROSTER.ash) { let sc = 0; for (const [e, sh] of Object.entries(exp)) sc += sh * (BASE_EFF[t]?.[UNITS[e]?.role] ?? 1); W[t] = Math.exp(2.2 * sc / Math.sqrt(UNITS[t].cost / 50)); }
  }
  const army = []; const counts = {};
  let left = budget, guard = 0;
  while (left >= 30 && guard++ < 40) {
    const opts = ROSTER.ash.filter((t) => UNITS[t].cost <= left);
    if (!opts.length) break;
    const front = (counts.bonewarden || 0) + (counts.thrall || 0), total = army.length;
    const w = opts.map((t) => {
      let x = W[t] / (1 + 0.6 * (counts[t] || 0));
      if (total >= 3 && front / total < 0.4 && (t === 'bonewarden' || t === 'thrall')) x *= 4; // always keep a front line
      return x;
    });
    let r = rand() * w.reduce((p, q) => p + q, 0), pick = opts[0];
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { pick = opts[i]; break; } }
    army.push(pick); counts[pick] = (counts[pick] || 0) + 1; left -= UNITS[pick].cost;
  }
  brain.lastArch = arch;
  return army;
}
const countShare = (types) => { const c = {}; for (const t of types) c[t] = (c[t] || 0) + 1 / types.length; return c; };

// Experience: the rival's battlefield craft grows with every battle it fights (reaches full skill after ~40).
export const skillOf = (brain) => Math.min(1, 0.15 + brain.battles / 45);

// Tactical settings the commander uses, from what it has learned.
export function commanderOpts(brain) {
  return { weights: { ...brain.weights }, focus: { ...brain.focus }, spread: brain.spread, abilityUse: brain.abilityUse, skill: skillOf(brain) };
}

// Learn from a finished battle. playerArmy: ember types fielded. summary from Battle.summary().
export function learn(brain, { summary, plan, ctx, playerArmy, night, playerWon, fieldWidth = 20 }) {
  const m = brain.model, st = summary.stats;
  brain.battles++;
  if (playerWon) { brain.losses++; brain.streak = Math.min(0, brain.streak) - 1; } else { brain.wins++; brain.streak = Math.max(0, brain.streak) + 1; }
  // composition
  const share = countShare(playerArmy.filter((t) => !UNITS[t].hero));
  for (const t of new Set([...Object.keys(m.comp), ...Object.keys(share)])) m.comp[t] = ema(m.comp[t] ?? 0, share[t] || 0);
  const roleShare = (r) => playerArmy.filter((t) => UNITS[t].role === r).length / Math.max(1, playerArmy.length);
  m.ranged = ema(m.ranged, roleShare('ranged')); m.caster = ema(m.caster, roleShare('caster')); m.flank = ema(m.flank, roleShare('flanker'));
  // where the player deploys and first moves (player's own left is low x)
  const xs = [...st.deployX.ember, ...st.firstMoves.ember];
  if (xs.length) {
    const mid = fieldWidth / 2; let l = 0, c = 0, r = 0;
    for (const x of xs) { if (x < mid - 3) l++; else if (x > mid + 3) r++; else c++; }
    const n = l + c + r;
    m.side.left = ema(m.side.left, l / n); m.side.center = ema(m.side.center, c / n); m.side.right = ema(m.side.right, r / n);
  }
  // pace: how quickly contact happened
  const adv = st.advance.ember ?? 0; // world units advanced in the first 20 s
  m.aggression = ema(m.aggression, Math.max(0, Math.min(1, adv / 14)));
  const uses = st.abilityUses.ember || {};
  m.fireRate = ema(m.fireRate, (uses.fireball || 0) / Math.max(1, summary.t / 60));
  const f = st.focus.ember || {}; const ft = Object.values(f).reduce((a, b) => a + b, 0) || 1;
  m.focusCaster = ema(m.focusCaster, (f.caster || 0) / ft); m.focusHero = ema(m.focusHero, (f.hero || 0) / ft);
  if (night) { m.night.n++; if (playerWon) m.night.win++; }
  m.avgLen = ema(m.avgLen, summary.t);
  if (/banner/.test(summary.reason)) m.banner = ema(m.banner, playerWon ? 1 : 0);
  // bandit reward: value traded, plus a win bonus
  const lostAsh = 1 - summary.left.ash / Math.max(1, summary.start.ash);
  const lostEmber = 1 - summary.left.ember / Math.max(1, summary.start.ember);
  const reward = Math.max(0, Math.min(1, (playerWon ? 0.15 : 0.75) + (lostEmber - lostAsh) * 0.25));
  const arms = (brain.bandit[ctx] ||= {});
  const a = (arms[plan] ||= { n: 0, r: 0 }); a.n++; a.r += reward;
  const g = ((brain.bandit._all ||= {})[plan] ||= { n: 0, r: 0 }); g.n++; g.r += reward;
  if (brain.lastArch) {
    const aa = (((brain.army ||= {})[ctx] ||= {})[brain.lastArch] ||= { n: 0, r: 0 }); aa.n++; aa.r += reward;
    const ag = ((brain.army._all ||= {})[brain.lastArch] ||= { n: 0, r: 0 }); ag.n++; ag.r += reward;
  }
  // matchups
  for (const [k, v] of Object.entries(st.dmg)) {
    const [src, dst] = k.split('>');
    if (UNITS[src].faction === 'ash' && UNITS[dst].faction === 'ember') { const e = ((brain.match[src] ||= {})[dst] ||= { dmg: 0, taken: 0 }); e.dmg += v; }
    if (UNITS[src].faction === 'ember' && UNITS[dst].faction === 'ash') { const e = ((brain.match[dst] ||= {})[src] ||= { dmg: 0, taken: 0 }); e.taken += v; }
  }
  // tactics: focus what hurt it most; spread out if fire scorched it
  const dmgByRole = {};
  for (const [k, v] of Object.entries(st.dmg)) { const [src, dst] = k.split('>'); if (UNITS[src].faction === 'ember' && UNITS[dst].faction === 'ash') dmgByRole[UNITS[src].role] = (dmgByRole[UNITS[src].role] || 0) + v; }
  const tot = Object.values(dmgByRole).reduce((x, y) => x + y, 0) || 1;
  for (const r of ['melee', 'ranged', 'caster', 'flanker', 'hero']) brain.focus[r] = Math.max(0.6, Math.min(3, ema(brain.focus[r], 0.8 + 3 * (dmgByRole[r] || 0) / tot, 0.3)));
  const aoeShare = (st.aoeTaken.ash || 0) / Math.max(1, Object.entries(st.dmg).filter(([k]) => UNITS[k.split('>')[1]].faction === 'ash').reduce((x, [, v]) => x + v, 0));
  brain.spread = Math.max(0.3, Math.min(1.6, ema(brain.spread, 0.3 + aoeShare * 3, 0.3)));
  brain.weights.hero = Math.max(0.3, Math.min(3, brain.weights.hero + (playerWon ? 0.08 : -0.02)));
  brain.abilityUse = Math.min(1, brain.abilityUse + 0.01);
  brain.lastPlan = plan; brain.lastCtx = ctx;
  brain.mood = brain.streak >= 2 ? 'gloating' : brain.streak <= -2 ? 'furious' : playerWon ? 'wary' : 'pleased';
  noteObservations(brain, { summary, playerWon, plan });
  return reward;
}

const pct = (v) => `${Math.round(v * 100)}%`;
function noteObservations(brain, { summary, playerWon, plan }) {
  const m = brain.model, notes = [];
  if (brain.battles >= 2) {
    if (m.side.left > 0.42) notes.push({ k: 'side', text: `You favour your left flank (${pct(m.side.left)} of your forces). I have started waiting there.` });
    else if (m.side.right > 0.42) notes.push({ k: 'side', text: `You favour your right flank (${pct(m.side.right)} of your forces). My hooks now swing that way.` });
    else notes.push({ k: 'side', text: 'You spread your lines evenly. I cannot predict your weight yet.' });
    if (m.aggression > 0.6) notes.push({ k: 'pace', text: 'You charge early. I learn to give ground and let you tire on high places.' });
    else if (m.aggression < 0.35) notes.push({ k: 'pace', text: 'You wait for me to come. I will take the banner while you wait.' });
    if (m.caster > 0.22) notes.push({ k: 'mix', text: `Your army leans on pyromancers (${pct(m.caster)}). My shades of bone hunt them first.` });
    if (m.ranged > 0.3) notes.push({ k: 'mix', text: `You trust in crossbows (${pct(m.ranged)}). I march through the trees where your bolts miss.` });
    if (m.fireRate > 0.7) notes.push({ k: 'fire', text: 'You burn the forests often. My ranks now march further apart.' });
    if (m.focusHero > 0.25) notes.push({ k: 'hero', text: 'You go for my throat. I keep my guard closer.' });
  }
  const best = Object.entries(brain.match).flatMap(([a, row]) => Object.entries(row).map(([e, v]) => ({ a, e, r: (v.dmg + 50) / (v.taken + 50), n: v.dmg + v.taken }))).filter((x) => x.n > 600).sort((x, y) => y.r - x.r)[0];
  if (best) notes.push({ k: 'match', text: `My ${UNITS[best.a].name}s trade best against your ${UNITS[best.e].name}s. I will bring more of them.` });
  brain.notes = notes;
  brain.log.unshift({ n: brain.battles, won: !playerWon, plan: PLANS[plan]?.name || plan, reason: summary.reason });
  brain.log = brain.log.slice(0, 30);
}

const TAUNTS = {
  curious: ['Show me how you fight, little lantern.', 'Every battle teaches me. Teach me well.'],
  pleased: ['Your bones will serve me well.', 'I remember how you broke last time. So do you.'],
  gloating: ['You do the same thing every time. Did you think I would not notice?', 'Again? I already know how this ends.'],
  wary: ['A clever trick. You will not use it twice.', 'I have written your victory into my ledger. It will not repeat.'],
  furious: ['Three times you have shamed me. I have learned three lessons.', 'Burn my forests, kill my kin. I am still learning you.'],
};
export function taunt(brain, rand = Math.random) {
  const list = [...(TAUNTS[brain.mood] || TAUNTS.curious)];
  if (brain.model.side.left > 0.45) list.push('Will you come up the left again? I am counting on it.');
  if (brain.model.caster > 0.25) list.push('Bring your fire-mages. My shades are hungry.');
  if (brain.model.aggression > 0.65) list.push('Charge, then. The hill will hold you.');
  return list[Math.floor(rand() * list.length)];
}
