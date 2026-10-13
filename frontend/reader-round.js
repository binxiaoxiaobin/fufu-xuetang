/* One small set revisited across spelling, context and listening. */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function shuffle(values,random=Math.random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function orderAfter(previous,random=Math.random){
    if(previous.length<2)return [...previous];
    for(let attempt=0;attempt<24;attempt++){
      const order=shuffle(previous,random);
      if(order.every((id,i)=>id!==previous[i])&&(previous.length===2||order[0]!==previous.at(-1)))return order;
    }
    // A rotation guarantees each word changes position, even with a fixed RNG.
    for(let offset=1;offset<previous.length;offset++){
      const order=[...previous.slice(offset),...previous.slice(0,offset)];
      if(previous.length===2||order[0]!==previous.at(-1))return order;
    }
    return [...previous.slice(1),previous[0]];
  }
  function plan(items,random=Math.random){
    const first=shuffle(items.map(item=>item.question_id),random),second=orderAfter(first,random);
    const third=orderAfter(second,random);return [first,second,third,orderAfter(third,random)];
  }
  function mount({root,items,settings,onSubmit,onReturn,onNextRound,onFinish,onProgress}){
    let alive=true,cleanup=null,stage=0,index=0,reward=0;
    const orders=plan(items),byId=new Map(items.map(item=>[item.question_id,item])),mistakes=new Set(),saved=new Map();
    const stages=['word','listen','sentence','memory'],labels=['看着拼','听音辨词','句子选词','记住再拼'];
    const abort=new AbortController();
    function clear(){cleanup?.();cleanup=null;window.FufuTTS.cancel('reader-round-step');}
    function frame(){
      clear();root.innerHTML=`<section class="reader-group-frame"><div class="reader-group-track" aria-label="整组练习进度">${labels.map((label,i)=>`<span class="${i===stage?'active':i<stage?'done':''}">${i<stage?'✓':i+1} ${label}<small>${i<stage?'已完成':i===stage?`${index+1} / ${items.length}`:`${items.length} 个`}</small></span>`).join('')}</div><div id="readerGroupActivity"></div></section>`;
      onProgress?.(stage*items.length+index,items.length*4,labels[stage]);
      return root.querySelector('#readerGroupActivity');
    }
    function introduction(){
      if(!alive)return;const activity=frame();
      const copy=['先看着字形，把这一组逐个拼回来。','还是这一组，换个顺序，让耳朵认出它们。','先听完整句子，再选词把句子补回来。','已经见过、听过了。先看一遍，再把它拼回没有提示的空格里。'][stage];
      activity.innerHTML=`<section class="reader-workspace reader-round-intro"><div class="memory-launch-symbol" aria-hidden="true"><span>${stage+1}</span><span>${['拼','听','选','记'][stage]}</span></div><h2>${stage===0?`这一组 · ${items.length} 个字词`:`换个顺序 · ${labels[stage]}`}</h2><p>${copy}</p><p>${stage===0?esc(settings.focus||'看着拼 · 有字形帮助，适合先认识'):''}</p><button class="primary-btn" id="readerStageStart">开始${labels[stage]} →</button></section>`;
      activity.querySelector('#readerStageStart').onclick=draw;
    }
    function advance(){
      if(!alive)return;index++;
      if(index<items.length){draw();return;}
      index=0;stage++;
      if(stage===4)finish();else introduction();
    }
    function draw(){
      if(!alive)return;const activity=frame(),lesson=byId.get(orders[stage][index]);
      const alternatives=shuffle(items.filter(item=>item.question_id!==lesson.question_id).map(item=>item.word));
      const options={root:activity,lesson,stage:stages[stage],memoryUnit:settings.unit,awardOnComplete:true,recallDistractors:alternatives.filter(word=>Array.from(word).length===1).slice(0,2),
        recognitionDistractors:items.filter(item=>item.question_id!==lesson.question_id).map(item=>item.word).filter(word=>Array.from(word).length===1),
        nextLabel:index+1===items.length?(stage===3?'完成这一组 ✓':`整组${labels[stage]}好了，去${labels[stage+1]} →`):`下一个 · 继续${labels[stage]} →`,
        roundChoices:[...new Set([...alternatives,...(lesson.choice_words||[])])].slice(0,2),
        onMistake:()=>mistakes.add(lesson.question_id),onStageComplete:advance,onReturn,
        onSubmit:async answer=>{
          if(saved.has(lesson.question_id))return saved.get(lesson.question_id);
          const result=await onSubmit(lesson,answer);
          if(!alive||!result)return null;
          if(result.correct){saved.set(lesson.question_id,result);reward+=Number(result.reward||0);}
          return result;
        }};
      cleanup=stage===3?window.FufuMemory.mount(options):window.FufuReader.mount(options);
      activity.querySelector('.reader-round-track')?.remove();
      const stepLabel=activity.querySelector('.reader-step-label');if(stepLabel)stepLabel.textContent=`${labels[stage]} · ${index+1} / ${items.length}`;
      // The shared strip above owns progress; don't show two competing sets of 1/2/3.
    }
    function finish(){
      clear();if(!alive)return;window.FufuReader.markSeen(items);onProgress?.(items.length*4,items.length*4,'完成');onFinish?.();
      const statuses=new Map(items.map(item=>[item.question_id,'review']));let saveQueue=Promise.resolve();
      function persist(values){saveQueue=saveQueue.catch(()=>{}).then(()=>window.FufuReader.saveProgress(values));return saveQueue;}
      const allMarks=()=>items.map(item=>({question_id:item.question_id,status:statuses.get(item.question_id)}));
      root.innerHTML=`<section class="reader-workspace reader-round-finish"><div class="reader-word-medal" aria-hidden="true">✓</div><h2>这一组，认得也记得啦</h2><p>完成 ${items.length} 个字词 · 获得 ${reward} 积分</p><p>哪些还要练？哪些已经记熟？你来标记。</p><div class="reader-group-review">${items.map(item=>`<article class="reader-review-card"><button data-review="${item.question_id}" aria-label="听${esc(item.word)}"><b>${esc(item.word)}</b><small>${esc(item.translation||item.pinyin||item.meaning)}</small><span>${mistakes.has(item.question_id)?'这次有些混淆，建议再练':'点一下，听完整读音'}</span></button><div class="reader-memory-marks" role="group" aria-label="${esc(item.word)}的记忆状态"><button data-mark="review" data-word-id="${item.question_id}" aria-pressed="true">还要练练</button><button data-mark="mastered" data-word-id="${item.question_id}" aria-pressed="false">已经记熟</button></div></article>`).join('')}</div><p id="readerMarkHint" role="status">默认加入待巩固；记熟的词可以标记，之后不再自动挑选。</p><div class="reader-story-actions">${mistakes.size?'<button class="secondary-btn" id="readerRetryWords">再巩固容易混淆的 →</button>':''}<button class="primary-btn" id="readerNewGroup">保存标记，换一组 →</button><button class="reader-text-button" id="readerRoundReturn">保存并返回主题</button></div></section>`;
      const hint=message=>{if(alive)root.querySelector('#readerMarkHint').textContent=message;};
      root.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>{const lesson=byId.get(Number(button.dataset.review));window.FufuTTS.playRecordings([lesson.word_audio,...(lesson.language==='en-US'&&lesson.translation_audio?[lesson.translation_audio]:[])],{readerPace:true}).catch(()=>{if(alive)window.toast?.('声音暂时未播放，请再试一次');});});
      persist(allMarks()).then(()=>hint('已加入待巩固。记熟的词，可以点“已经记熟”。')).catch(error=>hint(error.message+'，请点击保存重试。'));
      root.querySelectorAll('[data-mark]').forEach(button=>button.onclick=async()=>{
        const qid=Number(button.dataset.wordId),status=button.dataset.mark,buttons=[...root.querySelectorAll(`[data-word-id="${qid}"]`)];buttons.forEach(b=>b.disabled=true);hint('正在保存记忆标记…');
        try{await persist([{question_id:qid,status}]);if(!alive)return;statuses.set(qid,status);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mark===status)));hint(status==='mastered'?'已记熟，下次不再自动挑选；可在熟词中重新练习。':'已加入待巩固，下次会优先出现。');}
        catch(error){hint(error.message+'，请再点一次。');}finally{if(alive)buttons.forEach(b=>b.disabled=false);}
      });
      async function leave(action,button){button.disabled=true;try{await saveQueue.catch(()=>{});await persist(allMarks());if(alive)await action();}catch(error){hint(error.message+'，标记未保存，请重试。');}finally{if(alive)button.disabled=false;}}
      root.querySelector('#readerRetryWords')?.addEventListener('click',event=>leave(()=>onNextRound(items.filter(item=>mistakes.has(item.question_id)),settings),event.currentTarget),{signal:abort.signal});
      root.querySelector('#readerNewGroup').onclick=event=>leave(onReturn,event.currentTarget);root.querySelector('#readerRoundReturn').onclick=event=>leave(onReturn,event.currentTarget);
    }
    introduction();
    return()=>{alive=false;clear();abort.abort();};
  }
  window.FufuReaderRound={mount,plan,orderAfter};
})();
