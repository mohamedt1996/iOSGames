import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/600.css';
import './ui/style.css';
import { Stage } from './render/stage.js';
import { Assets } from './render/assets.js';
import { RealmView } from './render/realmview.js';
import { Realm, HOUSES } from './game/realm.js';
import { Audio } from './audio.js';
import { GameScreen } from './screen.js';
import { SCENARIOS, BOOKS } from './data/scenarios.js';
import { newMemory, notes, trustOf, pReal, STYLES } from './game/ai.js';
import { CARDS } from './game/cards.js';
import { icon } from './ui/icons.js';
import { loadSave, saveGame, platformReady, setHaptics, haptic } from './platform.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// a slowly turning realm behind the menus
class TitleScene {
  constructor(app) {
    this.app = app;
    this.realm = new Realm({ seed: 7, radius: 4, houses: [{ id: 'blue' }, { id: 'red' }, { id: 'green' }, { id: 'yellow' }] });
    for (const p of this.realm.provinces) if (!p.owner && Math.random() < 0.55) { const h = this.realm.houses[Math.floor(Math.random() * 4)]; p.owner = h.id; p.troops = 2 + Math.floor(Math.random() * 8); }
    app.stage.setMood(false);
    this.view = new RealmView(app.stage.scene, this.realm); this.view.setScale(app.stage.renderer.domElement.height);
    app.stage.addClouds(30, 10);
    app.stage.frame({ x0: -14, x1: 14, z0: -14, z1: 14 }, 26);
    const r = app.stage.rig; r.bounds = null; r.tx = 0; r.tz = 0; r.pitch = 0.62; r.dist = 24;
    this.t = 0;
  }
  step(dt, time) { this.t += dt; const r = this.app.stage.rig; r.yaw = this.t * 0.05; r.tz = 0; r.tx = 0; this.view.update(dt, time); this.app.audio.update(dt); }
  dispose() { this.view.dispose(); this.app.stage.rig.pitch = 1.0; }
}

class App {
  constructor() {
    this.ui = document.getElementById('ui');
    this.stage = new Stage(document.getElementById('stage'));
    this.stage.camera.fov = 48; this.stage.camera.updateProjectionMatrix();
    this.audio = new Audio();
    this.screen = null; this.last = performance.now(); this.time = 0;
  }
  async init() {
    this.save = await loadSave();
    if (!this.save.memory) this.save.memory = newMemory();
    this.applySettings();
    const bar = document.querySelector('#boot i');
    await Assets.init((f) => { if (bar) bar.style.width = `${f * 100}%`; });
    await platformReady();
    document.getElementById('boot')?.classList.add('gone');
    this.go('title');
    window.addEventListener('pointerdown', () => this.audio.start());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.audio.ctx?.suspend(); else this.audio.ctx?.resume(); });
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.time += dt;
      this.screen?.step?.(dt, this.time);
      this.stage.render(dt, this.time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  applySettings() {
    const s = this.save.settings;
    this.audio.setEnabled(s.sound); this.audio.setMusic(s.music); setHaptics(s.haptics);
    this.stage.setQuality(s.graphics === 'auto' ? s.autoTier : s.graphics);
  }
  persist() { saveGame(this.save); }
  clear() { this.screen?.dispose?.(); this.screen = null; this.ui.innerHTML = ''; this.stage.clouds.clear(); }

  go(name) {
    this.clear();
    if (name === 'title') { this.screen = new TitleScene(this); this.titleMenu(); }
  }

  panel(html, cls = '') {
    this.ui.querySelector('.menu')?.remove();
    const p = el(`<div class="menu ${cls}">${html}</div>`); this.ui.appendChild(p);
    p.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.audio.tap(); this.onMenu(b); } });
    return p;
  }

  titleMenu() {
    const m = this.save.memory, done = Object.keys(this.save.scenarios).length;
    this.panel(`
      <div class="title-block"><h1>Crown <span>of</span> Thorns</h1><p class="tag">Four houses. One crown. Every bluff remembered.</p></div>
      <div class="menu-buttons">
        <button class="big" data-m="books">${icon('book')} The Chronicle <small>${done}/${SCENARIOS.length}</small></button>
        <button class="big alt" data-m="realm">${icon('map')} Open Realm</button>
        <div class="row"><button class="ghost" data-m="council">${icon('eye')} The Council</button><button class="ghost" data-m="settings">${icon('gear')} Settings</button></div>
      </div>
      <div class="council-card">${icon('crown')}<div><b>The Council of Houses</b><small>${m.games ? `${m.games} games remembered · trust in you ${Math.round(trustOf(m) * 100)}%` : 'They have never sat at a table with you.'}</small></div></div>
      <p class="credit">Models: KayKit by Kay Lousberg (CC0)</p>`, 'title');
  }

  onMenu(b) {
    const m = b.dataset.m;
    if (m === 'back') return this.titleMenu();
    if (m === 'books') return this.booksMenu();
    if (m === 'scn') return this.brief(+b.dataset.id);
    if (m === 'play') return this.playScenario(+b.dataset.id);
    if (m === 'realm') return this.realmMenu();
    if (m === 'rh') { this.rcfg.n = +b.dataset.v; return this.realmMenu(); }
    if (m === 'rs') { this.rcfg.size = +b.dataset.v; return this.realmMenu(); }
    if (m === 'rc') { this.rcfg.me = b.dataset.v; return this.realmMenu(); }
    if (m === 'rgo') return this.playRealm();
    if (m === 'council') return this.councilMenu();
    if (m === 'settings') return this.settingsMenu();
    if (m === 'set') {
      const s = this.save.settings, k = b.dataset.k;
      if (k === 'graphics') { const o = ['auto', 'high', 'balanced', 'battery']; s.graphics = o[(o.indexOf(s.graphics) + 1) % o.length]; } else s[k] = !s[k];
      this.applySettings(); this.persist(); return this.settingsMenu();
    }
    if (m === 'forget') { b.dataset.m = 'forget2'; b.textContent = 'Tap again: the houses forget you'; return; }
    if (m === 'forget2') { this.save.memory = newMemory(); this.persist(); haptic('heavy'); return this.councilMenu(); }
  }

  booksMenu() {
    const done = this.save.scenarios, open = (id) => id === 1 || done[id - 1] != null;
    this.panel(`<div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>The Chronicle</h2></div>
      ${BOOKS.map((b) => `<h4>${b}</h4><div class="scn-grid">${SCENARIOS.filter((s) => s.book === b).map((s) => `
        <button class="scn ${open(s.id) ? '' : 'locked'}" data-m="scn" data-id="${s.id}" ${open(s.id) ? '' : 'disabled'}>
          <span class="n">${s.id}</span><b>${s.name}</b>
          <span class="dots">${s.houses.map((h) => `<i style="background:${HOUSES[h.id].color}"></i>`).join('')}</span>
          <span class="st">${[1, 2, 3].map((i) => `<i class="${(done[s.id] || 0) >= i ? 'on' : ''}">★</i>`).join('')}</span>
        </button>`).join('')}</div>`).join('')}`, 'list');
  }

  brief(id) {
    const s = SCENARIOS.find((x) => x.id === id), me = s.houses[0].id;
    this.panel(`<div class="sheet-head"><button class="rb" data-m="books">${icon('back')}</button><h2>${s.id}. ${s.name}</h2></div>
      <div class="brief">
        <p class="story">${s.story}</p>
        <p>You lead <b style="color:${HOUSES[me].color}">${HOUSES[me].name}</b> against ${s.houses.slice(1).map((h) => `<b style="color:${HOUSES[h.id].color}">${HOUSES[h.id].short}</b>`).join(', ')}.</p>
        <div class="goals"><p>★ Win: first to ${s.vpGoal} crowns (or most after ${s.maxRounds} rounds)</p><p>★★ Win by round ${s.fast}</p><p>★★★ Win without breaking a pact</p></div>
        <p class="tip">${icon('eye')} ${s.tip}</p>
        <button class="big" data-m="play" data-id="${s.id}">${icon('swords')} Take your seat</button>
      </div>`, 'list');
  }

  playScenario(id) {
    const s = SCENARIOS.find((x) => x.id === id);
    const cfg = { ...s, seed: s.seed * 7 + (this.save.memory.games % 3) };
    this.startGame(cfg, { scenario: id, fast: s.fast, intro: s, onEnd: (r) => {
      if (r?.won) { this.save.scenarios[id] = Math.max(this.save.scenarios[id] || 0, r.stars); this.persist(); }
      this.go('title'); this.booksMenu();
    } });
  }

  realmMenu() {
    this.rcfg ||= { n: 4, size: 4, me: 'blue' };
    const c = this.rcfg;
    const chip = (m, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-m="${m}" data-v="${v}">${label}</button>`;
    this.panel(`<div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>Open Realm</h2></div>
      <div class="brief">
        <h4>Houses at the table</h4><div class="chips">${[2, 3, 4].map((n) => chip('rh', n, `${n} houses`, c.n === n)).join('')}</div>
        <h4>Realm size</h4><div class="chips">${[[3, 'Small'], [4, 'Middling'], [5, 'Vast']].map(([v, l]) => chip('rs', v, l, c.size === v)).join('')}</div>
        <h4>Your house</h4><div class="chips">${Object.entries(HOUSES).map(([k, h]) => `<button class="chip ${c.me === k ? 'on' : ''}" data-m="rc" data-v="${k}" style="--c:${h.color}"><i class="dot"></i>${h.name}</button>`).join('')}</div>
        <p class="muted">${HOUSES[c.me].motto}</p>
        <button class="big" data-m="rgo">${icon('swords')} Begin</button>
      </div>`, 'list');
  }
  playRealm() {
    const c = this.rcfg, ids = Object.keys(HOUSES).filter((k) => k !== c.me).sort(() => Math.random() - 0.5).slice(0, c.n - 1);
    const cfg = { seed: Math.floor(Math.random() * 1e6), radius: c.size, houses: [{ id: c.me, human: true }, ...ids.map((id) => ({ id }))], vpGoal: 8 + c.n * 2 + (c.size - 3) * 2, maxRounds: 14 + c.size * 2 };
    this.startGame(cfg, { onEnd: () => { this.go('title'); } });
  }

  councilMenu() {
    const m = this.save.memory;
    const bar = (v) => `<i class="bar"><b style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></b></i>`;
    const g = m.bluff._all || { real: 0, fake: 0 };
    const bl = g.real + g.fake ? g.fake / (g.real + g.fake) : 0;
    const ans = (m.answer.yes + 1) / (m.answer.yes + m.answer.no + 2);
    const st = m.selfThreat, tot = Object.values(st).reduce((a, b) => a + b, 0);
    this.panel(`<div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>${icon('eye')} The Council of Houses</h2></div>
      <p class="muted">${m.games} games remembered · you won ${m.wins} · ${m.rounds} rounds studied</p>
      <div class="ledger-grid">
        <div><h4>How they read you</h4>
          <p>Bluffing ${bar(bl * 2)}<small>${Math.round(bl * 100)}% feints</small></p>
          <p>Answering threats ${bar(ans)}<small>${Math.round(ans * 100)}%</small></p>
          <p>Trust in your word ${bar(trustOf(m))}<small>${m.trust.broken ? `${Math.round(m.trust.broken)} broken` : 'unbroken'}</small></p>
          <p>Last card of a round is real ${bar(pReal(m, { slot: 2, value: 5, pacted: false }))}</p>
        </div>
        <div><h4>Your hidden card when threatened</h4>${Object.entries(st).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<p>${CARDS[k].name} ${bar(v / (tot || 1) * 2)}</p>`).join('')}</div>
      </div>
      <h4>Their notes on you</h4>
      ${notes(m).map((n) => `<p class="note">“${n}”</p>`).join('') || '<p class="muted">Blank pages. Play, and they will start writing.</p>'}
      <h4>Recent games</h4>
      ${m.log.slice(0, 8).map((l) => `<p class="log-row"><b class="${l.won ? 'good' : 'bad'}">${l.won ? 'You won' : `${HOUSES[l.winner]?.short || '?'} won`}</b> · they played as ${l.style}s · ${l.rounds} rounds</p>`).join('') || '<p class="muted">None yet.</p>'}
      <button class="ghost danger" data-m="forget">Make them forget you</button>`, 'list');
  }

  settingsMenu() {
    const s = this.save.settings;
    const row = (k, label, v) => `<button class="setting" data-m="set" data-k="${k}"><span>${label}</span><b>${v}</b></button>`;
    this.panel(`<div class="sheet-head"><button class="rb" data-m="back">${icon('back')}</button><h2>Settings</h2></div>
      <div class="settings">${row('sound', 'Sound', s.sound ? 'On' : 'Off')}${row('music', 'Lute', s.music ? 'On' : 'Off')}${row('haptics', 'Haptics', s.haptics ? 'On' : 'Off')}${row('graphics', 'Graphics', s.graphics === 'auto' ? `Auto (${s.autoTier})` : s.graphics)}
      <p class="muted">Models: KayKit Medieval Hexagon and Adventurers packs by Kay Lousberg, CC0. Fonts: IM Fell English, EB Garamond (OFL).</p></div>`, 'list');
  }

  startGame(cfg, opts) {
    this.clear();
    this.screen = new GameScreen(this, cfg, opts);
  }
}

const app = new App();
window.__app = app;
app.init().catch((e) => { console.error(e); const b = document.querySelector('#boot p'); if (b) b.textContent = 'Failed to load: ' + e.message; });
export { STYLES };
