// 渲染「中国地图」核对图：用真实 china-map.js 的 draw() 输出（记录绘制调用）
// 重放到 Skia（@napi-rs/canvas），再叠加 34 个省会/驻地命中标记，供人眼核对。
// 用法：NODE_PATH=... node scripts/render_china_map_check.js
// 产物：artifacts/china-map-check.png
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');

// ── 记录型 ctx ────────────────────────────────────────────────────────
const calls = [];
const props = {};
const recordCtx = new Proxy({}, {
  get(_t, prop) {
    if (prop in props) return props[prop];
    return (...args) => calls.push([prop, args]);
  },
  set(_t, prop, v) { props[prop] = v; calls.push(['@set', [prop, v]]); return true; },
});

// ── 替身 DOM（与 verify_china_map.js 相同的最小集）────────────────────
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), children: [], dataset: {}, style: {},
    hidden: false, textContent: '', _html: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : Boolean(f); if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    append(...kids) { for (const k of kids) this.children.push(k); },
    replaceChildren(...kids) { this.children = kids; },
    addEventListener() {}, querySelector() { return makeEl(); }, querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; } });
  return el;
}
const sandbox = { window: null, console, performance, devicePixelRatio: 1, requestAnimationFrame: () => 0 };
sandbox.window = sandbox;
sandbox.ResizeObserver = class { observe() {} disconnect() {} };
sandbox.createElement = (tag) => makeEl(tag);
sandbox.createDocumentFragment = () => makeEl('#frag');
sandbox.head = makeEl('head');
const canvas = makeEl('canvas');
canvas.clientWidth = 900;
canvas.getContext = () => recordCtx;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
canvas.setPointerCapture = () => {};
const elements = {
  '#chinaCanvas': canvas, '#chinaStatus': makeEl('span'), '#provinceList': makeEl('div'),
  '#provinceSearch': makeEl('input'), '#provinceCard': makeEl('div'),
};
const page = makeEl('main');
page.querySelector = (sel) => elements[sel] || makeEl();
sandbox.document = {
  getElementById: (id) => (id === 'page-china' ? page : null),
  createElement: sandbox.createElement, createDocumentFragment: sandbox.createDocumentFragment, head: sandbox.head,
};
const geojson = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'assets', 'china.geojson'), 'utf8'));
sandbox.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(geojson) });

vm.runInContext(fs.readFileSync(path.join(FRONTEND, 'china-provinces.js'), 'utf8'), vm.createContext(sandbox), { filename: 'china-provinces.js' });
vm.runInContext(fs.readFileSync(path.join(FRONTEND, 'china-map.js'), 'utf8'), vm.createContext(sandbox), { filename: 'china-map.js' });

(async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  const api = sandbox.FufuChinaMap;
  if (!api) throw new Error('china-map.js 未挂载测试钩子');
  const st = api.state;
  api.draw();                                          // 触发一次真实绘制（rAF 桩不会自动跑）

  // ── 重放到 Skia ────────────────────────────────────────────────────
  const W = 900, H = Math.round(st.view.cssH);
  const out = createCanvas(W, H);
  const ctx = out.getContext('2d');
  const FONT_RE = /px/;
  for (const [name, args] of calls) {
    if (name === '@set') { const [k, v] = args; ctx[k] = v; continue; }
    if (FONT_RE.test(name)) continue;
    if (typeof ctx[name] === 'function') ctx[name](...args);
  }

  // ── 叠加：34 个省会/驻地命中标记 ───────────────────────────────────
  const { PROVINCES, SEATS } = sandbox.FufuChinaProvinces;
  for (const info of PROVINCES) {
    const [lon, lat] = SEATS[info.name];
    const [x, y] = api.project(lon, lat);
    const hit = api.pick(x, y, 0);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = hit && hit.name === info.name ? '#e05656' : '#3b6fd4';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // 插图框边界描一层更明显的线便于核对
  const r = st.insetRect;
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#b06a3b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const file = path.join(ROOT, 'artifacts', 'china-map-check.png');
  fs.writeFileSync(file, out.toBuffer('image/png'));
  const red = PROVINCES.filter((info) => {
    const [x, y] = api.project(...SEATS[info.name]);
    const h = api.pick(x, y, 0);
    return h && h.name === info.name;
  }).length;
  console.log(`已生成 ${file}（${W}x${H}）`);
  console.log(`零容差命中标记：红点 = 精确命中本省（${red}/34），蓝点 = 未命中`);
})();
