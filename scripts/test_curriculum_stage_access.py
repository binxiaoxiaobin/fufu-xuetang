"""Check textbook access from both learning stages; roll back quiz test writes."""
import getpass
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
from server import Handler
import curriculum

with connection() as conn:
    try:
        db = Store(conn)
        report = {'stages': 2, 'books_per_stage': [], 'topic_quizzes': 0}
        for stage, grade in [('幼儿园', '中班'), ('小学', '二年级')]:
            learner = db.execute("INSERT INTO profile(child_name,learning_stage,grade,points) VALUES(?,?,?,0)",
                                 ('curriculum-scope-test', stage, grade)).lastrowid
            profile = {'learning_stage': stage, 'grade': grade}
            handler = object.__new__(Handler)
            responses = []
            handler.send_json = lambda data, status=200: responses.append((data, status))
            book_count = 0
            for subject in ['语文', '数学', '英语']:
                for selected_grade in ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']:
                    query = {'subject': [subject], 'grade': [selected_grade]}
                    books = curriculum.catalog(db, '/api/curriculum/books', query, profile)['items']
                    assert len(books) == (0 if subject == '英语' and selected_grade in ['一年级','二年级'] else 2)
                    book_count += len(books)
                    for book in books:
                        units = curriculum.catalog(db, '/api/curriculum/books/' + book['id'] + '/units', query, profile)['items']
                        assert units and all(u['question_count'] > 0 for u in units)
                        topics = curriculum.catalog(db, '/api/curriculum/units/' + units[0]['id'] + '/topics', query, profile)['items']
                        assert topics and all(t['question_count'] >= 10 for t in topics)
                        responses.clear()
                        handler.create_quiz(db, {'subject':subject, 'count':5, 'topic_id':topics[0]['id']}, learner)
                        result, status = responses[0]
                        assert status == 200 and len(result['questions']) == 5, responses
                        assert result['stage'] == '小学' and result['grade'] == selected_grade
                        saved = db.execute('SELECT stage,grade FROM quiz_sessions WHERE id=?', (result['id'],)).fetchone()
                        assert saved['stage'] == '小学' and saved['grade'] == selected_grade
                        report['topic_quizzes'] += 1
            report['books_per_stage'].append(book_count)
            # Daily practice still follows the learner's own stage and grade.
            responses.clear()
            handler.create_quiz(db, {'subject':'数学', 'count':5}, learner)
            result, status = responses[0]
            assert status == 200 and result['stage'] == stage and result['grade'] == grade
            unchanged = db.execute('SELECT learning_stage,grade,points FROM profile WHERE id=?', (learner,)).fetchone()
            assert unchanged == {'learning_stage':stage, 'grade':grade, 'points':0}
            responses.clear()
            handler.create_quiz(db, {'subject':'数学', 'topic_id':'missing-topic'}, learner)
            assert responses[0][1] == 400
        assert report['books_per_stage'] == [32,32]
        (ROOT / 'artifacts/curriculum-stage-access-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
    finally:
        conn.rollback()
