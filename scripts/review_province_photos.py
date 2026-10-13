"""Produce contact sheets for visual review of all province photographs."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'backend/seed_data/province_photos.json').read_text(encoding='utf-8'))
for column in range(3):
    sheet=Image.new('RGB',(1200,1800),'#fafbf4');draw=ImageDraw.Draw(sheet)
    for n,(code,photos) in enumerate(manifest.items()):
        photo=photos[column]
        if not photo:continue
        x=(n%4)*300;y=(n//4)*200
        image=Image.open(root/'frontend'/photo['file'].lstrip('/'));image.thumbnail((294,165));sheet.paste(image,(x+(294-image.width)//2,y))
        draw.text((x+4,y+166),code+' / '+str(column+1),fill='#263c2d')
        draw.text((x+4,y+181),photo['article'][:43],fill='#263c2d')
    sheet.save(root/f'artifacts/province-photos-review-{column+1}.jpg',quality=90)
