import * as THREE from './vendor/three.module.js';
import { installFaceShader } from './character-face-shader.js?v=7';

/* 黏土材质 */
const clay = (color, rough = .62) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

const SKIN = 0xd69c72;     // 与原雕面部一致的暖肤（补偿强光照的提亮，贴片/手臂共用）
const SLEEVE_YELLOW = 0xcfad5e; // 袖子=黄 T 恤
const DARK = 0x332017;      // 眼/嘴 深棕
const BLUSH = 0xf0786e;
const SAGE = 0x7d8a63;
const SAGE_DARK = 0x5d6a48;
const CREAM = 0xf3e2b6;
const GOLD = 0xc9964b;
const CORAL = 0xe2765f;

/* 把世界坐标挂点换成骨骼局部坐标；朝向直接继承骨骼（局部单位旋转） */
function attachAt(bone, worldPosition) {
  bone.updateWorldMatrix(true, false);
  const group = new THREE.Group();
  group.position.copy(bone.worldToLocal(new THREE.Vector3(...worldPosition)));
  bone.add(group);
  return group;
}

function starShape(radius = .11) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? radius * .47 : radius;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

/* 径向网格圆盘（后续按头部曲面贴合，再压出浅鼓度） */
function clayDome(rx, ry, material, rings = 9, seg = 56) {
  const positions = [], indices = [];
  positions.push(0, 0, 0);
  for (let r = 1; r <= rings; r++) {
    const rr = r / rings;
    for (let s = 0; s < seg; s++) {
      const a = s / seg * Math.PI * 2;
      positions.push(Math.cos(a) * rr * rx, Math.sin(a) * rr * ry, 0);
    }
  }
  const idx = (r, s) => r === 0 ? 0 : 1 + (r - 1) * seg + (s % seg);
  for (let s = 0; s < seg; s++) {
    indices.push(idx(0, 0), idx(1, s), idx(1, s + 1));
  }
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      indices.push(idx(r, s), idx(r + 1, s), idx(r, s + 1));
      indices.push(idx(r, s + 1), idx(r + 1, s), idx(r + 1, s + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function tube(points, radius, material, segments = 24) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), material);
}

function arcTube(width, drop, radius, material) {
  return tube([
    new THREE.Vector3(-width, .012, 0),
    new THREE.Vector3(0, -drop, 0),
    new THREE.Vector3(width, .012, 0),
  ], radius, material, 18);
}

function v(x, y, z) { return new THREE.Vector3(x, y, z); }

export function createCharacterRig(model) {
  const boneNames = ['Hips', 'Spine', 'Chest', 'Neck', 'Head',
    'UpperArmL', 'UpperArmR', 'ForearmL', 'ForearmR', 'HandL', 'HandR',
    'ThighL', 'ThighR', 'ShinL', 'ShinR'];
  const bones = {};
  for (const name of boneNames) bones[name] = model.getObjectByName(name);
  const faceMeshes = [];
  model.traverse(node => { if (node.isMesh && node.morphTargetDictionary) faceMeshes.push(node); });
  const faceSurface = installFaceShader(faceMeshes);

  /* 统一 GLB 重建件颜色：手臂=面部暖肤，袖子=黄 T 恤 */
  model.traverse(node => {
    if (!node.isMesh) return;
    for (const m of [].concat(node.material)) {
      if (!m || !m.name) continue;
      if (m.name === 'clay skin') { m.color.set(SKIN); m.roughness = .6; }
      else if (m.name === 'clay sleeve') { m.color.set(SLEEVE_YELLOW); m.roughness = .6; }
    }
  });

  const rest = {};
  for (const [name, bone] of Object.entries(bones)) if (bone) rest[name] = bone.quaternion.clone();

  const matSkin = clay(SKIN, .55);
  const matDark = new THREE.MeshStandardMaterial({ color: DARK, roughness: .22, metalness: .04 });
  const matMouth = new THREE.MeshStandardMaterial({ color: 0x643039, roughness: .58, metalness: 0 });
  const matWhite = clay(0xfff6ea, .35);
  const matBlush = new THREE.MeshBasicMaterial({ color: BLUSH, transparent: true, opacity: 0, depthWrite: false });
  const matBrow = clay(0x4a3126, .5);
  const matTongue = clay(0xe86f72, .45);
  const matTeeth = clay(0xfff3e2, .4);

  const wp = new THREE.Vector3(), wn = new THREE.Vector3();
  for (const m of faceMeshes) m.updateWorldMatrix(true, false);

  /* morph delta 加权质心 → 眼/眉/嘴锚点 */
  function measureLandmarks() {
    const acc = {};
    const add = (key, x, y, z, w) => {
      const a = acc[key] || (acc[key] = [0, 0, 0, 0]);
      a[0] += x * w; a[1] += y * w; a[2] += z * w; a[3] += w;
    };
    for (const m of faceMeshes) {
      const p = m.geometry.attributes.position, ma = m.geometry.morphAttributes.position;
      if (!ma) continue;
      const [blink, happy, surprised] = ma;
      for (let i = 0; i < p.count; i++) {
        wp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        if (blink) {
          const w = Math.hypot(blink.getX(i), blink.getY(i), blink.getZ(i));
          if (w > .0025 && Math.abs(wp.x) < .24) add(wp.x < 0 ? 'eyeL' : 'eyeR', wp.x, wp.y, wp.z, w * w);
        }
        if (happy) {
          const w = Math.hypot(happy.getX(i), happy.getY(i), happy.getZ(i));
          if (w > .0025) {
            if (wp.y < 2.30 && Math.abs(wp.x) < .13) add('mouth', wp.x, wp.y, wp.z, w * w);
            else if (wp.y > 2.30 && Math.abs(wp.x) < .24) add(wp.x < 0 ? 'cheekL' : 'cheekR', wp.x, wp.y, wp.z, w * w);
          }
        }
        if (surprised) {
          const w = Math.hypot(surprised.getX(i), surprised.getY(i), surprised.getZ(i));
          if (w > .0025 && wp.y < 2.62 && Math.abs(wp.x) < .24) add(wp.x < 0 ? 'browL' : 'browR', wp.x, wp.y, wp.z, w * w);
        }
      }
    }
    const get = key => {
      const a = acc[key];
      return a ? { x: a[0] / a[3], y: a[1] / a[3], z: a[2] / a[3] } : null;
    };
    return {
      eyeL: get('eyeL') || { x: -.17, y: 2.39, z: .53 },
      eyeR: get('eyeR') || { x: .17, y: 2.40, z: .53 },
      mouth: get('mouth') || { x: 0, y: 2.15, z: .50 },
      browL: get('browL') || { x: -.17, y: 2.51, z: .53 },
      browR: get('browR') || { x: .17, y: 2.52, z: .53 },
    };
  }
  const LM = measureLandmarks();
  const MOUTH_Y = (LM.eyeL.y + LM.eyeR.y) * .5 - .175;

  /* 把原雕嘴部的唇/凹槽压平进头里，避免贴片下透出原雕嘴 */
  if (false) {
    const RX = .155, RY = .090, SINK = .030;
    const inv = new THREE.Matrix4(), lv = new THREE.Vector3();
    for (const m of faceMeshes) {
      inv.copy(m.matrixWorld).invert();
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        wp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        const r2 = (wp.x / RX) ** 2 + ((wp.y - MOUTH_Y) / RY) ** 2;
        if (r2 < 1 && wp.z > .30) {
          const s = .5 - .5 * Math.cos(Math.PI * (1 - r2));
          wp.z -= SINK * s;
          lv.copy(wp).applyMatrix4(inv);
          p.setXYZ(i, lv.x, lv.y, lv.z);
        }
      }
      p.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.updateWorldMatrix(true, false);
    }
  }

  /* 头部正面曲面采样：剔除刘海（法线朝前 + 相对脸部中轴种子面的深度容差） */
  const rawVerts = [];
  for (const m of faceMeshes) {
    m.updateWorldMatrix(true, false);
    const p = m.geometry.attributes.position, n = m.geometry.attributes.normal;
    if (!n) continue;
    for (let i = 0; i < p.count; i++) {
      wp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (wp.y > 1.95 && wp.y < 2.72 && wp.z > .1 && Math.abs(wp.x) < .45) {
        wn.fromBufferAttribute(n, i).transformDirection(m.matrixWorld);
        rawVerts.push({ x: wp.x, y: wp.y, z: wp.z, nz: wn.z });
      }
    }
  }
  /* 中轴种子曲线：|x|<.05 的中位 z */
  const seedBins = new Map();
  for (const vtx of rawVerts) {
    if (Math.abs(vtx.x) > .05) continue;
    const key = Math.round(vtx.y / .04);
    if (!seedBins.has(key)) seedBins.set(key, []);
    seedBins.get(key).push(vtx.z);
  }
  const seedKeys = [...seedBins.keys()].sort((a, b) => a - b);
  const seedAt = y => {
    const f = y / .04, i0 = Math.floor(f), t = f - i0;
    const med = k => {
      const arr = seedBins.get(k);
      if (!arr) return undefined;
      return [...arr].sort((a, b) => a - b)[arr.length >> 1];
    };
    const a = med(i0), b = med(i0 + 1);
    if (a === undefined) return b;
    if (b === undefined) return a;
    return a + (b - a) * t;
  };
  const surfaceGrid = new Map();
  const CELL = .015;
  for (const vtx of rawVerts) {
    if (vtx.nz < .12) continue;
    const seed = seedAt(vtx.y);
    if (seed === undefined) continue;
    if (vtx.z > seed + .05 || vtx.z < seed - .12) continue;  // 排除前方碎发/后方结构
    const key = `${Math.round(vtx.x / CELL)},${Math.round(vtx.y / CELL)}`;
    const prev = surfaceGrid.get(key);
    if (prev === undefined || vtx.z > prev) surfaceGrid.set(key, vtx.z);
  }
  function surfaceAt(x, y) {
    const gx = Math.round(x / CELL), gy = Math.round(y / CELL);
    for (let radius = 0; radius <= 6; radius++) {
      let best;
      for (let ix = gx - radius; ix <= gx + radius; ix++)
        for (let iy = gy - radius; iy <= gy + radius; iy++) {
          const z = surfaceGrid.get(`${ix},${iy}`);
          if (z !== undefined && (best === undefined || z > best)) best = z;
        }
      if (best !== undefined) return best;
    }
    return seedAt(y) ?? .50;
  }

  /* ------ 面部表情系统：保留原雕大眼，只局部替换「眼盖 + 嘴区」 ------ */
  const faceParts = { eyeCovers: [], happyArcs: [], blinkLines: [], mouths: [], brows: [] };
  let faceRig = null;

  const matPatch = new THREE.MeshStandardMaterial({
    color: SKIN, roughness: .6, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  if (false && bones.Head) {
    // 圆盘逐点贴合头表（适合平滑区域：眼盖）
    const conform = (mesh, cx, cy, rx, ry, baseZ) => {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), ly = pos.getY(i);
        const r = Math.min(1, Math.hypot(lx / rx, ly / ry));
        const lift = .017 * Math.cos(r * Math.PI / 2) ** 1.5 - .005 * r;
        pos.setZ(i, surfaceAt(cx + lx, cy + ly) - baseZ + lift);
      }
      mesh.geometry.computeVertexNormals();
    };
    // 解析球面贴合（嘴区有唇/口腔凹凸，直接采网格会起毛刺）：
    // 按头表曲率做平滑浅碗，中心微鼓、外缘额外埋入
    const smoothBowl = (mesh, rx, ry, rzX = .55, rzY = .60, bulgeAmt = .015) => {
      const pos = mesh.geometry.attributes.position;
      const ss = t => t * t * (3 - 2 * t);
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), ly = pos.getY(i);
        const r = Math.min(1, Math.hypot(lx / rx, ly / ry));
        const curve = -(lx * lx / (2 * rzX) + ly * ly / (2 * rzY));
        const bulge = bulgeAmt * Math.cos(r * Math.PI / 2) ** 1.6;
        const sink = .017 * ss(THREE.MathUtils.clamp((r - .62) / .38, 0, 1));
        pos.setZ(i, curve + bulge - sink);
      }
      mesh.geometry.computeVertexNormals();
    };

    // ===== 嘴区贴片（原雕唇已压平，贴片承载三种嘴） =====
    const MY = MOUTH_Y;
    const mz0 = surfaceAt(0, MY);
    const mouthAnchor = attachAt(bones.Head, [0, MY, mz0 + .004]);
    faceRig = mouthAnchor;
    const mouthPatch = clayDome(.142, .094, matPatch);
    smoothBowl(mouthPatch, .142, .094, .60, .66, .006);
    mouthAnchor.add(mouthPatch);

    const mkMouth = key => {
      const g = new THREE.Group();
      mouthAnchor.add(g);
      faceParts.mouths.push({ key, group: g });
      g.scale.setScalar(.001);
      return g;
    };
    const mNeutral = mkMouth('neutral');
    const nArc = arcTube(.043, .010, .0055, matDark);
    nArc.position.z = .014;
    mNeutral.add(nArc);

    const mHappy = mkMouth('happy');
    const smile = new THREE.Shape();
    smile.moveTo(-.106, .027);
    smile.quadraticCurveTo(0, .035, .106, .027);
    smile.quadraticCurveTo(.090, -.053, 0, -.065);
    smile.quadraticCurveTo(-.090, -.053, -.106, .027);
    const cavity = new THREE.Mesh(new THREE.ExtrudeGeometry(smile, {
      depth: .003, bevelEnabled: true, bevelThickness: .004,
      bevelSize: .003, bevelSegments: 3, curveSegments: 16,
    }), matMouth);
    cavity.position.z = .020;
    mHappy.add(cavity);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), matTongue);
    tongue.scale.set(.052, .016, .008);
    tongue.position.set(0, -.042, .031);
    mHappy.add(tongue);
    // 上排牙：短圆条，藏在口腔内上缘（两端不出头变成虎牙）
    const teeth = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .062, 4, 12), matTeeth);
    teeth.rotation.z = Math.PI / 2;
    teeth.position.set(0, .016, .032);
    mHappy.add(teeth);

    const mSurp = mkMouth('surprised');
    const o = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), matMouth);
    o.scale.set(.060, .074, .018);
    o.position.set(0, -.006, .025);
    mSurp.add(o);

    // ===== 眼盖贴片（默认藏起；开心/眨眼时盖住原雕大眼） =====
    // morph 质心偏下，对齐彩绘大眼中心需上移 .045
    for (const E of [LM.eyeL, LM.eyeR]) {
      const ex = E.x, ey = E.y + .045;
      const z0 = surfaceAt(ex, ey);
      const anchor = attachAt(bones.Head, [ex, ey, z0 + .004]);
      const cover = clayDome(.129, .139, matPatch);
      smoothBowl(cover, .129, .139, .55, .62, .008);
      cover.visible = false;
      anchor.add(cover);

      const arcG = new THREE.Group();
      const arc = arcTube(.071, -.027, .009, matDark);
      arc.position.z = .024;
      arcG.add(arc); arcG.scale.setScalar(.001);
      anchor.add(arcG);

      const lineG = new THREE.Group();
      const line = arcTube(.056, .004, .007, matDark);
      line.position.z = .024;
      lineG.add(line); lineG.scale.setScalar(.001);
      anchor.add(lineG);

      faceParts.eyeCovers.push(cover);
      faceParts.happyArcs.push(arcG);
      faceParts.blinkLines.push(lineG);
    }

    // ===== 惊喜抬眉（平时隐藏，避免与原雕眉重叠） =====
    for (const sx of [-1, 1]) {
      const B = sx < 0 ? LM.browL : LM.browR;
      const anchor = attachAt(bones.Head, [B.x, B.y, surfaceAt(B.x, B.y) + .006]);
      const g = new THREE.Group();
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.012, .080, 4, 10), matBrow);
      brow.rotation.z = -sx * .16;
      brow.position.z = .010;
      g.add(brow);
      g.scale.setScalar(.001);
      anchor.add(g);
      faceParts.brows.push(g);
    }
  }

  // 表情状态（带平滑）
  const state = {
    eyeOpen: 1, eyeHappy: 0, eyeBlink: 0,
    mouthN: 1, mouthH: 0, mouthS: 0,
    browRaise: 0,
  };
  let nextBlink = 2.0, blinkUntil = -1, prevT = 0, autoBlink = true;
  function setAutoBlink(on) { autoBlink = !!on; if (!autoBlink) { blinkUntil = -1; state.eyeOpen = 1; } }

  /* ---------------- 配件 ---------------- */
  const accessories = {};
  const modelBox = new THREE.Box3().setFromObject(model);
  const headTop = modelBox.max.y - .02;

  if (bones.Head) {
    // A cloth-like clay hair band follows the sculpted hair without covering it.
    const hat = attachAt(bones.Head, [0, headTop - .14, .15]);
    const matHat = clay(0x879375, .86), matHatDark = clay(0x687758, .88);
    const arch = [v(-.53, -.055, .10), v(-.47, .075, .24), v(-.31, .185, .39),
      v(0, .215, .49), v(.31, .185, .39), v(.47, .075, .24), v(.53, -.055, .10)];
    const band = tube(arch, .033, matHat, 48);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), clay(CORAL, .82));
    knot.scale.set(.050, .045, .033); knot.position.set(-.31, .188, .420);
    const leafL = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), matHatDark);
    leafL.scale.set(.080, .034, .018); leafL.rotation.z = .34;
    leafL.position.set(-.38, .23, .404);
    const leafR = leafL.clone(); leafR.rotation.z = -.36;
    leafR.position.set(-.25, .24, .437);
    hat.add(band, leafL, leafR, knot);
    accessories.hat = hat;

    // Thin tortoiseshell frames with clear centres and arms reaching the ears.
    const eyeY = (LM.eyeL.y + LM.eyeR.y) * .5 + .049;
    const glasses = attachAt(bones.Head, [0, eyeY, surfaceAt(.135, eyeY) + .041]);
    const matFrame = clay(0x684d3a, .78);
    for (const side of [-1, 1]) {
      const x = side * .170;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.097, .007, 8, 40), matFrame);
      ring.position.x = x; glasses.add(ring);
      glasses.add(tube([v(side * .263, .012, -.004), v(side * .332, .010, -.040),
        v(side * .399, -.006, -.125)], .007, matFrame, 18));
    }
    glasses.add(tube([v(-.074, .011, -.004), v(0, .030, -.020),
      v(.074, .011, -.004)], .007, matFrame, 16));
    accessories.glasses = glasses;
  }
  if (bones.Chest) {
    // Small enamel star fastened to the overall strap, with a clay backing.
    const badge = attachAt(bones.Chest, [.258, 1.735, .555]);
    const backing = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), clay(0x765f42, .9));
    backing.scale.set(.079, .079, .021);
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(.055), {
      depth: .009, bevelEnabled: true, bevelThickness: .005,
      bevelSize: .004, bevelSegments: 2,
    }), clay(0xe4b869, .67));
    star.position.z = .017;
    badge.add(backing, star);
    accessories.badge = badge;

    // Rounded open book, gently turned pages and a few warm reading motes.
    const book = attachAt(bones.Chest, [0, 1.64, .715]);
    const matCover = clay(0x6b7657, .84), matPage = clay(0xf3e6c8, .91);
    const matSpine = clay(0x8b5a42, .82), matInk = clay(0xb6a688, .94);
    const bookRoot = new THREE.Group();
    book.add(bookRoot);
    const rounded = (w, h, r) => {
      const x = -w / 2, y = -h / 2, s = new THREE.Shape();
      s.moveTo(x + r, y); s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    };
    const slab = (w, h, r, depth, material) => new THREE.Mesh(
      new THREE.ExtrudeGeometry(rounded(w, h, r), {
        depth, bevelEnabled: true, bevelThickness: .006,
        bevelSize: .006, bevelSegments: 2, curveSegments: 7,
      }), material);
    for (const side of [-1, 1]) {
      const cover = slab(.282, .376, .045, .020, matCover);
      cover.position.set(side * .142, 0, 0);
      cover.rotation.y = -side * .10;
      bookRoot.add(cover);
      const page = slab(.255, .348, .039, .012, matPage);
      page.position.set(side * .135, .003, .026);
      page.rotation.y = -side * .12;
      bookRoot.add(page);
      for (let row = 0; row < 4; row++) {
        const length = row === 3 ? .105 : .155 - row * .009;
        const line = tube([v(side * .136 - length / 2, .107 - row * .067, .052),
          v(side * .136, .109 - row * .067, .060),
          v(side * .136 + length / 2, .107 - row * .067, .052)], .0025, matInk, 9);
        bookRoot.add(line);
      }
    }
    const spine = tube([v(0, -.19, .020), v(0, 0, .032), v(0, .19, .020)], .020, matSpine, 22);
    bookRoot.add(spine);
    for (const side of [-1, 1]) {
      for (let layer = 0; layer < 3; layer++) {
        bookRoot.add(tube([v(side * .013, -.172 + layer * .006, .028 - layer * .006),
          v(side * .18, -.172 + layer * .006, .030 - layer * .006),
          v(side * .264, -.166 + layer * .006, .020 - layer * .006)],
        .0024, matInk, 12));
      }
    }
    const illustration = new THREE.Mesh(new THREE.ShapeGeometry(starShape(.043)),
      clay(0xdcae72, .88));
    illustration.position.set(-.133, .021, .061);
    bookRoot.add(illustration);
    const ribbon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), clay(CORAL, .82));
    ribbon.scale.set(.015, .077, .006); ribbon.position.set(.010, .141, .055);
    bookRoot.add(ribbon);
    for (const side of [-1, 1]) {
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), clay(SKIN, .72));
      palm.scale.set(.042, .062, .038);
      palm.position.set(side * .277, -.123, .072);
      palm.rotation.z = side * .24;
      bookRoot.add(palm);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), clay(SKIN, .72));
      thumb.scale.set(.023, .039, .022);
      thumb.position.set(side * .252, -.091, .087);
      thumb.rotation.z = -side * .48;
      bookRoot.add(thumb);
    }
    const turning = new THREE.Group();
    const leaf = slab(.249, .342, .038, .004, new THREE.MeshStandardMaterial({
      color: 0xf7ebd1, side: THREE.DoubleSide, roughness: .92,
    }));
    leaf.position.set(.125, .003, .058);
    turning.add(leaf); bookRoot.add(turning);
    book.userData.turning = turning;
    const motes = [];
    for (let i = 0; i < 3; i++) {
      const mote = new THREE.Mesh(i === 1
        ? new THREE.SphereGeometry(.012, 10, 8)
        : new THREE.ShapeGeometry(starShape(i === 0 ? .026 : .019)),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffd99a : 0xffe9b4,
        side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
      bookRoot.add(mote); motes.push(mote);
    }
    book.userData.motes = motes;
    bookRoot.rotation.x = -.62;
    bookRoot.scale.set(1.22, 1.14, 1);
    accessories.book = book;
  }
  for (const item of Object.values(accessories)) item.visible = false;

  function setAccessory(name, on) { if (accessories[name]) accessories[name].visible = on; }

  /* ---------------- morph 辅助（很轻微的几何联动） ---------------- */
  function morph(name, value) {
    for (const item of faceMeshes) {
      const index = item.morphTargetDictionary?.[name];
      if (index !== undefined) {
        const cur = item.morphTargetInfluences[index] ?? 0;
        item.morphTargetInfluences[index] = cur + (value - cur) * .18;
      }
    }
  }

  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const qTmp = new THREE.Quaternion();

  function boneTo(name, rx, ry, rz, k) {
    const bone = bones[name];
    if (!bone) return;
    qTmp.identity();
    if (rz) qTmp.multiply(new THREE.Quaternion().setFromAxisAngle(Z, rz));
    if (ry) qTmp.multiply(new THREE.Quaternion().setFromAxisAngle(Y, ry));
    if (rx) qTmp.multiply(new THREE.Quaternion().setFromAxisAngle(X, rx));
    qTmp.premultiply(rest[name]);
    bone.quaternion.slerp(qTmp, k);
  }

  function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
  function setAll(arr, key, val) { for (const o of arr) o.scale[key] = Math.max(.001, val); }
  function setAllScalar(arr, val) { for (const o of arr) o.scale.setScalar(Math.max(.001, val)); }

  function update(action, expression, t, reduced) {
    const dt = Math.min(.05, Math.max(.001, t - prevT)); prevT = t;
    const animate = !reduced;
    const k = 1 - Math.exp(-11 * dt);
    const beat = animate ? Math.sin(t * 4.6) : 0;

    // 身体起伏
    model.position.y = animate
      ? (action === 'cheer' ? Math.max(0, beat) * .075
        : action === 'walk' ? -.035 - Math.pow(Math.sin(t * 4.6), 2) * .07
        : Math.sin(t * 2.0) * .010)
      : 0;
    model.rotation.z = animate && action === 'cheer' ? Math.sin(t * 4.6) * .03 : 0;

    // 自动眨眼（可关闭，用于确定性截图）
    if (animate && autoBlink && t > nextBlink) { blinkUntil = t + .16; nextBlink = t + 2.2 + Math.random() * 2.4; }
    const blinking = animate && t < blinkUntil;

    // ---- 表情目标值 ----
    let tEyeOpen = 1, tEyeHappy = 0, tEyeBlink = 0;
    let tMN = 0, tMH = 0, tMS = 0, tBrow = 0;
    if (expression === 'happy' || (action === 'cheer' && animate)) {
      tEyeHappy = 1; tMH = 1;
    } else if (expression === 'surprised') {
      tMS = 1; tBrow = 1;
    } else if (expression === 'blink') {
      tEyeBlink = 1; tMN = 1;
    } else {
      tMN = 1; tEyeOpen = blinking ? 0 : 1;
    }
    // The baked smile is more natural than a second painted mouth on this sculpt.

    state.eyeOpen = damp(state.eyeOpen, tEyeOpen, 14, dt);
    state.eyeHappy = damp(state.eyeHappy, tEyeHappy, 12, dt);
    state.eyeBlink = damp(state.eyeBlink, tEyeBlink, 16, dt);
    state.mouthN = damp(state.mouthN, tMN, 12, dt);
    state.mouthH = damp(state.mouthH, tMH, 12, dt);
    state.mouthS = damp(state.mouthS, tMS, 12, dt);
    state.browRaise = damp(state.browRaise, tBrow, 10, dt);
    faceSurface.update(
      Math.max(state.eyeHappy, state.eyeBlink, 1 - state.eyeOpen),
      state.eyeHappy, 0, 0,
    );

    if (faceRig) {
      const closed = 1 - state.eyeOpen;
      const coverA = Math.max(state.eyeHappy, state.eyeBlink, closed);
      for (const c of faceParts.eyeCovers) {
        c.visible = coverA > .04;
        c.scale.y = Math.max(.001, coverA);
      }
      const lineA = Math.max(state.eyeBlink, closed * (1 - state.eyeHappy));
      for (const g of faceParts.happyArcs) { g.visible = state.eyeHappy > .04; g.scale.setScalar(Math.max(.001, state.eyeHappy)); }
      for (const g of faceParts.blinkLines) { g.visible = lineA > .04; g.scale.setScalar(Math.max(.001, lineA)); }
      for (const m of faceParts.mouths) {
        const a = m.key === 'neutral' ? state.mouthN : m.key === 'happy' ? state.mouthH : state.mouthS;
        m.group.visible = a > .03;
        m.group.scale.setScalar(Math.max(.001, a));
      }
      for (const b of faceParts.brows) {
        b.visible = state.browRaise > .04;
        b.scale.setScalar(Math.max(.001, state.browRaise));
        b.position.y = state.browRaise * .028;
      }
    }

    // morph 微联动
    morph('Happy', 0);
    morph('Surprised', state.mouthS * .7);
    morph('Blink', 0);

    // ---- 动作目标（局部轴：Z=侧举，X=前后摆）----
    let spineX = 0, headX = 0, headZ = 0, chestZ = 0;
    let uaRX = 0, uaLX = 0, uaRZ = 0, uaLZ = 0, faRX = 0, faLX = 0, faRZ = 0, faLZ = 0;
    let hdRZ = 0, thRX = 0, thLX = 0, shRX = 0, shLX = 0;

    // Keep the original Tripo arm islands in their exact rest pose at idle.
    uaRX = 0; uaLX = 0;

    if (action === 'wave' && animate) {
      // Keep the upper arm close to the body: the original sculpt has an open
      // shoulder shell, so the greeting comes from a bent forearm and wrist.
      uaRZ = -.72 + Math.sin(t * 2.4) * .035;
      uaRX = -.48;
      faRZ = -.28 + Math.sin(t * 7.0) * .10;
      faRX = -.18 + Math.sin(t * 7.0) * .08;
      hdRZ = Math.sin(t * 7.0) * .18;
      headZ = -.035 + Math.sin(t * 2.4) * .02;
      headX = -.035;
      uaLX = .05;
    } else if (action === 'cheer' && animate) {
      // Celebrate with a buoyant hop and arms gathered forward, avoiding
      // shoulder separation in the open-sided source sculpt.
      uaRZ = .18; uaLZ = -.18;
      uaRX = -.82 + beat * .045; uaLX = -.82 - beat * .045;
      faRZ = -.02; faLZ = .02;
      chestZ = beat * .03;
      headX = -.08;
    } else if (action === 'nod' && animate) {
      const n = Math.sin(t * 3.6);
      headX = n > 0 ? n * .30 : n * .08;
      uaRX = .10; uaLX = .10;
    } else if (action === 'walk' && animate) {
      const s = Math.sin(t * 4.6), s2 = Math.sin(t * 4.6 + .05);
      thRX = s * .64; thLX = -s * .64;
      shRX = 0; shLX = 0;
      uaRX = -s * .34; uaLX = s * .34;
      faRX = .16 + Math.max(0, s) * .14; faLX = .16 + Math.max(0, -s) * .14;
      headX = .04;
    } else if (action === 'read' && animate) {
      uaRX = -1.00; uaLX = -1.00;
      uaRZ = .34; uaLZ = -.34;
      faRX = -1.10; faLX = -1.10;
      faRZ = 0; faLZ = 0;
      headX = .20 + Math.sin(t * 1.4) * .03;
      spineX = .06;
    }

    // 调试用姿态覆盖（URL 参数）
    if (window.__pose) {
      const p = window.__pose;
      if (p.uaRZ !== undefined) uaRZ = p.uaRZ;
      if (p.uaLZ !== undefined) uaLZ = p.uaLZ;
      if (p.uaRX !== undefined) uaRX = p.uaRX;
      if (p.uaLX !== undefined) uaLX = p.uaLX;
      if (p.faRZ !== undefined) faRZ = p.faRZ;
      if (p.faLZ !== undefined) faLZ = p.faLZ;
      if (p.faRX !== undefined) faRX = p.faRX;
      if (p.faLX !== undefined) faLX = p.faLX;
    }

    if (accessories.book) {
      const book = accessories.book;
      book.visible = action === 'read';
      if (book.visible) {
        book.rotation.z = animate ? Math.sin(t * 1.25) * .012 : 0;
        const phase = animate ? (t % 5.6) / 5.6 : .5;
        book.userData.turning.visible = animate && phase < .31;
        book.userData.turning.rotation.y = -Math.PI * THREE.MathUtils.smoothstep(phase, .015, .30);
        book.userData.motes.forEach((mote, index) => {
          const drift = t * .55 + index * 2.1;
          mote.position.set((index - 1) * .12 + Math.sin(drift) * .019,
            .22 + (drift % 1) * .20, .085);
          mote.material.opacity = animate ? .48 * Math.sin(Math.PI * (drift % 1)) : 0;
        });
      }
    }

    boneTo('Spine', spineX, 0, 0, k);
    boneTo('Chest', 0, 0, chestZ, k);
    boneTo('Head', headX, 0, headZ, k);
    boneTo('UpperArmR', uaRX, 0, uaRZ, k);
    boneTo('UpperArmL', uaLX, 0, uaLZ, k);
    boneTo('ForearmR', faRX, 0, faRZ, k);
    boneTo('ForearmL', faLX, 0, faLZ, k);
    boneTo('HandR', 0, 0, hdRZ, k);
    boneTo('ThighR', thRX, 0, 0, k);
    boneTo('ThighL', thLX, 0, 0, k);
    boneTo('ShinR', shRX, 0, 0, k);
    boneTo('ShinL', shLX, 0, 0, k);
  }

  window.__ttRig = { model, bones, faceMeshes, surfaceAt, LM, faceParts, mouthAnchor: faceRig };
  return { bones, face: faceMeshes, accessories, setAccessory, setAutoBlink, update };
}
