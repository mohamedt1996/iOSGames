import * as THREE from 'three';
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function sparkSprite() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export function ringTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 22; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}
export function smokeSprite() {
  const [c, g] = canvas(64, 64);
  for (let i = 0; i < 6; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 14 + Math.random() * 12;
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}
export function skyTexture(night) {
  const [c, g] = canvas(16, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  if (night) { grd.addColorStop(0, '#0b1020'); grd.addColorStop(0.6, '#1c2440'); grd.addColorStop(1, '#3a3346'); }
  else { grd.addColorStop(0, '#6f9cc9'); grd.addColorStop(0.55, '#b9d0de'); grd.addColorStop(1, '#efd9b8'); }
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
