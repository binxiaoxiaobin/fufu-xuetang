"""Transactional, append-only import of the reviewed second practice package."""
import argparse
import getpass
import gzip
import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from mysql_learning_db import mysql_connection
from build_subject_round2 import DATASET,OUTPUT,GRADES,validate
from import_primary_subject_expansion import insert_question,digest,assert_imported

SUBJECTS=('语文','数学','英语','科学')
LOCK='fufu_subject_round2_import'
STAGE='小学'


def plan(candidates,existing):
    by_id={r['source_record_id']:r for r in existing if r['source_record_id']}
    prompts={(r['subject'],r['stage'],r['grade'],r['prompt']) for r in existing}
    selected=[]
    for q in candidates:
        if q['source_record_id'] in by_id:
            old=by_id[q['source_record_id']]
            assert all(old[k]==q[k] for k in ('subject','grade','prompt','answer','explanation')), 'Published package changed; use a new version'
            continue
        assert (q['subject'],q['stage'],q['grade'],q['prompt']) not in prompts, 'Duplicate existing prompt: '+q['source_record_id']
        selected.append(q)
    return selected


def counts(rows):
    return Counter((q['subject'],q['grade']) for q in rows if q['stage']==STAGE and q['status']=='published')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    package=json.loads(OUTPUT.read_text(encoding='utf-8'))
    assert package['dataset']==DATASET
    candidates=package['questions'];validate(candidates)
    if not os.getenv('FUFU_MYSQL_PASSWORD'):
        os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('MySQL password: ')
    with mysql_connection() as connection:
        locked=False
        try:
            with connection.cursor() as cur:
                cur.execute('SELECT GET_LOCK(%s,10) AS acquired',(LOCK,))
                locked=cur.fetchone()['acquired']==1
                assert locked,'Another import is running'
                cur.execute('SELECT * FROM questions ORDER BY id'+(' FOR UPDATE' if args.apply else ''))
                existing=cur.fetchall();selected=plan(candidates,existing)
                before=counts(existing)
                print('Validated package:',len(candidates),'questions. New rows:',len(selected))
                if not args.apply or not selected:
                    connection.rollback()
                    print('Dry run only.' if not args.apply else 'Already imported. No changes.')
                    return
                cur.execute('SELECT * FROM question_options ORDER BY id FOR UPDATE')
                old_options=cur.fetchall()
                stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
                backup=ROOT/'artifacts/backups'/f'{DATASET}-before-{stamp}.json.gz'
                backup.parent.mkdir(parents=True,exist_ok=True)
                with gzip.open(str(backup),'wt',encoding='utf-8') as stream:
                    json.dump({'questions':existing,'question_options':old_options},stream,ensure_ascii=False,default=str)
                old_hash=digest(existing);option_hash=digest(old_options)
                first=max((q['id'] for q in existing),default=0)+1
                for offset,q in enumerate(selected):insert_question(cur,q,first+offset)
                assert_imported(cur,selected,first)
                cur.execute('SELECT * FROM questions ORDER BY id');after_rows=cur.fetchall()
                assert digest([r for r in after_rows if r['id']<first])==old_hash,'Existing questions changed'
                cur.execute('SELECT * FROM question_options WHERE question_id<%s ORDER BY id',(first,))
                assert digest(cur.fetchall())==option_hash,'Existing options changed'
                assert not plan(candidates,after_rows),'Repeat import would add rows'
                after=counts(after_rows);added=Counter((q['subject'],q['grade']) for q in selected)
                report={'dataset':DATASET,'stage':STAGE,'imported':len(selected),'backup':str(backup.relative_to(ROOT)),
                        'preserved_questions':len(existing),'preserved_options':len(old_options),
                        'repeat_import_additions':0,'first_id':first,'last_id':first+len(selected)-1,
                        'counts':[{'subject':s,'grade':g,'before':before[s,g], 'added':added[s,g],'after':after[s,g],
                                   'available_including_shared':after[s,g]+after[s,'*']} for g in GRADES for s in SUBJECTS]}
                assert all(after[s,g]-before[s,g]==added[s,g] for s in SUBJECTS for g in GRADES)
                connection.commit()
                path=ROOT/'artifacts'/f'{DATASET}-import-report.json'
                path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
                print('Published:',len(selected),'. Existing questions and options preserved. Report:',path)
        except Exception:
            connection.rollback();raise
        finally:
            if locked:
                with connection.cursor() as cur:cur.execute('SELECT RELEASE_LOCK(%s)',(LOCK,))


if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    main()
