"""Fetch licensed planet maps; prepare local tablet-sized texture variants and seeds."""
import concurrent.futures
import hashlib
import json
import re
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/assets/solar'
OUT.mkdir(parents=True, exist_ok=True)
ORIGINALS = ROOT / 'content/solar/originals'
ORIGINALS.mkdir(parents=True, exist_ok=True)
names = {'sun':'sun', 'mercury':'mercury', 'venus':'venus_atmosphere',
    'earth':'earth_daymap', 'earth-night':'earth_nightmap', 'earth-clouds':'earth_clouds',
    'mars':'mars', 'jupiter':'jupiter', 'saturn':'saturn', 'saturn-rings':'saturn_ring_alpha',
    'uranus':'uranus', 'neptune':'neptune', 'moon':'moon'}

def prepare(pair):
    key, name = pair
    extension = 'png' if key == 'saturn-rings' else 'jpg'
    source = 'https://www.solarsystemscope.com/textures/download/2k_%s.%s' % (name, extension)
    original = ORIGINALS / (key + '.' + extension)
    if not original.exists():
        with urllib.request.urlopen(source, timeout=60) as response:
            original.write_bytes(response.read())
    with Image.open(original) as image:
        image.thumbnail((1024, 512), Image.Resampling.LANCZOS)
        if key == 'earth-clouds':
            image = image.convert('L')
        image.save(OUT/(key+'.webp'), 'WEBP', quality=85, method=6)
        width, height = image.size
    return dict(key=key, path='/assets/solar/'+key+'.webp', source=source,
                width=width, height=height, sha256=hashlib.sha256(original.read_bytes()).hexdigest())

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    textures = list(executor.map(prepare, names.items()))
(OUT/'manifest.json').write_text(json.dumps(textures,ensure_ascii=False,indent=2),encoding='utf-8')
seed = ROOT/'backend/seed_data/solar_catalog.json'
if not seed.exists():
    old = (ROOT/'frontend/solar.js').read_text(encoding='utf-8')
    literal = old.split('const bodies = [',1)[1].split('\n  ];',1)[0]
    # The existing catalog is a literal with no expressions.
    literal = re.sub(r'([,{]\s*)([a-zA-Z]+):',r'\1"\2":', '['+literal+']')
    literal = literal.replace("'", '"')
    literal = re.sub(r'(:\s*)(\.\d+)',r'\g<1>0\2', literal)
    bodies = json.loads(literal)
    moon = dict(id='moon',name='月球',kind='地球的天然卫星',color='#c9c9c6',size=.16,
        orbit=0,speed=0,year='约 27.3 个地球日',intro='月球围绕地球公转，本身不发光。我们看到的是它反射的阳光。',
        detail='它表面的环形山记录了许多古老的撞击。月球自转与公转周期相近，因而大致总以同一面朝向地球。',icon='🌙')
    bodies.append(moon)
    seed.write_text(json.dumps(bodies,ensure_ascii=False,indent=2),encoding='utf-8')
with Image.open(ROOT/'frontend/assets/characters/tuantuan-girl-front.png') as image:
    image.thumbnail((320,320),Image.Resampling.LANCZOS)
    image.save(ROOT/'frontend/assets/characters/tuantuan-avatar.webp','WEBP',quality=85,method=6)
print('Prepared',len(textures),'maps;',sum(p.stat().st_size for p in OUT.glob('*.webp')),'bytes')
