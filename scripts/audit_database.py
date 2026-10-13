"""Read-only database inventory and query plans. No learner records exported."""
import os,sys,json,getpass,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(root/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
result={}
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT VERSION() AS version');result['version']=cur.fetchone()['version']
        cur.execute('SELECT TABLE_NAME, TABLE_ROWS,DATA_LENGTH,INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');result['tables']=cur.fetchall()
        result['counts']={};result['indexes']={}
        for table in ['questions','stories','content_items','content_segments','media_assets','completions','ledger','quiz_sessions','question_attempts','farm_action_receipts']:
            cur.execute('SHOW TABLES LIKE %s',(table,))
            if not cur.fetchone():continue
            cur.execute('SELECT COUNT(*) AS n FROM `'+table+'`');result['counts'][table]=cur.fetchone()['n']
            cur.execute('SHOW INDEX FROM `'+table+'`');result['indexes'][table]=[{'name':r['Key_name'],'column':r['Column_name'],'order':r['Seq_in_index']} for r in cur.fetchall()]
        result['plans']={}
        queries={'history':("SELECT question_id FROM completions WHERE learner_id=%s AND created_at>=CURDATE() ORDER BY id DESC LIMIT 10",(1,)),
                 'ledger':("SELECT id FROM ledger WHERE learner_id=%s ORDER BY id DESC LIMIT 20",(1,)),
                 'question_pool':("SELECT id FROM questions WHERE status='published' AND stage='小学' AND grade='二年级' AND subject='数学' AND id>=1 ORDER BY id LIMIT 120",()),
                 'stories':("SELECT id,title FROM stories WHERE story_type='chengyu' ORDER BY id LIMIT 12",())}
        for key,(sql,params) in queries.items():
            cur.execute('EXPLAIN '+sql,params);result['plans'][key]=cur.fetchall()
target=root/'artifacts'/('database-audit-after.json' if '--after' in sys.argv else 'database-audit.json');target.write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
print(json.dumps({'version':result['version'],'counts':result['counts'],'plans':result['plans']},ensure_ascii=False,default=str))
