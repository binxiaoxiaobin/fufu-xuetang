# -*- coding: utf-8 -*-
"""Exercise first-reading, retry, learner isolation and concurrent MySQL rewards."""
import getpass
import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_learning_db import connect, SCHEMA
from story_reading import reading, ReadingError
import mysql_db

learner = -int(uuid.uuid4().hex[:7],16)-10000000
other = learner-1
story_id = None
try:
    with connect() as db:
        db.execute(SCHEMA['story_readings'])
        for identity in (learner,other):
            db.execute("INSERT INTO profile(id,child_name,points) VALUES(?,'reading-test',120)", (identity,))
        values = dict(slug='reading-test-'+uuid.uuid4().hex, title='阅读测试', summary='测试',
                      paragraphs=['one','two','three'], moral='', sourceNote='', coverPrompt='')
        row = db.execute('''INSERT INTO stories(slug,story_type,title,category,age,color,emoji,summary,
                         paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt)
                         VALUES('''+','.join(['?']*16)+')',mysql_db._record_from_json(values))
        story_id = row.lastrowid
    with connect() as db:
        result = reading(db,learner,story_id)
        assert result['visited'] == 0 and not result['completed']
        for bad_page in (True,-1,3,'0'):
            try:
                reading(db,learner,story_id,bad_page)
                raise AssertionError('invalid page accepted')
            except ReadingError:
                pass
        try:
            reading(db,learner,story_id,complete=True)
            raise AssertionError('unread reward accepted')
        except ReadingError:
            pass
        assert reading(db,learner,story_id,0)['visited'] == 1
        assert reading(db,learner,story_id,2)['visited'] == 1
        assert reading(db,learner,story_id,0)['visited'] == 1
        try:
            reading(db,learner,story_id,complete=True)
            raise AssertionError('skipped page reward accepted')
        except ReadingError:
            pass
        assert reading(db,learner,story_id,1)['visited'] == 2
        assert reading(db,learner,story_id,2)['visited'] == 3
        try:
            reading(db,learner,story_id,complete=True)
            raise AssertionError('instant click reward accepted')
        except ReadingError:
            pass
        db.execute('UPDATE story_readings SET started_at=DATE_SUB(NOW(),INTERVAL 60 SECOND) WHERE learner_id=?', (learner,))
    def claim(_):
        with connect() as db:
            return reading(db,learner,story_id,complete=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(claim,range(4)))
    assert sum(bool(r['awarded']) for r in results) == 1
    with connect() as db:
        assert db.execute('SELECT points FROM profile WHERE id=?',(learner,)).fetchone()['points'] == 125
        assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?',(learner,)).fetchone()['n'] == 1
        assert reading(db,learner,story_id,complete=True)['awarded'] is False
        assert reading(db,other,story_id)['visited'] == 0
        assert db.execute('SELECT points FROM profile WHERE id=?',(other,)).fetchone()['points'] == 120
    with connect() as db:
        for page in range(3):
            reading(db,other,story_id,page)
        db.execute('UPDATE story_readings SET started_at=DATE_SUB(NOW(),INTERVAL 60 SECOND) WHERE learner_id=?', (other,))
    class FailFinalWrite:
        def execute(self,sql,params=()):
            if 'SET completed_at=NOW()' in sql:
                raise RuntimeError('simulated final write failure')
            return failing_db.execute(sql,params)
    try:
        with connect() as failing_db:
            reading(FailFinalWrite(),other,story_id,complete=True)
        raise AssertionError('partial reward accepted')
    except RuntimeError:
        pass
    with connect() as db:
        assert db.execute('SELECT points FROM profile WHERE id=?',(other,)).fetchone()['points'] == 120
        assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?',(other,)).fetchone()['n'] == 0
        assert not db.execute('SELECT completed_at FROM story_readings WHERE learner_id=?',(other,)).fetchone()['completed_at']
    first = mysql_db.story_recommendations()['items']
    second = mysql_db.story_recommendations([r['id'] for r in first])['items']
    assert len(first)==3 and len(second)==3
    assert not ({r['id'] for r in first} & {r['id'] for r in second})
    assert all('paragraphs' not in r and 'paragraph_images' not in r for r in first+second)
    print('PASS: sequential pages, invalid input, minimum time, 4 concurrent claims, retries, learner isolation, random summaries')
finally:
    with connect() as db:
        for identity in (learner,other):
            db.execute('DELETE FROM ledger WHERE learner_id=?',(identity,))
            db.execute('DELETE FROM story_readings WHERE learner_id=?',(identity,))
            db.execute('DELETE FROM profile WHERE id=?',(identity,))
        if story_id:
            db.execute('DELETE FROM stories WHERE id=?',(story_id,))
