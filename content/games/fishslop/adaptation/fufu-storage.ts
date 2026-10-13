/** Learner-bound memory cache; MySQL is the source of truth. */
const gameId = 'fishslop';
const allowed = new Set(['fishslop.save.v1', 'fishslop.settings.v1']);
let learnerId = 0, revision = 0, generation = 0, savedGeneration = 0;
let values: Record<string, string> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let blocked = false, closing = false;

export function report(type: string, text: string) {
  if (parent !== window) parent.postMessage({type, gameId, text}, location.origin);
}
async function request(method: string, body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/toy-games/${gameId}/save`, {
      method, credentials: 'same-origin', signal: controller.signal,
      keepalive: method === 'POST', headers: body ? {'Content-Type':'application/json'} : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409 || response.status === 401) blocked = true;
      throw new Error(data.error || '海底进度暂时无法保存');
    }
    return data;
  } finally { clearTimeout(timeout); }
}
function changed() {
  generation++;
  report('fufu-toy-sync', '正在保存进度…');
  if (!timer) timer = setTimeout(() => { timer = undefined; void flush().catch(() => {}); }, 800);
}
export const learnerStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem(key) { return values[key] ?? null; },
  setItem(key, value) {
    if (blocked || !allowed.has(key) || values[key] === value) return;
    values[key] = value; changed();
  },
  removeItem(key) {
    if (blocked || !allowed.has(key) || !(key in values)) return;
    delete values[key]; changed();
  },
};
export async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = undefined; }
  if (inFlight) { await inFlight; return flush(); }
  if (generation === savedGeneration) return;
  if (blocked) throw new Error('账号或进度已变化，请重新打开游戏');
  const sent = generation, snapshot = {...values};
  inFlight = (async () => {
    try {
      const data = await request('POST', {learnerId, expectedRevision:revision, storage:snapshot});
      revision = data.revision; savedGeneration = sent;
      report('fufu-toy-sync', '进度已保存');
    } catch (error) {
      report('fufu-toy-save-error', error instanceof Error ? error.message : '保存失败，请检查连接');
      throw error;
    }
  })();
  try { await inFlight; } finally { inFlight = null; }
  if (generation !== savedGeneration) return flush();
}
async function close() {
  if (closing) return;
  closing = true;
  window.dispatchEvent(new Event('fufu-game-close'));
  try {
    await flush();
    if (parent !== window) report('fufu-toy-exit', '进度已保存');
    else location.assign('/#arcade');
  } catch {
    closing = false;
    window.dispatchEvent(new Event('fufu-game-reopen'));
    report('fufu-toy-save-error', '进度尚未保存，请检查连接后再次返回。');
  }
}
export async function initialize() {
  report('fufu-toy-sync', '正在读取你的海底世界…');
  const data = await request('GET');
  learnerId = data.learnerId; revision = data.revision; values = data.storage;
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'fufu-toy-close') void close();
    if (event.data?.type === 'fufu-toy-discard') {
      blocked = true; if (timer) clearTimeout(timer);
      window.dispatchEvent(new Event('fufu-game-close'));
    }
  });
  window.addEventListener('online', () => void flush().catch(() => {}));
  window.addEventListener('pagehide', () => {
    // The game's later pagehide listener writes its final snapshot first.
    queueMicrotask(() => void flush().catch(() => {}));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) queueMicrotask(() => void flush().catch(() => {}));
  });
}
