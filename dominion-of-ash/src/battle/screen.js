import * as THREE from 'three';
import { Battle, DT, HOLD, deployPositions } from './sim.js';
import { makeBattlefield, RECIPES, TERRAIN, COLS } from './maps.js';
import { Commander, PLANS } from '../ai/tactics.js';
import { choosePlan, chooseArmy, commanderOpts, learn, taunt, skillOf } from '../ai/rival.js';
import { BattleWorld } from '../render/world.js';
import { UnitViews } from '../render/units.js';
import { FX } from '../render/fx.js';
import { UNITS } from '../data/units.js';
import { icon, UNIT_ICON } from '../ui/icons.js';
import { haptic } from '../platform.js';
import { Atmosphere } from '../render/look.js';

const FORMATIONS = {
  line: { name: 'Battle line', lanes: { melee: 'center', ranged: 'center', caster: 'center', flanker: 'center', hero: 'center' } },
  left: { name: 'Weight left', lanes: { melee: 'left', ranged: 'center', caster: 'center', flanker: 'left', hero: 'left' } },
  right: { name: 'Weight right', lanes: { melee: 'right', ranged: 'center', caster: 'center', flanker: 'right', hero: 'right' } },
  wide: { name: 'Wide wings', lanes: { melee: 'split', ranged: 'center', caster: 'center', flanker: 'wide', hero: 'center' } },
};

// One battle: deployment, live control, the Ashen King's commander, and the learning step at the end.
export class BattleScreen {
  // opts: { recipe, night, seed, army:[{type, vet, hp, index}], budget, mods, perks:[], title, subtitle, onEnd(result) }
  constructor(app, opts) {
    this.app = app; this.o = opts; this.stage = app.stage; this.brain = app.save.brain;
    const recipe = { ...RECIPES[opts.recipe || 'plains'], night: !!opts.night, seed: opts.seed };
    this.field = makeBattlefield(recipe, opts.seed ?? Math.floor(Math.random() * 1e6));
    this.stage.setMood(this.field.night);
    this.world = new BattleWorld(this.stage.scene, this.field);
    this.views = new UnitViews(this.stage.scene, this.world);
    this.fx = new FX(this.stage.scene, this.world);
    this.stage.onResize = (px) => { this.fx.setScale(px); this.air?.setScale(px); };
    this.fx.setScale(this.stage.renderer.domElement.height);
    this.stage.addClouds(28, 8);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of this.field.grid) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z); }
    this.bounds = { x0, x1, z0, z1 };
    this.air = new Atmosphere(this.world.group, { x0: x0 - 4, x1: x1 + 4, z0: z0 - 4, z1: z1 + 2 }, this.field.night ? 'night' : 'ash');
    this.air.setScale(this.stage.renderer.domElement.height);
    this.stage.frame(this.bounds, 24);
    this.stage.rig.yaw = 0; this.stage.rig.tz = z0 + 4; this.stage.rig.dist = 30;
    this.camGoal = { tz: z1 - 1.5, dist: 17, t: 0 };
    this.stage.rig.tx -= innerWidth < 900 ? 4 : 2.5; // keep your deployment clear of the side panel
    // the rival chooses before seeing where you stand
    const { plan, ctx } = choosePlan(this.brain);
    this.plan = plan; this.ctx = ctx;
    this.playerTypes = opts.army.map((a) => a.type);
    let ashTypes = chooseArmy(this.brain, opts.budget, this.playerTypes);
    if (!opts.mods?.noKing) ashTypes = ['ashking', ...ashTypes];
    this.ashTypes = ashTypes;
    this.ai = new Commander(null, 'ash', plan, commanderOpts(this.brain));
    this.formation = 'line';
    this.selected = new Set(); this.phase = 'deploy'; this.speed = 1; this.slowmo = 0; this.amove = true; this.targeting = null;
    this.buildBattle();
    this.taunt = taunt(this.brain);
    this.buildHud();
    this.bindInput();
    app.audio.horn(true);
  }

  // ---------------- setup ----------------
  layoutFor(formation) {
    const pc = new Commander(null, 'ember', { lanes: FORMATIONS[formation].lanes, aggression: 0.5 });
    return deployPositions(this.field, 'ember', pc.layout(this.playerTypes));
  }
  buildBattle() {
    const ember = this.layoutFor(this.formation).map((p, i) => ({ ...p, vet: this.o.army[i].vet || 0, uid: i }));
    const ash = deployPositions(this.field, 'ash', this.ai.layout(this.ashTypes));
    if (this.o.mods?.ambush) for (const a of ash) a.z += 5.2;
    if (this.o.perks?.includes('vanguard')) for (const e of ember) e.z -= 2.6;
    this.battle = new Battle(this.field, { ember, ash }, { seed: (this.o.seed ?? 1) * 31 + 7 });
    this.ai.b = this.battle;
    for (const u of this.battle.units) {
      if (u.side !== 'ember') continue;
      const src = this.o.army[u.uid];
      if (src?.hp != null && src.hp < 1) u.hp = u.maxHp * Math.max(0.3, src.hp);
      const perks = this.o.perks || [];
      if (perks.includes('discipline')) u.morale *= 1.3;
      if (perks.includes('banners')) u.dmgMul = 1.08;
      if (perks.includes('firestorm') && u.type === 'pyromancer') u.aoeMul = 1.2;
    }
    this.reinforced = false;
  }
  applyFormation(f) {
    this.formation = f;
    const pos = this.layoutFor(f);
    const vg = this.o.perks?.includes('vanguard') ? 2.6 : 0;
    for (const u of this.battle.units) if (u.side === 'ember') { const p = pos[u.uid]; u.x = p.x; u.z = p.z - vg; }
    this.app.audio.order(); haptic('light');
    this.renderDeploy();
  }

  // ---------------- HUD ----------------
  buildHud() {
    const el = document.createElement('div'); el.className = 'battle-hud';
    el.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <button class="rb" data-a="pause" aria-label="Pause">${icon('pause')}</button>
          <button class="rb fight-only" data-a="speed" aria-label="Speed">${icon('fast')}<b>1×</b></button>
          <button class="rb fight-only" data-a="slow" aria-label="Tactical slow motion">${icon('slow')}</button>
        </div>
        <div class="hud-center">
          <div class="strength"><i class="s-e"></i><i class="s-a"></i></div>
          <div class="holds"><span class="h-e"><i></i></span>${icon('flag')}<span class="h-a"><i></i></span></div>
          <div class="clock"></div>
        </div>
        <div class="hud-right"><div class="rival">${icon('crown')}<div><b>The Ashen King</b><small class="rival-plan">Battle ${this.brain.battles + 1} · skill ${Math.round(skillOf(this.brain) * 100)}%</small></div></div></div>
      </div>
      <div class="taunt"><span>“${this.taunt}”</span></div>
      <div class="toast"></div>
      <div class="deploy-panel">
        <div class="dp-title"><b>${this.o.title || 'Deploy your army'}</b><small>${this.o.subtitle || ''}</small></div>
        <div class="forms">${Object.entries(FORMATIONS).map(([k, f]) => `<button class="chip" data-f="${k}">${f.name}</button>`).join('')}</div>
        <small class="hint">Pick a formation, or tap a soldier and then a blue hex to place them.</small>
        <button class="big" data-a="fight">${icon('swords')} Sound the horn</button>
      </div>
      <div class="cmd fight-only">
        <div class="groups">
          <button class="rb" data-g="all">${icon('all')}<span>All</span></button>
          <button class="rb" data-g="melee">${icon('sword')}<span>Line</span></button>
          <button class="rb" data-g="ranged">${icon('bow')}<span>Shooters</span></button>
        </div>
        <div class="cards"></div>
        <div class="orders">
          <button class="rb mode" data-a="amove">${icon('charge')}<span>Charge</span></button>
          <button class="rb" data-a="halt">${icon('stop')}<span>Halt</span></button>
          <button class="rb ability" data-a="ability">${icon('star')}<span>Ability</span><i class="cd"></i></button>
        </div>
      </div>
      <div class="end-card hidden"></div>
      <div class="pause-card hidden">
        <h2>Paused</h2>
        <button class="big" data-a="resume">${icon('play')} Resume</button>
        <button class="ghost" data-a="retreat">${icon('back')} Retreat (counts as a defeat)</button>
      </div>`;
    this.app.ui.appendChild(el); this.hud = el;
    this.cardsEl = el.querySelector('.cards');
    this.cardsEl.innerHTML = this.battle.units.filter((u) => u.side === 'ember').map((u) => `
      <button class="ucard" data-id="${u.id}">${icon(UNIT_ICON[u.type])}<span class="nm">${u.def.name}</span>${u.vet ? `<span class="vet">${'★'.repeat(u.vet)}</span>` : ''}<i class="hp"><b></b></i><i class="acd"></i></button>`).join('');
    el.addEventListener('click', (e) => this.onHudClick(e));
    this.hud.classList.add('deploying');
    this.renderDeploy();
    setTimeout(() => el.querySelector('.taunt')?.classList.add('show'), 600);
    setTimeout(() => el.querySelector('.taunt')?.classList.remove('show'), 5200);
  }
  renderDeploy() { for (const b of this.hud.querySelectorAll('[data-f]')) b.classList.toggle('on', b.dataset.f === this.formation); }

  onHudClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    this.app.audio.tap();
    if (b.dataset.f) return this.applyFormation(b.dataset.f);
    if (b.dataset.g) return this.selectGroup(b.dataset.g);
    if (b.classList.contains('ucard')) {
      const id = +b.dataset.id;
      const now = performance.now();
      if (this.lastCard === id && now - this.lastCardT < 350) { const u = this.unit(id); if (u) { this.stage.rig.tx = u.x; this.stage.rig.tz = u.z + 3; } }
      this.lastCard = id; this.lastCardT = now;
      if (this.selected.has(id) && this.selected.size > 1) this.selected = new Set([id]);
      else if (this.selected.has(id)) this.selected.clear(); else this.selected.add(id);
      return this.refreshSelection();
    }
    switch (b.dataset.a) {
      case 'fight': return this.begin();
      case 'pause': return this.setPaused(true);
      case 'resume': return this.setPaused(false);
      case 'retreat': this.setPaused(false); return this.finish(true);
      case 'speed': this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1; b.querySelector('b').textContent = `${this.speed === 0.5 ? '½' : this.speed}×`; return;
      case 'slow': this.slowmo = this.slowmo ? 0 : 1; b.classList.toggle('on', !!this.slowmo); return;
      case 'amove': this.amove = !this.amove; b.querySelector('span').textContent = this.amove ? 'Charge' : 'March'; b.innerHTML = `${icon(this.amove ? 'charge' : 'march')}<span>${this.amove ? 'Charge' : 'March'}</span>`; this.toast(this.amove ? 'Charge: units fight anything they meet on the way.' : 'March: units ignore enemies until they arrive.'); return;
      case 'halt': this.battle.order([...this.selected], { type: 'hold' }); this.app.audio.order(); return;
      case 'ability': return this.triggerAbility();
      case 'continue': return this.o.onEnd?.(this.result);
    }
  }

  toast(text, cls = '') {
    const t = this.hud.querySelector('.toast'); t.textContent = text; t.className = `toast show ${cls}`;
    clearTimeout(this._toast); this._toast = setTimeout(() => t.classList.remove('show'), 2600);
  }

  setPaused(p) { this.paused = p; this.hud.querySelector('.pause-card').classList.toggle('hidden', !p); }

  unit(id) { return this.battle.units.find((u) => u.id === id); }
  selectGroup(g) {
    const mine = this.battle.units.filter((u) => u.alive && u.side === 'ember');
    const pick = mine.filter((u) => g === 'all' || (g === 'melee' ? ['melee', 'hero', 'flanker'].includes(u.def.role) : ['ranged', 'caster'].includes(u.def.role)));
    this.selected = new Set(pick.map((u) => u.id));
    this.refreshSelection();
  }
  refreshSelection() {
    for (const id of [...this.selected]) { const u = this.unit(id); if (!u || !u.alive) this.selected.delete(id); }
    for (const c of this.cardsEl.children) c.classList.toggle('sel', this.selected.has(+c.dataset.id));
    const abil = this.abilityUnits();
    const ab = this.hud.querySelector('.ability');
    ab.classList.toggle('hidden', !abil.length);
    if (abil.length) ab.querySelector('span').textContent = abil[0].def.ability.name;
  }
  abilityUnits() {
    const us = [...this.selected].map((id) => this.unit(id)).filter((u) => u && u.alive && u.def.ability);
    if (!us.length) return [];
    // the most common ability among the selection
    const n = {}; for (const u of us) n[u.def.ability.id] = (n[u.def.ability.id] || 0) + 1;
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
    return us.filter((u) => u.def.ability.id === top);
  }
  triggerAbility() {
    if (this.phase !== 'fight') return;
    const us = this.abilityUnits().filter((u) => u.acd <= 0 && u.routing <= 0);
    if (!us.length) { this.toast('Not ready yet.'); return; }
    if (us[0].def.ability.id === 'fireball') { this.targeting = us; this.hud.classList.add('targeting'); this.toast('Tap where the fire should land.', 'gold'); return; }
    for (const u of us) this.battle.useAbility(u.id);
    haptic('medium');
  }

  // ---------------- input ----------------
  bindInput() {
    const cv = this.stage.renderer.domElement;
    const pts = new Map(); let pan = false, start = null, pinch = null;
    const down = (e) => {
      this.camGoal = null; // the player takes the camera
      cv.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now() }; pan = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; pan = true; }
    };
    const move = (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        if (!pan && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 9) pan = true;
        if (pan) this.stage.pan(dx, dy);
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        this.stage.zoom(pinch.d / Math.max(1, d)); let da = ang - pinch.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        this.stage.rotate(-da); pinch = { d, ang };
      }
    };
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) { if (!pan && start) this.tap(e.clientX, e.clientY); pinch = null; }
    };
    const wheel = (e) => { e.preventDefault(); if (e.ctrlKey || !e.shiftKey) this.stage.zoom(e.deltaY > 0 ? 1.08 : 0.93); else this.stage.rotate(e.deltaY * 0.002); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    this.unbind = () => { cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); };
  }

  tap(cx, cy) {
    if (this.over || this.paused) return;
    const p = this.stage.ground(cx, cy, this.world.terrainMeshes);
    const hit = this.views.pick(this.stage.raycaster);
    if (this.targeting) {
      for (const u of this.targeting) this.battle.useAbility(u.id, { x: p.x, z: p.z });
      this.targeting = null; this.hud.classList.remove('targeting'); this.fx.ring(p.x, p.z, 0xff8a3a, 2.4, 0.4, 0.5); haptic('medium'); return;
    }
    if (this.phase === 'deploy') {
      if (hit && hit.side === 'ember') { this.selected = new Set([hit.id]); this.refreshSelection(); return; }
      const c = this.field.grid.at(p.x, p.z);
      const minRow = this.o.perks?.includes('vanguard') ? 11 : 12;
      if (c && c.row >= minRow && TERRAIN[c.type].pass && this.selected.size) {
        const ids = [...this.selected];
        ids.forEach((id, i) => { const u = this.unit(id); u.x = c.x + (i % 3 - 1) * 0.7; u.z = c.z + Math.floor(i / 3) * 0.7; });
        this.fx.marker(c.x, c.z); this.app.audio.order(); this.selected.clear(); this.refreshSelection();
      }
      return;
    }
    if (hit && hit.side === 'ember') {
      const now = performance.now();
      if (this.lastHit === hit.id && now - this.lastHitT < 380) { for (const u of this.battle.units) if (u.alive && u.side === 'ember' && u.type === hit.type) this.selected.add(u.id); }
      else this.selected = new Set([hit.id]);
      this.lastHit = hit.id; this.lastHitT = now;
      this.refreshSelection(); haptic('light'); return;
    }
    if (!this.selected.size) return;
    const ids = [...this.selected];
    if (hit && hit.side === 'ash') {
      this.battle.order(ids, { type: 'attack', target: hit });
      this.fx.ring(hit.x, hit.z, 0xff5a3a, 1.2, 0.5, 0.4);
    } else {
      // formation move: melee in front (toward the enemy, -z), shooters behind
      const us = ids.map((id) => this.unit(id)).filter(Boolean).sort((a, b) => (a.def.range > 3) - (b.def.range > 3));
      const perRow = Math.min(5, Math.max(2, Math.ceil(us.length / 2)));
      const yaw = this.stage.rig.yaw, fx = Math.cos(yaw), fz = -Math.sin(yaw);
      us.forEach((u, i) => {
        const row = Math.floor(i / perRow), col = i % perRow - (Math.min(perRow, us.length - row * perRow) - 1) / 2;
        const ox = col * 1.25 * fx + row * 1.3 * Math.sin(yaw), oz = col * 1.25 * fz + row * 1.3 * Math.cos(yaw);
        this.battle.order([u.id], { type: 'move', x: p.x + ox, z: p.z + oz, amove: this.amove });
      });
      this.fx.marker(p.x, p.z, this.amove ? 0xffb46a : 0x9ad0ff);
    }
    this.app.audio.order(); haptic('light');
  }

  // ---------------- flow ----------------
  begin() {
    if (this.phase !== 'deploy') return;
    this.phase = 'fight';
    const st = this.battle.stats;
    st.deployX.ember = []; for (const u of this.battle.units) { if (u.side === 'ember') st.deployX.ember.push(u.x); st.startZ[u.id] = u.z; }
    this.world.deployMarks.visible = false;
    this.hud.classList.remove('deploying');
    this.selected.clear(); this.refreshSelection();
    this.app.audio.horn(); haptic('heavy');
    this.toast('Battle joined. Tap your soldiers to command them.', 'gold');
    if (this.o.mods?.wildfire) setTimeout(() => { for (const c of this.field.grid) if (c.type === 'forest' && c.row > 4 && c.row < 10 && Math.random() < 0.3) this.battle.ignite(c); }, 9000);
  }

  step(dt, time) {
    if (this.camGoal) {
      const g = this.camGoal; g.t += dt;
      const k = Math.min(1, g.t / 3), e = k * k * (3 - 2 * k);
      const f = 1 - Math.exp(-dt * (1 + 5 * e)); this.stage.rig.tz += (g.tz - this.stage.rig.tz) * f; this.stage.rig.dist += (g.dist - this.stage.rig.dist) * f;
      if (k >= 1 && Math.abs(g.tz - this.stage.rig.tz) < 0.3) this.camGoal = null;
    }
    const b = this.battle;
    if (this.phase === 'fight' && !this.paused && !b.over) {
      let rate = this.speed * (this.slowmo ? 0.35 : 1) * (this.cine > 0 ? 0.3 : 1);
      this.cine = Math.max(0, (this.cine || 0) - dt);
      this.acc = (this.acc || 0) + dt * rate;
      let n = 0;
      while (this.acc >= DT && n++ < 10) {
        this.acc -= DT; this.ai.tick(DT); b.step();
        if (this.o.mods?.reinforce && !this.reinforced && b.t > 60) this.reinforce();
        for (const e of b.events) this.onEvent(e);
        b.events.length = 0;
      }
      if (b.over && !this.over) setTimeout(() => this.finish(false), 1800);
    }
    // visibility: the Legion is hidden while you deploy (unless you have scouts)
    const hideAsh = this.phase === 'deploy' && !this.o.perks?.includes('scouts');
    this.views.sync(b, this.phase === 'fight' && !this.paused ? dt * this.speed * (this.slowmo ? 0.35 : 1) * (this.cine > 0 ? 0.3 : 1) : dt * 0.5, this.stage.camera, this.selected);
    for (const v of this.views.views.values()) if (v.u.side === 'ash') v.root.visible = !hideAsh && !(v.deadT > 14);
    this.world.sync(b); this.world.animate(time, this.stage.sunDir);
    this.air.update(dt, time);
    this.fx.update(b, dt * (this.phase === 'fight' && !this.paused ? this.speed : 0.2), time);
    if (this.fx.shake) { this.stage.rig.shake = Math.max(this.stage.rig.shake, this.fx.shake); this.fx.shake = 0; }
    this.updateHud();
    // audio intensity from how many are fighting
    const fighting = b.units.filter((u) => u.alive && u.attackAnim > 0).length;
    this.app.audio.update(dt, this.phase === 'fight' ? Math.min(1, 0.2 + fighting / 10) : 0.05, this.field.night);
  }

  reinforce() {
    this.reinforced = true;
    for (const [i, t] of this.o.mods.reinforce.entries()) {
      const c = this.field.cell(2 + (i * 2) % 7, 0);
      this.battle.spawn(t, 'ash', c.x, c.z, { raised: false });
    }
    this.toast('Legion reinforcements pour onto the field!', 'red'); this.app.audio.horn(true); haptic('warn');
  }

  onEvent(e) {
    const b = this.battle;
    if (e.e === 'attack') { const u = this.unit(e.id); if (u) e.ranged = u.def.range > 3; }
    if (e.e === 'hit') { const s = this.unit(e.by); e.ranged = s && s.def.range > 3; }
    if (e.e === 'death') { const u = this.unit(e.id); e.bones = u?.side === 'ash'; if (u?.side === 'ember') haptic('light'); }
    this.fx.onEvent(e, b);
    this.app.audio.onEvent(e);
    if (e.e === 'herofall') {
      this.cine = 1.6; haptic('heavy');
      this.toast(e.side === 'ash' ? 'The Ashen King falls! His thralls crumble.' : 'Your Commander has fallen! The army wavers.', e.side === 'ash' ? 'gold' : 'red');
      if (e.side === 'ash') this.views.cheer('ember');
    }
    if (e.e === 'rout') { const u = this.unit(e.id); if (u?.side === 'ember') this.toast(`${u.def.name} is fleeing!`, 'red'); }
    if (e.e === 'explode') haptic('medium');
    if (e.e === 'ability') { const u = this.unit(e.id); if (u?.side === 'ash' && ['wail', 'raise'].includes(e.ab)) this.toast(e.ab === 'wail' ? 'The Ashen King wails. Your soldiers falter.' : 'The dead rise again.', 'red'); }
  }

  updateHud() {
    const b = this.battle, h = this.hud;
    const val = (s) => b.units.filter((u) => u.alive && u.side === s).reduce((a, u) => a + (u.def.cost || 120) * (u.hp / u.maxHp), 0);
    const e = val('ember'), a = val('ash'), t = e + a || 1;
    h.querySelector('.s-e').style.width = `${(e / t) * 100}%`; h.querySelector('.s-a').style.width = `${(a / t) * 100}%`;
    h.querySelector('.h-e i').style.width = `${(b.hold.ember / HOLD) * 100}%`; h.querySelector('.h-a i').style.width = `${(b.hold.ash / HOLD) * 100}%`;
    const rem = Math.max(0, 300 - b.t); h.querySelector('.clock').textContent = this.phase === 'deploy' ? 'Deploy' : `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
    for (const c of this.cardsEl.children) {
      const u = this.unit(+c.dataset.id); if (!u) continue;
      c.classList.toggle('dead', !u.alive); c.classList.toggle('rout', u.routing > 0);
      c.querySelector('.hp b').style.width = `${Math.max(0, u.hp / u.maxHp) * 100}%`;
      const ab = u.def.ability; c.querySelector('.acd').style.height = ab && u.acd > 0 ? `${Math.min(1, u.acd / ab.cd) * 100}%` : '0%';
      c.classList.toggle('ready', !!ab && u.acd <= 0 && u.alive);
    }
    const abil = this.abilityUnits();
    if (abil.length) { const best = Math.min(...abil.map((u) => u.acd)); const ab = h.querySelector('.ability'); ab.classList.toggle('ready', best <= 0); ab.querySelector('.cd').style.height = best > 0 ? `${Math.min(1, best / abil[0].def.ability.cd) * 100}%` : '0%'; }
    if (this.selected.size && [...this.selected].some((id) => !this.unit(id)?.alive)) this.refreshSelection();
  }

  finish(retreat) {
    if (this.over) return; this.over = true;
    const b = this.battle;
    if (retreat && !b.over) { b.over = true; b.winner = 'ash'; b.reason = 'You sounded the retreat.'; }
    const s = b.summary();
    const won = s.winner === 'ember';
    const before = JSON.stringify((this.brain.notes || []).map((n) => n.text));
    learn(this.brain, { summary: s, plan: this.plan, ctx: this.ctx, playerArmy: this.playerTypes, night: this.field.night, playerWon: won });
    const newNotes = (this.brain.notes || []).filter((n) => !before.includes(n.text));
    const mine = b.units.filter((u) => u.side === 'ember' && u.uid != null);
    const survivors = mine.filter((u) => u.alive).map((u) => ({ index: u.uid, kills: u.kills, hp: u.hp / u.maxHp }));
    const lost = mine.length - survivors.length;
    const heroAlive = mine.some((u) => u.def.hero && u.alive) || !mine.some((u) => u.def.hero);
    this.result = { won, survivors, lost, heroAlive, time: s.t, reason: s.reason, kills: s.stats.kills.ember };
    this.app.persist();
    won ? this.app.audio.victory() : this.app.audio.defeat();
    haptic(won ? 'success' : 'warn');
    this.views.cheer(won ? 'ember' : 'ash');
    const card = this.hud.querySelector('.end-card');
    const notes = (this.brain.notes || []).slice(0, 4);
    const stars = this.o.stars ? this.o.stars(this.result) : null;
    card.innerHTML = `
      <div class="end-inner ${won ? 'win' : 'loss'}">
        <h1>${won ? 'Victory' : 'Defeat'}</h1>
        <p class="reason">${s.reason}</p>
        ${stars != null ? `<div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div>` : ''}
        <div class="end-stats">
          <div><b>${s.stats.kills.ember}</b><small>Legion slain</small></div>
          <div><b>${lost}</b><small>Your losses</small></div>
          <div><b>${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}</b><small>Duration</small></div>
        </div>
        <div class="ledger-box">
          <h3>${icon('book')} The Ashen King’s ledger</h3>
          <p class="plan">His plan was <b>${PLANS[this.plan].name.toLowerCase()}</b>.</p>
          ${notes.map((n) => `<p class="${newNotes.includes(n) ? 'new' : ''}">${newNotes.includes(n) ? '<em>New</em> ' : ''}${n.text}</p>`).join('') || '<p>He is still watching. He has not drawn any conclusions yet.</p>'}
        </div>
        <button class="big" data-a="continue">${icon('march')} Continue</button>
      </div>`;
    card.classList.remove('hidden');
  }

  dispose() {
    this.unbind?.(); this.hud.remove();
    this.views.dispose(); this.fx.dispose(); this.world.dispose();
    this.stage.onResize = null;
  }
}
