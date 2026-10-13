import {initialize,learnerStorage,flush,report,closeGame} from './fufu-storage.js';
import {boot} from './src/main.js';
import {SaveManager} from './src/savemanager.js';

const slug='palace-for-fools',saveKey=slug+'.save.v1',settingsKey=slug+'.settings.v1';
const status=document.querySelector('#status'),start=document.querySelector('#start'),loading=document.querySelector('#loading');
let settings={muted:false},started=false;
window.FufuPalace={paused:false,core:null,storage:{
  getItem(key){return key==='apff_savedata'?learnerStorage.getItem(saveKey):null;},
  setItem(key,value){if(key==='apff_savedata')learnerStorage.setItem(saveKey,value);}
}};
const native=()=>window.FufuPalace.core;
function release(){const input=native()?.ev.input;if(input){input.keys=[];for(const action of Object.values(input.action))action.state=0;input.anyPressed=false;}}
function pause(value){release();window.FufuPalace.paused=value;document.querySelector('#pause').textContent=value?'继续':'暂停';Howler.mute(value||settings.muted);if(!value)native()?.canvas.canvas.focus();}
function capture(){
  const core=native(),game=core?.ev.scenes.game;
  if(!core?.initialized||core.ev.activeScene!==game||!game.objm?.player)return;
  if(core.ev.tr.active)throw new Error('正在切换场景，请稍后再返回。');
  new SaveManager().saveGame(game.objm.player,game.stage);
}
window.fufuBeforeClose=capture;
document.querySelector('#pause').onclick=()=>pause(!window.FufuPalace.paused);
document.querySelector('#guide').onclick=()=>{pause(true);document.querySelector('#help').hidden=false;};
document.querySelector('#dismiss').onclick=()=>{document.querySelector('#help').hidden=true;pause(false);};
document.querySelector('#exit').onclick=()=>closeGame();
document.querySelector('#retry').onclick=()=>location.reload();
function updateSound(){document.querySelector('#sound').textContent=settings.muted||native()?.ev.audio.enabled===false?'开启声音':'静音';Howler.mute(settings.muted||window.FufuPalace.paused);}
window.FufuPalace.audioChanged=updateSound;
document.querySelector('#sound').onclick=()=>{settings.muted=!(settings.muted||native()?.ev.audio.enabled===false);native()?.ev.audio.toggle(!settings.muted);updateSound();learnerStorage.setItem(settingsKey,JSON.stringify(settings));};
window.addEventListener('fufu-game-close',()=>pause(true));
window.addEventListener('fufu-game-reopen',()=>pause(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden){try{capture();}catch{}pause(true);}});
window.addEventListener('blur',release);
window.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();pause(!window.FufuPalace.paused);}});
const codes={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,KeyZ:90,KeyX:88,Enter:13,ShiftLeft:16};
function key(code,down){if(window.FufuPalace.paused)return;const input=native()?.ev.input;if(!input)return;down?input.keyPressed(codes[code]):input.keyReleased(codes[code]);native().canvas.canvas.focus();if(down)void Howler.ctx?.resume();}
for(const button of document.querySelectorAll('[data-code]')){
  button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);key(button.dataset.code,true);};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>key(button.dataset.code,false));
}
new ResizeObserver(()=>native()?.canvas.resize()).observe(document.querySelector('#stage'));
setInterval(()=>{if(!started||window.FufuPalace.paused)return;try{capture();}catch{}},15000);
try{
  await initialize();settings=JSON.parse(learnerStorage.getItem(settingsKey)||'{"muted":false}');updateSound();
  const font=await new FontFace('FufuPalaceChinese','url(fufu-sc.ttf)',{weight:'550'}).load();document.fonts.add(font);
  start.hidden=false;status.textContent='点击开始，准备进入宫殿';report('fufu-toy-ready','点击开始游戏');
}catch(error){status.textContent='无法准备游戏：'+error.message;document.querySelector('#retry').hidden=false;report('fufu-toy-error',error.message);}
start.onclick=async()=>{
  if(started)return;started=true;start.hidden=true;status.textContent='正在加载原版地图与音乐…';
  try{
    pause(false);boot();
    await new Promise((resolve,reject)=>{const timer=setInterval(()=>{const core=native();status.textContent='正在加载 '+Math.round(core.assets.getLoadRatio()*100)+'%';if(core.initialized){clearInterval(timer);clearTimeout(timeout);resolve();}},100);const timeout=setTimeout(()=>{clearInterval(timer);reject(new Error('加载超时，请重新打开游戏'));},45000);});
    loading.hidden=true;native().canvas.canvas.focus();report('fufu-toy-ready','进度已读取');
  }catch(error){status.textContent='加载失败：'+error.message;document.querySelector('#retry').hidden=false;report('fufu-toy-error',error.message);}
};
