import {createSceneScope} from './scene-scope.js?v=20261003-lifecycle-1';
// 小小建造场（工程探索的子模块）：桌面上一个微缩工地。
//
// 2026-09-30 重写（jobsite 架构）——和旧版的三点区别：
//   ① 机械是**真分段关节**的（见 engineering-yard-machines.js），液压油缸会真的伸缩短；
//   ② 工地会**随施工进度长出来**：场地平整 → 基坑开挖 → 基础浇筑 → 主体框架 →
//      围护封闭 → 机电交付。进度条可以拖动，也可以自动推进；
//   ③ 工人改用 **InstancedMesh**（七个身体部件各一批），人多也不会炸 draw call。
//
// 依然**不加载任何模型素材**，几何体全部代码现场生成。
// 由 engineering-explore.js 在第一次切到这个子模块时动态加载，加载完挂到 window.fufuYard。
import * as THREE from './vendor/three.module.js';
import {
  createExcavator, createTowerCrane, createDumpTruck, createMixer, createLoader,
} from './engineering-yard-machines.js?v=20261001-site';
import { buildSite } from './engineering-yard-site.js?v=20261001-site';
import { createYardMachine } from './engineering-yard-fleet.js?v=20261001-machinery';

const P = {                     // 配色：低饱和，和项目其它页面一个调子
  wood: 0x3a2d24, soil: 0xc0b39a, soilDark: 0x9c8f77,
  concrete: 0xcfcbbf, concreteDark: 0xada89b, steel: 0x9aa3a8,
  yellow: 0xd9a12b, yellowDark: 0xa8761b, dark: 0x3b3b3b,
  glass: 0x9fc4d8, blue: 0x4a7ba7, brick: 0xb5654a, cloth: 0xd8d2c4,
};
const DAY_PARTS = [
  { key: 'dawn', icon: '🌇', label: '黎明', sky: 0xe8d8c4, hemiSky: 0xf3ddc4, hemiGround: 0x4a4438, sun: 0xffd6a8, sunIntensity: 1.6, sunPos: [-14, 9, 6], ambient: 0.5 },
  { key: 'noon', icon: '☀️', label: '正午', sky: 0xdfeaf3, hemiSky: 0xeaf4fb, hemiGround: 0x51544a, sun: 0xfff4dd, sunIntensity: 2.6, sunPos: [-6, 20, 8], ambient: 0.72 },
  { key: 'dusk', icon: '🌆', label: '黄昏', sky: 0xe6c9ae, hemiSky: 0xf2cfae, hemiGround: 0x443a30, sun: 0xffb271, sunIntensity: 1.7, sunPos: [13, 8, -7], ambient: 0.5 },
  { key: 'night', icon: '🌙', label: '夜晚', sky: 0x2b3446, hemiSky: 0x5a6b86, hemiGround: 0x232734, sun: 0xbfd0ea, sunIntensity: 0.45, sunPos: [8, 16, 9], ambient: 0.32 },
];

// 六个施工阶段。进度 p ∈ [0,1]，各元素的出现区间都挂在这上面。
const STAGES = [
  { key: 'site', name: '场地平整', hint: '清理场地、放线测量', from: 0.00, to: 0.10, focus: [-2.6, 1.1, 0.4] },
  { key: 'dig', name: '基坑开挖', hint: '挖掘机挖土，渣土车外运', from: 0.10, to: 0.24, focus: [-2.6, 1.1, 0.4] },
  { key: 'found', name: '基础浇筑', hint: '垫层、地梁、混凝土', from: 0.24, to: 0.40, focus: [2.8, 0.9, -1.2] },
  { key: 'frame', name: '主体框架', hint: '柱子与楼板逐层往上长', from: 0.40, to: 0.70, focus: [2.8, 1.7, -1.2] },
  { key: 'envelop', name: '围护封闭', hint: '外墙板与窗', from: 0.70, to: 0.86, focus: [2.8, 1.5, -1.2] },
  { key: 'fitout', name: '机电交付', hint: '通水电、挂牌交付', from: 0.86, to: 1.00, focus: [2.8, 1.4, -1.2] },
];
function stageIndexFor(p) {
  for (let i = STAGES.length - 1; i >= 0; i -= 1) if (p >= STAGES[i].from) return i;
  return 0;
}

// 楼房参数（下面盖楼、长墙、搭脚手架都读这几个数）
const FX = 2.8, FZ = -1.2, FW = 3.4, FD = 2.4, LV = 0.86, COL_BASE = 0.36;
const COLS = [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1], [0, -1.1], [0, 1.1], [-1.6, 0], [1.6, 0]];
const colBase = (i) => COL_BASE + i * LV;

const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04, ...extra });
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
const cyl = (r1, r2, h, material, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material);

// 把几何体原点挪到底面 / 左端——**这是"长出来"动画成立的关键**：
// 原点在底面，scale.y 就是从地面往上长；原点在左端，scale.x 就是从左边伸出去。
function boxFromBase(w, h, d, material) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(0, h / 2, 0);
  return new THREE.Mesh(geometry, material);
}
function boxFromEdgeX(w, h, d, material) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(w / 2, 0, 0);
  return new THREE.Mesh(geometry, material);
}
function coneFromBase(radius, height, material) {
  const geometry = new THREE.ConeGeometry(radius, height, 14);
  geometry.translate(0, height / 2, 0);
  return new THREE.Mesh(geometry, material);
}

// 程序生成的环境光照贴图：金属和玻璃有东西可反射（零素材文件）。
// 和 engineering-viewer.js 是同一套做法。
function buildEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0.00, '#b9d4ee');
  grad.addColorStop(0.42, '#eff3ea');
  grad.addColorStop(0.52, '#c9cab7');
  grad.addColorStop(1.00, '#6b705d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = 'rgba(255,240,210,0.9)';
  ctx.beginPath();
  ctx.ellipse(36, 15, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}

// 交付时挂的招牌（canvas 画字，不引贴图文件）
function signTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c0503c';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#f7e9cd';
  ctx.font = 'bold 68px "Microsoft YaHei", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('福福工地', 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function mount(container, saved={}) {
  const scope=createSceneScope();
  container.replaceChildren();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DAY_PARTS[1].sky);
  scene.fog = new THREE.Fog(DAY_PARTS[1].sky, 28, 66);

  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  scope.own(scene,renderer);
  renderer.setPixelRatio(window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1,1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);

  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.75;

  // 光照：半球光 + 会投影的主光 + 一点环境光。切时段改的就是这几项。
  const hemi = new THREE.HemisphereLight(DAY_PARTS[1].hemiSky, DAY_PARTS[1].hemiGround, 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(DAY_PARTS[1].sun, DAY_PARTS[1].sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.025;
  sun.shadow.camera.far = 55;
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, DAY_PARTS[1].ambient);
  scene.add(ambient);
  const lampGroup = new THREE.Group();          // 夜里亮起来的小灯
  scene.add(lampGroup);

  const world = new THREE.Group();
  scene.add(world);

  const mWood = mat(P.wood);
  const mSoil = mat(P.soil);
  const mSoilDark = mat(P.soilDark);
  const mConcrete = mat(P.concrete, { roughness: 0.8 });
  const mConcreteDark = mat(P.concreteDark, { roughness: 0.84 });
  const mSteel = mat(P.steel, { roughness: 0.5, metalness: 0.4 });
  const mYellow = mat(P.yellow, { roughness: 0.6, metalness: 0.15 });
  const mYellowDark = mat(P.yellowDark, { roughness: 0.65, metalness: 0.15 });
  const mDark = mat(P.dark, { roughness: 0.85 });
  const mGlass = mat(P.glass, { transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.1 });
  const mBlue = mat(P.blue, { roughness: 0.7 });
  const mBrick = mat(P.brick);
  const mCloth = mat(P.cloth);
  const mSkin = mat(0xe8c39a);
  const mShirt = mat(0xffffff);                 // 工人的衣服靠 instanceColor 上色，所以基色留白
  const mGlow = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  const mats = {
    wood: mWood, soil: mSoil, soilDark: mSoilDark,
    concrete: mConcrete, concreteDark: mConcreteDark, steel: mSteel,
    yellow: mYellow, yellowDark: mYellowDark, dark: mDark,
    glass: mGlass, blue: mBlue, brick: mBrick, cloth: mCloth,
  };

  function place(mesh, x, y, z, castShadow = true, receiveShadow = false) {
    mesh.position.set(x, y, z);
    if (castShadow) mesh.castShadow = true;
    if (receiveShadow) mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- 进度驱动
  // 每个"会长出来的东西"登记一条 [from, to] 区间；每帧按当前进度更新。
  const progressItems = [];
  function track(object, from, to, kind = 'growY') {
    progressItems.push({ object, from, to, kind });
    object.visible = false;
    return object;
  }
  function applyProgress(p) {
    for (let i = 0; i < progressItems.length; i += 1) {
      const item = progressItems[i];
      const span = Math.max(1e-4, item.to - item.from);
      const k = THREE.MathUtils.clamp((p - item.from) / span, 0, 1);
      const object = item.object;
      if (item.kind === 'growY') {
        object.visible = k > 0.002;
        object.scale.y = Math.max(k, 0.002);
      } else if (item.kind === 'growX') {
        object.visible = k > 0.002;
        object.scale.x = Math.max(k, 0.002);
      } else {                                   // 'pop'：到了一半就出现
        object.visible = k > 0.5;
      }
    }
  }

  // ---------------------------------------------------------------- 沙盘本体
  // 地面分成四块，给基坑留下真实开口。
  for (const [x, z, w, d] of [[-4.55, 0, 1.3, 6.4], [1.95, 0, 6.5, 6.4], [-2.6, -1.9, 2.6, 2.6], [-2.6, 2.3, 2.6, 1.8]]) {
    place(box(w, 0.08, d, mSoil), x, 0.04, z, false, true);
  }

  // 基坑：低下去的一块 + 四面土坡（静态，动工前就在）
  place(box(2.6, 0.04, 2.0, mSoilDark), -2.6, -0.06, 0.4, false, true);
  for (const [dx, dz, w, d] of [[-3.95, 0.4, 0.24, 2.2], [-1.25, 0.4, 0.24, 2.2], [-2.6, -0.66, 2.9, 0.24], [-2.6, 1.46, 2.9, 0.24]]) {
    place(box(w, 0.14, d, mSoilDark), dx, 0.01, dz);
  }

  // 围墙 + 板房 + 门口小灯
  for (const [dx, dz, w, d] of [[0, -3.15, 10.4, 0.1], [0, 3.15, 10.4, 0.1], [-5.15, 0, 0.1, 6.4], [5.15, 0, 0.1, 6.4]]) {
    place(box(w, 0.26, d, mConcreteDark), dx, 0.17, dz, false);
  }
  place(box(1.5, 0.56, 0.9, mCloth), -4.4, 0.32, 2.1, true, true);
  const shedRoof = place(box(1.64, 0.08, 1.02, mBlue), -4.4, 0.64, 2.1);
  shedRoof.rotation.z = 0.05;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mGlow);
  bulb.position.set(-3.7, 0.44, 1.78);
  lampGroup.add(bulb);

  // ---------------------------------------------------------------- 会随进度长大的东西
  // 材料堆：钢管 / 砖垛（一直在场，属于"进场材料"）
  for (let i = 0; i < 5; i += 1) {
    const pipe = cyl(0.075, 0.075, 2.6, mSteel, 10);
    pipe.rotation.z = Math.PI / 2;
    place(pipe, -0.2, 0.16 + Math.floor(i / 3) * 0.16, 2.0 + (i % 3) * 0.18);
  }
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      place(box(0.42, 0.14, 0.22, mBrick), 1.1 + col * 0.46, 0.15 + row * 0.15, 2.1);
    }
  }

  // 土堆：开挖阶段一点点堆起来
  const spoilPile = coneFromBase(0.72, 0.62, mSoil);
  place(spoilPile, -4.4, 0.08, -1.9, true, true);
  track(spoilPile, 0.09, 0.26, 'growY');

  // 瓦砾堆：开挖时出现，收尾时清掉
  const rubble = new THREE.Group();
  world.add(rubble);
  for (let i = 0; i < 7; i += 1) {
    const chunk = box(0.12 + (i % 3) * 0.05, 0.09, 0.12, mConcreteDark);
    chunk.position.set(-3.9 + (i % 4) * 0.16, 0.13, 1.9 - Math.floor(i / 4) * 0.14);
    chunk.rotation.y = i * 0.7;
    chunk.castShadow = true;
    rubble.add(chunk);
  }
  track(rubble, 0.11, 0.16, 'pop');
  const clearRubble = () => { rubble.visible = rubble.visible && progress < 0.94; };

  // ── 基础：垫层 + 地梁 ──
  const pad = boxFromEdgeX(FW + 0.6, 0.16, FD + 0.6, mConcreteDark);
  pad.position.set(FX - (FW + 0.6) / 2, 0.16, FZ);
  pad.receiveShadow = true;
  world.add(pad);
  track(pad, 0.26, 0.36, 'growX');

  // ── 首层地面板 ──
  const groundSlab = boxFromEdgeX(FW, 0.12, FD, mConcrete);
  groundSlab.position.set(FX - FW / 2, 0.30, FZ);
  world.add(groundSlab);
  track(groundSlab, 0.34, 0.42, 'growX');

  // ── 三层柱 + 三层楼板（顶层就是屋面）──
  const FRAME_FROM = 0.42;
  const levelSpan = 0.052;                     // 每"上半层"占的进度
  for (let level = 0; level < 3; level += 1) {
    const colFrom = FRAME_FROM + level * levelSpan * 2;
    const step = levelSpan / COLS.length;
    COLS.forEach(([ox, oz], index) => {
      const column = boxFromBase(0.12, LV, 0.12, mSteel);
      column.position.set(FX + ox, colBase(level), FZ + oz);
      world.add(column);
      track(column, colFrom + index * step, colFrom + index * step + step * 1.8, 'growY');
    });
    const slab = boxFromEdgeX(FW, 0.12, FD, mConcrete);
    slab.position.set(FX - FW / 2, colBase(level) + LV, FZ);
    slab.receiveShadow = true;
    world.add(slab);
    track(slab, colFrom + levelSpan, colFrom + levelSpan * 1.7, 'growX');
  }

  // ── 脚手架：四角立杆 + 两道横杆 ──
  for (const [ox, oz] of [[-2.0, -1.5], [2.0, -1.5], [-2.0, 1.5], [2.0, 1.5]]) {
    const pole = boxFromBase(0.06, 2.9, 0.06, mSteel);
    pole.position.set(FX + ox, 0.08, FZ + oz);
    world.add(pole);
    track(pole, 0.44, 0.70, 'growY');
  }
  [0.9, 1.8, 2.6].forEach((height, index) => {
    for (const oz of [-1.5, 1.5]) {
      const rail = boxFromEdgeX(4.0, 0.05, 0.05, mSteel);
      rail.position.set(FX - 2.0, height, FZ + oz);
      world.add(rail);
      track(rail, 0.46 + index * 0.07, 0.52 + index * 0.07, 'growX');
    }
  });

  // ── 围护墙板：四面各三层，逐块往上贴 ──
  const ENVELOP_FROM = 0.72;
  const sides = [
    { axis: 'z', at: FZ + FD / 2, size: FW },
    { axis: 'z', at: FZ - FD / 2, size: FW },
    { axis: 'x', at: FX + FW / 2, size: FD },
    { axis: 'x', at: FX - FW / 2, size: FD },
  ];
  sides.forEach((side, sideIndex) => {
    for (let level = 0; level < 3; level += 1) {
      const height = LV - 0.08;
      const wall = side.axis === 'z'
        ? boxFromBase(side.size, height, 0.08, mCloth)
        : boxFromBase(0.08, height, side.size, mCloth);
      wall.position.set(
        side.axis === 'z' ? FX : side.at,
        colBase(level) + 0.02,
        side.axis === 'z' ? side.at : FZ,
      );
      world.add(wall);
      const from = ENVELOP_FROM + sideIndex * 0.028 + level * 0.012;
      track(wall, from, from + 0.05, 'growY');
    }
  });
  // 每层完整的窗框、窗台和分格，玻璃前移避免与墙面重叠。
  for (let level = 0; level < 3; level += 1) {
    for (let i = 0; i < 4; i += 1) {
      const windowGroup = new THREE.Group();
      windowGroup.position.set(FX - 1.2 + i * 0.8, colBase(level) + 0.43, FZ + FD / 2 + 0.065);
      world.add(windowGroup);
      const pane = box(0.52, 0.46, 0.025, mGlass);
      windowGroup.add(pane);
      for (const x of [-0.28, 0, 0.28]) {
        const mullion = box(0.025, 0.5, 0.06, mBlue);
        mullion.position.x = x; windowGroup.add(mullion);
      }
      for (const y of [-0.25, 0.25]) {
        const rail = box(0.59, 0.025, 0.06, mBlue);
        rail.position.y = y; windowGroup.add(rail);
      }
      const sill = box(0.64, 0.045, 0.15, mConcrete);
      sill.position.y = -0.28; windowGroup.add(sill);
      track(windowGroup, 0.80 + level * 0.02 + i * 0.005, 0.82 + level * 0.02 + i * 0.005, 'pop');
    }
  }
  // 室内灯：每层一盏，交付时亮
  for (let level = 0; level < 3; level += 1) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mGlow);
    light.position.set(FX, colBase(level) + LV - 0.2, FZ);
    world.add(light);
    track(light, 0.86 + level * 0.012, 0.90 + level * 0.012, 'pop');
  }
  // 招牌（坐在屋面上）+ 彩旗
  const sign = box(1.5, 0.38, 0.06, new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.75 }));
  sign.position.set(FX, colBase(2) + LV + 0.19, FZ + FD / 2 + 0.1);
  world.add(sign);
  track(sign, 0.92, 0.96, 'pop');
  const bunting = new THREE.Group();
  world.add(bunting);
  const string = cyl(0.012, 0.012, 5.0, mDark, 6);
  string.rotation.z = Math.PI / 2;
  string.position.set(-2.6, 1.5, 3.0);
  bunting.add(string);
  [0xe8b02e, 0xc0503c, 0x4a9a6a, 0x4a7ba7, 0xe86a3a, 0xd9a12b].forEach((color, index) => {
    const flag = box(0.16, 0.2, 0.02, mat(color, { roughness: 0.8 }));
    flag.position.set(-4.9 + index * 0.92, 1.39, 3.0);
    flag.castShadow = true;
    bunting.add(flag);
  });
  track(bunting, 0.96, 0.99, 'pop');

  buildSite({ world, lampGroup, track, mats, FX, FZ, LV, COL_BASE });

  // ---------------------------------------------------------------- 机械
  const machines = [];
  function mountMachine(machine, x, z, face = 0) {
    machine.group.position.set(x, 0.1, z);
    machine.group.rotation.y = face;
    world.add(machine.group);
    machines.push(machine);
    return machine;
  }
  mountMachine(createYardMachine('excavator', { scale:0.34 }), -0.8, 0.4, Math.PI);
  mountMachine(createTowerCrane(mats, { height: 5.2 }), 4.35, 1.7);
  mountMachine(createYardMachine('dump', {scale:0.27,phase:0}), -4.2, 3.65);
  mountMachine(createYardMachine('dump', {scale:0.27,phase:0.55}), -4.2, -3.65, Math.PI);
  mountMachine(createYardMachine('mixer', {scale:0.25}), -2.5, 2.0, Math.PI * 0.85);
  mountMachine(createYardMachine('loader', {scale:0.28}), -3.5, -2.0, 0.7);
  mountMachine(createYardMachine('bulldozer', {scale:0.23}), -4.4, -0.05, -0.7);
  mountMachine(createYardMachine('roller', {scale:0.24}), 0.0, 1.1, Math.PI / 2);

  // ---------------------------------------------------------------- 工人（InstancedMesh）
  // 七个身体部件各一个 InstancedMesh = 七个 draw call，人再多也只有七个。
  const workerDefs = [
    { from: [-1.9, -0.9], to: [0.8, -0.9], speed: 0.16, phase: 0.00, active: [0.00, 1.00], color: 0xe86a3a },
    { from: [0.9, 2.4], to: [-3.2, 2.4], speed: 0.13, phase: 0.35, active: [0.00, 0.90], color: 0x3a76c4 },
    { from: [2.5, 2.0], to: [2.5, -0.1], speed: 0.11, phase: 0.60, active: [0.38, 1.00], color: 0xe8b02e },
    { from: [3.7, 0.3], to: [1.2, 0.3], speed: 0.12, phase: 0.15, active: [0.42, 1.00], color: 0x4a9a6a },
    { from: [-4.5, -1.5], to: [-2.5, -1.5], speed: 0.09, phase: 0.72, active: [0.10, 0.58], color: 0xb5654a },
    { from: [0.2, -2.3], to: [3.4, -2.3], speed: 0.14, phase: 0.48, active: [0.70, 1.00], color: 0x8a6ac4 },
    { from: [-2.9, 1.4], to: [-2.9, 3.0], speed: 0.10, phase: 0.90, active: [0.86, 1.00], color: 0xd9a12b },
  ];
  const legGeometry = () => { const g = new THREE.BoxGeometry(0.07, 0.34, 0.07); g.translate(0, -0.17, 0); return g; };
  const armGeometry = () => { const g = new THREE.BoxGeometry(0.06, 0.26, 0.06); g.translate(0, -0.13, 0); return g; };
  const torsoGeometry = () => { const g = new THREE.CylinderGeometry(0.09, 0.11, 0.30, 8); g.translate(0, 0.15, 0); return g; };
  const workerParts = [
    { key: 'legL', mesh: null, geometry: legGeometry(), material: mDark, x: -0.055, y: 0.34, pivot: 'hip', side: -1, tinted: false },
    { key: 'legR', mesh: null, geometry: legGeometry(), material: mDark, x: 0.055, y: 0.34, pivot: 'hip', side: 1, tinted: false },
    { key: 'torso', mesh: null, geometry: torsoGeometry(), material: mShirt, x: 0, y: 0.34, pivot: null, side: 0, tinted: true },
    { key: 'armL', mesh: null, geometry: armGeometry(), material: mShirt, x: -0.13, y: 0.60, pivot: 'shoulder', side: -1, tinted: true },
    { key: 'armR', mesh: null, geometry: armGeometry(), material: mShirt, x: 0.13, y: 0.60, pivot: 'shoulder', side: 1, tinted: true },
    { key: 'head', mesh: null, geometry: new THREE.SphereGeometry(0.085, 10, 8), material: mSkin, x: 0, y: 0.72, pivot: null, side: 0, tinted: false },
    { key: 'helmet', mesh: null, geometry: new THREE.SphereGeometry(0.098, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), material: mYellow, x: 0, y: 0.72, pivot: null, side: 0, tinted: false },
  ];
  const workerCount = workerDefs.length;
  const workerColor = new THREE.Color();
  workerParts.forEach((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, workerCount);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 实例散布得比较开，按单个几何算的包围球会误剔除，直接关掉视锥剔除
    mesh.frustumCulled = false;
    world.add(mesh);
    part.mesh = mesh;
    if (part.tinted) {
      workerDefs.forEach((worker, index) => {
        workerColor.setHex(worker.color);
        mesh.setColorAt(index, workerColor);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });
  const workerMatrix = new THREE.Matrix4();
  const partMatrix = new THREE.Matrix4();
  const partResult = new THREE.Matrix4();
  const emptyScale = new THREE.Vector3(0.0001, 0.0001, 0.0001);
  const unitScale = new THREE.Vector3(1, 1, 1);
  function updateWorkers(t, currentProgress) {
    for (let i = 0; i < workerCount; i += 1) {
      const worker = workerDefs[i];
      const active = currentProgress >= worker.active[0] && currentProgress <= worker.active[1];
      const cycle = (t * worker.speed + worker.phase) % 1;
      const going = cycle < 0.5;
      const k = going ? cycle / 0.5 : 1 - (cycle - 0.5) / 0.5;
      const x = worker.from[0] + (worker.to[0] - worker.from[0]) * k;
      const z = worker.from[1] + (worker.to[1] - worker.from[1]) * k;
      const heading = Math.atan2(worker.to[0] - worker.from[0], worker.to[1] - worker.from[1]) + (going ? 0 : Math.PI);
      const stride = Math.sin(t * 5.2 + i * 1.7);
      const bob = Math.abs(stride) * 0.012;
      workerMatrix.makeRotationY(heading);
      workerMatrix.setPosition(x, 0.08 + bob, z);
      workerMatrix.scale(active ? unitScale : emptyScale);
      for (let p = 0; p < workerParts.length; p += 1) {
        const part = workerParts[p];
        const angle = part.pivot === 'hip'
          ? stride * 0.5 * part.side
          : part.pivot === 'shoulder' ? -stride * 0.42 * part.side : 0;
        partMatrix.makeRotationX(angle);
        partMatrix.setPosition(part.x, part.y, 0);
        partResult.multiplyMatrices(workerMatrix, partMatrix);
        part.mesh.setMatrixAt(i, partResult);
      }
    }
    for (let p = 0; p < workerParts.length; p += 1) {
      workerParts[p].mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- 进度状态
  let progress = 0.62;                 // 从"场地平整"末尾起步，一进来就有点东西看
  let autoPlay = false;
  const PROGRESS_RATE = 0.012;         // 每秒推进的进度（约 28 秒走完）

  // ---------------------------------------------------------------- 控制条
  let paused = false;
  let speed = 1;
  let autoOrbit = false;
  let viewMode = 'free';               // free / follow / top
  let azimuth = -0.65;
  let elevation = 0.62;
  let distance = 18;
  let idles = 0;

  const bar = document.createElement('div');
  bar.className = 'yard-controls';
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
  function mkButton(label, onClick, pressed) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'padding:5px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.24);background:#eef3e9;color:#36594d;font:12px/1.3 system-ui,sans-serif;cursor:pointer';
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    scope.listen(button, 'click', onClick);
    bar.append(button);
    return button;
  }

  const playButton = mkButton('⏸ 暂停', () => {
    paused = !paused;
    playButton.textContent = paused ? '▶ 继续' : '⏸ 暂停';
    playButton.setAttribute('aria-pressed', String(paused));
  }, false);

  const speedButtons = [];
  [0.5, 1, 2].forEach((value) => {
    const button = mkButton(`${value}×`, () => {
      speed = value;
      speedButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    }, value === 1);
    speedButtons.push(button);
  });

  const dayButtons = [];
  function setDay(index) {
    dayButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    const part = DAY_PARTS[index];
    scene.background = new THREE.Color(part.sky);
    scene.fog.color = new THREE.Color(part.sky);
    hemi.color = new THREE.Color(part.hemiSky);
    hemi.groundColor = new THREE.Color(part.hemiGround);
    sun.color = new THREE.Color(part.sun);
    sun.intensity = part.sunIntensity;
    sun.position.set(part.sunPos[0], part.sunPos[1], part.sunPos[2]);
    ambient.intensity = part.ambient;
    hemi.intensity = part.key === 'night' ? 0.45 : 1.5;
    scene.environmentIntensity = part.key === 'night' ? 0.12 : 0.6;
    lampGroup.visible = part.key === 'night';
  }
  DAY_PARTS.forEach((part, index) => {
    dayButtons.push(mkButton(`${part.icon} ${part.label}`, () => setDay(index), index === 1));
  });

  const viewButtons = [];
  function setView(mode) {
    viewMode = mode;
    viewButtons.forEach((item) => item.setAttribute('aria-pressed', String(item.mode === mode)));
  }
  [['free', '🧭 自由环绕'], ['follow', '👀 跟随作业面'], ['top', '🗺️ 俯瞰全场']].forEach(([mode, label]) => {
    const button = mkButton(label, () => setView(mode), mode === 'free');
    button.mode = mode;
    viewButtons.push(button);
  });
  mkButton('🎯 重置视角', () => {
    azimuth = -0.65;
    elevation = 0.62;
    distance = 18;
    idles = 0;
    setView('free');
  });

  // 进度条：可以直接拖，也可以让它自己跑
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = String(Math.round(progress * 1000));
  slider.setAttribute('aria-label', '施工进度');
  slider.style.cssText = 'width:150px;accent-color:#d9a12b;cursor:pointer';
  scope.listen(slider, 'input', () => {
    progress = Number(slider.value) / 1000;
    autoPlay = false;
    syncAutoButton();
  });
  bar.append(slider);
  const stageLabel = document.createElement('span');
  stageLabel.style.cssText = 'color:#36594d;font:12px/1.4 system-ui,sans-serif';
  bar.append(stageLabel);

  const autoButton = mkButton('⏩ 自动推进', () => {
    autoPlay = !autoPlay;
    if (autoPlay && progress >= 1) progress = 0;
    syncAutoButton();
  }, false);
  syncAutoButton();
  function syncAutoButton() {
    autoButton.setAttribute('aria-pressed', String(autoPlay));
    autoButton.textContent = autoPlay ? '⏩ 自动推进' : '⏸ 手动查看';
  }

  const stagesRow = document.createElement('div');
  stagesRow.className = 'yard-stages';
  stagesRow.setAttribute('role', 'group');
  stagesRow.setAttribute('aria-label', '选择施工阶段');
  const stageButtons = STAGES.map((stage, index) => {
    const button = mkButton(`${index + 1} ${stage.name}`, () => {
      progress = (stage.from + stage.to) / 2;
      slider.value = String(Math.round(progress * 1000));
      autoPlay = false;
      syncAutoButton();
    }, index === stageIndexFor(progress));
    stagesRow.append(button);
    return button;
  });
  bar.prepend(stagesRow);

  container.style.position = 'relative';
  container.append(bar);
  setDay(1);
  setView('free');

  // ---------------------------------------------------------------- 相机与循环
  const target = new THREE.Vector3(0, 1.1, 0);
  const overviewTarget = new THREE.Vector3(0, 1.0, 0);
  const targetGoal = new THREE.Vector3(0.9, 0.9, 0.2);
  let drag = null;
  renderer.domElement.style.touchAction = 'none';
  scope.listen(renderer.domElement, 'pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    idles = 0;
  });
  scope.listen(renderer.domElement, 'pointermove', (event) => {
    if (!drag) return;
    azimuth -= (event.clientX - drag.x) * 0.006;
    elevation = THREE.MathUtils.clamp(elevation + (event.clientY - drag.y) * 0.004, 0.08, 1.25);
    drag.x = event.clientX;
    drag.y = event.clientY;
    idles = 0;
    // 一拖就交还镜头控制权（和 jobsite 一样：拖动即解除自动跟随）
    if (viewMode !== 'free') setView('free');
  });
  ['pointerup', 'pointercancel'].forEach((type) => scope.listen(renderer.domElement, type, () => { drag = null; }));
  scope.listen(renderer.domElement, 'wheel', (event) => {
    event.preventDefault();
    distance = THREE.MathUtils.clamp(distance * (event.deltaY > 0 ? 1.08 : 0.92), 7, 40);
    idles = 0;
  }, { passive: false });

  function resize() {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }
  const resizeObserver = new scope.ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let running = true;
  let elapsed = 0;
  let last = performance.now();
  let frameHandle = 0;
  let lastStageIndex = -1;
  let lastLabel = '';

  // 阶段标签与跟随目标：进度一变就刷新
  function refreshStage() {
    const index = stageIndexFor(progress);
    if (index !== lastStageIndex) {
      lastStageIndex = index;
      const stage = STAGES[index];
      targetGoal.set(stage.focus[0], stage.focus[1], stage.focus[2]);
      stageButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    }
    const label = `${lastStageIndex + 1}/6 ${STAGES[lastStageIndex].name} · 已完工 ${Math.round(progress * 100)}%`;
    if (label !== lastLabel) {
      lastLabel = label;
      stageLabel.textContent = label;
    }
  }

  progress=saved.progress??progress;azimuth=saved.azimuth??azimuth;elevation=saved.elevation??elevation;distance=saved.distance??distance;
  slider.value = String(Math.round(progress * 1000));
  applyProgress(progress);
  updateWorkers(0, progress);
  refreshStage();

  function frame(now) {
    frameHandle = scope.frame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!container.clientWidth) return;

    if (running && !paused) {
      elapsed += dt * speed;
      if (autoPlay) {
        progress = Math.min(1, progress + dt * speed * PROGRESS_RATE);
        if (progress >= 1) {
          autoPlay = false;
          syncAutoButton();
        }
        slider.value = String(Math.round(progress * 1000));
      }
      const stageIndex = stageIndexFor(progress);
      const ctx = { stageIndex, progress };
      machines.forEach((machine) => machine.update(elapsed, dt, ctx));
    }

    // 进度相关的渲染每帧都做——这样**暂停时也能拖进度条**看工地变化
    applyProgress(progress);
    clearRubble();
    updateWorkers(elapsed, progress);
    refreshStage();

    // 视角模式
    if (viewMode === 'follow') {
      target.lerp(targetGoal, Math.min(1, dt * 2.2));
      distance += (13 - distance) * Math.min(1, dt * 1.2);
    } else if (viewMode === 'top') {
      elevation += (1.18 - elevation) * Math.min(1, dt * 1.6);
      azimuth += (0.62 - azimuth) * Math.min(1, dt * 1.6);
      distance += (19 - distance) * Math.min(1, dt * 1.2);
      target.lerp(overviewTarget, Math.min(1, dt * 2.2));
    } else {
      target.lerp(overviewTarget, Math.min(1, dt * 0.8));
      if (autoOrbit && !drag) {
        idles += dt;
        if (idles > 6) azimuth += dt * 0.12;
      }
    }

    const fittedDistance = distance * Math.max(1, 1.35 / camera.aspect);
    const horizontal = Math.cos(elevation) * fittedDistance;
    camera.position.set(
      target.x + Math.sin(azimuth) * horizontal,
      target.y + Math.sin(elevation) * fittedDistance,
      target.z + Math.cos(azimuth) * horizontal,
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  }
  frameHandle = scope.frame(frame);

  return {
    pause() { running = false;scope.pause(); },
    resume() { running = true; last = performance.now();scope.resume(); },
    snapshot:()=>({progress,azimuth,elevation,distance}),
    dispose() {scope.dispose();container.replaceChildren();}
  };
}

window.fufuYard = { mount };
