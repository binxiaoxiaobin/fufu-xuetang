"""Persist catalog collections and refresh browser entry revisions."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'backend/seed_data/toy_games.json'
items=json.loads(path.read_text(encoding='utf-8'))
for item in items:
    item['collection']='adventure-3d' if item.get('fullscreenRequired') else 'small-3d'
    if item['id']=='turbo-kart-rally':
        item['rules'][0]='选择简单、标准或挑战难度，比赛可设为 1、3 或 5 圈。'
path.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
path=ROOT/'backend/seed_data/sunbreak_game.json'
item=json.loads(path.read_text(encoding='utf-8'));item['collection']='adventure-3d'
path.write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for name in ['frontend/index.html','frontend/page-loader.js','frontend/toy-arcade.js','frontend/kart-fullscreen.js','frontend/assets/games/turbo-kart-rally/index.html','frontend/assets/games/turbo-kart-rally/fufu-kart.js','content/games/sunbreak/adaptation/fufu-entry.ts','frontend/assets/games/fullscreen-entry.js','scripts/build_turbo_kart.py']:
    path=ROOT/name
    path.write_text(path.read_text(encoding='utf-8').replace('20261008-games-2','20261008-games-zh-2').replace('20261008-games-zh-1','20261008-games-zh-2').replace('20261008-zh"','20261008-zh-2"'),encoding='utf-8')
print('Catalog collections and revisions updated')
