import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, Group,
  IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshStandardMaterial, Object3D,
  Points, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { COIN, FOOD } from '../core/config';
import type { ReefLayout } from '../core/layout';
import { createRng, range } from '../core/noise';
import type { Sim } from '../core/sim';
import { globalUniforms } from './shared';
import { dotTexture } from './textures';

const COIN_LOOK = [
  { color: '#c77b3a', emissive: '#6a3000', metal: 0.9, rough: 0.35, size: 0.26 },
  { color: '#dfe6ee', emissive: '#3a4a5a', metal: 1, rough: 0.2, size: 0.3 },
  { color: '#ffcc3d', emissive: '#a86b00', metal: 1, rough: 0.18, size: 0.36 },
  { color: '#fff4fb', emissive: '#c7a6ff', metal: 0.2, rough: 0.08, size: 0.34 },
];

export class Effects {
  readonly group = new Group();
  private readonly pellets: InstancedMesh;
  private readonly coins: InstancedMesh[];
  private readonly pulseMeshes: Mesh[] = [];
  private readonly pulseMat: ShaderMaterial;
  private readonly bubbles: Points;
  private readonly bubblePos: Float32Array;
  private readonly bubbleLife: Float32Array;
  private readonly bubbleVel: Float32Array;
  private bubbleCursor = 0;
  private readonly jellies: { root: Group; bell: Mesh; tentacles: LineSegments; base: Vector3; phase: number; drift: Vector3 }[] = [];
  private readonly jellyMat: ShaderMaterial;
  private readonly d = new Object3D();
  private readonly m = new Matrix4();
  private readonly vents: ReefLayout['vents'];
  private ventTimer = 0;

  constructor(layout: ReefLayout) {
    this.vents = layout.vents;

    const pelletMat = new MeshStandardMaterial({ color: '#d9823b', emissive: new Color('#7a2e05'), emissiveIntensity: 0.9, roughness: 0.6 });
    this.pellets = new InstancedMesh(new IcosahedronGeometry(0.075, 0), pelletMat, FOOD.maxPellets);
    this.pellets.instanceMatrix.setUsage(DynamicDrawUsage);
    this.pellets.count = 0;
    this.pellets.frustumCulled = false;
    this.group.add(this.pellets);

    const coinGeo = new CylinderGeometry(1, 1, 0.16, 28);
    coinGeo.rotateX(Math.PI / 2);
    const pearlGeo = new SphereGeometry(0.75, 24, 16);
    this.coins = COIN_LOOK.map((look, tier) => {
      const mat = new MeshStandardMaterial({
        color: look.color, emissive: new Color(look.emissive), emissiveIntensity: 1.2, metalness: look.metal, roughness: look.rough,
      });
      const mesh = new InstancedMesh(tier === 3 ? pearlGeo : coinGeo, mat, COIN.maxCoins);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    });

    // Sonar shell: a fresnel-lit sphere that fades as it expands.
    this.pulseMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uFade: { value: 1 }, uColor: { value: new Color('#9cffb0') }, uTime: globalUniforms.uTime },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          vP = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade; uniform vec3 uColor; uniform float uTime;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float rim = pow(clamp(1.0 - abs(dot(vN, vV)), 0.0, 1.0), 2.5);
          float lines = 0.75 + 0.25 * step(0.5, fract(vP.y * 6.0));
          float a = rim * uFade * lines * 0.9;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const pulseGeo = new SphereGeometry(1, 48, 24);
    for (let i = 0; i < 3; i++) {
      const pm = new Mesh(pulseGeo, this.pulseMat.clone());
      pm.visible = false;
      pm.renderOrder = 9;
      this.pulseMeshes.push(pm);
      this.group.add(pm);
    }

    // Bubble pool: ring buffer of points.
    const n = 700;
    this.bubblePos = new Float32Array(n * 3).fill(-999);
    this.bubbleLife = new Float32Array(n);
    this.bubbleVel = new Float32Array(n);
    const bgeo = new BufferGeometry();
    bgeo.setAttribute('position', new BufferAttribute(this.bubblePos, 3).setUsage(DynamicDrawUsage));
    bgeo.setAttribute('aLife', new BufferAttribute(this.bubbleLife, 1).setUsage(DynamicDrawUsage));
    this.bubbles = new Points(bgeo, new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 500 } },
      vertexShader: /* glsl */ `
        attribute float aLife; uniform float uScale; varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uScale * (0.06 + (1.0 - aLife) * 0.08) / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float ring = smoothstep(0.5, 0.38, d) * (0.35 + smoothstep(0.25, 0.45, d) * 0.9);
          float hl = smoothstep(0.14, 0.0, length(c - vec2(-0.14, -0.14)));
          float a = (ring + hl) * clamp(vLife * 3.0, 0.0, 1.0) * 0.7;
          gl_FragColor = vec4(vec3(0.85, 0.97, 1.0) * a, a);
        }`,
    }));
    this.bubbles.frustumCulled = false;
    this.bubbles.renderOrder = 7;
    this.group.add(this.bubbles);

    // Jellyfish: a pulsing translucent bell plus trailing tentacles.
    this.jellyMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uNight: globalUniforms.uNight, uTime: globalUniforms.uTime, uColor: { value: new Color('#ff8fe0') } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main() {
          vY = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight; uniform float uTime; uniform vec3 uColor;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main() {
          float rim = pow(clamp(1.0 - abs(dot(vN, vV)), 0.0, 1.0), 1.8);
          float veins = 0.7 + 0.3 * sin(atan(vN.x, vN.z) * 16.0);
          float a = (rim * 0.8 + 0.12) * veins * (0.45 + uNight * 0.9);
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const rng = createRng(404);
    const bellGeo = new SphereGeometry(0.7, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hues = ['#ff8fe0', '#8fd9ff', '#c7a2ff', '#ffc27a'];
    for (let i = 0; i < 9; i++) {
      const root = new Group();
      const mat = this.jellyMat.clone();
      mat.uniforms.uNight = globalUniforms.uNight;
      mat.uniforms.uTime = globalUniforms.uTime;
      (mat.uniforms.uColor.value as Color).set(hues[i % hues.length]);
      const bell = new Mesh(bellGeo, mat);
      const segs: number[] = [];
      const strands = 10;
      for (let s = 0; s < strands; s++) {
        const a = (s / strands) * Math.PI * 2;
        const r = 0.45;
        const len = range(rng, 1.6, 3.2);
        for (let k = 0; k < 8; k++) {
          const y0 = -(k / 8) * len, y1 = -((k + 1) / 8) * len;
          segs.push(Math.cos(a) * r * (1 - k * 0.06), y0, Math.sin(a) * r * (1 - k * 0.06));
          segs.push(Math.cos(a) * r * (1 - (k + 1) * 0.06), y1, Math.sin(a) * r * (1 - (k + 1) * 0.06));
        }
      }
      const tgeo = new BufferGeometry();
      tgeo.setAttribute('position', new BufferAttribute(new Float32Array(segs), 3));
      const tentacles = new LineSegments(tgeo, new LineBasicMaterial({ color: hues[i % hues.length], transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false }));
      root.add(bell, tentacles);
      const base = new Vector3(range(rng, -50, 50), range(rng, 14, 30), range(rng, -50, 50));
      root.position.copy(base);
      root.scale.setScalar(range(rng, 0.7, 1.5));
      this.jellies.push({ root, bell, tentacles, base, phase: range(rng, 0, 6.28), drift: new Vector3(range(rng, -1, 1), 0, range(rng, -1, 1)).normalize() });
      this.group.add(root);
    }
  }

  private spawnBubble(x: number, y: number, z: number, speed: number): void {
    const i = this.bubbleCursor;
    this.bubbleCursor = (this.bubbleCursor + 1) % this.bubbleLife.length;
    this.bubblePos[i * 3] = x;
    this.bubblePos[i * 3 + 1] = y;
    this.bubblePos[i * 3 + 2] = z;
    this.bubbleLife[i] = 1;
    this.bubbleVel[i] = speed;
  }

  /** Burst of bubbles, e.g. when a coin is banked. */
  burst(pos: Vector3, count: number): void {
    for (let k = 0; k < count; k++) {
      this.spawnBubble(pos.x + (Math.random() - 0.5) * 0.8, pos.y + (Math.random() - 0.5) * 0.8, pos.z + (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2);
    }
  }

  update(sim: Sim, dt: number, time: number, pixelHeight: number): void {
    const d = this.d;
    // Pellets
    const pellets = sim.pellets;
    const pc = Math.min(pellets.length, FOOD.maxPellets);
    for (let i = 0; i < pc; i++) {
      const p = pellets[i];
      d.position.copy(p.pos);
      d.rotation.set(p.age * 2, p.age * 3, 0);
      d.scale.setScalar(p.rest > 0 ? Math.max(0.01, 1 - p.rest / FOOD.restTime) : 1);
      d.updateMatrix();
      this.pellets.setMatrixAt(i, d.matrix);
    }
    this.pellets.count = pc;
    this.pellets.instanceMatrix.needsUpdate = true;

    // Coins, grouped by metal
    const counts = [0, 0, 0, 0];
    for (const c of sim.coinList) {
      const mesh = this.coins[c.tier];
      const i = counts[c.tier]++;
      const look = COIN_LOOK[c.tier];
      const fade = c.age > COIN.lifetime - 5 ? Math.max(0.01, (COIN.lifetime - c.age) / 5) : 1;
      const pulse = c.highlight > 0 ? 1 + Math.sin(time * 10) * 0.18 : 1;
      d.position.copy(c.pos);
      d.position.y += c.resting ? Math.sin(time * 2 + c.id) * 0.05 + 0.05 : 0;
      d.rotation.set(c.resting ? 0.25 : 0, c.spin, 0);
      d.scale.setScalar(look.size * fade * pulse);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    this.coins.forEach((m, t) => {
      m.count = counts[t];
      m.instanceMatrix.needsUpdate = true;
    });

    // Sonar shells
    this.pulseMeshes.forEach((pm, i) => {
      const p = sim.pulses[sim.pulses.length - 1 - i];
      pm.visible = Boolean(p);
      if (!p) return;
      pm.position.copy(p.origin);
      pm.scale.setScalar(Math.max(0.1, p.radius));
      (pm.material as ShaderMaterial).uniforms.uFade.value = Math.pow(1 - p.radius / p.range, 1.5);
    });

    // Bubbles: prop wash, vents, then integrate.
    const sub = sim.sub;
    const speed = sub.vel.length();
    const wash = speed * (sub.boosting ? 14 : 5) * dt;
    const behind = new Vector3(Math.sin(sub.heading), 0, Math.cos(sub.heading)).multiplyScalar(1.9);
    for (let k = 0; k < Math.floor(wash + Math.random()); k++) {
      this.spawnBubble(sub.pos.x + behind.x + (Math.random() - 0.5) * 0.5, sub.pos.y + (Math.random() - 0.5) * 0.5, sub.pos.z + behind.z + (Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.5);
    }
    this.ventTimer -= dt;
    if (this.ventTimer <= 0) {
      this.ventTimer = 0.07;
      for (const v of this.vents) this.spawnBubble(v.x + (Math.random() - 0.5) * 0.4, v.y + 1.3, v.z + (Math.random() - 0.5) * 0.4, 2 + Math.random() * 1.5);
    }
    for (let i = 0; i < this.bubbleLife.length; i++) {
      if (this.bubbleLife[i] <= 0) continue;
      this.bubbleLife[i] -= dt * 0.12;
      this.bubblePos[i * 3 + 1] += this.bubbleVel[i] * dt;
      this.bubblePos[i * 3] += Math.sin(time * 3 + i) * 0.3 * dt;
      if (this.bubbleLife[i] <= 0 || this.bubblePos[i * 3 + 1] > 39.5) {
        this.bubbleLife[i] = 0;
        this.bubblePos[i * 3 + 1] = -999;
      }
    }
    const attrs = this.bubbles.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.aLife.needsUpdate = true;
    (this.bubbles.material as ShaderMaterial).uniforms.uScale.value = pixelHeight * 0.6;

    // Jellyfish drift and pulse.
    for (const j of this.jellies) {
      const t = time * 0.9 + j.phase;
      const contract = Math.pow(Math.max(0, Math.sin(t)), 3);
      j.bell.scale.set(1 - contract * 0.25, 1 + contract * 0.18, 1 - contract * 0.25);
      j.base.addScaledVector(j.drift, dt * 0.3);
      j.base.y += contract * dt * 0.6 - dt * 0.12;
      if (Math.abs(j.base.x) > 55) j.drift.x *= -1;
      if (Math.abs(j.base.z) > 55) j.drift.z *= -1;
      j.base.y = Math.min(32, Math.max(10, j.base.y));
      j.root.position.copy(j.base);
      j.tentacles.rotation.y = Math.sin(t * 0.5) * 0.3;
      j.tentacles.scale.y = 1 + contract * 0.1;
    }
    void this.m;
  }
}
