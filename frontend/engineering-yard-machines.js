// 小小建造场 · 机械模块（jobsite 架构，2026-09-30 重写）
//
// 和旧版的区别：机械不再是"整体转一下"的积木，而是**真正的分段关节**——
// 挖掘机的回转 / 动臂 / 斗杆 / 铲斗是四个独立铰点，动作由一张**关键帧表**驱动；
// 而且**每根液压油缸都按两端锚点的实时位置伸缩短**——这才是"像真机械"的关键。
//
// 每个工厂函数返回 { group, update(t, dt, ctx) }：
//   t   累计时间（秒，已含倍速）
//   dt  帧间隔（秒）
//   ctx { stageIndex, progress } 当前施工阶段 —— 机械按阶段换活儿
//
// 本模块**不加载任何模型文件**，几何体全部代码现场生成。
// 配色不硬编码，统一从外面传进来的 mats 里取（和建造场其他地方共用一套材质）。
import * as THREE from './vendor/three.module.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();

const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
const cyl = (r1, r2, h, material, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material);

// 统一的挂载入口：开投影 → 加进父节点 → 返回这个网格（方便接着设 position）。
// 不用 `parent.add(mesh)` 的返回值——它返回的是 parent，踩过一次。
function add(parent, mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// 关键帧采样：t 在 0..1 之间循环，做线性插值。
// 比一堆 if/else 好读，也方便单独调某一段动作。
export function sampleCycle(keys, t) {
  const n = keys.length;
  const x = ((t % 1) + 1) % 1;
  for (let i = 0; i < n - 1; i += 1) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (x >= k0.t && x <= k1.t) {
      const span = Math.max(1e-6, k1.t - k0.t);
      const f = (x - k0.t) / span;
      const out = {};
      for (const key of Object.keys(k0)) {
        if (key === 't') continue;
        out[key] = k0[key] + (k1[key] - k0[key]) * f;
      }
      return out;
    }
  }
  const last = keys[n - 1];
  const out = {};
  for (const key of Object.keys(last)) if (key !== 't') out[key] = last[key];
  return out;
}

// 液压油缸：两端各挂一个空锚点，每帧把"世界坐标"换算回父节点本地坐标后重新摆放圆柱。
// 这是让油缸真的会伸缩短的标准做法，比手算角度可靠得多。
function makeStrut({ radius, material, parent, from, to }) {
  const mesh = add(parent, new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.18, 1, 8), material));
  const anchorA = new THREE.Object3D();
  anchorA.position.copy(from.position);
  from.parent.add(anchorA);
  const anchorB = new THREE.Object3D();
  anchorB.position.copy(to.position);
  to.parent.add(anchorB);
  return { mesh, anchorA, anchorB };
}

function updateStrut(entry, parent) {
  entry.anchorA.getWorldPosition(_a);
  entry.anchorB.getWorldPosition(_b);
  parent.worldToLocal(_a);
  parent.worldToLocal(_b);
  _mid.addVectors(_a, _b).multiplyScalar(0.5);
  _dir.subVectors(_b, _a);
  const length = _dir.length();
  if (length < 1e-4) return;
  entry.mesh.position.copy(_mid);
  entry.mesh.quaternion.setFromUnitVectors(UP, _dir.normalize());
  entry.mesh.scale.set(1, length, 1);
}

// ------------------------------------------------------------------ 履带挖掘机
// 关节层级：履带 → 上车(回转) → 动臂 → 斗杆 → 铲斗
// 角度是凭手感配的，想改动作只动这张表。
const DIG_CYCLE = [
  { t: 0.00, slew: 0.00, boom: 0.30, stick: -0.30, bucket: 0.10 },
  { t: 0.16, slew: 0.00, boom: 0.02, stick: 0.32, bucket: -0.48 },
  { t: 0.30, slew: 0.00, boom: -0.16, stick: 0.62, bucket: -0.88 },
  { t: 0.42, slew: 0.00, boom: 0.34, stick: -0.20, bucket: -0.96 },
  { t: 0.58, slew: 1.90, boom: 0.36, stick: -0.15, bucket: -0.90 },
  { t: 0.70, slew: 1.90, boom: 0.30, stick: -0.25, bucket: 0.46 },
  { t: 0.84, slew: 1.10, boom: 0.32, stick: -0.30, bucket: 0.20 },
  { t: 1.00, slew: 0.00, boom: 0.30, stick: -0.30, bucket: 0.10 },
];

export function createExcavator(mats, options = {}) {
  const group = new THREE.Group();
  const scale = options.scale || 1;

  // 履带 + 驱动轮
  for (const side of [-1, 1]) {
    const track = add(group, box(1.06, 0.24, 0.3, mats.dark));
    track.position.set(0, 0.12, side * 0.3);
    for (const cx of [-0.34, 0, 0.34]) {
      const wheel = add(group, cyl(0.1, 0.1, 0.32, mats.steel, 12));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(cx, 0.12, side * 0.3);
    }
  }
  const deck = add(group, box(1.0, 0.1, 0.62, mats.steel));
  deck.position.y = 0.28;

  // 上车：整体绕 y 回转
  const turret = new THREE.Group();
  turret.position.y = 0.33;
  group.add(turret);

  const body = add(turret, box(0.84, 0.34, 0.6, mats.yellow));
  body.position.set(-0.08, 0.17, 0);
  const counter = add(turret, box(0.3, 0.32, 0.62, mats.yellowDark));
  counter.position.set(-0.62, 0.18, 0);
  const cab = add(turret, box(0.34, 0.42, 0.36, mats.glass));
  cab.position.set(0.16, 0.53, 0.19);
  const cabRoof = add(turret, box(0.36, 0.04, 0.38, mats.yellowDark));
  cabRoof.position.set(0.16, 0.75, 0.19);
  const exhaust = add(turret, cyl(0.028, 0.034, 0.12, mats.dark, 8));
  exhaust.position.set(-0.34, 0.4, -0.14);

  // 动臂（原点在铰点，沿 +x 伸出去）
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.26, 0.2, 0);
  turret.add(boomPivot);
  const boom = add(boomPivot, box(0.98, 0.16, 0.15, mats.yellow));
  boom.position.x = 0.49;

  // 斗杆
  const stickPivot = new THREE.Group();
  stickPivot.position.x = 0.98;
  boomPivot.add(stickPivot);
  const stick = add(stickPivot, box(0.64, 0.12, 0.12, mats.yellowDark));
  stick.position.x = 0.32;

  // 铲斗：后壁 + 斗底 + 三颗齿
  const bucketPivot = new THREE.Group();
  bucketPivot.position.x = 0.64;
  stickPivot.add(bucketPivot);
  const bucketBack = add(bucketPivot, box(0.14, 0.3, 0.36, mats.steel));
  bucketBack.position.set(0.07, -0.15, 0);
  const bucketFloor = add(bucketPivot, box(0.28, 0.08, 0.36, mats.steel));
  bucketFloor.position.set(0.2, -0.28, 0);
  for (const z of [-0.12, 0, 0.12]) {
    const tooth = add(bucketPivot, box(0.1, 0.06, 0.06, mats.yellowDark));
    tooth.position.set(0.36, -0.28, z);
  }

  // 两根液压油缸：抬动臂（车身上沿 → 动臂中段）、推斗杆（动臂上沿 → 斗杆根部）
  const boomStruts = [-1, 1].map((side) => makeStrut({
    radius: 0.022,
    material: mats.steel,
    parent: turret,
    from: { parent: turret, position: new THREE.Vector3(0.02, 0.1, side * 0.13) },
    to: { parent: boom, position: new THREE.Vector3(0.14, 0.08, side * 0.13) },
  }));
  const stickStrut = makeStrut({
    radius: 0.018,
    material: mats.steel,
    parent: boomPivot,
    from: { parent: boom, position: new THREE.Vector3(0.02, 0.09, 0) },
    to: { parent: stick, position: new THREE.Vector3(0.06, 0.06, 0) },
  });

  group.scale.setScalar(scale);

  const idle = { slew: 0, boom: 0.3, stick: -0.3, bucket: 0.1 };
  let working = 1;

  return {
    group,
    update(t, dt, ctx) {
      // 阶段 0～1（场地平整、基坑开挖）才真干活，之后慢慢歇着
      const wantWorking = ctx.stageIndex <= 1 ? 1 : 0;
      working += (wantWorking - working) * Math.min(1, dt * 1.5);
      const pose = sampleCycle(DIG_CYCLE, t * 0.085);
      const mix = (a, b) => a * working + b * (1 - working);
      turret.rotation.y = mix(pose.slew, idle.slew);
      boomPivot.rotation.z = mix(pose.boom, idle.boom) + Math.sin(t * 0.6) * 0.03 * (1 - working);
      stickPivot.rotation.z = -mix(pose.stick, idle.stick);
      bucketPivot.rotation.z = mix(pose.bucket, idle.bucket);
      // 先更新一遍世界矩阵，油缸锚点的世界坐标才是这一帧的
      group.updateMatrixWorld(true);
      boomStruts.forEach((entry) => updateStrut(entry, turret));
      updateStrut(stickStrut, boomPivot);
    },
  };
}

// ------------------------------------------------------------------ 塔吊
export function createTowerCrane(mats, options = {}) {
  const group = new THREE.Group();
  const height = options.height || 6.4;
  function brace(parent, a, b) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const member = add(parent, cyl(0.016, 0.016, direction.length(), mats.yellowDark, 6));
    member.position.copy(start).add(end).multiplyScalar(0.5);
    member.quaternion.setFromUnitVectors(UP, direction.normalize());
  }
  for (let y = 0; y < height - 0.5; y += 0.55) {
    for (const side of [-0.11, 0.11]) {
      brace(group, [-0.11, y, side], [0.11, y + 0.55, side]);
      brace(group, [side, y, -0.11], [side, y + 0.55, 0.11]);
    }
  }

  // 桁架塔身：四根角柱 + 交替横撑（比旧版一根方柱像样得多）
  for (const [ox, oz] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) {
    const post = add(group, box(0.05, height, 0.05, mats.yellow));
    post.position.set(ox, height / 2, oz);
  }
  for (let i = 0.55; i < height; i += 0.55) {
    const rung = add(group, box(0.26, 0.035, 0.035, mats.yellowDark));
    rung.position.y = i;
    rung.rotation.y = (Math.round(i / 0.55) % 2) ? 0 : Math.PI / 2;
  }

  const jib = new THREE.Group();
  jib.position.y = height;
  group.add(jib);
  for (let x = -0.5; x < 3.5; x += 0.4) {
    brace(jib, [x, 0.04, -0.11], [x + 0.4, 0.36, -0.11]);
    brace(jib, [x, 0.36, 0.11], [x + 0.4, 0.04, 0.11]);
  }
  brace(jib, [-0.5, 0.36, -0.11], [3.5, 0.36, -0.11]);
  brace(jib, [-0.5, 0.36, 0.11], [3.5, 0.36, 0.11]);
  const arm = add(jib, box(4.0, 0.14, 0.16, mats.yellow));
  arm.position.x = 1.5;
  const armTip = add(jib, box(0.5, 0.06, 0.12, mats.yellowDark));
  armTip.position.set(3.7, -0.06, 0);
  const counterJib = add(jib, box(1.3, 0.12, 0.14, mats.yellowDark));
  counterJib.position.x = -0.95;
  const weight = add(jib, box(0.42, 0.4, 0.38, mats.concreteDark));
  weight.position.set(-1.45, -0.26, 0);

  const trolley = add(jib, box(0.26, 0.1, 0.26, mats.steel));
  const rope = add(jib, new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 1, 5),
    new THREE.MeshBasicMaterial({ color: 0x4a4a4a }),
  ));
  const hook = add(jib, box(0.16, 0.12, 0.16, mats.steel));
  const loadGroup = new THREE.Group();
  jib.add(loadGroup);
  const pallet = add(loadGroup, box(0.56, 0.06, 0.42, mats.wood || mats.yellowDark));
  pallet.position.y = -0.03;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const brick = add(loadGroup, box(0.15, 0.09, 0.15, mats.brick));
      brick.position.set(-0.2 + col * 0.2, 0.06 + row * 0.09, 0);
    }
  }

  return {
    group,
    update(t, dt, ctx) {
      // 主体结构阶段（3 及以后）吊装最忙；其他阶段慢速待机
      const busy = ctx.stageIndex >= 3 ? 1 : 0.28;
      const swing = sampleCycle([
        { t: 0.00, yaw: 0, travel: 0.8, drop: 2.6 },
        { t: 0.22, yaw: 0, travel: 2.9, drop: 2.6 },
        { t: 0.34, yaw: 0, travel: 2.9, drop: 0.9 },
        { t: 0.50, yaw: 1.2, travel: 2.9, drop: 0.9 },
        { t: 0.62, yaw: 1.2, travel: 2.9, drop: 2.6 },
        { t: 0.74, yaw: 1.2, travel: 0.8, drop: 2.6 },
        { t: 1.00, yaw: 0, travel: 0.8, drop: 2.6 },
      ], (t * 0.055 * busy) % 1);
      jib.rotation.y = swing.yaw;
      trolley.position.set(swing.travel, -0.08, 0);
      rope.position.set(swing.travel, -0.08 - swing.drop / 2, 0);
      rope.scale.set(1, swing.drop, 1);
      hook.position.set(swing.travel, -0.08 - swing.drop, 0);
      loadGroup.position.set(swing.travel, -0.2 - swing.drop, 0);
    },
  };
}

// ------------------------------------------------------------------ 渣土车
export function createDumpTruck(mats, options = {}) {
  const group = new THREE.Group();
  const chassis = add(group, box(1.55, 0.12, 0.36, mats.dark));
  chassis.position.y = 0.26;
  const cabin = add(group, box(0.44, 0.4, 0.4, mats.blue));
  cabin.position.set(0.6, 0.48, 0);
  const cabinRoof = add(group, box(0.46, 0.05, 0.42, mats.steel));
  cabinRoof.position.set(0.6, 0.7, 0);

  // 车斗：铰点在车尾（组原点），正角度 = 前部抬起卸料
  const bed = new THREE.Group();
  bed.position.set(-0.72, 0.42, 0);
  group.add(bed);
  const shell = add(bed, box(1.05, 0.06, 0.46, mats.steel));
  shell.position.x = 0.52;
  for (const side of [-1, 1]) {
    const wall = add(bed, box(1.05, 0.32, 0.045, mats.steel));
    wall.position.set(0.52, 0.14, side * 0.23);
  }
  const bedBack = add(bed, box(0.06, 0.5, 0.46, mats.steel));
  bedBack.position.set(0.02, 0.09, 0);
  const spoil = add(bed, box(0.9, 0.16, 0.4, mats.soilDark));
  spoil.position.set(0.52, 0.12, 0);

  for (const [wx, wz] of [[0.52, -0.24], [0.52, 0.24], [-0.52, -0.24], [-0.52, 0.24], [-0.78, -0.24], [-0.78, 0.24]]) {
    const wheel = add(group, cyl(0.14, 0.14, 0.11, mats.dark, 12));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.14, wz);
  }

  const start = options.start ?? -4.2;
  const end = options.end ?? 4.0;
  const speed = options.speed ?? 0.09;
  const phase = options.phase ?? 0;
  const dir = options.dir ?? 0;

  return {
    group,
    update(t, dt, ctx) {
      const moving = ctx.stageIndex <= 2 ? 1 : 0.35;
      const cycle = (t * speed * moving + phase) % 1;
      const going = cycle < 0.42;
      const travel = going ? cycle / 0.42 : 1 - (cycle - 0.42) / 0.58;
      group.position.x = start + (end - start) * THREE.MathUtils.clamp(travel, 0, 1);
      group.rotation.y = going ? dir : dir + Math.PI;
      // 到卸料点、或回到起点时翻斗
      const tipping = (cycle > 0.42 && cycle < 0.52) || cycle > 0.94;
      bed.rotation.z += ((tipping ? 0.62 : 0) - bed.rotation.z) * Math.min(1, dt * 8);
      spoil.visible = !tipping;
    },
  };
}

// ------------------------------------------------------------------ 混凝土搅拌车
export function createMixer(mats) {
  const group = new THREE.Group();
  const chassis = add(group, box(1.55, 0.12, 0.42, mats.dark));
  chassis.position.y = 0.26;
  const cabin = add(group, box(0.44, 0.42, 0.44, mats.blue));
  cabin.position.set(0.86, 0.5, 0);

  const drumPivot = new THREE.Group();
  drumPivot.position.set(-0.1, 0.66, 0);
  drumPivot.rotation.z = Math.PI / 2 - 0.15;
  group.add(drumPivot);
  add(drumPivot, new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 1.2, 18), mats.concrete));
  // 螺旋片：几圈环，转起来就有"搅拌"的意思
  for (let i = 0; i < 4; i += 1) {
    const ring = add(drumPivot, new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 6, 16), mats.steel));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.42 + i * 0.28;
  }
  const chute = add(drumPivot, box(0.7, 0.07, 0.14, mats.steel));
  chute.position.set(-0.7, -0.1, 0);
  chute.rotation.z = 0.35;

  for (const [wx, wz] of [[0.66, -0.26], [0.66, 0.26], [-0.52, -0.26], [-0.52, 0.26], [-0.88, -0.26], [-0.88, 0.26]]) {
    const wheel = add(group, cyl(0.15, 0.15, 0.12, mats.dark, 12));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.15, wz);
  }

  return {
    group,
    update(t, dt, ctx) {
      // 浇筑阶段罐子转得明显，其他时候慢转保温
      const rotation = t * (ctx.stageIndex === 2 ? 2.2 : 0.7);
      drumPivot.children[0].rotation.y = rotation;
    },
  };
}

// ------------------------------------------------------------------ 装载机
export function createLoader(mats) {
  const group = new THREE.Group();
  const body = add(group, box(0.98, 0.44, 0.58, mats.yellow));
  body.position.y = 0.46;
  const cab = add(group, box(0.42, 0.4, 0.48, mats.glass));
  cab.position.set(-0.18, 0.86, 0);
  const cabRoof = add(group, box(0.44, 0.05, 0.5, mats.yellowDark));
  cabRoof.position.set(-0.18, 1.08, 0);

  const armPivot = new THREE.Group();
  armPivot.position.set(0.44, 0.52, 0);
  group.add(armPivot);
  for (const side of [-1, 1]) {
    const arm = add(armPivot, box(0.86, 0.11, 0.1, mats.yellowDark));
    arm.position.set(0.43, 0.06, side * 0.26);
  }
  const bucket = add(armPivot, box(0.4, 0.3, 0.7, mats.steel));
  bucket.position.set(0.86, -0.16, 0);
  const lip = add(armPivot, box(0.1, 0.06, 0.7, mats.yellowDark));
  lip.position.set(1.06, -0.3, 0);

  for (const [wx, wz] of [[0.36, -0.3], [0.36, 0.3], [-0.36, -0.3], [-0.36, 0.3]]) {
    const wheel = add(group, cyl(0.2, 0.2, 0.14, mats.dark, 12));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.2, wz);
  }

  const strut = makeStrut({
    radius: 0.02,
    material: mats.steel,
    parent: group,
    from: { parent: group, position: new THREE.Vector3(0.3, 0.62, 0) },
    to: { parent: armPivot, position: new THREE.Vector3(0.02, 0.06, 0) },
  });

  return {
    group,
    update(t, dt, ctx) {
      const busy = ctx.stageIndex >= 4 ? 1 : 0.5;
      armPivot.rotation.z = -0.3 + Math.sin(t * 1.1 * busy) * 0.34;
      group.updateMatrixWorld(true);
      updateStrut(strut, group);
    },
  };
}
