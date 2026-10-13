# -*- coding: utf-8 -*-
"""First completed reading rewards, scoped to the authenticated learner."""
import json

REWARD = 5


class ReadingError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def reading(db, learner_id, story_id, page=None, complete=False):
    # Profile locking serializes concurrent tabs and retrying reward requests.
    profile = db.execute('SELECT points FROM profile WHERE id=? FOR UPDATE', (learner_id,)).fetchone()
    if not profile:
        raise ReadingError('请先选择学习者', 401)
    story = db.execute('SELECT title,paragraphs,updated_at FROM stories WHERE id=?', (story_id,)).fetchone()
    if not story:
        raise ReadingError('故事不存在', 404)
    count = len(json.loads(story['paragraphs']))
    if not count:
        raise ReadingError('故事内容正在准备中', 409)
    if page is not None and (type(page) is not int or not 0 <= page < count):
        raise ReadingError('阅读页码无效')
    row = db.execute('SELECT * FROM story_readings WHERE learner_id=? AND story_id=?',
                     (learner_id, story_id)).fetchone()
    if row and row['completed_at']:
        return {'completed': True, 'reward': REWARD, 'awarded': False,
                'points': int(profile['points']), 'visited': count, 'pages': count, 'wait_seconds': 0}
    if not row and (page is not None or complete):
        if complete or page != 0:
            raise ReadingError('请从第一页开始阅读', 409)
        db.execute('''INSERT INTO story_readings(learner_id,story_id,story_version,next_page)
                      VALUES(?,?,?,0)''', (learner_id, story_id, story['updated_at']))
    elif row and row['story_version'] != story['updated_at']:
        db.execute('''UPDATE story_readings SET next_page=0,started_at=NOW(),story_version=?
                      WHERE learner_id=? AND story_id=?''', (story['updated_at'], learner_id, story_id))
    if page is not None:
        db.execute('''UPDATE story_readings SET next_page=next_page+1
                      WHERE learner_id=? AND story_id=? AND next_page=?''', (learner_id, story_id, page))
    row = db.execute('''SELECT *,GREATEST(0,?-TIMESTAMPDIFF(SECOND,started_at,NOW())) AS wait_seconds
                        FROM story_readings WHERE learner_id=? AND story_id=?''',
                     (min(30, count * 2), learner_id, story_id)).fetchone()
    if not row:
        return {'completed': False, 'reward': REWARD, 'awarded': False, 'visited': 0,
                'pages': count, 'wait_seconds': min(30, count * 2)}
    if complete:
        if row['next_page'] < count:
            raise ReadingError('还有页面没读过，读完再领取吧', 409)
        if row['wait_seconds']:
            raise ReadingError('慢慢读一读，稍后再领取阅读奖励', 409)
        if int(profile['points']) + REWARD > 1000000:
            raise ReadingError('积分余额已到上限，请先兑换后领取', 409)
        ledger = db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('阅读奖励',?,?,?)",
                            (REWARD, '首次读完《'+story['title']+'》', learner_id))
        db.execute('UPDATE profile SET points=points+? WHERE id=?', (REWARD, learner_id))
        db.execute('''UPDATE story_readings SET completed_at=NOW(),ledger_id=?
                      WHERE learner_id=? AND story_id=?''', (ledger.lastrowid, learner_id, story_id))
    return {'completed': bool(complete), 'awarded': bool(complete), 'reward': REWARD,
            'points': int(profile['points']) + (REWARD if complete else 0),
            'visited': int(row['next_page']), 'pages': count, 'wait_seconds': int(row['wait_seconds'])}
