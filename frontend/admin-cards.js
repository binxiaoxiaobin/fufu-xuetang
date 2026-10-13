(() => {
  const api=`${window.FUFU_API_BASE||''}/api`, state={kind:'reader',rows:[],assets:{image:[],audio:[]},id:null,readOnly:false};
  const readerTopics=['水果','蔬菜','食物与饮品','生活用品','身体与衣物','动物朋友','自然与生命','出门与交通','动作与生活','位置与描述','朋友与表达'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request=async(path,options={})=>{const response=await fetch(api+path,{headers:{'Content-Type':'application/json'},...options});const data=await response.json();if(!response.ok)throw Error(data.error||'学习卡片保存失败');return data;};
  const page=document.createElement('section');page.className='page';page.id='view-cards';
  page.innerHTML=`<div class="page-heading"><div><div class="date-kicker">内容管理</div><h1>学习与历史内容 <span>🗂️</span></h1><p>先选内容类别，再选要修改的条目。填写后点“保存”，学习页面下次打开就会更新。</p></div><button id="newLearningCard" class="primary" type="button">＋ 新建内容</button></div><div id="cardAdminStatus" class="connection-status">正在读取内容…</div><div class="card-admin-tools"><span>常用步骤：选类别 → 选内容或新建 → 修改 → 保存。图片和录音可在这里上传。</span><label class="quiet-button">＋ 上传图片<input id="cardImageUpload" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><label class="quiet-button">＋ 上传录音<input id="cardAudioUpload" type="file" accept="audio/mpeg,.mp3" hidden></label></div><div class="card-admin-tabs" role="group" aria-label="选择要管理的内容类别"><button type="button" data-card-kind="reader">识字闯关</button><button type="button" data-card-kind="words">英语单词</button><button type="button" data-card-kind="pinyin">拼音与汉字</button><button type="button" data-card-kind="history">朝代与历史</button><button type="button" data-card-kind="battles">历史战役</button><button type="button" data-card-kind="strategies">三十六计</button></div><div class="admin-layout"><aside class="story-list-panel"><div class="list-heading"><div><b id="learningCardListTitle">闯关字词</b><small>点击一条内容即可开始编辑</small></div><span class="library-mark">✨</span></div><div class="list-tools"><span class="search-icon">⌕</span><input id="learningCardSearch" type="search" placeholder="搜索标题或内容"><span id="learningCardCount">0 个</span></div><div id="learningCardList" class="story-list"></div></aside><form id="learningCardForm" class="editor-panel"><div class="editor-top"><div><div class="eyebrow">内容编辑</div><h2 id="learningCardEditorTitle">新建内容</h2><p>先填写主要内容；不确定的扩展资料可以暂时留空。</p></div><button id="archiveLearningCard" class="danger-button" type="button" disabled>暂不显示</button></div><div id="learningCardFields" class="form-grid"></div><div class="editor-actions"><span id="learningCardMessage" role="status"></span><button id="resetLearningCard" class="quiet-button" type="button">放弃修改</button><button class="primary" type="submit">保存并更新 <span>→</span></button></div></form></div>`;
  document.querySelector('main.main')?.append(page);
  const $=selector=>page.querySelector(selector);
  const status=(message,error=false)=>{const el=$('#cardAdminStatus');el.textContent=message;el.className='connection-status '+(error?'error':'connected');};
  const assetOptions=(kind,selected=0)=>`<option value="">不设置</option>`+state.assets[kind].map(a=>`<option value="${a.id}" ${Number(selected)===Number(a.id)?'selected':''}>#${a.id} · ${esc(a.title||a.public_path)}</option>`).join('');
  async function uploadAsset(input,kind){const file=input.files?.[0];if(!file)return;try{if(file.size>20_000_000)throw Error('素材不能超过 20 MB');const ext=(file.name.split('.').pop()||'').toLowerCase();if(kind==='image'&&!['png','jpg','jpeg','webp'].includes(ext)||kind==='audio'&&ext!=='mp3')throw Error('请上传 PNG、JPG、WebP 图片或 MP3 录音');status('正在上传素材…');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('读取文件失败'));reader.readAsDataURL(file);});const uploaded=await request('/admin/media/upload',{method:'POST',body:JSON.stringify({extension:ext==='jpeg'?'jpg':ext,title:file.name,alt_text:file.name,source_name:'管理员上传',license_name:'自有或已获授权素材',base64})});await load();status(`素材已加入列表：${uploaded.public_path}`);}catch(error){status(error.message,true);}finally{input.value='';}}
  function fields(item={}){
    $('#learningCardFields').innerHTML=state.kind==='reader'?`
      <label>练习学科<select name="subject"><option value="语文" ${item.subject!=='英语'?'selected':''}>识字快练</option><option value="英语" ${item.subject==='英语'?'selected':''}>单词快练</option></select></label>
      <label>难度<select name="level"><option value="1" ${Number(item.level||1)===1?'selected':''}>认识起步</option><option value="2" ${Number(item.level)===2?'selected':''}>词句练习</option><option value="3" ${Number(item.level)===3?'selected':''}>进阶表达</option></select></label>
      <label>要学习的字/词<input name="word" required maxlength="80" value="${esc(item.word)}"></label>
      <label>拼音（识字）<input name="pinyin" maxlength="80" value="${esc(item.pinyin)}" placeholder="例如：xiǎo gǒu"></label>
      <label>释义<input name="meaning" required maxlength="200" value="${esc(item.meaning)}"></label>
      <label>主题<select name="category">${readerTopics.map(topic=>`<option ${topic===(item.category||'朋友与表达')?'selected':''}>${esc(topic)}</option>`).join('')}</select></label>
      <label class="wide">完整例句<input name="sentence" required maxlength="300" value="${esc(item.sentence)}"></label>
      <label>正确词前的句子<input name="before" maxlength="200" value="${esc(item.before)}"></label>
      <label>正确词后的句子<input name="after" maxlength="200" value="${esc(item.after)}"></label>
      <label class="wide">干扰选项<input name="choice_words" required value="${esc((item.choice_words||[]).join(', '))}" placeholder="用逗号分隔，至少两个"></label>
      <label>词语录音地址<input name="word_audio" value="${esc(item.word_audio)}" placeholder="/assets/audio/…"></label>
      <label>例句录音地址<input name="sentence_audio" value="${esc(item.sentence_audio)}" placeholder="/assets/audio/…"></label>
      <label>英文翻译<input name="translation" maxlength="200" value="${esc(item.translation)}"></label>
      <label>翻译录音地址<input name="translation_audio" value="${esc(item.translation_audio)}" placeholder="/assets/audio/…"></label>
      <label>发布状态<select name="status"><option value="published" ${item.status!=='archived'?'selected':''}>加入闯关练习</option><option value="archived" ${item.status==='archived'?'selected':''}>暂不显示</option></select></label>`:state.kind==='pinyin'?`
      <label>卡片编号<input name="slug" required maxlength="16" value="${esc(item.slug)}" placeholder="例如：zhi"></label>
      <label>拼音/汉字<input name="symbol" required maxlength="16" value="${esc(item.symbol)}" placeholder="例如：zhi 或 山"></label>
      <label>分组编号<input name="group_key" required maxlength="24" value="${esc(item.group_key||'custom')}" placeholder="例如：shengmu"></label>
      <label>分组名称<input name="group_name" required maxlength="40" value="${esc(item.group_name||'自定义拼音')}"></label>
      <label>排序<input name="position" type="number" min="0" max="65535" value="${item.position??(state.rows.length+1)}"></label>
      <label>示范录音<select name="audio_asset_id">${assetOptions('audio',item.audio_asset_id)}</select><small>可留空；选择已上传的录音素材</small></label>
      <label>发布状态<select name="status"><option value="published" ${item.status!=='archived'?'selected':''}>在学习页面显示</option><option value="archived" ${item.status==='archived'?'selected':''}>暂不显示</option></select></label>`:`
      <label>卡片编号<input name="slug" required maxlength="50" value="${esc(item.slug)}" placeholder="例如：apple"></label>
      <label>英语单词<input name="word" required maxlength="80" value="${esc(item.word)}"></label>
      <label>中文释义<input name="meaning" required maxlength="120" value="${esc(item.meaning)}"></label>
      <label>分类编号<input name="category_key" required maxlength="40" value="${esc(item.category_key||'daily-words')}" placeholder="例如：fruit"></label>
      <label>分类名称<input name="category_name" required maxlength="80" value="${esc(item.category_name||'日常词汇')}"></label>
      <label>所在小组<input name="group" required maxlength="80" value="${esc(item.group||'常见单词')}" placeholder="例如：水果"></label>
      <label class="wide">英语例句<input name="sentence" required maxlength="200" value="${esc(item.sentence)}"></label>
      <label class="wide">例句翻译<input name="translation" required maxlength="200" value="${esc(item.translation)}"></label>
      <label class="wide">图片替代文字<input name="hint" maxlength="300" value="${esc(item.hint||item.meaning)}"></label>
      <label class="wide">卡片图片<select name="image_asset_id" required>${assetOptions('image',item.image_asset_id)}</select><small>先在素材库准备图片；卡片会复用所选图片</small></label>
      <label>单词录音<select name="word_audio_asset_id">${assetOptions('audio',item.word_audio_asset_id)}</select></label>
      <label>例句录音<select name="sentence_audio_asset_id">${assetOptions('audio',item.sentence_audio_asset_id)}</select></label>
      <label>排序<input name="position" type="number" min="0" max="65535" value="${item.position??(state.rows.length+1)}"></label>
      <label>发布状态<select name="status"><option value="published" ${item.status!=='archived'?'selected':''}>在学习页面显示</option><option value="archived" ${item.status==='archived'?'selected':''}>暂不显示</option></select></label>`;
    $('#learningCardMessage').textContent='';
  }
  function reset(){state.id=null;$('#learningCardForm').reset();$('#learningCardEditorTitle').textContent='新建卡片';$('#archiveLearningCard').disabled=true;fields();renderList();}
  function renderList(){
    const q=$('#learningCardSearch').value.trim().toLowerCase();
    const rows=state.rows.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));
    $('#learningCardCount').textContent=`${state.rows.length} 张`;
    $('#learningCardList').innerHTML=rows.length?rows.map(r=>`<button type="button" class="story-list-item ${r.id===state.id?'selected':''}" data-card-id="${r.id}"><span class="template-art ${r.status==='archived'?'sky':'green'}">${state.kind==='pinyin'?'字':state.kind==='reader'?'闯':'Aa'}</span><span><small>#${r.id} · ${esc(state.kind==='pinyin'?r.group_name:state.kind==='reader'?r.subject:(r.category_name||r.category_key))}${r.status==='archived'?' · 已下架':''}</small><b>${esc(state.kind==='pinyin'?r.symbol:r.word)}${state.kind!=='pinyin'?` · ${esc(r.meaning)}`:''}</b><em>${esc(r.slug||'闯关字词')}</em></span></button>`).join(''):'<p class="list-empty">没有找到内容</p>';
    $('#learningCardList').querySelectorAll('[data-card-id]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.cardId)));
  }
  function select(id){const row=state.rows.find(r=>String(r.id)===String(id));if(!row)return;state.id=row.id;$('#learningCardEditorTitle').textContent=`编辑：${state.kind==='pinyin'?row.symbol:row.word}`;$('#archiveLearningCard').disabled=state.readOnly;fields(row);renderList();}
  async function load(){
    let historyHost=page.querySelector('.history-admin-host');
    if(['history','battles','strategies'].includes(state.kind)){
      if(!historyHost){historyHost=document.createElement('div');historyHost.className='history-admin-host';page.append(historyHost);}
      historyHost.hidden=false;page.querySelector('.admin-layout').hidden=true;$('.card-admin-tools').hidden=true;$('#newLearningCard').hidden=true;
      status(({history:'朝代时光轴',battles:'著名战役',strategies:'三十六计'})[state.kind]+' · 保存后前台重新打开即可读取');
      if(state.kind==='history')await window.FufuHistoryAdmin.render(historyHost);else await window.FufuWisdomAdmin.render(historyHost,state.kind);return;
    }
    if(historyHost)historyHost.hidden=true;
    page.querySelector('.admin-layout').hidden=false;
    try{
      const requests=state.kind==='reader'?[request('/admin/reader-lessons')]:[request(`/admin/learning-cards?kind=${state.kind}`),request('/admin/media?kind=image&page=1&page_size=100'),request('/admin/media?kind=audio&page=1&page_size=100')];
      const result=await Promise.all(requests);state.rows=result[0].items||[];
      if(state.kind!=='reader'){state.assets.image=result[1].items||[];state.assets.audio=result[2].items||[];}
      state.readOnly=false;
      $('#newLearningCard').hidden=false;$('.card-admin-tools').hidden=false;$('#learningCardForm').hidden=false;
      const names={reader:'闯关字词',pinyin:'拼音/汉字卡片',words:'英语单词卡片'};
      $('#learningCardListTitle').textContent=names[state.kind];
      $('#newLearningCard').textContent=`＋ 新建${names[state.kind]}`;
      status(`已读取 ${state.rows.length} 个${names[state.kind]} · 保存后无需重启服务`);
    }catch(error){
      try{
        state.readOnly=true;
        if(state.kind==='reader'){
          const [zh,en]=await Promise.all(['语文','英语'].map(subject=>request(`/learning/reader-lessons?subject=${encodeURIComponent(subject)}`)));
          state.rows=[...(zh.items||[]),...(en.items||[])].map(item=>({...item,id:item.question_id,status:'published'}));
        }else if(state.kind==='pinyin'){
          const data=await request('/learning/pinyin-cards');state.rows=(data.cards||[]).map(item=>({...item,id:item.slug,status:'published'}));
        }else{
          const data=await request('/learning/english-cards');state.rows=data.cards||[];
        }
        const names={reader:'闯关字词',pinyin:'拼音/汉字卡片',words:'英语单词卡片'};
        $('#learningCardListTitle').textContent=names[state.kind];
        $('#newLearningCard').hidden=true;$('.card-admin-tools').hidden=true;$('#learningCardForm').hidden=true;
        status(`当前服务还未载入编辑接口，先展示学习页面现有的 ${state.rows.length} 个${names[state.kind]}；服务更新后即可在此编辑。`,true);
      }catch(fallbackError){status(fallbackError.message||error.message,true);}
    }
    reset();
  }
  page.querySelectorAll('[data-card-kind]').forEach(button=>{button.classList.toggle('active',button.dataset.cardKind===state.kind);button.addEventListener('click',()=>{if(window.FufuWisdomAdmin&&!window.FufuWisdomAdmin.canLeave())return;window.FufuWisdomAdmin?.discard();state.kind=button.dataset.cardKind;state.id=null;page.querySelectorAll('[data-card-kind]').forEach(x=>x.classList.toggle('active',x===button));load();});});
  $('#newLearningCard').addEventListener('click',reset);
  $('#cardImageUpload').addEventListener('change',event=>uploadAsset(event.currentTarget,'image'));
  $('#cardAudioUpload').addEventListener('change',event=>uploadAsset(event.currentTarget,'audio'));
  $('#resetLearningCard').addEventListener('click',reset);
  $('#learningCardSearch').addEventListener('input',renderList);
  $('#learningCardForm').addEventListener('submit',async event=>{
    event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));values.kind=state.kind;
    for(const key of ['position','image_asset_id','audio_asset_id','word_audio_asset_id','sentence_audio_asset_id'])if(values[key])values[key]=Number(values[key]);
    const message=$('#learningCardMessage');message.textContent='正在保存…';
    try{const base=state.kind==='reader'?'/admin/reader-lessons':`/admin/learning-cards/${state.kind}`;const path=state.id?`${base}/${state.id}`:base;await request(path,{method:state.id?'PUT':'POST',body:JSON.stringify(values)});const savedId=state.id;await load();if(savedId)select(savedId);message.textContent='已保存，学习页面下次打开即可读取。';}
    catch(error){message.textContent=error.message;}
  });
  $('#archiveLearningCard').addEventListener('click',async()=>{if(!state.id)return;try{const path=state.kind==='reader'?`/admin/reader-lessons/${state.id}`:`/admin/learning-cards/${state.kind}/${state.id}`;await request(path,{method:'DELETE'});await load();}catch(error){$('#learningCardMessage').textContent=error.message;}});
  window.FufuLearningCardsAdmin={onEnter:kind=>{if(kind&&kind!==state.kind){if(window.FufuWisdomAdmin&&!window.FufuWisdomAdmin.canLeave())return;window.FufuWisdomAdmin?.discard();state.kind=kind;state.id=null;page.querySelectorAll('[data-card-kind]').forEach(button=>button.classList.toggle('active',button.dataset.cardKind===kind));}return load();}};
})();
