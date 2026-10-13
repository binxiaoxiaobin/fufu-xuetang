"""Validate all locally served province galleries and attribution records."""
from pathlib import Path
import json, re
from PIL import Image
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'backend/seed_data/province_photos.json').read_text(encoding='utf-8'))
codes=set(re.findall(r'adcode: (\d+)',(root/'frontend/china-provinces.js').read_text(encoding='utf-8')))
assert set(manifest)==codes and len(codes)==34
total=0
for code,photos in manifest.items():
    assert len(photos)==3 and all(photos),code
    assert len({p['originalFile'] for p in photos})==3,code
    for photo in photos:
        asset=root/'frontend'/photo['file'].lstrip('/')
        assert asset.is_file() and asset.stat().st_size>3000,str(asset)
        with Image.open(asset) as image:
            image.verify()
        assert photo['source'].startswith('https://commons.wikimedia.org/'),photo
        assert photo['license'] and photo['author'] and photo['label'] and photo['caption'],photo
        total+=1
assert total==102
print(f'{len(codes)} regions, {total} valid local photographs; individual attribution complete')
