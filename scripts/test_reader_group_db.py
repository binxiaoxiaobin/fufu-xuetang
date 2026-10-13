"""Grouped reader sessions and points, entirely rolled back."""
import os,sys,getpass
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
if not os.getenv('FUFU_MYSQL_PASSWORD'):os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
from server import Handler
from reader_lessons import list_lessons

for subject in ('语文','英语'):
    lessons=list_lessons(subject)['items'][:5]
    with connection() as conn:
        try:
            db=Store(conn);handler=object.__new__(Handler);captured=[]
            handler.send_json=lambda data,status=200:captured.append((data,status))
            before=db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points']
            handler.create_quiz(db,dict(practice_mode='reader',reader_unit_ids=[i['question_id'] for i in lessons]),1)
            session,status=captured[-1];assert status==200
            assert [q['id'] for q in session['questions']]==[i['question_id'] for i in lessons]
            assert len(session['questions'])==5
            assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points']==before
            for lesson in reversed(lessons):
                handler.answer_quiz(db,session['id'],dict(question_id=lesson['question_id'],answer_text=lesson['word']),1)
                assert captured[-1][0]['reward']==1 and captured[-1][1]==200
            assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points']==before+5
            handler.answer_quiz(db,session['id'],dict(question_id=lessons[0]['question_id'],answer_text=lessons[0]['word']),1)
            assert captured[-1][1]==409
            assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points']==before+5
            for ids in ([],[lessons[0]['question_id']]*2,[i['question_id'] for i in lessons]+[0],['bad'],[True],[[1]]):
                try:handler.create_quiz(db,dict(practice_mode='reader',reader_unit_ids=ids),1)
                except ValueError:pass
                else:raise AssertionError('Invalid group accepted')
            handler.create_quiz(db,dict(practice_mode='reader',reader_unit_ids=[lessons[0]['question_id'],999999999]),1)
            assert captured[-1][1]==404
            other=list_lessons('英语' if subject=='语文' else '语文')['items'][0]
            try:handler.create_quiz(db,dict(practice_mode='reader',reader_unit_ids=[lessons[0]['question_id'],other['question_id']]),1)
            except ValueError:pass
            else:raise AssertionError('Mixed subjects accepted')
            handler.create_quiz(db,dict(practice_mode='reader',reader_unit_id=lessons[0]['question_id']),1)
            assert captured[-1][1]==200 and len(captured[-1][0]['questions'])==1
            print(subject,'group membership, reordered answers, 1 point each, duplicate protection and validation: passed')
        finally:conn.rollback()
print('All sessions and reward changes rolled back.')
