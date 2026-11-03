import * as THREE from 'three';
import { sparkSprite } from './textures.js';

let SPARK = null; // one sprite texture shared by every particle system

// Pooled point particles with gravity, drag, fade and per-particle color/size.
export class Particles {
  constructor(parent, { max = 600, additive = false, gravity = -0.6, drag = 1.5 } = {}) {
    this.max = max; this.gravity = gravity; this.drag = drag;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.age = new Float32Array(max); this.base = new Float32Array(max * 4);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: (SPARK ||= sparkSprite()) }, scale: { value: 600 } },
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/ -mv.z; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC.rgb, vC.a*a); }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    parent.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, r, g, b, a, size) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.base.set([r, g, b, a], i * 4); this.life[i] = life; this.age[i] = 0; this.size[i] = size;
  }
  update(dt) {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const j = --this.n;
        if (i !== j) {
          this.pos.copyWithin(i * 3, j * 3, j * 3 + 3); this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.base.copyWithin(i * 4, j * 4, j * 4 + 4); this.life[i] = this.life[j]; this.age[i] = this.age[j]; this.size[i] = this.size[j];
          i--;
        }
        continue;
      }
      const p = i * 3;
      this.vel[p + 1] += this.gravity * dt;
      this.vel[p] *= k; this.vel[p + 1] *= k; this.vel[p + 2] *= k;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      const t = this.age[i] / this.life[i];
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const c = i * 4;
      this.col[c] = this.base[c]; this.col[c + 1] = this.base[c + 1]; this.col[c + 2] = this.base[c + 2]; this.col[c + 3] = this.base[c + 3] * fade;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
  clear() { this.n = 0; }
  dispose() { this.points.parent?.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}
