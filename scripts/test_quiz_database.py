"""Exercise actual quiz SQL and roll back the temporary session."""
import sys, os, getpass
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
from server import Handler
with connection() as conn:
    try:
        db=Store(conn)
        handler=object.__new__(Handler)
        captured=[]
        handler.send_json=lambda data,status=200: captured.append((data,status))
        handler.create_quiz(db,{'subject':'数学','count':5},1)
        data,status=captured[0]
        assert status==200, data
        assert len(data['questions'])==5
        assert all('answer' not in q and all('is_correct' not in option for option in q['options']) for q in data['questions'])
        captured.clear()
        with patch('server.random.randint', return_value=10**12):
            handler.create_quiz(db,{'subject':'数学','count':5},1)
        assert captured[0][1]==200 and len(captured[0][0]['questions'])==5
        print('Empty first sample window correctly wraps to the start of the catalog.')
        print('Real quiz SQL passed; five public questions and grouped options returned.')
        question = data['questions'][0]
        qid = question['id']
        expected = db.execute('SELECT answer,question_type FROM questions WHERE id=?', (qid,)).fetchone()
        before = db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points']
        if expected['question_type'] == 'short_answer':
            wrong_body = dict(question_id=qid, answer_text='wrong answer')
            correct_body = dict(question_id=qid, answer_text=expected['answer'])
        else:
            wrong_option = db.execute('SELECT option_key FROM question_options WHERE question_id=? AND is_correct=0 LIMIT 1', (qid,)).fetchone()
            right_option = db.execute('SELECT option_key FROM question_options WHERE question_id=? AND is_correct=1 LIMIT 1', (qid,)).fetchone()
            wrong_body = dict(question_id=qid, option_key=wrong_option['option_key'])
            correct_body = dict(question_id=qid, option_key=right_option['option_key'])
        captured.clear()
        handler.answer_quiz(db, data['id'], wrong_body, 1)
        assert captured[-1][1] == 200 and captured[-1][0]['reward'] == 0
        assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points'] == before
        captured.clear()
        handler.answer_quiz(db, data['id'], correct_body, 1)
        assert captured[-1][1] == 200 and captured[-1][0]['reward'] == 1
        assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points'] == before + 1
        assert db.execute('SELECT points_delta FROM completions WHERE learner_id=1 ORDER BY id DESC LIMIT 1').fetchone()['points_delta'] == 1
        assert db.execute("SELECT amount FROM ledger WHERE learner_id=1 AND kind='学习奖励' ORDER BY id DESC LIMIT 1").fetchone()['amount'] == 1
        captured.clear()
        handler.answer_quiz(db, data['id'], correct_body, 1)
        assert captured[-1][1] == 409
        assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points'] == before + 1
        print('Wrong answer: 0; correct answer: 1 in response/balance/completion/ledger; duplicate: no additional reward.')
    finally:
        conn.rollback()
        print('Temporary quiz session rolled back.')
