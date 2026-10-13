// 团团语音层：优先播放预生成的神经网络女声 mp3；清单未命中时请求 /api/tts 按需合成
// （后端落盘缓存，之后等同预生成）；仍失败才由 app.js 回退浏览器朗读。
// 清单由 scripts/tts_build.py 生成：/assets/audio/tts/manifest.json
// 键 = sha1(normalize(text)) 前 12 位，normalize 必须与 tts_build.py 完全一致。
//
// ⚠️ 平板上曾出现"只有故事和黏土世界有声音"，两条平台规矩是原因，改这个文件时别踩回去：
//
// 1) crypto.subtle 只在【安全上下文】存在（HTTPS 或 localhost）。
//    本项目是 http://<局域网或 Tailscale 的 IP>:8000 —— 明文 HTTP，不是安全上下文，
//    window.crypto.subtle 是 undefined。用它算清单键会直接抛异常，speak() 整条
//    Promise 链无声崩掉（故事走 playUrls 直接给 URL、不经过哈希，所以只有它是响的）。
//    在电脑上用 localhost 调试永远复现不出来 —— localhost 算安全上下文。
//    → 这里改用下面的纯 JS SHA-1，与 crypto.subtle 逐位等价（16 组向量已交叉验证）。
//
// 2) iOS 对 <audio>.play() 的限制是"手势令牌"级的：中间只要夹了 fetch，手势就过期，
//    play() 被静默拒绝。AudioContext 不同 —— 在手势里 resume() 过一次后，之后任何
//    时刻 start() 都能出声。所以主播放路径走 Web Audio（黏土世界一直有声音，正是因为
//    它用的就是 Web Audio），<audio> 元素退居兜底。
(function () {
  'use strict';
  var MANIFEST_URL = '/assets/audio/tts/manifest.json?v=20261010-reader-letters-1';
  var manifest = null;
  var manifestPromise = null;
  var audioEl = null;
  var playToken = 0;
  var cancelHooks = [];

  // ================================================================ 纯 JS SHA-1
  // 替代 crypto.subtle.digest('SHA-1', ...) —— 后者在非安全上下文不存在。
  function utf8Bytes(str) {
    // encodeURIComponent 后把 %XX 还原成字节，得到 UTF-8 字节序列。
    // 不用 TextEncoder：某些老 WebKit 上不可用，而 encodeURIComponent 人人都有。
    var s = encodeURIComponent(String(str));
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) === '%') {
        out.push(parseInt(s.substr(i + 1, 2), 16));
        i += 2;
      } else {
        out.push(s.charCodeAt(i));
      }
    }
    return out;
  }

  function sha1Hex(input) {
    function rotl(n, s) { return ((n << s) | (n >>> (32 - s))) >>> 0; }

    var bytes = utf8Bytes(input);
    var ml = bytes.length * 8;
    var msg = bytes.slice();
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    msg.push(0, 0, 0, 0);                                    // 长度高 32 位（文本远不足 512MB）
    msg.push((ml >>> 24) & 0xff, (ml >>> 16) & 0xff, (ml >>> 8) & 0xff, ml & 0xff);

    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

    for (var i = 0; i < msg.length; i += 64) {
      var w = new Array(80);
      for (var j = 0; j < 16; j++) {
        w[j] = ((msg[i + j * 4] << 24) | (msg[i + j * 4 + 1] << 16) |
                (msg[i + j * 4 + 2] << 8) | msg[i + j * 4 + 3]) >>> 0;
      }
      for (j = 16; j < 80; j++) {
        w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (j = 0; j < 80; j++) {
        var f, k;
        if (j < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var t = (rotl(a, 5) + (f >>> 0) + e + k + w[j]) >>> 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }

    return [h0, h1, h2, h3, h4].map(function (x) {
      return ('0000000' + (x >>> 0).toString(16)).slice(-8);
    }).join('');
  }

  function keyOf(norm, voiceProfile) {
    return sha1Hex(voiceProfile ? voiceProfile + '\0' + norm : norm).slice(0, 12);
  }

  // ================================================================ Web Audio 播放引擎
  // iOS 上唯一可靠的"异步播放"通道：AudioContext 在手势里被唤醒后就不再受手势约束。
  var waCtx = null, waGain = null, waSource = null, waArmed = false;
  var waCache = {}, waOrder = [];
  var WA_CACHE_MAX = 32;          // 约几 MB：每条 mp3 解码成 PCM 约 100~200KB
  var waCacheBytes = 0;
  var WA_CACHE_BYTES_MAX = 16 * 1024 * 1024; // Long recitations also need a byte limit on iPad.

  function waCreate() {
    if (waCtx) return waCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      waCtx = new Ctx();
      waGain = waCtx.createGain();
      waGain.gain.value = 1;
      waGain.connect(waCtx.destination);
    } catch (e) { waCtx = null; }
    return waCtx;
  }

  // 在用户手势里调用：resume + 真播一个采样点，把整条通道激活
  function waArm() {
    var ctx = waCreate();
    if (!ctx) return;
    waArmed = true;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    try {
      var s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) {}
  }

  function waRemember(url, buf) {
    if (waCache[url]) return;
    var bytes = buf.length * buf.numberOfChannels * 4;
    if (bytes > WA_CACHE_BYTES_MAX) return;
    waCache[url] = buf;
    waOrder.push(url);
    waCacheBytes += bytes;
    while (waOrder.length > WA_CACHE_MAX || waCacheBytes > WA_CACHE_BYTES_MAX) {
      var old = waOrder.shift();
      waCacheBytes -= waCache[old].length * waCache[old].numberOfChannels * 4;
      delete waCache[old];
    }
  }

  var waPending = {};
  function waBuffer(url) {
    if (waCache[url]) return Promise.resolve(waCache[url]);
    if (waPending[url]) return waPending[url];
    waPending[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var ctx = waCreate();
      if (!ctx) throw new Error('no audio context');
      return new Promise(function (resolve, reject) {
        // 兼容两种签名：新 WebKit 返回 Promise，老 WebKit 只认回调；
        // decodeAudioData 会转移 arrayBuffer 所有权，所以这个 buf 只提交一次。
        var settled = false;
        var ok = function (b) { if (!settled) { settled = true; resolve(b); } };
        var no = function () { if (!settled) { settled = true; reject(new Error('decode failed')); } };
        var ret = ctx.decodeAudioData(buf, ok, no);
        if (ret && ret.then) ret.then(ok, no);
      });
    }).then(function (b) { waRemember(url, b); return b; }).finally(function () { delete waPending[url]; });
    return waPending[url];
  }

  // Only trim recording silence in word practice. Leave a generous boundary
  // around speech so quiet initial/final consonants remain intact.
  function readerBounds(buffer) {
    if (!buffer.getChannelData || !buffer.sampleRate) return null;
    var data = buffer.getChannelData(0), first = 0, last = data.length - 1;
    while (first < last && Math.abs(data[first]) < 0.001) first++;
    while (last > first && Math.abs(data[last]) < 0.001) last--;
    if (last <= first) return null;
    var start = Math.max(0, first / buffer.sampleRate - 0.08);
    var end = Math.min(data.length / buffer.sampleRate, (last + 1) / buffer.sampleRate + 0.10);
    return { start: start, duration: end - start };
  }

  function waStop() {
    if (!waSource) return;
    try { waSource.onended = null; } catch (e) {}
    try { waSource.stop(); } catch (e) {}
    try { waSource.disconnect(); } catch (e) {}
    waSource = null;
  }

  function waPlay(buffer, myToken, options) {
    var ctx = waCreate();
    if (!ctx) return Promise.resolve(false);
    return new Promise(function (resolve) {
      waStop();
      var src;
      try {
        src = ctx.createBufferSource();
        src.buffer = buffer;
        if (src.playbackRate) src.playbackRate.value = options && options.readerPace ? 1.05 : 1;
        src.connect(waGain);
      } catch (e) { return resolve(false); }
      waSource = src;

      var guard = setTimeout(function () {
        // 350ms 后通道还没跑起来 = 这次 AudioContext 没被真正唤醒，
        // 立刻放弃，让调用方退回 <audio> 元素，别让用户干等。
        if (waSource === src && ctx.state !== 'running') {
          waSource = null;
          try { src.onended = null; src.stop(); } catch (e) {}
          resolve(false);
        }
      }, 350);

      src.onended = function () {
        clearTimeout(guard);
        if (waSource === src) waSource = null;
        resolve(playToken === myToken);
      };

      var begin = function () {
        if (playToken !== myToken || waSource !== src) { clearTimeout(guard); resolve(false); return; }
        try {
          var bounds = options && options.readerPace ? readerBounds(buffer) : null;
          if (bounds) src.start(0, bounds.start, bounds.duration);
          else src.start(0);
        } catch (e) { waSource = null; clearTimeout(guard); resolve(false); }
      };
      if (ctx.state !== 'running') {
        var r;
        try { r = ctx.resume(); } catch (e) { r = null; }
        if (r && r.then) { r.then(begin, function () { clearTimeout(guard); resolve(false); }); return; }
      }
      begin();
    });
  }

  // ================================================================ <audio> 兜底
  // iOS 的解锁是元素级的，且要求 play() 落在手势里 —— 异步链上经常被拒，只在
  // Web Audio 不可用时才走这条路。
  var sharedAudio = null;

  function shared() {
    if (!sharedAudio) { sharedAudio = new Audio(); sharedAudio.preload = 'auto'; }
    return sharedAudio;
  }

  function stopAudioOnly() {
    if (audioEl) {
      audioEl.onended = null;
      audioEl.onerror = null;
      audioEl.pause();
      try { audioEl.currentTime = 0; } catch (e) {}
      audioEl = null;
    }
  }

  function stopAll() {
    stopAudioOnly();
    waStop();
  }

  function playViaElement(url, myToken, options) {
    return new Promise(function (resolve) {
      var el = shared();
      audioEl = el;
      el.src = url;
      el.playbackRate = options && options.readerPace ? 1.05 : 1;
      var finish = function (ok) { if (playToken === myToken) { stopAudioOnly(); resolve(ok); } };
      el.onended = function () { finish(true); };
      el.onerror = function () { finish(false); };
      var ret = el.play();
      if (ret && ret.catch) ret.catch(function () { finish(false); });
    });
  }

  // 用既有的 token 播一条（连读时反复调用，所以不能再递增 token）
  // 返回 true=播完 / false=失败 / null=已被新的播放接管（不 resolve，交给新播放）
  function startOne(url, myToken, options) {
    if (waArmed && waCreate()) {
      return waBuffer(url).then(function (buf) {
        if (playToken !== myToken) return null;
        return waPlay(buf, myToken, options);
      }).catch(function () {
        if (playToken !== myToken) return null;
        return playViaElement(url, myToken, options);
      });
    }
    return playViaElement(url, myToken, options);
  }

  function playOne(url) {
    var myToken = ++playToken;
    stopAll();
    return startOne(url, myToken);
  }

  // ================================================================ 清单
  function normalize(value, lang) {
    var text = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(/[×✕]/g, '乘').replace(/[÷]/g, '除以').replace(/[＝=]/g, '等于');
    text = text.replace(/\s*([，。！？；：、,.!?;:])/g, '$1');
    if (text && !/[。！？.!?]$/.test(text)) {
      text += String(lang || 'zh-CN').toLowerCase().indexOf('zh') === 0 ? '。' : '.';
    }
    text = text.replace(/([。！？；：])(?=\S)/g, '$1 ');
    return text;
  }

  function ensure() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch(MANIFEST_URL)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (m) { manifest = m || {}; return manifest; })
      .catch(function () { manifest = {}; return manifest; });
    return manifestPromise;
  }

  // 清单未命中时请求后端按需合成（落盘缓存），失败由调用方回退浏览器朗读
  function fetchOnDemand(rawText, lang, key, voiceProfile) {
    var api = '/api/tts?text=' + encodeURIComponent(rawText == null ? '' : String(rawText)) +
      '&lang=' + encodeURIComponent(lang || 'zh-CN') +
      (voiceProfile ? '&voice=' + encodeURIComponent(voiceProfile) : '');
    return fetch(api).then(function (r) {
      if (!r.ok) throw new Error('tts ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.url) throw new Error('no url');
      manifest[key] = j.url;
      return j.url;
    });
  }

  // ================================================================ 对外接口
  // 单条：返回 {hit:true} 或 {hit:false,text:规范化文本}
  function speak(rawText, lang, options) {
    var requestedToken = ++playToken;
    stopAll();
    function result(ok) {
      if (playToken !== requestedToken) return { hit: true, interrupted: true };
      return ok ? { hit: true } : { hit: false, text: norm };
    }
    var voiceProfile = options && options.voiceProfile === 'child' ? 'child' : '';
    var norm = normalize(rawText, lang);
    var key = keyOf(norm, voiceProfile);
    // 清单预载完时走同步命中：日志没有 fetch，iOS 的手势令牌还在，
    // 连 <audio> 兜底都有机会被放行。
    var cached = manifest && manifest[key];
    if (cached) {
      return startOne(cached, requestedToken, options).then(result);
    }
    return ensure().then(function () {
      if (playToken !== requestedToken) return { hit: true, interrupted: true };
      var url = manifest[key];
      var urlP = url ? Promise.resolve(url)
        : fetchOnDemand(rawText, lang, key, voiceProfile).catch(function () { return null; });
      return urlP.then(function (u) {
        if (playToken !== requestedToken) return { hit: true, interrupted: true };
        if (!u) return { hit: false, text: norm };
        return startOne(u, requestedToken, options).then(result);
      });
    });
  }

  function chainFromUrls(urls, norms, options) {
    var myToken = ++playToken;
    stopAll();
    return new Promise(function (resolve) {
      var i = 0;
      function next() {
        if (playToken !== myToken) return resolve({ hit: true, interrupted: true });
        if (i >= urls.length) return resolve({ hit: true });
        var u = urls[i++];
        if (options && options.readerPace && urls[i]) waBuffer(urls[i]).catch(function () {});
        startOne(u, myToken, options).then(function (ok) {
          if (playToken !== myToken) return resolve({ hit: true, interrupted: true });
          if (!ok) return resolve({ hit: false, text: (norms || []).join(' ') });
          next();
        });
      }
      next();
    });
  }

  // 多条连读：预生成或按需合成全部就绪后顺序播放，任一不可用则返回 join 后的兜底文本
  function speakChain(rawTexts, lang, options) {
    var requestedToken = ++playToken;
    stopAll();
    var voiceProfile = options && options.voiceProfile === 'child' ? 'child' : '';
    var raws = rawTexts || [];
    var norms = raws.map(function (t) { return normalize(t, lang); });
    var keys = norms.map(function (norm) { return keyOf(norm, voiceProfile); });

    var cached = keys.map(function (k) { return manifest && manifest[k]; });
    if (cached.length && cached.every(Boolean)) return chainFromUrls(cached, norms);

    return ensure().then(function () {
      return Promise.all(keys.map(function (k, i) {
        if (manifest[k]) return Promise.resolve(manifest[k]);
        return fetchOnDemand(raws[i], lang, k, voiceProfile).catch(function () { return null; });
      }));
    }).then(function (urls) {
      if (playToken !== requestedToken) return { hit: true, interrupted: true };
      if (!urls.length || urls.some(function (u) { return !u; })) {
        return { hit: false, text: norms.join(' ') };
      }
      return chainFromUrls(urls, norms);
    });
  }

  // 直接按 URL 列表播放（故事旁白用）。这条路径原本就是同步触发、在 iOS 上一直可用，
  // 所以保持 <audio> 元素实现不动，只把停止动作改成 stopAll（避免和 Web Audio 打架）。
  function playUrls(urls) {
    playToken++;
    var myToken = playToken;
    stopAll();
    return new Promise(function (resolve) {
      var i = 0;
      function next() {
        if (playToken !== myToken) return resolve({ interrupted: true });
        if (i >= urls.length) { audioEl = null; return resolve({ done: true }); }
        var el = shared();
        audioEl = el;
        el.src = urls[i++];
        el.onended = next;
        el.onerror = function () { if (playToken === myToken) { stopAudioOnly(); resolve({ error: true, index: i - 1 }); } };
        var ret = el.play();
        if (ret && ret.catch) ret.catch(function () { if (playToken === myToken) { stopAudioOnly(); resolve({ error: true, index: i - 1 }); } });
      }
      next();
    });
  }

  function cancel(reason) {
    playToken++;
    stopAll();
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
    cancelHooks.slice().forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  function onCancel(fn) { cancelHooks.push(fn); }

  // ================================================================ 手势解锁
  // 只激活 Web Audio，不再去动 <audio> 元素的 src ——
  // 之前那套"每次点击都播一段静音来解锁元素"会劫持正在播放的元素，反而打断故事旁白。
  function unlock() { waArm(); }

  // 手势一出现就解锁：capture 阶段保证先于页面自己的按钮回调执行
  ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(function (type) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  });

  // iOS 切后台会自动挂起 AudioContext，回前台得手动唤醒
  document.addEventListener('visibilitychange', function () {
    if (!waCtx) return;
    if (document.hidden) {
      try { waCtx.suspend(); } catch (e) {}
    } else {
      try { if (waCtx.state !== 'running') waCtx.resume(); } catch (e) {}
    }
  });

  window.FufuTTS = {
    ensure: ensure,
    normalize: normalize,
    speak: speak,
    speakChain: speakChain,
    playUrls: playUrls,
    // Local pronunciation recordings share the gesture-armed Web Audio player on iPad.
    playRecording: function (url, options) { waArm(); return chainFromUrls([url], [], options); },
    playRecordings: function (urls, options) { waArm(); return chainFromUrls(urls, [], options); },
    // Small, bounded warmup only; no playback and no change to the play token.
    preloadRecordings: function (urls) { return Promise.allSettled(urls.filter(Boolean).slice(0,6).map(waBuffer)); },
    cancel: cancel,
    onCancel: onCancel,
    // 排查用：在平板浏览器控制台执行 FufuTTS.diag() 就能看到每一环是否就绪
    diag: function () {
      return {
        secureContext: !!window.isSecureContext,
        cryptoSubtle: !!(window.crypto && window.crypto.subtle),
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        waState: waCtx ? waCtx.state : null,
        waArmed: waArmed,
        manifestLoaded: !!manifest,
        manifestSize: manifest ? Object.keys(manifest).length : 0,
        cachedBuffers: Object.keys(waCache).length,
        cachedBufferBytes: waCacheBytes
      };
    }
  };

  // 首屏资源抢完之后再把清单拉回来，让之后每次 speak() 都走同步命中
  setTimeout(ensure, 600);
})();
