"""Add only missing learner-query indexes. Safe to run repeatedly; no data removed."""
import sys, os, getpass
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
from mysql_db import connection
indexes = {
    'completions': {'idx_completion_learner_date': 'learner_id,created_at,question_id', 'idx_completion_learner_id': 'learner_id,id'},
    'ledger': {'idx_ledger_learner_id': 'learner_id,id'}
}
with connection() as conn:
    with conn.cursor() as cur:
        for table, definitions in indexes.items():
            cur.execute('SHOW INDEX FROM `' + table + '`')
            existing = {row['Key_name'] for row in cur.fetchall()}
            for name, columns in definitions.items():
                if name not in existing:
                    cur.execute('ALTER TABLE `' + table + '` ADD INDEX `' + name + '` (' + columns + ')')
                    print('Added ' + name)
                else:
                    print('Exists ' + name)
    conn.commit()
