import * as THREE from 'three';
import { ITEMS, ROUTE, RIVER } from './data.js';
import { loadModel, bakeModel } from './clay.js?v=20260930-tuantuan-4';
import { hasProcedural, buildProcedural } from './procedural.js';
import { hasZone, buildZone } from './zones.js';
import { setExplorerAccessories } from './accessories.js?v=20260930-tuantuan-3';
import { buildWorld, terrainHeight } from './world.js?v=20261003-paddy-1';
import { Creature } from './animals.js?v=20260929-find-order-2';
import { Player } from './player.js?v=20261006-companion-2';
import { Effects } from './effects.js?v=20261006-farm-feedback-1';
import { UI } from './ui.js?v=20260930-clay-world-1';
import { Tour } from './tour.js';
import { updateTweens, tween } from './tween.js';
import * as audio from './audio.js?v=20260930-audio-suspend-1';
import {Farm} from './farm.js?v=20261006-farm-feedback-1';
import {PointerGesture} from './pointer-gesture.js?v=20261005-farm-touch-3';
import {makeGardenFrame} from './farm-models.js?v=20261003-3';

// 说明：不再使用 EffectComposer 泛光（本地 vendor 没有 postprocessing 模块），
// 直接 renderer.render 出图，画面差异很小。
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 800;
const canvas = document.getElementById('c');
const embedded = window.parent !== window;
if (embedded && new URLSearchParams(location.search).get('view') !== 'card') document.body.classList.add('compact');
const findDemoRequested = new URLSearchParams(location.search).get('find-demo') === '1'
  && ['localhost', '127.0.0.1'].includes(location.hostname);

// 没有 glb 的物品用程序化黏土几何体现场捏（动物/道具在 procedural.js，地图场景在 zones.js）
function createModel(id) {
  if (id === 'garden') return Promise.resolve(bakeModel(makeGardenFrame()));
  if (hasZone(id)) return Promise.resolve(bakeModel(buildZone(id)));
  if (hasProcedural(id)) return Promise.resolve(bakeModel(buildProcedural(id)));
  return loadModel(id);
}

// 首页商店兑换后，把解锁 id 推过来。场景还没建好时先入队，建好之后任何时刻都能当场生效。
let zooReady = false;
let sceneActive = true;
const unlockQueue = [];
async function flushUnlocks() {
  if (!zooReady) return;
  for (const id of unlockQueue.splice(0)) {
    unlockedIds.add(id); actualUnlockedIds.add(id);
    await addItem(id);
    ui.addUnlockedItem(id);
  }
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  const data = event.data || {};
  if (data.type === 'fufu-zoo-view') {
    document.body.classList.toggle('compact', !data.expanded);
    dispatchEvent(new Event('resize'));
  }
  if (data.type === 'fufu-companion-accessory') {
    sharedEquipment = data.equipment && typeof data.equipment === 'object' ? data.equipment : {};
    if (explorerModel) setExplorerAccessories(explorerModel, sharedEquipment);
  }
  if (data.type === 'fufu-zoo-unlock') {
    const ids = Array.isArray(data.ids) ? data.ids : [data.id];
    for (const id of ids.filter(Boolean)) unlockQueue.push(id);
    flushUnlocks();
  }
  // 父页面切走 / 切回时，把整个音频输出挂起或恢复
  if (data.type === 'fufu-audio-suspend') { sceneActive = false; audio.suspendAudio(); }
  if (data.type === 'fufu-audio-resume') { sceneActive = true; audio.resumeAudio(); }
});
// 同源父页面也可以直接调（postMessage 之外的保险）
window.FufuClayAudio = { suspend: audio.suspendAudio, resume: audio.resumeAudio };

let sharedEquipment = {};
let explorerModel = null;
let unlockedIds = new Set();          // 全部已解锁的对象（动物、道具、场景）
let unlockedAnimalIds = new Set();    // 其中的动物，只用于探险手册
let zooLoadError = false;
let actualUnlockedIds = new Set();

try {
  const response = await fetch('/api/zoo', { cache: 'no-store' });
  if (!response.ok) throw new Error(`动物园接口 ${response.status}`);
  const inventory = await response.json();
  unlockedIds = new Set(inventory.filter(entry => entry.owned).map(entry => entry.zoo_animal_id));
} catch (error) {
  zooLoadError = true;
  console.warn('读取动物园解锁状态失败', error);
}
actualUnlockedIds = new Set(unlockedIds);
if (findDemoRequested && !zooLoadError) {
  const addCount = Math.max(0, 5 - unlockedIds.size);
  const demoIds = ITEMS.filter(item => item.kind === 'animal' && !unlockedIds.has(item.id))
    .slice(0, addCount).map(item => item.id);
  demoIds.forEach(id => unlockedIds.add(id));
  const note = document.getElementById('find-demo-note');
  note.textContent = demoIds.length
    ? `🧪 本地试玩：临时展示 ${demoIds.length} 只动物，不写入库存或扣积分`
    : '🧪 本地试玩：每轮随机找 5 个解锁元素，不改库存或扣积分';
  note.hidden = false;
}
for (const item of ITEMS) if (item.kind === 'animal' && unlockedIds.has(item.id)) unlockedAnimalIds.add(item.id);
try {
  const response = await fetch('/api/pet', { cache: 'no-store' });
  if (response.ok) sharedEquipment = (await response.json()).equipment || {};
} catch (error) {
  console.warn('读取伙伴装扮失败', error);
}

// 地图上的物品**全部**要解锁：`ITEMS` 里每条都带 lock: true。
// 地形（森林、沙地、小河、花海、稻田、水池、马路）是写死在 world.js 里的，永远都在。
const activeItems = ITEMS.filter(item => !item.lock || unlockedIds.has(item.id));
const ui = new UI(unlockedAnimalIds, actualUnlockedIds);
document.getElementById('btn-help').onclick = () => ui.showGuide();
document.getElementById('guide-close').onclick = () => { document.getElementById('guide').hidden = true; };
document.getElementById('guide-help').onclick = () => {
  document.getElementById('guide').hidden = true;
  document.getElementById('help').hidden = false;
};

// ------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdff3ff);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 900);
Creature.camera = camera;

function fitCamera() {
  camera.aspect = (innerWidth || 1280) / (innerHeight || 720);   // hidden/zero-size viewports must not yield NaN
  camera.fov = camera.aspect < 1 ? 64 : camera.aspect < 1.4 ? 54 : 46;   // portrait phones need a wider view
  camera.updateProjectionMatrix();
}
fitCamera();
addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------ build
ui.progress(0.05, '正在铺黏土草地…');
// 只把"当前在场"的对象交给世界构建：没解锁的东西不该留下看不见的碰撞圈。
// （植被散布在 world.js 内部仍按全量 ITEMS 避让，所以以后解锁的对象不会和树重叠。）
const world = buildWorld(scene, { isMobile, activeIds: new Set(activeItems.map(item => item.id)) });
ui.progress(0.2, '正在捏小动物…');

const creatures = {};
let clickables = [];
let player, effects, tour;

const totalModels = activeItems.length + 1;
const models = {};
let loaded = 0;
await Promise.all(activeItems.map(async (item) => {
  try {
    models[item.id] = await createModel(item.id);
  } catch (error) {
    models[item.id] = null;
    console.warn(`黏土模型载入失败：${item.id}`, error);
  }
  loaded++;
  ui.progress(0.2 + 0.7 * loaded / totalModels, `正在捏 ${loaded}/${totalModels} 个黏土朋友…`);
}));

effects = new Effects(scene, camera);
const creatureEvents = () => ({
  ripple: (position, size) => effects.ripple(position, size, 0.35),
  splash: (position, size) => { effects.splash(position, size); audio.sfx.splash(); },
  flash: () => effects.flash(),
});
activeItems.forEach((def, index) => {
  const model = models[def.id];
  if (!model) return;
  const creature = new Creature(def, model, world, index);
  creature.events = creatureEvents();
  scene.add(creature.group);
  creatures[def.id] = creature;
  clickables.push(...creature.meshes);
});

// explorer
try {
  explorerModel = await loadModel('explorer');
} catch (error) {
  console.warn('团团模型载入失败', error);
}
if (!explorerModel) {
  ui.progress(1, '团团没有加载成功，刷新页面再试试');
  throw new Error('clay-safari: explorer model failed to load');
}
player = new Player(explorerModel, world, camera, canvas);
setExplorerAccessories(explorerModel, sharedEquipment);
scene.add(player.group);

// 机器人向导已按需求移除（它跟着走会挡住画面），导览改用右下角的 🤖 按钮
tour = new Tour({ player, creatures, discover, ui, robot: null });
ui.progress(1, '黏土捏好啦！');

// --------------------------------------------------- 运行时解锁（首页商店兑换后）
const pendingAdds = new Set();
// 新出现的对象要补上碰撞圈，但如果你正好站在它那儿，就先等着——
// 等你走开一点再封路，免得把自己困在里头。
const pendingObstacles = [];
function applyPendingObstacles() {
  for (let i = pendingObstacles.length - 1; i >= 0; i--) {
    const o = pendingObstacles[i];
    const dx = player.pos.x - o.x, dz = player.pos.z - o.z;
    if (dx * dx + dz * dz > (o.r + 1.0) ** 2) { world.addObstacle(o.x, o.z, o.r); pendingObstacles.splice(i, 1); }
  }
}
async function addItem(id) {
  if (creatures[id] || pendingAdds.has(id)) return;
  const def = ITEMS.find(item => item.id === id);
  if (!def || !def.lock) return;
  pendingAdds.add(id);
  let model;
  try {
    model = await createModel(id);
  } catch (error) {
    console.warn(`新对象 ${id} 的模型载入失败`, error);
    return;
  } finally {
    pendingAdds.delete(id);
  }
  const creature = new Creature(def, model, world, ITEMS.indexOf(def));
  creature.events = creatureEvents();
  scene.add(creature.group);
  creatures[id] = creature;
  clickables.push(...creature.meshes);
  unlockedIds.add(id);
  if (def.r > 0) pendingObstacles.push({ x: def.pos[0], z: def.pos[1], r: def.r + 0.35 });
  if (def.kind === 'animal') { unlockedAnimalIds.add(id); ui.addSticker(id); }
  if (!ROUTE.includes(id)) ROUTE.push(id);
  ui.toast(def.kind === 'animal' ? `✨ ${def.cn} 已经住进动物园啦，去找它玩吧！` : `🎉 ${def.cn} 已经解锁，去看看吧！`, 3600);
  effects.sparkle(creature.group.position, 0xffe066, 30, Math.max(1, def.scale));
}
zooReady = true;
await flushUnlocks();

// ------------------------------------------------------------ discover flow
let speakToken = 0;
async function discover(creature) {
  const item = creature.def;
  audio.sfx.pop();
  creature.react();
  creature.pulse(9);            // 名字牌亮 9 秒，让小朋友看清"这是什么"
  effects.sparkle(creature.group.position, 0xffe066, 24, Math.max(1, item.scale));
  ui.showCard(item, {
    en: () => sayChain(creature, ['en']), cn: () => sayChain(creature, ['cn']), sound: () => sayChain(creature, ['sound']),
  });
  if (item.id === 'garden') { farm.open('garden'); return; }
  if (item.kind === 'animal' && ui.markFound(item.id)) {
    effects.hearts(creature.group.position);
    audio.sfx.sparkle();
    ui.toast(`✨ 发现新朋友：${item.cn} · ${item.en}`, 2600);
    if (ui.allFound()) {
      setTimeout(() => { effects.confetti(player.group.position, 240); audio.sfx.fanfare(); ui.celebrate(); audio.speak('Congratulations! You found all the animals!', 'en-US'); }, 1200);
    }
  }
  await sayChain(creature, ['en', 'sound', 'cn']);
}
async function sayChain(creature, steps) {
  const token = ++speakToken;
  const item = creature.def;
  for (const step of steps) {
    if (token !== speakToken) break;
    if (step === 'en') { ui.setSpeaking('say-en'); await audio.speak(item.en, 'en-US'); }
    else if (step === 'cn') { ui.setSpeaking('say-cn'); await audio.speak(item.cn, 'zh-CN', { rate: 0.8, pitch: 1.1 }); }
    else if (step === 'sound') { ui.setSpeaking('say-sound'); if (!creature.reacting) creature.react(); await audio.animalSound(item.id); }
  }
  if (token === speakToken) ui.setSpeaking(null);
}

// ------------------------------------------------------------ input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const gesture = new PointerGesture();
const projected = new THREE.Vector3();
let lastHover = null, hoverThrottle = 0;
let cameraTouched = false;      // 用户自己转过/缩放过相机之后，就不再自动调整机位
// 点到"差不多位置"就算选中：小道具用射线很难点，这里按屏幕距离再兜一层
const pickRadius = () => (isMobile ? 66 : 46);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.renderOrder = 4; scene.add(marker);

function setNDC(e) { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }
function pickCreature(e) {
  setNDC(e);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(clickables, false);
  if (hits.length) return hits[0].object.userData.creature;
  // 射线没打到东西 → 找屏幕上离手指/鼠标最近的那个朋友
  const radius = pickRadius();
  let best = null, bestD = radius * radius;
  for (const id in creatures) {
    const c = creatures[id];
    projected.set(c.group.position.x, c.group.position.y + Math.max(0.6, c.height * 0.6), c.group.position.z).project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const sx = (projected.x * 0.5 + 0.5) * innerWidth, sy = (-projected.y * 0.5 + 0.5) * innerHeight;
    const d = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
function pickGround() { ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects([world.terrain, world.water, world.pool], false); return hits.length ? hits[0].point : null; }

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  gesture.down(e);
});
canvas.addEventListener('pointermove', (e) => {
  const movement = gesture.move(e);
  if (movement) {
    if (movement.orbit) {cameraTouched=true;canvas.classList.add('dragging');player.orbit(movement.orbit.dx,movement.orbit.dy);}
    if (movement.zoom) {cameraTouched=true;player.zoom(movement.zoom);}
    return;
  }
  // hover (mouse only)
  if (isMobile) return;
  const now = performance.now(); if (now - hoverThrottle < 40) return; hoverThrottle = now;
  const creature = pickCreature(e);
  if (creature !== lastHover) {
    lastHover && lastHover.setHover(false);
    lastHover = creature;
    creature && creature.setHover(true);
    canvas.classList.toggle('can-pick', !!creature);
  }
});
function endPointer(e, cancelled=false) {
  const tapped=gesture.end(e,cancelled);
  canvas.classList.remove('dragging');
  if (tapped) onTap(e);
}
canvas.addEventListener('pointerup', e=>endPointer(e));
canvas.addEventListener('pointercancel', e=>endPointer(e,true));
canvas.addEventListener('lostpointercapture', e=>endPointer(e,true));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cameraTouched = true; player.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function onTap(e) {
  setNDC(e); ray.setFromCamera(ndc, camera);
  if (!findRound.active && farm.pick(ray,e,camera,canvas)) return;
  const creature = pickCreature(e);
  if (creature) {
    if (findRound.active) { handleFindTarget(creature); return; }
    if (tour.active && creature.def.kind !== 'guide') tour.stop();
    discover(creature); return;
  }
  const point = pickGround();
  if (!point) return;
  if (tour.active) { tour.stop(); ui.toast('导览已停止', 1500); }
  const target = world.nav.nearest(point.x, point.z, 8);
  if (!target) return;
  if (player.goTo(target.x, target.z)) {
    marker.position.set(target.x, terrainHeight(target.x, target.z) + 0.08, target.z);
    marker.material.opacity = 0.9; marker.scale.setScalar(1.6);
    tween(marker.material, 'opacity', 0, 1.2, { id: 'mk' }); tween(marker.scale, 'x', 1, 0.5, { id: 'mkx' }); tween(marker.scale, 'y', 1, 0.5, { id: 'mky' });
    audio.sfx.pop();
  } else ui.toast('那里走不到哦～', 1500);
}
player.onInput = () => { if (tour.active) tour.stop(); };

ui.bindJoystick((x, y) => { player.joy.set(x, y); if ((x || y) && tour.active) tour.stop(); });

// ------------------------------------------------------------ buttons & keys
// 名字牌**默认不显示**，让小朋友自己去点、去找；点了就亮一会儿，按 🏷️ 或 L 才全部常亮。
let labelsOn = false;
try { labelsOn = localStorage.getItem('clay-safari-labels') === '1'; } catch (error) { /* 隐私模式下忽略 */ }
function setLabels(on) {
  if (findRound.active) { ui.toast('寻宝时先专心找目标，标识牌已暂时关闭。', 2200); return; }
  labelsOn = on; Creature.labelsVisible = on; ui.setLabels(on);
  try { localStorage.setItem('clay-safari-labels', on ? '1' : '0'); } catch (error) { /* 隐私模式下忽略 */ }
  ui.toast(on ? '🏷️ 名字牌已全部显示' : '🏷️ 名字牌已收起 · 点一下动物就能看到它的名字', 2200);
}
Creature.labelsVisible = labelsOn; ui.setLabels(labelsOn);
document.getElementById('btn-labels').onclick = () => setLabels(!Creature.labelsVisible);

let overview = false;
function setOverview(on) { overview = on; player.setOverview(on); ui.setOverview(on); if (on) ui.toast('🗺️ 俯瞰整个黏土世界 · 再按一次返回', 2200); }

// 按顺序寻找：每一轮从当前已解锁的地图对象中随机抽 5 个，并重新打乱顺序。
const findRound = { active: false, complete: false, targets: [], index: 0 };
const findPanel = document.getElementById('order-game');
const findTarget = document.getElementById('order-game-target');
const findLabel = document.getElementById('order-game-label');
const findHelp = document.getElementById('order-game-help');
const findHint = document.getElementById('order-game-hint');
const findAgain = document.getElementById('order-game-again');
const findStop = document.getElementById('order-game-stop');

function updateFindPanel() {
  findPanel.hidden = false;
  if (findRound.complete) {
    findLabel.textContent = '寻宝成功';
    findTarget.textContent = '5 个目标全部找到！🎉';
    findHelp.textContent = '烟花庆祝中，准备好就再来一轮。';
    findHint.hidden = true;
    findAgain.hidden = false;
    findStop.hidden = true;
    return;
  }
  const current = findRound.targets[findRound.index];
  findLabel.textContent = `目标 ${findRound.index + 1} / 5`;
  findTarget.textContent = `去找：${current.def.cn} ${current.def.emoji}`;
  findHelp.textContent = '找到当前目标后，才会出现下一个。';
  findHint.hidden = false;
  findAgain.hidden = true;
  findStop.hidden = false;
}

function startFindRound() {
  const candidates = Object.values(creatures).filter(creature =>
    creature.def.kind !== 'guide' && unlockedIds.has(creature.def.id));
  if (candidates.length < 5) {
    ui.toast(`寻宝需要 5 个已解锁元素，目前有 ${candidates.length} 个。请先去积分商店解锁更多～`, 4200);
    return;
  }
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  findRound.targets = shuffled.slice(0, 5);
  findRound.index = 0;
  findRound.active = true;
  findRound.complete = false;
  ui.hideCard();
  Creature.labelsSuppressed = true;
  Creature.labelsVisible = false;
  ui.setLabels(false);
  document.getElementById('btn-labels').disabled = true;
  document.getElementById('btn-find-order').classList.add('on');
  if (tour.active) tour.stop();
  updateFindPanel();
  ui.toast('🔎 寻宝开始！按照提示顺序去地图上找吧。', 2600);
}

function stopFindRound() {
  findRound.active = false;
  findRound.complete = false;
  findRound.targets = [];
  findRound.index = 0;
  findPanel.hidden = true;
  Creature.labelsSuppressed = false;
  document.getElementById('btn-labels').disabled = false;
  Creature.labelsVisible = labelsOn;
  ui.setLabels(labelsOn);
  document.getElementById('btn-find-order').classList.remove('on');
}

function celebrateFindRound() {
  findRound.active = false;
  findRound.complete = true;
  updateFindPanel();
  Creature.labelsSuppressed = false;
  document.getElementById('btn-labels').disabled = false;
  Creature.labelsVisible = labelsOn;
  ui.setLabels(labelsOn);
  document.getElementById('btn-find-order').classList.remove('on');
  audio.sfx.fanfare();
  effects.confetti(player.group.position, 260);
  const layer = document.getElementById('fireworks-layer');
  const colors = ['#ff637d', '#ffd166', '#52d6c7', '#79b9ff', '#c58bff', '#fff1a8'];
  for (let i = 0; i < 7; i++) {
    const burst = document.createElement('span');
    burst.className = 'firework-burst';
    burst.style.setProperty('--x', String(8 + Math.random() * 84));
    burst.style.setProperty('--y', String(16 + Math.random() * 56));
    burst.style.setProperty('--burst-color', colors[i % colors.length]);
    burst.style.animationDelay = `${(i % 4) * 0.17}s`;
    burst.textContent = '🎆';
    layer.appendChild(burst);
    setTimeout(() => burst.remove(), 1900);
  }
  ui.toast('🎆 太棒啦！你按顺序找齐了 5 个目标！', 3600);
}

function handleFindTarget(creature) {
  const expected = findRound.targets[findRound.index];
  if (creature !== expected) {
    ui.toast(`顺序还没到哦，先去找：${expected.def.cn} ${expected.def.emoji}`, 2400);
    return;
  }
  const distance = Math.hypot(creature.group.position.x - player.pos.x, creature.group.position.z - player.pos.z);
  const nearEnough = Math.max(5.2, creature.def.r + 2.0);
  if (distance > nearEnough) {
    ui.toast(`再走近一点才能找到它，还差大约 ${Math.ceil((distance - nearEnough) / 1.5)} 步。`, 2400);
    return;
  }
  creature.react();
  effects.sparkle(creature.group.position, 0xffd166, 28, Math.max(1, creature.def.scale));
  if (creature.def.kind === 'animal' && ui.markFound(creature.def.id)) effects.hearts(creature.group.position);
  findRound.index++;
  if (findRound.index >= 5) {
    celebrateFindRound();
  } else {
    updateFindPanel();
    ui.toast(`找到了！下一个目标：${findRound.targets[findRound.index].def.cn}`, 2200);
  }
}

findHint.onclick = () => {
  if (!findRound.active) return;
  const target = findRound.targets[findRound.index];
  const dx = target.group.position.x - player.pos.x;
  const dz = target.group.position.z - player.pos.z;
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const bearing = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  const direction = directions[Math.round(bearing / (Math.PI / 4)) % 8];
  const distance = Math.hypot(dx, dz);
  findHelp.textContent = `🧭 往${direction}走，约 ${Math.max(1, Math.round(distance / 1.5))} 步；走近后再点击。`;
  effects.sparkle(target.group.position, 0x7acbff, 18, 0.7);
};

document.getElementById('btn-find-order').onclick = () => {
  if (findRound.active) { stopFindRound(); return; }
  startFindRound();
};
findAgain.onclick = startFindRound;
findStop.onclick = stopFindRound;
document.getElementById('btn-tour').onclick = () => {
  if (!Object.keys(creatures).length) { ui.toast('地图上还没有朋友，先去「积分商店」兑换一位吧～', 3000); return; }
  tour.toggle();
};
document.getElementById('btn-view').onclick = () => setOverview(!overview);
let soundOn = true;
document.getElementById('btn-sound').onclick = () => { soundOn = !soundOn; audio.setEnabled(soundOn); ui.setSound(soundOn); };
addEventListener('keydown', (e) => {
  if (e.target?.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (e.code === 'KeyM') setOverview(!overview);
  if (e.code === 'KeyH') document.getElementById('help').hidden = !document.getElementById('help').hidden;
  if (e.code === 'Escape') { tour.stop(); ui.hideCard(); document.getElementById('help').hidden = true; }
  if (e.code === 'KeyT') document.getElementById('btn-tour').onclick();
  if (e.code === 'KeyL') setLabels(!Creature.labelsVisible);
});

// ------------------------------------------------------------ 卡片小窗的机位
// 首页那个小卡片（compact）以前每帧把相机钉在狮子身上，于是滚轮缩放、拖动旋转
// 全部无效——这就是"缩小之后不能缩放"的原因。现在相机始终归用户：
// compact 不接管相机、也不隐藏名字牌，只在第一次进入小窗时给一个稍微远一点、
// 略微俯视的机位，好让几个朋友和它们的牌子一起进画面。
let lastCompact = null;
function syncCompactMode() {
  const compact = document.body.classList.contains('compact');
  if (compact === lastCompact) return;
  lastCompact = compact;
  if (compact && !cameraTouched) {
    player.targetDist = 12.5; player.targetPitch = 0.44;
    player.snapCamera();
  }
}

// ------------------------------------------------------------ main loop
const clock = new THREE.Clock();
const farm = new Farm({scene, world, player, ui, effects, stopTour:()=>{if(tour.active)tour.stop();}, hideCard:()=>ui.hideCard()});
let started = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  if (!sceneActive || document.hidden) return;
  syncCompactMode();
  Creature.labelsVisible = labelsOn;
  updateTweens(dt);
  world.update(dt, t);
  applyPendingObstacles();
  if (started) {
    player.update(dt, t);
    farm.update(dt, t);
    for (const id in creatures) creatures[id].update(dt, t);
    effects.update(dt, t);
    const riverDistance = Math.abs(player.pos.x - RIVER.x(player.pos.z));
    audio.setWaterProximity(Math.max(0, 1 - Math.max(0, riverDistance - 4) / 10));
  } else {
    // idle poster spin while loading / on the start screen（半径按地图尺寸放大）
    camera.position.set(Math.sin(t * 0.05) * 84, 58, Math.cos(t * 0.05) * 84);
    camera.lookAt(0, 0, 0);
    for (const id in creatures) creatures[id].update(dt, t);
    effects.update(dt, t);
  }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------ start
function beginAdventure(withAudio) {
  if (started) return;
  if (withAudio) {
    audio.initAudio();
    audio.startAmbient();
  }
  started = true;
  player.snapCamera();
  if (withAudio) {
    setTimeout(() => audio.speak('Welcome to the clay zoo!', 'en-US'), 400);
    setTimeout(() => ui.toast('👆 点一下动物听声音 · 右下角 🤖 可以自动导览', 3500), 1500);
  }
  if (zooLoadError) setTimeout(() => ui.toast('解锁状态读取失败，请稍后重试', 4000), 600);
}
ui.ready(() => beginAdventure(true));
if (embedded) {
  document.getElementById('loader').hidden = true;
  document.getElementById('hud').hidden = false;
  beginAdventure(false);
  // 嵌在首页卡片里时没有「开始探险」按钮，改为用户第一次点击后打开声音
  audio.armAudioOnFirstGesture(() => audio.startAmbient());
}

// debug handle (harmless in production)
window.__game = { player, creatures, tour, world, effects, ui, setOverview, discover, addItem, unlockedIds, camera, scene, renderer,
  step: (dt = 0.05, n = 1) => { for (let i = 0; i < n; i++) { const t = clock.elapsedTime + dt * (i + 1); updateTweens(dt); world.update(dt, t); player.update(dt, t); for (const id in creatures) creatures[id].update(dt, t); effects.update(dt, t); } } };

frame();
