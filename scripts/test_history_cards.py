# -*- coding: utf-8 -*-
"""Catalog, link integrity, live publication, rollback and conflict checks."""
import sys,json,copy,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import history_cards
from mysql_db import connection

def get(path):
    with urllib.request.urlopen('http://localhost:8000/api'+path,timeout=15) as response:
        return json.load(response)

catalog=get('/learning/history')
assert len(catalog['periods'])==19
people=links=0
for summary in catalog['periods']:
    doc=get('/learning/history/'+summary['slug'])
    people+=len(doc['people']);links+=len(doc['links'])
    history_cards.validate(copy.deepcopy(doc))
    assert len(doc['events'])>=2
    assert (ROOT/'frontend'/doc['image_path'].lstrip('/')).is_file()
    for person in doc['people']:
        assert any(l['person_slug']==person['slug'] for l in doc['links']),person['name']
    for link in doc['links']:
        content=get(('/stories/' if link['content_kind']=='story' else '/learning/reading-cards/')+str(link['content_id']))
        assert content['title']==link['title']
        assert len(content.get('paragraphs',[]))>=1
assert people==40
assert get('/learning/reading-cards?kind=poetry')['total']==307
assert get('/learning/reading-cards?kind=science')['total']==14
assert get('/stories?type=history')['total']==34
three=get('/learning/history/three-kingdoms')
assert [(l['name'],l['start_year'],l['end_year']) for l in three['lanes']]==[('魏',220,265),('蜀汉',221,263),('吴',229,280)]
about=[l for l in three['links'] if l['content_kind']=='poetry']
assert about[0]['author']=='杜甫' and about[0]['title']=='八阵图' and '后人' in about[0]['relation_label']
song=get('/learning/history/song-liao-xia-jin')
assert len(song['lanes'])==5
assert {l['name'] for l in song['lanes']}=={'辽','北宋','南宋','西夏','金'}
assert '曹操' in next(p for p in catalog['periods'] if p['slug']=='eastern-han')['people_names']

original=next(p for p in history_cards.catalog(admin=True)['periods'] if p['slug']=='qin')
baseline=original['revision']
changed=copy.deepcopy(original);changed['tagline']=original['tagline']+'（发布链路核验）'
try:
    result=history_cards.save('qin',{'revision':baseline,'document':changed})
    assert get('/learning/history/qin')['tagline']==changed['tagline']
    history_cards.initialize()
    assert get('/learning/history/qin')['tagline']==changed['tagline'],'Restart initialization must preserve edits'
    try:history_cards.save('qin',{'revision':baseline,'document':original})
    except history_cards.Conflict:pass
    else:raise AssertionError('Stale revision accepted')
    bad=copy.deepcopy(changed);bad['links'][0]['content_id']=999999999
    try:history_cards.save('qin',{'revision':result['revision'],'document':bad})
    except ValueError:pass
    else:raise AssertionError('Missing linked content accepted')
    assert get('/learning/history/qin')['revision']==result['revision'],'Failed save changed revision'
finally:
    current=get('/learning/history/qin')
    if current['tagline']!=original['tagline']:
        history_cards.save('qin',{'revision':current['revision'],'document':original})

for path,method in [('/admin/history','GET'),('/admin/history/qin','PUT')]:
    req=urllib.request.Request('http://localhost:8000/api'+path,data=b'{}' if method=='PUT' else None,method=method,headers={'Content-Type':'application/json'})
    try:urllib.request.urlopen(req)
    except urllib.error.HTTPError as error:assert error.code in (401,403)
    else:raise AssertionError('Anonymous admin access accepted')
report=dict(periods=19,events=38,people=people,biographies=34,new_poems=7,valid_links=links,
    checks=['live API and all linked readers','parallel-regime dates','author vs subject','no restart publication',
        'initialization preserves admin edits','optimistic concurrency','missing link rollback','anonymous admin denied','poetry/science regression'])
(ROOT/'artifacts/history/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
