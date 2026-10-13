import { createSceneScope, disposeGraph } from './scene-scope.js?v=20261003-lifecycle-1';
import { findPartMeshes } from './model-parts.js?v=20261005-observe-5';
import { boxViewDistance, modelScaleFactor } from './model-framing.js?v=20261006-transport-1';
// 工程探索页的**三维查看器**：一块画布 + 一台工程车 + 右边的团团 + 地面米格。
//
// 这套做法和远古生命馆（frontend/dino-model.js）是同一个套路，目的也一样：
//   1. 模型是米制、脚底落在 y=0，所以不用归一化，直接摆在地上比例就是对的；
//   2. 团团固定 1.2 米，按同一把尺子缩放，站在机器右边当活参照；
//   3. 取景要把"机器 + 团团"的整体包围盒一起框进去，否则参照物会被裁在画面外；
//   4. 脚下铺米格（1 米或 2 米一格），数格子就能量出机器多长。
//
// ── 关于"认一认它的部件"（2026-09-30 重做）────────────────────────────
// 旧版是给部件套一个橙色 `Box3Helper`——一个**包围盒**。那看不清是哪块零件，
// 薄薄的零件还会被套成一个巨大的方盒，确实很差。现在换成四件事叠加：
//   ① **部件自己发光**：克隆该部件的材质，加橙色自发光并呼吸脉动；
//   ② **精确描边**：`EdgesGeometry` 沿零件**真实的棱**画线，不再是方盒；
//   ③ **其余部件压暗**：只压暗颜色、不用透明（避免半透明排序穿帮）；
//   ④ **名称牌 + 镜头推近**：部件上方浮出中文名牌，镜头平滑移过去看它。
// 另外**直接点模型也能查**——点哪儿高亮哪儿，不用非得去点右边的名字。
//
// ── 「它怎么干活」的动作演示（2026-09-30 重做）─────────────────────
// 旧做法：把机器型号里 model.animations[index] 指到的**自带片段**播一遍。
// 量出来的事实是：这些片段只是「动臂抬/落」「铲斗翻/收」的孤立片段，和三步的
// 文字对不上（②"转"根本没有动画——两台真实机器的上半身都没分件），拆除机的
// 两段更是**都只驱动动臂**，分件模型干脆 0 段。所以"动作对应不上"。
// 现在：playStep 读步骤上配的动作——{motion} 交给 engineering-motion.js 的
// 关键帧引擎（关节范围取自自带动画的安全范围），{focus} 把零件框出来。
// 模型做不到的动作，数据里写成文字说明（stepNote），界面直说，不硬演。
//
// ⚠️ 撤销高亮时要把**原始材质**还回去。给高亮/压暗各克隆了一份材质，所以条目里
//    必须存"原来的那个"（`original`），不能存刚赋上去的克隆——存错了高亮就永远关不掉。
//
// ── 换第三方模型的两个开关 ──────────────────────────────────────────
//   model.fitLengthM : 这台机器**真实的长度（米）**。填了它，加载后会把模型按比例
//                      缩放到"水平方向最长边 = 这么多米"，然后自动居中、脚底贴地。
//                      不填 = 当作模型本来就是米制（现在这三件就是这种情况）。
//   model.yawFix     : 额外交给模型的弧度。`Math.PI` = 转半圈、`±Math.PI/2` = 侧面朝镜头。
//
// 每次载入都会在控制台打两行：实际尺寸（照它填上面两个数）+ 细节装配结果。
//
// 对外只暴露几个动作：load / setRefEnabled / resetView / focusPart / playStep。
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { MODEL_YAW, TUANTUAN_HEIGHT_M, TUANTUAN_URL, searchNameOf } from './engineering-data.js?v=20261005-observe-5';
import { enhanceModel } from './engineering-detail.js?v=20260930-eng-motion-1';
import { createMotion } from './engineering-motion.js?v=20261005-observe-5';
import { createMachinery } from './engineering-machinery.js?v=20261005-observe-5';

const HOME_AZIMUTH = 0.55;
const HOME_ELEVATION = 0.34;
const HIGHLIGHT_COLOR = 0xff9a2e;

// 节点名 → 中文部件名。**猜不到就不显示名字**，绝不硬编一个错的。
const PART_WORDS = [
  [/windscreen|windshield/i, '挡风玻璃'],
  [/cab|cabin|cockpit/i, '驾驶室'],
  [/boom/i, '动臂'],
  [/counter.?weight|ballast/i, '配重'],
  [/roller_drum/i, '压实钢轮'],
  [/drum/i, '搅拌罐'],
  [/blade/i, '推土铲刀'],
  [/tailgate/i, '后尾门'],
  [/bed/i, '敞口车斗'],
  [/jaw|grapple/i, '液压钳'],
  [/chute/i, '卸料溜槽'],
  [/slew/i, '回转支承'],
  [/bucket|shovel/i, '铲斗'],
  [/arm|stick/i, '斗杆'],
  [/track|tread|crawler/i, '履带'],
  [/tire|tyre|wheel/i, '车轮'],
  [/exhaust|muffler/i, '排气管'],
  [/glass|window/i, '玻璃'],
  [/engine|hood|cover/i, '发动机罩'],
  [/outrigger|jack|stabil/i, '支腿'],
  [/hydraulic|piston|cylinder|ram/i, '液压杆'],
  [/tower|mast/i, '塔身'],
  [/jib|trolley|hoist|hook|cable/i, '吊臂'],
  [/tube|pipe|hose/i, '管路'],
];
function guessPartName(node) {
  const name = node.name || '';
  for (const [pattern, label] of PART_WORDS) if (pattern.test(name)) return label;
  return null;
}

// 名称牌：canvas 画一个圆角胶囊（和项目其它页面的牌子一个调子）
function makePartLabel(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 'bold 44px "Microsoft YaHei", system-ui, sans-serif';
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 56;
  canvas.width = width;
  canvas.height = 84;
  const paint = canvas.getContext('2d');
  paint.font = font;
  const radius = 26;
  paint.beginPath();
  paint.moveTo(radius, 4);
  paint.lineTo(width - radius, 4);
  paint.quadraticCurveTo(width - 4, 4, width - 4, 42);
  paint.quadraticCurveTo(width - 4, 80, width - radius, 80);
  paint.lineTo(radius, 80);
  paint.quadraticCurveTo(4, 80, 4, 42);
  paint.quadraticCurveTo(4, 4, radius, 4);
  paint.closePath();
  paint.fillStyle = 'rgba(38,30,22,.9)';
  paint.fill();
  paint.lineWidth = 4;
  paint.strokeStyle = 'rgba(255,164,74,.95)';
  paint.stroke();
  paint.fillStyle = '#ffe6bf';
  paint.textAlign = 'center';
  paint.textBaseline = 'middle';
  paint.fillText(text, width / 2, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false,
  }));
  sprite.renderOrder = 1000;
  return { sprite, aspect: width / 84 };
}

// 一张 128×64 的渐变图当环境光照，横过来铺成球面。
// 用 canvas 现场画，不引入任何贴图文件。
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

export function createViewer({ host, onLegend, onStatus, motionFactory }) {
  const scope=createSceneScope();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 400);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  scope.own(scene,renderer);
  renderer.setPixelRatio((window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.append(renderer.domElement);

  // 环境光照：只影响材质反射，不铺背景（背景仍是舞台那层渐变，靠 alpha 透上来）
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.9;

  scene.add(new THREE.HemisphereLight(0xeaf3df, 0x40514a, 1.5));
  const sun = new THREE.DirectionalLight(0xffeccd, 2.6);
  sun.position.set(-7, 12, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc2dcff, 0.8);
  fill.position.set(9, 6, -8);
  scene.add(fill);
  // 背光：从机身斜后方压低角度补一盏，专门勾轮廓，不投影（免得影子糊成一团）
  const rim = new THREE.DirectionalLight(0xdfe9ff, 0.55);
  rim.position.set(3, 4.5, -12);
  scene.add(rim);

  // 只收影子、不画地面本身：舞台的渐变背景能透上来，和远古生命馆一样
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShadowMaterial({ opacity: 0.2 }),
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.01;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const modelRoot = new THREE.Group();
  const refRoot = new THREE.Group();
  scene.add(modelRoot, refRoot);

  const state = {
    azimuth: HOME_AZIMUTH,
    elevation: HOME_ELEVATION,
    distance: 24,
    homeDistance: 0,      // 0 表示还没取过景
    minDistance: 4,
    maxDistance: 120,
    target: new THREE.Vector3(0.9, 2, 0),
    grid: null,
    gridStepM: 1,
    fits: null,
    motion: null,         // 动作演示引擎（engineering-motion.js），没有可动关节的机器是 null
    machine: null,        // 当前机器（focusPart 靠它的 model.nodeParts 认匿名网格）
    motionActive: false,
    drag: null,
    clock: scope.clock(new THREE.Clock()),
    vw: 0,
    vh: 0,
    refEnabled: false,
    refReady: false,
    refHeight: 0,
    refWidth: 0,
    refPivot: null,
    focus: null,          // 当前高亮的部件（见下方 focusPart）
    pulse: 0,
  };

  let loadToken = 0;
  scope.cleanup(()=>{loadToken++;state.motion?.dispose?.();clearHighlight();});

  // ---------------------------------------------------------------- 部件高亮
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const scratchPoint = new THREE.Vector3();
  const inverseRoot = new THREE.Matrix4();

  function disposeClones(materials) {
    materials.forEach((material) => {
      if (material && material.isMaterial) material.dispose();
    });
  }

  // 把高亮状态整个撤销：材质还原、描边与名牌清掉。
  // ⚠️ 必须还原 `original`（克隆之前保存的那个），不是刚赋上去的克隆。
  function clearHighlight() {
    const focus = state.focus;
    state.focus = null;
    if (!focus) return;
    focus.entries.forEach((entry) => {
      entry.node.material = entry.original;
      disposeClones(entry.glow);
    });
    focus.others.forEach((entry) => {
      entry.node.material = entry.original;
      disposeClones(entry.dim);
    });
    focus.outlinePairs.forEach((pair) => {
      modelRoot.remove(pair.line);
      pair.line.geometry.dispose();
      pair.line.material.dispose();
    });
    if (focus.label) {
      modelRoot.remove(focus.label);
      focus.label.material.map?.dispose();
      focus.label.material.dispose();
    }
  }

  // 真正的聚焦实现：传进来一批网格 + 一个可选的显示名
  function applyFocus(meshes, label) {
    clearHighlight();
    if (!meshes.length) return false;

    const hitSet = new Set(meshes);
    const entries = [];
    const outlinePairs = [];
    const bounds = new THREE.Box3();

    // ① 命中的部件：自发光 + 沿真实棱描边
    meshes.forEach((node) => {
      const wasArray = Array.isArray(node.material);
      const source = wasArray ? node.material : [node.material];
      const original = wasArray ? source : source[0];
      const glow = source.map((material) => {
        if (!material) return material;
        const clone = material.clone();
        if (clone.emissive) clone.emissive = new THREE.Color(HIGHLIGHT_COLOR);
        clone.emissiveIntensity = 0.45;
        return clone;
      });
      node.material = wasArray ? glow : glow[0];
      entries.push({ node, original, glow });

      bounds.expandByObject(node);

      // 蒙皮网格的顶点位置由骨骼算，描边不会跟着动，所以跳过它
      if (!node.isSkinnedMesh && !node.isInstancedMesh && node.geometry) {
        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(node.geometry, 35),
          new THREE.LineBasicMaterial({
            color: HIGHLIGHT_COLOR, transparent: true, opacity: 0.95, depthTest: false,
          }),
        );
        line.matrixAutoUpdate = false;
        line.renderOrder = 998;
        modelRoot.add(line);
        outlinePairs.push({ line, node });
      }
    });

    // ② 其余部件压暗：只压暗颜色，**不用透明**——半透明会带来排序穿帮
    const others = [];
    modelRoot.traverse((node) => {
      if (!node.isMesh || hitSet.has(node)) return;
      const wasArray = Array.isArray(node.material);
      const source = wasArray ? node.material : [node.material];
      const dim = source.map((material) => {
        if (!material || !material.color) return material;
        const clone = material.clone();
        clone.color = material.color.clone().multiplyScalar(0.42);
        clone.envMapIntensity = 0.3;
        return clone;
      });
      node.material = wasArray ? dim : dim[0];
      others.push({ node, original: wasArray ? source : source[0], dim });
    });

    // ③ 名称牌：挂在部件上方（canvas 精灵，永远朝着镜头）
    let labelSprite = null;
    const centerWorld = bounds.getCenter(new THREE.Vector3());
    const modelHeight = state.fits ? state.fits.height : 4;
    const labelHeight = Math.max(0.16, Math.min(0.9, modelHeight * 0.16));
    if (label) {
      const made = makePartLabel(label);
      labelSprite = made.sprite;
      labelSprite.userData.labelAspect = made.aspect;
      labelSprite.scale.set(labelHeight * made.aspect, labelHeight, 1);
      // 包围盒是世界坐标，而精灵挂在 modelRoot 下——换算一下，否则会被整体变换带偏
      scratchPoint.set(centerWorld.x, bounds.max.y + labelHeight * 0.8 + 0.1, centerWorld.z);
      modelRoot.worldToLocal(scratchPoint);
      labelSprite.position.copy(scratchPoint);
      modelRoot.add(labelSprite);
    }

    // ④ 镜头平滑推近（用户一滚轮/一拖动就交还控制权）
    const sizeWorld = bounds.getSize(new THREE.Vector3());
    const fit = THREE.MathUtils.clamp(
      boxViewDistance(sizeWorld.x,sizeWorld.y,sizeWorld.z,camera.fov,camera.aspect || 1.6,state.azimuth,state.elevation,1.12),
      state.minDistance, state.homeDistance || state.maxDistance,
    );
    state.focus = {
      entries, others, outlinePairs, label: labelSprite,
      target: centerWorld.clone(),
      distance: fit,
      userTookOver: false,
    };
    state.pulse = 0;
    return true;
  }

  // 供右侧面板调用：传正则（老的调用方式），也可附带一个显示名
  function focusPart(pattern, label) {
    if (!pattern) { clearHighlight(); return false; }
    const matcher = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
    const tags = state.machine?.model?.nodeParts;
    const hits = findPartMeshes(modelRoot, matcher, tags);
    if (!hits.length) return false;
    return applyFocus(hits, label || guessPartName(hits[0]));
  }

  // 供画布点击调用：射中哪个网格就高亮哪个
  function inspectAt(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const intersections = raycaster.intersectObject(modelRoot, true);
    if (!intersections.length) { clearHighlight(); return; }
    const node = intersections[0].object;
    applyFocus([node], guessPartName(node));
  }

  // ---------------------------------------------------------------- 交互
  const canvas = renderer.domElement;
  scope.listen(canvas, 'pointerdown', (event) => {
    state.drag = {
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      // 手指比鼠标抖得多。阈值仍是 6px 的话，平板上每次想点选部件
      // 都会被算成"旋转过"，点选就失效了。
      slack: event.pointerType === 'touch' ? 18 : 6,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  scope.listen(canvas, 'pointermove', (event) => {
    if (!state.drag) return;
    const dx = event.clientX - state.drag.x;
    const dy = event.clientY - state.drag.y;
    state.drag.moved += Math.abs(dx) + Math.abs(dy);
    state.azimuth -= dx * 0.007;
    state.elevation = THREE.MathUtils.clamp(
      state.elevation + dy * 0.005, -0.05, 1.15,
    );
    state.drag.x = event.clientX;
    state.drag.y = event.clientY;
    if (state.drag.moved > state.drag.slack && state.focus) state.focus.userTookOver = true;
  });
  ['pointerup', 'pointercancel'].forEach((type) => scope.listen(canvas, type, (event) => {
    const drag = state.drag;
    state.drag = null;
    canvas.style.cursor = 'grab';
    // 几乎没动 = 单击：查一下点到了哪块部件
    if (type === 'pointerup' && drag && drag.moved < drag.slack && event.button === 0) inspectAt(event);
  }));
  scope.listen(canvas, 'wheel', (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.08 : 0.92;
    state.distance = THREE.MathUtils.clamp(
      state.distance * factor, state.minDistance, state.maxDistance,
    );
    if (state.focus) state.focus.userTookOver = true;
  }, { passive: false });

  // ---------------------------------------------------------------- 团团
  // ⚠️ query 要和首页 pet3d.js、恐龙馆 dino-model.js、动物园 clay.js 一致，
  // 否则同一份 explorer.glb 会被当成分开的资源各下一遍。
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`${TUANTUAN_URL}?v=20260930-tuantuan-3`, (gltf) => {
    if(scope.disposed){disposeGraph(gltf.scene);return;}
    const person = gltf.scene;
    person.traverse((item) => { if (item.isMesh) item.castShadow = true; });
    const box = new THREE.Box3().setFromObject(person);
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0.001) return;
    // 先把脚底挪到 y=0、身体水平居中，塞进一个 pivot；之后只改 pivot 的缩放就能"长高"
    person.position.set(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    const pivot = new THREE.Group();
    pivot.add(person);
    pivot.rotation.y = MODEL_YAW;
    refRoot.add(pivot);
    state.refPivot = pivot;
    state.refHeight = size.y;
    state.refWidth = Math.max(size.x, 0.001);
    if (state.fits) applyLayout();
  }, undefined, () => {
    // 团团取不到也不影响看机器，只是少了一把尺子
    state.refEnabled = false;
    onLegend?.('团团暂未载入，可以用地面米格比较大小。');
    if (state.fits) applyLayout();
  });

  // ---------------------------------------------------------------- 尺寸与取景
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    state.vw = w;
    state.vh = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (state.fits) applyLayout();
  }

  // 按"机器 + 团团"的整体包围盒定机位：视线落在整体竖直中心，距离刚好装得下。
  // 会保留用户当前的缩放比例——否则手机上地址栏一收一放、画面就被拉回默认远近。
  // ⚠️ 别在别处手工算 state.target，这个函数是唯一权威（曾经手算错过一次）。
  function applyLayout() {
    if (!state.fits) return;
    const previousHome = state.homeDistance;
    const zoomRatio = previousHome > 0 ? state.distance / previousHome : 1;

    const { width, height, depth } = state.fits;
    const refScale = state.refHeight > 0 ? TUANTUAN_HEIGHT_M / state.refHeight : 0;
    const useRef = state.refEnabled && refScale > 0 && state.refPivot;
    const refWidthWorld = useRef ? state.refWidth * refScale : 0;
    const refGap = useRef ? Math.max(0.2, width * 0.04) : 0;

    const halfH = Math.max(2, height, useRef ? TUANTUAN_HEIGHT_M : 0) * 0.5;
    const halfW = Math.max(2, width + refWidthWorld + refGap) * 0.5;
    const halfD = Math.max(1, depth * 0.5);

    const fittedDistance=Math.max(4,boxViewDistance(halfW*2,halfH*2,halfD*2,camera.fov,camera.aspect || 1.6,HOME_AZIMUTH,HOME_ELEVATION,1));
    state.homeDistance = Math.max(fittedDistance * 1.08, 4);
    state.minDistance = Math.max(3, state.homeDistance * 0.28);
    state.maxDistance = state.homeDistance * 2.6;
    camera.far = Math.max(400, state.maxDistance + Math.max(width,height,depth) * 2);
    camera.updateProjectionMatrix();
    // 正在看某个部件、且用户没接管镜头时，别把距离拉回全景
    if (!state.focus || state.focus.userTookOver) {
      state.distance = THREE.MathUtils.clamp(
        state.homeDistance * zoomRatio, state.minDistance, state.maxDistance,
      );
    }
    state.target.set((state.fits.centerX ?? 0.9) + (refWidthWorld + refGap) * 0.5, state.fits.centerY ?? halfH, state.fits.centerZ ?? 0);

    if (useRef) {
      state.refPivot.scale.setScalar(refScale);
      state.refPivot.position.set(0.9 + width * 0.5 + refGap + refWidthWorld * 0.5, 0, 0);
      refRoot.visible = true;
      state.refReady = true;
    } else {
      refRoot.visible = false;
      state.refReady = false;
    }
    announceLegend();
  }

  function announceLegend() {
    if (!onLegend) return;
    const grid = `地面网格：每格 ${state.gridStepM} 米`;
    onLegend(state.refReady ? `${grid} · 右边的小人是团团，身高 1.2 米` : grid);
  }

  function buildGrid(stepM) {
    state.gridStepM = stepM;
    if (state.grid) {
      scene.remove(state.grid);
      state.grid.geometry.dispose();
      state.grid.material.dispose();
      state.grid = null;
    }
    const cells = 40;
    state.grid = new THREE.GridHelper(stepM * cells, cells, 0x93ae99, 0xc6d6c9);
    state.grid.material.transparent = true;
    state.grid.material.opacity = 0.5;
    state.grid.position.set(0.9, -0.02, 0);
    scene.add(state.grid);
    announceLegend();
  }

  // 阴影相机按模型大小收紧：范围越小，影子越锐利，机器越像"站"在地上
  function tightenShadow(size) {
    const radius = THREE.MathUtils.clamp(
      Math.max(size.x, size.z) * 0.8, 6, 18,
    );
    sun.shadow.camera.left = -radius;
    sun.shadow.camera.right = radius;
    sun.shadow.camera.top = radius;
    sun.shadow.camera.bottom = -radius;
    sun.shadow.camera.updateProjectionMatrix();
  }

  // detail.js 的液压支撑杆一头搭在动臂中点、一头搭在车身上，位置是载入时按
  // **静止姿态**算的。动臂一转它就脱开了——所以动作播放期间把它藏起来，
  // 播完（或换模型）再放回来。警示灯/排气管/铭牌都长在车身上，不受影响。
  function setStruts(visible) {
    modelRoot.traverse((node) => {
      if (node.name === 'x-detail-hydraulic') node.visible = visible;
    });
  }

  // 步骤按钮：播与文字一致的动作，或把对应零件框出来
  function playStep(machine, index) {
    state.stepIndex=index;
    state.sequence = null;
    state.sequencePaused=false;
    clearHighlight();
    state.distance = state.homeDistance || state.distance;
    applyLayout();
    const action = machine.steps?.[index]?.[2];
    if (!action) {
      state.motion?.reset();
      return false;
    }
    if (action.motion) {
      if (!state.motion) return false;
      if (!state.procedural) setStruts(false);
      if(action.viewPattern && focusPart(action.viewPattern,action.label || machine.steps[index][0])) state.focus.followMotion=true;
      state.motionActive=state.motion.play(action.motion,{loop:false});
      return state.motionActive;
    }
    if (action.focus) return focusPart(action.focus, action.label);
    state.motion?.reset();
    return false;
  }

  // ---------------------------------------------------------------- 载入模型
  function disposeModel(model) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    model.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of [].concat(node.material)) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
  }
  function load(machine) {
    state.stepIndex=-1;
    const token = ++loadToken;
    clearHighlight();
    state.motion?.dispose?.();
    state.motion = null;
    state.motionActive = false;
    state.procedural = null;
    state.sequence = null;
    state.machine = machine;
    modelRoot.children.forEach(disposeModel);
    modelRoot.clear();
    refRoot.visible = false;
    state.fits = null;
    state.homeDistance = 0;
    onStatus?.(`正在载入${machine.name}的模型…`);

    let assembled = null;
    const acceptModel = (gltf) => {
      if (token !== loadToken) { disposeModel(gltf.scene); return; }
      const model = gltf.scene;
      model.traverse((item) => {
        if (!item.isMesh) return;
        item.castShadow = true;
        item.receiveShadow = true;
        // 让环境光照真正作用到材质上（有些素材默认写的是 0）
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => {
          if (material && material.isMeshStandardMaterial) material.envMapIntensity = 1;
        });
      });

      // 给低模"补细节"：材质按名字分级 + 在真实节点上挂程序化零件。
      // 必须在旋转/缩放**之前**做——零件是按模型自己的坐标系落位的，
      // 之后整体旋转缩放会带着它们一起走。
      let detail = { added: [], missing: [], graded: {} };
      try {
        if (!assembled && machine.model.enhanceDetails) detail = enhanceModel(model, machine.model.nodeParts);
      } catch (error) {
        // 细节是加分项，绝不能因为它把整台机器的载入搞挂
        console.warn('[工程探索] 细节装配失败（不影响模型显示）', error);
      }

      // ── 摆正顺序：① 转朝向 ②（必要时）按真实长度缩放到米 ③ 再量盒子 ④ 居中贴地 ──
      // 顺序不能反：包围盒是按"当前变换"量的，先缩再量和先量再缩的结果完全不同。
      model.rotation.x += Number(machine.model.pitchFix) || 0;
      model.rotation.z += Number(machine.model.rollFix) || 0;
      model.updateMatrixWorld(true);

      let box = new THREE.Box3().setFromObject(model);
      let size = box.getSize(new THREE.Vector3());

      // 下载来的第三方模型多半不是米制。给了 fitLengthM 就按"水平最长边"缩放，
      // 这样团团（1.2 米）和地面米格的尺度才仍然成立。
      const fitLengthM = Number(machine.model.fitLengthM) || 0;
      if (fitLengthM > 0 || Number(machine.model.fitHeightM) > 0) {
        const factor = modelScaleFactor(size, machine.model);
        if (factor > 0) {
          model.scale.multiplyScalar(factor);
          model.updateMatrixWorld(true);
          box = new THREE.Box3().setFromObject(model);
          size = box.getSize(new THREE.Vector3());
        }
      }

      // 先按模型本身的轴测尺寸缩放，再摆展示角度；朝向不影响米制比例。
      model.rotation.y = MODEL_YAW + (machine.model.yawFix || 0);
      model.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x += 0.9 - center.x;
      model.position.z += -center.z;
      model.position.y += -box.min.y;
      modelRoot.add(model);

      const finalBox = new THREE.Box3().setFromObject(modelRoot);
      const finalSize = finalBox.getSize(new THREE.Vector3());
      state.fits = { width: finalSize.x, height: finalSize.y, depth: finalSize.z };

      // 打两行日志：尺寸给换模型时填参数用；细节装配结果给下一轮补匹配规律用
      console.info(
        `[工程探索] ${machine.name} 模型尺寸 `
        + `${finalSize.x.toFixed(2)} × ${finalSize.y.toFixed(2)} × ${finalSize.z.toFixed(2)} 米`
        + `（水平最长边 ${Math.max(finalSize.x, finalSize.z).toFixed(2)} 米`
        + `${fitLengthM > 0 ? `，按 fitLengthM=${fitLengthM} 归一化` : '，按米制直接使用'}）`,
      );
      const graded = Object.entries(detail.graded).map(([kind, n]) => `${kind}×${n}`).join(' ');
      console.info(
        `[工程探索] ${machine.name} 细节装配：`
        + `${detail.added.length ? detail.added.join('、') : '无'}`
        + `${graded ? ` ｜ 材质分级：${graded}` : ''}`
        + `${detail.missing.length ? ` ｜ 没找到可挂载的节点：${detail.missing.join('、')}` : ''}`,
      );

      tightenShadow(finalSize);
      // 米格：一般 1 米一格；机器特别长（超过 14 米）时换成 2 米，免得格子太密
      buildGrid(Math.max(finalSize.x, finalSize.z) > 14 ? 2 : 1);
      // 动作演示引擎：没有可动关节的机器（分件模型）返回 null，按钮改为框零件
      state.motion = motionFactory
        ? motionFactory(model, gltf.animations || [], machine.model)
        : createMotion(model, assembled ? {...machine.model, rig:assembled.rig, motions:assembled.motions} : machine.model);
      state.procedural = assembled;
      // 把工作装置展开后的范围也纳入镜头，翻斗、举臂时不会被舞台裁切。
      if (assembled && state.motion) {
        const envelope = new THREE.Box3().setFromObject(modelRoot, true);
        for (const id of Object.keys(assembled.motions)) {
          state.motion.reset();
          state.motion.play(id, {loop:false});
          for (let frame = 0; frame <= 24; frame++) {
            state.motion.seek(frame/24);
            assembled.updateVisuals();
            modelRoot.updateMatrixWorld(true);
            envelope.union(new THREE.Box3().setFromObject(modelRoot, true));
          }
        }
        state.motion.reset();
        assembled.updateVisuals();
        const extent = envelope.getSize(new THREE.Vector3());
        const midpoint = envelope.getCenter(new THREE.Vector3());
        state.fits = {width:extent.x, height:extent.y, depth:extent.z, centerX:midpoint.x, centerY:midpoint.y, centerZ:midpoint.z};
      }
      state.motionActive = false;
      resize();
      applyLayout();
      state.motion?.reset();
      onStatus?.(null);
      onLegend?.(
        state.refReady
          ? `地面网格：每格 ${state.gridStepM} 米 · 右边的小人是团团，身高 1.2 米 · 点模型上的零件可以直接看名字`
          : `地面网格：每格 ${state.gridStepM} 米 · 点模型上的零件可以直接看名字`,
      );
    };
    if (machine.model.procedural) {
      try {
        assembled = createMachinery(machine.model.procedural);
        acceptModel({scene:assembled.group});
      } catch (error) {
        console.error('机械教具构建失败', error);
        onStatus?.('这台机械暂时无法显示，请刷新后重试。', true);
      }
      return;
    }
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(machine.model.url, acceptModel, (event) => {
      if (token !== loadToken || !event.total) return;
      onStatus?.(`正在载入${machine.name}的模型… ${Math.round((event.loaded / event.total) * 100)}%`);
    }, (error) => {
      if (token !== loadToken) return;
      console.error(`${machine.name} 的模型载入失败`, error);
      onStatus?.('这台机器的模型暂时没载入。刷新页面试试；如果还是不行，检查部署时有没有带上 frontend/assets/engineering/ 里的 glb 文件。', true);
    });
  }

  // ---------------------------------------------------------------- 循环
  let lastRenderedAt = 0;
  const movingPartBounds=new THREE.Box3(),singlePartBounds=new THREE.Box3();
  (function frame(now = 0) {
    scope.frame(frame);
    if (document.hidden) { state.clock.getDelta(); return; }
    if (window.FufuPerformance?.touch && now - lastRenderedAt < 1000 / 30) return;
    lastRenderedAt = now;
    // 先取时间差：页面被切走再切回来时，若把它攒着，动画会在回来的瞬间跳到结尾
    const delta = state.clock.getDelta();
    const w = host.clientWidth;
    const h = host.clientHeight;
    // 页面在别的标签页时 host 宽高为 0；等它显示出来再自动补一次尺寸。
    // 这样不依赖 ResizeObserver，也不会出现"切回来画布是空的"。
    if (!w || !h) return;
    if (w !== state.vw || h !== state.vh) resize();
    // 动作演示：推动关键帧引擎；一次性动作播完的瞬间把液压支撑杆放回来
    if (state.motion) {
      const isActive = state.motion.tick(delta);
      if (state.motionActive && !isActive) setStruts(true);
      state.motionActive = isActive;
      if (!isActive && !state.sequencePaused && state.sequence?.length) {
        const queue=state.sequence,id=queue.shift();
        const index=state.machine.steps.findIndex(step=>step[2]?.motion===id);
        playStep(state.machine,index);state.sequence=queue;
      }
    }
    state.procedural?.updateVisuals();

    // 高亮部件：自发光呼吸 + 描边跟随（节点动画会让部件动，矩阵得每帧同步）
    const focus = state.focus;
    if (focus) {
      if(focus.followMotion){
        movingPartBounds.makeEmpty();
        focus.entries.forEach(entry=>movingPartBounds.union(singlePartBounds.setFromObject(entry.node)));
        movingPartBounds.getCenter(focus.target);
        if(focus.label){scratchPoint.set(focus.target.x,movingPartBounds.max.y+.2,focus.target.z);modelRoot.worldToLocal(scratchPoint);focus.label.position.copy(scratchPoint);}
      }
      state.pulse += delta;
      const intensity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(state.pulse * 5));
      focus.entries.forEach((entry) => {
        entry.glow.forEach((material) => {
          if (material && material.emissive) material.emissiveIntensity = intensity;
        });
      });
      inverseRoot.copy(modelRoot.matrixWorld).invert();
      focus.outlinePairs.forEach((pair) => {
        pair.node.updateWorldMatrix(true, false);
        pair.line.matrix.copy(inverseRoot).multiply(pair.node.matrixWorld);
      });
      // 镜头推近（用户一动滚轮/拖动就退出，不再抢控制权）
      if (!focus.userTookOver) {
        state.target.lerp(focus.target, Math.min(1, delta * 2.6));
        state.distance += (focus.distance - state.distance) * Math.min(1, delta * 1.8);
      }
    }

    const horizontal = Math.cos(state.elevation) * state.distance;
    camera.position.set(
      state.target.x + Math.sin(state.azimuth) * horizontal,
      state.target.y + Math.sin(state.elevation) * state.distance,
      state.target.z + Math.cos(state.azimuth) * horizontal,
    );
    camera.lookAt(state.target);
    // Keep names readable without ballooning when the camera approaches a part.
    if (state.focus?.label) {
      const label = state.focus.label;
      const labelDistance = camera.position.distanceTo(label.getWorldPosition(scratchPoint));
      const worldHeight = 28 / h * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * labelDistance;
      label.scale.set(worldHeight * label.userData.labelAspect, worldHeight, 1);
    }
    renderer.render(scene, camera);
  })();

  return {
    canFocus(pattern) { return findPartMeshes(modelRoot,pattern,state.machine?.model?.nodeParts).length>0; },
    canPlay(id) { return Boolean(state.motion?.canPlay?.(id)); },
    get motionProgress() { return state.motion?.progress || 0; },
    get motionActive() { return Boolean(state.motionActive); },
    get motionStep() { return state.stepIndex ?? -1; },
    pause:scope.pause, resume:scope.resume, dispose:scope.dispose,
    load,
    focusPart,
    playStep,
    resize,
    zoom(factor) {
      if (!(factor > 0)) return;
      state.distance = THREE.MathUtils.clamp(state.distance * factor,state.minDistance,state.maxDistance);
      if(state.focus)state.focus.userTookOver=true;
    },
    clearHighlight,
    pauseMotion() { state.sequencePaused=true;state.motionActive=false; state.motion?.stop(); },
    resumeMotion() { state.sequencePaused=false;state.motionActive=Boolean(state.motion?.resume()); return state.motionActive; },
    seekMotion(fraction) { state.sequence=null;state.motionActive=false;const result=state.motion?.seek(fraction);state.procedural?.updateVisuals();return result; },
    resetMotion() { state.sequence = null; state.motionActive=false;state.stepIndex=-1;state.motion?.reset(); state.procedural?.updateVisuals(); },
    playSequence(machine) {
      const steps = machine.steps.map((step) => step[2]?.motion).filter(Boolean);
      if (!state.motion || !steps.length) return false;
      const id=steps.shift(),index=machine.steps.findIndex(step=>step[2]?.motion===id);
      const success=playStep(machine,index);state.sequence=steps;return success;
    },
    resetView() {
      // 撤销高亮 + 交还镜头；注视点交给 applyLayout 统一算（别在这里手算）
      clearHighlight();
      state.azimuth = HOME_AZIMUTH;
      state.elevation = HOME_ELEVATION;
      state.distance = state.homeDistance || state.distance;
      applyLayout();
    },
    setRefEnabled(enabled) {
      // Remember the choice while the reference model is still loading.
      state.refEnabled = Boolean(enabled);
      applyLayout();
    },
    get refEnabled() { return state.refEnabled; },
  };
}
