import {
  BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  ExtrudeGeometry, FrontSide, Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, OctahedronGeometry,
  PlaneGeometry, PointLight, Shape, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CoralPlacement, ReefLayout } from '../core/layout';
import { createNoise2D, createRng, range, type Rng } from '../core/noise';
import { applyWorldFx, globalUniforms } from './shared';
import { kelpTexture, mosaicTexture, seaFanTexture } from './textures';

/**
 * Procedural reef dressing. Every set-piece is generated from code and drawn
 * with instancing so the whole reef costs a few dozen draw calls.
 */

const CORAL_PALETTE = ['#ff5a7a', '#ff8a3d', '#ffc94a', '#b86bff', '#ff4fb8', '#4ad6c6', '#f25f3a', '#e8e0ff', '#7ae05a'];

function ensureAttrs(g: BufferGeometry): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.uv) geo.setAttribute('uv', new BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

/** Rewrites uv.y as normalised height, which the sway shader reads. */
function heightUv(g: BufferGeometry): BufferGeometry {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position;
  const uv = g.attributes.uv as BufferAttribute;
  const h = Math.max(1e-3, bb.max.y - bb.min.y);
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - bb.min.y) / h);
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts.map(ensureAttrs), false);
  if (!g) throw new Error('E_MERGE_GEOMETRY');
  return g;
}

function rockGeometry(seed: number): BufferGeometry {
  // Welded so the displaced surface shades smoothly instead of faceting.
  const g = mergeVertices(new IcosahedronGeometry(1, 5).deleteAttribute('normal').deleteAttribute('uv'));
  const noise = createNoise2D(seed);
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 1.3 + v.y, v.z * 1.3 - v.y) * 0.28 + noise(v.x * 3.1, v.z * 3.1 + v.y * 2) * 0.1;
    v.multiplyScalar(1 + n);
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3; // flat-ish base
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Coralline algae on the upward faces, darker undersides.
  const colors = new Float32Array(pos.count * 3);
  const nrm = g.attributes.normal;
  const base = new Color('#5d6b66'), top = new Color('#c67a8e'), moss = new Color('#56703f'), under = new Color('#26302e');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const up = nrm.getY(i);
    const n = noise(pos.getX(i) * 4, pos.getZ(i) * 4);
    c.copy(base).lerp(under, Math.max(0, -up) * 0.8);
    if (up > 0.35) c.lerp(n > 0 ? top : moss, Math.min(1, (up - 0.35) * 2.2) * (0.5 + Math.abs(n) * 0.8));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function branchCoral(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const grow = (base: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
    const g = new CylinderGeometry(r * 0.7, r, len, 6, 1);
    g.translate(0, len / 2, 0);
    const up = new Vector3(0, 1, 0);
    const o = new Object3D();
    o.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    o.position.copy(base);
    o.updateMatrix();
    g.applyMatrix4(o.matrix);
    parts.push(g);
    const tip = base.clone().addScaledVector(dir.clone().normalize(), len);
    if (depth <= 0) {
      const cap = new SphereGeometry(r * 0.75, 6, 4);
      cap.translate(tip.x, tip.y, tip.z);
      parts.push(cap);
      return;
    }
    const kids = depth > 2 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const nd = dir.clone().normalize().add(new Vector3(range(rng, -0.8, 0.8), range(rng, 0.1, 0.6), range(rng, -0.8, 0.8))).normalize();
      grow(tip, nd, len * range(rng, 0.62, 0.8), r * 0.72, depth - 1);
    }
  };
  grow(new Vector3(0, 0, 0), new Vector3(0, 1, 0), 0.55, 0.12, 4);
  return heightUv(merge(parts));
}

function brainCoral(seed: number): BufferGeometry {
  const g = new SphereGeometry(0.7, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const noise = createNoise2D(seed);
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const warp = noise(v.x * 2.5, v.z * 2.5) * 3;
    const ridge = Math.abs(Math.sin(v.x * 9 + warp) * Math.cos(v.z * 9 - warp * 0.7));
    v.multiplyScalar(1 + ridge * 0.07);
    v.y *= 0.78;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.translate(0, -0.12, 0);
  return heightUv(ensureAttrs(g));
}

function tubeSponge(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const n = Math.floor(range(rng, 3, 6));
  for (let i = 0; i < n; i++) {
    const h = range(rng, 0.6, 1.6);
    const r = range(rng, 0.1, 0.18);
    const g = new CylinderGeometry(r * 1.15, r, h, 10, 3, true);
    g.translate(range(rng, -0.25, 0.25), h / 2, range(rng, -0.25, 0.25));
    parts.push(g);
  }
  // Open-ended tubes are drawn double-sided, so the hollow interior reads without an inner wall.
  return heightUv(merge(parts));
}

function anemone(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const base = new CylinderGeometry(0.28, 0.34, 0.25, 12);
  base.translate(0, 0.12, 0);
  parts.push(base);
  const count = 34;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + range(rng, -0.1, 0.1);
    const rr = range(rng, 0.05, 0.26);
    const len = range(rng, 0.35, 0.6);
    const t = new ConeGeometry(0.025, len, 4, 3);
    t.translate(0, len / 2, 0);
    const o = new Object3D();
    o.position.set(Math.cos(a) * rr, 0.24, Math.sin(a) * rr);
    o.rotation.set(Math.sin(a) * 0.5 * rr * 3, 0, -Math.cos(a) * 0.5 * rr * 3);
    o.updateMatrix();
    t.applyMatrix4(o.matrix);
    parts.push(t);
  }
  return heightUv(merge(parts));
}

function plateCoral(rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const stem = new CylinderGeometry(0.08, 0.14, 0.5, 6);
  stem.translate(0, 0.25, 0);
  parts.push(stem);
  const layers = Math.floor(range(rng, 2, 4));
  for (let i = 0; i < layers; i++) {
    const r = range(rng, 0.5, 0.95) * (1 - i * 0.18);
    const g = new CylinderGeometry(r, r * 0.8, 0.07, 18);
    g.translate(range(rng, -0.15, 0.15), 0.45 + i * 0.28, range(rng, -0.15, 0.15));
    parts.push(g);
  }
  return heightUv(merge(parts));
}

function fanGeometry(): BufferGeometry {
  const g = new PlaneGeometry(1.6, 1.6, 6, 6);
  g.translate(0, 0.8, 0);
  return ensureAttrs(g);
}

function fluteColumn(height: number, radius: number, broken: boolean, rng: Rng): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const shaft = new CylinderGeometry(radius * 0.92, radius, height, 28, Math.max(2, Math.round(height)));
  const pos = shaft.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 - Math.pow(Math.abs(Math.cos(a * 10)), 3) * 0.06;
    let yy = y;
    if (broken && y > height / 2 - 0.01) yy = y - range(rng, 0, 0.9);
    pos.setXYZ(i, x * k, yy, z * k);
  }
  shaft.computeVertexNormals();
  shaft.translate(0, height / 2 + 0.5, 0);
  parts.push(shaft);
  const plinth = new BoxGeometry(radius * 2.6, 0.5, radius * 2.6);
  plinth.translate(0, 0.25, 0);
  parts.push(plinth);
  if (!broken) {
    const cap = new BoxGeometry(radius * 2.5, 0.45, radius * 2.5);
    cap.translate(0, height + 0.72, 0);
    parts.push(cap);
    const ring = new CylinderGeometry(radius * 1.15, radius * 0.95, 0.3, 24);
    ring.translate(0, height + 0.36, 0);
    parts.push(ring);
  }
  return merge(parts);
}

function stoneColors(g: BufferGeometry, seed: number): BufferGeometry {
  const noise = createNoise2D(seed);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const stone = new Color('#cfc4a8'), weather = new Color('#8e8a74'), algae = new Color('#5c7a4a');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise(x * 0.7 + z * 0.3, y * 0.5);
    c.copy(stone).lerp(weather, Math.min(1, Math.max(0, 0.6 - y * 0.08 + n * 0.4)));
    c.lerp(algae, Math.max(0, noise(x * 1.7, y * 1.3 + z) - 0.2) * 0.8);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export class Reef {
  readonly group = new Group();
  private readonly crystalMat: MeshStandardMaterial;
  private readonly ruinLight: PointLight;

  constructor(layout: ReefLayout, shadows: boolean) {
    const rng = createRng(1234);
    const d = new Object3D();

    // --- rocks: 4 shapes, instanced
    const rockMat = applyWorldFx(new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }));
    const rockShapes = [0, 1, 2, 3].map((i) => rockGeometry(100 + i));
    rockShapes.forEach((geo, shape) => {
      const mine = layout.rocks.filter((r) => r.seed % 4 === shape);
      if (!mine.length) return;
      const mesh = new InstancedMesh(geo, rockMat, mine.length);
      mine.forEach((r, i) => {
        d.position.set(r.x, r.y, r.z);
        d.rotation.set(0, r.rot, 0);
        d.scale.set(r.scale, r.scale * r.stretch, r.scale * range(rng, 0.8, 1.2));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      this.group.add(mesh);
    });

    // --- corals: 3 variants per kind, per-instance colour
    const byKind = new Map<CoralPlacement['kind'], CoralPlacement[]>();
    for (const c of layout.corals) {
      const list = byKind.get(c.kind) ?? [];
      list.push(c);
      byKind.set(c.kind, list);
    }
    const fanTex = seaFanTexture();
    const makers: Record<CoralPlacement['kind'], (i: number) => BufferGeometry> = {
      branch: () => branchCoral(rng),
      brain: (i) => brainCoral(300 + i),
      tube: () => tubeSponge(rng),
      anemone: () => anemone(rng),
      plate: () => plateCoral(rng),
      fan: () => fanGeometry(),
    };
    const col = new Color();
    for (const [kind, list] of byKind) {
      const sway = kind === 'anemone' ? 0.14 : kind === 'fan' ? 0.12 : 0;
      const mat = applyWorldFx(
        new MeshStandardMaterial({
          roughness: kind === 'brain' ? 0.8 : 0.6,
          side: kind === 'fan' || kind === 'tube' ? DoubleSide : FrontSide,
          alphaMap: kind === 'fan' ? fanTex : null,
          alphaTest: kind === 'fan' ? 0.4 : 0,
          transparent: false,
        }),
        { sway, nightGlow: 0.45, nearFade: true, key: kind },
      );
      for (let v = 0; v < 3; v++) {
        const mine = list.filter((_, i) => i % 3 === v);
        if (!mine.length) continue;
        const mesh = new InstancedMesh(makers[kind](v), mat, mine.length);
        mine.forEach((c, i) => {
          d.position.set(c.x, c.y, c.z);
          d.rotation.set(0, c.rot, 0);
          const s = c.scale * (kind === 'fan' ? 1.3 : 1);
          d.scale.set(s, s, s);
          d.updateMatrix();
          mesh.setMatrixAt(i, d.matrix);
          col.set(CORAL_PALETTE[Math.floor(c.hue * CORAL_PALETTE.length)]);
          if (kind === 'brain') col.lerp(new Color('#d8c27a'), 0.4);
          mesh.setColorAt(i, col);
        });
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        this.group.add(mesh);
      }
    }

    // --- kelp forests
    const kelpGeo = new PlaneGeometry(1.1, 1, 1, 30);
    kelpGeo.translate(0, 0.5, 0);
    const kelpMat = applyWorldFx(
      new MeshStandardMaterial({ color: '#8c9a3a', roughness: 0.7, side: DoubleSide, alphaMap: kelpTexture(), alphaTest: 0.5, emissive: new Color('#1c2a08') }),
      { sway: 1.7, nightGlow: 0.1, nearFade: true, key: 'kelp' },
    );
    const kelp = new InstancedMesh(kelpGeo, kelpMat, layout.kelp.length);
    layout.kelp.forEach((k, i) => {
      d.position.set(k.x, k.y, k.z);
      d.rotation.set(0, k.phase, 0);
      d.scale.set(range(rng, 0.8, 1.4), k.height, 1);
      d.updateMatrix();
      kelp.setMatrixAt(i, d.matrix);
      kelp.setColorAt(i, col.set('#ffffff').lerp(new Color('#c9a64a'), range(rng, 0, 0.6)));
    });
    kelp.castShadow = shadows;
    this.group.add(kelp);

    // --- seagrass tufts
    const blades: BufferGeometry[] = [];
    for (let b = 0; b < 6; b++) {
      const h = range(rng, 0.5, 1.1);
      const g = new PlaneGeometry(0.07, h, 1, 4);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - (p.getY(i) + h / 2) / h * 0.85));
      g.translate(range(rng, -0.2, 0.2), h / 2, range(rng, -0.2, 0.2));
      g.rotateY(range(rng, 0, Math.PI));
      blades.push(g);
    }
    const grassGeo = heightUv(merge(blades));
    const grassMat = applyWorldFx(new MeshStandardMaterial({ color: '#6f9a3c', roughness: 0.8, side: DoubleSide }), { sway: 0.25, key: 'grass' });
    const grass = new InstancedMesh(grassGeo, grassMat, layout.seagrass.length);
    layout.seagrass.forEach((s, i) => {
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(0, s.rot, 0);
      d.scale.setScalar(s.scale);
      d.updateMatrix();
      grass.setMatrixAt(i, d.matrix);
      grass.setColorAt(i, col.set('#ffffff').lerp(new Color('#d6c46a'), range(rng, 0, 0.5)));
    });
    this.group.add(grass);

    // --- ruins: fluted columns, arch, mosaic plaza, fallen drums
    const stoneMat = applyWorldFx(new MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }));
    for (const c of layout.columns) {
      const g = stoneColors(fluteColumn(c.height, c.radius, c.broken, rng), 900 + Math.round(c.x));
      const m = new Mesh(g, stoneMat);
      m.position.set(c.x, c.y, c.z);
      m.rotation.set(Math.cos(c.tiltDir) * c.tilt, 0, Math.sin(c.tiltDir) * c.tilt);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      this.group.add(m);
    }
    const a = layout.arch;
    const archShape = new Shape();
    const half = a.span / 2 + 1.2;
    archShape.moveTo(-half, 0);
    archShape.lineTo(-half, a.height - half * 0.2);
    archShape.absarc(0, a.height - half * 0.2, half, Math.PI, 0, true);
    archShape.lineTo(half, 0);
    archShape.lineTo(half - 2.2, 0);
    archShape.lineTo(half - 2.2, a.height - half * 0.2);
    archShape.absarc(0, a.height - half * 0.2, half - 2.2, 0, Math.PI, false);
    archShape.lineTo(-half + 2.2, 0);
    archShape.closePath();
    const archGeo = new ExtrudeGeometry(archShape, { depth: 2, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 1, curveSegments: 24 });
    archGeo.translate(0, 0, -1);
    const archMesh = new Mesh(stoneColors(ensureAttrs(archGeo), 77), stoneMat);
    archMesh.position.set(a.x, a.y, a.z);
    archMesh.rotation.y = a.rot;
    archMesh.castShadow = shadows;
    archMesh.receiveShadow = shadows;
    this.group.add(archMesh);

    const plaza = new Mesh(
      new CircleGeometry(11, 64),
      applyWorldFx(new MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.75 })),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(a.x, a.y + 0.62, a.z);
    plaza.receiveShadow = shadows;
    this.group.add(plaza);

    for (let i = 0; i < 5; i++) {
      const drum = new Mesh(stoneColors(ensureAttrs(new CylinderGeometry(0.8, 0.8, range(rng, 1.4, 2.6), 20)), 50 + i), stoneMat);
      const ang = range(rng, 0, Math.PI * 2);
      const r = range(rng, 8, 17);
      drum.position.set(a.x + Math.cos(ang) * r, a.y + 1.1, a.z + Math.sin(ang) * r);
      drum.rotation.set(Math.PI / 2, 0, range(rng, 0, Math.PI));
      drum.castShadow = shadows;
      drum.receiveShadow = shadows;
      this.group.add(drum);
    }

    // --- glowing crystals at the plaza, plus one soft light
    this.crystalMat = new MeshStandardMaterial({ color: '#7ff6ff', emissive: new Color('#39d7ff'), emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1 });
    const crystalGeo = new OctahedronGeometry(0.5, 0);
    crystalGeo.scale(0.55, 2, 0.55);
    const crystals = new InstancedMesh(crystalGeo, this.crystalMat, layout.crystals.length);
    layout.crystals.forEach((c, i) => {
      d.position.set(c.x, c.y + c.scale * 0.7, c.z);
      d.rotation.set(range(rng, -0.35, 0.35), range(rng, 0, 3), range(rng, -0.35, 0.35));
      d.scale.setScalar(c.scale);
      d.updateMatrix();
      crystals.setMatrixAt(i, d.matrix);
      crystals.setColorAt(i, col.setHSL(c.hue, 0.8, 0.7));
    });
    this.group.add(crystals);
    this.ruinLight = new PointLight('#5fe8ff', 30, 26, 1.6);
    this.ruinLight.position.set(a.x, a.y + 3, a.z);
    this.group.add(this.ruinLight);

    // --- vents: stubby chimneys (their bubbles come from the particle system)
    const ventGeo = new CylinderGeometry(0.35, 1.1, 1.6, 10, 2, true);
    ventGeo.translate(0, 0.6, 0);
    for (const v of layout.vents) {
      const m = new Mesh(ventGeo, stoneMat);
      m.position.set(v.x, v.y, v.z);
      this.group.add(m);
    }
  }

  update(time: number, night: number): void {
    this.crystalMat.emissiveIntensity = 1.2 + Math.sin(time * 1.3) * 0.3 + night * 1.2;
    this.ruinLight.intensity = 22 + night * 50 + Math.sin(time * 1.3) * 5;
    void globalUniforms;
  }
}
