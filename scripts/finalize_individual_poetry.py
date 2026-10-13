"""Install each complete illustration without cropping, and merge original explanations."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'content/learning/poetry-cards.json'

def main():
    cards=json.loads(PATH.read_text(encoding='utf-8'))
    explanations={}
    for file in sorted((ROOT/'content/learning').glob('poetry-explanations-*.json')):
        for entry in json.loads(file.read_text(encoding='utf-8')):
            assert entry['slug'] not in explanations,entry['slug']
            explanations[entry['slug']]=entry
    assert len(explanations)==300,len(explanations)
    installed=[];pending=[]
    dest_dir=ROOT/'frontend/assets/learning/poetry/individual'
    dest_dir.mkdir(parents=True,exist_ok=True)
    for card in cards:
        entry=explanations[card['slug']]
        assert entry['title']==card['title'],card['slug']
        card['explanation']={'meaning':entry['meaning'],'notes':entry.get('notes',[]),'source':'福福学堂通俗解读'}
        manifest=ROOT/'artifacts/poetry-individual'/(card['slug']+'.json')
        if not manifest.is_file():pending.append(card['slug']);continue
        asset=json.loads(manifest.read_text(encoding='utf-8'))
        # Earlier output hints also mentioned the containing directory; take the final path.
        source=Path(asset['source_path'].split(' as ')[-1])
        if not source.is_file():raise RuntimeError('Illustration source missing: '+str(source))
        asset['source_path']=str(source)
        target=dest_dir/(card['slug']+'.webp')
        if not target.is_file():
            with Image.open(source) as original:
                illustration=ImageOps.exif_transpose(original).convert('RGB')
                illustration.thumbnail((720,480),Image.Resampling.LANCZOS)
                illustration.save(target,'WEBP',quality=84,method=6)
        with Image.open(target) as image:
            card['image_width'],card['image_height']=image.size
        card['image_path']='/assets/learning/poetry/individual/'+target.name
        asset['public_path']=card['image_path']
        asset['file_bytes']=target.stat().st_size
        manifest.write_text(json.dumps(asset,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        installed.append(card['image_path'])
    assert len(set(installed))==len(installed)
    temporary=PATH.with_suffix('.new.json')
    temporary.write_text(json.dumps(cards,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temporary.replace(PATH)
    print('Explanations:',len(cards),'Individual illustrations:',len(installed),'Remaining:',len(pending))
    (ROOT/'artifacts/poetry-illustration-progress.json').write_text(json.dumps({'installed':len(installed),'pending':pending},indent=2),encoding='utf-8')

if __name__=='__main__':main()
