from pathlib import Path
import re
root = Path(__file__).resolve().parent.parent / 'frontend'
p = root / 'index.html'
s = p.read_text(encoding='utf-8')
files = ['globe-hit.js','globe.js','china-provinces.js','china-gallery.js','china-map.js','solar.js','moon.js','lunar.js','landmark-tour.js','engineering-explore.js','dino-model.js','transport-explore.js']
for name in files:
    s = re.sub(r'<script[^>]*src="/'+re.escape(name)+r'(?:\?[^"\n]*)?"[^>]*></script>', '', s)
if '/page-loader.js' not in s:
    s = s.replace('<script src="/app.js', '<script src="/page-loader.js?v=20261003-performance-1"></script><script src="/app.js')
s = s.replace('src="/clay-safari/index.html?view=card&v=20261003-daily-water-1"', 'src="about:blank" data-src="/clay-safari/index.html?view=card&v=20261003-daily-water-1"')
p.write_text(s,encoding='utf-8')
p = root/'app.js';s=p.read_text(encoding='utf-8')
if 'window.FufuPages?.enter(page)' not in s:
    s=s.replace("function navigate(page) {", "function navigate(page) {\n  window.FufuPages?.enter(page);")
s=s.replace('  await Promise.allSettled([window.loadPet?.(),window.loadShop?.(),window.loadZooSummary?.()]);', '  const companionReady = Promise.allSettled([window.loadPet?.(),window.loadShop?.(),window.loadZooSummary?.()]);')
p.write_text(s,encoding='utf-8')
p=root/'extras.js';s=p.read_text(encoding='utf-8')
s=s.replace('if(frame){const url=new URL(frame.src,location.origin);', "if(frame && frame.getAttribute('src')!=='about:blank'){const url=new URL(frame.src,location.origin);")
s=s.replace("window.fufuWakeClay=()=>clayAudio('resume');", "window.fufuWakeClay=()=>{const frame=$('#claySafariFrame');if(frame?.getAttribute('src')==='about:blank')frame.src=frame.dataset.src;clayAudio('resume');};")
s=s.replace("$('#claySafariFrame').addEventListener('load',()=>{", "$('#claySafariFrame').addEventListener('load',()=>{\n      if(!document.querySelector('#page-clay.active'))clayAudio('suspend');")
p.write_text(s,encoding='utf-8')
for name in ['pet3d.js','engineering-viewer.js','solar.js','moon.js','lunar.js','dino-model.js']:
    p=root/name;s=p.read_text(encoding='utf-8')
    s=re.sub(r'Math.min\(window.devicePixelRatio\s*\|\|\s*1,\s*(?:2|1\.75)\)', '(window.FufuPerformance?.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5))', s)
    p.write_text(s,encoding='utf-8')
print('Applied on-demand scene loading and touch-device pixel budget.')
