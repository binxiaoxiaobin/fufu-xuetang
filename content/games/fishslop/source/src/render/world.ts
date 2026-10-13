import { ACESFilmicToneMapping, PCFShadowMap, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RENDER, WORLD } from '../core/config';
import type { ReefLayout } from '../core/layout';
import type { Sim } from '../core/sim';
import type { Terrain } from '../core/terrain';
import { ChaseCamera } from './camera';
import { Effects } from './effects';
import { Environment } from './environment';
import { FishRenderer } from './fishRenderer';
import { Post } from './post';
import { Reef } from './reef';
import { globalUniforms } from './shared';
import { Submarine } from './submarine';

export type Quality = 'high' | 'low';

/** Owns the WebGL renderer and every visual system; knows nothing about input or UI. */
export class World {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly cam: ChaseCamera;
  readonly effects: Effects;
  private readonly env: Environment;
  private readonly reef: Reef;
  private readonly fish: FishRenderer;
  private readonly sub: Submarine;
  private readonly post: Post | null;
  private pixelRatio: number;
  private night = 0;
  private nightTarget = 0;
  private readonly terrain: Terrain;
  private readonly frameTimes: number[] = [];
  private adaptCooldown = 3;
  private width = 1;
  private height = 1;
  private firstFrame = true;
  readonly quality: Quality;

  private readonly pixelCap: number;

  /** `pixelCap` caps the render resolution (e.g. ?scale=0.4 for software-GL test runs). */
  constructor(canvas: HTMLCanvasElement, terrain: Terrain, layout: ReefLayout, quality: Quality, pixelCap?: number) {
    this.quality = quality;
    this.terrain = terrain;
    this.renderer = new WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    const shadows = quality === 'high';
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.pixelCap = pixelCap ?? (quality === 'high' ? RENDER.maxPixelRatio : 1);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.pixelCap);
    this.renderer.setPixelRatio(this.pixelRatio);
    globalUniforms.uSurfaceY.value = WORLD.surfaceY;

    this.cam = new ChaseCamera(1);
    this.env = new Environment(this.scene, terrain, shadows);
    this.reef = new Reef(layout, shadows);
    this.fish = new FishRenderer(shadows);
    this.sub = new Submarine(shadows);
    this.effects = new Effects(layout);
    this.scene.add(this.reef.group, this.fish.group, this.sub.root, this.effects.group);

    // Scene passes render linear HDR into targets; OutputPass (or the direct render) applies ACES once.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.post = quality === 'high' ? new Post(this.renderer, this.scene, this.cam.camera) : null;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / h;
    this.cam.camera.fov = w < h ? RENDER.fov + 12 : RENDER.fov;
    this.cam.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, this.pixelRatio);
    this.env.setPixelScale(h * this.pixelRatio);
  }

  setNight(on: boolean): void {
    this.nightTarget = on ? 1 : 0;
  }

  get isNight(): boolean {
    return this.nightTarget > 0.5;
  }

  /** Warm up shaders so the first dive does not hitch. */
  compile(): void {
    this.renderer.compile(this.scene, this.cam.camera);
  }

  render(sim: Sim, frameDt: number, time: number, attract: boolean): void {
    this.night += (this.nightTarget - this.night) * Math.min(1, frameDt * 1.5);
    globalUniforms.uTime.value = time;
    globalUniforms.uNight.value = this.night;

    if (attract) this.cam.attract(time, new Vector3(-4, 10, -14));
    else this.cam.update(sim.sub, this.terrain, frameDt, this.firstFrame);
    this.firstFrame = attract;

    this.env.update(this.night, sim.sub.pos, this.cam.camera.position);
    this.reef.update(time, this.night);
    const vf = sim.veilfin.fish;
    const vfAlpha = vf ? Math.min(1, 0.06 + vf.highlight * 0.5) * Math.max(0, 1 - sim.veilfin.leaving / 4) : 0;
    this.fish.update(sim.fish, vf, vfAlpha, frameDt);
    this.sub.update(sim.sub, time, this.night);
    this.effects.update(sim, frameDt, time, this.height * this.pixelRatio);
    this.post?.setNight(this.night);

    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.cam.camera);
    this.adapt(frameDt);
  }

  /** Drop resolution when frames run long; recover slowly when there is headroom. */
  private adapt(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.adaptCooldown -= dt;
    if (this.adaptCooldown > 0 || this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let next = this.pixelRatio;
    const ceiling = Math.min(window.devicePixelRatio || 1, this.pixelCap);
    const floor = Math.min(RENDER.minPixelRatio, ceiling);
    if (median > 1 / 40) next = Math.max(floor, this.pixelRatio - 0.15);
    else if (median < 1 / 58) next = Math.min(ceiling, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.resize(this.width, this.height);
      this.frameTimes.length = 0;
    }
    this.adaptCooldown = 2;
  }

  /** Project a world point to CSS pixels (for floating labels). */
  project(p: Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.cam.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, visible: v.z < 1 };
  }

  burstAt(p: Vector3, n: number): void {
    this.effects.burst(p, n);
  }

  get stats(): { calls: number; triangles: number; pixelRatio: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.pixelRatio };
  }
}
