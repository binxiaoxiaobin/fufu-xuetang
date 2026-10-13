# -*- coding: utf-8 -*-
"""Prepare only the English action-card recordings; safely resume partial runs."""
import asyncio
import argparse
import json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/assets/audio/learning-actions-clay'
parser = argparse.ArgumentParser()
parser.add_argument('--proxy', default=None, help='Optional HTTP proxy for recording preparation')
parser.add_argument('--vocabulary', action='store_true', help='Prepare categorized noun cards instead of actions')
args = parser.parse_args()
if args.vocabulary:
    OUT = ROOT / 'frontend/assets/audio/learning-vocabulary-clay'


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = 'vocabulary-words.json' if args.vocabulary else 'action-words.json'
    cards = json.loads((ROOT / 'content/learning'/source).read_text(encoding='utf-8'))
    failures = []
    for card in cards:
        for kind in ('word', 'sentence'):
            target = OUT / '{}-{}.mp3'.format(card['slug'], kind)
            if target.is_file() and target.stat().st_size > 100:
                continue
            temporary = target.with_suffix('.tmp')
            try:
                await asyncio.wait_for(edge_tts.Communicate(card[kind], 'en-US-JennyNeural',
                    rate='-12%', proxy=args.proxy).save(str(temporary)), timeout=25)
                temporary.replace(target)
                print('Prepared:', target.name, flush=True)
            except Exception as error:
                temporary.unlink(missing_ok=True)
                failures.append(target.name)
                print('Unavailable:', target.name, type(error).__name__, flush=True)
    if failures:
        raise RuntimeError('Some recordings need retry: ' + ', '.join(failures))

asyncio.run(main())
