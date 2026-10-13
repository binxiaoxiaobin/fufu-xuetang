import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  FogExp2, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Points,
  Scene, ShaderMaterial, SphereGeometry, Vector2, Vector3, type Texture,
} from 'three';
import { RENDER, WORLD } from '../core/config';
import { createNoise2D, createRng, range } from '../core/noise';
import type { Terrain } from '../core/terrain';
import { applyWorldFx, globalUniforms } from './shared';
import { dotTexture, rippleNormalTexture, sandTexture } from './textures';

/** Day and night palettes. Everything that changes with the day/night switch is interpolated from these. */
export const PALETTE = {
  day: {
    fog: new Color('#0c5063'), deep: new Color('#02141d'), surface: new Color('#7fe3ec'),
    hemiSky: new Color('#8fe6f0'), hemiGround: new Color('#12303a'), sun: new Color('#dffcff'),
    fogDensity: 0.0185, sunIntensity: 2.6, hemiIntensity: 1.25,
  },
  night: {
    fog: new Color('#03101b'), deep: new Color('#010509'), surface: new Color('#1d4a6e'),
    hemiSky: new Color('#2a4f7a'), hemiGround: new Color('#050b12'), sun: new Color('#9cc4ff'),
    fogDensity: 0.024, sunIntensity: 0.45, hemiIntensity: 0.55,
  },
};

export class Environment {
  readonly group = new Group();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly fog: FogExp2;
  private readonly skyMat: ShaderMaterial;
  private readonly surfaceMat: ShaderMaterial;
  private readonly raysMat: ShaderMaterial;
  private readonly snowMat: ShaderMaterial;
  private readonly tmpColor = new Color();

  constructor(scene: Scene, terrain: Terrain, shadows: boolean) {
    this.fog = new FogExp2(PALETTE.day.fog.getHex(), PALETTE.day.fogDensity);
    scene.fog = this.fog;
    scene.background = PALETTE.day.fog.clone();

    this.hemi = new HemisphereLight(PALETTE.day.hemiSky, PALETTE.day.hemiGround, PALETTE.day.hemiIntensity);
    this.group.add(this.hemi);

    this.sun = new DirectionalLight(PALETTE.day.sun, PALETTE.day.sunIntensity);
    this.sun.position.copy(globalUniforms.uSunDir.value).multiplyScalar(60);
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -34;
      cam.right = cam.top = 34;
      cam.near = 1;
      cam.far = 140;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    this.group.add(this.sun, this.sun.target);

    this.skyMat = this.buildSky();
    this.surfaceMat = this.buildSurface();
    this.raysMat = this.buildRays();
    this.snowMat = this.buildSnow();
    this.group.add(this.buildTerrain(terrain, shadows));
    scene.add(this.group);
  }

  private buildSky(): ShaderMaterial {
    const mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uFog: { value: PALETTE.day.fog.clone() },
        uDeep: { value: PALETTE.day.deep.clone() },
        uSurface: { value: PALETTE.day.surface.clone() },
        uSunDir: globalUniforms.uSunDir,
        uTime: globalUniforms.uTime,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog; uniform vec3 uDeep; uniform vec3 uSurface; uniform vec3 uSunDir; uniform float uTime;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 col = mix(uFog, uDeep, smoothstep(0.0, -0.6, y));
          col = mix(col, uSurface * 0.7, smoothstep(0.12, 0.9, y));
          float sun = pow(max(dot(vDir, normalize(uSunDir)), 0.0), 24.0);
          col += uSurface * sun * 0.6;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new Mesh(new SphereGeometry(500, 32, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);
    return mat;
  }

  /** The underside of the sea surface, with a bright Snell's window overhead. */
  private buildSurface(): ShaderMaterial {
    const mat = new ShaderMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: globalUniforms.uTime,
        uNight: globalUniforms.uNight,
        uSurface: { value: PALETTE.day.surface.clone() },
        uFog: { value: PALETTE.day.fog.clone() },
        uFogDensity: { value: PALETTE.day.fogDensity },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform vec3 uSurface; uniform vec3 uFog; uniform float uFogDensity;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          vec3 v = normalize(vWorld - cameraPosition);
          vec2 p = vWorld.xz * 0.08;
          float n = vnoise(p + uTime * 0.25) * 0.6 + vnoise(p * 2.3 - uTime * 0.31) * 0.4;
          float ripple = pow(clamp(1.0 - abs(n * 2.0 - 1.0), 0.0, 1.0), 6.0);
          float window = smoothstep(0.45, 0.95, v.y);
          vec3 col = mix(uFog * 1.4, uSurface * 1.6, window);
          col += uSurface * ripple * (0.5 + window) * (1.0 - uNight * 0.6);
          float dist = length(vWorld - cameraPosition);
          float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * 0.35);
          col = mix(col, uFog, fogF);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const surface = new Mesh(new PlaneGeometry(600, 600, 1, 1), mat);
    surface.rotation.x = Math.PI / 2;
    surface.position.y = WORLD.surfaceY;
    surface.renderOrder = -5;
    this.group.add(surface);
    return mat;
  }

  /** Crepuscular light shafts: open cones, brightest at the surface, additive. */
  private buildRays(): ShaderMaterial {
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
      uniforms: {
        uTime: globalUniforms.uTime,
        uNight: globalUniforms.uNight,
        uColor: { value: new Color('#9cf3ff') },
      },
      vertexShader: /* glsl */ `
        varying float vH; varying vec3 vN; varying vec3 vView; varying float vSeed;
        void main() {
          vH = uv.y;
          vec4 w = instanceMatrix * vec4(position, 1.0);
          vSeed = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
          vec4 mv = modelViewMatrix * w;
          vView = normalize(-mv.xyz);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform vec3 uColor;
        varying float vH; varying vec3 vN; varying vec3 vView; varying float vSeed;
        void main() {
          float edge = pow(clamp(abs(dot(vN, vView)), 0.0, 1.0), 1.6);
          float fade = smoothstep(0.0, 0.85, vH) * (1.0 - smoothstep(0.96, 1.0, vH));
          float flicker = 0.65 + 0.35 * sin(uTime * 0.6 + vSeed * 7.0) * sin(uTime * 0.23 + vSeed * 3.0);
          float a = edge * fade * flicker * 0.085 * (1.0 - uNight * 0.75);
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const geo = new CylinderGeometry(1.2, 4.5, 1, 20, 1, true);
    geo.translate(0, 0.5, 0);
    // Flip uv.y so 1 = top (surface) for the fade.
    const count = 22;
    const rays = new InstancedMesh(geo, mat, count);
    const rng = createRng(77);
    const m = new Matrix4();
    const d = new Object3D();
    for (let i = 0; i < count; i++) {
      const x = range(rng, -WORLD.halfSize, WORLD.halfSize);
      const z = range(rng, -WORLD.halfSize, WORLD.halfSize);
      const len = range(rng, 34, 48);
      d.position.set(x, WORLD.surfaceY - len, z);
      d.rotation.set(range(rng, -0.08, 0.08) + 0.12, range(rng, 0, Math.PI), range(rng, -0.08, 0.08));
      const w = range(rng, 0.6, 1.6);
      d.scale.set(w, len, w);
      d.updateMatrix();
      m.copy(d.matrix);
      rays.setMatrixAt(i, m);
    }
    rays.frustumCulled = false;
    rays.renderOrder = 5;
    this.group.add(rays);
    return mat;
  }

  /** Marine snow: drifting motes wrapped around the camera entirely in the vertex shader. */
  private buildSnow(): ShaderMaterial {
    const count = 3500;
    const box = 60;
    const rng = createRng(5);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng() * box;
      pos[i * 3 + 1] = rng() * box;
      pos[i * 3 + 2] = rng() * box;
      seed[i] = rng();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: globalUniforms.uTime,
        uNight: globalUniforms.uNight,
        uCam: { value: new Vector3() },
        uBox: { value: box },
        uMap: { value: dotTexture() },
        uScale: { value: 400 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uScale;
        varying float vAlpha; varying float vSeed;
        void main() {
          vec3 drift = vec3(sin(uTime * 0.2 + aSeed * 40.0) * 0.6, -uTime * (0.15 + aSeed * 0.25), cos(uTime * 0.17 + aSeed * 30.0) * 0.6);
          vec3 p = mod(position + drift - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vAlpha = smoothstep(uBox * 0.5, uBox * 0.2, d) * smoothstep(0.3, 2.0, d);
          vSeed = aSeed;
          gl_PointSize = uScale * (0.03 + aSeed * 0.05) / max(d, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uNight; uniform float uTime;
        varying float vAlpha; varying float vSeed;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          // At night a fraction of the motes are bioluminescent plankton.
          float glow = step(0.82, vSeed) * uNight * (0.6 + 0.4 * sin(uTime * 2.0 + vSeed * 60.0));
          vec3 col = mix(vec3(0.75, 0.9, 0.88) * (1.0 - uNight * 0.7), vec3(0.3, 1.0, 0.85) * 2.0, glow);
          gl_FragColor = vec4(col * a * (0.35 + glow), a);
        }`,
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.group.add(pts);
    return mat;
  }

  private buildTerrain(terrain: Terrain, shadows: boolean): Mesh {
    const res = terrain.res;
    const geo = new PlaneGeometry(terrain.size, terrain.size, res, res);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const noise = createNoise2D(33);
    const sand = new Color('#e3d1a6');
    const darkSand = new Color('#9f8e6a');
    const rock = new Color('#50615c');
    const algae = new Color('#6f7f4a');
    const c = new Color();
    // PlaneGeometry after rotateX(-90°) orders vertices row-major from -z to +z, matching the grid.
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const idx = j * (res + 1) + i;
        pos.setY(idx, terrain.gridHeight(i, j));
      }
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const slope = 1 - nrm.getY(k);
      const n = noise(x * 0.08, z * 0.08);
      c.copy(sand).lerp(darkSand, Math.min(1, Math.max(0, 0.45 - y * 0.1 + n * 0.25)));
      c.lerp(rock, Math.min(1, Math.max(0, (slope - 0.12) * 3 + (y - 12) * 0.04)));
      c.lerp(algae, Math.max(0, noise(x * 0.03 + 9, z * 0.03) - 0.35) * 0.6);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    // Terrain uv in metres / 4 so the sand texture tiles every 4 m.
    const uv = geo.attributes.uv as BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k) / 4, pos.getZ(k) / 4);
    const sandMap: Texture = sandTexture();
    const ripple = rippleNormalTexture();
    const mat = applyWorldFx(new MeshStandardMaterial({
      vertexColors: true,
      map: sandMap,
      normalMap: ripple,
      normalScale: new Vector2(0.55, 0.55),
      roughness: 0.93,
      metalness: 0,
    }));
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = shadows;
    mesh.name = 'terrain';
    return mesh;
  }

  /** Blend day→night (0..1) and follow the focus point with the shadow frustum and snow volume. */
  update(night: number, focus: Vector3, camera: Vector3): void {
    const d = PALETTE.day, n = PALETTE.night;
    const fog = this.tmpColor.copy(d.fog).lerp(n.fog, night);
    this.fog.color.copy(fog);
    this.fog.density = d.fogDensity + (n.fogDensity - d.fogDensity) * night;
    (this.skyMat.uniforms.uFog.value as Color).copy(fog);
    (this.skyMat.uniforms.uDeep.value as Color).copy(d.deep).lerp(n.deep, night);
    (this.skyMat.uniforms.uSurface.value as Color).copy(d.surface).lerp(n.surface, night);
    (this.surfaceMat.uniforms.uSurface.value as Color).copy(d.surface).lerp(n.surface, night);
    (this.surfaceMat.uniforms.uFog.value as Color).copy(fog);
    this.surfaceMat.uniforms.uFogDensity.value = this.fog.density;
    this.hemi.color.copy(d.hemiSky).lerp(n.hemiSky, night);
    this.hemi.groundColor.copy(d.hemiGround).lerp(n.hemiGround, night);
    this.hemi.intensity = d.hemiIntensity + (n.hemiIntensity - d.hemiIntensity) * night;
    this.sun.color.copy(d.sun).lerp(n.sun, night);
    this.sun.intensity = d.sunIntensity + (n.sunIntensity - d.sunIntensity) * night;
    // Snap the shadow frustum to whole metres so shadows don't shimmer as the sub moves.
    const fx = Math.round(focus.x), fz = Math.round(focus.z);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(globalUniforms.uSunDir.value, 70);
    (this.snowMat.uniforms.uCam.value as Vector3).copy(camera);
    void this.raysMat;
  }

  setPixelScale(heightPx: number): void {
    this.snowMat.uniforms.uScale.value = heightPx * 0.55;
  }
}
