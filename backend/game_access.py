"""Learner-specific game password and session grants; secrets never leave MySQL."""
import hashlib
import hmac
import secrets
from pathlib import Path
from mysql_learning_db import connect

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS game_access_settings (
        learner_id BIGINT PRIMARY KEY, password_hash VARCHAR(255) NOT NULL DEFAULT '',
        revision INT UNSIGNED NOT NULL DEFAULT 0, failures INT NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        FOREIGN KEY(learner_id) REFERENCES profile(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS game_access_grants (
        session_id BIGINT NOT NULL, learner_id BIGINT NOT NULL, revision INT UNSIGNED NOT NULL,
        expires_at DATETIME NOT NULL, PRIMARY KEY(session_id,learner_id),
        FOREIGN KEY(session_id) REFERENCES user_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(learner_id) REFERENCES game_access_settings(learner_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
]

def initialize():
    with connect() as db:
        for sql in SCHEMA:
            db.execute(sql)

class AccessError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status

def password_hash(value):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', value.encode('utf-8'), salt.encode('ascii'), 310000).hex()
    return 'pbkdf2_sha256$310000$'+salt+'$'+digest

def matches(value, encoded):
    if not isinstance(value, str) or len(value)>200:
        return False
    try:
        scheme, rounds, salt, expected = encoded.split('$', 3)
        actual = hashlib.pbkdf2_hmac('sha256', value.encode('utf-8'), salt.encode('ascii'), int(rounds)).hex()
        return scheme=='pbkdf2_sha256' and hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False

def settings(db, learner, lock=False):
    if lock:
        db.execute('INSERT IGNORE INTO game_access_settings(learner_id) VALUES(?)',(learner,))
    return db.execute('SELECT *,locked_until>NOW() AS cooling FROM game_access_settings WHERE learner_id=?'+(' FOR UPDATE' if lock else ''),(learner,)).fetchone()

def status(db, learner, session):
    row=settings(db,learner)
    enabled=bool(row and row['password_hash'])
    grant=enabled and db.execute('SELECT 1 FROM game_access_grants WHERE session_id=? AND learner_id=? AND revision=? AND expires_at>NOW()',(session,learner,row['revision'])).fetchone()
    return {'enabled':enabled,'unlocked':not enabled or bool(grant),'learnerId':learner}

def verify(db, learner, row, value, encoded):
    if row['cooling']:
        raise AccessError('尝试次数较多，请五分钟后再试',429)
    if not matches(value,encoded):
        failures=row['failures']+1
        db.execute('UPDATE game_access_settings SET failures=?,locked_until=IF(? >=5,DATE_ADD(NOW(),INTERVAL 5 MINUTE),NULL) WHERE learner_id=?',(failures if failures<5 else 0,failures,learner))
        db.connection.commit()  # Failed checks must survive the request rollback.
        raise AccessError('密码不正确，请重新输入' if failures<5 else '尝试次数较多，请五分钟后再试',403 if failures<5 else 429)
    db.execute('UPDATE game_access_settings SET failures=0,locked_until=NULL WHERE learner_id=?',(learner,))

def configure(db, account, learner, values):
    if not isinstance(values,dict) or type(values.get('enabled')) is not bool:
        raise AccessError('请选择是否开启游戏密码')
    enabled=values['enabled']; new=values.get('newPassword','')
    if enabled and (not isinstance(new,str) or not 4<=len(new)<=32 or not new.strip()):
        raise AccessError('游戏密码请设置为 4–32 个字符')
    row=settings(db,learner,True)
    # First setup or explicit recovery verifies the account login password.
    recovery=values.get('verification')=='account' or not row['password_hash']
    encoded=db.execute('SELECT password_hash FROM user_accounts WHERE id=?',(account['id'],)).fetchone()['password_hash'] if recovery else row['password_hash']
    verify(db,learner,row,values.get('currentPassword'),encoded)
    db.execute('UPDATE game_access_settings SET password_hash=?,revision=revision+1,failures=0,locked_until=NULL WHERE learner_id=?',(password_hash(new) if enabled else '',learner))
    db.execute('DELETE FROM game_access_grants WHERE learner_id=?',(learner,))
    return status(db,learner,account['session_id'])

def unlock(db, account, learner, values):
    row=settings(db,learner,True)
    if row['password_hash']:
        verify(db,learner,row,values.get('password'),row['password_hash'])
        db.execute('INSERT INTO game_access_grants(session_id,learner_id,revision,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 12 HOUR)) ON DUPLICATE KEY UPDATE revision=VALUES(revision),expires_at=VALUES(expires_at)',(account['session_id'],learner,row['revision']))
    return status(db,learner,account['session_id'])

class GameAccessRoutes:
    def game_access_api(self, method, path, body=None):
        routes={'/api/parent/game-access','/api/game-access/status','/api/game-access/unlock','/api/game-access/lock'}
        if path not in routes:
            return False
        allowed={'/api/parent/game-access':{'GET','POST'},'/api/game-access/status':{'GET'},'/api/game-access/unlock':{'POST'},'/api/game-access/lock':{'POST'}}
        if method not in allowed[path]:
            self.send_json({'error':'不支持此操作'},405);return True
        try:
            with connect() as db:
                account=self.session_account(db);learner=self.current_learner(db,account)
                if not learner:
                    self.send_json({'error':'请先登录学习账号'},401);return True
                if method=='GET':
                    result=status(db,learner,account['session_id'])
                elif not isinstance(body,dict):
                    raise AccessError('提交内容无效')
                elif path=='/api/parent/game-access':
                    result=configure(db,account,learner,body)
                elif path.endswith('/unlock'):
                    result=unlock(db,account,learner,body)
                else:
                    db.execute('DELETE FROM game_access_grants WHERE session_id=? AND learner_id=?',(account['session_id'],learner))
                    result=status(db,learner,account['session_id'])
            self.send_json(result)
        except AccessError as exc:
            self.send_json({'error':str(exc)},exc.status)
        except Exception:
            self.send_json({'error':'游戏密码设置暂时不可用，请稍后再试'},503)
        return True

    def require_game_access(self):
        try:
            with connect() as db:
                account=self.session_account(db);learner=self.current_learner(db,account)
                if not learner:
                    self.send_json({'error':'请先登录学习账号'},401);return False
                if not status(db,learner,account['session_id'])['unlocked']:
                    self.send_json({'error':'游戏乐园已上锁，请从游戏乐园入口输入家长设置的密码','code':'GAME_LOCKED'},403);return False
            return True
        except Exception:
            self.send_json({'error':'暂时无法验证游戏权限，请稍后再试'},503);return False

    def game_file_protected(self, filename):
        root=(Path(__file__).resolve().parents[1]/'frontend').resolve()
        path=Path(filename).resolve()
        if path in {root/'puzzles.js',root/'toy-arcade.js',root/'kart-fullscreen.js'}:
            return True
        try:
            path.relative_to((root/'assets/games').resolve())
        except ValueError:
            return False
        return path.is_dir() or path.suffix.lower() in {'.html','.htm','.js','.mjs','.json','.wasm'}
