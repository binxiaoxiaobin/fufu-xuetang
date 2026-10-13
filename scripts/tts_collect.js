// 采集全站需要朗读的固定文案，输出 JSON 到 stdout。
// 数据来源与前端播放点保持同一字面量：app.js 的 decks、moon/solar/lunar/globe
// 的数据数组，以及数据库导入源 earth_culture.json。
// 用法：node scripts/tts_collect.js
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const FE = path.join(ROOT, 'frontend');
const read = (name) => fs.readFileSync(path.join(FE, name), 'utf8');

// 从源码中提取 anchor 之后第一个平衡的 {..} 或 [..]，返回其内部片段（含括号）
function extractBalanced(src, anchor) {
  const start = src.indexOf(anchor);
  if (start < 0) throw new Error('anchor not found: ' + anchor);
  let i = src.indexOf('{', start), j = src.indexOf('[', start);
  let open = i < 0 ? '[' : (j < 0 ? '{' : (i < j ? '{' : '['));
  const close = open === '{' ? '}' : ']';
  let from = Math.min(...[i, j].filter(n => n >= 0));
  let depth = 0;
  for (let p = from; p < src.length; p++) {
    const ch = src[p];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      p++;
      while (p < src.length) {
        if (src[p] === '\\') { p += 2; continue; }
        if (src[p] === quote) break;
        p++;
      }
      continue;
    }
    if (ch === '/' && src[p + 1] === '/') { while (p < src.length && src[p] !== '\n') p++; continue; }
    if (ch === '/' && src[p + 1] === '*') { p += 2; while (p < src.length && !(src[p] === '*' && src[p + 1] === '/')) p++; p++; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return src.slice(from, p + 1); }
  }
  throw new Error('unbalanced block for: ' + anchor);
}

function evalLiteral(src) {
  return new Function('"use strict";return (' + src + ');')();
}

// ---------- 1) 学习卡片（app.js decks） ----------
const appSrc = read('app.js');
const letterWords = evalLiteral(extractBalanced(appSrc, 'const letterWords ='));
const decks = new Function('letterWords', '"use strict";return (' + extractBalanced(appSrc, 'const decks =') + ');')(letterWords);
const cardZh = [];
const cardEn = [];
for (const [deckId, deck] of Object.entries(decks)) {
  if (!deck.groups) continue;
  for (const group of deck.groups) {
    for (const entry of group.entries) {
      const spoken = entry[2] || entry[0];
      (deckId === 'letters' ? cardEn : cardZh).push(spoken);
    }
  }
}
// 九九乘法表（app.js renderDeck 动态生成：第 n 行 factor 乘 n 等于积，小乘数在前，共 45 条）
for (let n = 1; n <= 9; n++) {
  for (let factor = 1; factor <= n; factor++) cardZh.push(`${factor}乘${n}等于${factor * n}`);
}

// ---------- 2) 月相 / 潮汐（moon.js） ----------
const moonSrc = read('moon.js');
const phases = evalLiteral(extractBalanced(moonSrc, 'const phases ='));
const moonTexts = phases.map(phase =>
  `现在我们看到的是${phase.name}。${phase.text}月相的变化，是因为从地球看到的受光月面不断改变。完整的月相周期大约是二十九天半。`);
const tideBody = '月球一侧受到较强的引力，背向月球的一侧在地月共同运动中也形成隆起。蓝色的两个隆起表示理想化的高潮区域。';
const tideExtra = {
  spring: '新月或满月附近，太阳和月球的潮汐作用方向大致一致，潮差往往更大。实际海岸的潮位还会受到地形、水深和天气影响。',
  neap: '上弦月或下弦月附近，太阳和月球的潮汐作用方向大致成直角，潮差往往较小。实际海岸的潮位还会受到地形、水深和天气影响。',
  base: '拖动时间滑杆，比较新月、上弦月与满月附近的潮汐差别。实际海岸的潮位还会受到地形、水深和天气影响。'
};
for (const key of ['spring', 'neap', 'base']) {
  moonTexts.push(`来看潮汐力。${tideBody}${tideExtra[key]}这里展示的是原理。真实海岸的潮位还会受到海岸形状、水深和天气等影响。`);
}

// ---------- 3) 太阳系（solar.js） ----------
const bodies = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/seed_data/solar_catalog.json'), 'utf8'));
const solarTexts = bodies.map(body =>
  `让我们认识${body.name}。${body.intro}${body.detail}${body.id === 'sun' ? '' : `它${body.id === 'moon' ? '绕地球' : '绕太阳'}一周，大约需要${body.year}。`}`);

// ---------- 4) 月面陨石坑（lunar.js） ----------
const lunarSrc = read('lunar.js');
const places = evalLiteral(extractBalanced(lunarSrc, 'const places'));
const lunarTexts = places.map(p =>
  `${p.name}。${p.text}${p.fact}这里的地形起伏经过夸张，方便观察。`);
lunarTexts.push('月球表面有许多撞击留下的环形山。撞击会挖出坑穴、抛出碎屑，有些较大的坑中央还会形成隆起的中央峰。月面起伏经过夸张，让我们更容易看清地形。');

// ---------- 5/6) Database seed for reviewed earth culture ----------
const earthCulture=JSON.parse(fs.readFileSync(path.join(ROOT,'backend/seed_data/earth_culture.json'),'utf8'));
const globeTexts=Object.values(earthCulture.countries).map(item=>item.narration);
(async()=>{
  const landmarkTexts=Object.values(earthCulture.landmarks).map(item=>item.narration);

  // ---------- 7) 黏土动物园（clay-safari/src/data.js 的 ITEMS，ESM） ----------
  const safariZh = [], safariEn = [];
  const dataUrl = pathToFileURL(path.join(FE, 'clay-safari', 'src', 'data.js')).href;
  const safariData = await import(dataUrl);
  for (const item of safariData.ITEMS) {
    if (item.cn) safariZh.push(item.cn);
    if (item.en) safariEn.push(item.en);
  }
  safariEn.push(
    'Welcome to the clay zoo!',
    "Let's go on a tour!",
    'The tour is over. Great job, explorer!',
    'Congratulations! You found all the animals!'
  );

  const out = {
    card_zh: cardZh,
    card_en: cardEn,
    safari_zh: safariZh,
    safari_en: safariEn,
    curious: [...moonTexts, ...solarTexts, ...lunarTexts, ...globeTexts, ...landmarkTexts],
    counts: {
      card_zh: cardZh.length, card_en: cardEn.length,
      safari_zh: safariZh.length, safari_en: safariEn.length,
      moon: moonTexts.length, solar: solarTexts.length,
      lunar: lunarTexts.length, globe: globeTexts.length,
      landmark: landmarkTexts.length
    }
  };
  process.stdout.write(JSON.stringify(out, null, 0));
})();
