(() => {
  const API = `${window.FUFU_API_BASE || ''}/api`;
  const style = document.createElement('style');
  style.textContent = `#adminAuthGate{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:linear-gradient(135deg,#20342bdf,#56765bdb);backdrop-filter:blur(8px)}#adminAuthGate[hidden]{display:none}#adminAuthCard{width:min(460px,100%);padding:30px;border:1px solid #e6ece1;border-radius:22px;background:#fffdf8;color:#35483a;box-shadow:0 24px 80px #14251c55;font-family:inherit}#adminAuthCard .mark{font-size:30px}#adminAuthCard h1{margin:8px 0;font-size:24px}#adminAuthCard p{color:#7c897e;line-height:1.7}#adminAuthCard label{display:block;margin:13px 0;color:#58695c;font-size:12px;font-weight:700}#adminAuthCard input{display:block;width:100%;height:43px;margin-top:6px;padding:0 11px;border:1px solid #dce5d9;border-radius:10px;font:inherit}#adminAuthCard button{width:100%;height:44px;margin-top:14px;border:0;border-radius:11px;background:#568367;color:white;font:700 13px inherit;cursor:pointer}#adminAuthMsg{min-height:20px;color:#af5146;font-size:12px}#adminAuthLogout{border:1px solid #dfe8dc;border-radius:20px;padding:7px 11px;background:#fff;color:#577b62;font:600 11px inherit;cursor:pointer}`;
  document.head.append(style);
  document.body.append(Object.assign(document.createElement('div'), { id:'adminAuthGate', innerHTML:'<form id="adminAuthCard"><div class="mark">🌱</div><h1>福福学堂后台</h1><p id="adminAuthIntro"></p><label>管理员用户名<input name="username" autocomplete="username" required maxlength="40"></label><label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label><label id="adminDisplayLabel">显示名称<input name="display_name" value="系统管理员" maxlength="80"></label><div id="adminAuthMsg" role="status"></div><button type="submit">继续</button></form>' }));
  const gate = document.querySelector('#adminAuthGate');
  const form = document.querySelector('#adminAuthCard');
  let status;
  async function request(path, options={}) {
    const response=await fetch(`${API}${path}`,{headers:{'Content-Type':'application/json'},...options});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'账号服务暂不可用');
    return result;
  }
  async function getStatus(){status=await request('/auth/status?account_type=admin');}
  function renderGate(message=''){
    gate.hidden=false;
    const boot=Boolean(status?.bootstrap_required);
    document.querySelector('#adminAuthIntro').textContent=boot?'首次使用：创建超级管理员账号。用户名至少 3 位，密码至少 10 位。':'请登录管理员账号后管理内容、题库和家长账号。';
    document.querySelector('#adminDisplayLabel').hidden=!boot;
    form.querySelector('button').textContent=boot?'创建管理员':'登录后台';
    document.querySelector('#adminAuthMsg').textContent=message;
  }
  async function loadAdminScripts(){
    const sources=['/admin.js?v=20261010-workbench-1','/admin-questions.js?v=20261010-workbench-1','/admin-wisdom.js?v=20261012-usability-1','/admin-history.js?v=20261012-usability-1','/admin-cards.js?v=20261012-usability-1','/admin-ui.js?v=20261012-usability-1'];
    if(['superadmin','learner_manager','viewer'].includes(status.account.role)){sources.push('/admin-accounts.js?v=20261010-workbench-1');}
    else if(status.account.role==='content_admin'){const link=document.querySelector('[data-view="accounts"]');if(link)link.hidden=true;}
    if(['superadmin','content_admin'].includes(status.account.role)){document.querySelector('[data-view=community]').hidden=false;sources.push('/community-admin.js?v=20261010-workbench-1');}
    for(const src of sources)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('后台页面资源加载失败：'+src));document.body.append(script);});
  }
  async function enter(){
    await getStatus();
    if(!status.account||status.account.account_type!=='admin'){renderGate();return;}
    window.FUFU_ADMIN_ACCOUNT=status.account;
    gate.hidden=true;
    const actions=document.querySelector('.top-actions');
    if(actions&&!document.querySelector('#adminAuthLogout')){
      const button=document.createElement('button');button.id='adminAuthLogout';button.textContent=`${status.account.display_name||status.account.username} · 退出`;
      button.addEventListener('click',async()=>{await request('/auth/logout?account_type=admin',{method:'POST',body:'{}'});location.reload();});actions.append(button);
    }
    const sideUser=document.querySelector('.user-card');
    const displayName=status.account.display_name||status.account.username||'管理员';
    const initial=Array.from(displayName.trim())[0]||'管';
    const roleName=({superadmin:'超级管理员',content_admin:'内容管理员',learner_manager:'学习者管理员',viewer:'只读查看'})[status.account.role]||'管理员';
    if(sideUser){const name=sideUser.querySelector('b');const role=sideUser.querySelector('small');if(name)name.textContent=displayName;if(role)role.textContent=roleName;}
    for(const selector of ['#adminUserInitial','#adminAvatarInitial']){const node=document.querySelector(selector);if(node)node.textContent=initial;}
    const welcome=document.querySelector('#adminWelcomeName');if(welcome)welcome.textContent=displayName;
    try{await loadAdminScripts();}catch(error){renderGate(error.message);}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try{
      if(status?.bootstrap_required){
        await request('/auth/bootstrap',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value,display_name:form.elements.display_name.value})});
        await getStatus();form.reset();renderGate('管理员已创建，请登录。');
      }else{
        await request('/auth/login',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value})});
        await enter();
      }
    }catch(error){document.querySelector('#adminAuthMsg').textContent=error.message;}
    finally{button.disabled=false;}
  });
  enter().catch(error=>renderGate(error.message));
})();
