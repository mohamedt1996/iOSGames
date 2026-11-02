import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export const native = Capacitor.isNativePlatform();
const KEY = 'pocket-ecosystem-v1';

const defaults = () => ({
  stars: {}, best: {}, codex: {}, seenIntro: {},
  settings: { sound: true, music: true, haptics: true, tilt: 'auto', speedHint: true, graphics: 'auto', autoTier: 'high' },
});

export async function loadSave() {
  try {
    let raw = null;
    if (native) raw = (await Preferences.get({ key: KEY })).value;
    if (!raw) raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw), base = defaults();
    return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  } catch { return defaults(); }
}
let pending = null;
export function saveGame(data) {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    const raw = JSON.stringify(data);
    try { localStorage.setItem(KEY, raw); } catch { /* storage unavailable */ }
    if (native) { try { await Preferences.set({ key: KEY, value: raw }); } catch { /* ignore */ } }
  }, 150);
}

let hapticsOn = true;
export function setHaptics(on) { hapticsOn = on; }
export function haptic(kind = 'light') {
  if (!hapticsOn) return;
  if (native) {
    if (kind === 'success') Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else if (kind === 'warn') Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
    else Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
  } else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 30 : kind === 'success' ? [10, 40, 10] : 8);
}

export async function platformReady() {
  if (!native) return;
  try { await StatusBar.setStyle({ style: Style.Light }); await StatusBar.setOverlaysWebView({ overlay: true }); } catch { /* ignore */ }
  try { await SplashScreen.hide(); } catch { /* ignore */ }
}
