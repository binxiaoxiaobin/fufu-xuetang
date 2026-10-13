/* One articulated illustration plays at a time. Learning text comes from MySQL. */
(() => {
  'use strict';
  const actions = new Set(['jump','walk','run','wave','clap','kick','throw','read','drink','sleep']);
  let generation = 0, active = null, timer = 0, audio = null, observer = null;
  let cached = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function stop() {
    generation++;
    clearTimeout(timer);
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio.remove(); audio = null; }
    if (active) {
      active.classList.remove('is-playing');
      active.querySelector('.ac-play').setAttribute('aria-pressed','false');
      active.querySelector('.ac-status').textContent = '点一下，看动作 · 听单词';
      active = null;
      window.FufuTTS?.cancel();
    }
  }
  function leave() { generation++; stop(); observer?.disconnect(); observer = null; }
  async function pronounce(card, kind, token) {
    const path = card[kind === 'word' ? 'word_audio' : 'sentence_audio'];
    if (path && path.startsWith('/assets/audio/')) {
      audio = new Audio(path);
      audio.hidden = true;
      active?.appendChild(audio);
      const playingAudio = audio;
      try { await playingAudio.play(); return; } catch (_) { if(token !== generation) return; }
    }
    if (token !== generation) return;
    const result = await window.FufuTTS.speak(card[kind], 'en-US');
    if (!result.hit && token === generation && active) window.browserSpeak(card[kind], 'en-US');
  }
  function play(element, card, kind) {
    stop();
    const token = ++generation;
    active = element;
    // Restart keyframes even when the same card is selected again.
    void element.offsetWidth;
    element.classList.add('is-playing');
    element.querySelector('.ac-play').setAttribute('aria-pressed','true');
    element.querySelector('.ac-status').textContent = kind === 'word' ? '看动作，跟着读一遍' : '听例句，也试着说一遍';
    pronounce(card,kind,token).catch(() => {
      if (token === generation) element.querySelector('.ac-status').textContent = '语音暂不可用，点一下重试';
    });
    // Demonstrate a complete short sequence, never leave offscreen animations running.
    timer = setTimeout(() => { if(token === generation) stop(); }, 6500);
  }
  async function load() {
    if (cached) return cached;
    const response = await fetch(`${window.FUFU_API_BASE || ''}/api/learning/action-cards`);
    if (!response.ok) throw new Error('加载失败');
    const data = await response.json();
    const cards = data.cards.filter(card => actions.has(card.slug));
    const paths = [...new Set(cards.map(card => card.image_path))];
    const illustrations = new Map();
    await Promise.all(paths.map(async path => {
      if (path !== '/assets/interface/action-child.svg') throw new Error('插画路径不支持');
      const image = await fetch(`${path}?v=20261008-actions-2`);
      if (!image.ok) throw new Error('插画加载失败');
      const source = await image.text();
      const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
      if (svg.localName !== 'svg' || svg.querySelector('script,foreignObject')) throw new Error('插画格式错误');
      // Only our bundled SVG is supported; disallow external references and handlers.
      for (const node of [svg, ...svg.querySelectorAll('*')]) {
        for (const attr of [...node.attributes]) {
          if (/^on/i.test(attr.name) || /href/i.test(attr.name)) node.removeAttribute(attr.name);
        }
      }
      illustrations.set(path, svg.outerHTML);
    }));
    cached = {cards,illustrations};
    return cached;
  }
  async function render(host) {
    leave();
    const token = generation;
    host.innerHTML = '<p class="ac-loading" role="status">正在准备动作卡片…</p>';
    try {
      const {cards,illustrations} = await load();
      if (token !== generation || !host.isConnected) return;
      if (!cards.length) throw new Error('卡片准备中');
      host.innerHTML = `<div class="ac-intro"><span class="ac-intro-icon" aria-hidden="true">▶</span><div><b>看一看 · 听一听 · 跟着做</b><p>点插画听单词，点下面的句子听例句。一次学一个动作。</p></div><span class="ac-count">${cards.length} 个动作词</span></div>` +
        [...new Set(cards.map(card => card.group))].map(group => `<section class="ac-section"><h2>${escape(group)}</h2><div class="ac-grid">${cards.filter(card => card.group === group).map(card => `<article class="action-card ac-${card.slug} ac-${['green','blue','peach','lilac','yellow'].includes(card.color) ? card.color : 'green'}" data-action="${card.slug}"><button class="ac-play" type="button" aria-pressed="false" aria-label="演示并朗读 ${escape(card.word)}，${escape(card.meaning)}"><span class="ac-art">${illustrations.get(card.image_path)}</span><span class="ac-word" lang="en">${escape(card.word)}<span class="ac-sound" aria-hidden="true">♪</span></span><span class="ac-meaning">${escape(card.meaning)}</span><span class="ac-hint">${escape(card.hint)}</span></button><div class="ac-status" role="status">点一下，看动作 · 听单词</div><button class="ac-example" type="button" aria-label="听例句 ${escape(card.sentence)}"><span lang="en">${escape(card.sentence)}</span><small>${escape(card.translation)}</small><span class="ac-example-play" aria-hidden="true">▷</span></button></article>`).join('')}</div></section>`).join('');
      host.querySelectorAll('.action-card').forEach(element => {
        const card = cards.find(card => card.slug === element.dataset.action);
        element.querySelector('.ac-play').addEventListener('click', () => play(element,card,'word'));
        element.querySelector('.ac-example').addEventListener('click', () => play(element,card,'sentence'));
      });
      observer = new IntersectionObserver(entries => {
        for(const entry of entries) if(entry.target === active && !entry.isIntersecting) {generation++;stop();}
      });
      host.querySelectorAll('.action-card').forEach(element => observer.observe(element));
    } catch (_) {
      if (token !== generation) return;
      host.innerHTML = '<div class="ac-loading"><p>卡片暂时没加载出来。</p><button type="button">再试一次</button></div>';
      host.querySelector('button').onclick = () => render(host);
    }
  }
  document.addEventListener('visibilitychange', () => { if(document.hidden) {generation++;stop();} });
  window.addEventListener('pagehide',leave);
  window.addEventListener('fufu-auth-changed', () => {leave();cached=null;});
  window.FufuActionCards = {render, leave, onNavigate(page) { if(page !== 'cards') leave(); }};
})();
