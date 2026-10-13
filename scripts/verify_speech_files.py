"""Check MP3 frame metadata and served audio references; never requests synthesis."""
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, ProxyHandler, build_opener
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / 'frontend'
PATH = ROOT / 'artifacts/speech-audio-audit-20261009.json'
report = json.loads(PATH.read_text(encoding='utf-8'))
def check_file(file):
    try:
        info = MP3(file).info
        if info.length <= 0:
            raise ValueError('zero duration')
        return {'path': '/' + file.relative_to(FE).as_posix(), 'seconds': round(info.length, 3), 'bytes': file.stat().st_size}
    except Exception as exc:
        return {'path': '/' + file.relative_to(FE).as_posix(), 'error': str(exc)}
files = list((FE / 'assets/audio').rglob('*.mp3'))
with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check_file, files))
report['mp3_integrity'] = {'checked': len(results), 'invalid': [r for r in results if 'error' in r],
                           'total_hours': round(sum(r.get('seconds', 0) for r in results) / 3600, 2)}
def head(path):
    try:
        opener = build_opener(ProxyHandler({}))
        with opener.open(Request('http://127.0.0.1:8000' + path, method='HEAD'), timeout=12) as response:
            return {'path': path, 'status': response.status, 'type': response.headers.get('Content-Type'),
                    'bytes': int(response.headers.get('Content-Length', 0))}
    except Exception as exc:
        return {'path': path, 'error': str(exc)}
with ThreadPoolExecutor(max_workers=6) as pool:
    http = list(pool.map(head, report['references']))
report['http_audio'] = {'checked': len(http), 'failures': [r for r in http if r.get('status') != 200 or not r.get('bytes')],
                         'content_types': dict(Counter(r.get('type', 'error') for r in http))}
report['story_summary'] = {'stories': len(report['stories']),
                          'complete_recordings': sum(s['linked'] == s['paragraphs'] for s in report['stories']),
                          'no_recordings': sum(s['linked'] == 0 for s in report['stories']),
                          'partial_recordings': sum(0 < s['linked'] < s['paragraphs'] for s in report['stories'])}
report['uncached_unique_text_voice_pairs'] = len({(s['key'], s['voice']) for s in report['uncached_speech']})
PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: report[k] for k in ['mp3_integrity', 'http_audio', 'story_summary', 'uncached_unique_text_voice_pairs']}, ensure_ascii=True))
