"""Exercise every imported topic and unit through the real quiz APIs; rollback."""
import getpass
import hashlib
import json
import os
import sys
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
from server import Handler
import curriculum

payload=json.loads((ROOT/'content/questions/primary-classic-extension.json').read_text(encoding='utf-8'))
previous=json.loads((ROOT/'content/questions/pep2024-grade1.json').read_text(encoding='utf-8'))
books=previous['books']+payload['books']
with connection() as conn:
    try:
        db=Store(conn)
        learner=db.execute("INSERT INTO profile(child_name,learning_stage,grade,points) VALUES('primary-curriculum-test','小学','二年级',0)").lastrowid
        profile=dict(learning_stage='小学',grade='二年级')
        handler=object.__new__(Handler);responses=[]
        handler.send_json=lambda data,status=200:responses.append((data,status))
        checked_units=0;checked_topics=0;latency=[];graded_types=set()
        counts={}
        for b in books:
            query={'subject':[b['subject']],'grade':[b['grade']]}
            found=curriculum.catalog(db,'/api/curriculum/books',query,profile)['items']
            assert len(found)==2 and b['id'] in {x['id'] for x in found},(b['id'],found)
            start=time.perf_counter()
            units=curriculum.catalog(db,'/api/curriculum/books/'+b['id']+'/units',query,profile)['items']
            latency.append((time.perf_counter()-start)*1000)
            assert len(units)==len(b['units'])
            book_count=0
            for unit in units:
                topics=curriculum.catalog(db,'/api/curriculum/units/'+unit['id']+'/topics',query,profile)['items']
                assert topics and unit['question_count']==sum(t['question_count'] for t in topics)
                responses.clear();handler.create_quiz(db,dict(subject=b['subject'],count=5,unit_id=unit['id']),learner)
                result,status=responses[0];assert status==200 and len(result['questions'])==5
                assert result['grade']==b['grade'];checked_units+=1
                for topic in topics:
                    assert topic['question_count']>=10,topic
                    start=time.perf_counter();responses.clear()
                    handler.create_quiz(db,dict(subject=b['subject'],count=10,topic_id=topic['id']),learner)
                    result,status=responses[0];latency.append((time.perf_counter()-start)*1000)
                    assert status==200 and len(result['questions'])==10,(topic,responses)
                    ids=[q['id'] for q in result['questions']]
                    rows=db.execute('SELECT question_id FROM question_curriculum WHERE topic_id=? AND question_id IN ('+','.join('?' for _ in ids)+')',[topic['id']]+ids).fetchall()
                    assert len(rows)==10
                    assert all('answer' not in q and 'explanation' not in q and all('is_correct' not in o for o in q['options']) for q in result['questions'])
                    for public in result['questions']:
                        row=db.execute('SELECT question_type,answer FROM questions WHERE id=?',(public['id'],)).fetchone()
                        # One real grading check for choice, integer, decimal and
                        # fraction/negative formats; all writes are temporary.
                        key=row['question_type']+('-fraction' if '/' in row['answer'] else '-decimal' if '.' in row['answer'] else '-negative' if row['answer'].startswith('-') else '')
                        if key not in graded_types:
                            body=dict(question_id=public['id'])
                            body['answer_text' if row['question_type']=='short_answer' else 'option_key']=row['answer']
                            responses.clear();handler.answer_quiz(db,result['id'],body,learner)
                            assert responses[0][1]==200 and responses[0][0]['correct'] and responses[0][0]['explanation'],(key,responses)
                            graded_types.add(key)
                    checked_topics+=1;book_count+=topic['question_count']
            counts[b['title']]=book_count
        assert curriculum.catalog(db,'/api/curriculum/books',{'subject':['英语'],'grade':['一年级']},profile)['items']==[]
        assert curriculum.catalog(db,'/api/curriculum/books',{'subject':['英语'],'grade':['二年级']},profile)['items']==[]
        assert db.execute('SELECT grade FROM profile WHERE id=?',(learner,)).fetchone()['grade']=='二年级'
        assert len(books)==32 and checked_topics==sum(len(u['topics']) for b in books for u in b['units'])
        report=dict(books=len(books),units=checked_units,topics=checked_topics,questions=sum(counts.values()),all_topics_at_least_ten=True,
                    all_scopes_verified=True,answers_private=True,grading_formats=sorted(graded_types),profile_grade_unchanged=True,
                    english_starts_at_grade_three=True,database_timing_ms=dict(median=round(sorted(latency)[len(latency)//2],2),max=round(max(latency),2)),
                    temporary_test_data='rolled back',book_question_counts=counts)
        (ROOT/'artifacts/primary-curriculum-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({k:v for k,v in report.items() if k!='book_question_counts'},ensure_ascii=False))
    finally:conn.rollback();print('Temporary test learner, quizzes and rewards rolled back.')
