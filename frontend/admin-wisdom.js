(()=>{'use strict';
 let host,rows,periods,active,dirty=false,requestId=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=async(p,o={})=>{const r=await fetch(`${window.FUFU_API_BASE||''}/api${p}`,{headers:{'Content-Type':'application/json'},cache:'no-store',...o});const d=await r.json();if(!r.ok)throw Error(d.error||'未保存');return d;};
 const area=(k,label,value)=>`<label class="wide">${label}<textarea data-field="${k}" rows="${k==='paragraphs'?9:3}" maxlength="30000">${esc(value||'')}</textarea></label>`;
 function edit(p){
   if(dirty&&!confirm('有未保存的修改，放弃后切换吗？'))return;
   active=structuredClone(p);dirty=false;const writable=['superadmin','content_admin'].includes(window.FUFU_ADMIN_ACCOUNT?.role);
   host.querySelector('form').innerHTML=`<div class="editor-top"><h2>${esc(p.title)}</h2></div><fieldset ${writable?'':'disabled'} style="border:0;padding:0"><div class="form-grid">${['title','group','dates','location','image_path','image_caption','source_url'].map(k=>`<label>${({title:'标题',group:'分类',dates:'年代 / 计序',location:'地点',image_path:'配图路径',image_caption:'配图说明',source_url:'资料出处链接'})[k]}<input data-field="${k}" value="${esc(p[k]||'')}"></label>`).join('')}<label>排序<input type="number" data-field="position" value="${p.position}" min="0" max="65535" required></label><label>发布状态<select data-field="status"><option value="published" ${p.status==='published'?'selected':''}>已发布</option><option value="archived" ${p.status==='archived'?'selected':''}>已下架</option></select></label>${area('summary','简介',p.summary)}${area('paragraphs','详细正文（每段之间空一行）',p.paragraphs.join('\n\n'))}${area('quote','文言原文（可选）',p.quote)}${area('quote_source','原文出处',p.quote_source)}${area('gloss','字词注释',p.gloss)}${area('translation','白话解释',p.translation)}${area('caution','史实辨析 / 适用边界',p.caution)}${area('question','阅读问题',p.question)}${area('people','人物简介（每行：姓名：介绍；姓名中不要含冒号）',p.people.map(x=>x.name+'：'+x.bio).join('\n'))}<label class="wide">关联朝代（可多选）<select multiple size="6" data-field="period_slugs">${periods.map(x=>`<option value="${esc(x.slug)}" ${p.period_slugs.includes(x.slug)?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label><label class="wide">关联战役 / 计策（可多选）<select multiple size="7" data-field="related_slugs">${rows.filter(x=>x.slug!==p.slug).map(x=>`<option value="${esc(x.slug)}" ${p.related_slugs.includes(x.slug)?'selected':''}>${x.kind==='battles'?'战役':'计策'} · ${esc(x.title)}</option>`).join('')}</select></label></div><div class="editor-actions"><span data-wisdom-message role="status"></span><button class="quiet-button" data-discard type="button">放弃修改</button><button class="primary" type="submit">保存内容 →</button></div></fieldset>`;
   const form=host.querySelector('form');
   form.querySelector('.editor-top').insertAdjacentHTML('beforeend','<p class="admin-form-hint">建议先检查标题、简介、正文和配图；其他资料可之后补充。</p>');
   const mainGrid=form.querySelector('.form-grid');
   const extra=document.createElement('details');extra.className='admin-extra-fields';extra.innerHTML='<summary>扩展资料（文言文、注释、人物与关联）</summary><div class="form-grid"></div>';
   const extraGrid=extra.querySelector('.form-grid');
   ['location','image_caption','source_url','quote','quote_source','gloss','translation','caution','question','people','period_slugs','related_slugs'].forEach(key=>{const field=mainGrid.querySelector(`[data-field="${key}"]`);if(field){const label=field.closest('label');if(label)extraGrid.append(label);}});
   if(extraGrid.children.length)mainGrid.append(extra);
   form.oninput=()=>dirty=true;form.onchange=()=>dirty=true;
   form.querySelector('[data-discard]').onclick=()=>{dirty=false;edit(rows.find(x=>x.slug===active.slug));};
   form.onsubmit=async e=>{e.preventDefault();const message=form.querySelector('[data-wisdom-message]');message.textContent='正在保存…';
     try{const doc=structuredClone(active);form.querySelectorAll('[data-field]').forEach(el=>{const k=el.dataset.field;doc[k]=el.multiple?[...el.selectedOptions].map(x=>x.value):el.value.trim();});doc.position=Number(doc.position);doc.paragraphs=doc.paragraphs.split(/\n\s*\n/).filter(Boolean);doc.people=doc.people?doc.people.split('\n').filter(Boolean).map(x=>{const pos=x.search(/[：:]/);if(pos<1)throw Error('人物需要按“姓名：介绍”填写');return {name:x.slice(0,pos).trim(),bio:x.slice(pos+1).trim()};}):[];const result=await api('/admin/history-wisdom/'+doc.slug,{method:'PUT',body:JSON.stringify({document:doc,revision:active.revision})});rows=rows.map(x=>x.slug===doc.slug?result:x);active=result;dirty=false;message.textContent='已保存，前台重新打开即可读取，无需重启。';}
     catch(err){message.textContent=err.message;}
   };
 }
 async function render(container,kind){
   if(dirty&&!confirm('有未保存的修改，放弃后切换吗？'))return;
   dirty=false;host=container;const v=++requestId;host.innerHTML='<p role="status">正在读取…</p>';
   try{const [a,b]=await Promise.all([api('/admin/history-wisdom'),api('/admin/history')]);if(v!==requestId)return;rows=a.items;periods=b.periods;host.innerHTML='<div class="admin-layout"><aside class="story-list-panel"><div class="list-heading"><b>选择内容编辑</b></div><div class="list-tools"><input data-wisdom-search type="search" placeholder="搜索名称或人物"></div><div class="story-list" data-wisdom-list></div></aside><form class="editor-panel"></form></div>';
     const paint=()=>{const q=host.querySelector('input').value;host.querySelector('[data-wisdom-list]').innerHTML=rows.filter(x=>x.kind===kind&&[x.title,...x.people.map(y=>y.name)].join(' ').includes(q)).map(x=>`<button type="button" class="story-list-item" data-edit-wisdom="${esc(x.slug)}"><span><small>${esc(x.dates)}${x.status==='archived'?' · 已下架':''}</small><b>${esc(x.title)}</b></span></button>`).join('');host.querySelectorAll('[data-edit-wisdom]').forEach(b=>b.onclick=()=>edit(rows.find(x=>x.slug===b.dataset.editWisdom)));};host.querySelector('input').oninput=paint;paint();const first=rows.find(x=>x.kind===kind);if(first)edit(first);
   }catch(e){if(v===requestId)host.innerHTML=`<p role="status">${esc(e.message)}</p>`;}
 }
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 window.FufuWisdomAdmin={render,canLeave:()=>!dirty||confirm('有未保存的战役或计策修改，放弃后切换吗？'),discard:()=>{dirty=false;}};
})();
