// 微缩工地的地貌、道路、设施与施工细节，全部使用本地几何和画布纹理。
import * as THREE from './vendor/three.module.js';

export function buildSite({ world, lampGroup, track, mats, FX, FZ, LV, COL_BASE }) {
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = groundCanvas.height = 256;
  const groundContext = groundCanvas.getContext('2d');
  groundContext.fillStyle = '#d7c9ad'; groundContext.fillRect(0, 0, 256, 256);
  let seed = 17;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2400; i++) {
    groundContext.fillStyle = i % 2 ? '#b9a78c' : '#e9ddc5';
    groundContext.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
  }
  const groundTexture = new THREE.CanvasTexture(groundCanvas);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(4, 4);
  mats.soil.map = groundTexture; mats.soil.color.setHex(0xffffff); mats.soil.needsUpdate = true;
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...extra });
  const green = material(0x729681), white = material(0xf4eddb), orange = material(0xe97539);
  const road = material(0x697775), timber = material(0xb68b5d), soil = material(0x92745a);
  function mesh(geometry, mat, x, y, z, parent = world) {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  const box = (w, h, d, mat, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  function beam(a, b, radius = 0.025, mat = mats.steel, parent = world) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const item = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), mat, 0, 0, 0, parent);
    item.position.copy(start).add(end).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return item;
  }
  function label(text, x, y, z, width = 1.2, color = '#28554e', parent = world) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#e9d6a3'; ctx.lineWidth = 8; ctx.strokeRect(12, 12, 488, 136);
    ctx.fillStyle = '#fff4d8'; ctx.font = 'bold 52px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 82);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return box(width, width * 160 / 512, 0.035, material(0xffffff, { map: texture }), x, y, z, parent);
  }
  // 厚实的展示底座与分层土壤剖面。
  box(12.8, 0.18, 9.8, green, 0, -0.58, 0);
  box(12.5, 0.42, 9.5, soil, 0, -0.30, 0);
  box(12.6, 0.045, 9.6, timber, 0, -0.10, 0);
  box(200, 0.1, 200, material(0xdce6de), 0, -0.74, 0);
  label('福福 · 微型建造场', 0, -0.29, 4.77, 2.6);
  // 环形运输道路：车辆和行人各有自己的空间。
  for (const z of [-3.65, 3.65]) {
    box(12.3, 0.04, 1.25, road, 0, 0.08, z);
    for (let x = -5.6; x < 6; x += 0.85) box(0.42, 0.007, 0.035, white, x, 0.105, z);
    box(12.3, 0.05, 0.12, white, 0, 0.13, z + Math.sign(z) * 0.66);
  }
  for (const x of [-5.65, 5.65]) box(1.0, 0.04, 6.1, road, x, 0.08, 0);
  // 蓝绿色波纹围挡，前侧留出入口和观察口。
  for (const z of [-3.02, 3.02]) {
    for (let x = -5; x <= 5; x += 0.5) {
      if (z > 0 && (x < -2 || x > 0.8)) continue;
      box(0.48, 0.58, 0.05, green, x, 0.38, z);
      for (let j = 0; j < 4; j++) box(0.018, 0.54, 0.065, green, x - 0.18 + j * 0.12, 0.38, z);
      box(0.04, 0.68, 0.06, white, x - 0.25, 0.4, z);
    }
  }
  for (const x of [-5.1, 5.1]) {
    box(0.06, 0.6, 5.9, green, x, 0.39, 0);
    for (let z = -2.9; z < 3; z += 0.5) box(0.09, 0.69, 0.045, white, x, 0.41, z);
  }
  // 门架、减速带、斑马线、锥桶。
  for (const x of [-4.9, -2.5]) box(0.12, 1.25, 0.12, green, x, 0.68, 3.02);
  label('小小建造场', -3.7, 1.28, 3.02, 2.55);
  for (let i = 0; i < 9; i++) box(0.14, 0.03, 0.24, i % 2 ? mats.dark : mats.yellow, -4.35 + i * 0.16, 0.12, 3.16);
  for (let i = 0; i < 6; i++) box(0.12, 0.008, 0.9, white, -2.0 + i * 0.21, 0.108, 3.66);
  for (const [x, z] of [[-1.1, 1.75], [-3.8, 1.75], [-1.1, -1], [-3.8, -1], [0.8, 3.15], [4.8, 3.15]]) {
    box(0.19, 0.035, 0.19, mats.dark, x, 0.12, z);
    mesh(new THREE.ConeGeometry(0.075, 0.26, 12), orange, x, 0.26, z);
    mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.045, 12), white, x, 0.25, z);
  }
  // 基坑支护、边缘警戒栏与土层纹理。
  for (let i = 0; i < 11; i++) {
    box(0.055, 0.28, 0.06, timber, -3.8 + i * 0.24, 0.18, -0.66);
    box(0.055, 0.28, 0.06, timber, -3.8 + i * 0.24, 0.18, 1.46);
  }
  for (const z of [-0.8, 1.6]) {
    beam([-3.95, 0.52, z], [-1.25, 0.52, z], 0.028, orange);
    for (const x of [-3.95, -2.6, -1.25]) beam([x, 0.08, z], [x, 0.55, z], 0.022, white);
  }
  // 预制构件、木托盘、钢筋网及整齐堆放的砖。
  for (let k = 0; k < 3; k++) {
    box(0.85, 0.07, 0.65, timber, 0.0 + k * 1.1, 0.14, 2.15);
    for (let j = 0; j < 4; j++) box(0.18, 0.07, 0.66, timber, -0.32 + k * 1.1 + j * 0.21, 0.21, 2.15);
  }
  for (let i = 0; i < 5; i++) box(1.35, 0.09, 0.32, mats.concrete, -3.9, 0.16 + i * 0.1, -2.18);
  for (let i = 0; i < 8; i++) {
    beam([0.5 + i * 0.25, 0.13, -2.7], [0.5 + i * 0.25, 0.13, -2.05], 0.012);
    beam([0.5, 0.13, -2.7 + i * 0.09], [2.25, 0.13, -2.7 + i * 0.09], 0.012);
  }
  label('材料堆场', 1.1, 0.58, 2.55, 1.1);
  // 办公板房的门窗、空调和屋顶接缝。
  box(0.27, 0.42, 0.025, green, -4.72, 0.31, 2.57);
  for (const x of [-4.24, -3.96]) box(0.21, 0.2, 0.03, mats.glass, x, 0.4, 2.57);
  for (let i = 0; i < 9; i++) box(0.028, 0.03, 1.02, white, -5.12 + i * 0.18, 0.69, 2.1);
  box(0.25, 0.17, 0.15, white, -5.15, 0.38, 2.0);
  label('工地办公室', -4.4, 0.82, 2.57, 1.2);
  // 楼体横梁、楼梯、脚手架工作平台和交叉支撑。
  for (let level = 0; level < 3; level++) {
    const y = COL_BASE + level * LV;
    for (const z of [-1.1, 1.1]) track(box(3.45, 0.13, 0.14, mats.concrete, FX, y + LV - 0.1, FZ + z), 0.46 + level * 0.1, 0.51 + level * 0.1, 'pop');
    for (let s = 0; s < 9; s++) track(box(0.55, 0.09, 0.16, mats.concrete, FX + 0.9, y + s * LV / 9, FZ - 0.68 + s * 0.16), 0.47 + level * 0.1, 0.52 + level * 0.1, 'pop');
    for (const z of [-1.48, 1.48]) {
      const scaffold = new THREE.Group(); world.add(scaffold);
      box(4, 0.045, 0.27, timber, FX, y + 0.52, FZ + z, scaffold);
      for (let i = 0; i < 4; i++) {
        const x = FX - 2 + i;
        beam([x, y, FZ + z], [x + 1, y + LV, FZ + z], 0.018, mats.steel, scaffold);
        beam([x + 1, y, FZ + z], [x, y + LV, FZ + z], 0.018, mats.steel, scaffold);
      }
      track(scaffold, 0.44 + level * 0.1, 0.49 + level * 0.1, 'pop');
    }
  }
  // 路灯是真正的光源，夜景照亮运输路和入口。
  for (const [x, z] of [[-5, -2.8], [5, -2.8], [-2.1, 2.85], [4.9, 2.8]]) {
    beam([x, 0.08, z], [x, 1.7, z], 0.035);
    box(0.23, 0.07, 0.14, mats.dark, x, 1.7, z);
    box(0.19, 0.025, 0.11, new THREE.MeshBasicMaterial({ color: 0xffe2a6 }), x, 1.65, z, lampGroup);
    const light = new THREE.PointLight(0xffd397, 3.2, 4, 2); light.position.set(x, 1.6, z); lampGroup.add(light);
  }
  // 场外绿植强调沙盘尺度。
  for (const [x, z] of [[-5.7, -4.4], [-4.5, -4.4], [4.5, 4.4], [5.6, 4.4]]) {
    box(0.55, 0.15, 0.5, white, x, 0.12, z);
    beam([x, 0.18, z], [x, 0.8, z], 0.06, timber);
    mesh(new THREE.IcosahedronGeometry(0.4, 1), green, x, 0.92, z);
  }
}
