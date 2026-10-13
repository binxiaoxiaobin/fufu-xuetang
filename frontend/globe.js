/* Interactive globe for the geography corner. Country outlines are stored locally. */
(() => {
  const facts = {
    China: ['中国', '亚洲', '', '', 104, 35, '🏯'],
    Japan: ['日本', '亚洲', '', '', 139, 37, '🗾'],
    India: ['印度', '亚洲', '', '', 79, 22, '🐘'],
    Thailand: ['泰国', '亚洲', '', '', 101, 16, '🥭'],
    Mongolia: ['蒙古国', '亚洲', '', '', 103, 46, '🐎'],
    Indonesia: ['印度尼西亚', '亚洲', '', '', 118, -2, '🏝️'],
    Australia: ['澳大利亚', '大洋洲', '', '', 134, -25, '🦘'],
    'New Zealand': ['新西兰', '大洋洲', '', '', 173, -41, '🐑'],
    Egypt: ['埃及', '非洲', '', '', 30, 27, '🔺'],
    Kenya: ['肯尼亚', '非洲', '', '', 38, 0, '🦒'],
    'South Africa': ['南非', '非洲', '', '', 24, -29, '🌿'],
    France: ['法国', '欧洲', '', '', 2, 47, '🗼'],
    'United Kingdom': ['英国', '欧洲', '', '', -2, 54, '🕰️'],
    Germany: ['德国', '欧洲', '', '', 10, 51, '🏰'],
    Italy: ['意大利', '欧洲', '', '', 12, 42, '🍕'],
    Spain: ['西班牙', '欧洲', '', '', -4, 40, '☀️'],
    Russia: ['俄罗斯', '欧洲与亚洲', '', '', 90, 61, '🌲'],
    USA: ['美国', '北美洲', '', '', -100, 39, '🏞️'],
    Canada: ['加拿大', '北美洲', '', '', -105, 58, '🍁'],
    Mexico: ['墨西哥', '北美洲', '', '', -102, 24, '🌵'],
    Brazil: ['巴西', '南美洲', '', '', -52, -11, '🦜'],
    Argentina: ['阿根廷', '南美洲', '', '', -64, -35, '⛰️'],
    Chile: ['智利', '南美洲', '', '', -71, -33, '🌊'],
    Peru: ['秘鲁', '南美洲', '', '', -75, -10, '🦙']
  };
  let culture=null,cultureError=false,cultureReader;
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function loadCulture(){
    cultureError=false;renderCard();
    try{
      const module=await import('./earth-culture.js?v=20261010-culture-1');
      cultureReader=module.readCulture;culture=await module.loadEarthCulture();
    }catch(error){cultureError=true;console.warn(error);}
    renderCard();
  }

  const canvas = document.querySelector('#globeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const search = document.querySelector('#countrySearch');
  const list = document.querySelector('#countryList');
  const card = document.querySelector('#countryCard');
  const status = document.querySelector('#globeStatus');
  const groups = ['全部', '亚洲', '欧洲', '非洲', '北美洲', '南美洲', '大洋洲'];
  // 命中判定交给 globe-hit.js（纯几何，可以用 Node 离线跑测试）；绘制也用它，
  // 这样"看到什么"与"点得到什么"必然一致，不会再各算各的。
  const hit = window.FufuGlobeHit;
  if (!hit) {
    if (status) status.textContent = '地球仪组件没有加载，请刷新页面重试。';
    return;
  }
  const landmarks = {
    China:'长城烽火台',Japan:'富士山',India:'泰姬陵',Egypt:'胡夫大金字塔',Thailand:'曼谷大皇宫',
    France:'埃菲尔铁塔','United Kingdom':'大本钟与伊丽莎白塔',
    USA:'自由女神像',Australia:'悉尼歌剧院',Italy:'罗马斗兽场',Brazil:'里约基督像'
  };
  const state = { countries: [], lon: 105, lat: 24, zoom: 1, selected: 'China', region: '全部', width: 0, height: 0, dragging: false, moved: false, lift: 0, tap: null, tapRunning: false };
  let picker = null;
  const radians = Math.PI / 180;
  const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;

  function point(lon, lat) {
    const longitude = wrap(lon - state.lon) * radians;
    const latitude = lat * radians;
    const center = state.lat * radians;
    const cos = Math.cos(latitude);
    return [cos * Math.sin(longitude), Math.sin(latitude) * Math.cos(center) - cos * Math.cos(longitude) * Math.sin(center), Math.sin(latitude) * Math.sin(center) + cos * Math.cos(longitude) * Math.cos(center)];
  }
  function radius() { return Math.min(state.width, state.height) * .43 * state.zoom; }
  // 当前取景。绘制与命中判定共用这一份描述。
  function view() {
    return { width: state.width, height: state.height, radius: radius(), centerLon: state.lon, centerLat: state.lat };
  }
  function maxZoom() { return state.width < 480 || state.height < 420 ? 1.6 : 1.85; }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width; state.height = rect.height;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }
  function draw() {
    const { width: w, height: h } = state;
    if (!w || !h) return;
    const cx = w / 2, cy = h / 2, r = radius();
    ctx.clearRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(cx, cy, r * .8, cx, cy, r * 1.18);
    halo.addColorStop(0, '#85c8d100'); halo.addColorStop(1, '#85c8d122');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2); ctx.fill();
    const ocean = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .08, cx + r * .25, cy + r * .2, r * 1.35);
    ocean.addColorStop(0, '#92d6d8'); ocean.addColorStop(.5, '#5faebd'); ocean.addColorStop(1, '#276c90');
    ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = '#ffffff3b'; ctx.lineWidth = .8;
    for (let lat = -60; lat <= 60; lat += 30) drawGrid(Array.from({length: 181}, (_, i) => [-180 + i * 2, lat]), cx, cy, r);
    for (let lon = -180; lon < 180; lon += 30) drawGrid(Array.from({length: 91}, (_, i) => [lon, -90 + i * 2]), cx, cy, r);
    const viewport = view();
    let chosenPath = null;
    for (const country of state.countries) {
      const path = new Path2D();
      const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
      let hasShape = false;
      for (const polygon of polygons) for (const ring of polygon) {
        // 裁剪（把背面切掉）+ 投影，与命中判定共用同一份实现
        const points = hit.projectRing(ring, viewport);
        if (points.length < 3) continue;
        path.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
        path.closePath(); hasShape = true;
      }
      if (!hasShape) continue;
      const selected = country.properties.name === state.selected;
      ctx.fillStyle = facts[country.properties.name] ? '#c4dc9f' : '#9fc5b7';
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = '#629a8b';
      ctx.lineWidth = .75;
      ctx.stroke(path);
      if (selected) chosenPath = path;
    }
    if (chosenPath) {
      ctx.save();
      ctx.translate(0, -9 * state.lift);
      ctx.shadowColor = '#163b30bb'; ctx.shadowBlur = 16 * state.lift; ctx.shadowOffsetY = 9 * state.lift;
      ctx.fillStyle = '#fbd48a'; ctx.fill(chosenPath, 'evenodd');
      ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#fff4d0'; ctx.lineWidth = 2.5; ctx.stroke(chosenPath);
      ctx.restore();
    }
    const shade = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    shade.addColorStop(0, '#ffffff20'); shade.addColorStop(.62, '#00000000'); shade.addColorStop(1, '#103c5a55');
    ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const chosen = facts[state.selected];
    if (chosen && state.lift > .05) {
      const p = point(chosen[4], chosen[5]);
      if (p[2] > 0) {
        const x = cx + p[0] * r, y = cy - p[1] * r - 10 * state.lift;
        ctx.strokeStyle = `rgba(255,232,165,${.55 * state.lift})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 13 + 5 * state.lift, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff3cf'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#e3f8eecc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    drawTapMark();
  }
  /* 手指落点的可见反馈。不画出来的话，用户根本不知道自己点在了哪个像素上，
   * 只要没选中就只能是"感觉点不中"，也没法判断是手感问题还是定位问题。 */
  function drawTapMark() {
    if (!state.tap) return;
    const age = Math.min(1, (performance.now() - state.tap.at) / 820);
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = '#fff4d0'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(state.tap.x, state.tap.y, 8 + 26 * age, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff8e6';
    ctx.beginPath(); ctx.arc(state.tap.x, state.tap.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function animateTapMark() {
    if (state.tapRunning) return;
    state.tapRunning = true;
    const step = () => {
      if (!state.tap || performance.now() - state.tap.at > 860) {
        state.tap = null; state.tapRunning = false; draw(); return;
      }
      draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /* 处理一次"点选"：把手指落点交给 globe-hit 判定，并把结果告诉用户 */
  function tapAt(x, y, tolerance) {
    state.tap = { x: x, y: y, at: performance.now() };
    const found = picker ? picker.pick(view(), x, y, tolerance) : null;
    if (!found) {
      status.textContent = '这里没有国家 · 点浅绿色的陆地试试';
    } else if (facts[found.name]) {
      status.textContent = `已选中 ${facts[found.name][6]} ${facts[found.name][0]}`;
      select(found.name);
    } else {
      status.textContent = `这里是 ${found.name}，它的卡片还在准备中`;
    }
    animateTapMark();
  }
  function drawGrid(points, cx, cy, r) {
    ctx.beginPath(); let drawing = false;
    for (const [lon, lat] of points) {
      const p = point(lon, lat);
      if (p[2] <= 0) { drawing = false; continue; }
      const x = cx + p[0] * r, y = cy - p[1] * r;
      if (drawing) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      drawing = true;
    }
    ctx.stroke();
  }
  function renderList() {
    const query = search.value.trim().toLowerCase();
    list.innerHTML = '';
    for (const [key, fact] of Object.entries(facts)) {
      if (state.region !== '全部' && fact[1] !== state.region && !(key === 'Russia' && state.region === '欧洲')) continue;
      if (query && !`${fact[0]} ${key} ${key === 'United Kingdom' ? 'UK England 英格兰' : ''} ${fact[1]}`.toLowerCase().includes(query)) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'country-option' + (key === state.selected ? ' active' : '');
      button.innerHTML = `<span>${fact[6]}</span><strong>${fact[0]}${landmarks[key] ? ' <em class="country-model-mark">3D</em>' : ''}</strong><small>${fact[1]}</small>`;
      button.addEventListener('click', () => select(key));
      list.append(button);
    }
    if (!list.children.length) list.innerHTML = '<p class="country-empty">没有找到国家，换个名字试试。</p>';
  }
  function renderCard() {
    const fact=facts[state.selected];if(!fact)return;
    const item=culture?.countries[state.selected];
    card.innerHTML=`<div class="country-card-icon">${fact[6]}</div><div class="eyebrow">历史文化 · ${fact[1]}</div><h2>${fact[0]}</h2>`;
    if(!item){
      card.insertAdjacentHTML('beforeend',cultureError?'<p>历史文化介绍暂时未加载。</p><button class="country-read" type="button">重新加载介绍</button>':'<p role="status">正在展开历史文化故事…</p>');
      card.querySelector('button')?.addEventListener('click',loadCulture);return;
    }
    card.insertAdjacentHTML('beforeend',`<p>${escape(item.intro)}</p><p>${escape(item.detail)}</p><button class="country-read" type="button">🔊 听历史文化介绍</button>${landmarks[state.selected]?`<button class="country-landmark" type="button">🏛️ 观察${escape(landmarks[state.selected])} 3D 模型 →</button>`:''}<a class="landmark-source" href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">历史文化资料 ↗</a>`);
    card.querySelector('.country-read').addEventListener('click',()=>cultureReader(item));
    card.querySelector('.country-landmark')?.addEventListener('click',()=>window.openLandmark?.(state.selected));
  }
  function select(key) {
    if (!facts[key]) return;
    window.FufuTTS?.cancel('country-change');
    state.selected = key; state.lon = facts[key][4]; state.lat = facts[key][5];
    const started = performance.now();
    function lift(now) {
      state.lift = Math.min(1, (now - started) / 460);
      draw();
      if (state.lift < 1) requestAnimationFrame(lift);
    }
    requestAnimationFrame(lift);
    renderList(); renderCard(); draw();
  }
  document.querySelector('#regionFilters').innerHTML = groups.map(group => `<button type="button" class="region-chip${group === '全部' ? ' active' : ''}" data-region="${group}">${group}</button>`).join('');
  document.querySelector('#regionFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-region]'); if (!button) return;
    state.region = button.dataset.region;
    document.querySelectorAll('.region-chip').forEach(chip => chip.classList.toggle('active', chip === button));
    renderList();
  });
  search.addEventListener('input', renderList);
  let pointer = null;
  // 手指按在屏幕上总会抖几像素；阈值卡在 4px 的话，每一次想"点国家"都会被
  // 判成拖动，于是抬手时直接 return —— 平板上的国家就永远点不中。
  // 按指针类型分别给阈值：鼠标保持精确，手指放宽到 18px。
  const SLACK = { touch: 18, pen: 12, mouse: 4 };
  const slackFor = event => SLACK[event.pointerType] || SLACK.mouse;
  canvas.addEventListener('pointerdown', event => {
    pointer = {
      x: event.clientX, y: event.clientY, lon: state.lon, lat: state.lat,
      slack: slackFor(event), tolerance: hit.toleranceFor(event.pointerType),
    };
    state.moved = false; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > pointer.slack) state.moved = true;
    if (!state.moved) return;
    state.lon = wrap(pointer.lon - dx * .33 / state.zoom);
    state.lat = Math.max(-75, Math.min(75, pointer.lat + dy * .33 / state.zoom));
    draw();
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointer) return;
    const tolerance = pointer.tolerance;
    pointer = null;
    if (state.moved) return; // 明确是在拖动地球，不算点选
    const rect = canvas.getBoundingClientRect();
    tapAt(event.clientX - rect.left, event.clientY - rect.top, tolerance);
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    state.zoom = Math.max(.72, Math.min(maxZoom(), state.zoom - Math.sign(event.deltaY) * .11));
    draw();
  }, { passive: false });
  document.querySelector('#globeZoomIn').addEventListener('click', () => { state.zoom = Math.min(maxZoom(), state.zoom + .12); draw(); });
  document.querySelector('#globeZoomOut').addEventListener('click', () => { state.zoom = Math.max(.72, state.zoom - .1); draw(); });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  state.lift = 1;
  renderList(); renderCard(); resize(); loadCulture();
  fetch('/assets/world.geojson').then(response => { if (!response.ok) throw new Error('地图加载失败'); return response.json(); }).then(data => {
    state.countries = data.features.map(feature => feature.properties.name === 'England' ? { ...feature, properties: { ...feature.properties, name: 'United Kingdom' } } : feature);
    picker = hit.create(state.countries);
    status.textContent = '拖动地球探索 · 点击浅绿色国家查看卡片';
    draw();
  }).catch(() => { status.textContent = '地图暂时无法显示，请刷新页面重试。'; });
})();

