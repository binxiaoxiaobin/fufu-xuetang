# -*- coding: utf-8 -*-
"""Publish the requested expanded narratives, preserving unrelated live fields."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import history_wisdom as wisdom

expanded=json.loads((ROOT/'content/learning/battle-narratives.json').read_text(encoding='utf-8'))
rows=wisdom.catalog(admin=True)['items']
backup=ROOT/'artifacts/history/battle-v2-before.json'
if not backup.exists():backup.write_text(json.dumps({'items':[p for p in rows if p['kind']=='battles']},ensure_ascii=False,indent=2),encoding='utf-8')
updated=0
for p in rows:
    if p['kind']!='battles':continue
    changes=dict(expanded[p['slug']],image_path='/assets/learning/history/battles/'+p['slug']+'-v2.png')
    if p['slug'] in ('julu','gaixia'):changes['quote_source']='《史记·项羽本纪》（节选，简体转写）'
    if p['slug']=='chibi':changes['quote_source']='《三国志·吴书·周瑜鲁肃吕蒙传》（节选，简体转写）'
    if p['slug']=='changping':changes['source_url']='https://zh.wikisource.org/wiki/史記/卷073'
    image=ROOT/'frontend'/changes['image_path'].lstrip('/')
    if not image.exists():raise RuntimeError('Missing illustration: '+p['slug'])
    if any(p.get(k)!=v for k,v in changes.items()):
        p.update(changes);wisdom.save(p['slug'],{'document':p,'revision':p['revision']});updated+=1
print('Published %d expanded battle cards'%updated)
