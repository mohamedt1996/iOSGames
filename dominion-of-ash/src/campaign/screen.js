import { Campaign, REGION, PERKS } from './campaign.js';
import { MapView } from './mapview.js';
import { UNITS, ROSTER } from '../data/units.js';
import { icon, UNIT_ICON } from '../ui/icons.js';
import { haptic } from '../platform.js';

// The war map: move your army, recruit, weather events and answer the Legion.
export class CampaignScreen {
  constructor(app) {
    this.app = app; this.c = new Campaign(app.save.campaign);
    const st = app.stage;
    st.setMood(this.c.isNight());
    this.view = new MapView(st.scene, this.c);
    st.addClouds(22, 10);
    st.frame({ x0: this.view.bounds.x0 + 2, x1: this.view.bounds.x1 - 2, z0: this.view.bounds.z0 + 1, z1: this.view.bounds.z1 - 3 }, 20);
    const ar = this.c.armyRegion(); st.rig.tx = ar.x; st.rig.tz = ar.z + 2; st.rig.yaw = 0; st.rig.minD = 8; st.rig.maxD = 34;
    this.build(); this.bindInput(); this.refresh();
    this.queueModals();
  }

  build() {
    const el = document.createElement('div'); el.className = 'camp-hud';
    el.innerHTML = `
      <div class="hud-top">
        <div class="hud-left"><button class="rb" data-a="menu">${icon('back')}</button><div class="pill turn"></div></div>
        <div class="hud-center"><div class="pill gold"></div></div>
        <div class="hud-right"><button class="rb" data-a="army">${icon('shield')}<span>Army</span></button><button class="rb" data-a="ledger">${icon('book')}<span>Ledger</span></button></div>
      </div>
      <div class="labels"></div>
      <div class="info hidden"></div>
      <div class="bottom-right"><button class="big end" data-a="end">${icon('hourglass')} End turn</button></div>
      <div class="log"></div>
      <div class="modal hidden"></div>`;
    this.app.ui.appendChild(el); this.hud = el;
    el.addEventListener('click', (e) => this.onClick(e));
  }

  refresh() {
    const c = this.c, s = c.s;
    this.view.sync();
    this.hud.querySelector('.turn').innerHTML = `Turn ${s.turn}${c.isNight() ? ' · <b class="night">Night</b>' : ''}`;
    this.hud.querySelector('.gold').innerHTML = `${icon('coin')} ${s.gold} <small>+${c.income()}/turn</small>`;
    this.hud.querySelector('.log').innerHTML = s.log.slice(0, 3).map((l) => `<p>${l}</p>`).join('');
    this.hud.querySelector('.end').disabled = s.over;
    this.app.stage.setMood(c.isNight());
    this.app.persist();
  }

  playerStrength() { return this.c.army.units.reduce((a, u) => a + UNITS[u.type].cost * (1 + u.vet * 0.15) * (u.hp ?? 1), 0) + 150; }

  showInfo(reg) {
    const c = this.c, info = this.hud.querySelector('.info');
    this.sel = reg; this.view.select(reg);
    if (!reg) { info.classList.add('hidden'); return; }
    const R = REGION[reg.type], band = c.bandAt(reg.q, reg.r), here = reg === c.armyRegion();
    const reach = c.reachable().includes(reg);
    const owner = reg.owner === 'ember' ? '<b class="blue">Emberlight</b>' : reg.owner === 'ash' ? '<b class="red">Ashen Legion</b>' : 'Unclaimed';
    let act = '';
    if (here && c.canRecruit()) act = `<button class="big" data-a="recruit">${icon('shield')} Recruit</button>`;
    else if (reach && (band || reg.type === 'citadel')) {
      const ratio = (band ? band.strength : 620 + c.s.turn * 12) / this.playerStrength();
      const odds = ratio < 0.7 ? 'Favourable' : ratio < 1.05 ? 'Even' : ratio < 1.4 ? 'Hard' : 'Desperate';
      act = `<p class="odds">Odds: <b class="${odds.toLowerCase()}">${odds}</b></p><button class="big red" data-a="attack">${icon('swords')} ${reg.type === 'citadel' && !band ? 'Storm the Citadel' : 'Attack'}</button>`;
    } else if (reach) act = `<button class="big" data-a="move">${icon('march')} March here</button>`;
    else if (!here && c.army.moves <= 0) act = '<p class="muted">Your army has marched this turn.</p>';
    info.innerHTML = `
      <h3>${R.name}</h3>
      <p>${owner}${R.income ? ` · ${icon('coin')} ${R.income}/turn` : ''}${R.recruit ? ' · recruits' : ''}${R.relic && !reg.relicTaken ? ' · ember relic' : ''}</p>
      ${band ? `<p class="band">${icon('skull')} ${band.name[0].toUpperCase() + band.name.slice(1)} · strength ${band.strength}</p>` : ''}
      ${R.recipe ? `<p class="muted">Battlefield: ${R.recipe}</p>` : ''}
      ${act}`;
    info.classList.remove('hidden');
  }

  onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    this.app.audio.tap();
    const c = this.c;
    switch (b.dataset.a) {
      case 'menu': return this.app.go('title');
      case 'ledger': return this.app.showLedger();
      case 'army': return this.armyModal();
      case 'move': { const r = c.move(this.sel.q, this.sel.r); haptic('light'); this.app.audio.order(); this.showInfo(null); this.refresh(); if (r?.battle) this.fight(r.battle); return; }
      case 'attack': { const r = c.move(this.sel.q, this.sel.r); this.showInfo(null); if (r?.battle) this.fight(r.battle); return; }
      case 'recruit': return this.recruitModal();
      case 'buy': { if (c.recruit(b.dataset.t)) { this.app.audio.coin(); haptic('light'); } this.refresh(); return this.recruitModal(); }
      case 'end': return this.endTurn();
      case 'close': this.closeModal(); return this.queueModals();
      case 'ev': c.applyEvent(b.dataset.c, this.app.save.brain); this.closeModal(); this.refresh(); return this.queueModals();
      case 'perk': c.choosePerk(b.dataset.p); this.app.audio.victory(); this.closeModal(); this.refresh(); return this.queueModals();
      case 'defend': this.closeModal(); return this.fight(this.pendingAttack);
      case 'newcamp': return this.app.newCampaign();
    }
  }

  endTurn() {
    const atk = this.c.endTurn(this.app.save.brain);
    this.app.audio.horn(true); haptic('medium');
    this.showInfo(null); this.refresh();
    if (atk) {
      this.pendingAttack = atk.battle;
      this.modal(`<h2>${icon('skull')} Ambush!</h2><p>${atk.battle.bandName[0].toUpperCase() + atk.battle.bandName.slice(1)} falls on your army at the ${atk.battle.regionName.toLowerCase()}.</p><button class="big red" data-a="defend">${icon('swords')} To arms</button>`);
      return;
    }
    this.queueModals();
  }

  queueModals() {
    const s = this.c.s;
    if (s.over) return this.modal(`<h2>${s.won ? 'The Citadel has fallen' : 'Emberhold has fallen'}</h2><p>${s.won ? 'The Ashen King is broken, for now. His ledger survives in the ash, and it remembers every page of you.' : 'The ash settles over the capital. The Ashen King records your last stand in his ledger.'}</p><p class="muted">Turns: ${s.turn} · Battles won ${s.battlesWon} · lost ${s.battlesLost}</p><button class="big" data-a="newcamp">${icon('map')} New campaign</button><button class="ghost" data-a="menu">Main menu</button>`);
    if (s.pendingPerk) return this.modal(`<h2>${icon('crown')} Your Commander grows</h2><p>Choose a gift for level ${s.army.hero.level}.</p><div class="choices">${s.pendingPerk.map((p) => `<button class="choice" data-a="perk" data-p="${p}"><b>${PERKS[p].name}</b><small>${PERKS[p].text}</small></button>`).join('')}</div>`);
    const ev = this.c.event();
    if (ev) return this.modal(`<h2>${ev.title}</h2><p>${ev.text}</p><div class="choices"><button class="choice" data-a="ev" data-c="a"><b>${ev.a.label}</b></button><button class="choice" data-a="ev" data-c="b"><b>${ev.b.label}</b></button></div>`);
    if (!this.app.save.seenCampaignIntro) {
      this.app.save.seenCampaignIntro = true;
      this.modal(`<h2>The War for the North</h2><p>Your army stands at Emberhold. The Ashen Citadel lies to the north. Every warband you meet is commanded by the same mind, and he learns from every battle you fight, in the campaign, the Chronicles and skirmishes alike.</p><p>Tap a glowing hex to march. Towns and mines pay gold. Recruit in towns you hold. Every third turn is night, when the dead are stronger.</p><button class="big" data-a="close">Begin</button>`);
    }
  }

  modal(html) { const m = this.hud.querySelector('.modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.classList.remove('hidden'); }
  closeModal() { this.hud.querySelector('.modal').classList.add('hidden'); }

  recruitModal() {
    const c = this.c;
    this.modal(`<h2>${icon('shield')} Recruit</h2><p class="muted">Treasury ${c.s.gold} gold · army ${c.army.units.length}/8</p>
      <div class="recruits">${ROSTER.ember.map((t) => { const u = UNITS[t], cost = c.recruitCost(t); return `<button class="recruit" data-a="buy" data-t="${t}" ${c.s.gold < cost || c.army.units.length >= 8 ? 'disabled' : ''}>${icon(UNIT_ICON[t])}<b>${u.name}</b><small>${u.blurb}</small><span>${icon('coin')} ${cost}</span></button>`; }).join('')}</div>
      <button class="ghost" data-a="close">Done</button>`);
  }

  armyModal() {
    const a = this.c.army, h = a.hero;
    this.modal(`<h2>${icon('shield')} The Emberlight Host</h2>
      <p>Commander · level ${h.level} · ${h.perks.map((p) => PERKS[p].name).join(', ') || 'no gifts yet'}</p>
      <div class="roster">${a.units.map((u) => `<div class="rost">${icon(UNIT_ICON[u.type])}<b>${UNITS[u.type].name}</b><span class="vet">${'★'.repeat(u.vet)}</span><i class="hp"><b style="width:${(u.hp ?? 1) * 100}%"></b></i></div>`).join('')}</div>
      <p class="muted">Soldiers gain ranks from kills. Wounds heal in your towns.</p>
      <button class="ghost" data-a="close">Close</button>`);
  }

  fight(b) {
    const a = this.c.army;
    const army = [{ type: 'commander', vet: Math.min(3, a.hero.level - 1), hp: 1 }, ...a.units];
    this.app.startBattle({
      recipe: b.recipe, night: b.night, seed: this.c.s.seed + this.c.s.turn * 13 + b.q * 7 + b.r,
      army, budget: b.final ? b.strength + 120 : b.strength, perks: a.hero.perks,
      title: b.final ? 'The Ashen Citadel' : `Battle at the ${b.regionName.toLowerCase()}`,
      subtitle: b.legionAttacks ? `${b.bandName} attacks!` : `Against ${b.bandName}`,
      onEnd: (r) => {
        // index 0 is the Commander; campaign units start at 1
        const survivors = r.survivors.filter((s) => s.index > 0).map((s) => ({ ...s, index: s.index - 1 }));
        this.c.resolve(b, { won: r.won, survivors, heroAlive: r.heroAlive });
        this.app.go('campaign');
      },
    });
  }

  bindInput() {
    const cv = this.app.stage.renderer.domElement, st = this.app.stage;
    const pts = new Map(); let pan = false, start = null, pinch = null;
    const down = (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { start = { x: e.clientX, y: e.clientY }; pan = false; } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); pan = true; } };
    const move = (e) => { const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) { if (!pan && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 9) pan = true; if (pan) st.pan(dx, dy); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); st.zoom(pinch / Math.max(1, d)); pinch = d; } };
    const up = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (!pts.size && !pan && start) this.tap(e.clientX, e.clientY); };
    const wheel = (e) => { e.preventDefault(); st.zoom(e.deltaY > 0 ? 1.08 : 0.93); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false });
    this.unbind = () => { cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); };
  }

  tap(x, y) {
    if (!this.hud.querySelector('.modal').classList.contains('hidden')) return;
    const p = this.app.stage.ground(x, y, this.view.ground);
    const reg = this.c.grid.at(p.x, p.z);
    if (!reg || reg.type === 'sea') return this.showInfo(null);
    this.app.audio.tap();
    this.showInfo(reg === this.sel ? null : reg);
  }

  step(dt, time) {
    this.view.update(dt, time, this.app.stage.camera);
    const w = innerWidth, h = innerHeight;
    const labels = this.view.project(this.app.stage.camera, w, h);
    const L = this.hud.querySelector('.labels');
    L.innerHTML = labels.filter((l) => l.vis).map((l) => (l.army
      ? `<div class="lbl blue" style="left:${l.x}px;top:${l.y}px">${icon('shield')} ${Math.round(this.playerStrength())}</div>`
      : `<div class="lbl red" style="left:${l.x}px;top:${l.y}px">${icon('skull')} ${l.band.strength}</div>`)).join('');
    this.app.audio.update(dt, 0.05, this.c.isNight());
  }

  dispose() { this.unbind?.(); this.hud.remove(); this.view.dispose(); }
}
