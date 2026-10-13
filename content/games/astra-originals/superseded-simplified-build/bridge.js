export function makeBridge(gameId, storageKeys) {
  const allowed = new Set(storageKeys);
  let learnerId = 0;
  let revision = 0;
  let values = {};
  let dirty = false;
  let inFlight = null;
  let timer = 0;
  let closing = false;

  function report(type, text) {
    if (window.parent !== window) parent.postMessage({ type, gameId, text }, location.origin);
  }

  async function request(method, body) {
    const response = await fetch(`/api/toy-games/${gameId}/save`, {
      method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '进度暂时无法保存');
    return data;
  }

  async function flush() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (inFlight) await inFlight;
    if (!dirty) return;
    dirty = false;
    const snapshot = { ...values };
    inFlight = request('POST', { learnerId, expectedRevision: revision, storage: snapshot, stats: {} })
      .then(data => { revision = data.revision; report('fufu-toy-sync', '进度已保存'); })
      .catch(error => { dirty = true; report('fufu-toy-save-error', error.message); throw error; })
      .finally(() => { inFlight = null; });
    await inFlight;
    if (dirty) return flush();
  }

  const bridge = {
    get(key, fallback = null) {
      if (!allowed.has(key)) throw new Error('游戏存档字段无效');
      try { return values[key] === undefined ? fallback : JSON.parse(values[key]); }
      catch { return fallback; }
    },
    set(key, value) {
      if (!allowed.has(key)) throw new Error('游戏存档字段无效');
      values[key] = JSON.stringify(value);
      dirty = true;
      report('fufu-toy-sync', '正在保存进度…');
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => {}), 500);
    },
    async flush() { await flush(); },
  };

  async function close() {
    if (closing) return;
    closing = true;
    try {
      await flush();
      report('fufu-toy-exit', '进度已保存');
    } catch { closing = false; }
  }

  async function initialize() {
    report('fufu-toy-sync', '正在读取你的进度…');
    try {
      const data = await request('GET');
      learnerId = data.learnerId;
      revision = data.revision;
      values = data.storage;
      window.addEventListener('pagehide', () => { void flush().catch(() => {}); });
      window.addEventListener('message', event => {
        if (event.origin === location.origin && event.source === parent && event.data?.type === 'fufu-toy-close') void close();
      });
      report('fufu-toy-ready', '游戏已准备好');
      report('fufu-toy-sync', Object.keys(values).length ? '已恢复你的游戏进度' : '新的一局，进度会自动保存');
      return bridge;
    } catch (error) {
      report('fufu-toy-error', error.message);
      throw error;
    }
  }

  return initialize();
}
