import { Game } from './game/game.js';
import { CARDS } from './game/cards.js';
import { HOUSES, PROVINCE, RECRUIT_COST, PLACEMENTS } from './game/realm.js';
import { STYLES, notes, trustOf } from './game/ai.js';
import { RealmView } from './render/realmview.js';
import { icon } from './ui/icons.js';
import { haptic } from './platform.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// One game at the table: court, placement, reveal, and the council's lessons at the end.
export class GameScreen {
  constructor(app, cfg, opts = {}) {
    this.app = app; this.o = opts; this.cfg = cfg;
    this.mem = app.save.memory;
    this.notesBefore = notes(this.mem).join('|');
    this.game = new Game(cfg, this.mem);
    this.r = this.game.realm; this.me = this.game.human;
    const st = app.stage;
    st.setMood(false);
    this.view = new RealmView(st.scene, this.r);
    st.onResize = (px) => this.view.setScale(px); this.view.setScale(st.renderer.domElement.height);
    st.addClouds(this.view.R * 2.5 + 8, 9);
    const B = this.view.R * 1.8 + 1;
    st.frame({ x0: -B, x1: B, z0: -B, z1: B }, this.view.R * 5.2 + 5);
    st.rig.tx = 0; st.rig.tz = 1.5; st.rig.minD = 7; st.rig.maxD = this.view.R * 9 + 10; st.rig.pitch = 1.0; st.rig.yaw = 0;
    this.sel = null;
    this.build(); this.bindInput();
    this.startRound();
  }

  // ---------------- DOM ----------------
  build() {
    const el = document.createElement('div'); el.className = 'table-hud';
    el.innerHTML = `
      <div class="top">
        <div class="row1"><button class="rb" data-a="menu">${icon('back')}</button><div class="round"></div><div class="purse"></div></div>
        <div class="houses"></div>
      </div>
      <div class="labels"></div>
      <div class="banner"></div>
      <div class="ticker"></div>
      <div class="bottom">
        <div class="court hidden"></div>
        <div class="handbar hidden"><div class="hand"></div><div class="hand-actions"><span class="slot"></span><button class="ghost" data-a="pass">Pass</button></div></div>
      </div>
      <div class="sheet-wrap hidden"></div>`;
    this.app.ui.appendChild(el); this.hud = el;
    el.addEventListener('click', (e) => this.onClick(e));
  }

  refreshTop() {
    const r = this.r, me = r.house(this.me);
    this.hud.querySelector('.round').innerHTML = `Round ${Math.min(r.round, r.maxRounds)}<small>/${r.maxRounds}</small> · <b>${{ court: 'Court', place: 'War table', resolve: 'Reveal' }[r.phase] || ''}</b>`;
    this.hud.querySelector('.purse').innerHTML = `<span>${icon('coin')} ${me.gold}</span><span>${icon('crown')} ${me.vp}<small>/${r.vpGoal}</small></span>`;
    const cur = r.current()?.id;
    this.hud.querySelector('.houses').innerHTML = r.houses.map((h) => {
      const pact = h.id !== this.me && r.pact(this.me, h.id) ? `<i class="pact">${icon('peace')}${r.pacts[r.pairKey(this.me, h.id)]}</i>` : '';
      const n = r.owned(h.id).length;
      return `<button class="hchip ${h.id === this.me ? 'me' : ''} ${h.alive ? '' : 'dead'} ${cur === h.id ? 'turn' : ''}" data-h="${h.id}" style="--c:${h.color}"><b>${h.short}</b><span>${icon('crown')}${h.vp}</span><span class="pc">${icon('flag')}${n}</span>${pact}</button>`;
    }).join('');
  }

  ticker(text, cls = '') {
    const t = this.hud.querySelector('.ticker');
    const p = document.createElement('p'); p.className = cls; p.innerHTML = text; t.prepend(p);
    while (t.children.length > 4) t.lastChild.remove();
    setTimeout(() => p.classList.add('old'), 4000);
  }
  bannerMsg(text, ms = 1600) { const b = this.hud.querySelector('.banner'); b.innerHTML = `<span>${text}</span>`; b.classList.add('show'); clearTimeout(this._b); this._b = setTimeout(() => b.classList.remove('show'), ms); }

  sheet(html, closable = false) {
    const s = this.hud.querySelector('.sheet-wrap');
    s.innerHTML = `<div class="sheet">${closable ? `<button class="x" data-a="close" aria-label="Close">${icon('x')}</button>` : ''}<div class="sheet-body">${html}</div></div>`;
    s.classList.remove('hidden');
  }
  closeSheet() { this.hud.querySelector('.sheet-wrap').classList.add('hidden'); }

  // ---------------- court ----------------
  startRound() {
    const r = this.r;
    if (this._started === r.round) return; this._started = r.round;
    this.closeSheet();
    this.view.clearTokens(); this.view.highlight(null); this.view.sync();
    this.offers = this.game.court();
    this.recruiting = false;
    this.refreshTop();
    this.bannerMsg(`Round ${r.round}`);
    if (r.round === 1 && this.o.intro) this.sheet(`<h2>${this.o.intro.name}</h2><p class="story">${this.o.intro.story}</p><p class="tip">${icon('eye')} ${this.o.intro.tip}</p><p class="muted">First to ${r.vpGoal} crowns wins. Castles give a crown each round; every four provinces held give another.</p><button class="big" data-a="close">Take your seat</button>`);
    this.renderCourt();
  }

  renderCourt() {
    const r = this.r, me = r.house(this.me);
    const c = this.hud.querySelector('.court'); c.classList.remove('hidden');
    this.hud.querySelector('.handbar').classList.add('hidden');
    const offers = this.offers.map((o, i) => {
      const h = r.house(o.from);
      const txt = o.kind === 'pact' ? `offers a pact for ${o.rounds} rounds.` : `demands <b>${o.gold} gold</b> in tribute, or else.`;
      return `<div class="offer" style="--c:${h.color}"><b>${h.short}</b> ${txt}<span><button class="mini ok" data-a="offer" data-i="${i}" data-y="1">${icon('check')}</button><button class="mini no" data-a="offer" data-i="${i}" data-y="0">${icon('x')}</button></span></div>`;
    }).join('');
    c.innerHTML = `
      ${offers ? `<div class="offers">${offers}</div>` : ''}
      <div class="market-title"><b>Market</b><small>Bought cards join your deck</small></div>
      <div class="market">${r.market.map((k, i) => `<button class="mcard ${me.gold < CARDS[k].cost ? 'poor' : ''}" data-a="buy" data-i="${i}">${this.cardHtml(k)}<span class="cost">${icon('coin')}${CARDS[k].cost}</span></button>`).join('')}</div>
      <div class="court-actions">
        <button class="ghost ${this.recruiting ? 'on' : ''}" data-a="recruit">${icon('plus')} Recruit <small>${RECRUIT_COST}g · tap a castle or town</small></button>
        <button class="big" data-a="table">${icon('swords')} To the war table</button>
      </div>`;
    if (this.recruiting) this.view.highlight(new Set(r.owned(this.me).filter((p) => r.canRecruit(this.me, p.id)).map((p) => p.id)), 0x9be07f);
  }

  cardHtml(k, extra = '') {
    const d = CARDS[k];
    return `<div class="card ${d.kind} ${extra}"><i>${icon(d.icon)}</i><b>${d.name}</b><small>${d.text}</small></div>`;
  }

  // ---------------- placement ----------------
  async toTable() {
    if (this.r.phase !== 'court' || this.busy || this.revealing || this._started !== this.r.round) return;
    this.view.highlight(null); this.recruiting = false;
    this.hud.querySelector('.court').classList.add('hidden');
    this.game.beginPlacement();
    this.refreshTop();
    await this.aiTurns();
  }

  async aiTurns() {
    if (this.busy) return;
    this.busy = true;
    try { await this._aiTurns(); } catch (e) { console.error(e); } finally { this.busy = false; }
    if (this.r.phase === 'resolve' && !this.revealing) { this.revealing = true; try { await this.reveal(); } catch (e) { console.error(e); } this.revealing = false; }
  }
  async _aiTurns() {
    const r = this.r;
    while (r.phase === 'place') {
      const cur = r.current();
      if (cur.id === this.me) { this.myTurn(); return; }
      this.refreshTop();
      await wait(this.app.fast ? 30 : 420);
      const o = this.game.ais[cur.id].decide();
      if (o) {
        const pl = r.place(cur.id, o);
        this.view.addToken(pl); this.app.audio.card();
        if (pl.kind === 'threat' && r.prov(pl.target).owner === this.me) { this.ticker(`<b style="color:${cur.color}">${cur.short}</b> places a card against <b>${r.prov(pl.target).name}</b>.`, 'warn'); haptic('light'); }
        if (pl.kind === 'spy' && r.placements[pl.spyOn]?.house === this.me) this.ticker(`<b style="color:${cur.color}">${cur.short}</b> spies on one of your cards.`, 'warn');
      } else { r.pass(cur.id); this.ticker(`<b style="color:${cur.color}">${cur.short}</b> passes.`); }
    }
    this.refreshTop();
  }

  myTurn() {
    this.refreshTop();
    const hb = this.hud.querySelector('.handbar'); hb.classList.remove('hidden');
    this.selCard = null; this.view.highlight(null);
    this.renderHand();
    haptic('light');
  }

  renderHand() {
    const r = this.r, me = r.house(this.me);
    const opts = r.options(this.me);
    const playable = new Set(opts.map((o) => o.hand));
    this.hud.querySelector('.hand').innerHTML = me.hand.map((k, i) => `<button class="hcard ${this.selCard === i ? 'sel' : ''} ${playable.has(i) ? '' : 'dim'}" data-a="card" data-i="${i}">${this.cardHtml(k)}</button>`).join('') || '<p class="muted">Your hand is empty.</p>';
    this.hud.querySelector('.slot').textContent = `Card ${r.placeRound + 1} of ${PLACEMENTS}`;
  }

  pickCard(i) {
    const r = this.r, opts = r.options(this.me).filter((o) => o.hand === i);
    if (!opts.length) { this.ticker('No legal place for that card.'); return; }
    this.selCard = i; this.selOpts = opts;
    const card = r.house(this.me).hand[i];
    let ids;
    if (CARDS[card].kind === 'spy') ids = new Set(opts.map((o) => r.placements[o.spyOn].target ?? r.placements[o.spyOn].from));
    else ids = new Set(opts.map((o) => o.target));
    this.view.highlight(ids, CARDS[card].kind === 'threat' ? 0xff7a5a : CARDS[card].kind === 'spy' ? 0xa79aff : 0x9ad0ff);
    this.renderHand(); this.app.audio.tap();
  }

  async placeAt(p) {
    const r = this.r;
    if (r.phase !== 'place' || r.current()?.id !== this.me || this.selCard == null) return;
    const card = r.house(this.me).hand[this.selCard];
    let o;
    if (CARDS[card].kind === 'spy') o = this.selOpts.find((x) => (r.placements[x.spyOn].target ?? r.placements[x.spyOn].from) === p.id);
    else o = this.selOpts.find((x) => x.target === p.id);
    if (!o) return;
    const pl = r.place(this.me, o);
    this.view.addToken(pl); this.view.highlight(null); this.app.audio.card(); haptic('medium');
    if (pl.peek) { this.view.peek(pl.peek.idx); const spied = r.placements[pl.peek.idx]; this.sheet(`<h2>${icon('eye')} Your spy reports</h2><p><b style="color:${HOUSES[spied.house].color}">${HOUSES[spied.house].short}</b>’s card on <b>${r.prov(spied.target ?? spied.from).name}</b> is:</p>${this.cardHtml(pl.peek.card, 'big-card')}<button class="big" data-a="close">Understood</button>`, true); }
    this.hud.querySelector('.handbar').classList.add('hidden');
    this.selCard = null;
    await this.aiTurns();
  }

  // ---------------- reveal ----------------
  async reveal() {
    const r = this.r;
    this.bannerMsg('Reveal!', 1200); this.app.audio.horn();
    const resolving = r.round;
    const snap = r.provinces.map((p) => ({ owner: p.owner, troops: p.troops, walls: p.walls }));
    const placements = [...r.placements];
    const goldBefore = Object.fromEntries(r.houses.map((h) => [h.id, h.gold]));
    const ev = this.game.resolve();
    const final = r.provinces.map((p) => ({ owner: p.owner, troops: p.troops, walls: p.walls }));
    r.provinces.forEach((p, i) => Object.assign(p, snap[i]));
    this.view.sync();
    for (const pl of placements) { this.view.reveal(pl.idx); await wait(this.app.fast ? 5 : 140); this.app.audio.flip(); }
    await wait(this.app.fast ? 20 : 900);
    const H = (id) => `<b style="color:${HOUSES[id].color}">${HOUSES[id].short}</b>`;
    const P = (id) => `<b>${r.prov(id).name}</b>`;
    for (const e of ev) {
      const p = e.prov != null ? r.prov(e.prov) : null;
      let ms = 0;
      switch (e.t) {
        case 'battle': {
          const src = r.prov(e.from); src.troops = 1;
          this.view.sync(); this.view.march(e.from, e.prov, e.house, e.atk, e.won); this.app.audio.march();
          await wait(this.app.fast ? 20 : 1000);
          this.view.clash(e.prov); this.app.audio.clash(); haptic('heavy');
          if (e.won) { p.owner = e.house; p.troops = e.left; if (p.walls && !e.siege) p.walls = Math.max(0, p.walls - 1); } else { p.troops = e.left; src.troops += e.back || 0; }
          const how = `${e.atk} vs ${e.def}${e.ambushed ? ', ambushed' : ''}${e.held ? ', held' : ''}`;
          this.ticker(e.won ? `${H(e.house)} takes ${P(e.prov)}${e.defender ? ` from ${H(e.defender)}` : ''} <small>(${how})</small>` : `${H(e.house)} breaks on ${P(e.prov)} <small>(${how})</small>`, e.defender === this.me && e.won ? 'bad' : e.house === this.me && e.won ? 'good' : '');
          ms = 500; break;
        }
        case 'reinforce': r.prov(e.from).troops = 1; p.troops += e.n; ms = 200; break;
        case 'levy': p.troops += e.n; this.view.sparkle(e.prov, [0.6, 1.4, 2.2]); ms = 220; break;
        case 'fortify': p.walls++; this.view.sparkle(e.prov, [1.6, 1.6, 1.6]); ms = 220; break;
        case 'gold': this.view.sparkle(e.prov, [2.4, 1.9, 0.6]); if (e.house === this.me) this.app.audio.coin(); ms = 160; break;
        case 'plague': p.troops -= e.n; this.view.sparkle(e.prov, [0.6, 1.8, 0.5]); this.ticker(`Plague in ${P(e.prov)}: ${e.n} soldiers die.`, e.house === this.me ? 'good' : 'bad'); ms = 500; break;
        case 'raid': this.ticker(e.blocked ? `${H(e.house)}’s raid on ${P(e.prov)} is turned away.` : `${H(e.house)} raids ${P(e.prov)} for ${e.n} gold.`); this.view.sparkle(e.prov, [2.4, 1.2, 0.4]); ms = 400; break;
        case 'feint': if (e.wasted) this.ticker(`${H(e.house)}’s card on ${P(e.prov)} was a <b>Feint</b>${p.owner === this.me ? '. Your defence was wasted.' : '.'}`, p.owner === this.me ? 'bad' : ''); ms = e.wasted ? 400 : 0; break;
        case 'rally': this.ticker(`${H(e.house)} rallies ${e.n} soldiers to ${P(e.prov)}.`); ms = 200; break;
        case 'betray': this.ticker(`${H(e.house)} <b>breaks the pact</b> with ${H(e.victim)}!`, 'bad'); this.app.audio.betray(); haptic('heavy'); ms = 900; break;
        case 'fallen': this.ticker(`${H(e.house)} has fallen.`, 'bad'); ms = 700; break;
        case 'fizzle': ms = 0; break;
      }
      if (ms) { this.view.sync(); this.refreshTop(); await wait(this.app.fast ? 5 : ms); }
    }
    r.provinces.forEach((p, i) => Object.assign(p, final[i]));
    this.view.sync();
    const me = r.house(this.me);
    if (me.alive) this.ticker(`Income +${me.lastIncome ?? 0} gold · crowns +${me.lastVp ?? 0}`);
    void goldBefore;
    this.refreshTop();
    this.app.persist();
    await wait(this.app.fast ? 10 : 700);
    if (r.over) return this.finish();
    if (this._started !== resolving) return;
    this.sheet(`<h2>Round ${r.round - 1} ends</h2>${this.standingsHtml()}<button class="big" data-a="next">${icon('play')} Next round</button>`);
  }

  standingsHtml() {
    const r = this.r;
    const rows = [...r.houses].sort((a, b) => b.vp - a.vp);
    return `<div class="standings">${rows.map((h) => `<div class="st-row ${h.id === this.me ? 'me' : ''} ${h.alive ? '' : 'dead'}" style="--c:${h.color}"><b>${h.name}</b><span>${icon('crown')} ${h.vp}</span><span>${icon('flag')} ${r.owned(h.id).length}</span><span>${icon('coin')} ${h.gold}</span></div>`).join('')}</div>`;
  }

  finish() {
    const r = this.r, won = r.winner === this.me;
    const rank = r.ranking.indexOf(this.me) + 1;
    const broke = r.trustLog.some((t) => t.by === this.me);
    const stars = won ? 1 + (r.round - 1 <= (this.o.fast ?? 99) ? 1 : 0) + (!broke ? 1 : 0) : 0;
    this.result = { won, rank, stars, rounds: r.round - 1, broke };
    won ? this.app.audio.victory() : this.app.audio.defeat();
    haptic(won ? 'success' : 'warn');
    const now = notes(this.mem);
    const fresh = now.filter((n) => !this.notesBefore.includes(n));
    this.sheet(`
      <h1 class="${won ? 'win' : 'loss'}">${won ? 'The Crown is yours' : `${HOUSES[r.winner].name} takes the Crown`}</h1>
      ${this.o.stars !== false && this.o.scenario ? `<div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div>` : ''}
      <p class="muted">You finished ${['', 'first', 'second', 'third', 'fourth'][rank]} after ${r.round - 1} rounds.${broke ? ' You broke a pact.' : ''}</p>
      ${this.standingsHtml()}
      <div class="council"><h3>${icon('book')} What the houses now believe</h3>
        <p class="muted">They played as <b>${STYLES[this.game.styleKey].name}s</b> this game. Trust in your word: ${Math.round(trustOf(this.mem) * 100)}%.</p>
        ${now.map((n) => `<p class="${fresh.includes(n) ? 'new' : ''}">${fresh.includes(n) ? '<em>New</em> ' : ''}${n}</p>`).join('') || '<p>They are still taking your measure.</p>'}
      </div>
      <button class="big" data-a="done">${icon('play')} Continue</button>`);
  }

  // ---------------- input ----------------
  async onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    this.app.audio.tap();
    const r = this.r, a = b.dataset.a;
    if (b.dataset.h && b.dataset.h !== this.me) return this.housePanel(b.dataset.h);
    switch (a) {
      case 'menu': return this.sheet(`<h2>Leave the table?</h2><p class="muted">This game will be abandoned. The houses keep what they learned.</p><button class="big" data-a="quit">Leave</button><button class="ghost" data-a="close">Stay</button>`, true);
      case 'quit': return this.o.onEnd?.(null);
      case 'close': this.closeSheet(); return;
      case 'offer': {
        const o = this.offers[+b.dataset.i]; if (!o) return;
        const msg = this.game.answerOffer(o, b.dataset.y === '1'); this.offers.splice(+b.dataset.i, 1);
        this.ticker(msg); this.refreshTop(); return this.renderCourt();
      }
      case 'buy': if (r.buy(this.me, +b.dataset.i)) { this.app.audio.coin(); haptic('light'); this.refreshTop(); } return this.renderCourt();
      case 'recruit': this.recruiting = !this.recruiting; if (!this.recruiting) this.view.highlight(null); return this.renderCourt();
      case 'table': return this.toTable();
      case 'card': return this.pickCard(+b.dataset.i);
      case 'pass': if (r.current()?.id !== this.me) return; this.hud.querySelector('.handbar').classList.add('hidden'); this.view.highlight(null); r.pass(this.me); return this.aiTurns();
      case 'next': if (this.r.phase !== 'court') return; this.closeSheet(); return this.startRound();
      case 'propose': {
        const res = this.game.proposePact(b.dataset.h2);
        this.closeSheet(); this.ticker(res.line, res.ok ? 'good' : 'bad'); this.refreshTop(); haptic(res.ok ? 'success' : 'warn'); return;
      }
      case 'done': return this.o.onEnd?.(this.result);
    }
  }

  housePanel(id) {
    const r = this.r, h = r.house(id);
    const pact = r.pact(this.me, id);
    const can = r.phase === 'court' && h.alive && !pact;
    const betrayed = this.mem.betrayals.filter((x) => x.on === id).length;
    this.sheet(`<h2 style="color:${h.color}">${h.name}</h2><p class="story">“${h.motto}”</p>
      <p>${icon('crown')} ${h.vp} crowns · ${icon('flag')} ${r.owned(id).length} provinces · ${icon('coin')} ${h.gold} gold · ${h.hand.length} cards in hand</p>
      ${pact ? `<p class="good">You are at peace for ${r.pacts[r.pairKey(this.me, id)]} more round(s).</p>` : ''}
      ${betrayed ? `<p class="bad">You have betrayed this house ${betrayed} time${betrayed > 1 ? 's' : ''}. It has not forgotten.</p>` : ''}
      ${can ? `<button class="big" data-a="propose" data-h2="${id}">${icon('peace')} Offer a 3-round pact</button>` : r.phase !== 'court' && !pact ? '<p class="muted">Pacts are offered at court, at the start of a round.</p>' : ''}
      <button class="ghost" data-a="close">Close</button>`, true);
  }

  bindInput() {
    const cv = this.app.stage.renderer.domElement, st = this.app.stage;
    const pts = new Map(); let pan = false, start = null, pinch = null;
    const down = (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { start = { x: e.clientX, y: e.clientY }; pan = false; } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; pan = true; } };
    const move = (e) => { const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) { if (!pan && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 9) pan = true; if (pan) st.pan(dx, dy); }
      else if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x); st.zoom(pinch.d / Math.max(1, d)); let da = ang - pinch.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; st.rotate(-da); pinch = { d, ang }; } };
    const up = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (!pts.size && !pan && start) this.tap(e.clientX, e.clientY); };
    const wheel = (e) => { e.preventDefault(); st.zoom(e.deltaY > 0 ? 1.08 : 0.93); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false });
    this.unbind = () => { cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); };
  }

  tap(x, y) {
    if (!this.hud.querySelector('.sheet-wrap').classList.contains('hidden')) return;
    const p = this.view.pick(this.app.stage.ground(x, y, this.view.ground));
    if (!p) return;
    const r = this.r;
    if (r.phase === 'court' && this.recruiting) {
      if (r.recruit(this.me, p.id)) { this.view.sync(); this.view.sparkle(p.id, [0.6, 1.4, 2.2]); this.app.audio.coin(); haptic('light'); this.refreshTop(); this.renderCourt(); }
      return;
    }
    if (r.phase === 'place' && r.current()?.id === this.me && this.selCard != null) return this.placeAt(p);
    // inspect
    this.app.audio.tap();
    const owner = p.owner ? HOUSES[p.owner] : null;
    this.ticker(`<b>${p.name}</b> · ${PROVINCE[p.type].name} · ${owner ? `<b style="color:${owner.color}">${owner.short}</b>` : 'unclaimed'} · ${p.troops} soldiers${p.walls ? ` · ${p.walls} wall${p.walls > 1 ? 's' : ''}` : ''}${PROVINCE[p.type].income ? ` · +${PROVINCE[p.type].income} gold` : ''}`);
  }

  step(dt, time) {
    this.view.update(dt, time);
    const w = innerWidth, h = innerHeight;
    const L = this.hud.querySelector('.labels');
    const items = this.view.project(this.app.stage.camera, w, h);
    let html = '';
    for (const it of items) {
      if (!it.vis) continue;
      const p = it.p, c = p.owner ? HOUSES[p.owner].color : '#cfc6b8';
      html += `<div class="pl ${p.owner === this.me ? 'mine' : ''}" style="left:${it.x | 0}px;top:${it.y | 0}px;--c:${c}">${p.troops}${p.walls ? `<i>${'▮'.repeat(p.walls)}</i>` : ''}</div>`;
    }
    L.innerHTML = html;
    this.app.audio.update?.(dt);
  }

  dispose() { this.unbind?.(); this.hud.remove(); this.view.dispose(); this.app.stage.onResize = null; }
}
export { cap };
