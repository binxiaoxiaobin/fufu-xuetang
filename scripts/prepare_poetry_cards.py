"""Build a reproducible 200 Tang / 100 Song selection from the MIT corpus."""
import hashlib
import json
import re
from pathlib import Path
from opencc import OpenCC

ROOT=Path(__file__).resolve().parents[1]
cc=OpenCC('t2s')
FAVORITES='静夜思 春晓 登鹳雀楼 悯农 相思 鹿柴 江雪 游子吟 咏鹅 绝句 早发白帝城 望庐山瀑布 赠汪伦 山行 清明 九月九日忆山东兄弟 回乡偶书 望月怀远 黄鹤楼送孟浩然之广陵 送元二使安西 枫桥夜泊 夜泊牛渚怀古 竹里馆 鸟鸣涧 望天门山 赋得古原草送别 黄鹤楼 春夜喜雨 月下独酌 饮酒 钱塘湖春行 逢雪宿芙蓉山主人 终南望余雪 过故人庄 闻官军收河南河北 送友人'.split()
AUTHORS='苏轼 李清照 辛弃疾 欧阳修 晏殊 柳永 陆游 王安石 岳飞 秦观 晏几道 周邦彦 张孝祥 姜夔'.split()
SONG_FIRST_LINES=['明月几时有','大江东去','十年生死两茫茫','老夫聊发少年狂','莫听穿林打叶声','山下兰芽短浸溪','花褪残红青杏小','缺月挂疏桐','常记溪亭日暮','昨夜雨疏风骤','红藕香残玉簟秋','寻寻觅觅','薄雾浓云愁永昼','天接云涛连晓雾','风住尘香花已尽','明月别枝惊鹊','醉里挑灯看剑','茅檐低小','东风夜放花千树','何处望神州','千古江山','纤云弄巧','怒发冲冠','寒蝉凄切','去年元夜时','一曲新词酒一杯','驿外断桥边','郁孤台下清江水','枕上十年事','少年不识愁滋味']

def simplify(item,kind):
    author=cc.convert(item['author']).strip()
    title=cc.convert(item.get('title') or item.get('rhythmic','')).strip()
    paragraphs=[re.sub(r'[（(][^）)]*[）)]','',cc.convert(line)).strip() for line in item['paragraphs'] if line.strip()]
    if kind=='tang':paragraphs=[p[:-1]+'。' if p.endswith('，') else p for p in paragraphs]
    lines=[line for p in paragraphs for line in re.findall(r'[^。！？；]+[。！？；]?',p)]
    text=''.join(paragraphs)
    key=hashlib.sha1((kind+author+title+text).encode()).hexdigest()[:16]
    theme='snow' if any(x in text+title for x in ['雪','寒江','冰']) else 'moon' if any(x in text+title for x in ['月','夜','星']) else 'spring' if any(x in text+title for x in ['春','花','柳','莺','雨']) else 'mountain'
    # A first line distinguishes the many Song works sharing the same tune title.
    subtitle=re.split('[，。！？]',paragraphs[0])[0]
    return dict(slug='poem-'+key,subject='语文',kind='poetry',title=title,author=author,
                dynasty='唐' if kind=='tang' else '宋',collection='唐诗' if kind=='tang' else '宋词',
                paragraphs=paragraphs,subtitle=subtitle,theme=theme,
                image_path='/assets/learning/poetry/'+theme+'.webp',
                audio_path='/assets/audio/learning-poetry/'+key+'.mp3',
                source_url='https://github.com/chinese-poetry/chinese-poetry',source_name='chinese-poetry 古典诗词数据库',
                license_name='MIT · Copyright 2016 JackeyGao',
                narration_text=title+'。'+author+'。\n\n'+'\n\n'.join(paragraphs))

def main():
    selections=[]
    for kind,count in [('tang',200),('song',100)]:
        original=json.loads((ROOT/'artifacts'/('poetry-'+kind+'.json')).read_text(encoding='utf-8'))
        if kind=='song':
            supplements=[]
            for file in sorted((ROOT/'artifacts/poetry-song-corpus').glob('*.json')):
                for c in json.loads(file.read_text(encoding='utf-8')):
                    first=cc.convert(c['paragraphs'][0]) if c.get('paragraphs') else ''
                    if any(first.startswith(line) for line in SONG_FIRST_LINES):supplements.append(c)
            original=supplements+original
        if kind=='tang':
            # The Mengxue anthology carries the familiar mainland teaching versions.
            anthology=json.loads((ROOT/'artifacts/poetry-mengxue.json').read_text(encoding='utf-8'))
            common=[dict(author=c['author'],title=c['chapter'],paragraphs=c['paragraphs']) for group in anthology['content'] for c in group['content']]
            qianjia=json.loads((ROOT/'artifacts/poetry-qianjia.json').read_text(encoding='utf-8'))
            for group in qianjia['content']:
                for c in group['content']:
                    if '唐' not in c['author']:continue
                    parts=c['paragraphs'] if c['paragraphs'] and isinstance(c['paragraphs'][0],dict) else [{'paragraphs':c['paragraphs'],'subchapter':''}]
                    for part in parts:
                        common.append(dict(author=re.sub(r'[（(]唐[）)]','',c['author']),title=c['chapter']+part.get('subchapter',''),paragraphs=part['paragraphs']))
            seen_titles={(cc.convert(c['author']),cc.convert(c['title']).split()[-1]) for c in common}
            original=common+[c for c in original if (cc.convert(c['author']),cc.convert(c['title']).split()[-1]) not in seen_titles]
        cards=[simplify(c,kind) for c in original]
        cards=[c for c in cards if 12<=len(''.join(c['paragraphs']))<=650 and not re.search('[□�]', ''.join(c['paragraphs']))]
        # Exclude a known attribution conflict in the imported anthology.
        cards=[c for c in cards if not (c['author']=='欧阳修' and c['subtitle'].startswith('独倚危楼'))]
        if kind=='tang':
            cards.sort(key=lambda c:(0 if c['title'] in FAVORITES else 1,
                                     FAVORITES.index(c['title']) if c['title'] in FAVORITES else 100,len(c['narration_text'])))
        else:
            common=['水调歌头','念奴娇','声声慢','一剪梅','如梦令','满江红','青玉案','西江月','破阵子','卜算子','浣溪沙','蝶恋花','雨霖铃','鹊桥仙','渔家傲','天仙子']
            cards.sort(key=lambda c:(0 if any(c['subtitle'].startswith(t) for t in SONG_FIRST_LINES) else 1,
                                     next((i for i,t in enumerate(SONG_FIRST_LINES) if c['subtitle'].startswith(t)),100),
                                     0 if c['author'] in AUTHORS and c['title'] in common else 1,
                                     AUTHORS.index(c['author']) if c['author'] in AUTHORS else 100,len(c['narration_text'])))
        unique=[];seen=set();seen_titles=set()
        for card in cards:
            text=''.join(card['paragraphs'])
            title_key=(card['author'],card['title'] if kind=='tang' else card['subtitle'])
            if text not in seen and title_key not in seen_titles:
                unique.append(card);seen.add(text);seen_titles.add(title_key)
        assert len(unique)>=count
        selections.extend(unique[:count])
    destination=ROOT/'content/learning/poetry-cards.json'
    destination.write_text(json.dumps(selections,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    license_text=(ROOT/'artifacts/poetry-license.json').read_text(encoding='utf-8')
    (ROOT/'content/learning/poetry-source-LICENSE.txt').write_text(license_text,encoding='utf-8')
    print('Prepared',len(selections),'poems; Tang 200, Song 100')

if __name__=='__main__':main()
