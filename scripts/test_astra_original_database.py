"""Exercise the real original-game storage API; all test rows are rolled back."""
import json
import sys
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from mysql_db import connection
from mysql_learning_db import Store
import toy_games

games = {
    'mosswing-adapt': {'mosswing.best': '12', 'mosswing.muted': 'true'},
    'thunderfall-adapt': {'thunderfall:best': '54321', 'thunderfall:sound': 'false'},
    'iron-bastion-adapt': {'iron-bastion-v1': json.dumps({'best': 65432, 'lastLevel': 3, 'records': {'2': {'score': 5000, 'rank': 'A'}}})},
}

with connection() as conn:
    try:
        db = Store(conn)
        first = db.execute("INSERT INTO profile(child_name,points) VALUES('原版游戏存档测试',0)").lastrowid
        second = db.execute("INSERT INTO profile(child_name,points) VALUES('原版游戏隔离测试',0)").lastrowid

        @contextmanager
        def transaction():
            yield db

        class Route(toy_games.ToyGameRoutes):
            learner = first
            def require_parent_learner(self, store): return self.learner
            def send_json(self, data, status=200): self.result, self.status = data, status

        route = Route()
        with patch('toy_games.connect', transaction):
            route.toy_game_api('GET', '/api/toy-games')
            catalogue = {item['id']: item for item in route.result['games']}
            for slug, storage in games.items():
                assert catalogue[slug]['entry'].startswith('/assets/games/astra-originals/')
                url = '/api/toy-games/' + slug + '/save'
                route.learner = first
                body = {'learnerId': first, 'expectedRevision': 0, 'storage': storage}
                route.toy_game_api('POST', url, body)
                assert route.status == 200 and route.result['reward'] == 0 and route.result['revision'] == 1
                route.toy_game_api('GET', url)
                assert route.result['storage'] == storage
                route.toy_game_api('POST', url, body)
                assert route.status == 409
                route.learner = second
                route.toy_game_api('GET', url)
                assert route.result['storage'] == {} and route.result['revision'] == 0
                route.toy_game_api('POST', url, body)
                assert route.status == 409
            assert db.execute('SELECT points FROM profile WHERE id=?', (first,)).fetchone()['points'] == 0
        print('PASS: original catalogue entries, three upstream save formats, account isolation, revision conflicts, zero learning rewards.')
    finally:
        conn.rollback()
        print('Test learner rows and progress rolled back.')
