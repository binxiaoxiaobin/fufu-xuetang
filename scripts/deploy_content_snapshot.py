"""Content-only export/merge with stable production IDs and user-data auditing.

Never imports account/session/progress/community tables. Publication identities
are matched by slug/path/source key; production row IDs are retained so existing
learner references continue to point at the same content.
"""
import argparse
import base64
import datetime
import decimal
import gzip
import hashlib
import json
import os
import shlex
import sys
from pathlib import Path

TABLES = (
    'media_assets','stories','questions','curriculum_books','curriculum_units','curriculum_topics',
    'store_items','content_items','learning_action_cards','learning_pinyin_cards','learning_reading_cards',
    'learning_english_songs','learning_history_periods','learning_history_wisdom','farm_catalog',
    'solar_bodies','transport_exhibits','earth_culture_entries','toy_games','media_asset_variants',
    'content_segments','learning_english_song_lines','learning_history_links','province_photo_links',
    'question_options','question_curriculum','story_media_links','scene_media_links','toy_game_levels',
    'content_migrations',
)
USER_TABLES = {
    'admin_audit_logs','completions','farm_action_receipts','game_access_grants','game_access_settings',
    'game_rewards','learner_farms','learning_daily_explorations','learning_daily_plans','ledger',
    'owned_items','parent_point_grants','pet_equipment','pet_state','profile','question_attempts',
    'quiz_session_questions','quiz_sessions','reader_progress','redemption_orders','story_readings',
    'toy_game_rewards','toy_game_saves','user_accounts','user_sessions',
}
KEYS = {
    'media_assets':('public_path',), 'stories':('slug',), 'store_items':('kind','name'),
    'content_items':('slug',), 'learning_action_cards':('slug',), 'learning_pinyin_cards':('slug',),
    'learning_reading_cards':('slug',), 'learning_english_songs':('slug',),
    'learning_history_periods':('slug',), 'content_segments':('item_id','chapter_no','position'),
    'learning_english_song_lines':('song_id','position'),
    'learning_history_links':('period_id','person_slug','content_kind','content_id'),
    'question_options':('question_id','option_key'),
}
REFERENCES = {
    'curriculum_units':{'book_id':'curriculum_books'},
    'curriculum_topics':{'unit_id':'curriculum_units'},
    'content_segments':{'item_id':'content_items'},
    'learning_english_song_lines':{'song_id':'learning_english_songs'},
    'learning_history_links':{'period_id':'learning_history_periods'},
    'question_options':{'question_id':'questions'},
    'question_curriculum':{'question_id':'questions','topic_id':'curriculum_topics'},
    'story_media_links':{'story_id':'stories'},
}
PRUNE = {
    'content_segments':('item_id','content_items'),
    'learning_english_song_lines':('song_id','learning_english_songs'),
    'learning_history_links':('period_id','learning_history_periods'),
    'question_options':('question_id','questions'),
    'question_curriculum':('question_id','questions'),
    'story_media_links':('story_id','stories'),
}

def json_value(value):
    if isinstance(value, datetime.datetime): return value.isoformat(' ')
    if isinstance(value, (datetime.date,datetime.time)): return value.isoformat()
    if isinstance(value, decimal.Decimal): return str(value)
    if isinstance(value, bytes): return {'__bytes__':base64.b64encode(value).decode()}
    raise TypeError(type(value).__name__)

def dumps(value): return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),default=json_value)

def load_env(path):
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line=line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        key,value=(line[7:] if line.startswith('export ') else line).split('=',1)
        os.environ[key.strip()]=' '.join(shlex.split(value,comments=True))

def names(cur):
    cur.execute('SHOW FULL TABLES WHERE Table_type="BASE TABLE"')
    return [list(row.values())[0] for row in cur.fetchall()]

def schema(cur,table):
    cur.execute('SHOW FULL COLUMNS FROM `'+table+'`');columns=cur.fetchall()
    cur.execute('SHOW INDEX FROM `'+table+'`');indexes=cur.fetchall()
    pk=[row['Column_name'] for row in sorted(indexes,key=lambda r:r['Seq_in_index']) if row['Key_name']=='PRIMARY']
    auto=next((row['Field'] for row in columns if 'auto_increment' in row['Extra']),None)
    return {'columns':[row['Field'] for row in columns], 'json':[row['Field'] for row in columns if row['Type'].lower()=='json'], 'pk':pk,'auto':auto}

def rows(cur,table,info):
    cur.execute('SELECT * FROM `'+table+'` ORDER BY '+','.join('`'+c+'`' for c in info['pk']))
    return cur.fetchall()

def protected(table): return table in USER_TABLES or table.startswith('community_')

def fingerprints(cur):
    result={}
    for table in sorted(names(cur)):
        if not protected(table): continue
        info=schema(cur,table);data=rows(cur,table,info)
        result[table]={'count':len(data),'sha256':hashlib.sha256(dumps(data).encode()).hexdigest()}
    return result

def export(cur,path):
    unknown=set(names(cur))-set(TABLES)-{t for t in names(cur) if protected(t)}
    if unknown: raise ValueError('Unclassified database tables: '+str(sorted(unknown)))
    data={}
    for table in TABLES:
        info=schema(cur,table);data[table]={'schema':info,'rows':rows(cur,table,info)}
        print('EXPORT',table,len(data[table]['rows']),flush=True)
    packet={'format':'fufu-content-only-v1','tables':data}
    with gzip.open(path,'wt',encoding='utf-8') as f: f.write(dumps(packet))
    print('Exported publication tables only; no local user data.',flush=True)

def backup(cur,path):
    packet={'format':'fufu-server-private-backup-v1','tables':{}}
    for table in names(cur):
        info=schema(cur,table);cur.execute('SHOW CREATE TABLE `'+table+'`')
        ddl=list(cur.fetchone().values())[1]
        packet['tables'][table]={'create':ddl,'schema':info,'rows':rows(cur,table,info)}
    path.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(path,'wt',encoding='utf-8') as f: f.write(dumps(packet))
    os.chmod(path,0o600)
    print('Private production database backup saved on the server.',flush=True)

def identity(table,row,info):
    if table=='questions':
        if row.get('source_record_id'):return ('source',row['source_record_id'])
        return ('legacy',row['subject'],row['stage'],row['title'])
    return tuple(row[k] for k in KEYS.get(table,tuple(info['pk'])))

def mapped(maps,table,value):
    if value is None:return None
    if value not in maps.get(table,{}):raise ValueError('Missing content reference '+table+':'+str(value))
    return maps[table][value]

def history_content(maps,kind,value):
    return mapped(maps,{'story':'stories','poetry':'learning_reading_cards'}[kind],value)

def document_refs(doc,maps,table,depth=0):
    if isinstance(doc,list):return [document_refs(v,maps,table,depth+1) for v in doc]
    if not isinstance(doc,dict):return doc
    result={}
    for key,value in doc.items():
        if (key=='asset_id' or key.endswith('_asset_id')) and isinstance(value,int):
            result[key]=mapped(maps,'media_assets',value)
        elif table=='questions' and key in ('question_id','item_id') and isinstance(value,int):
            result[key]=mapped(maps,'questions',value)
        elif table=='questions' and key=='question_ids' and isinstance(value,list):
            result[key]=[mapped(maps,'questions',v) for v in value]
        elif table=='learning_history_periods' and key=='id' and depth==0 and isinstance(value,int):
            result[key]=mapped(maps,table,value)
        elif key=='content_id' and doc.get('content_kind') in ('story','poetry'):
            result[key]=history_content(maps,doc['content_kind'],value)
        else:result[key]=document_refs(value,maps,table,depth+1)
    return result

def transformed(table,row,maps,info):
    result=dict(row)
    for key,value in list(result.items()):
        if (key=='asset_id' or key.endswith('_asset_id')) and value is not None:
            result[key]=mapped(maps,'media_assets',value)
    for field,parent in REFERENCES.get(table,{}).items():result[field]=mapped(maps,parent,result[field])
    if table=='learning_history_links':result['content_id']=history_content(maps,result['content_kind'],result['content_id'])
    if info['auto']:
        result[info['auto']]=mapped(maps,table,row[info['auto']])
    for field in ('source_metadata','document_json','explanation_json'):
        if result.get(field):
            value=result[field] if isinstance(result[field],(dict,list)) else json.loads(result[field])
            result[field]=dumps(document_refs(value,maps,table))
    return result

def plan(cur,packet):
    maps={};plans={}
    for table in TABLES:
        item=packet['tables'][table];info=item['schema'];remote_info=schema(cur,table)
        if set(info['columns'])-set(remote_info['columns']):raise ValueError('Production schema missing columns: '+table)
        current=rows(cur,table,remote_info);index={}
        for row in current:
            key=identity(table,row,info)
            if key in index:raise ValueError('Ambiguous production content identity: '+table)
            index[key]=row
        source=item['rows'];auto=info['auto']
        if auto:
            used={r[auto] for r in current};allocate=max([0,*used,*(r[auto] for r in source)])+1
            mapping={};incoming=set()
            # Identity-bearing parents have no ID references in their natural key.
            # Child keys are resolved from the parent mappings prepared above.
            for row in source:
                candidate=dict(row)
                for field,parent in REFERENCES.get(table,{}).items():candidate[field]=mapped(maps,parent,candidate[field])
                if table=='learning_history_links':candidate['content_id']=history_content(maps,candidate['content_kind'],candidate['content_id'])
                key=identity(table,candidate,info)
                if key in incoming:raise ValueError('Ambiguous local content identity: '+table)
                incoming.add(key)
                if key in index:target=index[key][auto]
                elif row[auto] not in used:target=row[auto];used.add(target)
                else:target=allocate;allocate+=1;used.add(target)
                mapping[row[auto]]=target
            maps[table]=mapping
        elif len(info['pk'])==1:
            maps[table]={row[info['pk'][0]]:row[info['pk'][0]] for row in source}
        changed=[transformed(table,row,maps,info) for row in source]
        plans[table]={'rows':changed,'schema':info,'current':current}
        print('PLAN',table,len(changed),'mapped_ids',sum(k!=v for k,v in maps.get(table,{}).items()),flush=True)
    return maps,plans

def canonical(row,info):
    result={k:v for k,v in row.items() if k not in ('created_at','updated_at','applied_at')}
    for field,value in list(result.items()):
        if isinstance(value,str) and (field in info['json'] or field.endswith('_json') or field in ('paragraphs','tags','options','source_metadata')):
            try:result[field]=json.loads(value)
            except (json.JSONDecodeError,TypeError):pass
    return dumps(result)

def apply(cur,maps,plans):
    report={}
    for table in TABLES:
        item=plans[table];info=item['schema'];source=item['rows'];columns=info['columns']
        sql='INSERT INTO `'+table+'` ('+','.join('`'+c+'`' for c in columns)+') VALUES ('+','.join(['%s']*len(columns))+') ON DUPLICATE KEY UPDATE '+','.join('`'+c+'`=VALUES(`'+c+'`)' for c in columns if c not in info['pk'])
        if all(c in info['pk'] for c in columns):sql='INSERT IGNORE INTO `'+table+'` ('+','.join('`'+c+'`' for c in columns)+') VALUES ('+','.join(['%s']*len(columns))+')'
        for offset in range(0,len(source),250):
            cur.executemany(sql,[tuple(row[c] for c in columns) for row in source[offset:offset+250]])
        pruned=0
        if table in PRUNE:
            parent_field,parent=PRUNE[table];scope=set(maps[parent].values());keep={identity(table,row,info) for row in source}
            obsolete=[row for row in item['current'] if row[parent_field] in scope and identity(table,row,info) not in keep]
            if obsolete:
                cur.executemany('DELETE FROM `'+table+'` WHERE '+' AND '.join('`'+k+'`=%s' for k in info['pk']),[tuple(row[k] for k in info['pk']) for row in obsolete])
                pruned=len(obsolete)
        report[table]={'source_rows':len(source),'pruned_obsolete_content_children':pruned}
        print('APPLY',table,len(source),flush=True)
    for table in TABLES:
        item=plans[table];info=item['schema'];current={identity(table,row,info):row for row in rows(cur,table,info)}
        for expected in item['rows']:
            actual=current.get(identity(table,expected,info))
            if actual is None or canonical(actual,info)!=canonical(expected,info):
                raise ValueError('Content verification failed: '+table+' identity='+str(identity(table,expected,info)))
        report[table]['production_rows']=len(current)
    return report

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['export','plan','apply','audit','backup'])
    parser.add_argument('--project-root',default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--env-file');parser.add_argument('--snapshot');parser.add_argument('--output',required=True)
    parser.add_argument('--backup');parser.add_argument('--expected-database',default='fufu_learning')
    args=parser.parse_args()
    if args.env_file:load_env(args.env_file)
    sys.path.insert(0,str(Path(args.project_root)/'backend'))
    from mysql_db import connection,DB_NAME
    if DB_NAME!=args.expected_database:raise ValueError('Database target does not match the intended deployment.')
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    with connection() as conn:
        with conn.cursor() as cur:
            if args.mode=='export':export(cur,output);return
            if args.mode=='audit':output.write_text(dumps(fingerprints(cur)),encoding='utf-8');return
            if args.mode=='backup':backup(cur,output);return
            with gzip.open(args.snapshot,'rt',encoding='utf-8') as f:packet=json.load(f)
            if packet.get('format')!='fufu-content-only-v1' or set(packet['tables'])!=set(TABLES):raise ValueError('Unexpected/non-content snapshot table set.')
            if args.mode=='apply' and not args.backup:raise ValueError('A server-side database backup is required.')
            before=fingerprints(cur)
            if args.backup:backup(cur,Path(args.backup))
            maps,plans=plan(cur,packet)
            if args.mode=='plan':
                output.write_text(dumps({t:{'source_rows':len(p['rows'])} for t,p in plans.items()}),encoding='utf-8');return
            try:
                report=apply(cur,maps,plans)
                after=fingerprints(cur)
                if before!=after:raise ValueError('User-table data changed; content import will roll back.')
                conn.commit()
            except Exception:
                conn.rollback();raise
            output.write_text(dumps({'tables':report,'user_tables_unchanged':True,'user_audit_before':before,'user_audit_after':after}),encoding='utf-8')
            print('Verified content import committed; every protected user table is unchanged.',flush=True)

if __name__=='__main__':main()
