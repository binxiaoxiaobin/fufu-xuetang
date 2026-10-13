# -*- coding: utf-8 -*-
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from mysql_db import connection
with connection() as db:
    with db.cursor() as cur:
        cur.execute('SELECT id,title,slug FROM stories')
        print(json.dumps(cur.fetchall(),ensure_ascii=False))
        cur.execute("SELECT author,COUNT(*) n FROM learning_reading_cards WHERE kind='poetry' GROUP BY author")
        print(json.dumps(cur.fetchall(),ensure_ascii=False))
