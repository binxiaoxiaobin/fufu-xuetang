"""Public community with private account identities and verified support records.

No payment provider is connected yet. Pending orders never grant entitlements.
Manual payment verification is restricted to local superadministrators and audited.
"""
import datetime
import logging
import re
import secrets
from pymysql.err import IntegrityError
from urllib.parse import parse_qs, urlparse

from mysql_learning_db import connect

TIERS = {'candy': (99, '请团团吃颗糖吧'), 'cake': (990, '请糖糖吃块蛋糕吧')}
AVATARS = ['🌷', '🍀', '🐱', '🐼', '🌻', '🦊', '🐳', '🍓']
BADGES = {1: ('👑', '糖果之冠'), 2: ('🥈', '银糖之星'), 3: ('🥉', '暖糖之星')}
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS community_profiles (
    account_id BIGINT NOT NULL PRIMARY KEY, nickname VARCHAR(24) NOT NULL,
    avatar VARCHAR(16) NOT NULL DEFAULT '🌷', listed TINYINT NOT NULL DEFAULT 0,
    show_amount TINYINT NOT NULL DEFAULT 0, banned TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_community_nickname(nickname),
    FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS community_orders (
    id CHAR(32) NOT NULL PRIMARY KEY, account_id BIGINT NOT NULL, tier VARCHAR(16) NOT NULL,
    amount_fen INT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
    provider VARCHAR(16) NULL, receipt VARCHAR(120) NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at DATETIME NULL,
    expires_at DATETIME NULL, refunded_at DATETIME NULL,
    INDEX idx_community_orders_account(account_id,status,paid_at),
    FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS community_admin_adjustments (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, account_id BIGINT NOT NULL,
    kind VARCHAR(16) NOT NULL, delta BIGINT NOT NULL, expires_at DATETIME NULL,
    reason VARCHAR(300) NOT NULL, actor_account_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_community_adjustment_account(account_id,kind,created_at),
    FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_account_id) REFERENCES user_accounts(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS community_posts (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, account_id BIGINT NOT NULL,
    kind VARCHAR(16) NOT NULL, title VARCHAR(80) NOT NULL, body TEXT NOT NULL,
    moderation VARCHAR(16) NOT NULL DEFAULT 'pending', progress VARCHAR(16) NOT NULL DEFAULT 'review',
    team_reply VARCHAR(2000) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_community_posts_public(moderation,id), INDEX idx_community_posts_quota(account_id,created_at),
    FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS community_comments (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, post_id BIGINT NOT NULL, account_id BIGINT NOT NULL,
    body VARCHAR(1000) NOT NULL, moderation VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_community_comments_post(post_id,moderation,id), INDEX idx_community_comments_quota(account_id,created_at),
    FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS community_reports (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, account_id BIGINT NOT NULL,
    target_type VARCHAR(16) NOT NULL, target_id BIGINT NOT NULL, reason VARCHAR(300) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_community_report(account_id,target_type,target_id),
    FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
]


class CommunityError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def as_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime.combine(value, datetime.time.min)
    try:
        return datetime.datetime.strptime(str(value)[:19], '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def initialize():
    with connect() as db:
        for sql in SCHEMA:
            db.execute(sql)
        db.execute("""CREATE TABLE IF NOT EXISTS community_share_codes (
            account_id BIGINT PRIMARY KEY, code CHAR(12) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        db.execute("""CREATE TABLE IF NOT EXISTS community_referrals (
            invited_account_id BIGINT PRIMARY KEY, inviter_account_id BIGINT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            INDEX idx_referral_inviter(inviter_account_id,expires_at),
            FOREIGN KEY(invited_account_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
            FOREIGN KEY(inviter_account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")


def share_code(db, account_id):
    db.execute('INSERT IGNORE INTO community_share_codes(account_id,code) VALUES(?,?)',
               (account_id, secrets.token_hex(6).upper()))
    row = db.execute('SELECT code FROM community_share_codes WHERE account_id=?', (account_id,)).fetchone()
    if not row:  # An unlikely random collision can safely retry.
        return share_code(db, account_id)
    return row['code']


def referral_inviter(db, code):
    if code in (None, ''):
        return None
    if not isinstance(code, str) or not re.fullmatch(r'[A-Fa-f0-9]{12}', code.strip()):
        raise ValueError('分享码无效，请检查或清空分享码后注册')
    row = db.execute("""SELECT c.account_id FROM community_share_codes c
        JOIN user_accounts a ON a.id=c.account_id
        JOIN community_profiles p ON p.account_id=c.account_id
        WHERE c.code=? AND a.account_type='parent' AND a.status='active' AND p.banned=0""",
        (code.strip().upper(),)).fetchone()
    if not row:
        raise ValueError('分享码不存在或邀请人的分享资格已暂停')
    return row['account_id']


def register_referral(db, account_id, inviter):
    profile(db, account_id)
    share_code(db, account_id)
    if inviter is not None and inviter != account_id:
        db.execute('''INSERT INTO community_referrals(invited_account_id,inviter_account_id,expires_at)
            VALUES(?,?,DATE_ADD(NOW(),INTERVAL 365 DAY))''', (account_id, inviter))


def sharing(db, account_id):
    referrals = db.execute("""SELECT COUNT(*) AS count,MAX(r.expires_at) AS expires
        FROM community_referrals r JOIN user_accounts a ON a.id=r.invited_account_id AND a.status='active'
        WHERE r.inviter_account_id=?""", (account_id,)).fetchone()
    edits = db.execute("""SELECT COALESCE(SUM(delta),0) AS delta,
        MAX(CASE WHEN delta>0 THEN expires_at END) AS expires FROM community_admin_adjustments
        WHERE account_id=? AND kind='sharing'""", (account_id,)).fetchone()
    count = max(0, int(referrals['count']) + int(edits['delta']))
    dates = [as_datetime(value) for value in (referrals['expires'], edits['expires']) if value]
    dates = [value for value in dates if value]
    expires = max(dates) if dates else None
    return {'count': count, 'active': count > 0 and bool(expires) and expires > datetime.datetime.now(),
            'expires_at': str(expires) if expires else None}


def participation(state, shared, banned=False):
    dates = [s['expires_at'] for s in (state, shared) if s['active']]
    return {'active': bool(dates) and not banned, 'expires_at': max(dates) if dates else None}


def admin_account_sharing(db):
    rows = db.execute("""SELECT r.inviter_account_id AS account_id,COUNT(*) AS count,
        MAX(r.expires_at) AS expires_at,MAX(r.expires_at)>NOW() AS active
        FROM community_referrals r JOIN user_accounts a ON a.id=r.invited_account_id AND a.status='active'
        GROUP BY r.inviter_account_id""").fetchall()
    result = {r['account_id']: {'count': int(r['count']), 'active': bool(r['active']),
        'expires_at': str(r['expires_at']) if r['expires_at'] else None} for r in rows}
    edits = db.execute("""SELECT account_id,SUM(delta) AS delta,
        MAX(CASE WHEN delta>0 THEN expires_at END) AS expires_at
        FROM community_admin_adjustments WHERE kind='sharing' GROUP BY account_id""").fetchall()
    for edit in edits:
        summary = result.setdefault(edit['account_id'], {'count': 0, 'active': False, 'expires_at': None})
        summary['count'] = max(0, summary['count'] + int(edit['delta']))
        if edit['expires_at']:
            summary['expires_at'] = max([d for d in (summary['expires_at'], str(edit['expires_at'])) if d])
    for summary in result.values():
        summary['active'] = summary['count'] > 0 and bool(summary['expires_at']) and summary['expires_at'] > str(datetime.datetime.now())
    return result


def text(values, key, minimum, maximum):
    value = values.get(key)
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise CommunityError('请检查输入长度：%s' % key)
    value = value.strip()
    if re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', value):
        raise CommunityError('内容包含不支持的字符')
    return value


def profile(db, account_id):
    row = db.execute('SELECT nickname,avatar,listed,show_amount,banned FROM community_profiles WHERE account_id=?', (account_id,)).fetchone()
    if not row:
        # Never derive a public identity from phone, account display name or child name.
        name = '花园朋友' + secrets.token_hex(5)
        db.execute('INSERT IGNORE INTO community_profiles(account_id,nickname) VALUES(?,?)', (account_id, name))
        row = db.execute('SELECT nickname,avatar,listed,show_amount,banned FROM community_profiles WHERE account_id=?', (account_id,)).fetchone()
    return dict(row)


def support(db, account_id):
    row = db.execute("""SELECT
        COALESCE((SELECT SUM(amount_fen) FROM community_orders WHERE account_id=? AND status='paid'),0) AS paid_total,
        (SELECT MAX(expires_at) FROM community_orders WHERE account_id=? AND status='paid') AS paid_expires,
        COALESCE((SELECT SUM(delta) FROM community_admin_adjustments WHERE account_id=? AND kind='donation'),0) AS adjustment_total,
        (SELECT MAX(CASE WHEN delta>0 THEN COALESCE(expires_at,DATE_ADD(created_at,INTERVAL 365 DAY)) END)
            FROM community_admin_adjustments WHERE account_id=? AND kind='donation') AS adjustment_expires""",
        (account_id, account_id, account_id, account_id)).fetchone()
    total = max(0, int(row['paid_total']) + int(row['adjustment_total']))
    expiries = [as_datetime(value) for value in (row['paid_expires'], row['adjustment_expires']) if value]
    expiries = [value for value in expiries if value]
    expires = max(expiries) if expiries else None
    return {'total_fen': total, 'expires_at': str(expires) if expires else None,
            'active': total > 0 and bool(expires) and expires > datetime.datetime.now()}


def admin_account_support(db):
    """Batch summaries from order history; amounts remain integer fen."""
    rows = db.execute("""SELECT p.account_id,p.nickname,p.banned,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','refunded') THEN o.amount_fen ELSE 0 END),0) AS received_fen,
        COALESCE(SUM(CASE WHEN o.status='refunded' THEN o.amount_fen ELSE 0 END),0) AS refunded_fen,
        COALESCE(SUM(CASE WHEN o.status='paid' THEN o.amount_fen ELSE 0 END),0) AS total_fen,
        SUM(CASE WHEN o.status='paid' THEN 1 ELSE 0 END) AS paid_count,
        MAX(o.paid_at) AS last_paid_at,
        MAX(CASE WHEN o.status='paid' THEN o.expires_at END) AS expires_at,
        COALESCE(MAX(adj.delta),0) AS adjustment_fen,MAX(adj.expires_at) AS adjustment_expires_at
        FROM community_profiles p LEFT JOIN community_orders o ON o.account_id=p.account_id
        LEFT JOIN (SELECT account_id,SUM(delta) AS delta,
                MAX(CASE WHEN delta>0 THEN COALESCE(expires_at,DATE_ADD(created_at,INTERVAL 365 DAY)) END) AS expires_at
            FROM community_admin_adjustments
            WHERE kind='donation' GROUP BY account_id) adj ON adj.account_id=p.account_id
        GROUP BY p.account_id,p.nickname,p.banned""").fetchall()
    result = {}
    for row in rows:
        value = dict(row)
        account_id = value.pop('account_id')
        value['adjustment_fen'] = int(value['adjustment_fen'])
        value['total_fen'] = max(0, int(value['total_fen']) + value['adjustment_fen'])
        for field in ('received_fen', 'refunded_fen', 'paid_count'):
            value[field] = int(value[field])
        adjustment_expiry = value.pop('adjustment_expires_at')
        expiries = [as_datetime(expiry) for expiry in (value['expires_at'], adjustment_expiry) if expiry]
        expiries = [expiry for expiry in expiries if expiry]
        value['expires_at'] = str(max(expiries)) if expiries else None
        value['active'] = value['total_fen'] > 0 and (any(expiry and expiry > datetime.datetime.now() for expiry in expiries)) and not value['banned']
        result[account_id] = value
    return result


def rankings(db):
    return [dict(row) for row in db.execute("""SELECT p.account_id,p.nickname,p.avatar,p.show_amount,
        GREATEST(0,COALESCE(o.total_fen,0)+COALESCE(adj.delta,0)) AS total_fen, o.last_paid AS first_paid
        FROM community_profiles p JOIN user_accounts a ON a.id=p.account_id
        LEFT JOIN (SELECT account_id,SUM(amount_fen) AS total_fen,MAX(paid_at) AS last_paid
            FROM community_orders WHERE status='paid' GROUP BY account_id) o ON o.account_id=p.account_id
        LEFT JOIN (SELECT account_id,SUM(delta) AS delta FROM community_admin_adjustments
            WHERE kind='donation' GROUP BY account_id) adj ON adj.account_id=p.account_id
        WHERE p.listed=1 AND p.banned=0 AND a.status='active'
        HAVING total_fen>0
        ORDER BY total_fen DESC,o.last_paid,p.account_id LIMIT 100""")]


def rank_map(db):
    return {row['account_id']: i + 1 for i, row in enumerate(rankings(db))}


def identity(db, account_id, ranks):
    row = db.execute('SELECT p.nickname,p.avatar,p.banned,a.status FROM community_profiles p JOIN user_accounts a ON a.id=p.account_id WHERE p.account_id=?', (account_id,)).fetchone()
    if not row or row['status'] != 'active' or row['banned']:
        return {'nickname': '社区朋友', 'avatar': '🌷', 'supporter': False, 'badge': None}
    supported = support(db, account_id)['total_fen'] > 0
    shared = sharing(db, account_id)['count'] > 0
    rank = ranks.get(account_id)
    icon, name = BADGES.get(rank, ('✦', '百强共创者') if rank else ('🍬', '暖心支持者'))
    return {'nickname': row['nickname'], 'avatar': row['avatar'], 'supporter': supported,
            'badge': {'icon': icon, 'name': name, 'rank': rank} if supported else None,
            'sharing_badge': {'icon': '🌱', 'name': '共创分享者'} if shared else None}


def public_post(db, row, ranks):
    result = {key: row[key] for key in ['id', 'kind', 'title', 'body', 'progress', 'team_reply', 'created_at']}
    result['author'] = identity(db, row['account_id'], ranks)
    result['comment_count'] = db.execute("SELECT COUNT(*) AS n FROM community_comments WHERE post_id=? AND moderation='published'", (row['id'],)).fetchone()['n']
    return result


def integer(query, key, default, minimum=0, maximum=10**15):
    try:
        value = int(query.get(key, [default])[0])
    except (ValueError, TypeError):
        raise CommunityError('分页参数无效')
    if not minimum <= value <= maximum:
        raise CommunityError('分页参数无效')
    return value


def verify_order(db, order_id, values):
    row = db.execute('SELECT * FROM community_orders WHERE id=? FOR UPDATE', (order_id,)).fetchone()
    if not row:
        raise CommunityError('订单不存在', 404)
    receipt = text(values, 'receipt', 6, 100)
    provider = values.get('provider')
    if provider not in {'wechat', 'alipay', 'bank'} or type(values.get('amount_fen')) is not int or values['amount_fen'] != row['amount_fen']:
        raise CommunityError('收款方式或实收金额与订单不一致')
    receipt = provider + ':' + receipt
    if row['status'] == 'paid' and row['receipt'] == receipt:
        return {'ok': True, 'unchanged': True}
    if row['status'] != 'pending':
        raise CommunityError('只有待支付订单可以确认到账', 409)
    if db.execute('SELECT 1 FROM community_orders WHERE receipt=?', (receipt,)).fetchone():
        raise CommunityError('这笔收款已经关联其他订单', 409)
    try:
        db.execute("UPDATE community_orders SET status='paid',provider=?,receipt=?,paid_at=NOW(),expires_at=DATE_ADD(NOW(),INTERVAL 365 DAY) WHERE id=?", (provider, receipt, order_id))
    except IntegrityError:
        raise CommunityError('这笔收款已经关联其他订单', 409)
    return {'ok': True}


class CommunityRoutes:
    def community_api(self, method, path, body=None):
        if not path.startswith('/api/community/') and not path.startswith('/api/admin/community/'):
            return False
        try:
            if method == 'POST':
                origin = self.headers.get('Origin')
                if origin and urlparse(origin).netloc.lower() != self.headers.get('Host', '').lower():
                    raise CommunityError('请从本站页面提交', 403)
                if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                    raise CommunityError('请从本站页面提交', 403)
                if 'application/json' not in self.headers.get('Content-Type', '') or not isinstance(body, dict):
                    raise CommunityError('提交内容无效')
            with connect() as db:
                # Session lookup precedes the account lock. READ COMMITTED prevents
                # that lookup from pinning an old quota snapshot while we wait.
                db.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
                query = parse_qs(urlparse(self.path).query)
                account = self.session_account(db)
                admin = path.startswith('/api/admin/')
                if admin:
                    roles = {'superadmin'} if '/orders' in path or '/adjustments' in path else {'superadmin', 'content_admin'}
                    account = self.require_admin(db, write=method == 'POST', roles=roles)
                    if not account:
                        return True
                    result = self.community_admin(db, account, method, path, body)
                else:
                    result = self.community_request(db, account, method, path, body, query)
            self.send_json(result)
        except CommunityError as exc:
            self.send_json({'error': str(exc)}, exc.status)
        except Exception:
            logging.exception('Community operation failed')
            self.send_json({'error': '操作暂未完成，请稍后重试'}, 503)
        return True

    def community_request(self, db, account, method, path, body, query):
        if method == 'GET' and path == '/api/community/overview':
            totals = db.execute("""SELECT COUNT(*) AS supporters,COALESCE(SUM(entries),0) AS supports FROM (
                SELECT account_id,SUM(amount_fen) AS total_fen,COUNT(*) AS entries FROM (
                    SELECT account_id,amount_fen FROM community_orders WHERE status='paid'
                    UNION ALL
                    SELECT account_id,delta AS amount_fen FROM community_admin_adjustments WHERE kind='donation'
                ) contributions GROUP BY account_id HAVING total_fen>0
            ) totals""").fetchone()
            posts = db.execute("SELECT COUNT(*) AS posts FROM community_posts WHERE moderation='published'").fetchone()
            return {**totals, **posts, 'payment_ready': False, 'tiers': [{'id': k, 'amount_fen': v[0], 'label': v[1]} for k, v in TIERS.items()]}
        if method == 'GET' and path == '/api/community/board':
            return {'items': [{'rank': i + 1, 'nickname': row['nickname'], 'avatar': row['avatar'],
                'amount_fen': int(row['total_fen']) if row['show_amount'] else None,
                'badge': {'icon': BADGES.get(i + 1, ('✦', '百强共创者'))[0], 'name': BADGES.get(i + 1, ('✦', '百强共创者'))[1]}}
                for i, row in enumerate(rankings(db))]}
        if method == 'GET' and path == '/api/community/posts':
            before = integer(query, 'before', 10**15)
            kind = query.get('kind', ['all'])[0]
            if kind not in {'all', 'suggestion', 'sharing'}:
                raise CommunityError('分类无效')
            rows = list(db.execute("SELECT * FROM community_posts WHERE moderation='published' AND id<? AND (?='all' OR kind=?) ORDER BY id DESC LIMIT 21", (before, kind, kind)))
            ranks = rank_map(db)
            return {'items': [public_post(db, r, ranks) for r in rows[:20]], 'next': rows[19]['id'] if len(rows) > 20 else None}
        match = re.fullmatch(r'/api/community/posts/(\d+)', path)
        if method == 'GET' and match:
            row = db.execute("SELECT * FROM community_posts WHERE id=? AND moderation='published'", (int(match[1]),)).fetchone()
            if not row:
                raise CommunityError('内容不存在或尚未公开', 404)
            ranks = rank_map(db)
            before = integer(query, 'before', 10**15)
            comments = list(db.execute("SELECT * FROM community_comments WHERE post_id=? AND moderation='published' AND id<? ORDER BY id DESC LIMIT 21", (row['id'], before)))
            return {'post': public_post(db, row, ranks), 'comments': [{**{k: r[k] for k in ['id', 'body', 'created_at']}, 'author': identity(db, r['account_id'], ranks)} for r in comments[:20]], 'next': comments[19]['id'] if len(comments) > 20 else None}
        if not account or account['account_type'] != 'parent':
            raise CommunityError('请先使用家长学习账号登录', 401)
        account_id = account['id']
        if method == 'POST':
            # One account lock serializes submissions and quota checks across tabs.
            db.execute('SELECT id FROM user_accounts WHERE id=? FOR UPDATE', (account_id,)).fetchone()
        me = profile(db, account_id)
        state = support(db, account_id)
        shared = sharing(db, account_id)
        access = participation(state, shared, me['banned'])
        if method == 'GET' and path == '/api/community/me':
            post_used = db.execute("SELECT COUNT(*) AS n FROM community_posts WHERE account_id=? AND created_at>=DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY)", (account_id,)).fetchone()['n']
            comment_used = db.execute('SELECT COUNT(*) AS n FROM community_comments WHERE account_id=? AND created_at>=DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY)', (account_id,)).fetchone()['n']
            own = [dict(r) for r in db.execute('SELECT id,kind,title,moderation,created_at FROM community_posts WHERE account_id=? ORDER BY id DESC LIMIT 20', (account_id,))]
            return {'profile': me, 'support': state, 'sharing': {**shared, 'code': share_code(db, account_id)},
                    'participation': access, 'identity': identity(db, account_id, rank_map(db)),
                    'post_remaining': max(0, 3-post_used), 'comment_remaining': max(0, 10-comment_used), 'posts': own, 'avatars': AVATARS}
        if method == 'POST' and path == '/api/community/profile':
            name = text(body, 'nickname', 2, 24)
            if re.search(r'\d{7,}', name) or '@' in name or not re.fullmatch(r'[\w\u4e00-\u9fff ·-]+', name):
                raise CommunityError('昵称请使用文字、短数字或空格，不要填写手机号、邮箱')
            if body.get('avatar') not in AVATARS or type(body.get('listed')) is not bool or type(body.get('show_amount')) is not bool:
                raise CommunityError('请检查头像和公开设置')
            if db.execute('SELECT 1 FROM community_profiles WHERE nickname=? AND account_id<>?', (name, account_id)).fetchone():
                raise CommunityError('这个昵称已被使用，请换一个', 409)
            try:
                db.execute('UPDATE community_profiles SET nickname=?,avatar=?,listed=?,show_amount=? WHERE account_id=?', (name, body['avatar'], body['listed'], body['show_amount'], account_id))
            except IntegrityError:
                raise CommunityError('这个昵称已被使用，请换一个', 409)
            return {'ok': True}
        if method == 'GET' and path == '/api/community/orders':
            return {'items': [dict(r) for r in db.execute('SELECT id,tier,amount_fen,status,created_at,paid_at,expires_at FROM community_orders WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 30', (account_id,))], 'payment_ready': False}
        if method == 'POST' and path == '/api/community/orders':
            tier = body.get('tier')
            if not isinstance(tier, str) or tier not in TIERS or body.get('accepted') is not True:
                raise CommunityError('请选择支持档位并阅读支持说明')
            pending = db.execute("SELECT id,amount_fen,status FROM community_orders WHERE account_id=? AND tier=? AND status='pending' ORDER BY created_at DESC LIMIT 1", (account_id, tier)).fetchone()
            if pending:
                return {**pending, 'payment_ready': False}
            order_id = secrets.token_hex(16)
            db.execute('INSERT INTO community_orders(id,account_id,tier,amount_fen) VALUES(?,?,?,?)', (order_id, account_id, tier, TIERS[tier][0]))
            return {'id': order_id, 'amount_fen': TIERS[tier][0], 'status': 'pending', 'payment_ready': False}
        match = re.fullmatch(r'/api/community/orders/([a-f0-9]{32})/cancel', path)
        if method == 'POST' and match:
            db.execute("UPDATE community_orders SET status='cancelled' WHERE id=? AND account_id=? AND status='pending'", (match[1], account_id))
            return {'ok': True}
        if method == 'POST' and path == '/api/community/report':
            kind = body.get('target_type'); target = body.get('target_id')
            if kind not in {'post', 'comment'} or type(target) is not int:
                raise CommunityError('举报对象无效')
            table = 'community_posts' if kind == 'post' else 'community_comments'
            if not db.execute("SELECT 1 FROM " + table + " WHERE id=? AND moderation='published'", (target,)).fetchone():
                raise CommunityError('内容不存在', 404)
            reason = text(body, 'reason', 2, 300)
            used = db.execute('SELECT COUNT(*) AS n FROM community_reports WHERE account_id=? AND created_at>=CURDATE()', (account_id,)).fetchone()['n']
            if used >= 10:
                raise CommunityError('今日举报已达上限，请稍后再试', 429)
            db.execute('INSERT INTO community_reports(account_id,target_type,target_id,reason) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason),status=\'open\'', (account_id, kind, target, reason))
            return {'ok': True}
        if me['banned']:
            raise CommunityError('当前账号的社区发言已暂停，请联系管理员', 403)
        if not access['active']:
            raise CommunityError('支持到账或邀请一位新用户注册后可参与发言，资格有效期为 365 天', 403)
        if method == 'POST' and path == '/api/community/posts':
            kind = body.get('kind')
            if kind not in {'suggestion', 'sharing'}:
                raise CommunityError('请选择建议或分享')
            title = text(body, 'title', 2, 80); content = text(body, 'body', 10, 4000)
            used = db.execute("SELECT COUNT(*) AS n FROM community_posts WHERE account_id=? AND created_at>=DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY)", (account_id,)).fetchone()['n']
            if used >= 3:
                raise CommunityError('本月已发表 3 篇，下个月再来分享吧', 429)
            row = db.execute('INSERT INTO community_posts(account_id,kind,title,body) VALUES(?,?,?,?)', (account_id, kind, title, content))
            return {'id': row.lastrowid, 'moderation': 'pending'}
        match = re.fullmatch(r'/api/community/posts/(\d+)/comments', path)
        if method == 'POST' and match:
            post_id = int(match[1]); content = text(body, 'body', 2, 1000)
            if not db.execute("SELECT 1 FROM community_posts WHERE id=? AND moderation='published'", (post_id,)).fetchone():
                raise CommunityError('帖子不存在或尚未公开', 404)
            used = db.execute('SELECT COUNT(*) AS n FROM community_comments WHERE account_id=? AND created_at>=DATE_SUB(CURDATE(),INTERVAL (DAYOFMONTH(CURDATE())-1) DAY)', (account_id,)).fetchone()['n']
            if used >= 10:
                raise CommunityError('本月已发表 10 条评论，下个月再来吧', 429)
            row = db.execute('INSERT INTO community_comments(post_id,account_id,body) VALUES(?,?,?)', (post_id, account_id, content))
            return {'id': row.lastrowid, 'moderation': 'pending'}
        raise CommunityError('接口不存在', 404)

    def community_admin(self, db, account, method, path, body):
        query = parse_qs(urlparse(self.path).query)
        page = integer(query, 'page', 0, maximum=100000)
        offset = page * 50
        adjustment_match = re.fullmatch(r'/api/admin/community/accounts/(\d+)/adjustments', path)
        if adjustment_match:
            account_id = int(adjustment_match[1])
            target = db.execute("SELECT id,account_type FROM user_accounts WHERE id=? FOR UPDATE", (account_id,)).fetchone()
            if not target or target['account_type'] != 'parent':
                raise CommunityError('家长账号不存在', 404)
            if method == 'GET':
                return {'items': [dict(row) for row in db.execute("""SELECT x.id,x.kind,x.delta,x.expires_at,x.reason,x.created_at,a.display_name AS actor
                    FROM community_admin_adjustments x JOIN user_accounts a ON a.id=x.actor_account_id
                    WHERE x.account_id=? ORDER BY x.id DESC LIMIT 50""", (account_id,))]}
            if method != 'POST':
                raise CommunityError('仅支持查看和提交调整', 405)
            kind = body.get('kind')
            if kind not in {'donation', 'sharing'}:
                raise CommunityError('请选择金额或邀请人数调整')
            try:
                delta = int(body.get('delta'))
            except (ValueError, TypeError):
                raise CommunityError('调整值必须为整数')
            reason = text(body, 'reason', 2, 300)
            if delta == 0 or abs(delta) > (1000000 if kind == 'donation' else 100):
                raise CommunityError('调整金额或人数超出范围')
            if kind == 'donation':
                summary = admin_account_support(db).get(account_id, {'total_fen': 0})
                if summary['total_fen'] + delta < 0:
                    raise CommunityError('扣减金额超过当前有效支持金额')
                expires_at = datetime.datetime.now() + datetime.timedelta(days=365) if delta > 0 else None
            else:
                summary = sharing(db, account_id)
                if summary['count'] + delta < 0:
                    raise CommunityError('扣减人数超过当前有效邀请人数')
                expires_at = datetime.datetime.now() + datetime.timedelta(days=365) if delta > 0 else None
            db.execute('INSERT INTO community_admin_adjustments(account_id,kind,delta,expires_at,reason,actor_account_id) VALUES(?,?,?,?,?,?)',
                       (account_id, kind, delta, expires_at, reason, account['id']))
            self.audit_admin_action(db, account, '共创数据调整', 'community_account', account_id,
                                    '%s %s%d；原因：%s' % ('捐赠金额' if kind == 'donation' else '分享人数', '+' if delta > 0 else '', delta, reason))
            return {'ok': True}
        if method == 'GET' and path == '/api/admin/community/orders':
            rows = [dict(r) for r in db.execute('SELECT o.*,p.nickname FROM community_orders o LEFT JOIN community_profiles p ON p.account_id=o.account_id ORDER BY o.created_at DESC,o.id DESC LIMIT 51 OFFSET ?', (offset,))]
            return {'items': rows[:50], 'more': len(rows)>50}
        match = re.fullmatch(r'/api/admin/community/orders/([a-f0-9]{32})/(verify|refund|cancel)', path)
        if method == 'POST' and match:
            if match[2] == 'verify':
                result = verify_order(db, match[1], body)
            else:
                row = db.execute('SELECT status FROM community_orders WHERE id=? FOR UPDATE', (match[1],)).fetchone()
                expected = 'paid' if match[2] == 'refund' else 'pending'
                if not row or row['status'] != expected:
                    raise CommunityError('订单状态不允许此操作', 409)
                reason = text(body, 'reason', 2, 300)
                if match[2] == 'refund':
                    if body.get('refund_confirmed') is not True:
                        raise CommunityError('请先在实际收款渠道退款，再登记')
                    db.execute("UPDATE community_orders SET status='refunded',refunded_at=NOW() WHERE id=?", (match[1],))
                else:
                    db.execute("UPDATE community_orders SET status='cancelled' WHERE id=?", (match[1],))
                result = {'ok': True}
            self.audit_admin_action(db, account, '社区收款/' + match[2], 'community_order', match[1], str(body))
            return result
        if method == 'GET' and path == '/api/admin/community/moderation':
            rows = {
                'posts': [dict(r) for r in db.execute('SELECT x.*,p.nickname FROM community_posts x JOIN community_profiles p ON p.account_id=x.account_id ORDER BY x.id DESC LIMIT 51 OFFSET ?', (offset,))],
                'comments': [dict(r) for r in db.execute('SELECT x.*,p.nickname FROM community_comments x JOIN community_profiles p ON p.account_id=x.account_id ORDER BY x.id DESC LIMIT 51 OFFSET ?', (offset,))],
                'reports': [dict(r) for r in db.execute("SELECT * FROM community_reports WHERE status='open' ORDER BY id DESC LIMIT 51 OFFSET ?", (offset,))]}
            return {**{key: value[:50] for key, value in rows.items()}, 'more': any(len(value)>50 for value in rows.values())}
        match = re.fullmatch(r'/api/admin/community/(posts|comments)/(\d+)', path)
        if method == 'POST' and match:
            if body.get('moderation') not in {'pending', 'published', 'hidden'}:
                raise CommunityError('审核状态无效')
            if match[1] == 'posts':
                if body.get('progress') not in {'review', 'planned', 'building', 'done', 'declined'}:
                    raise CommunityError('进度状态无效')
                reply = body.get('team_reply', '')
                if not isinstance(reply, str) or len(reply) > 2000:
                    raise CommunityError('回复最长 2000 字')
                row = db.execute('UPDATE community_posts SET moderation=?,progress=?,team_reply=? WHERE id=?', (body['moderation'], body['progress'], reply, int(match[2])))
            else:
                row = db.execute('UPDATE community_comments SET moderation=? WHERE id=?', (body['moderation'], int(match[2])))
            if not row.rowcount and not db.execute('SELECT 1 FROM community_' + match[1] + ' WHERE id=?', (int(match[2]),)).fetchone():
                raise CommunityError('内容不存在', 404)
            self.audit_admin_action(db, account, '社区审核', 'community_' + match[1], match[2], str(body))
            return {'ok': True}
        match = re.fullmatch(r'/api/admin/community/reports/(\d+)/resolve', path)
        if method == 'POST' and match:
            db.execute("UPDATE community_reports SET status='resolved' WHERE id=?", (int(match[1]),))
            self.audit_admin_action(db, account, '社区举报处理', 'community_report', match[1], '')
            return {'ok': True}
        match = re.fullmatch(r'/api/admin/community/accounts/(\d+)/ban', path)
        if method == 'POST' and match:
            if type(body.get('banned')) is not bool:
                raise CommunityError('禁言设置无效')
            db.execute('UPDATE community_profiles SET banned=? WHERE account_id=?', (body['banned'], int(match[1])))
            self.audit_admin_action(db, account, '社区禁言', 'community_account', match[1], str(body))
            return {'ok': True}
        raise CommunityError('接口不存在', 404)
