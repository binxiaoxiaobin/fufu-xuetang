/* 地球仪"手指点国家"的回归测试
 *
 * 为什么要有它：这类"手感"问题以前只能让用户在平板上反复试。现在把命中判定
 * 拆成了纯几何的 frontend/globe-hit.js，于是可以在电脑上把整条链路跑一遍，
 * 并且用真实的 world.geojson、拿 Skia 的路径填充当独立参照做交叉验证。
 *
 * 跑法（@napi-rs/canvas 装在 node 隔离工作区里）：
 *   NODE_PATH=<workspace>/node_modules node scripts/verify_globe_hit.js
 * 不设 NODE_PATH 也能跑，只是会跳过依赖画布的那两节。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const GEOJSON = path.join(FRONTEND, 'assets', 'world.geojson');

const GlobeHit = require(path.join(FRONTEND, 'globe-hit.js'));

let pass = 0, fail = 0;
function check(ok, label, extra) {
  ok ? pass++ : fail++;
  console.log((ok ? '  [OK]   ' : '  [FAIL] ') + label + (extra ? '   ' + extra : ''));
}
function info(text) { console.log('         · ' + text); }
function section(title) { console.log('\n=== ' + title + ' ==='); }

/* ---------------------------------------------------------------- 视图参数 */
// iPad 竖屏（768 宽）：一条列布局，stage 内宽约 716，画布高 560。
// radius 用的是 globe.js 里的算法：min(宽,高) * .43 * zoom
const VIEW = (function () {
  const width = 716, height = 560, zoom = 1;
  return {
    width, height, zoom,
    radius: Math.min(width, height) * 0.43 * zoom,
    centerLon: 105, centerLat: 24,
  };
})();
const CX = VIEW.width / 2, CY = VIEW.height / 2, R = VIEW.radius;
const DEG_PX = 2 * R / 180; // 1 度纬度大约多少屏幕像素（球心附近）

const projected = (lon, lat) => GlobeHit.project(lon, lat, VIEW.centerLon, VIEW.centerLat);
const toScreen = (lon, lat) => {
  const p = projected(lon, lat);
  return { x: CX + p[0] * R, y: CY - p[1] * R, z: p[2] };
};
const screenToGeo = (x, y) => GlobeHit.unproject((x - CX) / R, (CY - y) / R, VIEW.centerLon, VIEW.centerLat);

/* ------------------------------------------------- 从 globe.js 里读 facts 表 */
function readFacts() {
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
}

/* --------------------------------------------------------------- 数据与参照 */
const data = JSON.parse(fs.readFileSync(GEOJSON, 'utf8'));
const rename = (f) => (f.properties.name === 'England'
  ? { ...f, properties: { ...f.properties, name: 'United Kingdom' } } : f);
const features = data.features.map(rename);
const picker = GlobeHit.create(features);

// Skia 参照：把每个国家按 globe.js 的取景方式变成 Path2D（单位变换，坐标语义无歧义）
let renderCtx = null, Path2DRef = null;
try {
  const canvasMod = require('@napi-rs/canvas');
  Path2DRef = canvasMod.Path2D;
  renderCtx = canvasMod.createCanvas(Math.ceil(VIEW.width), Math.ceil(VIEW.height)).getContext('2d');
  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
} catch (e) { /* 后面各节自行跳过 */ }

/* globe.js 的取景裁剪：只保留朝向观察者的那一半 */
function clipRing(ring) {
  if (ring.length < 3) return [];
  const vs = ring.map(([lo, la]) => projected(lo, la));
  const out = [];
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length];
    const av = a[2] >= 0, bv = b[2] >= 0;
    if (av) out.push(a);
    if (av !== bv) {
      const t = a[2] / (a[2] - b[2]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]);
    }
  }
  return out;
}
function featurePath(feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const p = new Path2DRef();
  let has = false;
  for (const poly of polys) for (const ring of poly) {
    const clipped = clipRing(ring);
    if (clipped.length < 3) continue;
    p.moveTo(CX + clipped[0][0] * R, CY - clipped[0][1] * R);
    for (let i = 1; i < clipped.length; i++) {
      p.lineTo(CX + clipped[i][0] * R, CY - clipped[i][1] * R);
    }
    p.closePath(); has = true;
  }
  return has ? p : null;
}

const refPaths = [];
if (renderCtx) {
  for (const f of features) {
    const p = featurePath(f);
    if (p) refPaths.push([f.properties.name, p]);
  }
}
const refAt = renderCtx
  ? (x, y) => {
    for (let i = refPaths.length - 1; i >= 0; i--) {
      if (renderCtx.isPointInPath(refPaths[i][1], x, y, 'evenodd')) return refPaths[i][0];
    }
    return null;
  }
  : () => null;

/* ==================================================================== 测试 */

section('0) 集成：globe.js 确实换用了本模块');
{
  const src = fs.readFileSync(path.join(FRONTEND, 'globe.js'), 'utf8');
  const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
  check(/FufuGlobeHit/.test(src), 'globe.js 引用了 FufuGlobeHit');
  check(!/isPointInPath/.test(src), 'globe.js 里已经没有 isPointInPath（命中不再依赖它）');
  const iHit = html.indexOf('globe-hit.js');
  const iGlobe = html.indexOf('/globe.js');
  check(iHit > -1 && iGlobe > -1 && iHit < iGlobe, 'index.html 里 globe-hit.js 排在 globe.js 之前');
}

section('1) 投影 / 反投影：来回换算应当闭合');
{
  let worst = 0;
  for (let lon = -180; lon <= 180; lon += 15) {
    for (let lat = -80; lat <= 80; lat += 10) {
      const p = projected(lon, lat);
      if (p[2] <= 0) continue;
      const back = GlobeHit.unproject(p[0], p[1], VIEW.centerLon, VIEW.centerLat);
      const dLon = Math.abs(((back[0] - lon + 540) % 360) - 180);
      worst = Math.max(worst, dLon, Math.abs(back[1] - lat));
    }
  }
  check(worst < 1e-9, '正投影 -> 反投影 闭合误差 < 1e-9 度', '实测最大 ' + worst.toExponential(2));
  check(GlobeHit.unproject(1.2, 0, 105, 24) === null, '单位圆外的点反投影返回 null');
  check(GlobeHit.unproject(0, 0, 105, 24)[0] === 105, '圆心反投影回视点中心经度');
}

section('1b) 绘制同源：projectRing 与原来那套"裁剪 + 投影"逐点一致');
{
  // globe.js 绘制国家已改为调用 GlobeHit.projectRing()，命中判定用的是同一份结果。
  // 这条测试保证"换实现"没让画面发生任何位移。
  let rings = 0, mismatched = 0;
  let worst = 0;
  for (const f of features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) {
      if (ring.length < 3) continue;
      rings++;
      const before = clipRing(ring).map((p) => [CX + p[0] * R, CY - p[1] * R]);
      const after = GlobeHit.projectRing(ring, VIEW);
      if (before.length !== after.length) { mismatched++; continue; }
      for (let i = 0; i < before.length; i++) {
        worst = Math.max(worst,
          Math.abs(before[i][0] - after[i][0]), Math.abs(before[i][1] - after[i][1]));
      }
    }
  }
  check(mismatched === 0, `${rings} 个环的顶点数完全一致`);
  check(worst < 1e-9, `${rings} 个环逐点一致（绘制不会发生位移）`, '最大偏差 ' + worst + 'px');
}

section('2) 地图数据');
{
  check(picker.count === features.length, `可用国家条目数 ${picker.count}（与要素数一致）`);
  check(picker.entries.some((e) => e.name === 'United Kingdom'), 'England 已归一为 United Kingdom');
}

const facts = readFacts();
const factsNames = new Set(Object.keys(facts));

section('3) 瞄准国家正中 -> 必须选中它（零容差；正中用 Skia 参照独立求出）');
{
  check(Object.keys(facts).length === 24, '从 globe.js 读到 24 个可选国家',
    '实际 ' + Object.keys(facts).length);
  if (!renderCtx) {
    console.log('  [跳过] 没有画布参照，无法独立求出"国家正中"');
  } else {
    const exactWrong = [], fingerWrong = [], missing = [], centresOff = [];
    let onScreen = 0;
    for (const name of Object.keys(facts)) {
      const entry = features.find((f) => f.properties.name === name);
      if (!entry) { missing.push(name + '(地图里没有)'); continue; }
      const p = featurePath(entry);
      if (!p) { missing.push(name + '(背面，看不到)'); continue; }
      // 扫描本国实际画出来的像素。⚠️ 一定要用像素中心 (x+0.5, y+0.5)：
      // 球缘附近 0.5 像素的偏移就足以改变归属（实测 ρ≈1 处半像素≈0.4° 经度），
      // 用整数坐标验证、却按 +0.5 去点击，会造出一批假的"点不中"。
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const pts = [];
      for (let y = 0; y < VIEW.height; y += 1) for (let x = 0; x < VIEW.width; x += 1) {
        const sx = x + 0.5, sy = y + 0.5;
        if (!renderCtx.isPointInPath(p, sx, sy, 'evenodd')) continue;
        pts.push([sx, sy]);
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      }
      if (!pts.length) { missing.push(name + '(屏幕上没有面积)'); continue; }
      onScreen++;
      // 只留下"深居内陆"的像素（上下左右各 3px 也都在本国境内），
      // 再要求绘制层面的归属也是本国（110m 地图里小国会盖住邻居，边界处本来就有歧义）。
      const deep = pts.filter(([x, y]) =>
        renderCtx.isPointInPath(p, x + 3, y, 'evenodd') &&
        renderCtx.isPointInPath(p, x - 3, y, 'evenodd') &&
        renderCtx.isPointInPath(p, x, y + 3, 'evenodd') &&
        renderCtx.isPointInPath(p, x, y - 3, 'evenodd'));
      const owned = deep.filter(([x, y]) => refAt(x, y) === name);
      const pool = owned.length ? owned : (deep.length ? deep : pts);
      const midX = Math.round((minX + maxX) / 2), midY = Math.round((minY + maxY) / 2);
      // 取最靠近包围盒中心、且深居内陆的那个像素
      let best = pool[0], bestD = Infinity;
      for (const [x, y] of pool) {
        const d = (x - midX) ** 2 + (y - midY) ** 2;
        if (d < bestD) { bestD = d; best = [x, y]; }
      }
      const px = best[0], py = best[1];
      const exact = picker.pick(VIEW, px, py, 0);
      const finger = picker.pick(VIEW, px, py, GlobeHit.TOUCH_TOLERANCE);
      if (!exact || exact.name !== name) {
        exactWrong.push(`${name} 瞄准(${best}) -> ${exact ? exact.name : '什么都没点到'}`);
      }
      if (!finger || finger.name !== name) {
        fingerWrong.push(`${name} 瞄准(${best}) -> ${finger ? finger.name : '什么都没点到'}`);
      }
      // 顺带看看 facts 表里给的经纬度在屏幕上是不是落在本国
      const centre = facts[name];
      const cp = toScreen(centre.lon, centre.lat);
      if (cp.z > 0) {
        const at = picker.pick(VIEW, cp.x, cp.y, 0);
        if (!at || at.name !== name) {
          centresOff.push(`${name}(${centre.lon},${centre.lat}) -> ${at ? at.name : '海上'}`);
        }
      }
    }
    check(fingerWrong.length === 0,
      `正面朝向的 ${onScreen} 个国家，按指腹精度瞄准正中都能选中`,
      fingerWrong.length ? fingerWrong.join(' / ') : '');
    check(exactWrong.length === 0, '同上，用零容差精确瞄准也都能选中',
      exactWrong.length ? exactWrong.join(' / ') : '');
    if (missing.length) info('本视角看不到的：' + missing.join('、'));
    info('facts 表里的坐标在屏幕上不落在本国的（只影响"选中后把国家转到中间"的取景）：'
      + (centresOff.length ? centresOff.join('、') : '无'));
  }
}

section('4) 容差：手指偏一点也要能点中（合成一个小岛来量）');
{
  // 自动找一块"离所有陆地都足够远"的可见海面。
  // 阈值取 60px：全盘扫描实测最开阔的可见海面离陆地 86.8px（最远的是美国），
  // 再苛刻就找不到地方放试验岛了。
  const CLEAR = 60;
  let spot = null, bestClear = -1;
  for (let dy = -240; dy <= 240 && !spot; dy += 6) {
    for (let dx = -300; dx <= 300 && !spot; dx += 6) {
      const x = CX + dx, y = CY + dy;
      if (x < 2 || x > VIEW.width - 2 || y < 2 || y > VIEW.height - 2) continue;
      const rho = Math.hypot(dx / R, dy / R);
      if (rho > 0.92) continue;
      const far = picker.pick(VIEW, x, y, 400);
      const d = far ? far.distance : Infinity;
      if (d > bestClear) bestClear = d;
      if (d >= CLEAR) spot = [x, y, d];
    }
  }
  check(Boolean(spot), `找到一块距离所有陆地 ≥${CLEAR}px 的可见海面`,
    spot ? `@(${spot[0]},${spot[1]})，离最近陆地 ${spot[2].toFixed(0)}px`
      : `最开阔处只有 ${bestClear.toFixed(0)}px`);

  const geo = screenToGeo(spot[0], spot[1]);
  const ISLAND = { lon: geo[0], lat: geo[1], half: 0.35 };
  const island = {
    type: 'Feature', properties: { name: 'Tiny Island' },
    geometry: {
      type: 'Polygon', coordinates: [[
        [ISLAND.lon - ISLAND.half, ISLAND.lat - ISLAND.half],
        [ISLAND.lon + ISLAND.half, ISLAND.lat - ISLAND.half],
        [ISLAND.lon + ISLAND.half, ISLAND.lat + ISLAND.half],
        [ISLAND.lon - ISLAND.half, ISLAND.lat + ISLAND.half],
        [ISLAND.lon - ISLAND.half, ISLAND.lat - ISLAND.half],
      ]],
    },
  };
  const withIsland = GlobeHit.create(features.concat([island]));
  const c = toScreen(ISLAND.lon, ISLAND.lat);
  info(`小岛经纬度 (${ISLAND.lon.toFixed(2)}, ${ISLAND.lat.toFixed(2)})，`
    + `直径约 ${(ISLAND.half * 2 * DEG_PX).toFixed(1)}px`);

  const centreHit = withIsland.pick(VIEW, c.x, c.y, 0);
  check(Boolean(centreHit) && centreHit.name === 'Tiny Island',
    '点小岛正中（零容差）-> 命中', centreHit ? centreHit.name : 'null');

  const RING = 20;
  const offsets = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    offsets.push([Math.cos(a) * RING, Math.sin(a) * RING]);
  }
  const noTol = offsets.filter(([dx, dy]) => withIsland.pick(VIEW, c.x + dx, c.y + dy, 0) !== null);
  const withTol = offsets.filter(([dx, dy]) => {
    const r = withIsland.pick(VIEW, c.x + dx, c.y + dy, GlobeHit.TOUCH_TOLERANCE);
    return r && r.name === 'Tiny Island';
  });
  check(noTol.length === 0,
    `负向对照：偏 ${RING}px 且零容差 -> 一个都点不中（证明起作用的是容差本身）`,
    '实际命中 ' + noTol.length + '/8');
  check(withTol.length === 8,
    `偏 ${RING}px 且手指容差（${GlobeHit.TOUCH_TOLERANCE}px）-> 8 个方向全部命中`,
    '实际 ' + withTol.length + '/8');

  const far = withIsland.pick(VIEW, c.x + 70, c.y, GlobeHit.TOUCH_TOLERANCE);
  check(far === null, '偏 70px（远超容差）-> 仍然不命中，不会乱选别处');
}

section('5) 开阔海面不该选中任何国家');
{
  const spots = [];
  for (let i = 0; i < 40 && spots.length < 6; i++) {
    const x = CX + Math.cos(i * 2.4) * R * 0.8;
    const y = CY + Math.sin(i * 2.4) * R * 0.8;
    // "远海"要按真实距离挑：离最近的陆地至少还要再远 12px 才算远海
    const far = picker.pick(VIEW, x, y, 4000);
    if (!far || far.distance > GlobeHit.TOUCH_TOLERANCE + 12) {
      spots.push([x, y, far ? far.distance.toFixed(0) : '∞']);
    }
  }
  const bad = spots.filter(([x, y]) => picker.pick(VIEW, x, y, GlobeHit.TOUCH_TOLERANCE) !== null);
  check(spots.length >= 3 && bad.length === 0,
    `${spots.length} 个远海点在容差内都不会误选`,
    bad.length ? '误选: ' + JSON.stringify(bad) : '（离最近陆地 ' + spots.map((s) => s[2] + 'px').join('/') + '）');
}

section('6) 交叉验证：与 Skia 的路径填充逐点比对（独立实现）');
if (!renderCtx) {
  console.log('  [跳过] 没有 @napi-rs/canvas');
} else {
  const step = 4;
  const blank = () => ({ both: 0, onlyMine: 0, onlyRef: 0, differ: 0, samples: 0, minRho: NaN });
  const core = blank(), rim = blank();
  const examples = [], rimExamples = [];
  for (let y = 2; y < VIEW.height; y += step) {
    for (let x = 2; x < VIEW.width; x += step) {
      const ux = (x - CX) / R, uy = (CY - y) / R;
      const rho = Math.sqrt(ux * ux + uy * uy);
      if (rho > 0.998) continue;
      // 命中判定用的就是"屏幕上的多边形"，与绘制同源，所以球缘那一圈也应当一致。
      // 这里仍然分区统计，方便一眼看出问题是在球心还是球缘。
      const s = rho <= 0.95 ? core : rim;
      s.samples++;
      const mine = picker.pick(VIEW, x, y, 0);
      const ref = refAt(x, y);
      let bad = null;
      if (mine && ref) {
        s.both++;
        if (mine.name !== ref) { s.differ++; bad = `(${x},${y}) 我=${mine.name} 参照=${ref}`; }
      } else if (mine && !ref) { s.onlyMine++; bad = `(${x},${y}) 我=${mine.name} 参照=无`; }
      else if (!mine && ref) { s.onlyRef++; bad = `(${x},${y}) 我=无 参照=${ref}`; }
      if (bad) {
        if (!(s.minRho <= rho)) s.minRho = rho;
        const bag = rho <= 0.95 ? examples : rimExamples;
        if (bag.length < 5) bag.push(`${bad} ρ=${rho.toFixed(3)}`);
      }
    }
  }
  const coreBad = core.onlyMine + core.onlyRef + core.differ;
  const rimBad = rim.onlyMine + rim.onlyRef + rim.differ;
  info(`球心区(ρ≤0.95) ${core.samples} 点：都命中 ${core.both}，只有我 ${core.onlyMine}，`
    + `只有参照 ${core.onlyRef}，名称不一致 ${core.differ}`);
  info(`球缘带(0.95<ρ≤0.998) ${rim.samples} 点：同上 ${rim.both} / ${rim.onlyMine} / ${rim.onlyRef} / ${rim.differ}`);
  if (examples.length) info('球心区差异样例：' + examples.join(' | '));
  if (rimExamples.length) info('球缘带差异样例：' + rimExamples.join(' | '));
  check(coreBad <= Math.max(3, core.samples * 0.002),
    '球心区与"绘制出来的形状"一致度 ≥ 99.8%', `实际 ${coreBad}/${core.samples}`);
  check(rimBad <= Math.max(3, rim.samples * 0.002),
    '球缘带同样要与绘制一致（这一圈原本最容易出错）',
    `实际 ${rimBad}/${rim.samples}`);
}

section('7) 容差取值合理性');
{
  check(GlobeHit.toleranceFor('touch') === GlobeHit.TOUCH_TOLERANCE,
    `touch 用触屏容差 ${GlobeHit.TOUCH_TOLERANCE}px`);
  check(GlobeHit.toleranceFor('mouse') === GlobeHit.MOUSE_TOLERANCE,
    `mouse 用鼠标容差 ${GlobeHit.MOUSE_TOLERANCE}px`);
  check(GlobeHit.toleranceFor('pen') > 0, 'pen 也有容差');
  check(GlobeHit.TOUCH_TOLERANCE >= 18 && GlobeHit.TOUCH_TOLERANCE <= 30,
    '触屏容差落在合理区间 18~30px（指腹直径约 50px）');
}

section('8) 渲染命中图供人眼核对');
if (!renderCtx) {
  console.log('  [跳过] 没有画布参照');
} else {
  const W = Math.ceil(VIEW.width), H = Math.ceil(VIEW.height);
  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
  renderCtx.clearRect(0, 0, W, H);
  renderCtx.fillStyle = '#0f2b3f';
  renderCtx.fillRect(0, 0, W, H);
  const ocean = renderCtx.createRadialGradient(CX - R * .35, CY - R * .4, R * .08, CX + R * .25, CY + R * .2, R * 1.35);
  ocean.addColorStop(0, '#92d6d8'); ocean.addColorStop(.5, '#5faebd'); ocean.addColorStop(1, '#276c90');
  renderCtx.fillStyle = ocean;
  renderCtx.beginPath(); renderCtx.arc(CX, CY, R, 0, Math.PI * 2); renderCtx.fill();
  renderCtx.save();
  renderCtx.beginPath(); renderCtx.arc(CX, CY, R, 0, Math.PI * 2); renderCtx.clip();
  for (const [, p] of refPaths) {
    renderCtx.fillStyle = '#dbe8d2';
    renderCtx.strokeStyle = '#7fa88f';
    renderCtx.lineWidth = 0.6;
    renderCtx.fill(p, 'evenodd');
    renderCtx.stroke(p);
  }
  renderCtx.restore();

  let dots = 0, green = 0, yellow = 0, red = 0;
  for (let y = 1; y < H; y += 3) {
    for (let x = 1; x < W; x += 3) {
      const ux = (x - CX) / R, uy = (CY - y) / R;
      if (ux * ux + uy * uy > 1) continue;
      const res = picker.pick(VIEW, x + 0.5, y + 0.5, 0);
      renderCtx.fillStyle = res ? (factsNames.has(res.name) ? '#0f9d4a' : '#ffd21f') : '#ff3b30';
      renderCtx.globalAlpha = 0.55;
      renderCtx.fillRect(x, y, 2, 2);
      renderCtx.globalAlpha = 1;
      dots++;
      if (!res) red++; else if (factsNames.has(res.name)) green++; else yellow++;
    }
  }
  const outFile = path.join(ROOT, 'artifacts', 'globe-hit-map.png');
  fs.writeFileSync(outFile, renderCtx.canvas.toBuffer('image/png'));
  info(`采样 ${dots} 点：绿(有卡片) ${green} / 黄(有卡片以外的陆地) ${yellow} / 红(判为海) ${red}`);
  info('已写出 ' + outFile);
  check(fs.existsSync(outFile) && fs.statSync(outFile).size > 5000, '命中图已生成');
  check(green > 0 && yellow > 0 && red > 0, '三种判定都出现了（说明不是空跑）');
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
