import { makeBridge } from './bridge.js?v=20261012-astra-action-1';
const mode=new URL(import.meta.url).searchParams.get('mode'),cfg={mosswing:['mosswing-adapt','mosswing-adapt.save.v1'],thunderfall:['thunderfall-adapt','thunderfall-adapt.save.v1'],'iron-bastion':['iron-bastion-adapt','iron-bastion-adapt.save.v1']}[mode];
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),panel=document.querySelector('#panel'),title=document.querySelector('#panelTitle'),copy=document.querySelector('#panelText'),start=document.querySelector('#start'),pauseButton=document.querySelector('#pause');
const input={keys:new Set(),holds:new Set(),pointer:false,x:0,y:0};let w=800,h=500,paused=false,game,bridge,prev=0,raf=0;
function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);w=Math.max(320,r.width);h=Math.max(240,r.height);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);game?.draw(ctx,w,h);}window.addEventListener('resize',resize);resize();
function result(head,msg){title.textContent=head;copy.textContent=msg;start.textContent='再来一局';panel.hidden=false;}
function run(t){raf=requestAnimationFrame(run);const dt=Math.min(.04,Math.max(0,(t-prev)/1000||0));prev=t;if(!paused&&game){game.update(dt,input);const msg=game.result?.();if(msg&&panel.hidden)result(msg[0],msg[1]);}if(game)game.draw(ctx,w,h);}
function begin(){panel.hidden=true;paused=false;pauseButton.textContent='暂停';game?.restart?.();game?.start?.();if(!raf)raf=requestAnimationFrame(run);game?.draw(ctx,w,h);}
start.onclick=begin;pauseButton.onclick=()=>{paused=!paused;pauseButton.textContent=paused?'继续':'暂停';};
document.querySelector('#exit').onclick=async()=>{try{await bridge.flush();parent.postMessage({type:'fufu-toy-exit',gameId:cfg[0],text:'进度已保存'},location.origin);}catch{document.querySelector('#exit').textContent='保存失败，请重试';}};
window.addEventListener('keydown',e=>{if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();input.keys.add(e.key);if(e.key.toLowerCase()==='p'&&!e.repeat){paused=!paused;pauseButton.textContent=paused?'继续':'暂停';}if(!e.repeat)game?.key?.(e.key,true);});
window.addEventListener('keyup',e=>{input.keys.delete(e.key);game?.key?.(e.key,false);});
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();input.pointer=true;input.x=e.clientX-r.left;input.y=e.clientY-r.top;game?.pointer?.(input.x,input.y,true);canvas.setPointerCapture?.(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();input.x=e.clientX-r.left;input.y=e.clientY-r.top;game?.pointer?.(input.x,input.y,input.pointer);});
for(const n of ['pointerup','pointercancel'])canvas.addEventListener(n,()=>{input.pointer=false;game?.pointer?.(input.x,input.y,false);});
document.querySelectorAll('[data-hold]').forEach(b=>{const k=b.dataset.hold;b.onpointerdown=e=>{e.preventDefault();input.holds.add(k);b.setPointerCapture?.(e.pointerId);};for(const n of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(n,()=>input.holds.delete(k));});
document.querySelectorAll('[data-action]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();game?.action?.(b.dataset.action,true);};for(const n of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(n,()=>game?.action?.(b.dataset.action,false));});
try{bridge=await makeBridge(cfg[0],[cfg[1]]);const module=await import(`./${mode}.js?v=20261012-astra-action-1`);game=module.createGame({ctx,w,h,bridge});game.draw(ctx,w,h);}catch(e){title.textContent='游戏暂时无法打开';copy.textContent=e.message;}
