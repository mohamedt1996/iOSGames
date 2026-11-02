import { World, R, G } from './sim/world.js';
import { GoalTracker, measure } from './sim/goals.js';
import { PLANTS, CREATURES, PLANT, plural } from './sim/species.js';
import { ICON } from './ui/icons.js';
import { haptic } from './platform.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtHour = (h) => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const SEED_COLORS = { moss: '#6c9a3f', grass: '#93b553', fern: '#3f7a35', bloom: '#e59cc4', mushroom: '#d9c7a0', dewtrap: '#b8433c', algae: '#4f9a5a' };
const CRE_COLORS = { snail: '#9b6a3c', pillbug: '#5c5a5e', firefly: '#ffd97a', frog: '#6f8f3c' };
const PLANT_BY_KEY = Object.fromEntries(Object.values(PLANTS).map((p) => [p.key, p]));

export class Game {
  constructor(app, level) {
    this.app = app; this.level = level;
    this.world = new World(level, (app.save.best[level.id]?.plays || 0) + 1);
    this.goals = new GoalTracker(level);
    this.speed = 1; this.state = 'intro'; this.tool = 'hand'; this.sub = null; this.lens = 0;
    this.zoom = 1; this.t = 0; this.hudAcc = 1; this.warned = {}; this.lastWarnT = -1e9; this.adviseAcc = 0;
    this.prevGoalsDone = 0;
    for (const g of this.goals.goals) g.m = measure(this.world, g);
    app.stage.attachWorld(this.world);
    this.root = el('<div class="game"></div>');
    app.ui.appendChild(this.root);
    this.buildHud();
    this.bindInput();
    this.discover();
    this.showIntro();
  }

  // ---------------- HUD ----------------
  buildHud() {
    const L = this.level;
    this.root.innerHTML = `
      <div class="hud-top">
        <div>
          <div class="tag">${L.sandbox ? 'Sandbox' : `${L.id}. ${L.name}`}<small>${L.sandbox ? 'Your own jar' : this.app.chapterName(L.chapter)}</small></div>
          <div class="clock" aria-live="off"><span class="ico"></span><span class="txt"></span></div>
        </div>
        <div class="hud-right">
          <button class="icon-btn pause-btn" aria-label="Pause">${ICON.pause}</button>
          <button class="speed" aria-label="Simulation speed">1×</button>
        </div>
      </div>
      <div class="goals" role="status"></div>
      <div class="gauges"></div>
      <div class="toasts"></div>
      <div class="toolbar-wrap">
        <div class="hint-line" hidden></div>
        <div class="subtray" hidden></div>
        <div class="toolbar">
          <div class="tools" role="toolbar" aria-label="Tools"></div>
        </div>
      </div>`;
    this.$ = (q) => this.root.querySelector(q);
    this.$('.pause-btn').onclick = () => this.pause();
    this.$('.speed').onclick = () => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1; this.$('.speed').textContent = `${this.speed}×`; this.app.audio.tap(); haptic(); };
    if (L.sandbox) this.$('.goals').hidden = true;
    // gauges
    const G3 = [
      { k: 'hum', icon: ICON.drop, label: 'Humidity', band: [55, 90], color: '#3b7fa8' },
      { k: 'temp', icon: ICON.temp, label: 'Temperature', band: [18, 28], color: '#c9773e' },
      { k: 'o2', icon: ICON.leaf, label: 'Oxygen', band: [19, 23], color: '#5f6f33' },
    ];
    this.$('.gauges').innerHTML = G3.map((g) => `<div class="gauge" data-k="${g.k}" aria-label="${g.label}">${g.icon}<div class="tube"><div class="band"></div><i style="background:${g.color}"></i></div><span>–</span></div>`).join('');
    this.gaugeDefs = G3;
    this.buildTools();
  }

  toolList() {
    const L = this.level, inv = this.world.inv, t = L.tools || [];
    const list = [{ id: 'hand', icon: ICON.hand, label: L.rotate === false ? 'Look' : 'Turn & inspect' }];
    if (t.includes('mist')) list.push({ id: 'mist', icon: ICON.mist, label: 'Mist', count: () => inv.mist });
    if (t.includes('seed')) list.push({ id: 'seed', icon: ICON.seed, label: 'Seeds', count: () => Object.values(inv.seeds || {}).reduce((a, b) => a + b, 0), sub: true });
    if (t.includes('creature')) list.push({ id: 'creature', icon: ICON.creature, label: 'Creatures', count: () => Object.values(inv.creatures || {}).reduce((a, b) => a + b, 0), sub: true });
    if (t.includes('prune')) list.push({ id: 'prune', icon: ICON.prune, label: 'Prune', count: () => inv.prune });
    if (t.includes('vent')) list.push({ id: 'vent', icon: ICON.vent, label: 'Vent lid', toggle: () => this.world.vent });
    if (t.includes('lamp')) list.push({ id: 'lamp', icon: ICON.lamp, label: 'Grow lamp', toggle: () => this.world.lamp, count: () => Math.ceil(this.world.lampBattery) + 'h' });
    list.push({ id: 'lens', icon: ICON.lens, label: 'Soil lens' });
    return list;
  }

  buildTools() {
    const wrap = this.$('.tools');
    this.tools = this.toolList();
    wrap.innerHTML = this.tools.map((t) => `<button class="tool" data-id="${t.id}" aria-label="${t.label}" aria-pressed="${t.id === this.tool}">${t.icon}${t.count ? '<span class="count"></span>' : ''}</button>`).join('');
    wrap.querySelectorAll('.tool').forEach((b) => { b.onclick = () => this.selectTool(b.dataset.id); });
    this.refreshTools();
  }

  selectTool(id) {
    const w = this.world;
    this.app.audio.tap(); haptic();
    if (id === 'vent') { w.act({ tool: 'vent' }); this.toast(w.vent ? 'Vent open — damp air escapes' : 'Vent closed'); this.refreshTools(); return; }
    if (id === 'lamp') {
      if (!w.act({ tool: 'lamp' })) this.toast('The lamp battery is empty', true);
      else this.toast(w.lamp ? 'Grow lamp on' : 'Grow lamp off');
      this.refreshTools(); return;
    }
    if (id === 'lens') {
      const modes = ['natural', 'moisture', 'light', 'nutrients'];
      this.lens = (this.lens + 1) % modes.length;
      this.app.stage.terrain.lens = modes[this.lens];
      this.app.stage.terrain.update(0);
      this.setHint(this.lens ? { moisture: 'Soil lens: moisture — blue is wet, tan is dry', light: 'Soil lens: daylight — yellow is bright, navy is shaded', nutrients: 'Soil lens: nutrients — green is rich' }[modes[this.lens]] : '');
      this.root.querySelector('.tool[data-id="lens"]').setAttribute('aria-pressed', this.lens ? 'true' : 'false');
      return;
    }
    this.tool = id;
    const def = this.tools.find((t) => t.id === id);
    if (def?.sub) this.openSub(id); else this.closeSub();
    this.refreshTools();
    const hints = { hand: this.level.rotate === false ? 'Tap the soil to inspect it' : 'Drag sideways to turn the jar. Tap the soil to inspect it', mist: 'Tap where you want a drink of water', prune: 'Tap a plant or mold patch to cut it away' };
    if (hints[id]) this.setHint(hints[id]);
  }

  openSub(kind) {
    const inv = this.world.inv, tray = this.$('.subtray');
    const items = kind === 'seed' ? Object.entries(inv.seeds || {}) : Object.entries(inv.creatures || {});
    if (!this.sub || !items.find(([k]) => k === this.sub)) this.sub = (items.find(([, n]) => n > 0) || items[0] || [null])[0];
    tray.innerHTML = items.map(([k, n]) => {
      const name = kind === 'seed' ? PLANT_BY_KEY[k].name : CREATURES[k].name;
      const col = kind === 'seed' ? SEED_COLORS[k] : CRE_COLORS[k];
      return `<button data-k="${k}" aria-pressed="${k === this.sub}" ${n > 0 ? '' : 'disabled'}><span class="dot" style="background:${col}"></span>${name.split(' ').pop()} ×${n > 90 ? '∞' : n}</button>`;
    }).join('');
    tray.hidden = false;
    tray.querySelectorAll('button').forEach((b) => { b.onclick = () => { this.sub = b.dataset.k; this.app.audio.tap(); this.openSub(kind); this.subHint(kind); }; });
    this.subHint(kind);
  }
  subHint(kind) {
    if (!this.sub) return;
    const d = kind === 'seed' ? PLANT_BY_KEY[this.sub] : CREATURES[this.sub];
    this.setHint(`${d.name}: ${d.blurb}`);
  }
  closeSub() { this.$('.subtray').hidden = true; }
  setHint(t) { const h = this.$('.hint-line'); h.textContent = t; h.hidden = !t; clearTimeout(this._hintT); if (t) this._hintT = setTimeout(() => { h.hidden = true; }, 6000); }

  refreshTools() {
    const w = this.world;
    for (const t of this.tools) {
      const b = this.root.querySelector(`.tool[data-id="${t.id}"]`); if (!b) continue;
      if (t.count) { const c = t.count(); const s = b.querySelector('.count'); s.textContent = typeof c === 'number' && c > 90 ? '∞' : c; s.hidden = c === 0 || c === '0h'; }
      if (t.toggle) b.classList.toggle('on', !!t.toggle());
      if (!['vent', 'lamp', 'lens'].includes(t.id)) b.setAttribute('aria-pressed', t.id === this.tool ? 'true' : 'false');
    }
  }

  updateHud() {
    const w = this.world, g = this.goals;
    const night = w.isNight();
    this.$('.clock .ico').innerHTML = night ? ICON.moon : ICON.sun;
    this.$('.clock .txt').textContent = `Day ${Math.floor(w.day) + 1} · ${fmtHour(w.hour)}`;
    const vals = { hum: Math.round(w.rh * 100), temp: Math.round(w.temp), o2: +w.o2.toFixed(1) };
    const ranges = { hum: [0, 100], temp: [12, 36], o2: [12, 26] };
    for (const d of this.gaugeDefs) {
      const node = this.root.querySelector(`.gauge[data-k="${d.k}"]`);
      const [a, b] = ranges[d.k], v = vals[d.k];
      const f = Math.max(0.02, Math.min(1, (v - a) / (b - a)));
      node.querySelector('i').style.height = `${f * 100 - 3}%`;
      const band = node.querySelector('.band');
      band.style.bottom = `${((d.band[0] - a) / (b - a)) * 100}%`; band.style.height = `${((d.band[1] - d.band[0]) / (b - a)) * 100}%`;
      node.querySelector('span').textContent = d.k === 'hum' ? `${v}%` : d.k === 'temp' ? `${v}°` : `${v}%`;
    }
    if (!this.level.sandbox) {
      const items = g.goals.map((x) => {
        const m = x.m || { v: '–', t: x.min ?? x.max ?? '' };
        let pct = 0;
        if (x.mode === 'sustain') pct = x.done ? 1 : Math.min(1, x.held / x.hours);
        else if (typeof m.v === 'number' && typeof m.t === 'number') pct = m.inverse ? (m.v <= m.t ? 1 : Math.max(0, 1 - (m.v - m.t) / Math.max(10, m.t * 3))) : Math.min(1, m.v / Math.max(1, m.t));
        else pct = m.ok ? 1 : 0;
        const val = x.mode === 'sustain' ? `${Math.floor(x.held)}/${x.hours} h` : `${m.v}${m.unit || ''}${m.inverse ? ` / ≤${m.t}` : ` / ${m.t}`}`;
        const done = x.mode === 'hold' ? m.ok : x.done;
        return `<li class="${done ? 'done' : ''}"><span class="chk"></span><span>${m.label}</span><span class="val">${val}</span><span class="bar"><i style="width:${pct * 100}%"></i></span></li>`;
      }).join('');
      const left = this.level.days ? Math.max(0, this.level.days - w.day) : null;
      this.$('.goals').innerHTML = `<ul>${items}</ul>${left != null ? `<div class="limit">${left < 1 ? `${Math.ceil(left * 24)} hours left` : `${Math.ceil(left)} days left`}</div>` : ''}`;
    }
    this.refreshTools();
  }

  toast(msg, warn = false) {
    const box = this.$('.toasts');
    const t = el(`<div class="toast${warn ? ' warn' : ''}" role="status"></div>`); t.textContent = msg;
    box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 3300);
  }

  // ---------------- Input ----------------
  bindInput() {
    const cvs = this.app.stage.renderer.domElement;
    const pts = new Map();
    let drag = null, pinch0 = null;
    const down = (e) => {
      if (this.state !== 'play') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.app.audio.start();
      if (pts.size === 1) drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, rot0: this.world.rot, moved: false, t0: performance.now() };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom }; drag = null; }
    };
    const move = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch0 && pts.size === 2) { const [a, b] = [...pts.values()]; this.zoom = Math.max(0.72, Math.min(1.25, pinch0.z * pinch0.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)))); return; }
      if (!drag) return;
      const dx = e.clientX - drag.x0;
      if (Math.abs(dx) > 8 || Math.abs(e.clientY - drag.y0) > 8) drag.moved = true;
      if (drag.moved && this.tool === 'hand' && this.level.rotate !== false) {
        this.world.setRotation(drag.rot0 - dx * 0.008);
        if (Math.abs(e.clientX - drag.x) > 30) { haptic(); drag.x = e.clientX; }
      }
    };
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch0 = null;
      if (drag && !drag.moved && pts.size === 0) this.tap(e.clientX, e.clientY);
      if (pts.size === 0) drag = null;
    };
    cvs.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    this.unbind = () => { cvs.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    // keyboard tilt for desktop testing
    this.keys = new Set();
    const kd = (e) => { this.keys.add(e.key.toLowerCase()); if (e.key === ' ') this.state === 'play' ? this.pause() : null; };
    const ku = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const prevUnbind = this.unbind; this.unbind = () => { prevUnbind(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }

  tap(x, y) {
    const p = this.app.stage.pick(x, y);
    const w = this.world;
    if (!p || Math.hypot(p.x, p.z) > R) { this.hideInspect(); return; }
    if (this.tool === 'hand') { this.inspect(p, x, y); return; }
    let ok = false;
    if (this.tool === 'mist') { ok = w.act({ tool: 'mist', x: p.x, z: p.z }); if (ok) this.app.audio.mist(); else this.toast('No mist left', true); }
    else if (this.tool === 'seed') {
      if (!this.sub) return;
      ok = w.act({ tool: 'seed', type: this.sub, x: p.x, z: p.z });
      if (ok) { this.app.audio.place(); this.openSub('seed'); this.discoverKey(this.sub); } else this.toast(w.inv.seeds?.[this.sub] > 0 ? 'Nothing can take root there' : 'No seeds of that kind left', true);
    } else if (this.tool === 'creature') {
      if (!this.sub) return;
      ok = w.act({ tool: 'creature', type: this.sub, x: p.x, z: p.z });
      if (ok) { this.app.audio.place(); this.openSub('creature'); this.toast(`Released ${this.sub === 'frog' ? 'the frog' : `a pair of ${plural(CREATURES[this.sub].name.toLowerCase())}`}`); this.discoverKey(this.sub); }
    } else if (this.tool === 'prune') {
      ok = w.act({ tool: 'prune', x: p.x, z: p.z });
      if (ok) this.app.audio.place(); else this.toast(w.inv.prune > 0 ? 'Nothing to cut there' : 'Your shears are worn out', true);
    }
    if (ok) { haptic('medium'); this.refreshTools(); }
  }

  inspect(p, sx, sy) {
    const w = this.world, k = w.idx(p.x, p.z);
    if (k < 0) return;
    this.hideInspect();
    const t = w.pType[k];
    const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    const soil = ['Soil', 'Sand', 'Clay', 'Stone'][w.soil[k]];
    let title = soil, warn = '';
    if (t) {
      const S = PLANTS[t];
      title = S.name;
      if (!S.aquatic && w.m[k] < S.moist[0]) warn = 'Too dry here';
      else if (!S.aquatic && w.m[k] > S.moist[1]) warn = 'Waterlogged';
      else if (w.la[k] < S.light[0] - 0.05) warn = 'Not enough light';
      else if (w.la[k] > S.light[1] + 0.05) warn = 'Too much sun';
      else if (S.nut > 0 && w.nu[k] < 0.08) warn = 'Starved soil';
      else if (w.mold[k] > 0.2) warn = 'Mold is spreading here';
    }
    const box = el(`<div class="inspect"><h4></h4><dl>
      ${t ? `<dt>Health</dt><dd>${pct(w.pHealth[k])}</dd><dt>Growth</dt><dd>${pct(w.pBio[k])}</dd>` : ''}
      <dt>Moisture</dt><dd>${pct(w.m[k])}</dd><dt>Daylight</dt><dd>${pct(w.la[k] / 0.8)}</dd><dt>Nutrients</dt><dd>${pct(w.nu[k])}</dd>
      ${w.det[k] > 0.05 ? `<dt>Rot</dt><dd>${pct(w.det[k])}</dd>` : ''}${w.w[k] > 0.002 ? `<dt>Standing water</dt><dd>${(w.w[k] * 1000).toFixed(0)} mm</dd>` : ''}
    </dl>${warn ? `<p>${warn}</p>` : ''}</div>`);
    box.querySelector('h4').textContent = title + (t && w.pType[k] === PLANT.BLOOM && w.pBloom[k] > 0.7 ? ' (in flower)' : '');
    this.root.appendChild(box);
    const bw = 200, x = Math.min(window.innerWidth - bw - 10, Math.max(10, sx - bw / 2));
    box.style.left = `${x}px`; box.style.top = `${Math.max(80, sy - box.offsetHeight - 24)}px`;
    this.inspectBox = box; clearTimeout(this._inspT); this._inspT = setTimeout(() => this.hideInspect(), 4500);
    if (t) this.discoverKey(PLANTS[t].key);
  }
  hideInspect() { this.inspectBox?.remove(); this.inspectBox = null; }

  // ---------------- Codex discovery ----------------
  discover() {
    const w = this.world;
    for (const k of w.insideList) if (w.pType[k]) this.discoverKey(PLANTS[w.pType[k]].key);
    for (const c of w.creatures) this.discoverKey(c.type);
    for (const k of Object.keys(this.level.inventory?.seeds || {})) this.discoverKey(k);
    for (const k of Object.keys(this.level.inventory?.creatures || {})) this.discoverKey(k);
  }
  discoverKey(k) { const cx = this.app.save.codex; if (!cx[k]) { cx[k] = true; this.app.persist(); } }

  // ---------------- Flow ----------------
  showIntro() {
    const L = this.level;
    if (L.sandbox) { this.state = 'play'; this.selectTool('hand'); return; }
    const goals = this.goals.goals.map((g) => { const m = measure(this.world, g); const tgt = g.hours ? '' : ` (${m.inverse ? 'at most ' : ''}${m.t})`; return `<li>${g.label || m.label}${g.label ? '' : tgt}</li>`; }).join('');
    const bonus = this.goals.bonusLabel();
    this.modal(`<h2>${L.name}</h2><p class="sub">Jar ${L.id} · ${this.app.chapterName(L.chapter)}</p>
      <p class="story">${L.story}</p>
      <strong>To finish this jar</strong><ul class="goal-list">${goals}</ul>
      <p class="sub">Within ${L.days} days. Two stars by day ${L.par}${bonus ? `; three if you also: ${bonus.toLowerCase()}` : ''}.</p>
      <div class="hintbox">${L.hint}</div>
      <div class="row"><button class="btn ghost" data-a="back">Leave</button><button class="btn" data-a="go">Begin</button></div>`, {
      go: () => { this.closeModal(); this.state = 'play'; this.app.requestMotion(); this.selectTool('hand'); this.setHint(L.hint); },
      back: () => this.app.toLevels(),
    });
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.modal(`<h2>Paused</h2><p class="sub">${this.level.sandbox ? 'Sandbox' : `Jar ${this.level.id} · ${this.level.name}`}</p>
      ${this.level.sandbox ? '' : `<div class="hintbox">${this.level.hint}</div>`}
      <div class="row"><button class="btn" data-a="resume">Resume</button></div>
      <div class="row"><button class="btn ghost" data-a="restart">${ICON.retry} Restart</button><button class="btn ghost" data-a="guide">${ICON.book} Field guide</button></div>
      <div class="row"><button class="btn ghost" data-a="cal">Re-level tilt</button><button class="btn ghost" data-a="quit">Leave jar</button></div>`, {
      resume: () => { this.closeModal(); this.state = 'play'; },
      restart: () => this.app.startLevel(this.level),
      guide: () => this.app.showCodex(() => { this.state = 'play'; this.pause(); }, true),
      cal: () => { this.app.motion.calibrate(); this.closeModal(); this.state = 'play'; this.toast('Tilt re-leveled'); },
      quit: () => this.app.toLevels(),
    });
  }

  modal(html, actions) {
    this.closeModal();
    const scrim = el(`<div class="scrim"><div class="card" role="dialog" aria-modal="true">${html}</div></div>`);
    scrim.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { this.app.audio.start(); this.app.audio.tap(); actions[b.dataset.a]?.(); }; });
    this.root.appendChild(scrim); this.modalEl = scrim;
  }
  closeModal() { this.modalEl?.remove(); this.modalEl = null; }

  finish() {
    const w = this.world, g = this.goals, L = this.level, app = this.app;
    this.state = 'over';
    if (g.won) {
      const stars = g.stars(w);
      const prev = app.save.stars[L.id] || 0;
      app.save.stars[L.id] = Math.max(prev, stars);
      const best = app.save.best[L.id] || {}; best.plays = (best.plays || 0) + 1; best.day = Math.min(best.day ?? 99, g.winDay); app.save.best[L.id] = best;
      app.persist();
      app.audio.chime(); haptic('success');
      const peak = Object.entries(w.stats.peak).filter(([t, n]) => n > 0 && t !== 'gnat').map(([t, n]) => `<span>Most ${plural(CREATURES[t].name.toLowerCase())}</span><span>${n}</span>`).join('');
      const next = app.levels.find((l) => l.id === L.id + 1);
      this.modal(`<h2>${['', 'The jar lives', 'A thriving jar', 'A perfect jar'][stars]}</h2>
        <div class="bigstars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">${ICON.star}</span>`).join('')}</div>
        <div class="stat-grid"><span>Finished on</span><span>Day ${Math.floor(g.winDay) + 1}</span><span>Two-star target</span><span>Day ${L.par}</span>
        ${g.bonusLabel() ? `<span>${g.bonusLabel()}</span><span>${stars === 3 ? 'Done' : 'Missed'}</span>` : ''}
        <span>Tools used</span><span>${w.toolUses}</span>${peak}</div>
        <div class="row"><button class="btn ghost" data-a="retry">${ICON.retry} Replay</button>${next ? '<button class="btn" data-a="next">Next jar</button>' : '<button class="btn" data-a="levels">All jars</button>'}</div>`, {
        retry: () => app.startLevel(L), next: () => app.startLevel(next), levels: () => app.toLevels(),
      });
    } else {
      app.audio.sad(); haptic('warn');
      const best = app.save.best[L.id] || {}; best.plays = (best.plays || 0) + 1; app.save.best[L.id] = best; app.persist();
      this.modal(`<h2>The jar faltered</h2><p class="story">${g.reason}</p><div class="hintbox">${L.hint}</div>
        <div class="row"><button class="btn ghost" data-a="levels">All jars</button><button class="btn" data-a="retry">${ICON.retry} Try again</button></div>`, {
        retry: () => app.startLevel(L), levels: () => app.toLevels(),
      });
    }
  }

  // ---------------- Per-frame ----------------
  update(dt) {
    const w = this.world;
    this.t += dt;
    // tilt
    let tx = 0, tz = 0;
    const m = this.app.motion;
    if (m.active) { tx = m.x; tz = m.z; }
    if (this.keys.has('arrowleft') || this.keys.has('a')) tx = -1;
    if (this.keys.has('arrowright') || this.keys.has('d')) tx = 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) tz = -1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) tz = 1;
    // screen/world -> jar-local
    const a = w.rot;
    w.setTilt(tx * Math.cos(a) + tz * Math.sin(a), -tx * Math.sin(a) + tz * Math.cos(a));

    if (this.state === 'play') {
      const t0 = w.time;
      w.update(dt, this.speed);
      if (w.time !== t0) this.goals.update(w, w.time - t0);
      this.handleEvents();
      this.adviseAcc += w.time - t0;
      if (this.adviseAcc > 120) { this.adviseAcc = 0; this.advise(); }
      const done = this.goals.goals.filter((g) => g.done || (g.mode === 'hold' && g.m?.ok)).length;
      if (done > this.prevGoalsDone && !this.goals.won) { this.app.audio.goal(); haptic('light'); }
      this.prevGoalsDone = done;
      if (this.goals.won || this.goals.lost) this.finish();
    } else w.events.length = 0;
    this.app.audio.update(w, dt);
    this.hudAcc += dt;
    if (this.hudAcc > 0.25) { this.hudAcc = 0; this.updateHud(); }
    this.app.stage.render(dt, this.t, { zoom: this.zoom });
  }

  handleEvents() {
    const w = this.world, A = this.app.audio;
    let plinks = 0, blooms = 0, hatch = 0;
    for (const e of w.events) {
      if (e.e === 'drip') plinks++;
      else if (e.e === 'bloom') { blooms++; this.discoverKey('bloom'); }
      else if (e.e === 'hatch') { hatch++; this.discoverKey(e.type); }
      else if (e.e === 'born' && e.type === 'gnat') this.discoverKey('gnat');
      else if (e.e === 'die' && (e.type === 'frog')) this.toast('The frog has died', true);
      else if (e.e === 'tongue') { /* snap */ }
      else if (e.e === 'sprout' && e.t === PLANT.MUSHROOM) this.discoverKey('mushroom');
    }
    w.events.length = 0;
    if (plinks && Math.random() < 0.5) A.plink();
    if (blooms) { A.bloom(); if (!this.warned.firstBloom) { this.warned.firstBloom = true; this.toast('A Starbloom has opened'); } }
    if (hatch) A.hatch();
  }

  advise() {
    const w = this.world;
    if (w.time - this.lastWarnT < 360) return;
    const causes = { dry: 0, wet: 0, dark: 0, sun: 0, starved: 0, mold: 0 };
    let n = 0;
    for (const k of w.insideList) {
      const t = w.pType[k]; if (!t || w.pHealth[k] > 0.55) continue;
      const S = PLANTS[t]; n++;
      if (!S.aquatic && w.m[k] < S.moist[0]) causes.dry++;
      else if (!S.aquatic && w.w[k] > S.drown) causes.wet++;
      else if (w.la[k] < S.light[0]) causes.dark++;
      else if (w.la[k] > S.light[1]) causes.sun++;
      else if (w.mold[k] > 0.2) causes.mold++;
      else causes.starved++;
    }
    const msgs = {
      dry: 'Plants are drying out. Tilt water toward them or mist.', wet: 'Roots are drowning in standing water. Tilt it away.',
      dark: 'Some plants need more light. Turn the jar toward the window.', sun: 'Some plants are scorching. Turn them away from the window.',
      starved: 'The soil is running out of nutrients.', mold: 'Mold is attacking plants. Dry the air or prune it.',
    };
    let msg = null;
    if (n >= 6) { const top = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]; if (top[1] > 0) msg = msgs[top[0]]; }
    if (!msg && w.creatures.filter((c) => c.state === 'dormant').length >= 2) msg = 'Animals have sealed themselves in. The air is too dry.';
    if (!msg && w.moldCells > 3) msg = msgs.mold;
    if (!msg && w.count('gnat') > 12) msg = 'Gnats are swarming over the rot.';
    if (!msg && w.o2 < 17) msg = 'Oxygen is running low.';
    if (!msg && w.creatures.some((c) => c.type === 'frog' && c.dryWarn)) msg = 'The frog needs a bigger pond.';
    if (msg && this.warned.last !== msg) { this.toast(msg, true); this.app.audio.warn(); this.lastWarnT = w.time; this.warned.last = msg; }
    else if (!msg) this.warned.last = null;
  }

  destroy() { this.unbind?.(); this.root.remove(); this.app.stage.clearWorld(); }
}

export { G };
