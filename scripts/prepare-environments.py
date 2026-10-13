"""Encode generated environment art for the tablet viewer; no visual edits."""
import json
import sys
from pathlib import Path
from PIL import Image

target = Path(__file__).resolve().parents[1] / 'frontend' / 'assets' / 'environments'
target.mkdir(parents=True, exist_ok=True)
for item in json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')):
    with Image.open(item['source']) as image:
        image.convert('RGB').save(target / (item['id'] + '.webp'), 'WEBP', quality=82, method=6)
    print(item['id'], (target / (item['id'] + '.webp')).stat().st_size)
