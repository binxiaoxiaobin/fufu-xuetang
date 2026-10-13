import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { globalUniforms } from './shared';

/** Lens of the sub: gentle refraction wobble, edge chromatic aberration, teal grade, vignette, grain. */
const UnderwaterShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: globalUniforms.uTime,
    uNight: globalUniforms.uNight,
    uRes: { value: new Vector2(1, 1) },
    uHit: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uNight; uniform vec2 uRes; uniform float uHit;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      uv += vec2(sin(uv.y * 16.0 + uTime * 1.2), cos(uv.x * 12.0 + uTime * 0.9)) * 0.0011;
      vec2 dir = uv - 0.5;
      float r = length(dir);
      float ca = 0.006 * r * r + uHit * 0.01;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;
      // Split-tone: cool shadows, warm highlights keep the corals punchy.
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * vec3(0.9, 1.02, 1.08), col * vec3(1.05, 1.0, 0.94), smoothstep(0.2, 0.9, l));
      col *= mix(0.5, 1.0, smoothstep(0.98, 0.32, r));
      float g = fract(sin(dot(uv * uRes + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * (0.02 + uNight * 0.015);
      // Belt and braces: never let a stray NaN/inf reach the screen.
      col = clamp(col, 0.0, 64.0);
      if (any(isnan(col))) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly underwater: ShaderPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.composer = new EffectComposer(renderer); // half-float targets by default, so HDR survives to OutputPass
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.underwater = new ShaderPass(UnderwaterShader);
    this.composer.addPass(this.underwater);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pixelRatio * 0.5, h * pixelRatio * 0.5);
    (this.underwater.uniforms.uRes.value as Vector2).set(w * pixelRatio, h * pixelRatio);
  }

  setNight(night: number): void {
    this.bloom.strength = 0.5 + night * 0.45;
    this.bloom.threshold = 0.82 - night * 0.3;
  }

  render(): void {
    this.composer.render();
  }
}
