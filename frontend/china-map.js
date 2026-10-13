// 「中国地图」——探索实验室的中国省份选择页（传统脚本，与 globe.js 同模式）。
// 数据：/assets/china.geojson（阿里云 DataV 标准行政区划，34 个省级单位 + 九段线）。
// 合规红线：台湾省、香港、澳门必须出现；南海诸岛按国标画在右下角插图框（含九段线）。
// 命中判定与地球仪同思路：把轮廓投影到屏幕空间，点在多边形内（evenodd 全环计数）
// 或距最近边界 ≤ 容差（touch 22 / pen 14 / mouse 10 px）。绝不依赖 isPointInPath。
(function () {
  'use strict';

  const DATA = window.FufuChinaProvinces;
  const page = document.getElementById('page-china');
  if (!page) return;

  const canvas = page.querySelector('#chinaCanvas');
  const statusEl = page.querySelector('#chinaStatus');
  const listEl = page.querySelector('#provinceList');
  const searchEl = page.querySelector('#provinceSearch');
  const cardEl = page.querySelector('#provinceCard');

  if (!DATA || !canvas || !statusEl || !listEl || !searchEl || !cardEl) {
    if (statusEl) statusEl.textContent = '中国地图模块加载失败，请刷新重试';
    return;
  }
  const { PROVINCES, SEATS, SOUTH_SEA_NOTE } = DATA;

  // ── 画风：与恐龙馆/地球仪同一套设计令牌 ─────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
  .china-page{max-width:1180px;margin:0 auto;padding:26px 20px 60px}
  .china-heading{margin:6px 0 18px}
  .china-heading h1{font-size:30px;color:#4a3c2c;margin:6px 0 8px}
  .china-heading p{color:#6b5a41;margin:0;font-size:14px}
  .china-layout{display:grid;grid-template-columns:1.35fr 1fr;gap:18px;align-items:start}
  .china-stage{position:relative;border-radius:22px;border:1px solid rgba(120,100,70,.18);
    background:linear-gradient(180deg,#e8f0ea,#dfe9e4);overflow:hidden;
    box-shadow:0 18px 44px rgba(90,70,40,.12)}
  .china-stage canvas{display:block;width:100%;touch-action:none;border-radius:22px;cursor:default}
  .china-stage canvas.is-pointable{cursor:pointer}
  .china-stage-top{position:absolute;z-index:2;left:0;right:0;top:0;display:flex;
    justify-content:space-between;align-items:center;padding:12px 16px;
    font-size:12px;font-weight:800;color:#5b4a33;pointer-events:none}
  .china-stage-top span:last-child{font-weight:600;color:#6b5a41;
    background:rgba(255,243,206,.95);border-radius:14px;padding:4px 10px}
  .china-tip{position:absolute;z-index:2;left:0;right:0;bottom:0;text-align:center;
    padding:10px 12px 12px;font-size:11px;color:#9c8a6d;pointer-events:none}
  .china-sidebar{display:flex;flex-direction:column;gap:14px}
  .province-picker,.province-card{background:rgba(255,255,255,.72);
    border:1px solid rgba(120,100,70,.18);border-radius:18px;padding:16px}
  .province-picker h2,.province-card h3{margin:0 0 8px;color:#4a3c2c;font-size:17px}
  .province-search-label{display:block;font-size:11px;color:#9c8a6d;margin-bottom:4px}
  .province-picker input{width:100%;box-sizing:border-box;border:1px solid rgba(120,100,70,.25);
    border-radius:12px;padding:9px 12px;font-size:14px;color:#4a3c2c;background:rgba(255,255,255,.9);
    font-family:inherit;outline:none}
  .province-picker input:focus{border-color:#c9a75c}
  .province-list{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow-y:auto}
  .province-list button{border:1px solid rgba(120,100,70,.2);background:rgba(255,255,255,.8);
    color:#5b4a33;border-radius:14px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit}
  .province-list button:hover{background:rgba(255,243,206,.95)}
  .province-list button.active{background:#f2c14e;border-color:#d9a83c;color:#4a3c2c;font-weight:800}
  .province-card-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .province-badge{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;
    flex:none;border-radius:12px;background:linear-gradient(145deg,#f8edcf,#e7d6ab);color:#66744e;
    font-weight:800;font-size:16px}
  .province-card-head small{display:block;color:#9c8a6d;font-size:11px}
  .province-read{margin-left:auto;border:1px solid rgba(120,100,70,.25);border-radius:14px;
    background:rgba(255,243,206,.95);color:#5b4a33;padding:6px 10px;font-size:12px;cursor:pointer;
    font-family:inherit}
  .province-card>p{color:#5b4a33;font-size:13.5px;line-height:1.75;margin:8px 0}
  .province-card ul{margin:6px 0 0;padding-left:18px;color:#6b5a41;font-size:12.5px;line-height:1.8}
  .province-card .province-empty{color:#9c8a6d;font-size:13px;margin:4px 0 0}
  .china-page{max-width:1380px}.china-heading h1{color:#294d40;font-size:34px}
  .china-layout{grid-template-columns:minmax(0,1.45fr) minmax(330px,1fr);grid-template-areas:'pick pick' 'map detail';gap:20px}
  .china-sidebar{display:contents}.china-stage{grid-area:map;position:sticky;top:18px;background:linear-gradient(145deg,#e4eee7,#f2f4e8);border-color:#d4dfd2;box-shadow:0 18px 40px #355c3d10}
  .province-picker{grid-area:pick;background:#fffdf5;border-color:#e0e6d7;padding:18px 20px}
  .province-picker h2{display:inline-block;margin-right:20px;color:#294d40}.province-search-label{display:inline-block;margin-right:8px}.province-picker input{width:min(280px,100%);padding:8px 12px}
  .province-list{max-height:110px;gap:7px;margin-top:14px}.province-list button{padding:7px 11px;background:#f4f7ef;border-color:#e2e8dc;border-radius:11px;color:#45614f}
  .province-list button.active{background:#f5cb64;border-color:#d8ad4c}.province-list button.is-visited::after{content:' ·';color:#4c8b61;font-weight:900}
  .province-list button[hidden]{display:none}.province-card{grid-area:detail;background:#fffef9;border-color:#e0e6d7;padding:20px;min-width:0;box-shadow:0 15px 35px #355c3d08}
  .province-card h3{font-size:24px;color:#294d40;margin-bottom:4px}.province-badge{height:46px;width:46px;font-size:22px;background:#edf3e3;color:#527a58}
  .province-card>p{color:#687767;font-size:13px}.province-card ul{padding:14px 18px 14px 32px;background:#f2f6eb;border-radius:14px;color:#64725e;line-height:1.9}
  .province-read{white-space:nowrap}.china-progress{display:inline-block;margin-top:12px;border-radius:20px;background:#edf3e4;padding:6px 12px;color:#66805c;font-size:12px}
  .province-regions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.province-regions button,.province-card-nav button{font:inherit;font-size:11px;border-radius:20px;padding:7px 12px;background:#edf3e7;color:#496b53;border:1px solid #dfe8d7;cursor:pointer}
  .province-regions button[aria-pressed=true]{background:#547d61;color:white;border-color:#547d61}.province-card-nav{display:flex;justify-content:space-between;gap:8px;margin-top:18px}
  .province-search-empty{font-size:12px;color:#7d8c78}.province-search-empty[hidden]{display:none}
  @media(max-width:900px){.china-layout{grid-template-columns:1fr;grid-template-areas:'pick' 'map' 'detail'}.china-stage{position:relative;top:auto}.province-card{padding:18px}.province-list{max-height:125px}}
  @media(max-width:600px){.china-heading h1{font-size:28px}.province-picker{padding:14px}.province-picker h2{display:block}.province-picker input{width:100%}.province-search-label{display:block}.province-read{padding:7px;font-size:11px}.province-card-head{gap:8px}}
  @media(max-width:900px){.china-layout{grid-template-columns:1fr}.china-page{padding:18px 12px 46px}}
  `;
  document.head.append(style);

  // ── 状态 ────────────────────────────────────────────────────────────
  const state = {
    features: [],        // [{name, adcode, main:[ring...], inset:[ring...], screen:[ring...], bbox}]
    jd: [],              // 九段线环
    bounds: null,        // 主图经纬度范围（投影前的 px/py 空间）
    selected: null,
    hover: null,
    ripple: null,        // {x, y, t0}
    dirty: true,
    moved: false,
    photoCatalog: null,
    labels: [],          // 小省标签 [{name, x, y}]
    insetRect: null,     // 南海诸岛插图框
  };
  const KX = Math.cos(35 * Math.PI / 180);
  const TOL = { touch: 22, pen: 14, mouse: 10 };
  const SLACK = { touch: 18, pen: 12, mouse: 4 };
  const PALETTE = ['#d9e6ba', '#f4ddb1', '#c8e2d8', '#d7dcf1', '#ead5df', '#e6e6b7', '#cce2ec', '#f1d7bd'];
  const INSET_BOUNDS = { lon: [105.5, 122.0], lat: [2.5, 21.5] };   // 插图框内容范围
  const ctx = canvas.getContext('2d');
  const visited = new Set();
  const progress = document.createElement('span');progress.className='china-progress';
  page.querySelector('.china-heading').append(progress);

  function setStatus(text) { statusEl.textContent = text; }

  // ── 数据解析 ────────────────────────────────────────────────────────
  // 海南省的环：最高纬度 ≥18.5° 归主图（本岛与近岸岛），其余归南海诸岛插图。
  function parseGeojson(geo) {
    const byName = new Map(PROVINCES.map((p) => [p.name, p]));
    const out = [];
    for (const f of geo.features) {
      const props = f.properties || {};
      const adcode = String(props.adcode || '');
      if (adcode === '100000_JD') {                      // 九段线
        state.jd = ringsOf(f.geometry);
        continue;
      }
      const info = byName.get(props.name);
      if (!info) continue;                               // 地图里多出来的忽略
      const all = ringsOf(f.geometry);
      const main = [];
      const inset = [];
      if (info.adcode === 460000) {                      // 海南省：拆本岛与南海诸岛
        for (const ring of all) {
          let maxLat = -90;
          for (const pt of ring) maxLat = Math.max(maxLat, pt[1]);
          (maxLat >= 18.5 ? main : inset).push(ring);
        }
        if (!main.length || !inset.length) { main.push(...all); inset.length = 0; }
      } else {
        main.push(...all);
      }
      out.push({ name: props.name, adcode: info.adcode, short: info.short, main, inset, screen: [], bbox: null });
    }
    out.sort((a, b) => PROVINCES.findIndex((p) => p.name === a.name) - PROVINCES.findIndex((p) => p.name === b.name));
    return out;
  }

  function ringsOf(geometry) {
    if (!geometry) return [];
    if (geometry.type === 'Polygon') return geometry.coordinates.map((r) => r.map((pt) => [pt[0], pt[1]]));
    if (geometry.type === 'MultiPolygon') {
      const rings = [];
      for (const poly of geometry.coordinates) for (const ring of poly) rings.push(ring.map((pt) => [pt[0], pt[1]]));
      return rings;
    }
    return [];
  }

  // ── 投影与布局 ──────────────────────────────────────────────────────
  // 等距圆柱投影：x = lon·cos(35°)，y = -lat（先归一到 px/py 平面，再线性映射到屏幕）。
  // ⚠️ 主图的可用区域必须扣除右下角插图框——否则竖屏上插图会压住福建/广东海岸。
  function fitView() {
    const cssW = canvas.clientWidth;
    if (!cssW) return false;
    const cssH = Math.round(Math.min(Math.max(cssW * 0.70, 340), 620));
    canvas.style.height = cssH + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas._dpr = dpr;

    // 先定插图框（右下角，南海诸岛按国标单独成框）
    const insetW = Math.min(cssW * 0.30, 200);
    const insetH = insetW * 1.30;
    const insetMargin = 12;
    state.insetRect = {
      x: cssW - insetW - insetMargin,
      y: cssH - insetH - insetMargin,
      w: insetW,
      h: insetH,
    };

    // 主图范围（用省级边界，不含插图内容）
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of state.features) {
      for (const ring of f.main) {
        for (const pt of ring) {
          const x = pt[0] * KX, y = -pt[1];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const pad = Math.max(18, cssW * 0.03);
    const topPad = 44;                                   // 顶部状态条
    const bottomPad = 34;                                // 底部提示条
    const availW = cssW - pad * 2 - insetW - 14;         // 右侧给插图留出完整空间
    const availH = cssH - topPad - bottomPad;
    const scale = Math.min(availW / (maxX - minX), availH / (maxY - minY));
    const ox = pad + (availW - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = topPad + (availH - (maxY - minY) * scale) / 2 - minY * scale;
    state.view = { scale, ox, oy, cssW, cssH };
    // 插图框内部投影
    const iMinX = INSET_BOUNDS.lon[0] * KX, iMaxX = INSET_BOUNDS.lon[1] * KX;
    const iMinY = -INSET_BOUNDS.lat[1], iMaxY = -INSET_BOUNDS.lat[0];
    const innerTop = 26;                                 // “南海诸岛”标题占位
    const iScale = Math.min((insetW - 16) / (iMaxX - iMinX), (insetH - innerTop - 10) / (iMaxY - iMinY));
    state.insetView = {
      scale: iScale,
      ox: state.insetRect.x + (insetW - (iMaxX - iMinX) * iScale) / 2 - iMinX * iScale,
      oy: state.insetRect.y + innerTop + (insetH - innerTop - 10 - (iMaxY - iMinY) * iScale) / 2 - iMinY * iScale,
    };

    // 预投影到屏幕
    for (const f of state.features) {
      f.screen = f.main.map((ring) => ring.map((pt) => project(pt[0], pt[1])));
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const ring of f.screen) for (const [x, y] of ring) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
      f.bbox = [bx0, by0, bx1, by1];
    }
    buildLabels();
    state.dirty = true;
    return true;
  }

  function project(lon, lat) {
    const v = state.view;
    return [v.ox + lon * KX * v.scale, v.oy - lat * v.scale];
  }
  function projectInset(lon, lat) {
    const v = state.insetView;
    return [v.ox + lon * KX * v.scale, v.oy - lat * v.scale];
  }

  // 小省/难点的省份画名字标签（点标签也能选中）
  const LABEL_OFFSET = {
    北京市: [-4, -9], 天津市: [14, -7], 上海市: [20, -8], 重庆市: [-8, -11],
    宁夏回族自治区: [16, -6], 香港特别行政区: [30, 2], 澳门特别行政区: [26, 16],
    海南省: [6, 16],
  };
  function buildLabels() {
    state.labels = [];
    for (const f of state.features) {
      const seat = SEATS[f.name];
      if (!seat) continue;
      const [x, y] = project(seat[0], seat[1]);
      const w = f.bbox[2] - f.bbox[0], h = f.bbox[3] - f.bbox[1];
      const off = LABEL_OFFSET[f.name] || [0, -9];
      const need = (f.name === '香港特别行政区' || f.name === '澳门特别行政区' || w < 34 || h < 26);
      if (need) state.labels.push({ name: f.name, short: f.short, x: x + off[0], y: y + off[1] });
    }
  }

  // ── 绘制 ────────────────────────────────────────────────────────────
  function draw() {
    if (!state.view) return;
    const dpr = canvas._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cssW, cssH } = state.view || {};
    ctx.clearRect(0, 0, cssW, cssH);

    // 海
    ctx.fillStyle = '#dbe7e3';
    ctx.fillRect(0, 0, cssW, cssH);

    // 省
    for (const f of state.features) {
      if (!f.screen.length) continue;
      ctx.beginPath();
      for (const ring of f.screen) {
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
      }
      const idx = PROVINCES.findIndex((p) => p.name === f.name);
      ctx.fillStyle = PALETTE[((idx % PALETTE.length) + PALETTE.length) % PALETTE.length];
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(110,95,70,.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 悬停
    if (state.hover && state.hover !== state.selected) {
      const f = state.features.find((item) => item.name === state.hover);
      if (f) { fillFeature(f, 'rgba(242,193,78,.40)'); }
    }
    // 选中
    if (state.selected) {
      const f = state.features.find((item) => item.name === state.selected);
      if (f) {
        fillFeature(f, '#f2c14e');
        ctx.strokeStyle = '#a8742a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 小省标签
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const label of state.labels) {
      const showName = label.name.length <= 3
        ? label.name.replace(/省|市$/, '')
        : label.name.replace(/(省|市|特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区)$/, '');
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(showName, label.x, label.y);
      ctx.fillStyle = '#4a3c2c';
      ctx.fillText(showName, label.x, label.y);
    }

    drawInset();
    drawRipple();
  }

  function fillFeature(f, color) {
    ctx.beginPath();
    for (const ring of f.screen) {
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
    }
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  }

  function drawInset() {
    const r = state.insetRect;
    if (!r) return;
    // 框
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.strokeStyle = '#9c8a6d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.stroke();
    // 标题
    ctx.fillStyle = '#5b4a33';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('南海诸岛', r.x + r.w / 2, r.y + 13);
    // 岛屿
    const hainan = state.features.find((f) => f.adcode === 460000);
    if (hainan && hainan.inset.length) {
      ctx.beginPath();
      for (const ring of hainan.inset) {
        const s = ring.map((pt) => projectInset(pt[0], pt[1]));
        ctx.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
        ctx.closePath();
      }
      ctx.fillStyle = '#c3d69e';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(110,95,70,.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // 九段线
    if (state.jd.length) {
      ctx.beginPath();
      for (const ring of state.jd) {
        const s = ring.map((pt) => projectInset(pt[0], pt[1]));
        ctx.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
        ctx.closePath();
      }
      ctx.strokeStyle = '#8a7a5c';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRipple() {
    if (!state.ripple) return;
    const age = performance.now() - state.ripple.t0;
    const LIFE = 700;
    if (age >= LIFE) { state.ripple = null; return; }
    const t = age / LIFE;
    ctx.beginPath();
    ctx.arc(state.ripple.x, state.ripple.y, 6 + t * 30, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(242,193,78,${0.6 * (1 - t)})`;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.stroke();
  }

  // ── 命中判定（屏幕空间，evenodd 全环计数 + 边界容差）────────────────
  function ringContains(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function segmentDist2(ring, x, y) {
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xj, yj] = ring[j], [xi, yi] = ring[i];
      const dx = xi - xj, dy = yi - yj;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((x - xj) * dx + (y - yj) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = xj + t * dx - x, py = yj + t * dy - y;
      const d2 = px * px + py * py;
      if (d2 < best) best = d2;
    }
    return best;
  }

  // 返回 { name, distance } 或 null。distance 为像素（0 = 精确命中）。
  function pick(x, y, tolerance) {
    const r = state.insetRect;
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return { name: '海南省', distance: 0, inset: true };
    }
    // 标签命中（小省必配标签）
    for (const label of state.labels) {
      if (Math.hypot(label.x - x, label.y - y) <= 18) return { name: label.name, distance: 0 };
    }
    let bestName = null;
    let bestD2 = Infinity;
    for (const f of state.features) {
      const [bx0, by0, bx1, by1] = f.bbox;
      const pad = tolerance + 2;
      if (x < bx0 - pad || x > bx1 + pad || y < by0 - pad || y > by1 + pad) continue;
      let inside = false;
      for (const ring of f.screen) if (ringContains(ring, x, y)) inside = !inside;
      if (inside) return { name: f.name, distance: 0 };
      for (const ring of f.screen) {
        const d2 = segmentDist2(ring, x, y);
        if (d2 < bestD2) { bestD2 = d2; bestName = f.name; }
      }
    }
    if (bestName && Math.sqrt(bestD2) <= tolerance) return { name: bestName, distance: Math.sqrt(bestD2) };
    return null;
  }

  function toleranceFor(pointerType) {
    return TOL[pointerType] || TOL.mouse;
  }

  // ── 选择与卡片 ──────────────────────────────────────────────────────
  function select(name) {
    state.selected = name;
    state.dirty = true;
    const info = PROVINCES.find((p) => p.name === name);
    renderCard(info);
    visited.add(name);progress.textContent=`已认识 ${visited.size} / 34 个省级行政区`;
    for (const button of listEl.children) {
      button.classList.toggle('active', button.dataset.name === name);
      button.classList.toggle('is-visited',visited.has(button.dataset.name));
      button.setAttribute('aria-pressed',String(button.dataset.name===name));
    }
  }

  function renderCard(info) {
    if (!info) {
      cardEl.innerHTML = '<p class="province-empty">点一下地图上的彩色区域，或从上面挑一个省份。</p>';
      return;
    }
    const head = document.createElement('div');
    head.className = 'province-card-head';
    const badge = document.createElement('span');
    badge.className = 'province-badge';
    badge.textContent = info.short;
    const titleBox = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = info.name;
    const sub = document.createElement('small');
    const seatLabel = /市$|特别行政区$/.test(info.name) ? '城市' : /自治区$/.test(info.name) ? '首府' : '省会';
    sub.textContent = `简称 ${info.short} · ${seatLabel}：${info.capital}`;
    titleBox.append(title, sub);
    const read = document.createElement('button');
    read.type = 'button';
    read.className = 'province-read';
    read.textContent = '🔊 听介绍';
    read.addEventListener('click', () => {
      const text = `${info.name}，简称${info.short}。${info.intro} ${info.facts.join(' ')}`;
      if (typeof window.speak === 'function') { window.speak.cancel?.(); window.speak(text); }
    });
    head.append(badge, titleBox, read);
    const body = document.createElement('p');
    body.textContent = info.intro;
    const ul = document.createElement('ul');
    for (const fact of info.facts) {
      const li = document.createElement('li');
      li.textContent = fact;
      ul.append(li);
    }
    const nav = document.createElement('div');nav.className='province-card-nav';
    for (const [label,step] of [['← 上一个地方',-1],['下一个地方 →',1]]) {
      const next=document.createElement('button');next.type='button';next.textContent=label;
      next.addEventListener('click',()=>{const target=PROVINCES[(PROVINCES.indexOf(info)+step+PROVINCES.length)%PROVINCES.length];select(target.name);setStatus(`已选中 🏮 ${target.name}`);});nav.append(next);
    }
    const gallery=window.FufuProvinceGallery?.create(info,state.photoCatalog?.[String(info.adcode)]);
    cardEl.replaceChildren(head,body,...(gallery?[gallery]:[]),ul,nav);
  }

  function tapAt(x, y, tolerance) {
    state.ripple = { x, y, t0: performance.now() };
    const hit = pick(x, y, tolerance);
    if (!hit) { setStatus('这里是大海 · 点一块彩色的省试试'); state.dirty = true; return; }
    const info = PROVINCES.find((p) => p.name === hit.name);
    select(hit.name);
    setStatus(hit.inset ? `已选中 🏝️ 海南省 · ${SOUTH_SEA_NOTE}` : `已选中 🏮 ${hit.name}`);
  }

  // ── 交互 ────────────────────────────────────────────────────────────
  let pointer = null;
  function localXY(event) {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const [x, y] = localXY(event);
    pointer = { x, y, tolerance: toleranceFor(event.pointerType), slack: SLACK[event.pointerType] || SLACK.mouse };
    state.moved = false;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    const [x, y] = localXY(event);
    if (pointer) {
      if (Math.hypot(x - pointer.x, y - pointer.y) > pointer.slack) state.moved = true;
      return;
    }
    if (event.pointerType !== 'mouse') return;           // 触屏不做悬停
    const hit = pick(x, y, 0);
    const name = hit ? hit.name : null;
    if (name !== state.hover) { state.hover = name; state.dirty = true; }
    canvas.classList.toggle('is-pointable', Boolean(name));
  });
  const releasePointer = (event) => {
    if (!pointer) return;
    const tolerance = pointer.tolerance;
    pointer = null;
    if (state.moved) return;
    const [x, y] = localXY(event);
    tapAt(x, y, tolerance);
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('pointerleave', () => {
    if (state.hover) { state.hover = null; state.dirty = true; }
  });

  // 侧栏
  function buildList() {
    const frag = document.createDocumentFragment();
    for (const info of PROVINCES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.name = info.name;
      button.setAttribute('aria-pressed','false');
      button.textContent = `${info.short} ${info.name.replace(/(省|市|特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区)$/, '')}`;
      button.addEventListener('click', () => {
        select(info.name);
        setStatus(`已选中 🏮 ${info.name}`);
        const f = state.features.find((item) => item.name === info.name);
        if (f && f.bbox) {
          const cx = (f.bbox[0] + f.bbox[2]) / 2, cy = (f.bbox[1] + f.bbox[3]) / 2;
          state.ripple = { x: cx, y: cy, t0: performance.now() };
        }
      });
      frag.append(button);
    }
    listEl.replaceChildren(frag);
  }
  const REGION_CODES = {'华北':[11,12,13,14,15],'东北':[21,22,23],'华东':[31,32,33,34,35,36,37],'华中':[41,42,43],'华南':[44,45,46],'西南':[50,51,52,53,54],'西北':[61,62,63,64,65],'港澳台':[71,81,82]};
  let selectedRegion='全部';
  const regionBar=document.createElement('div');regionBar.className='province-regions';regionBar.setAttribute('role','group');regionBar.setAttribute('aria-label','按地区选择省份');
  const regionButtons=[];
  for(const region of ['全部',...Object.keys(REGION_CODES)]){const button=document.createElement('button');button.type='button';button.textContent=region;button.setAttribute('aria-pressed',String(region==='全部'));button.addEventListener('click',()=>{selectedRegion=region;regionButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));filterList();});regionButtons.push(button);regionBar.append(button);}
  page.querySelector('.province-picker').append(regionBar);
  const empty=document.createElement('p');empty.className='province-search-empty';empty.hidden=true;empty.textContent='没有找到，试试省份名、简称或省会。';page.querySelector('.province-picker').append(empty);
  function filterList() {
    const q = searchEl.value.trim().toLowerCase();
    let matches=0;
    for (const button of listEl.children) {
      const info = PROVINCES.find((p) => p.name === button.dataset.name);
      const hay = `${info.name}${info.short}${info.capital}`.toLowerCase();
      const inRegion=selectedRegion==='全部'||REGION_CODES[selectedRegion].includes(Math.floor(info.adcode/10000));
      button.hidden = !inRegion || Boolean(q) && !hay.includes(q);
      if(!button.hidden)matches++;
    }
    empty.hidden=matches>0;
  }
  searchEl.addEventListener('input',filterList);
  searchEl.addEventListener('keydown',event=>{if(event.key==='Enter'){const button=Array.from(listEl.children).find(item=>!item.hidden);if(button){select(button.dataset.name);setStatus(`已选中 🏮 ${button.dataset.name}`);}}});

  // ── 启动 ────────────────────────────────────────────────────────────
  function start(geo) {
    state.features = parseGeojson(geo);
    if (!state.features.length) { setStatus('地图数据为空，请刷新重试'); return; }
    buildList();
    renderCard(null);
    const ro = new ResizeObserver(() => fitView());
    ro.observe(canvas);
    fitView();
    select('北京市');
    setStatus('点一块彩色的省，认识它');

    const tick = () => {
      const active = page.classList.contains('active');
      const animating = Boolean(state.ripple) || state.hover;
      if (active && (state.dirty || animating)) { draw(); state.dirty = false; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  fetch('/assets/china.geojson')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(() => setStatus('地图加载失败，请刷新重试'));

  fetch('/api/geography/province-photos')
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then((data) => {
      state.photoCatalog = data.provinces || {};
      const info = PROVINCES.find((province) => province.name === state.selected);
      if (info) renderCard(info);
    })
    .catch((error) => {
      console.warn('省份照片暂时无法读取', error);
      state.photoCatalog = {};
      const info = PROVINCES.find((province) => province.name === state.selected);
      if (info) renderCard(info);
    });

  // 测试钩子：回归脚本用真实的 pick/draw/投影验证命中判定与绘制（不暴露任何写接口）
  window.FufuChinaMap = { pick, project, projectInset, fitView, toleranceFor, draw, state };
})();
