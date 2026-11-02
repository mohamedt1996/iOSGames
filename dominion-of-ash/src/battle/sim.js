import { UNITS, HERO } from '../data/units.js';
import { TERRAIN, COLS, ROWS } from './maps.js';
import { mulberry32 } from '../core/rng.js';
import { DIRS } from '../core/hex.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
export const DT = 0.05;
export const TIME_LIMIT = 300;
export const HOLD = 35;
export const HOLD_DELAY = 30; // nobody can claim the banner in the opening 30 s

// Deterministic real-time battle. The renderer reads units/projectiles/events; commanders issue orders.
export class Battle {
  constructor(field, armies, opts = {}) {
    this.field = field; this.grid = field.grid;
    this.rand = mulberry32(opts.seed ?? 7);
    this.units = []; this.projectiles = []; this.events = []; this.corpses = [];
    this.t = 0; this.nextId = 1; this.over = false; this.winner = null; this.reason = '';
    this.night = !!field.night;
    this.hold = { ember: 0, ash: 0 };
    this.stats = {
      dmg: {}, kills: { ember: 0, ash: 0 }, lost: { ember: 0, ash: 0 }, abilityUses: { ember: {}, ash: {} },
      firstContact: null, deployX: { ember: [], ash: [] }, firstMoves: { ember: [], ash: [] }, aoeTaken: { ember: 0, ash: 0 },
      focus: { ember: {}, ash: {} }, valueStart: { ember: 0, ash: 0 }, advance: { ember: null, ash: null }, startZ: {}, burned: 0, raised: 0, routs: { ember: 0, ash: 0 },
    };
    for (const side of ['ember', 'ash']) for (const spec of armies[side] || []) this.spawn(spec.type, side, spec.x, spec.z, spec);
    for (const u of this.units) { this.stats.valueStart[u.side] += u.def.cost || 120; this.stats.deployX[u.side].push(u.x); this.stats.startZ[u.id] = u.z; }
  }

  spawn(type, side, x, z, o = {}) {
    const def = UNITS[type];
    const vet = o.vet || 0;
    const u = {
      id: this.nextId++, type, def, side, x, z, facing: side === 'ember' ? -Math.PI / 2 : Math.PI / 2,
      hp: def.hp * (1 + vet * 0.12), maxHp: def.hp * (1 + vet * 0.12), vet, alive: true, cd: this.rand() * 0.6, acd: 3 + this.rand() * 2,
      morale: def.morale, order: { type: 'hold' }, path: null, pathT: 0, target: null, status: {}, routing: 0,
      moving: false, attackAnim: 0, kills: 0, dmgDealt: 0, lastHitBy: null, hitT: 0, raised: !!o.raised, uid: o.uid,
    };
    this.units.push(u);
    if (o.raised) this.events.push({ e: 'raise', id: u.id, x, z });
    return u;
  }

  cellAt(x, z) { return this.grid.at(x, z); }
  passable(x, z) { const c = this.cellAt(x, z); return !!c && TERRAIN[c.type].pass; }
  enemiesOf(u) { return this.units.filter((v) => v.alive && v.side !== u.side); }
  alliesOf(u) { return this.units.filter((v) => v.alive && v.side === u.side && v !== u); }
  hero(side) { return this.units.find((u) => u.type === HERO[side]); }

  order(ids, o) {
    for (const id of ids) {
      const u = this.units.find((v) => v.id === id); if (!u || !u.alive || u.routing > 0) continue;
      u.order = { ...o }; u.path = null; u.pathT = 0;
      if (o.type === 'attack') u.target = o.target; else if (o.type === 'move') u.target = null;
      if (this.t < 25 && this.stats.firstMoves[u.side].length < 30 && o.x != null) this.stats.firstMoves[u.side].push(o.x);
    }
  }

  useAbility(id, at) {
    const u = this.units.find((v) => v.id === id);
    if (!u || !u.alive || !u.def.ability || u.acd > 0 || u.routing > 0) return false;
    const ab = u.def.ability;
    const S = this.stats.abilityUses[u.side]; S[ab.id] = (S[ab.id] || 0) + 1;
    u.acd = ab.cd;
    this.events.push({ e: 'ability', id: u.id, ab: ab.id, x: at?.x ?? u.x, z: at?.z ?? u.z });
    switch (ab.id) {
      case 'shieldwall': u.status.shield = ab.dur; break;
      case 'smoke': u.status.smoke = ab.dur; u.target = null; for (const e of this.enemiesOf(u)) if (e.target === u) e.target = null; break;
      case 'cleave': {
        u.attackAnim = 1.1;
        for (const e of this.enemiesOf(u)) if (Math.hypot(e.x - u.x, e.z - u.z) < 2.2) this.damage(u, e, u.def.dmg * 1.5, { aoe: true });
        break;
      }
      case 'volley': {
        const t = u.target?.alive ? u.target : this.nearestEnemy(u, u.def.range * 1.2);
        if (!t) { u.acd = 1; return false; }
        for (let i = 0; i < 3; i++) this.shoot(u, t, 0.85, i * 0.12);
        break;
      }
      case 'fireball': {
        const p = at || (u.target?.alive ? { x: u.target.x, z: u.target.z } : null);
        if (!p) { u.acd = 1; return false; }
        const d = Math.hypot(p.x - u.x, p.z - u.z);
        const k = d > u.def.range * 1.3 ? (u.def.range * 1.3) / d : 1;
        const fx = u.x + (p.x - u.x) * k, fz = u.z + (p.z - u.z) * k;
        this.projectiles.push({ kind: 'fireball', from: u.id, side: u.side, x: u.x, z: u.z, sx: u.x, sz: u.z, tx: fx, tz: fz, t: 0, f: 0, dur: 0.9, aoe: ab.radius * (u.aoeMul || 1), dmg: ab.dmg * (u.aoeMul || 1) });
        u.attackAnim = 1; u.facing = Math.atan2(fz - u.z, fx - u.x);
        break;
      }
      case 'rally': {
        for (const a of [u, ...this.alliesOf(u)]) if (Math.hypot(a.x - u.x, a.z - u.z) < ab.radius) {
          a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.25); a.morale = Math.max(a.morale, a.def.morale); a.routing = 0; a.status.rallied = ab.dur;
        }
        break;
      }
      case 'wail': {
        for (const e of this.enemiesOf(u)) if (Math.hypot(e.x - u.x, e.z - u.z) < ab.radius) { e.morale -= 35; e.status.terror = ab.dur; }
        break;
      }
      case 'raise': {
        const near = this.corpses.filter((c) => !c.used && !UNITS[c.type].hero && this.t - c.t < 30 && Math.hypot(c.x - u.x, c.z - u.z) < ab.radius)
          .sort((a, b) => Math.hypot(a.x - u.x, a.z - u.z) - Math.hypot(b.x - u.x, b.z - u.z)).slice(0, 3);
        if (!near.length) { u.acd = 2; return false; }
        for (const c of near) { c.used = true; this.spawn('thrall', u.side, c.x, c.z, { raised: true }); this.stats.raised++; }
        u.attackAnim = 1.2;
        break;
      }
    }
    return true;
  }

  nearestEnemy(u, maxD = Infinity, filter) {
    let best = null, bd = maxD;
    for (const e of this.units) {
      if (!e.alive || e.side === u.side || e.status.smoke > 0) continue;
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  shoot(u, t, mult = 1, delay = 0) {
    const d = Math.hypot(t.x - u.x, t.z - u.z);
    const kind = u.def.projectile || 'arrow';
    this.projectiles.push({ kind, from: u.id, side: u.side, target: t.id, x: u.x, y: 0.7, z: u.z, sx: u.x, sz: u.z, t: -delay, dur: 0.25 + d / (kind === 'arrow' ? 22 : 14), mult });
  }

  damage(src, dst, amount, o = {}) {
    if (!dst.alive) return 0;
    let m = 1;
    // flanking: hit from behind the target's facing
    const ang = Math.atan2(src.z - dst.z, src.x - dst.x);
    const behind = Math.abs(angDiff(ang, dst.facing)) > 2.1;
    if (behind && !o.aoe) m *= src.status.smoke > 0 ? 3 : 1.5;
    else if (src.status.smoke > 0 && !o.aoe) m *= 2;
    if (src.status.smoke > 0) src.status.smoke = 0;
    const tc = this.cellAt(dst.x, dst.z), sc = this.cellAt(src.x, src.z);
    if (o.ranged && tc) m *= TERRAIN[tc.type].cover;
    if (o.ranged && sc && TERRAIN[sc.type].high && !(tc && TERRAIN[tc.type].high)) m *= 1.25;
    if (!o.ranged && tc && TERRAIN[tc.type].high && !(sc && TERRAIN[sc.type].high)) m *= 0.8;
    if (dst.status.shield > 0) m *= 0.35;
    if (src.status.terror > 0) m *= 0.75;
    if (src.status.rallied > 0) m *= 1.15;
    if (this.night && src.side === 'ash') m *= 1.15;
    m *= 1 + src.vet * 0.1;
    if (src.dmgMul) m *= src.dmgMul;
    const dmg = amount * m * (1 - dst.def.armor);
    dst.hp -= dmg; dst.hitT = 0.25; dst.lastHitBy = src.id;
    src.dmgDealt += dmg;
    const key = `${src.type}>${dst.type}`; this.stats.dmg[key] = (this.stats.dmg[key] || 0) + dmg;
    if (o.aoe) this.stats.aoeTaken[dst.side] += dmg;
    this.stats.focus[src.side][dst.def.role] = (this.stats.focus[src.side][dst.def.role] || 0) + dmg;
    if (dst.def.morale < 500) dst.morale -= (dmg / dst.maxHp) * 45 * (behind ? 1.6 : 1);
    if (this.stats.firstContact == null) this.stats.firstContact = this.t;
    this.events.push({ e: 'hit', id: dst.id, by: src.id, dmg, behind, x: dst.x, z: dst.z });
    if (dst.hp <= 0) this.kill(dst, src);
    return dmg;
  }

  kill(u, by) {
    u.alive = false; u.hp = 0;
    this.stats.lost[u.side]++; if (by) { this.stats.kills[by.side]++; by.kills++; }
    this.corpses.push({ type: u.type, side: u.side, x: u.x, z: u.z, t: this.t, used: u.raised });
    this.events.push({ e: 'death', id: u.id, x: u.x, z: u.z });
    for (const a of this.alliesOf(u)) if (a.def.morale < 500 && Math.hypot(a.x - u.x, a.z - u.z) < 5) a.morale -= u.def.hero ? 60 : 12;
    if (u.def.hero) {
      this.events.push({ e: 'herofall', side: u.side });
      if (u.side === 'ember') for (const a of this.units) if (a.alive && a.side === 'ember') a.morale -= 30;
      if (u.side === 'ash') {
        // the Legion is bound to its King: thralls crumble, the rest are shaken
        for (const a of this.units) if (a.alive && a.side === 'ash') { if (a.type === 'thrall') this.kill(a, null); else a.hp *= 0.6; }
      }
    }
  }

  // ---------------- simulation ----------------
  step() {
    if (this.over) return;
    const dt = DT;
    this.t += dt;
    if (this.stats.advance.ember == null && this.t >= 20) {
      for (const side of ['ember', 'ash']) {
        const us = this.units.filter((u) => u.side === side && u.alive && this.stats.startZ[u.id] != null);
        this.stats.advance[side] = us.length ? us.reduce((a, u) => a + Math.abs(u.z - this.stats.startZ[u.id]), 0) / us.length : 0;
      }
    }
    this.updateFire(dt);
    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    this.separate();
    this.updateProjectiles(dt);
    this.checkEnd(dt);
  }

  updateFire(dt) {
    for (const c of this.grid) {
      if (c.burn <= 0) continue;
      c.burn -= dt;
      if (c.burn <= 0) { c.type = 'ash'; c.burnt = true; this.events.push({ e: 'burnout', q: c.q, r: c.r }); continue; }
      if (this.rand() < dt * 0.35) for (const n of this.grid.neighbors(c)) if (n.type === 'forest' && n.burn <= 0 && this.rand() < 0.4) this.ignite(n);
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      const c = this.cellAt(u.x, u.z);
      if (c && c.burn > 0) { u.hp -= 14 * dt * (1 - u.def.armor * 0.5); u.hitT = 0.2; if (u.def.morale < 500) u.morale -= 10 * dt; if (u.hp <= 0) { this.stats.burned++; this.kill(u, null); } }
    }
  }
  ignite(c) { if (c.type !== 'forest' || c.burn > 0) return; c.burn = 10 + this.rand() * 5; this.events.push({ e: 'ignite', q: c.q, r: c.r, x: c.x, z: c.z }); }

  updateUnit(u, dt) {
    for (const k in u.status) if (u.status[k] > 0) u.status[k] -= dt;
    u.cd -= dt; u.acd -= dt; u.attackAnim = Math.max(0, u.attackAnim - dt); u.hitT = Math.max(0, u.hitT - dt);
    const hero = this.hero(u.side);
    if (u.def.morale < 500) {
      if (hero?.alive && Math.hypot(hero.x - u.x, hero.z - u.z) < 6) u.morale = Math.min(u.def.morale, u.morale + 6 * dt);
      else u.morale = Math.min(u.def.morale, u.morale + 1.5 * dt);
      if (u.morale <= 0 && u.routing <= 0) { u.routing = 6; this.stats.routs[u.side]++; this.events.push({ e: 'rout', id: u.id }); u.order = { type: 'hold' }; u.target = null; }
    }
    if (u.routing > 0) {
      u.routing -= dt;
      const homeZ = u.side === 'ember' ? 18 : -2;
      this.moveToward(u, u.x, homeZ, dt, 1.15);
      if (u.routing <= 0) { u.morale = u.def.morale * 0.45; u.order = { type: 'hold' }; }
      return;
    }
    // choose target
    let t = u.target && u.target.alive && u.target.status.smoke <= 0 ? u.target : null;
    if (u.order.type === 'attack' && !t) { u.order = { type: 'hold' }; }
    const aggro = u.def.range + (u.order.type === 'move' && !u.order.amove ? -99 : 4);
    if (!t && aggro > 0) { t = this.nearestEnemy(u, aggro); if (t) u.target = t; }
    if (t) {
      const d = Math.hypot(t.x - u.x, t.z - u.z);
      const reach = u.def.range + (u.def.range < 3 ? 0.35 : 0);
      if (d <= reach) {
        u.moving = false;
        u.facing = turnToward(u.facing, Math.atan2(t.z - u.z, t.x - u.x), dt * 8);
        if (u.cd <= 0) {
          u.cd = u.def.rate * (0.9 + this.rand() * 0.2);
          u.attackAnim = 0.6;
          this.events.push({ e: 'attack', id: u.id, target: t.id });
          if (u.def.range > 3) this.shoot(u, t);
          else this.damage(u, t, u.def.dmg);
        }
        return;
      }
      if (u.status.shield > 0 && u.order.type !== 'move') return;
      this.pathTo(u, t.x, t.z, dt);
      return;
    }
    if (u.order.type === 'move') {
      const d = Math.hypot(u.order.x - u.x, u.order.z - u.z);
      if (d < 0.35) { u.order = { type: 'hold' }; u.moving = false; return; }
      this.pathTo(u, u.order.x, u.order.z, dt);
      return;
    }
    u.moving = false;
  }

  pathTo(u, x, z, dt) {
    u.pathT -= dt;
    const from = this.cellAt(u.x, u.z), to = this.cellAt(x, z);
    if (!from || !to) { this.moveToward(u, x, z, dt); return; }
    if (from === to) { this.moveToward(u, x, z, dt); return; }
    if (!u.path || u.pathT <= 0 || u.pathGoal !== to) {
      u.path = this.grid.path(from, to, (c) => (TERRAIN[c.type].pass ? TERRAIN[c.type].move + (c.burn > 0 ? 6 : 0) : Infinity));
      u.pathGoal = to; u.pathT = 1 + this.rand() * 0.5;
    }
    if (!u.path || u.path.length < 2) { this.moveToward(u, x, z, dt); return; }
    // drop reached waypoints
    while (u.path.length > 1 && this.cellAt(u.x, u.z) === u.path[0]) u.path.shift();
    const next = u.path[0] === to ? { x, z } : u.path[0];
    this.moveToward(u, next.x, next.z, dt);
  }

  moveToward(u, x, z, dt, mul = 1) {
    const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { u.moving = false; return; }
    const c = this.cellAt(u.x, u.z);
    let sp = u.def.speed * mul * (c ? 1 / Math.max(0.6, TERRAIN[c.type].move) : 1);
    if (u.status.shield > 0) sp *= 0.4;
    if (u.status.smoke > 0) sp *= 1.2;
    const step = Math.min(d, sp * dt);
    const nx = u.x + (dx / d) * step, nz = u.z + (dz / d) * step;
    if (this.passable(nx, nz)) { u.x = nx; u.z = nz; }
    else if (this.passable(nx, u.z)) u.x = nx;
    else if (this.passable(u.x, nz)) u.z = nz;
    u.facing = turnToward(u.facing, Math.atan2(dz, dx), dt * 7);
    u.moving = true;
  }

  separate() {
    const us = this.units.filter((u) => u.alive);
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.62;
      if (d < min && d > 1e-4) {
        const push = (min - d) * 0.5, px = (dx / d) * push, pz = (dz / d) * push;
        const wa = a.status.shield > 0 ? 0.2 : 1, wb = b.status.shield > 0 ? 0.2 : 1;
        if (this.passable(a.x - px * wa, a.z - pz * wa)) { a.x -= px * wa; a.z -= pz * wa; }
        if (this.passable(b.x + px * wb, b.z + pz * wb)) { b.x += px * wb; b.z += pz * wb; }
      }
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.t < 0) continue;
      const f = Math.min(1, p.t / p.dur);
      p.f = f;
      if (p.kind === 'fireball') {
        p.x = p.sx + (p.tx - p.sx) * f; p.z = p.sz + (p.tz - p.sz) * f;
        if (f >= 1) {
          p.done = true;
          this.events.push({ e: 'explode', x: p.tx, z: p.tz, r: p.aoe });
          const src = this.units.find((u) => u.id === p.from) || { side: p.side, x: p.tx, z: p.tz, status: {}, vet: 0, type: 'pyromancer', def: UNITS.pyromancer, dmgDealt: 0, kills: 0, facing: 0 };
          for (const u of this.units) if (u.alive && u.side !== p.side && Math.hypot(u.x - p.tx, u.z - p.tz) < p.aoe) this.damage(src, u, p.dmg * (1 - Math.hypot(u.x - p.tx, u.z - p.tz) / (p.aoe * 1.6)), { aoe: true });
          for (const c of this.grid) if (Math.hypot(c.x - p.tx, c.z - p.tz) < p.aoe + 0.6) this.ignite(c);
        }
        continue;
      }
      const t = this.units.find((u) => u.id === p.target);
      if (t && t.alive) { p.tx = t.x; p.tz = t.z; }
      p.x = p.sx + (p.tx - p.sx) * f; p.z = p.sz + (p.tz - p.sz) * f;
      if (f >= 1) {
        p.done = true;
        const src = this.units.find((u) => u.id === p.from);
        if (t && t.alive && src) {
          const c = this.cellAt(t.x, t.z);
          const miss = c && c.type === 'forest' ? 0.25 : 0.06;
          if (this.rand() > miss) this.damage(src, t, src.def.dmg * (p.mult || 1), { ranged: true });
          else this.events.push({ e: 'miss', x: t.x, z: t.z });
        }
      }
    }
    if (this.projectiles.some((p) => p.done)) this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  checkEnd(dt) {
    const alive = { ember: 0, ash: 0 };
    for (const u of this.units) if (u.alive && u.routing <= 0) alive[u.side]++;
    // objective: hold the banner hex alone
    const b = this.field.banner;
    for (const side of ['ember', 'ash']) {
      const mine = this.units.some((u) => u.alive && u.side === side && Math.hypot(u.x - b.x, u.z - b.z) < 1.6);
      const theirs = this.units.some((u) => u.alive && u.side !== side && Math.hypot(u.x - b.x, u.z - b.z) < 3.2);
      if (mine && !theirs && this.t > HOLD_DELAY) this.hold[side] += dt; else this.hold[side] = Math.max(0, this.hold[side] - dt * 0.5);
    }
    const end = (w, reason) => { this.over = true; this.winner = w; this.reason = reason; this.events.push({ e: 'end', winner: w, reason }); };
    if (!alive.ash && !alive.ember) return end('ash', 'Both armies broke. The ash settles over an empty field.');
    if (!alive.ash) return end('ember', 'The Legion is destroyed.');
    if (!alive.ember) return end('ash', 'Your army is broken.');
    if (this.hold.ember >= HOLD) return end('ember', 'You hold the banner hill.');
    if (this.hold.ash >= HOLD) return end('ash', 'The Legion holds the banner hill.');
    if (this.t >= TIME_LIMIT) {
      const v = (s) => this.units.filter((u) => u.alive && u.side === s).reduce((a, u) => a + (u.def.cost || 120) * (u.hp / u.maxHp), 0);
      return end(v('ember') >= v('ash') ? 'ember' : 'ash', 'Night falls on a stalemate. The side with more strength claims the field.');
    }
  }

  summary() {
    const val = (s) => this.units.filter((u) => u.alive && u.side === s).reduce((a, u) => a + (u.def.cost || 120) * (u.hp / u.maxHp), 0);
    return { winner: this.winner, reason: this.reason, t: this.t, left: { ember: val('ember'), ash: val('ash') }, start: this.stats.valueStart, stats: this.stats };
  }
}

function turnToward(a, b, k) { const d = angDiff(b, a); return a + Math.max(-k, Math.min(k, d)); }

// Deployment helpers: convert a deployment layout (lane + depth per unit) into positions in the side's rows.
export function deployPositions(field, side, layout) {
  const rows = field.deploy[side];
  const out = [];
  for (const l of layout) {
    const col = Math.max(0, Math.min(COLS - 1, Math.round(l.col)));
    const row = side === 'ember' ? rows[0] + Math.min(2, l.depth) : rows[2] - Math.min(2, l.depth);
    const c = field.cell(col, row);
    let target = c;
    if (!TERRAIN[c.type].pass) target = [...field.grid].find((x) => x.row === row && TERRAIN[x.type].pass);
    out.push({ ...l, x: target.x + (l.jx || 0), z: target.z + (l.jz || 0) });
  }
  return out;
}
export { ROWS, COLS, DIRS };
