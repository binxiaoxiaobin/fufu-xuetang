"""Apply the backed-up, one-time transport replacement using private credentials."""
import getpass
import os
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
if not os.environ.get('FUFU_MYSQL_PASSWORD'):
    os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from transport_catalog import initialize, list_exhibits
from mysql_db import connection
initialize()
items=list_exhibits()['items']
assert len(items)==11 and all(i['model_path'].startswith('/assets/transport/models/v3-') for i in items)
assert len({i['cover_path'] for i in items})==11
initialize()  # Migration must preserve rows when called again.
assert list_exhibits()['items']==items
with connection() as conn:
    with conn.cursor() as cur:
        for item in items:
            for key in ('model_path','cover_path'):
                local=ROOT/'frontend'/item[key].lstrip('/')
                cur.execute('UPDATE media_assets SET file_bytes=%s WHERE public_path=%s',(local.stat().st_size,item[key]))
    conn.commit()
print('Eleven reviewed exhibits loaded from MySQL; repeat initialization preserved rows.')
