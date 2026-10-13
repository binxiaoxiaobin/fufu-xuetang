"""Rebuild the six adapted games locally; requires Node >=22 and npm."""
import json
import shutil
import subprocess
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'content/games/toy2game/source'
OUTPUT=ROOT/'frontend/assets/games/toy2game'

def publish(source=SOURCE):
    games=json.loads((ROOT/'backend/seed_data/toy_games.json').read_text(encoding='utf-8'))
    for game in games:
        directory=source/'games'/game['id']
        if not (directory/'dist/index.html').is_file():raise RuntimeError('Missing build: '+game['id'])
        target=(OUTPUT/game['id']).resolve()
        if not re.fullmatch('[a-z][a-z0-9-]*',game['id']) or target.parent!=OUTPUT.resolve():
            raise RuntimeError('Unsafe game output path')
        if target.exists():shutil.rmtree(str(target))
        shutil.copytree(str(directory/'dist'),str(target))
        entry=OUTPUT/game['id']/'index.html'
        entry.write_text(entry.read_text(encoding='utf-8').replace('src="/images/','src="/assets/games/toy2game/covers/'),encoding='utf-8')
        shutil.copy2(str(directory/'README.md'),str(OUTPUT/(game['id']+'-README.md')))
    shutil.copy2(str(source/'LICENSE'),str(OUTPUT/'LICENSE.txt'))
    notices=['Third-party dependency licenses for the adapted Toy2Game builds.\n'];seen=set()
    for path in sorted(source.rglob('*')):
        if path.is_file() and 'node_modules' in path.parts and path.name.lower() in ('license','license.txt','license.md','license-mit','copying','notice','notice.txt'):
            value=path.read_text(encoding='utf-8',errors='replace');key=(path.parent.name,value)
            if key not in seen:seen.add(key);notices.append('\n\n===== '+str(path.relative_to(source))+' =====\n'+value)
    (OUTPUT/'THIRD_PARTY_NOTICES.txt').write_text(''.join(notices),encoding='utf-8')
    print('Six games published with original and third-party notices.')

if __name__=='__main__':
    npm=shutil.which('npm.cmd') or shutil.which('npm')
    if not npm:raise RuntimeError('Install Node >=22 with npm before rebuilding')
    subprocess.run([npm,'ci','--no-audit','--no-fund'],cwd=str(SOURCE),check=True)
    for game in json.loads((ROOT/'backend/seed_data/toy_games.json').read_text(encoding='utf-8')):
        subprocess.run([npm,'run','build','--workspace','games/'+game['id'],'--','--base','/assets/games/toy2game/'+game['id']+'/'],cwd=str(SOURCE),check=True)
    subprocess.run([npm,'test'],cwd=str(SOURCE),check=True)
    publish()
