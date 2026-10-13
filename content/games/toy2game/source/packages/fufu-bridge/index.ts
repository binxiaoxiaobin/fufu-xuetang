/** Fufu adaptation: learner-bound server storage, lifecycle and return navigation. */
let gameId = '', learnerId = 0, revision = 0, generation = 0, savedGeneration = 0;
let storage: Record<string,string> = {}, timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null, blocked = false, closing = false;
const embedded = typeof window !== 'undefined' && window.parent !== window;
let levels: unknown[] = [];
export function readLevels(): unknown[] {return levels;}
function report(type: string, text: string, extra: Record<string,unknown> = {}) {
  if (embedded) parent.postMessage({type,gameId,text,...extra},location.origin);
}
async function api(method: string, body?: unknown) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/toy-games/${gameId}/save`, {method,credentials:'same-origin',signal:controller.signal,
      headers:body ? {'Content-Type':'application/json'} : undefined,body:body ? JSON.stringify(body) : undefined});
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409 || response.status === 401) blocked = true;
      throw new Error(data.error || '游戏进度暂时无法同步');
    }
    return data;
  } finally {clearTimeout(timeout);}
}
export function readStored(key: string): string | null {return storage[key] ?? null;}
export function writeStored(key: string, value: string) {
  if (storage[key] === value) return;
  storage[key] = value; generation++;
  report('fufu-toy-sync','正在保存进度…');
  if (!timer && !blocked) timer = setTimeout(() => {timer=undefined;void flush().catch(() => {});}, 800);
}
export async function flush(): Promise<void> {
  if (timer) {clearTimeout(timer);timer=undefined;}
  if (inFlight) {await inFlight;return flush();}
  if (generation === savedGeneration) return;
  if (blocked) throw new Error('账号或进度已变化，请重新打开游戏');
  const sentGeneration = generation, snapshot = {...storage};
  inFlight = (async () => {
    try {
      const result = await api('POST',{learnerId,expectedRevision:revision,storage:snapshot});
      revision = result.revision;savedGeneration = sentGeneration;
      if (generation === sentGeneration) storage = result.storage;
      report('fufu-toy-sync','进度已保存');
      if (result.reward) report('fufu-toy-reward',`本日首次通关 +${result.reward} 积分`,{reward:result.reward});
    } catch (error) {
      report('fufu-toy-save-error',error instanceof Error ? error.message : '保存失败，请检查连接');
      throw error;
    }
  })();
  try {await inFlight;} finally {inFlight=null;}
  if (generation !== savedGeneration) return flush();
}
async function exit() {
  if (closing) return;
  closing=true;
  try {
    report('fufu-toy-sync','正在保存，马上返回…');
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
    await flush();
    if (embedded) report('fufu-toy-exit','已保存');else location.assign('/#arcade');
  } catch {
    closing=false;
    report('fufu-toy-save-error','进度未同步，请检查连接后再点返回；也可以重新加载游戏。');
  }
}
export async function initializeGame(id: string) {
  gameId=id;
  report('fufu-toy-sync','正在读取你的游戏进度…');
  const result = await api('GET');
  learnerId=result.learnerId;revision=result.revision;storage=result.storage;
  levels=result.levels ?? [];
  report('fufu-toy-sync',Object.keys(storage).length ? '已恢复你的游戏进度' : '新的一局，进度会自动保存');
  document.addEventListener('click',event => {
    const link=(event.target as Element).closest?.('a');if (!link) return;
    const url=new URL(link.href,location.href);
    if (url.origin===location.origin && url.pathname==='/' && url.hash==='#arcade') {event.preventDefault();void exit();}
  });
  window.addEventListener('message',event => {
    if (event.origin!==location.origin || event.source!==parent) return;
    if (event.data?.type==='fufu-toy-close') void exit();
    if (event.data?.type==='fufu-toy-discard') {blocked=true;window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));}
  });
  window.addEventListener('online',()=>void flush().catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{if (document.hidden) void flush().catch(()=>{});});
  report('fufu-toy-ready','游戏已准备好');
}
