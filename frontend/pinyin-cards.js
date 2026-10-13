/* Dedicated recordings: never substitute a Chinese character or browser TTS. */
(() => {
  'use strict';
  let host=null, cached=null, generation=0, playing=null;
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function reset(){
    if(playing){
      playing.classList.remove('is-playing');playing.setAttribute('aria-pressed','false');
      playing.querySelector('small').textContent='听示范';playing=null;
    }
  }
  function leave(){generation++;if(playing)window.FufuTTS.cancel();reset();host=null;}
  async function play(button,card){
    if(!card.audio_path){button.querySelector('small').textContent='暂无录音';return;}
    window.FufuTTS.cancel();reset();const token=++generation;
    playing=button;button.classList.add('is-playing');button.setAttribute('aria-pressed','true');
    button.querySelector('small').textContent='正在播放';
    const result=await window.FufuTTS.playRecording(card.audio_path);
    if(token!==generation)return;
    reset();
    if(!result.hit)button.querySelector('small').textContent='请再点一次';
  }
  async function render(container){
    leave();host=container;const token=generation;
    host.innerHTML='<p class="pinyin-status" role="status">正在打开拼音卡片…</p>';
    try{
      const response=await fetch(`${window.FUFU_API_BASE||''}/api/learning/pinyin-cards`);
      if(!response.ok)throw Error('录音加载失败');
      cached=(await response.json()).cards;
      if(!Array.isArray(cached)||cached.some(c=>c.audio_path&&(!(c.audio_path.startsWith('/assets/audio/')||c.audio_path.startsWith('/assets/content/'))||c.audio_path.includes('..')||c.audio_path.includes('\\')||!c.audio_path.endsWith('.mp3'))))throw Error('录音信息无效');
      if(token!==generation||!container.isConnected)return;
      const groups=[...new Map(cached.map(c=>[c.group_key,c.group_name])).entries()];
      container.innerHTML=`<div class="pinyin-guide">点一张卡片听示范，跟着读一遍。<span>声母听呼读音，韵母听独立发音。</span></div>`+
        groups.map(([key,name])=>`<section class="pinyin-group"><h3>${escape(name)}<span>${cached.filter(c=>c.group_key===key).length} 个</span></h3><div class="pinyin-grid">${cached.filter(c=>c.group_key===key).map(c=>`<button class="pinyin-card" data-pinyin="${escape(c.slug)}" aria-label="${c.audio_path?'听 '+escape(c.symbol)+' 的示范发音':escape(c.symbol)+'，暂无录音'}" aria-pressed="false"><b>${escape(c.symbol)}</b><small>${c.audio_path?'听示范':'暂无录音'}</small></button>`).join('')}</div></section>`).join('')+
        '<p class="pinyin-source">示范录音：<a href="https://www.sreading.org/zh-hans/pinyin-pathway" target="_blank" rel="noopener">SReading 拼音捷径</a></p>';
      container.querySelectorAll('[data-pinyin]').forEach(button=>button.addEventListener('click',()=>play(button,cached.find(c=>c.slug===button.dataset.pinyin))));
    }catch(_){if(token===generation){cached=null;container.innerHTML='<p class="pinyin-status" role="status">暂时没有加载到示范录音，请重新打开拼音卡片。</p>';}}
  }
  window.FufuTTS.onCancel(reset);
  window.addEventListener('hashchange',()=>{if(location.hash!=='#cards')leave();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;if(playing)window.FufuTTS.cancel();}});
  window.FufuPinyinCards={render,leave};
})();
