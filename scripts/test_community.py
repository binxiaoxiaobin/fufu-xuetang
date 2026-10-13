"""Real HTTP/MySQL checks using disposable accounts; never create real payments."""
import concurrent.futures
import hashlib
import json
import os
import subprocess
import secrets
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import community
from mysql_learning_db import connect
from server import Handler


class TestHandler(Handler):
    def log_message(self, *args):
        pass


community.initialize()
server = ThreadingHTTPServer(('127.0.0.1', 0), TestHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = 'http://127.0.0.1:' + str(server.server_port)
accounts, tokens = [], {}
tag = secrets.token_hex(6)


def call(path, body=None, token=None, headers=None):
    cookie_name = 'fufu_admin_session' if path.startswith('/api/admin/') or '/api/auth/status?account_type=admin' in path else 'fufu_session'
    req = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', **({'Cookie': cookie_name + '=' + token} if token else {}), **(headers or {})})
    try:
        response = urllib.request.urlopen(req)
    except urllib.error.HTTPError as exc:
        response = exc
    data = response.read()
    return response.status, json.loads(data) if data else None


try:
    with connect() as db:
        encoded = Handler.password_hash('community-test-password')
        for i, role in enumerate(['parent', 'parent', 'superadmin', 'content_admin']):
            account_type = 'parent' if role == 'parent' else 'admin'
            account = db.execute('INSERT INTO user_accounts(username,password_hash,account_type,role) VALUES(?,?,?,?)', ('community-test-' + tag + '-' + str(i), encoded, account_type, role)).lastrowid
            accounts.append(account)
            token = secrets.token_urlsafe(32)
            tokens[role + str(i)] = token
            db.execute('INSERT INTO user_sessions(account_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))', (account, hashlib.sha256(token.encode()).hexdigest()))
    parent = tokens['parent0']; other = tokens['parent1']; admin = tokens['superadmin2']; editor = tokens['content_admin3']
    assert call('/api/community/overview')[0] == 200
    assert call('/api/community/board')[0] == 200
    assert call('/api/community/me')[0] == 401
    assert call('/api/admin/community/orders', token=parent)[0] == 401
    assert call('/api/admin/community/orders', token=editor)[0] == 403
    assert call('/api/admin/community/moderation', token=editor)[0] == 200
    both_sessions = {'Cookie': 'fufu_session=' + parent + '; fufu_admin_session=' + admin}
    assert call('/api/community/me', headers=both_sessions)[1]['profile']['nickname'].startswith('花园朋友')
    assert call('/api/admin/community/moderation', headers=both_sessions)[0] == 200
    assert call('/api/auth/status?account_type=admin', headers=both_sessions)[1]['account']['account_type'] == 'admin'
    assert call('/api/auth/status', headers=both_sessions)[1]['account']['account_type'] == 'parent'
    me = call('/api/community/me', token=parent)[1]
    assert me['profile']['nickname'].startswith('花园朋友')
    assert 'username' not in str(me)
    p = {'nickname': '测试花园' + tag, 'avatar': '🌷', 'listed': True, 'show_amount': False}
    assert call('/api/community/profile', {**p, 'nickname':'13912345678'}, parent)[0] == 400
    assert call('/api/community/profile', p, parent)[0] == 200
    assert call('/api/community/profile', p, other)[0] == 409
    assert call('/api/community/orders', {'tier':'candy','accepted':True}, parent, {'Origin':'https://evil.example'})[0] == 403
    assert call('/api/community/orders', {'tier':'candy','accepted':True}, parent, {'Content-Type':'text/plain'})[0] == 400
    assert call('/api/community/orders', {'tier':[], 'accepted':True}, parent)[0] == 400
    order = call('/api/community/orders', {'tier':'candy','accepted':True,'amount_fen':1,'status':'paid'}, parent)[1]
    assert order['amount_fen'] == 99 and order['status'] == 'pending'
    assert call('/api/community/orders', {'tier':'candy','accepted':True}, parent)[1]['id'] == order['id']
    assert not call('/api/community/me', token=parent)[1]['support']['active']
    summary = next(a for a in call('/api/admin/accounts', token=admin)[1] if a['id']==accounts[0])['support']
    assert summary['total_fen']==0 and summary['paid_count']==0
    payload = {'kind':'suggestion','title':'测试建议','body':'希望让学习内容更加清晰有趣。'}
    assert call('/api/community/posts', payload, parent)[0] == 403
    verify = {'provider':'wechat','receipt':tag+'-receipt','amount_fen':99}
    assert call('/api/admin/community/orders/'+order['id']+'/verify', {**verify,'amount_fen':1}, admin)[0] == 400
    assert call('/api/admin/community/orders/'+order['id']+'/verify', verify, editor)[0] == 403
    assert call('/api/admin/community/orders/'+order['id']+'/verify', verify, admin)[0] == 200
    assert call('/api/admin/community/orders/'+order['id']+'/verify', verify, admin)[1]['unchanged']
    assert call('/api/community/me', token=parent)[1]['support']['active']
    summary = next(a for a in call('/api/admin/accounts', token=admin)[1] if a['id']==accounts[0])['support']
    assert summary['total_fen']==99 and summary['received_fen']==99 and summary['refunded_fen']==0 and summary['paid_count']==1 and summary['active']
    other_order = call('/api/community/orders', {'tier':'candy','accepted':True}, other)[1]
    assert call('/api/admin/community/orders/'+other_order['id']+'/verify', verify, admin)[0] == 409
    board = call('/api/community/board')[1]['items']
    our = [r for r in board if r['nickname'] == p['nickname']][0]
    assert our['amount_fen'] is None
    assert 'account_id' not in json.dumps(board) and 'username' not in json.dumps(board)
    post = call('/api/community/posts', payload, parent)[1]['id']
    assert call('/api/community/posts/'+str(post))[0] == 404
    publish = {'moderation':'published','progress':'planned','team_reply':'谢谢建议，会继续评估。'}
    assert call('/api/admin/community/posts/'+str(post), publish, editor)[0] == 200
    detail = call('/api/community/posts/'+str(post))[1]
    assert detail['post']['author']['nickname'] == p['nickname'] and detail['post']['author']['supporter']
    assert 'account_id' not in json.dumps(detail) and 'username' not in json.dumps(detail)
    # Concurrent quota submissions can produce only two more posts this month.
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(lambda _: call('/api/community/posts', payload, parent)[0], range(6)))
    assert outcomes.count(200) == 2 and outcomes.count(429) == 4, outcomes
    assert call('/api/community/me', token=parent)[1]['post_remaining'] == 0
    comment = call('/api/community/posts/'+str(post)+'/comments', {'body':'支持这个想法'}, parent)[1]['id']
    assert not call('/api/community/posts/'+str(post))[1]['comments']
    assert call('/api/admin/community/comments/'+str(comment), {'moderation':'published'}, editor)[0] == 200
    assert call('/api/community/posts/'+str(post))[1]['comments'][0]['id'] == comment
    with connect() as db:
        db.execute('UPDATE community_comments SET created_at=DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY) WHERE id=?', (comment,))
    assert call('/api/community/me', token=parent)[1]['comment_remaining'] == 9
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        outcomes = list(pool.map(lambda _: call('/api/community/posts/'+str(post)+'/comments', {'body':'测试并发评论'}, parent)[0], range(12)))
    assert outcomes.count(200) == 9 and outcomes.count(429) == 3, outcomes
    assert call('/api/community/me', token=parent)[1]['comment_remaining'] == 0
    assert '本月' in call('/api/community/posts/'+str(post)+'/comments', {'body':'月额度已用完'}, parent)[1]['error']
    with connect() as db:
        db.execute('UPDATE community_comments SET created_at=DATE_SUB(DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY),INTERVAL 1 DAY) WHERE account_id=?', (accounts[0],))
    assert call('/api/community/me', token=parent)[1]['comment_remaining'] == 10
    assert call('/api/community/posts/'+str(post)+'/comments', {'body':'新月份可以继续评论'}, parent)[0] == 200
    assert call('/api/community/report', {'target_type':'post','target_id':post,'reason':'测试举报处理'}, other)[0] == 200
    reports = call('/api/admin/community/moderation', token=editor)[1]['reports']
    report = [r for r in reports if r['target_id'] == post][0]
    assert call('/api/admin/community/reports/'+str(report['id'])+'/resolve', {}, editor)[0] == 200
    assert call('/api/admin/community/accounts/'+str(accounts[0])+'/ban', {'banned':True}, editor)[0] == 200
    assert call('/api/community/posts', payload, parent)[0] == 403
    assert call('/api/admin/community/accounts/'+str(accounts[0])+'/ban', {'banned':False}, editor)[0] == 200
    assert call('/api/admin/community/orders/'+order['id']+'/refund', {'reason':'已完成测试退款','refund_confirmed':True}, admin)[0] == 200
    summary = next(a for a in call('/api/admin/accounts', token=admin)[1] if a['id']==accounts[0])['support']
    assert summary['total_fen']==0 and summary['received_fen']==99 and summary['refunded_fen']==99 and summary['paid_count']==0 and not summary['active']
    assert not call('/api/community/me', token=parent)[1]['support']['active']
    assert not call('/api/community/posts/'+str(post))[1]['post']['author']['supporter']
    assert call('/api/community/posts/'+str(post))[0] == 200  # Prior published posts survive refund.
    assert call('/api/admin/community/posts/'+str(post), {**publish,'moderation':'hidden'}, editor)[0] == 200
    assert call('/api/community/posts/'+str(post))[0] == 404
    assert call('/api/community/me', token=other)[1]['support']['total_fen'] == 0
    # Registration grants referral access without fabricating financial support.
    sharing_me = call('/api/community/me', token=other)[1]
    code = sharing_me['sharing']['code']
    assert len(code) == 12 and call('/api/community/me', token=other)[1]['sharing']['code'] == code
    registration = {'username': 'share-test-'+tag, 'password': 'sharing-test-password',
                    'child_name': 'Test learner', 'learning_stage': '小学', 'share_code': code}
    assert call('/api/auth/register', registration, other)[0] == 400
    assert call('/api/auth/register', {**registration, 'share_code': 'XXXXXXXXXXXX'})[0] == 400
    status, new = call('/api/auth/register', registration)
    assert status == 201, (status, new)
    accounts.append(new['account_id'])
    assert call('/api/auth/register', registration)[0] == 409
    shared_me = call('/api/community/me', token=other)[1]
    assert shared_me['sharing']['count'] == 1 and shared_me['participation']['active']
    assert not shared_me['support']['active'] and shared_me['support']['total_fen'] == 0
    assert shared_me['identity']['sharing_badge']['name'] == '共创分享者'
    shared_post = call('/api/community/posts', payload, other)[1]['id']
    assert call('/api/admin/community/posts/'+str(shared_post), publish, editor)[0] == 200
    author = call('/api/community/posts/'+str(shared_post))[1]['post']['author']
    assert author['sharing_badge'] and not author['supporter'] and 'code' not in author
    assert call('/api/community/posts/'+str(shared_post)+'/comments', {'body':'Sharing access comment'}, other)[0] == 200
    with connect() as db:
        db.execute("UPDATE user_accounts SET status='disabled' WHERE id=?", (new['account_id'],))
    assert not call('/api/community/me', token=other)[1]['participation']['active']
    with connect() as db:
        db.execute("UPDATE user_accounts SET status='active' WHERE id=?", (new['account_id'],))
        db.execute('UPDATE community_referrals SET expires_at=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE invited_account_id=?', (new['account_id'],))
    assert not call('/api/community/me', token=other)[1]['participation']['active']
    assert call('/api/community/posts', payload, other)[0] == 403
    assert call('/api/admin/community/accounts/'+str(accounts[1])+'/adjustments',
        {'kind':'donation','delta':250,'reason':'测试后台支持金额'}, admin)[0] == 200
    adjusted_me = call('/api/community/me', token=other)[1]
    assert adjusted_me['support']['total_fen'] == 250 and adjusted_me['support']['active']
    assert adjusted_me['participation']['active'] and adjusted_me['identity']['supporter']
    assert call('/api/community/profile', {'nickname':'调整支持'+tag,'avatar':adjusted_me['profile']['avatar'],
        'listed':True,'show_amount':False}, other)[0] == 200
    assert any(row['nickname']=='调整支持'+tag for row in call('/api/community/board')[1]['items'])
    adjusted_post = call('/api/community/posts', payload, other)
    assert adjusted_post[0] == 200
    assert call('/api/admin/community/posts/'+str(adjusted_post[1]['id']), publish, editor)[0] == 200
    assert call('/api/community/posts/'+str(adjusted_post[1]['id'])+'/comments', {'body':'支持这个想法'}, other)[0] == 200
    summary = next(a for a in call('/api/admin/accounts', token=admin)[1] if a['id']==accounts[1])
    assert summary['sharing']['count'] == 1 and summary['support']['total_fen'] == 250 and summary['support']['active']
    print('PASS: administrator support adjustments grant 365-day posting access and appear in opted-in rankings.')
    print('PASS: referral registration, atomic rollback, stable codes, shared access, badges, account disabling and expiry.')
    print('PASS: public privacy, pending payments, verified receipts, refunds, moderation, reports, concurrent quotas, role permissions.')
    # Top 100 and distinct podium badges, with fixture supports inserted only for disposable accounts.
    with connect() as db:
        for i in range(103):
            a = db.execute("INSERT INTO user_accounts(username,password_hash,account_type,role) VALUES(?,?,'parent','parent')", ('community-rank-'+tag+'-'+str(i), encoded)).lastrowid
            accounts.append(a)
            db.execute('INSERT INTO community_profiles(account_id,nickname,listed,show_amount) VALUES(?,?,1,1)', (a,'榜单测试'+tag+str(i)))
            db.execute("INSERT INTO community_orders(id,account_id,tier,amount_fen,status,paid_at,expires_at) VALUES(?,?,'cake',?,'paid',NOW(),DATE_ADD(NOW(),INTERVAL 365 DAY))", (secrets.token_hex(16),a,1000000+i))
    board = call('/api/community/board')[1]['items']
    assert len(board) == 100 and [r['rank'] for r in board] == list(range(1,101))
    assert [r['badge']['name'] for r in board[:3]] == ['糖果之冠','银糖之星','暖糖之星']
    assert board[99]['badge']['name'] == '百强共创者'
    print('PASS: podium badges, top 100 boundary and public amount consent.')
    if os.environ.get('FUFU_TEST_BROWSER') == '1':
        with connect() as db:
            # Reset ONLY disposable account quota dates to exercise browser submission.
            db.execute('UPDATE community_posts SET created_at=DATE_SUB(NOW(),INTERVAL 40 DAY) WHERE account_id=?', (accounts[0],))
            db.execute('UPDATE community_comments SET created_at=DATE_SUB(DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY),INTERVAL 1 DAY) WHERE account_id=?', (accounts[0],))
        env = {**os.environ, 'FUFU_TEST_ORIGIN': origin, 'FUFU_TEST_PARENT': parent, 'FUFU_TEST_ADMIN': admin, 'FUFU_TEST_TAG': tag}
        node = os.environ.get('FUFU_NODE', r'C:\Users\rybof\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
        subprocess.run([node, str(ROOT / 'scripts/test_community_browser.cjs')], env=env, check=True)
finally:
    server.shutdown(); server.server_close()
    with connect() as db:
        accounts.extend(r['id'] for r in db.execute('SELECT id FROM user_accounts WHERE username=?', ('share-browser-'+tag,)))
        for a in accounts:
            for learner in db.execute('SELECT id FROM profile WHERE account_id=?', (a,)).fetchall():
                db.execute('DELETE FROM owned_items WHERE learner_id=?', (learner['id'],))
                db.execute('DELETE FROM pet_state WHERE id=?', (learner['id'],))
                db.execute('DELETE FROM profile WHERE id=?', (learner['id'],))
            db.execute('DELETE FROM admin_audit_logs WHERE actor_account_id=?', (a,))
            db.execute('DELETE FROM user_sessions WHERE account_id=?', (a,))
            db.execute('DELETE FROM user_accounts WHERE id=?', (a,))
    print('Temporary community test accounts, orders and content removed.')
