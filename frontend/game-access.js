/* Game access belongs to the current learner; passwords stay in form fields only. */
(() => {
  const pages=new Set(['arcade','toy-game','kart-game']);
  let allowed=false,inside=false,checking=false,epoch=0,target=null,configured=false;
  let lockJob=Promise.resolve();
  const $=s=>document.querySelector(s);
  async function request(path,body){
    const response=await fetch((window.FUFU_API_BASE||'')+'/api'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}:{})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'暂时无法验证，请稍后再试');return data;
  }
  function hideUnlock(){const modal=$('#gamePasswordModal');modal.classList.remove('open');$('#gameUnlockForm').reset();$('#gameUnlockMessage').textContent='';}
  function cancel(){epoch++;checking=false;target=null;hideUnlock();}
  function showUnlock(){const modal=$('#gamePasswordModal');modal.classList.add('open');$('#gameUnlockPassword').focus();}
  function lock(){allowed=false;inside=false;lockJob=lockJob.catch(()=>{}).then(()=>request('/game-access/lock',{})).catch(()=>{});return lockJob;}
  function allowNavigation(page){
    if(!pages.has(page)){cancel();return true;}
    if(allowed)return true;
    target=page;if(checking||$('#gamePasswordModal').classList.contains('open'))return false;
    const generation=epoch;checking=true;
    (async()=>{
      await lockJob;const data=await request('/game-access/status');
      if(generation!==epoch)return;
      configured=data.enabled;
      if(!data.enabled){allowed=true;const destination=target;target=null;window.navigate(destination);}else showUnlock();
    })().catch(error=>{if(generation===epoch){window.toast?.(error.message);target=null;}}).finally(()=>{if(generation===epoch)checking=false;});
    return false;
  }
  function onNavigate(page){if(pages.has(page))inside=true;else if(inside)void lock();}
  function fields(){
    const enabled=$('#parentGameEnabled').checked;
    $('#parentGameNewFields').hidden=!enabled;
    for(const input of $('#parentGameNewFields').querySelectorAll('input')){input.disabled=!enabled;input.required=enabled;}
    $('#parentGameVerification').parentElement.hidden=!configured;
    const account=!configured||$('#parentGameVerification').value==='account';
    $('#parentGameCurrentLabel').textContent=account?'家长账号的登录密码':'当前游戏密码';
    $('#parentGameCurrent').autocomplete=account?'current-password':'off';
  }
  async function loadSettings(){
    const generation=epoch,form=$('#parentGameAccessForm'),message=$('#parentGameMessage');
    form.reset();form.querySelector('button[type=submit]').disabled=true;message.textContent='正在读取设置…';
    try{
      const data=await request('/parent/game-access');if(generation!==epoch)return;
      configured=data.enabled;$('#parentGameEnabled').checked=data.enabled;$('#parentGameStatus').textContent=data.enabled?'已开启 · 进入游戏乐园需要密码':'未开启 · 可以直接进入游戏乐园';
      fields();message.textContent='';form.querySelector('button[type=submit]').disabled=false;
    }catch(error){if(generation===epoch)message.textContent=error.message;}
  }
  $('#gameUnlockForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]'),generation=epoch;
    button.disabled=true;$('#gameUnlockMessage').textContent='正在验证…';
    try{
      const password=$('#gameUnlockPassword').value;
      const job=lockJob.then(()=>request('/game-access/unlock',{password}));
      lockJob=job.then(()=>{if(generation!==epoch)return request('/game-access/lock',{});}).catch(()=>{});
      await job;
      if(generation!==epoch)return;
      allowed=true;const destination=target||'arcade';target=null;hideUnlock();window.navigate(destination);
    }catch(error){if(generation===epoch){$('#gameUnlockMessage').textContent=error.message;$('#gameUnlockPassword').value='';$('#gameUnlockPassword').focus();}}
    finally{button.disabled=false;}
  });
  for(const button of document.querySelectorAll('[data-game-unlock-cancel]'))button.onclick=cancel;
  $('#gamePasswordModal').addEventListener('click',event=>{if(event.target===$('#gamePasswordModal'))cancel();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#gamePasswordModal').classList.contains('open'))cancel();});
  $('#parentGameEnabled').onchange=fields;$('#parentGameVerification').onchange=fields;
  $('#parentGameAccessForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]'),message=$('#parentGameMessage'),enabled=$('#parentGameEnabled').checked,generation=epoch;
    if(enabled&&$('#parentGameNew').value!==$('#parentGameConfirm').value){message.textContent='两次输入的新密码不一致';return;}
    button.disabled=true;message.textContent='正在保存…';
    try{
      const data=await request('/parent/game-access',{enabled,newPassword:enabled?$('#parentGameNew').value:'',currentPassword:$('#parentGameCurrent').value,verification:configured?$('#parentGameVerification').value:'account'});
      if(generation!==epoch)return;
      allowed=false;if(inside)window.navigate('home');
      await loadSettings();message.textContent=data.enabled?'密码已保存，下次进入游戏乐园时生效':'游戏密码已关闭';
    }catch(error){if(generation===epoch)message.textContent=error.message;}
    finally{$('#parentGameCurrent').value='';$('#parentGameNew').value='';$('#parentGameConfirm').value='';button.disabled=false;}
  });
  window.addEventListener('fufu-auth-changed',()=>{cancel();void lock();configured=false;$('#parentGameAccessForm').reset();$('#parentModal').classList.remove('open');if(document.querySelector('#page-arcade.active,#page-toy-game.active,#page-kart-game.active'))window.navigate?.('home');});
  window.addEventListener('pagehide',()=>{if(inside)void lock();});
  window.addEventListener('pageshow',event=>{if(event.persisted&&!allowed&&document.querySelector('#page-arcade.active,#page-toy-game.active,#page-kart-game.active')){window.navigate?.('home');window.navigate?.('arcade');}});
  window.addEventListener('hashchange',()=>{if(location.hash==='#arcade')window.navigate?.('arcade');});
  window.FufuGameAccess={allowNavigation,onNavigate,loadSettings,get entryAllowed(){return allowed;}};
  fields();
})();
