"""Transport exhibits: local licensed media and MySQL-owned descriptions."""
import json
import mimetypes
from datetime import datetime
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

FRONTEND = Path(__file__).resolve().parent.parent / 'frontend'
MANIFEST = Path(__file__).resolve().parent / 'seed_data' / 'transport_exhibits.json'
MIGRATION = 'transport_exhibits_realistic_v3'


def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS transport_exhibits (
                slug VARCHAR(80) PRIMARY KEY, position SMALLINT UNSIGNED NOT NULL,
                name VARCHAR(120) NOT NULL, category VARCHAR(20) NOT NULL,
                details_json LONGTEXT NOT NULL, model_asset_id BIGINT UNSIGNED NOT NULL,
                cover_asset_id BIGINT UNSIGNED NOT NULL,
                FOREIGN KEY (model_asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT,
                FOREIGN KEY (cover_asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute('SELECT migration_key FROM content_migrations WHERE migration_key=%s', (MIGRATION,))
            seeded = bool(cur.fetchone())
        conn.commit()
    if seeded:
        return
    items = json.loads(MANIFEST.read_text(encoding='utf-8'))
    expected = {'airliner','propeller-plane','helicopter','bullet-train','subway',
                'steam-train','taxi','fire-engine','sailboat','cargo-ship','rocket'}
    if len(items) != len(expected) or {item['slug'] for item in items} != expected:
        raise ValueError('Expected eleven reviewed transport exhibits')
    rows = []
    for position, item in enumerate(items):
        ids = []
        for key, kind in [('model_path', 'model'), ('cover_path', 'image')]:
            path = item[key]
            if not path.startswith('/assets/transport/') or '..' in path or '\\' in path:
                raise ValueError('Invalid transport asset path')
            local = FRONTEND / path.lstrip('/')
            if not local.is_file():
                raise FileNotFoundError(path)
            credit = item['credit']
            if credit['license'] not in ('CC0 1.0','CC BY 4.0','NASA 3D Resources (public domain)') or not credit['source'].startswith('https://') or not credit.get('licenseUrl','').startswith('https://'):
                raise ValueError('Transport asset license and source required')
            ids.append(register_media({
                'public_path': path, 'media_kind': kind,
                'mime_type': 'model/gltf-binary' if kind == 'model' else mimetypes.guess_type(path)[0],
                'file_bytes': local.stat().st_size, 'title': item['name'], 'alt_text': item['tagline'],
                'width': item['cover_size'][0] if kind == 'image' else None,
                'height': item['cover_size'][1] if kind == 'image' else None,
                'source_name': credit['author'], 'source_url': credit['source'],
                'license_name': credit['license'],
            }))
        details = {key: value for key, value in item.items() if key not in ('model_path', 'cover_path')}
        rows.append((item['slug'], position, item['name'], item['category'],
                     json.dumps(details, ensure_ascii=False), *ids))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM transport_exhibits ORDER BY position FOR UPDATE')
            previous = cur.fetchall()
            if previous:
                backup = FRONTEND.parent/'artifacts'/('transport-catalog-backup-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
                backup.parent.mkdir(exist_ok=True)
                backup.write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8')
            cur.executemany('INSERT INTO transport_exhibits '
                '(slug,position,name,category,details_json,model_asset_id,cover_asset_id) '
                'VALUES (%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE '
                'position=VALUES(position),name=VALUES(name),category=VALUES(category),'
                'details_json=VALUES(details_json),model_asset_id=VALUES(model_asset_id),'
                'cover_asset_id=VALUES(cover_asset_id)', rows)
            cur.execute('INSERT IGNORE INTO content_migrations(migration_key) VALUES(%s)', (MIGRATION,))
        conn.commit()


def list_exhibits():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT t.details_json,t.name,t.category,m.public_path AS model_path,'
                        'c.public_path AS cover_path FROM transport_exhibits t '
                        'JOIN media_assets m ON m.id=t.model_asset_id '
                        'JOIN media_assets c ON c.id=t.cover_asset_id ORDER BY t.position')
            rows = cur.fetchall()
    items = []
    for row in rows:
        item = json.loads(row.pop('details_json'))
        item.update(row)
        items.append(item)
    return {'items': items}
