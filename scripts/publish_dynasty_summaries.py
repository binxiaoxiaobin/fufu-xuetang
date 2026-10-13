# -*- coding: utf-8 -*-
"""Publish only the authored dynasty introductions to seed and live content."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import history_cards

manifest = json.loads((ROOT / 'content/learning/dynasty-summaries.json').read_text(encoding='utf-8'))
summaries = manifest['summaries']
live_rows = history_cards.catalog(admin=True)['periods']
if set(summaries) != {row['slug'] for row in live_rows}:
    raise SystemExit('简介清单与数据库朝代数量不一致，未发布。')

backup = ROOT / 'artifacts/history/dynasty-summaries-before.json'
if not backup.exists():
    backup.write_text(json.dumps(live_rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

for row in live_rows:
    row['summary'] = summaries[row['slug']]
    history_cards.save(row['slug'], {'document': row, 'revision': row['revision']})

seed_path = ROOT / 'content/learning/history-cards.json'
seed = json.loads(seed_path.read_text(encoding='utf-8'))
for row in seed['periods']:
    row['summary'] = summaries[row['slug']]
seed_path.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Published dynasty introductions:', len(live_rows))
print('Character counts:', ', '.join('%s=%d' % (row['slug'], len(row['summary'])) for row in live_rows))
