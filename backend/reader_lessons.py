"""Common vocabulary lessons: topic and difficulty are independent of school grade."""
import json
from pathlib import Path
from mysql_db import connection
from content_catalog import register_media
SOURCE='福福学堂情境拼读'
VERSION='reader-common-20261010-v12-groups'
ROOT=Path(__file__).resolve().parents[1]
SEED=ROOT/'backend/seed_data/reader_lessons.json'

def initialize():
    from reader_progress import initialize as initialize_progress
    initialize_progress()
    units=json.loads(SEED.read_text(encoding='utf-8'))
    if len(units)<600 or len({(item['subject'],item['word']) for item in units})!=len(units):
        raise ValueError('Expected at least 600 distinct lessons')
    for item in units:
        if len(set(item.get('choice_words',[])))!=2 or item['word'] in item['choice_words']:
            raise ValueError('Two distinct vocabulary distractors are required')
        art=item.get('scene_image','')
        if art and (not art.startswith('/assets/interface/reader-vocabulary/') or '..' in art or '\\' in art):
            raise ValueError('Local word illustrations are required')
        if art and not (ROOT/'frontend'/art.lstrip('/')).is_file():raise ValueError('Missing word illustration')
        for field in (('word','sentence','translation') if item['language']=='en-US' else ('word','sentence')):
            path=item.get(field+'_audio','')
            if not path.startswith('/assets/audio/reader-lessons/') or '..' in path or '\\' in path:
                raise ValueError('Local lesson recordings are required before publication')
            if (ROOT/'frontend'/path.lstrip('/')).stat().st_size<1000:raise ValueError('Empty recording')
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT migration_key FROM content_migrations WHERE migration_key=%s',(VERSION,))
            if cur.fetchone():return
            cur.execute('SHOW INDEX FROM questions')
            if not any(row['Key_name']=='idx_questions_reader_source' for row in cur.fetchall()):
                cur.execute('ALTER TABLE questions ADD INDEX idx_questions_reader_source(source_name,status)')
        conn.commit()
    rows=[]
    for original in units:
        item=dict(original)
        art=item.get('scene_image')
        if art:item['scene_asset_id']=register_media(dict(public_path=art,media_kind='image',mime_type='image/svg+xml',
            file_bytes=(ROOT/'frontend'/art.lstrip('/')).stat().st_size,title=item['word']+'情境插画',
            source_name='福福学堂原创矢量插画',license_name='项目原创素材'))
        for field in (('word','sentence','translation') if item['language']=='en-US' else ('word','sentence')):
            path=item[field+'_audio']
            item[field+'_asset_id']=register_media(dict(public_path=path,media_kind='audio',mime_type='audio/mpeg',
                file_bytes=(ROOT/'frontend'/path.lstrip('/')).stat().st_size,title=item[field],
                source_name='福福学堂统一朗读',license_name='项目原创练习配音'))
        topic='识字快练' if item['subject']=='语文' else '单词快练'
        explanation='{}。{}'.format(item['meaning'],item['sentence'])
        rows.append((item['question_id'],item['subject'],'通用',item['word']+' · 情境拼读',
            '拼好“{}”，再把它放回句子。'.format(item['word']),'[]',item['word'],explanation,'*',topic,
            ['easy','medium','hard'][item['level']-1],'short_answer','published',SOURCE,
            'reader-'+str(item['question_id']),json.dumps(item,ensure_ascii=False)))
    with connection() as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute('SELECT source_name FROM questions WHERE id=%s',(row[0],))
                existing=cur.fetchone()
                if existing and existing['source_name']!=SOURCE:raise ValueError('Reserved question ID collision')
            cur.executemany('''INSERT INTO questions
                (id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,difficulty,
                 question_type,status,source_name,source_record_id,source_metadata)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE source_metadata=VALUES(source_metadata),explanation=VALUES(explanation),
                    prompt=VALUES(prompt),answer=VALUES(answer)''',rows)
            cur.execute('INSERT INTO content_migrations(migration_key) VALUES(%s)',(VERSION,))
        conn.commit()

def decode(value):
    return value if isinstance(value,dict) else json.loads(value)

def admin_list():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id,subject,status,source_metadata FROM questions WHERE source_name=%s ORDER BY id DESC",(SOURCE,))
            rows=cur.fetchall()
    items=[]
    for row in rows:
        item=decode(row['source_metadata']);item.update(id=row['id'],subject=row['subject'],status=row['status']);items.append(item)
    return items

def admin_save(values, item_id=None):
    subject=str(values.get('subject','语文')).strip()
    if subject not in {'语文','英语'}:raise ValueError('请选择语文或英语')
    language='en-US' if subject=='英语' else 'zh-CN'
    word=str(values.get('word','')).strip();meaning=str(values.get('meaning','')).strip()
    sentence=str(values.get('sentence','')).strip();category=str(values.get('category','')).strip()
    try:level=max(1,min(3,int(values.get('level') or 1)))
    except (ValueError,TypeError):raise ValueError('难度无效')
    choices=[x.strip() for x in str(values.get('choice_words','')).replace('，',',').split(',') if x.strip()]
    if not word or len(word)>80 or not sentence or len(sentence)>300 or not meaning or not category or len(choices)<2 or word in choices:
        raise ValueError('请填写字词、释义、例句、主题和至少两个不重复的干扰词')
    if len(set(choices))!=len(choices):raise ValueError('干扰词不能重复')
    pinyin=str(values.get('pinyin','')).strip() if language=='zh-CN' else ''
    translation=str(values.get('translation','')).strip() if language=='en-US' else ''
    before=str(values.get('before',''));after=str(values.get('after',''))
    if not before and not after and word in sentence:
        before,after=sentence.split(word,1)
    if not before and not after:before=sentence;after=''
    audio_paths={}
    with connection() as conn:
        with conn.cursor() as cur:
            for field in ('word_audio_asset_id','sentence_audio_asset_id','translation_audio_asset_id'):
                asset_id=values.get(field) or None
                if asset_id:
                    cur.execute("SELECT public_path FROM media_assets WHERE id=%s AND media_kind='audio'",(int(asset_id),))
                    asset=cur.fetchone()
                    if not asset:raise ValueError('所选录音素材不存在')
                    audio_paths[field.replace('_asset_id','')]=asset['public_path']
            for field in ('word_audio','sentence_audio','translation_audio'):
                path=str(values.get(field,'')).strip()
                if path:
                    if not (path.startswith('/assets/audio/') or path.startswith('/assets/content/')) or not path.endswith('.mp3') or '..' in path or '\\' in path:
                        raise ValueError('录音只能使用本地音频素材路径')
                    audio_paths[field]=path
            if item_id:
                cur.execute("SELECT source_metadata,subject FROM questions WHERE id=%s AND source_name=%s",(item_id,SOURCE))
                existing=cur.fetchone()
                if not existing:raise LookupError('闯关字词不存在')
                item=decode(existing['source_metadata'])
                groups=item.get('learning_groups',[])
                question_id=int(item_id)
            else:
                cur.execute("SELECT COALESCE(MAX(id),5900000000)+1 AS next_id FROM questions")
                question_id=cur.fetchone()['next_id'];groups=[];item={}
            item.update(dict(item_id=question_id,question_id=question_id,subject=subject,language=language,level=level,
                word=word,pinyin=pinyin,meaning=meaning,sentence=sentence,translation=translation,
                before=before,after=after,category=category,scene='friends',choice_words=choices,
                extra_characters=item.get('extra_characters',[]),demo='discover',learning_groups=groups))
            item.update(audio_paths)
            if not groups:
                item['learning_groups']=[dict(id='custom-'+str(question_id),subject=subject,title=word+' · 闯关练习',
                    focus='认识新字词，再听读和拼一拼。',level=level,kind='character' if len(word)==1 and language=='zh-CN' else 'word',
                    category=category,question_ids=[question_id],priority=question_id)]
            elif len(groups)==1 and groups[0].get('id')=='custom-'+str(question_id):
                item['learning_groups']=[dict(groups[0],subject=subject,title=word+' · 闯关练习',level=level,
                    kind='character' if len(word)==1 and language=='zh-CN' else 'word',category=category)]
            archived=str(values.get('status','published'))=='archived'
            metadata=json.dumps(item,ensure_ascii=False)
            title=(word+' · 情境拼读')[:200]
            prompt='拼好“{}”，再把它放回句子。'.format(word)
            status='archived' if archived else 'published'
            if item_id:
                cur.execute("""UPDATE questions SET subject=%s,title=%s,prompt=%s,answer=%s,explanation=%s,
                    knowledge_point=%s,difficulty=%s,status=%s,source_metadata=%s WHERE id=%s AND source_name=%s""",
                    (subject,title,prompt,word,meaning+'。'+sentence,category,('easy','medium','hard')[level-1],status,metadata,item_id,SOURCE))
            else:
                cur.execute("""INSERT INTO questions
                    (id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,difficulty,
                     question_type,status,source_name,source_record_id,source_metadata)
                    VALUES(%s,%s,'通用',%s,%s,'[]',%s,%s,'*',%s,%s,'short_answer',%s,%s,%s,%s)""",
                    (question_id,subject,title,prompt,word,meaning+'。'+sentence,category,('easy','medium','hard')[level-1],status,SOURCE,'admin-reader-'+str(question_id),metadata))
        conn.commit()
    return dict(item,id=question_id,subject=subject,status=status)

def admin_archive(item_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE questions SET status='archived' WHERE id=%s AND source_name=%s",(item_id,SOURCE))
            changed=cur.rowcount>0
        conn.commit()
    return changed

def summary():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT subject,COUNT(*) AS total FROM questions WHERE source_name=%s AND status='published' GROUP BY subject",(SOURCE,))
            return dict(counts={row['subject']:row['total'] for row in cur.fetchall()})

def list_lessons(subject='语文'):
    if subject not in {'语文','英语'}:raise ValueError('请选择语文或英语')
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT source_metadata FROM questions WHERE source_name=%s AND status='published' AND subject=%s ORDER BY difficulty,id",(SOURCE,subject))
            items=[decode(row['source_metadata']) for row in cur.fetchall()]
    items.sort(key=lambda item:(item['level'],item['question_id']))
    groups={g['id']:g for item in items for g in item.get('learning_groups',[])}
    return dict(items=items,total=len(items),categories=list(dict.fromkeys(item['category'] for item in items)),learning_groups=sorted(groups.values(),key=lambda g:g['priority']))

def create_quiz(handler,db,body,learner_id):
    ids=body.get('reader_unit_ids',[body.get('reader_unit_id',0)])
    if not isinstance(ids,list) or not 1<=len(ids)<=5:raise ValueError('每组请选择 1 至 5 个字词')
    try:
        if any(isinstance(qid,bool) or not isinstance(qid,(str,int)) for qid in ids):raise ValueError()
        ids=[int(qid) for qid in ids]
    except (ValueError,TypeError):raise ValueError('请选择有效词汇')
    if len(set(ids))!=len(ids):raise ValueError('一组中不能重复同一个词汇')
    rows=[]
    for qid in ids:
        row=db.execute("SELECT id,subject FROM questions WHERE id=? AND source_name=? AND status='published'",(qid,SOURCE)).fetchone()
        if not row:return handler.send_json({'error':'这个词汇暂时不可用'},404)
        rows.append(row)
    if len({row['subject'] for row in rows})!=1:raise ValueError('一组请选择同一学科的字词')
    session=db.execute("INSERT INTO quiz_sessions(subject,stage,grade,learner_id) VALUES(?,'通用','*',?)",(rows[0]['subject'],learner_id))
    for position,qid in enumerate(ids):
        db.execute('INSERT INTO quiz_session_questions(session_id,question_id,position) VALUES(?,?,?)',(session.lastrowid,qid,position))
    return handler.send_json(dict(id=session.lastrowid,subject=rows[0]['subject'],stage='通用',grade='*',questions=[handler.public_question(db,qid) for qid in ids]))
