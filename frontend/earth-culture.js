/* One database catalog supplies both visible introductions and their recordings. */
let pending;
export function loadEarthCulture() {
  if (!pending) {
    pending = fetch('/api/geography/culture').then(response => {
      if (!response.ok) throw new Error('历史文化介绍暂时未加载');
      return response.json();
    }).then(data => {
      if (Object.keys(data.countries || {}).length !== 24 || Object.keys(data.landmarks || {}).length !== 11)
        throw new Error('历史文化介绍尚未准备好');
      return data;
    }).catch(error => { pending = null; throw error; });
  }
  return pending;
}
export function readCulture(item) {
  if (!item?.audio_path) return;
  window.FufuTTS?.playRecording(item.audio_path).catch(() => window.toast?.('朗读暂时无法播放，请再试一次'));
}
