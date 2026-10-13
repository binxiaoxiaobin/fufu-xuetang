# -*- coding: utf-8 -*-
"""Live battle and stratagem cards linked to dynasty documents."""
import json
import re
from pathlib import Path
from mysql_db import connection
import history_cards
SEED=Path(__file__).resolve().parents[1]/'content/learning/history-wisdom.json'
class Conflict(ValueError):pass

def initialize():
    with connection() as db:
        with db.cursor() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS learning_history_wisdom (
                slug VARCHAR(80) PRIMARY KEY,kind VARCHAR(20) NOT NULL,title VARCHAR(100) NOT NULL,
                position SMALLINT UNSIGNED NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'published',
                document_json MEDIUMTEXT NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_wisdom_public(kind,status,position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
            for p in json.loads(SEED.read_text(encoding='utf-8'))['items']:
                c.execute('INSERT IGNORE INTO learning_history_wisdom(slug,kind,title,position,document_json) VALUES(%s,%s,%s,%s,%s)',(p['slug'],p['kind'],p['title'],p['position'],json.dumps(p,ensure_ascii=False)))
        db.commit()

def catalog(kind=None,admin=False):
    with connection() as db:
        with db.cursor() as c:
            c.execute('SELECT * FROM learning_history_wisdom '+('' if admin else "WHERE status='published' ")+'ORDER BY kind,position,slug')
            items=[]
            for r in c.fetchall():
                if kind and r['kind']!=kind:continue
                p=json.loads(r['document_json']);p.update(revision=r['revision'],status=r['status']);items.append(p)
    return {'items':items}

def detail(slug):
    return next((x for x in catalog()['items'] if x['slug']==slug),None)

def save(slug,body):
    doc=body.get('document')
    if not isinstance(doc,dict) or doc.get('slug')!=slug:raise ValueError('内容编号不匹配')
    if doc.get('kind') not in ('battles','strategies'):raise ValueError('卡片类型无效')
    for field,limit in [('title',100),('group',80),('dates',300),('summary',3000),('question',1000),('caution',3000)]:
        if not isinstance(doc.get(field),str) or not doc[field].strip() or len(doc[field])>limit:raise ValueError('请填写有效的'+field)
    for field in ('quote','quote_source','gloss','translation','location'):
        if not isinstance(doc.get(field,''),str) or len(doc.get(field,''))>5000:raise ValueError('文字过长或格式无效')
    if not isinstance(doc.get('paragraphs'),list) or not 2<=len(doc['paragraphs'])<=20 or any(not isinstance(x,str) or not x.strip() or len(x)>5000 for x in doc['paragraphs']):raise ValueError('正文至少需要两段，单段不超过5000字')
    if doc.get('quote') and not all(doc.get(x,'').strip() for x in ('quote_source','gloss','translation')):raise ValueError('文言原文需要出处、注释和译文')
    if type(doc.get('position'))!=int or not 0<=doc['position']<=65535:raise ValueError('排序无效')
    if doc.get('status','published') not in ('published','archived'):raise ValueError('状态无效')
    if not re.fullmatch(r'/assets/[a-zA-Z0-9/_-]+\.(png|jpg|webp|svg)',str(doc.get('image_path',''))):raise ValueError('请使用站内图片路径')
    if not str(doc.get('source_url','')).startswith('https://'):raise ValueError('资料链接需使用https')
    periods={p['slug'] for p in history_cards.catalog(admin=True)['periods']}
    refs=doc.get('period_slugs',[])
    if not isinstance(refs,list) or not refs or any(x not in periods for x in refs):raise ValueError('朝代关联无效')
    if not isinstance(doc.get('people'),list) or len(doc['people'])>30 or any(not isinstance(x,dict) or not str(x.get('name','')).strip() or not str(x.get('bio','')).strip() or len(str(x['bio']))>3000 for x in doc['people']):raise ValueError('人物姓名与简介不能为空')
    available={x['slug'] for x in catalog(admin=True)['items']}
    related=doc.get('related_slugs',[])
    if not isinstance(related,list) or any(x not in available or x==slug for x in related):raise ValueError('相关卡片关联无效')
    payload={k:v for k,v in doc.items() if k!='revision'}
    with connection() as db:
        with db.cursor() as c:
            c.execute('SELECT revision,kind FROM learning_history_wisdom WHERE slug=%s FOR UPDATE',(slug,));r=c.fetchone()
            if not r:raise ValueError('卡片不存在')
            if body.get('revision')!=r['revision']:raise Conflict('内容已被更新，请重新打开再编辑')
            if doc['kind']!=r['kind']:raise ValueError('不能改变卡片类型')
            c.execute('UPDATE learning_history_wisdom SET title=%s,position=%s,status=%s,document_json=%s,revision=revision+1 WHERE slug=%s',(doc['title'],doc['position'],doc.get('status','published'),json.dumps(payload,ensure_ascii=False),slug))
        db.commit()
    return dict(payload,revision=r['revision']+1)
