import * as THREE from 'three';
import { PATHS } from '../ui/icons.js';
import { CARDS } from '../game/cards.js';

const cache = new Map();
const W = 256, H = 360;
function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawIcon(g, name, cx, cy, size, color, width = 1.8) {
  g.save(); g.translate(cx - size / 2, cy - size / 2); g.scale(size / 24, size / 24);
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.stroke(new Path2D(PATHS[name])); g.restore();
}
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// the back every rival sees: the house colour and a thorned crown
export function cardBack(color) {
  const k = 'b' + color; if (cache.has(k)) return cache.get(k);
  const c = canvas(), g = c.getContext('2d');
  rr(g, 4, 4, W - 8, H - 8, 22); g.fillStyle = '#1b1410'; g.fill();
  rr(g, 14, 14, W - 28, H - 28, 16); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, color); gr.addColorStop(1, shade(color, -0.45)); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,230,180,0.55)'; g.lineWidth = 4; rr(g, 26, 26, W - 52, H - 52, 10); g.stroke();
  for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(26, 40 + i * 18); g.lineTo(W - 26, 20 + i * 18); g.stroke(); }
  drawIcon(g, 'crown', W / 2, H / 2, 120, '#ffe6b0', 1.6);
  const t = tex(c); cache.set(k, t); return t;
}
export function cardFace(id) {
  const k = 'f' + id; if (cache.has(k)) return cache.get(k);
  const c = canvas(), g = c.getContext('2d'), d = CARDS[id];
  rr(g, 4, 4, W - 8, H - 8, 22); g.fillStyle = '#2a1d14'; g.fill();
  rr(g, 14, 14, W - 28, H - 28, 16); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#f6e9cc'); gr.addColorStop(1, '#dcc49a'); g.fillStyle = gr; g.fill();
  const hostile = d.kind === 'threat';
  g.fillStyle = hostile ? '#8a2a1c' : d.kind === 'spy' ? '#3b3a5a' : '#2c4a6e'; g.beginPath(); g.arc(W / 2, 140, 78, 0, 6.3); g.fill();
  drawIcon(g, d.icon, W / 2, 140, 96, '#fff2d6', 2);
  g.fillStyle = '#2a1d14'; g.font = '700 38px "IM Fell English", Georgia, serif'; g.textAlign = 'center'; g.fillText(d.name, W / 2, 268);
  g.font = '20px "EB Garamond", Georgia, serif'; g.fillStyle = '#5a4630'; g.fillText(hostile ? 'threat' : d.kind === 'spy' ? 'intrigue' : 'stewardship', W / 2, 300);
  const t = tex(c); cache.set(k, t); return t;
}
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(1 + f); return `#${c.getHexString()}`; }
