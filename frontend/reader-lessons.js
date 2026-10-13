/* Small grouped playbooks. Content and recordings come from MySQL. */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const levels=['全部难度','认识起步','词句练习','进阶表达'];
  const topics=['水果','蔬菜','食物与饮品','生活用品','身体与衣物','动物朋友','自然与生命','出门与交通','动作与生活','位置与描述','朋友与表达'];
  const topicArt={水果:'apple',蔬菜:'carrot','食物与饮品':'bread',生活用品:'backpack','身体与衣物':'shirt',动物朋友:'cat','自然与生命':'tree','出门与交通':'train','动作与生活':'jump','位置与描述':'rainbow','朋友与表达':'friends'};
  const cache=new Map(),seen=new Set();let progress=new Map(),memoryFilter='active';
  let subject='语文',category='全部',level=1,startLesson,loadSerial=0,pick=null,completedRun=0;
  const settings={unit:'word',count:5};let selectedGroup=null;
  const page=document.createElement('main');page.id='page-reader';page.className='page reader-page';
  page.innerHTML=`<button class="back-link" id="readerHome">← 返回学习首页</button><header class="reader-heading"><div><span class="eyebrow">团团的词语游乐场</span><h1 id="readerTitle">把词语，玩进生活里</h1><p>同一小组：看着拼 → 听音辨词 → 句子选词 → 记住再拼。</p></div><div class="reader-subjects" role="group" aria-label="选择识字或单词"><button data-reader-subject="语文">识字快练</button><button data-reader-subject="英语">单词快练</button></div></header><div class="reader-memory-tabs" role="group" aria-label="字词练习范围"><button data-memory-filter="active" aria-pressed="true">开始学</button><button data-memory-filter="review" aria-pressed="false">待巩固</button><button data-memory-filter="new" aria-pressed="false">新字词</button><button data-memory-filter="mastered" aria-pressed="false">已记熟</button></div><div hidden><label>字词状态<select id="readerMemoryFilter"><option value="active">新词与待巩固</option><option value="new">还没练过</option><option value="review">还要练练</option><option value="mastered">已经记熟</option></select></label></div><div class="reader-playbook"><section class="reader-discovery"><div class="reader-pick-label"><span id="readerPickTopic">今天和谁玩？</span><button id="readerShuffle" class="reader-text-button">换一组 ↻</button></div><div id="readerPick"></div><div class="reader-playbook-actions"><button id="readerStart" class="primary-btn">开始这一组 →</button><span>先认识，再听和用，最后凭记忆拼回来</span></div><p id="readerGroupFocus"></p><p id="readerSummary" role="status"></p></section><aside class="reader-choices"><div class="reader-choice-heading"><h2>选个生活主题</h2><select id="readerTopicSelect" hidden aria-label="主题"></select></div><div id="readerTopics" role="group" aria-label="词汇主题"></div><p class="reader-choice-note">先选主题，就可以开始。记熟的字词不会自动出现。</p><details class="reader-refine"><summary>调整练习 <span>难度、题量与练习组</span></summary><div class="reader-refine-fields"><label>难度<select id="readerLevel"></select></label><label>每组<select id="readerGroupSize"><option value="5">5 个</option><option value="3">3 个 · 轻量</option></select></label><label>最后记什么<select id="readerUnit"><option value="word">字词</option><option value="character">单个汉字</option><option value="sentence">整句 · 进阶</option></select></label><label class="reader-group-select">选择练习组<select id="readerLearningGroup"></select></label></div></details></aside></div>`;
  document.querySelector('#page-quest').before(page);
  page.querySelector('#readerLevel').innerHTML=levels.map((label,i)=>`<option value="${i}">${label}</option>`).join('');
  page.querySelector('#readerLevel').value='1';
  page.querySelector('#readerUnit').onchange=e=>{settings.unit=e.target.value;choose();render();};
  page.querySelector('#readerLearningGroup').onchange=e=>{selectedGroup=availableGroups().find(g=>g.id===e.target.value);pick=groupItems()[0]||null;render();};
  page.querySelector('.reader-memory-tabs').onclick=e=>{const button=e.target.closest('[data-memory-filter]');if(!button)return;memoryFilter=button.dataset.memoryFilter;page.querySelector('#readerMemoryFilter').value=memoryFilter;choose();render();};
  page.querySelector('#readerMemoryFilter').onchange=e=>{memoryFilter=e.target.value;choose();render();};
  page.querySelector('#readerGroupSize').onchange=e=>{settings.count=Number(e.target.value);render();};
  page.querySelector('#readerHome').onclick=()=>window.navigate('home');
  page.querySelector('#readerTopicSelect').onchange=e=>{category=e.target.value;choose();render();};
  page.querySelector('#readerLevel').onchange=e=>{level=Number(e.target.value);choose();render();};
  page.querySelector('.reader-subjects').onclick=e=>{const b=e.target.closest('[data-reader-subject]');if(b)open(b.dataset.readerSubject,startLesson);};
  page.querySelector('#readerTopics').onclick=e=>{const b=e.target.closest('[data-reader-topic]');if(b){category=b.dataset.readerTopic;choose();render();}};
  page.querySelector('#readerShuffle').onclick=()=>{choose(pick);render();};
  page.querySelector('#readerStart').onclick=async()=>{if(!pick)return;const b=page.querySelector('#readerStart');b.disabled=true;try{const items=makeGroup();await startLesson(items,{...settings,groupId:selectedGroup.id,focus:selectedGroup.focus});}finally{b.disabled=false;}};
  function eligible(id){const status=progress.get(id)||'new';return memoryFilter==='active'?status!=='mastered':status===memoryFilter;}
  async function saveProgress(items){const response=await fetch('/api/learning/reader-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});const result=await response.json();if(!response.ok){if(response.status===401)window.FufuAuth?.ensure();throw new Error(result.error||'标记没有保存，请再试一次');}items.forEach(item=>progress.set(item.question_id,item.status));return result;}
  function availableGroups(){return (cache.get(subject)?.learning_groups||[]).filter(g=>(category==='全部'||g.category===category)&&(!level||g.level===level)&&(settings.unit!=='character'||g.kind==='character')&&g.question_ids.some(eligible));}
  function groupItems(){const byId=new Map((cache.get(subject)?.items||[]).map(i=>[i.question_id,i]));return (selectedGroup?.question_ids||[]).filter(eligible).map(id=>byId.get(id)).filter(Boolean);}
  function filtered(){const ids=new Set(availableGroups().flatMap(g=>g.question_ids));return (cache.get(subject)?.items||[]).filter(i=>ids.has(i.question_id));}
  function choose(exclude){const all=availableGroups();let pool=all.filter(g=>g.id!==selectedGroup?.id&&!g.question_ids.every(id=>seen.has(id)));if(!pool.length)pool=all.filter(g=>g.id!==selectedGroup?.id);pool.sort((a,b)=>Number(b.question_ids.some(id=>progress.get(id)==='review'))-Number(a.question_ids.some(id=>progress.get(id)==='review')));selectedGroup=pool[0]||all[0]||null;pick=groupItems()[0]||null;}
  function makeGroup(){const items=groupItems();return [...items.filter(i=>!seen.has(i.question_id)),...items.filter(i=>seen.has(i.question_id))].slice(0,settings.count);}
  function render(){
    const data=cache.get(subject);if(!data)return;
    page.querySelectorAll('[data-memory-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.memoryFilter===memoryFilter)));
    page.querySelector('#readerTitle').textContent=subject==='语文'?'把词语，玩进生活里':'把单词，玩进生活里';
    page.querySelectorAll('[data-reader-subject]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.readerSubject===subject)));
    page.querySelector('#readerTopics').innerHTML=['全部',...topics.filter(t=>data.categories.includes(t))].map(t=>`<button class="reader-topic" data-reader-topic="${esc(t)}" aria-pressed="${t===category}"><span>${esc(t==='全部'?'随便逛逛':t)}</span></button>`).join('');
    page.querySelector('#readerTopicSelect').innerHTML=['全部',...topics.filter(t=>data.categories.includes(t))].map(t=>`<option value="${esc(t)}" ${category===t?'selected':''}>${esc(t==='全部'?'随便逛逛':t)}</option>`).join('');
    const groups=availableGroups();
    page.querySelector('#readerLearningGroup').innerHTML=groups.map(g=>`<option value="${esc(g.id)}" ${g.id===selectedGroup?.id?'selected':''}>${esc(g.title)} · ${g.question_ids.filter(eligible).length} 个</option>`).join('');
    page.querySelector('#readerGroupFocus').textContent=selectedGroup?.focus||'';
    page.querySelector('#readerUnit option[value=character]').hidden=subject!=='语文';
    const items=filtered(),size=makeGroup().length;
    page.querySelector('#readerStart').textContent=`开始这一组 · ${size} 个 →`;
    page.querySelector('#readerSummary').textContent=`${data.total} 个${subject==='语文'?'词语':'单词'} · 待巩固 ${data.items.filter(i=>progress.get(i.question_id)==='review').length} 个 · 已记熟 ${data.items.filter(i=>progress.get(i.question_id)==='mastered').length} 个 · 每词完成奖励 1 积分`;
    page.querySelector('#readerPickTopic').textContent=pick?`${selectedGroup.title} · 本组预览一个词`:'这个主题暂时没有所选难度';
    page.querySelector('#readerPick').innerHTML=pick?`<div class="reader-word-preview" aria-hidden="true">${Array.from(pick.word).map((letter,i)=>`<span class="${letter===' '?'reader-preview-space':''}" style="--tilt:${[-7,5,-3,8][i%4]}deg">${esc(letter)}</span>`).join('')}</div><div class="reader-cover-word">${esc(pick.word)}</div><p class="reader-cover-pronunciation">${esc(pick.pinyin||pick.meaning)}</p><p class="reader-cover-sentence">${esc(pick.sentence)}</p>`:'<div class="reader-empty">换个难度，再来认识新朋友吧。</div>';
    page.querySelector('#readerStart').disabled=!pick;page.querySelector('#readerShuffle').disabled=availableGroups().length<2;
  }
  async function open(nextSubject,callback){
    if(subject!==nextSubject){category='全部';level=1;pick=null;page.querySelector('#readerLevel').value='1';if(settings.unit==='character'&&nextSubject==='英语'){settings.unit='word';page.querySelector('#readerUnit').value='word';}}
    subject=nextSubject;startLesson=callback;window.navigate('reader');const serial=++loadSerial;
    progress=new Map();try{const response=await fetch('/api/learning/reader-progress',{cache:'no-store'});if(!response.ok)throw new Error('请先登录学习账号');const data=await response.json();if(serial!==loadSerial)return;progress=new Map(data.items.map(i=>[i.question_id,i.status]));}catch(error){if(serial!==loadSerial)return;window.FufuAuth?.ensure();page.querySelector('#readerPick').innerHTML='<p>需要登录学习账号，才能读取你的生词与熟词。</p>';page.querySelector('#readerStart').disabled=true;return;}
    if(cache.has(subject)){choose();render();return;}
    page.querySelector('#readerPick').innerHTML='<p role="status">正在翻开词语游乐场…</p>';page.querySelector('#readerStart').disabled=true;
    try{const response=await fetch('/api/learning/reader-lessons?subject='+encodeURIComponent(subject));if(!response.ok)throw new Error('加载失败');const data=await response.json();if(serial!==loadSerial)return;cache.set(subject,data);choose();render();}
    catch(error){if(serial!==loadSerial)return;page.querySelector('#readerPick').innerHTML='<p>词语暂时未加载。</p><button id="readerRetry">重新加载</button>';page.querySelector('#readerRetry').onclick=()=>open(subject,callback);}
  }
  function next(item){seen.add(item.question_id);choose(item);return pick||item;}
  function mount({root,lesson,onSubmit,onNext,onReturn,stage='word',onStageComplete,onMistake,roundChoices,recognitionDistractors,nextLabel}){
    let sentenceReady=false,sentenceAnswered=false,sentenceReadSerial=0;
    let alive=true,phase=stage,placed=[],pieces=[],drag=null,submitting=false,finished=false,mistakes=0,speechSerial=0,recognition=false;
    window.FufuTTS.preloadRecordings?.([lesson.word_audio,lesson.sentence_audio,lesson.translation_audio]);
    const abort=new AbortController();
    const shuffle=values=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
    const play=field=>{speechSerial++;const path=lesson[field+'_audio'];if(!path)return window.FufuTTS.speak(lesson[field]||lesson.word,field==='translation'?'zh-CN':lesson.language||'zh-CN').then(result=>{if(alive&&!result.hit)window.browserSpeak?.(lesson[field]||lesson.word,field==='translation'?'zh-CN':lesson.language||'zh-CN');});return window.FufuTTS.playRecording(path).catch(()=>window.FufuTTS.speak(lesson[field]||lesson.word,field==='translation'?'zh-CN':lesson.language||'zh-CN'));};
    function playWholeWord(){
      speechSerial++;
      const urls=[lesson.word_audio];
      if(lesson.language==='en-US'&&lesson.translation_audio)urls.push(lesson.translation_audio);
      return urls.length?window.FufuTTS.playRecordings(urls,{readerPace:true}).catch(()=>window.FufuTTS.speak(lesson.word,lesson.language||'zh-CN')):window.FufuTTS.speak(lesson.word,lesson.language||'zh-CN');
    }
    function readPlacedLetter(letter,last){
      const serial=++speechSerial;
      // Letter names are a separate recording from pronunciation of the whole word.
      // The last letter must finish before the whole word; navigation cancels both.
      window.FufuTTS.speak(letter.toUpperCase(),'en-US',{readerPace:true}).then(result=>{
        if(alive&&phase==='word'&&serial===speechSerial&&!result.interrupted&&last)playWholeWord();
      }).catch(()=>{if(alive&&phase==='word'&&serial===speechSerial){if(last)playWholeWord();else window.toast?.('字母声音暂时未播放，请再试一次');}});
    }
    const announce=text=>{const hint=root.querySelector('#readerHint');if(hint)hint.textContent=text;};
    const candidates=()=>shuffle([...new Set([lesson.word,...(roundChoices||lesson.choice_words||[])])]);
    async function readSentenceFirst(){
      const serial=++sentenceReadSerial;sentenceReady=false;
      root.querySelectorAll('[data-choice]').forEach(b=>b.disabled=true);
      announce('先听完整句子，听完再选。');
      try{
        const result=await window.FufuTTS.playRecording(lesson.sentence_audio,{readerPace:true});
        if(!alive||phase!=='sentence'||serial!==sentenceReadSerial||sentenceAnswered)return;
        if(result?.interrupted||result?.hit===false){announce('句子还没听完，点“再听句子”后再选。');return;}
        sentenceReady=true;root.querySelectorAll('[data-choice]').forEach(b=>b.disabled=false);
        announce('听完啦，哪个词能把句子补完整？');
      }catch(error){if(alive&&serial===sentenceReadSerial)announce('句子暂时没播放，请点“再听句子”重试。');}
    }
    function draw(){
      speechSerial++;
      if(drag)resetDrag();
      const tokens=Array.from(lesson.word).filter(c=>c!==' '),boundaries=new Set();let letterIndex=0;for(const c of lesson.word){if(c===' ')boundaries.add(letterIndex);else letterIndex++;}
      placed=Array(tokens.length).fill(null);
      const isWord=phase==='word',isListen=phase==='listen';
      recognition=isWord&&lesson.language!=='en-US'&&tokens.length===1;
      const similarCharacters={手:['毛'],头:['大','买'],脚:['却','角'],足:['走','是'],日:['目','田'],木:['本','禾'],人:['入','大'],入:['人','八'],大:['太','天'],口:['回','日'],月:['用','目'],牛:['午','生'],王:['玉','主'],天:['夫','大'],己:['已','巳'],未:['末','木'],千:['干','于'],鸟:['乌','马'],刀:['力','刃']};
      const choices=recognition?shuffle([...new Set([tokens[0],...(recognitionDistractors||[]),...(lesson.extra_characters||[]),...(similarCharacters[tokens[0]]||[])])].filter(text=>Array.from(text).length===1)):[];
      pieces=(recognition?choices:[...tokens,...(lesson.extra_characters||[])]).map((text,id)=>({text,id}));
      root.innerHTML=`<section class="reader-workspace reader-theater reader-workshop" data-phase="${phase}"><div class="reader-theater-top"><span class="reader-step-label">${isWord?(recognition?'01 / 汉字来找家':'01 / 字块大散步'):isListen?'03 / 耳朵小侦探':'02 / 句子找朋友'}</span><button class="reader-listen" id="readerHearWord">${phase==='sentence'?'再听句子':isListen?'再听一次':'听'+(lesson.language==='en-US'?'单词':'词语')}</button></div><div class="reader-round-track" aria-label="三步词句练习">${['拼一拼','选一选','听一听'].map((label,i)=>`<span class="${i===({word:0,sentence:1,listen:2}[phase])?'active':''}">${i+1} ${label}</span>`).join('')}</div><div class="reader-puzzle-title"><h2>${isWord?esc(lesson.word):isListen?'听到的是哪一个？':'句子缺了谁？'}</h2><p>${isWord?esc(lesson.pinyin||lesson.meaning):isListen?'先听声音，再选出对应的词。':'选出刚刚认识的词，把句子补完整。'}</p></div><div class="reader-puzzle-area"><p class="reader-instruction">${recognition?'看着底色字，找一个一样的汉字放上去。可以点字，也可以拖过去。':isWord?'看着浅色字形，把字块按顺序放回去。可以点字，也可以拖过去。':isListen?'不用计时，没听清可以再听一次。':'候选词里有相似的小伙伴，仔细看一看。'}</p>${isWord?`<div class="reader-slots ${recognition?'reader-recognition-slots':''}">${tokens.map((token,i)=>`${boundaries.has(i)?'<span class="reader-word-divider" aria-label="词间空格"></span>':''}<button class="reader-slot" data-slot="${i}" aria-label="${recognition?`底色字：${esc(token)}`:`第 ${i+1} 个位置${lesson.language==='en-US'?'':`：${esc(token)}`}`}"><span>${esc(token)}</span></button>`).join('')}</div><div class="reader-tile-floor"><div class="reader-tiles reader-scattered ${recognition?'reader-recognition-tiles':''}">${pieces.map(({text,id},i)=>`<button class="reader-tile" data-piece="${id}" style="--tilt:${[-9,7,-5,10][i%4]}deg;--delay:${i*.08}s;--scatter-x:${[100,-90,40,-65,80,-30][i%6]}px;--scatter-y:${[-70,65,-90,70,-55,85][i%6]}px" aria-label="字块 ${esc(text)}"><span>${esc(text)}</span><i class="tile-face" aria-hidden="true"><b></b><b></b><em></em></i></button>`).join('')}</div></div>`:isListen?'<button class="reader-sound-orb" id="readerSound" aria-label="播放词语录音"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 25h10l14-12v38L22 39H12z" fill="currentColor"/><path d="M43 22q12 10 0 20M48 14q22 18 0 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>点一下，听声音</span></button>':`<div class="reader-sentence-question"><span>${esc(lesson.before)}</span><span class="reader-sentence-gap" aria-label="句子空位">?</span><span>${esc(lesson.after)}</span></div>`}${!isWord?`<div class="reader-word-choices" role="group" aria-label="选择正确的词">${candidates().map((word,i)=>`<button style="--tilt:${[-5,4,-3][i%3]}deg" data-choice="${esc(word)}" ${phase==='sentence'?'disabled':''}><span class="reader-choice-text">${esc(word)}</span><i class="tile-face" aria-hidden="true"><b></b><b></b><em></em></i></button>`).join('')}</div>`:''}<p id="readerHint" role="status" aria-live="polite">${isWord?'可以拖，也可以按顺序点一下。':isListen?'准备好了就点声音按钮。':'相似词也在这里，选出本轮学过的那个。'}</p><div class="reader-step-action" id="readerStepAction">${isWord?'<button class="reader-text-button" id="readerScatter">再散开一次 ↻</button>':''}</div></div></section>`;
      root.querySelector('#readerHearWord').onclick=()=>phase==='sentence'?readSentenceFirst():play('word');
      if(isWord){const floor=root.querySelector('.reader-tiles');root.querySelectorAll('[data-piece]').forEach(tile=>tile.style.setProperty('--burst-x',`${floor.clientWidth/2-tile.offsetLeft-tile.offsetWidth/2}px`));}
      root.querySelector('#readerSound')?.addEventListener('click',()=>play('word'));
      root.querySelector('#readerScatter')?.addEventListener('click',()=>{draw();announce('重新散开了，试着自己拼回来。');});
      root.querySelectorAll('[data-slot]').forEach(slot=>slot.onclick=()=>{const n=Number(slot.dataset.slot),id=placed[n];if(id===null||submitting||finished)return;placed[n]=null;slot.classList.remove('filled');root.querySelector(`[data-piece="${id}"]`).hidden=false;root.querySelector('#readerStepAction').replaceChildren();announce('可以重新放一放。');});
      root.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>chooseWord(button));
    }
    function chooseWord(button){
      if(submitting||finished||button.disabled||(phase==='sentence'&&!sentenceReady))return;
      if(button.dataset.choice!==lesson.word){mistakes++;onMistake?.(lesson); button.classList.remove('try-again');void button.offsetWidth;button.classList.add('try-again');button.setAttribute('aria-label',button.textContent+'，再试试');announce(`你选的是“${button.dataset.choice}”。再听听本轮的词，看看哪里不一样。`);play('word');return;}
      root.querySelectorAll('[data-choice]').forEach(b=>{b.disabled=true;if(b===button)b.classList.add('correct-choice');else b.classList.add('quiet-choice');});
      if(phase==='sentence'){
        sentenceAnswered=true;const gap=root.querySelector('.reader-sentence-gap');gap.textContent=lesson.word;gap.classList.add('filled');
        announce('选对啦，句子补完整了！');playWholeWord();
        root.querySelector('#readerStepAction').innerHTML='<button class="primary-btn" id="readerToListen">挑战耳朵小侦探 →</button>';
        root.querySelector('#readerToListen').textContent=onStageComplete?(nextLabel||'下一个 · 继续选一选 →'):'挑战耳朵小侦探 →';
        root.querySelector('#readerToListen').onclick=()=>{if(onStageComplete){onStageComplete();return;}phase='listen';draw();play('word');};
      }else if(onStageComplete){
        finished=true;announce('听对啦！稍后再用记忆拼回来。');playWholeWord();
        root.querySelector('#readerStepAction').innerHTML='<button class="primary-btn" id="readerStageNext"></button>';
        root.querySelector('#readerStageNext').textContent=nextLabel||'继续 →';root.querySelector('#readerStageNext').onclick=onStageComplete;
      }else save();
    }
    function showFinish(result){
      finished=true;seen.add(lesson.question_id);completedRun++;
      root.querySelector('.reader-theater').dataset.phase='finished';
      root.querySelector('.reader-step-label').textContent='这一轮完成啦';
      root.querySelector('.reader-puzzle-title').innerHTML=`<div class="reader-word-medal" aria-hidden="true">✓</div><h2>${esc(lesson.word)}</h2><p>${esc(lesson.pinyin||lesson.meaning)}</p>`;
      root.querySelector('.reader-round-track').innerHTML='<span class="done">✓ 拼一拼</span><span class="done">✓ 选一选</span><span class="done">✓ 听一听</span>';
      root.querySelector('.reader-puzzle-area').innerHTML=`<div class="reader-finished-sentence">${esc(lesson.before)}<mark>${esc(lesson.word)}</mark>${esc(lesson.after)}</div><p class="reader-story-meaning">${esc(lesson.meaning)}</p><p id="readerHint" role="status">${mistakes?'认真辨一辨，也是一种进步':'字形、句子和声音，都认识啦'} · 获得 ${result.reward} 积分</p><div class="reader-story-actions"><button class="reader-listen" id="readerFinishedWord">听词语 · 中文释义</button><button class="reader-listen" id="readerReplay">听完整句子</button><button class="primary-btn" id="readerAnother">再玩一个词 →</button><button class="reader-text-button" id="readerChoose">换个主题</button></div><p class="reader-break-note">${completedRun%5===0?'又认真玩了 5 个词，也可以休息一下眼睛。':'不用赶进度，每一个词都可以慢慢玩。'}</p>`;
      root.querySelector('#readerFinishedWord').textContent=lesson.language==='en-US'?'听单词 · 中文名称':'听完整词语';root.querySelector('#readerFinishedWord').onclick=playWholeWord;root.querySelector('#readerReplay').onclick=()=>play('sentence');
      root.querySelector('#readerAnother').onclick=()=>onNext(next(lesson));root.querySelector('#readerChoose').onclick=()=>{choose(lesson);onReturn();};play('sentence');
    }
    async function save(){
      submitting=true;announce('答对啦，正在记下这次练习…');
      try{const result=await onSubmit(lesson.word);if(!alive||!result)return;if(!result.correct)throw new Error('请再试一次');if(onStageComplete){finished=true;announce(`听对啦 · 获得 ${result.reward} 积分`);playWholeWord();root.querySelector('#readerStepAction').innerHTML='<button class="primary-btn" id="readerStageNext">下一个 · 继续听一听 →</button>';root.querySelector('#readerStageNext').textContent=nextLabel||'下一个 · 继续听一听 →';root.querySelector('#readerStageNext').onclick=onStageComplete;}else showFinish(result);}
      catch(error){if(!alive)return;submitting=false;announce('刚才没有保存成功，可以重新保存。');root.querySelector('#readerStepAction').innerHTML='<button class="primary-btn" id="readerSaveRetry">重新保存</button>';root.querySelector('#readerSaveRetry').onclick=save;}
    }
    function place(id,index){
      if(!alive||phase!=='word'||submitting||finished||placed.includes(id))return;
      const piece=pieces.find(p=>p.id===id),n=index??placed.findIndex(v=>v===null),slot=root.querySelector(`[data-slot="${n}"]`);if(!piece||!slot||placed[n]!==null)return;
      if(piece.text!==(recognition?lesson.word:slot.querySelector('span').textContent)){mistakes++;onMistake?.(lesson); const tile=root.querySelector(`[data-piece="${id}"]`);tile.classList.remove('try-again');void tile.offsetWidth;tile.classList.add('try-again');announce(recognition?`“${piece.text}”还没对上底色字，看看字形再找找。`:`“${piece.text}”还没对上这个位置，仔细看看字形。`);return;}
      placed[n]=id;if(recognition)slot.querySelector('span').textContent=piece.text;slot.classList.add('filled');root.querySelector(`[data-piece="${id}"]`).hidden=true;announce(recognition?'对上底色字啦！':'这块找到家啦！');
      const last=placed.every(v=>v!==null);
      if(lesson.language==='en-US')readPlacedLetter(piece.text,last);
      if(!last)return;
      root.querySelector('.reader-slots').classList.add('word-complete');if(lesson.language!=='en-US')playWholeWord();announce(lesson.language==='en-US'?`拼好了！听完整单词，再听中文：${lesson.translation||lesson.meaning}。`:'拼好了！听听这个完整词语的读音。');
      root.querySelector('#readerStepAction').innerHTML='<button class="reader-listen" id="readerWholeWord">再听完整词</button><button class="primary-btn" id="readerToSentence">去句子里找一找 →</button>';
      root.querySelector('#readerWholeWord').onclick=playWholeWord;
      root.querySelector('#readerToSentence').textContent=onStageComplete?(nextLabel||'下一个 · 继续拼一拼 →'):'去句子里找一找 →';
      root.querySelector('#readerToSentence').onclick=()=>{if(onStageComplete){onStageComplete();return;}phase='sentence';draw();readSentenceFirst();};
    }
    root.addEventListener('click',e=>{const tile=e.target.closest('[data-piece]');if(tile&&e.detail===0)place(Number(tile.dataset.piece));},{signal:abort.signal});
    root.addEventListener('pointerdown',e=>{const tile=e.target.closest('[data-piece]');if(!tile||tile.hidden||submitting||finished||phase!=='word'||drag)return;drag={tile,id:Number(tile.dataset.piece),x:e.clientX,y:e.clientY,moved:false,pointer:e.pointerId};tile.setPointerCapture(e.pointerId);},{signal:abort.signal});
    root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>8)drag.moved=true;if(drag.moved){drag.tile.classList.add('dragging');drag.tile.style.transform=`translate(${dx}px,${dy}px) rotate(0deg)`;}},{signal:abort.signal});
    function resetDrag(){if(!drag)return;const {tile,pointer}=drag;if(tile.hasPointerCapture(pointer))tile.releasePointerCapture(pointer);tile.classList.remove('dragging');tile.style.transform='';drag=null;}
    root.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const {id,moved,tile}=drag;tile.style.pointerEvents='none';const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-slot]');tile.style.pointerEvents='';resetDrag();if(!moved)place(id);else if(hit&&root.contains(hit))place(id,Number(hit.dataset.slot));else announce('把小字块送到上面的影子里。');},{signal:abort.signal});
    root.addEventListener('pointercancel',resetDrag,{signal:abort.signal});draw();if(phase==='listen')play('word');if(phase==='sentence')readSentenceFirst();
    return()=>{alive=false;sentenceReadSerial++;speechSerial++;resetDrag();abort.abort();window.FufuTTS.cancel('reader-exit');};
  }
  window.FufuReader={open,mount,saveProgress,markSeen:items=>items.forEach(item=>seen.add(item.question_id))};
})();
