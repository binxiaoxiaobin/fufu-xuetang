"""Optimize generated original scenery and assign an appropriate shared scene."""
import json
from pathlib import Path
from PIL import Image,ImageOps

ROOT=Path(__file__).resolve().parents[1]
sources=json.loads((ROOT/'artifacts/poetry-generated-images.json').read_text(encoding='utf-8'))
out=ROOT/'frontend/assets/learning/poetry';out.mkdir(parents=True,exist_ok=True)
for item in sources:
    image=Image.open(item['path']).convert('RGB')
    ImageOps.fit(image,(640,640)).save(out/(item['key']+'.webp'),quality=84,method=6)
cards=json.loads((ROOT/'content/learning/poetry-cards.json').read_text(encoding='utf-8'))
for card in cards:
    # Prefer the title and opening scene, rather than an incidental word later on.
    # 春晓 mentions 夜来 in its second line; 绝句 mentions distant snow later on.
    hints=[('snow',['雪','寒江','冰']),('lotus',['莲','荷']),('field',['田','禾','农','稻','草']),
           ('autumn',['秋','枫','菊']),('spring',['春','花','柳','莺','雨']),
           ('moon',['月','夜','星']),('journey',['送','别','行人','归客','故人'])]
    theme=None
    for text in [card['title'],card['paragraphs'][0]]:
        theme=next((name for name,words in hints if any(word in text for word in words)),None)
        if theme:break
    theme={'相思':'spring','游子吟':'spring'}.get(card['title'],theme or 'mountain')
    card['theme']=theme;card['image_path']='/assets/learning/poetry/'+theme+'.webp'
(ROOT/'content/learning/poetry-cards.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Original scene assets:',len(sources),'Poem cards:',len(cards))
