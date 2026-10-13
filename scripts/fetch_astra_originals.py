"""Keep upstream games intact; local ports are built separately from these snapshots."""
import concurrent.futures
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'content/games/astra-originals/source'
jobs = []

def add(name, relative, url):
    jobs.append((name, relative, url))

for file in ('mosswing.html', 'src/game.js', 'src/shell.html', 'src/three.min.js', 'src/three-license.txt', 'src/build.py', 'src/design/spec.md'):
    add('mosswing', file, 'https://raw.githubusercontent.com/Ayi1337/gpt6-astra-one-shot-games/main/mosswing/' + file)
for file in ('index.html', 'style.css', 'app.js', 'data.js', 'engine.js', 'render.js', 'audio.js', 'airframes.js', 'icon.svg', 'README.md', 'DESIGN.md', 'metadata.json', 'package.json', 'build.mjs', 'tests/engine.test.mjs'):
    add('thunderfall', file, 'https://raw.githubusercontent.com/MartinDelophy/awesome-gpt-6-astra/main/works/thunderfall/' + file)
add('iron-bastion', 'index.html', 'https://iron-bastion.zecoba.workers.dev/')
for game in ('mosswing', 'thunderfall', 'iron-bastion'):
    add(game, 'gameplay.jpg', 'https://raw.githubusercontent.com/MartinDelophy/awesome-gpt-6-astra/main/assets/screenshots/' + game + '/gameplay.jpg')

def fetch(job):
    name, relative, url = job
    request = urllib.request.Request(url, headers={'User-Agent': 'Fufu-local-game-port'})
    data = urllib.request.urlopen(request, timeout=45).read()
    target = DEST / name / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print(name + '/' + relative, len(data), flush=True)
    return {'game': name, 'file': relative, 'url': url, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        manifest = list(executor.map(fetch, jobs))
    (DEST / 'SNAPSHOT.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
