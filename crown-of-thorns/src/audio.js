// Procedural court music (a plucked modal lute line over a drone) and table sounds.
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15];
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.music = true; this.next = 0; this.step = 0; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0; this.master.connect(ctx.destination);
    this.musicG = ctx.createGain(); this.musicG.gain.value = this.music ? 0.32 : 0; this.musicG.connect(this.master);
    // a soft room
    const len = ctx.sampleRate * 2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.35; this.verb.connect(vg); vg.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noise = nb;
    for (const [f, v] of [[73.4, 0.05], [110, 0.03]]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(this.musicG); o.start(); }
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.8 : 0; }
  setMusic(on) { this.music = on; if (this.musicG) this.musicG.gain.value = on ? 0.32 : 0; }
  update() {
    const ctx = this.ctx; if (!ctx || !this.music) return;
    if (ctx.currentTime < this.next) return;
    const beat = 0.42;
    const phrase = [0, 4, 7, 4, 2, 5, 9, 5, 3, 6, 8, 6, 4, 2, 1, 0];
    const deg = phrase[this.step % 16] + (Math.floor(this.step / 16) % 2 ? 1 : 0);
    if (Math.random() > 0.12) this.pluck(146.8 * Math.pow(2, SCALE[deg % SCALE.length] / 12), 0.07, this.musicG);
    if (this.step % 4 === 0) this.pluck(73.4 * Math.pow(2, SCALE[(deg + 2) % 7] / 12), 0.05, this.musicG);
    this.step++; this.next = Math.max(ctx.currentTime, this.next) + beat * (this.step % 8 === 7 ? 2 : 1);
  }
  pluck(f, vol, dest = this.master, when = 0) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(lp); lp.connect(g); g.connect(dest); g.connect(this.verb); o.start(t); o.stop(t + 1.3);
  }
  tone(f, dur, type = 'sine', vol = 0.08, when = 0) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(freq, q, vol, dur, when = 0, type = 'bandpass') {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  tap() { this.tone(700, 0.05, 'triangle', 0.04); }
  card() { this.hiss(2500, 0.8, 0.12, 0.12); this.hiss(900, 1, 0.08, 0.08, 0.05); }
  flip() { this.hiss(3200, 1.2, 0.08, 0.07); }
  coin() { this.tone(1500, 0.12, 'square', 0.025); this.tone(2000, 0.18, 'square', 0.02, 0.07); }
  march() { for (let i = 0; i < 6; i++) this.hiss(220, 1.5, 0.12, 0.08, i * 0.16, 'lowpass'); }
  clash() { for (let i = 0; i < 5; i++) this.hiss(3000 + Math.random() * 2500, 9, 0.12, 0.2, i * 0.06); this.tone(80, 0.4, 'sine', 0.15); }
  horn() { this.tone(196, 1, 'sawtooth', 0.05); this.tone(294, 1, 'sawtooth', 0.03, 0.05); }
  betray() { [392, 370, 311].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.06, i * 0.18)); }
  victory() { [294, 370, 440, 587].forEach((f, i) => this.pluck(f, 0.12, this.master, i * 0.14)); this.horn(); }
  defeat() { [294, 262, 220, 196].forEach((f, i) => this.pluck(f, 0.1, this.master, i * 0.3)); }
}
