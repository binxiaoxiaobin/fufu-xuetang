"""Small daily learning choices; existing reading and quiz records remain authoritative."""
import logging
from mysql_learning_db import connect

KINDS = ('story', 'quiz', 'explore')
MODELS = ('solar', 'globe', 'moon', 'lunar', 'engineering', 'transport', 'jurassic')
OBSERVE_SECONDS = 12

def initialize(db):
    db.execute('''CREATE TABLE IF NOT EXISTS learning_daily_plans (
        learner_id BIGINT NOT NULL, plan_date DATE NOT NULL, kind VARCHAR(16) NOT NULL,
        PRIMARY KEY(learner_id,plan_date), FOREIGN KEY(learner_id) REFERENCES profile(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
    db.execute('''CREATE TABLE IF NOT EXISTS learning_daily_explorations (
        learner_id BIGINT NOT NULL, plan_date DATE NOT NULL, model_key VARCHAR(24) NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL,
        PRIMARY KEY(learner_id,plan_date,model_key), FOREIGN KEY(learner_id) REFERENCES profile(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

def summary(db, learner_id, solved=None):
    clock = db.execute('SELECT CURDATE() AS day').fetchone()['day']
    saved = db.execute('SELECT kind FROM learning_daily_plans WHERE learner_id=? AND plan_date=?', (learner_id,clock)).fetchone()
    kind = saved['kind'] if saved else KINDS[(clock.toordinal()+int(learner_id)) % len(KINDS)]
    if solved is None:
        solved = db.execute('''SELECT COUNT(DISTINCT c.question_id) AS n FROM completions c
            JOIN questions q ON q.id=c.question_id JOIN profile p ON p.id=c.learner_id
            WHERE c.learner_id=? AND c.correct=1 AND q.stage=p.learning_stage
            AND c.created_at>=CURDATE() AND c.created_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)''', (learner_id,)).fetchone()['n']
    stories = db.execute('''SELECT COUNT(*) AS n FROM story_readings WHERE learner_id=?
        AND completed_at>=CURDATE() AND completed_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)''', (learner_id,)).fetchone()['n']
    models = [r['model_key'] for r in db.execute('''SELECT model_key FROM learning_daily_explorations
        WHERE learner_id=? AND plan_date=? AND completed_at IS NOT NULL ORDER BY model_key''', (learner_id,clock)).fetchall()]
    maximum = db.execute('SELECT COALESCE(MAX(id),0) AS n FROM stories').fetchone()['n']
    pivot = (clock.toordinal()+int(learner_id)) % max(1,int(maximum)) + 1
    story = db.execute('''SELECT s.id,s.title FROM stories s WHERE s.id>=? AND NOT EXISTS
        (SELECT 1 FROM story_readings r WHERE r.learner_id=? AND r.story_id=s.id AND r.completed_at IS NOT NULL)
        ORDER BY s.id LIMIT 1''', (pivot,learner_id)).fetchone()
    if not story:
        story = db.execute('''SELECT s.id,s.title FROM stories s WHERE NOT EXISTS
            (SELECT 1 FROM story_readings r WHERE r.learner_id=? AND r.story_id=s.id AND r.completed_at IS NOT NULL)
            ORDER BY s.id LIMIT 1''', (learner_id,)).fetchone()
    return {'date':clock.isoformat(), 'kind':kind, 'progress':{'story':int(stories),'quiz':int(solved),'explore':len(models)},
            'models':models, 'story':dict(story) if story else None}

def change(db, learner_id, kind):
    if kind not in KINDS:
        raise ValueError('请选择读故事、做几题或看模型')
    db.execute('''INSERT INTO learning_daily_plans(learner_id,plan_date,kind) VALUES(?,CURDATE(),?)
        ON DUPLICATE KEY UPDATE kind=VALUES(kind)''', (learner_id,kind))
    return summary(db,learner_id)

def observe(db, learner_id, model, action):
    if not isinstance(model,str) or not isinstance(action,str) or model not in MODELS or action not in {'begin','complete'}:
        raise ValueError('模型观察记录无效')
    if action == 'begin':
        db.execute('''INSERT INTO learning_daily_explorations(learner_id,plan_date,model_key)
            VALUES(?,CURDATE(),?) ON DUPLICATE KEY UPDATE model_key=VALUES(model_key)''', (learner_id,model))
    else:
        row = db.execute('''SELECT TIMESTAMPDIFF(SECOND,started_at,NOW()) AS elapsed
            FROM learning_daily_explorations WHERE learner_id=? AND plan_date=CURDATE() AND model_key=?''', (learner_id,model)).fetchone()
        if not row or row['elapsed'] < OBSERVE_SECONDS:
            raise ValueError('再观察一会儿模型吧')
        db.execute('''UPDATE learning_daily_explorations SET completed_at=COALESCE(completed_at,NOW())
            WHERE learner_id=? AND plan_date=CURDATE() AND model_key=?''', (learner_id,model))
    return summary(db,learner_id)

class DailyPlanRoutes:
    def daily_plan_api(self, method, path, body=None):
        if path not in {'/api/daily-plan','/api/daily-plan/model'}:
            return False
        if method not in {'GET','POST'} or (path.endswith('/model') and method != 'POST'):
            self.send_json({'error':'请求方式不支持'},405)
            return True
        try:
            with connect() as db:
                learner = self.require_parent_learner(db)
                if not learner:
                    return True
                if method == 'GET':
                    result = summary(db,learner)
                elif not isinstance(body,dict):
                    raise ValueError('小目标参数无效')
                elif path.endswith('/model'):
                    result = observe(db,learner,body.get('model'),body.get('action'))
                else:
                    result = change(db,learner,body.get('kind'))
            self.send_json(result)
        except ValueError as exc:
            self.send_json({'error':str(exc)},400)
        except Exception:
            logging.exception('Daily plan request failed')
            self.send_json({'error':'小目标进度暂时无法保存，请稍后再试'},503)
        return True
