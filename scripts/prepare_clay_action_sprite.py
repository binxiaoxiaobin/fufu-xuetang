# -*- coding: utf-8 -*-
"""Crop an AI-authored four-frame sheet and encode local animated WebP cards."""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('slug')
parser.add_argument('source')
args = parser.parse_args()
if not args.slug.isalpha():
    raise ValueError('Invalid action slug')
target = ROOT / 'frontend/assets/learning/actions-clay'
archive = ROOT / 'artifacts/actions-clay-originals'
target.mkdir(parents=True, exist_ok=True)
archive.mkdir(parents=True, exist_ok=True)
source = Path(args.source).resolve()
archived_source = archive / (args.slug + '.png')
if source != archived_source.resolve():
    shutil.copy2(source, archived_source)
sheet = Image.open(args.source).convert('RGB')
width, height = sheet.size
frames = [sheet.crop((int(col*width/2), int(row*height/2),
                       int((col+1)*width/2), int((row+1)*height/2)))
          for row in range(2) for col in range(2)]
frames = [ImageOps.fit(frame,(320,320),method=Image.LANCZOS) for frame in frames]
# Keep the same hand in the wave loop; reject the sheet's mirrored third pose.
if args.slug == 'wave':
    frames = [frames[0],frames[1],frames[0],frames[1]]
frames[-1].save(target / (args.slug + '-poster.webp'), 'WEBP', quality=85)
encoder = shutil.which('img2webp') or (Path(sys.prefix) / 'Library/bin/img2webp.exe')
if not Path(encoder).is_file():
    raise RuntimeError('img2webp is required to encode animated WebP cards')
with tempfile.TemporaryDirectory(prefix='clay-action-') as temp_dir:
    frame_paths = []
    for index, frame in enumerate(frames):
        frame_path = Path(temp_dir) / f'{index}.png'
        frame.save(frame_path)
        frame_paths.append(frame_path)
    durations = [350]*4 if args.slug == 'wave' else [280,240,280,700]
    command = [str(encoder), '-loop', '0', '-min_size']
    for duration, frame_path in zip(durations, frame_paths):
        command.extend(['-d', str(duration), str(frame_path)])
    command.extend(['-o', str(target / (args.slug + '-motion.webp'))])
    subprocess.run(command, check=True, capture_output=True, text=True)
proof = Image.new('RGB',(1280,320),'#f7f5ef')
for index, frame in enumerate(frames):
    proof.paste(frame,(index*320,0))
proof.save(archive / (args.slug + '-frames.jpg'), quality=88)
print(args.slug, 'animated WebP bytes:', (target/(args.slug+'-motion.webp')).stat().st_size)
