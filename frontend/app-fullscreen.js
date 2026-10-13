/* Full-page fullscreen must be requested directly from a user click. */
(() => {
  const button = document.getElementById('appFullscreen');
  const label = button?.querySelector('[data-fullscreen-label]');
  const notice = document.getElementById('appFullscreenNotice');
  let pending = false, noticeTimer;
  const element = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function request(target = document.documentElement) {
    // "auto" allows a browser to retain its navigation bars. Ask it to hide them.
    if (target.requestFullscreen) return target.requestFullscreen({navigationUI:'hide'});
    if (target.webkitRequestFullscreen) return target.webkitRequestFullscreen();
    throw new Error('Fullscreen is unavailable');
  }
  function exit() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    throw new Error('Fullscreen exit is unavailable');
  }
  function showNotice() {
    if (!notice) return;
    clearTimeout(noticeTimer);
    notice.textContent = '没有进入全屏，请从浏览器菜单开启全屏。';
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 10000);
  }
  function update() {
    if (!button) return;
    const active = Boolean(element());
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? '退出全屏' : '全屏浏览');
    button.title = active ? '退出全屏' : '全屏浏览';
    if (label) label.textContent = active ? '退出全屏' : '全屏';
    if (active && notice) notice.hidden = true;
    document.documentElement.classList.toggle('app-native-fullscreen', active);
  }
  function waitForChange(active) {
    if (Boolean(element()) === active) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer;
      function finish(success) {
        clearTimeout(timer);
        document.removeEventListener('fullscreenchange', changed);
        document.removeEventListener('webkitfullscreenchange', changed);
        resolve(success);
      }
      function changed() { if (Boolean(element()) === active) finish(true); }
      document.addEventListener('fullscreenchange', changed);
      document.addEventListener('webkitfullscreenchange', changed);
      timer = setTimeout(() => finish(Boolean(element()) === active), 1800);
      changed();
    });
  }
  if (button) button.addEventListener('click', async () => {
    if (pending) return;
    const entering = !element();
    pending = true; button.disabled = true;
    try {
      // No network request, animation or other await before this call.
      const operation = entering ? request() : exit();
      await operation;
      if (!await waitForChange(entering)) showNotice();
    } catch { showNotice(); }
    finally { pending = false; button.disabled = false; update(); }
  });
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
  window.FufuFullscreen = {request, exit, element};
  update();
})();
