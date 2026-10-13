// Original native runtimes share only this game's learner-bound memory cache.
const host=parent.FufuNative;
window.FufuMemory=host.memory;
const originalRaf=window.requestAnimationFrame.bind(window),originalCancel=window.cancelAnimationFrame.bind(window);
const waiting=new Map(),audio=[],held=new Map();let paused=false,pausedAt=0,pausedTotal=0;
window.FufuRuntime={now:()=>performance.now()-pausedTotal-(paused?performance.now()-pausedAt:0)};
window.requestAnimationFrame=callback=>{
 let id=originalRaf(time=>{if(paused)waiting.set(id,callback);else callback(time-pausedTotal);});return id;
};
window.cancelAnimationFrame=id=>{waiting.delete(id);originalCancel(id);};
for(const name of ['AudioContext','webkitAudioContext']){
 const Base=window[name];if(Base)window[name]=new Proxy(Base,{construct(target,args){const ctx=Reflect.construct(target,args);audio.push(ctx);return ctx;}});
}
host.native={
 setPaused(value){
  if(value===paused)return;
  if(value){for(const [code,key] of held)this.key(code,key,false);pausedAt=performance.now();paused=true;}
  else{pausedTotal+=performance.now()-pausedAt;paused=false;for(const [id,cb] of waiting){waiting.delete(id);window.requestAnimationFrame(cb);}}
  for(const ctx of audio)void (value?ctx.suspend():ctx.resume()).catch(()=>{});
 },
 key(code,key,down){const canvas=document.querySelector('canvas');canvas?.focus();const keyCode={ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,Enter:13,Escape:27,Backspace:8,Space:32,KeyZ:90,KeyX:88,KeyC:67}[code]||key.toUpperCase().charCodeAt(0);const event=new KeyboardEvent(down?'keydown':'keyup',{code,key,keyCode,which:keyCode,bubbles:true,cancelable:true});canvas.dispatchEvent(event);if(down)for(const ctx of audio)void ctx.resume().catch(()=>{});},
 async text(text){
  // Real key events feed the author's typing buffer; the mobile field supplies ASCII/romaji.
  this.key('Escape','Escape',true);this.key('Escape','Escape',false);
  for(const ch of text){const code=/[a-z]/i.test(ch)?'Key'+ch.toUpperCase():ch===' '?'Space':ch==='-'?'Minus':/[0-9]/.test(ch)?'Digit'+ch:'Quote';this.key(code,ch,true);this.key(code,ch,false);await new Promise(r=>setTimeout(r,25));}
  this.key('Enter','Enter',true);this.key('Enter','Enter',false);
 },
 ready(){host.ready();}
};
window.addEventListener('keydown',e=>held.set(e.code,e.key));
window.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',()=>{for(const [code,key] of held)host.native.key(code,key,false);});
window.addEventListener('error',e=>host.error(e.message));
window.addEventListener('unhandledrejection',e=>host.error(String(e.reason?.message||e.reason)));
