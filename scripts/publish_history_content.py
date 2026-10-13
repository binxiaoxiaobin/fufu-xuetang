# -*- coding: utf-8 -*-
"""Additive publication. Administrator edits survive restarts and re-imports."""
import json,sys,html,shutil
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from mysql_db import connection,_record_from_json
from content_catalog import register_media
import history_cards
catalog=json.loads(history_cards.CATALOG.read_text(encoding='utf-8'))
backup=ROOT/'artifacts/history'/datetime.now().strftime('backup-%Y%m%d-%H%M%S')
backup.mkdir(parents=True,exist_ok=True)
poem_path=ROOT/'content/learning/poetry-cards.json'
shutil.copy2(poem_path,backup/poem_path.name)
with connection() as db:
    with db.cursor() as cur:
        cur.execute("SELECT * FROM stories WHERE slug LIKE 'history-%'")
        (backup/'existing-history-stories.json').write_text(json.dumps(cur.fetchall(),ensure_ascii=False,default=str,indent=2),encoding='utf-8')
        cur.execute("SHOW TABLES LIKE 'learning_history_periods'")
        if cur.fetchone():
            for table in ('learning_history_periods','learning_history_links'):
                cur.execute('SELECT * FROM '+table)
                (backup/(table+'.json')).write_text(json.dumps(cur.fetchall(),ensure_ascii=False,default=str,indent=2),encoding='utf-8')

icons={
 'river':'<path d="M220 150q90 60 0 110t0 100M330 150q90 60 0 110t0 100"/>',
 'bronze':'<path d="M190 180h190l-20 130H210zM225 310v58m120-58v58M190 200q-55-35-45 40t52 40m177-80q55-35 45 40t-52 40"/>',
 'books':'<path d="M150 180q75-40 135 0v180q-60-40-135 0zm135 0q65-40 135 0v180q-65-40-135 0M175 215h65m-65 35h65m90-35h65m-65 35h65"/>',
 'measure':'<rect x="160" y="215" width="255" height="100" rx="12"/><path d="M190 215v50m40-50v30m40-30v50m40-50v30m40-30v50m40-50v30"/>',
 'road':'<path d="M140 345q110-90 110-150t150-40M175 375q110-90 110-150t150-40"/><circle cx="385" cy="150" r="25"/>',
 'coin':'<circle cx="285" cy="260" r="100"/><rect x="257" y="232" width="56" height="56"/>',
 'paper':'<path d="M190 145h150l55 55v170H190zM340 145v55h55m-170 40h125m-125 40h125m-125 40h75"/>',
 'three':'<path d="M155 370V170h65v200m35 0V135h65v235m35 0V185h65v185M140 370h295"/>',
 'gate':'<path d="M150 365V205h270v160m-245-160v-40h220v40m-160 160v-75q50-75 100 0v75M135 205h300"/>',
 'mountain':'<path d="M140 365l95-170 50 90 40-130 105 210zM155 395h265"/><circle cx="180" cy="165" r="30"/>',
 'circle':'<circle cx="285" cy="260" r="108"/><path d="M177 260h216M285 152v216m-77-185 154 154"/>',
 'canal':'<path d="M150 365q130-90 280 0M150 395q130-90 280 0M155 285h270m-235 0v-40q95-100 190 0v40M230 285v55m110-55v55"/>',
 'pagoda':'<path d="M160 365h250m-200 0V220h150v145M165 225l120-70 120 70M185 280h200M185 320h200M285 155v-40"/>',
 'moon':'<path d="M330 135a108 108 0 1 0 75 180 100 100 0 0 1-75-180z"/>',
 'print':'<rect x="170" y="160" width="230" height="215" rx="12"/><path d="M170 230h230M170 300h230M245 160v215M325 160v215"/>',
 'stars':'<circle cx="285" cy="255" r="105"/><ellipse cx="285" cy="255" rx="45" ry="105"/><path d="M180 255h210m-105-130v260m-135 10h270M200 395l40-60m90 0 40 60"/>',
 'ship':'<path d="M145 315h285l-65 65H210zM280 315V130m-10 25-100 130h100m20-130 100 130H290M135 405q35-25 70 0t70 0t70 0t70 0"/>',
 'book':'<rect x="190" y="150" width="200" height="235" rx="8"/><path d="M230 150v235m40-175h80m-80 45h80m-80 45h80"/>'}
asset_dir=ROOT/'frontend/assets/learning/history';asset_dir.mkdir(parents=True,exist_ok=True)
for p in catalog['periods']:
    ink=['#876444','#436b64','#556b91','#936175'][p['position']%4]
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><defs><linearGradient id="bg"><stop stop-color="#faf5e8"/><stop offset="1" stop-color="#e8ddc7"/></linearGradient></defs><rect width="720" height="480" fill="url(#bg)"/><circle cx="585" cy="100" r="205" fill="{ink}" opacity=".09"/><path d="M30 30h660v420H30zM40 40h640v400H40z" fill="none" stroke="#b39b76" opacity=".55"/><g transform="translate(95 -10)" fill="none" stroke="{ink}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">{icons.get(p['motif'],icons['book'])}</g><text x="70" y="105" fill="{ink}" font-family="serif" font-size="22" letter-spacing="4">朝代时光轴</text><text x="70" y="155" fill="{ink}" font-family="serif" font-size="32">{p['position']+1:02d}</text><text x="650" y="410" text-anchor="end" fill="{ink}" font-family="serif" font-size="26">{html.escape(p['title'])}</text></svg>'''
    (asset_dir/(p['slug']+'.svg')).write_text(svg,encoding='utf-8')
    p['image_path']='/assets/learning/history/'+p['slug']+'.svg'

extra=[
 ('cao-cao','观沧海','曹操','东汉','汉魏诗歌',['东临碣石，以观沧海。','水何澹澹，山岛竦峙。','树木丛生，百草丰茂。','秋风萧瑟，洪波涌起。','日月之行，若出其中；','星汉灿烂，若出其里。','幸甚至哉，歌以咏志。'],'诗人望见海水和山岛，想象日月与星河从大海中出入，用辽阔景象表达志向。结尾是配乐时的套语。','《乐府诗集》所收《步出夏门行》第一章。','eastern-han'),
 ('tao-yuan-ming','饮酒·其五','陶渊明','东晋至刘宋','魏晋诗歌',['结庐在人境，而无车马喧。','问君何能尔？心远地自偏。','采菊东篱下，悠然见南山。','山气日夕佳，飞鸟相与还。','此中有真意，欲辨已忘言。'],'住在人群之中，内心仍能远离名利的喧闹。采菊时看见南山，傍晚飞鸟结伴归来，诗人感到生活中的安宁。具体作年有讨论。','陶渊明《饮酒》组诗第五首。','eastern-jin-sixteen'),
 ('li-yu','相见欢·无言独上西楼','李煜','五代至宋初','五代词',['无言独上西楼，月如钩。','寂寞梧桐深院锁清秋。','剪不断，理还乱，是离愁。','别是一般滋味在心头。'],'弯月、梧桐与深院带来清冷的感受。离愁像纠缠的丝线，剪不断也理不清。作时有讨论；按作者生涯关联南唐，不据此断定作于亡国前。','李煜《相见欢》；“一般”另有“一番”等版本。','five-ten'),
 ('ma-zhi-yuan','天净沙·秋思','马致远','元','元曲',['枯藤老树昏鸦，小桥流水人家。','古道西风瘦马。','夕阳西下，断肠人在天涯。'],'枯藤、老树、黄昏的乌鸦，与小桥流水人家形成对照。旅人在古道上远离家乡，夕阳让孤独更加鲜明。这是散曲，不是宋词。','《全元散曲》所收马致远《天净沙·秋思》。','yuan'),
 ('gong-zi-zhen','己亥杂诗·其五','龚自珍','清','明清诗歌',['浩荡离愁白日斜，吟鞭东指即天涯。','落红不是无情物，化作春泥更护花。'],'诗人离京，带着复杂感情向东走。他把自己比作落花，希望继续贡献。“化作春泥”是诗歌比喻，不是完整科学解释。','龚自珍《己亥杂诗》第五首（1839年）。','qing'),
 ('li-bai-waterfall','望庐山瀑布','李白','唐','唐诗',['日照香炉生紫烟，遥看瀑布挂前川。','飞流直下三千尺，疑是银河落九天。'],'阳光照着香炉峰，水汽像紫色烟雾。瀑布飞流直下，仿佛银河从高天落下。“三千尺”是夸张，不是实测高度。','李白《望庐山瀑布》其二。','tang'),
 ('du-fu-rain','春夜喜雨','杜甫','唐','唐诗',['好雨知时节，当春乃发生。','随风潜入夜，润物细无声。','野径云俱黑，江船火独明。','晓看红湿处，花重锦官城。'],'春雨来得正是时候，随风悄悄进入夜晚，滋润万物。江船灯火明亮，诗人想象天亮时花朵带着雨水，成都一片鲜艳。后两句是清晨的想象。','杜甫《春夜喜雨》。','tang')]
new_poems=[]
for slug,title,author,dynasty,collection,lines,meaning,note,era_slug in extra:
    new_poems.append(dict(slug='history-poem-'+slug,subject='语文',kind='poetry',title=title,author=author,dynasty=dynasty,collection=collection,paragraphs=lines,subtitle=lines[0],image_path='/assets/learning/history/'+era_slug+'.svg',audio_path=None,source_name=note,source_url='',license_name='古典原文公有领域；白话解读与主题图为项目原创',explanation=dict(meaning=meaning,notes=[],source='福福学堂原创解读 · '+note)))
for p in catalog['periods']:
    for x in p['people']:
        if x['slug']=='li-yu':x['poem_titles']=['相见欢·无言独上西楼']
poems=json.loads(poem_path.read_text(encoding='utf-8'));known={p['slug'] for p in poems}
poems.extend(p for p in new_poems if p['slug'] not in known)
poem_path.write_text(json.dumps(poems,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assets={}
for p in new_poems:
    path=p['image_path']
    if path not in assets:
        file=ROOT/'frontend'/path.lstrip('/')
        assets[path]=register_media(dict(public_path=path,media_kind='image',mime_type='image/svg+xml',file_bytes=file.stat().st_size,title=p['title'],source_name='福福学堂原创主题图',license_name='项目原创'))
with connection() as db:
    with db.cursor() as cur:
        for i,p in enumerate(new_poems):
            asset=assets[p['image_path']]
            cur.execute('''INSERT IGNORE INTO learning_reading_cards(slug,subject,kind,title,author,dynasty,collection,subtitle,paragraphs_json,position,image_asset_id,source_name,source_url,license_name,explanation_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(p['slug'],p['subject'],p['kind'],p['title'],p['author'],p['dynasty'],p['collection'],p['subtitle'],json.dumps(p['paragraphs'],ensure_ascii=False),300+i,asset,p['source_name'],p['source_url'],p['license_name'],json.dumps(p['explanation'],ensure_ascii=False)))
    db.commit()
stories=[]
for p in catalog['periods']:
    for x in p['people']:
        if x.get('existing_story'):continue
        stories.append(dict(slug=x['story_slug'],type='history',category='历史人物小传',title=x['name']+'：'+x['role'],ageRange='8岁以上·亲子共读',summary=x['bio'],paragraphs=[x['bio'],p['summary'],x['contribution'],x['reading']],moral='历史可以由多种证据认识。'+(x.get('caution') or '本篇依据文献作白话介绍，没有添加虚构对话或现场细节。'),tags=['历史人物',p['title'],x['name'],'原创白话介绍'],readingMinutes=2,cover=p['image_path'],coverStatus='ready',sourceNote=x['source_note']+' 本篇为原创知识小传，不是古籍原文。主题图为原创符号设计，不是历史人物肖像或出土文物。'))
with connection() as db:
    with db.cursor() as cur:
        for s in stories:
            cur.execute('''INSERT IGNORE INTO stories(slug,story_type,title,category,age,color,emoji,summary,paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',_record_from_json(s))
            cur.execute("UPDATE stories SET story_type='history' WHERE slug=%s AND category='历史人物小传'",(s['slug'],))
    db.commit()
(ROOT/'content/learning/history-stories.json').write_text(json.dumps({'stories':stories},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
history_cards.CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
history_cards.initialize()
print('Published:',len(catalog['periods']),'periods,',len(stories),'biographies,',len(new_poems),'poems; backup',backup.name)
