(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const apiBase = `${window.FUFU_API_BASE || ''}/api`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const progress = {review:'待评估',planned:'已计划',building:'开发中',done:'已完成',declined:'暂不采纳'};
  const statuses = {pending:'待审核',published:'已公开',hidden:'未公开'};
  const orderStates = {pending:'待支付',paid:'已到账',cancelled:'已取消',refunded:'已退款'};
  let auth = null, me = null, kind = 'all', cursor = null, feedEpoch = 0, modalEpoch = 0, toastTimer;
  const inviteFromUrl=new URLSearchParams(location.search).get('ref')||'';
  let inviteCode='';
  try{if(/^[a-f0-9]{12}$/i.test(inviteFromUrl))localStorage.setItem('fufu-share-invite',JSON.stringify({code:inviteFromUrl.toUpperCase(),at:Date.now()}));const saved=JSON.parse(localStorage.getItem('fufu-share-invite')||'null');if(saved&&Date.now()-saved.at<14*86400000)inviteCode=saved.code;}catch{}
  const dialog = $('#cgDialog');
  async function request(path, body) {
    const response = await fetch(apiBase + path, {credentials:'same-origin',cache:'no-store',...(body !== undefined ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || '暂时无法连接，请稍后再试'); error.status = response.status; throw error; }
    return result;
  }
  function toast(message) { clearTimeout(toastTimer); $('#cgToast').textContent = message; $('#cgToast').hidden = false; toastTimer = setTimeout(() => $('#cgToast').hidden = true, 4500); }
  function date(value) { return esc(String(value || '').slice(0,10)); }
  function badge(b) { return b ? `<span class="cg-badge ${b.name==='\u5171\u521b\u5206\u4eab\u8005'?'sharing-mark':''} ${b.rank<=3 && b.rank ? `rank-${b.rank}` : b.rank ? 'rank-top' : ''}">${esc(b.icon)} ${esc(b.name)}</span>` : ''; }
  function author(a) { return `<div class="cg-author"><span class="cg-avatar" aria-hidden="true">${esc(a.avatar)}</span><b>${esc(a.nickname)}</b>${a.supporter && a.badge?.rank ? '<span class="cg-badge" title="有已确认的支持记录">🍬 支持者</span>' : ''}${badge(a.badge)}${badge(a.sharing_badge)}</div>`; }
  function empty(title, message, art='✿') { return `<div class="cg-empty"><div class="cg-empty-art">${art}</div><h3>${title}</h3><p>${message}</p></div>`; }
  function show(html) { modalEpoch++; $('#cgDialogContent').innerHTML = html; if (!dialog.open) dialog.showModal(); return modalEpoch; }
  dialog.querySelector('.cg-dialog-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { modalEpoch++; $('#cgDialogContent').replaceChildren(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close(); } });

  async function refreshMe() {
    auth = await request('/auth/status');
    me = auth.account?.account_type === 'parent' ? await request('/community/me') : null;
    $('#cgAccount').textContent = me ? '我的花园' : '登录 / 我的';
    if (!me) { $('#cgMe').innerHTML = '<p class="cg-muted">逛花园不用登录。登录后设置独立昵称，手机号不会公开。</p>'; return; }
    $('#cgMe').innerHTML = `<div class="cg-me-name"><span class="cg-avatar">${esc(me.profile.avatar)}</span><div><b>${esc(me.profile.nickname)}</b><br>${badge(me.identity.badge)}${badge(me.identity.sharing_badge)}</div></div><p class="cg-small">${me.profile.banned ? '社区发言已暂停' : me.participation.active ? `参与资格至 ${date(me.participation.expires_at)}` : '尚无有效发言资格，浏览始终免费'}</p><div class="cg-quota"><div>本月可发帖<br><strong>${me.participation.active ? me.post_remaining : 0}</strong> / 3</div><div>本月可评论<br><strong>${me.participation.active ? me.comment_remaining : 0}</strong> / 10</div></div>`;
  }
  async function loadBoard() {
    const data = await request('/community/board');
    $('#cgBoard').innerHTML = data.items.length ? data.items.map(row => `<div class="cg-board-row ${row.rank<=3 ? `podium podium-${row.rank}` : ''}"><strong>${row.rank<=3 ? ['👑','🥈','🥉'][row.rank-1] : row.rank}</strong><span class="cg-avatar">${esc(row.avatar)}</span><div><b>${esc(row.nickname)}</b>${badge({...row.badge,rank:row.rank})}</div><small>${row.amount_fen === null ? '暖心支持' : '¥'+(row.amount_fen/100).toFixed(2)}</small></div>`).join('') : empty('每一份心意，都值得感谢','还没有公开上榜的支持者。','♡');
  }
  async function loadFeed(more=false) {
    const epoch = ++feedEpoch;
    if (!more) { cursor=null; $('#cgFeed').innerHTML=empty('想法正在路上','正在读取花园动态…'); }
    $('#cgMore').disabled=true;
    try {
      const data=await request(`/community/posts?kind=${kind}${more && cursor ? '&before='+cursor : ''}`);
      if (epoch!==feedEpoch) return;
      const html=data.items.map(post => `<article class="cg-post">${author(post.author)}<button class="cg-post-title" data-post="${post.id}">${esc(post.title)}</button><p class="cg-post-excerpt">${esc(post.body)}</p><div class="cg-post-meta"><span><span class="cg-chip">${post.kind==='suggestion'?'小建议':'陪伴分享'}</span> ${post.kind==='suggestion'?`<span class="cg-chip progress-${post.progress}">${progress[post.progress]}</span>`:''}</span><span>${date(post.created_at)} · ${post.comment_count} 条评论</span></div></article>`).join('');
      if (more) $('#cgFeed').insertAdjacentHTML('beforeend',html); else $('#cgFeed').innerHTML=html || empty('花园刚刚开门','第一颗想法的种子，等你来种。所有内容审核后展示。');
      cursor=data.next; $('#cgMore').hidden=!cursor;
    } catch(error) { if(epoch===feedEpoch) { if(!more) $('#cgFeed').innerHTML=empty('花园暂时没有连接上',esc(error.message)); else toast(error.message); } }
    finally { if(epoch===feedEpoch) $('#cgMore').disabled=false; }
  }
  async function refreshPublic() {
    const results = await Promise.allSettled([request('/community/overview'),loadBoard(),loadFeed()]);
    if(results[0].status==='fulfilled') { const r=results[0].value; $('#cgStats').innerHTML=`<span><b>${r.supporters}</b>位暖心支持者</span><span><b>${r.posts}</b>篇建议与分享</span><span>每一步，都有回音</span>`; }
    else $('#cgStats').textContent='暂时无法读取统计，请稍后重试';
    if(results[1].status==='rejected') $('#cgBoard').innerHTML=empty('榜单暂未连接',esc(results[1].reason.message),'♡');
  }
  function formTask(form, task) {
    form.addEventListener('submit', async event => {
      event.preventDefault(); const generation=modalEpoch, button=form.querySelector('button[type=submit]'), message=form.querySelector('.cg-message');
      if(button.disabled) return; button.disabled=true; message.textContent='';
      try { await task(form,generation); } catch(error) { if(generation===modalEpoch) message.textContent=error.message; }
      finally { if(form.isConnected) button.disabled=false; }
    });
  }
  function login(register=false) {
    show(`<span class="cg-eyebrow">家长的交流空间</span><h2>${register?'注册家长学习账号':'欢迎回到共创花园'}</h2><p class="cg-muted">登录账号仅用于验证身份，社区显示独立昵称。</p>${auth?.account?.account_type==='admin'?'<p class="cg-message">当前为管理员账号。请先退出再登录家长账号。</p><button class="cg-btn" id="cgAdminLogout">退出管理员账号</button>':`<form id="cgLoginForm" class="cg-form"><label>登录账号 / 手机号<input name="username" required maxlength="80" autocomplete="username"></label><label>登录密码<input name="password" type="password" required ${register?'minlength="10"':''} maxlength="200" autocomplete="${register?'new-password':'current-password'}"></label>${register?'<label>再次输入密码<input name="confirm" type="password" required minlength="10" maxlength="200" autocomplete="new-password"></label><label>学习者昵称<input name="child" required maxlength="20" placeholder="不会自动成为社区昵称"></label><label>学习阶段<select name="stage"><option>幼儿园</option><option>小学</option></select></label><label>年级<select name="grade"></select></label><label class="cg-wide">朋友的分享码（选填）<input name="share_code" maxlength="12" pattern="[A-Fa-f0-9]{12}" placeholder="填写邀请人的12位分享码"></label>':''}<label class="cg-check"><input type="checkbox" required>我是家长，已阅读花园约定。发言请勿包含个人隐私。</label><p class="cg-message" role="status"></p><button type="submit" class="cg-btn">${register?'注册并进入花园':'登录'}</button></form><button id="cgLoginSwitch" class="cg-link-button">${register?'已有账号，去登录':'还没有账号？去注册'}</button>`}`);
    if($('#cgAdminLogout')) { $('#cgAdminLogout').onclick=async()=>{try{await request('/auth/logout',{});await refreshMe();login();}catch(e){toast(e.message);}}; return; }
    $('#cgLoginSwitch').onclick=()=>login(!register);
    const form=$('#cgLoginForm');
    if(register) { form.elements.share_code.value=inviteCode; const grades=()=>{const values=form.elements.stage.value==='小学'?['一年级','二年级','三年级','四年级','五年级','六年级']:['小班','中班','大班'];form.elements.grade.innerHTML=values.map(x=>`<option>${x}</option>`).join('');};form.elements.stage.onchange=grades;grades(); }
    formTask(form,async(f,generation)=>{
      if(register && f.elements.password.value!==f.elements.confirm.value) throw new Error('两次输入的密码不一致');
      await request(register?'/auth/register':'/auth/login',register?{username:f.elements.username.value.trim(),password:f.elements.password.value,password_confirm:f.elements.confirm.value,child_name:f.elements.child.value.trim(),learning_stage:f.elements.stage.value,grade:f.elements.grade.value,share_code:f.elements.share_code.value.trim()}:{username:f.elements.username.value.trim(),password:f.elements.password.value});
      if(register){inviteCode='';try{localStorage.removeItem('fufu-share-invite');}catch{}}
      if(register) await request('/auth/login',{username:f.elements.username.value.trim(),password:f.elements.password.value});
      await refreshMe();
      if(!me) throw new Error('请使用家长学习账号登录');
      if(generation===modalEpoch) { dialog.close(); toast('欢迎来到共创花园'); }
    });
  }
  async function shareGarden(){
    try{
      if(!await needParent())return;
      const code=me.sharing.code,link=new URL('/community.html',location.origin);link.searchParams.set('ref',code);
      show(`<span class="cg-eyebrow">🌱 分享学堂</span><h2>谢谢你帮学堂成长</h2><p class="cg-muted">邀请新朋友注册，即可获得分享徽章和发言资格。</p><div class="cg-share-card"><small>我的专属分享码</small><strong>${esc(code)}</strong><p>已邀请 <b>${me.sharing.count}</b> 位新用户注册${me.sharing.active?' · 资格至 '+date(me.sharing.expires_at):''}</p></div><label class="cg-small">分享链接<input id="cgShareLink" readonly value="${esc(link.href)}"></label><div class="cg-actions"><button id="cgCopyShare" class="cg-btn">复制分享链接</button><button id="cgCopyCode" class="cg-btn cg-btn-light">复制分享码</button><button id="cgNativeShare" class="cg-btn cg-btn-light">分享给朋友</button></div><p id="cgShareStatus" class="cg-message" role="status"></p><p class="cg-small">新注册账号才计入，每个账号仅计入一次。</p>`);
      const copy=async value=>{try{await navigator.clipboard.writeText(value);$('#cgShareStatus').textContent='已复制，发给朋友即可';}catch{$('#cgShareLink').value=value;$('#cgShareLink').select();$('#cgShareStatus').textContent='请长按或手动复制选中的内容';}};
      $('#cgCopyShare').onclick=()=>copy(link.href);$('#cgCopyCode').onclick=()=>copy(code);
      $('#cgNativeShare').onclick=async()=>{if(!navigator.share){await copy(link.href);return;}try{await navigator.share({title:'福福学堂 · 一起学习，一起共创',text:'邀请你来免费体验福福学堂',url:link.href});}catch(e){if(e.name!=='AbortError')$('#cgShareStatus').textContent='可以复制链接分享给朋友';}};
    }catch(e){toast(e.message);}
  }
  async function needParent() { await refreshMe(); if(!me){login();return false;}return true; }
  async function profileForm() {
    try {
      if(!await needParent()) return;
      const p=me.profile;
      show(`<span class="cg-eyebrow">公开昵称，私密登录</span><h2>我的花园名片</h2><p class="cg-muted">手机号继续用于登录，不会出现在帖子、评论或榜单。昵称属于家长账号，不影响孩子的学习昵称。</p><form id="cgProfileForm" class="cg-form"><label>社区昵称<input name="nickname" value="${esc(p.nickname)}" minlength="2" maxlength="24" required placeholder="例如：小鱼妈妈"></label><label>头像<select name="avatar">${me.avatars.map(a=>`<option ${a===p.avatar?'selected':''}>${a}</option>`).join('')}</select></label><label class="cg-check"><input type="checkbox" name="listed" ${p.listed?'checked':''}>自愿参加公开支持榜，同意展示昵称、头像和排名；关闭后不展示排名徽章。</label><label class="cg-check"><input type="checkbox" name="show_amount" ${p.show_amount?'checked':''}>在榜单公开累计支持金额（默认隐藏）</label><p class="cg-message" role="status"></p><button type="submit" class="cg-btn">保存名片</button></form><div class="cg-actions" style="margin-top:15px"><button id="cgMyOrders" class="cg-btn cg-btn-light">支持记录</button><button id="cgMyPosts" class="cg-btn cg-btn-light">我的投稿</button><button id="cgLogout" class="cg-link-button">退出账号</button></div>`);
      formTask($('#cgProfileForm'),async(f,generation)=>{await request('/community/profile',{nickname:f.elements.nickname.value.trim(),avatar:f.elements.avatar.value,listed:f.elements.listed.checked,show_amount:f.elements.show_amount.checked});await refreshMe();await loadBoard();await loadFeed();if(generation===modalEpoch){dialog.close();toast('名片已保存');}});
      $('#cgMyOrders').onclick=()=>orders();$('#cgMyPosts').onclick=()=>ownPosts();
      $('#cgLogout').onclick=async()=>{try{await request('/auth/logout',{});await refreshMe();dialog.close();toast('已退出账号');}catch(e){toast(e.message);}};
    } catch(error) { toast(error.message); }
  }
  async function ownPosts() {
    try { if(!await needParent())return;show(`<span class="cg-eyebrow">等待发芽的想法</span><h2>我的投稿</h2>${me.posts.length?me.posts.map(p=>`<div class="cg-order"><b>${esc(p.title)}</b><p>${statuses[p.moderation]} · ${date(p.created_at)}</p>${p.moderation==='published'?`<button class="cg-btn cg-btn-light" data-post="${p.id}">查看帖子</button>`:''}</div>`).join(''):empty('还没有投稿','写下一段使用体验，或一个具体建议吧。')}`); } catch(e){toast(e.message);}
  }
  async function orders() {
    try { if(!await needParent())return;const r=await request('/community/orders');show(`<span class="cg-eyebrow">每一份心意，都有记录</span><h2>我的支持记录</h2>${r.items.length?r.items.map(o=>`<div class="cg-order"><b>${o.tier==='candy'?'🍬 请团团吃颗糖吧':'🍰 请糖糖吃块蛋糕吧'}</b> · ¥${(o.amount_fen/100).toFixed(2)}<p>${orderStates[o.status]} · ${date(o.created_at)}${o.expires_at?'<br>该笔发言资格至 '+date(o.expires_at):''}</p><small>订单号：${esc(o.id)}</small>${o.status==='pending'?`<br><button class="cg-btn cg-btn-light" data-cancel-order="${o.id}">取消</button>`:''}</div>`).join(''):empty('暂时没有支持记录','感谢你的关注。','♡')}`); }catch(e){toast(e.message);}
  }
  async function compose() {
    try {
      if(!await needParent())return;
      if(!me.participation.active || me.profile.banned) { show(`<span class="cg-eyebrow">共创花园</span><h2>${me.profile.banned?'发言暂不可用':'您的建议对我很重要'}</h2><p class="cg-muted">${me.profile.banned?'请联系管理员。':'欢迎留下你的建议或分享。'}</p><button class="cg-btn cg-btn-light" id="cgComposeClose">继续逛花园</button>`);$('#cgComposeClose').onclick=()=>dialog.close();return; }
      show(`<span class="cg-eyebrow">一颗想法的种子</span><h2>发布建议 / 分享</h2><p class="cg-small">本月还可发布 ${me.post_remaining} 篇。审核后公开。</p><form id="cgPostForm" class="cg-form"><label>类型<select name="kind"><option value="suggestion">小建议</option><option value="sharing">陪伴分享</option></select></label><label>标题<input name="title" minlength="2" maxlength="80" required placeholder="给你的想法起个名字"></label><label>内容<textarea name="body" minlength="10" maxlength="4000" required rows="7" placeholder="您的建议对我很重要，也欢迎分享陪伴时光。"></textarea></label><p class="cg-message" role="status"></p><button class="cg-btn" type="submit" ${me.post_remaining===0?'disabled':''}>提交审核</button></form>`);
      formTask($('#cgPostForm'),async(f,generation)=>{await request('/community/posts',{kind:f.elements.kind.value,title:f.elements.title.value,body:f.elements.body.value});await refreshMe();if(generation===modalEpoch){dialog.close();toast('已提交审核，可在“我的投稿”查看');}});
    }catch(e){toast(e.message);}
  }
  async function detail(id,before=null) {
    const generation=before?modalEpoch:show('<p class="cg-muted">正在打开这颗想法…</p>');
    try {
      const r=await request(`/community/posts/${id}${before?'?before='+before:''}`);if(generation!==modalEpoch)return;
      const comments=r.comments.map(c=>`<div class="cg-comment">${author(c.author)}<p>${esc(c.body)}</p><div class="cg-post-meta"><span>${date(c.created_at)}</span><button class="cg-link-button" data-report="comment:${c.id}">举报</button></div></div>`).join('');
      if(before){$('#cgComments').insertAdjacentHTML('beforeend',comments);const more=$('#cgCommentMore');more.hidden=!r.next;more.dataset.before=r.next||'';return;}
      const p=r.post;
      // Detail construction does not reset dialog generation, so stale replies stay excluded.
      $('#cgDialogContent').innerHTML=`${author(p.author)}<h2 style="margin-top:20px;overflow-wrap:anywhere">${esc(p.title)}</h2><div class="cg-post-meta"><span>${date(p.created_at)} · ${p.kind==='suggestion'?'小建议':'陪伴分享'}</span>${p.kind==='suggestion'?`<span class="cg-chip progress-${p.progress}">${progress[p.progress]}</span>`:''}<button class="cg-link-button" data-report="post:${p.id}">举报</button></div><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(p.body)}</p>${p.team_reply?`<div class="cg-reply"><b>来自学堂的回音</b><br>${esc(p.team_reply)}</div>`:''}<h3>一起聊聊 · ${p.comment_count} 条评论</h3><div id="cgComments">${comments||'<p class="cg-small">还没有公开评论，留下一句友好的话吧。</p>'}</div><button class="cg-more" id="cgCommentMore" data-before="${r.next||''}" ${r.next?'':'hidden'}>查看更多评论 ↓</button><form class="cg-form" id="cgCommentForm"><label>评论<textarea name="body" required minlength="2" maxlength="1000" placeholder="友好交流，不公开个人隐私；评论审核后展示。"></textarea></label><p class="cg-small">您的评论对花园很重要。</p><p class="cg-message" role="status"></p><button type="submit" class="cg-btn">提交评论审核</button></form>`;
      $('#cgCommentMore').onclick=async event=>{const b=event.currentTarget;b.disabled=true;try{await detail(id,b.dataset.before);}finally{if(b.isConnected)b.disabled=false;}};
      formTask($('#cgCommentForm'),async(f,g)=>{if(!me) throw new Error('请先从页面右上角登录家长账号');await request(`/community/posts/${id}/comments`,{body:f.elements.body.value});f.reset();await refreshMe();if(g===modalEpoch)f.querySelector('.cg-message').textContent='评论已提交审核，审核后公开展示';});
    }catch(e){if(generation===modalEpoch)$('#cgDialogContent').innerHTML=empty('暂时无法打开',esc(e.message));}
  }
  async function report(target) {
    try {
      if(!await needParent())return;
      const [type,id]=target.split(':');show(`<h2>反馈这条内容</h2><form id="cgReportForm" class="cg-form"><label>举报原因<textarea name="reason" minlength="2" maxlength="300" required placeholder="例如：泄露隐私、广告或不友好的内容"></textarea></label><p class="cg-message" role="status"></p><button type="submit" class="cg-btn">提交给管理员</button></form>`);
      formTask($('#cgReportForm'),async(f,g)=>{await request('/community/report',{target_type:type,target_id:Number(id),reason:f.elements.reason.value});if(g===modalEpoch){dialog.close();toast('已收到举报，我们会尽快核查');}});
    }catch(e){toast(e.message);}
  }
  document.addEventListener('click',async event=>{
    const post=event.target.closest('[data-post]');if(post){void detail(post.dataset.post);return;}
    const reportButton=event.target.closest('[data-report]');if(reportButton){void report(reportButton.dataset.report);return;}
    const cancel=event.target.closest('[data-cancel-order]');if(cancel){cancel.disabled=true;try{await request(`/community/orders/${cancel.dataset.cancelOrder}/cancel`,{});await orders();}catch(e){toast(e.message);}finally{cancel.disabled=false;}}
  });
  document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));void loadFeed();});
  $('#cgAppreciationOpen').onclick=()=>show(`<span class="cg-eyebrow">一点心意，一起长大</span><h2>请团团吃颗糖吧</h2><div class="cg-appreciation"><img src="/assets/community/tuantuan-appreciation.jpg" alt="团团赞赏码"><p>赞赏后请留言手机号，方便登记支持。</p></div>`);
  $('#cgShare').onclick=shareGarden;$('#cgShareHero').onclick=shareGarden;$('#cgMore').onclick=()=>loadFeed(true);$('#cgWrite').onclick=compose;$('#cgWriteHero').onclick=compose;$('#cgProfile').onclick=profileForm;$('#cgAccount').onclick=profileForm;
  window.addEventListener('pageshow',event=>{if(event.persisted)void refreshMe().catch(e=>toast(e.message));});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMe().catch(()=>{});});
  void refreshPublic();void refreshMe().catch(e=>{$('#cgMe').innerHTML='<p class="cg-muted">账号服务暂未连接，请稍后刷新。</p>';toast(e.message);});
})();
