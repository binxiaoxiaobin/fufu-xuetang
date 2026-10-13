/* Textbook directories are loaded one level at a time; reuse the existing quiz. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const model = { subject:'数学', grade:'一年级', book:null, unit:null, count:5, token:0, opened:false };
  const page = document.createElement('main'); page.id='page-curriculum'; page.className='page curriculum-page';
  page.innerHTML=`<button class="lab-back" id="curriculumBack">← 返回学习首页</button><section class="curriculum-heading"><div class="eyebrow">一步一步，学会新本领</div><h1>跟着课本练一练 📚</h1><p>选一册、一个单元，再练一个小知识点。做完一小组，就可以休息一下。</p></section><div class="curriculum-toolbar"><div role="group" aria-label="教材科目"><button data-curriculum-subject="语文">语文</button><button data-curriculum-subject="数学" aria-pressed="true">数学</button><button data-curriculum-subject="英语">英语</button></div><label>练习年级<select id="curriculumGrade"><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select></label><label>每组题量<select id="curriculumCount"><option value="5">5 题 · 轻松练</option><option value="10">10 题 · 巩固练</option></select></label></div><div id="curriculumBooks" class="curriculum-books" role="group" aria-label="选择教材册次"></div><p id="curriculumEdition" class="curriculum-edition"></p><p id="curriculumStatus" role="status"></p><div class="curriculum-layout"><aside aria-label="教材单元"><h2>选一个单元</h2><div id="curriculumUnits"></div></aside><section aria-label="单元知识点"><div class="curriculum-topic-heading"><div><small id="curriculumUnitLabel">选好单元，再开始</small><h2>今天练什么？</h2></div><button id="curriculumUnitPractice" class="secondary-btn" hidden>本单元综合练习</button></div><div id="curriculumTopics" class="curriculum-topics"></div></section></div>`;
  document.querySelector('.app-shell').insertBefore(page,document.querySelector('.app-shell > footer'));
  const $ = id => page.querySelector('#'+id);
  async function read(path) {
    const response=await fetch(`${window.FUFU_API_BASE||''}/api/curriculum/${path}${path.includes('?')?'&':'?'}subject=${encodeURIComponent(model.subject)}&grade=${encodeURIComponent(model.grade)}`,{credentials:'same-origin'});
    let result;try{result=await response.json();}catch{throw new Error('教材目录暂时无法读取，请稍后重试。');}
    if(!response.ok)throw new Error(result.error||'教材目录暂时无法读取');return result.items;
  }
  function status(text) {$('curriculumStatus').textContent=text;}
  function clear() {
    model.book=null;model.unit=null;
    for(const id of ['curriculumBooks','curriculumUnits','curriculumTopics'])$(id).replaceChildren();
    $('curriculumEdition').textContent='';$('curriculumUnitLabel').textContent='选好单元，再开始';$('curriculumUnitPractice').hidden=true;
  }
  async function loadBooks() {
    const token=++model.token;clear();status('正在打开教材目录…');
    page.querySelectorAll('[data-curriculum-subject]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.curriculumSubject===model.subject)));
    try {
      const books=await read('books');if(token!==model.token)return;
      if(!books.length){status(model.subject==='英语'?'英语教材练习从三年级开始，请选择三至六年级。':'当前年级暂无这门科目的教材练习，请选择其他年级或科目。');return;}
      $('curriculumBooks').innerHTML=books.map(b=>`<button data-book="${esc(b.id)}">${esc(b.title)}</button>`).join('');
      $('curriculumBooks').querySelectorAll('[data-book]').forEach(button=>button.onclick=()=>selectBook(books.find(b=>b.id===button.dataset.book)));
      await selectBook(books[0]);
    } catch(error){if(token===model.token)status(error.message);}
  }
  async function selectBook(book) {
    const token=++model.token;model.book=book;model.unit=null;
    $('curriculumUnits').replaceChildren();$('curriculumTopics').replaceChildren();$('curriculumUnitPractice').hidden=true;
    $('curriculumEdition').textContent=book.edition+' · 原创同步练习 · 可复习其他年级，不改变个人学习年级';
    $('curriculumBooks').querySelectorAll('[data-book]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.book===book.id)));
    status('正在读取单元…');
    try {
      const units=await read(`books/${encodeURIComponent(book.id)}/units`);if(token!==model.token)return;
      $('curriculumUnits').innerHTML=units.map(u=>`<button data-unit="${esc(u.id)}"><b>${esc(u.title)}</b><small>${Number(u.topic_count)} 个知识点 · ${Number(u.question_count)} 题</small></button>`).join('');
      $('curriculumUnits').querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>selectUnit(units.find(u=>u.id===button.dataset.unit)));
      if(units.length)await selectUnit(units[0]);else status('这册教材的内容正在准备中。');
    }catch(error){if(token===model.token)status(error.message);}
  }
  async function selectUnit(unit) {
    const token=++model.token;model.unit=unit;$('curriculumTopics').replaceChildren();$('curriculumUnitPractice').hidden=true;
    $('curriculumUnits').querySelectorAll('[data-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.unit===unit.id)));
    $('curriculumUnitLabel').textContent=unit.title;status('正在读取知识点…');
    try {
      const topics=await read(`units/${encodeURIComponent(unit.id)}/topics`);if(token!==model.token)return;
      $('curriculumTopics').innerHTML=topics.map(t=>`<button class="curriculum-topic" data-topic="${esc(t.id)}" ${t.question_count?'':'disabled'}><span class="curriculum-topic-icon">${model.subject==='数学'?'🔢':model.subject==='英语'?'🔤':'✏️'}</span><b>${esc(t.title)}</b><small>${Number(t.question_count)} 题 · 配有解析</small><span>开始练习 →</span></button>`).join('');
      $('curriculumTopics').querySelectorAll('[data-topic]').forEach(button=>button.onclick=()=>start(button,{topic_id:button.dataset.topic,label:topics.find(t=>t.id===button.dataset.topic).title}));
      $('curriculumUnitPractice').hidden=!unit.question_count;
      status('每次只练一小组；答题后查看解析，题目会优先避开最近做过的内容。');
    }catch(error){if(token===model.token)status(error.message);}
  }
  async function start(button,scope) {
    if(button.disabled)return;button.disabled=true;
    try{await window.beginQuiz(model.subject,model.count,'','practice',scope);}finally{button.disabled=false;}
  }
  $('curriculumGrade').onchange=e=>{model.grade=e.target.value;loadBooks();};
  $('curriculumCount').onchange=e=>model.count=Number(e.target.value);
  $('curriculumBack').onclick=()=>window.navigate('home');
  $('curriculumUnitPractice').onclick=e=>{if(model.unit)start(e.currentTarget,{unit_id:model.unit.id,label:model.unit.title});};
  page.querySelectorAll('[data-curriculum-subject]').forEach(b=>b.onclick=()=>{model.subject=b.dataset.curriculumSubject;loadBooks();});
  const entry=document.createElement('button');entry.className='curriculum-entry';entry.type='button';
  entry.innerHTML='<span><img src="/assets/interface/book.svg" alt="" width="36" height="36"></span><span><b>教材同步练习</b><small>语文数学一至六年级 · 英语三至六年级</small></span><span>去练习 →</span>';
  const homeSlot=document.querySelector('#homeCurriculumSlot');
  if(homeSlot) homeSlot.append(entry); else document.querySelector('.subject-section')?.after(entry);
  entry.onclick=()=>{
    if(!model.opened){
      const grade=window.getLearningGrade?.();
      if([...$('curriculumGrade').options].some(o=>o.value===grade))model.grade=grade;
      $('curriculumGrade').value=model.grade;model.opened=true;
    }
    window.navigate('curriculum');loadBooks();
  };
})();
