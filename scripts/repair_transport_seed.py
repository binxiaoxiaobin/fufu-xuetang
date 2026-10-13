"""Apply corrected node labels to the newly imported teaching exhibits."""
import getpass
import json
import os
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_db import connection
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT slug,details_json FROM transport_exhibits WHERE slug IN ('helicopter','propeller-plane')")
        for row in cur.fetchall():
            details = json.loads(row['details_json'])
            if row['slug'] == 'helicopter':
                details['parts'][0]['pattern'] = 'rotor-main'
                details['parts'][1]['pattern'] = 'rotor-tail'
            else:
                details['fitLengthM'] = 11.16
            cur.execute('UPDATE transport_exhibits SET details_json=%s WHERE slug=%s',
                        (json.dumps(details, ensure_ascii=False), row['slug']))
    conn.commit()
print('Corrected transport part labels and display scale.')
