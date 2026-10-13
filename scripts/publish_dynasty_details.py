# -*- coding: utf-8 -*-
"""Publish expanded dynasty events, people, linked biographies, and references."""
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import history_cards
from mysql_db import connection, _record_from_json

detail_manifest = json.loads((ROOT / 'content/learning/dynasty-event-expansions.json').read_text(encoding='utf-8'))['periods']
coverage_manifest = json.loads((ROOT / 'content/learning/dynasty-coverage-expansions.json').read_text(encoding='utf-8'))['periods']
seed_path = ROOT / 'content/learning/history-cards.json'
seed = json.loads(seed_path.read_text(encoding='utf-8'))
seed_periods = {period['slug']: period for period in seed['periods']}
live_rows = history_cards.catalog(admin=True)['periods']
if set(seed_periods) != {row['slug'] for row in live_rows} or set(coverage_manifest) != set(seed_periods):
    raise SystemExit('补充清单与数据库朝代不一致，未发布。')

def merge_text(row):
    authored = detail_manifest[row['slug']]
    by_title = {event['title']: event for event in authored['events']}
    titles = set()
    for event in row['events']:
        titles.add(event['title'])
        if event['title'] in by_title:
            event.update(by_title[event['title']])
    row['events'].extend(event for event in authored['events'] if event['title'] not in titles)
    by_person = {person['slug']: person for person in row['people']}
    if not set(authored['people']).issubset(by_person):
        raise SystemExit('原有人物清单与数据库不一致：' + row['slug'])
    for slug, fields in authored['people'].items():
        by_person[slug].update(fields)

    additions = coverage_manifest[row['slug']]
    titles = {event['title'] for event in row['events']}
    row['events'].extend(event for event in additions['events'] if event['title'] not in titles)
    people = {person['slug']: person for person in row['people']}
    for person in additions['people']:
        if person['slug'] not in people:
            new_person = dict(person)
            new_person['story_slug'] = new_person.get('existing_story') or 'history-' + new_person['slug']
            new_person['story_kind'] = new_person.get('evidence_kind') if new_person.get('existing_story') else '历史人物小传'
            row['people'].append(new_person)
            people[new_person['slug']] = new_person
    return row

for row in seed['periods']:
    merge_text(row)
for row in live_rows:
    merge_text(row)

def biography_story(period, person):
    return dict(
        slug=person['story_slug'], type='history', category='历史人物小传',
        title=person['name'] + '：' + person['role'], ageRange='8岁以上·亲子共读',
        summary=person['bio'],
        paragraphs=[person['bio'], period['summary'], person['contribution'], person['reading']],
        moral='历史可以由多种证据认识。' + (person.get('caution') or '本篇依据文献作白话介绍，没有添加虚构对话或现场细节。'),
        tags=['历史人物', period['title'], person['name'], '原创白话介绍'], readingMinutes=2,
        cover=period['image_path'], coverStatus='ready',
        sourceNote=person['source_note'] + ' 本篇为原创知识小传，不是古籍原文。主题图为原创符号设计，不是历史人物肖像或出土文物.'
    )

# Prepare a recoverable snapshot before touching live rows.
backup_dir = ROOT / 'artifacts/history' / datetime.now().strftime('coverage-before-%Y%m%d-%H%M%S')
backup_dir.mkdir(parents=True, exist_ok=True)
(backup_dir / 'live-periods.json').write_text(json.dumps(live_rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(backup_dir / 'seed-periods.json').write_text(json.dumps(seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Upsert generated biographies before connecting them to each period. Only
# project-authored history biographies are refreshed; other story types remain untouched.
generated_stories = []
for period in seed['periods']:
    for person in period['people']:
        if person.get('story_kind') == '历史人物小传':
            generated_stories.append(biography_story(period, person))

story_ids = {}
with connection() as db:
    with db.cursor() as cur:
        cur.execute("SELECT * FROM stories WHERE slug LIKE 'history-%' AND category='历史人物小传'")
        (backup_dir / 'generated-stories.json').write_text(json.dumps(cur.fetchall(), ensure_ascii=False, default=str, indent=2) + '\n', encoding='utf-8')
        insert_sql = '''INSERT IGNORE INTO stories
            (slug,story_type,title,category,age,color,emoji,summary,paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'''
        for story in generated_stories:
            record = _record_from_json(story)
            cur.execute(insert_sql, record)
            cur.execute('''UPDATE stories SET story_type=%s,title=%s,age=%s,summary=%s,paragraphs=%s,
                moral=%s,tags=%s,reading_minutes=%s,cover=%s,cover_status=%s,source_note=%s
                WHERE slug=%s AND category='历史人物小传' ''',
                (record[1], record[2], record[4], record[7], record[8], record[9], record[10], record[11], record[12], record[13], record[14], record[0]))
        slugs = sorted({person['story_slug'] for row in live_rows for person in row['people'] if person.get('story_kind') == '历史人物小传'})
        for slug in slugs:
            cur.execute('SELECT id FROM stories WHERE slug=%s', (slug,))
            result = cur.fetchone()
            if not result:
                raise SystemExit('人物故事未入库，已停止发布：' + slug)
            story_ids[slug] = result['id']
    db.commit()

# Add each new biography as a navigable link, preserving all existing poem and story links.
for row in live_rows:
    link_keys = {(link['person_slug'], link['content_kind'], link['content_id']) for link in row.get('links', [])}
    for person in row['people']:
        if person.get('story_kind') != '历史人物小传':
            continue
        key = (person['slug'], 'story', story_ids[person['story_slug']])
        if key not in link_keys:
            row.setdefault('links', []).append(dict(person_slug=key[0], content_kind=key[1], content_id=key[2], relation_label='历史人物小传'))
            link_keys.add(key)

# Save to the database through the same validation and revision path used by the admin UI.
for row in live_rows:
    history_cards.save(row['slug'], {'document': row, 'revision': row['revision']})

# Keep fresh installs in sync with the live catalog and make linked biographies available at boot.
seed_path.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
stories_path = ROOT / 'content/learning/history-stories.json'
old_stories = json.loads(stories_path.read_text(encoding='utf-8')).get('stories', []) if stories_path.exists() else []
story_by_slug = {story['slug']: story for story in old_stories}
story_by_slug.update({story['slug']: story for story in generated_stories})
stories_path.write_text(json.dumps({'stories': list(story_by_slug.values())}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Published periods:', len(live_rows))
print('Published events:', sum(len(row['events']) for row in live_rows))
print('Published people:', sum(len(row['people']) for row in live_rows))
print('Generated linked biographies:', len(generated_stories))
print('Qin events:', len(next(row for row in live_rows if row['slug'] == 'qin')['events']))
print('Backup:', backup_dir)
