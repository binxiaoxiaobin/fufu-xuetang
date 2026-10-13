"""Compare existing rows without exporting learner data or secrets."""
import getpass,hashlib,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_learning_db import connect
path=ROOT/'artifacts/primary-curriculum-preservation.json'
with connect() as db:
    rows=db.execute("SELECT * FROM questions WHERE source_record_id IS NULL OR (source_record_id NOT LIKE ? AND source_record_id NOT LIKE ?) ORDER BY id",('pepclassic-%','compiledclassic-%')).fetchall()
    options=db.execute("SELECT o.* FROM question_options o JOIN questions q ON q.id=o.question_id WHERE q.source_record_id IS NULL OR (q.source_record_id NOT LIKE ? AND q.source_record_id NOT LIKE ?) ORDER BY o.question_id,o.sort_order,o.id",('pepclassic-%','compiledclassic-%')).fetchall()
    profiles=db.execute('SELECT id,learning_stage,grade,points FROM profile ORDER BY id').fetchall()
    current=dict(existing_questions=len(rows),questions_sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str,ensure_ascii=False).encode()).hexdigest(),
                 options_sha256=hashlib.sha256(json.dumps(options,sort_keys=True,default=str,ensure_ascii=False).encode()).hexdigest(),profiles_sha256=hashlib.sha256(json.dumps(profiles,sort_keys=True,default=str).encode()).hexdigest())
    if sys.argv[-1]=='verify':
        previous=json.loads(path.read_text(encoding='utf-8'));assert current==previous['baseline'],(current,previous)
        previous['verified_unchanged']=True;path.write_text(json.dumps(previous,indent=2),encoding='utf-8');print('Existing questions/options and learner grades/points unchanged.')
    else:
        assert not path.exists(),'Preservation baseline already exists; do not replace it'
        path.write_text(json.dumps(dict(baseline=current),indent=2),encoding='utf-8');print('Existing-data baseline saved:',len(rows),'questions')
