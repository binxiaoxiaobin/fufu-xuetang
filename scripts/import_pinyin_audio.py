"""Download discrete educational pinyin recordings and import their provenance."""
import concurrent.futures
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ('initials', '声母', 'b p m f d t n l g k h j q x zh ch sh r z c s y w'),
    ('simple', '单韵母', 'a o e i u ü'),
    ('compound', '复韵母', 'ai ei ui ao ou iu ie üe'),
    ('special', '特殊韵母', 'er'),
    ('nasal', '鼻韵母', 'an en in un ün ang eng ing ong'),
]
SOURCE = 'https://www.sreading.org/zh-hans/pinyin-pathway'

def download(card):
    destination = ROOT/'frontend'/card['audio_path'].lstrip('/')
    destination.parent.mkdir(parents=True, exist_ok=True)
    url = 'https://raw.githubusercontent.com/zispace/hanyu-pinyin-audio/data/sreading.org/pinyin/'+quote(card['symbol'])+'.mp3'
    subprocess.run(['curl.exe', '-fL', '--retry', '2', '--max-time', '45', '-s', url, '-o', str(destination)], check=True)
    data = destination.read_bytes()
    if len(data) < 500 or not (data[:3] == b'ID3' or data[0] == 255):
        raise RuntimeError('Invalid audio: '+card['symbol'])
    return destination.stat().st_size

if __name__ == '__main__':
    cards = []
    for group, name, symbols in GROUPS:
        for symbol in symbols.split():
            slug = symbol.replace('ü', 'v')
            cards.append({'symbol':symbol, 'slug':slug, 'group_key':group, 'group_name':name,
                          'audio_path':'/assets/audio/learning-pinyin/'+slug+'.mp3',
                          'source_name':'SReading 拼音捷径 · 真人示范录音', 'source_url':SOURCE})
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        sizes = list(pool.map(download, cards))
    (ROOT/'content/learning/pinyin-cards.json').write_text(json.dumps(cards, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Downloaded',len(cards),'recordings;',sum(sizes),'bytes')
    os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
    sys.path.insert(0, str(ROOT/'backend'))
    import pinyin_cards
    pinyin_cards.initialize()
    print('Database cards:',len(pinyin_cards.list_cards()['cards']))
