"""Parent rewards: atomic balance/ledger/audit writes and retry-safe requests."""
import re


class PointsError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def grant_points(db, account, learner_id, values):
    if not account or account.get('account_type') != 'parent':
        raise PointsError('请先登录学习账号', 401)
    amount = values.get('amount')
    reason = values.get('reason')
    request_id = values.get('request_id')
    if type(amount) is not int or not 1 <= amount <= 1000000:
        raise PointsError('积分数量请填写 1 到 1000000 的整数')
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 200:
        raise PointsError('请填写 1 到 200 字的奖励原因')
    reason = reason.strip()
    if not isinstance(request_id, str) or not re.fullmatch(r'[a-f0-9]{32}', request_id):
        raise PointsError('提交标识无效，请刷新后重试')
    # The profile lock serializes retries and concurrent balance mutations.
    profile = db.execute('SELECT points FROM profile WHERE id=? AND account_id=? FOR UPDATE',
                         (learner_id, account['id'])).fetchone()
    if not profile:
        raise PointsError('该学习者不属于当前账号', 403)
    prior = db.execute('SELECT * FROM parent_point_grants WHERE actor_account_id=? AND request_id=?',
                       (account['id'], request_id)).fetchone()
    if prior:
        if prior['learner_id'] != learner_id or prior['amount'] != amount or prior['reason'] != reason:
            raise PointsError('此提交已记录，请重新填写奖励', 409)
        return {'ok': True, 'duplicate': True, 'points': int(profile['points']),
                'amount': amount, 'ledger_id': prior['ledger_id']}
    before = int(profile['points'])
    after = before + amount
    if after > 1000000:
        raise PointsError('积分余额不能超过 1000000')
    actor = account.get('display_name') or account['username']
    description = f'家长 {actor}：{reason}（余额 {before} → {after}）'
    db.execute('UPDATE profile SET points=? WHERE id=? AND account_id=?', (after, learner_id, account['id']))
    ledger = db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('家长奖励',?,?,?)",
                        (amount, description, learner_id))
    db.execute('''INSERT INTO parent_point_grants(actor_account_id,request_id,learner_id,
        amount,reason,balance_before,balance_after,actor_name,ledger_id) VALUES(?,?,?,?,?,?,?,?,?)''',
        (account['id'], request_id, learner_id, amount, reason, before, after, actor, ledger.lastrowid))
    db.execute('''INSERT INTO admin_audit_logs(actor_account_id,actor_name,action,target_type,target_id,detail)
        VALUES(?,?,'家长增加积分','learner',?,?)''',
        (account['id'], actor, str(learner_id), f'+{amount} 分；余额 {before} → {after}；原因：{reason}'))
    return {'ok': True, 'duplicate': False, 'points': after, 'amount': amount, 'ledger_id': ledger.lastrowid}


def ledger_page(db, learner_id, before=None):
    params = [learner_id]
    where = 'learner_id=?'
    if before is not None:
        try:
            before = int(before)
        except (ValueError, TypeError):
            raise PointsError('记录页码无效')
        if before < 1:
            raise PointsError('记录页码无效')
        where += ' AND id<?'
        params.append(before)
    rows = [dict(row) for row in db.execute(
        'SELECT id,kind,amount,description,created_at FROM ledger WHERE '+where+' ORDER BY id DESC LIMIT 21', params)]
    return {'items': rows[:20], 'next_cursor': rows[19]['id'] if len(rows) > 20 else None}
