/* Original clay close-ups: small real animated images, vocabulary from MySQL. */
(() => {
  'use strict';
  let generation=0, active=null, audio=null, timer=0, observer=null, host=null, cached=null, category='actions';
  const visible=new Set();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const asset=path=>typeof path==='string'&&path.startsWith('/assets/')&&!path.includes('..')&&!path.includes('\\')&&/\.(?:webp|png|jpe?g)$/i.test(path);
  function updateMotion(){
    const candidates=!document.hidden&&!reduced.matches&&document.querySelector('#page-cards.active')
      ? [...visible].sort((a,b)=>(a===active?-1:b===active?1:a.getBoundingClientRect().top-b.getBoundingClientRect().top)).slice(0,15):[];
    for(const image of host?.querySelectorAll('.ac-art img')||[]){
      const moving=candidates.includes(image.closest('.action-card'));
      const source=moving?image.dataset.motion:image.dataset.poster;
      if(image.getAttribute('src')!==source)image.src=source;
      image.dataset.moving=String(moving);
    }
  }
  function stop(){
    generation++;clearTimeout(timer);
    if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio.remove();audio=null;}
    if(active){
      active.classList.remove('is-playing');
      active.querySelectorAll('[aria-pressed]').forEach(button=>button.setAttribute('aria-pressed','false'));
      active.querySelector('.ac-status').textContent='点卡片听发音';
      active=null;window.FufuTTS?.cancel();
    }
  }
  function leave(){
    stop();observer?.disconnect();observer=null;visible.clear();updateMotion();host=null;
  }
  async function pronounce(card,kind,token){
    const path=card[kind==='word'?'word_audio':'sentence_audio'];
    if(typeof path==='string'&&(path.startsWith('/assets/audio/')||path.startsWith('/assets/content/'))&&!path.includes('..')&&!path.includes('\\')&&path.endsWith('.mp3')){
      audio=new Audio(path);audio.hidden=true;active.appendChild(audio);
      try{await audio.play();return;}catch(_){if(token!==generation)return;}
    }
    if(token!==generation)return;
    const result=await window.FufuTTS.speak(card[kind],'en-US');
    if(!result.hit&&token===generation&&active)window.browserSpeak(card[kind],'en-US');
  }
  function play(element,card,kind){
    stop();const token=++generation;active=element;
    element.classList.add('is-playing');element.querySelector(kind==='word'?'.ac-play':'.ac-example').setAttribute('aria-pressed','true');
    updateMotion();
    element.querySelector('.ac-status').textContent=kind==='word'?'听一听，跟着读':'听一句简单的英语';
    pronounce(card,kind,token).catch(()=>{
      if(token===generation)element.querySelector('.ac-status').textContent='语音暂不可用，请再点一次';
    });
    timer=setTimeout(()=>{if(token===generation)stop();},6500);
  }
  async function render(container, chosen=category){
    const switching=host===container;
    category=chosen;
    leave();host=container;const token=generation;
    host.innerHTML='<p class="ac-loading" role="status">正在打开英语卡片…</p>';
    try{
      const response=await fetch(`${window.FUFU_API_BASE||''}/api/learning/english-cards`);
      if(!response.ok)throw Error('Loading failed');
      const data=await response.json();cached=data.cards.filter(card=>asset(card.image_path)&&asset(card.animation_path));
      if(token!==generation||!container.isConnected)return;
      if(!cached.length)throw Error('No cards');
      const categories=[...new Map(cached.map(card=>[card.category_key,card.category_name])).entries()];
      if(!categories.some(([key])=>key===category))category=categories[0][0];
      const cards=cached.filter(card=>card.category_key===category);
      const categoryName=categories.find(([key])=>key===category)[1];
      host.innerHTML=`<nav class="ac-categories" aria-label="英语卡片分类">${categories.map(([key,name])=>`<button type="button" data-category="${escape(key)}" aria-pressed="${key===category}">${escape(name)}<span>${cached.filter(card=>card.category_key===key).length}</span></button>`).join('')}</nav><div class="ac-intro"><div><b>看一张卡片，说一句英语</b><p>先点图片听单词，再点下面的句子跟着说。</p></div><span class="ac-count">${escape(categoryName)} · ${cards.length} 张</span></div>`+
        [...new Set(cards.map(card=>card.group))].map(group=>`<section class="ac-section"><h2>${escape(group)}</h2><div class="ac-grid">${cards.filter(card=>card.group===group).map(card=>`<article class="action-card" data-action="${escape(card.slug)}"><button type="button" class="ac-play" aria-pressed="false" aria-label="朗读 ${escape(card.word)}，${escape(card.meaning)}"><span class="ac-art"><img loading="lazy" decoding="async" width="320" height="320" class="${card.display_kind==='illustration'?'ac-object':''}" alt="${escape(card.hint)}" src="${escape(card.image_path)}" data-poster="${escape(card.image_path)}" data-motion="${escape(card.animation_path)}"/></span><span class="ac-word" lang="en">${escape(card.word)}<span class="ac-sound" aria-hidden="true">♪</span></span><span class="ac-meaning">${escape(card.meaning)}</span></button><div class="ac-status" role="status">点卡片听发音</div><button class="ac-example" type="button" aria-pressed="false" aria-label="听例句 ${escape(card.sentence)}"><span class="ac-sentence" lang="en">${escape(card.sentence)}</span><span class="ac-translation">${escape(card.translation)}</span><span class="ac-listen"><span aria-hidden="true">▷</span> 听句子 · 跟着说</span></button></article>`).join('')}</div></section>`).join('');
      host.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>render(container,button.dataset.category)));
      host.querySelectorAll('.action-card').forEach(element=>{
        const card=cards.find(card=>card.slug===element.dataset.action);
        element.querySelector('.ac-play').addEventListener('click',()=>play(element,card,'word'));
        element.querySelector('.ac-example').addEventListener('click',()=>play(element,card,'sentence'));
      });
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(!host?.contains(entry.target))continue;
          if(entry.isIntersecting)visible.add(entry.target);else{
            visible.delete(entry.target);if(entry.target===active)stop();
          }
        }
        updateMotion();
      },{threshold:.1});
      host.querySelectorAll('.action-card').forEach(element=>observer.observe(element));
      if(switching)container.scrollIntoView({block:'start',behavior:'instant'});
    }catch(_){
      if(token!==generation)return;cached=null;
      container.innerHTML='<div class="ac-loading"><p>卡片暂时没加载出来。</p><button type="button">再试一次</button></div>';
      container.querySelector('button').onclick=()=>render(container);
    }
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();updateMotion();});
  reduced.addEventListener?.('change',updateMotion);
  window.addEventListener('pagehide',leave);
  window.addEventListener('fufu-auth-changed',()=>{leave();cached=null;});
  window.FufuActionCards={render,leave,onNavigate(page){if(page!=='cards')leave();}};
})();
