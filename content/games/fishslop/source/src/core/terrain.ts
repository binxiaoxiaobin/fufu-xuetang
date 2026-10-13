import { WORLD } from './config';
import { createNoise2D, fbm } from './noise';

/**
 * Sea-floor height field. Evaluated once into a grid; gameplay and rendering
 * both sample the grid bilinearly so a height query is O(1).
 */
export class Terrain {
  readonly size: number;
  readonly res: number;
  private readonly heights: Float32Array;

  constructor(seed = 7, size: number = WORLD.terrainSize, res: number = WORLD.terrainSegments) {
    this.size = size;
    this.res = res;
    this.heights = new Float32Array((res + 1) * (res + 1));
    const noise = createNoise2D(seed);
    const detail = createNoise2D(seed + 11);
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const x = (i / res - 0.5) * size;
        const z = (j / res - 0.5) * size;
        this.heights[j * (res + 1) + i] = Terrain.shape(noise, detail, x, z);
      }
    }
  }

  /** Analytic shape: rolling dunes inside a superellipse bowl whose walls rise past the basin edge. */
  private static shape(
    noise: (x: number, y: number) => number,
    detail: (x: number, y: number) => number,
    x: number,
    z: number,
  ): number {
    const dunes = fbm(noise, x * 0.018, z * 0.018, 4) * 3.2 + 2.6;
    const ripples = Math.sin(x * 0.55 + fbm(detail, x * 0.05, z * 0.05, 2) * 6) * 0.12;
    const r = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
    const wallT = Math.min(1, Math.max(0, (r - (WORLD.halfSize - 10)) / 34));
    const wall = wallT * wallT * (3 - 2 * wallT) * 44 + fbm(detail, x * 0.06, z * 0.06, 3) * 5 * wallT;
    // A shallow trench curving through the basin gives the floor a landmark.
    const trench = -2.2 * Math.exp(-Math.pow((z - Math.sin(x * 0.04) * 16 + 14) / 7, 2)) * (1 - wallT);
    return Math.max(0, dunes + ripples + wall + trench);
  }

  heightAt(x: number, z: number): number {
    const res = this.res;
    const fx = (x / this.size + 0.5) * res;
    const fz = (z / this.size + 0.5) * res;
    const i = Math.min(res - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(res - 1, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i));
    const tz = Math.min(1, Math.max(0, fz - j));
    const w = res + 1;
    const h00 = this.heights[j * w + i];
    const h10 = this.heights[j * w + i + 1];
    const h01 = this.heights[(j + 1) * w + i];
    const h11 = this.heights[(j + 1) * w + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Raw grid value, used by the renderer to build the mesh without resampling. */
  gridHeight(i: number, j: number): number {
    return this.heights[j * (this.res + 1) + i];
  }
}
