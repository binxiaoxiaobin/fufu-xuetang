from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'frontend'
revision = '20261005-observe-5'
files = ['engineering-explore.js', 'engineering-viewer.js', 'engineering-data.js', 'transport-explore.js', 'dino-model.js', 'index.html', 'page-loader.js', '__codex_engineering_preview.html', '__codex_transport_preview.html']
import re
for name in files:
    path = root / name
    if not path.exists():
        continue
    content = path.read_text(encoding='utf-8')
    content = re.sub(r'((?:engineering-(?:data|catalog|viewer|machinery|motion|explore|styles)|transport-(?:explore|motion)|model-(?:parts|playback|framing)|design-system|scene-backdrops|page-loader|dino-model)\.(?:js|css)\?v=)[a-zA-Z0-9-]+', lambda match: match[1] + revision, content)
    if name == 'page-loader.js':
        content = re.sub(r"const revision = '[^']+'", "const revision = '" + revision + "'", content)
    path.write_text(content, encoding='utf-8')
