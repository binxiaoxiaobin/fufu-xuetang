"""Export the live story inventory and visual/text review sheets (read-only)."""
import hashlib
import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from mysql_db import connection, _decode

OUT = ROOT / 'artifacts/story-alignment-audit-20261010'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
SMALL = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 14)


def lines(text, width, font):
    result, current = [], ''
    for char in text:
        candidate = current + char
        if font.getlength(candidate) > width and current:
            result.append(current)
            current = char
        else:
            current = candidate
    return result + ([current] if current else [])


def main(after=False):
    global OUT
    if after:
        OUT = OUT / 'after'
        OUT.mkdir(parents=True, exist_ok=True)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM stories ORDER BY id')
            stories = [_decode(row) for row in cur.fetchall()]
    snapshot = OUT / ('stories-after.json' if after else 'stories-before.json')
    if snapshot.exists() and not after:
        raise RuntimeError('The before-review snapshot is immutable; use --after for a new audit.')
    snapshot.write_text(json.dumps(stories, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    records = []
    for story in stories:
        paragraphs = story['paragraphs']
        pictures = story['paragraph_images']
        cells = []
        hashes = {}
        for i, text in enumerate(paragraphs):
            path = pictures[i] if i < len(pictures) and pictures[i] else story['cover']
            local = ROOT / 'frontend' / path.lstrip('/')
            detail = {'page': i + 1, 'text': text, 'path': path, 'exists': local.is_file(), 'fallback': i >= len(pictures)}
            if local.is_file():
                detail['sha256'] = hashlib.sha256(local.read_bytes()).hexdigest()
                hashes.setdefault(detail['sha256'], []).append(i + 1)
            cell = Image.new('RGB', (480, 480), '#faf8f1')
            draw = ImageDraw.Draw(cell)
            draw.text((12, 5), f"{i+1}. {story['title']}", fill='#244739', font=FONT)
            if local.is_file():
                with Image.open(local) as source:
                    detail['size'] = list(source.size)
                    art = ImageOps.contain(source.convert('RGB'), (456, 265))
                    cell.paste(art, ((480-art.width)//2, 35+(265-art.height)//2))
            else:
                draw.text((12, 110), 'MISSING IMAGE', fill='red', font=FONT)
            for j, line in enumerate(lines(text, 455, SMALL)):
                draw.text((12, 310+j*21), line, fill='#202c27', font=SMALL)
            cells.append(cell)
            records.append({'id': story['id'], 'slug': story['slug'], **detail})
        sheet = Image.new('RGB', (1440, ((len(cells)+2)//3)*480), '#e2e5de')
        for i, cell in enumerate(cells):
            sheet.paste(cell, ((i%3)*480, (i//3)*480))
        sheet.save(OUT / (f"{story['id']:03}-{story['slug']}.jpg"), quality=91)
        duplicates = [pages for pages in hashes.values() if len(pages)>1]
        print(f"{story['id']:03} {story['slug']} | {story['title']} | paragraphs={len(paragraphs)} images={len(pictures)} duplicate-pages={duplicates}")
    (OUT / 'inventory.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Stories: {len(stories)}; pages: {len(records)}; missing: {sum(not p["exists"] for p in records)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--after',action='store_true')
    main(parser.parse_args().after)
