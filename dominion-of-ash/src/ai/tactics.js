import { UNITS } from '../data/units.js';
import { TERRAIN, COLS } from '../battle/maps.js';
import { toWorld, offsetToAxial } from '../core/hex.js';

// Battle plans. lanes: which column each role heads for; hold: wait on defensive ground; bait: swarm goes first.
export const PLANS = {
  overwhelm: { name: 'Overwhelm the centre', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' }, aggression: 1 },
  hook_left: { name: 'Hook around your left', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'left', hero: 'left' }, aggression: 0.9, hookSide: 'left' },
  hook_right: { name: 'Hook around your right', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'right', hero: 'right' }, aggression: 0.9, hookSide: 'right' },
  bait: { name: 'Bait and envelop', lanes: { melee: 'split', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'split', hero: 'center' }, aggression: 0.7, bait: true },
  ridge: { name: 'Hold high ground and raise the dead', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' }, aggression: 0.25, hold: true },
  assassinate: { name: 'Hunt your casters', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'wide', hero: 'center' }, aggression: 0.85, focus: { caster: 3, ranged: 1.5, hero: 1.2 } },
  siege: { name: 'Out-range and grind', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' }, aggression: 0.6, siege: true },
  banner: { name: 'Seize the banner', lanes: { melee: 'center', swarm: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' }, aggression: 0.8, banner: true },
};
export const PLAN_KEYS = Object.keys(PLANS);

// Lanes are absolute and named from the player's view: left = low x, right = high x.
function laneCol(lane, side, i) {
  if (lane === 'left') return 1.5;
  if (lane === 'right') return 8.5;
  if (lane === 'split') return i % 2 ? 1.8 : 8.2;
  if (lane === 'wide') return i % 2 ? 0.8 : 9.2;
  return 5 + ((i % 3) - 1) * 1.2;
}
const colX = (col, row) => toWorld(...offsetToAxial(Math.round(col), row))[0] + (col - Math.round(col)) * 2;

// A commander drives one side of a battle with a plan and tunable weights.
export class Commander {
  constructor(battle, side, plan, opts = {}) {
    this.b = battle; this.side = side; this.plan = typeof plan === 'string' ? PLANS[plan] : plan;
    this.planKey = typeof plan === 'string' ? plan : opts.planKey;
    this.w = { dist: 1, low: 1.2, hero: 0.8, engaged: 0.6, ...(opts.weights || {}) };
    this.focus = { melee: 1, ranged: 1.2, caster: 1.4, flanker: 1, swarm: 0.7, hero: 1, ...(this.plan.focus || {}), ...(opts.focus || {}) };
    this.spread = opts.spread ?? 0.4;
    this.abilityUse = opts.abilityUse ?? 1;   // 0..1 how readily abilities fire
    this.skill = opts.skill ?? 1;             // 0..1 grows with experience: reaction, focus fire, retreating the wounded
    this.timer = 0; this.engaged = false; this.released = false;
    this.dir = side === 'ember' ? -1 : 1;
  }

  layout(types) {
    // deployment: lane column and depth per unit (ranged/casters deeper)
    const out = [];
    const byRole = {};
    types.forEach((t, i) => { const r = UNITS[t].role; (byRole[r] ||= []).push(i); });
    types.forEach((t, i) => {
      const role = UNITS[t].role, idx = byRole[role].indexOf(i);
      const lane = this.plan.lanes[role] || 'center';
      let col = laneCol(lane, this.side, idx);
      if (lane === 'center') col = 5 + (idx - (byRole[role].length - 1) / 2) * 1.6;
      const depth = role === 'ranged' || role === 'caster' ? 2 : role === 'hero' ? 1 : 0;
      out.push({ type: t, col: Math.max(0, Math.min(COLS - 1, col)), depth, jx: (Math.random() - 0.5) * 0.6, jz: (Math.random() - 0.5) * 0.4 });
    });
    return out;
  }

  mine() { return this.b.units.filter((u) => u.alive && u.side === this.side); }
  theirs() { return this.b.units.filter((u) => u.alive && u.side !== this.side); }

  tick(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const mine = this.mine(), theirs = this.theirs();
    if (!mine.length || !theirs.length) return;
    // contact: any enemy close to any of ours
    let minD = Infinity;
    for (const a of mine) for (const e of theirs) minD = Math.min(minD, Math.hypot(a.x - e.x, a.z - e.z));
    if (minD < 7) this.engaged = true;
    const b = this.b;
    const midZ = b.field.banner.z;
    // bait: hold main force until the enemy commits on the swarm
    if (this.plan.bait && !this.released) {
      const swarmHit = mine.some((u) => u.def.role === 'swarm' && u.hp < u.maxHp * 0.85);
      if (swarmHit || b.t > 40) this.released = true;
    }
    const roleIdx = {};
    for (const u of mine) {
      if (u.routing > 0) continue;
      const role = u.def.role; const i = (roleIdx[role] = (roleIdx[role] ?? -1) + 1);
      this.abilities(u, theirs, mine);
      const nearE = b.nearestEnemy(u, 9);
      if (this.plan.siege && (role === 'melee' || role === 'swarm' || role === 'hero')) {
        const close = b.nearestEnemy(u, 4.5);
        if (close) { if (u.target !== close) b.order([u.id], { type: 'attack', target: close }); continue; }
        const shooters = mine.filter((m) => m.def.role === 'ranged' || m.def.role === 'caster');
        if (shooters.length) {
          const cx = shooters.reduce((a, m) => a + m.x, 0) / shooters.length + ((i % 5) - 2) * 1.3;
          const cz = shooters.reduce((a, m) => a + m.z, 0) / shooters.length + this.dir * 1.6;
          if (Math.hypot(u.x - cx, u.z - cz) > 1.2) b.order([u.id], { type: 'move', x: cx, z: cz });
          continue;
        }
      }
      if (this.engaged && nearE) {
        const t = this.pick(u, theirs);
        if (t && t !== u.target) b.order([u.id], { type: 'attack', target: t });
        // archers step back from melee
        if ((role === 'ranged' || role === 'caster') && nearE && Math.hypot(nearE.x - u.x, nearE.z - u.z) < 2 && nearE.def.range < 3) {
          const dx = u.x - nearE.x, dz = u.z - nearE.z, d = Math.hypot(dx, dz) || 1;
          b.order([u.id], { type: 'move', x: u.x + (dx / d) * 2.5, z: u.z + (dz / d) * 2.5 });
        }
        continue;
      }
      // advance along lanes
      if (this.plan.hold && !this.engaged) { this.holdGround(u, i); continue; }
      if (this.plan.bait && !this.released && role !== 'swarm') { this.holdGround(u, i, true); continue; }
      const lane = this.plan.lanes[role] || 'center';
      let col = laneCol(lane, this.side, i);
      if (lane === 'center') col = 5 + ((i % 4) - 1.5) * 1.4;
      if (role === 'hero') col = 5;
      col += (Math.sin(u.id * 12.9) * this.spread);
      const agg = this.plan.aggression;
      const back = (role === 'ranged' || role === 'caster' ? 3 : role === 'hero' ? 2 : 0) * this.dir * -1;
      let tz = midZ + this.dir * (agg * 6) + back;
      if (this.plan.banner && (role === 'melee' || role === 'hero' || role === 'swarm')) tz = midZ;
      const row = Math.max(0, Math.min(14, Math.round(tz / 1.732)));
      let tx = colX(col, row);
      if (Math.abs(u.order.x - tx) > 0.8 || Math.abs(u.order.z - tz) > 0.8 || u.order.type !== 'move') b.order([u.id], { type: 'move', x: tx, z: tz, amove: true });
    }
  }

  holdGround(u, i, shallow = false) {
    // pick a defensible cell near our side of the field
    const b = this.b;
    if (!this._defCells) {
      this._defCells = [...b.grid].filter((c) => TERRAIN[c.type].pass && (TERRAIN[c.type].high || c.type === 'forest' || c.type === 'ruin' || c.type === 'town'))
        .filter((c) => (this.side === 'ash' ? c.row >= 2 && c.row <= 7 : c.row <= 12 && c.row >= 7)).sort((a, b2) => (TERRAIN[b2.type].high ? 1 : 0) - (TERRAIN[a.type].high ? 1 : 0));
    }
    const c = this._defCells[i % Math.max(1, this._defCells.length)];
    const z = shallow ? (this.side === 'ash' ? 4.5 : 20) : c?.z;
    if (!c) return;
    const x = shallow ? colX(5 + ((i % 5) - 2) * 1.6, Math.round(z / 1.732)) : c.x;
    if (u.def.role === 'ranged' || u.def.role === 'caster' || !shallow) { if (Math.hypot(u.x - x, u.z - z) > 0.8 && u.order.type !== 'move') this.b.order([u.id], { type: 'move', x, z: z ?? c.z, amove: true }); }
    else if (u.order.type !== 'move') this.b.order([u.id], { type: 'move', x, z, amove: true });
  }

  pick(u, theirs) {
    let best = null, bs = -Infinity;
    for (const e of theirs) {
      if (e.status.smoke > 0) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      let s = -d * 0.35 * this.w.dist;
      s += (1 - e.hp / e.maxHp) * 2 * this.w.low;
      s += (this.focus[e.def.role] || 1) * 1.2;
      if (e.def.hero) s += this.w.hero;
      if (u.def.role === 'flanker' && e.target && e.target.side === u.side) s += this.w.engaged * 2;
      if (u.def.range < 3 && d > 8) s -= 3;
      if (u.def.range > 3 && d > u.def.range + 2) s -= 2;
      if (e.routing > 0) s -= 1.5;
      if (s > bs) { bs = s; best = e; }
    }
    if (u.target && u.target.alive && best !== u.target) {
      const d = Math.hypot(u.target.x - u.x, u.target.z - u.z);
      if (d < u.def.range + 0.5 && this.b.rand() < 0.7) return u.target; // don't flip-flop in melee
    }
    return best;
  }

  abilities(u, theirs, mine) {
    const ab = u.def.ability; if (!ab || u.acd > 0) return;
    if (this.b.rand() > this.abilityUse * (0.6 + 0.4 * this.skill)) return;
    const b = this.b;
    const near = (r) => theirs.filter((e) => Math.hypot(e.x - u.x, e.z - u.z) < r);
    switch (ab.id) {
      case 'shieldwall': if (near(3).length >= 1 && (u.hp < u.maxHp * 0.7 || near(9).filter((e) => e.def.range > 3).length >= 2)) b.useAbility(u.id); break;
      case 'cleave': if (near(2.2).length >= 2) b.useAbility(u.id); break;
      case 'volley': if (u.target && Math.hypot(u.target.x - u.x, u.target.z - u.z) < u.def.range) b.useAbility(u.id); break;
      case 'smoke': if (near(6).some((e) => e.def.role === 'caster' || e.def.role === 'ranged') || u.hp < u.maxHp * 0.4) b.useAbility(u.id); break;
      case 'rally': if (mine.filter((a) => a.hp < a.maxHp * 0.55 || a.morale < a.def.morale * 0.4).length >= 2) b.useAbility(u.id); break;
      case 'wail': if (near(ab.radius).length >= 3) b.useAbility(u.id); break;
      case 'raise': if (b.corpses.filter((c) => !c.used && Math.hypot(c.x - u.x, c.z - u.z) < ab.radius).length >= 2) b.useAbility(u.id); break;
      case 'fireball': {
        let best = null, bn = 1;
        for (const e of theirs) {
          if (Math.hypot(e.x - u.x, e.z - u.z) > u.def.range * 1.3) continue;
          const n = theirs.filter((o) => Math.hypot(o.x - e.x, o.z - e.z) < ab.radius).length;
          const forest = b.cellAt(e.x, e.z)?.type === 'forest' ? 1 : 0;
          if (n + forest > bn) { bn = n + forest; best = e; }
        }
        if (best) b.useAbility(u.id, { x: best.x, z: best.z });
        break;
      }
    }
  }
}
