import './style.css';
import './fufu-style.css';
const helperUrl='/assets/games/fullscreen-entry.js?v=20261008-games-zh-2';
const {waitForFullscreen}=await import(/* @vite-ignore */ helperUrl);
const notice=document.querySelector<HTMLElement>('#fullscreen-notice')!;
if(await waitForFullscreen('sunbreak-downhill',notice)){
  notice.textContent='正在生成山地赛道，首次打开请稍等…';
  try{
    const game=await import('./main');notice.remove();
    const nav=document.createElement('nav');nav.className='downhill-touch';nav.setAttribute('aria-label','触屏骑行');
    nav.innerHTML=`<div class="ride-tools"><button type="button" data-pause>暂停</button><span>松开蓄力键跳跃</span></div><div class="ride-turn"><button type="button" data-key="ArrowLeft" aria-label="向左转">◀</button><button type="button" data-key="ArrowRight" aria-label="向右转">▶</button></div><div class="ride-drive"><button type="button" data-key="Space">蓄力跳跃</button><button type="button" data-key="ShiftLeft">冲刺</button><button type="button" data-key="ArrowDown">刹车</button><button type="button" data-key="ArrowUp" class="pedal">踩踏</button></div><div class="ride-trick"><label>空中特技<select aria-label="选择空中特技"><option value="1">侧摆车身</option><option value="2">交叉把手</option><option value="3">伸展飞跃</option><option value="4">甩尾</option><option value="5">转体一圈</option><option value="6">后空翻</option><option value="7">前空翻</option></select></label><button type="button" data-key="Digit1" data-trick>做特技</button></div>`;
    document.body.append(nav);
    const pointers=new Map<number,string>();
    const clear=()=>{pointers.clear();game.controls.reset();nav.querySelectorAll('button[data-key]').forEach(b=>{b.classList.remove('held');b.setAttribute('aria-pressed','false');});};
    for(const button of Array.from(nav.querySelectorAll<HTMLButtonElement>('button[data-key]'))){
      button.setAttribute('aria-pressed','false');
      button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);const key=button.dataset.key!;pointers.set(e.pointerId,key);game.controls.setTouch(key,true);button.classList.add('held');button.setAttribute('aria-pressed','true');};
      const release=(e:PointerEvent)=>{const key=pointers.get(e.pointerId);pointers.delete(e.pointerId);if(key&&![...pointers.values()].includes(key)){game.controls.setTouch(key,false);button.classList.remove('held');button.setAttribute('aria-pressed','false');}};
      button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
      button.onkeydown=e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();e.stopPropagation();game.controls.setTouch(button.dataset.key!,true);button.classList.add('held');}};
      button.onkeyup=e=>{if(e.code==='Enter'||e.code==='Space'){e.stopPropagation();game.controls.setTouch(button.dataset.key!,false);button.classList.remove('held');}};
      button.onblur=()=>{if(![...pointers.values()].includes(button.dataset.key!)){game.controls.setTouch(button.dataset.key!,false);button.classList.remove('held');}};
    }
    nav.querySelector<HTMLSelectElement>('select')!.onchange=e=>{clear();nav.querySelector<HTMLButtonElement>('[data-trick]')!.dataset.key='Digit'+(e.target as HTMLSelectElement).value;};
    nav.querySelector<HTMLButtonElement>('[data-pause]')!.onclick=()=>{clear();game.action('pause');};
    const update=()=>{const phase=document.body.dataset.state;nav.hidden=!['racing','countdown'].includes(phase||'');if(nav.hidden)clear();};
    const observer=new MutationObserver(update);observer.observe(document.body,{attributes:true,attributeFilter:['data-state']});update();
    window.addEventListener('blur',clear);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();game.suspend();}else game.wake();});
    window.addEventListener('fufu-fullscreen-lost',()=>{clear();game.suspend();});
    window.addEventListener('pagehide',()=>{observer.disconnect();clear();game.shutdown();},{once:true});
  }catch(error){console.error(error);notice.textContent='山地赛道准备失败，请重新全屏开始。设备需要支持 WebGL 2。';parent.postMessage({type:'fufu-toy-error',gameId:'sunbreak-downhill',text:notice.textContent},location.origin);}
}
