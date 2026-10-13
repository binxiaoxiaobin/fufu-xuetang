"""Build full-frame labelled contact sheets for visual review, not production images."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
cards=json.loads((ROOT/'content/learning/poetry-cards.json').read_text(encoding='utf-8'))
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',15)
destination=ROOT/'artifacts/poetry-contact-sheets'
destination.mkdir(parents=True,exist_ok=True)
for offset in range(0,len(cards),24):
    sheet=Image.new('RGB',(1200,880),'#fffdf8');draw=ImageDraw.Draw(sheet)
    for j,card in enumerate(cards[offset:offset+24]):
        x=(j%4)*300;y=(j//4)*146
        if '/individual/' not in card['image_path']:continue
        with Image.open(ROOT/'frontend'/card['image_path'].lstrip('/')) as original:
            thumbnail=original.copy();thumbnail.thumbnail((280,116))
            sheet.paste(thumbnail,(x+(300-thumbnail.width)//2,y))
        draw.text((x+10,y+120),str(offset+j+1)+' '+card['title'][:12]+' · '+card['author'][:5],font=font,fill='#293f36')
    sheet.save(destination/('%03d.jpg'%(offset+1)),quality=92)
print('Contact sheets:',len(list(destination.glob('*.jpg'))))
