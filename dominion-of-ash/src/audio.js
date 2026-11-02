// Procedural battle audio: wind, a low war drone, steel, bowstrings, fire and horns. No sample files needed.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.music = true; this.last = {}; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.85 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // wind
    const w = ctx.createBufferSource(); w.buffer = buf; w.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500;
    this.windG = ctx.createGain(); this.windG.gain.value = 0.05;
    w.connect(wf); wf.connect(this.windG); this.windG.connect(this.master); w.start();
    this.windF = wf;
    // music bus: slow modal drone with a pulse
    this.musicG = ctx.createGain(); this.musicG.gain.value = this.music ? 0.5 : 0; this.musicG.connect(this.master);
    this.drone = [];
    for (const [f, v] of [[55, 0.08], [82.4, 0.05], [110, 0.035]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const g = ctx.createGain(); g.gain.value = v; o.connect(lp); lp.connect(g); g.connect(this.musicG); o.start();
      this.drone.push({ o, lp, g });
    }
    this.intensity = 0; this.nextBeat = 0; this.beat = 0; this.mode = 'calm';
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.85 : 0; }
  setMusic(on) { this.music = on; if (this.musicG) this.musicG.gain.value = on ? 0.5 : 0; }

  // intensity 0..1 drives drums and the drone filter
  update(dt, intensity, night) {
    const ctx = this.ctx; if (!ctx) return;
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 1.5);
    for (const d of this.drone) d.lp.frequency.value = 200 + this.intensity * 500 + (night ? -60 : 0);
    this.windG.gain.value = 0.035 + (1 - this.intensity) * 0.04;
    if (!this.music || this.intensity < 0.15) return;
    if (ctx.currentTime >= this.nextBeat) {
      const bpm = 70 + this.intensity * 40, step = 60 / bpm / 2;
      const pat = [1, 0, 0.4, 0, 0.8, 0, 0.4, 0.3];
      const v = pat[this.beat++ % 8];
      if (v) this.drum(0.25 * v * this.intensity, this.beat % 8 === 1 ? 52 : 70);
      this.nextBeat = Math.max(ctx.currentTime, this.nextBeat) + step;
    }
  }

  env(node, t, a, peak, dur) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  drum(vol, f = 60) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain(); this.env(g, t, 0.005, vol, 0.45); o.connect(g); g.connect(this.musicG); o.start(t); o.stop(t + 0.5);
  }
  burst(type, freq, q, vol, dur, when = 0, sweep) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, type = 'sine', vol = 0.1, when = 0, to) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.01, vol, dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  // rate-limit repeated sounds so big fights don't clip
  ok(k, gap) { const n = performance.now(); if (n - (this.last[k] || 0) < gap) return false; this.last[k] = n; return true; }

  clash() { if (!this.ctx || !this.ok('clash', 70)) return; const f = 2500 + Math.random() * 2500; this.burst('bandpass', f, 8, 0.12, 0.18); this.tone(f * 0.6, 0.12, 'triangle', 0.02); }
  thud() { if (!this.ctx || !this.ok('thud', 60)) return; this.burst('lowpass', 400, 1, 0.16, 0.12); }
  bow() { if (!this.ctx || !this.ok('bow', 90)) return; this.tone(180 + Math.random() * 40, 0.09, 'triangle', 0.05, 0, 90); this.burst('highpass', 3000, 1, 0.04, 0.2, 0.02, 1200); }
  boom() { if (!this.ctx) return; this.burst('lowpass', 900, 0.8, 0.5, 1.2, 0, 80); this.tone(70, 0.6, 'sine', 0.25, 0, 35); }
  whoosh() { if (!this.ctx) return; this.burst('bandpass', 600, 1.5, 0.12, 0.5, 0, 1800); }
  fire() { if (!this.ctx || !this.ok('fire', 300)) return; this.burst('bandpass', 1400, 0.6, 0.06, 0.6); }
  death() { if (!this.ctx || !this.ok('death', 120)) return; this.burst('lowpass', 300, 1, 0.2, 0.35); }
  bones() { if (!this.ctx || !this.ok('bones', 100)) return; for (let i = 0; i < 4; i++) this.burst('bandpass', 1800 + Math.random() * 1500, 12, 0.07, 0.05, i * 0.04); }
  horn(low = false) { if (!this.ctx) return; const f = low ? 98 : 147; this.tone(f, 1.6, 'sawtooth', 0.07); this.tone(f * 1.5, 1.6, 'sawtooth', 0.04, 0.05); this.tone(f * 2, 1.2, 'square', 0.015, 0.1); }
  wail() { if (!this.ctx) return; this.tone(420, 1.4, 'sawtooth', 0.05, 0, 160); this.tone(430, 1.4, 'sine', 0.06, 0.05, 150); }
  magic() { if (!this.ctx) return; [660, 990, 1320].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.04, i * 0.05)); }
  shield() { if (!this.ctx) return; this.tone(520, 0.3, 'triangle', 0.07); this.burst('bandpass', 4000, 6, 0.06, 0.2); }
  tap() { this.tone(520, 0.06, 'triangle', 0.05); }
  order() { this.tone(330, 0.08, 'triangle', 0.06); this.tone(440, 0.08, 'triangle', 0.04, 0.05); }
  victory() { [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.9, 'sawtooth', 0.04, i * 0.16)); this.horn(); }
  defeat() { [220, 196, 165, 131].forEach((f, i) => this.tone(f, 1, 'triangle', 0.06, i * 0.3)); }
  coin() { this.tone(1320, 0.1, 'square', 0.03); this.tone(1760, 0.15, 'square', 0.03, 0.06); }

  onEvent(e) {
    switch (e.e) {
      case 'hit': e.ranged ? this.thud() : this.clash(); break;
      case 'attack': if (e.ranged) this.bow(); break;
      case 'death': e.bones ? this.bones() : this.death(); break;
      case 'explode': this.boom(); break;
      case 'ignite': this.fire(); break;
      case 'ability': if (e.ab === 'wail') this.wail(); else if (e.ab === 'rally') this.horn(); else if (e.ab === 'fireball') this.whoosh(); else if (e.ab === 'shieldwall') this.shield(); else if (e.ab === 'raise') this.magic(); else this.whoosh(); break;
      case 'herofall': this.horn(true); break;
    }
  }
}
