import { CanvasTexture, LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { createNoise2D, createRng, range } from '../core/noise';

/** Every texture in the game is painted at startup — no image files to download. */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('E_CANVAS_2D_UNAVAILABLE');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, srgb: boolean, repeat = true): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Sand grain albedo, tileable, near-white so vertex colours carry the hue. */
export function sandTexture(): Texture {
  const size = 256;
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const noise = createNoise2D(91);
  const rng = createRng(3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Tileable noise: sample on a torus.
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      const n = noise(Math.cos(a) * 3 + Math.cos(b) * 2, Math.sin(a) * 3 + Math.sin(b) * 2);
      const grain = rng() * 0.18;
      const v = Math.max(0, Math.min(255, 215 + n * 22 - grain * 120 + (rng() < 0.02 ? 30 : 0)));
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.97;
      img.data[i + 2] = v * 0.9;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, true);
}

/** Sand ripple normal map: wavy crests along X with noise warp. */
export function rippleNormalTexture(): Texture {
  const size = 256;
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const noise = createNoise2D(17);
  const height = (x: number, y: number) => {
    const a = (x / size) * Math.PI * 2;
    const b = (y / size) * Math.PI * 2;
    const warp = noise(Math.cos(b) * 1.5 + 4, Math.sin(b) * 1.5) * 1.2;
    return Math.sin(a * 6 + warp * 2 + Math.sin(b * 2) * 0.8) * 0.5 + noise(Math.cos(a) * 6, Math.sin(b) * 6) * 0.15;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height((x + 1) % size, y) - height((x - 1 + size) % size, y);
      const dy = height(x, (y + 1) % size) - height(x, (y - 1 + size) % size);
      const nx = -dx * 1.4, ny = -dy * 1.4, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, false);
}

/** Gorgonian sea-fan lattice: branching white lines on transparent. */
export function seaFanTexture(): Texture {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rng = createRng(21);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    if (depth === 0 || len < 4) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + x2) / 2 + range(rng, -6, 6), (y + y2) / 2, x2, y2);
    ctx.stroke();
    branch(x2, y2, ang - range(rng, 0.2, 0.55), len * range(rng, 0.7, 0.85), w * 0.75, depth - 1);
    branch(x2, y2, ang + range(rng, 0.2, 0.55), len * range(rng, 0.7, 0.85), w * 0.75, depth - 1);
  };
  branch(size / 2, size, -Math.PI / 2, 60, 9, 8);
  // Fine cross-lattice between branches.
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 90; i++) {
    const y = range(rng, 20, size - 30);
    const spread = (1 - y / size) * size * 0.45 + 20;
    const x = size / 2 + range(rng, -spread, spread);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + range(rng, -14, 14), y + range(rng, -14, 14));
    ctx.stroke();
  }
  const t = finish(c, false, false);
  return t;
}

/** Kelp blade silhouette: ruffled leaves alternating up a stipe. */
export function kelpTexture(): Texture {
  const w = 64, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('E_CANVAS_2D_UNAVAILABLE');
  const rng = createRng(8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(w / 2 - 2, 0, 4, h);
  for (let y = 12; y < h - 10; y += 26) {
    const side = (y / 26) % 2 < 1 ? 1 : -1;
    const len = range(rng, 18, 30);
    ctx.beginPath();
    ctx.moveTo(w / 2, y + 10);
    ctx.bezierCurveTo(w / 2 + side * len * 0.8, y + 2, w / 2 + side * len, y - 14, w / 2 + side * (len - 4), y - 26);
    ctx.bezierCurveTo(w / 2 + side * 8, y - 16, w / 2 + side * 2, y - 2, w / 2, y + 10);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = LinearSRGBColorSpace;
  return t;
}

/** Compass-rose mosaic for the ruin plaza floor. */
export function mosaicTexture(): Texture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rng = createRng(12);
  const cx = size / 2;
  ctx.fillStyle = '#b9ae94';
  ctx.fillRect(0, 0, size, size);
  // Tesserae grid with jitter.
  const tile = 8;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const d = Math.hypot(x - cx, y - cx) / cx;
      const ang = Math.atan2(y - cx, x - cx);
      let col = '#c9bfa5';
      const ring = Math.abs(d - 0.86) < 0.035 || Math.abs(d - 0.62) < 0.02;
      const star = Math.abs(Math.cos(ang * 4)) ** 12 > d * 1.25 || Math.abs(Math.cos(ang * 4 + Math.PI / 4)) ** 16 > d * 1.9;
      if (d > 0.97) col = '#8a8068';
      else if (ring) col = '#b07a2a';
      else if (star) col = rng() < 0.5 ? '#1f6f78' : '#2a8791';
      else if (d < 0.1) col = '#d9a441';
      const shade = range(rng, -18, 18);
      ctx.fillStyle = col;
      ctx.filter = `brightness(${100 + shade}%)`;
      ctx.fillRect(x + 0.6, y + 0.6, tile - 1.2, tile - 1.2);
    }
  }
  ctx.filter = 'none';
  return finish(c, true, false);
}

/** Soft round sprite used by particles. */
export function dotTexture(): Texture {
  const size = 64;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, false, false);
}
