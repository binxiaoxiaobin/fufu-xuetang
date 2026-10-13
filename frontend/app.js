const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let readerCleanup=null;
const state = { profile: null, questions: [], stories: [], storyPreview: [], storyType:'', storyPage:0, storyPages:0, storyTotal:0, storyTotals:{}, storyLoading:false, subject: '数学', quiz: [], quizSessionId: null, quizMode: 'challenge', quizKnowledgePoint: '', quizCorrectCount: 0, rapidStreak: 0, index: 0, story: null, paragraph: 0, deck: 'pinyin', mathCardView:'table', oralOperation: 'mixed', oralProblem: null, selected: null, wrongAttempts: 0 };
const letterWords = [
  ['apple','🍎'],['ball','⚽'],['cat','🐱'],['dog','🐶'],['egg','🥚'],['fish','🐟'],['gift','🎁'],['hat','🎩'],['ice cream','🍦'],['juice','🧃'],['kite','🪁'],['lion','🦁'],['milk','🥛'],['nest','🪺'],['orange','🍊'],['panda','🐼'],['queen','👑'],['rabbit','🐰'],['sun','☀️'],['tiger','🐯'],['umbrella','☂️'],['van','🚐'],['water','💧'],['fox','🦊'],['yo-yo','🪀'],['zebra','🦓']
];
const decks = {
  actions: { subject:'英语', title: '生活英语卡片', hint: '认识身边的物品、水果和蔬菜，学动作，也学会说一句英语。' },
  songs: { subject:'英语', title: '儿童英文儿歌', hint: '选一首熟悉的英文儿歌，点歌词里的任意单词，就能听单词发音。' },
  pinyin: { subject:'语文', title:'声母与韵母', hint:'点卡片听真人示范音，再跟着读。' },
  poetry: { subject:'语文', title:'诗词小花园', hint:'听一听古典诗词，也把诗里的风景装进心里。' },
  battles: {subject:'语文',title:'著名战役',hint:'读战役、认识人物，沿着朝代时间线理解历史。'},
  strategies: {subject:'语文',title:'三十六计',hint:'读文言原文与白话讲解，辨析古今语义和故事。'},
  history: { subject:'语文', title:'朝代时光轴', hint:'理清朝代顺序，认识人物，再走进相关的诗词与故事。' },
  times: { subject:'数学', title: '九九乘法口诀', hint: '乘法口诀和口算练习分成两个小模块，按需要切换。' },
  letters: { subject:'英语', title: '26 个英文字母', hint: '点字母听英语示范：字母名称加一个简单单词。', groups: [{ name: '字母与简单词汇', entries: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((x,i)=>[`${x} ${x.toLowerCase()}`,`${letterWords[i][1]} ${x} for ${letterWords[i][0]}`,`${x} for ${letterWords[i][0]}`]) }] },
  science: { subject:'科学', title:'科学发现卡', hint:'从天空、植物和身边的小实验开始，带着问题去观察。' }
};

async function api(path, options = {}) {
  const response = await fetch(`${window.FUFU_API_BASE || ''}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const result = await response.json();
  if (!response.ok) {
    const message=result.error || '网络开小差了，请再试一次。';
    // An open page may outlive its learner session or share an admin login.
    if ([401,403].includes(response.status)&&/登录|学习账号|会话/.test(message)) {
      window.FufuTTS?.cancel('login-required');
      window.FufuAuth?.ensure().catch(()=>{});
    }
    throw new Error(message);
  }
  return result;
}
function toast(message) { const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2300); }
function preferredVoice(lang) {
  const voices=speechSynthesis.getVoices();
  const language=String(lang||'zh-CN').toLowerCase();
  const base=language.split('-')[0];
  const matching=voices.filter(v=>v.lang.toLowerCase()===language || v.lang.toLowerCase().startsWith(`${base}-`) || v.lang.toLowerCase()===base);
  const femaleNames=base==='zh'
    ? /xiaoxiao|xiaoyi|xiaohan|huihui|yaoyao|tingting|yating|晓晓|晓伊|晓涵|慧慧|丫丫|婷婷|雅婷|小梅|小美/i
    : /aria|jenny|sonia|ava|emma|samantha|zira|女|female/i;
  const masculineNames=/kangkang|yunxi|yunyang|yunfeng|康康|云希|云扬|云峰|\bmale\b/i;
  const score=voice=>{
    const name=voice.name||'';let value=0;
    if(voice.lang.toLowerCase()===language)value+=30;
    if(femaleNames.test(name))value+=100;
    if(/natural|neural|online/i.test(name))value+=24;
    if(/desktop|local/i.test(name))value+=4;
    if(masculineNames.test(name))value-=100;
    if(voice.default)value+=1;
    return value;
  };
  return matching.sort((a,b)=>score(b)-score(a))[0]||voices.find(v=>v.lang.toLowerCase().startsWith(base))||null;
}
function smoothSpeechText(value, lang) {
  let text=String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  text=text.replace(/[×✕]/g,'乘').replace(/[÷]/g,'除以').replace(/[＝=]/g,'等于');
  text=text.replace(/\s*([，。！？；：、,.!?;:])/g,'$1').replace(/([。！？；：])\s*/g,'$1 ');
  if(text&&!/[。！？.!?]$/.test(text))text+=String(lang).toLowerCase().startsWith('zh')?'。':'.';
  return text;
}
// 浏览器朗读兜底（预生成 mp3 缺失时使用）
function browserSpeak(narration, lang = 'zh-CN', options = {}) {
  if (!('speechSynthesis' in window)) { toast('这台设备暂不支持语音朗读'); return; }
  if(!narration)return;
  FufuTTS.cancel();
  const utterance=new SpeechSynthesisUtterance(narration);
  utterance.lang=lang;utterance.rate=String(lang).toLowerCase().startsWith('zh')?0.9:0.88;utterance.pitch=1;utterance.volume=1;
  const voice=preferredVoice(lang);if(voice)utterance.voice=voice;
  speechSynthesis.speak(utterance);
}
// 统一入口：优先播放预生成女声 mp3，未命中再用浏览器朗读
function speak(text, lang = 'zh-CN', options = {}) {
  return FufuTTS.speak(text,lang,options).then(r=>{ if(!r.hit&&!r.interrupted) browserSpeak(r.text,lang,options);return r; });
}
let quizSpeechTimer=null,quizViewGeneration=0;
function questionLines(question){
  return [`我们来听这道题。${question.prompt}`,
    ...question.options.map((option,i)=>`第${'一二三四五六'[i] || i+1}个选项是，${option.text}。`)];
}
function speakOptions(question) {
  if (question.stage !== '幼儿园') return;
  browserSpeak(questionLines(question).map(t=>FufuTTS.normalize(t,'zh-CN')).join(' '),'zh-CN');
}
async function speakQuestion(question) {
  const generation=quizViewGeneration;
  const current=()=>generation===quizViewGeneration&&$('#page-quest').classList.contains('active')&&state.quiz[state.index]===question;
  if(!current())return;
  if(question.stage!=='幼儿园'){speak(question.prompt);return;}
  // 兼容数据库里已有的 prompt_audio（例如未来接入 Azure 高清音色）
  if(question.prompt_audio){
    const recording=await FufuTTS.playRecording(question.prompt_audio);
    if(!current()||recording.interrupted)return;
    if(!recording.hit){speakOptions(question);return;}
    const options=await FufuTTS.speakChain(question.options.map((option,i)=>`第${'一二三四五六'[i]||i+1}个选项是，${option.text}。`));
    if(current()&&!options.hit&&!options.interrupted)speakOptions(question);
    return;
  }
  const r=await FufuTTS.speakChain(questionLines(question));
  if(current()&&!r.hit&&!r.interrupted)speakOptions(question);
}
// 故事旁白路径由详情 API 返回；缺音频时回退浏览器朗读。
function stopStoryAudio(){ FufuTTS.cancel(); }
async function playStory(story,continuous,fromIdx=0){
  FufuTTS.cancel();
  const list=story.audio_paths||[];
  const to=continuous?story.paragraphs.length:fromIdx+1;
  const urls=list?list.slice(fromIdx,to).filter(Boolean):[];
  const fallback=()=>speak(continuous?story.paragraphs.slice(fromIdx).join(' '):story.paragraphs[fromIdx]);
  const complete=urls.length===to-fromIdx && urls.length>0;
  if(!complete){fallback();return;}
  const r=await FufuTTS.playUrls(urls);
  if(r.error&&!r.interrupted) speak(continuous?story.paragraphs.slice(fromIdx+r.index).join(' '):story.paragraphs[fromIdx]);
}
let ledgerCursor = null, ledgerLoading = false, ledgerGeneration = 0, parentGrantRequest = null;
window.addEventListener('fufu-auth-changed',()=>{parentGrantRequest=null;ledgerGeneration++;$('#parentGrantForm')?.reset();});
function ledgerRowHTML(x) { return `<div class="ledger-row"><span>${escapeHtml(x.description)}<small>${escapeHtml(x.kind)} · ${escapeHtml(x.created_at)}</small></span><b class="${x.amount<0?'negative':''}">${x.amount>0?'+':''}${x.amount}</b></div>`; }
function renderProfile() {
  if (!state.profile) return; const p=state.profile;
  $('#pointsTop').textContent=`⭐ ${p.points}`;$('#parentPoints').textContent=p.points;
  const entries=p.ledger||[], rows=entries.map(ledgerRowHTML).join('');
  ledgerGeneration++;
  ledgerCursor=entries.length===20?entries[entries.length-1].id:null;
  $('#ledgerMore').hidden=!ledgerCursor;
  $('#ledgerStatus').textContent='';
  $('#ledgerList').innerHTML=rows||'<div class="empty-state">还没有积分记录</div>';
  $('#childGreeting').textContent=p.child_name||'福福';
  const stage=p.learning_stage&&p.learning_stage!=='未设置'?p.learning_stage:'未设置';
  document.body.classList.toggle('age-kindergarten',stage==='幼儿园');
  document.body.classList.toggle('age-primary',stage==='小学');
  $('#welcomeStage').textContent=stage==='未设置'?'还没选择学习阶段':`${stage} · ${p.grade||''}`;
  $('#parentLearningStage').textContent=stage==='未设置'?'学习阶段尚未设置':`${stage} · ${p.grade||''}`;
  $('#myChildName').value=p.child_name||'福福';
  $('#myStageText').textContent=stage==='未设置'?'尚未设置':`${stage} · ${p.grade||''}`;
  $('#myPoints').textContent=`${p.points} ⭐`;
  $$('.subject-card').forEach(card=>{
    const count=stageQuestions().filter(row=>row.subject===card.dataset.subject).reduce((sum,row)=>sum+Number(row.count||0),0);
    card.querySelector('.subject-foot > span').textContent=count?`${count} 道本年级练习`:'题目准备中';
  });
  renderDailyPlan();renderParentLearning();
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stageQuestions(){const stage=state.profile?.learning_stage;return state.questions.filter(q=>q.stage===stage&&(!state.profile?.grade||q.grade===state.profile.grade||q.grade==='*'));}
function renderDailyPlan(){
  const available=stageQuestions().reduce((total,row)=>total+Number(row.count||0),0);
  window.FufuDailyPlan?.render(state.profile,available);
}
function renderParentLearning(){
  const p=state.profile;if(!p)return;
  const summary=p.learning_summary||[];
  $('#learningOverview').innerHTML=summary.length?summary.map(row=>{const rate=row.attempts?Math.round(row.correct/row.attempts*100):0;return `<div class="learning-subject"><span>${escapeHtml(row.subject)}</span><b>${row.correct} / ${row.attempts}</b><small>正确率 ${rate}%</small></div>`}).join(''):'<div class="learning-empty">最近 7 天还没有答题记录。完成练习后，这里会显示各科进度。</div>';
  const recent=p.recent_learning||[];
  $('#recentLearning').innerHTML=recent.length?`<div class="recent-learning-head">最近答题</div>${recent.slice(0,5).map(row=>`<div class="recent-learning-row"><span>${escapeHtml(row.subject)} · ${escapeHtml(row.title)}</span><b class="${row.correct?'learning-correct':'learning-review'}">${row.correct?'答对':'再练'}</b><small>${escapeHtml(row.created_at)}</small></div>`).join('')}`:'';
}
function openStageDialog(){
  const p=state.profile||{};const stage=$('#learningStage'),grade=$('#learningGrade');
  stage.value=p.learning_stage==='未设置'?'':(p.learning_stage||'');populateGrades(stage.value,p.grade||'');
  $('#stageTitle').textContent=stage.value?'修改学习阶段与年级':'先告诉团团你的学习阶段';
  $('#stageForm button[type="submit"]').textContent=stage.value?'保存修改 →':'保存并开始学习 →';
  $('#stageForm').closest('.stage-modal').querySelector('p').textContent=stage.value?'调整阶段或年级后，今日练习会按新的学习资料更新。':'我们会用它挑选更合适的练习。之后可以在“我的信息”里修改。';
  $('#stageMessage').textContent='';$('#stageModal').classList.add('open');
}
function populateGrades(stage,selected=''){
  const options=stage==='幼儿园'?['小班','中班','大班']:stage==='小学'?['一年级','二年级','三年级','四年级','五年级','六年级']:[];
  const grade=$('#learningGrade');grade.disabled=!options.length;grade.innerHTML=options.length?'<option value="">请选择年级</option>'+options.map(x=>`<option value="${x}">${x}</option>`).join(''):'<option value="">请先选择学习阶段</option>';
  if(options.includes(selected))grade.value=selected;
  $('#stagePreview').textContent=stage==='幼儿园'?'幼儿园练习会优先朗读题目和选项，按钮也会更大。':stage==='小学'?'小学练习会显示学科进度，并提供更完整的文字提示。':'选择后，首页会显示适龄的今日练习。';
}
function coverFor(story) { return story.cover ? `${story.cover}?v=20260924-landscape-1` : ['/assets/bear-sun.svg','/assets/rain-cycle.svg','/assets/moon-phases.svg'][story.id-1] || '/assets/bear-sun.svg'; }
function paragraphArt(story, idx) { const list = story.paragraph_images; if (Array.isArray(list) && list[idx]) return `${list[idx]}?v=20260924-p3`; return coverFor(story); }
const STORY_TYPE_LABELS={'original-picture-book':'原创绘本',chengyu:'成语故事','traditional-tale':'传统故事','traditional-myth':'中国神话',history:'历史人物小传','foreign-tale':'外国童话'};
// 分类顺序按故事数量排列，“全部”由渲染函数补在最前
const STORY_FILTER_ORDER=['original-picture-book','chengyu','foreign-tale','traditional-tale','traditional-myth','history'];
function storyCategory(story) { return story.category || STORY_TYPE_LABELS[story.story_type] || '故事科普'; }
function storyCard(story) { return `<button class="story-card" data-story="${story.id}"><img class="story-cover" loading="lazy" src="${escapeHtml(coverFor(story))}" alt="${escapeHtml(story.title)}封面" style="background:${story.color}" onerror="this.onerror=null;this.src='/assets/bear-sun.svg'"><span class="story-meta"><small>${escapeHtml(storyCategory(story))} · ${escapeHtml(story.age)}</small><b>${escapeHtml(story.title)}</b><span>${escapeHtml(story.summary)}</span></span></button>`; }
const STORY_PAGE_SIZE=12;
function storyQuery(type,page) { return `/stories?page=${page}&page_size=${STORY_PAGE_SIZE}${type?`&type=${encodeURIComponent(type)}`:''}`; }
function renderStoryFilters() {
  const box=$('#storyFilters');
  if(!box)return;
  const countOf=type=>{const n=state.storyTotals[type];return typeof n==='number'?n:'';};
  const tabs=[{type:'',label:'全部',count:countOf('')},...STORY_FILTER_ORDER.map(type=>({type,label:STORY_TYPE_LABELS[type],count:countOf(type)}))];
  box.innerHTML=tabs.map(tab=>`<button type="button" role="tab" aria-selected="${state.storyType===tab.type}" class="story-filter-chip${state.storyType===tab.type?' is-active':''}" data-story-type="${tab.type}">${tab.label}${tab.count===''?'':`<span class="story-filter-count">${tab.count}</span>`}</button>`).join('');
  box.querySelectorAll('[data-story-type]').forEach(chip=>chip.addEventListener('click',()=>{
    if(state.storyType===chip.dataset.storyType||state.storyLoading)return;
    state.storyType=chip.dataset.storyType;
    loadStories(true);
  }));
}
// reset=true：切换分类，从第 1 页重新拉；否则追加下一页
async function loadStories(reset=false) {
  if(state.storyLoading)return;
  if(!reset && state.storyPage>0 && state.storyPage>=state.storyPages)return;
  state.storyLoading=true;
  const more=document.querySelector('#storyLoadMore');
  if(more)more.disabled=true;
  const nextPage=reset?1:state.storyPage+1;
  try {
    const result=await api(storyQuery(state.storyType,nextPage));
    state.stories=reset?result.items:state.stories.concat(result.items);
    state.storyPage=result.page;state.storyPages=result.pages;state.storyTotal=result.total;
    state.storyTotals[state.storyType]=result.total;
    renderStories();
  } catch(error){toast(error.message);}
  finally{state.storyLoading=false;const btn=document.querySelector('#storyLoadMore');if(btn)btn.disabled=false;}
}
function renderStories() {
  const preview=state.storyPreview;
  $('#storyPreview').innerHTML=preview.map(storyCard).join('');
  renderStoryFilters();
  $('#storyLibrary').innerHTML=state.stories.map(storyCard).join('');
  const empty=$('#storyEmpty');
  if(empty)empty.hidden=state.stories.length>0;
  // 故事卡片统一用事件委托绑定。
  // ⚠️ 踩过的坑：这里原来只写了 `$$('#storyLibrary [data-story]')`，
  // 而首页"故事与奇妙科学"预览条（#storyPreview）用的是同一个 storyCard() 模板，
  // 结果首页那三张卡从来没绑过点击 —— 点了完全没反应。
  // 委托到 document 之后，卡片被 innerHTML 重渲染多少次都不会丢监听，
  // 也不会再出现"某个容器漏绑"这种问题。
  if(!window.__fufuStoryClickBound){
    window.__fufuStoryClickBound=true;
    document.addEventListener('click',event=>{
      const card=event.target?.closest?.('[data-story]');
      if(card)openStory(Number(card.dataset.story));
    });
  }
  const remaining=state.storyTotal-state.stories.length;
  let more=document.querySelector('#storyLoadMore');
  if(remaining>0){
    if(!more){more=document.createElement('button');more.id='storyLoadMore';more.type='button';more.className='story-load-more';more.addEventListener('click',()=>loadStories(false));$('#storyLibrary').after(more);}
    more.hidden=false;more.disabled=state.storyLoading;
    more.innerHTML=state.storyLoading?'<span class="story-load-spinner" aria-hidden="true"></span>正在翻开下一页…':`<span class="story-load-book" aria-hidden="true">📖</span>继续加载更多故事<span class="story-load-rest">还有 ${remaining} 篇</span><span class="story-load-arrow" aria-hidden="true">⌄</span>`;
  } else if(more){more.remove();}
}
function navigate(page) {
  if(window.FufuGameAccess&&!window.FufuGameAccess.allowNavigation(page))return;
  window.FufuGameAccess?.onNavigate(page);
  readerCleanup?.();readerCleanup=null;
  quizViewGeneration++;clearTimeout(quizSpeechTimer);quizSpeechTimer=null;
  FufuTTS.cancel('navigation');
  if(page==='home' && !$('#page-home').classList.contains('active'))rotateStoryRecommendations();
  window.FufuToyGames?.onNavigate(page);
  window.FufuActionCards?.onNavigate(page);
  if(page!=='cards'){window.FufuEnglishSongs?.leave();window.FufuReadingCards?.leave();window.FufuPinyinCards?.leave();window.FufuHistoryCards?.leave();window.FufuHistoryWisdom?.leave();}
  window.FufuPages?.enter(page);
  $$('.page').forEach(p=>p.classList.remove('active'));$(`#page-${page}`).classList.add('active');
  window.FufuHistoryCards?.onNavigate(page);window.FufuHistoryWisdom?.onNavigate(page);
  window.FufuDailyPlan?.onNavigate(page);
  $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page||(b.dataset.page==='explore'&&['solar','globe','moon','lunar','engineering','transport','jurassic'].includes(page))));
  window.scrollTo(0,0);
  // 黏土世界是常驻 iframe：切走页面它不会自己停，必须显式让它静音，切回来再恢复。
  if(page==='clay')window.fufuWakeClay?.();else window.fufuSilenceClay?.();
}
window.navigate = navigate;
window.getLearningGrade = () => state.profile?.grade || '';
let spaceTransitionActive=false;
window.navigateWithZoom=(page,body='earth',source)=>{
  if(spaceTransitionActive)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){navigate(page);return;}
  spaceTransitionActive=true;
  const canvas=document.querySelector('.page.active #solarCanvasHost canvas, .page.active #moonCanvasHost canvas');
  const isSolar=Boolean(canvas?.closest('#solarCanvasHost'));
  const resumeSimulation=isSolar?window.pauseSolarForTransition?.():canvas?window.pauseMoonForTransition?.():undefined;
  if(isSolar)window.zoomSolarForTransition?.();
  else if(canvas)window.zoomMoonForTransition?.(body);
  const veil=document.createElement('div');veil.className='space-transition-scrim';veil.setAttribute('aria-hidden','true');document.body.append(veil);
  window.setTimeout(()=>veil.classList.add('covering'),600);
  window.setTimeout(()=>{navigate(page);resumeSimulation?.();window.setTimeout(()=>{veil.classList.add('revealing');window.setTimeout(()=>{veil.remove();spaceTransitionActive=false;},360);},70);},920);
};
async function beginQuiz(subject=state.subject,count=5,knowledgePoint='',mode='challenge',curriculumScope=null) {
  const requestGeneration=quizViewGeneration;
  state.subject=subject;
  try {const session=await api('/quiz-sessions',{method:'POST',body:JSON.stringify({subject,count,knowledge_point:knowledgePoint,...(curriculumScope||{})})});if(requestGeneration!==quizViewGeneration)return false;state.quizSessionId=session.id;state.quiz=session.questions;state.quizMode=mode;state.quizKnowledgePoint=knowledgePoint;state.quizCurriculum=curriculumScope;state.quizCorrectCount=0;state.index=0;state.selected=null;state.wrongAttempts=0;if(mode!=='rapid')state.rapidStreak=0;navigate('quest');renderQuestion();return true;}
  catch(error){toast(error.message||'这个阶段的该科练习正在准备中');return false;}
}
async function beginDailyQuest(){
  const pool=stageQuestions();if(!pool.length){toast('这个阶段的练习正在准备中，可以先听故事或翻学习卡片');return;}
  const subject=pool[Math.floor(Math.random()*pool.length)].subject;await beginQuiz(subject,Math.min(3,pool.filter(row=>row.subject===subject).reduce((n,row)=>n+Number(row.count||0),0)),'','daily');
}
function renderQuestion() {
  readerCleanup?.();readerCleanup=null;
  quizViewGeneration++;clearTimeout(quizSpeechTimer);quizSpeechTimer=null;
  const q=state.quiz[state.index];if(!q)return;
  $('#page-quest').classList.toggle('reader-quest',Boolean(q.reader_lesson));
  if(q.reader_lesson){
    const generation=quizViewGeneration,sessionId=state.quizSessionId;
    $('#questBack').textContent='← 返回词语游乐场';$('#questSubject').textContent=`${q.subject} · 字词快练`;
    readerCleanup=window.FufuReaderRound.mount({root:$('#quizContent'),...state.readerRound,
      onSubmit:async (lesson,answer)=>{
        const result=await api(`/quiz-sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({question_id:lesson.question_id,answer_text:answer})});
        if(generation!==quizViewGeneration||sessionId!==state.quizSessionId||!$('#page-quest').classList.contains('active'))return null;
        state.profile={...state.profile,...result.profile};renderProfile();return result;
      },
      onProgress:(done,total,label)=>{$('#questCount').textContent=`${label} · 本组 ${state.readerRound.items.length} 个字词`;$('#questProgress').style.width=`${done/total*100}%`;},
      onFinish:()=>api(`/quiz-sessions/${sessionId}/finish`,{method:'POST',body:'{}'}).catch(()=>{}),
      onNextRound:startReaderLesson,
      onReturn:()=>window.FufuReader.open(q.subject,startReaderLesson)});
    return;
  }
  const symbolicMath=q.subject==='数学'&&/[\/]|分数|负数|零下/.test(`${q.knowledge_point||''} ${q.prompt}`);
  state.wrongAttempts=0;$('#questBack').textContent=state.quizCurriculum?'← 返回教材目录':'← 返回学习首页';$('#questSubject').textContent=`${q.subject} · ${q.grade&&q.grade!=='*'?q.grade:(state.profile?.grade||'学习闯关')}${state.quizCurriculum?.label?' · '+state.quizCurriculum.label:''}${state.quizMode==='rapid'?` · 连对 ${state.rapidStreak} 题`:''}`;$('#questCount').textContent=state.quizMode==='rapid'?'随时练一题':`第 ${state.index+1} 题 / ${state.quiz.length}`;$('#questProgress').style.width=state.quizMode==='rapid'?'100%':`${state.index/state.quiz.length*100}%`;
  $('#quizContent').innerHTML=`<div class="question-title">${escapeHtml(q.prompt)}</div><button class="speak-btn" id="repeatQuestion">🔊 再听一次${q.stage==='幼儿园'?'题目和选项':'题目'}</button>${q.question_type==='short_answer'?`<div class="short-answer-entry"><input id="shortAnswerInput" aria-label="填写答案" autocomplete="off" inputmode="${q.subject==='英语'||symbolicMath?'text':'decimal'}" autocapitalize="off" spellcheck="false" maxlength="${q.subject==='英语'&&q.knowledge_point==='单词快练'?1:500}" placeholder="${q.subject==='英语'&&q.knowledge_point==='单词快练'?'写下缺少的字母':symbolicMath?'例如 2/3 或 -5':'在这里填写答案'}"><button class="primary-btn" id="submitShortAnswer">提交答案</button></div>`:`<div class="answer-options">${q.options.map((option,i)=>`<button class="answer-option" data-answer="${escapeHtml(option.key)}"><span class="letter">${'ABCDEF'[i]||i+1}</span>${escapeHtml(option.text)}</button>`).join('')}</div>`}<div id="answerFeedback"></div>`;
  $('#repeatQuestion').addEventListener('click',()=>q.stage==='幼儿园'?speakQuestion(q):speak(q.prompt));
  $$('.answer-option').forEach(btn=>btn.addEventListener('click',()=>submitAnswer(q,btn)));
  $('#submitShortAnswer')?.addEventListener('click',()=>submitAnswer(q,null));
  $('#shortAnswerInput')?.addEventListener('keydown',event=>{if(event.key==='Enter')submitAnswer(q,null);});
  if(q.stage==='幼儿园') quizSpeechTimer=setTimeout(()=>{quizSpeechTimer=null;speakQuestion(q);},350);
}
async function submitAnswer(question,button) {
  const generation=quizViewGeneration,sessionId=state.quizSessionId;
  if(state.selected)return;
  const isShort=question.question_type==='short_answer';
  const submitted=isShort?$('#shortAnswerInput').value.trim():button.dataset.answer;
  if(!submitted){toast('请先填写答案');return;}
  state.selected=submitted;$$('.answer-option').forEach(b=>b.classList.remove('wrong'));
  let result;
  try {result=await api(`/quiz-sessions/${state.quizSessionId}/answer`,{method:'POST',body:JSON.stringify({question_id:question.id,...(isShort?{answer_text:submitted}:{option_key:submitted})})});}
  catch(e){toast(e.message);state.selected=null;return;}
  if(generation!==quizViewGeneration||sessionId!==state.quizSessionId||!$('#page-quest').classList.contains('active'))return;
  const correct=result.correct;button?.classList.add(correct?'correct':'wrong');
  state.profile={...state.profile,...result.profile};renderProfile();
  if(!correct){
    if(state.quizMode==='rapid')state.rapidStreak=0;
    state.wrongAttempts=result.wrong_attempts;state.selected=null;
    $('#answerFeedback').innerHTML=`<div class="answer-feedback">🌱 没关系，再听一次题目，换一个答案试试看。${state.wrongAttempts>=2?'<button class="secondary" id="hearHint">🔊 听提示</button><button class="secondary" id="showAnswer">听答案并继续</button>':''}</div>`;
    $$('.answer-option').forEach(b=>b.disabled=false);
    if(question.stage==='幼儿园')speak('没关系，我们再听一次题目，换一个答案试试看。');
    $('#repeatQuestion').focus({preventScroll:true});
    $('#hearHint')?.addEventListener('click',()=>speak(`提示：${result.hint}`));
    $('#showAnswer')?.addEventListener('click',()=>{const answer=isShort?result.answer:(question.options.find(option=>option.key===result.answer)?.text||'');speak(`正确答案是${answer}。${result.explanation||''}`);advanceQuestion();});
    return;
  }
  const answerText=isShort?result.answer:(question.options.find(option=>option.key===result.answer)?.text||'');
  if(state.quizMode==='rapid')state.rapidStreak++;
  state.quizCorrectCount++;
  $$('.answer-option').forEach(b=>{b.disabled=true;if(b.dataset.answer===result.answer)b.classList.add('correct');});
  $('#answerFeedback').innerHTML=`<div class="answer-feedback">🎉 太棒了！获得 ${result.reward} 积分。${isShort?`参考答案：${escapeHtml(answerText)}。`:''}${escapeHtml(result.explanation||'')}<button id="nextQuestion">${state.quizMode==='rapid'?'再来一道 →':state.index+1<state.quiz.length?'下一题 →':'完成闯关 ✓'}</button></div>`;
  if(question.stage==='幼儿园')speak(`答对啦！正确答案是${answerText}。${result.explanation||''}获得${result.reward}积分。`); else speak(`答对啦，答案是${answerText}，获得${result.reward}积分`);
  $('#nextQuestion').addEventListener('click',advanceQuestion);
}
function advanceQuestion(){state.index++;state.selected=null;if(state.index>=state.quiz.length){api(`/quiz-sessions/${state.quizSessionId}/finish`,{method:'POST',body:'{}'}).catch(()=>{});if(state.quizMode==='rapid'){beginQuiz(state.subject,1,state.quizKnowledgePoint,'rapid');return;}const isPractice=state.quizMode==='practice';const focus=(state.quizCurriculum?.label||state.quizKnowledgePoint)?` · ${escapeHtml(state.quizCurriculum?.label||state.quizKnowledgePoint)}`:'';const title=isPractice?'本组训练完成！':'本轮闯关完成！';const summary=isPractice?`本组答对 ${state.quizCorrectCount} / ${state.quiz.length} 题。${escapeHtml(state.subject)}${focus}`:`这轮完成了 ${state.quiz.length} 道${escapeHtml(state.subject)}题。题库里还有新题，继续挑战吧。`;const nextLabel=isPractice?`再练一组 · ${state.quiz.length} 题 →`:`再来 ${state.quiz.length} 题 →`;$('#quizContent').innerHTML=`<div class="empty-state"><div style="font-size:50px">🏅</div><h2>${title}</h2><p>${summary}</p><div class="quiz-completion-actions"><button class="primary-btn" id="nextRound">${nextLabel}</button><button class="secondary-btn" id="finishQuiz">${state.quizCurriculum?'返回教材目录':'回到学习首页'}</button></div></div>`;$('#questProgress').style.width='100%';$('#nextRound').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;const started=await beginQuiz(state.subject,state.quiz.length,state.quizKnowledgePoint,state.quizMode,state.quizCurriculum);if(!started)button.disabled=false;});$('#finishQuiz').addEventListener('click',()=>navigate(state.quizCurriculum?'curriculum':'home'));}else renderQuestion();}

function quickChallengeMarkup(){
  document.querySelector('.literacy-quick')?.remove();
  const definitions=[['语文','识字快练','🔎','识字快练','整组拼 · 换序选 · 换序听'],['英语','单词快练','🔤','单词快练','整组拼 · 记忆拼拼 · 换序听']];
  const section=document.createElement('section');section.className='literacy-quick';section.innerHTML=`<div class="section-heading compact"><div><div class="eyebrow">WORD BY WORD</div><h2>认字与单词快练 <span class="tiny-spark">✦</span></h2></div><span class="literacy-grade">自己选词 · 从易到难</span></div><div class="literacy-quick-grid">${definitions.map(([subject,key,icon,title,description])=>`<button type="button" class="literacy-quick-card ${subject==='英语'?'english':''}" data-quick-subject="${subject}" data-quick-topic="${key}"><span class="literacy-quick-icon">${icon}</span><span class="literacy-quick-copy"><b>${title}</b><small>${description}</small></span><span class="literacy-quick-count">主题拼读</span><span class="literacy-quick-arrow">→</span></button>`).join('')}</div>`;
  api('/learning/reader-lessons?summary=1').then(data=>{if(!section.isConnected)return;section.querySelectorAll('[data-quick-subject]').forEach(button=>{button.querySelector('.literacy-quick-count').textContent=`${data.counts[button.dataset.quickSubject]||0} 个词语`;});}).catch(()=>{});
  const quickSlot=document.querySelector('#homeQuickPracticeSlot');
  if(quickSlot) quickSlot.append(section); else document.querySelector('.subject-section')?.after(section);
  section.querySelectorAll('[data-quick-subject]').forEach(button=>button.addEventListener('click',()=>beginQuickChallenge(button.dataset.quickSubject,button.dataset.quickTopic)));
}
function beginQuickChallenge(subject,knowledgePoint){return window.FufuReader.open(subject,startReaderLesson);}
async function startReaderLesson(items,settings={mode:'guided',unit:'word',count:5}){
  if(!Array.isArray(items))items=[items];
  const generation=quizViewGeneration;
  try{
    const session=await api('/quiz-sessions',{method:'POST',body:JSON.stringify({practice_mode:'reader',reader_unit_ids:items.map(item=>item.question_id)})});
    if(generation!==quizViewGeneration)return false;
    state.subject=items[0].subject;state.readerRound={items:session.questions.map(q=>q.reader_lesson),settings:{...settings}};state.quizSessionId=session.id;state.quiz=session.questions;state.quizMode='reader';state.quizCurriculum=null;state.index=0;state.selected=null;
    navigate('quest');renderQuestion();return true;
  }catch(error){toast(error.message||'词语暂时无法打开，请再试一次');return false;}
}

function practiceQuestionRows(subject) {
  const stage=state.profile?.learning_stage,grade=state.profile?.grade;
  return state.questions.filter(row=>row.subject===subject&&row.stage===stage&&(!grade||row.grade===grade||row.grade==='*'));
}
function renderPracticeTopics() {
  const subject=$('#practiceSubject').value,rows=practiceQuestionRows(subject),topics=[...new Set(rows.map(row=>row.knowledge_point).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  $('#practiceKnowledge').innerHTML=`<option value="">全部知识点 · ${rows.reduce((sum,row)=>sum+Number(row.count||0),0)} 题</option>${topics.map(topic=>{const count=rows.filter(row=>row.knowledge_point===topic).reduce((sum,row)=>sum+Number(row.count||0),0);return `<option value="${escapeHtml(topic)}">${escapeHtml(topic)} · ${count} 题</option>`;}).join('')}`;
  updatePracticeAvailability();
}
function updatePracticeAvailability() {
  const rows=practiceQuestionRows($('#practiceSubject').value),knowledgePoint=$('#practiceKnowledge').value,available=rows.filter(row=>!knowledgePoint||row.knowledge_point===knowledgePoint).reduce((sum,row)=>sum+Number(row.count||0),0);
  $('#practiceAvailability').textContent=available?`当前年级有 ${available} 道可练题；每组最多 20 题，题库不足时会使用全部可用题。`:'当前年级这个科目还没有已发布题目。';
  $('#practiceForm button[type="submit"]').disabled=!available;
}
function openPracticeSetup() { renderPracticeTopics();$('#practiceModal').classList.add('open'); }
function closePracticeSetup() { $('#practiceModal').classList.remove('open'); }
function oralGrade(){return ({'一年级':1,'二年级':2,'三年级':3,'四年级':4,'五年级':5,'六年级':6})[state.profile?.grade]||2;}
function randomInt(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
function makeOralProblem(operation=state.oralOperation){
  const grade=oralGrade(), max=grade===1?20:grade===2?100:grade===3?1000:grade===4?10000:100000;
  const available=grade===1?['+','−']:['+','−','×','÷'];
  if(!available.includes(operation)&&operation!=='mixed')operation='mixed';
  const op=operation==='mixed'?available[randomInt(0,available.length-1)]:operation;
  let a,b,answer;
  if(op==='+'){a=randomInt(1,max-1);b=randomInt(1,max-a);answer=a+b;}
  else if(op==='−'){a=randomInt(2,max);b=randomInt(1,a);answer=a-b;}
  else if(op==='×'){a=grade<=2?randomInt(2,9):randomInt(10,Math.min(99,Math.max(10,grade*15)));b=randomInt(2,grade<=2?9:12);answer=a*b;}
  else {b=randomInt(2,grade<=2?9:12);answer=randomInt(2,grade<=2?9:99);a=b*answer;}
  state.oralProblem={text:`${a} ${op} ${b} = ?`,answer};
  return state.oralProblem;
}
function oralChallengeMarkup(){
  const grade=oralGrade(),available=grade===1?['+','−']:['+','−','×','÷'];
  if(!available.includes(state.oralOperation)&&state.oralOperation!=='mixed')state.oralOperation='mixed';
  if(!state.oralProblem)makeOralProblem();
  const choices=[['mixed','混合运算'],['+','加法'],['−','减法'],['×','乘法'],['÷','除法']].filter(([value])=>value==='mixed'||available.includes(value));
  return `<section class="oral-challenge"><div class="oral-challenge-kicker">MENTAL MATH · ${escapeHtml(state.profile?.grade||'二年级')}</div><h2>口算挑战</h2><p>选一种运算，算出答案。答完就能继续挑战下一题。</p><div class="oral-controls"><label for="oralOperation">运算类型</label><select id="oralOperation">${choices.map(([value,label])=>`<option value="${value}" ${state.oralOperation===value?'selected':''}>${label}</option>`).join('')}</select><button type="button" id="oralNewProblem">换一道题</button></div><div class="oral-problem" aria-live="polite">${state.oralProblem.text}</div><form id="oralAnswerForm" class="oral-answer-form"><label class="sr-only" for="oralAnswer">输入答案</label><input id="oralAnswer" type="number" inputmode="numeric" autocomplete="off" placeholder="输入答案" required><button class="primary-btn" type="submit">检查答案</button></form><div id="oralFeedback" class="oral-feedback" role="status">准备好了吗？</div></section>`;
}
function bindOralChallenge(){
  $('#oralOperation')?.addEventListener('change',event=>{state.oralOperation=event.target.value;});
  $('#oralNewProblem')?.addEventListener('click',()=>{makeOralProblem();renderDeck('times');$('#oralAnswer')?.focus();});
  $('#oralAnswerForm')?.addEventListener('submit',event=>{event.preventDefault();const value=Number($('#oralAnswer').value);const feedback=$('#oralFeedback');if(value===state.oralProblem.answer){feedback.textContent='答对啦！再来一题，继续保持。';feedback.className='oral-feedback correct';}else{feedback.textContent='再想一想，检查一下运算过程。';feedback.className='oral-feedback retry';}});
}
function cardTabs(selected){
  const subject=decks[selected].subject;
  const subjectDecks=Object.keys(decks).filter(key=>decks[key].subject===subject);
  const deckTabs=subjectDecks.length>1?`<div class="deck-tabs" aria-label="${subject}卡片">${subjectDecks.map(key=>`<button data-tab="${key}" aria-pressed="${key===selected}" class="${key===selected?'selected':''}">${decks[key].title}</button>`).join('')}</div>`:'';
  return `<nav class="card-subjects" aria-label="学习卡片学科">${['数学','语文','英语','科学'].map(name=>`<button data-card-subject="${name}" aria-pressed="${subject===name}">${name}</button>`).join('')}</nav>${deckTabs}`;
}
function bindCardTabs(){
  $$('[data-tab]').forEach(button=>button.addEventListener('click',()=>renderDeck(button.dataset.tab)));
  const defaults={'数学':'times','语文':'poetry','英语':'actions','科学':'science'};
  $$('[data-card-subject]').forEach(button=>button.addEventListener('click',()=>renderDeck(defaults[button.dataset.cardSubject])));
}
function mathCardTabs(){
  return `<nav class="deck-tabs math-card-tabs" aria-label="数学卡片模块"><button type="button" data-math-view="table" aria-pressed="${state.mathCardView==='table'}" class="${state.mathCardView==='table'?'selected':''}">乘法口诀</button><button type="button" data-math-view="oral" aria-pressed="${state.mathCardView==='oral'}" class="${state.mathCardView==='oral'?'selected':''}">口算练习</button></nav>`;
}
function bindMathCardTabs(){
  $$('[data-math-view]').forEach(button=>button.addEventListener('click',()=>{state.mathCardView=button.dataset.mathView;renderDeck('times');}));
}
function bindDeckReaders(id){
  $$('[data-read]').forEach(button=>button.addEventListener('click',()=>speak(button.dataset.read,button.dataset.lang||'zh-CN')));
}
function renderDeck(id,targetSlug=null) {
  window.FufuActionCards?.leave();
  window.FufuEnglishSongs?.leave();
  window.FufuPinyinCards?.leave();
  window.FufuReadingCards?.leave();
  window.FufuHistoryCards?.leave();
  window.FufuHistoryWisdom?.leave();
  $('#page-cards').classList.toggle('action-deck',id==='actions');
  state.deck=id;const deck=decks[id];$('#deckTitle').textContent=deck.title;$('#deckHint').textContent=deck.hint;
  if(id==='battles'||id==='strategies'){
    $('#deckContent').innerHTML=`${cardTabs(id)}<div id="historyWisdomContent" data-kind="${id}"></div>`;
    bindCardTabs();window.FufuHistoryWisdom?.render($('#historyWisdomContent'),id,targetSlug);return;
  }
  if(id==='history'){
    $('#deckContent').innerHTML=`${cardTabs(id)}<div id="historyCardsContent"></div>`;
    bindCardTabs();window.FufuHistoryCards?.render($('#historyCardsContent'),targetSlug);return;
  }
  if(id==='poetry'||id==='science'){
    $('#deckContent').innerHTML=`${cardTabs(id)}<div id="readingCardsContent"></div>`;
    bindCardTabs();window.FufuReadingCards?.render($('#readingCardsContent'),id);return;
  }
  if(id==='actions'){
    $('#deckContent').innerHTML=`${cardTabs(id)}<div id="actionCardsContent"></div>`;
    bindCardTabs();window.FufuActionCards?.render($('#actionCardsContent'));return;
  }
  if(id==='songs'){
    $('#deckContent').innerHTML=`${cardTabs(id)}<div id="englishSongsContent"></div>`;
    bindCardTabs();window.FufuEnglishSongs?.render($('#englishSongsContent'));return;
  }
  if(id==='pinyin'){
    $('#deckContent').innerHTML=`${cardTabs(id)}<div id="pinyinCardsContent"></div>`;
    bindCardTabs();window.FufuPinyinCards?.render($('#pinyinCardsContent'));return;
  }
  let content='';
  if(id==='times'){
    // 中式直角三角：第 n 行为 1×n … n×n，小的乘数在前，与口诀“一二得二”一致
    const rows=Array.from({length:9},(_,row)=>{const n=row+1,offset=Math.floor((9-n)/2);return `<div class="times-row">${'<span class="times-placeholder" aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:n},(_,i)=>{const factor=i+1;return `<button class="deck-item" data-read="${factor}乘${n}等于${factor*n}" data-lang="zh-CN">${factor} × ${n} = ${factor*n}<small>${factor}乘${n}等于${factor*n}</small></button>`;}).join('')}</div>`;}).join('');
    const module=state.mathCardView==='oral'?`<div class="math-card-module math-card-module-oral"><div class="math-module-heading"><span aria-hidden="true">🧮</span><div><h3>口算练习</h3><p>选好运算类型，自己算一算，再检查答案。</p></div></div>${oralChallengeMarkup()}</div>`:`<div class="math-card-module"><h3 class="deck-group-title">乘法口诀表</h3><div class="times-table">${rows}</div></div>`;
    content=`${cardTabs(id)}${mathCardTabs()}${module}`;
  }else{
    const groups=deck.groups.map(group=>`<h3 class="deck-group-title">${group.name}</h3><div class="deck-grid ${id==='letters'?'letters-grid':''}">${group.entries.map(([main,sub,spoken=main])=>`<button class="deck-item" data-read="${escapeHtml(spoken)}" data-lang="${id==='letters'?'en-US':'zh-CN'}">${escapeHtml(main)}<small>${escapeHtml(sub)}</small></button>`).join('')}</div>`).join('');
    content=`${cardTabs(id)}${groups}`;
  }
  $('#deckContent').innerHTML=content;bindCardTabs();bindDeckReaders(id);if(id==='times'){bindMathCardTabs();if(state.mathCardView==='oral')bindOralChallenge();}
}async function openStory(id) {
  let story;try{story=await api(`/stories/${id}`);}catch(error){toast(error.message);return;}
  if(window.FufuStoryReader) return window.FufuStoryReader.open(story);
  state.story=story;state.paragraph=0;$('#storyHero').style.background=`${story.color} url('${paragraphArt(story,0)}') center / cover no-repeat`;$('#storyHero').textContent='';
  $('#storyBody').innerHTML=`<div class="story-reader-kicker"><span>${escapeHtml(storyCategory(story))} · ${escapeHtml(story.age)}</span><span>绘本伴读${story.reading_minutes?` · ${story.reading_minutes} 分钟`:''}</span></div><h2>${escapeHtml(story.title)}</h2><div class="story-reader-progress"><span id="storyProgress"></span></div><p class="story-counter" id="storyCounter"></p><p class="story-paragraph" id="storyParagraph"></p>${story.moral?`<p class="story-moral"><b>故事寓意：</b>${escapeHtml(story.moral)}</p>`:''}<div class="story-controls"><button id="listenStory">🔊 听这一段</button><button class="secondary" id="listenWholeStory">▶ 播放全文</button></div><div class="story-page-controls"><button class="secondary" id="prevParagraph">← 上一段</button><button class="secondary" id="nextParagraph">下一段 →</button></div>`;
  $('#storyModal').classList.add('open');
  const update=()=>{stopStoryAudio();$('#storyParagraph').textContent=story.paragraphs[state.paragraph];$('#storyCounter').textContent=`第 ${state.paragraph+1} 段 / 共 ${story.paragraphs.length} 段`;$('#storyProgress').style.width=`${(state.paragraph+1)/story.paragraphs.length*100}%`;$('#prevParagraph').disabled=state.paragraph===0;$('#nextParagraph').disabled=state.paragraph===story.paragraphs.length-1;$('#storyHero').style.background=`${story.color} url('${paragraphArt(story,state.paragraph)}') center / cover no-repeat`;};update();
  $('#listenStory').addEventListener('click',()=>playStory(story,false,state.paragraph));
  $('#listenWholeStory').addEventListener('click',()=>playStory(story,true,0));
  $('#prevParagraph').addEventListener('click',()=>{state.paragraph=Math.max(0,state.paragraph-1);update();});
  $('#nextParagraph').addEventListener('click',()=>{state.paragraph=Math.min(story.paragraphs.length-1,state.paragraph+1);update();});
}
async function refreshProfile(){state.profile=await api('/profile');renderProfile();}

async function rotateStoryRecommendations() {
  const button=$('#shuffleStories');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  let excluded=state.storyPreview.map(s=>s.id);
  if(!excluded.length){try{excluded=JSON.parse(sessionStorage.getItem('fufu-story-recommendations')||'[]');}catch{excluded=[];}}
  try{
    const result=await api(`/stories/recommendations?exclude=${excluded.slice(0,3).join(',')}`);
    const items=result.items.filter(s=>s.story_type!=='history');
    state.storyPreview=items;
    try{sessionStorage.setItem('fufu-story-recommendations',JSON.stringify(items.map(s=>s.id)));}catch{}
    $('#storyPreview').innerHTML=items.map(storyCard).join('');
  }catch(error){$('#storyPreview').innerHTML='<p class="story-recommendation-error">故事推荐暂时没连上，可以点“换一批”重试，或进入全部故事。</p>';toast(error.message);}
  finally{if(button)button.disabled=false;}
}

async function init() {
  try { await window.FufuAuth?.ensure(); }
  catch (error) { toast(error.message || '请先登录家长账号。'); return; }
  const companionReady = Promise.allSettled([window.loadPet?.(),window.loadShop?.(),window.loadZooSummary?.()]);
  try { const [profile,questions,stories]=await Promise.all([api('/profile'),api('/questions?scope=learner'),api(storyQuery('',1))]);state.profile=profile;state.questions=questions;state.stories=stories.items;state.storyPage=stories.page;state.storyPages=stories.pages;state.storyTotal=stories.total;state.storyTotals['']=stories.total;state.storyPreview=[];renderProfile();renderStories();quickChallengeMarkup();FufuTTS.ensure();
    Object.assign(state.storyTotals, stories.category_totals || {});
    renderStoryFilters();
  }
  catch(error){document.body.innerHTML=`<div style="max-width:600px;margin:18vh auto;padding:24px;font-family:sans-serif;color:#456"><h2>福福学堂暂时无法连接</h2><p>请确认已在电脑上运行 <code>python backend/server.py</code>，然后刷新页面。</p><p style="color:#a66">${escapeHtml(error.message)}</p></div>`;return;}
  $$('.nav-link').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $$('[data-page]').filter(b=>!b.classList.contains('nav-link')).forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $$('.subject-card').forEach(b=>b.addEventListener('click',()=>beginQuiz(b.dataset.subject)));
  $('#startDailyTask').addEventListener('click',()=>window.FufuDailyPlan?.start());
  $('#practiceClose').addEventListener('click',closePracticeSetup);
  $('#practiceModal').addEventListener('click',event=>{if(event.target===$('#practiceModal'))closePracticeSetup();});
  $('#practiceSubject').addEventListener('change',renderPracticeTopics);
  $('#practiceKnowledge').addEventListener('change',updatePracticeAvailability);
  $('#practiceForm').addEventListener('submit',async event=>{event.preventDefault();const subject=$('#practiceSubject').value,knowledgePoint=$('#practiceKnowledge').value,count=Number($('input[name="practiceCount"]:checked').value);const started=await beginQuiz(subject,count,knowledgePoint,'practice');if(started)closePracticeSetup();});
  $('#allSubjects')?.addEventListener('click',()=>document.querySelector('.subject-section').scrollIntoView({behavior:'smooth'}));
  $$('.quick-card').forEach(b=>b.addEventListener('click',()=>{renderDeck(b.dataset.deck);navigate('cards');}));
  $('#questBack').addEventListener('click',()=>{FufuTTS.cancel();if(state.quizMode==='reader'){window.FufuReader.open(state.subject,startReaderLesson);}else navigate(state.quizCurriculum?'curriculum':'home');});$('#cardsBack').addEventListener('click',()=>navigate('home'));
  $('#parentOpen').addEventListener('click',()=>$('#myProfileModal').classList.add('open'));
  $('#myProfileClose').addEventListener('click',()=>$('#myProfileModal').classList.remove('open'));
  $('#myProfileModal').addEventListener('click',e=>{if(e.target===$('#myProfileModal'))$('#myProfileModal').classList.remove('open');});
  $('#openStageFromMy').addEventListener('click',openStageDialog);
  $('#myParentCenter').addEventListener('click',()=>{$('#myProfileModal').classList.remove('open');$('#parentModal').classList.add('open');renderParentLearning();window.FufuGameAccess?.loadSettings();});
  $('#parentClose').addEventListener('click',()=>$('#parentModal').classList.remove('open'));
  $('#parentModal').addEventListener('click',e=>{if(e.target===$('#parentModal'))$('#parentModal').classList.remove('open');});
  $('#shuffleStories')?.addEventListener('click',rotateStoryRecommendations);
  rotateStoryRecommendations();
  $('#storyClose').addEventListener('click',()=>{window.FufuStoryReader?.close();$('#storyModal').classList.remove('open');stopStoryAudio();});
  $('#storyModal').addEventListener('click',e=>{if(e.target===$('#storyModal')){window.FufuStoryReader?.close();$('#storyModal').classList.remove('open');stopStoryAudio();}});
  $('#learningStage').addEventListener('change',e=>populateGrades(e.target.value));
  $('#childNameForm').addEventListener('submit',async e=>{
    e.preventDefault();const message=$('#profileMessage');message.textContent='';
    try{const result=await api('/profile/child-name',{method:'POST',body:JSON.stringify({child_name:$('#myChildName').value.trim()})});state.profile={...state.profile,...result.profile};renderProfile();message.textContent='昵称已保存。';}
    catch(error){message.textContent=error.message;}
  });
  $('#stageForm').addEventListener('submit',async e=>{
    e.preventDefault();const message=$('#stageMessage');message.textContent='';
    try{const result=await api('/profile/learning-stage',{method:'POST',body:JSON.stringify({learning_stage:$('#learningStage').value,grade:$('#learningGrade').value})});state.profile={...state.profile,...result.profile};state.questions=await api('/questions?scope=learner');renderProfile();quickChallengeMarkup();$('#stageModal').classList.remove('open');}
    catch(error){message.textContent=error.message;}
  });
  $('#redeemForm').addEventListener('submit',async e=>{e.preventDefault();const message=$('#redeemMessage');message.textContent='';try{await api('/redeem',{method:'POST',body:JSON.stringify({description:$('#rewardName').value.trim(),amount:Number($('#rewardAmount').value)})});await refreshProfile();$('#rewardName').value='';$('#rewardAmount').value='';message.textContent='登记成功，积分已抵扣。';}catch(error){message.textContent=error.message;}});
  $('#parentGrantForm').addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.currentTarget, button=form.querySelector('button[type=submit]');
    if(button.disabled)return;
    const amount=Number($('#parentGrantAmount').value), reason=$('#parentGrantReason').value.trim(), message=$('#parentGrantMessage');
    if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||!reason){message.textContent='请填写正整数积分和奖励原因。';return;}
    if(!parentGrantRequest||parentGrantRequest.amount!==amount||parentGrantRequest.reason!==reason){
      const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
      parentGrantRequest={amount,reason,request_id:[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')};
    }
    button.disabled=true;message.textContent='正在登记奖励…';
    try{
      const result=await api('/parent/points/add',{method:'POST',body:JSON.stringify(parentGrantRequest)});
      await refreshProfile();parentGrantRequest=null;form.reset();
      message.textContent=result.duplicate?'这笔奖励已经登记，积分没有重复增加。':`已增加 ${result.amount} 积分，操作已写入下方流水。`;
    }catch(error){message.textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('#ledgerMore').addEventListener('click',async()=>{
    if(!ledgerCursor||ledgerLoading)return;
    const generation=ledgerGeneration;
    ledgerLoading=true;$('#ledgerMore').disabled=true;
    try{const result=await api(`/parent/points/ledger?before=${ledgerCursor}`);
      if(generation!==ledgerGeneration)return;
      $('#ledgerList').insertAdjacentHTML('beforeend',result.items.map(ledgerRowHTML).join(''));
      ledgerCursor=result.next_cursor;$('#ledgerMore').hidden=!ledgerCursor;$('#ledgerStatus').textContent='';
    }catch(error){$('#ledgerStatus').textContent=error.message;}
    finally{ledgerLoading=false;$('#ledgerMore').disabled=false;}
  });
  if(!state.profile.learning_stage||state.profile.learning_stage==='未设置')openStageDialog();
  if(location.hash==='#arcade')navigate('arcade');
  if(['#battles','#strategies'].includes(location.hash)){renderDeck(location.hash.slice(1));navigate('cards');}
  if(location.hash==='#history'){renderDeck('history');navigate('cards');}
  if(location.hash==='#english-songs'){renderDeck('songs');navigate('cards');}
}
window.addEventListener('fufu-open-era',e=>{renderDeck('history',e.detail);navigate('cards');});
window.addEventListener('fufu-open-wisdom',e=>{renderDeck(e.detail.kind,e.detail.slug);navigate('cards');});
init();
