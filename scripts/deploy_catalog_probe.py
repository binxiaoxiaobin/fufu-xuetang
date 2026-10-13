"""Read schema/counts for deployment without displaying credentials or user rows."""
import argparse
import json
import os
import shlex
import sys
from pathlib import Path

def load_env(path):
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        key, value = (line[7:] if line.startswith('export ') else line).split('=', 1)
        value = shlex.split(value, comments=True)
        os.environ[key.strip()] = ' '.join(value)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file')
    parser.add_argument('--project-root', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.env_file: load_env(args.env_file)
    sys.path.insert(0, str(Path(args.project_root) / 'backend'))
    from mysql_db import connection, DB_NAME
    tables = {}
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SHOW FULL TABLES WHERE Table_type="BASE TABLE"')
            names = [list(row.values())[0] for row in cur.fetchall()]
            for name in names:
                cur.execute('SHOW FULL COLUMNS FROM `' + name + '`')
                columns = [{k: row[k] for k in ('Field','Type','Null','Key','Extra')} for row in cur.fetchall()]
                cur.execute('SHOW INDEX FROM `' + name + '`')
                indexes = [{k: row[k] for k in ('Key_name','Non_unique','Seq_in_index','Column_name')} for row in cur.fetchall()]
                cur.execute('SELECT COUNT(*) AS n FROM `' + name + '`')
                count = cur.fetchone()['n']
                cur.execute('SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND REFERENCED_TABLE_NAME IS NOT NULL', (DB_NAME,name))
                tables[name] = dict(count=count, columns=columns, indexes=indexes, foreign_keys=cur.fetchall())
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'database':DB_NAME,'tables':tables}, ensure_ascii=False, indent=2), encoding='utf-8')
    for name, item in sorted(tables.items()):
        unique = {}
        for index in item['indexes']:
            if not index['Non_unique']: unique.setdefault(index['Key_name'],[]).append(index['Column_name'])
        print(name, item['count'], 'unique=' + json.dumps(unique), flush=True)

if __name__ == '__main__': main()
