/* Load exploration scenes only when a learner opens them. */
(() => {
  const revision = '20261005-observe-5';
  const jobs = new Map();
  const modules = {
    globe: ['globe-hit.js', 'globe.js'],
    china: ['china-provinces.js', 'china-gallery.js', 'china-map.js'],
    solar: ['solar.js'], moon: ['moon.js'], lunar: ['lunar.js'],
    engineering: ['engineering-explore.js'], jurassic: ['dino-model.js'],
    transport: ['transport-explore.js'], arcade: ['puzzles.js','toy-arcade.js']
  };
  const classic = new Set(['puzzles.js','globe-hit.js', 'globe.js', 'china-provinces.js', 'china-gallery.js', 'china-map.js']);
  function load(file) {
    if (jobs.has(file)) return jobs.get(file);
    const url = `/${file}?v=${(file==='globe.js'||file==='landmark-tour.js')?'20261010-culture-exterior-1':file==='transport-explore.js'?'20261007-realistic-2':file==='toy-arcade.js'?'20261012-astra-original-1':file==='puzzles.js'?'20261010-game-password-1':file==='solar.js'?'20261006-5':file==='moon.js'?'20261006-2':revision}`;
    const job = classic.has(file) ? new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url; script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('场景暂时未加载，请重试')); };
      document.head.append(script);
    }) : import(url);
    jobs.set(file, job);
    job.catch(() => jobs.delete(file));
    return job;
  }
  window.FufuPages = {
    async enter(page) {
      if(page==='arcade'&&window.FufuGameAccess&&!window.FufuGameAccess.entryAllowed){window.navigate?.('arcade');return;}
      window.FufuScenes?.enter(page);
      const host = document.getElementById(`page-${page}`);
      if (!modules[page] || !host || host.dataset.sceneLoaded === 'true') return;
      host.querySelector('.scene-load-retry')?.remove();
      host.dataset.sceneLoading = 'true';
      try {
        for (const file of modules[page]) await load(file);
        host.dataset.sceneLoaded = 'true';
      } catch (error) {
        const retry = document.createElement('button');
        retry.className = 'primary-btn scene-load-retry';
        retry.textContent = '场景加载失败，点这里重试';
        retry.onclick = () => window.FufuPages.enter(page);
        host.prepend(retry);
        console.error(error);
      } finally { delete host.dataset.sceneLoading; }
    }
  };
  window.openLandmark = async (...args) => {
    try { await load('landmark-tour.js'); await window.openLandmark(...args); }
    catch (error) { window.toast?.('场景加载失败，请再试一次'); console.error(error); }
  };
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  window.FufuPerformance = { touch, pixelRatio: Math.min(devicePixelRatio || 1, touch ? 1.5 : 2) };
})();
