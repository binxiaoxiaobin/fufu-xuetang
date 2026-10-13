(() => {
  const $ = selector => document.querySelector(selector);
  const API = `${window.FUFU_API_BASE || ''}/api`;
  const role = window.FUFU_ADMIN_ACCOUNT?.role;
  const canManage = ['superadmin','learner_manager'].includes(role);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => value ? new Date(value).toLocaleString('zh-CN',{hour12:false}) : '—';
  const style = document.createElement('style');
  style.textContent = `
    .ops-panel{padding:18px}.ops-tabs{display:flex;gap:8px;margin:12px 0}.ops-tabs button{padding:8px 13px;border:1px solid #e0e9dc;border-radius:8px;background:white;color:#55745d;cursor:pointer}.ops-tabs button.active{background:#4e8068;color:white}
    .redemption-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px;border:1px solid #e5ebe1;border-radius:11px;background:#fbfcf9;margin:14px 0}.redemption-form label{display:grid;gap:5px;color:#78867b;font-size:11px}.redemption-form input,.redemption-form select{height:37px;min-width:0;padding:0 9px;border:1px solid #e2e9df;border-radius:7px;background:white;color:#3f5042;font:12px inherit}.redemption-form button{height:37px;border:0;border-radius:7px;background:#4e8068;color:white;cursor:pointer}.redemption-form [role=status]{grid-column:1/-1;color:#657b69;font-size:11px}.ops-table{min-width:820px}.ops-table td{vertical-align:top}.ops-detail{max-width:340px;white-space:normal;overflow-wrap:anywhere;color:#617066}.ops-action{border:1px solid #dfe8dc;border-radius:7px;background:#fff;color:#537960;padding:6px 9px;cursor:pointer;margin:2px}.ops-action.danger{color:#a95447}.ops-search{height:36px;min-width:min(320px,100%);padding:0 10px;border:1px solid #e2e9df;border-radius:8px}.ops-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0}.ops-message{min-height:20px;color:#68776d;font-size:11px}
    @media(max-width:700px){.redemption-form{grid-template-columns:1fr}.redemption-form [role=status]{grid-column:auto}.ops-toolbar{align-items:stretch;flex-direction:column}.ops-panel{padding:12px}}
  `;
  document.head.append(style);
  const nav = document.querySelectorAll('.side-nav')[1];
  if (nav && !document.querySelector('[data-view="redemptions"]')) {
    nav.insertAdjacentHTML('beforeend','<button class="side-link" data-view="redemptions"><span>🎁</span>实物兑换</button><button class="side-link" data-view="audit"><span>≋</span>操作日志</button>');
    nav.querySelectorAll('[data-view="redemptions"],[data-view="audit"]').forEach(button=>button.addEventListener('click',()=>window.showAdminView?.(button.dataset.view)));
  }
  const main = document.querySelector('.main');
  const library = $('#view-library');
  if (!$('#view-redemptions')) {
    const section=document.createElement('section'); section.id='view-redemptions'; section.className='page';
    section.innerHTML=`<div class="page-heading"><div><div class="date-kicker">REDEMPTION · MYSQL</div><h1>实物兑换 <span>🎁</span></h1><p>登记实物兑换会立即从学习者积分中扣除；撤销待处理记录会自动退回积分。</p></div><button id="reloadRedemptions" class="quiet-button" type="button">↻ 刷新</button></div><div id="redemptionStatus" class="connection-status">正在读取兑换记录…</div><section class="panel ops-panel"><h3>兑换处理</h3><p>核对孩子、实物和积分后登记，完成发货后将状态标记为已发放。</p>${canManage?`<form id="redemptionForm" class="redemption-form"><label>学习账号<select name="account_id" required><option value="">正在读取账号…</option></select></label><label>学习者<select name="learner_id" required disabled><option value="">请先选账号</option></select></label><label>实物名称<input name="item_name" required maxlength="160" placeholder="例如：绘本一册"></label><label>抵扣积分<input name="points" required type="number" min="1" max="1000000"></label><label>备注<input name="note" maxlength="500" placeholder="领取方式或备注"></label><button type="submit">登记兑换并扣除积分</button><div id="redemptionFormStatus" role="status"></div></form>`:'<div class="ops-message">当前账号仅有查看权限。</div>'}<div class="ops-toolbar"><span id="redemptionCount" class="ops-message"></span><input id="redemptionSearch" class="ops-search" type="search" placeholder="搜索账号、学习者或物品"><select id="redemptionFilter" aria-label="按状态筛选"><option value="all">全部状态</option><option value="pending">待处理</option><option value="fulfilled">已发放</option><option value="cancelled">已撤销</option></select></div><div class="table-wrap"><table class="ops-table"><thead><tr><th>登记时间</th><th>学习账号 / 学习者</th><th>兑换物品</th><th>积分</th><th>状态</th><th>备注</th><th>操作</th></tr></thead><tbody id="redemptionRows"><tr><td colspan="7" class="loading-cell">正在读取兑换记录…</td></tr></tbody></table></div></section>`;
    main.insertBefore(section,library);
  }
  if (!$('#view-audit')) {
    const section=document.createElement('section'); section.id='view-audit'; section.className='page';
    section.innerHTML=`<div class="page-heading"><div><div class="date-kicker">ADMIN AUDIT · MYSQL</div><h1>操作日志 <span>≋</span></h1><p>记录管理员的账号、积分和实物兑换操作，便于核对操作者、对象与原因。</p></div><button id="reloadAudit" class="quiet-button" type="button">↻ 刷新</button></div><div id="auditStatus" class="connection-status">正在读取操作日志…</div><section class="panel ops-panel"><div class="ops-toolbar"><h3>最近操作</h3><input id="auditSearch" class="ops-search" type="search" placeholder="搜索操作人、动作或详情"></div><div class="table-wrap"><table class="ops-table"><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>记录</th></tr></thead><tbody id="auditRows"><tr><td colspan="5" class="loading-cell">正在读取操作日志…</td></tr></tbody></table></div><div class="ops-message">显示最近 300 条管理员操作。</div></section>`;
    main.insertBefore(section,library);
  }
  async function request(path,options={}) {
    const response=await fetch(`${API}${path}`,{headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},...options});
    const result=await response.json(); if(!response.ok)throw new Error(result.error||'暂时无法读取管理数据'); return result;
  }
  let accounts=[],redemptions=[],audit=[];
  const accountSelect=$('#redemptionForm select[name="account_id"]');
  const learnerSelect=$('#redemptionForm select[name="learner_id"]');
  async function loadAccounts(){
    if(!accountSelect)return;
    try{accounts=(await request('/admin/accounts')).filter(a=>a.account_type==='parent'&&a.status==='active');accountSelect.innerHTML='<option value="">请选择学习账号</option>'+accounts.map(a=>`<option value="${a.id}">${escape(a.display_name||a.username)}（${escape(a.username)}）</option>`).join('');}
    catch(error){accountSelect.innerHTML=`<option value="">${escape(error.message)}</option>`;}
  }
  accountSelect?.addEventListener('change',async()=>{
    const id=Number(accountSelect.value); learnerSelect.disabled=true; learnerSelect.innerHTML='<option value="">正在读取学习者…</option>'; if(!id){learnerSelect.innerHTML='<option value="">请先选账号</option>';return;}
    try{const learners=await request(`/admin/accounts/${id}/learners`);learnerSelect.innerHTML=learners.map(learner=>`<option value="${learner.id}">${escape(learner.child_name)} · ${Number(learner.points)} 分</option>`).join('')||'<option value="">该账号没有学习者</option>';learnerSelect.disabled=!learners.length;}
    catch(error){learnerSelect.innerHTML=`<option value="">${escape(error.message)}</option>`;}
  });
  function renderRedemptions(){
    const filter=$('#redemptionFilter').value; const query=$('#redemptionSearch').value.trim().toLocaleLowerCase(); const rows=redemptions.filter(row=>(filter==='all'||row.status===filter)&&(!query||`${row.username} ${row.child_name} ${row.item_name} ${row.note}`.toLocaleLowerCase().includes(query))); $('#redemptionCount').textContent=`显示 ${rows.length} / ${redemptions.length} 条兑换记录`;
    const labels={pending:'待处理',fulfilled:'已发放',cancelled:'已撤销'};
    $('#redemptionRows').innerHTML=rows.map(row=>`<tr><td>${escape(date(row.created_at))}</td><td>${escape(row.child_name)}<small>${escape(row.username)}</small></td><td>${escape(row.item_name)}</td><td>${Number(row.points)} 分</td><td><span class="status-pill ${row.status==='pending'?'pending':''}">${labels[row.status]||escape(row.status)}</span></td><td class="ops-detail">${escape(row.note||'—')}</td><td>${canManage&&row.status==='pending'?`<button class="ops-action" data-fulfill="${row.id}">已发放</button><button class="ops-action danger" data-cancel="${row.id}">撤销并退分</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="loading-cell">没有符合条件的兑换记录。</td></tr>';
    $('#redemptionRows').querySelectorAll('[data-fulfill]').forEach(button=>button.addEventListener('click',()=>updateRedemption(Number(button.dataset.fulfill),'fulfilled')));
    $('#redemptionRows').querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',()=>updateRedemption(Number(button.dataset.cancel),'cancelled')));
  }
  async function loadRedemptions(){
    try{redemptions=await request('/admin/redemptions');renderRedemptions();$('#redemptionStatus').textContent=`已读取 ${redemptions.length} 条兑换记录`;$ ('#redemptionStatus').className='connection-status connected';}
    catch(error){$('#redemptionStatus').textContent=error.message;$('#redemptionStatus').className='connection-status error';}
  }
  async function updateRedemption(id,status){
    const row=redemptions.find(item=>Number(item.id)===id);if(!row)return;
    const message=status==='cancelled'?`撤销“${row.item_name}”并退回 ${row.points} 积分？`:`确认“${row.item_name}”已发放？`;
    if(!window.confirm(message))return;
    try{await request(`/admin/redemptions/${id}`,{method:'PUT',body:JSON.stringify({status})});await loadRedemptions();await loadAudit();}
    catch(error){$('#redemptionStatus').textContent=error.message;$('#redemptionStatus').className='connection-status error';}
  }
  $('#redemptionForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;const status=$('#redemptionFormStatus');const values=Object.fromEntries(new FormData(form));
    const learner=learnerSelect.selectedOptions[0]?.textContent||'学习者';
    if(!window.confirm(`为 ${learner} 登记“${values.item_name}”，扣除 ${values.points} 积分？`))return;
    try{const result=await request('/admin/redemptions',{method:'POST',body:JSON.stringify({...values,account_id:Number(values.account_id),learner_id:Number(values.learner_id),points:Number(values.points)})});status.textContent=`兑换已登记，剩余 ${result.points} 积分`;form.elements.item_name.value='';form.elements.points.value='';form.elements.note.value='';await loadRedemptions();await loadAudit();}
    catch(error){status.textContent=error.message;status.style.color='#af5146';}
  });
  function renderAudit(){
    const q=$('#auditSearch').value.trim().toLocaleLowerCase();const rows=audit.filter(row=>`${row.actor_name} ${row.action} ${row.target_type} ${row.target_id} ${row.detail}`.toLocaleLowerCase().includes(q));
    $('#auditRows').innerHTML=rows.map(row=>`<tr><td>${escape(date(row.created_at))}</td><td>${escape(row.actor_name)}</td><td>${escape(row.action)}</td><td>${escape(row.target_type)} · ${escape(row.target_id)}</td><td class="ops-detail">${escape(row.detail)}</td></tr>`).join('')||'<tr><td colspan="5" class="loading-cell">没有找到操作记录。</td></tr>';
  }
  async function loadAudit(){
    try{audit=await request('/admin/audit-logs');renderAudit();$('#auditStatus').textContent=`已读取 ${audit.length} 条操作记录`;$('#auditStatus').className='connection-status connected';}
    catch(error){$('#auditStatus').textContent=error.message;$('#auditStatus').className='connection-status error';}
  }
  $('#redemptionFilter').addEventListener('change',renderRedemptions);$('#redemptionSearch').addEventListener('input',renderRedemptions);$('#auditSearch').addEventListener('input',renderAudit);
  $('#reloadRedemptions').addEventListener('click',loadRedemptions);$('#reloadAudit').addEventListener('click',loadAudit);
  loadAccounts();loadRedemptions();loadAudit();
})();
