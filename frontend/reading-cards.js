/* Paginated MySQL subject cards; media is loaded only when viewed or played. */
(() => {
  'use strict';
  let host=null,kind='poetry',generation=0,page=1,total=0,query='',collection='',loading=false,failed=false;
  let reader=null,readerCard=null,recitationToken=0,playing=false,lastFocus=null,detailRequest=0,scienceVideoCleanup=null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const base=()=>window.FUFU_API_BASE||'';
  const artwork=card=>{const science=card.kind==='science'||(!card.kind&&kind==='science');return `<div class="reading-art${science?' reading-art--science':''}"><img src="${escape(card.image_path)}" alt="${escape(card.title)}${science?'的手绘示意图':'的意境配图'}" width="720" height="480" loading="lazy" decoding="async"></div>`;};
  function explanationMarkup(explanation){
    if(!explanation)return '<p class="reading-meaning-empty">这首诗的释义正在整理中。</p>';
    return `<div class="reading-meaning"><h3>读懂这首诗</h3><p>${escape(explanation.meaning)}</p>${explanation.notes?.length?`<h3>词语小提示</h3><dl>${explanation.notes.map(note=>`<div><dt>${escape(note.word)}</dt><dd>${escape(note.meaning)}</dd></div>`).join('')}</dl>`:''}</div>`;
  }
  function switchReadingView(button){
    const meaning=button.dataset.readingView==='meaning';
    reader.querySelectorAll('[data-reading-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    reader.querySelector('[data-original]').hidden=meaning;
    reader.querySelector('[data-meaning]').hidden=!meaning;
  }
  function resetPlayback(){
    recitationToken++;playing=false;
    const button=reader?.querySelector('[data-recite]');
    if(button){button.textContent=readerCard?.kind==='science'?'听讲解':'听朗诵';button.setAttribute('aria-pressed','false');}
    const status=reader?.querySelector('[data-reader-status]');if(status)status.textContent='';
  }
  function closeReader(){detailRequest++;scienceVideoCleanup?.();scienceVideoCleanup=null;if(playing)window.FufuTTS.cancel();resetPlayback();readerCard=null;if(reader?.open)reader.close();}
  function leave(){generation++;closeReader();host=null;loading=false;}
  function ensureReader(){
    if(reader)return;
    reader=document.createElement('dialog');reader.className='reading-dialog';reader.setAttribute('aria-label','卡片阅读');
    document.body.appendChild(reader);
    reader.addEventListener('cancel',closeReader);
    reader.addEventListener('close',()=>{if(reader.open)return;if(playing)window.FufuTTS.cancel();resetPlayback();lastFocus?.focus();});
    reader.addEventListener('click',event=>{if(event.target===reader){const r=reader.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeReader();}});
  }
  async function recite(){
    if(!readerCard)return;
    if(playing){window.FufuTTS.cancel();resetPlayback();return;}
    window.FufuTTS.cancel();resetPlayback();const token=++recitationToken;playing=true;
    const button=reader.querySelector('[data-recite]'),status=reader.querySelector('[data-reader-status]');
    button.textContent='停止播放';button.setAttribute('aria-pressed','true');status.textContent=readerCard.kind==='science'?'正在讲解…':'正在朗诵…';
    try{
      const path=readerCard.audio_path;
      const result=path&&/^\/assets\/audio\/learning-(?:poetry|science)\/[a-f0-9]+\.mp3$/.test(path)
        ? await window.FufuTTS.playRecording(path) : await window.FufuTTS.speakChain(readerCard.paragraphs,'zh-CN');
      if(token!==recitationToken)return;
      resetPlayback();status.textContent=result.hit?'听完啦，可以跟着再读一遍。':'语音暂不可用，请再试一次。';
    }catch(_){if(token===recitationToken){resetPlayback();status.textContent='语音暂不可用，请再试一次。';}}
  }
  async function openCard(id,autoplay){
    closeReader();ensureReader();lastFocus=document.activeElement;
    const request=++detailRequest,token=generation;
    reader.innerHTML='<button class="reading-close" aria-label="关闭阅读">×</button><p class="reading-loading" role="status">正在翻开卡片…</p>';
    reader.querySelector('.reading-close').onclick=closeReader;reader.showModal();
    try{
      const response=await fetch(`${base()}/api/learning/reading-cards/${id}`);if(!response.ok)throw Error();
      const card=await response.json();if(token!==generation||request!==detailRequest||!reader.open)return;
      const poetry=card.kind==='poetry',lesson=!poetry?window.FufuScienceVideos?.get(card.slug,card.title):null;
      readerCard=lesson?{...card,audio_path:null}:card;
      reader.innerHTML=`<button class="reading-close" aria-label="关闭阅读">×</button>${card.image_path?artwork(card):''}<div class="reading-inner"><span class="reading-kicker">${escape(card.collection)}${lesson?' · 手绘小课堂':''}</span><h2>${escape(lesson?.title||card.title)}</h2>${poetry?`<p class="reading-author">${escape(card.dynasty)} · ${escape(card.author)}</p>`:''}${lesson?`<p class="science-video-intro">${escape(lesson.description)}</p>${window.FufuScienceVideos.markup(lesson)}`:''}<div class="reading-controls">${poetry?`<div class="reading-view-switch" role="group" aria-label="阅读内容"><button data-reading-view="original" aria-pressed="true">诗词原文</button><button data-reading-view="meaning" aria-pressed="false">查看释义</button></div>`:''}${lesson?.videoUrl?'':`<div class="reading-audio"><button data-recite aria-pressed="false">听朗诵</button></div>`}<span data-reader-status role="status"></span></div><div data-original class="reading-verses ${poetry?'is-poetry':''}">${readerCard.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</div>${poetry?`<div data-meaning hidden>${explanationMarkup(card.explanation)}</div>`:''}<p class="reading-credit">${poetry?'语音朗读 · 原文与白话解读<br>福福学堂 · 原创主题配图':lesson?'原创白板手绘动画 · 福福学堂':'福福学堂 · 观察与发现'}</p></div>`;
      reader.querySelectorAll('[data-reading-view]').forEach(button=>button.onclick=()=>switchReadingView(button));
      reader.scrollTop=0;
      reader.querySelector('.reading-close').onclick=closeReader;const reciteButton=reader.querySelector('[data-recite]');if(reciteButton){reciteButton.onclick=recite;reciteButton.textContent=poetry?'听朗诵':'听讲解';}
      if(lesson)scienceVideoCleanup=window.FufuScienceVideos.mount(reader,lesson);
      if(autoplay){if(lesson?.videoUrl)reader.querySelector('video')?.play().catch(()=>{});else if(lesson)reader.querySelector('[data-video-toggle]')?.click();else recite();}
    }catch(_){if(request===detailRequest&&reader.open)reader.querySelector('.reading-loading').textContent='卡片暂时打不开，请关闭后再试一次。';}
  }
  function cardMarkup(card){
    const lesson=kind==='science'?window.FufuScienceVideos?.get(card.slug,card.title):null;
    return `<article class="reading-card"><button class="reading-open" data-reading-id="${card.id}" aria-label="阅读${escape(card.title)}">${card.image_path?artwork(card):`<div class="science-card-mark" aria-hidden="true">${escape(card.collection)}</div>`}<div class="reading-card-text"><small>${escape(card.collection)}${card.author?' · '+escape(card.author):''}${lesson?' · ✎ 手绘视频':''}</small><h3>${escape(lesson?.title||card.title)}</h3><p>${escape(lesson?.description||card.subtitle)}</p></div></button><button class="reading-listen" ${lesson?`data-watch-id="${card.id}"`:`data-listen-id="${card.id}"`}>${lesson?'看手绘视频':kind==='poetry'?'听朗诵':'听讲解'} <span aria-hidden="true">▷</span></button></article>`;
  }
  async function load(append=false){
    if(loading||!host)return;loading=true;const token=++generation,container=host;
    const more=container.querySelector('[data-reading-more]');if(more){more.disabled=true;more.textContent='正在加载…';}
    const status=container.querySelector('[data-reading-count]');status.textContent='正在打开卡片…';
    try{
      const params=new URLSearchParams({kind,page:String(page),q:query,collection});
      const response=await fetch(`${base()}/api/learning/reading-cards?${params}`);if(!response.ok)throw Error();
      const data=await response.json();if(token!==generation||host!==container)return;
      failed=false;total=data.total;const grid=container.querySelector('.reading-grid');
      if(!append)grid.innerHTML='';grid.insertAdjacentHTML('beforeend',data.cards.map(cardMarkup).join(''));
      if(!total)grid.innerHTML='<p class="reading-empty">没有找到，试试其他诗题、作者或关键词。</p>';
      const select=container.querySelector('[data-reading-filter]');if(select.options.length===1){
        data.collections.forEach(c=>{const option=document.createElement('option');option.value=c.collection;option.textContent=`${c.collection} · ${c.total}`;select.appendChild(option);});
      }
      status.textContent=`共 ${total} ${kind==='poetry'?'首':'张'} · 已显示 ${grid.querySelectorAll('.reading-card').length}`;
      more.hidden=page*data.page_size>=total;more.textContent='再看一些';more.disabled=false;
    }catch(_){if(token===generation){failed=true;status.textContent='卡片暂时加载失败，请重试。';more.hidden=false;more.disabled=false;more.textContent='重新加载';}}
    finally{if(token===generation)loading=false;}
  }
  function render(container,chosen){
    leave();host=container;kind=chosen;page=1;query='';collection='';failed=false;
    container.innerHTML=`<form class="reading-toolbar"><label class="sr-only" for="readingQuery">搜索卡片</label><input id="readingQuery" type="search" maxlength="80" placeholder="${kind==='poetry'?'搜索诗题、作者或首句':'搜索科学卡片'}"><button type="submit">搜索</button><label class="sr-only" for="readingFilter">卡片类型</label><select id="readingFilter" data-reading-filter><option value="">${kind==='poetry'?'全部诗词':'全部主题'}</option></select></form><p class="reading-count" data-reading-count role="status"></p><div class="reading-grid"></div><button class="reading-more" data-reading-more hidden>再看一些</button>${kind==='poetry'?'<p class="reading-footnote">古典诗词 · 原文、释义与语音朗读</p>':''}`;
    const refresh=()=>{closeReader();generation++;loading=false;page=1;load();};
    container.querySelector('form').addEventListener('submit',event=>{event.preventDefault();query=container.querySelector('input').value.trim();refresh();});
    container.querySelector('select').addEventListener('change',event=>{collection=event.target.value;refresh();});
    container.querySelector('[data-reading-more]').addEventListener('click',()=>{if(!failed)page++;load(page>1);});
    container.addEventListener('click',event=>{const open=event.target.closest('[data-reading-id]'),listen=event.target.closest('[data-listen-id]'),watch=event.target.closest('[data-watch-id]');if(open||listen||watch){const button=open||listen||watch;openCard(button.dataset[open?'readingId':listen?'listenId':'watchId'],!!listen||!!watch);}});
    load();
  }
  window.FufuTTS.onCancel(resetPlayback);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)window.FufuTTS.cancel();});
  window.FufuReadingCards={render,leave,open:openCard};
})();
