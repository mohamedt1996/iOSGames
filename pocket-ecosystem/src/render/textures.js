import * as THREE from 'three';
import { mulberry32 } from '../sim/rng.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

export function woodTexture() {
  const [c, g] = canvas(512, 512);
  const r = mulberry32(7);
  g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 180; i++) {
    const y = r() * 512, a = 0.04 + r() * 0.1;
    g.strokeStyle = r() > 0.5 ? `rgba(60,38,20,${a})` : `rgba(200,160,120,${a * 0.6})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (r() - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function strataTexture() {
  const [c, g] = canvas(64, 256);
  const r = mulberry32(3);
  // top -> bottom: soil, charcoal, moss mat, gravel
  const bands = [[0, 120, '#3b2a1e'], [120, 150, '#1d1b1a'], [150, 170, '#5b6b3a'], [170, 256, '#8d8a82']];
  for (const [a, b, col] of bands) { g.fillStyle = col; g.fillRect(0, a, 64, b - a); }
  for (let i = 0; i < 900; i++) {
    const y = r() * 256, x = r() * 64;
    const inGravel = y > 170;
    g.fillStyle = inGravel ? `hsl(${30 + r() * 20},${8 + r() * 10}%,${40 + r() * 35}%)` : `rgba(${r() > 0.5 ? '90,64,44' : '20,14,10'},${0.5})`;
    const s = inGravel ? 2 + r() * 5 : 1 + r() * 2;
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowSprite(color = '255,236,150') {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${color},1)`); grd.addColorStop(0.25, `rgba(${color},0.55)`); grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dropletTexture() {
  const [c, g] = canvas(512, 512);
  const r = mulberry32(11);
  g.clearRect(0, 0, 512, 512);
  // fine fog
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`; g.fillRect(r() * 512, r() * 512, 1.5, 1.5); }
  // droplets
  for (let i = 0; i < 420; i++) {
    const x = r() * 512, y = r() * 512, s = 1.5 + Math.pow(r(), 3) * 9;
    const grd = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.6, 'rgba(220,235,240,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, s * 0.85, s, 0, 0, Math.PI * 2); g.fill();
    if (s > 6 && r() > 0.5) { g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = s * 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 20 + r() * 50); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function fuzzTexture() {
  const [c, g] = canvas(64, 64);
  const r = mulberry32(5);
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 28;
    g.fillStyle = `rgba(240,240,235,${0.2 + r() * 0.5})`;
    g.fillRect(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function skyCanvas() { return canvas(1024, 640); }

export function soilTexture() {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(21);
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 150 + r() * 105; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 160; i++) {
    const x = r() * 256, y = r() * 256, s = 1 + r() * 3.5, v = 200 + r() * 55;
    g.fillStyle = `rgb(${v},${v - 5},${v - 12})`; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(60,60,60,0.35)'; g.beginPath(); g.ellipse(x + 0.8, y + 0.8, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Tileable ripple normal map for water (sum of sines, wraps cleanly).
export function rippleNormalTexture() {
  const N = 256, data = new Uint8Array(N * N * 4), r = mulberry32(31);
  const waves = Array.from({ length: 7 }, () => ({ kx: Math.round((r() - 0.5) * 10), ky: Math.round((r() - 0.5) * 10) || 1, a: 0.3 + r() * 0.7, p: r() * 6.28 }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) { const ph = (2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.p; const c = Math.cos(ph) * w.a; dx += c * w.kx; dy += c * w.ky; }
    const nx = -dx * 0.05, ny = -dy * 0.05, nz = 1, l = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4;
    data[i] = ((nx / l) * 0.5 + 0.5) * 255; data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255; data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function sparkSprite() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Soft painted view through the window: sky, sun/moon, distant tree canopy, stars at night.
const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) { return c1.map((v, i) => Math.round(lerp(v, c2[i], t))); }
const SKYK = [
  [0, [12, 20, 46], [26, 38, 70], [8, 14, 22]], [5, [26, 34, 70], [74, 70, 104], [16, 20, 30]], [6.5, [104, 128, 178], [244, 186, 140], [58, 70, 62]],
  [9, [126, 176, 218], [222, 234, 236], [78, 104, 82]], [15, [120, 170, 214], [226, 236, 236], [80, 106, 84]], [18, [100, 120, 170], [242, 168, 120], [62, 70, 60]],
  [19.5, [40, 50, 98], [108, 88, 120], [24, 28, 38]], [21, [14, 22, 50], [32, 46, 78], [10, 14, 22]], [24, [12, 20, 46], [26, 38, 70], [8, 14, 22]],
];
export function paintBackdrop(cv, g, hour, light) {
  let a = SKYK[0], b = SKYK[1];
  for (let i = 0; i < SKYK.length - 1; i++) if (hour >= SKYK[i][0] && hour <= SKYK[i + 1][0]) { a = SKYK[i]; b = SKYK[i + 1]; break; }
  const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
  const dim = 0.6 + 0.4 * Math.min(1, light);
  const top = mix(a[1], b[1], t).map((v) => v * dim), bot = mix(a[2], b[2], t).map((v) => v * dim), tree = mix(a[3], b[3], t).map((v) => v * dim);
  const W = cv.width, H = cv.height;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, `rgb(${top})`); grd.addColorStop(0.75, `rgb(${bot})`); grd.addColorStop(1, `rgb(${bot})`);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const night = hour < 5.5 || hour > 20;
  const r = mulberry32(77);
  if (night) {
    for (let i = 0; i < 140; i++) { const s = r() * 1.6 + 0.3; g.fillStyle = `rgba(255,255,240,${0.3 + r() * 0.6})`; g.fillRect(r() * W, r() * H * 0.6, s, s); }
    const mx = W * 0.72, my = H * 0.18;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 70); mg.addColorStop(0, 'rgba(240,240,220,0.9)'); mg.addColorStop(0.18, 'rgba(240,240,220,0.8)'); mg.addColorStop(0.22, 'rgba(200,210,230,0.15)'); mg.addColorStop(1, 'rgba(200,210,230,0)');
    g.fillStyle = mg; g.fillRect(0, 0, W, H);
  } else {
    const f = Math.max(0, Math.min(1, (hour - 6) / 12));
    const sx = W * (0.15 + f * 0.7), sy = H * (0.55 - Math.sin(f * Math.PI) * 0.45);
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 260);
    sg.addColorStop(0, `rgba(255,248,225,${0.95 * light})`); sg.addColorStop(0.08, `rgba(255,236,200,${0.6 * light})`); sg.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
  }
  // distant canopy: soft overlapping blobs
  for (let layer = 0; layer < 2; layer++) {
    const base = H * (layer ? 0.72 : 0.62), k = layer ? 1 : 0.8;
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = base + (r() - 0.3) * H * 0.12, rad = 40 + r() * 90;
      const bg = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = tree.map((v) => v * k * (0.85 + r() * 0.3));
      bg.addColorStop(0, `rgba(${c},0.95)`); bg.addColorStop(0.6, `rgba(${c},0.6)`); bg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = bg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.fillStyle = `rgb(${tree.map((v) => v * k)})`; g.fillRect(0, base + H * 0.05, W, H);
  }
}

// Gradient used for sun shafts.
export function shaftTexture() {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,240,210,0.0)'); grd.addColorStop(0.2, 'rgba(255,240,210,0.55)'); grd.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

export function fabricTexture() {
  const [c, g] = canvas(128, 512);
  const r = mulberry32(13);
  g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, 128, 512);
  for (let x = 0; x < 128; x++) { const v = Math.sin(x / 128 * Math.PI * 6) * 0.5 + 0.5; g.fillStyle = `rgba(120,100,70,${0.06 + v * 0.14})`; g.fillRect(x, 0, 1, 512); }
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.08})`; g.fillRect(r() * 128, r() * 512, 1, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
