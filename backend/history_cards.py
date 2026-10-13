# -*- coding: utf-8 -*-
"""Live dynasty documents and validated links to the existing reading libraries."""
import json
import re
from pathlib import Path
from mysql_db import connection,_record_from_json

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/'content/learning/history-cards.json'

class Conflict(ValueError):
    pass

def initialize():
    catalog=json.loads(CATALOG.read_text(encoding='utf-8'))
    stories_path=ROOT/'content/learning/history-stories.json'
    if stories_path.exists():
        with connection() as db:
            with db.cursor() as cur:
                for story in json.loads(stories_path.read_text(encoding='utf-8'))['stories']:
                    cur.execute('''INSERT IGNORE INTO stories(slug,story_type,title,category,age,color,emoji,summary,paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',_record_from_json(story))
            db.commit()
    with connection() as db:
        with db.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS learning_history_periods (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE,
                title VARCHAR(100) NOT NULL,
                position SMALLINT UNSIGNED NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'published',
                document_json MEDIUMTEXT NOT NULL,
                revision INT UNSIGNED NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_history_visible(status,position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
            cur.execute('''CREATE TABLE IF NOT EXISTS learning_history_links (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                period_id BIGINT UNSIGNED NOT NULL,
                person_slug VARCHAR(80) NOT NULL,
                content_kind VARCHAR(16) NOT NULL,
                content_id BIGINT UNSIGNED NOT NULL,
                relation_label VARCHAR(120) NOT NULL,
                UNIQUE KEY idx_history_link(period_id,person_slug,content_kind,content_id),
                FOREIGN KEY(period_id) REFERENCES learning_history_periods(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
            for period in catalog['periods']:
                cur.execute('SELECT id FROM learning_history_periods WHERE slug=%s',(period['slug'],))
                if cur.fetchone(): continue  # Never overwrite administrator edits on restart.
                links=_discover_links(cur,period)
                period['links']=links
                cur.execute('''INSERT INTO learning_history_periods(slug,title,position,document_json)
                    VALUES(%s,%s,%s,%s)''',(period['slug'],period['title'],period['position'],json.dumps(period,ensure_ascii=False)))
                _write_links(cur,cur.lastrowid,links)
        db.commit()

def _discover_links(cur,period):
    links=[]
    for person in period['people']:
        cur.execute('SELECT id,title FROM stories WHERE slug=%s',(person['story_slug'],))
        story=cur.fetchone()
        if not story: raise ValueError('人物故事未入库：'+person['story_slug'])
        links.append(dict(person_slug=person['slug'],content_kind='story',content_id=story['id'],relation_label=person['story_kind']))
        for title in person.get('poem_titles',[]):
            cur.execute("SELECT id FROM learning_reading_cards WHERE kind='poetry' AND position<65535 AND author=%s AND title=%s",(person['name'],title))
            poems=cur.fetchall()
            if not poems: raise ValueError('诗词未入库：'+person['name']+' / '+title)
            links.extend(dict(person_slug=person['slug'],content_kind='poetry',content_id=p['id'],relation_label='本人作品') for p in poems)
        if person['slug']=='zhu-ge-liang':
            cur.execute("SELECT id FROM learning_reading_cards WHERE kind='poetry' AND position<65535 AND author='杜甫' AND title='八阵图'")
            links.extend(dict(person_slug=person['slug'],content_kind='poetry',content_id=p['id'],relation_label='后人咏怀 · 唐代杜甫') for p in cur.fetchall())
    return links

def _write_links(cur,period_id,links):
    cur.execute('DELETE FROM learning_history_links WHERE period_id=%s',(period_id,))
    for link in links:
        cur.execute('''INSERT INTO learning_history_links(period_id,person_slug,content_kind,content_id,relation_label)
            VALUES(%s,%s,%s,%s,%s)''',(period_id,link['person_slug'],link['content_kind'],link['content_id'],link['relation_label']))

def _resolve(cur,period):
    cur.execute('''SELECT l.*,CASE WHEN l.content_kind='story' THEN s.title ELSE p.title END AS title,
        p.author AS author,p.dynasty AS dynasty,COALESCE(s.cover,m.public_path) AS image_path
        FROM learning_history_links l
        LEFT JOIN stories s ON l.content_kind='story' AND s.id=l.content_id
        LEFT JOIN learning_reading_cards p ON l.content_kind='poetry' AND p.id=l.content_id AND p.position<65535
        LEFT JOIN media_assets m ON m.id=p.image_asset_id
        WHERE l.period_id=%s ORDER BY l.id''',(period['id'],))
    period['links']=[dict(person_slug=x['person_slug'],content_kind=x['content_kind'],content_id=x['content_id'],
        relation_label=x['relation_label'],title=x['title'],author=x['author'],dynasty=x['dynasty'],image_path=x['image_path']) for x in cur.fetchall() if x['title']]
    return period

def catalog(admin=False):
    seed=json.loads(CATALOG.read_text(encoding='utf-8'))
    with connection() as db:
        with db.cursor() as cur:
            cur.execute('SELECT * FROM learning_history_periods '+('' if admin else "WHERE status='published' ")+'ORDER BY position,id')
            periods=[]
            for row in cur.fetchall():
                p=json.loads(row['document_json']);p.update(id=row['id'],revision=row['revision'],status=row['status'])
                if admin: p=_resolve(cur,p)
                else:
                    p={k:v for k,v in p.items() if k not in ('people','events','links','video')}
                    doc=json.loads(row['document_json']);p['people_names']=[x['name'] for x in doc['people']]
                    p['people_count']=len(doc['people']);p['event_count']=len(doc['events'])
                    p['event_titles']=[x['title'] for x in doc['events']]
                periods.append(p)
    return dict(title=seed['title'],scope=seed['scope'],sources=seed['sources'],periods=periods)

def detail(slug):
    with connection() as db:
        with db.cursor() as cur:
            cur.execute("SELECT * FROM learning_history_periods WHERE slug=%s AND status='published'",(slug,))
            row=cur.fetchone()
            if not row:return None
            p=json.loads(row['document_json']);p.update(id=row['id'],revision=row['revision'])
            import history_wisdom
            p['related_cards']=[dict(slug=x['slug'],kind=x['kind'],title=x['title'],dates=x['dates']) for x in history_wisdom.catalog()['items'] if slug in x['period_slugs']]
            return _resolve(cur,p)

def choices():
    with connection() as db:
        with db.cursor() as cur:
            cur.execute("SELECT id,title,author,dynasty FROM learning_reading_cards WHERE kind='poetry' AND position<65535 ORDER BY position,id")
            poems=cur.fetchall()
            cur.execute('SELECT id,title,category FROM stories ORDER BY id')
            return dict(poetry=poems,stories=cur.fetchall())

def _text(value,label,limit=1500):
    if not isinstance(value,str) or not value.strip() or len(value)>limit:raise ValueError(label+'不能为空或超过长度限制')
    return value.strip()

def _year(value):
    if type(value)!=int or value==0 or not -5000<=value<=2100:raise ValueError('年份必须是有效整数，公元前用负数且没有公元0年')
    return value

def validate(doc):
    if not isinstance(doc,dict):raise ValueError('朝代内容无效')
    for key,limit in [('title',100),('dates',300),('group',80),('tagline',150),('summary',2000),('note',2000),('question',500)]:
        doc[key]=_text(doc.get(key),key,limit)
    if not re.fullmatch('[a-z0-9-]{1,80}',str(doc.get('slug',''))):raise ValueError('朝代编号无效')
    if not re.fullmatch(r'/assets/[a-zA-Z0-9/_-]+\.(svg|webp|png|jpg)',str(doc.get('image_path',''))):raise ValueError('主题图必须使用站内图片')
    if _year(doc.get('start_year'))>=_year(doc.get('end_year')):raise ValueError('结束年份须晚于开始年份')
    if type(doc.get('position'))!=int or not 0<=doc['position']<=65535:raise ValueError('排序无效')
    if doc.get('status','published') not in ('published','archived'):raise ValueError('发布状态无效')
    people=doc.get('people');events=doc.get('events');lanes=doc.get('lanes',[])
    if not isinstance(people,list) or not 1<=len(people)<=30 or not isinstance(events,list) or not 1<=len(events)<=30:raise ValueError('请填写1至30个人物和事件')
    names=set()
    for p in people:
        if not isinstance(p,dict) or not re.fullmatch('[a-z0-9-]{1,80}',str(p.get('slug',''))) or p['slug'] in names:raise ValueError('人物编号重复或无效')
        names.add(p['slug'])
        for key in ('name','role','bio','contribution','reading','source_note','evidence_kind'):p[key]=_text(p.get(key),key)
        if len(str(p.get('caution','')))>2000:raise ValueError('人物说明过长')
    for e in events:
        if not isinstance(e,dict):raise ValueError('事件内容无效')
        for key in ('date','title','description'):e[key]=_text(e.get(key),key)
    if not isinstance(lanes,list) or len(lanes)>20:raise ValueError('并存政权过多')
    for lane in lanes:
        if not isinstance(lane,dict):raise ValueError('并存政权无效')
        _text(lane.get('name'),'政权名称');_text(lane.get('dates'),'政权年代')
        if _year(lane.get('start_year'))>=_year(lane.get('end_year')):raise ValueError('并存政权年代无效')
    known={s['id'] for s in json.loads(CATALOG.read_text(encoding='utf-8'))['sources']}
    if not isinstance(doc.get('sources'),list) or not doc['sources'] or any(s not in known for s in doc['sources']):raise ValueError('参考资料无效')
    links=doc.get('links',[])
    if not isinstance(links,list) or len(links)>300:raise ValueError('关联内容过多')
    for link in links:
        if not isinstance(link,dict) or link.get('person_slug') not in names or link.get('content_kind') not in ('poetry','story') or type(link.get('content_id'))!=int:raise ValueError('关联内容无效')
        _text(link.get('relation_label'),'关联说明',120)
    if len({(x['person_slug'],x['content_kind'],x['content_id']) for x in links})!=len(links):raise ValueError('关联内容重复')
    for name in names:
        if not any(x['person_slug']==name for x in links):raise ValueError('每个人物至少关联一篇诗词或故事')
    if len(json.dumps(doc,ensure_ascii=False))>180000:raise ValueError('内容过大')
    return doc

def save(slug,body):
    doc=validate(body.get('document'))
    if doc['slug']!=slug:raise ValueError('不能修改已有朝代编号')
    revision=body.get('revision')
    if type(revision)!=int:raise ValueError('缺少内容版本，请重新打开')
    with connection() as db:
        with db.cursor() as cur:
            cur.execute('SELECT id,revision FROM learning_history_periods WHERE slug=%s FOR UPDATE',(slug,))
            row=cur.fetchone()
            if not row:raise LookupError('朝代不存在')
            if row['revision']!=revision:raise Conflict('内容已被其他页面修改，请重新打开后再编辑')
            for link in doc['links']:
                table='stories' if link['content_kind']=='story' else 'learning_reading_cards'
                extra='' if table=='stories' else " AND kind='poetry' AND position<65535"
                cur.execute('SELECT id FROM '+table+' WHERE id=%s'+extra,(link['content_id'],))
                if not cur.fetchone():raise ValueError('所选诗词或故事不存在或已下架')
            _write_links(cur,row['id'],doc['links'])
            cur.execute('''UPDATE learning_history_periods SET title=%s,position=%s,status=%s,
                document_json=%s,revision=revision+1 WHERE id=%s''',
                (doc['title'],doc['position'],doc.get('status','published'),json.dumps(doc,ensure_ascii=False),row['id']))
        db.commit()
    return {'ok':True,'revision':revision+1}
