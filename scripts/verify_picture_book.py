"""Validate published picture-book content and produce an illustration QA contact sheet."""
import json
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
book = json.loads((ROOT/'content/stories/the-bus-that-learned-to-stop.json').read_text(encoding='utf-8'))
folder = ROOT/'frontend/assets/stories'/book['slug']
assert len(book['pages']) == 16
assert sum(len(p['text']) for p in book['pages']) >= 3500
sheet = Image.new('RGB',(1440,1040),'#f3eedf')
draw = ImageDraw.Draw(sheet)
records = []
for index,page in enumerate(book['pages']):
    path = folder/(str(index+1)+'.webp')
    with Image.open(path) as image:
        image.load()
        assert image.width >= 1000 and image.height >= 700
        sample = image.resize((360,240))
        x=(index%4)*360; y=(index//4)*260
        sheet.paste(sample,(x,y))
        draw.text((x+10,y+243),'PAGE '+str(index+1),fill='#465b41')
    records.append({'page':index+1,'characters':len(page['text']),'bytes':path.stat().st_size,
                    'path':'/assets/stories/'+book['slug']+'/'+path.name,'prompt':page['scene']})
sheet.save(ROOT/'artifacts/bus-story-illustration-contact-sheet.jpg',quality=90)
summary_url='http://localhost:8000/api/stories?type=original-picture-book'
with urllib.request.urlopen(summary_url) as response:
    summaries=json.load(response)
items=[s for s in summaries['items'] if s['slug']==book['slug']]
assert len(items)==1 and 'paragraphs' not in items[0]
with urllib.request.urlopen('http://localhost:8000/api/stories/'+str(items[0]['id'])) as response:
    saved=json.load(response)
assert saved['paragraphs']==[p['text'] for p in book['pages']]
assert len(saved['paragraph_images'])==16
assert saved['conversation']==book['conversation']
for path in saved['paragraph_images']+[items[0]['cover']]:
    with urllib.request.urlopen('http://localhost:8000'+path) as response:
        assert response.status==200 and response.headers['Content-Type'].startswith('image/webp')
report={'title':book['title'],'story_id':saved['id'],'pages':len(records),
        'characters':sum(r['characters'] for r in records),'image_bytes':sum(r['bytes'] for r in records),
        'generation':'built-in imagegen; each illustration generated individually from the first-page character/style reference',
        'illustrations':records}
(ROOT/'artifacts/bus-story-image-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: 16 illustrated pages, '+str(report['characters'])+' characters, MySQL/API content match, all image URLs served')
print('Story ID:',saved['id'],'Reader images:',report['image_bytes'],'bytes')
