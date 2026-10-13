"""Initialize daily-plan tables and check isolated, idempotent progress with rolled-back writes."""
import getpass
import json
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
import daily_plan

with connection() as conn:
    db=Store(conn);daily_plan.initialize(db);conn.commit()
    try:
        learner=db.execute("INSERT INTO profile(child_name,learning_stage,grade,points) VALUES('daily-plan-test','幼儿园','中班',0)").lastrowid
        other=db.execute("INSERT INTO profile(child_name,learning_stage,grade,points) VALUES('daily-plan-other','小学','一年级',0)").lastrowid
        first=daily_plan.summary(db,learner)
        assert first==daily_plan.summary(db,learner)
        assert first['progress']=={'story':0,'quiz':0,'explore':0}
        for kind in daily_plan.KINDS:
            assert daily_plan.change(db,learner,kind)['kind']==kind
            assert daily_plan.summary(db,learner)['kind']==kind
        for model in ['solar','transport']:
            daily_plan.observe(db,learner,model,'begin')
            try:daily_plan.observe(db,learner,model,'complete')
            except ValueError:pass
            else:raise AssertionError('Instant observation was counted')
            db.execute('''UPDATE learning_daily_explorations SET started_at=DATE_SUB(NOW(),INTERVAL 20 SECOND)
                WHERE learner_id=? AND model_key=?''',(learner,model))
            daily_plan.observe(db,learner,model,'complete')
            daily_plan.observe(db,learner,model,'complete')
        assert daily_plan.summary(db,learner)['progress']['explore']==2
        assert daily_plan.summary(db,other)['progress']['explore']==0
        db.execute('''UPDATE learning_daily_explorations SET plan_date=DATE_SUB(CURDATE(),INTERVAL 1 DAY)
            WHERE learner_id=?''',(learner,))
        assert daily_plan.summary(db,learner)['progress']['explore']==0
        story=db.execute('SELECT id,updated_at FROM stories ORDER BY id LIMIT 1').fetchone()
        db.execute('''INSERT INTO story_readings(learner_id,story_id,story_version,next_page,completed_at)
            VALUES(?,?,?,1,NOW())''',(learner,story['id'],story['updated_at']))
        assert daily_plan.summary(db,learner)['progress']['story']==1
        assert daily_plan.summary(db,other)['progress']['story']==0
        assert daily_plan.summary(db,learner)['story']['id']!=story['id']
        assert daily_plan.summary(db,learner,3)['progress']['quiz']==3
        for model,action in [('bad','begin'),('solar',[]),('solar','bad')]:
            try:daily_plan.observe(db,learner,model,action)
            except ValueError:pass
            else:raise AssertionError('Invalid model accepted')
        try:daily_plan.change(db,learner,'bad')
        except ValueError:pass
        else:raise AssertionError('Invalid goal accepted')
        assert db.execute('SELECT points FROM profile WHERE id=?',(learner,)).fetchone()['points']==0
        assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?',(learner,)).fetchone()['n']==0
        report={'stable_daily_choice':True,'switching':True,'isolated_progress':True,'distinct_models':True,
                'minimum_observation_time':True,'daily_reset':True,'reading_progress':True,'extra_points':0,'test_writes':'rolled back'}
        (ROOT/'artifacts/daily-plans-verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report))
    finally:conn.rollback()
