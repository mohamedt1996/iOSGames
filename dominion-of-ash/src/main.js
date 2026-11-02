import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/700.css';
import './ui/style.css';
import { Stage } from './render/stage.js';
import { Assets } from './render/assets.js';
import { Audio } from './audio.js';
import { BattleWorld } from './render/world.js';
import { UnitViews } from './render/units.js';
import { Battle } from './battle/sim.js';
import { makeBattlefield, RECIPES } from './battle/maps.js';
import { BattleScreen } from './battle/screen.js';
import { CampaignScreen } from './campaign/screen.js';
import { newCampaign } from './campaign/campaign.js';
import { CHRONICLES, ACTS } from './data/chronicles.js';
import { UNITS, ROSTER } from './data/units.js';
import { PLANS } from './ai/tactics.js';
import { newBrain, skillOf } from './ai/rival.js';
import { icon, UNIT_ICON } from './ui/icons.js';
import { Atmosphere } from './render/look.js';
import { loadSave, saveGame, platformReady, setHaptics, haptic } from './platform.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// A quiet tableau behind the menus: the Commander and the Ashen King face each other across a field.
class TitleScene {
  constructor(app) {
    this.app = app;
    const field = makeBattlefield({ ...RECIPES.hills, night: true }, 3);
    app.stage.setMood(true);
    this.world = new BattleWorld(app.stage.scene, field); this.world.deployMarks.visible = false;
    this.views = new UnitViews(app.stage.scene, this.world);
    const b = field.banner;
    const ember = [['commander', 0, 2.2], ['knight', -1.3, 2.8], ['knight', 1.3, 2.8], ['ranger', -2.4, 3.8], ['pyromancer', 2.4, 3.8], ['barbarian', 0, 4]];
    const ash = [['ashking', 0, -2.2], ['bonewarden', -1.4, -2.9], ['bonewarden', 1.4, -2.9], ['necromancer', 0, -4.2], ['thrall', -2.6, -3.6], ['thrall', 2.6, -3.6], ['boneshot', -1.2, -4.6]];
    this.battle = new Battle(field, { ember: ember.map(([type, x, z]) => ({ type, x: b.x + x, z: b.z + z })), ash: ash.map(([type, x, z]) => ({ type, x: b.x + x, z: b.z + z })) });
    this.center = b; this.t = 0;
    this.air = new Atmosphere(this.world.group, { x0: b.x - 14, x1: b.x + 14, z0: b.z - 14, z1: b.z + 14 }, 'night');
    this.air.setScale(app.stage.renderer.domElement.height);
    this.embers = new Atmosphere(this.world.group, { x0: b.x - 10, x1: b.x + 10, z0: b.z - 10, z1: b.z + 10 }, 'ash'); this.embers.setScale(app.stage.renderer.domElement.height);
    app.stage.addClouds(30, 8);
    app.stage.rig.bounds = null; app.stage.rig.pitch = 0.42; app.stage.rig.dist = 15; app.stage.rig.minD = 6;
    const sc = app.stage.sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.updateProjectionMatrix();
  }
  step(dt) {
    this.t += dt;
    const r = this.app.stage.rig; r.tx = this.center.x; r.tz = this.center.z; r.yaw = 0.9 + this.t * 0.04; r.dist = 15 + Math.sin(this.t * 0.1) * 1.5;
    this.views.sync(this.battle, dt, this.app.stage.camera, new Set());
    this.air.update(dt, this.t); this.embers.update(dt, this.t);
  }
  dispose() { this.views.dispose(); this.world.dispose(); const r = this.app.stage.rig; r.pitch = 0.95; r.minD = 9; }
}

class App {
  constructor() {
    this.ui = document.getElementById('ui');
    this.stage = new Stage(document.getElementById('stage'));
    this.audio = new Audio();
    this.screen = null; this.last = performance.now(); this.time = 0;
  }

  async init() {
    this.save = await loadSave();
    if (!this.save.brain) this.save.brain = newBrain();
    this.applySettings();
    const bar = document.querySelector('#boot i');
    await Assets.init((f) => { if (bar) bar.style.width = `${f * 100}%`; });
    await platformReady();
    document.getElementById('boot')?.classList.add('gone');
    this.perf = { acc: 0, n: 0, checked: false };
    this.go('title');
    const unlock = () => { this.audio.start(); };
    window.addEventListener('pointerdown', unlock);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.audio.ctx?.suspend(); this.screen?.setPaused?.(true); } else this.audio.ctx?.resume(); });
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.time += dt;
      this.screen?.step?.(dt, this.time);
      this.stage.render(dt, this.time);
      this.autoQuality(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  applySettings() {
    const s = this.save.settings;
    this.audio.setEnabled(s.sound); this.audio.setMusic(s.music); setHaptics(s.haptics);
    this.stage.setQuality(s.graphics === 'auto' ? s.autoTier : s.graphics);
  }
  autoQuality(dt) {
    const s = this.save.settings; if (s.graphics !== 'auto' || this.perf.checked) return;
    if (!(this.screen instanceof BattleScreen)) return;
    this.perf.acc += dt; this.perf.n++;
    if (this.perf.n >= 180) {
      const avg = this.perf.acc / this.perf.n;
      this.perf = { acc: 0, n: 0, checked: avg < 0.024 };
      if (avg >= 0.024) {
        const next = s.autoTier === 'high' ? 'balanced' : s.autoTier === 'balanced' ? 'battery' : null;
        if (next) { s.autoTier = next; this.stage.setQuality(next); this.persist(); } else this.perf.checked = true;
      }
    }
  }
  persist() { saveGame(this.save); }

  clear() {
    this.screen?.dispose?.(); this.screen = null;
    this.ui.innerHTML = '';
    this.stage.clouds.clear();
  }

  go(name) {
    this.clear();
    if (name === 'title') { this.screen = new TitleScene(this); this.titleMenu(); }
    if (name === 'campaign') {
      if (!this.save.campaign) this.save.campaign = newCampaign();
      this.screen = new CampaignScreen(this);
    }
  }

  // ---------------- menus ----------------
  panel(html, cls = '') {
    this.ui.querySelector('.menu')?.remove();
    const p = el(`<div class="menu ${cls}">${html}</div>`); this.ui.appendChild(p);
    p.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.audio.tap(); this.onMenu(b, e); } });
    return p;
  }

  titleMenu() {
    const br = this.save.brain;
    this.panel(`
      <div class="title-block">
        <h1>Dominion<span>of</span>Ash</h1>
        <p class="tag">The Ashen King remembers every battle.</p>
      </div>
      <div class="menu-buttons">
        <button class="big" data-m="campaign">${icon('map')} ${this.save.campaign && !this.save.campaign.over ? `Continue campaign <small>Turn ${this.save.campaign.turn}</small>` : 'New campaign'}</button>
        <button class="big alt" data-m="chronicles">${icon('book')} The Chronicles <small>${Object.keys(this.save.chronicles).length}/${CHRONICLES.length}</small></button>
        <button class="big alt" data-m="skirmish">${icon('swords')} Skirmish</button>
        <div class="row"><button class="ghost" data-m="ledger">${icon('eye')} The Ledger</button><button class="ghost" data-m="settings">${icon('gear')} Settings</button></div>
      </div>
      <div class="rival-card">${icon('crown')}<div><b>The Ashen King</b><small>${br.battles ? `${br.battles} battles studied · ${br.wins} won · skill ${Math.round(skillOf(br) * 100)}%` : 'He has never seen you fight.'}</small></div></div>
      <p class="credit">Models: KayKit by Kay Lousberg (CC0)</p>`, 'title');
  }

  onMenu(b) {
    const m = b.dataset.m;
    if (m === 'campaign') {
      if (this.save.campaign?.over) this.save.campaign = null;
      return this.go('campaign');
    }
    if (m === 'newcampaign-confirm') { this.save.campaign = newCampaign(); return this.go('campaign'); }
    if (m === 'chronicles') return this.chroniclesMenu();
    if (m === 'skirmish') { this.sk = this.sk || { recipe: 'plains', night: false, army: ['knight', 'knight', 'barbarian', 'ranger', 'ranger', 'pyromancer'] }; return this.skirmishMenu(); }
    if (m === 'ledger') return this.showLedger();
    if (m === 'settings') return this.settingsMenu();
    if (m === 'back') return this.titleMenu();
    if (m === 'chron') return this.chronicleBrief(+b.dataset.id);
    if (m === 'play-chron') return this.playChronicle(+b.dataset.id);
    if (m === 'sk-recipe') { this.sk.recipe = b.dataset.v; return this.skirmishMenu(); }
    if (m === 'sk-night') { this.sk.night = !this.sk.night; return this.skirmishMenu(); }
    if (m === 'sk-add') { if (this.skCost() + UNITS[b.dataset.t].cost <= 520 && this.sk.army.length < 9) this.sk.army.push(b.dataset.t); return this.skirmishMenu(); }
    if (m === 'sk-rem') { this.sk.army.splice(+b.dataset.i, 1); return this.skirmishMenu(); }
    if (m === 'sk-go') return this.playSkirmish();
    if (m === 'set') {
      const s = this.save.settings, k = b.dataset.k;
      if (k === 'graphics') { const o = ['auto', 'high', 'balanced', 'battery']; s.graphics = o[(o.indexOf(s.graphics) + 1) % o.length]; }
      else s[k] = !s[k];
      this.applySettings(); this.persist(); return this.settingsMenu();
    }
    if (m === 'burn') { b.dataset.m = 'burn2'; b.textContent = 'Tap again: he forgets everything'; return; }
    if (m === 'burn2') { this.save.brain = newBrain(); this.persist(); haptic('heavy'); return this.showLedger(); }
    if (m === 'close-ledger') { this.ui.querySelector('.ledger-sheet')?.remove(); return; }
  }

  chroniclesMenu() {
    const done = this.save.chronicles;
    const unlocked = (id) => id === 1 || done[id - 1] != null;
    this.panel(`
      <div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>The Chronicles</h2></div>
      <div class="chron-list">${ACTS.map((act) => `<h4>${act}</h4><div class="chron-row">${CHRONICLES.filter((c) => c.act === act).map((c) => `
        <button class="chron ${unlocked(c.id) ? '' : 'locked'} ${c.night ? 'night' : ''}" data-m="chron" data-id="${c.id}" ${unlocked(c.id) ? '' : 'disabled'}>
          <span class="n">${c.id}</span><b>${c.name}</b><span class="st">${[1, 2, 3].map((i) => `<i class="${(done[c.id] || 0) >= i ? 'on' : ''}">★</i>`).join('')}</span>
        </button>`).join('')}</div>`).join('')}</div>`, 'wide');
  }

  chronicleBrief(id) {
    const c = CHRONICLES.find((x) => x.id === id);
    this.panel(`
      <div class="sheet-head"><button class="rb" data-m="chronicles">${icon('back')}</button><h2>${c.id}. ${c.name}</h2></div>
      <div class="brief">
        <p class="story">${c.story}</p>
        <p class="muted">${RECIPES[c.recipe].name}${c.night ? ' · night' : ''}${c.mods?.reinforce ? ' · reinforcements' : ''}${c.mods?.ambush ? ' · ambush' : ''}${c.mods?.wildfire ? ' · wildfire' : ''}</p>
        <div class="army-line">${c.army.map((t) => `<span class="chip">${icon(UNIT_ICON[t])} ${UNITS[t].name}</span>`).join('')}</div>
        <div class="goals"><p>★ Win the battle</p><p>★★ Lose ${c.losses ? `no more than ${c.losses}` : 'no'} soldier${c.losses === 1 ? '' : 's'}</p><p>★★★ Win within ${Math.floor(c.time / 60)}:${String(c.time % 60).padStart(2, '0')}</p></div>
        <p class="tip">${icon('eye')} ${c.tip}</p>
        <button class="big" data-m="play-chron" data-id="${c.id}">${icon('swords')} To battle</button>
      </div>`);
  }

  playChronicle(id) {
    const c = CHRONICLES.find((x) => x.id === id);
    const stars = (r) => (r.won ? 1 + (r.lost <= c.losses ? 1 : 0) + (r.time <= c.time ? 1 : 0) : 0);
    this.startBattle({
      recipe: c.recipe, night: !!c.night, seed: id * 101 + (this.save.brain.battles % 7), army: c.army.map((t) => ({ type: t, vet: 0 })), budget: c.budget, mods: c.mods,
      title: `${c.id}. ${c.name}`, subtitle: c.story, stars,
      onEnd: (r) => { const s = stars(r); if (r.won) { this.save.chronicles[id] = Math.max(this.save.chronicles[id] || 0, s); this.persist(); } this.go('title'); this.chroniclesMenu(); },
    });
  }

  skCost() { return this.sk.army.reduce((a, t) => a + UNITS[t].cost, 0); }
  skirmishMenu() {
    const sk = this.sk;
    this.panel(`
      <div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>Skirmish</h2></div>
      <div class="sk">
        <h4>Battlefield</h4>
        <div class="chips">${Object.entries(RECIPES).map(([k, r]) => `<button class="chip ${sk.recipe === k ? 'on' : ''}" data-m="sk-recipe" data-v="${k}">${r.name}</button>`).join('')}<button class="chip ${sk.night ? 'on' : ''}" data-m="sk-night">Night</button></div>
        <h4>Your army <small>${this.skCost()}/520 gold · the King gets the same</small></h4>
        <div class="chips">${sk.army.map((t, i) => `<button class="chip unit" data-m="sk-rem" data-i="${i}">${icon(UNIT_ICON[t])} ${UNITS[t].name} ×</button>`).join('') || '<span class="muted">Add soldiers below.</span>'}</div>
        <div class="recruits small">${ROSTER.ember.map((t) => `<button class="recruit" data-m="sk-add" data-t="${t}" ${this.skCost() + UNITS[t].cost > 520 ? 'disabled' : ''}>${icon(UNIT_ICON[t])}<b>${UNITS[t].name}</b><span>${icon('coin')} ${UNITS[t].cost}</span></button>`).join('')}</div>
        <button class="big" data-m="sk-go" ${sk.army.length ? '' : 'disabled'}>${icon('swords')} Fight</button>
      </div>`, 'wide');
  }
  playSkirmish() {
    const sk = this.sk;
    this.startBattle({ recipe: sk.recipe, night: sk.night, seed: Math.floor(Math.random() * 1e6), army: ['commander', ...sk.army].map((t) => ({ type: t, vet: 0 })), budget: 520, title: 'Skirmish', subtitle: RECIPES[sk.recipe].name, onEnd: () => { this.go('title'); this.skirmishMenu(); } });
  }

  settingsMenu() {
    const s = this.save.settings;
    const row = (k, label, v) => `<button class="setting" data-m="set" data-k="${k}"><span>${label}</span><b>${v}</b></button>`;
    this.panel(`
      <div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>Settings</h2></div>
      <div class="settings">
        ${row('sound', 'Sound', s.sound ? 'On' : 'Off')}${row('music', 'War drums', s.music ? 'On' : 'Off')}${row('haptics', 'Haptics', s.haptics ? 'On' : 'Off')}
        ${row('graphics', 'Graphics', s.graphics === 'auto' ? `Auto (${s.autoTier})` : s.graphics[0].toUpperCase() + s.graphics.slice(1))}
        <p class="muted">Models: KayKit Medieval Hexagon, Adventurers and Skeletons packs by Kay Lousberg, CC0. Fonts: Cinzel, Alegreya Sans (OFL).</p>
      </div>`);
  }

  showLedger() {
    const br = this.save.brain, m = br.model;
    const all = br.bandit._all || {};
    const plans = Object.entries(PLANS).map(([k, p]) => { const a = all[k]; return { name: p.name, n: a?.n || 0, v: a?.n ? a.r / a.n : 0 }; }).sort((a, b) => b.v - a.v || b.n - a.n);
    const bar = (v) => `<i class="bar"><b style="width:${Math.round(v * 100)}%"></b></i>`;
    const sheet = el(`<div class="ledger-sheet"><div class="sheet">
      <div class="sheet-head"><button class="rb" data-m="close-ledger">${icon('back')}</button><h2>${icon('book')} The Ashen King’s Ledger</h2></div>
      <p class="muted">${br.battles} battles studied · he won ${br.wins}, lost ${br.losses} · mood: ${br.mood || 'curious'} · skill ${Math.round(skillOf(br) * 100)}%</p>
      <div class="ledger-grid">
        <div><h4>How he reads you</h4>
          <p>Left flank ${bar(m.side.left)}</p><p>Centre ${bar(m.side.center)}</p><p>Right flank ${bar(m.side.right)}</p>
          <p>Aggression ${bar(m.aggression)}</p><p>Crossbows ${bar(Math.min(1, m.ranged * 2))}</p><p>Pyromancers ${bar(Math.min(1, m.caster * 2))}</p>
        </div>
        <div><h4>Plans he trusts</h4>${plans.map((p) => `<p>${p.name} <small>${p.n ? `${p.n}×` : 'untried'}</small>${bar(p.v)}</p>`).join('')}</div>
      </div>
      <h4>His notes on you</h4>
      ${(br.notes || []).map((n) => `<p class="note">“${n.text}”</p>`).join('') || '<p class="muted">Empty pages. Fight him and he will start writing.</p>'}
      <h4>Recent pages</h4>
      ${(br.log || []).slice(0, 8).map((l) => `<p class="log-row"><b class="${l.won ? 'red' : 'blue'}">${l.won ? 'He won' : 'You won'}</b> · ${l.plan} · <small>${l.reason}</small></p>`).join('') || '<p class="muted">None yet.</p>'}
      <button class="ghost danger" data-m="burn">Burn the ledger (reset his memory)</button>
    </div></div>`);
    this.ui.appendChild(sheet);
    sheet.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.audio.tap(); this.onMenu(b); } });
  }

  newCampaign() { this.save.campaign = newCampaign(); this.persist(); this.go('campaign'); }

  startBattle(opts) {
    this.clear();
    this.screen = new BattleScreen(this, opts);
  }
}

const app = new App();
window.__app = app;
app.init().catch((e) => { console.error(e); const b = document.querySelector('#boot p'); if (b) b.textContent = 'Failed to load: ' + e.message; });
