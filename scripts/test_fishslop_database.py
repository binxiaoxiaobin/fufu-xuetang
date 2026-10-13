# -*- coding: utf-8 -*-
"""Check real MySQL learner saves in a transaction that is always rolled back."""
import json
import sys
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'backend'))
from mysql_db import connection
from mysql_learning_db import Store
import toy_games

with connection() as conn:
    try:
        db = Store(conn)
        first = db.execute("INSERT INTO profile(child_name,points) VALUES('海底存档事务测试',0)").lastrowid
        second = db.execute("INSERT INTO profile(child_name,points) VALUES('海底隔离事务测试',0)").lastrowid
        @contextmanager
        def transaction():
            yield db
        class Route(toy_games.ToyGameRoutes):
            learner = first
            def require_parent_learner(self, store):
                return self.learner
            def send_json(self, data, status=200):
                self.result, self.status = data, status
        route = Route()
        url = '/api/toy-games/fishslop/save'
        storage = {'fishslop.save.v1': json.dumps({'v':1, 'coins':35, 'fish':[{'s':'glimmer','g':0,'h':0,'m':0}], 'upgrades':{'hopper':1}}),
                   'fishslop.settings.v1': json.dumps({'night':True,'muted':False})}
        body = {'learnerId':first,'expectedRevision':0,'storage':storage}
        with patch('toy_games.connect', transaction):
            route.toy_game_api('GET', '/api/toy-games')
            assert route.status == 200
            game = next(g for g in route.result['games'] if g['id'] == 'fishslop')
            assert game['resume'] and game['reward_points'] == 0
            route.toy_game_api('GET', url)
            assert route.status == 200 and route.result['storage'] == {} and route.result['revision'] == 0
            route.toy_game_api('POST', url, body)
            assert route.status == 200 and route.result['revision'] == 1 and route.result['reward'] == 0
            route.toy_game_api('GET', url)
            assert route.result['storage'] == storage
            route.toy_game_api('POST', url, body)
            assert route.status == 409
            body['expectedRevision'] = 1
            body['storage'] = {'foreign.key':'{}'}
            route.toy_game_api('POST', url, body)
            assert route.status == 400
            route.learner = second
            route.toy_game_api('GET', url)
            assert route.result['storage'] == {}
            body['storage'] = storage
            route.toy_game_api('POST', url, body)
            assert route.status == 409
            body['learnerId'] = second
            body['expectedRevision'] = 0
            route.toy_game_api('POST', url, body)
            assert route.status == 200 and route.result['reward'] == 0
            assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id IN (?,?)',(first,second)).fetchone()['n'] == 0
            assert db.execute('SELECT SUM(points) AS n FROM profile WHERE id IN (?,?)',(first,second)).fetchone()['n'] == 0
        print('PASS: real MySQL catalogue, save/reload, learner isolation, key whitelist, revision and account conflicts; no learning rewards. All test records rolled back.')
    finally:
        conn.rollback()
