import '@fontsource/young-serif/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './ui/style.css';
import { Stage } from './render/stage.js';
import { World } from './sim/world.js';
import { LEVELS, CHAPTERS, SANDBOX } from './levels/levels.js';
import { PLANTS, CREATURES } from './sim/species.js';
import { Game } from './game.js';
import { Audio } from './audio.js';
import { ICON } from './ui/icons.js';
import { loadSave, saveGame, platformReady, setHaptics, haptic } from './platform.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// Device tilt -> normalized gravity on screen axes, with calibration.
class Motion {
  constructor() { this.x = 0; this.z = 0; this.active = false; this.base = null; this.mode = 'auto'; this.last = null; this.touchX = 0; this.touchZ = 0; this.events = 0; }
  async request() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false;
      }
    } catch { return false; }
    if (!this.bound) { window.addEventListener('deviceorientation', (e) => this.onOrient(e)); this.bound = true; }
    return true;
  }
  onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    this.events++;
    this.last = { b: e.beta, g: e.gamma };
    if (!this.base) this.calibrate();
    if (this.mode === 'touch') return;
    const dz = 3, span = 22;
    const f = (v) => (Math.abs(v) < dz ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * dz) / span)));
    this.x = f(e.gamma - this.base.g); this.z = f(e.beta - this.base.b);
    this.active = true;
  }
  calibrate() { if (this.last) this.base = { b: this.last.b, g: this.last.g }; }
  get hasSensor() { return this.events > 3; }
}

class App {
  constructor() {
    this.ui = document.getElementById('ui');
    this.stage = new Stage(document.getElementById('stage'));
    this.audio = new Audio();
    this.motion = new Motion();
    this.levels = LEVELS;
    this.game = null; this.screen = null; this.last = performance.now();
    this.t = 0;
  }
  async init() {
    this.save = await loadSave();
    this.applySettings();
    await platformReady();
    this.toTitle();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
      if (this.motion.mode === 'touch' || (!this.motion.hasSensor && this.game)) { this.motion.x = this.motion.touchX; this.motion.z = this.motion.touchZ; this.motion.active = true; }
      if (this.game) this.game.update(dt);
      else if (this.demo) {
        this.demo.update(dt, 3);
        this.demo.rot += dt * 0.12;
        this.stage.render(dt, this.t, { zoom: 1.0, lookY: 0.95, pitch: 0.42 });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.game?.pause(); this.audio.ctx?.suspend(); } else this.audio.ctx?.resume(); });
  }
  applySettings() {
    const s = this.save.settings;
    this.audio.setEnabled(s.sound); this.audio.setMusic(s.music); setHaptics(s.haptics); this.motion.mode = s.tilt;
  }
  persist() { saveGame(this.save); }
  chapterName(id) { return CHAPTERS.find((c) => c.id === id)?.name || ''; }
  async requestMotion() {
    if (this.save.settings.tilt === 'touch') return;
    await this.motion.request();
    setTimeout(() => this.motion.calibrate(), 300);
  }

  clearScreen() { this.screen?.remove(); this.screen = null; if (this.game) { this.game.destroy(); this.game = null; } this.tiltPad?.remove(); this.tiltPad = null; }

  startDemo() {
    const L = { ...SANDBOX, inventory: {}, plants: [
      { type: 'moss', x: -0.35, z: 0.1, r: 0.35, bio: 0.7 }, { type: 'grass', x: 0.45, z: -0.2, r: 0.25, bio: 0.7 },
      { type: 'fern', x: -0.2, z: -0.5, r: 0.1, bio: 0.9 }, { type: 'bloom', x: 0.35, z: 0.35, r: 0.12, bio: 0.8, age: 2 },
    ], creatures: [{ type: 'snail', n: 2, x: -0.3, z: 0.1, r: 0.2 }, { type: 'firefly', n: 5, x: 0, z: 0, r: 0.5 }], startHour: 17, wild: false };
    this.demo = new World(L, 3);
    this.stage.attachWorld(this.demo);
  }

  toTitle() {
    this.clearScreen();
    if (!this.demo) this.startDemo();
    const total = Object.values(this.save.stars).reduce((a, b) => a + b, 0);
    this.screen = el(`<div class="title-screen">
      <div><h1>Pocket<span>Ecosystem</span></h1><p class="lede">A sealed jar, a little water, and everything that lives on it. Tilt, turn and tend it until it can live on its own.</p></div>
      <div class="menu">
        <button class="btn" data-a="play">${total ? 'Continue' : 'Open the first jar'}</button>
        <button class="btn ghost" data-a="guide">${ICON.book} Field guide</button>
        <button class="btn ghost" data-a="settings">${ICON.gear} Settings</button>
      </div></div>`);
    this.screen.querySelector('[data-a="play"]').onclick = () => { this.audio.start(); this.audio.tap(); haptic(); total ? this.toLevels() : this.startLevel(LEVELS[0]); };
    this.screen.querySelector('[data-a="guide"]').onclick = () => { this.audio.start(); this.showCodex(() => this.toTitle()); };
    this.screen.querySelector('[data-a="settings"]').onclick = () => { this.audio.start(); this.showSettings(() => this.toTitle()); };
    this.ui.appendChild(this.screen);
  }

  isUnlocked(L) { return L.id === 1 || (this.save.stars[L.id - 1] || 0) > 0 || (this.save.stars[L.id] || 0) > 0; }

  toLevels() {
    this.clearScreen();
    if (!this.demo) this.startDemo(); else this.stage.attachWorld(this.demo);
    const nextId = (LEVELS.find((l) => !this.save.stars[l.id]) || {}).id;
    const total = Object.values(this.save.stars).reduce((a, b) => a + b, 0);
    const soils = ['#6b4f37', '#4f5f70', '#5a4a6a', '#6a5a3a'];
    const shelves = CHAPTERS.map((c, ci) => {
      const ls = LEVELS.filter((l) => l.chapter === c.id);
      const got = ls.reduce((a, l) => a + (this.save.stars[l.id] || 0), 0);
      return `<section class="shelf"><h3>${c.name}</h3><p>${c.tag} · ${got} of ${ls.length * 3} stars</p><div class="shelf-row">${ls.map((l) => {
        const st = this.save.stars[l.id] || 0, un = this.isUnlocked(l);
        return `<button class="jar-btn ${un ? '' : 'locked'} ${l.id === nextId ? 'next' : ''}" style="--soil:${soils[ci]}" data-id="${l.id}" ${un ? '' : 'disabled'} aria-label="Jar ${l.id}, ${l.name}${un ? `, ${st} stars` : ', locked'}"><b>${l.id}</b><span class="stars">${'★'.repeat(st)}${'·'.repeat(3 - st)}</span></button>`;
      }).join('')}</div></section>`;
    }).join('');
    const sandboxOpen = (this.save.stars[6] || 0) > 0;
    this.screen = el(`<div class="shelves">
      <header><button class="icon-btn" data-a="back" aria-label="Back">${ICON.back}</button><h2>Your jars</h2><span class="sub" style="font-size:14px;color:var(--ink-soft)">${total} ★</span></header>
      ${shelves}
      <div class="sandbox-row"><button class="btn ${sandboxOpen ? '' : 'ghost'}" data-a="sandbox" ${sandboxOpen ? '' : 'disabled'}>${sandboxOpen ? 'Open the sandbox jar' : 'Sandbox opens after the first shelf'}</button></div>
    </div>`);
    this.screen.querySelector('[data-a="back"]').onclick = () => { this.audio.tap(); this.toTitle(); };
    this.screen.querySelector('[data-a="sandbox"]').onclick = () => this.startLevel(SANDBOX);
    this.screen.querySelectorAll('.jar-btn').forEach((b) => { b.onclick = () => { this.audio.tap(); haptic(); this.startLevel(LEVELS.find((l) => l.id === +b.dataset.id)); }; });
    this.ui.appendChild(this.screen);
    const nb = this.screen.querySelector('.jar-btn.next'); nb?.scrollIntoView({ block: 'center' });
  }

  startLevel(L) {
    this.clearScreen();
    this.demo = null;
    this.audio.start();
    this.game = new Game(this, L);
    this.updateTiltPad();
  }

  updateTiltPad() {
    this.tiltPad?.remove(); this.tiltPad = null;
    if (!this.game) return;
    const mode = this.save.settings.tilt;
    if (mode === 'motion') return;
    if (mode === 'auto' && this.motion.hasSensor) return;
    if (mode === 'auto') setTimeout(() => { if (this.game && this.motion.hasSensor) { this.tiltPad?.remove(); this.tiltPad = null; } }, 2500);
    const pad = el('<div class="tiltpad" aria-label="Tilt control: drag to tip the jar"><i></i><small>tip the jar</small></div>');
    const knob = pad.querySelector('i');
    const set = (e) => {
      const r = pad.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), z = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
      this.motion.touchX = x; this.motion.touchZ = z;
      knob.style.transform = `translate(${x * 30}px, ${z * 30}px)`;
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); set(e); });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) set(e); });
    const rel = () => { this.motion.touchX = 0; this.motion.touchZ = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', rel); pad.addEventListener('pointercancel', rel);
    this.game.root.appendChild(pad); this.tiltPad = pad;
  }

  sheet(html, onClose) {
    const scrim = el(`<div class="scrim"><div class="card" role="dialog" aria-modal="true">${html}<div class="row"><button class="btn" data-a="close">Done</button></div></div></div>`);
    scrim.querySelector('[data-a="close"]').onclick = () => { this.audio.tap(); scrim.remove(); onClose?.(); };
    (this.game ? this.game.root : (this.screen || this.ui)).appendChild(scrim);
    return scrim;
  }

  showCodex(onClose, fromGame) {
    if (fromGame) this.game.closeModal();
    const cx = this.save.codex;
    const plantCols = { moss: '#6c9a3f', grass: '#93b553', fern: '#3f7a35', bloom: '#e59cc4', mushroom: '#d9c7a0', dewtrap: '#b8433c', algae: '#4f9a5a' };
    const creCols = { snail: '#9b6a3c', pillbug: '#5c5a5e', firefly: '#ffd97a', gnat: '#3a3530', frog: '#6f8f3c' };
    const entry = (key, name, blurb, col) => cx[key]
      ? `<div class="entry"><span class="dot" style="background:${col}"></span><div><h4>${name}</h4><p>${blurb}</p></div></div>`
      : `<div class="entry unknown"><span class="dot" style="background:#d8d0b8"></span><div><h4>Not yet found</h4><p>Keep tending jars to meet this species.</p></div></div>`;
    const plants = Object.values(PLANTS).map((p) => entry(p.key, p.name, p.blurb, plantCols[p.key])).join('');
    const cres = Object.entries(CREATURES).map(([k, c]) => entry(k, c.name, c.blurb, creCols[k])).join('');
    const found = Object.keys(cx).length, all = Object.keys(PLANTS).length + Object.keys(CREATURES).length;
    this.sheet(`<h2>Field guide</h2><p class="sub">${found} of ${all} species recorded</p>
      <div class="codex">${plants}${cres}</div>
      <p class="sub" style="margin-top:14px">How a jar works: water evaporates by day, beads on the glass at night and runs down the walls to the edge of the soil. Plants make oxygen in light; animals and rot use it. Nothing leaves a sealed jar.</p>`, onClose);
  }

  showSettings(onClose) {
    const s = this.save.settings;
    const sw = (k, label) => `<div class="setting"><span>${label}</span><button class="switch" role="switch" data-k="${k}" aria-checked="${s[k]}" aria-label="${label}"></button></div>`;
    const sc = this.sheet(`<h2>Settings</h2>
      ${sw('sound', 'Sound')}${sw('music', 'Ambience')}${sw('haptics', 'Haptics')}
      <div class="setting"><span>Tilting</span><div class="seg" role="group" aria-label="Tilt control">${['auto', 'motion', 'touch'].map((m) => `<button data-m="${m}" aria-pressed="${s.tilt === m}">${{ auto: 'Auto', motion: 'Motion', touch: 'Touch pad' }[m]}</button>`).join('')}</div></div>
      <div class="setting"><span>Progress</span><button class="btn ghost" data-a="reset" style="padding:8px 14px;font-size:15px">Clear all progress</button></div>`, onClose);
    sc.querySelectorAll('.switch').forEach((b) => { b.onclick = () => { s[b.dataset.k] = !s[b.dataset.k]; b.setAttribute('aria-checked', s[b.dataset.k]); this.applySettings(); this.persist(); this.audio.tap(); }; });
    sc.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => { s.tilt = b.dataset.m; sc.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); this.applySettings(); this.persist(); this.audio.tap(); }; });
    sc.querySelector('[data-a="reset"]').onclick = (e) => {
      const b = e.currentTarget;
      if (b.dataset.confirm) { this.save.stars = {}; this.save.best = {}; this.save.codex = {}; this.persist(); b.textContent = 'Progress cleared'; b.disabled = true; }
      else { b.dataset.confirm = '1'; b.textContent = 'Tap again to clear'; }
    };
  }
}

const app = new App();
window.__app = app;
app.init();
