"""Database-owned country history and exterior landmark descriptions with matching audio."""
import json
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / 'backend/seed_data/earth_culture.json'


def validate(data):
    if len(data['countries']) != 24 or len(data['landmarks']) != 11:
        raise ValueError('Earth catalog must contain 24 countries and 11 landmarks')
    for kind in ('countries', 'landmarks'):
        for item in data[kind].values():
            if not item.get('intro') or not item.get('narration') or not item['source'].startswith('https://'):
                raise ValueError('A reviewed introduction, narration and source are required')
            if any(key in item for key in ('enter', 'inside', 'interiorText', 'door', 'stations', 'routes', 'observations')):
                raise ValueError('Exterior catalog must not contain visitor-space configuration')
            path = item.get('audio_path', '')
            if not path.startswith('/assets/audio/earth-culture/') or '..' in path or '\\' in path:
                raise ValueError('Revised local narration is required before publication')
            local = ROOT / 'frontend' / path.lstrip('/')
            if not local.is_file() or local.stat().st_size < 1000:
                raise ValueError('Missing or empty narration: ' + path)


def initialize():
    data = json.loads(SEED.read_text(encoding='utf-8'))
    validate(data)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS earth_culture_entries (
                kind VARCHAR(20) NOT NULL,
                country_key VARCHAR(80) NOT NULL,
                position SMALLINT UNSIGNED NOT NULL,
                details_json LONGTEXT NOT NULL,
                audio_asset_id BIGINT UNSIGNED NOT NULL,
                version VARCHAR(80) NOT NULL,
                PRIMARY KEY(kind,country_key),
                CONSTRAINT fk_earth_culture_audio FOREIGN KEY(audio_asset_id)
                    REFERENCES media_assets(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
            cur.execute('SELECT migration_key FROM content_migrations WHERE migration_key=%s', (data['version'],))
            seeded = bool(cur.fetchone())
        conn.commit()
    if seeded:
        return
    rows = []
    for kind in ('countries', 'landmarks'):
        for position, (key, original) in enumerate(data[kind].items()):
            item = dict(original)
            path = item.pop('audio_path')
            asset_id = register_media(dict(public_path=path, media_kind='audio', mime_type='audio/mpeg',
                file_bytes=(ROOT / 'frontend' / path.lstrip('/')).stat().st_size,
                title=item['name'] + ' · 历史文化介绍', source_name='福福学堂统一朗读',
                source_url=item['source'], license_name='项目原创介绍配音'))
            rows.append((kind, key, position, json.dumps(item, ensure_ascii=False), asset_id, data['version']))
    # Text and its matching recording are switched together in one transaction.
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany('''INSERT INTO earth_culture_entries
                (kind,country_key,position,details_json,audio_asset_id,version) VALUES(%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE position=VALUES(position),details_json=VALUES(details_json),
                    audio_asset_id=VALUES(audio_asset_id),version=VALUES(version)''', rows)
            cur.execute('INSERT IGNORE INTO content_migrations(migration_key) VALUES(%s)', (data['version'],))
        conn.commit()


def catalog():
    result = dict(countries={}, landmarks={})
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''SELECT e.kind,e.country_key,e.details_json,a.public_path AS audio_path
                FROM earth_culture_entries e JOIN media_assets a ON a.id=e.audio_asset_id
                ORDER BY e.kind,e.position''')
            for row in cur.fetchall():
                item = json.loads(row['details_json'])
                item['audio_path'] = row['audio_path']
                result[row['kind']][row['country_key']] = item
    return result
