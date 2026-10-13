/* 故事卡片点击链路回归测试（无头 DOM）
 *
 * 为什么要有这个脚本：
 *   首页"故事与奇妙科学"预览条（#storyPreview）和图书馆页（#storyLibrary）
 *   用的是同一个 storyCard() 模板，但绑定代码只写了 #storyLibrary ——
 *   首页那三张卡从来没绑过点击，点了完全没反应。这个 bug 靠"看代码"很容易漏，
 *   所以这里用一个真实的 DOM 把点击链路跑一遍。
 *
 * 做法：从运行中的后端取**真实的 index.html 和 app.js**，
 *   在 jsdom 里只加载 DOM 骨架（不执行页面上的脚本），
 *   手动 eval app.js（去掉末尾的 init()，避免它去拉全网接口），
 *   然后造三条假故事喂给 renderStories()，最后真的派发一次 click，
 *   检查 #storyModal 有没有打开。
 *
 * 运行：node scripts/verify_story_click.js
 *   依赖 jsdom（装在受管 node 工作区）：
 *   NODE_PATH=C:\Users\rybof\.workbuddy\binaries\node\workspace\node_modules
 */
'use strict';

const { JSDOM } = require('jsdom');

const BASE = process.env.FUFU_BASE || 'http://127.0.0.1:8000';

let pass = 0;
let fail = 0;
function check(ok, label, extra) {
  if (ok) { pass++; console.log('  [OK]   ' + label); }
  else { fail++; console.log('  [FAIL] ' + label + (extra ? '  ' + extra : '')); }
}

function storyOf(id) {
  return {
    id,
    title: '测试故事 ' + id + ' 号',
    age: '6-8 岁',
    category: '自然科普',
    story_type: 'science',
    summary: '这是第 ' + id + ' 个用于回归测试的故事。',
    cover: '/assets/bear-sun.svg',
    color: '#f4e3c1',
    reading_minutes: 3,
    moral: '测试用寓意。',
    paragraphs: ['第一段正文。', '第二段正文。', '第三段正文。'],
    paragraph_images: [],
    audio_paths: [],
  };
}

function route(path) {
  if (/^\/api\/stories\/\d+$/.test(path)) {
    const id = Number(path.split('/').pop());
    return storyOf(id);
  }
  return {};
}

(async () => {
  console.log('故事卡片点击链路回归测试');
  console.log('  后端: ' + BASE + '\n');

  const htmlResponse = await fetch(BASE + '/', { headers: { 'Accept-Encoding': 'identity' } });
  const html = await htmlResponse.text();

  const match = html.match(/src="(\/app\.js\?[^"]*)"/);
  if (!match) { console.log('  找不到 app.js 的 script 标签，测试中止。'); process.exit(1); }
  const appUrl = match[1];
  const appSource = await (await fetch(BASE + appUrl)).text();
  console.log('  页面: ' + html.length + ' 字节 | 脚本: ' + appUrl + '（' + appSource.length + ' 字节）\n');

  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // ---- 最小桩：只补 app.js 真正会碰到的浏览器接口 ----
  window.FUFU_API_BASE = BASE;
  window.FufuTTS = { ensure() {}, cancel() {}, playUrls: async () => ({ done: true }), unlock() {} };
  window.fetch = async (url) => {
    const path = String(url).replace(BASE, '');
    return { ok: true, status: 200, json: async () => route(path) };
  };

  // 去掉末尾的 init()，只加载函数定义，避免真去拉整套接口
  const trimmed = appSource.replace(/\ninit\(\);?\s*$/, '\n');
  check(trimmed !== appSource, '已剥离 app.js 末尾的 init() 调用');
  // ⚠️ app.js 里是 `const state = ...`：jsdom 底层的 vm 里，顶层 const 既不挂到
  //    window 上、也不会在两次 window.eval 之间留存。所以整份源码包一层 IIFE，
  //    把需要操作的绑定显式 return 出来，后面统一走 window.__app。
  const wrapped = '(function(){\n' + trimmed + '\nreturn { state, renderStories, openStory, storyCard };\n})()';
  window.__app = window.eval(wrapped);
  check(Boolean(window.__app && window.__app.state), 'app.js 已加载并导出 state / renderStories',
    '实际: ' + Object.keys(window.__app || {}).join(','));

  // ---- 造三条故事，跑一遍真实的渲染 ----
  const stories = [storyOf(1), storyOf(2), storyOf(3)];
  const app = window.__app;
  app.state.stories = stories;
  app.state.storyPreview = stories.slice(0, 3);
  app.state.storyTotal = 3;
  app.state.storyPages = 1;
  app.state.storyPage = 1;
  app.state.storyType = '';
  app.state.storyTotals = { '': 3 };
  app.renderStories();

  const doc = window.document;
  const previewCards = doc.querySelectorAll('#storyPreview [data-story]');
  const libraryCards = doc.querySelectorAll('#storyLibrary [data-story]');
  check(previewCards.length === 3, '首页预览条渲染出 3 张卡片', '实际 ' + previewCards.length);
  check(libraryCards.length === 3, '图书馆页渲染出 3 张卡片', '实际 ' + libraryCards.length);

  // ---- 关键时刻 1：点首页卡片里的图片（不能只点按钮本身）----
  const modal = doc.querySelector('#storyModal');
  check(!modal.classList.contains('open'), '初始状态弹窗是关的');

  const img = previewCards[1].querySelector('img');
  check(Boolean(img), '首页卡片里有封面图（用于验证 closest 向上冒泡）');
  img.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 150));

  check(modal.classList.contains('open'), '★ 点首页故事卡片 → 故事弹窗打开（本次修复的目标）');
  const body = doc.querySelector('#storyBody');
  check(body.textContent.includes('测试故事 2 号'), '★ 打开的是被点的那一篇（第 2 篇）',
    '实际标题: ' + body.querySelector('h2')?.textContent);
  check(doc.querySelector('#storyCounter').textContent.includes('3 段'),
    '故事正文与段落数已填好', '实际: ' + doc.querySelector('#storyCounter').textContent);

  // ---- 关键时刻 2：图书馆页的卡片不能被这次改动弄坏 ----
  modal.classList.remove('open');
  libraryCards[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 150));
  check(modal.classList.contains('open'), '图书馆页卡片点击仍然正常（委托没有破坏原行为）');
  check(doc.querySelector('#storyBody').textContent.includes('测试故事 3 号'),
    '图书馆页打开的是第 3 篇');

  // ---- 关键时刻 3：点筛选条 / 非卡片不该误开 ----
  modal.classList.remove('open');
  doc.querySelector('#storyFilters').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));
  check(!modal.classList.contains('open'), '点故事分类筛选条不会误开弹窗');

  // ---- 关键时刻 4：委托只注册一次，重复渲染不会叠加监听 ----
  app.renderStories();
  app.renderStories();
  modal.classList.remove('open');
  doc.querySelectorAll('#storyPreview [data-story]')[0].dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 150));
  check(modal.classList.contains('open'), '反复重渲染后仍然只有一份监听、点击依然生效');
  check(doc.querySelector('#storyBody').textContent.includes('测试故事 1 号'),
    '重渲染后打开的是第 1 篇');
  check(window.__fufuStoryClickBound === true, '委托注册标记已置位（只注册一次）');

  // ---- 负向对照：把委托块摘掉（等价于修复前的状态），同样点一下应当"没反应" ----
  // 没有这段，"测试通过"就只是空过 —— 无法证明它真的能抓到这个 bug。
  console.log('\n负向对照（摘掉委托，模拟修复前的代码）：');
  // ⚠️ frontend/app.js 是 CRLF 换行 —— 正则里必须写 \r?\n，只写 \n 会匹配不上。
  const brokenSource = appSource.replace(
    /\r?\n  if\(!window\.__fufuStoryClickBound\)\{[\s\S]*?\r?\n  \}\r?\n/, '\r\n');
  check(brokenSource !== appSource, '已成功摘掉委托块');
  const dom2 = new JSDOM(html, { url: BASE + '/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.FUFU_API_BASE = BASE;
  dom2.window.FufuTTS = window.FufuTTS;
  dom2.window.fetch = window.fetch;
  dom2.window.__app = dom2.window.eval(
    '(function(){\n' + brokenSource.replace(/\ninit\(\);?\s*$/, '\n')
    + '\nreturn { state, renderStories };\n})()');
  dom2.window.__app.state.stories = [storyOf(1), storyOf(2), storyOf(3)];
  dom2.window.__app.state.storyPreview = dom2.window.__app.state.stories.slice(0, 3);
  dom2.window.__app.state.storyTotal = 3;
  dom2.window.__app.state.storyTotals = { '': 3 };
  dom2.window.__app.renderStories();
  const modal2 = dom2.window.document.querySelector('#storyModal');
  dom2.window.document.querySelectorAll('#storyPreview [data-story]')[0].dispatchEvent(
    new dom2.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 150));
  check(!modal2.classList.contains('open'),
    '★ 摘掉委托后，点首页卡片确实没反应（证明本测试能抓到这个 bug）');
  dom2.window.close();

  console.log('\n' + '='.repeat(52));
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.log('\n  测试异常中止: ' + error.stack);
  process.exit(1);
});
