"""Contact sheets for human review; does not alter story artwork."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/story-alignment-audit-20261010'
plan=json.loads((ROOT/'content/stories/reviews/alignment-20261010.json').read_text(encoding='utf-8'))
titles={s['id']:s['title'] for s in plan['stories']}
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
for start in range(0,len(plan['jobs']),12):
    group=plan['jobs'][start:start+12]
    sheet=Image.new('RGB',(1440,4*350),'#faf8f1')
    draw=ImageDraw.Draw(sheet)
    for i,j in enumerate(group):
        x,y=(i%3)*480,(i//3)*350
        draw.text((x+8,y+8),f"{j['key']} {titles[j['id']]}",font=font,fill='#244739')
        receipt=OUT/'generated'/f"{j['key']}.json"
        if not receipt.exists():continue
        path=json.loads(receipt.read_text(encoding='utf-8'))['path']
        with Image.open(path) as image:
            thumb=ImageOps.contain(image.convert('RGB'),(464,309))
            sheet.paste(thumb,(x+(480-thumb.width)//2,y+38))
    sheet.save(OUT/f'new-art-{start//12+1}.jpg',quality=92)
    print(OUT/f'new-art-{start//12+1}.jpg')
