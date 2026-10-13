import {createKartLauncher} from './kart-fullscreen.js?v=20261010-game-password-1';
const host = document.getElementById('page-arcade');
const kartLauncher = createKartLauncher(host);
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = '/assets/games/toy2game/arcade.css?v=20261012-game-layout-1'; document.head.append(css);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
host.querySelector('h1').textContent = '团团游戏乐园';
host.querySelector('.eyebrow').textContent = '和团团一起玩';
host.querySelector('.library-head p').textContent = '动动脑，试试身手，或出发去冒险。选一种玩法，轻松玩一会儿。';
const shortcuts = document.createElement('nav'); shortcuts.className = 'arcade-shortcuts'; shortcuts.setAttribute('aria-label','游戏分类');
shortcuts.innerHTML = '<a href="#arcade-small">小型 3D 游戏 <span>桌面玩具与益智</span></a><a href="#arcade-simple">轻松小游戏 <span>数独、迷宫与扫雷</span></a><a href="#arcade-platformer">精品像素游戏 <span>闯关、探索与打字塔防</span></a><a href="#arcade-action">动作与射击 <span>飞行、弹幕与守卫战</span></a><a href="#arcade-puzzles">拼图与推箱子 <span>慢慢想，动动手</span></a><a href="#arcade-adventure">探索与竞速 <span>驾驶、骑行与海底探索</span></a>';
host.querySelector('.library-head').append(shortcuts);
shortcuts.addEventListener('click', event => {
  const link = event.target.closest('a'); if (!link) return;
  const section = host.querySelector(link.getAttribute('href')); if (!section) return;
  event.preventDefault(); section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
});
const catalogue = document.createElement('section'); catalogue.className = 'toy-catalogue';
catalogue.innerHTML = '<p role="status">正在准备游戏…</p>'; host.querySelector('.library-head').after(catalogue);
const classics = document.createElement('section'); classics.id='arcade-simple'; classics.className = 'toy-classics arcade-collection'; classics.innerHTML = '<div class="toy-section-head"><div><small>02 · 随点随玩</small><h2>轻松小游戏</h2><p>数独、迷宫和扫雷。点下方标签切换玩法。</p></div><span class="collection-count">3 款游戏</span></div>';
for (const element of [host.querySelector('.game-tabs'), host.querySelector('.game-layout')]) classics.append(element);
host.append(classics);
const page = document.createElement('main'); page.id = 'page-toy-game'; page.className = 'page toy-game-page';
page.innerHTML = '<header class="toy-game-toolbar"><button type="button" class="toy-back">← 返回游戏乐园</button><strong></strong><span role="status" aria-live="polite"></span><button type="button" class="toy-fullscreen" hidden>全屏探索</button><button type="button" class="toy-reload" hidden>重新加载</button></header><div class="toy-game-stage"><p class="toy-loading" role="status">正在打开游戏…</p></div>';
host.after(page);
const toolbar = page.querySelector('.toy-game-toolbar'), status = toolbar.querySelector('[role=status]'), stage = page.querySelector('.toy-game-stage');
let games = [], frame = null, current = null, closing = false, returnToArcade = false, loading = false;
async function loadCatalogue() {
  if (loading) return; loading = true;
  try {
    const response = await fetch('/api/toy-games', {credentials:'same-origin'}), data = await response.json();
    if (!response.ok) throw new Error(data.error || '游戏暂时没有准备好');
    games = data.games;
    const card = game => `<button type="button" class="toy-card" data-toy="${escape(game.id)}"><img src="${escape(game.cover)}?v=20261012-astra-original-1" alt="${escape(game.title)}游戏画面" loading="lazy" width="600" height="400"><span class="toy-card-copy"><b>${escape(game.title)}</b><span>${escape(game.description)}</span><small>${escape(game.duration)} · ${game.fullscreenRequired?'全屏体验':game.saveLabel|| (game.resume?'自动保存进度':'触屏操作')}</small><em>${game.hasSave&&game.resume?'继续玩':game.fullscreenRequired?'查看玩法 · 全屏开始':'打开游戏'} →</em></span></button>`;
    const small = games.filter(game => game.collection === 'small-3d' || (!game.collection && !game.fullscreenRequired));
    const large = games.filter(game => game.collection === 'adventure-3d' || (!game.collection && game.fullscreenRequired));
    const platformers = games.filter(game => game.collection === 'platformer-2d');
    const actionGames = games.filter(game => game.collection === 'action-arcade');
    const puzzles = games.filter(game => game.collection === 'puzzle-2d');
    catalogue.innerHTML = `<section id="arcade-small" class="arcade-collection"><div class="toy-section-head"><div><small>01 · 桌面玩具</small><h2>小型 3D 游戏</h2><p>移车解谜、记忆配对、平衡挑战。可以和电脑一起玩。</p></div><span class="collection-count">${small.length} 款游戏</span></div><div class="toy-grid">${small.map(card).join('')}</div><p class="toy-footnote">移车出库每天首次通关可得 5 积分。</p></section>`;
    catalogue.append(classics);
    catalogue.insertAdjacentHTML('beforeend', `<section id="arcade-platformer" class="arcade-collection"><div class="toy-section-head"><div><small>03 · 像素世界</small><h2>精品像素游戏</h2><p>追逐星光、探索宫殿、执行间谍任务，或试试打字塔防。保留原版玩法，支持暂停与触屏操作。</p></div><span class="collection-count">${platformers.length} 款游戏</span></div><div class="toy-grid">${platformers.map(card).join('')}</div><p class="toy-footnote">探索与闯关进度按账号保存；打字塔防保存词表与音量，每次打开开始新的一局。游戏得分不计入学习积分。</p></section>`);
    catalogue.insertAdjacentHTML('beforeend', `<section id="arcade-action" class="arcade-collection"><div class="toy-section-head"><div><small>04 · 反应与策略</small><h2>动作与射击</h2><p>飞过浮空花园、穿越五大空域，或守住最后的信标。保留原版画面和玩法，中文界面，电脑和触屏都能玩。</p></div><span class="collection-count">${actionGames.length} 款游戏</span></div><div class="toy-grid">${actionGames.map(card).join('')}</div><p class="toy-footnote">最高分与设置随学习账号保存；钢铁防线还可继续下一战区。游戏成绩不计入学习积分。</p></section>`);
    catalogue.insertAdjacentHTML('beforeend', `<section id="arcade-puzzles" class="arcade-collection"><div class="toy-section-head"><div><small>05 · 慢慢想</small><h2>拼图与推箱子</h2><p>拖动图块拼出风景，或挑战 73 道推箱子谜题。支持触屏，当前进度按学习账号保存。</p></div><span class="collection-count">${puzzles.length} 款游戏</span></div><div class="toy-grid">${puzzles.map(card).join('')}</div><p class="toy-footnote">拼图可选择 9、16、25 块；推箱子走错了可以撤销。</p></section>`);
    catalogue.insertAdjacentHTML('beforeend', `<section id="arcade-adventure" class="arcade-collection arcade-adventure"><div class="toy-section-head"><div><small>06 · 出发去冒险</small><h2>探索与竞速</h2><p>驾驶、骑行，或照顾自己的海底小鱼。建议平板横屏，海底探索可随时保存后返回。</p></div><span class="collection-count">${large.length} 款游戏</span></div><div class="toy-grid">${large.map(card).join('')}</div><p class="toy-footnote">可随时暂停。驾驶与骑行退出全屏会结束本局；海底探索按账号自动保存进度。游戏内金币不计入学习积分。</p></section><details class="arcade-sources"><summary>游戏来源与许可</summary><p class="toy-footnote"><a href="https://github.com/asmoyou/toy2game" target="_blank" rel="noreferrer">桌面玩具游戏原作</a> · <a href="/assets/games/toy2game/LICENSE.txt" target="_blank">非商业许可</a><br><a href="https://github.com/bridge-mind/turbo-kart-rally" target="_blank" rel="noreferrer">海岛卡丁车原作</a> · <a href="/assets/games/turbo-kart-rally/LICENSE.txt" target="_blank">开源许可</a><br><a href="https://github.com/Imirushik/sunbreak-downhill-3D-game" target="_blank" rel="noreferrer">晴山飞驰原作</a> · 原作者暂未声明授权许可，当前仅作本地适配。<br><a href="https://github.com/vasu-devs/FishSlop_Opus5.5" target="_blank" rel="noreferrer">海底小鱼乐园原作</a> · <a href="/assets/games/fishslop/ATTRIBUTION.txt" target="_blank">来源与适配说明</a></p><p class="toy-footnote"><a href="https://astragames.aigccreative.com/zh-CN/works/mosswing-1820f5c8" target="_blank" rel="noreferrer">Mosswing（Ayi1337）</a> · <a href="https://astragames.aigccreative.com/zh-CN/works/%E9%9B%B7%E9%9C%86%E6%88%98%E6%9C%BA-%E5%A4%A9%E7%A9%B9%E8%BF%9C%E5%BE%81-thunderfall-2eb69048" target="_blank" rel="noreferrer">THUNDERFALL（jackroc）</a> · <a href="https://astragames.aigccreative.com/zh-CN/works/iron-bastion-%E9%92%A2%E9%93%81%E9%98%B2%E7%BA%BF-81662a6b" target="_blank" rel="noreferrer">IRON BASTION（chat01.ai）</a><br>使用原版游戏源代码，保留原作者署名、画面、关卡与声音；福福学堂仅修改中文和账号存储接入。<a href="/assets/games/astra-originals/ATTRIBUTION.txt" target="_blank">来源与移植说明</a>。</p><p class="toy-footnote"><a href="/assets/games/starcatcher/LICENSE.txt" target="_blank">Starcatcher 来源与许可</a> · <a href="/assets/games/palace-for-fools/LICENSE.txt" target="_blank">愚者宫殿来源与说明</a></p><p class="toy-footnote"><a href="/assets/games/little-spy/LICENSE.txt" target="_blank">Little Spy</a> · <a href="/assets/games/taipo/LICENSE.txt" target="_blank">Taipo</a> · <a href="/assets/games/sokoworld/LICENSE.txt" target="_blank">SokoWorld</a> · <a href="/assets/games/open-jigsaw/LICENSE.txt" target="_blank">open-jigsaw</a></p></details>`);
  } catch (error) { catalogue.innerHTML = `<p role="alert">${escape(error.message)}</p><button type="button" data-toy-retry>重新准备游戏</button>`; }
  finally { loading = false; }
}
function dispose() { frame?.remove(); frame = null; current = null; closing = false; toolbar.querySelector('.toy-reload').hidden = true; toolbar.querySelector('.toy-fullscreen').hidden = true; if ((document.fullscreenElement || document.webkitFullscreenElement) === page) void (document.exitFullscreen?.() || document.webkitExitFullscreen?.()); }
function open(game) {
  if(window.FufuGameAccess&&!window.FufuGameAccess.entryAllowed){window.navigate('arcade');return;}
  if (game.fullscreenRequired) { kartLauncher.open(game); return; }
  dispose(); current = game; status.textContent = '正在读取存档…'; status.dataset.kind = 'pending';
  toolbar.querySelector('.toy-fullscreen').hidden = !game.fullscreenAvailable || !(page.requestFullscreen || page.webkitRequestFullscreen);
  toolbar.querySelector('strong').textContent = game.title; stage.querySelector('.toy-loading').hidden = false;
  frame = document.createElement('iframe'); frame.title = game.title; frame.allow = 'autoplay; fullscreen'; frame.src = game.entry + '?v=20261012-astra-original-1'; stage.append(frame);
  window.navigate('toy-game'); document.querySelector('.nav-link[data-page=arcade]')?.classList.add('active');
}
function close(goBack) {
  if (!frame || closing) return;
  if (frame.dataset.ready!=='true') {dispose();if(goBack)window.navigate('arcade');return;}
  closing = true; returnToArcade = goBack;
  status.textContent = '保存后返回…'; status.dataset.kind = 'pending';
  frame.contentWindow.postMessage({type:'fufu-toy-close'},location.origin);
}
catalogue.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-toy-retry')) loadCatalogue();
  const game = games.find(game => game.id === button.dataset.toy); if (game) open(game);
});
toolbar.querySelector('.toy-back').onclick = () => close(true);
toolbar.querySelector('.toy-fullscreen').onclick = async () => {
  try {
    if ((document.fullscreenElement || document.webkitFullscreenElement) === page) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
    else await (page.requestFullscreen || page.webkitRequestFullscreen).call(page);
  } catch { status.textContent = '暂时无法进入全屏，可以继续在当前页面探索。'; }
};
function updateFullscreenButton() { toolbar.querySelector('.toy-fullscreen').textContent = (document.fullscreenElement || document.webkitFullscreenElement) === page ? '退出全屏' : '全屏探索'; }
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
toolbar.querySelector('.toy-reload').onclick = () => { if (current) open(current); };
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.gameId !== current?.id) return;
  const data = event.data;
  if (data.type === 'fufu-toy-ready') { frame.dataset.ready='true'; stage.querySelector('.toy-loading').hidden = true; status.textContent = current.saveLabel || (current.resume?'进度自动保存':'玩法设置自动保存 · 重新打开会开始新一局'); status.dataset.kind = 'saved'; }
  if (data.type === 'fufu-toy-sync') { status.textContent = data.text; status.dataset.kind = data.text.includes('正在')?'pending':'saved'; }
  if (data.type === 'fufu-toy-error' || data.type === 'fufu-toy-save-error') { stage.querySelector('.toy-loading').hidden = true; status.textContent = data.text; status.dataset.kind = 'error'; closing = false; toolbar.querySelector('.toy-reload').hidden = false; }
  if (data.type === 'fufu-toy-reward') { status.textContent = `通关啦！获得 ${data.reward} 积分`; window.refreshProfile?.(); }
  if (data.type === 'fufu-toy-exit') { const goBack = returnToArcade || page.classList.contains('active'); dispose(); loadCatalogue(); if (goBack) window.navigate('arcade'); }
});
window.addEventListener('fufu-auth-changed', () => { frame?.contentWindow.postMessage({type:'fufu-toy-discard'},location.origin); dispose(); if (page.classList.contains('active')) window.navigate('arcade'); loadCatalogue(); });
window.FufuToyGames = {onNavigate(destination) { kartLauncher.onNavigate(destination); if (destination !== 'toy-game' && frame) close(false); if(destination==='arcade')loadCatalogue(); }};
loadCatalogue();
