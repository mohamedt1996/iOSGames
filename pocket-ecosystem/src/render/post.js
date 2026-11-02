import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Film look applied after tone mapping: gentle split-tone, vignette, fine grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, night: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.025 }, aspect: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, night, vignette, grain, aspect; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      vec3 shadowTint = mix(vec3(0.94,0.99,1.03), vec3(0.86,0.93,1.12), night);
      vec3 lightTint = mix(vec3(1.04,1.01,0.95), vec3(1.0,0.98,0.95), night);
      c.rgb *= mix(shadowTint, lightTint, smoothstep(0.15, 0.8, l));
      c.rgb = mix(vec3(l), c.rgb, 1.06);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0) * 1.4;
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 1.05, length(d));
      c.rgb += (hash(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = c;
    }`,
};

export const QUALITY = {
  high: { pixelRatio: 2, shadow: 2048, transmission: true, bloom: true, samples: 4 },
  balanced: { pixelRatio: 1.5, shadow: 1024, transmission: true, bloom: true, samples: 2 },
  battery: { pixelRatio: 1, shadow: 1024, transmission: false, bloom: false, samples: 0 },
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = false;
  }
  setup(q) {
    this.dispose();
    this.enabled = q.bloom;
    if (!this.enabled) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.samples });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 0.92);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.composer = c;
  }
  resize(w, h) { if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); } }
  render(dt, time, night) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.grade.uniforms.time.value = time % 100;
    this.grade.uniforms.night.value = night;
    this.grade.uniforms.aspect.value = this.camera.aspect;
    this.bloom.strength = 0.45 + night * 0.45;
    this.composer.render(dt);
  }
  dispose() { if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer = null; } }
}
