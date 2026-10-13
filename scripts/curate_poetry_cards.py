"""Correct known metadata issues and remove near-identical anthology variants."""
import json
import re
import hashlib
from difflib import SequenceMatcher
from pathlib import Path
from opencc import OpenCC
from prepare_poetry_cards import simplify, FAVORITES

ROOT=Path(__file__).resolve().parents[1]
CC=OpenCC('t2s')
PATH=ROOT/'content/learning/poetry-cards.json'

def plain(card):
    text=''.join(card['paragraphs'])
    text=re.sub(r'[（(][^）)]*[）)]','',text)
    return re.sub(r'[^\u4e00-\u9fff]','',text).translate(str.maketrans({'沈':'沉','悮':'误','著':'着','鴈':'雁','常':'嫦','谿':'溪','汚':'污','涴':'污','遶':'绕'}))

def corrected(card):
    previous=(card['author'],card['title'],card['paragraphs'])
    card=dict(card)
    corrections={'耿𣲗':'耿湋','张演':'王驾'}
    card['author']=corrections.get(card['author'],card['author'])
    if card['subtitle']=='月黑雁飞高':card['author']='卢纶'
    if card['subtitle']=='岭外音书绝':card['author']='宋之问'
    if card['subtitle'].startswith('回乐峰前'):
        card['title']='夜上受降城闻笛';card['author']='李益'
    if card['title'] in ('烈女操','列女操'):return None
    if card['subtitle']=='暮云收尽溢清寒':return None  # Su Shi's Song poem, not a Tang poem.
    if card['author'] in ('蔡襄','谢枋得','释明辩','黄拱'):return None
    if card['dynasty']=='宋' and card['author']=='欧阳修' and card['subtitle'].startswith(('燕鸿过后','池塘水绿')):return None
    replacement={
        '雪中谁寄锦书来':'云中谁寄锦书来', '东篱把洒':'东篱把酒',
        '醉里蛮音':'醉里吴音', '枫落吴江冷':'寂寞沙洲冷',
        '又匆匆、过了青明':'又匆匆、过了清明',
        '绿树听鹈。':'绿树听鹈鴂。', '郴阳和雁无':'郴阳和雁无',
    }
    paragraphs=[re.sub(r'[（(][^）)]*[）)]','',p) for p in card['paragraphs']]
    for old,new in replacement.items():paragraphs=[p.replace(old,new) for p in paragraphs]
    paragraphs=[re.sub(r'刬*地东风欺客梦','刬地东风欺客梦',p) for p in paragraphs]
    card['paragraphs']=paragraphs
    kind='tang' if card['dynasty']=='唐' else 'song'
    changed=previous!=(card['author'],card['title'],paragraphs)
    key=(card['slug'][5:] if not changed else
         hashlib.sha1((kind+card['author']+card['title']+''.join(paragraphs)).encode()).hexdigest()[:16])
    card['slug']='poem-'+key
    if changed:card['audio_path']='/assets/audio/learning-poetry/'+key+'.mp3'
    card['narration_text']=card['title']+'。'+card['author']+'。\n\n'+'\n\n'.join(paragraphs)
    return card

def main():
    old=json.loads(PATH.read_text(encoding='utf-8'))
    archive=ROOT/'artifacts/poetry-before-curation.json'
    if not archive.exists():archive.write_text(json.dumps(old,ensure_ascii=False,indent=2),encoding='utf-8')
    anthology=json.loads((ROOT/'artifacts/poetry-mengxue.json').read_text(encoding='utf-8'))
    extra=[simplify(dict(author=c['author'],title=c['chapter'],paragraphs=c['paragraphs']),'tang') for g in anthology['content'] for c in g['content']]
    extra.sort(key=lambda c:len(c['narration_text']))
    song=json.loads((ROOT/'artifacts/poetry-song.json').read_text(encoding='utf-8'))
    extra_song=[simplify(c,'song') for c in song]
    chosen=[]
    for dynasty,count,supplements in [('唐',200,extra),('宋',100,extra_song)]:
        accepted=[];texts=[]
        for candidate in [c for c in old if c['dynasty']==dynasty]+supplements:
            card=corrected(candidate)
            if not card:continue
            p=plain(card)
            if not 12<=len(p)<=600 or re.search('[□�]',p):continue
            if any(p==other or SequenceMatcher(None,p,other,autojunk=False).ratio()>=.85 or
                   (p[:6]==other[:6] and SequenceMatcher(None,p,other,autojunk=False).ratio()>=.72) for other in texts):continue
            accepted.append(card);texts.append(p)
            if len(accepted)==count:break
        assert len(accepted)==count,(dynasty,len(accepted))
        chosen.extend(accepted)
    PATH.write_text(json.dumps(chosen,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Curated',len(chosen),'poems;',len(set(c['slug'] for c in old)-set(c['slug'] for c in chosen)),'old variants replaced')

if __name__=='__main__':main()
