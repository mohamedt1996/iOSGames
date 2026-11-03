import { store } from '../core/store.js';

const ORDER = ['high', 'balanced', 'battery'];

// Frame budget watchdog: measures real frame time, publishes stats, and when "auto" graphics is on,
// steps the quality tier down if the device can't hold ~40 fps (and back up once if it has lots of headroom).
export class PerfGovernor {
  constructor(stage) { this.stage = stage; this.reset(); this.upgraded = false; }
  reset() { this.win = 0; this.n = 0; this.sum = 0; this.slow = 0; this.fast = 0; this.grace = 2; }
  tick(rawMs) {
    if (rawMs > 1000) return; // tab was hidden or the app was paused
    this.grace -= rawMs / 1000;
    this.sum += rawMs; this.n++; this.win += rawMs;
    if (this.win < 2500) return;
    const avg = this.sum / this.n, info = this.stage.renderer.info;
    store.setState({ stats: { fps: Math.round(1000 / avg), ms: +avg.toFixed(1), calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, texs: info.memory.textures } });
    const s = store.getState().settings;
    if (s?.graphics === 'auto' && this.grace <= 0) {
      const i = ORDER.indexOf(store.getState().tier);
      if (avg > 25) this.slow++; else this.slow = 0;
      if (avg < 12) this.fast++; else this.fast = 0;
      if (this.slow >= 2 && i < ORDER.length - 1) this.setTier(ORDER[i + 1]);
      else if (this.fast >= 6 && i > 0 && !this.upgraded) { this.upgraded = true; this.setTier(ORDER[i - 1]); }
    }
    this.win = 0; this.n = 0; this.sum = 0;
  }
  setTier(t) {
    store.setState({ tier: t });
    store.getState().setSetting('autoTier', t);
    this.reset();
  }
}

// Compile every shader the scene will need before the first frame, so the first battle second doesn't hitch.
export function warmUp(stage) {
  const r = stage.renderer;
  try { (r.compileAsync ? r.compileAsync(stage.scene, stage.camera) : Promise.resolve(r.compile(stage.scene, stage.camera))).catch(() => {}); } catch { /* best effort */ }
}

// A small developer overlay: fps, frame time, draw calls, triangles and GPU memory objects.
export function statsOverlay() {
  const el = document.createElement('div'); el.className = 'perf-hud';
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(4px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:40;pointer-events:none;font:600 11px/1.3 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:6px;white-space:nowrap;display:none';
  document.body.appendChild(el);
  const draw = (st) => {
    el.style.display = st.settings?.stats ? 'block' : 'none';
    const s = st.stats; el.textContent = `${s.fps} fps · ${s.ms} ms · ${s.calls} draws · ${(s.tris / 1000).toFixed(0)}k tris · ${s.geos} geo · ${s.texs} tex · ${st.tier}`;
  };
  store.subscribe(draw); draw(store.getState());
}
