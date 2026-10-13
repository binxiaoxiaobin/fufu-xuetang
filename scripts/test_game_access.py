"""Exercise real HTTP/MySQL and parent UI with disposable accounts, never real learners."""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import game_access
from mysql_learning_db import connect
from server import Handler

game_access.initialize()
password=secrets.token_urlsafe(20)
tokens=[secrets.token_urlsafe(32),secrets.token_urlsafe(32)]
game_password='亲子2026'
account=None;learners=[]
class TestHandler(Handler):
    def log_message(self,*args):
        pass
server=ThreadingHTTPServer(('127.0.0.1',0),TestHandler)
origin='http://127.0.0.1:'+str(server.server_port)
threading.Thread(target=server.serve_forever,daemon=True).start()
def call(path,body=None,token=tokens[0],method=None):
    request=urllib.request.Request(origin+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**({'Cookie':'fufu_session='+token} if token else {})})
    try:
        response=urllib.request.urlopen(request)
    except urllib.error.HTTPError as error:
        response=error
    data=response.read()
    return response.status,json.loads(data) if data and response.headers.get('Content-Type','').startswith('application/json') else data,response.headers
try:
    with connect() as db:
        account=db.execute("INSERT INTO user_accounts(username,password_hash,account_type,role) VALUES(?,?,'parent','parent')",('game-access-test-'+secrets.token_hex(8),game_access.password_hash(password))).lastrowid
        for _ in range(2):
            learner=db.execute("INSERT INTO profile(child_name,learning_stage,grade,account_id) VALUES('密码功能测试','小学','二年级',?)",(account,)).lastrowid
            learners.append(learner);db.execute('INSERT INTO pet_state(id) VALUES(?)',(learner,))
        for token in tokens:
            db.execute('INSERT INTO user_sessions(account_id,learner_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))',(account,learners[0],hashlib.sha256(token.encode()).hexdigest()))
    assert call('/api/game-access/status',token=None)[0]==401
    assert call('/api/game-access/status')[1]['enabled'] is False
    assert call('/api/parent/game-access',{'enabled':True,'newPassword':'xx','currentPassword':password})[0]==400
    assert call('/api/parent/game-access',{'enabled':True,'newPassword':game_password,'currentPassword':'wrong'})[0]==403
    assert call('/api/parent/game-access',{'enabled':True,'newPassword':game_password,'currentPassword':password,'learnerId':learners[1]})[0]==200
    for path in ['/api/toy-games','/puzzles.js','/toy-arcade.js','/assets/games/open-jigsaw/index.html','/assets/%67ames/open-jigsaw/index.html','/assets/games/open-jigsaw/','/assets/games/open-jigsaw/game.js']:
        assert call(path)[0]==403,path
    assert call('/assets/games/open-jigsaw/index.html',method='HEAD')[0]==403
    assert call('/api/game/reward',{'game':'sudoku'})[0]==403
    assert call('/api/game-access/unlock',{'password':'wrong'})[0]==403
    assert call('/api/game-access/unlock',{'password':game_password})[1]['unlocked']
    assert call('/assets/games/open-jigsaw/index.html')[0]==200
    assert not call('/api/game-access/status',token=tokens[1])[1]['unlocked']
    assert call('/api/parent/game-access',{'enabled':False,'currentPassword':'wrong'})[0]==403
    assert call('/api/parent/game-access',{'enabled':True,'newPassword':'新版密码','currentPassword':game_password})[0]==200
    assert call('/assets/games/open-jigsaw/index.html')[0]==403,'password changes revoke grants'
    assert call('/api/parent/game-access',{'enabled':True,'newPassword':game_password,'currentPassword':password,'verification':'account'})[0]==200
    for i in range(5):
        assert call('/api/game-access/unlock',{'password':'wrong'})[0]==(403 if i<4 else 429)
    assert call('/api/game-access/unlock',{'password':game_password})[0]==429
    with connect() as db:
        db.execute('UPDATE game_access_settings SET locked_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE learner_id=?',(learners[0],))
        encoded=db.execute('SELECT password_hash FROM game_access_settings WHERE learner_id=?',(learners[0],)).fetchone()['password_hash']
        assert encoded!=game_password and game_access.matches(game_password,encoded)
    assert call('/api/game-access/unlock',{'password':game_password})[0]==200
    assert call('/api/auth/select-learner',{'learner_id':learners[1]})[0]==200
    assert call('/api/game-access/status')[1]['enabled'] is False
    assert call('/api/auth/select-learner',{'learner_id':learners[0]})[0]==200
    assert call('/api/game-access/status')[1]['unlocked'] is False
    assert 'password' not in json.dumps(call('/api/parent/game-access')[1]).lower()
    print('PASS: authentication, learner/session isolation, hashed passwords, configure/recover/revoke, direct files and HEAD, attempt limit, protected rewards.',flush=True)
    env={**os.environ,'FUFU_TEST_ORIGIN':origin,'FUFU_TEST_SESSION':tokens[0],'FUFU_TEST_GAME_PASSWORD':game_password,'FUFU_TEST_ACCOUNT_PASSWORD':password}
    node=Path(r'C:\Users\rybof\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    subprocess.run([str(node),str(ROOT/'scripts/test_game_access_browser.cjs')],env=env,cwd=str(ROOT),check=True)
finally:
    server.shutdown();server.server_close()
    if account:
        with connect() as db:
            db.execute('DELETE FROM user_sessions WHERE account_id=?',(account,))
            # Only IDs created above; learner tables may be populated by the real home UI.
            cols=db.execute("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('learner_id','pet_id')").fetchall()
            pending=[(r['TABLE_NAME'],r['COLUMN_NAME']) for r in cols]
            for _ in range(5):
                remaining=[]
                for table,col in pending:
                    if not table.replace('_','').isalnum():continue
                    try:
                        for learner in learners:db.execute('DELETE FROM `'+table+'` WHERE `'+col+'`=?',(learner,))
                    except Exception:
                        remaining.append((table,col))
                pending=remaining
                if not pending:break
            for learner in learners:
                db.execute('DELETE FROM pet_state WHERE id=?',(learner,))
                db.execute('DELETE FROM profile WHERE id=?',(learner,))
            db.execute('DELETE FROM user_accounts WHERE id=?',(account,))
        print('Temporary game-access accounts and records removed.',flush=True)
