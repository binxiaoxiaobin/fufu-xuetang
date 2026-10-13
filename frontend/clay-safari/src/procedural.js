// 程序化黏土模型：动物、道具与地图场景都用球体 / 胶囊 / 圆锥 / 圆柱现场捏出来，
// 材质与配色和原项目的黏土模型完全一致。
//
// 约定：
//   · 模型原点在脚下（y = 0），朝向默认 +z，旋转由 data.js 的 rot 控制
//   · 会动的部件用 Group 命名成 head / tail / earL / earR / wingL / wingR / armL / armR / body
//     animals.js 就能像对待 GLB 动物一样驱动它们
//   · 纯环境动画（转动的风车叶片、飘动的烟、会打开的门）放进名为 motion 的 Group，
//     由本文件底部的 motionTicker 驱动：它不是 Creature 的部件，两边不会互相覆盖
//   · 建好后统一交给 clay.js 的 bakeModel() 合并同色网格，控制 draw call
//   · 需要"很薄的片"时用 ExtrudeGeometry（实体），不要用 DoubleSide 平面，
//     因为 bakeModel 重建材质时不会保留 side 设置
//
// 加新内容：写一个 build 函数 → 加进 PROCEDURAL → 在 data.js 的 ITEMS 里补一条
// （需要积分解锁的加 lock: true）。

import * as THREE from 'three';
import { clayMaterial, PIVOTS } from './clay.js';
import { Creature } from './animals.js';

// bakeModel 会为 PIVOTS 里的名字保留独立分组；注册 motion 后动画部件才不会被合并进 root。
PIVOTS.add('motion');

const C = {
  white: 0xfdf7ee, cream: 0xf3e2c4, ink: 0x37312e, brown: 0x8b5e3c, brownDark: 0x6a4728,
  gray: 0x9ba4aa, grayLight: 0xcbd2d6, pink: 0xf2a3b3, orange: 0xe2823d, orangeLight: 0xf2a763,
  green: 0x6fae4e, greenDark: 0x4c8636, yellow: 0xffd45e, red: 0xd8483f, blue: 0x5aa9d6,
  tan: 0xd7a76a, tanLight: 0xe7c396, stone: 0xb9b0a3, wood: 0xa8714b, woodDark: 0x83563a, gold: 0xd9a44c,
  flameOuter: 0xff8a3d, flameInner: 0xffd45e, tent: 0xe4784a, tentLight: 0xf0a071, tentDark: 0x5c3626,
  water: 0x8ad0ea, soil: 0x8a6042, straw: 0xd8b45f, roof: 0xc4623f,
  glass: 0xb5dcea, mint: 0x8ac7a6, canvas: 0xf2e6cc, plank: 0xc98f5e,
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
const cap = (p, mat, pos, r, len, rot) => add(p, new THREE.CapsuleGeometry(r, len, 5, 14), mat, pos, rot);
const cyl = (p, mat, pos, rt, rb, h, rot, seg = 14) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, pos, rot);
const cn = (p, mat, pos, r, h, rot, seg = 14) => add(p, new THREE.ConeGeometry(r, h, seg), mat, pos, rot);
const bx = (p, mat, pos, w, h, d, rot) => add(p, new THREE.BoxGeometry(w, h, d), mat, pos, rot);
const tor = (p, mat, pos, r, tube, rot) => add(p, new THREE.TorusGeometry(r, tube, 8, 30), mat, pos, rot);
const group = (parent, name, pos) => { const g = new THREE.Group(); g.name = name; if (pos) g.position.set(pos[0], pos[1], pos[2]); parent.add(g); return g; };

function slab(parent, shape, mat, pos, depth, rot) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return add(parent, geo, mat, pos, rot);
}

function legs(parent, mat, rx, rz, r, len) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cap(parent, mat, [sx * rx, len / 2 + r, sz * rz], r, len);
  }
}

// --------------------------------------------------- 环境动画（motion Group）
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
        // 篱笆门：走远关着，走近就打开
        p.getWorldPosition(gateWorld);
        const away = Math.hypot(camera.position.x - gateWorld.x, camera.position.z - gateWorld.z);
        const target = away < s.gate.near ? s.gate.open : 0;
        p.rotation.y += (target - p.rotation.y) * Math.min(1, dt * 2.6);
      }
    }
  };
  requestAnimationFrame(tick);
}

// 一个带门的方形小园子：四面篱笆，+z 那面留出门洞，装一扇会转开的木门。
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

// ------------------------------------------------------------------ animals

function rabbit() {
  const root = new THREE.Group();
  const fur = m(C.cream), white = m(C.white), pink = m(C.pink), dark = m(C.ink);
  legs(root, fur, 0.15, 0.20, 0.075, 0.10);
  sp(root, fur, [0, 0.35, -0.02], [0.26, 0.25, 0.34]);
  const tail = group(root, 'tail', [0, 0.38, -0.33]);
  sp(tail, white, [0, 0, 0], [0.12, 0.12, 0.11]);
  const head = group(root, 'head', [0, 0.58, 0.19]);
  sp(head, fur, [0, 0, 0], [0.20, 0.19, 0.19]);
  sp(head, white, [0, -0.04, 0.15], [0.11, 0.08, 0.09]);
  sp(head, pink, [0, -0.02, 0.23], [0.035, 0.03, 0.03]);
  for (const sx of [-1, 1]) {
    const ear = group(head, sx < 0 ? 'earL' : 'earR', [sx * 0.08, 0.13, -0.01]);
    cap(ear, fur, [0, 0.11, 0], 0.05, 0.22, [0, 0, -sx * 0.18]);
    cap(ear, pink, [0, 0.11, 0.03], 0.028, 0.19, [0, 0, -sx * 0.18]);
    sp(head, dark, [sx * 0.09, 0.04, 0.155], [0.032, 0.036, 0.03]);
  }
  return root;
}

function deer() {
  const root = new THREE.Group();
  const fur = m(C.tan), light = m(C.tanLight), dark = m(C.ink), white = m(C.white);
  legs(root, m(C.brownDark), 0.13, 0.26, 0.05, 0.42);
  const body = group(root, 'body', [0, 0.64, 0]);
  sp(body, fur, [0, 0, 0], [0.20, 0.22, 0.36]);
  sp(body, white, [0, -0.04, 0.07], [0.16, 0.15, 0.24]);
  const neck = group(root, 'neck', [0, 0.78, 0.22]);
  cyl(neck, fur, [0, 0, 0], 0.075, 0.085, 0.34, [-0.55, 0, 0]);
  const tail = group(root, 'tail', [0, 0.70, -0.36]);
  sp(tail, white, [0, 0, 0], [0.055, 0.075, 0.04]);
  const head = group(root, 'head', [0, 0.98, 0.38]);
  sp(head, fur, [0, 0, 0], [0.125, 0.115, 0.20]);
  sp(head, light, [0, -0.035, 0.15], [0.085, 0.075, 0.09]);
  sp(head, dark, [0, -0.02, 0.22], [0.028, 0.025, 0.025]);
  for (const sx of [-1, 1]) {
    const ear = group(head, sx < 0 ? 'earL' : 'earR', [sx * 0.10, 0.06, -0.02]);
    sp(ear, fur, [0, 0.04, 0], [0.045, 0.085, 0.025], [0, 0, -sx * 0.5]);
    sp(head, dark, [sx * 0.085, 0.035, 0.07], [0.026, 0.028, 0.024]);
    cyl(head, light, [sx * 0.06, 0.20, -0.02], 0.016, 0.018, 0.24, [0, 0, -sx * 0.28]);
    cyl(head, light, [sx * 0.12, 0.26, 0.02], 0.012, 0.013, 0.16, [0.35, 0, -sx * 0.9]);
    cyl(head, light, [sx * 0.13, 0.30, -0.06], 0.011, 0.012, 0.13, [-0.4, 0, -sx * 0.7]);
  }
  return root;
}

function panda() {
  const root = new THREE.Group();
  const white = m(C.white), ink = m(C.ink);
  legs(root, ink, 0.17, 0.20, 0.085, 0.12);
  const body = group(root, 'body', [0, 0.48, 0]);
  sp(body, white, [0, 0, 0], [0.29, 0.31, 0.26]);
  sp(body, white, [0, -0.04, 0.15], [0.21, 0.23, 0.13]);
  for (const sx of [-1, 1]) {
    const arm = group(body, sx < 0 ? 'armL' : 'armR', [sx * 0.28, 0.02, 0.02]);
    cap(arm, ink, [0, -0.08, 0], 0.075, 0.18, [0, 0, -sx * 0.22]);
  }
  const tail = group(root, 'tail', [0, 0.44, -0.27]);
  sp(tail, white, [0, 0, 0], [0.06, 0.06, 0.05]);
  const head = group(root, 'head', [0, 0.82, 0.03]);
  sp(head, white, [0, 0, 0], [0.26, 0.24, 0.24]);
  sp(head, white, [0, -0.07, 0.21], [0.09, 0.07, 0.07]);
  sp(head, ink, [0, -0.05, 0.26], [0.035, 0.03, 0.03]);
  for (const sx of [-1, 1]) {
    const ear = group(head, sx < 0 ? 'earL' : 'earR', [sx * 0.20, 0.18, -0.02]);
    sp(ear, ink, [0, 0, 0], [0.10, 0.10, 0.05]);
    sp(head, ink, [sx * 0.10, 0.02, 0.19], [0.078, 0.095, 0.05], [0, 0, sx * 0.45]);
    sp(head, white, [sx * 0.095, 0.035, 0.235], [0.024, 0.026, 0.02]);
    sp(head, ink, [sx * 0.095, 0.035, 0.25], [0.014, 0.015, 0.012]);
  }
  return root;
}

function turtle() {
  const root = new THREE.Group();
  const skin = m(C.green), shell = m(C.greenDark), light = m(C.green);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sp(root, skin, [sx * 0.25, 0.08, sz * 0.24], [0.09, 0.06, 0.11]);
  const body = group(root, 'body', [0, 0.30, -0.02]);
  sp(body, shell, [0, 0, 0], [0.36, 0.28, 0.46]);
  tor(body, light, [0, -0.06, 0], 0.36, 0.045, [Math.PI / 2, 0, 0]);
  sp(body, light, [0, 0.06, 0], [0.26, 0.20, 0.34]);
  const head = group(root, 'head', [0, 0.28, 0.50]);
  sp(head, skin, [0, 0, 0], [0.115, 0.105, 0.14]);
  for (const sx of [-1, 1]) sp(head, m(C.ink), [sx * 0.07, 0.045, 0.06], [0.022, 0.024, 0.02]);
  const tail = group(root, 'tail', [0, 0.26, -0.50]);
  cn(tail, skin, [0, 0, 0], 0.055, 0.14, [-Math.PI / 2, 0, 0]);
  return root;
}

function penguin() {
  const root = new THREE.Group();
  const ink = m(C.ink), white = m(C.white), orange = m(C.orange);
  for (const sx of [-1, 1]) sp(root, orange, [sx * 0.11, 0.035, 0.07], [0.095, 0.03, 0.13]);
  const body = group(root, 'body', [0, 0.44, 0]);
  cap(body, ink, [0, 0, 0], 0.215, 0.28);
  sp(body, white, [0, -0.02, 0.10], [0.165, 0.27, 0.15]);
  for (const sx of [-1, 1]) {
    const wing = group(body, sx < 0 ? 'wingL' : 'wingR', [sx * 0.235, 0.06, 0]);
    sp(wing, ink, [0, -0.04, 0], [0.05, 0.22, 0.11], [0, 0, -sx * 0.16]);
  }
  const head = group(root, 'head', [0, 0.86, 0.02]);
  sp(head, ink, [0, 0, 0], [0.175, 0.175, 0.175]);
  sp(head, white, [0, 0, 0.10], [0.115, 0.115, 0.10]);
  cn(head, orange, [0, -0.02, 0.20], 0.05, 0.13, [Math.PI / 2, 0, 0]);
  for (const sx of [-1, 1]) sp(head, ink, [sx * 0.065, 0.05, 0.145], [0.024, 0.026, 0.02]);
  return root;
}

function owl() {
  const root = new THREE.Group();
  const brown = m(C.brown), light = m(C.tanLight), ink = m(C.ink), gold = m(C.gold), white = m(C.white);
  for (const sx of [-1, 1]) sp(root, gold, [sx * 0.08, 0.03, 0.05], [0.07, 0.03, 0.09]);
  const body = group(root, 'body', [0, 0.37, 0]);
  sp(body, brown, [0, 0, 0], [0.245, 0.30, 0.225]);
  sp(body, light, [0, -0.04, 0.11], [0.165, 0.21, 0.125]);
  for (const sx of [-1, 1]) {
    const wing = group(body, sx < 0 ? 'wingL' : 'wingR', [sx * 0.235, 0.02, 0]);
    sp(wing, brown, [0, -0.03, 0], [0.05, 0.21, 0.115], [0, 0, -sx * 0.12]);
  }
  const head = group(root, 'head', [0, 0.70, 0.02]);
  sp(head, brown, [0, 0, 0], [0.255, 0.225, 0.225]);
  for (const sx of [-1, 1]) {
    const ear = group(head, sx < 0 ? 'earL' : 'earR', [sx * 0.15, 0.16, -0.01]);
    cn(ear, brown, [0, 0.05, 0], 0.075, 0.17, [0, 0, -sx * 0.3]);
    sp(head, white, [sx * 0.10, 0.015, 0.155], [0.098, 0.098, 0.05]);
    sp(head, ink, [sx * 0.10, 0.015, 0.20], [0.048, 0.048, 0.03]);
    sp(head, white, [sx * 0.128, 0.048, 0.212], [0.016, 0.016, 0.012]);
  }
  cn(head, gold, [0, -0.07, 0.195], 0.038, 0.10, [Math.PI * 0.72, 0, 0]);
  return root;
}

function fox() {
  const root = new THREE.Group();
  const orange = m(C.orange), light = m(C.orangeLight), white = m(C.white), ink = m(C.ink);
  legs(root, m(C.brownDark), 0.11, 0.24, 0.055, 0.24);
  const body = group(root, 'body', [0, 0.46, 0]);
  sp(body, orange, [0, 0, 0], [0.19, 0.19, 0.34]);
  sp(body, white, [0, -0.02, 0.23], [0.13, 0.13, 0.10]);
  const tail = group(root, 'tail', [0, 0.48, -0.38]);
  sp(tail, orange, [0, 0, 0], [0.12, 0.12, 0.21]);
  sp(tail, white, [0, 0.01, -0.19], [0.09, 0.09, 0.09]);
  const head = group(root, 'head', [0, 0.66, 0.30]);
  sp(head, orange, [0, 0, 0], [0.165, 0.155, 0.165]);
  cn(head, light, [0, -0.02, 0.15], 0.075, 0.19, [Math.PI / 2, 0, 0]);
  sp(head, ink, [0, -0.02, 0.245], [0.035, 0.035, 0.032]);
  for (const sx of [-1, 1]) {
    const ear = group(head, sx < 0 ? 'earL' : 'earR', [sx * 0.10, 0.14, -0.02]);
    cn(ear, orange, [0, 0.04, 0], 0.065, 0.17, [0, 0, -sx * 0.2]);
    cn(ear, ink, [0, 0.03, 0.02], 0.035, 0.11, [0, 0, -sx * 0.2]);
    sp(head, ink, [sx * 0.072, 0.03, 0.115], [0.024, 0.026, 0.02]);
    sp(head, white, [sx * 0.105, -0.045, 0.05], [0.06, 0.05, 0.05]);
  }
  return root;
}

function koala() {
  const root = new THREE.Group();
  const gray = m(C.gray), light = m(C.grayLight), ink = m(C.ink), white = m(C.white);
  legs(root, gray, 0.15, 0.18, 0.075, 0.12);
  const body = group(root, 'body', [0, 0.46, 0]);
  sp(body, gray, [0, 0, 0], [0.27, 0.29, 0.25]);
  sp(body, light, [0, -0.03, 0.13], [0.18, 0.20, 0.12]);
  const tail = group(root, 'tail', [0, 0.42, -0.25]);
  sp(tail, gray, [0, 0, 0], [0.055, 0.055, 0.04]);
  const head = group(root, 'head', [0, 0.76, 0.03]);
  sp(head, gray, [0, 0, 0], [0.25, 0.23, 0.23]);
  for (const sx of [-1, 1]) {
    const ear = group(head, sx < 0 ? 'earL' : 'earR', [sx * 0.25, 0.06, -0.01]);
    sp(ear, gray, [0, 0, 0], [0.135, 0.135, 0.055]);
    sp(ear, white, [0, 0, 0.035], [0.09, 0.09, 0.04]);
    sp(head, ink, [sx * 0.115, 0.05, 0.165], [0.026, 0.028, 0.022]);
  }
  sp(head, ink, [0, -0.07, 0.195], [0.095, 0.085, 0.075]);
  return root;
}

// ------------------------------------------------------------------ props

function tent() {
  const root = new THREE.Group();
  const cloth = m(C.tent), wood = m(C.wood), dark = m(C.tentDark);
  cn(root, cloth, [0, 0.58, 0], 1.06, 1.16, [0, Math.PI / 4, 0], 4);
  bx(root, dark, [0, 0.30, 0.40], 0.34, 0.62, 0.05, [-0.72, 0, 0]);
  cyl(root, wood, [0, 1.24, 0], 0.022, 0.022, 0.18);
  const flag = new THREE.Shape();
  flag.moveTo(0, 0); flag.lineTo(0.30, -0.09); flag.lineTo(0, -0.18); flag.closePath();
  slab(root, flag, m(C.yellow, { sheen: 0.05 }), [0.02, 1.32, 0], 0.02);
  return root;
}

function campfire() {
  const root = new THREE.Group();
  const stone = m(C.stone), wood = m(C.woodDark);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = 0.52 + (i % 3) * 0.03;
    sp(root, stone, [Math.cos(a) * r, 0.06, Math.sin(a) * r], [0.11, 0.085, 0.10], [0, a, 0]);
  }
  for (let i = 0; i < 3; i++) cyl(root, wood, [0, 0.10, 0], 0.055, 0.06, 0.68, [0, i / 3 * Math.PI, Math.PI / 2]);
  cn(root, m(C.flameOuter, { emissive: 0xff6a00, emissiveIntensity: 2.4, roughness: 0.45, sheen: 0 }), [0, 0.36, 0], 0.21, 0.48);
  cn(root, m(C.flameInner, { emissive: 0xffb300, emissiveIntensity: 3, roughness: 0.4, sheen: 0 }), [0, 0.30, 0], 0.115, 0.30);
  return root;
}

function signpost() {
  const root = new THREE.Group();
  const wood = m(C.wood), woodDark = m(C.woodDark), stone = m(C.stone), gold = m(C.gold);
  sp(root, stone, [0, 0.07, 0], [0.24, 0.13, 0.22]);
  cyl(root, wood, [0, 0.70, 0], 0.052, 0.06, 1.30);
  bx(root, woodDark, [0.04, 1.06, 0], 0.54, 0.18, 0.05, [0, 0.28, 0]);
  cn(root, gold, [0.32, 1.06, 0.05], 0.10, 0.16, [Math.PI / 2, 0.28, 0], 4);
  bx(root, gold, [-0.04, 0.78, 0], 0.48, 0.17, 0.05, [0, -0.36, 0]);
  cn(root, woodDark, [-0.28, 0.78, -0.05], 0.09, 0.15, [Math.PI / 2, -0.36, 0], 4);
  return root;
}

function balloon() {
  const root = new THREE.Group();
  const cloth = m(C.red), yellow = m(C.yellow), blue = m(C.blue), white = m(C.white), wood = m(C.wood), rope = m(C.brownDark);
  sp(root, cloth, [0, 1.00, 0], [0.52, 0.62, 0.52]);
  tor(root, yellow, [0, 0.80, 0], 0.505, 0.045, [Math.PI / 2, 0, 0]);
  tor(root, white, [0, 1.00, 0], 0.525, 0.045, [Math.PI / 2, 0, 0]);
  tor(root, blue, [0, 1.22, 0], 0.44, 0.045, [Math.PI / 2, 0, 0]);
  cn(root, cloth, [0, 1.66, 0], 0.20, 0.28, null, 16);
  bx(root, wood, [0, 0.32, 0], 0.32, 0.26, 0.32);
  bx(root, m(C.woodDark), [0, 0.46, 0], 0.36, 0.05, 0.36);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(root, rope, [sx * 0.15, 0.72, sz * 0.15], 0.012, 0.012, 0.52, [sz * 0.30, 0, -sx * 0.30]);
  }
  return root;
}

function kite() {
  const root = new THREE.Group();
  const half = (sign) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.58); s.lineTo(sign * 0.40, 0.04); s.lineTo(0, -0.58); s.closePath();
    return s;
  };
  slab(root, half(1), m(C.red), [0, 0.98, 0], 0.04, [0, 0, 0.18]);
  slab(root, half(-1), m(C.blue), [0, 0.98, 0], 0.04, [0, 0, 0.18]);
  bx(root, m(C.gold), [0, 0.98, 0.042], 0.05, 1.14, 0.02, [0, 0, 0.18]);
  bx(root, m(C.gold), [0, 0.98, 0.042], 0.78, 0.05, 0.02, [0, 0, 0.18]);
  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    sp(root, i % 2 ? m(C.yellow) : m(C.pink), [-0.13 - k * 0.24, 0.34 - k * 0.29, 0], [0.045, 0.05, 0.04]);
  }
  cyl(root, m(C.woodDark), [0.32, 0.10, 0.30], 0.018, 0.025, 0.20, [0, 0, 0.35]);
  return root;
}

function lantern() {
  const root = new THREE.Group();
  const wood = m(C.wood), gold = m(C.gold);
  sp(root, m(C.stone), [0, 0.07, 0], [0.22, 0.12, 0.20]);
  cyl(root, wood, [0, 0.82, 0], 0.042, 0.05, 1.54);
  cyl(root, wood, [0.17, 1.54, 0], 0.032, 0.032, 0.34, [0, 0, Math.PI / 2]);
  const body = group(root, 'body', [0.33, 1.26, 0]);
  sp(body, m(C.red, { emissive: 0xd8483f, emissiveIntensity: 1.6, roughness: 0.55 }), [0, 0, 0], [0.20, 0.235, 0.20]);
  cyl(body, gold, [0, 0.235, 0], 0.095, 0.10, 0.05);
  cyl(body, gold, [0, -0.235, 0], 0.10, 0.095, 0.05);
  tor(body, gold, [0, 0.02, 0], 0.20, 0.018, [Math.PI / 2, 0, 0]);
  tor(body, gold, [0, -0.10, 0], 0.185, 0.016, [Math.PI / 2, 0, 0]);
  cyl(body, gold, [0, -0.32, 0], 0.018, 0.022, 0.16);
  return root;
}

// ------------------------------------------------------------------ 地图场景
// 每个场景是一小片可逛的场地，材质与几何基元和动物完全同源，尺寸也在同一量级。

// 小菜园：篱笆围起来，门口一道会打开的木门，畦上是萝卜和白菜，角落站着稻草人
function garden() {
  const root = new THREE.Group();
  const wood = m(C.wood), woodDark = m(C.woodDark), soil = m(C.soil), leaf = m(C.green);
  const carrot = m(C.orange), straw = m(C.straw), shirt = m(C.blue), gold = m(C.gold);
  fencedPlot(root, 1.55, 0.62, { post: woodDark, rail: wood, panel: wood, lock: gold });
  for (let row = 0; row < 3; row++) {
    const z = -0.82 + row * 0.82;
    sp(root, soil, [0, 0.06, z], [1.30, 0.13, 0.34]);
    for (let i = 0; i < 5; i++) {
      const x = -1.0 + i * 0.5;
      if ((i + row) % 2 === 0) {
        cn(root, carrot, [x, 0.15, z], 0.07, 0.22, [Math.PI, 0, 0], 8);
        sp(root, leaf, [x, 0.29, z], [0.12, 0.09, 0.12]);
      } else {
        sp(root, leaf, [x, 0.21, z], [0.16, 0.14, 0.16]);
      }
    }
  }
  const scare = group(root, 'motion', [-1.02, 0, -1.00]);
  cyl(scare, wood, [0, 0.62, 0], 0.045, 0.05, 1.24);
  cyl(scare, wood, [0, 0.92, 0], 0.04, 0.04, 0.86, [0, 0, Math.PI / 2]);
  sp(scare, shirt, [0, 0.84, 0], [0.26, 0.28, 0.20]);
  sp(scare, straw, [0, 1.20, 0], [0.165, 0.165, 0.165]);
  cn(scare, straw, [0, 1.41, 0], 0.235, 0.21, null, 10);
  for (const sx of [-1, 1]) cap(scare, straw, [sx * 0.44, 0.90, 0], 0.05, 0.10, [0, 0, Math.PI / 2]);
  motion(scare, { sway: { amp: 0.045, freq: 0.7 } });
  cyl(root, m(C.mint), [1.02, 0.20, 0.95], 0.14, 0.175, 0.30);
  cyl(root, m(C.mint), [1.15, 0.31, 0.95], 0.045, 0.045, 0.36, [0, 0, -0.95]);
  return root;
}

// 小花园：同样的篱笆与门，里面是一畦花，中间几朵随风轻摆
function flowerfield() {
  const root = new THREE.Group();
  const wood = m(C.wood), woodDark = m(C.woodDark), stem = m(C.green), bud = m(C.yellow), gold = m(C.gold);
  fencedPlot(root, 1.55, 0.62, { post: woodDark, rail: wood, panel: wood, lock: gold });
  sp(root, m(C.green), [0, 0.05, 0], [1.34, 0.14, 1.34]);
  const bloom = [C.pink, C.yellow, C.white, C.orange, C.red, C.cream, C.blue, C.tanLight];
  const spot = [[-0.95, -0.60], [-0.45, 0.35], [-1.05, 0.72], [0.10, -1.00], [0.50, -0.55], [0.95, 0.40],
                [1.05, -1.05], [0.20, 0.95], [-0.75, -1.15], [1.10, 0.95], [0.65, 1.15], [-0.25, -0.20],
                [0.30, 0.55], [-1.02, 1.10], [1.02, -0.30], [0.85, -1.20]];
  spot.forEach(([x, z], i) => {
    const s = 0.85 + (i % 3) * 0.12;
    cyl(root, stem, [x, 0.22, z], 0.02, 0.024, 0.30);
    sp(root, m(bloom[i % bloom.length]), [x, 0.39, z], [0.085 * s, 0.07 * s, 0.085 * s]);
    sp(root, bud, [x, 0.41, z], [0.038 * s, 0.038 * s, 0.038 * s]);
  });
  const sway = group(root, 'motion', [0, 0.03, 0]);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45;
    cyl(sway, stem, [x, 0.34, z], 0.024, 0.028, 0.62);
    sp(sway, m(bloom[(i + 3) % bloom.length]), [x, 0.66, z], [0.10, 0.085, 0.10]);
  }
  motion(sway, { sway: { amp: 0.06, freq: 0.9 } });
  return root;
}

// 沙坑：一圈沙堆围着小城堡、水桶和铲子
function sandpit() {
  const root = new THREE.Group();
  const sand = m(C.tanLight), sand2 = m(C.tan), wood = m(C.wood), leaf = m(C.green);
  sp(root, sand, [0, 0.07, 0], [1.60, 0.16, 1.60]);
  tor(root, sand2, [0, 0.05, 0], 1.52, 0.14, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.4;
    sp(root, sand2, [Math.cos(a) * 1.55, 0.10, Math.sin(a) * 1.55], [0.20, 0.13, 0.20], [0, a, 0]);
  }
  bx(root, sand2, [-0.30, 0.26, 0.10], 0.52, 0.42, 0.52);
  bx(root, sand, [-0.30, 0.50, 0.10], 0.44, 0.06, 0.44);
  cyl(root, sand2, [-0.30, 0.62, 0.10], 0.14, 0.17, 0.22, null, 10);
  cn(root, sand, [-0.30, 0.80, 0.10], 0.17, 0.22, null, 10);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    sp(root, sand2, [-0.30 + Math.cos(a) * 0.26, 0.50, 0.10 + Math.sin(a) * 0.26], [0.08, 0.10, 0.08]);
  }
  cyl(root, m(C.red), [0.62, 0.20, 0.42], 0.20, 0.16, 0.30, null, 12);
  tor(root, m(C.red), [0.62, 0.34, 0.42], 0.19, 0.03, [Math.PI / 2, 0, 0]);
  cyl(root, wood, [0.72, 0.05, -0.52], 0.028, 0.028, 0.62, [0, 0.6, Math.PI / 2]);
  bx(root, m(C.stone), [0.86, 0.04, -0.42], 0.24, 0.06, 0.20, [0, 0.6, 0]);
  sp(root, leaf, [1.10, 0.10, 0.60], [0.13, 0.08, 0.13]);
  return root;
}

// 凉亭：石头台基、四根柱子、攒尖顶，屋檐下挂着会晃的铃铛
function pavilion() {
  const root = new THREE.Group();
  const post = m(C.wood), beam = m(C.woodDark), roof = m(C.roof), gold = m(C.gold), stone = m(C.stone);
  cyl(root, stone, [0, 0.09, 0], 1.42, 1.50, 0.18, null, 20);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(root, post, [sx * 0.92, 0.92, sz * 0.92], 0.085, 0.095, 1.50);
    sp(root, gold, [sx * 0.92, 1.70, sz * 0.92], [0.10, 0.10, 0.10]);
  }
  cn(root, roof, [0, 2.16, 0], 1.60, 0.74, [0, Math.PI / 6, 0], 6);
  sp(root, gold, [0, 2.56, 0], [0.12, 0.16, 0.12]);
  bx(root, beam, [0, 0.50, -0.72], 1.30, 0.10, 0.44);
  for (const sx of [-1, 1]) bx(root, beam, [sx * 0.55, 0.26, -0.72], 0.09, 0.44, 0.09);
  const chime = group(root, 'motion', [0, 1.62, 0]);
  cyl(chime, m(C.red), [0, -0.16, 0], 0.012, 0.012, 0.32);
  sp(chime, m(C.red), [0, -0.36, 0], [0.11, 0.13, 0.11]);
  cyl(chime, gold, [0, -0.50, 0], 0.018, 0.024, 0.14);
  for (const sx of [-1, 1]) {
    cyl(chime, gold, [sx * 0.16, -0.26, 0], 0.01, 0.01, 0.24);
    sp(chime, gold, [sx * 0.16, -0.40, 0], [0.055, 0.055, 0.055]);
  }
  motion(chime, { sway: { amp: 0.11, freq: 1.3 } });
  return root;
}

// 小码头：木栈道伸向河边，旁边泊着一条会轻轻摇晃的小船
function dock() {
  const root = new THREE.Group();
  const plank = m(C.plank), wood = m(C.wood), wood2 = m(C.woodDark), rope = m(C.tan);
  for (let i = 0; i < 7; i++) bx(root, i % 2 ? wood : plank, [-1.20 + i * 0.40, 0.20, 0], 0.34, 0.10, 1.10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(root, wood2, [sx * 1.22, 0.02, sz * 0.48], 0.075, 0.08, 0.60);
  cyl(root, wood2, [1.30, 0.55, 0.52], 0.07, 0.075, 0.90);
  tor(root, rope, [1.30, 0.72, 0.52], 0.13, 0.035, null);
  const boat = group(root, 'motion', [-1.95, 0.16, 0.05]);
  sp(boat, wood, [0, 0, 0], [0.58, 0.24, 0.26]);
  sp(boat, wood2, [0, 0.06, 0], [0.44, 0.14, 0.18]);
  bx(boat, plank, [0, 0.10, 0], 0.30, 0.06, 0.40);
  bx(boat, plank, [0.30, 0.10, 0], 0.20, 0.06, 0.40);
  cyl(boat, wood2, [-0.52, 0.14, 0.30], 0.026, 0.026, 0.72, [0, 0, Math.PI / 2]);
  cyl(boat, wood2, [-0.52, 0.14, 0.30], 0.05, 0.05, 0.10, [Math.PI / 2, 0, 0]);
  motion(boat, { bob: { amp: 0.05, freq: 0.8 }, roll: { amp: 0.07, freq: 0.6 } });
  return root;
}

// 小池塘：水面上浮着睡莲，岸边一圈石头和香蒲
function pond() {
  const root = new THREE.Group();
  const water = m(C.water), mud = m(C.tan), stone = m(C.stone), reed = m(C.green), cattail = m(C.brownDark);
  sp(root, water, [0, 0.16, 0], [1.45, 0.16, 1.45]);
  tor(root, mud, [0, 0.08, 0], 1.42, 0.17, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2 + 0.2, r = 1.5 + (i % 3) * 0.06;
    sp(root, stone, [Math.cos(a) * r, 0.07, Math.sin(a) * r], [0.2, 0.13, 0.18], [0, a, 0]);
  }
  for (let i = 0; i < 6; i++) {
    const a = -0.95 + i * 0.42, r = 1.1 + (i % 2) * 0.2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    cyl(root, reed, [x, 0.45, z], 0.03, 0.036, 0.76, [0, 0, (i % 3 - 1) * 0.09]);
    cap(root, cattail, [x, 0.9, z], 0.055, 0.1);
  }
  const pads = group(root, 'motion', [0, 0.30, 0]);
  for (const [px, pz, s] of [[-0.5, 0.35, 0.34], [0.45, -0.28, 0.3], [0.05, 0.62, 0.24]]) sp(pads, m(C.greenDark), [px, 0, pz], [s, 0.035, s]);
  sp(pads, m(C.pink), [0.42, 0.07, -0.26], [0.11, 0.08, 0.11]);
  sp(pads, m(C.cream), [0.42, 0.10, -0.26], [0.05, 0.05, 0.05]);
  motion(pads, { bob: { amp: 0.05, freq: 1.1 } });
  return root;
}

// 小木屋：圆木墙、四坡屋顶，烟囱里飘着两团浮动的烟
function cabin() {
  const root = new THREE.Group();
  const wall = m(C.wood), beam = m(C.woodDark), roof = m(C.roof), dark = m(C.tentDark), glass = m(C.glass), stone = m(C.stone);
  bx(root, wall, [0, 0.80, 0], 1.70, 1.35, 1.50);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(root, beam, [sx * 0.84, 0.80, sz * 0.74], 0.075, 0.075, 1.44);
  cn(root, roof, [0, 1.94, 0], 1.50, 0.98, [0, Math.PI / 4, 0], 4);
  bx(root, dark, [0, 0.62, 0.77], 0.56, 1.16, 0.07);
  sp(root, m(C.gold), [0.19, 0.62, 0.82], [0.045, 0.045, 0.035]);
  bx(root, glass, [0.50, 1.02, 0.77], 0.44, 0.44, 0.05);
  bx(root, beam, [0.50, 1.02, 0.81], 0.05, 0.50, 0.03);
  bx(root, beam, [0.50, 1.02, 0.81], 0.50, 0.05, 0.03);
  bx(root, stone, [0, 0.06, 0.98], 0.72, 0.12, 0.42);
  cyl(root, stone, [0.48, 1.98, -0.38], 0.16, 0.19, 0.62);
  cyl(root, beam, [0.48, 2.30, -0.38], 0.23, 0.21, 0.10);
  const smoke = group(root, 'motion', [0.48, 2.46, -0.38]);
  for (let i = 0; i < 2; i++) sp(smoke, m(C.white, { sheen: 0.6 }), [(i - 0.5) * 0.14, i * 0.15, i * 0.06], [0.14 - i * 0.025, 0.12 - i * 0.02, 0.14 - i * 0.025]);
  motion(smoke, { bob: { amp: 0.11, freq: 0.5 } });
  return root;
}

// 风车：白塔 + 四片会转的叶片
function windmill() {
  const root = new THREE.Group();
  const wall = m(C.canvas), beam = m(C.wood), roof = m(C.roof), dark = m(C.tentDark), glass = m(C.glass);
  cyl(root, wall, [0, 1.05, 0], 0.46, 0.78, 2.10, null, 18);
  tor(root, m(C.stone), [0, 0.10, 0], 0.82, 0.12, [Math.PI / 2, 0, 0]);
  sp(root, roof, [0, 2.16, 0], [0.56, 0.40, 0.56]);
  cyl(root, beam, [0, 2.56, 0], 0.05, 0.05, 0.40);
  sp(root, m(C.gold), [0, 2.80, 0], [0.13, 0.13, 0.13]);
  bx(root, dark, [0, 0.44, 0.60], 0.40, 0.88, 0.10, [-0.12, 0, 0]);
  bx(root, glass, [0, 1.30, 0.55], 0.30, 0.30, 0.06);
  bx(root, glass, [-0.30, 0.92, -0.50], 0.26, 0.26, 0.06);
  const sail = group(root, 'motion', [0, 1.80, 0.72]);
  sp(sail, beam, [0, 0, 0], [0.16, 0.16, 0.14]);
  for (let i = 0; i < 4; i++) {
    const blade = group(sail, 'blade', [0, 0, 0]);
    blade.rotation.z = i * Math.PI / 2 + Math.PI / 4;
    bx(blade, beam, [0, 0.50, 0], 0.07, 1.00, 0.07);
    bx(blade, wall, [0.17, 0.54, -0.02], 0.26, 0.82, 0.04);
    bx(blade, beam, [0.30, 0.54, 0], 0.05, 0.82, 0.05);
  }
  motion(sail, { spin: 0.6 });
  return root;
}

// ------------------------------------------------------------------ registry

export const PROCEDURAL = {
  rabbit, deer, panda, turtle, penguin, owl, fox, koala,
  tent, campfire, signpost, balloon, kite, lantern,
  garden, flowerfield, sandpit, pavilion, dock, pond, cabin, windmill,
};

export function hasProcedural(id) { return Object.prototype.hasOwnProperty.call(PROCEDURAL, id); }
export function buildProcedural(id) {
  const builder = PROCEDURAL[id];
  if (!builder) throw new Error(`没有为 ${id} 定义程序化黏土模型`);
  return builder();
}
