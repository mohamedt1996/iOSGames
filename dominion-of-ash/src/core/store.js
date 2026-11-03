import { createStore } from 'zustand/vanilla';

// One place for app-wide state that more than one system reacts to. Game simulations keep their own
// state; this store holds what the shell, renderer, audio and HUD share, and subscribers react to changes.
export const store = createStore((set, get) => ({
  screen: 'boot',
  settings: null,          // mirrors save.settings; change it only through setSetting()
  tier: 'high',            // graphics tier actually in use
  stats: { fps: 0, ms: 0, calls: 0, tris: 0, geos: 0, texs: 0 },
  paused: false,
  setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
  setScreen: (screen) => set({ screen }),
}));

// subscribe to one slice; fires only when that slice changes
export function watch(select, fn) {
  let prev = select(store.getState());
  return store.subscribe((s) => { const next = select(s); if (next !== prev) { const old = prev; prev = next; fn(next, old); } });
}
