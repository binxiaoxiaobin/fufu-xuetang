"""Refresh only generated questions whose stored content still equals our prior import."""
import copy
import argparse
import getpass
import hashlib
import json
import os
import sys
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--primary',action='store_true')
args=parser.parse_args()
if args.primary:
    from build_primary_curriculum import build
else:
    from build_grade1_curriculum import build
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'backend'))
source=ROOT/('content/questions/primary-classic-extension.json' if args.primary else 'content/questions/pep2024-grade1.json')
prefix='primary' if args.primary else 'grade1'
original=source.read_bytes();old=json.loads(original)
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_learning_db import connect
old_items={q['source_record_id']:q for b in old['books'] for u in b['units'] for t in u['topics'] for q in t['questions']}
try:
    new=build();changes=[]
    with connect() as db:
        for b in new['books']:
            for u in b['units']:
                for t in u['topics']:
                    db.execute('UPDATE curriculum_topics SET title=? WHERE id=?',(t['title'],t['id']))
                    for q in t['questions']:
                        prior=old_items[q['source_record_id']]
                        if q==prior:continue
                        row=db.execute('SELECT id,prompt,answer,explanation FROM questions WHERE source_record_id=? FOR UPDATE',(q['source_record_id'],)).fetchone()
                        assert row and all(row[key]==prior[key] for key in ['prompt','answer','explanation']),'Editorial change detected; aborting refresh'
                        metadata=dict(book_id=b['id'],unit_id=u['id'],topic_id=t['id'],edition=b['edition'],
                            authorship=new['authorship'],directory_reference=b['directory_reference'],validation='automated checks; no teacher-review claim')
                        db.execute('''UPDATE questions SET title=?,knowledge_point=?,hint=?,prompt=?,answer=?,explanation=?,options=?,source_metadata=? WHERE id=?''',
                            (t['title'],t['title'],q['hint'],q['prompt'],q['answer'],q['explanation'],json.dumps([o['text'] for o in q['options']],ensure_ascii=False),json.dumps(metadata,ensure_ascii=False),row['id']))
                        db.execute('DELETE FROM question_options WHERE question_id=?',(row['id'],))
                        for position,option in enumerate(q['options']):
                            db.execute('''INSERT INTO question_options(question_id,option_key,option_text,is_correct,sort_order)
                                VALUES(?,?,?,?,?)''',(row['id'],option['key'],option['text'],int(option['key']==q['answer']),position))
                        changes.append(q['source_record_id'])
    if changes:
        (ROOT/('artifacts/'+prefix+'-curriculum-before-review-'+hashlib.sha256(original).hexdigest()[:12]+'.json')).write_bytes(original)
    result=dict(updated=len(changes),source_records=changes,reason='Review taught scope, shape composition and vocabulary alignment against textbook directory')
    (ROOT/('artifacts/'+prefix+'-curriculum-scope-review.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    report_path=ROOT/('artifacts/'+prefix+'-curriculum-import.json')
    report=json.loads(report_path.read_text(encoding='utf-8'))
    report['source_sha256']=hashlib.sha256(source.read_bytes()).hexdigest();report['scope_review_updates']=report.get('scope_review_updates',0)+len(changes)
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'updated':len(changes)},ensure_ascii=False))
except Exception:
    source.write_bytes(original)
    raise
