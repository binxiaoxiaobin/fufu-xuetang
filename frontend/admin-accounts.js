(() => {
  const $ = selector => document.querySelector(selector);
  const API = `${window.FUFU_API_BASE || ''}/api`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const canViewSupport=window.FUFU_ADMIN_ACCOUNT?.role==='superadmin';
  const money=v=>'¥'+(Number(v||0)/100).toFixed(2);
  const supportLabel=a=>!a.support?.total_fen&&!a.sharing?.count?'尚未开通':a.participation?.active&&a.status==='active'?'资格有效':'资格已失效';
  const typeNames = {parent:'学习账号',admin:'管理员账号'};
  const roleNames = {superadmin:'超级管理员',content_admin:'内容管理员',learner_manager:'学习者管理员',viewer:'只读查看',parent:'家长'};
  const style = document.createElement('style');
  style.textContent = `
    .account-list-panel,.account-detail-panel{padding:18px}
    .account-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0}
    .account-toolbar input{width:min(340px,100%);height:36px;padding:0 11px;border:1px solid #e5e9e1;border-radius:8px;background:#fff;font:12px inherit;color:#3f5042}
    .account-count{color:#8c998f;font-size:11px;white-space:nowrap}
    .account-table{min-width:590px}
    .account-table tbody tr{cursor:pointer;transition:background .15s}
    .account-table tbody tr:hover{background:#f7faf5}
    .account-table .account-name b,.account-table .account-name small{display:block}
    .account-table .account-name small{margin-top:4px;color:#929e96;font-size:10px}
    .account-open{border:1px solid #e0e9dc;border-radius:7px;padding:7px 10px;background:#fff;color:#4e765b;font:600 11px inherit;cursor:pointer}
    .account-open:hover,.account-back:hover{border-color:#a9c5a9;background:#f6faf4}
    .account-detail-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .account-back{min-height:34px;padding:0 11px;border:1px solid #e0e9dc;border-radius:8px;background:#fff;color:#537960;font:600 11px inherit;cursor:pointer}
    .account-detail-title{min-width:0;flex:1}
    .account-detail-title h2{margin:0;color:#304439;font-size:18px}
    .account-detail-title p{margin:5px 0 0;color:#8c998f;font-size:11px;overflow-wrap:anywhere}
    .account-info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:22px}
    .account-info-item{padding:12px;border:1px solid #e8ece5;border-radius:9px;background:#fbfcf9}
    .account-info-item small,.account-info-item b{display:block}
    .account-info-item small{margin-bottom:5px;color:#96a198;font-size:10px}
    .account-info-item b{color:#45564a;font-size:12px;overflow-wrap:anywhere}
    .learner-section-title{display:flex;align-items:center;justify-content:space-between;margin:0 0 11px}
    .learner-section-title h3{margin:0;color:#3e5141;font-size:13px}
    .learner-section-title span{color:#8c998f;font-size:10px}
    .learner-profile-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
    .learner-profile-card{padding:15px;border:1px solid #e5ebe1;border-radius:11px;background:linear-gradient(135deg,#fff,#f9fbf6)}
    .learner-profile-card header{display:flex;align-items:center;gap:10px;padding-bottom:11px;border-bottom:1px solid #edf0e9}
    .learner-profile-avatar{width:36px;height:36px;display:grid;place-items:center;flex:none;border-radius:11px;background:#eaf4ed;color:#5c9a76;font-size:18px}
    .learner-profile-card header b,.learner-profile-card header small{display:block}
    .learner-profile-card header b{color:#35483a;font-size:13px}
    .learner-profile-card header small{margin-top:3px;color:#909c93;font-size:10px}
    .learner-profile-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;padding-top:12px}
    .learner-profile-fields span{color:#929e96;font-size:10px}
    .learner-profile-fields b{display:block;margin-top:3px;color:#536257;font-size:11px}
    .account-empty{padding:26px 12px;border:1px dashed #dfe7dc;border-radius:10px;color:#8c998f;text-align:center;font-size:12px}
    .account-toolbar{flex-wrap:wrap}
    .account-create{width:100%;border:1px solid #e7ece4;border-radius:10px;background:#fbfcf9}
    .account-create summary{padding:11px 13px;color:#4e765b;font-weight:700;font-size:11px;cursor:pointer;list-style:none}
    .account-create summary::-webkit-details-marker{display:none}
    .account-create-form,.account-edit-form,.points-adjust-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:12px;border-top:1px solid #e9eee6}
    .account-create-form label,.account-edit-form label,.points-adjust-form label{display:grid;gap:5px;color:#78867b;font-size:10px}
    .account-create-form input,.account-create-form select,.account-edit-form input,.account-edit-form select,.points-adjust-form input,.points-adjust-form select{min-width:0;height:36px;padding:0 9px;border:1px solid #e2e9df;border-radius:7px;background:#fff;color:#3f5042;font:11px inherit}
    .account-create-form button,.account-edit-form button,.points-adjust-form button{min-height:36px;border:0;border-radius:7px;background:#4e8068;color:#fff;font:600 10px inherit;cursor:pointer}
    .account-create-form [role=status],.account-edit-form [role=status],.points-adjust-form [role=status]{grid-column:1/-1;min-height:13px;color:#657b69;font-size:10px}
    .account-action{min-height:32px;padding:0 10px;border:1px solid #e0e9dc;border-radius:8px;background:#fff;color:#537960;font:600 10px inherit;cursor:pointer}
    .account-action.danger{color:#a95447;border-color:#f0dfda}
    .account-detail-actions{display:flex;gap:7px;margin-left:auto}
    .learner-learning-data{margin-top:13px;padding-top:10px;border-top:1px solid #edf0e9}
    .learner-learning-data summary{color:#58715c;font-size:10px;font-weight:700;cursor:pointer}
    .learner-learning-data table{width:100%;margin-top:8px;border-collapse:collapse;font-size:9px}
    .learner-learning-data th,.learner-learning-data td{padding:6px 5px;border-bottom:1px solid #eff2ed;text-align:left}
    .points-adjust-form{grid-template-columns:1fr 1fr 1.4fr auto;align-items:end;margin-top:9px;padding:10px 0 0;border-top:1px solid #edf0e9}
    .points-adjust-form button{padding:0 12px}
    .learner-account-status{grid-column:1/-1;min-height:13px;color:#657b69;font-size:10px}
    .community-adjustments{grid-column:1/-1;margin:4px 0 16px;padding:15px;border:1px solid #dce8d6;border-radius:12px;background:#f8fbf6}
    .community-adjustments h3{margin:0 0 6px;color:#405d47;font-size:13px}.community-adjustments>p{margin:0 0 12px;color:#869287;font-size:10px;line-height:1.7}
    .community-adjustment-forms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .community-adjustment-form{display:grid;gap:8px;padding:12px;border:1px solid #e4ebe0;border-radius:9px;background:#fff}
    .community-adjustment-form b{font-size:11px;color:#4e6852}.community-adjustment-form label{display:grid;gap:5px;color:#78867b;font-size:10px}
    .community-adjustment-form input,.community-adjustment-form select{min-width:0;height:34px;padding:0 8px;border:1px solid #e2e9df;border-radius:7px;background:#fff;color:#3f5042;font:11px inherit}
    .community-adjustment-form button{height:34px;border:0;border-radius:7px;background:#4e8068;color:white;font:600 10px inherit;cursor:pointer}
    .community-adjustment-form [role=status]{min-height:14px;color:#657b69;font-size:10px}.community-adjustment-history{margin-top:12px;border-top:1px solid #e7eee2;padding-top:9px}
    .community-adjustment-history summary{font-size:10px;color:#58715c;cursor:pointer}.community-adjustment-history li{margin:7px 0;color:#6d7b70;font-size:10px;overflow-wrap:anywhere}
    @media(max-width:650px){.account-toolbar{align-items:stretch;flex-direction:column}.account-toolbar input{width:100%}.account-info-grid,.learner-profile-list,.community-adjustment-forms{grid-template-columns:1fr}.account-list-panel,.account-detail-panel{padding:12px}.account-detail-head{align-items:flex-start;flex-wrap:wrap}.account-back{flex:none}.account-detail-actions{margin-left:0}.account-create-form,.account-edit-form,.points-adjust-form{grid-template-columns:1fr}.account-create-form [role=status],.account-edit-form [role=status],.points-adjust-form [role=status]{grid-column:auto}}
  `;
  document.head.append(style);

  const navs = document.querySelectorAll('.side-nav');
  if (navs[1] && !document.querySelector('[data-view="accounts"]')) {
    const button = document.createElement('button');
    button.className = 'side-link';
    button.dataset.view = 'accounts';
    button.innerHTML = '<span>👪</span>账号管理';
    navs[1].insertBefore(button, navs[1].querySelector('[data-view="learners"]'));
  }

  let section = $('#view-accounts');
  if (!section) {
    section = document.createElement('section');
    section.className = 'page';
    section.id = 'view-accounts';
    section.innerHTML = `
      <div class="page-heading"><div><div class="date-kicker">ACCOUNT MANAGEMENT · MYSQL</div><h1>账号管理 <span>👪</span></h1><p>查看账号列表，点开账号即可查看关联的学习者档案。</p></div><button id="reloadAccounts" class="quiet-button" type="button">↻ 刷新</button></div>
      <div id="accountStatus" class="connection-status">正在读取账号…</div>
      <section id="accountListView" class="panel account-list-panel">
        <div class="panel-title"><div><h3>账号列表</h3><p>选择账号查看档案${canViewSupport?'及支持记录；有效金额已扣除退款，待支付不计入':''}</p></div></div>
        <div class="account-toolbar"><input id="accountSearch" type="search" placeholder="搜索账号名称、用户名或社区昵称" aria-label="搜索账号"><span id="accountCount" class="account-count"></span><details class="account-create"><summary>＋ 创建学习账号</summary><form id="createParentAccount" class="account-create-form"><label>登录用户名<input name="username" required minlength="3" maxlength="40" pattern="[A-Za-z0-9_.-]+" autocomplete="off"></label><label>初始密码<input name="password" type="password" required minlength="10" maxlength="200" autocomplete="new-password"></label><label>学习者昵称<input name="child_name" required maxlength="20"></label><label>学习阶段<select name="learning_stage"><option>未设置</option><option>幼儿园</option><option>小学</option></select></label><label>年级<input name="grade" maxlength="40" placeholder="例如：二年级"></label><button type="submit">创建学习账号</button><div id="createAccountStatus" role="status"></div></form></details></div>
        <div class="table-wrap"><table class="account-table"><thead><tr><th>账号</th><th>账号类型</th><th>学习者</th><th>状态</th>${canViewSupport?'<th>有效支持金额</th><th>支持次数</th><th>成功邀请</th><th>共创资格</th>':''}<th></th></tr></thead><tbody id="accountRows"><tr><td colspan="${canViewSupport?9:5}" class="loading-cell">正在读取账号…</td></tr></tbody></table></div>
      </section>
      <section id="accountDetailView" class="panel account-detail-panel" hidden>
        <div class="account-detail-head"><button id="backToAccounts" class="account-back" type="button">← 返回列表</button><div class="account-detail-title"><h2 id="detailAccountName"></h2><p id="detailAccountUsername"></p></div><div class="account-detail-actions"><button id="toggleAccountStatus" class="account-action danger" type="button"></button></div></div>
        <div id="detailAccountInfo" class="account-info-grid"></div>
        <form id="accountEditForm" class="account-edit-form"><label>显示名称<input id="editAccountDisplayName" maxlength="80"></label><label id="editRoleLabel">管理员角色<select id="editAccountRole"><option value="content_admin">内容管理员</option><option value="learner_manager">学习者管理员</option><option value="viewer">只读查看</option><option value="superadmin">超级管理员</option></select></label><label>重置密码（可留空）<input id="editAccountPassword" type="password" minlength="10" maxlength="200" autocomplete="new-password" placeholder="至少 10 位"></label><button type="submit">保存账号信息</button><div id="accountEditStatus" role="status"></div></form>
        <div class="learner-section-title"><h3>学习者档案</h3><span id="detailLearnerCount"></span></div>
        <div id="accountLearners" class="learner-profile-list"><div class="account-empty">正在读取学习者档案…</div></div>
      </section>`;
    document.querySelector('.main').insertBefore(section, $('#view-library'));
  }

  document.querySelector('[data-view="accounts"]')?.addEventListener('click', () => window.showAdminView?.('accounts'));
  const canManage = ['superadmin','learner_manager'].includes(window.FUFU_ADMIN_ACCOUNT?.role);
  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})}, ...options});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '暂时无法读取账号');
    return result;
  }

  let accounts = [];
  $('.account-create').hidden = !canManage;
  function setStatus(message, error = false) {
    $('#accountStatus').textContent = message;
    $('#accountStatus').className = `connection-status ${error ? 'error' : 'connected'}`;
  }
  function visibleAccounts() {
    const query = $('#accountSearch').value.trim().toLocaleLowerCase();
    return accounts.filter(account => !query || `${account.display_name || ''} ${account.username || ''} ${account.support?.nickname || ''}`.toLocaleLowerCase().includes(query));
  }
  function renderAccounts() {
    const filtered = visibleAccounts();
    $('#accountCount').textContent = `显示 ${filtered.length} / ${accounts.length} 个账号`;
    $('#accountRows').innerHTML = filtered.map(account => `
      <tr data-account-row="${account.id}">
        <td class="account-name"><b>${escape(account.display_name || account.username)}</b><small>${escape(account.username)}</small></td>
        <td>${escape(typeNames[account.account_type] || '账号')}</td>
        <td>${Number(account.learner_count || 0)} 位</td>
        <td><span class="status-pill ${account.status === 'active' ? '' : 'pending'}">${account.status === 'active' ? '启用' : '停用'}</span></td>
        ${canViewSupport?`<td>${account.account_type==='parent'?money(account.support?.total_fen):'—'}</td><td>${account.account_type==='parent'?Number(account.support?.paid_count||0)+' 次':'—'}</td><td>${account.account_type==='parent'?Number(account.sharing?.count||0)+' 人':'—'}</td><td>${account.account_type==='parent'?supportLabel(account):'—'}</td>`:''}
        <td><button type="button" class="account-open" data-open-account="${account.id}">查看详情 →</button></td>
      </tr>`).join('') || `<tr><td colspan="${canViewSupport?9:5}" class="loading-cell">没有找到账号。</td></tr>`;
    $('#accountRows').querySelectorAll('[data-open-account]').forEach(button => button.addEventListener('click', () => openAccount(Number(button.dataset.openAccount))));
    $('#accountRows').querySelectorAll('[data-account-row]').forEach(row => row.addEventListener('click', event => {
      if (!event.target.closest('button')) openAccount(Number(row.dataset.accountRow));
    }));
  }
  function formatCreatedAt(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', {hour12:false});
  }
  async function learnerCard(learner, accountId) {
    const detail = await request(`/admin/accounts/${accountId}/learners/${learner.id}`);
    const recent = (detail.recent || []).map(row => `<tr><td>${escape(row.subject)}</td><td>${escape(row.title)}</td><td>${row.correct ? '答对' : '答错'}</td><td>${escape(formatCreatedAt(row.created_at))}</td></tr>`).join('');
    const ledger = (detail.ledger || []).map(row => `<tr><td>${escape(row.kind)}</td><td>${Number(row.amount) > 0 ? '+' : ''}${Number(row.amount)}</td><td>${escape(row.description || '')}</td><td>${escape(formatCreatedAt(row.created_at))}</td></tr>`).join('');
    return `<article class="learner-profile-card">
      <header><span class="learner-profile-avatar">♙</span><span><b>${escape(learner.child_name || '未命名学习者')}</b><small>${escape(learner.learning_stage || '阶段未设置')} · ${escape(learner.grade || '年级未设置')}</small></span></header>
      <div class="learner-profile-fields">
        <div><span>学习阶段</span><b>${escape(learner.learning_stage || '未设置')}</b></div>
        <div><span>年级</span><b>${escape(learner.grade || '未设置')}</b></div>
        <div><span>当前积分</span><b>${Number(learner.points || 0)} 分</b></div>
        <div><span>宠物</span><b>${escape(learner.pet_name || '团团')}</b></div>
      </div>
      <div class="learner-learning-data"><b>学习记录：${Number(detail.summary?.attempts || 0)} 次 · 正确 ${Number(detail.summary?.correct || 0)} 次</b><p>宠物饥饿 ${Number(detail.pet?.hunger || 0)} · 心情 ${Number(detail.pet?.happiness || 0)}</p>
        <details><summary>最近答题与积分流水</summary><table><thead><tr><th>科目</th><th>题目</th><th>结果</th><th>时间</th></tr></thead><tbody>${recent || '<tr><td colspan="4">暂无答题记录</td></tr>'}</tbody></table><table><thead><tr><th>类型</th><th>变动</th><th>说明</th><th>时间</th></tr></thead><tbody>${ledger || '<tr><td colspan="4">暂无积分流水</td></tr>'}</tbody></table></details>
      </div>
      ${canManage ? `<form class="points-adjust-form" data-learner-id="${learner.id}"><label>操作<select name="direction"><option value="add">增加积分</option><option value="deduct">扣除积分</option></select></label><label>数量<input name="amount" type="number" min="1" max="1000000" required></label><label>原因<input name="reason" required maxlength="200" placeholder="例如：兑换文具抵扣"></label><button type="submit">确认调整</button><div class="learner-account-status" role="status"></div></form>` : ''}
    </article>`;
  }
  async function openAccount(accountId) {
    const account = accounts.find(item => Number(item.id) === accountId);
    if (!account) return;
    $('#accountListView').hidden = true;
    $('#accountDetailView').hidden = false;
    $('#detailAccountName').textContent = account.display_name || account.username;
    $('#detailAccountUsername').textContent = `用户名：${account.username}`;
    $('#detailAccountInfo').innerHTML = `
      <div class="account-info-item"><small>账号类型</small><b>${escape(typeNames[account.account_type] || '账号')}</b></div>
      <div class="account-info-item"><small>账号状态</small><b>${account.status === 'active' ? '启用' : '停用'}</b></div>
      <div class="account-info-item"><small>管理员角色</small><b>${escape(roleNames[account.role] || account.role || '—')}</b></div>
      <div class="account-info-item"><small>关联学习者</small><b>${Number(account.learner_count || 0)} 位</b></div>
      <div class="account-info-item"><small>创建时间</small><b>${escape(formatCreatedAt(account.created_at))}</b></div>`;
    $('#communityAdjustments')?.remove();
    if(canViewSupport&&account.account_type==='parent'){
      const support=account.support||{};
      const fields=[['社区昵称',support.nickname||'尚未设置'],['累计到账',money(support.received_fen)],['已退款金额',money(support.refunded_fen)],['金额调整',money(support.adjustment_fen)],['调整后金额',money(support.total_fen)],['有效支持次数',Number(support.paid_count||0)+' 次'],['成功邀请',Number(account.sharing?.count||0)+' 人'],['共创资格',supportLabel(account)],['最近到账时间',formatCreatedAt(support.last_paid_at)],['资格有效期',formatCreatedAt(account.participation?.expires_at)]];
      $('#detailAccountInfo').insertAdjacentHTML('beforeend',fields.map(([label,value])=>`<div class="account-info-item"><small>${label}</small><b>${escape(value)}</b></div>`).join(''));
      $('#detailAccountInfo').insertAdjacentHTML('afterend',`<section class="community-adjustments" id="communityAdjustments"><h3>共创数据调整</h3><p>仅用于修正展示数据，填写原因后写入操作日志。金额调整不会改写原支付流水或延长支持资格；邀请人数调整会记录有效期。</p><div class="community-adjustment-forms">
        <form class="community-adjustment-form" data-community-adjust="donation"><b>支持金额修正</b><label>操作<select name="direction"><option value="add">增加金额</option><option value="deduct">扣减金额</option></select></label><label>金额（元）<input name="amount" type="number" min="0.01" max="10000" step="0.01" required></label><label>调整原因<input name="reason" required minlength="2" maxlength="300" placeholder="例如：修正人工登记金额"></label><button type="submit">保存金额调整</button><div role="status"></div></form>
        <form class="community-adjustment-form" data-community-adjust="sharing"><b>成功邀请人数修正</b><label>操作<select name="direction"><option value="add">增加人数</option><option value="deduct">扣减人数</option></select></label><label>人数<input name="amount" type="number" min="1" max="100" step="1" required></label><label>调整原因<input name="reason" required minlength="2" maxlength="300" placeholder="例如：核对分享邀请记录"></label><button type="submit">保存人数调整</button><div role="status"></div></form>
      </div><details class="community-adjustment-history"><summary>查看调整记录</summary><ol id="communityAdjustmentHistory"><li>正在读取…</li></ol></details></section>`);
      const panel=$('#communityAdjustments');
      const loadAdjustments=async()=>{try{const history=await request(`/admin/community/accounts/${account.id}/adjustments`);$('#communityAdjustmentHistory').innerHTML=history.items.map(row=>`<li>${escape(formatCreatedAt(row.created_at))} · ${row.kind==='donation'?'金额':'分享人数'} ${Number(row.delta)>0?'+':''}${row.kind==='donation'?money(Math.abs(Number(row.delta))):Number(row.delta)+'人'} · ${escape(row.reason)} · ${escape(row.actor||'管理员')}</li>`).join('')||'<li>暂无调整记录</li>';}catch(error){$('#communityAdjustmentHistory').innerHTML=`<li>${escape(error.message)}</li>`;}};
      panel.querySelectorAll('form').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const status=form.querySelector('[role=status]'),data=new FormData(form),kind=form.dataset.communityAdjust,raw=Number(data.get('amount'));const delta=(data.get('direction')==='deduct'?-1:1)*(kind==='donation'?Math.round(raw*100):raw);const button=form.querySelector('button');button.disabled=true;try{await request(`/admin/community/accounts/${account.id}/adjustments`,{method:'POST',body:JSON.stringify({kind,delta,reason:data.get('reason')})});await load({keepDetail:account.id});setStatus('调整已保存，明细已写入操作日志。');}catch(error){status.textContent=error.message;}finally{button.disabled=false;}}));
      void loadAdjustments();
    }
    $('#detailLearnerCount').textContent = `${Number(account.learner_count || 0)} 位`;
    $('#accountDetailView').dataset.accountId = account.id;
    const canManageTarget = canManage && (account.account_type !== 'admin' || window.FUFU_ADMIN_ACCOUNT?.role === 'superadmin');
    $('#accountEditForm').hidden = !canManageTarget;
    $('#editAccountDisplayName').value = account.display_name || '';
    $('#editRoleLabel').hidden = account.account_type !== 'admin' || window.FUFU_ADMIN_ACCOUNT?.role !== 'superadmin';
    $('#editAccountRole').value = account.role || 'viewer';
    $('#editAccountPassword').value = '';
    $('#accountEditStatus').textContent = '';
    const toggle = $('#toggleAccountStatus');
    const isSelf = Number(window.FUFU_ADMIN_ACCOUNT?.id) === Number(account.id);
    const activeSupers = accounts.filter(row => row.account_type === 'admin' && row.role === 'superadmin' && row.status === 'active').length;
    toggle.hidden = !canManageTarget || isSelf || (account.role === 'superadmin' && activeSupers <= 1 && account.status === 'active');
    toggle.textContent = account.status === 'active' ? '停用账号' : '启用账号';
    toggle.dataset.accountId = account.id;
    $('#accountLearners').innerHTML = '<div class="account-empty">正在读取学习者档案…</div>';
    if (account.account_type !== 'parent') {
      $('#accountLearners').innerHTML = '<div class="account-empty">该管理员账号没有关联学习者档案。</div>';
      return;
    }
    try {
      const learners = await request(`/admin/accounts/${account.id}/learners`);
      const cards = await Promise.all(learners.map(learner => learnerCard(learner, account.id)));
      $('#accountLearners').innerHTML = cards.join('') || '<div class="account-empty">该账号还没有学习者档案。</div>';
      $('#accountLearners').querySelectorAll('.points-adjust-form').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault(); const status = form.querySelector('[role="status"]'); const data = new FormData(form);
        try { const result = await request(`/admin/accounts/${account.id}/points`, {method:'POST',body:JSON.stringify({learner_id:Number(form.dataset.learnerId),direction:data.get('direction'),amount:Number(data.get('amount')),reason:data.get('reason')})}); await load({keepDetail:account.id}); setStatus(`积分调整已保存，当前余额 ${result.points} 分`); }
        catch(error) { status.textContent = error.message; status.style.color = '#af5146'; }
      }));
    } catch (error) {
      $('#accountLearners').innerHTML = `<div class="account-empty">${escape(error.message)}</div>`;
    }
  }
  async function load(options = {}) {
    try {
      accounts = await request('/admin/accounts');
      renderAccounts();
      if (options.keepDetail) await openAccount(options.keepDetail);
      else { $('#accountListView').hidden = false; $('#accountDetailView').hidden = true; }
      setStatus(`已读取 ${accounts.length} 个账号`);
    } catch (error) {
      setStatus(error.message, true);
      $('#accountRows').innerHTML = `<tr><td colspan="${canViewSupport?9:5}" class="loading-cell">${escape(error.message)}</td></tr>`;
    }
  }
  $('#accountSearch').addEventListener('input', renderAccounts);
  $('#reloadAccounts').addEventListener('click', load);
  $('#backToAccounts').addEventListener('click', () => {
    $('#accountDetailView').hidden = true;
    $('#accountListView').hidden = false;
  });
  $('#createParentAccount').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const status = $('#createAccountStatus'); const values = Object.fromEntries(new FormData(form));
    try { await request('/admin/accounts', {method:'POST',body:JSON.stringify(values)}); form.reset(); status.textContent='账号已创建'; await load(); }
    catch(error) { status.textContent=error.message; status.style.color='#af5146'; }
  });
  $('#accountEditForm').addEventListener('submit', async event => {
    event.preventDefault(); const id=$('#accountDetailView').dataset.accountId; const account=accounts.find(row=>Number(row.id)===Number(id)); const password=$('#editAccountPassword').value; const values={display_name:$('#editAccountDisplayName').value}; if(account?.account_type==='admin'&&window.FUFU_ADMIN_ACCOUNT?.role==='superadmin')values.role=$('#editAccountRole').value; if(password)values.password=password;
    try { await request(`/admin/accounts/${id}`,{method:'PUT',body:JSON.stringify(values)}); await load({keepDetail:Number(id)}); $('#accountEditStatus').textContent='账号信息已保存'; }
    catch(error) { $('#accountEditStatus').textContent=error.message; $('#accountEditStatus').style.color='#af5146'; }
  });
  $('#toggleAccountStatus').addEventListener('click', async event => {
    const id=Number(event.currentTarget.dataset.accountId); const row=accounts.find(account=>Number(account.id)===id); if(!row)return;
    const status=row.status==='active'?'disabled':'active'; if(!window.confirm(`${status==='disabled'?'停用':'启用'}账号 ${row.username}？`))return;
    try { await request(`/admin/accounts/${id}`,{method:'PUT',body:JSON.stringify({status})}); await load({keepDetail:id}); }
    catch(error) { setStatus(error.message,true); }
  });
  window.FufuAccountsAdmin={onEnter:()=>load($('#accountDetailView').hidden?{}:{keepDetail:Number($('#accountDetailView').dataset.accountId)})};
  load();
})();
