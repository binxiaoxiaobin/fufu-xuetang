# -*- coding: utf-8 -*-
import json,sys,copy
from pathlib import Path
from urllib.request import urlopen
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import history_wisdom as w
import history_cards as h
items=w.catalog(admin=True)['items'];assert len(items)==48
assert len([x for x in items if x['kind']=='strategies'])==36
assert len([x for x in items if x['kind']=='battles'])==12
periods={x['slug'] for x in h.catalog()['periods']};slugs={x['slug'] for x in items}
for p in items:
    assert set(p['period_slugs'])<=periods
    assert set(p['related_slugs'])<=slugs
    assert len(p['paragraphs'])>=2
    if p['kind']=='battles':
        assert len(p['paragraphs'])==6
        assert sum(map(len,p['paragraphs']))>=800
        assert p.get('image_caption')
    assert (Path(__file__).resolve().parents[1]/'frontend'/p['image_path'].lstrip('/')).exists()
    if p['kind']=='strategies':assert all(p[k] for k in ['quote','quote_source','gloss','translation'])
    assert w.detail(p['slug'])['title']==p['title']
assert len({p['image_path'] for p in items if p['kind']=='battles'})==12
first=copy.deepcopy(next(x for x in items if x['slug']=='guiling'))
doc=copy.deepcopy(first);doc['question']='测试临时问题';saved=w.save(first['slug'],{'document':doc,'revision':first['revision']})
try:
    assert w.detail(first['slug'])['question']=='测试临时问题'
    w.initialize();assert w.detail(first['slug'])['question']=='测试临时问题'
    try:w.save(first['slug'],{'document':doc,'revision':first['revision']});assert False
    except w.Conflict:pass
    bad=copy.deepcopy(saved);bad['period_slugs']=['missing']
    try:w.save(first['slug'],{'document':bad,'revision':saved['revision']});assert False
    except ValueError:pass
finally:w.save(first['slug'],{'document':first,'revision':saved['revision']})
assert any(x['slug']=='guiling' for x in h.detail('eastern-zhou')['related_cards'])
print('48 cards: references, assets, originals, live updates, restart preservation, stale revision and invalid links passed')
for path in ['/api/learning/history-wisdom','/api/learning/history-wisdom/chibi','/api/learning/history/eastern-zhou']:
    with urlopen('http://localhost:8000'+path,timeout=15) as r:assert r.status==200;json.load(r)
print('Live HTTP routes passed')
