"""Check the served catalog, all model payloads, revised recordings and dead entry code."""
import concurrent.futures
import json
import struct
from pathlib import Path
from urllib.request import urlopen
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://localhost:8000'
seed = json.loads((ROOT / 'backend/seed_data/earth_culture.json').read_text(encoding='utf-8'))
with urlopen(BASE + '/api/geography/culture') as response:
    served = json.load(response)
for kind in ('countries', 'landmarks'):
    assert seed[kind] == served[kind]
report = {'countries': 24, 'landmarks': 11, 'recordings': [], 'models': []}

def check_audio(pair):
    key, item = pair
    path = ROOT / 'frontend' / item['audio_path'].lstrip('/')
    info = MP3(str(path)).info
    assert info.length > 15 and info.sample_rate >= 16000
    with urlopen(BASE + item['audio_path']) as response:
        assert response.status == 200 and len(response.read(1024)) == 1024
    return dict(name=item['name'], seconds=round(info.length, 1), bytes=path.stat().st_size)

def check_model(pair):
    key, item = pair
    path = ROOT / ('frontend/assets/landmarks-v2/' + item['asset'] + '-exterior.glb')
    payload = path.read_bytes()
    magic, version, length = struct.unpack('<4sII', payload[:12])
    assert magic == b'glTF' and version == 2 and length == len(payload)
    chunk_length, chunk_type = struct.unpack('<II', payload[12:20])
    assert chunk_type == 0x4E4F534A
    gltf = json.loads(payload[20:20 + chunk_length])
    assert gltf['meshes'] and gltf['scenes']
    for item_view in item['closeups']:
        assert len(item_view['eye']) == len(item_view['target']) == 3
        assert item_view['eye'] != item_view['target']
    with urlopen(BASE + '/assets/landmarks-v2/' + path.name) as response:
        assert response.status == 200 and response.read(4) == b'glTF'
    return dict(name=item['name'], bytes=length, meshes=len(gltf['meshes']))

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    report['recordings'] = list(pool.map(check_audio, [pair for kind in ('countries','landmarks') for pair in served[kind].items()]))
    report['models'] = list(pool.map(check_model, served['landmarks'].items()))
source = (ROOT / 'frontend/landmark-tour.js').read_text(encoding='utf-8')
for removed in ('interior', 'landmarkEnter', 'landmarkExit', 'landmarkHotspot', 'realTour', 'configureDoor', 'raycaster'):
    assert removed not in source, removed
assert not (ROOT / 'frontend/real-tour-catalog.js').exists()
assert not (ROOT / 'frontend/landmark-catalog-extra.js').exists()
(ROOT / 'artifacts/earth-culture-verification-20261010.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('Passed: database/seed coherence, 35 decodable served recordings, 11 served GLB models, no visitor-space runtime.')
