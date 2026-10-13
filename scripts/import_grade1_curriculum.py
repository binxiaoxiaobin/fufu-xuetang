"""Transactional, append-only textbook question import; secret read from the terminal."""
import getpass
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'backend'))
from build_grade1_curriculum import validate
parser=argparse.ArgumentParser(description='Import a validated original textbook question bundle transactionally')
parser.add_argument('source',nargs='?',default='content/questions/pep2024-grade1.json')
parser.add_argument('--report',default='artifacts/grade1-curriculum-import.json')
args=parser.parse_args()
source_path=ROOT/args.source
payload=json.loads(source_path.read_text(encoding='utf-8'))
validate(payload)
if source_path.name=='primary-classic-extension.json':
    from primary_math_questions import verify
    for b in payload['books']:
        for u in b['units']:
            for t in u['topics']:
                for item in t['questions']:verify(item)
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_learning_db import connect
from curriculum import initialize

report={'inserted':0,'already_present':0,'books':0,'units':0,'topics':0,'minimum_per_topic':0}
with connect() as db:
    initialize(db)
    if not db.execute("SELECT GET_LOCK('fufu-curriculum-import',10) AS acquired").fetchone()['acquired']:
        raise RuntimeError('Another curriculum import is running')
    try:
        before=db.execute('SELECT COUNT(*) AS count FROM questions').fetchone()['count']
        next_id=db.execute('SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions').fetchone()['next_id']
        for book in payload['books']:
            db.execute('''INSERT INTO curriculum_books(id,subject,stage,grade,term,edition,title,source_url)
                VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),edition=VALUES(edition),source_url=VALUES(source_url)''',
                [book[k] for k in ('id','subject','stage','grade','term','edition','title','source_url')])
            report['books']+=1
            for unit in book['units']:
                db.execute('''INSERT INTO curriculum_units(id,book_id,title,position) VALUES(?,?,?,?)
                    ON DUPLICATE KEY UPDATE title=VALUES(title),position=VALUES(position)''',(unit['id'],book['id'],unit['title'],unit['position']))
                report['units']+=1
                for topic in unit['topics']:
                    db.execute('''INSERT INTO curriculum_topics(id,unit_id,title,position) VALUES(?,?,?,?)
                        ON DUPLICATE KEY UPDATE title=VALUES(title),position=VALUES(position)''',(topic['id'],unit['id'],topic['title'],topic['position']))
                    report['topics']+=1
                    for item in topic['questions']:
                        existing=db.execute('SELECT id FROM questions WHERE source_record_id=?',(item['source_record_id'],)).fetchone()
                        if existing:
                            question_id=existing['id'];report['already_present']+=1
                        else:
                            question_id=next_id;next_id+=1
                            metadata=dict(book_id=book['id'],unit_id=unit['id'],topic_id=topic['id'],edition=book['edition'],
                                authorship=payload['authorship'],directory_reference=book['directory_reference'],
                                validation='calculation/options/explanation/deduplication checked; no claim of teacher review')
                            db.execute('''INSERT INTO questions(id,subject,stage,grade,title,prompt,options,answer,explanation,
                                knowledge_point,difficulty,question_type,status,source_record_id,source_name,source_url,
                                source_license,source_attribution,source_metadata,hint)
                                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                                (question_id,book['subject'],book['stage'],book['grade'],topic['title'],item['prompt'],
                                json.dumps([o['text'] for o in item['options']],ensure_ascii=False),item['answer'],item['explanation'],
                                topic['title'],item['difficulty'],item['question_type'],'published',item['source_record_id'],
                                '福福学堂原创·教材同步',book['source_url'],'原创练习',payload['authorship'],json.dumps(metadata,ensure_ascii=False),item['hint']))
                            for position,option in enumerate(item['options']):
                                db.execute('''INSERT INTO question_options(question_id,option_key,option_text,is_correct,sort_order)
                                    VALUES(?,?,?,?,?)''',(question_id,option['key'],option['text'],int(option['key']==item['answer']),position))
                            report['inserted']+=1
                        db.execute('''INSERT INTO question_curriculum(question_id,topic_id) VALUES(?,?)
                            ON DUPLICATE KEY UPDATE topic_id=VALUES(topic_id)''',(question_id,topic['id']))
        topic_ids=[t['id'] for b in payload['books'] for u in b['units'] for t in u['topics']]
        placeholders=','.join('?' for _ in topic_ids)
        counts=db.execute('''SELECT qc.topic_id,COUNT(*) AS count FROM question_curriculum qc
            JOIN questions q ON q.id=qc.question_id WHERE q.status='published' AND qc.topic_id IN ('''+placeholders+''')
            GROUP BY qc.topic_id''',topic_ids).fetchall()
        assert len(counts)==report['topics'],counts
        report['minimum_per_topic']=min(row['count'] for row in counts)
        assert report['minimum_per_topic']>=10
        after=db.execute('SELECT COUNT(*) AS count FROM questions').fetchone()['count']
        assert after-before==report['inserted']
        report.update(total_questions=after,source_sha256=hashlib.sha256(source_path.read_bytes()).hexdigest())
        db.connection.commit()
    finally:
        db.execute("SELECT RELEASE_LOCK('fufu-curriculum-import')")
report_path=ROOT/args.report
if report_path.exists():
    initial=json.loads(report_path.read_text(encoding='utf-8'));initial['last_run']=report
    report_path.write_text(json.dumps(initial,ensure_ascii=False,indent=2),encoding='utf-8')
else:
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
