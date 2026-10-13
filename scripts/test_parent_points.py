"""Exercise MySQL reward transactions using temporary rows; roll everything back."""
import getpass
import os
import sys
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
import pymysql
from mysql_db import _settings
from mysql_learning_db import Store
from parent_points import grant_points, ledger_page, PointsError

conn = pymysql.connect(**_settings())
db = Store(conn)
try:
    suffix = uuid.uuid4().hex[:12]
    actor_id = db.execute("INSERT INTO user_accounts(username,password_hash,account_type,role,display_name) VALUES(?,'test-unusable','parent','parent','测试家长')", ('points-test-'+suffix,)).lastrowid
    learner = db.execute("INSERT INTO profile(child_name,points,account_id) VALUES('临时验证',120,?)", (actor_id,)).lastrowid
    actor = {'id': actor_id, 'username': 'points-test-'+suffix, 'display_name': '测试家长', 'account_type': 'parent'}
    values = {'amount': 10, 'reason': '完成阅读计划', 'request_id': uuid.uuid4().hex}
    first = grant_points(db, actor, learner, values)
    assert first['points'] == 130 and not first['duplicate']
    assert grant_points(db, actor, learner, values)['duplicate']
    assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?', (learner,)).fetchone()['n'] == 1
    audit = db.execute('SELECT * FROM admin_audit_logs WHERE actor_account_id=?', (actor_id,)).fetchone()
    assert audit['action'] == '家长增加积分' and '120 → 130' in audit['detail']
    log = db.execute('SELECT * FROM parent_point_grants WHERE learner_id=?', (learner,)).fetchone()
    assert log['balance_before'] == 120 and log['balance_after'] == 130 and log['actor_name'] == '测试家长'
    assert log['reason'] == values['reason'] and log['ledger_id'] == first['ledger_id']
    for changes in [{'amount': True}, {'amount': 0}, {'amount': 1.5}, {'amount': 1000001}, {'reason': ' '}, {'reason': '字'*201}, {'request_id': 'bad'}, {'amount': 999999}]:
        try:
            grant_points(db, actor, learner, {**values, **changes, 'request_id': changes.get('request_id', uuid.uuid4().hex)})
            raise AssertionError('invalid reward accepted')
        except PointsError:
            pass
    for wrong_actor in [{**actor, 'id': actor_id+1000000}, {**actor, 'account_type': 'admin'}]:
        try:
            grant_points(db, wrong_actor, learner, values)
            raise AssertionError('unauthorized reward accepted')
        except PointsError:
            pass
    try:
        grant_points(db, actor, learner, {**values, 'reason': '改变原因'})
        raise AssertionError('reused request accepted with different details')
    except PointsError as exc:
        assert exc.status == 409
    # Fail the last audit write and prove balance, ledger and request are all reversible together.
    db.execute('SAVEPOINT reward_failure')
    class FailingAudit:
        def execute(self, sql, params=()):
            if 'INSERT INTO admin_audit_logs' in sql:
                raise RuntimeError('simulated audit failure')
            return db.execute(sql, params)
    try:
        grant_points(FailingAudit(), actor, learner, {**values, 'request_id': uuid.uuid4().hex})
        raise AssertionError('audit failure was ignored')
    except RuntimeError:
        db.execute('ROLLBACK TO SAVEPOINT reward_failure')
    assert db.execute('SELECT points FROM profile WHERE id=?', (learner,)).fetchone()['points'] == 130
    assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?', (learner,)).fetchone()['n'] == 1
    for i in range(25):
        db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('测试',1,?,?)", (str(i),learner))
    first_page = ledger_page(db, learner)
    second_page = ledger_page(db, learner, first_page['next_cursor'])
    assert len(first_page['items']) == 20 and len(second_page['items']) == 6 and second_page['next_cursor'] is None
    assert len({row['id'] for row in first_page['items']+second_page['items']}) == 26
    print('PASS: MySQL balance/ledger/audit, deduplication, validation, account ownership, transaction rollback and history pagination. Temporary data rolled back.')
finally:
    conn.rollback()
    conn.close()
