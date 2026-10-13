const admin$ = selector => document.querySelector(selector);
const adminViews = {overview:'工作台',library:'绘本故事',questions:'题目与闯关',cards:'学习卡片',accounts:'用户管理',community:'评论与分享'};
function adminEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function showAdminView(name,options={}){
  if(!adminViews[name])return;
  if(name==='community'&&!['superadmin','content_admin'].includes(window.FUFU_ADMIN_ACCOUNT?.role))return;
  document.querySelectorAll('.page').forEach(page=>page.classList.toggle('active',page.id===`view-${name}`));
  document.querySelectorAll('.side-link').forEach(link=>link.classList.toggle('active',link.dataset.view===name));
  admin$('#crumbTitle').textContent=adminViews[name];
  if(name==='community')window.FufuCommunityAdmin?.onEnter();
  if(name==='accounts')window.FufuAccountsAdmin?.onEnter();
  if(name==='cards')window.FufuLearningCardsAdmin?.onEnter(options.cardKind);
  window.scrollTo({top:0,behavior:'smooth'});
}
const overviewStats=admin$('#view-overview .stats-grid');
if(overviewStats&&!admin$('#adminTaskStart')){
  const taskStart=document.createElement('section');taskStart.id='adminTaskStart';taskStart.className='admin-task-start';
  taskStart.innerHTML='<div><h2>你现在想做什么？</h2><p>点一个入口，直接开始添加或修改内容。</p></div><div class="admin-task-grid"><button type="button" data-admin-task="story"><span>📚</span><b>新增绘本或科普</b><small>写标题、正文和配图</small></button><button type="button" data-admin-task="question"><span>🧩</span><b>新增练习题</b><small>设置题目、选项和答案</small></button><button type="button" data-admin-task="card"><span>🔤</span><b>新增学习卡片</b><small>添加汉字、拼音或英语</small></button><button type="button" data-admin-task="history"><span>📜</span><b>编辑历史内容</b><small>朝代、战役和三十六计</small></button></div>';
  overviewStats.after(taskStart);
}
document.querySelectorAll('[data-admin-task]').forEach(button=>button.addEventListener('click',()=>{
  const task=button.dataset.adminTask;
  if(task==='story'){showAdminView('library');admin$('#createStory')?.click();}
  if(task==='question'){showAdminView('questions');admin$('#newQuestion')?.click();}
  if(task==='card'){showAdminView('cards',{cardKind:'reader'});admin$('#newLearningCard')?.click();}
  if(task==='history')showAdminView('cards',{cardKind:'history'});
}));
document.querySelectorAll('[data-view]').forEach(control=>control.addEventListener('click',()=>showAdminView(control.dataset.view)));
admin$('#createContentShortcut')?.addEventListener('click',()=>{showAdminView('library');admin$('#createStory')?.click();});

function renderDashboardStories(stories){
  const rows=stories.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))).slice(0,5);
  const ready=stories.filter(story=>story.cover_status==='ready').length;
  const types=new Set(stories.map(story=>story.story_type).filter(Boolean));
  admin$('#storyTotal').innerHTML=`${stories.length} <small>篇</small>`;
  admin$('#readyTotal').innerHTML=`${ready} <small>篇</small>`;
  admin$('#pendingTotal').innerHTML=`${stories.length-ready} <small>篇</small>`;
  admin$('#typeTotal').innerHTML=`${types.size} <small>类</small>`;
  admin$('#recentCount').textContent=stories.length;
  admin$('#navStoryCount').textContent=stories.length;
  admin$('#dashboardNote').textContent=`共 ${stories.length} 篇 · 数据来自 MySQL`;
  const typeNames={chengyu:'成语故事','traditional-tale':'传统故事','traditional-myth':'中国神话',science:'科普',story:'故事'};
  admin$('#dashboardStories').innerHTML=rows.length?rows.map(story=>`<tr><td><div class="dashboard-story"><img src="${adminEscape(story.cover||'/assets/bear-sun.svg')}" alt="" onerror="this.src='/assets/bear-sun.svg'"><span><b>${adminEscape(story.title)}</b><small>${adminEscape(story.summary||'')}</small></span></div></td><td>${adminEscape(typeNames[story.story_type]||story.category||'故事科普')}</td><td>${adminEscape(story.age||'未设置')}</td><td><span class="status-pill ${story.cover_status==='ready'?'':'pending'}">${story.cover_status==='ready'?'已就绪':'待补图'}</span></td><td><button class="row-more" data-view="library" aria-label="编辑故事">···</button></td></tr>`).join(''):'<tr><td colspan="5" class="loading-cell">内容库还没有故事，点击“管理故事内容”开始添加。</td></tr>';
  document.querySelectorAll('#dashboardStories [data-view]').forEach(button=>button.addEventListener('click',()=>showAdminView(button.dataset.view)));
  const missingCover=stories.filter(story=>story.cover_status!=='ready').length;
  const missingText=stories.filter(story=>!String(story.paragraphs||'').trim()||String(story.paragraphs||'').trim().length<80).length;
  admin$('#attentionList').innerHTML=missingCover||missingText?`${missingCover?`<div class="attention-item"><span class="file-icon orange">封</span><span class="attention-copy"><b>${missingCover} 篇内容待补封面</b><small>按数据库中的封面状态统计</small></span><button class="fix-btn" data-view="library">去查看 →</button></div>`:''}${missingText?`<div class="attention-item"><span class="file-icon blue-bg">文</span><span class="attention-copy"><b>${missingText} 篇正文较短或为空</b><small>依据当前内容库正文长度统计</small></span><button class="fix-btn" data-view="library">去编辑 →</button></div>`:''}`:'<div class="attention-item"><span class="file-icon blue-bg">✓</span><span class="attention-copy"><b>内容检查完成</b><small>当前没有待补封面或过短正文</small></span></div>';
  document.querySelectorAll('#attentionList [data-view]').forEach(button=>button.addEventListener('click',()=>showAdminView(button.dataset.view)));
}
async function checkDatabase(){
  const badge=admin$('#dbBadge');
  try{
    const response=await fetch(`${window.FUFU_API_BASE||''}/api/health`,{headers:{Accept:'application/json'}});
    const result=await response.json();
    if(!response.ok)throw new Error('MySQL 探测失败');
    let checkedAt=result.checked_at?new Date(result.checked_at).toLocaleTimeString('zh-CN',{hour12:false}):'';
    let checkMethod='';
    if(result.database_ok!==true){
      const probe=await fetch(`${window.FUFU_API_BASE||''}/api/stories`,{headers:{Accept:'application/json'}});
      if(!probe.ok)throw new Error('MySQL 探测失败');
      checkMethod=' · 内容接口校验';
    }
    badge.innerHTML=`<i></i> MySQL 已连接${checkMethod}${checkedAt?` · ${adminEscape(checkedAt)}`:''}`;
    badge.classList.remove('error');
  }catch(error){
    badge.innerHTML='<i></i> MySQL 连接失败';
    badge.classList.add('error');
  }
}
async function loadDashboard(){
  try{
    const response=await fetch(`${window.FUFU_API_BASE||''}/api/admin/stories`,{headers:{Accept:'application/json'}});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'内容服务暂不可用');
    renderDashboardStories(Array.isArray(result)?result:[]);
  }catch(error){
    admin$('#dashboardStories').innerHTML='<tr><td colspan="5" class="loading-cell">暂时无法读取内容，请检查服务连接。</td></tr>';
    admin$('#dashboardNote').textContent='内容服务暂时不可用';
    admin$('#attentionList').innerHTML='<div class="account-empty">无法读取内容检查结果</div>';
  }
}
loadDashboard();
checkDatabase();
window.setInterval(checkDatabase,30000);
