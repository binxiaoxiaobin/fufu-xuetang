/* 地球仪"点国家"的端到端回归：在 Node 里把 frontend/globe.js 真正跑起来
 *
 * 几何判定正确 ≠ 页面上的点击能生效。这条测试补的是"接线"那一段：
 *   pointerdown/pointerup -> 取画布相对坐标 -> 交给 globe-hit 判定
 *   -> 更新顶部状态文字 -> 重新渲染右侧国家卡片
 * 用的是真实的 globe.js、真实的 world.geojson、真实的 canvas 2D 上下文，
 * 只把 DOM 换成了最小替身。
 *
 * 跑法：NODE_PATH=<workspace>/node_modules node scripts/verify_globe_tap.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const { createCanvas, Path2D } = require('@napi-rs/canvas');

let pass = 0, fail = 0;
function check(ok, label, extra) {
  ok ? pass++ : fail++;
  console.log((ok ? '  [OK]   ' : '  [FAIL] ') + label + (extra ? '   ' + extra : ''));
}
function info(t) { console.log('         · ' + t); }
function section(t) { console.log('\n=== ' + t + ' ==='); }

const W = 716, H = 560;

/* ------------------------------------------------------------------ DOM 替身 */
function makeElement(tag) {
  const listeners = Object.create(null);
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {}, dataset: {}, value: '', textContent: '', type: '',
    className: '', children: [], _html: '',
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    removeEventListener() {},
    dispatchEvent(type, event) {
      for (const fn of listeners[type] || []) fn(Object.assign({ type, target: el }, event));
    },
    append(child) { el.children.push(child); },
    appendChild(child) { el.children.push(child); },
    closest() { return null; },
    querySelector() { return makeElement('div'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H, right: W, bottom: H }; },
    setPointerCapture() {}, releasePointerCapture() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); },
  });
  return el;
}

// 画布：getContext 交给真正的 Skia 实现，并记录所有绘制调用。
// ⚠️ 不能用 Proxy 包 ctx —— napi-rs 的原生对象需要拿到自身引用，
// 经过 Proxy 会在 `ctx.fillStyle = ...` 这种属性赋值上报
// "Failed to unwrap exclusive reference"。直接在自己身上挂包装函数就行。
const realCanvas = createCanvas(W * 2, H * 2);
const realCtx = realCanvas.getContext('2d');
const drawCalls = Object.create(null);
for (const name of ['fill', 'stroke', 'arc', 'beginPath', 'moveTo', 'lineTo', 'closePath',
  'clearRect', 'fillRect', 'setTransform', 'save', 'restore', 'createRadialGradient',
  'createLinearGradient', 'clip', 'translate']) {
  const original = realCtx[name];
  if (typeof original !== 'function') continue;
  const bound = original.bind(realCtx);
  realCtx[name] = (...args) => {
    drawCalls[name] = (drawCalls[name] || 0) + 1;
    return bound(...args);
  };
}
const ctxProxy = realCtx;

const elements = {
  '#globeCanvas': makeElement('canvas'),
  '#countrySearch': makeElement('input'),
  '#countryList': makeElement('div'),
  '#countryCard': makeElement('article'),
  '#globeStatus': makeElement('span'),
  '#regionFilters': makeElement('div'),
  '#globeZoomIn': makeElement('button'),
  '#globeZoomOut': makeElement('button'),
};
elements['#globeCanvas'].getContext = () => ctxProxy;

let clock = 1000;
let rafQueue = [];
const documentStub = {
  querySelector: (sel) => elements[sel] || null,
  querySelectorAll: () => [],
  createElement: (tag) => makeElement(tag),
  addEventListener() {},
  hidden: false,
};

const geojson = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'assets', 'world.geojson'), 'utf8'));
const sandbox = {
  document: documentStub,
  Path2D,
  console,
  ResizeObserver: class { observe() {} disconnect() {} },
  performance: { now: () => clock },
  requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame() {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(geojson) }),
  setTimeout, clearTimeout,
  location: { origin: 'http://localhost' },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.devicePixelRatio = 2;
sandbox.window.addEventListener = () => {};
sandbox.window.scrollTo = () => {};
sandbox.window.FufuGlobeHit = require(path.join(FRONTEND, 'globe-hit.js'));

function pump(frames) {
  for (let i = 0; i < (frames || 1); i++) {
    clock += 16;
    const queue = rafQueue;
    rafQueue = [];
    for (const fn of queue) fn(clock);
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------------------------------------------ 启 动 */
section('1) 启动 globe.js');
{
  const src = fs.readFileSync(path.join(FRONTEND, 'globe.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'globe.js' });
  check(true, 'globe.js 在替身 DOM 里跑起来了（没有抛异常）');
  pump(2);
  check((drawCalls.fill || 0) >= 1, '地图还没到时也画了球体', 'fill 调用 ' + (drawCalls.fill || 0) + ' 次');
}

(async () => {
  await settle();
  await settle();
  pump(2);

  // facts 表：从 globe.js 里读，用来预测"选完某国之后视角会转到哪里"
  const FACTS = (() => {
    const src = fs.readFileSync(path.join(FRONTEND, 'globe.js'), 'utf8');
    const block = src.slice(src.indexOf('const facts = {'), src.indexOf('const moreFacts'));
    const out = {};
    const re = /^\s*'?([A-Za-z][A-Za-z ]*)'?:\s*\[(.*)\],?\s*$/gm;
    let m;
    while ((m = re.exec(block))) {
      const nums = m[2].match(/,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*'/);
      if (nums) out[m[1].trim()] = { lon: Number(nums[1]), lat: Number(nums[2]) };
    }
    return out;
  })();

  section('2) 地图加载完成后的状态');
  {
    const status = elements['#globeStatus'];
    check(/拖动地球探索/.test(status.textContent), '顶部状态提示已就位', JSON.stringify(status.textContent));
    check(elements['#countryList'].children.length >= 20, '右侧国家列表渲染了 ' + elements['#countryList'].children.length + ' 个');
    check(elements['#countryCard']._html.includes('中国'), '默认选中中国并渲染了卡片');
    check(Object.keys(FACTS).length === 24, '读到了 24 个有卡片的国家');
  }

  const canvas = elements['#globeCanvas'];
  const status = elements['#globeStatus'];
  const card = elements['#countryCard'];
  const R = Math.min(W, H) * 0.43;
  // 视角：选中国家之后会自动把该国转到球心，测试要跟着这个状态走
  let view = { centerLon: 105, centerLat: 24 };
  const geoToScreen = (lon, lat) => {
    const p = sandbox.window.FufuGlobeHit.project(lon, lat, view.centerLon, view.centerLat);
    return { x: W / 2 + p[0] * R, y: H / 2 - p[1] * R, z: p[2] };
  };
  const recentre = (name) => { if (FACTS[name]) view = { centerLon: FACTS[name].lon, centerLat: FACTS[name].lat }; };

  function tap(x, y, pointerType) {
    canvas.dispatchEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, pointerType: pointerType || 'touch', button: 0 });
    canvas.dispatchEvent('pointerup', { clientX: x, clientY: y, pointerId: 1, pointerType: pointerType || 'touch', button: 0 });
    pump(3);
  }
  function drag(fromX, fromY, toX, toY) {
    canvas.dispatchEvent('pointerdown', { clientX: fromX, clientY: fromY, pointerId: 1, pointerType: 'touch', button: 0 });
    canvas.dispatchEvent('pointermove', { clientX: toX, clientY: toY, pointerId: 1, pointerType: 'touch' });
    canvas.dispatchEvent('pointerup', { clientX: toX, clientY: toY, pointerId: 1, pointerType: 'touch', button: 0 });
    pump(3);
  }

  section('3) 点球心（那里是中国）');
  {
    card.innerHTML = '';
    tap(W / 2, H / 2);
    check(card._html.includes('中国'), '★ 点一下就把国家选中并渲染了卡片',
      card._html.slice(0, 60).replace(/<[^>]*>/g, ' ').trim());
    check(/已选中/.test(status.textContent), '★ 顶部状态文字给出明确反馈', JSON.stringify(status.textContent));
    recentre('China');
  }

  section('4) 手指偏 15px 也要能点中（这就是用户说的"不太敏感"）');
  {
    card.innerHTML = '';
    tap(W / 2 + 15, H / 2 + 8);
    check(card._html.includes('中国'), '★ 偏离球心 15px 仍选中中国',
      card._html.slice(0, 40).replace(/<[^>]*>/g, ' ').trim() || '（卡片为空）');
    recentre('China');
  }

  section('5) 鼠标点球心');
  {
    card.innerHTML = '';
    tap(W / 2, H / 2, 'mouse');
    check(card._html.includes('中国'), '鼠标点球心也能选中');
    recentre('China');
  }

  section('6) 点"有陆地但没有卡片"的国家 -> 给出说明而不是毫无反应');
  {
    const kz = geoToScreen(67, 48);          // 哈萨克斯坦：陆地上，但不在卡片名单里
    check(kz.z > 0, '目标点朝向观察者');
    card.innerHTML = 'KEEPME';
    tap(kz.x, kz.y);
    check(/Kazakhstan/.test(status.textContent) && /准备中/.test(status.textContent),
      '★ 状态文字说明"这里是 Kazakhstan，卡片还在准备中"', JSON.stringify(status.textContent));
    check(card._html === 'KEEPME', '没有卡片的陆地不会清掉已有卡片');
  }

  section('7) 手指抖 10px 仍算点选（阈值 18px）');
  {
    card.innerHTML = 'KEEPME2';
    drag(W / 2, H / 2, W / 2 + 10, H / 2);
    check(card._html !== 'KEEPME2' && card._html.includes('中国'),
      '★ 抖 10px 没被当成旋转，仍然选中了中国',
      card._html.replace(/<[^>]*>/g, ' ').trim().slice(0, 40));
    recentre('China');
  }

  section('8) 点空旷海面 -> 明确告诉用户没点到');
  {
    const GlobeHit = sandbox.window.FufuGlobeHit;
    const probeView = { width: W, height: H, radius: R, centerLon: view.centerLon, centerLat: view.centerLat };
    const picker = GlobeHit.create(geojson.features.map((f) => (f.properties.name === 'England'
      ? { ...f, properties: { ...f.properties, name: 'United Kingdom' } } : f)));
    let spot = null;
    for (let dy = -220; dy <= 220 && !spot; dy += 5) {
      for (let dx = -280; dx <= 280 && !spot; dx += 5) {
        const x = W / 2 + dx, y = H / 2 + dy;
        if (Math.hypot(dx / R, dy / R) > 0.9) continue;
        const far = picker.pick(probeView, x, y, 400);
        if (!far || far.distance > GlobeHit.TOUCH_TOLERANCE + 10) spot = [x, y];
      }
    }
    check(Boolean(spot), '找到一处 >32px 不见陆地的海面', spot ? `(${spot[0]},${spot[1]})` : '');
    card.innerHTML = 'KEEPME3';
    tap(spot[0], spot[1]);
    check(/没有国家/.test(status.textContent), '★ 状态文字提示"这里没有国家"', JSON.stringify(status.textContent));
    check(card._html === 'KEEPME3', '误点海面不会清掉已有的卡片');
  }

  section('9) 拖动地球不能被当成点选');
  {
    const before = status.textContent;
    card.innerHTML = 'KEEPME4';
    drag(W / 2, H / 2, W / 2 + 60, H / 2);   // 横向拖 60px，明显超过 18px 阈值
    check(card._html === 'KEEPME4', '★ 拖动 60px 之后卡片没有被改动（判定为旋转而非点选）');
    check(status.textContent === before, '拖动也没有刷新状态文字', JSON.stringify(status.textContent));
  }

  section('10) 渲染仍然在正常进行');
  {
    card.innerHTML = '';
    tap(W / 2, H / 2);                        // 触发一次落点动画，让绘制循环跑起来
    const before = drawCalls.fill || 0;
    pump(1);
    const fills = (drawCalls.fill || 0) - before;
    check(fills >= 20, '单帧仍然为每个国家填色（绘制没被改坏）', 'fill ' + fills + ' 次');
    check((drawCalls.moveTo || 0) > 100, '路径点由 projectRing 产出', 'moveTo ' + drawCalls.moveTo + ' 次');
    check((drawCalls.stroke || 0) > 10, '描边也在执行', 'stroke ' + drawCalls.stroke + ' 次');
    check((drawCalls.arc || 0) > 0, '球体与落点标记仍然绘制', 'arc ' + drawCalls.arc + ' 次');
  }

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})();
