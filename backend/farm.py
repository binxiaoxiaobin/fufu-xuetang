"""Single-learner light farm. Server time, serialized transactions and bounded production."""
import copy
import datetime
import json
import re
import time
from pathlib import Path
from mysql_db import connection


def initialize():
    seed = json.loads((Path(__file__).parent / 'seed_data/farm_catalog.json').read_text(encoding='utf-8'))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS farm_catalog (
                id TINYINT PRIMARY KEY, config_json LONGTEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("INSERT IGNORE INTO farm_catalog(id,config_json) VALUES(1,%s)", (json.dumps(seed, ensure_ascii=False),))
            cur.execute('SELECT config_json FROM farm_catalog WHERE id=1 FOR UPDATE')
            config = json.loads(cur.fetchone()['config_json'])
            if 'paddy' not in config:
                config['paddy'] = seed['paddy']
            config['paddy'].setdefault('waterBoostSeconds',seed['paddy']['waterBoostSeconds'])
            cur.execute('UPDATE farm_catalog SET config_json=%s WHERE id=1', (json.dumps(config,ensure_ascii=False),))
            cur.execute("""CREATE TABLE IF NOT EXISTS learner_farms (
                learner_id BIGINT PRIMARY KEY, state_json LONGTEXT NOT NULL,
                revision BIGINT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (learner_id) REFERENCES profile(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS farm_action_receipts (
                learner_id BIGINT NOT NULL, request_id VARCHAR(80) NOT NULL,
                payload_hash CHAR(64) NOT NULL, message VARCHAR(250) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(learner_id,request_id),
                FOREIGN KEY (learner_id) REFERENCES profile(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()


def seed_products(db):
    config = catalog(db)
    for item in config['products']:
        if not db.execute("SELECT id FROM store_items WHERE kind='farm' AND zoo_animal_id=?", (item['key'],)).fetchone():
            db.execute("INSERT INTO store_items(name,emoji,description,price,kind,zoo_animal_id) VALUES(?,?,?,?, 'farm',?)",
                       (item['name'], item['emoji'], '【团团小牧场】'+item['description'], item['price'], item['key']))


def catalog(db):
    return json.loads(db.execute('SELECT config_json FROM farm_catalog WHERE id=?', (1,)).fetchone()['config_json'])


def empty_paddy():
    return {'plantedAt':None,'wateredAt':None,'readyAt':None,'cycle':0,'harvests':0,'totalReward':0,
            'waterDay':'','waterCount':0,'boostMs':0,'growthStartedAt':None,'baseDurationMs':None,'boostPerWaterMs':None}


def beijing_day(now):
    return datetime.datetime.utcfromtimestamp(now/1000+8*3600).date().isoformat()


def migrate_paddy(state,config):
    before=json.dumps(state.get('paddy'),sort_keys=True)
    p=state.setdefault('paddy',empty_paddy())
    if 'waterDay' not in p:
        p.update(waterDay=beijing_day(p['wateredAt']) if p['wateredAt'] is not None else '',
                 waterCount=1 if p['wateredAt'] is not None else 0,boostMs=0)
    if 'growthStartedAt' not in p:
        p.update(growthStartedAt=p['wateredAt'] if p['wateredAt'] is not None else p['plantedAt'],
                 baseDurationMs=config['paddy']['seconds']*1000,
                 boostPerWaterMs=config['paddy']['waterBoostSeconds']*1000)
        if p['plantedAt'] is not None and p['readyAt'] is None:
            p.update(readyAt=p['growthStartedAt']+p['baseDurationMs'],rewardPoints=config['paddy']['rewardPoints'])
    return before!=json.dumps(p,sort_keys=True)


def initial(now):
    return {'capacity': 1, 'sheep': [{'id':'cloud', 'breed':'cloud', 'name':'棉花糖',
            'careCount':3, 'careDay':'', 'woolReadyAt':now, 'lastCareAt':0}],
            'plots':[{'id':'plot-1','crop':None}, {'id':'plot-2','crop':None}],
            'inventory':{'wool':0,'clover':0,'carrot':0}, 'decorations':[],
            'tutorialHarvested':False, 'introSeen':False,'paddy':empty_paddy()}


def locked_state(db, learner):
    now = int(time.time()*1000)
    db.execute('INSERT IGNORE INTO learner_farms(learner_id,state_json) VALUES(?,?)',
               (learner, json.dumps(initial(now), ensure_ascii=False)))
    row = db.execute('SELECT state_json,revision FROM learner_farms WHERE learner_id=? FOR UPDATE', (learner,)).fetchone()
    state,revision = json.loads(row['state_json']), int(row['revision'])
    if migrate_paddy(state,catalog(db)):
        save(db,learner,state)
        revision += 1
    return state,revision


def save(db, learner, state):
    db.execute('UPDATE learner_farms SET state_json=?,revision=revision+1 WHERE learner_id=?',
               (json.dumps(state, ensure_ascii=False), learner))


def payload(db, learner, state=None, revision=None):
    if state is None:
        state, revision = locked_state(db, learner)
    points = db.execute('SELECT points FROM profile WHERE id=?',(learner,)).fetchone()['points']
    return {'state':state, 'revision':revision, 'catalog':catalog(db), 'serverTime':int(time.time()*1000),'points':points}


def apply_action(state, body, config, now):
    """Pure rules, tested independently from storage."""
    state = copy.deepcopy(state)
    action = body.get('type')
    if action in ('paddy-plant','paddy-water','paddy-harvest'):
        if body.get('target') != 'paddy':
            raise ValueError('请选择自己的稻田')
        paddy = state.setdefault('paddy',empty_paddy())
        if action == 'paddy-plant':
            if paddy['plantedAt'] is not None:
                raise ValueError('这轮已经播种，请照顾现有的稻苗')
            paddy.update(plantedAt=now,wateredAt=None,readyAt=now+config['paddy']['seconds']*1000,cycle=paddy['cycle']+1,
                         growthStartedAt=now,baseDurationMs=config['paddy']['seconds']*1000,
                         boostPerWaterMs=config['paddy']['waterBoostSeconds']*1000,
                         waterCount=0,boostMs=0,rewardPoints=config['paddy']['rewardPoints'])
            return state,'稻田播种好啦，开始自然生长。每天浇一次水，可以更早成熟。'
        if paddy['plantedAt'] is None:
            raise ValueError('先给稻田播种吧')
        if action == 'paddy-water':
            if now>=paddy['readyAt']:
                raise ValueError('稻谷已经成熟，可以直接收获啦')
            day=beijing_day(now)
            if paddy['waterDay']==day:
                raise ValueError('今天已经浇过水啦，明天再来。每天最多一次。')
            boost=min(paddy['boostPerWaterMs'],paddy['readyAt']-now)
            paddy.update(wateredAt=now,waterDay=day,readyAt=paddy['readyAt']-boost,
                         waterCount=paddy['waterCount']+1,boostMs=paddy['boostMs']+boost)
            return state,'今天浇水完成，成熟时间提前 {} 小时！明天还可以再来。'.format(round(boost/3600000,1))
        if now < paddy['readyAt']:
            raise ValueError('稻谷还没成熟，等稻田变成金黄色再来收获吧')
        reward=paddy['rewardPoints']
        paddy.update(plantedAt=None,wateredAt=None,readyAt=None,harvests=paddy['harvests']+1,
                     totalReward=paddy['totalReward']+reward)
        return state,'稻谷收获啦！获得 {} 积分，下一轮可以重新播种。'.format(reward)
    if action == 'intro':
        state['introSeen'] = True
        return state, '欢迎来到团团的小牧场！第一份羊毛已经长好啦。'
    if action in ('pet','feed','walk','shear','rename'):
        sheep = next((s for s in state['sheep'] if s['id'] == body.get('target')), None)
        if not sheep:
            raise ValueError('这只小羊不在你的牧场里')
        if action == 'rename':
            name = str(body.get('name','')).strip()
            if not name or len(name) > 12 or any(ord(c) < 32 for c in name):
                raise ValueError('名字写 1 到 12 个字就好')
            sheep['name'] = name
            return state, '小羊有新名字啦！'
        if action == 'shear':
            if sheep['careCount'] < 3 or now < sheep['woolReadyAt']:
                raise ValueError('毛毛还在慢慢长，可以先摸摸小羊')
            sheep['woolReadyAt'] = now + config['woolSeconds']*1000
            state['inventory']['wool'] += 1
            return state, '收下 1 份羊毛！下一份会慢慢长出来。'
        day = datetime.datetime.utcfromtimestamp(now/1000 + 8*3600).date().isoformat()
        if sheep['careDay'] != day:
            sheep['careDay'] = day
            sheep['careCount'] = min(3, sheep['careCount']+1)
        sheep['lastCareAt'] = now
        return state, {'pet':'小羊蹭了蹭团团，真开心！','feed':'小羊吃了一把免费饲草，满足地抬起头。','walk':'带小羊在牧场附近散散步吧，随时可以回家。'}[action]
    if action in ('plant','water','harvest'):
        plot = next((p for p in state['plots'] if p['id'] == body.get('target')), None)
        if not plot:
            raise ValueError('这块地不在你的菜园里')
        if action == 'plant':
            if plot['crop']:
                raise ValueError('这块地已经种好啦')
            crop = next((c for c in config['crops'] if c['id'] == body.get('crop')), None)
            if not crop:
                raise ValueError('请选择菜园里的种子')
            plot.update(crop=crop['id'],watered=False,readyAt=None)
            return state, '种下'+crop['name']+'，再浇一点水吧。基础种子免费。'
        if not plot['crop']:
            raise ValueError('先种一颗种子吧')
        if action == 'water':
            if plot.get('watered'):
                raise ValueError('已经浇好水啦，去看看小羊吧')
            crop = next(c for c in config['crops'] if c['id'] == plot['crop'])
            seconds = crop['seconds'] if state['tutorialHarvested'] else config['tutorialCropSeconds']
            plot.update(watered=True, readyAt=now+seconds*1000)
            return state, '浇好水啦！离开页面也会慢慢长大，不会枯萎。'
        if not plot.get('watered') or now < plot['readyAt']:
            raise ValueError('还没成熟，再给它一点时间')
        state['inventory'][plot['crop']] += 1
        plot.clear(); plot.update(id=body['target'],crop=None)
        state['tutorialHarvested'] = True
        return state, '收获 1 份作物！想种下一轮时再播种就好。'
    if action == 'craft':
        recipe = next((r for r in config['recipes'] if r['id'] == body.get('target')), None)
        if not recipe:
            raise ValueError('这件作品暂时不能制作')
        if recipe['id'] in state['decorations']:
            raise ValueError('这件作品已经摆进牧场啦')
        if any(state['inventory'].get(k,0) < v for k,v in recipe['cost'].items()):
            raise ValueError('材料还差一点，慢慢收集就好')
        for key, count in recipe['cost'].items():
            state['inventory'][key] -= count
        state['decorations'].append(recipe['id'])
        return state, recipe['name']+'做好啦，已经摆进小牧场！'
    raise ValueError('请选择牧场里的操作')


def fulfill_product(db, learner, item):
    state, _ = locked_state(db, learner)
    key = item['zoo_animal_id']
    allowed = {p['key'] for p in catalog(db)['products']}
    if key not in allowed:
        raise ValueError('牧场商品尚未配置')
    if key == 'expansion':
        if state['capacity'] >= 3:
            raise ValueError('牧场已经扩建好啦')
        state['capacity'] = 3
    elif key in ('peach','mint'):
        if len(state['sheep']) >= state['capacity']:
            raise ValueError('先扩建牧场，再迎接新朋友吧')
        if any(s['id'] == key for s in state['sheep']):
            raise ValueError('这位朋友已经在牧场啦')
        state['sheep'].append({'id':key,'breed':key,'name': '桃桃' if key == 'peach' else '薄荷',
            'careCount':0,'careDay':'','lastCareAt':0,'woolReadyAt':int(time.time()*1000)})
    else:
        if key in state['decorations']:
            raise ValueError('这件装饰已经在牧场啦')
        state['decorations'].append(key)
    save(db, learner, state)


class FarmRoutes:
    def farm_api(self, method, path, body=None):
        if path not in ('/api/farm','/api/farm/actions'):
            return False
        from mysql_learning_db import connect
        import hashlib
        try:
            with connect() as db:
                learner = self.require_parent_learner(db)
                if not learner:
                    return True
                # Same lock order as store purchases: profile, then farm.
                db.execute('SELECT id FROM profile WHERE id=? FOR UPDATE', (learner,))
                state, revision = locked_state(db, learner)
                if method == 'GET' and path == '/api/farm':
                    result = payload(db, learner, state, revision)
                elif method == 'POST' and path == '/api/farm/actions':
                    if not isinstance(body, dict):
                        raise ValueError('牧场操作内容无效，请重新操作')
                    request_id = str(body.get('requestId',''))
                    if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}', request_id):
                        raise ValueError('这次操作编号无效，请重新操作')
                    digest = hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
                    receipt = db.execute('SELECT payload_hash,message FROM farm_action_receipts WHERE learner_id=? AND request_id=?', (learner,request_id)).fetchone()
                    if receipt:
                        if receipt['payload_hash'] != digest:
                            raise ValueError('操作编号已经使用，请重新操作')
                        message = receipt['message']
                    else:
                        previous_reward=state['paddy']['totalReward']
                        state, message = apply_action(state,body,catalog(db),int(time.time()*1000))
                        reward=state['paddy']['totalReward']-previous_reward
                        if reward:
                            db.execute('UPDATE profile SET points=points+? WHERE id=?',(reward,learner))
                            db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('稻田收获',?,?,?)",
                                       (reward,'第 {} 轮稻田收获'.format(state['paddy']['cycle']),learner))
                        save(db, learner,state); revision += 1
                        db.execute('INSERT INTO farm_action_receipts(learner_id,request_id,payload_hash,message) VALUES(?,?,?,?)', (learner,request_id,digest,message))
                    result = payload(db,learner,state,revision); result['message'] = message
                else:
                    self.send_json({'error':'牧场操作方式无效'},405); return True
            self.send_json(result)
        except ValueError as exc:
            self.send_json({'error':str(exc)},400)
        return True
