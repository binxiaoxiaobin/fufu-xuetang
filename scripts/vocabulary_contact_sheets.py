import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
cards = json.loads((ROOT/'content/learning/vocabulary-words.json').read_text(encoding='utf-8'))
for start in range(0, len(cards), 8):
    sheet = Image.new('RGB',(800,460),'#faf8f2')
    draw = ImageDraw.Draw(sheet)
    for index,card in enumerate(cards[start:start+8]):
        file = ROOT/'frontend/assets/learning/vocabulary-clay'/(card['slug']+'-poster.webp')
        if not file.is_file():
            continue
        x,y = (index%4)*200,(index//4)*230
        image = Image.open(file).resize((200,200))
        sheet.paste(image,(x,y))
        draw.text((x+8,y+204),card['word'],fill='#293f36')
    sheet.save(ROOT/'artifacts'/('vocabulary-proof-'+str(start//8+1)+'.jpg'),quality=92)
