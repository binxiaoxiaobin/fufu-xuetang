# -*- coding: utf-8 -*-
"""Add a focused set of familiar poems and link relevant Tang poets."""
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from mysql_db import connection
import reading_cards
import history_cards

poem_path = ROOT / 'content/learning/poetry-cards.json'
manifest_path = ROOT / 'content/learning/familiar-poetry-additions.json'
poems = json.loads(poem_path.read_text(encoding='utf-8'))
authored = json.loads(manifest_path.read_text(encoding='utf-8'))
known = {(card['author'], card['title']) for card in poems}
new_cards = []
for entry in authored:
    if (entry['author'], entry['title']) in known:
        continue
    card = dict(
        slug=entry['slug'], subject='语文', kind='poetry', title=entry['title'],
        author=entry['author'], dynasty=entry['dynasty'], collection=entry['collection'],
        paragraphs=entry['paragraphs'], subtitle=entry['paragraphs'][0],
        theme=entry['theme'], image_path='/assets/learning/poetry/' + entry['theme'] + '.webp',
        audio_path=None, source_url=entry['card_source'], source_name=entry['source'],
        license_name='古典诗词原文属公有领域；本卡白话解读与词语说明为项目原创',
        narration_text=entry['title']+'。'+entry['author']+'。\n\n'+'\n\n'.join(entry['paragraphs']),
        explanation=dict(meaning=entry['meaning'], notes=entry['notes'], source='福福学堂原创白话解读 · '+entry['source']),
        image_width=640, image_height=640,
    )
    if card['slug'] in {item['slug'] for item in poems}:
        raise SystemExit('诗词编号重复，未发布：' + card['slug'])
    new_cards.append(card)
    known.add((card['author'], card['title']))

if not new_cards:
    print('No new poems to publish.')
    raise SystemExit(0)

backup_dir = ROOT / 'artifacts/poetry' / datetime.now().strftime('familiar-before-%Y%m%d-%H%M%S')
backup_dir.mkdir(parents=True, exist_ok=True)
shutil.copy2(poem_path, backup_dir / poem_path.name)

# Keep the first familiar 24-card page intact, then place this new guided set
# immediately after it so the newly added classics are easy to discover.
poems[24:24] = new_cards
poem_path.write_text(json.dumps(poems, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# This uses the existing content catalog path; media assets are already part of
# the poetry deck's original image collection.
reading_cards.initialize()

# Make the newly added Tang works available from the dynasty timeline too.
periods = history_cards.catalog(admin=True)['periods']
tang = next(period for period in periods if period['slug'] == 'tang')
people = {person['slug']: person for person in tang['people']}
author_people = {'李白': 'li-bai', '杜甫': 'du-fu', '白居易': 'bai-ju-yi'}
links = {(link['person_slug'], link['content_kind'], link['content_id']) for link in tang.get('links', [])}
linked_count = 0
with connection() as db:
    with db.cursor() as cur:
        for card in new_cards:
            person_slug = author_people.get(card['author'])
            if not person_slug or person_slug not in people:
                continue
            cur.execute("SELECT id FROM learning_reading_cards WHERE kind='poetry' AND position<65535 AND author=%s AND title=%s", (card['author'], card['title']))
            row = cur.fetchone()
            if not row:
                raise SystemExit('新增诗词未入库，停止关联：' + card['title'])
            key = (person_slug, 'poetry', row['id'])
            if key not in links:
                tang.setdefault('links', []).append(dict(person_slug=person_slug, content_kind='poetry', content_id=row['id'], relation_label='本人作品 · 名篇导读'))
                links.add(key)
                linked_count += 1
            titles = people[person_slug].setdefault('poem_titles', [])
            if card['title'] not in titles:
                titles.append(card['title'])

if linked_count or any(card['author'] in author_people for card in new_cards):
    history_cards.save('tang', {'document': tang, 'revision': tang['revision']})

print('New familiar poems:', len(new_cards))
for author in ('李白', '杜甫', '白居易', '苏轼', '陆游', '杨万里'):
    titles = [card['title'] for card in new_cards if card['author'] == author]
    if titles:
        print(author + ':', '、'.join(titles))
print('Tang timeline poem links added:', linked_count)
print('Total active poem cards:', len(poems))
print('Backup:', backup_dir)
