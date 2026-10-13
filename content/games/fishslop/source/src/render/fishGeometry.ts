import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BodyShape } from '../core/species';

/**
 * Builds a fish from its BodyShape. Nose points +Z. Every vertex carries:
 *  aT    — 0 at the nose, 1 at the tail root, up to ~1.5 at the fin tips (drives the swim wave)
 *  aPart — 0 body, 1 tail/dorsal fins, 2 pupil, 3 eye ring, 4 pectoral fin
 * so one material can colour and animate the whole fish.
 */

export const PART = { body: 0, fin: 1, pupil: 2, eye: 3, pectoral: 4 } as const;

interface Piece { pos: number[]; t: number[]; part: number[]; idx: number[] }

function piece(): Piece {
  return { pos: [], t: [], part: [], idx: [] };
}

function toGeometry(p: Piece): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(p.pos), 3));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(p.t), 1));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(p.part), 1));
  g.setIndex(p.idx);
  g.computeVertexNormals();
  return g;
}

/** Body profile 0..1: rounded nose, peak at `peak`, tapering to a narrow peduncle. */
export function profile(t: number, peak: number): number {
  if (t <= peak) {
    const u = (peak - t) / peak;
    return Math.sqrt(Math.max(0, 1 - u * u));
  }
  const u = (t - peak) / (1 - peak);
  return 1 - 0.86 * Math.pow(u, 1.5);
}

export function buildFishGeometry(shape: BodyShape): BufferGeometry {
  const L = shape.length;
  const H = shape.height * L * 0.5;
  const W = shape.width * L * 0.5;
  const zNose = L * 0.5;
  const zAt = (t: number) => zNose - t * L;
  const parts: BufferGeometry[] = [];

  // --- body: rings of ellipses
  {
    const p = piece();
    const rings = 30;
    const seg = 18;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const s = Math.max(0.02, profile(t, shape.peak));
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const sy = Math.sin(a);
        // Slightly fuller belly, flatter back.
        const hy = sy < 0 ? H * 1.06 : H * 0.96;
        p.pos.push(Math.cos(a) * W * s, sy * hy * s, zAt(t));
        p.t.push(t);
        p.part.push(0);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * seg + j;
        const b = i * seg + ((j + 1) % seg);
        const c = (i + 1) * seg + j;
        const d = (i + 1) * seg + ((j + 1) % seg);
        p.idx.push(a, c, b, b, c, d);
      }
    }
    // Nose cap.
    const tip = p.pos.length / 3;
    p.pos.push(0, 0, zNose + L * 0.005);
    p.t.push(0);
    p.part.push(0);
    for (let j = 0; j < seg; j++) p.idx.push(tip, j, (j + 1) % seg);
    // Tail cap.
    const end = p.pos.length / 3;
    p.pos.push(0, 0, zAt(1));
    p.t.push(1);
    p.part.push(0);
    for (let j = 0; j < seg; j++) p.idx.push(end, rings * seg + ((j + 1) % seg), rings * seg + j);
    parts.push(toGeometry(p));
  }

  /** A fin sheet in the YZ plane, grid of u (along) × v (across). */
  const sheet = (
    uSteps: number, vSteps: number, part: number,
    at: (u: number, v: number) => [number, number, number, number],
  ) => {
    const p = piece();
    for (let i = 0; i <= uSteps; i++) {
      for (let j = 0; j <= vSteps; j++) {
        const [x, y, z, t] = at(i / uSteps, j / vSteps);
        p.pos.push(x, y, z);
        p.t.push(t);
        p.part.push(part);
      }
    }
    const row = vSteps + 1;
    for (let i = 0; i < uSteps; i++) {
      for (let j = 0; j < vSteps; j++) {
        const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
        p.idx.push(a, c, b, b, c, d);
      }
    }
    parts.push(toGeometry(p));
  };

  // --- caudal (tail) fin: forked fan behind the peduncle
  const rootH = H * profile(1, shape.peak) * 1.4;
  const T = shape.tailSize * L;
  sheet(6, 10, PART.fin, (u, v) => {
    const vv = v * 2 - 1;
    const spread = rootH + (T * 0.85 - rootH) * Math.pow(u, 0.8);
    const fork = 1 - 0.42 * Math.pow(1 - Math.abs(vv), 2) * u;
    return [0, vv * spread, zAt(1) - T * u * fork, 1 + u * 0.5];
  });

  // --- dorsal fin (plus sail for tall species)
  const dorsalH = (shape.dorsal + shape.sail) * L * 0.5;
  if (dorsalH > 0.001) {
    const t0 = shape.sail > 0 ? 0.22 : 0.3;
    const t1 = shape.sail > 0 ? 0.92 : 0.75;
    sheet(10, 4, PART.fin, (u, v) => {
      const t = t0 + (t1 - t0) * u;
      const top = H * profile(t, shape.peak) * 0.92;
      // Swept-back fin: peak early, trailing edge long.
      const h = dorsalH * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8);
      const sweep = v * h * 0.35;
      return [0, top + v * h, zAt(t) - sweep, t + v * 0.1];
    });
    // Anal (ventral) fin mirrors a smaller version below.
    const analH = dorsalH * (shape.sail > 0 ? 0.9 : 0.45);
    sheet(8, 3, PART.fin, (u, v) => {
      const t = 0.5 + 0.35 * u;
      const bottom = -H * profile(t, shape.peak) * 0.95;
      const h = analH * Math.sin(Math.PI * Math.pow(u, 0.8));
      return [0, bottom - v * h, zAt(t) - v * h * 0.3, t + v * 0.1];
    });
  }

  // --- pectoral fins on each side
  const pecL = shape.pectoral * L;
  for (const side of [-1, 1]) {
    sheet(3, 3, PART.pectoral, (u, v) => {
      const t = 0.3 + u * 0.02;
      const w = W * profile(0.3, shape.peak);
      const x = side * (w * 0.9 + v * pecL * 0.55);
      const y = -H * 0.25 - v * pecL * 0.25 + (u - 0.5) * pecL * 0.5;
      return [x, y, zAt(t) - v * pecL * 0.8, 0.3 + v * 0.3];
    });
  }

  // --- eyes: white ring + dark pupil
  const eyeT = 0.14;
  const eyeR = Math.max(0.012, L * 0.045);
  for (const side of [-1, 1]) {
    const s = profile(eyeT, shape.peak);
    const x = side * W * s * 0.82;
    const y = H * s * 0.28;
    const z = zAt(eyeT);
    for (const [part, r, push] of [[PART.eye, eyeR, 0], [PART.pupil, eyeR * 0.62, eyeR * 0.5]] as const) {
      const g = new SphereGeometry(r, 10, 8);
      g.translate(x + side * push, y, z + push * 0.2);
      const n = g.attributes.position.count;
      g.setAttribute('aT', new BufferAttribute(new Float32Array(n).fill(eyeT), 1));
      g.setAttribute('aPart', new BufferAttribute(new Float32Array(n).fill(part), 1));
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('E_FISH_GEOMETRY');
  // Fin roots collapse to zero-area triangles whose normals are (0,0,0); normalising those in
  // the shader yields NaN, which bloom then smears across the whole frame. Point them sideways.
  const nrm = merged.attributes.normal;
  for (let i = 0; i < nrm.count; i++) {
    const x = nrm.getX(i), y = nrm.getY(i), z = nrm.getZ(i);
    if (!(x * x + y * y + z * z > 1e-10)) nrm.setXYZ(i, 1, 0, 0);
  }
  merged.computeBoundingSphere();
  return merged;
}
