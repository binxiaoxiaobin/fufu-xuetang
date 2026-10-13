(() => {
  'use strict';
  let host = null;
  let songs = [];
  let selected = null;
  let playToken = 0;
  let songPlayer = null;
  const licenseLinks = {
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY-NC 3.0': 'https://creativecommons.org/licenses/by-nc/3.0/',
    'Public Domain dedication': 'https://creativecommons.org/publicdomain/zero/1.0/'
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const speak = (text, token) => {
    const tts = window.FufuTTS;
    if (!tts) { window.browserSpeak?.(text, 'en-US'); return; }
    tts.speak(text, 'en-US').then(result => {
      if (token === playToken && !result.hit && !result.interrupted) window.browserSpeak?.(result.text, 'en-US');
    }).catch(() => { if (token === playToken) window.browserSpeak?.(text, 'en-US'); });
  };
  function wordsMarkup(line) {
    const parts = line.split(/([A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*)/g).filter(Boolean);
    return parts.map(part => /^[A-Za-z]/.test(part)
      ? `<button type="button" class="ens-word" data-say="${escape(part)}" aria-label="听单词 ${escape(part)}">${escape(part)}</button>`
      : `<span class="ens-punctuation">${escape(part)}</span>`).join('');
  }
  function syncHighlight() {
    if (!songPlayer || !selected) return;
    const now = Math.round(songPlayer.currentTime * 1000);
    const active = selected.lines.findIndex(line => now >= Number(line.start_ms || 0) && now < Number(line.end_ms || 0));
    host?.querySelectorAll('.ens-line').forEach((line, index) => {
      const isActive = index === active && !songPlayer.paused;
      line.classList.toggle('is-singing', isActive);
      if (isActive) line.setAttribute('aria-current', 'true'); else line.removeAttribute('aria-current');
    });
  }
  function paint() {
    if (!host) return;
    const licenseUrl = licenseLinks[selected?.audio_license] || '';
    host.innerHTML = `<section class="ens-wrap"><div class="ens-intro"><div class="ens-note-icon" aria-hidden="true">🎵</div><div><b>听歌学英语</b><p>跟着歌声看歌词变色，点歌词里的单词可单独听发音。</p></div></div><div class="ens-song-list" role="list" aria-label="儿童英文儿歌">${songs.map(song => `<button type="button" class="ens-song-card ${selected?.slug===song.slug?'is-selected':''}" data-song="${escape(song.slug)}" aria-pressed="${selected?.slug===song.slug}"><span class="ens-song-emoji" aria-hidden="true">${escape(song.emoji)}</span><span class="ens-song-copy"><b>${escape(song.title)}</b><small>${escape(song.title_zh)}</small></span><span class="ens-song-arrow" aria-hidden="true">${selected?.slug===song.slug?'✓':'›'}</span></button>`).join('')}</div>${selected ? `<article class="ens-lyrics"><header class="ens-lyrics-head"><div><span class="ens-kicker">SING ALONG</span><h2>${escape(selected.title)}</h2><p>${escape(selected.title_zh)} · ${escape(selected.summary)}</p></div><span class="ens-big-emoji" aria-hidden="true">${escape(selected.emoji)}</span></header><p class="ens-help">播放时正在唱的歌词会以绿色标出；点击任一英文单词，听它的单独发音。</p>${selected.audio_path?`<div class="ens-song-player"><div><b>${selected.media_kind==='video'?'🎤 看着唱':'🎤 跟着唱'}</b><small>人声演唱 · 歌词会跟随播放高亮</small></div>${selected.media_kind==='video'?`<video controls playsinline preload="metadata" aria-label="播放 ${escape(selected.title)} 演唱" src="${escape(selected.audio_path)}"></video>`:`<audio controls preload="metadata" aria-label="播放 ${escape(selected.title)} 演唱" src="${escape(selected.audio_path)}"></audio>`}<small class="ens-audio-credit">演唱与音频：<a href="${escape(selected.audio_source_url)}" target="_blank" rel="noreferrer">${escape(selected.audio_source_name)}</a> · <a href="${escape(licenseUrl)}" target="_blank" rel="noreferrer">${escape(selected.audio_license)}</a></small></div>`:''}<div class="ens-lines">${selected.lines.map(line=>`<section class="ens-line"><div class="ens-lyric" lang="en">${wordsMarkup(line.lyric)}</div><p class="ens-translation">${escape(line.translation)}</p></section>`).join('')}</div><footer class="ens-source">儿歌介绍：<a href="${escape(selected.source_url)}" target="_blank" rel="noreferrer">查看来源</a></footer></article>`:''}</section>`;
    songPlayer=host.querySelector('.ens-song-player audio, .ens-song-player video');
    songPlayer?.addEventListener('play',()=>{playToken++;window.FufuTTS?.cancel('song-playback');syncHighlight();});
    songPlayer?.addEventListener('pause',syncHighlight);
    songPlayer?.addEventListener('timeupdate',syncHighlight);
    songPlayer?.addEventListener('seeked',syncHighlight);
    songPlayer?.addEventListener('ended',syncHighlight);
    host.querySelectorAll('[data-song]').forEach(button => button.addEventListener('click', () => {
      stopSongPlayer(); window.FufuTTS?.cancel('song-switch'); playToken++;
      selected = songs.find(song => song.slug === button.dataset.song) || null; paint();
      host.querySelector('.ens-lyrics')?.scrollIntoView({behavior:'smooth',block:'start'});
    }));
    host.querySelectorAll('[data-say]').forEach(button => button.addEventListener('click', () => {
      stopSongPlayer(); playToken++; window.FufuTTS?.cancel('song-word'); speak(button.dataset.say,playToken);
      button.classList.add('is-speaking'); setTimeout(()=>button.classList.remove('is-speaking'),650);
    }));
  }
  async function render(container) {
    leave(); host=container; host.innerHTML='<p class="ens-loading" role="status">正在准备儿歌卡片…</p>';
    const token=playToken;
    try {
      const response=await fetch(`${window.FUFU_API_BASE||''}/api/learning/english-songs`);
      if(!response.ok)throw new Error('加载失败');
      const data=await response.json();
      if(token!==playToken||!container.isConnected)return;
      songs=Array.isArray(data.songs)?data.songs:[];
      if(!songs.length)throw new Error('暂时没有儿歌内容');
      selected=songs[0]; paint();
    } catch(error) {
      if(container.isConnected)host.innerHTML='<p class="ens-loading" role="status">儿歌暂时没有加载出来，请稍后再试。</p>';
    }
  }
  function stopSongPlayer() { if(songPlayer){songPlayer.pause();songPlayer.currentTime=0;songPlayer=null;} }
  function leave() { playToken++; stopSongPlayer(); window.FufuTTS?.cancel('leave-english-songs'); host=null; }
  window.FufuEnglishSongs={render,leave};
})();
