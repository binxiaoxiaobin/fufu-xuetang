// 追加的地图小场景：小水井、小秋千、小果园。
//
// 为什么单独一个文件：procedural.js 已经很长，而这些新场景只需要同一套
// 黏土基元与材质（clayMaterial），不必再去改动那份久经使用的注册表。
// 约定与 procedural.js 完全一致：
//   · 原点在脚下（y = 0），朝向 +z，旋绕由 data.js 的 rot 控制
//   · 需要"环境动画"的部件（吊桶、秋千座、会开合的门）放进名为 motion 的
//     Group；bakeModel() 会为 PIVOTS 里的名字保留独立分组，这里在顶部注册
//   · 建好后交给 clay.js 的 bakeModel() 合并同色网格

import * as THREE from 'three';
import { clayMaterial, PIVOTS } from './clay.js';
import { Creature } from './animals.js';

PIVOTS.add('motion');

const C = {
  white: 0xfdf7ee, ink: 0x37312e, brown: 0x8b5e3c, brownDark: 0x6a4728,
  stone: 0xb9b0a3, stoneLight: 0xcbd2d6, wood: 0xa8714b, woodDark: 0x83563a, gold: 0xd9a44c,
  water: 0x8ad0ea, green: 0x6fae4e, greenDark: 0x4c8636, mint: 0x8ac7a6,
  red: 0xd8483f, orange: 0xe2823d, yellow: 0xffd45e, roof: 0xc4623f,
  tan: 0xd7a76a, tanLight: 0xe7c396, straw: 0xd8b45f, plank: 0xc98f5e,
};

const m = (hex, opts) => clayMaterial(hex, opts);

function add(parent, geo, material, pos, rot, scale) {
  const mesh = new THREE.Mesh(geo, material);
  if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  return mesh;
}
const sp = (p, mat, pos, scale, rot) => add(p, new THREE.SphereGeometry(1, 20, 14), mat, pos, rot, scale);
const cyl = (p, mat, pos, rt, rb, h, rot, seg = 14) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, pos, rot);
const cn = (p, mat, pos, r, h, rot, seg = 14) => add(p, new THREE.ConeGeometry(r, h, seg), mat, pos, rot);
const bx = (p, mat, pos, w, h, d, rot) => add(p, new THREE.BoxGeometry(w, h, d), mat, pos, rot);
const tor = (p, mat, pos, r, tube, rot) => add(p, new THREE.TorusGeometry(r, tube, 8, 30), mat, pos, rot);
const group = (parent, name, pos) => { const g = new THREE.Group(); g.name = name; if (pos) g.position.set(pos[0], pos[1], pos[2]); parent.add(g); return g; };

// --------------------------------------------------- 环境动画（motion Group）
// 与 procedural.js 里的同名机制一致：只驱动注册过的部件，不碰 Creature 的部件。
const motes = [];
const gateWorld = new THREE.Vector3();
function motion(part, spec) {
  if (!part) return;
  motes.push({ part, spec, baseY: part.position.y, baseZ: part.rotation.z, angle: 0 });
  startMotes();
}
let motesRunning = false;
function startMotes() {
  if (motesRunning) return;
  motesRunning = true;
  let last = performance.now();
  const tick = (now) => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    const camera = Creature.camera;
    for (const mote of motes) {
      const s = mote.spec, p = mote.part;
      if (s.spin) { mote.angle += s.spin * dt; p.rotation.z = mote.angle; }
      else if (s.sway) p.rotation.z = mote.baseZ + Math.sin(t * s.sway.freq + (s.sway.phase || 0)) * s.sway.amp;
      if (s.bob) p.position.y = mote.baseY + Math.sin(t * s.bob.freq + (s.bob.phase || 0)) * s.bob.amp;
      if (s.roll) p.rotation.x = Math.sin(t * s.roll.freq + (s.roll.phase || 0)) * s.roll.amp;
      if (s.gate && camera) {
        p.getWorldPosition(gateWorld);
        const away = Math.hypot(camera.position.x - gateWorld.x, camera.position.z - gateWorld.z);
        const target = away < s.gate.near ? s.gate.open : 0;
        p.rotation.y += (target - p.rotation.y) * Math.min(1, dt * 2.6);
      }
    }
  };
  requestAnimationFrame(tick);
}

// 带门的方形篱笆（与 procedural.js 的 fencedPlot 同一套做法：+z 那面留门洞）
function fencedPlot(root, half, gap, mats) {
  const seg = half - gap / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(root, mats.post, [sx * half, 0.44, sz * half], 0.055, 0.062, 0.88);
    sp(root, mats.post, [sx * half, 0.90, sz * half], [0.075, 0.075, 0.075]);
  }
  for (const x of [-gap / 2, gap / 2]) {
    cyl(root, mats.post, [x, 0.44, half], 0.055, 0.062, 0.88);
    sp(root, mats.post, [x, 0.90, half], [0.075, 0.075, 0.075]);
  }
  for (const y of [0.30, 0.58]) {
    bx(root, mats.rail, [0, y, -half], half * 2, 0.12, 0.07);
    bx(root, mats.rail, [-(half + gap / 2) / 2, y, half], seg, 0.12, 0.07);
    bx(root, mats.rail, [(half + gap / 2) / 2, y, half], seg, 0.12, 0.07);
  }
  for (const sx of [-1, 1]) for (const y of [0.30, 0.58]) bx(root, mats.rail, [sx * half, y, 0], 0.07, 0.12, half * 2);
  const gate = group(root, 'motion', [-gap / 2, 0, half]);
  for (const y of [0.20, 0.46, 0.70]) bx(gate, mats.panel, [gap / 2, y, 0], gap * 0.90, 0.085, 0.07);
  for (const x of [0.055, gap - 0.055]) cyl(gate, mats.panel, [x, 0.45, 0], 0.045, 0.05, 0.88);
  sp(gate, mats.lock, [gap - 0.075, 0.46, 0.055], [0.05, 0.05, 0.04]);
  motion(gate, { gate: { open: -1.78, near: 5.5 } });
  return gate;
}

// --------------------------------------------------- 小水井
// 石砌井口、木架、小屋顶；吊桶挂在那儿轻轻上下晃晃。
function well() {
  const root = new THREE.Group();
  const stone = m(C.stone), stoneLight = m(C.stoneLight), wood = m(C.wood), beam = m(C.woodDark);
  const water = m(C.water), gold = m(C.gold), roof = m(C.roof);
  cyl(root, stone, [0, 0.30, 0], 0.62, 0.70, 0.60, null, 18);
  tor(root, stoneLight, [0, 0.60, 0], 0.63, 0.075, [Math.PI / 2, 0, 0]);
  sp(root, water, [0, 0.52, 0], [0.55, 0.06, 0.55]);
  for (const sx of [-1, 1]) cyl(root, beam, [sx * 0.58, 0.92, 0], 0.055, 0.065, 1.00);
  cyl(root, wood, [0, 1.40, 0], 0.05, 0.05, 1.34, [0, 0, Math.PI / 2]);
  cyl(root, beam, [0.72, 1.28, 0], 0.028, 0.028, 0.28, [0, 0, 0.55]);
  sp(root, gold, [0.85, 1.20, 0], [0.06, 0.06, 0.06]);
  cn(root, roof, [0, 1.86, 0], 0.88, 0.50, [0, Math.PI / 4, 0], 4);
  const bucket = group(root, 'motion', [0, 1.40, 0]);
  cyl(bucket, beam, [0, -0.21, 0], 0.012, 0.012, 0.40);
  cyl(bucket, wood, [0, -0.54, 0], 0.16, 0.13, 0.24, null, 14);
  tor(bucket, gold, [0, -0.43, 0], 0.161, 0.022, [Math.PI / 2, 0, 0]);
  motion(bucket, { bob: { amp: 0.05, freq: 0.7 }, sway: { amp: 0.06, freq: 0.6 } });
  return root;
}

// --------------------------------------------------- 小秋千
// 两根 A 形木架撑起横梁，挂两个会一前一后摆动的木秋千。
function swing() {
  const root = new THREE.Group();
  const wood = m(C.wood), beam = m(C.woodDark), plank = m(C.plank), rope = m(C.tan), ground = m(C.tanLight);
  sp(root, ground, [0, 0.03, 0], [1.90, 0.05, 1.30]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(root, wood, [sx * 0.98, 0.81, sz * 0.25], 0.045, 0.055, 1.70, [-sz * 0.30, 0, 0]);
    sp(root, beam, [sx * 0.98, 0.04, sz * 0.50], [0.10, 0.05, 0.10]);
  }
  cyl(root, beam, [0, 1.62, 0], 0.06, 0.06, 2.16, [0, 0, Math.PI / 2]);
  for (const [x, phase] of [[-0.48, 0], [0.48, Math.PI]]) {
    const seat = group(root, 'motion', [x, 1.62, 0]);
    for (const sx of [-1, 1]) cyl(seat, rope, [sx * 0.30, -0.575, 0], 0.016, 0.016, 1.15);
    bx(seat, plank, [0, -1.15, 0.02], 0.74, 0.08, 0.32);
    motion(seat, { sway: { amp: 0.22, freq: 0.85, phase } });
  }
  return root;
}

// --------------------------------------------------- 小果园
// 篱笆院子里五棵果树，地上落着几只果子，门口摆着果筐。
function orchard() {
  const root = new THREE.Group();
  const wood = m(C.wood), woodDark = m(C.woodDark), gold = m(C.gold);
  const leaf = m(C.green), leafDark = m(C.greenDark), trunk = m(C.brown);
  const fruitA = m(C.red), fruitB = m(C.orange), soil = m(C.soil), grass = m(C.mint), straw = m(C.straw);
  fencedPlot(root, 1.95, 0.78, { post: woodDark, rail: wood, panel: wood, lock: gold });
  sp(root, grass, [0, 0.04, 0], [1.86, 0.10, 1.86]);
  const trees = [[-1.06, -0.98, 1.00], [1.02, -1.06, 0.92], [-1.00, 1.02, 0.88], [1.06, 0.94, 0.96], [0.02, -0.02, 0.80]];
  for (const [x, z, s] of trees) {
    sp(root, soil, [x, 0.07, z], [0.42 * s, 0.09 * s, 0.42 * s]);
    cyl(root, trunk, [x, 0.44 * s, z], 0.085 * s, 0.115 * s, 0.88 * s);
    sp(root, leaf, [x, 1.12 * s, z], [0.60 * s, 0.54 * s, 0.60 * s]);
    sp(root, leafDark, [x - 0.26 * s, 1.02 * s, z + 0.20 * s], [0.38 * s, 0.34 * s, 0.38 * s]);
    sp(root, leaf, [x + 0.28 * s, 1.06 * s, z - 0.16 * s], [0.34 * s, 0.30 * s, 0.34 * s]);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + x * 3;
      sp(root, k % 2 ? fruitB : fruitA, [x + Math.cos(a) * 0.44 * s, 0.98 * s, z + Math.sin(a) * 0.44 * s], [0.095, 0.095, 0.095]);
    }
  }
  for (const [x, z] of [[1.30, 1.24], [-1.34, 1.20]]) {
    cyl(root, straw, [x, 0.15, z], 0.21, 0.16, 0.26, null, 12);
    sp(root, fruitA, [x, 0.28, z], [0.15, 0.08, 0.15]);
    sp(root, fruitB, [x + 0.07, 0.32, z - 0.05], [0.10, 0.08, 0.10]);
  }
  return root;
}

// ------------------------------------------------------------------ registry
export const ZONES = { well, swing, orchard };

export function hasZone(id) { return Object.prototype.hasOwnProperty.call(ZONES, id); }
export function buildZone(id) {
  const builder = ZONES[id];
  if (!builder) throw new Error(`没有为 ${id} 定义黏土场景`);
  return builder();
}
