/* One compact timeline for close observation, with pause, resume and scrubbing. */
export function createPlayback(getViewer, page, onStep) {
  const node=document.createElement('section');node.className='model-playback';
  const status=document.createElement('span');status.textContent='选择一个演示，慢慢观察';status.setAttribute('role','status');
  const label=document.createElement('label');label.textContent='当前步骤进度';
  const range=document.createElement('input');range.type='range';range.min=0;range.max=100;range.value=0;range.disabled=true;
  range.setAttribute('aria-label','当前步骤演示进度');label.append(range);
  const pause=document.createElement('button');pause.type='button';pause.textContent='暂停';pause.disabled=true;
  node.append(status,label,pause);
  let started=false,lastStep=-1;
  range.addEventListener('input',()=>getViewer()?.seekMotion(Number(range.value)/100));
  pause.addEventListener('click',()=>{
    const viewer=getViewer();if(!viewer)return;
    if(viewer.motionActive)viewer.pauseMotion();else viewer.resumeMotion();update();
  });
  function update() {
    if(!started || !page.classList.contains('active'))return;
    const viewer=getViewer();if(!viewer)return;
    range.value=Math.round(viewer.motionProgress*100);
    pause.textContent=viewer.motionActive?'暂停':'继续';
    pause.disabled=viewer.motionProgress>=1;
    const next=viewer.motionActive?'正在演示，可以暂停细看':viewer.motionProgress>=1?'演示完成，可以拖动进度回看':'已暂停，可以拖动进度细看';
    if(status.textContent!==next)status.textContent=next;
    if(lastStep!==viewer.motionStep){lastStep=viewer.motionStep;onStep?.(lastStep);}
  }
  const timer=setInterval(update,250);
  return {node,start(){started=true;range.disabled=false;pause.disabled=false;lastStep=-1;update();},
    stop(text='选择一个演示，慢慢观察'){started=false;status.textContent=text;range.value=0;range.disabled=true;pause.disabled=true;},
    dispose(){clearInterval(timer);node.remove();}};
}
