import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { createSceneScope, disposeGraph } from './scene-scope.js?v=20261003-lifecycle-1';
import { boxViewDistance } from './model-framing.js?v=20261005-observe-5';
window.FufuScenes.register('jurassic', saved => {
const scope=createSceneScope();

const host = document.querySelector('#dinoModelHost');
const fallback = document.querySelector('.dino-silhouette');
const resetButton = document.querySelector('#dinoModelReset');

// ---------------------------------------------------------------- 模型朝向
// 标准摆位用这个角度：模型"本地正面朝 +z"时，看到的是正面偏 46° 的斜侧脸。
const MODEL_YAW = -0.38;
// 但这 24 件模型来自 20 多位不同的 Sketchfab 作者（见 exploration-modules.js 的
// dinoModelCredits），**每件模型的"正面"朝哪由作者决定**，没法统一 ——
// 以前没有参照物看不出来，团团站到旁边之后才暴露。
//
// 这里按模型 id 补一个额外旋转（弧度）。团团的朝向不动（她的模型是标准的），
// 所以只要把动物缺的补上，两边就朝同一个方向了。
//   Math.PI        → 差半圈（正面朝 -z，最常见：看起来"背对镜头"）
//   Math.PI / 2    → 差 90°（正面朝 -x，看起来"侧着身子"）
//   -Math.PI / 2   → 差 -90°（正面朝 +x）
const MODEL_YAW_FIX = {
  // 用户 2026-09-30 点名："迷惑龙、重爪龙、双脊龙、结节龙、鱼龙类、沧龙 这几只朝向不一样"
  // 先按最常见的情况补半圈。若某一只是"侧着身子"而不是"背对"，把它的值改成 ±Math.PI / 2。
  apatosaurus: Math.PI,       // 迷惑龙
  baryonyx: Math.PI,          // 重爪龙
  dilophosaurus: Math.PI,     // 双脊龙
  sauropelta: Math.PI,        // 结节龙
  ichthyosaur: Math.PI,       // 鱼龙类
  mosasaurus: Math.PI,        // 沧龙
};
// 两件用户反馈显得过高的模型保留原比例，只在展示时整体收一点，减少视觉压迫。
const MODEL_DISPLAY_SCALE = { megalodon: 0.78, maiasaura: 0.82 };
function modelYawFor(modelId) {
  const fix = MODEL_YAW_FIX[modelId];
  return MODEL_YAW + (typeof fix === 'number' ? fix : 0);
}

if (host && fallback) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 160);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  scope.own(scene, renderer);
  renderer.setPixelRatio((window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '可拖动旋转、滚轮缩放的三维模型，可以叫 1.2 米高的团团的模型站到旁边比身高');
  renderer.domElement.style.touchAction = 'none';
  host.append(renderer.domElement);
  // 网格图例贴在预览框左下角，所以宿主元素得是定位上下文
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const hudStyle = document.createElement('style');
  hudStyle.textContent = '.dino-tuantuan-btn{padding:6px 13px;border-radius:999px;border:1px solid rgba(120,100,70,.35);background:#fff;color:#5b4a33;font:12px/1.3 system-ui,sans-serif;cursor:pointer;margin-left:8px;vertical-align:middle}.dino-tuantuan-btn[hidden]{display:none!important}.dino-tuantuan-btn.is-floating{position:absolute;left:10px;top:50%;transform:translateY(-50%);z-index:40;margin-left:0}.dino-tuantuan-btn:hover{border-color:rgba(120,100,70,.6);background:#fffdf6}.dino-tuantuan-btn:focus-visible{outline:2px solid #854f0b;outline-offset:2px}.dino-tuantuan-btn[aria-pressed="true"]{background:#faeeda;border-color:rgba(133,79,11,.5);color:#633806}';
  document.head.append(hudStyle);

  // 「叫团团来比身高」按钮。插到页面自己的「重置视角」按钮旁边并沿用它的 class ——
  // 位置跟着页面已有的控件区走，不用猜容器布局。
  const tuantuanButton = document.createElement('button');
  tuantuanButton.type = 'button';
  tuantuanButton.hidden = true;
  if (resetButton && resetButton.parentElement) {
    tuantuanButton.className = `${resetButton.className || ''} dino-tuantuan-btn`.trim();
    resetButton.insertAdjacentElement('afterend', tuantuanButton);
  } else {
    tuantuanButton.className = 'dino-tuantuan-btn is-floating';
    host.append(tuantuanButton);
  }
  // 兜底自检：万一上面那一步把按钮放到了跟预览框无关的地方，就收回来放框内左侧中部
  let buttonPlacementChecked = false;
  function verifyButtonPlacement() {
    if (buttonPlacementChecked || tuantuanButton.hidden) return;
    buttonPlacementChecked = true;
    scope.frame(() => {
      const bar = tuantuanButton.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      const visible = bar.width > 1 && bar.height > 1;
      const nearFrame = visible && bar.bottom > frame.top - 260 && bar.top < frame.bottom + 260;
      if (nearFrame) return;
      tuantuanButton.className = 'dino-tuantuan-btn is-floating';
      host.append(tuantuanButton);
    });
  }

  const gridLegend = document.createElement('div');
  gridLegend.hidden = true;
  gridLegend.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:2;max-width:72%;padding:5px 11px;border-radius:12px;background:rgba(255,255,255,.85);color:#5b4a33;font:11px/1.65 system-ui,sans-serif;pointer-events:none';
  host.append(gridLegend);

  scene.add(new THREE.HemisphereLight(0xe8f5d9, 0x334637, 2.0));
  const key = new THREE.DirectionalLight(0xffe9c4, 3.1);
  key.position.set(-4, 8, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  // 阴影范围要盖住"动物 + 旁边站着的人"，不然团团脚下没有影子会像贴在屏幕上
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 11;
  key.shadow.camera.bottom = -6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d9ff, 1.05);
  fill.position.set(6, 4, -6);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  floor.receiveShadow = true;
  scene.add(floor);

  const loading = document.createElement('div');
  scope.cleanup(()=>{hudStyle.remove();tuantuanButton.remove();gridLegend.remove();loading.remove();});
  loading.className = 'dino-model-loading';
  loading.setAttribute('role', 'status');
  loading.hidden = true;
  host.append(loading);
  const gltfLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const modelRoot = new THREE.Group();
  scene.add(modelRoot);
  const clock = scope.clock(new THREE.Clock());
  let mixer = null;
  let idleAction=null;
  const animationTools=document.createElement('div');animationTools.className='dino-animation-tools';
  const idleButton=document.createElement('button');idleButton.type='button';idleButton.textContent='播放待机动作';idleButton.disabled=true;
  const idlePause=document.createElement('button');idlePause.type='button';idlePause.textContent='暂停';idlePause.disabled=true;
  animationTools.append(idleButton,idlePause);host.parentElement.append(animationTools);
  scope.listen(idleButton,'click',()=>{if(!idleAction)return;idleAction.reset().play();idleAction.paused=false;idlePause.disabled=false;idlePause.textContent='暂停';});
  scope.listen(idlePause,'click',()=>{if(!idleAction)return;idleAction.paused=!idleAction.paused;idlePause.textContent=idleAction.paused?'继续':'暂停';});
  scope.cleanup(()=>animationTools.remove());
  let modelReady = false;
  let activeId = null;
  let requestId = 0;
  let azimuth = 0.42;
  let elevation = 0.12;
  // 相机距离按"当前这只动物（加上团团）"的实际尺寸算出来，不再是固定值
  let distance = 7.5;
  let homeDistance = 7.5;
  let minDistance = 4.6;
  let maxDistance = 14;
  let fittedSize = null;
  let target = new THREE.Vector3(0.62, 1.2, 0);
  let drag = null;
  let groundGrid = null;
  let currentStepMeters = null;
  let currentLengthM = null;
  let breathe = 0;
  let distanceTarget = null;        // 叫/收团团的瞬间让镜头平滑推拉，而不是硬跳

  // --------------------------------------------------------- 比例参照：团团 1.2 米
  // 数字再准，孩子也难有体感（"体长 9 米"到底是什么概念？）。所以把首页那位黏土
  // 探险家按同一把尺子放进场景：她身上就写着"1.2 米"这个刻度，往模型旁边一站，
  // 谁大谁小一眼就看出来。
  // 用的是和首页、动物园完全同一个 /clay-safari/models/explorer.glb，不是另捏的小人。
  // 默认不出现，预览框旁边的按钮点了才来。
  const TUANTUAN_HEIGHT_M = 1.2;
  const scaleRef = new THREE.Group();
  scaleRef.visible = false;
  scene.add(scaleRef);
  let tuantuanLoaded = false;
  let tuantuanShown = false;        // 用户点了"叫团团来"
  let revealProgress = 0;           // 出场动画：0 = 还在画面外，1 = 站好了

  // 场景里的唯一一把尺子：归一化之后，最长的那个方向（6.2 个场景单位）
  // 就等于卡片上写的那个体长——所以"每米有多少单位"是能算出来的。
  function unitsPerMeter() {
    return currentLengthM ? 6.2 / currentLengthM : null;
  }
  // 把团团缩到 1.2 米、摆到模型右侧。位置每帧由 animate 接管（要做出场动画）。
  function layoutScaleRef() {
    const source = scaleRef.userData;
    const perMeter = unitsPerMeter();
    if (!fittedSize || !source.pivot || !perMeter) {
      scaleRef.visible = false;
      source.footprint = null;
      return false;
    }
    const targetHeight = TUANTUAN_HEIGHT_M * perMeter;
    source.pivot.scale.setScalar(targetHeight / source.height);
    // 团团的模型是标准的（本地正面 +z），所以她的角度**固定**用 MODEL_YAW；
    // 动物那边缺多少由 MODEL_YAW_FIX 补上，补完两边就朝同一个方向了。
    source.pivot.rotation.y = MODEL_YAW;
    const halfWidth = source.width * (targetHeight / source.height) * 0.5;
    const gap = Math.max(0.16, fittedSize.width * 0.035);
    const centerX = 0.62 + fittedSize.width * 0.5 + gap + halfWidth;
    source.footprint = { centerX, halfWidth, height: targetHeight };
    scaleRef.visible = tuantuanShown || revealProgress > 0.02;
    return true;
  }
  function updateTuantuanButton() {
    const usable = tuantuanLoaded && Boolean(currentLengthM) && Boolean(fittedSize);
    tuantuanButton.hidden = !usable;
    tuantuanButton.textContent = tuantuanShown ? '收起团团' : '叫团团来比身高';
    tuantuanButton.setAttribute('aria-pressed', tuantuanShown ? 'true' : 'false');
    tuantuanButton.setAttribute('aria-label', tuantuanShown ? '把团团的模型收起来' : '叫 1.2 米高的团团的模型站到模型旁边比身高');
    if (!usable) return;
    verifyButtonPlacement();
  }
  function toggleTuantuan() {
    if (!tuantuanLoaded || !currentLengthM || !fittedSize) return;
    tuantuanShown = !tuantuanShown;
    if (tuantuanShown) scaleRef.visible = true;
    updateTuantuanButton();
    // 画面要跟着变宽/变窄（多了一个人），让镜头平滑地推过去而不是硬跳
    const keep = distance;
    layoutScaleRef();
    frameModel(fittedSize.width, fittedSize.height, fittedSize.depth);
    distance = THREE.MathUtils.clamp(keep, minDistance, maxDistance);
    distanceTarget = homeDistance;
    updateLegend();
  }
  scope.listen(tuantuanButton, 'click', toggleTuantuan);

  // ⚠️ 这个 query 必须和首页 pet3d.js、动物园 clay.js、工程 engineering-viewer.js 保持一致：
  // 同一份 4.7MB 的 explorer.glb，只要 query 不同浏览器就当三个文件各下一遍。
  gltfLoader().load('/clay-safari/models/explorer.glb?v=20260930-tuantuan-3', (gltf) => {
      if(scope.disposed){disposeGraph(gltf.scene);return;}
    const person = gltf.scene;
    person.traverse((item) => { if (item.isMesh) { item.castShadow = true; item.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(person);
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0.001) return;
    // 脚底落到 y=0、身体水平居中：之后只改 pivot 的 scale 就能让她"长高"，不用重算位置
    person.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const pivot = new THREE.Group();
    pivot.add(person);
    scaleRef.add(pivot);
    scaleRef.userData.pivot = pivot;
    scaleRef.userData.height = size.y;
    scaleRef.userData.width = Math.max(size.x, size.z * 0.6, 0.001);
    tuantuanLoaded = true;
    if (fittedSize) {
      const keep = distance;
      layoutScaleRef();
      frameModel(fittedSize.width, fittedSize.height, fittedSize.depth);
      distance = THREE.MathUtils.clamp(keep, minDistance, maxDistance);
      placeCamera();
    }
    updateTuantuanButton();
  }, undefined, (error) => console.warn('团团的模型载入失败，本次不显示大小参照', error));

  // ---------------------------------------------------------------- 地面米格
  // 信息面板里那条"尺"给出数字，脚下这片格子给出体感：数一数它占了几格就知道多大。
  // 格子边长按体型自动选（小动物 0.1 米一格，大恐龙 2 米一格），图例写在左下角。
  const GRID_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
  const GRID_CELLS = 24;
  function pickGridStep(realLengthM) {
    const ideal = realLengthM / 9;
    let step = GRID_STEPS[0];
    for (const value of GRID_STEPS) { step = value; if (value >= ideal) break; }
    return step;
  }
  // 从信息面板里那张"它有多大"卡片读真实体长——两边共用同一份数据，不重复维护。
  // 只在切换物种时读一次并缓存，之后各处的"米"都从这一个数字算，不会互相漂移。
  function readSpeciesLength() {
    const card = document.querySelector('.dino-size');
    if (!card) return null;
    // 模型不是成体时（例如猛犸象那件幼崽模型）卡片上会有一条提示：这种模型和卡片上的
    // 成年体长对不上，按它算出来的"米"是错的，所以干脆不画网格、也不放团团，免得误导
    if (card.querySelector('.dino-size-note')) return null;
    const first = card.querySelector('.dino-size-metrics span');
    const match = first && /([\d.]+)\s*米/.exec(first.textContent || '');
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  function updateLegend() {
    if (!currentStepMeters) { gridLegend.hidden = true; return; }
    gridLegend.textContent = (tuantuanLoaded && tuantuanShown)
      ? `地面网格：每格 ${currentStepMeters} 米　·　右侧的小人是团团，身高 1.2 米`
      : `地面网格：每格 ${currentStepMeters} 米`;
    gridLegend.hidden = false;
  }
  function clearGroundGrid() {
    if (groundGrid) {
      scene.remove(groundGrid);
      groundGrid.geometry.dispose();
      groundGrid.material.dispose();
      groundGrid = null;
    }
    currentStepMeters = null;
    gridLegend.hidden = true;
  }
  function buildGroundGrid() {
    clearGroundGrid();
    const perMeter = unitsPerMeter();
    if (!currentLengthM || !perMeter) return;
    const stepMeters = pickGridStep(currentLengthM);
    const stepUnits = stepMeters * perMeter;
    if (!Number.isFinite(stepUnits) || stepUnits <= 0.001) return;
    groundGrid = new THREE.GridHelper(stepUnits * GRID_CELLS, GRID_CELLS, 0x8fae97, 0xc2d5c6);
    groundGrid.material.transparent = true;
    groundGrid.material.opacity = 0.55;
    // 网格跟着"动物 + 团团"这个整体居中，不然团团会站在网格外面
    groundGrid.position.set(target.x, -0.02, 0);
    scene.add(groundGrid);
    currentStepMeters = stepMeters;
    updateLegend();
  }

  function placeCamera() {
    const horizontal = Math.cos(elevation) * distance;
    camera.position.set(target.x + Math.sin(azimuth) * horizontal, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * horizontal);
    camera.lookAt(target);
  }
  // 按模型归一化之后的尺寸（world 单位）确定：看哪儿、站多远
  // 关键点一：相机视线要落在**模型的竖直中心**上。以前固定看 y=1.2，
  // 于是高高的慈母龙只剩腿在画面中央（看着"太靠上"），又扁又长的巨齿鲨也对不齐。
  // 关键点二：团团在场时，取景要把她一起框进来，否则参照物被裁在画面外就白放了。
  function frameModel(width, height, depth) {
    fittedSize = { width, height, depth };
    const ref = tuantuanShown ? scaleRef.userData.footprint : null;
    const leftX = 0.62 - width * 0.5;
    const rightX = Math.max(0.62 + width * 0.5, ref ? ref.centerX + ref.halfWidth : -Infinity);
    const spanX = Math.max(1.1, rightX - leftX);
    const spanY = Math.max(1.1, height, ref ? ref.height : 0);
    const halfH = spanY * 0.5;
    const halfW = spanX * 0.5;
    const halfD = Math.max(0.55, depth * 0.5);
    const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0.05 ? camera.aspect : 1;
    homeDistance = THREE.MathUtils.clamp(boxViewDistance(spanX,spanY,halfD*2,camera.fov,aspect,azimuth,elevation,1.14),3.5,50);
    minDistance = Math.max(2.4, homeDistance * 0.5);
    maxDistance = homeDistance * 2.2;
    target.set((leftX + rightX) * 0.5, halfH, 0);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    if (!fittedSize) return;
    const keep = distance;
    distanceTarget = null;
    layoutScaleRef();
    frameModel(fittedSize.width, fittedSize.height, fittedSize.depth);
    distance = THREE.MathUtils.clamp(keep, minDistance, maxDistance);
    placeCamera();
  }
  function disposeCurrentModel() {
    if (mixer) mixer.stopAllAction();
    mixer = null;
    idleAction=null;idleButton.disabled=true;idlePause.disabled=true;idlePause.textContent='暂停';
    modelRoot.traverse((item) => {
      if (item.isMesh) {
        item.geometry?.dispose();
        for (const material of (Array.isArray(item.material) ? item.material : [item.material])) {
          if (!material) continue;
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose();
        }
      }
    });
    modelRoot.clear();
    modelReady = false;
    fittedSize = null;
    currentLengthM = null;
    // 团团挂在 scaleRef 上（不随模型销毁），换模型期间先藏起来
    scaleRef.visible = false;
    scaleRef.userData.footprint = null;
    clearGroundGrid();
    updateTuantuanButton();
  }
  function resetView() {
    azimuth = 0.42;
    elevation = 0.12;
    distanceTarget = null;
    layoutScaleRef();
    if (fittedSize) frameModel(fittedSize.width, fittedSize.height, fittedSize.depth);
    distance = homeDistance;
    placeCamera();
  }
  function setActive(modelId) {
    const request = ++requestId;
    activeId = modelId || null;
    const active = Boolean(activeId);
    host.hidden = !active;
    // Keep the silhouette visible until the GLB has finished parsing. Large models can
    // report 100% download progress while mesh/texture decoding is still in progress.
    fallback.toggleAttribute('hidden', active && modelReady);
    fallback.classList.toggle('is-model-ready', active && modelReady);
    if (resetButton) resetButton.hidden = !active;
    if (!active) {
      loading.hidden = true;
      disposeCurrentModel();
      return;
    }
    resize();
    if (modelReady && modelRoot.userData.modelId === activeId) return;
    disposeCurrentModel();
    const dinosaurName = document.querySelector('#dinoTitle')?.textContent || '恐龙';
    loading.textContent = `正在载入${dinosaurName}模型…`;
    loading.classList.remove('is-error');
    loading.hidden = false;
    const id = activeId;
    if (!host.getClientRects().length) {
      loading.hidden = true;
      return;
    }
    gltfLoader().load(`/assets/jurassic/${encodeURIComponent(id)}.glb?v=20260930-tuantuan-scale-8`, (gltf) => {
      if(scope.disposed){disposeGraph(gltf.scene);return;}
      if (request !== requestId || !host.isConnected) {
        gltf.scene.traverse((item) => {
          item.geometry?.dispose?.();
          const materials = Array.isArray(item.material) ? item.material : [item.material];
          materials.forEach((material) => {
            if (!material) return;
            for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
            material.dispose();
          });
        });
        return;
      }
      const model = gltf.scene;
      model.traverse((item) => { if (item.isMesh) { item.castShadow = true; item.receiveShadow = true; } });
      // 先把动画走上极少的一帧，再量尺寸：
      // 有些模型"静止姿势"和"动画第一帧"差得很远（骨头在动画里被抬高），
      // 用静止姿势量出来的包围盒会让模型悬在半空。
      mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
      if (mixer) {
        idleAction=mixer.clipAction(gltf.animations[0]);idleAction.setLoop(THREE.LoopOnce,1);idleAction.clampWhenFinished=true;
        idleAction.play();mixer.update(0.001);idleAction.paused=true;idleButton.disabled=false;
        mixer.addEventListener('finished',()=>{idlePause.disabled=true;idlePause.textContent='暂停';});
      }
      const yaw = modelYawFor(id);
      model.updateMatrixWorld(true);
      const rawBounds = new THREE.Box3().setFromObject(model);
      const rawSize = rawBounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
      const scale = (6.2 / maxDimension) * (MODEL_DISPLAY_SCALE[id] || 1);
      model.scale.setScalar(scale);
      model.rotation.y = yaw;
      // 关键：**先转再量**。位置要按"转好之后"的包围盒算，否则 yaw 不是 0 的模型
      // （比如补了半圈的那几只）会被推出画面 —— 因为水平居中的偏移量是在未旋转的
      // 坐标系里算的，一转眼就错位了。
      model.updateMatrixWorld(true);
      const placedBounds = new THREE.Box3().setFromObject(model);
      const placedCenter = placedBounds.getCenter(new THREE.Vector3());
      model.position.x += 0.62 - placedCenter.x;
      model.position.z += -placedCenter.z;
      model.position.y += -placedBounds.min.y;      // 脚底贴地，影子和模型才对得上
      modelRoot.add(model);
      modelRoot.userData.modelId = id;
      modelReady = true;
      const placedSize = placedBounds.getSize(new THREE.Vector3());
      fittedSize = { width: placedSize.x, height: placedSize.y, depth: placedSize.z };
      // 体长在这里读一次并缓存，网格和团团都从这一个数字算
      currentLengthM = readSpeciesLength();
      // 诊断：把这件模型的水平长轴打到控制台（只打日志、不改画面）。
      // 长轴 z 通常是"身体朝 ±z"的标准模型；长轴 x 往往是"侧着导出"的，
      // 那种情况下补 ±Math.PI / 2 才对。
      console.info(`[恐龙模型] ${id}｜外形 x=${rawSize.x.toFixed(2)} y=${rawSize.y.toFixed(2)} z=${rawSize.z.toFixed(2)}` +
        `｜水平长轴 ${rawSize.x >= rawSize.z ? 'x' : 'z'}｜朝向修正 ${((yaw - MODEL_YAW) * 180 / Math.PI).toFixed(0)}°`);
      // 顺序要紧：先量出团团该多大、站哪儿，再据此取景，最后才重置视角
      layoutScaleRef();
      frameModel(fittedSize.width, fittedSize.height, fittedSize.depth);
      buildGroundGrid();
      resetView();
      updateTuantuanButton();
      fallback.hidden = true;
      fallback.classList.add('is-model-ready');
      loading.hidden = true;
    }, (event) => {
      if (request === requestId && event.total) loading.textContent = `正在载入${dinosaurName}模型… ${Math.round(event.loaded / event.total * 100)}%`;
    }, (error) => {
      if (request !== requestId) return;
      console.error(`${dinosaurName}模型载入失败`, error);
      loading.textContent = '模型暂时无法载入，请刷新页面重试。';
      loading.classList.add('is-error');
    });
  }
  window.setDinoModelActive = setActive;
  scope.hooks(['setDinoModelActive']);
  scope.cleanup(()=>{requestId++;mixer?.stopAllAction();});
  const modelObserver = new scope.IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting) || !activeId || modelReady) return;
    setActive(activeId);
  }, { rootMargin: '120px' });
  modelObserver.observe(host);
  const initialName = document.querySelector('#dinoTitle')?.textContent;
  const initialModelId = [...document.querySelectorAll('#dinoPicks button')]
    .find((button) => button.dataset.dinoName === initialName)?.dataset.dinoModel;
  if (initialModelId) setActive(initialModelId);

  scope.listen(renderer.domElement, 'pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); });
  scope.listen(renderer.domElement, 'pointermove', (event) => {
    if (!drag) return;
    azimuth -= (event.clientX - drag.x) * 0.007;
    elevation = THREE.MathUtils.clamp(elevation + (event.clientY - drag.y) * 0.005, -0.12, 0.72);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  scope.listen(renderer.domElement, 'pointerup', () => { drag = null; });
  scope.listen(renderer.domElement, 'pointercancel', () => { drag = null; });
  scope.listen(renderer.domElement, 'wheel', (event) => {
    event.preventDefault();
    distanceTarget = null;                      // 用户自己缩放时，就别再自动推拉了
    distance = THREE.MathUtils.clamp(distance * (event.deltaY > 0 ? 1.08 : 0.92), minDistance, maxDistance);
  }, { passive: false });
  scope.listen(resetButton, 'click', resetView);
  new scope.ResizeObserver(resize).observe(host);
  scope.listen(window, 'resize', resize);
  let lastRenderedAt = 0;
  function animate(now = 0) {
    scope.frame(animate);
    if (document.hidden) { clock.getDelta(); return; }
    if (window.FufuPerformance?.touch && now - lastRenderedAt < 1000 / 30) return;
    lastRenderedAt = now;
    if (!host.clientWidth || !host.clientHeight) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    if (distanceTarget !== null) {
      distance += (distanceTarget - distance) * Math.min(1, delta * 4);
      if (Math.abs(distanceTarget - distance) < 0.01) { distance = distanceTarget; distanceTarget = null; }
    }
    placeCamera();
    if (modelReady && mixer) mixer.update(delta);
    if (tuantuanLoaded) {
      const pivot = scaleRef.userData.pivot;
      const spot = scaleRef.userData.footprint;
      if (pivot && spot) {
        const goal = tuantuanShown ? 1 : 0;
        revealProgress += (goal - revealProgress) * Math.min(1, delta * 8);
        if (Math.abs(goal - revealProgress) < 0.002) revealProgress = goal;
        breathe += delta;
        // 出场从画面右侧横向走进来（地面是平的，横着走最自然），收起就原路走回去。
        // 要走出的距离是她半身宽的三倍多，足够离开画面。
        pivot.position.set(
          spot.centerX + (1 - revealProgress) * (spot.halfWidth * 3 + 0.3),
          Math.sin(breathe * 1.6) * spot.height * 0.005
        );
        if (!goal && revealProgress <= 0.002) scaleRef.visible = false;
      }
    }
    renderer.render(scene, camera);
  }
  animate();
}

return scope;
});
