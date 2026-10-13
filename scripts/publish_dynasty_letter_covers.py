# -*- coding: utf-8 -*-
"""Replace only the authorized cover fields in live dynasty documents."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import history_cards as history
updates={x['slug']:x for x in json.loads((ROOT/'content/learning/dynasty-letter-covers.json').read_text(encoding='utf-8'))['items']}
rows=history.catalog(admin=True)['periods']
backup=ROOT/'artifacts/history/dynasty-covers-before.json'
if not backup.exists():backup.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
for row in rows:
    change=updates[row['slug']]
    for k in ('image_path','cover_script','cover_note','cover_characters'):row[k]=change[k]
    assert (ROOT/'frontend'/row['image_path'].lstrip('/')).exists()
    history.save(row['slug'],{'document':row,'revision':row['revision']})
seed_path=ROOT/'content/learning/history-cards.json';seed=json.loads(seed_path.read_text(encoding='utf-8'))
for row in seed['periods']:
    for k in ('image_path','cover_script','cover_note','cover_characters'):row[k]=updates[row['slug']][k]
seed_path.write_text(json.dumps(seed,ensure_ascii=False,indent=2),encoding='utf-8')
print('Updated 19 live dynasty covers; retained text, people and work links')
