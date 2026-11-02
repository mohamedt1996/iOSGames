// Procedural soundscape: room air, water trickle, crickets at night, birds by day, UI tones.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.music = true; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0; this.master.connect(ctx.destination);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const wn = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * wn; d[i] = b * 3 + wn * 0.05; }
    this.noiseBuf = noiseBuf;
    const loop = (freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { g, f };
    };
    this.air = loop(420, 0.4, 0.05);
    this.water = loop(1800, 0.9, 0);
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = this.music ? 1 : 0; this.ambGain.connect(this.master);
    this.nextChirp = 0; this.nextBird = 0;
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.8 : 0; }
  setMusic(on) { this.music = on; if (this.ambGain) this.ambGain.gain.value = on ? 1 : 0; }

  tone(freq, dur = 0.15, type = 'sine', vol = 0.12, when = 0, dest) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  plink() { if (!this.ctx) return; const f = 1400 + Math.random() * 900; const o = this.tone(f, 0.18, 'sine', 0.06); o?.frequency.exponentialRampToValueAtTime(f * 0.6, this.ctx.currentTime + 0.15); }
  tap() { this.tone(660, 0.06, 'triangle', 0.05); }
  place() { this.tone(330, 0.12, 'triangle', 0.08); this.tone(495, 0.12, 'sine', 0.05, 0.05); }
  mist() {
    const ctx = this.ctx; if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.6);
  }
  chime() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.07, i * 0.09)); }
  goal() { [659, 988].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.07, i * 0.1)); }
  sad() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.06, i * 0.18)); }
  bloom() { this.tone(880 + Math.random() * 200, 0.5, 'sine', 0.035); }
  hatch() { this.tone(1200, 0.08, 'sine', 0.04); this.tone(1500, 0.08, 'sine', 0.03, 0.06); }
  warn() { this.tone(220, 0.25, 'square', 0.03); }

  update(w, dt) {
    const ctx = this.ctx; if (!ctx || !w) return;
    const t = ctx.currentTime;
    const flow = Math.min(1, (w.flowRate || 0) * 6);
    this.water.g.gain.setTargetAtTime(flow * 0.12, t, 0.15);
    this.air.g.gain.setTargetAtTime(w.vent ? 0.09 : 0.045, t, 0.5);
    if (!this.music) return;
    const night = w.isNight();
    if (t > this.nextChirp && night) {
      this.nextChirp = t + 0.6 + Math.random() * 1.6;
      const f = 4200 + Math.random() * 400;
      for (let i = 0; i < 3; i++) this.tone(f, 0.04, 'sine', 0.012, i * 0.07, this.ambGain);
    }
    if (t > this.nextBird && !night && w.sunI > 0.2) {
      this.nextBird = t + 4 + Math.random() * 9;
      const base = 1800 + Math.random() * 1400; let when = 0;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) {
        const o = this.tone(base, 0.12, 'sine', 0.01, when, this.ambGain);
        o?.frequency.exponentialRampToValueAtTime(base * (1.1 + Math.random() * 0.4), ctx.currentTime + when + 0.1);
        when += 0.13 + Math.random() * 0.08;
      }
    }
  }
}
