/* Embedded within the existing Learning Cards admin page. */
(() => {
  let host=null,catalog=null,choices=null,active=null,dirty=false,loadingVersion=0;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request=async(path,options={})=>{const r=await fetch(`${window.FUFU_API_BASE||''}/api${path}`,{headers:{'Content-Type':'application/json'},cache:'no-store',...options});const d=await r.json();if(!r.ok)throw Error(d.error||'内容未保存');return d;};
  const input=(key,label,value,type='text')=>`<label>${label}<input data-field="${key}" type="${type}" value="${esc(value)}" required ${type==='number'?'':'maxlength="1500"'}></label>`;
  const area=(key,label,value)=>`<label class="wide">${label}<textarea data-field="${key}" rows="3" maxlength="2000" required>${esc(value)}</textarea></label>`;
  const canWrite=()=>['superadmin','content_admin'].includes(window.FUFU_ADMIN_ACCOUNT?.role);
  function message(text,error=false){const el=host?.querySelector('[data-history-message]');if(el){el.textContent=text;el.classList.toggle('error',error);}}
  function renderEditor(p){
    active=structuredClone(p);dirty=false;
    const form=host.querySelector('form');
    form.innerHTML=`<div class="editor-top"><div><div class="eyebrow">朝代 · 事件 · 人物 · 关联作品</div><h2>${esc(p.title)}</h2><p>保存后，前台重新打开卡片即可读取；已有故事请到绘本故事中修改。</p></div><a class="home-link" target="_blank" href="/#history">查看前台 ↗</a></div><fieldset ${canWrite()?'':'disabled'}><div class="form-grid">${input('title','朝代 / 时期名称',p.title)}${input('dates','显示年代',p.dates)}${input('start_year','起始年份（公元前用负数）',p.start_year,'number')}${input('end_year','结束年份',p.end_year,'number')}${input('group','主题分组',p.group)}${input('position','显示顺序',p.position,'number')}${input('tagline','一句话介绍',p.tagline)}<label>发布状态<select data-field="status"><option value="published" ${p.status==='published'?'selected':''}>显示</option><option value="archived" ${p.status==='archived'?'selected':''}>下架</option></select></label>${area('summary','时代介绍',p.summary)}${area('note','年代口径说明',p.note)}${area('question','亲子讨论问题',p.question)}</div><h3>代表事件</h3><div data-events></div><button type="button" class="quiet-button" data-add-event>＋ 添加事件</button><h3>并存政权与分期</h3><div data-lanes></div><button type="button" class="quiet-button" data-add-lane>＋ 添加时间条</button><h3>代表人物与诗词故事</h3><div data-people></div><button type="button" class="quiet-button" data-add-person>＋ 添加人物</button><h3>本卡参考资料</h3><div class="history-admin-sources">${catalog.sources.map(s=>`<label><input type="checkbox" data-source="${esc(s.id)}" ${p.sources.includes(s.id)?'checked':''}>${esc(s.title)}</label>`).join('')}</div><div class="editor-actions"><span data-history-message role="status">${canWrite()?'内容修改后，点击保存发布。':'当前账号只读。'}</span><button type="submit" class="primary">保存朝代卡片 →</button></div></fieldset>`;
    const formSections=[...form.querySelectorAll('fieldset > h3')];
    formSections.forEach(heading=>{
      if(!['并存政权与分期','代表人物与诗词故事','本卡参考资料'].includes(heading.textContent.trim()))return;
      const details=document.createElement('details');details.className='admin-extra-fields history-extra-section';
      const summary=document.createElement('summary');summary.textContent=heading.textContent.trim()+'（选填）';details.append(summary);heading.before(details);
      let node=heading;while(node&&(node===heading||node.tagName!=='H3')&&!node.classList.contains('editor-actions')){const next=node.nextElementSibling;details.append(node);node=next;}
    });
    form.querySelector('.editor-top').insertAdjacentHTML('beforeend','<p class="admin-form-hint">先核对朝代名称、年代、简介和代表事件；人物、关联内容等可以逐步补充。</p>');
    form.oninput=()=>{dirty=true;};form.onchange=()=>{dirty=true;};
    function collect(){
      form.querySelectorAll(':scope > fieldset > .form-grid [data-field]').forEach(el=>active[el.dataset.field]=el.type==='number'?Number(el.value):el.value.trim());
      form.querySelectorAll('[data-event-index]').forEach(box=>box.querySelectorAll('[data-field]').forEach(el=>active.events[Number(box.dataset.eventIndex)][el.dataset.field]=el.value.trim()));
      form.querySelectorAll('[data-lane-index]').forEach(box=>box.querySelectorAll('[data-field]').forEach(el=>active.lanes[Number(box.dataset.laneIndex)][el.dataset.field]=el.type==='number'?Number(el.value):el.value.trim()));
      form.querySelectorAll('[data-person-index]').forEach(box=>box.querySelectorAll('[data-person-field]').forEach(el=>active.people[Number(box.dataset.personIndex)][el.dataset.personField]=el.value.trim()));
      active.sources=[...form.querySelectorAll('[data-source]:checked')].map(el=>el.dataset.source);
    }
    function nested(){
      form.querySelector('[data-events]').innerHTML=active.events.map((e,i)=>`<div class="history-admin-block" data-event-index="${i}"><div class="form-grid">${input('date','发生时间',e.date)}${input('title','事件标题',e.title)}${area('description','事件介绍',e.description)}</div><button type="button" class="danger-button" data-remove-event="${i}">移除此事件</button></div>`).join('');
      form.querySelector('[data-lanes]').innerHTML=active.lanes.map((e,i)=>`<div class="history-admin-block" data-lane-index="${i}"><div class="form-grid">${input('name','政权 / 分期名称',e.name)}${input('dates','显示年代',e.dates)}${input('start_year','起始年份',e.start_year,'number')}${input('end_year','结束年份',e.end_year,'number')}</div><button type="button" class="danger-button" data-remove-lane="${i}">移除此时间条</button></div>`).join('');
      form.querySelector('[data-people]').innerHTML=active.people.map((x,i)=>`<details class="history-admin-person" data-person-index="${i}" ${i===0?'open':''}><summary>${esc(x.name||'新人物')} · ${esc(x.role||'待填写')}</summary><div class="form-grid">${[['name','姓名'],['role','身份'],['evidence_kind','内容性质（史实 / 轶事 / 传说）']].map(([k,label])=>`<label>${label}<input data-person-field="${k}" required maxlength="1500" value="${esc(x[k])}"></label>`).join('')}${[['bio','人物介绍'],['contribution','代表贡献与理解要点'],['reading','延伸阅读提示'],['source_note','文献来源'],['caution','必要的区别说明（可留空）']].map(([k,label])=>`<label class="wide">${label}<textarea data-person-field="${k}" rows="3" maxlength="2000" ${k==='caution'?'':'required'}>${esc(x[k])}</textarea></label>`).join('')}</div><h4>已关联作品</h4><div class="history-admin-links">${active.links.filter(l=>l.person_slug===x.slug).map(l=>{const option=(l.content_kind==='poetry'?choices.poetry:choices.stories).find(o=>o.id===l.content_id);return `<div><span>${esc(l.content_kind==='poetry'?'诗词':'故事')} · ${esc(option?.title||'内容已不可用')}<small>${esc(l.relation_label)}</small></span><button type="button" class="quiet-button" data-remove-link="${active.links.indexOf(l)}">解除关联</button></div>`;}).join('')}</div><div class="history-admin-link-tools"><label>选择已有诗词<select data-poem-choice="${i}"><option value="">选择诗词</option>${choices.poetry.map(w=>`<option value="${w.id}">${esc(w.author)} · ${esc(w.title)}</option>`).join('')}</select></label><label>关系<select data-relation="${i}"><option>本人作品</option><option>后人咏怀</option><option>同题材延伸阅读</option></select></label><button type="button" class="quiet-button" data-add-poem="${i}">关联诗词</button><label>选择已有故事<select data-story-choice="${i}"><option value="">选择故事</option>${choices.stories.map(w=>`<option value="${w.id}">${esc(w.title)}</option>`).join('')}</select></label><label>性质<select data-story-relation="${i}"><option>历史人物小传</option><option>史书记载的轶事</option><option>后世流传的故事</option><option>传统叙事</option></select></label><button type="button" class="quiet-button" data-add-story="${i}">关联故事</button></div><button type="button" class="danger-button" data-remove-person="${i}">移除此人物</button></details>`).join('');
      const mutate=fn=>{collect();fn();dirty=true;nested();message('有未保存的修改。');};
      form.querySelectorAll('[data-remove-event]').forEach(b=>b.onclick=()=>mutate(()=>active.events.splice(Number(b.dataset.removeEvent),1)));
      form.querySelectorAll('[data-remove-lane]').forEach(b=>b.onclick=()=>mutate(()=>active.lanes.splice(Number(b.dataset.removeLane),1)));
      form.querySelectorAll('[data-remove-person]').forEach(b=>b.onclick=()=>mutate(()=>{const [person]=active.people.splice(Number(b.dataset.removePerson),1);active.links=active.links.filter(l=>l.person_slug!==person.slug);}));
      form.querySelectorAll('[data-remove-link]').forEach(b=>b.onclick=()=>mutate(()=>active.links.splice(Number(b.dataset.removeLink),1)));
      const add=(b,key,kind)=>{const i=Number(b.dataset[key]),id=Number(form.querySelector(`[data-${kind==='poetry'?'poem':'story'}-choice="${i}"]`).value);if(!id){message('请先选择作品。',true);return;}if(active.links.some(l=>l.person_slug===active.people[i].slug&&l.content_kind===kind&&l.content_id===id)){message('这篇内容已经关联。',true);return;}mutate(()=>active.links.push({person_slug:active.people[i].slug,content_kind:kind,content_id:id,relation_label:form.querySelector(`[data-${kind==='poetry'?'relation':'story-relation'}="${i}"]`).value}));};
      form.querySelectorAll('[data-add-poem]').forEach(b=>b.onclick=()=>add(b,'addPoem','poetry'));
      form.querySelectorAll('[data-add-story]').forEach(b=>b.onclick=()=>add(b,'addStory','story'));
    }
    form.querySelector('[data-add-event]').onclick=()=>{collect();active.events.push({date:'',title:'',description:''});dirty=true;nested();};
    form.querySelector('[data-add-lane]').onclick=()=>{collect();active.lanes.push({name:'',dates:'',start_year:active.start_year,end_year:active.end_year});dirty=true;nested();};
    form.querySelector('[data-add-person]').onclick=()=>{collect();active.people.push({slug:'person-'+Date.now(),name:'',role:'',bio:'',contribution:'',reading:'',source_note:'',evidence_kind:'历史人物',caution:''});dirty=true;nested();form.querySelector('[data-people] details:last-child').open=true;};
    form.onsubmit=async e=>{
      e.preventDefault();if(!canWrite())return;collect();const b=form.querySelector('[type=submit]');b.disabled=true;message('正在保存并检查关联内容…');
      try{const result=await request('/admin/history/'+active.slug,{method:'PUT',body:JSON.stringify({revision:active.revision,document:active})});active.revision=result.revision;dirty=false;catalog.periods=catalog.periods.map(x=>x.slug===active.slug?structuredClone(active):x);message('已保存。前台重新打开卡片即可看到，无需重启服务。');}
      catch(error){message(error.message,true);}finally{b.disabled=false;}
    };
    nested();
  }
  async function render(container){
    if(dirty&&host===container&&active){message('保留了未保存的修改。');return;}
    host=container;const version=++loadingVersion;
    host.innerHTML='<p role="status">正在读取朝代卡片…</p>';
    try{
      [catalog,choices]=await Promise.all([request('/admin/history'),request('/admin/history/choices')]);
      if(version!==loadingVersion||host!==container)return;
      host.innerHTML=`<div class="admin-layout history-admin-layout"><aside class="story-list-panel"><div class="list-heading"><b>朝代时光轴 · ${catalog.periods.length} 个时期</b></div><div class="story-list">${catalog.periods.map(p=>`<button type="button" class="story-list-item" data-history-edit="${esc(p.slug)}"><span class="template-art green">${p.position+1}</span><span><small>${esc(p.dates)}</small><b>${esc(p.title)}</b><em>${p.status==='archived'?'已下架':p.people.length+' 位人物'}</em></span></button>`).join('')}</div></aside><form class="editor-panel history-admin-editor"></form></div>`;
      host.querySelectorAll('[data-history-edit]').forEach(b=>b.onclick=()=>{
        if(dirty&&active?.slug!==b.dataset.historyEdit){message('请先保存当前修改，或点“放弃修改”。',true);if(!host.querySelector('[data-discard]')){const discard=document.createElement('button');discard.type='button';discard.className='quiet-button';discard.dataset.discard='';discard.textContent='放弃修改，切换卡片';discard.onclick=()=>{dirty=false;b.click();};host.querySelector('.editor-actions').append(discard);}return;}
        if(dirty)return;
        host.querySelectorAll('[data-history-edit]').forEach(x=>x.classList.toggle('selected',x===b));
        renderEditor(catalog.periods.find(x=>x.slug===b.dataset.historyEdit));
      });
      host.querySelector('[data-history-edit]')?.click();
    }catch(error){container.innerHTML=`<p class="connection-status error" role="status">${esc(error.message)}</p><button type="button">重新读取</button>`;container.querySelector('button').onclick=()=>render(container);}
  }
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  window.FufuHistoryAdmin={render};
})();
