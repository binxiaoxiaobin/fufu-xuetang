"""Database-owned solar teaching catalog and locally served licensed texture assets."""
import json
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = 'solar_catalog_v1'


def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS solar_bodies (
                slug VARCHAR(30) PRIMARY KEY, position SMALLINT UNSIGNED NOT NULL,
                details_json TEXT NOT NULL, texture_asset_id BIGINT UNSIGNED NOT NULL,
                FOREIGN KEY(texture_asset_id) REFERENCES media_assets(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
            cur.execute('''CREATE TABLE IF NOT EXISTS scene_media_links (
                scene_key VARCHAR(40) NOT NULL, role VARCHAR(40) NOT NULL,
                asset_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY(scene_key,role),
                FOREIGN KEY(asset_id) REFERENCES media_assets(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
            cur.execute('SELECT migration_key FROM content_migrations WHERE migration_key=%s', (MIGRATION,))
            seeded = bool(cur.fetchone())
        conn.commit()
    avatar = initialize_avatar()
    if seeded:
        return
    maps = json.loads((ROOT/'frontend/assets/solar/manifest.json').read_text(encoding='utf-8'))
    bodies = json.loads((ROOT/'backend/seed_data/solar_catalog.json').read_text(encoding='utf-8'))
    ids = {}
    for item in maps:
        local = ROOT/'frontend'/item['path'].lstrip('/')
        if not local.is_file() or not item['path'].startswith('/assets/solar/'):
            raise ValueError('Solar texture missing')
        ids[item['key']] = register_media(dict(public_path=item['path'],media_kind='image',
            mime_type='image/webp',file_bytes=local.stat().st_size,width=item['width'],height=item['height'],
            title=item['key']+' / 太阳系贴图', source_name='Solar System Scope',source_url=item['source'],
            license_name='CC BY 4.0'))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany('INSERT INTO solar_bodies(slug,position,details_json,texture_asset_id) '
                'VALUES(%s,%s,%s,%s) ON DUPLICATE KEY UPDATE position=VALUES(position),'
                'details_json=VALUES(details_json),texture_asset_id=VALUES(texture_asset_id)',
                [(b['id'],i,json.dumps(b,ensure_ascii=False),ids[b['id']]) for i,b in enumerate(bodies)])
            cur.executemany('INSERT INTO scene_media_links(scene_key,role,asset_id) VALUES(%s,%s,%s) '
                'ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id)',
                [('solar',key,value) for key,value in ids.items()]+[('companion','avatar',avatar)])
            cur.execute('INSERT IGNORE INTO content_migrations(migration_key) VALUES(%s)',(MIGRATION,))
        conn.commit()


def initialize_avatar():
    avatar_path = '/assets/characters/tuantuan-original.png'
    avatar = register_media(dict(public_path=avatar_path,media_kind='image',mime_type='image/png',
        file_bytes=(ROOT/'frontend'/avatar_path.lstrip('/')).stat().st_size,width=1024,height=1536,
        title='团团原始参考图',alt_text='团团探险家，原始建模参考形象',
        source_name='项目原图：tuantuan-girl-tripo-input.png',license_name='项目自有素材'))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO scene_media_links(scene_key,role,asset_id) VALUES('companion','avatar',%s) "
                'ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id)', (avatar,))
        conn.commit()
    return avatar


def catalog():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT s.details_json,m.public_path FROM solar_bodies s '
                'JOIN media_assets m ON m.id=s.texture_asset_id ORDER BY s.position')
            bodies = [dict(json.loads(row['details_json']),texture=row['public_path']) for row in cur.fetchall()]
            cur.execute("SELECT l.role,m.public_path FROM scene_media_links l JOIN media_assets m ON m.id=l.asset_id WHERE l.scene_key='solar'")
            textures = {row['role']:row['public_path'] for row in cur.fetchall()}
    return dict(items=bodies,textures=textures)


def appearance():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT m.public_path AS avatar FROM scene_media_links l JOIN media_assets m ON m.id=l.asset_id WHERE l.scene_key='companion' AND l.role='avatar'")
            return cur.fetchone() or {}
