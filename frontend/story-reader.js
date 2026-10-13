/* Long picture books: one illustration per page, persistent first-reading rewards. */
window.FufuStoryReader = (() => {
  let generation = 0, audioGeneration = 0, timer = null, cancelClip = null;
  const stopAudio = () => {
    audioGeneration++; cancelClip?.(); cancelClip = null;
    FufuTTS.cancel(); speechSynthesis.cancel();
    if($('#listenWholeStory')) $('#listenWholeStory').textContent = '连续听故事';
  };
  async function cancellable(promise) {
    let cancel;
    const canceled = new Promise(resolve => { cancel = () => resolve({interrupted:true,hit:true}); });
    cancelClip = cancel;
    try { return await Promise.race([promise,canceled]); }
    finally { if(cancelClip === cancel) cancelClip = null; }
  }
  function close() {
    generation++; clearInterval(timer); stopAudio();
    $('#storyModal').classList.remove('open');
    window.dispatchEvent(new Event('fufu-story-closed'));
  }
  function speech(text, token) {
    return new Promise(resolve => {
      if(token !== audioGeneration) return resolve(false);
      const line = new SpeechSynthesisUtterance(smoothSpeechText(text, 'zh-CN'));
      line.lang = 'zh-CN'; line.rate = .9; line.pitch = 1;
      const voice = preferredVoice('zh-CN'); if(voice) line.voice = voice;
      line.onend = () => resolve(token === audioGeneration);
      line.onerror = () => resolve(false);
      speechSynthesis.speak(line);
    });
  }
  async function open(story) {
    stopAudio(); clearInterval(timer);
    const session = ++generation;
    let page = 0, requestedPage = 0, displayGeneration = 0, progress = null, pending = Promise.resolve(), waitUntil = 0, claiming = false;
    const pictures = new Map();
    function picture(index) {
      if(pictures.has(index)) return pictures.get(index);
      const image = new Image();
      const ready = new Promise(resolve => {
        let settled = false;
        const finish = okay => { if(settled) return; settled = true; clearTimeout(timeout); image.onload = image.onerror = null; resolve(okay ? image : null); };
        const timeout = setTimeout(() => finish(false), 15000);
        image.onload = async () => { try { await image.decode(); } catch {} finish(image.naturalWidth > 0); };
        image.onerror = () => finish(false);
        image.src = paragraphArt(story, index);
      });
      pictures.set(index, ready);
      for(const key of pictures.keys()) if(Math.abs(key-index) > 2) pictures.delete(key);
      return ready;
    }
    const viewed = new Set();
    state.story = story; state.paragraph = 0;
    $('#storyHero').style.background = story.color || '#f2e9d6';
    $('#storyHero').innerHTML = `<img id="storyPageImage" alt=""><span class="story-image-number" id="storyImageNumber"></span>`;
    $('#storyBody').innerHTML = `<div class="story-reader-kicker"><span>${escapeHtml(storyCategory(story))} · ${escapeHtml(story.age)}</span><span>亲子伴读 · 约 ${Number(story.reading_minutes)||3} 分钟</span></div><h2>${escapeHtml(story.title)}</h2><div class="story-reader-progress"><span id="storyProgress"></span></div><div class="story-reader-position"><span id="storyCounter"></span><span id="storyRewardHint" role="status">首次读完可获得 5 积分</span></div><div class="story-copy"><p class="story-paragraph" id="storyParagraph"></p><div id="storyAfterword" hidden>${story.moral?`<p class="story-moral"><b>一起想一想</b><br>${escapeHtml(story.moral)}</p>`:''}${story.conversation?`<p class="story-conversation">${escapeHtml(story.conversation)}</p>`:''}</div></div><div class="story-reader-footer"><div class="story-controls"><button id="listenStory" type="button">听这一页</button><button class="secondary" id="listenWholeStory" type="button">连续听故事</button></div><div class="story-page-controls"><button class="secondary" id="prevParagraph" type="button">← 上一页</button><button id="nextParagraph" type="button">下一页 →</button></div><button class="story-reward-button" id="claimStoryReward" type="button" hidden>读完了，领取 5 积分</button><p id="storyReadingStatus" role="status" aria-live="polite"></p></div>`;
    $('#storyModal').classList.add('open');
    function rewardUI() {
      if(session !== generation) return;
      const end = page === story.paragraphs.length - 1;
      const button = $('#claimStoryReward');
      button.hidden = !end;
      const wait = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
      button.disabled = claiming || !!progress?.completed || !progress || progress.visited < story.paragraphs.length || wait > 0;
      button.textContent = progress?.completed ? '这篇已读过，奖励已记录' : wait && end ? `慢慢读，${wait} 秒后可领积分` : '读完了，领取 5 积分';
      $('#storyRewardHint').textContent = progress?.completed ? '已读 · 积分已记录' : '首次读完 +5 积分';
    }
    async function syncPages() {
      if(session !== generation) return;
      if(!progress) progress = await api(`/stories/${story.id}/reading`);
      for(const seen of [...viewed].sort((a,b)=>a-b)) {
        if(progress.completed || seen < progress.visited) continue;
        if(seen !== progress.visited) break;
        progress = await api(`/stories/${story.id}/reading`, {method:'POST', body:JSON.stringify({page:seen})});
        waitUntil = Date.now() + progress.wait_seconds * 1000;
      }
      if(session === generation) { $('#storyReadingStatus').textContent = ''; rewardUI(); }
    }
    function savePage() {
      viewed.add(page);
      pending = pending.then(syncPages).catch(error => {
        if(session === generation) $('#storyReadingStatus').textContent = `${error.message}（翻页或领取时会重试）`;
      });
      return pending;
    }
    async function display(nextPage, stop = true) {
      if(session !== generation) return false;
      if(stop) stopAudio();
      requestedPage = nextPage;
      const frame = ++displayGeneration;
      $('#storyHero').setAttribute('aria-busy','true');
      $('#listenStory').disabled = true;
      $('#listenWholeStory').disabled = stop;
      const image = await picture(nextPage);
      if(session !== generation || frame !== displayGeneration) return false;
      page = nextPage; state.paragraph = page;
      if(image) {
        image.id = 'storyPageImage';
        image.alt = `${story.title}，第 ${page+1} 页插图`;
        const previous = $('#storyPageImage');
        if(previous !== image) previous.replaceWith(image);
      } else {
        const empty = document.createElement('img'); empty.id = 'storyPageImage';
        empty.alt = '本页插图暂时无法加载';
        $('#storyPageImage').replaceWith(empty);
        pictures.delete(page);
      }
      $('#storyHero').removeAttribute('aria-busy');
      $('#listenStory').disabled = $('#listenWholeStory').disabled = false;
      $('#storyImageNumber').textContent = `${page+1} / ${story.paragraphs.length}`;
      $('#storyParagraph').textContent = story.paragraphs[page];
      $('#storyCounter').textContent = `第 ${page+1} 页 / 共 ${story.paragraphs.length} 页`;
      $('#storyProgress').style.width = `${(page+1)/story.paragraphs.length*100}%`;
      $('#prevParagraph').disabled = page === 0;
      $('#nextParagraph').disabled = page === story.paragraphs.length - 1;
      $('#storyAfterword').hidden = page !== story.paragraphs.length - 1;
      $('#storyBody .story-copy').scrollTop = 0;
      rewardUI(); savePage();
      if(page + 1 < story.paragraphs.length) picture(page+1);
      return true;
    }
    async function narrate(continuous) {
      stopAudio(); const token = audioGeneration;
      const start = page, end = continuous ? story.paragraphs.length : page+1;
      $('#listenWholeStory').textContent = '停止朗读';
      try {
        for(let i = start; i < end && token === audioGeneration && session === generation; i++) {
          if(!await display(i, false) || token !== audioGeneration || session !== generation) break;
          let okay;
          if(story.audio_paths?.[i]) {
            const result = await cancellable(FufuTTS.playUrls([story.audio_paths[i]]));
            okay = !result.error && !result.interrupted;
            if(result.error && !result.interrupted) okay = await speech(story.paragraphs[i], token);
          } else {
            const result = await cancellable(FufuTTS.speakChain([story.paragraphs[i]]));
            okay = result.hit && !result.interrupted && token === audioGeneration;
            if(!result.hit && token === audioGeneration) okay = await speech(story.paragraphs[i], token);
          }
          if(!okay) break;
        }
      } finally { if(session === generation && token === audioGeneration) $('#listenWholeStory').textContent = '连续听故事'; }
    }
    $('#prevParagraph').onclick = () => display(Math.max(0,requestedPage-1));
    $('#nextParagraph').onclick = () => display(Math.min(story.paragraphs.length-1,requestedPage+1));
    $('#listenStory').onclick = () => narrate(false);
    $('#listenWholeStory').onclick = () => $('#listenWholeStory').textContent === '停止朗读' ? (stopAudio(), $('#listenWholeStory').textContent = '连续听故事') : narrate(true);
    $('#claimStoryReward').onclick = async () => {
      if(claiming) return;
      claiming = true; rewardUI();
      try {
        await pending; await syncPages();
        const result = await api(`/stories/${story.id}/complete`, {method:'POST',body:'{}'});
        if(session !== generation) return;
        progress = result; rewardUI();
        $('#storyReadingStatus').textContent = result.awarded ? '这篇故事读完啦！5 积分已存入，家长中心可以查看。' : '阅读奖励已经记录，可以随时再读这个故事。';
        await refreshProfile();
      } catch(error) { if(session === generation) $('#storyReadingStatus').textContent = error.message; }
      finally { claiming = false; rewardUI(); }
    };
    display(0);
    timer = setInterval(rewardUI, 1000);
  }
  window.addEventListener('fufu-auth-changed', close);
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && $('#storyModal')?.classList.contains('open')) close();
  });
  return {open,close};
})();
