"""Read-only speech coverage audit. Never exports learner data or synthesizes audio."""
import ast
import getpass
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / 'frontend'
OUT = ROOT / 'artifacts' / 'speech-audio-audit-20261009.json'
sys.path.insert(0, str(ROOT / 'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_db import connection

ns = {'re': re}
source = (ROOT / 'scripts/tts_build.py').read_text(encoding='utf-8')
for definition in ast.parse(source).body:
    if isinstance(definition, ast.FunctionDef) and definition.name == 'normalize':
        exec(ast.get_source_segment(source, definition), ns)
normalize = ns['normalize']
manifest = json.loads((FE / 'assets/audio/tts/manifest.json').read_text(encoding='utf-8'))
report = {'groups': {}, 'missing_recordings': [], 'uncached_speech': [], 'database_audio_columns': {},
          'manifest_entries': len(manifest), 'reference_problems': [], 'remote_references': []}
references = {}

def ref(path, origin):
    if not path:
        return
    if str(path).startswith(('https://', 'http://', 'data:')):
        report['remote_references'].append({'path': path, 'origin': origin})
        return
    references.setdefault(str(path), set()).add(origin)

def speech(group, text, lang='zh-CN', child=False, owner=None):
    if not text:
        return
    norm = normalize(text, lang)
    key = hashlib.sha1((('child\0' if child else '') + norm).encode('utf-8')).hexdigest()[:12]
    g = report['groups'].setdefault(group, {'utterances': 0, 'cached': 0, 'uncached': 0, 'over_600_chars': 0})
    g['utterances'] += 1
    if key in manifest:
        g['cached'] += 1
    else:
        g['uncached'] += 1
        report['uncached_speech'].append({'group': group, 'owner': owner, 'key': key, 'lang': lang,
                                          'voice': 'child' if child else '', 'text': text})
    if len(norm) > 600:
        g['over_600_chars'] += 1

def recordings(group, rows, keys):
    g = report['groups'].setdefault(group, {'items': 0, 'expected_recordings': 0, 'linked_recordings': 0})
    for row in rows:
        g['items'] += 1
        for key in keys:
            g['expected_recordings'] += 1
            value = row.get(key)
            if value:
                g['linked_recordings'] += 1
                ref(value, group + ':' + str(row.get('id', row.get('slug', ''))) + ':' + key)
            else:
                report['missing_recordings'].append({'group': group, 'owner': row.get('id', row.get('slug')), 'field': key})

with connection() as conn:
    with conn.cursor() as cur:
        # Consistent, read-only snapshot; no profile/session/learner rows queried.
        cur.execute('START TRANSACTION READ ONLY')
        cur.execute('SELECT id,public_path,file_bytes FROM media_assets WHERE media_kind=%s', ('audio',))
        media = cur.fetchall()
        report['database_audio_assets'] = len(media)
        report['database_size_mismatches'] = []
        for row in media:
            ref(row['public_path'], 'media_assets:' + str(row['id']))
            file = FE / unquote(urlsplit(row['public_path']).path).lstrip('/')
            if file.is_file() and file.stat().st_size != row['file_bytes']:
                report['database_size_mismatches'].append({'id': row['id'], 'path': row['public_path'],
                    'database_bytes': row['file_bytes'], 'actual_bytes': file.stat().st_size})
        cur.execute('SELECT c.id,c.category_key,w.public_path AS word_audio,s.public_path AS sentence_audio '
                    'FROM learning_action_cards c LEFT JOIN media_assets w ON w.id=c.word_audio_asset_id '
                    'LEFT JOIN media_assets s ON s.id=c.sentence_audio_asset_id WHERE c.status=%s', ('published',))
        english = cur.fetchall()
        recordings('english_cards', english, ['word_audio', 'sentence_audio'])
        report['english_categories'] = dict(Counter(r['category_key'] for r in english))
        cur.execute('SELECT c.id,a.public_path AS audio_path FROM learning_pinyin_cards c '
                    'LEFT JOIN media_assets a ON a.id=c.audio_asset_id')
        recordings('pinyin', cur.fetchall(), ['audio_path'])
        cur.execute('SELECT c.id,c.kind,c.paragraphs_json,a.public_path AS audio_path FROM learning_reading_cards c '
                    'LEFT JOIN media_assets a ON a.id=c.audio_asset_id WHERE c.position<65535')
        for row in cur.fetchall():
            recordings(row['kind'] + '_cards', [row], ['audio_path'])
            if not row['audio_path']:
                for paragraph in json.loads(row['paragraphs_json']):
                    speech(row['kind'] + '_paragraphs', paragraph, owner=row['id'])
        cur.execute('SELECT id,slug,title,paragraphs FROM stories ORDER BY id')
        stories = cur.fetchall()
        cur.execute("SELECT l.story_id,l.position,m.public_path FROM story_media_links l "
                    "LEFT JOIN media_assets m ON m.id=l.asset_id WHERE l.role='audio'")
        story_links = {(r['story_id'], r['position']): r['public_path'] for r in cur.fetchall()}
        report['stories'] = []
        for story in stories:
            paragraphs = json.loads(story['paragraphs'])
            linked = sum(bool(story_links.get((story['id'], i))) for i in range(len(paragraphs)))
            report['stories'].append({'id': story['id'], 'slug': story['slug'], 'title': story['title'],
                                       'paragraphs': len(paragraphs), 'linked': linked})
            for i, paragraph in enumerate(paragraphs):
                path = story_links.get((story['id'], i))
                recordings('story_paragraphs', [{'id': '{}:{}'.format(story['id'], i), 'audio_path': path}], ['audio_path'])
                if not path:
                    speech('story_paragraph_fallback', paragraph, owner='{}:{}'.format(story['id'], i))
        cur.execute("SELECT s.id,s.body,s.audio_asset_id FROM content_segments s JOIN content_items i ON i.id=s.item_id "
                    "WHERE i.kind='companion' AND i.status='published'")
        for row in cur.fetchall():
            speech('companion_child_voice', row['body'], child=True, owner=row['id'])
        cur.execute('SELECT question_id,option_text,is_correct,sort_order,audio_url FROM question_options ORDER BY question_id,sort_order,id')
        options = {}
        for row in cur.fetchall():
            options.setdefault(row['question_id'], []).append(row)
            ref(row['audio_url'], 'question_option:' + str(row['question_id']))
        cur.execute("SELECT id,stage,grade,subject,prompt,answer,explanation,hint,prompt_audio,hint_audio,explanation_audio,options "
                    "FROM questions WHERE status='published' ORDER BY id")
        questions = cur.fetchall()
        report['published_questions'] = len(questions)
        report['question_explicit_audio'] = {field: sum(bool(q[field]) for q in questions)
                                           for field in ['prompt_audio', 'hint_audio', 'explanation_audio']}
        for q in questions:
            for field in report['question_explicit_audio']:
                ref(q[field], 'question:{}:{}'.format(q['id'], field))
            prefix = 'preschool' if q['stage'] == '幼儿园' else 'primary'
            speech(prefix + '_question_prompt', ('我们来听这道题。' if prefix == 'preschool' else '') + q['prompt'], owner=q['id'])
            opts = options.get(q['id'], [])
            correct = next((o['option_text'] for o in opts if o['is_correct']), q['answer'])
            if prefix == 'preschool':
                for i, option in enumerate(opts):
                    speech('preschool_options', '第{}个选项是，{}。'.format('一二三四五六'[i] if i < 6 else i+1, option['option_text']), owner=q['id'])
            speech(prefix + '_answer_explanation', '正确答案是{}。{}'.format(correct, q['explanation'] or ''), owner=q['id'])
            if q['hint']:
                speech(prefix + '_hint', '提示：' + q['hint'], owner=q['id'])
            reward = ('答对啦！正确答案是{}。{}获得十积分。'.format(correct, q['explanation'] or '') if prefix == 'preschool'
                      else '答对啦，答案是{}，获得10积分'.format(correct))
            speech(prefix + '_success_feedback', reward, owner=q['id'])
        cur.execute("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() "
                    "AND COLUMN_NAME LIKE '%audio%'")
        report['database_audio_columns'] = cur.fetchall()
    conn.rollback()

node = Path(os.environ.get('LOCALAPPDATA', ''))  # Node path is configurable, no shell interpolation.
node = os.environ.get('FUFU_AUDIT_NODE', 'C:/Users/rybof/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
fixed = subprocess.run([node, str(ROOT / 'scripts/tts_collect.js')], capture_output=True, encoding='utf-8')
if fixed.returncode == 0:
    collected = json.loads(fixed.stdout)
    for group in ['card_zh', 'card_en', 'safari_zh', 'safari_en', 'curious']:
        for text in collected[group]:
            speech('fixed_' + group, text, 'en-US' if group.endswith('_en') else 'zh-CN')
else:
    report['collector_error'] = fixed.stderr[-1800:]

extra = subprocess.run([node, str(ROOT / 'scripts/audit_speech_catalogs.cjs')], capture_output=True, encoding='utf-8')
if extra.returncode == 0:
    for entry in json.loads(extra.stdout):
        speech(entry['group'], entry['text'], owner=entry['owner'])
else:
    report['extra_collector_error'] = extra.stderr[-1800:]

for key, path in manifest.items():
    ref(path, 'tts_manifest:' + key)
story_manifest = json.loads((FE / 'assets/audio/stories/manifest.json').read_text(encoding='utf-8'))
for slug, paths in story_manifest.items():
    for position, path in enumerate(paths):
        ref(path, 'story_manifest:{}:{}'.format(slug, position))
for file in (ROOT / 'content/learning').glob('*.json'):
    def walk(value):
        if isinstance(value, dict):
            for k, v in value.items():
                if 'audio' in k and isinstance(v, str) and v.startswith('/'):
                    ref(v, 'content_manifest:' + file.name)
                else:
                    walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)
    walk(json.loads(file.read_text(encoding='utf-8')))
for path, origins in references.items():
    local = (FE / unquote(urlsplit(path).path).lstrip('/')).resolve()
    if FE.resolve() not in local.parents:
        report['reference_problems'].append({'path': path, 'problem': 'outside_frontend', 'origins': sorted(origins)})
    elif not local.is_file() or not local.stat().st_size:
        report['reference_problems'].append({'path': path, 'problem': 'missing_or_empty', 'origins': sorted(origins)})
report['unique_referenced_paths'] = len(references)
report['references'] = {k: sorted(v) for k, v in references.items()}
audio_files = list((FE / 'assets/audio').rglob('*.mp3'))
report['local_mp3_files'] = len(audio_files)
report['local_mp3_bytes'] = sum(p.stat().st_size for p in audio_files)
report['unreferenced_local_mp3'] = ['/' + p.relative_to(FE).as_posix() for p in audio_files
                                     if '/' + p.relative_to(FE).as_posix() not in references]
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: report[k] for k in ['groups', 'published_questions', 'manifest_entries', 'local_mp3_files',
                                      'unique_referenced_paths', 'reference_problems']}, ensure_ascii=True))
