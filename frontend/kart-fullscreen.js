// Racing gets its own lifecycle: no iframe or WebGL context before native fullscreen.
export function createKartLauncher(host) {
  const page = document.createElement('main');
  page.id = 'page-kart-game'; page.className = 'page kart-game-page';
  page.innerHTML = `<header class="kart-toolbar"><button type="button" data-kart-back>← 返回游戏乐园</button><strong>海岛卡丁车</strong><span role="status" aria-live="polite"></span><button type="button" data-kart-exit hidden>退出全屏</button></header><div class="kart-stage"><section class="kart-gate"><img width="600" height="400" alt="海岛卡丁车赛道"><div><small>赛车挑战 · 全屏专属</small><h2>去海岛，跑一场比赛</h2><p>选择赛车，与 7 位电脑车手比赛。先从简单难度、1 圈开始。</p><ul><li>左手转向，右手加速、刹车。</li><li>转弯时按住漂移，捡到道具后点击使用。</li><li>比赛中可以暂停；退出全屏会结束本局。</li></ul><button type="button" data-kart-start>全屏开始 →</button><p class="kart-gate-message" role="status">建议平板横屏游玩</p></div></section></div>`;
  host.after(page);
  const stage = page.querySelector('.kart-stage'), gate = page.querySelector('.kart-gate');
  const start = page.querySelector('[data-kart-start]'), exit = page.querySelector('[data-kart-exit]');
  const message = page.querySelector('.kart-gate-message'), status = page.querySelector('.kart-toolbar [role=status]');
  let game = null, frame = null, session = 0, timer = null;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const isFullscreen = () => fullscreenElement() === page;
  function stop(text = '退出全屏后，本局已结束。可以重新开始。') {
    session++; clearTimeout(timer); timer = null;
    frame?.remove(); frame = null; gate.hidden = false; exit.hidden = true;
    start.disabled = false; message.textContent = text; status.textContent = '仅在全屏中启动';
  }
  async function leaveFullscreen() {
    if (!isFullscreen()) return;
    try { await (document.exitFullscreen?.() || document.webkitExitFullscreen?.()); } catch { /* already exited */ }
  }
  start.onclick = async () => {
    if (!game || frame || start.disabled) return;
    const request = page.requestFullscreen || page.webkitRequestFullscreen;
    if (!request) { message.textContent = '这个浏览器暂不支持页面全屏，请使用支持全屏的 Safari 或 Chrome。'; return; }
    const token = ++session; start.disabled = true;
    try {
      // Invoke immediately inside the click gesture; never load first and request later.
      await request.call(page);
      // Older WebKit signals success by an event instead of returning a promise.
      if (!isFullscreen() && token === session) {
        await new Promise(resolve => {
          const changed = () => { if (isFullscreen() || token !== session) finish(); };
          const finish = () => { clearTimeout(timeout); document.removeEventListener('webkitfullscreenchange',changed); document.removeEventListener('fullscreenchange',changed); resolve(); };
          const timeout = setTimeout(finish,1500);
          document.addEventListener('webkitfullscreenchange',changed); document.addEventListener('fullscreenchange',changed);
        });
      }
      if (token !== session || !isFullscreen() || !page.classList.contains('active')) { start.disabled = false; if (isFullscreen()) leaveFullscreen(); return; }
      gate.hidden = true; exit.hidden = false; status.textContent = '正在准备赛道…';
      frame = document.createElement('iframe'); frame.title = game.title;
      frame.allow = 'autoplay; fullscreen; gamepad'; frame.src = game.entry + '?v=20261010-game-perf-1'; stage.append(frame);
      timer = setTimeout(() => { if (frame && token === session && !frame.dataset.ready) { stop('游戏加载超时，请重新全屏开始。'); leaveFullscreen(); } }, 30000);
    } catch { start.disabled = false; message.textContent = '没有进入全屏，游戏尚未启动。请再点一次“全屏开始”。'; }
  };
  function fullscreenChanged() { if (frame && !isFullscreen()) stop(); }
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('webkitfullscreenchange', fullscreenChanged);
  exit.onclick = () => { stop(); leaveFullscreen(); };
  page.querySelector('[data-kart-back]').onclick = () => { stop(); leaveFullscreen(); window.navigate('arcade'); };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.gameId !== game?.id) return;
    if (event.data.type === 'fufu-toy-ready') { clearTimeout(timer); frame.dataset.ready = 'true'; status.textContent = '横屏更好玩 · 本局不计积分'; }
    if (event.data.type === 'fufu-toy-error') { stop(event.data.text || '赛道准备失败，请重试。'); leaveFullscreen(); }
  });
  window.addEventListener('fufu-auth-changed', () => { stop(); leaveFullscreen(); if (page.classList.contains('active')) window.navigate('arcade'); });
  return {
    open(item) {
      if(window.FufuGameAccess&&!window.FufuGameAccess.entryAllowed){window.navigate('arcade');return;}
      stop('建议平板横屏游玩'); game = item;
      toolbarTitle(item);
      gate.querySelector('small').textContent = '三维冒险 · 全屏专属';
      gate.querySelector('img').src = item.cover+'?v=20261010-game-perf-1'; gate.querySelector('img').alt=item.title+'游戏画面';
      gate.querySelector('h2').textContent=item.launchTitle || item.title;
      const paragraphs=gate.querySelectorAll('div > p'); paragraphs[0].textContent=item.launchDescription || item.description;
      const tips=item.launchTips || ['左手转向，右手加速、刹车。','转弯时按住漂移，捡到道具后点击使用。','比赛中可以暂停；退出全屏会结束本局。'];
      gate.querySelectorAll('li').forEach((element,index)=>element.textContent=tips[index] || '');
      window.navigate('kart-game'); document.querySelector('.nav-link[data-page=arcade]')?.classList.add('active');
    },
    onNavigate(destination) { if (destination !== 'kart-game' && game) { stop(); leaveFullscreen(); game = null; } }
  };
  function toolbarTitle(item) { page.querySelector('.kart-toolbar strong').textContent=item.title; }
}
