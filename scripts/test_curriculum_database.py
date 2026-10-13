"""Test real directory, selection, grading and learner isolation; roll back all writes."""
import getpass
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
from server import Handler
import curriculum

with connection() as conn:
    try:
        db=Store(conn)
        learner=db.execute("INSERT INTO profile(child_name,learning_stage,grade,points) VALUES('curriculum-test','小学','一年级',0)").lastrowid
        profile={'learning_stage':'小学','grade':'一年级'}
        handler=object.__new__(Handler);responses=[]
        handler.send_json=lambda data,status=200:responses.append((data,status))
        total=0;first_session=None
        for subject in ['语文','数学']:
            books=curriculum.catalog(db,'/api/curriculum/books',{'subject':[subject]},profile)['items']
            assert len(books)==2
            for book in books:
                units=curriculum.catalog(db,'/api/curriculum/books/'+book['id']+'/units',{'subject':[subject]},profile)['items']
                assert units
                for unit in units:
                    topics=curriculum.catalog(db,'/api/curriculum/units/'+unit['id']+'/topics',{'subject':[subject]},profile)['items']
                    assert topics and unit['question_count']==sum(t['question_count'] for t in topics)
                    responses.clear()
                    handler.create_quiz(db,dict(subject=subject,count=5,unit_id=unit['id']),learner)
                    assert responses[0][1]==200,responses
                    for topic in topics:
                        assert topic['question_count']>=10,topic
                        responses.clear()
                        handler.create_quiz(db,dict(subject=subject,count=10,topic_id=topic['id']),learner)
                        result,status=responses[0];assert status==200 and len(result['questions'])==10,(topic,responses)
                        ids=[q['id'] for q in result['questions']]
                        placeholders=','.join('?' for _ in ids)
                        mapped=db.execute('SELECT question_id FROM question_curriculum WHERE topic_id=? AND question_id IN ('+placeholders+')',[topic['id']]+ids).fetchall()
                        assert len(mapped)==10
                        assert all('answer' not in q and 'explanation' not in q and all('is_correct' not in o for o in q['options']) for q in result['questions'])
                        if first_session is None:first_session=result
                        total+=1
        question=first_session['questions'][0]
        answer=db.execute('SELECT answer FROM questions WHERE id=?',(question['id'],)).fetchone()['answer']
        responses.clear()
        handler.answer_quiz(db,first_session['id'],dict(question_id=question['id'],option_key=answer),learner+100000)
        assert responses[0][1]==404,'another learner cannot submit this session'
        responses.clear()
        with patch('server.profile_payload',return_value={'points':10}):
            wrong=next(o['key'] for o in question['options'] if o['key']!=answer)
            handler.answer_quiz(db,first_session['id'],dict(question_id=question['id'],option_key=wrong),learner)
            assert not responses[0][0]['correct'] and 'answer' not in responses[0][0]
            responses.clear()
            handler.answer_quiz(db,first_session['id'],dict(question_id=question['id'],option_key=wrong),learner)
            assert responses[0][0]['can_reveal'] and responses[0][0]['explanation']
            responses.clear()
            handler.answer_quiz(db,first_session['id'],dict(question_id=question['id'],option_key=answer),learner)
            assert responses[0][0]['correct'] and responses[0][0]['explanation']
            responses.clear()
            handler.answer_quiz(db,first_session['id'],dict(question_id=question['id'],option_key=answer),learner)
            assert responses[0][1]==409,'second submission must not grant points twice'
        assert db.execute('SELECT points FROM profile WHERE id=?',(learner,)).fetchone()['points']==10
        responses.clear()
        handler.create_quiz(db,dict(subject='英语',topic_id='pep2024-g1-math-a.u01.t00'),learner)
        assert responses[0][1]==400
        responses.clear()
        handler.create_quiz(db,dict(subject='数学',topic_id="bad' OR 1=1"),learner)
        assert responses[0][1]==400
        db.execute("UPDATE profile SET grade='二年级' WHERE id=?",(learner,))
        responses.clear()
        handler.create_quiz(db,dict(subject='数学',topic_id='pep2024-g1-math-a.u01.t00'),learner)
        assert responses[0][1]==200 and responses[0][0]['grade']=='一年级'
        assert db.execute('SELECT grade FROM profile WHERE id=?',(learner,)).fetchone()['grade']=='二年级'
        clause,params,grade=curriculum.quiz_filter(db,{'topic_id':'pep2024-g1-math-a.u01.t00'},'数学','小学','一年级')
        plan=db.execute("EXPLAIN SELECT q.id FROM questions q WHERE q.status='published'"+clause+' ORDER BY q.id LIMIT 10',params).fetchall()
        assert any(row.get('key')=='idx_topic_question' for row in plan),plan
        result=dict(books=4,topics_tested=total,minimum_topic_questions=10,all_topics_correctly_scoped=True,answers_private=True,
            duplicate_reward_prevented=True,invalid_scope_rejected=True,topic_index_used=True,learner_isolation=True,
            explanations_after_two_wrong_answers=True,review_keeps_profile_grade=True,temporary_data='rolled back')
        (ROOT/'artifacts/grade1-curriculum-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False))
    finally:
        conn.rollback();print('Temporary learner, quiz attempts and reward records rolled back.')
