"""Exercise real saves and rewards using a transaction that is always rolled back."""
import getpass
import json
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from collections import deque
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
import toy_games

levels=json.loads((ROOT/'content/games/toy2game/parking-levels.json').read_text(encoding='utf-8'))
level=levels[0]
def solve():
    start=tuple(level['positions']);queue=deque([start]);parents={start:None}
    while queue:
        before=queue.popleft()
        if before[0]==6:
            path=[];cursor=before
            while cursor is not None:path.append(list(cursor));cursor=parents[cursor]
            return list(reversed(path))
        for car in range(len(before)):
            for position in range(7):
                after=list(before);after[car]=position;state=tuple(after)
                if state not in parents and toy_games.parking_layout(level['cars'],after) and toy_games.parking_transition(level['cars'],before,after):
                    parents[state]=before;queue.append(state)
    raise AssertionError('No legal parking solution')
path=solve()
saved={'version':2,'level':level['id'],'game':{'positions':path[-1],'past':path[:-1],'future':[]},'seconds':60,'best':{'1':0}}
assert toy_games.validate_parking(saved,level)==(True,len(path)-1)
bad=json.loads(json.dumps(saved));bad['game']['past']=[]
try:toy_games.validate_parking(bad,level)
except ValueError:pass
else:raise AssertionError('Teleporting to the exit must not earn points')
with connection() as conn:
    try:
        db=Store(conn)
        first=db.execute("INSERT INTO profile(child_name,points) VALUES('游戏事务测试',0)").lastrowid
        second=db.execute("INSERT INTO profile(child_name,points) VALUES('游戏隔离测试',0)").lastrowid
        @contextmanager
        def transaction():yield db
        class Route(toy_games.ToyGameRoutes):
            learner=first
            def require_parent_learner(self,store):return self.learner
            def send_json(self,data,status=200):self.result,self.status=data,status
        route=Route();url='/api/toy-games/parking-escape/save'
        body={'learnerId':first,'expectedRevision':0,'storage':{'parking-escape-save-v2':json.dumps(saved)}}
        with patch('toy_games.connect',transaction):
            route.toy_game_api('GET','/api/toy-games');assert route.status==200 and len(route.result['games'])==6
            route.toy_game_api('GET',url);assert route.result['revision']==0 and len(route.result['levels'])==120
            route.toy_game_api('POST',url,body);assert route.status==200 and route.result['reward']==5
            assert route.result['stats']['best'][str(level['id'])]==len(path)-1
            route.toy_game_api('POST',url,body);assert route.status==409
            body['expectedRevision']=1
            route.toy_game_api('POST',url,body);assert route.status==200 and route.result['reward']==0
            assert db.execute('SELECT points FROM profile WHERE id=?',(first,)).fetchone()['points']==5
            assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?',(first,)).fetchone()['n']==1
            route.learner=second;route.toy_game_api('GET',url);assert route.result['storage']=={}
            route.toy_game_api('POST',url,body);assert route.status==409
            body['learnerId']=second;body['expectedRevision']=0;body['storage']['parking-escape-save-v2']=json.dumps(bad)
            route.toy_game_api('POST',url,body);assert route.status==400
            assert db.execute('SELECT points FROM profile WHERE id=?',(second,)).fetchone()['points']==0
            for game in json.loads((ROOT/'backend/seed_data/toy_games.json').read_text(encoding='utf-8')):
                if game['id']=='parking-escape':continue
                entry='/api/toy-games/'+game['id']+'/save';storage={game['storage_keys'][-1]:json.dumps({'version':1})}
                route.toy_game_api('POST',entry,{'learnerId':second,'expectedRevision':0,'storage':storage});assert route.status==200
                route.toy_game_api('GET',entry);assert route.result['storage']==storage
                if game['id']=='rabbit-trap':
                    assert len(route.result['levels'])==6
                    assert [item['id'] for item in route.result['levels']]==list(range(1,7))
                    assert route.result['levels']==json.loads((ROOT/'content/games/toy2game/rabbit-levels.json').read_text(encoding='utf-8'))
        print('Passed: six-game catalogue, 120 parking and 6 rabbit DB levels, save/restore, learner isolation, revision conflicts, legal move verification, one daily reward, and no forged points.')
    finally:
        conn.rollback()
        print('Test learners and all test progress rolled back.')
