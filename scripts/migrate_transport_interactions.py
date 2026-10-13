"""Update exhibit lessons only, with a local backup; credentials remain in memory."""
import getpass
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
if not os.environ.get('FUFU_MYSQL_PASSWORD'):
    os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_db import connection

items = {i['slug']: i for i in json.loads((ROOT / 'backend/seed_data/transport_exhibits.json').read_text(encoding='utf-8'))}
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT slug,details_json FROM transport_exhibits ORDER BY position FOR UPDATE')
        rows = cur.fetchall()
        if set(items) != {row['slug'] for row in rows}:
            raise ValueError('Exhibit identifiers must match before migration')
        backup = ROOT / 'artifacts' / ('transport-lessons-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.json')
        backup.parent.mkdir(exist_ok=True)
        backup.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        for row in rows:
            details = json.loads(row['details_json'])
            source = items[row['slug']]
            for key in ('parts', 'actions', 'task'):
                details[key] = source[key]
            cur.execute('UPDATE transport_exhibits SET details_json=%s WHERE slug=%s', (json.dumps(details, ensure_ascii=False), row['slug']))
        cur.execute('INSERT IGNORE INTO content_migrations(migration_key) VALUES(%s)', ('transport_interactions_v2',))
    conn.commit()
print('Updated lessons for {} exhibits; backup: {}'.format(len(rows), backup.name))
