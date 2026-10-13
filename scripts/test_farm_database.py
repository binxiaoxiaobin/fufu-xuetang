"""Transaction-rollback integration checks. Creates no durable test learners."""
import getpass
import json
import os
import sys
import time
from contextlib import contextmanager
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
from mysql_learning_db import Store
import farm
with connection() as conn:
    try:
        db=Store(conn)
        first=db.execute("INSERT INTO profile(child_name,points) VALUES('牧场事务测试',100)").lastrowid
        second=db.execute("INSERT INTO profile(child_name,points) VALUES('牧场隔离测试',0)").lastrowid
        db.set_learner_id(first)
        state,revision=farm.locked_state(db,first)
        assert len(farm.catalog(db)['breeds'])==3 # scoped Store must not rewrite catalog ID
        state,_=farm.apply_action(state,{'type':'shear','target':'cloud'},farm.catalog(db),int(time.time()*1000))
        farm.save(db,first,state)
        other,_=farm.locked_state(db,second)
        assert other['inventory']['wool']==0 and state['inventory']['wool']==1
        peach=db.execute("SELECT * FROM store_items WHERE kind='farm' AND zoo_animal_id='peach'").fetchone()
        try:farm.fulfill_product(db,first,peach)
        except ValueError:pass
        else:raise AssertionError('Capacity check missing')
        expansion=db.execute("SELECT * FROM store_items WHERE kind='farm' AND zoo_animal_id='expansion'").fetchone()
        farm.fulfill_product(db,first,expansion)
        farm.fulfill_product(db,first,peach)
        changed,_=farm.locked_state(db,first)
        assert changed['capacity']==3 and len(changed['sheep'])==2
        try:farm.fulfill_product(db,first,peach)
        except ValueError:pass
        else:raise AssertionError('Duplicate adoption check missing')
        assert farm.locked_state(db,second)[0]['capacity']==1
        # Exercise the real route's request receipts without committing test data.
        @contextmanager
        def transaction_for_test():
            yield db
        class Route(farm.FarmRoutes):
            def require_parent_learner(self, store):
                store.set_learner_id(second)
                return second
            def send_json(self, result, status=200):
                self.result, self.status = result, status
        route = Route()
        request = {'type':'shear','target':'cloud','requestId':'test-receipt-0001'}
        with patch('mysql_learning_db.connect', transaction_for_test):
            route.farm_api('POST','/api/farm/actions',request)
            assert route.status==200 and route.result['state']['inventory']['wool']==1
            revision=route.result['revision']
            route.farm_api('POST','/api/farm/actions',request)
            assert route.status==200 and route.result['state']['inventory']['wool']==1
            assert route.result['revision']==revision
            route.farm_api('POST','/api/farm/actions',dict(request,type='pet'))
            assert route.status==400
            route.farm_api('POST','/api/farm/actions',[])
            assert route.status==400
            assert farm.catalog(db)['paddy']['seconds']==30*86400
            for action in ['paddy-plant','paddy-water']:
                route.farm_api('POST','/api/farm/actions',{'type':action,'target':'paddy','requestId':'test-'+action})
                assert route.status==200
            ready=route.result['state']['paddy']['readyAt']
            water={'type':'paddy-water','target':'paddy','requestId':'test-second-water'}
            route.farm_api('POST','/api/farm/actions',water)
            assert route.status==400
            tomorrow=time.time()+86400
            with patch('farm.time.time',return_value=tomorrow):
                route.farm_api('POST','/api/farm/actions',water)
                assert route.status==200
                assert route.result['state']['paddy']['readyAt']==ready-6*3600000
                ready=route.result['state']['paddy']['readyAt']
                route.farm_api('POST','/api/farm/actions',water)
                assert route.status==200 and route.result['state']['paddy']['readyAt']==ready
                assert route.result['state']['paddy']['waterCount']==2
            harvest={'type':'paddy-harvest','target':'paddy','requestId':'test-paddy-harvest','rewardPoints':99999}
            with patch('farm.time.time',return_value=(ready-1)/1000):
                route.farm_api('POST','/api/farm/actions',harvest)
                assert route.status==400
            with patch('farm.time.time',return_value=ready/1000):
                route.farm_api('POST','/api/farm/actions',harvest)
                assert route.status==200 and route.result['points']==12
                route.farm_api('POST','/api/farm/actions',harvest)
                assert route.status==200 and route.result['points']==12
                route.farm_api('POST','/api/farm/actions',dict(harvest,requestId='test-harvest-again'))
                assert route.status==400
            assert db.execute("SELECT COUNT(*) AS n,SUM(amount) AS reward FROM ledger WHERE learner_id=? AND kind='稻田收获'",(second,)).fetchone()=={'n':1,'reward':12}
            assert farm.locked_state(db,second)[0]['paddy']['harvests']==1
            print('Paddy checks passed: one watering per Beijing day; next-day acceleration and replay safety; maturity deadline and exactly one reward ledger.')
        print('Route checks passed: duplicate request returns one reward, conflicting replay and invalid body rejected.')
        # Run the existing shop purchase handler against an isolated buyer.
        import server
        buyer=db.execute("INSERT INTO profile(child_name,points) VALUES('牧场商店测试',100)").lastrowid
        class Purchase(server.Handler):
            def __init__(self):
                self.path='/api/store/buy'
                self.headers={}
            def read_body(self):
                return self.body
            def require_parent_learner(self, store):
                return buyer
            def send_json(self,result,status=200):
                self.result,self.status=result,status
            def content_api(self,*args):return False
            def admin_stories(self,*args):return False
            def admin_accounts(self,*args):return False
            def admin_operations(self,*args):return False
        shop=Purchase()
        def buy(item):
            shop.body={'item_id':item['id']}
            shop.do_POST()
            return shop.status
        with patch('server.connect',transaction_for_test):
            assert buy(peach)==400
            assert db.execute('SELECT points FROM profile WHERE id=?',(buyer,)).fetchone()['points']==100
            assert buy(expansion)==200
            assert db.execute('SELECT points FROM profile WHERE id=?',(buyer,)).fetchone()['points']==70
            assert buy(expansion)==400
            assert buy(peach)==200
            assert db.execute('SELECT points FROM profile WHERE id=?',(buyer,)).fetchone()['points']==50
            assert db.execute('SELECT COUNT(*) AS n FROM ledger WHERE learner_id=?',(buyer,)).fetchone()['n']==2
            assert db.execute('SELECT COUNT(*) AS n FROM owned_items WHERE learner_id=?',(buyer,)).fetchone()['n']==2
            assert len(farm.locked_state(db,buyer)[0]['sheep'])==2
        print('Shop checks passed: capacity rejection costs nothing; expansion and adoption debit once with matching ledger and ownership.')
        print('Database checks passed: scoped catalog, learner isolation, persistence, capacity and duplicate adoption.')
    finally:
        conn.rollback()
print('All temporary learners and farm changes rolled back.')
