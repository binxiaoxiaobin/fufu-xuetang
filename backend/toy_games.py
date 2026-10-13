"""Licensed toy game directory, learner saves and verified parking rewards."""
import datetime
import json
import re
from pathlib import Path
from mysql_db import connection
from mysql_learning_db import connect
from content_catalog import register_media

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'backend/seed_data/toy_games.json'
MAX_SAVE_BYTES = 512 * 1024


def initialize():
    items = json.loads(MANIFEST.read_text(encoding='utf-8'))
    items.append(json.loads((ROOT/'backend/seed_data/sunbreak_game.json').read_text(encoding='utf-8')))
    items.append(json.loads((ROOT/'backend/seed_data/fishslop_game.json').read_text(encoding='utf-8')))
    items.extend(json.loads((ROOT/'backend/seed_data'/filename).read_text(encoding='utf-8'))
                 for filename in ('starcatcher_game.json', 'palace_for_fools_game.json',
                                  'little_spy_game.json', 'taipo_game.json', 'sokoworld_game.json', 'open_jigsaw_game.json',
                                  'mosswing_adaptation_game.json', 'thunderfall_adaptation_game.json', 'iron_bastion_adaptation_game.json'))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS toy_games (
                slug VARCHAR(60) PRIMARY KEY, position SMALLINT NOT NULL,
                details_json LONGTEXT NOT NULL, cover_asset_id BIGINT UNSIGNED NOT NULL,
                FOREIGN KEY(cover_asset_id) REFERENCES media_assets(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS toy_game_saves (
                learner_id BIGINT NOT NULL, game_id VARCHAR(60) NOT NULL,
                storage_json LONGTEXT NOT NULL, stats_json LONGTEXT NOT NULL,
                revision INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY(learner_id,game_id),
                FOREIGN KEY(learner_id) REFERENCES profile(id) ON DELETE CASCADE,
                FOREIGN KEY(game_id) REFERENCES toy_games(slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS toy_game_levels (
                game_id VARCHAR(60) NOT NULL, level_id INT NOT NULL, details_json TEXT NOT NULL,
                PRIMARY KEY(game_id,level_id), FOREIGN KEY(game_id) REFERENCES toy_games(slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS toy_game_rewards (
                learner_id BIGINT NOT NULL, game_id VARCHAR(60) NOT NULL, played_on DATE NOT NULL,
                PRIMARY KEY(learner_id,game_id,played_on),
                FOREIGN KEY(learner_id) REFERENCES profile(id) ON DELETE CASCADE,
                FOREIGN KEY(game_id) REFERENCES toy_games(slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
    for position, item in enumerate(items):
        local = ROOT/'frontend'/item['cover'].lstrip('/')
        entry = ROOT/'frontend'/item['entry'].lstrip('/')
        if not local.is_file() or not entry.is_file() or not item['entry'].startswith(('/assets/games/toy2game/', '/assets/games/turbo-kart-rally/', '/assets/games/sunbreak/', '/assets/games/fishslop/', '/assets/games/starcatcher/', '/assets/games/palace-for-fools/', '/assets/games/little-spy/', '/assets/games/taipo/', '/assets/games/sokoworld/', '/assets/games/open-jigsaw/', '/assets/games/astra-originals/')):
            raise ValueError('Toy game build or cover is missing')
        mime_type = {'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}.get(local.suffix.lower(), 'image/webp')
        media_id = register_media(dict(public_path=item['cover'], media_kind='image',
            mime_type=mime_type, file_bytes=local.stat().st_size, title=item['title'],
            alt_text=item['description'], source_name=item.get('author','asmoyou / Toy2Game'),
            source_url=item['source'], license_name=item['license']))
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute('INSERT INTO toy_games(slug,position,details_json,cover_asset_id) VALUES(%s,%s,%s,%s) '
                            'ON DUPLICATE KEY UPDATE position=VALUES(position),details_json=VALUES(details_json),cover_asset_id=VALUES(cover_asset_id)',
                            (item['id'],position,json.dumps(item,ensure_ascii=False),media_id))
            conn.commit()
    levels = json.loads((ROOT/'content/games/toy2game/parking-levels.json').read_text(encoding='utf-8'))
    rabbit_levels = json.loads((ROOT/'content/games/toy2game/rabbit-levels.json').read_text(encoding='utf-8'))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany('INSERT INTO toy_game_levels(game_id,level_id,details_json) VALUES(%s,%s,%s) '
                            'ON DUPLICATE KEY UPDATE details_json=VALUES(details_json)',
                            [('parking-escape',level['id'],json.dumps(level)) for level in levels] +
                            [('rabbit-trap',level['id'],json.dumps(level,ensure_ascii=False)) for level in rabbit_levels])
        conn.commit()


def parking_layout(cars, positions):
    if not isinstance(positions,list) or len(positions)!=len(cars):
        return False
    cells=set()
    for index,(car,start) in enumerate(zip(cars,positions)):
        if type(start) is not int:
            return False
        if index==0 and start==6:
            continue
        if start<0 or start+car['size']>6:
            return False
        for offset in range(car['size']):
            cell=(car['lane'],start+offset) if car['axis']=='x' else (start+offset,car['lane'])
            if cell in cells:
                return False
            cells.add(cell)
    return True


def parking_transition(cars, before, after):
    changed=[i for i in range(len(cars)) if before[i]!=after[i]]
    if len(changed)!=1 or before[0]==6:
        return False
    index=changed[0]
    if index==0 and after[0]==5:
        return False
    step=1 if after[index]>before[index] else -1
    for position in range(before[index]+step,after[index]+step,step):
        # The target vehicle leaves through column 6; column 5 is an intermediate pose.
        trial=list(before);trial[index]=min(position,4) if index==0 and position>=5 else position
        if not parking_layout(cars,trial):
            return False
    return True


def validate_parking(saved, level):
    if not isinstance(saved,dict) or saved.get('version')!=2 or saved.get('level')!=level['id']:
        raise ValueError('移车存档版本或关卡无效')
    game=saved.get('game',{});past=game.get('past');future=game.get('future');positions=game.get('positions')
    if not isinstance(past,list) or not isinstance(future,list) or len(past)+len(future)>2000:
        raise ValueError('移车历史过长或无效')
    path=past+[positions]+list(reversed(future));cars=level['cars']
    if path[0]!=level['positions'] or not all(parking_layout(cars,p) for p in path):
        raise ValueError('移车存档不符合本关初始布局')
    if not all(parking_transition(cars,a,b) for a,b in zip(path,path[1:])):
        raise ValueError('移车存档包含无法执行的移动')
    return positions[0]==6,len(past)


def validate_storage(storage, item):
    if not isinstance(storage,dict) or set(storage)-set(item['storage_keys']):
        raise ValueError('游戏存档字段无效')
    if len(json.dumps(storage,ensure_ascii=False).encode('utf-8'))>MAX_SAVE_BYTES:
        raise ValueError('游戏存档过大')
    for value in storage.values():
        if not isinstance(value,str):
            raise ValueError('游戏存档格式无效')
        json.loads(value)


class ToyGameRoutes:
    def toy_game_api(self, method, path, body=None):
        if not path.startswith('/api/toy-games'):
            return False
        match=re.fullmatch(r'/api/toy-games/([a-z][a-z0-9-]{1,59})/save',path)
        try:
            with connect() as db:
                learner=self.require_parent_learner(db)
                if not learner:
                    return True
                if path=='/api/toy-games' and method=='GET':
                    rows=db.execute('SELECT g.details_json,s.revision,s.stats_json FROM toy_games g '
                                    'LEFT JOIN toy_game_saves s ON s.game_id=g.slug AND s.learner_id=? ORDER BY g.position',(learner,)).fetchall()
                    games=[]
                    for row in rows:
                        item=json.loads(row['details_json']);item['hasSave']=bool(row['revision'])
                        item['stats']=json.loads(row['stats_json'] or '{}');games.append(item)
                    result={'games':games}
                elif match and method in ('GET','POST'):
                    slug=match.group(1)
                    row=db.execute('SELECT details_json FROM toy_games WHERE slug=?',(slug,)).fetchone()
                    if not row:
                        self.send_json({'error':'游戏不存在'},404);return True
                    item=json.loads(row['details_json'])
                    if method=='POST':
                        if not isinstance(body,dict) or body.get('learnerId')!=learner:
                            self.send_json({'error':'学习账号已切换，请重新打开游戏'},409);return True
                        validate_storage(body.get('storage'),item)
                        db.execute('SELECT id FROM profile WHERE id=? FOR UPDATE',(learner,))
                        db.execute("INSERT IGNORE INTO toy_game_saves(learner_id,game_id,storage_json,stats_json) VALUES(?,?,'{}','{}')",(learner,slug))
                    saved=db.execute('SELECT storage_json,stats_json,revision FROM toy_game_saves WHERE learner_id=? AND game_id=?'+(' FOR UPDATE' if method=='POST' else ''),(learner,slug)).fetchone()
                    revision=int(saved['revision']) if saved else 0;stats=json.loads(saved['stats_json']) if saved else {};reward=0
                    if method=='POST':
                        if type(body.get('expectedRevision')) is not int or body['expectedRevision']!=revision:
                            self.send_json({'error':'另一页面已保存新进度，请刷新游戏后继续'},409);return True
                        storage=body['storage'];completed=False;new_completion=False
                        if slug=='parking-escape' and 'parking-escape-save-v2' in storage:
                            parking=json.loads(storage['parking-escape-save-v2'])
                            level_id=parking.get('level') if isinstance(parking,dict) else None
                            level_row=db.execute('SELECT details_json FROM toy_game_levels WHERE game_id=? AND level_id=?',(slug,level_id)).fetchone()
                            if not level_row: raise ValueError('移车关卡不存在')
                            completed,moves=validate_parking(parking,json.loads(level_row['details_json']))
                            previous=json.loads(json.loads(saved['storage_json']).get('parking-escape-save-v2','{}'))
                            new_completion=completed and not (previous.get('level')==level_id and previous.get('game',{}).get('positions',[None])[0]==6)
                            if completed:
                                best=stats.setdefault('best',{});key=str(level_id)
                                best[key]=min(best.get(key,moves),moves);stats['completed']=len(best)
                            parking['best']=stats.get('best',{})
                            storage['parking-escape-save-v2']=json.dumps(parking)
                        if new_completion and item['reward_points']:
                            day=(datetime.datetime.utcnow()+datetime.timedelta(hours=8)).date().isoformat()
                            receipt=db.execute('INSERT IGNORE INTO toy_game_rewards(learner_id,game_id,played_on) VALUES(?,?,?)',(learner,slug,day))
                            if receipt.rowcount:
                                reward=item['reward_points']
                                db.execute('UPDATE profile SET points=points+? WHERE id=?',(reward,learner))
                                db.execute("INSERT INTO ledger(kind,amount,description,learner_id) VALUES('游戏奖励',?,?,?)",(reward,'完成'+item['title'],learner))
                        db.execute('UPDATE toy_game_saves SET storage_json=?,stats_json=?,revision=revision+1 WHERE learner_id=? AND game_id=?',
                                   (json.dumps(storage,ensure_ascii=False),json.dumps(stats),learner,slug));revision+=1
                    else:
                        storage=json.loads(saved['storage_json']) if saved else {}
                    result={'learnerId':learner,'revision':revision,'storage':storage,'stats':stats,'reward':reward}
                    if method=='GET' and slug in ('parking-escape','rabbit-trap'):
                        result['levels']=[json.loads(level['details_json']) for level in db.execute(
                            'SELECT details_json FROM toy_game_levels WHERE game_id=? ORDER BY level_id',(slug,)).fetchall()]
                else:
                    self.send_json({'error':'游戏接口不存在'},404);return True
            self.send_json(result)
        except (ValueError,TypeError,KeyError,AttributeError) as error:
            self.send_json({'error':str(error) if isinstance(error,ValueError) else '游戏存档格式无效'},400)
        return True
