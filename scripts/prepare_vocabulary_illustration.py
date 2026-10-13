"""Archive an original noun illustration and encode its lightweight card asset."""
import argparse
import shutil
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('slug')
parser.add_argument('source')
args = parser.parse_args()
if not args.slug.isalpha():
    raise ValueError('Invalid vocabulary slug')
archive = ROOT/'artifacts/vocabulary-clay-originals'
out = ROOT/'frontend/assets/learning/vocabulary-clay'
archive.mkdir(parents=True, exist_ok=True)
out.mkdir(parents=True, exist_ok=True)
shutil.copy2(args.source, archive/(args.slug+'.png'))
image = ImageOps.fit(Image.open(args.source).convert('RGB'),(320,320),method=Image.Resampling.LANCZOS)
image.save(out/(args.slug+'-poster.webp'),'WEBP',quality=86,method=6)
print(args.slug, (out/(args.slug+'-poster.webp')).stat().st_size)
