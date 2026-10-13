"""Build a standalone visual review page from the actual China-page markup."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]/'frontend'
p=root/'index.html'
text=p.read_text(encoding='utf-8')
text=re.sub(r'/china-map\.js\?v=[^" ]+', '/china-map.js?v=20261001-postcards-db-1', text)
text=text.replace('/china-provinces.js?v=20260930-china-1','/china-provinces.js?v=20261001-postcards')
text=text.replace('<script src="/china-photos.js?v=20261001-postcards"></script>','')
text=re.sub(r'/china-gallery\.js\?v=[^" ]+', '/china-gallery.js?v=20261001-postcards-db-1', text)
if '/china-gallery.js?' not in text:
    text=text.replace('<script src="/china-map.js','<script src="/china-gallery.js?v=20261001-postcards-db-1"></script><script src="/china-map.js')
text=text.replace('/engineering-explore.js?v=20261001-machinery"','/engineering-explore.js?v=20261001-machinery-7"')
text=text.replace('34 个省级行政区，点一个，听听它的故事。右下角是南海诸岛。','沿着地图认识 34 个省级行政区，看三张实景明信片，听听它们的故事。')
p.write_text(text,encoding='utf-8')
main=re.search(r'<main id="page-china".*?</main>',text,re.S).group().replace('page china-page','page china-page active')
preview='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>中国地图 · 实景明信片</title></head><body><div class="app-shell">'+main+'</div><script src="/tts.js"></script><script src="/china-provinces.js"></script><script src="/china-gallery.js?v=20261001-postcards-db-1"></script><script src="/china-map.js?v=20261001-postcards-db-1"></script><script>document.querySelector("[data-page=explore]").addEventListener("click",()=>{location.href="/index.html";});</script></body></html>'
(root/'__codex_china_preview.html').write_text(preview,encoding='utf-8')
