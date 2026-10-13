import { WORLD } from './config';
import { createRng, range, type Rng } from './noise';
import type { Terrain } from './terrain';

/**
 * Deterministic placement of reef set-pieces. The renderer turns these into
 * meshes; the simulation turns the solid ones into colliders.
 */

export interface Collider {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Vertical capsule half-height; 0 means a sphere. */
  h: number;
}

export interface Rock { x: number; y: number; z: number; scale: number; stretch: number; rot: number; seed: number }
export interface CoralPlacement { kind: 'branch' | 'brain' | 'fan' | 'tube' | 'anemone' | 'plate'; x: number; y: number; z: number; scale: number; rot: number; hue: number }
export interface Kelp { x: number; y: number; z: number; height: number; phase: number }
export interface Column { x: number; y: number; z: number; height: number; radius: number; tilt: number; tiltDir: number; broken: boolean }
export interface Crystal { x: number; y: number; z: number; scale: number; hue: number }

export interface ReefLayout {
  rocks: Rock[];
  corals: CoralPlacement[];
  kelp: Kelp[];
  seagrass: { x: number; y: number; z: number; rot: number; scale: number }[];
  columns: Column[];
  arch: { x: number; y: number; z: number; rot: number; span: number; height: number };
  crystals: Crystal[];
  vents: { x: number; y: number; z: number }[];
  colliders: Collider[];
}

function inBasin(rng: Rng, margin: number): { x: number; z: number } {
  const e = WORLD.halfSize - margin;
  return { x: range(rng, -e, e), z: range(rng, -e, e) };
}

function tooClose(x: number, z: number, list: { x: number; z: number }[], d: number): boolean {
  for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return true;
  return false;
}

export function generateLayout(terrain: Terrain, seed = 42): ReefLayout {
  const rng = createRng(seed);
  const colliders: Collider[] = [];
  const reserved: { x: number; z: number }[] = [{ x: WORLD.spawn.x, z: WORLD.spawn.z }];

  // Ruins sit north of spawn: a ring of columns around an arch.
  const ruinCenter = { x: -6, z: -22 };
  const columns: Column[] = [];
  const ringCount = 11;
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2 + 0.2;
    const x = ruinCenter.x + Math.cos(a) * 15;
    const z = ruinCenter.z + Math.sin(a) * 15;
    const broken = rng() < 0.45;
    const height = broken ? range(rng, 3, 7) : range(rng, 10, 13);
    const col: Column = {
      x, z, y: terrain.heightAt(x, z) - 0.6, height, radius: 0.85,
      tilt: rng() < 0.3 ? range(rng, 0.05, 0.22) : 0, tiltDir: range(rng, 0, Math.PI * 2), broken,
    };
    columns.push(col);
    colliders.push({ x, y: col.y + height / 2, z, r: 1.1, h: height / 2 });
  }
  const arch = { x: ruinCenter.x, y: terrain.heightAt(ruinCenter.x, ruinCenter.z) - 0.5, z: ruinCenter.z, rot: 0.35, span: 9, height: 11 };
  for (const side of [-1, 1]) {
    const x = arch.x + Math.cos(arch.rot) * side * arch.span * 0.5;
    const z = arch.z - Math.sin(arch.rot) * side * arch.span * 0.5;
    colliders.push({ x, y: arch.y + arch.height / 2, z, r: 1.5, h: arch.height / 2 });
  }
  reserved.push(ruinCenter);

  const rocks: Rock[] = [];
  for (let i = 0; i < 46; i++) {
    const p = inBasin(rng, 4);
    if (tooClose(p.x, p.z, reserved, 9)) continue;
    const scale = rng() < 0.2 ? range(rng, 3.2, 5.5) : range(rng, 1, 2.8);
    const y = terrain.heightAt(p.x, p.z) - scale * 0.25;
    rocks.push({ x: p.x, y, z: p.z, scale, stretch: range(rng, 0.55, 1), rot: range(rng, 0, Math.PI * 2), seed: Math.floor(rng() * 1e6) });
    if (scale > 1.6) colliders.push({ x: p.x, y: y + scale * 0.3, z: p.z, r: scale * 0.85, h: 0 });
  }

  const corals: CoralPlacement[] = [];
  const kinds: CoralPlacement['kind'][] = ['branch', 'brain', 'fan', 'tube', 'anemone', 'plate'];
  // Corals cluster around rocks so the reef reads as patches, not confetti.
  for (const rock of rocks) {
    const n = Math.floor(range(rng, 2, 7));
    for (let k = 0; k < n; k++) {
      const a = range(rng, 0, Math.PI * 2);
      const d = rock.scale * range(rng, 0.8, 2.2);
      const x = rock.x + Math.cos(a) * d;
      const z = rock.z + Math.sin(a) * d;
      if (Math.abs(x) > WORLD.halfSize - 2 || Math.abs(z) > WORLD.halfSize - 2) continue;
      corals.push({
        kind: kinds[Math.floor(rng() * kinds.length)], x, y: terrain.heightAt(x, z) - 0.1, z,
        scale: range(rng, 0.7, 1.6), rot: range(rng, 0, Math.PI * 2), hue: rng(),
      });
    }
  }
  for (let i = 0; i < 70; i++) {
    const p = inBasin(rng, 3);
    corals.push({
      kind: kinds[Math.floor(rng() * kinds.length)], x: p.x, y: terrain.heightAt(p.x, p.z) - 0.1, z: p.z,
      scale: range(rng, 0.6, 1.3), rot: range(rng, 0, Math.PI * 2), hue: rng(),
    });
  }

  const kelp: Kelp[] = [];
  const kelpForests = [{ x: 34, z: -30 }, { x: -38, z: 20 }, { x: 30, z: 38 }, { x: -40, z: -40 }];
  for (const f of kelpForests) {
    for (let i = 0; i < 38; i++) {
      const x = f.x + range(rng, -10, 10);
      const z = f.z + range(rng, -10, 10);
      kelp.push({ x, z, y: terrain.heightAt(x, z) - 0.2, height: range(rng, 12, 26), phase: range(rng, 0, Math.PI * 2) });
    }
  }

  const seagrass: ReefLayout['seagrass'] = [];
  for (let i = 0; i < 900; i++) {
    const cx = range(rng, -WORLD.halfSize, WORLD.halfSize);
    const cz = range(rng, -WORLD.halfSize, WORLD.halfSize);
    seagrass.push({ x: cx, z: cz, y: terrain.heightAt(cx, cz) - 0.05, rot: range(rng, 0, Math.PI), scale: range(rng, 0.5, 1.4) });
  }

  const crystals: Crystal[] = [];
  for (let i = 0; i < 9; i++) {
    const a = range(rng, 0, Math.PI * 2);
    const x = ruinCenter.x + Math.cos(a) * range(rng, 3, 10);
    const z = ruinCenter.z + Math.sin(a) * range(rng, 3, 10);
    crystals.push({ x, z, y: terrain.heightAt(x, z) - 0.3, scale: range(rng, 0.6, 1.8), hue: range(rng, 0.45, 0.58) });
  }

  const vents = [
    { x: 22, z: -8 }, { x: -24, z: 34 }, { x: 8, z: 44 },
  ].map((v) => ({ ...v, y: terrain.heightAt(v.x, v.z) }));

  return { rocks, corals, kelp, seagrass, columns, arch, crystals, vents, colliders };
}
