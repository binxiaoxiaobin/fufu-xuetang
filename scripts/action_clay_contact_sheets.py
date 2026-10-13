# -*- coding: utf-8 -*-
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
items=json.loads((ROOT/'artifacts/action-clay-generation-manifest.json').read_text(encoding='utf-8'))
for start in range(0,len(items),5):
    chunk=items[start:start+5]
    sheet=Image.new('RGB',(800,220*len(chunk)),'#faf8f2')
    draw=ImageDraw.Draw(sheet)
    for row,item in enumerate(chunk):
        frames=Image.open(ROOT/'artifacts/actions-clay-originals'/(item['slug']+'-frames.jpg'))
        frames.thumbnail((800,200))
        draw.text((8,row*220+4),item['slug'],fill='#293f36')
        sheet.paste(frames,(0,row*220+20))
    sheet.save(ROOT/'artifacts'/('action-clay-frames-'+str(start//5+1)+'.jpg'),quality=90)
