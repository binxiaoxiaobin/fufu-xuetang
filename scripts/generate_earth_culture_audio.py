"""Generate the complete revised earth narration before publishing its database seed."""
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.request import getproxies

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'scripts')]
import edge_tts
from speech_config import CHINESE, VOICE_VERSION
from speech_manifest import merge_manifest
from tts_build import normalize

SEED = ROOT / 'backend/seed_data/earth_culture.json'


async def main():
    data = json.loads(SEED.read_text(encoding='utf-8'))
    changes = {}
    proxy = getproxies().get('https') or getproxies().get('http')
    proxy = proxy.replace('https://', 'http://') if proxy else None
    semaphore = asyncio.Semaphore(2)
    async def generate(kind, key, item):
        text = normalize(item['narration'], 'zh-CN')
        digest = hashlib.sha256((VOICE_VERSION + '\0' + json.dumps(CHINESE, sort_keys=True) + '\0' + text).encode()).hexdigest()[:24]
        path = '/assets/audio/earth-culture/{}.mp3'.format(digest)
        local = ROOT / 'frontend' / path.lstrip('/')
        local.parent.mkdir(parents=True, exist_ok=True)
        async with semaphore:
            if not local.is_file() or local.stat().st_size < 1000:
                temporary = local.with_suffix('.tmp')
                for attempt in range(5):
                    try:
                        await asyncio.wait_for(edge_tts.Communicate(text, proxy=proxy, **CHINESE).save(str(temporary)), 90)
                        if temporary.stat().st_size < 1000:
                            raise ValueError('Audio is empty')
                        os.replace(str(temporary), str(local))
                        break
                    except Exception:
                        if temporary.exists():
                            temporary.unlink()
                        if attempt == 4:
                            raise
                        await asyncio.sleep(3 * (attempt + 1))
            item['audio_path'] = path
            changes[hashlib.sha1(text.encode()).hexdigest()[:12]] = path
            print('Ready: {} / {}'.format(kind, key), flush=True)
    await asyncio.gather(*(generate(kind, key, item) for kind in ('countries', 'landmarks') for key, item in data[kind].items()))
    # Publish only after every recording exists. The shared manifest uses its interprocess lock.
    merge_manifest(ROOT / 'frontend/assets/audio/tts/manifest.json', changes)
    temporary = SEED.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(str(temporary), str(SEED))
    print('All 35 revised narrations are ready for database publication.', flush=True)


if __name__ == '__main__':
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
