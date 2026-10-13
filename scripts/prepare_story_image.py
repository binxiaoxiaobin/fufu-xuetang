"""Save generated originals and lightweight reader/card images in the story asset directory."""
import json
import sys
from pathlib import Path
from PIL import Image
RESAMPLE = getattr(Image, 'Resampling', Image).LANCZOS

ROOT = Path(__file__).resolve().parents[1]
SLUG = 'the-bus-that-learned-to-stop'
source = Path(sys.argv[1])
page = int(sys.argv[2])
target = ROOT/'frontend/assets/stories'/SLUG
target.mkdir(parents=True, exist_ok=True)
# Keep the generated source outside the public directory for future revisions.
archive = ROOT/'artifacts/story-originals'/SLUG
archive.mkdir(parents=True, exist_ok=True)
import shutil
shutil.copy2(source, archive/(str(page)+'.png'))
with Image.open(source) as picture:
    picture = picture.convert('RGB')
    picture.thumbnail((1440, 1440), RESAMPLE)
    picture.save(target/(str(page)+'.webp'), 'WEBP', quality=86, method=6)
    if page == 1:
        picture.thumbnail((640, 640), RESAMPLE)
        picture.save(target/'cover-card.webp', 'WEBP', quality=83, method=6)
print(json.dumps({'page': page, 'bytes': (target/(str(page)+'.webp')).stat().st_size}))
