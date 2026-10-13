(() => {
  const API = `${window.FUFU_API_BASE || ''}/api`;
  let status = null;
  let registrationMode = false;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const el = html => { const template = document.createElement('template'); template.innerHTML = html.trim(); return template.content.firstElementChild; };

  function mount() {
    if (document.querySelector('#fufu-auth-overlay')) return;
    const style = document.createElement('style');
    style.textContent = `#fufu-auth-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:linear-gradient(135deg,#23352dcf,#385743d9);backdrop-filter:blur(8px)}#fufu-auth-overlay[hidden]{display:none}#fufu-auth-card{width:min(440px,100%);max-height:calc(100vh - 40px);overflow:auto;padding:30px;border:1px solid #e7ecdf;border-radius:24px;background:#fffdf7;box-shadow:0 24px 80px #14251c55;color:#34463a;font-family:inherit}#fufu-auth-card .auth-mark{font-size:32px}#fufu-auth-card h2{margin:8px 0;font-size:25px}#fufu-auth-card p{color:#7b887d;line-height:1.7}#fufu-auth-card label{display:block;margin:13px 0;color:#55675a;font-size:13px;font-weight:700}#fufu-auth-card input,#fufu-auth-card select{display:block;width:100%;height:45px;margin-top:6px;padding:0 12px;border:1px solid #dce5d9;border-radius:11px;background:white;font:inherit}#fufu-auth-card button{width:100%;min-height:45px;margin-top:15px;border:0;border-radius:12px;background:#568367;color:white;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}#fufu-auth-card button:disabled{opacity:.55;cursor:wait}#fufu-auth-card button.auth-text-button{min-height:30px;margin-top:8px;background:transparent;color:#4f7e5c;font-size:12px}#fufu-auth-logout{background:#fff!important;border:1px solid #dce6d8!important;color:#537960!important}#fufu-auth-error{min-height:20px;color:#af5146;font-size:12px}#fufu-auth-switch{position:fixed;right:24px;bottom:20px;z-index:8000;border:1px solid #dce6d8;border-radius:18px;padding:9px 13px;background:#fff;color:#456c54;font-family:inherit;font-size:12px;font-weight:700;box-shadow:0 4px 16px #22331c1a;cursor:pointer}.profile-account-actions{display:flex;gap:8px;margin-top:12px}.profile-account-actions button{border:1px solid #dce7d9;border-radius:9px;padding:8px 10px;background:#fff;color:#537960;font:600 11px inherit;cursor:pointer}`;
    document.head.append(style);
    document.body.append(el(`<div id="fufu-auth-overlay" hidden><form id="fufu-auth-card"><div class="auth-mark">🌱</div><h2>欢迎来到福福学堂</h2><p id="fufu-auth-note">使用账号登录，直接进入学习。</p><label>账号<input name="username" autocomplete="username" required minlength="3" maxlength="40" pattern="[A-Za-z0-9_.-]+"></label><label>密码<input name="password" type="password" autocomplete="current-password" required minlength="1" maxlength="200"></label><div id="fufu-register-fields" hidden><label>学习者昵称<input name="child_name" maxlength="20"></label><label>学习阶段<select name="learning_stage"><option>小学</option><option>幼儿园</option><option>未设置</option></select></label><label>年级（选填）<input name="grade" maxlength="40" placeholder="例如：二年级 / 大班"></label><label>朋友的分享码（选填）<input name="share_code" maxlength="12" pattern="[A-Fa-f0-9]{12}"></label><label>确认密码<input name="password_confirm" type="password" autocomplete="new-password" maxlength="200"></label><p>每个账号对应一份学习者档案，登录后直接进入学习。</p></div><div id="fufu-auth-error" role="status"></div><button type="submit">登录并进入学习</button><button type="button" id="fufu-auth-register-switch" class="auth-text-button">还没有账号？立即注册</button><button type="button" id="fufu-auth-login-switch" class="auth-text-button" hidden>已有账号？返回登录</button><button type="button" id="fufu-auth-logout" hidden>退出当前账号</button></form></div>`));
    const switchButton = el(`<button id="fufu-auth-switch" type="button" hidden>退出当前账号</button>`);
    switchButton.id='fufu-auth-switch';
    switchButton.style.display='none';
    document.body.append(switchButton);
    switchButton.addEventListener('click', logout);
    document.querySelector('#fufu-auth-card').addEventListener('submit', submitLogin);
    document.querySelector('#fufu-auth-register-switch').addEventListener('click', beginRegistration);
    document.querySelector('#fufu-auth-login-switch').addEventListener('click', () => { registrationMode = false; syncRegistrationMode(); showError(''); });
    document.querySelector('#fufu-auth-logout').addEventListener('click', logout);
    document.querySelector('#myProfileModal .my-profile-modal')?.insertAdjacentHTML('beforeend', '<div class="profile-account-actions"><button type="button" id="profileLogout">退出账号</button></div>');
    document.querySelector('#profileLogout')?.addEventListener('click', logout);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '账号服务暂不可用');
    return result;
  }
  async function refreshStatus() {
    const previous = status ? `${status.account?.id || ''}:${status.learner_id || ''}` : null;
    status = await request('/auth/status');
    const current = `${status.account?.id || ''}:${status.learner_id || ''}`;
    if (previous !== null && previous !== current) window.dispatchEvent(new CustomEvent('fufu-auth-changed'));
    return status;
  }
  function openOverlay() { mount(); document.querySelector('#fufu-auth-overlay').hidden = false; }
  function closeOverlay() { document.querySelector('#fufu-auth-overlay').hidden = true; }
  function showError(message) { mount(); document.querySelector('#fufu-auth-error').textContent = message || ''; }
  function syncRegistrationMode() {
    const form = document.querySelector('#fufu-auth-card');
    if (!form) return;
    const fields = form.elements;
    document.querySelector('#fufu-register-fields').hidden = !registrationMode;
    const registerSwitch = document.querySelector('#fufu-auth-register-switch');
    registerSwitch.hidden = registrationMode || status?.account?.account_type === 'parent';
    registerSwitch.textContent = status?.account?.account_type === 'admin' ? '退出后台账号并注册学习账号' : '还没有账号？立即注册';
    document.querySelector('#fufu-auth-login-switch').hidden = !registrationMode;
    fields.share_code.disabled = !registrationMode;
    fields.child_name.required = registrationMode;
    fields.password_confirm.required = registrationMode;
    fields.password_confirm.minLength = registrationMode ? 10 : 0;
    fields.password.minLength = registrationMode ? 10 : 1;
    fields.password.autocomplete = registrationMode ? 'new-password' : 'current-password';
    document.querySelector('#fufu-auth-note').textContent = registrationMode
      ? '创建账号并填写学习者昵称即可开始学习。'
      : '使用账号登录，直接进入学习。';
    form.querySelector('button[type="submit"]').textContent = registrationMode ? '注册并开始学习' : status?.account?.account_type === 'parent' ? '开始学习' : '登录并进入学习';
  }
  function showChooser(force = false) {
    registrationMode = false;
    mount();
    if (!force && status?.account?.account_type === 'parent' && status.learner_id) {
      document.querySelector('#fufu-auth-switch').hidden = false;
      return;
    }
    openOverlay();
    const form = document.querySelector('#fufu-auth-card');
    const isParent = status?.account?.account_type === 'parent';
    document.querySelector('#fufu-auth-note').textContent = status?.bootstrap_required
      ? '可以直接注册学习账号，开始学习。'
      : '使用账号登录，直接进入学习。';

    form.elements.username.closest('label').hidden = isParent;
    form.elements.password.closest('label').hidden = isParent;
    form.elements.username.required = !isParent;
    form.elements.password.required = !isParent;
    document.querySelector('#fufu-auth-logout').hidden = !status?.account;
    syncRegistrationMode();
    if (status?.account && status.account.account_type !== 'parent') showError('当前登录的是管理员账号，请在后台使用；学习端请换用学习账号。');
    else if (isParent && !status.learners.length) showError('这个账号还没有学习者档案，请联系管理员处理。');
    else showError('');
  }
  async function beginRegistration() {
    try {
      if (status?.account?.account_type === 'admin') {
        await request('/auth/logout', { method: 'POST', body: '{}' });
        await refreshStatus();
      }
      const form = document.querySelector('#fufu-auth-card');
      form.elements.username.value = '';
      form.elements.password.value = '';
      form.elements.password_confirm.value = '';
      form.elements.child_name.value = '';
      form.elements.grade.value = '';
      try{const saved=JSON.parse(localStorage.getItem('fufu-share-invite')||'null');form.elements.share_code.value=saved&&Date.now()-saved.at<14*86400000?saved.code:'';}catch{form.elements.share_code.value='';}
      registrationMode = true;
      syncRegistrationMode();
      showError('');
    } catch (error) { showError(error.message); }
  }
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  async function submitLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; showError('');
    try {
      if (registrationMode) {
        if (form.elements.password.value !== form.elements.password_confirm.value) throw new Error('两次输入的密码不一致');
        await request('/auth/register', { method: 'POST', body: JSON.stringify({
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
          child_name: form.elements.child_name.value.trim(),
          learning_stage: form.elements.learning_stage.value,
          grade: form.elements.grade.value.trim(),
          share_code: form.elements.share_code.value.trim()
        }) });
        try{localStorage.removeItem('fufu-share-invite');}catch{}
        await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: form.elements.username.value.trim(), password: form.elements.password.value }) });
      } else {
        await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: form.elements.username.value, password: form.elements.password.value }) });
      }
      await refreshStatus();
      if (status?.account?.account_type !== 'parent') throw new Error('请使用学习账号登录');
      if (!status.learners.length) throw new Error('账号还没有学习者档案，请联系管理员处理');
      if (!status.learner_id) {
        await request('/auth/select-learner', { method: 'POST', body: JSON.stringify({ learner_id: Number(status.learners[0].id) }) });
        await refreshStatus();
      }
      registrationMode = false;
      syncRegistrationMode();
      closeOverlay();
      document.querySelector('#fufu-auth-switch').hidden = false;
      if (window.refreshProfile) await window.refreshProfile();
      await Promise.allSettled([window.loadPet?.(),window.loadShop?.(),window.loadZooSummary?.()]);
      if (window.FufuAuth.onReady) window.FufuAuth.onReady(status);
      readyResolve(status);
    } catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  }
  async function logout() {
    try { await request('/auth/logout', { method: 'POST', body: '{}' }); }
    finally { status = await refreshStatus(); showChooser(); }
  }
  async function ensure() {
    mount();
    try { await refreshStatus(); }
    catch { openOverlay(); showError('无法连接账号服务，请确认 Python 后端已启动。'); return ready; }
    if (status.account?.account_type === 'parent' && status.learners.length && !status.learner_id) {
      try { await request('/auth/select-learner', { method: 'POST', body: JSON.stringify({ learner_id: status.learners[0].id }) }); await refreshStatus(); }
      catch (error) { showChooser(true); showError(error.message); return ready; }
    }
    if (status.account?.account_type === 'parent' && status.learner_id) {
      closeOverlay(); document.querySelector('#fufu-auth-switch').hidden = false; readyResolve(status); return status;
    }
    showChooser(true);
    if (status.account?.account_type === 'parent' && !status.learners.length) showError('这个账号还没有学习者档案，请联系管理员处理。');
    if (status.account?.account_type === 'admin') showError('请先退出管理员账号，然后使用学习账号登录。');
    return ready;
  }
  window.FufuAuth = { ensure, getStatus: () => status, onReady: null };
  document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
