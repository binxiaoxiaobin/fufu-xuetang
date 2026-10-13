"""Verify the actual learner save routes; all records are rolled back."""
import json,sys
from pathlib import Path
from contextlib import contextmanager
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))
from mysql_db import connection
from mysql_learning_db import Store
import toy_games
with connection() as conn:
    try:
        db=Store(conn)
        first=db.execute("INSERT INTO profile(child_name,points) VALUES('像素游戏存档测试',0)").lastrowid
        second=db.execute("INSERT INTO profile(child_name,points) VALUES('像素游戏隔离测试',0)").lastrowid
        @contextmanager
        def transaction():yield db
        class Route(toy_games.ToyGameRoutes):
            learner=first
            def require_parent_learner(self,store):return self.learner
            def send_json(self,data,status=200):self.result,self.status=data,status
        route=Route()
        with patch('toy_games.connect',transaction):
            route.toy_game_api('GET','/api/toy-games');ids={game['id'] for game in route.result['games']}
            assert {'starcatcher','palace-for-fools','little-spy','taipo','sokoworld','open-jigsaw'} <= ids and not {'luma','yknytt','butano-fighter'} & ids
            for slug in ('starcatcher','palace-for-fools','little-spy','taipo','sokoworld','open-jigsaw'):
                url='/api/toy-games/'+slug+'/save';route.learner=first
                body={'learnerId':first,'expectedRevision':0,'storage':{slug+'.save.v1':json.dumps({'level':2})}}
                route.toy_game_api('POST',url,body);assert route.status==200 and route.result['revision']==1 and route.result['reward']==0
                route.toy_game_api('POST',url,body);assert route.status==409
                route.learner=second;route.toy_game_api('GET',url);assert route.result['storage']=={}
                route.toy_game_api('POST',url,body);assert route.status==409
                route.learner=first;route.toy_game_api('GET',url);assert json.loads(route.result['storage'][slug+'.save.v1'])=={'level':2}
            for removed in ('luma','yknytt','butano-fighter'):
                route.toy_game_api('GET','/api/toy-games/'+removed+'/save');assert route.status==404
        print('PASS: remaining save route, revisions, learner isolation, no learning rewards, removed game rejected')
    finally:conn.rollback()
