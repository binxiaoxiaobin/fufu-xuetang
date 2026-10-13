"""Verify published story content and locally served reviewed media, read-only."""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/story-alignment-audit-20261010'
BASE = 'http://localhost:8000'

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as response:
        return response.read(), response.headers.get_content_type()

def main():
    plan = json.loads((ROOT/'content/stories/reviews/alignment-20261010.json').read_text(encoding='utf-8'))
    before = {s['id']: s for s in json.loads((OUT/'stories-before.json').read_text(encoding='utf-8'))}
    manifest = json.loads((ROOT/'frontend/assets/audio/stories/manifest.json').read_text(encoding='utf-8'))
    def check_story(s):
        live = json.loads(get('/api/stories/'+str(s['id']))[0])
        expected = s if s.get('paragraphs') else before[s['id']]
        for key in ('paragraphs', 'paragraph_images', 'source_note'):
            assert live.get(key) == expected.get(key), (s['id'], key)
        assert live['audio_paths'] == manifest[s['slug']], s['slug']
        assert len(live['paragraphs']) == len(live['paragraph_images']) == len(live['audio_paths'])
        assert len(set(live['paragraph_images'])) == len(live['paragraph_images'])
        for path in live['paragraph_images']:
            with Image.open(ROOT/'frontend'/path.lstrip('/')) as image:
                image.verify()
        for path in live['audio_paths']:
            assert (ROOT/'frontend'/path.lstrip('/')).stat().st_size > 1000, path
        return len(live['paragraphs'])
    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = sum(pool.map(check_story, plan['stories']))
        images = list(pool.map(lambda j: get(j['target']), plan['jobs']))
    assert all(data[:4] == b'RIFF' and mime == 'image/webp' for data,mime in images)
    audio = [path for paths in manifest.values() for path in paths if '_review-20261010_' in path]
    with ThreadPoolExecutor(max_workers=4) as pool:
        clips = list(pool.map(get, audio))
    assert all(len(data)>1000 and mime in ('audio/mpeg','audio/mp3') for data,mime in clips)
    result = {'stories':len(plan['stories']), 'pages':pages, 'changed_stories':sum(bool(s.get('paragraphs')) for s in plan['stories']),
              'new_images_http_verified':len(images), 'new_narration_http_verified':len(clips), 'missing_media':0,
              'api_matches_review':True}
    (OUT/'verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))

if __name__ == '__main__':
    main()
