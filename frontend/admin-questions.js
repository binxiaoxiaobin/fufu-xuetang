const questionApi = `${window.FUFU_API_BASE || ''}/api`;
const questionState = { rows: [], id: null, status: 'all', stage: '', grade: '', subject: '', page: 1, total: 0, counts: {}, selected: new Set() };
const questionGrades = { '幼儿园': ['小班','中班','大班'], '小学': ['一年级','二年级','三年级','四年级','五年级','六年级'] };
const questionEsc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function questionRequest(path, options={}) {
  const response = await fetch(`${questionApi}${path}`, {headers:{'Content-Type':'application/json'},...options});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '题库请求失败'); return result;
}
function installQuestionWorkspace() {
  const page = document.createElement('section'); page.className='page'; page.id='view-questions';
  page.innerHTML = `<div class="page-heading"><div><div class="date-kicker">QUESTION BANK · MYSQL</div><h1>题库管理 <span>🧩</span></h1><p>按状态、年级和关键词定位题目；每页只加载当前所需内容。</p></div><button id="newQuestion" class="primary" type="button">＋ 新建题目</button></div><div id="questionStatus" class="connection-status">正在读取题库…</div><div class="admin-layout"><aside class="story-list-panel"><div class="list-heading"><div><b>题目列表</b><small>草稿筛选后可勾选并批量审核</small></div><span class="library-mark">🧩</span></div><div id="questionStatusFilters" class="question-status-filters" role="group" aria-label="按题目状态筛选"></div><div class="question-scope-filters"><label>阶段<select id="questionFilterStage"><option value="">全部阶段</option><option>幼儿园</option><option>小学</option></select></label><label>年级<select id="questionFilterGrade"><option value="">全部年级</option></select></label><label>学科<select id="questionFilterSubject"><option value="">全部学科</option><option>语文</option><option>数学</option><option>英语</option><option>科学</option></select></label><button id="clearQuestionFilters" type="button">清除筛选</button></div><div id="questionBatchToolbar" class="question-batch-toolbar is-inactive"><label><input id="questionSelectAll" type="checkbox" disabled><span>全选当前页草稿</span></label><span id="questionSelectedCount">先点“草稿”筛选</span><button id="publishSelectedQuestions" type="button" disabled>✓ 批量通过并发布</button></div><div class="list-tools"><label class="sr-only" for="questionSearch">搜索题目</label><span class="search-icon">⌕</span><input id="questionSearch" type="search" placeholder="搜索题干、知识点、来源或编号"><span id="questionCount">0 道</span></div><div id="questionList" class="story-list"></div><div id="questionPager" class="question-pager"></div></aside><form id="questionForm" class="editor-panel"><div class="editor-top"><div><div class="eyebrow">QUESTION EDITOR</div><h2 id="questionEditorTitle">新建题目</h2><p>答案由后端保管，不会下发给学习页面</p></div><button id="archiveQuestion" class="danger-button" type="button" disabled>下架题目</button></div><input id="questionId" type="hidden"><div class="form-grid"><label>学科<select id="questionSubject"><option>语文</option><option>数学</option><option>英语</option><option>科学</option></select></label><label>阶段<select id="questionStage"><option>幼儿园</option><option>小学</option></select></label><label>年级<select id="questionGrade"></select></label><label>难度<select id="questionDifficulty"><option value="easy">低</option><option value="medium">中</option><option value="hard">高</option></select></label><label>题型<select id="questionType"><option value="single_choice">单选题</option><option value="short_answer">简答题（数字、文字或单词）</option></select></label><label>知识点<input id="questionKnowledge" maxlength="160"></label><label class="wide">题目名称<input id="questionTitle" maxlength="200" placeholder="后台识别用，可留空"></label><label class="wide">题干<textarea id="questionPrompt" rows="3" required maxlength="4000"></textarea></label><div id="questionOptionsLabel" class="wide option-editor"><div class="option-editor-heading"><b>选项内容</b><small>逐项填写，勾选正确答案（2–6项）</small></div><div id="questionOptions" class="option-editor-list"></div><button id="addQuestionOption" class="add-option-button" type="button">＋ 添加选项</button></div><label id="questionAnswerLabel" class="wide" hidden>标准答案<input id="questionAnswer" maxlength="500" required placeholder="例如：9、太阳、apple"></label><label>状态<select id="questionPublishStatus"><option value="published">已发布</option><option value="draft">草稿</option><option value="archived">已下架</option></select></label><label class="wide">题干语音地址（可选）<input id="questionPromptAudio" maxlength="1000" placeholder="留空使用浏览器语音"></label><label class="wide">提示<textarea id="questionHint" rows="2" maxlength="2000"></textarea></label><label class="wide">答案解析<textarea id="questionExplanation" rows="3" maxlength="4000"></textarea></label><label class="wide">解析语音地址（可选）<input id="questionExplanationAudio" maxlength="1000"></label><label>来源与许可<input id="questionSourceLicense" readonly></label><label class="wide">来源署名<textarea id="questionSourceAttribution" rows="2" readonly></textarea></label></div><div class="editor-actions"><span id="questionMessage" role="status"></span><button class="quiet-button" type="reset">清空</button><button class="primary" type="submit">保存题目 →</button></div></form></div>`;
  document.querySelector('#view-library').before(page);
}
function questionGradeOptions(selected='') { const stage=document.querySelector('#questionStage').value; const select=document.querySelector('#questionGrade');select.innerHTML=(questionGrades[stage]||[]).map(g=>`<option ${selected===g?'selected':''}>${g}</option>`).join(''); }
function readQuestionOptions() { return [...document.querySelectorAll('#questionOptions .option-editor-row')].map((row,index)=>({key:String.fromCharCode(65+index),text:row.querySelector('.option-text').value.trim()})); }
function renderQuestionOptions(options=[],correctKey='A') {
  const container=document.querySelector('#questionOptions');
  const values=options.length?options.map(option=>({text:option.text||'',key:option.key})):['','',''].map(text=>({text,key:''}));
  const correctIndex=Math.max(0,values.findIndex(option=>option.key===correctKey));
  container.innerHTML=values.map((option,index)=>`<div class="option-editor-row"><span class="option-key">${String.fromCharCode(65+index)}</span><input class="option-text" type="text" maxlength="500" value="${questionEsc(option.text)}" placeholder="填写选项 ${String.fromCharCode(65+index)}" aria-label="选项 ${String.fromCharCode(65+index)} 内容" required><label class="option-correct-label"><input class="option-correct" type="radio" name="questionCorrectOption" ${index===correctIndex?'checked':''} aria-label="设为正确答案"><span>正确</span></label><button class="remove-option-button" type="button" aria-label="删除选项 ${String.fromCharCode(65+index)}" ${values.length<=2?'disabled':''}>×</button></div>`).join('');
  document.querySelector('#addQuestionOption').disabled=values.length>=6;
  container.querySelectorAll('.remove-option-button').forEach(button=>button.addEventListener('click',()=>{const current=readQuestionOptions();const removedIndex=[...container.querySelectorAll('.remove-option-button')].indexOf(button);const currentCorrect=container.querySelector('.option-correct:checked');const currentCorrectIndex=currentCorrect?Number(currentCorrect.closest('.option-editor-row').querySelector('.option-key').textContent.charCodeAt(0)-65):0;current.splice(removedIndex,1);let nextCorrect=currentCorrectIndex;if(removedIndex===currentCorrectIndex)nextCorrect=0;else if(removedIndex<currentCorrectIndex)nextCorrect-=1;renderQuestionOptions(current.map((item,index)=>({...item,key:String.fromCharCode(65+index)})),String.fromCharCode(65+nextCorrect));}));
}
function resetQuestionForm() { questionState.id=null;document.querySelector('#questionForm').reset();document.querySelector('#questionId').value='';document.querySelector('#questionEditorTitle').textContent='新建题目';document.querySelector('#archiveQuestion').disabled=true;document.querySelector('#questionMessage').textContent='';questionGradeOptions();renderQuestionOptions();syncQuestionType(); }
async function selectQuestion(id) {
  let q;try{q=await questionRequest(`/admin/questions/${id}`);}catch(error){document.querySelector('#questionStatus').textContent=error.message;return;}
  questionState.id=id;
  for (const [key,value] of Object.entries({questionId:q.id,questionSubject:q.subject,questionStage:q.stage,questionDifficulty:q.difficulty,questionType:q.question_type,questionKnowledge:q.knowledge_point,questionTitle:q.title,questionPrompt:q.prompt,questionAnswer:q.answer,questionPublishStatus:q.status,questionPromptAudio:q.prompt_audio,questionHint:q.hint,questionExplanation:q.explanation,questionExplanationAudio:q.explanation_audio,questionSourceLicense:q.source_name?`${q.source_name} · ${q.source_license}`:'自建题目',questionSourceAttribution:q.source_attribution})) document.querySelector(`#${key}`).value=value||'';
  questionGradeOptions(q.grade);renderQuestionOptions(q.options||[],q.answer||'A');syncQuestionType();document.querySelector('#questionEditorTitle').textContent=q.title||q.prompt.slice(0,45);document.querySelector('#archiveQuestion').disabled=false;document.querySelector('#questionMessage').textContent='';renderQuestionList();
}
function renderQuestionList() {
  const query=document.querySelector('#questionSearch').value.trim().toLowerCase();
  const labels={all:'全部',draft:'草稿',published:'已发布',archived:'已下架'};
  const totals=Object.fromEntries(Object.keys(labels).map(key=>[key,key==='all'?Object.values(questionState.counts).reduce((a,b)=>a+b,0):questionState.counts[key]||0]));
  document.querySelector('#questionStatusFilters').innerHTML=Object.entries(labels).map(([key,label])=>`<button type="button" class="question-status-filter ${questionState.status===key?'active':''} ${key}" data-status="${key}" aria-pressed="${questionState.status===key}">${label}<b>${totals[key]}</b></button>`).join('');
  document.querySelectorAll('[data-status]').forEach(button=>button.addEventListener('click',()=>{questionState.status=button.dataset.status;questionState.page=1;questionState.selected.clear();refreshQuestions();}));
  const stage=document.querySelector('#questionFilterStage');
  const grade=document.querySelector('#questionFilterGrade');
  const grades=questionState.stage?questionGrades[questionState.stage]||[]:[...questionGrades['幼儿园'],...questionGrades['小学']];
  grade.innerHTML='<option value="">全部年级</option>'+grades.map(value=>`<option value="${questionEsc(value)}">${questionEsc(value)}</option>`).join('');
  if(questionState.grade&&grades.includes(questionState.grade))grade.value=questionState.grade;else questionState.grade='';
  stage.value=questionState.stage;
  document.querySelector('#questionFilterSubject').value=questionState.subject;
  const rows=questionState.rows;
  document.querySelector('#questionCount').textContent=`共 ${questionState.total} 道`;
  const visibleDraftIds=rows.filter(q=>q.status==='draft').map(q=>q.id);
  const batchToolbar=document.querySelector('#questionBatchToolbar');
  batchToolbar.classList.toggle('is-inactive',questionState.status!=='draft');
  document.querySelector('#questionSelectedCount').textContent=questionState.status==='draft'?`已选 ${questionState.selected.size} 道`:'先点“草稿”筛选';
  document.querySelector('#publishSelectedQuestions').disabled=questionState.status!=='draft'||questionState.selected.size===0;
  const selectAll=document.querySelector('#questionSelectAll');
  selectAll.disabled=questionState.status!=='draft';
  const selectedVisible=visibleDraftIds.filter(id=>questionState.selected.has(id)).length;
  selectAll.checked=visibleDraftIds.length>0&&selectedVisible===visibleDraftIds.length;
  selectAll.indeterminate=selectedVisible>0&&!selectAll.checked;
  document.querySelector('#questionList').innerHTML=rows.length?rows.map(q=>`<div class="question-row ${q.id===questionState.id?'selected':''}"><label class="question-row-select"><input type="checkbox" class="question-row-checkbox" data-select-question="${q.id}" ${questionState.selected.has(q.id)?'checked':''} ${q.status==='draft'?'':'disabled'} aria-label="选择题目 ${q.id}"></label><button type="button" class="story-list-item ${q.id===questionState.id?'selected':''}" data-question-id="${q.id}"><span class="template-art sky">🧩</span><span><small>#${q.id} · ${questionEsc(q.stage)} · ${questionEsc(q.grade)} · ${questionEsc(q.subject)}</small><b>${questionEsc(q.title||q.prompt)}</b><em>${questionEsc(q.knowledge_point||q.difficulty)} · ${q.source_name?questionEsc(q.source_name)+' · '+questionEsc(q.source_license)+' · ':''}${q.status==='published'?'已发布':q.status==='draft'?'草稿':'已下架'}</em></span></button></div>`).join(''):'<p class="list-empty">没有符合条件的题目</p>';
  document.querySelectorAll('[data-question-id]').forEach(button=>button.addEventListener('click',()=>selectQuestion(Number(button.dataset.questionId))));
  document.querySelectorAll('[data-select-question]').forEach(input=>input.addEventListener('change',()=>{const id=Number(input.dataset.selectQuestion);if(input.checked)questionState.selected.add(id);else questionState.selected.delete(id);renderQuestionList();}));
  const pages=Math.max(1,Math.ceil(questionState.total/50));
  document.querySelector('#questionPager').innerHTML=`<button type="button" data-question-page="prev" ${questionState.page<=1?'disabled':''}>上一页</button><span>第 ${questionState.page} / ${pages} 页</span><button type="button" data-question-page="next" ${questionState.page>=pages?'disabled':''}>下一页</button>`;
  document.querySelectorAll('[data-question-page]').forEach(button=>button.addEventListener('click',()=>{questionState.page+=button.dataset.questionPage==='next'?1:-1;questionState.selected.clear();refreshQuestions();}));
}
async function refreshQuestions(selectId=null) {
  const status=document.querySelector('#questionStatus');try {const params=new URLSearchParams({page:questionState.page,page_size:50,status:questionState.status,stage:questionState.stage,grade:questionState.grade,subject:questionState.subject,search:document.querySelector('#questionSearch').value.trim()});const result=await questionRequest(`/admin/questions?${params}`);questionState.rows=result.items;questionState.total=result.total;questionState.counts=result.counts;status.textContent=`MySQL 已连接 · 共 ${result.total} 道题目`;status.className='connection-status connected';renderQuestionList();if(selectId)await selectQuestion(selectId);}
  catch(error){status.textContent=error.message;status.className='connection-status error';}
}
installQuestionWorkspace();
const importButton=document.createElement('button');importButton.type='button';importButton.className='quiet-button';importButton.textContent='导入 JSON 题目';
const importTemplate=document.createElement('a');importTemplate.href='/question-import-template.json';importTemplate.download='福福学堂题目导入模板.json';importTemplate.className='quiet-button';importTemplate.textContent='下载导入模板';
const importInput=document.createElement('input');importInput.type='file';importInput.accept='application/json,.json';importInput.hidden=true;
document.querySelector('#newQuestion').before(importTemplate,importButton,importInput);
if(window.FUFU_ADMIN_ACCOUNT?.role==='viewer')importButton.hidden=true;
importButton.addEventListener('click',()=>importInput.click());
importInput.addEventListener('change',async()=>{
  const file=importInput.files?.[0];if(!file)return;
  const status=document.querySelector('#questionStatus');
  try{
    if(file.size>900000)throw new Error('导入文件过大，请每批最多放 200 道题');
    const parsed=JSON.parse(await file.text());
    const questions=Array.isArray(parsed)?parsed:parsed.questions;
    status.textContent='正在导入草稿题目…';status.className='connection-status';
    const result=await questionRequest('/admin/questions/import',{method:'POST',body:JSON.stringify({questions})});
    questionState.status='draft';questionState.page=1;questionState.selected.clear();
    await refreshQuestions();status.textContent=`导入 ${result.inserted} 道草稿，跳过重复 ${result.skipped} 道`;status.className='connection-status connected';
  }catch(error){status.textContent=error.message;status.className='connection-status error';}
  finally{importInput.value='';}
});
function syncQuestionType(){const short=document.querySelector('#questionType').value==='short_answer';document.querySelector('#questionOptionsLabel').hidden=short;document.querySelector('#questionAnswerLabel').hidden=!short;document.querySelector('#questionAnswer').required=short;document.querySelectorAll('.option-text').forEach(input=>input.required=!short);}
renderQuestionOptions();
document.querySelector('#questionType').addEventListener('change',syncQuestionType);syncQuestionType();
document.querySelector('#questionStage').addEventListener('change',()=>questionGradeOptions());
let questionSearchTimer;
document.querySelector('#questionSearch').addEventListener('input',()=>{clearTimeout(questionSearchTimer);questionSearchTimer=setTimeout(()=>{questionState.page=1;questionState.selected.clear();refreshQuestions();},250);});
document.querySelector('#questionFilterStage').addEventListener('change',event=>{questionState.stage=event.target.value;questionState.grade='';questionState.page=1;questionState.selected.clear();refreshQuestions();});
document.querySelector('#questionFilterGrade').addEventListener('change',event=>{questionState.grade=event.target.value;questionState.page=1;questionState.selected.clear();refreshQuestions();});
document.querySelector('#questionFilterSubject').addEventListener('change',event=>{questionState.subject=event.target.value;questionState.page=1;questionState.selected.clear();refreshQuestions();});
document.querySelector('#clearQuestionFilters').addEventListener('click',()=>{questionState.status='all';questionState.stage='';questionState.grade='';questionState.subject='';questionState.page=1;questionState.selected.clear();document.querySelector('#questionSearch').value='';document.querySelector('#questionFilterSubject').value='';refreshQuestions();});
document.querySelector('#newQuestion').addEventListener('click',resetQuestionForm);
document.querySelector('#questionSelectAll').addEventListener('change',event=>{document.querySelectorAll('[data-select-question]').forEach(input=>{const id=Number(input.dataset.selectQuestion);if(event.target.checked)questionState.selected.add(id);else questionState.selected.delete(id);});renderQuestionList();});
document.querySelector('#publishSelectedQuestions').addEventListener('click',async()=>{
  const ids=[...questionState.selected];if(!ids.length)return;
  if(!window.confirm(`确认审核通过并发布所选的 ${ids.length} 道草稿题目？`))return;
  const status=document.querySelector('#questionStatus');status.textContent=`正在发布 ${ids.length} 道题目…`;status.className='connection-status';
  try{const result=await questionRequest('/admin/questions/bulk-status',{method:'POST',body:JSON.stringify({ids,status:'published'})});questionState.selected.clear();await refreshQuestions();status.textContent=`已审核通过并发布 ${result.updated} 道题目`;status.className='connection-status connected';}
  catch(error){status.textContent=error.message;status.className='connection-status error';}
});
document.querySelector('#addQuestionOption').addEventListener('click',()=>{const entries=readQuestionOptions();if(entries.length>=6)return;const selected=document.querySelector('.option-correct:checked');const key=selected?String.fromCharCode(65+Number(selected.closest('.option-editor-row').querySelector('.option-key').textContent.charCodeAt(0)-65)):'A';renderQuestionOptions([...entries,{key:'',text:''}],key);syncQuestionType();document.querySelector(`#questionOptions .option-editor-row:last-child .option-text`).focus();});
document.querySelector('#questionForm').addEventListener('reset',()=>setTimeout(()=>{questionState.id=null;document.querySelector('#questionId').value='';document.querySelector('#questionEditorTitle').textContent='新建题目';document.querySelector('#archiveQuestion').disabled=true;document.querySelector('#questionMessage').textContent='';questionGradeOptions();renderQuestionOptions();syncQuestionType();renderQuestionList();},0));
document.querySelector('#questionForm').addEventListener('submit',async event=>{
  event.preventDefault();const questionType=document.querySelector('#questionType').value;const entries=readQuestionOptions();const correct=document.querySelector('.option-correct:checked');const correctIndex=correct?Number(correct.closest('.option-editor-row').querySelector('.option-key').textContent.charCodeAt(0)-65):-1;
  const payload={subject:document.querySelector('#questionSubject').value,stage:document.querySelector('#questionStage').value,grade:document.querySelector('#questionGrade').value,difficulty:document.querySelector('#questionDifficulty').value,question_type:questionType,knowledge_point:document.querySelector('#questionKnowledge').value,title:document.querySelector('#questionTitle').value,prompt:document.querySelector('#questionPrompt').value,options:questionType==='short_answer'?[]:entries,answer:questionType==='short_answer'?document.querySelector('#questionAnswer').value:entries[correctIndex]?.key||'',status:document.querySelector('#questionPublishStatus').value,prompt_audio:document.querySelector('#questionPromptAudio').value,hint:document.querySelector('#questionHint').value,explanation:document.querySelector('#questionExplanation').value,explanation_audio:document.querySelector('#questionExplanationAudio').value};
  try{const result=await questionRequest(`/admin/questions${questionState.id?`/${questionState.id}`:''}`,{method:questionState.id?'PUT':'POST',body:JSON.stringify(payload)});await refreshQuestions(result.id||questionState.id);document.querySelector('#questionMessage').textContent='已保存到 MySQL';}catch(error){const message=document.querySelector('#questionMessage');message.textContent=error.message;message.className='form-error';}
});
document.querySelector('#archiveQuestion').addEventListener('click',async()=>{if(!questionState.id)return;try{await questionRequest(`/admin/questions/${questionState.id}`,{method:'DELETE'});resetQuestionForm();await refreshQuestions();}catch(error){document.querySelector('#questionMessage').textContent=error.message;}});
refreshQuestions();
