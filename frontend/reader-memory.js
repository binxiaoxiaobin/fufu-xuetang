/* Recall practice: preview, scatter, rebuild without answer-shaped shadows. */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function tokenize(lesson,memoryUnit){
    const text=memoryUnit==='sentence'?lesson.sentence:lesson.word;
    // English sentences use word blocks; words and Chinese use individual letters/characters.
    return memoryUnit==='sentence'&&lesson.language==='en-US'?(text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]):Array.from(text).filter(c=>/[\p{L}\p{N}]/u.test(c));
  }
  function mount({root,lesson,memoryUnit='word',onSubmit,onNext,onReturn,onStageComplete,onMistake,nextLabel,awardOnComplete=false,recallDistractors=[]}){
    let alive=true,phase='preview',drag=null,placed=[],pieces=[],saving=false,solved=false,checks=0,speechSerial=0,letterPlayback=Promise.resolve(),completionSpoken=false;
    window.FufuTTS.preloadRecordings?.([lesson.word_audio,lesson.sentence_audio,lesson.translation_audio]);
    const abort=new AbortController(),tokens=tokenize(lesson,memoryUnit),text=memoryUnit==='sentence'?lesson.sentence:lesson.word;
    const audio=()=>window.FufuTTS.playRecordings(memoryUnit==='sentence'?[lesson.sentence_audio]:[lesson.word_audio,...(lesson.language==='en-US'&&lesson.translation_audio?[lesson.translation_audio]:[])],{readerPace:true}).catch(()=>{if(alive)window.toast?.('声音暂时未播放，请再试一次');});
    const hint=text=>{const status=root.querySelector('#memoryHint');if(status)status.textContent=text;};
    const shuffled=values=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}if(result.length>1&&result.every((p,i)=>p.id===i))[result[0],result[1]]=[result[1],result[0]];return result;};
    function preview(){
      speechSerial++;resetDrag();window.FufuTTS.cancel('memory-preview');phase='preview';placed=Array(tokens.length).fill(null);
      root.innerHTML=`<section class="reader-workspace reader-theater reader-workshop memory-workspace" data-phase="preview"><div class="reader-theater-top"><span class="reader-step-label">${onStageComplete?'先看一遍':'01 / 先记在心里'}</span><button class="reader-listen" id="memoryHear">听完整${memoryUnit==='sentence'?'句子':'词语'}</button></div><div class="memory-preview"><p>慢慢看，准备好了再开始。</p><h2>${esc(text)}</h2>${memoryUnit!=='sentence'?`<p>${esc(lesson.pinyin||lesson.meaning)}</p>`:''}<div class="memory-preview-dots" aria-hidden="true"><span>✦</span><span>·</span><span>✧</span></div><button class="primary-btn" id="memoryBurst">记住了，砰！开始拼 →</button></div><p id="memoryHint" role="status">不用抢时间，想看多久都可以。</p></section>`;
      root.querySelector('#memoryHear').onclick=audio;root.querySelector('#memoryBurst').onclick=puzzle;
    }
    function puzzle(){
      speechSerial++;window.FufuTTS.cancel('memory-burst');phase='puzzle';solved=false;completionSpoken=false;placed=Array(tokens.length).fill(null);pieces=shuffled([...tokens,...(tokens.length===1?[...new Set(recallDistractors)].filter(t=>t!==tokens[0]).slice(0,2):[])].map((text,id)=>({text,id})));
      root.innerHTML=`<section class="reader-workspace reader-theater reader-workshop memory-workspace" data-phase="puzzle"><div class="reader-theater-top"><span class="reader-step-label">${onStageComplete?'凭记忆拼回来':'02 / 凭记忆拼回来'}</span><button class="reader-text-button" id="memoryLook">再看一次</button></div><div class="reader-puzzle-title"><h2>刚刚看见的，还记得吗？</h2><p>拖上去，或按顺序点选。格子里没有答案提示。</p></div><div class="reader-slots memory-slots ${memoryUnit==='sentence'&&lesson.language==='en-US'?'memory-word-slots':''}" role="group" aria-label="记忆拼写空格">${tokens.map((_,i)=>`<button class="reader-slot" data-memory-slot="${i}" aria-label="第 ${i+1} 个空格"></button>`).join('')}</div><div class="reader-tile-floor"><div class="reader-tiles reader-scattered memory-pieces">${pieces.map(({text,id},i)=>`<button class="reader-tile" data-memory-piece="${id}" style="--tilt:${[-8,5,-4,9][i%4]}deg;--scatter-x:${i%2?-75:75}px;--scatter-y:${i%2?65:-65}px" aria-label="字块 ${esc(text)}"><span>${esc(text)}</span><i class="tile-face" aria-hidden="true"><b></b><b></b><em></em></i></button>`).join('')}</div></div><p id="memoryHint" role="status">放错了可以点格子，把字块拿回来。</p><div class="reader-step-action"><button class="primary-btn" id="memoryCheck" hidden>重新保存</button></div></section>`;
      const pop=document.createElement('span');pop.className='memory-pop';pop.textContent='砰！';pop.setAttribute('aria-hidden','true');root.querySelector('.memory-workspace').append(pop);pop.addEventListener('animationend',()=>pop.remove(),{once:true,signal:abort.signal});
      const floor=root.querySelector('.memory-pieces');root.querySelectorAll('[data-memory-piece]').forEach(tile=>tile.style.setProperty('--burst-x',`${floor.clientWidth/2-tile.offsetLeft-tile.offsetWidth/2}px`));
      root.querySelector('#memoryLook').onclick=preview;root.querySelector('#memoryCheck').onclick=check;
      root.querySelectorAll('[data-memory-slot]').forEach(slot=>slot.onclick=()=>{if(saving||solved)return;const n=Number(slot.dataset.memorySlot),id=placed[n];if(id===null)return;placed[n]=null;slot.textContent='';slot.classList.remove('filled','memory-wrong');root.querySelector(`[data-memory-piece="${id}"]`).hidden=false;hint('这块拿回来啦，再想一想顺序。');});
    }
    function place(id,index){
      if(!alive||phase!=='puzzle'||saving||solved||placed.includes(id))return;const n=index??placed.findIndex(v=>v===null),piece=pieces.find(p=>p.id===id),slot=root.querySelector(`[data-memory-slot="${n}"]`);if(!piece||!slot||placed[n]!==null)return;
      placed[n]=id;slot.textContent=piece.text;slot.classList.add('filled');slot.classList.remove('memory-wrong');root.querySelector(`[data-memory-piece="${id}"]`).hidden=true;hint('拼完整后会自动检查，放错了可以拿回来。');
      if(lesson.language==='en-US'&&memoryUnit!=='sentence'){const serial=++speechSerial;letterPlayback=window.FufuTTS.speak(piece.text.toUpperCase(),'en-US',{readerPace:true}).catch(()=>{if(alive&&serial===speechSerial)hint('字母读音暂时没播放，可以拿回来再点一次。');});}
      if(placed.every(id=>id!==null))check();
    }
    async function check(){
      if(saving||solved)return;if(placed.some(id=>id===null)){hint('还有空格没填好，再补几块吧。');return;}
      checks++;let wrong=0;placed.forEach((id,i)=>{const bad=pieces.find(p=>p.id===id).text!==tokens[i];root.querySelector(`[data-memory-slot="${i}"]`).classList.toggle('memory-wrong',bad);if(bad)wrong++;});
      if(wrong){onMistake?.(lesson);hint(`有 ${wrong} 块位置还没对上。点标出的格子拿回来，再试一次。`);return;}
      solved=true;saving=true;hint('凭记忆拼对啦，正在记下这次练习…');
      const completionSerial=speechSerial;
      if(!completionSpoken){completionSpoken=true;letterPlayback.then(()=>{if(alive&&completionSerial===speechSerial)audio();});}
      try{const result=onStageComplete&&!awardOnComplete?{correct:true,reward:0}:await onSubmit(lesson.word);if(!alive||!result)return;if(!result.correct)throw new Error('保存失败');phase='finished';
        root.innerHTML=`<section class="reader-workspace reader-theater reader-workshop memory-workspace" data-phase="finished"><div class="reader-word-medal" aria-hidden="true">✓</div><div class="memory-preview"><h2>${esc(text)}</h2><p>${memoryUnit==='sentence'?'你把完整句子记回来啦。':esc(lesson.meaning)}</p></div><p id="memoryHint" role="status">${checks>1?'认真调整，也是一种进步':'凭记忆拼对啦'} ${onStageComplete&&!awardOnComplete?'· 字块拼对啦':`· 获得 ${result.reward} 积分`}</p><div class="reader-story-actions"><button class="reader-listen" id="memoryReplay">听完整读音</button><button class="primary-btn" id="memoryNext">${onStageComplete?'下一个 · 继续拼一拼 →':'再记一个 →'}</button><button class="reader-text-button" id="memoryChoose">换个内容</button></div></section>`;
        root.querySelector('#memoryReplay').onclick=()=>{speechSerial++;return audio();};if(nextLabel)root.querySelector('#memoryNext').textContent=nextLabel;root.querySelector('#memoryNext').onclick=()=>onStageComplete?onStageComplete():onNext(lesson);root.querySelector('#memoryChoose').textContent=onStageComplete?'返回主题':'换个内容';root.querySelector('#memoryChoose').onclick=onReturn;
      }catch(error){if(!alive)return;saving=false;solved=false;hint('刚才没有保存成功，可以重新保存。');const retry=root.querySelector('#memoryCheck');if(retry)retry.hidden=false;}
    }
    function resetDrag(){if(!drag)return;const {tile,pointer}=drag;if(tile.hasPointerCapture(pointer))tile.releasePointerCapture(pointer);tile.classList.remove('dragging');tile.style.transform='';drag=null;}
    root.addEventListener('click',e=>{const tile=e.target.closest('[data-memory-piece]');if(tile&&e.detail===0)place(Number(tile.dataset.memoryPiece));},{signal:abort.signal});
    root.addEventListener('pointerdown',e=>{const tile=e.target.closest('[data-memory-piece]');if(!tile||tile.hidden||phase!=='puzzle'||saving||solved||drag)return;drag={tile,id:Number(tile.dataset.memoryPiece),x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false};tile.setPointerCapture(e.pointerId);},{signal:abort.signal});
    root.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>8)drag.moved=true;if(drag.moved){drag.tile.classList.add('dragging');drag.tile.style.transform=`translate(${dx}px,${dy}px) rotate(0deg)`;}},{signal:abort.signal});
    root.addEventListener('pointerup',e=>{if(!drag||drag.pointer!==e.pointerId)return;const {tile,id,moved}=drag;tile.style.pointerEvents='none';const slot=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-memory-slot]');tile.style.pointerEvents='';resetDrag();if(!moved)place(id);else if(slot&&root.contains(slot))place(id,Number(slot.dataset.memorySlot));else hint('把字块拖到上方空格里。');},{signal:abort.signal});
    root.addEventListener('pointercancel',resetDrag,{signal:abort.signal});preview();
    return()=>{alive=false;speechSerial++;resetDrag();abort.abort();window.FufuTTS.cancel('memory-exit');};
  }
  window.FufuMemory={mount,tokenize};
})();
