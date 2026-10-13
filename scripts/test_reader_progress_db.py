import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from mysql_db import connection
from mysql_learning_db import Store
from reader_lessons import list_lessons
import reader_progress
reader_progress.initialize()
qid=list_lessons('英语')['items'][0]['question_id']
with connection() as conn:
    db=Store(conn)
    try:
        # Isolated IDs are rolled back; no learner profile or points are changed.
        first,second=9876543201,9876543202
        db.execute('INSERT INTO completions(question_id,correct,points_delta,learner_id) VALUES(?,1,0,?)',(qid,first))
        for status in ['review','mastered','review']:
            reader_progress.save_progress(db,first,dict(items=[dict(question_id=qid,status=status)]))
            assert reader_progress.list_progress(db,first)['items']==[dict(question_id=qid,status=status)]
            assert reader_progress.list_progress(db,second)['items']==[]
        try:reader_progress.save_progress(db,second,dict(items=[dict(question_id=qid,status='mastered')]))
        except ValueError:pass
        else:raise AssertionError('Uncompleted word marked mastered')
        reader_progress.save_progress(db,first,dict(items=[dict(question_id=qid,status='new')]))
        assert reader_progress.list_progress(db,first)['items']==[dict(question_id=qid,status='new')]
        for values in [[],[dict(question_id=True,status='review')],[dict(question_id=qid,status='bad')],[dict(question_id=0,status='mastered')],[dict(question_id=qid,status='review')]*2]:
            try:reader_progress.save_progress(db,first,dict(items=values))
            except ValueError:pass
            else:raise AssertionError('Invalid status accepted')
        from server import Handler
        h=object.__new__(Handler);h.require_parent_learner=lambda db:None;h.send_json=lambda *args:None
        assert h.content_api('GET','/api/learning/reader-progress') is True
        print('Private statuses, learner isolation, mastery/review transitions, reset and invalid marks passed')
    finally:conn.rollback()
