import {
  Color, DoubleSide, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion,
  Vector3, type WebGLProgramParametersWithUniforms,
} from 'three';
import { FISH } from '../core/config';
import { scaleForGrowth } from '../core/economy';
import type { Fish } from '../core/sim';
import { SPECIES, type Pattern, type Species } from '../core/species';
import { buildFishGeometry } from './fishGeometry';
import { globalUniforms } from './shared';

const PATTERN_ID: Record<Pattern, number> = { neon: 0, bands: 1, gradient: 2, spots: 3, stripes: 4, iridescent: 5, ghost: 6 };

const VERT_PARS = /* glsl */ `
attribute float aT;
attribute float aPart;
attribute float aPhase;
attribute float aSwim;
attribute vec3 aState;
uniform float uTime;
uniform float uFreq;
uniform float uLen;
varying vec3 vLocal;
varying float vPart;
varying vec3 vState;
`;

const VERT_BODY = /* glsl */ `
vLocal = position / uLen;
vPart = aPart;
vState = aState;
{
  float speed = 0.55 + aSwim;
  float amp = uLen * 0.085 * smoothstep(0.12, 1.3, aT) * (0.5 + aSwim * 0.7);
  transformed.x += sin(uTime * uFreq * speed - aT * 4.6 + aPhase) * amp;
  transformed.x -= sin(uTime * uFreq * speed + aPhase) * uLen * 0.014 * (1.0 - smoothstep(0.0, 0.45, aT));
  if (aPart > 3.5) transformed.y += sin(uTime * 8.0 + aPhase) * uLen * 0.16 * (aT - 0.3);
  float gulp = aState.z * (1.0 - smoothstep(0.0, 0.5, aT));
  transformed.xy *= 1.0 + gulp * 0.16;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uBody;
uniform vec3 uBelly;
uniform vec3 uAccent;
uniform float uPattern;
uniform float uScale;
uniform float uGlow;
varying vec3 vLocal;
varying float vPart;
varying vec3 vState;
float fhash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

const FRAG_COLOR = /* glsl */ `
vec3 fcol = mix(uBelly, uBody, smoothstep(-0.14, 0.1, vLocal.y));
float femis = 0.0;
float fz = vLocal.z;
float fy = vLocal.y;
float fres = clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
if (uPattern < 0.5) {
  float band = (1.0 - smoothstep(0.014, 0.032, abs(fy - 0.02 + fz * 0.05))) * smoothstep(0.34, 0.12, abs(fz + 0.02));
  fcol = mix(fcol, vec3(0.85, 0.12, 0.2), smoothstep(-0.02, -0.3, fz) * smoothstep(0.02, -0.12, fy) * 0.9);
  fcol = mix(fcol, uAccent, band);
  femis = band * (0.7 + uNight * 2.0);
} else if (uPattern < 1.5) {
  float b = 0.0;
  float edge = 0.0;
  vec3 cs = vec3(0.3, 0.02, -0.33);
  vec3 ws = vec3(0.045, 0.06, 0.04);
  for (int i = 0; i < 3; i++) {
    float d = abs(fz - cs[i] + fy * 0.18 - fy * fy * 0.6);
    b = max(b, 1.0 - smoothstep(ws[i], ws[i] + 0.01, d));
    edge = max(edge, 1.0 - smoothstep(ws[i] + 0.014, ws[i] + 0.024, d));
  }
  fcol = mix(fcol, vec3(0.03), edge * (1.0 - b));
  fcol = mix(fcol, uAccent, b);
} else if (uPattern < 2.5) {
  fcol = mix(uBelly, uBody, smoothstep(-0.3, 0.25, fy));
  fcol *= 0.92 + 0.08 * sin(fz * 60.0 + fy * 20.0);
  fcol = mix(fcol, uAccent, smoothstep(0.35, 0.5, fz) * 0.6);
} else if (uPattern < 3.5) {
  vec2 q = vec2(fz, fy) * uScale;
  vec2 id = floor(q);
  vec2 cell = fract(q) - 0.5 + (vec2(fhash(id), fhash(id + 7.0)) - 0.5) * 0.3;
  float r = 0.16 + 0.12 * fhash(id + 3.0);
  float spot = 1.0 - smoothstep(r, r + 0.05, length(cell));
  fcol = mix(fcol, uAccent, spot * smoothstep(-0.35, -0.05, fy + 0.2));
  femis = spot * uGlow;
} else if (uPattern < 4.5) {
  if (uScale > 2.0) {
    float s = smoothstep(-0.25, 0.25, sin((fz + fy * 0.35) * uScale * 12.0));
    fcol = mix(uBody, uBelly, s * 0.85);
    fcol = mix(fcol, uAccent, smoothstep(0.3, 0.42, fy) * 0.8);
  } else {
    float pal = 1.0 - smoothstep(0.035, 0.06, abs(fy - 0.16 * sin(fz * 5.5 + 1.2) - 0.03));
    float loop = 1.0 - smoothstep(0.06, 0.085, length(vec2(fz + 0.12, (fy - 0.04) * 1.4)));
    fcol = mix(fcol, uAccent, max(pal * smoothstep(0.42, 0.2, fz), 0.0));
    fcol = mix(fcol, uBody, loop);
  }
} else if (uPattern < 5.5) {
  vec3 hue = 0.5 + 0.5 * cos(6.2831 * (fres * 1.3 + fz * 1.6 + uTime * 0.08 + vec3(0.0, 0.33, 0.67)));
  fcol = mix(uBody, hue, 0.5 + fres * 0.35);
  femis = fres * uGlow + 0.1;
} else {
  fcol = mix(uBelly, uAccent, smoothstep(-0.3, 0.4, -fz) * 0.6);
  femis = 1.2;
}
if ((vPart > 0.5 && vPart < 1.5) || vPart > 3.5) {
  float rays = 0.78 + 0.22 * sin(atan(fy, fz) * 70.0);
  vec3 fin = uPattern > 0.5 && uPattern < 1.5 ? mix(uBody, vec3(0.03), smoothstep(0.1, 0.16, abs(fz + 0.55))) : mix(uAccent, uBody, 0.45);
  if (uPattern > 3.5 && uPattern < 4.5 && uScale < 2.0) fin = vec3(1.0, 0.85, 0.2);
  fcol = mix(fcol, fin, 0.75) * rays;
} else if (vPart > 1.5 && vPart < 2.5) {
  fcol = vec3(0.015);
} else if (vPart > 2.5 && vPart < 3.5) {
  fcol = mix(vec3(0.95, 0.9, 0.7), uAccent, 0.25);
}
float fstarve = smoothstep(0.6, 1.0, vState.x) * 0.55;
fcol = mix(fcol, vec3(dot(fcol, vec3(0.3, 0.5, 0.2))) * 0.8, fstarve);
diffuseColor.rgb = fcol;
`;

const FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += fcol * femis * (0.35 + uNight * 0.9);
totalEmissiveRadiance += vec3(0.45, 1.0, 0.62) * pow(fres, 1.6) * min(vState.y, 1.0) * 1.6;
totalEmissiveRadiance += vec3(0.35, 0.75, 0.85) * pow(fres, 3.0) * 0.18 * (1.0 - uNight * 0.6);
`;

function fishMaterial(sp: Species, ghost: boolean): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    roughness: sp.pattern === 'iridescent' ? 0.25 : 0.42,
    metalness: sp.pattern === 'iridescent' ? 0.45 : 0.08,
    side: DoubleSide,
    transparent: ghost,
    depthWrite: !ghost,
    opacity: 1,
  });
  const uniforms = {
    uFreq: { value: sp.swimFrequency },
    uLen: { value: sp.shape.length },
    uBody: { value: new Color(sp.palette.body) },
    uBelly: { value: new Color(sp.palette.belly) },
    uAccent: { value: new Color(sp.palette.accent) },
    uPattern: { value: PATTERN_ID[sp.pattern] },
    uScale: { value: sp.patternScale },
    uGlow: { value: sp.glow },
  };
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms, { uTime: globalUniforms.uTime, uNight: globalUniforms.uNight });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`);
  };
  mat.customProgramCacheKey = () => `fish-${ghost ? 'ghost' : 'solid'}`;
  return mat;
}

interface Pose { q: Quaternion; yaw: number; bank: number; seen: number }

class SpeciesBatch {
  readonly mesh: InstancedMesh;
  readonly material: MeshStandardMaterial;
  private readonly phase: InstancedBufferAttribute;
  private readonly swim: InstancedBufferAttribute;
  private readonly state: InstancedBufferAttribute;

  constructor(readonly species: Species, capacity: number, shadows: boolean) {
    const geo = buildFishGeometry(species.shape);
    this.phase = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.swim = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.state = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    geo.setAttribute('aPhase', this.phase);
    geo.setAttribute('aSwim', this.swim);
    geo.setAttribute('aState', this.state);
    this.material = fishMaterial(species, species.pattern === 'ghost');
    this.mesh = new InstancedMesh(geo, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = shadows && species.pattern !== 'ghost';
    this.mesh.frustumCulled = false;
  }

  write(i: number, m: Matrix4, f: Fish, swim: number): void {
    this.mesh.setMatrixAt(i, m);
    this.phase.setX(i, f.phase);
    this.swim.setX(i, swim);
    this.state.setXYZ(i, f.hunger, f.highlight, Math.exp(-f.ateAgo * 5));
  }

  commit(count: number): void {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.phase.needsUpdate = true;
    this.swim.needsUpdate = true;
    this.state.needsUpdate = true;
  }
}

/** Draws every resident with one instanced draw call per species. */
export class FishRenderer {
  readonly group = new Group();
  private readonly batches = new Map<string, SpeciesBatch>();
  private readonly poses = new Map<number, Pose>();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly s = new Vector3();
  private frame = 0;

  constructor(shadows: boolean) {
    for (const sp of SPECIES) {
      const cap = sp.id === 'veilfin' ? 1 : FISH.maxResidents;
      const b = new SpeciesBatch(sp, cap, shadows);
      this.batches.set(sp.id, b);
      this.group.add(b.mesh);
    }
  }

  update(fish: readonly Fish[], veilfin: Fish | null, veilfinAlpha: number, dt: number): void {
    this.frame++;
    const counts = new Map<string, number>();
    const all = veilfin ? [...fish, veilfin] : fish;
    for (const f of all) {
      const batch = this.batches.get(f.species);
      if (!batch) continue;
      const i = counts.get(f.species) ?? 0;
      counts.set(f.species, i + 1);
      const pose = this.pose(f, dt);
      const scale = f.species === 'veilfin' ? 1 : scaleForGrowth(f.growth) * (1 + Math.exp(-f.ateAgo * 6) * 0.06);
      this.s.setScalar(scale);
      this.m.compose(f.pos, pose.q, this.s);
      const speed = f.vel.length() / batch.species.speed;
      batch.write(i, this.m, f, Math.min(1.6, speed));
    }
    for (const [id, b] of this.batches) b.commit(counts.get(id) ?? 0);
    const vb = this.batches.get('veilfin');
    if (vb) vb.material.opacity = veilfinAlpha;
    // Forget poses of fish that no longer exist (every ~2 s).
    if (this.frame % 120 === 0) {
      for (const [id, p] of this.poses) if (this.frame - p.seen > 120) this.poses.delete(id);
    }
  }

  private pose(f: Fish, dt: number): Pose {
    let p = this.poses.get(f.id);
    const v = f.vel;
    const speed = v.length();
    const yaw = Math.atan2(v.x, v.z);
    if (!p) {
      p = { q: new Quaternion(), yaw, bank: 0, seen: this.frame };
      this.poses.set(f.id, p);
    }
    p.seen = this.frame;
    let dyaw = yaw - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw = yaw;
    const targetBank = Math.max(-0.7, Math.min(0.7, -dyaw / Math.max(dt, 1e-3) * 0.12));
    p.bank += (targetBank - p.bank) * Math.min(1, dt * 4);
    const pitch = speed > 1e-3 ? -Math.asin(Math.max(-0.6, Math.min(0.6, v.y / speed))) : 0;
    this.e.set(pitch, yaw, p.bank);
    this.q.setFromEuler(this.e);
    p.q.slerp(this.q, Math.min(1, dt * 8));
    return p;
  }
}
