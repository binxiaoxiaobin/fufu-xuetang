// 工程探索 · 给工程车"补细节"（2026-09-30 新增）
//
// 背景：这三件真实工程车的三角面数只有 2.3k / 2.5k / 3.2k，这是免费工程车素材的常态，
// **几何精度靠代码补不出来**。但观感上有三件事是代码能做的，这里都做：
//   ① 材质分级：玻璃 / 履带 / 液压杆 / 车身漆面分开处理，不再"一片磨砂塑料"；
//   ② 程序化零件：警示顶灯、排气管、液压支撑杆、警示条纹铭牌——
//      位置**全部按真实节点的包围盒算**，找不到对应节点就什么都不加（绝不猜位置）；
//   ③ 把装配结果打到控制台，这样下一轮能知道该给哪些节点补匹配规律。
//
// 只新增零件、只改材质，**不动原几何、不动原动画**，所以不会影响"它怎么干活"的三步演示。
//
// ⚠️ 新零件的名字一律以 `x-detail-` 开头，且**不含** boom / arm / bucket / cab 这些词——
//    否则 viewer 里的 focusPart(pattern) 会误把细节零件当成人家的部件高亮出来。
import * as THREE from './vendor/three.module.js';
import { searchNameOf } from './engineering-data.js?v=20260930-eng-motion-1';

// 节点名 → 材质档位。顺序有意义，先匹配到的先用。
const GRADE_RULES = [
  { grade: 'glass', test: /glass|window|windscreen|windshield|visor|mirror/i },
  { grade: 'rubber', test: /track|tread|tire|tyre|wheel|belt|chain|shoe/i },
  { grade: 'chrome', test: /piston|hydraulic|\bram\b|chrome|cylinder|rod/i },
  { grade: 'steel', test: /bucket|blade|shovel|tooth|teeth|grapple|ripper|claw|hook/i },
  { grade: 'paint', test: /cab|canopy|cockpit|roof|body|frame|house|deck|turret|boom|arm|stick/i },
];

function classify(name) {
  for (const rule of GRADE_RULES) if (rule.test.test(name)) return rule.grade;
  return null;
}

// 每档给一套"像什么"的数值。改的是粗糙度/金属度/颜色倾向，不改贴图。
function gradeMaterial(material, grade) {
  if (!material || !material.isMeshStandardMaterial) return material;
  const m = material.clone();
  const rough = Number.isFinite(m.roughness) ? m.roughness : 0.5;
  const metal = Number.isFinite(m.metalness) ? m.metalness : 0;
  switch (grade) {
    case 'glass':
      m.transparent = true;
      m.opacity = 0.32;
      m.depthWrite = false;
      m.roughness = 0.06;
      m.metalness = 0;
      m.envMapIntensity = 1.9;
      m.color.set(0x9fbfd2);
      break;
    case 'rubber':
      m.roughness = 0.96;
      m.metalness = 0.02;
      m.envMapIntensity = 0.5;
      m.color.multiplyScalar(0.5);
      break;
    case 'chrome':
      m.roughness = 0.14;
      m.metalness = 1;
      m.envMapIntensity = 1.6;
      m.color.lerp(new THREE.Color(0xd9dee3), 0.55);
      break;
    case 'steel':
      m.roughness = 0.45;
      m.metalness = 0.8;
      m.envMapIntensity = 1.2;
      break;
    case 'paint':
      m.roughness = Math.min(rough, 0.55);
      m.metalness = Math.max(metal, 0.25);
      m.envMapIntensity = 1.15;
      break;
    default:
      return material;
  }
  m.needsUpdate = true;
  return m;
}

// 深度优先找**第一个**名字匹配的节点（顶层优先，和 viewer 的 focusPart 同一路子）
function firstNode(root, pattern) {
  let hit = null;
  root.traverse((node) => {
    if (!hit && pattern.test(node.name || '')) hit = node;
  });
  return hit;
}

// 把某个节点的包围盒换算到**模型自己的坐标系**里（细节零件都挂在 model 上，
// 所以位置必须用这个坐标）。model 此时还没被旋转/缩放，换算结果就等于世界坐标。
function boxOf(model, node) {
  const world = new THREE.Box3().setFromObject(node);
  const min = model.worldToLocal(world.min.clone());
  const max = model.worldToLocal(world.max.clone());
  return new THREE.Box3(
    new THREE.Vector3(Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)),
    new THREE.Vector3(Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)),
  );
}

// 两点之间架一根圆柱（液压杆就是两根这样的杆）
function strut(from, to, radius, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  if (length < 1e-4) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8, 1, false),
    material,
  );
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

// 黄黑斜条纹：canvas 现场画，不引任何贴图文件
function hazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0c53a';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#2c2c2c';
  ctx.lineWidth = 20;
  for (let x = -80; x < 340; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 68, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function enhanceModel(model, nodeParts) {
  if (!model) return { added: [], missing: [], graded: {} };
  model.updateMatrixWorld(true);

  const whole = new THREE.Box3().setFromObject(model);
  const size = whole.getSize(new THREE.Vector3());
  // u = "这台机器有多大"的单一参考尺度，所有零件尺寸都按它取比例，
  // 这样 3 米的小机器和 14 米的大机器都不会配出荒唐比例的零件。
  const u = Math.max(size.x, size.y, size.z) || 1;

  const report = { added: [], missing: [], graded: {} };

  // ── ① 材质分级 ─────────────────────────────────────────────
  // 匿名网格（<长前缀>_0.._6）按人工标的部件标签分级——它们原名里带着机器名
  // （"tracked-excavator_0"），直接拿原名匹配会把整台车都判成橡胶。
  model.traverse((node) => {
    if (!node.isMesh) return;
    const grade = classify(searchNameOf(node, nodeParts));
    if (!grade) return;
    const source = Array.isArray(node.material) ? node.material : [node.material];
    const graded = source.map((material) => gradeMaterial(material, grade));
    node.material = Array.isArray(node.material) ? graded : graded[0];
    report.graded[grade] = (report.graded[grade] || 0) + 1;
  });

  // ── ② 程序化零件 ───────────────────────────────────────────
  const parts = new THREE.Group();
  parts.name = 'x-detail-kit';

  const cab = firstNode(model, /cab|canopy|cockpit|roof|house/i);
  const body = firstNode(model, /body|frame|deck|chassis|hull|engine|turret|base/i) || cab;
  const boom = firstNode(model, /boom|arm|stick|jib|mast/i);

  const dark = new THREE.MeshStandardMaterial({
    color: 0x2f3336, roughness: 0.75, metalness: 0.35, envMapIntensity: 0.8,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xb9c0c6, roughness: 0.3, metalness: 1, envMapIntensity: 1.5,
  });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xffa726, emissive: 0xff7a10, emissiveIntensity: 1.9, roughness: 0.4, metalness: 0,
  });

  // 警示顶灯：坐在驾驶室（或车顶）最高处的正中
  if (cab) {
    const box = boxOf(model, cab);
    const center = box.getCenter(new THREE.Vector3());
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(u * 0.018, u * 0.022, u * 0.012, 12), dark,
    );
    base.position.set(center.x, box.max.y + u * 0.006, center.z);
    base.name = 'x-detail-beacon-base';
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(u * 0.016, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), lamp,
    );
    dome.position.set(center.x, box.max.y + u * 0.014, center.z);
    dome.name = 'x-detail-beacon-dome';
    parts.add(base, dome);
    report.added.push('警示顶灯');
  } else {
    report.missing.push('驾驶室/车顶');
  }

  // 排气管：立在车身上偏一侧、偏后
  if (body) {
    const box = boxOf(model, body);
    const center = box.getCenter(new THREE.Vector3());
    const width = Math.max(box.max.x - box.min.x, u * 0.1);
    const depth = Math.max(box.max.z - box.min.z, u * 0.1);
    const px = center.x + width * 0.28;
    const pz = center.z - depth * 0.24;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(u * 0.009, u * 0.011, u * 0.11, 10), dark,
    );
    pipe.position.set(px, box.max.y + u * 0.05, pz);
    pipe.name = 'x-detail-exhaust-pipe';
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(u * 0.013, u * 0.013, u * 0.012, 10), steel,
    );
    cap.position.set(px, box.max.y + u * 0.105, pz);
    cap.name = 'x-detail-exhaust-cap';
    parts.add(pipe, cap);
    report.added.push('排气管');
  }

  // 液压支撑杆：从车身前部上沿，斜撑到动臂中点。挖机、拆除机都有这一对。
  if (body && boom) {
    const bodyBox = boxOf(model, body);
    const boomBox = boxOf(model, boom);
    const bodyCenter = bodyBox.getCenter(new THREE.Vector3());
    const bodyDepth = Math.max(bodyBox.max.z - bodyBox.min.z, u * 0.1);
    const from = new THREE.Vector3(
      bodyCenter.x,
      bodyBox.max.y - u * 0.01,
      bodyBox.max.z - bodyDepth * 0.35,
    );
    const to = boomBox.getCenter(new THREE.Vector3());
    if (from.distanceTo(to) > u * 0.06) {
      [-1, 1].forEach((side) => {
        const a = from.clone();
        a.x += side * u * 0.022;
        const b = to.clone();
        b.x += side * u * 0.028;
        const bar = strut(a, b, u * 0.0075, steel);
        if (bar) {
          bar.name = 'x-detail-hydraulic';
          parts.add(bar);
        }
      });
      report.added.push('液压支撑杆');
    } else {
      report.missing.push('液压杆（车身与动臂离得太近，不摆）');
    }
  } else {
    report.missing.push('动臂/车身（液压杆）');
  }

  // 警示条纹铭牌：贴在车身后侧面上（黄黑斜纹，施工机械的招牌元素）
  if (body) {
    const box = boxOf(model, body);
    const center = box.getCenter(new THREE.Vector3());
    const width = Math.max(box.max.x - box.min.x, u * 0.1);
    const height = Math.max(box.max.y - box.min.y, u * 0.1);
    const plateW = Math.min(width * 0.6, u * 0.2);
    const plateH = Math.min(height * 0.22, u * 0.045);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(plateW, plateH, Math.max(0.002, u * 0.006)),
      new THREE.MeshStandardMaterial({
        map: hazardTexture(), roughness: 0.6, metalness: 0.15, envMapIntensity: 0.9,
      }),
    );
    plate.position.set(center.x, box.min.y + height * 0.42, box.min.z - u * 0.004);
    plate.name = 'x-detail-hazard-plate';
    parts.add(plate);
    report.added.push('警示条纹铭牌');
  }

  if (parts.children.length) {
    parts.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    model.add(parts);
  }

  return report;
}
