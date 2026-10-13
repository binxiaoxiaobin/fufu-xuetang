"""Resumable, bounded speech preparation with database publication after valid files exist.

Run with --launch to enter the database password once and start a hidden worker.
Credentials remain in process memory/environment, never in progress files or logs.
"""
import argparse
import asyncio
import getpass
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import getproxies

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'scripts')]
import edge_tts
from mysql_db import connection
from speech_config import CHINESE, ENGLISH, VOICE_VERSION
from learning_rewards import QUIZ_CORRECT_POINTS
from speech_manifest import merge_manifest
from tts_build import normalize

FE = ROOT / 'frontend'
MANIFEST = FE / 'assets/audio/tts/manifest.json'
STORY_MANIFEST = FE / 'assets/audio/stories/manifest.json'
STATUS = ROOT / 'artifacts/speech-generation-progress.json'
NODE = 'C:/Users/rybof/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
ROOT.joinpath('artifacts').mkdir(exist_ok=True)

def write_json(path, value):
    temporary = path.with_name(path.name + '.{}.tmp'.format(os.getpid()))
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(str(temporary), str(path))

def audio_ok(path):
    if not path.is_file() or path.stat().st_size < 1000:
        return False
    with path.open('rb') as stream:
        header = stream.read(3)
    return header == b'ID3' or (header and header[0] == 255)

def prepare():
    jobs = {}
    bindings = {'questions': [], 'stories': [], 'cards': [], 'companion': []}
    def add(text, group, priority=0, lang='zh-CN', child=False, dedicated=None):
        norm = normalize(text, lang)
        key = hashlib.sha1((('child\0' if child else '') + norm).encode('utf-8')).hexdigest()[:12]
        config = ENGLISH if lang.startswith('en') else CHINESE
        digest = hashlib.sha256((VOICE_VERSION + '\0' + json.dumps(config, sort_keys=True) + '\0' + norm).encode('utf-8')).hexdigest()[:24]
        path = '/assets/audio/{}/{}.mp3'.format(dedicated or ('tts/' + VOICE_VERSION), digest)
        job_id = path
        if job_id not in jobs:
            jobs[job_id] = dict(id=job_id, path=path, text=norm, group=group, priority=priority,
                                language=lang, config=config, keys=[], ready=False)
        job = jobs[job_id]
        job['priority'] = min(job['priority'], priority)
        # Dedicated poems/science recordings are reached through database paths.
        if not dedicated and key not in job['keys']:
            job['keys'].append(key)
        return job_id
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT s.id,s.body FROM content_segments s JOIN content_items i ON i.id=s.item_id "
                        "WHERE i.kind='companion' AND i.status='published'")
            for row in cur.fetchall():
                target = add(row['body'], 'companion', child=True)
                bindings['companion'].append(dict(id=row['id'], body=row['body'], job=target))
            cur.execute("SELECT c.id,c.slug,c.kind,c.title,c.paragraphs_json,a.public_path AS audio_path "
                        "FROM learning_reading_cards c LEFT JOIN media_assets a ON a.id=c.audio_asset_id WHERE c.position<65535")
            for row in cur.fetchall():
                paragraphs = json.loads(row['paragraphs_json'])
                # Keep existing complete poetry recordings: same female speaker with recitation pacing.
                if row['kind'] == 'poetry':
                    continue
                text = row['title'] + '。' + ' '.join(paragraphs)
                target = add(text, 'science', dedicated='learning-science')
                bindings['cards'].append(dict(id=row['id'], slug=row['slug'], original=row['paragraphs_json'], job=target))
                for paragraph in paragraphs:
                    add(paragraph, 'science')
            cur.execute('SELECT id,slug,title,paragraphs FROM stories ORDER BY id')
            stories = cur.fetchall()
            cur.execute("SELECT story_id,COUNT(*) AS n FROM story_media_links WHERE role='audio' GROUP BY story_id")
            complete = {row['story_id']: row['n'] for row in cur.fetchall()}
            for row in stories:
                paragraphs = json.loads(row['paragraphs'])
                if complete.get(row['id']) == len(paragraphs):
                    continue
                targets = [add(p, 'stories', priority=1) for p in paragraphs]
                bindings['stories'].append(dict(id=row['id'], slug=row['slug'], original=row['paragraphs'], jobs=targets))
            cur.execute('SELECT question_id,option_text,is_correct FROM question_options ORDER BY question_id,sort_order,id')
            options = {}
            for row in cur.fetchall():
                options.setdefault(row['question_id'], []).append(row)
            cur.execute("SELECT id,stage,grade,subject,prompt,answer,explanation,hint FROM questions WHERE status='published' ORDER BY id")
            for q in cur.fetchall():
                preschool = q['stage'] == '幼儿园'
                grade = {'一年级':1,'二年级':2,'三年级':3,'四年级':4,'五年级':5,'六年级':6}.get(q['grade'], 7)
                priority = 10 if preschool else 10 + grade
                group = 'preschool' if preschool else 'grade-' + str(grade)
                prompt = ('我们来听这道题。' if preschool else '') + q['prompt']
                prompt_job = add(prompt, group, priority)
                opts = options.get(q['id'], [])
                correct = next((o['option_text'] for o in opts if o['is_correct']), q['answer'])
                if preschool:
                    for i, option in enumerate(opts):
                        add('第{}个选项是，{}。'.format('一二三四五六'[i] if i<6 else i+1, option['option_text']), group, priority)
                explanation = '正确答案是{}。{}'.format(correct, q['explanation'] or '')
                answer_job = add(explanation, group, priority)
                hint_job = add('提示：' + q['hint'], group, priority) if q['hint'] else None
                reward = ('答对啦！正确答案是{}。{}获得{}积分。'.format(correct, q['explanation'] or '', QUIZ_CORRECT_POINTS) if preschool
                          else '答对啦，答案是{}，获得{}积分'.format(correct, QUIZ_CORRECT_POINTS))
                add(reward, group, priority)
                bindings['questions'].append(dict(id=q['id'], prompt=q['prompt'], explanation=q['explanation'], hint=q['hint'],
                                                  jobs=[prompt_job, hint_job, answer_job]))
    fixed = subprocess.run([NODE, str(ROOT/'scripts/tts_collect.js')], capture_output=True, encoding='utf-8', check=True)
    collected = json.loads(fixed.stdout)
    for group in ['card_zh', 'card_en', 'safari_zh', 'safari_en', 'curious']:
        for text in collected[group]:
            add(text, 'fixed-' + group, lang='en-US' if group.endswith('_en') else 'zh-CN')
    extra = subprocess.run([NODE, str(ROOT/'scripts/audit_speech_catalogs.cjs')], capture_output=True, encoding='utf-8', check=True)
    for row in json.loads(extra.stdout):
        add(row['text'], row['group'])
    add('没关系，我们再听一次题目，换一个答案试试看。', 'interface')
    return jobs, bindings

class Publisher:
    def __init__(self, jobs, bindings):
        self.jobs, self.bindings = jobs, bindings
        self.published = {kind: set() for kind in bindings}
        self.asset_ids = {}

    def publish(self, ready):
        if not ready:
            return
        merge_manifest(MANIFEST, {key: job['path'] for job in ready for key in job['keys']})
        with connection() as conn:
            with conn.cursor() as cur:
                for job in ready:
                    file = FE / job['path'].lstrip('/')
                    cur.execute("INSERT INTO media_assets(public_path,media_kind,mime_type,file_bytes,title,source_name,license_name) "
                                "VALUES(%s,'audio','audio/mpeg',%s,%s,%s,%s) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
                                (job['path'], file.stat().st_size, job['text'][:150],
                                 '统一神经语音 ' + job['config']['voice'], '合成语音；非真人录音'))
                    self.asset_ids[job['id']] = cur.lastrowid
                    job['ready'] = True
                # Each binding is published only after its complete set exists.
                story_changes = {}
                science_changes = {}
                for kind, records in self.bindings.items():
                    for index, row in enumerate(records):
                        if index in self.published[kind]:
                            continue
                        targets = row.get('jobs') or [row['job']]
                        if not all(target is None or self.jobs[target]['ready'] for target in targets):
                            continue
                        if kind == 'questions':
                            paths = [self.jobs[target]['path'] if target else '' for target in targets]
                            cur.execute('UPDATE questions SET prompt_audio=%s,hint_audio=%s,explanation_audio=%s '
                                        'WHERE id=%s AND prompt=%s AND explanation=%s AND hint=%s',
                                        tuple(paths) + (row['id'], row['prompt'], row['explanation'], row['hint']))
                        elif kind == 'companion':
                            cur.execute('UPDATE content_segments SET audio_asset_id=%s WHERE id=%s AND body=%s',
                                        (self.asset_ids[row['job']], row['id'], row['body']))
                        elif kind == 'cards':
                            cur.execute('UPDATE learning_reading_cards SET audio_asset_id=%s WHERE id=%s AND paragraphs_json=%s',
                                        (self.asset_ids[row['job']], row['id'], row['original']))
                            if cur.rowcount:
                                science_changes[row['slug']] = self.jobs[row['job']]['path']
                        elif kind == 'stories':
                            cur.execute('SELECT paragraphs FROM stories WHERE id=%s FOR UPDATE', (row['id'],))
                            current = cur.fetchone()
                            if not current or current['paragraphs'] != row['original']:
                                continue
                            cur.execute("DELETE FROM story_media_links WHERE story_id=%s AND role='audio'", (row['id'],))
                            cur.executemany("INSERT INTO story_media_links(story_id,role,position,asset_id) VALUES(%s,'audio',%s,%s)",
                                            [(row['id'], i, self.asset_ids[target]) for i, target in enumerate(targets)])
                            story_changes[row['slug']] = [self.jobs[target]['path'] for target in targets]
                        self.published[kind].add(index)
                conn.commit()
        if story_changes:
            merge_manifest(STORY_MANIFEST, story_changes)
        if science_changes:
            path = ROOT/'content/learning/science-cards.json'
            cards = json.loads(path.read_text(encoding='utf-8'))
            for card in cards:
                if card['slug'] in science_changes:
                    card['audio_path'] = science_changes[card['slug']]
            write_json(path, cards)

async def run(workers):
    jobs, bindings = prepare()
    ordered = sorted(jobs.values(), key=lambda job: job['priority'])
    publisher = Publisher(jobs, bindings)
    progress = dict(pid=os.getpid(), state='running', voice_version=VOICE_VERSION, chinese=CHINESE, english=ENGLISH,
                    total=len(ordered), completed=0, generated=0, reused=0, failed=[], phase='priority',
                    started_at=time.strftime('%Y-%m-%d %H:%M:%S'), groups={})
    proxy = getproxies().get('https') or getproxies().get('http')
    proxy = proxy.replace('https://', 'http://') if proxy else None
    pending_publication = []

    def flush():
        if pending_publication:
            publisher.publish(pending_publication)
            pending_publication.clear()
        progress['updated_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
        progress['published'] = {kind: len(rows) for kind, rows in publisher.published.items()}
        write_json(STATUS, progress)

    async def generate(job):
        file = FE / job['path'].lstrip('/')
        file.parent.mkdir(parents=True, exist_ok=True)
        if audio_ok(file):
            progress['reused'] += 1
        else:
            temporary = file.with_name(file.name + '.{}.tmp'.format(os.getpid()))
            for attempt in range(4):
                try:
                    cfg = job['config']
                    await asyncio.wait_for(edge_tts.Communicate(job['text'], voice=cfg['voice'], rate=cfg['rate'],
                                          pitch=cfg['pitch'], proxy=proxy).save(str(temporary)), timeout=70)
                    if not audio_ok(temporary):
                        raise RuntimeError('Invalid audio payload')
                    os.replace(str(temporary), str(file))
                    progress['generated'] += 1
                    break
                except Exception as exc:
                    if temporary.exists():
                        temporary.unlink()
                    if attempt == 3:
                        progress['failed'].append(dict(path=job['path'], group=job['group'], error=type(exc).__name__))
                        print('Failed:', job['group'], type(exc).__name__, flush=True)
                        return
                    await asyncio.sleep(2 * (attempt + 1))
        pending_publication.append(job)
        progress['completed'] += 1
        progress['groups'][job['group']] = progress['groups'].get(job['group'], 0) + 1
        if len(pending_publication) >= 30:
            flush()
            print('Completed {}/{}; phase {}'.format(progress['completed'], progress['total'], progress['phase']), flush=True)

    try:
        # Finish the core pages before allowing the large bank to occupy the workers.
        priority = [job for job in ordered if job['priority'] < 10]
        bank = [job for job in ordered if job['priority'] >= 10]
        progress['priority_total'] = len(priority)
        flush()
        for label, batch in [('priority', priority), ('question-bank', bank)]:
            progress['phase'] = label
            semaphore = asyncio.Semaphore(workers)
            async def bounded(job):
                async with semaphore:
                    await generate(job)
                    await asyncio.sleep(.2)
            await asyncio.gather(*(bounded(job) for job in batch))
            flush()
            if label == 'priority':
                progress['priority_complete'] = not any(f['group'] not in ['preschool'] and not f['group'].startswith('grade-') for f in progress['failed'])
                write_json(STATUS, progress)
                print('Priority pages prepared; question bank now generating.', flush=True)
        progress['state'] = 'complete' if not progress['failed'] else 'needs_retry'
        flush()
    except BaseException as exc:
        progress['state'] = 'interrupted' if isinstance(exc, (KeyboardInterrupt, asyncio.CancelledError)) else 'error'
        progress['error'] = type(exc).__name__
        flush()
        raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--workers', type=int, default=5)
    args = parser.parse_args()
    if args.launch:
        if STATUS.exists():
            state = json.loads(STATUS.read_text(encoding='utf-8'))
            if state.get('state') == 'running':
                # Do not duplicate an active long-running generation process.
                check = subprocess.run(['powershell', '-NoProfile', '-Command',
                    "Get-CimInstance Win32_Process -Filter 'ProcessId={}' | Select-Object -ExpandProperty CommandLine".format(int(state['pid']))],
                    capture_output=True, encoding='utf-8', errors='replace')
                if 'generate_speech_library.py' in check.stdout:
                    print('Speech preparation is already running; PID', state['pid'])
                    return
        os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT 1')
        with (ROOT/'artifacts/speech-generation.log').open('ab') as log:
            process = subprocess.Popen([sys.executable, '-u', str(Path(__file__).resolve()), '--workers', str(max(1,min(args.workers,6)))],
                cwd=str(ROOT), env=os.environ.copy(), stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        print('Speech preparation launched; PID', process.pid)
    else:
        asyncio.run(run(max(1,min(args.workers,6))))

if __name__ == '__main__':
    main()
