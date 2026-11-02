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

export function skyCanvas() { return canvas(256, 512); }

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
