let petState = null;
let shopData = [];
let zooOwnedIds = [];
let activeGame = 'sudoku';
let gameRunning = false;
let gameFrame = 0;
let animationId = 0;
let lastFrameAt = 0;
let updateAccumulator = 0;
let keysDown = new Set();
let game = {};
let audioContext = null;
const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const clayAccessoryIcons = { '🔔':'bell', '🦸':'cape', '🎀':'bow', '🌟':'star', '🎒':'backpack', '🌼':'flower', '🧢':'hat', '👟':'shoes', '🧣':'scarf', '🕶️':'glasses' };
const equipSlotLabels = {head:'头饰',face:'眼镜',neck:'颈饰',chest:'胸饰',outer:'外搭',feet:'鞋子'};
let petSpeech = null;
let petSpeechRequest = null;
let petLineBag = [];
let lastPetLine = '';
let petSpeechSequence = 0;
function accessoryArt(emoji, className) {
  const icon=clayAccessoryIcons[emoji];
  return icon ? `<img class="${className}" src="/assets/clay-accessories/${icon}.svg" alt="">` : `<span>${escapeHtml(emoji||'')}</span>`;
}
function updatePetAccessoryBadge(equipment) {
  const badge=$('#petAccessory');
  const pieces=Object.values(equipment||{}).filter(Boolean);
  badge.innerHTML=pieces.map(emoji=>accessoryArt(emoji,'pet-accessory-art')).join('');
  badge.hidden=!pieces.length;
}
function syncPetEquipment() {
  const equipment=petState?.equipment||{};
  window.petAccessoryState={equipment,owned:petState?.owned||[]};
  window.pet3d?.equip?.(equipment);
  $('#claySafariFrame')?.contentWindow?.postMessage({type:'fufu-companion-accessory',equipment},location.origin);
  updatePetAccessoryBadge(equipment);
}
// 动物园 iframe 的当前展开状态，收发消息都以它为准
function zooExpanded(){ return document.querySelector('#zooWorldCard')?.classList.contains('is-expanded')||false; }
function postToZoo(message){ $('#claySafariFrame')?.contentWindow?.postMessage(message,location.origin); }
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin || event.source!==$('#claySafariFrame')?.contentWindow)return;
  if(event.data?.type==='fufu-farm-points'){
    try{state.profile=await api('/profile');renderProfile();await loadShop();}catch(error){toast('积分已入账，稍后刷新查看。');}
  }
  if(event.data?.type==='fufu-open-farm-shop'){
    window.navigate('shop');
    await loadShop();
    const section=document.querySelector('.shop-section-head[data-shop-group="团团小牧场"]');
    section?.scrollIntoView({behavior:'smooth',block:'start'});
  }
});
window.addEventListener('fufu-auth-changed',()=>{
  const frame=$('#claySafariFrame');
  if(frame && frame.getAttribute('src')!=='about:blank'){const url=new URL(frame.src,location.origin);url.searchParams.set('sessionRefresh',Date.now());frame.src=url.href;}
});
// 黏土世界是常驻 iframe，切走页面时它不会自己安静下来。
// 双管齐下：postMessage 通知它，同时利用同源直接调用它的音频开关做保险。
function clayAudio(action){
  postToZoo({type:`fufu-audio-${action}`});
  try { $('#claySafariFrame')?.contentWindow?.FufuClayAudio?.[action]?.(); } catch (_) {}
}
window.fufuSilenceClay=()=>clayAudio('suspend');
window.fufuWakeClay=()=>{const frame=$('#claySafariFrame');if(frame?.getAttribute('src')==='about:blank')frame.src=frame.dataset.src;clayAudio('resume');};
// 兑换动物后：把解锁状态推给动物园，让它当场把新朋友放出来（不再整帧重载）
async function notifyZooUnlock(zooAnimalId) {
  if (zooAnimalId) { if (!zooOwnedIds.includes(zooAnimalId)) zooOwnedIds.push(zooAnimalId); postToZoo({type:'fufu-zoo-unlock',id:zooAnimalId,ids:zooOwnedIds.slice()}); }
  await loadZooSummary();
}

function gameSound(frequency, duration=.07) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
    oscillator.type='square';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(.04,audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);
    oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+duration);
  } catch (_) {}
}

async function loadPet() {
  try {
    petState = await api('/pet');
    if(!lastPetLine)$('#petLastAction').textContent = '点一下我，一起打个招呼吧。';
    loadPetSpeech().catch(()=>{});
    syncPetEquipment();
    window.petModelState = petState.pet_model || 'clay_explorer';
    if (window.pet3d?.currentModel?.() !== window.petModelState) window.pet3d?.switchModel?.(window.petModelState);
  } catch (e) { console.warn(e); }
}
function loadPetSpeech() {
  if(petSpeech)return Promise.resolve(petSpeech);
  if(!petSpeechRequest)petSpeechRequest=api('/pet/lines').then(data=>petSpeech=data).finally(()=>{petSpeechRequest=null;});
  return petSpeechRequest;
}
// Shuffle a full round of published lines before repeating one. Lines come
// from the content database; tapping no longer changes points or pet meters.
window.respondPetSpeech = async () => {
  const sequence=++petSpeechSequence;
  try {
    const data=await loadPetSpeech();
    if(sequence!==petSpeechSequence||!document.querySelector('#page-home.active'))return;
    if(!petLineBag.length){
      const unique=new Map();
      (data.encouragements||[]).forEach(text=>{if(text?.trim())unique.set(text,{text,singing:false});});
      (data.songs||[]).forEach(song=>{if(song.lyrics?.trim())unique.set(song.lyrics,{text:song.lyrics,singing:true});});
      petLineBag=[...unique.values()];
      for(let i=petLineBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[petLineBag[i],petLineBag[j]]=[petLineBag[j],petLineBag[i]];}
      if(petLineBag.length>1&&petLineBag[petLineBag.length-1].text===lastPetLine){[petLineBag[0],petLineBag[petLineBag.length-1]]=[petLineBag[petLineBag.length-1],petLineBag[0]];}
    }
    const line=petLineBag.pop();
    if(!line)return;
    lastPetLine=line.text;
    if(line.singing)window.pet3d?.play('sing');
    $('#petLastAction').textContent=line.text;
    speak(line.text,'zh-CN',{voiceProfile:'child'});
  } catch(error) {
    if(sequence===petSpeechSequence)$('#petLastAction').textContent='团团正在向你打招呼，语音暂时没连上，再点我试试。';
  }
};
async function loadShop() {
  try {
    shopData = await api('/store');
    renderShop();
    $('#shopPoints').textContent = state.profile?.points ?? '—';
  } catch(e) { toast('商店暂时无法连接'); }
}
// 商店暂时只兑换黏土世界元素；描述里带【分类】标记，拆成分组徽标与正文
const SHOP_GROUPS = [
  {key:'动物朋友', icon:'🐾', title:'动物朋友', desc:'兑换后它们会住进黏土世界，走近还能互动。'},
  {key:'探险道具', icon:'🎒', title:'探险道具', desc:'小相机、帐篷、热气球……把探险营地布置起来。'},
  {key:'地图场景', icon:'🏞️', title:'地图场景', desc:'风车、小木屋、小果园，一片片点亮整张地图。'},
  {key:'团团小牧场', icon:'🐑', title:'团团小牧场', desc:'迎接小羊、扩建与装饰。日常照顾免费，材料制作在牧场里完成。'},
];
function splitShopDescription(text) {
  const matched = /^【([^】]+)】(.*)$/.exec(text || '');
  return matched ? {group: matched[1], detail: matched[2]} : {group: '', detail: text || ''};
}
function renderShop() {
  const zooItems = shopData.filter(item=>item.kind==='zoo_animal'||item.kind==='farm');
  $('#shopTotalCount').textContent = zooItems.length;
  $('#shopCollectedCount').textContent = zooItems.filter(item=>item.owned).length;
  const cardHtml = item => {
    const {group, detail} = splitShopDescription(item.description);
    const label = item.owned ? '已在黏土世界' : item.price===0 ? '免费领取' : `⭐ ${item.price} 兑换`;
    const action = item.owned
      ? `<button class="shop-buy is-owned" disabled>✓ 已拥有</button>`
      : `<button class="shop-buy" data-buy="${item.id}">${item.price===0?'领取':'兑换'}</button>`;
    return `<article class="shop-item shop-item-zoo">
      <span class="shop-item-emoji">${escapeHtml(item.emoji)}</span>
      ${group?`<span class="shop-category shop-category-${group}">${group}</span>`:''}
      <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(detail)}</p>
      <div class="shop-item-footer"><b>${label}</b>${action}</div>
    </article>`;
  };
  $('#shopItems').innerHTML = SHOP_GROUPS.map(groupDef => {
    const items = zooItems
      .filter(item=>splitShopDescription(item.description).group===groupDef.key)
      .sort((a,b)=>Number(a.owned)-Number(b.owned) || a.price-b.price || a.id-b.id);
    if (!items.length) return '';
    return `<div class="shop-section-head" data-shop-group="${escapeHtml(groupDef.key)}"><h2>${groupDef.icon} ${groupDef.title}</h2><p>${groupDef.desc}</p><span class="shop-section-count">已收集 ${items.filter(i=>i.owned).length} / ${items.length}</span></div>${items.map(cardHtml).join('')}`;
  }).join('');
  // 衣橱仅保留“已经拥有”的装扮，可继续穿脱；商店不再售卖装扮
  const owned = shopData.filter(item=>item.owned && item.kind==='wearable');
  const wardrobe = $('#petWardrobe');
  if (wardrobe) wardrobe.hidden = owned.length === 0;
  $('#ownedItems').innerHTML = owned.map(item => {
    const equipped = petState?.equipment?.[item.equip_slot] === item.emoji;
    return `<span class="owned-item">${accessoryArt(item.emoji,'owned-accessory-art')} ${escapeHtml(item.name)}<button class="owned-equip ${equipped?'is-equipped':''}" ${equipped?`data-unequip="${escapeHtml(item.equip_slot)}"`:`data-equip="${item.id}"`}>${equipped?'脱下':'穿上'}</button></span>`;
  }).join('');
  document.querySelectorAll('[data-buy]').forEach(button=>button.addEventListener('click',()=>buyShopItem(Number(button.dataset.buy))));
  document.querySelectorAll('[data-equip]').forEach(button=>button.addEventListener('click',()=>equipShopItem(Number(button.dataset.equip))));
  document.querySelectorAll('[data-unequip]').forEach(button=>button.addEventListener('click',()=>equipShopItem(null,button.dataset.unequip)));
}
async function switchPet(itemId) {
  try {
    const result = await api('/pet/switch', {method:'POST',body:JSON.stringify({item_id:itemId})});
    petState = result.pet;
    window.petModelState = petState.pet_model;
    window.pet3d?.switchModel?.(petState.pet_model);
    $('#petLastAction').textContent = petState.last_action;
    renderShop();
    toast('新伙伴来陪你啦！');
  } catch(e) { toast(e.message); }
}
async function equipShopItem(itemId,slot=null) {
  try {
    const result = await api('/pet/equip', {method:'POST',body:JSON.stringify({item_id:itemId,slot})});
    petState = result.pet;
    syncPetEquipment();
    $('#petLastAction').textContent = petState.last_action;
    renderShop();
    toast(itemId===null?'团团换下了装扮':'团团穿上新装扮啦！');
  } catch(e) { toast(e.message); }
}
async function buyShopItem(id) {
  try {
    const result = await api('/store/buy', {method:'POST',body:JSON.stringify({item_id:id})});
    state.profile={...state.profile,...result.profile};renderProfile();
    await loadPet();await loadShop();
    if (result.item.kind === 'zoo_animal') await notifyZooUnlock(result.item.zoo_animal_id);
    if (result.item.kind === 'farm') postToZoo({type:'fufu-farm-refresh'});
    if (result.item.kind === 'pet') {
      const pet = shopData.find(item=>item.id===result.item.id);
      if (pet) await switchPet(pet.id);
    }
    toast(`兑换成功：${result.item.name}`);
  } catch(e) { toast(e.message); }
}
async function loadZooSummary() {
  try {
    const animals = await api('/zoo');
    zooOwnedIds = animals.filter(animal=>animal.owned).map(animal=>animal.zoo_animal_id);
    $('#zooOwnedCount').textContent = zooOwnedIds.length;

  } catch (error) { $('#zooOwnedCount').textContent='读取失败'; console.warn('动物园信息读取失败', error); }
}

function setGame(kind) {
  if(!['sudoku','maze','mines'].includes(kind))return;
  const previousGame=activeGame;activeGame=kind;
  if(previousGame==='sudoku'&&kind!=='sudoku'&&typeof pauseSudokuClock==='function')pauseSudokuClock();
  if(gameRunning){gameRunning=false;cancelAnimationFrame(animationId);}
  configureArcadeAddon(kind);
}
function startGame(){if(window.FufuGameAccess&&!window.FufuGameAccess.entryAllowed){window.navigate('arcade');return;}if(typeof startArcadeAddon==='function')startArcadeAddon(activeGame);}
function tickGame(timestamp){
  if(!gameRunning||activeGame!=='maze')return;
  if(!$('#page-arcade').classList.contains('active')){gameRunning=false;cancelAnimationFrame(animationId);return;}
  if(!lastFrameAt)lastFrameAt=timestamp;
  updateAccumulator+=Math.min(50,timestamp-lastFrameAt);lastFrameAt=timestamp;
  while(updateAccumulator>=1000/60&&gameRunning){gameFrame++;updateMaze();updateAccumulator-=1000/60;}
  if(gameRunning)animationId=requestAnimationFrame(tickGame);
}
async function endGame(won){
  if(!gameRunning)return;gameRunning=false;cancelAnimationFrame(animationId);
  $('#gameStart').textContent='再玩一次';$('#gameResult').textContent=won?'太厉害啦！迷宫完成。':'这一局结束啦，再试一次！';
  try{const result=await api('/game/reward',{method:'POST',body:JSON.stringify({game:activeGame})});
    if(result.profile){state.profile={...state.profile,...result.profile};renderProfile();$('#gameResult').textContent+=` +${result.reward} 积分。`;}
    else $('#gameResult').textContent+=` ${result.message||''}`;await loadPet();
  }catch(e){$('#gameResult').textContent+=' 积分同步失败，请重新载入后查看。';}
}
function initExtras() {
  // 黏土世界独立页：进入后通知 iframe 以全屏尺寸重排（iframe 在隐藏页中初始化时尺寸为 0）
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('[data-page="clay"]'))return;
    [120,400].forEach(delay=>setTimeout(()=>postToZoo({type:'fufu-zoo-view',expanded:true}),delay));
  });
  $('#claySafariFrame').addEventListener('load',()=>{
      if(!document.querySelector('#page-clay.active'))clayAudio('suspend');
    postToZoo({type:'fufu-zoo-view',expanded:zooExpanded()});
    postToZoo({type:'fufu-companion-accessory',equipment:petState?.equipment||{}});
  });
  document.querySelectorAll('.nav-link').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.page==='shop')loadShop();if(button.dataset.page==='arcade'&&typeof renderSudoku==='function'&&(!window.FufuGameAccess||window.FufuGameAccess.entryAllowed)){if(activeGame==='sudoku')renderSudoku();else if(activeGame==='maze')drawMazePreview();else if(activeGame==='mines'){if(mineGame)drawMines();else startMines();}}}));
  document.querySelectorAll('.game-tab').forEach(button=>button.addEventListener('click',()=>setGame(button.dataset.game)));
  $('#gameStart').addEventListener('click',startGame);
  document.querySelectorAll('[data-control]').forEach(button=>{
    const map={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'},key=map[button.dataset.control];
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keysDown.add(key);if(activeGame==='maze')stepMaze(key);});
    const release=()=>keysDown.delete(key);button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  document.addEventListener('keydown',e=>{if(!$('#page-arcade').classList.contains('active'))return;const keyMap={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};const key=e.code==='Space'?'Space':(keyMap[e.key.toLowerCase()]||e.key);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(key)){e.preventDefault();keysDown.add(key);}if(activeGame==='maze'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)&&!e.repeat)stepMaze(key);});
  document.addEventListener('keyup',e=>{const keyMap={w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'};keysDown.delete(e.code==='Space'?'Space':(keyMap[(e.key||'').toLowerCase()]||e.key));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&gameRunning){gameRunning=false;cancelAnimationFrame(animationId);$('#gameResult').textContent='游戏已暂停，点“开始游戏”再来一局。';}});
  if(typeof configureArcadeAddon==='function')setGame('sudoku');
}
// Bind after parsing before registering arcade and touch handlers.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initExtras,{once:true});
else initExtras();
