// 「中国地图」回归测试。
// 用法：NODE_PATH=... node scripts/verify_china_map.js
// 思路：在 vm 里加载**真实的** china-provinces.js 与 china-map.js（替身 DOM + 真实 geojson），
// 用暴露的测试钩子 window.FufuChinaMap（真实 pick/投影）做命中判定验证。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
let pass = 0, fail = 0;
function check(ok, label, detail) {
  if (ok) { pass++; console.log(`  [OK]   ${label}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? '  ' + detail : ''}`); }
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ── 替身 DOM ──────────────────────────────────────────────────────────
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], dataset: {}, style: {}, hidden: false,
    textContent: '', _html: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : Boolean(f); if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    append(...kids) { for (const k of kids) this.children.push(k); },
    setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); },
    getAttribute(name) { return this.attributes?.[name] ?? null; },
    replaceChildren(...kids) { this.children = kids; },
    addEventListener(type, fn) { (this._handlers = this._handlers || {})[type] = fn; },
    dispatchEvent(type, event) { this._handlers && this._handlers[type] && this._handlers[type](event); },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; } });
  return el;
}

const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.performance = performance;
sandbox.devicePixelRatio = 1;
sandbox.requestAnimationFrame = () => 0;
sandbox.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
const createdStyles = [];
sandbox.createElement = (tag) => {
  const el = makeEl(tag);
  if (tag === 'style') createdStyles.push(el);
  return el;
};
sandbox.createDocumentFragment = () => makeEl('#frag');
sandbox.head = makeEl('head');

const ctxStub = new Proxy({}, {
  get(t, prop) {
    if (typeof prop === 'string' && !(prop in t)) {
      t[prop] = (..._a) => undefined;      // 所有绘制方法 no-op
    }
    return t[prop];
  },
  set(t, prop, v) { t[prop] = v; return true; },
});

const canvas = makeEl('canvas');
canvas.clientWidth = 900;
canvas.getContext = () => ctxStub;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
canvas.setPointerCapture = () => {};

const elements = {
  '#chinaCanvas': canvas,
  '#chinaStatus': makeEl('span'),
  '#provinceList': makeEl('div'),
  '#provinceSearch': makeEl('input'),
  '#provinceCard': makeEl('div'),
};
const page = makeEl('main');
page.querySelector = (sel) => elements[sel] || makeEl();
sandbox.document = {
  getElementById: (id) => (id === 'page-china' ? page : null),
  createElement: sandbox.createElement,
  createDocumentFragment: sandbox.createDocumentFragment,
  head: sandbox.head,
};

const geojson = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'assets', 'china.geojson'), 'utf8'));
sandbox.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(geojson) });

// ── 0) 集成检查 ───────────────────────────────────────────────────────
section('0) 集成：页面已接线');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
check(html.includes('id="page-china"'), 'index.html 里有 page-china 页面');
check(html.includes('data-page="china"'), '探索实验室里有中国地图入口卡片');
const vProv = html.match(/china-provinces\.js\?v=([a-z0-9-]+)/);
const vMap = html.match(/china-map\.js\?v=([a-z0-9-]+)/);
check(Boolean(vProv && vMap), '两个脚本都带版本号', `${vProv && vProv[1]} / ${vMap && vMap[1]}`);
check(vProv && vMap && vProv[1] === vMap[1], '两个脚本版本号一致');
check(html.indexOf('globe.js?v=') !== -1 && html.indexOf('china-map.js?v=') > html.indexOf('globe.js?v='),
  'china-map.js 排在 globe.js 之后（挂载顺序）');

const mapSrc = fs.readFileSync(path.join(FRONTEND, 'china-map.js'), 'utf8');
const provSrc = fs.readFileSync(path.join(FRONTEND, 'china-provinces.js'), 'utf8');
check(!/\.isPointInPath\s*\(/.test(mapSrc), 'china-map.js 不依赖 isPointInPath（地球仪的老教训）');
check(mapSrc.includes('pointer-events:none'), '顶部状态条/底部提示不吃点击（pointer-events:none）');
check(mapSrc.includes('is-pointable'), '悬停光标用 CSS 类（不用 inline style）');
check(mapSrc.includes('南海诸岛'), '插图框标题是「南海诸岛」（国标画法）');

// ── 1) 省份数据 ───────────────────────────────────────────────────────
section('1) 省份介绍数据（china-provinces.js）');
vm.runInContext(provSrc, vm.createContext(sandbox), { filename: 'china-provinces.js' });
const DATA = sandbox.FufuChinaProvinces;
check(Boolean(DATA), 'window.FufuChinaProvinces 已挂载');
const { PROVINCES, SEATS } = DATA;
check(PROVINCES.length === 34, `省级单位 34 个`, `实际 ${PROVINCES.length}`);
const names = PROVINCES.map((p) => p.name);
check(new Set(names).size === 34, '省份名无重复');
check(names.includes('台湾省') && names.includes('香港特别行政区') && names.includes('澳门特别行政区'),
  '台湾省 / 香港 / 澳门 都在名单里');
const badFields = PROVINCES.filter((p) => !p.short || !p.capital || !p.intro || p.intro.length < 10 || !Array.isArray(p.facts) || p.facts.length < 2);
check(badFields.length === 0, '每省都有简称/省会/介绍(≥10字)/趣闻(≥2条)', badFields.map((p) => p.name).join(' ') || '');
const missingSeats = names.filter((n) => !SEATS[n]);
check(missingSeats.length === 0, '34 个省会/驻地坐标齐全', missingSeats.join(' ') || '');

// ── 2) 加载真实 china-map.js ─────────────────────────────────────────
section('2) 加载真实 china-map.js（替身 DOM + 真实 geojson）');
vm.runInContext(mapSrc, vm.createContext(sandbox), { filename: 'china-map.js' });
(async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));   // 让 fetch 微任务跑完
  const api = sandbox.FufuChinaMap;
  check(Boolean(api && api.pick && api.state.features.length), '测试钩子就绪，地图已解析');
  const st = api.state;

  section('3) 地图数据解析');
  check(st.features.length === 34, `解析出 34 个省级要素`, `实际 ${st.features.length}`);
  check(st.jd.length >= 9, `九段线已加载（${st.jd.length} 段）`);
  const hainan = st.features.find((f) => f.adcode === 460000);
  check(hainan && hainan.main.length >= 1, '海南主图含本岛', `main ${hainan.main.length} 环`);
  check(hainan && hainan.inset.length >= 100, '南海诸岛进了插图框', `inset ${hainan.inset.length} 环`);
  const tw = st.features.find((f) => f.adcode === 710000);
  check(tw && tw.screen.length > 0, '台湾省已投影到主图');

  section('4) 省会/驻地命中：34 个点都能选中本省');
  let exact = 0, byTolerance = 0, wrong = [];
  for (const info of PROVINCES) {
    const [lon, lat] = SEATS[info.name];
    const [x, y] = api.project(lon, lat);
    const hit0 = api.pick(x, y, 0);
    if (hit0 && hit0.name === info.name) { exact++; continue; }
    const hitT = api.pick(x, y, api.toleranceFor('touch'));
    if (hitT && hitT.name === info.name) { byTolerance++; continue; }
    wrong.push(`${info.name}(got ${hit0 && hit0.name}/${hitT && hitT.name})`);
  }
  check(wrong.length === 0, `34 个驻地点全部命中本省（精确 ${exact} + 容差 ${byTolerance}）`, wrong.join(' ') || '');
  check(byTolerance <= 6, `需要容差的驻地点不超过 6 个（说明点位足够准）`, `实际 ${byTolerance}`);

  section('5) 插图框与小省标签');
  const r = st.insetRect;
  check(Boolean(r), '插图框存在');
  const insetHit = api.pick(r.x + r.w / 2, r.y + r.h / 2, 0);
  check(insetHit && insetHit.inset && insetHit.name === '海南省', '点插图框 → 选中海南省（南海诸岛归属）');
  const hkLabel = st.labels.find((l) => l.name === '香港特别行政区');
  const moLabel = st.labels.find((l) => l.name === '澳门特别行政区');
  check(Boolean(hkLabel && moLabel), '香港/澳门有小省名字标签（图上几乎看不见的地方必须能点）');
  if (hkLabel) {
    const hkHit = api.pick(hkLabel.x, hkLabel.y, 0);
    check(hkHit && hkHit.name === '香港特别行政区', '点香港标签 → 选中香港');
  }

  section('6) 容差与海面');
  const gd = SEATS['广东省'];
  const [gdx, gdy] = api.project(gd[0], gd[1]);
  const near = api.pick(gdx + 15, gdy, api.toleranceFor('touch'));
  check(Boolean(near), '边界外 15px 在触屏容差内仍能命中（22px）', near ? near.name : 'null');
  let seaNull = 0, samples = 0;
  for (let x = 250; x <= 550; x += 25) {
    samples++;
    if (!api.pick(x, st.view.cssH - 12, api.toleranceFor('touch'))) seaNull++;
  }
  check(seaNull >= samples * 0.6, '主图下方是海：采样点大多判空', `${seaNull}/${samples} 判空`);
  const tolMap = { touch: 22, pen: 14, mouse: 10 };
  check(api.toleranceFor('touch') === tolMap.touch && api.toleranceFor('mouse') === tolMap.mouse,
    '容差取值与地球仪一致（touch 22 / pen 14 / mouse 10）');

  section('7) 视图布局');
  let drawError = null;
  try { api.draw(); } catch (e) { drawError = e; }
  check(!drawError, '真实 draw() 完整跑一遍不抛错', drawError && drawError.message);
  const r2 = st.insetRect;
  check(r2.x + r2.w <= st.view.cssW && r2.y + r2.h <= st.view.cssH, '插图框不超出画布');
  check(st.view.cssH >= 340 && st.view.cssH <= 620, `画布高度按宽度自适应（${st.view.cssH}px）`);
  // 福建海岸不被插图框压住：福建东南角点应命中福建而不是插图
  const twSeat = SEATS['台湾省'];
  const [twx, twy] = api.project(twSeat[0], twSeat[1]);
  const nearTw = api.pick(twx - 24, twy, 0);
  check(!nearTw || nearTw.name !== '海南省', '海峡中间不误报海南省（插图框没有压到主图）');

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('测试崩溃:', e); process.exit(1); });
