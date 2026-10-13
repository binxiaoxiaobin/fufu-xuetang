"""Verify common vocabulary lessons and rewards against MySQL, then roll back."""
import sys, os, getpass
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
from server import Handler
from reader_lessons import list_lessons

for subject in ('语文', '英语'):
    catalog = list_lessons(subject)
    assert catalog['total'] >= 300
    assert len(catalog['categories']) == 11
    assert {item['level'] for item in catalog['items']} == {1, 2, 3}
    assert all('grade' not in item and 'stage' not in item for item in catalog['items'])
    assert all(len(set(item['choice_words']))==2 and item['word'] not in item['choice_words'] for item in catalog['items'])
    assert all(len(set(item['extra_characters']))==len(item['extra_characters']) and not set(item['extra_characters']).intersection(item['word']) for item in catalog['items'])
    with connection() as conn:
        try:
            db = Store(conn)
            db.execute("UPDATE profile SET learning_stage='未设置',grade='' WHERE id=1")
            handler = object.__new__(Handler)
            captured = []
            handler.send_json = lambda data, status=200: captured.append((data, status))
            lesson = catalog['items'][0]
            handler.create_quiz(db, dict(practice_mode='reader', reader_unit_id=lesson['question_id']), 1)
            session, status = captured[-1]
            assert status == 200
            question = session['questions'][0]
            assert 'answer' not in question and question['reader_lesson']['word'] == lesson['word']
            assert question['reader_lesson']['word_asset_id'] and question['reader_lesson']['sentence_asset_id']
            assert question['reader_lesson']['scene_asset_id'] and question['reader_lesson']['demo']
            assert question['reader_lesson']['choice_words']==lesson['choice_words']
            if subject=='英语':assert question['reader_lesson']['translation_asset_id'] and question['reader_lesson']['translation_audio']
            before = db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points']
            handler.answer_quiz(db, session['id'], dict(question_id=question['id'], answer_text='wrong'), 1)
            assert captured[-1][0]['reward'] == 0
            body = dict(question_id=question['id'], answer_text=lesson['word'])
            handler.answer_quiz(db, session['id'], body, 1)
            assert captured[-1][1] == 200 and captured[-1][0]['reward'] == 1
            assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points'] == before + 1
            assert db.execute('SELECT points_delta FROM completions WHERE learner_id=1 ORDER BY id DESC LIMIT 1').fetchone()['points_delta'] == 1
            assert db.execute('SELECT amount FROM ledger WHERE learner_id=1 ORDER BY id DESC LIMIT 1').fetchone()['amount'] == 1
            handler.answer_quiz(db, session['id'], body, 1)
            assert captured[-1][1] == 409
            assert db.execute('SELECT points FROM profile WHERE id=1').fetchone()['points'] == before + 1
            new_lesson=next(item for item in reversed(catalog['items']) if not item.get('scene_image'))
            handler.create_quiz(db,dict(practice_mode='reader',reader_unit_id=new_lesson['question_id']),1)
            new_question=captured[-1][0]['questions'][0]
            assert new_question['reader_lesson']['word']==new_lesson['word']
            assert new_question['reader_lesson']['word_asset_id'] and new_question['reader_lesson']['sentence_asset_id']
            if subject=='英语':assert new_question['reader_lesson']['translation_asset_id']
            print(subject, ': no grade requirement; word/sentence media; reward 1; duplicate protected.')
        finally:
            conn.rollback()
print('All temporary profiles, sessions and rewards rolled back.')
