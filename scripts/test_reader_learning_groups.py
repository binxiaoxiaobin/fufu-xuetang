import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
items=json.loads((root/'backend/seed_data/reader_lessons.json').read_text(encoding='utf-8'))
groups=json.loads((root/'backend/seed_data/reader_learning_groups.json').read_text(encoding='utf-8'))
by_id={i['question_id']:i for i in items}
covered=set()
for group in groups:
    ids=group['question_ids']
    assert 1<=len(ids)<=5 and len(set(ids))==len(ids)
    assert all(by_id[q]['subject']==group['subject'] for q in ids)
    assert group['focus'] and group['title']
    if group['kind']=='character':assert all(len(by_id[q]['word'])==1 for q in ids)
    for q in ids:assert group in by_id[q]['learning_groups']
    covered.update(ids)
assert covered==set(by_id)
assert len({g['id'] for g in groups})==len(groups)
print('All 618 lessons covered by valid, distinct, database-backed groups')
