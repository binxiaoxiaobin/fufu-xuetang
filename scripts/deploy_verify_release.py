"""Read-only verification of a published release and its content references."""
import argparse
import hashlib
import gzip
import importlib.util
import json
import sys
from pathlib import Path
import urllib.request
import urllib.error

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);args=parser.parse_args()
    root=Path('/srv/fufu/current').resolve();stage=Path('/srv/fufu/staging')/args.tag
    spec=importlib.util.spec_from_file_location('snapshot',stage/'deploy_content_snapshot.py')
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    helper.load_env('/etc/fufu.env');sys.path.insert(0,str(root/'backend'))
    from mysql_db import connection
    import game_access
    gate=game_access.GameAccessRoutes()
    for filename in ('puzzles.js','toy-arcade.js','kart-fullscreen.js','assets/games/astra-originals/mosswing/index.html','assets/games/astra-originals/thunderfall/index.html','assets/games/astra-originals/iron-bastion/index.html'):
        if not gate.game_file_protected(root/'frontend'/filename):raise RuntimeError('Shared game asset protection failed: '+filename)
    with gzip.open(stage/'content-only.json.gz','rt',encoding='utf-8') as f:packet=json.load(f)
    report={'release':root.name,'content_differences':{},'missing_local_registered_assets':[],'missing_referenced_assets':{},'api_checks':{}}
    effective=stage/'release-manifest-effective.json'
    manifest=json.loads((effective if effective.exists() else stage/'release-manifest.json').read_text())
    for name,item in manifest['code_files'].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Deployed source checksum mismatch: '+name)
    report['verified_code_files']=len(manifest['code_files'])
    with connection() as conn:
        with conn.cursor() as cur:
            maps,plans=helper.plan(cur,packet)
            for table,item in plans.items():
                info=item['schema'];current={helper.identity(table,row,info):row for row in item['current']}
                differences={}
                for expected in item['rows']:
                    actual=current.get(helper.identity(table,expected,info))
                    if actual is None:raise RuntimeError('Missing published content: '+table)
                    if helper.canonical(actual,info)!=helper.canonical(expected,info):
                        for field in expected:
                            if field in ('created_at','updated_at','applied_at'):continue
                            if helper.canonical({field:actual[field]},info)!=helper.canonical({field:expected[field]},info):differences[field]=differences.get(field,0)+1
                if differences:report['content_differences'][table]=differences
            missing_ids=set()
            for row in plans['media_assets']['current']:
                path=row['public_path']
                if path.startswith('/assets/') and not (root/'frontend'/path.lstrip('/')).is_file():
                    report['missing_local_registered_assets'].append(path);missing_ids.add(row['id'])
            for table,item in plans.items():
                if table=='media_assets':continue
                for row in item['current']:
                    for field,value in row.items():
                        if (field=='asset_id' or field.endswith('_asset_id')) and value in missing_ids:
                            report['missing_referenced_assets'][table+'.'+field]=report['missing_referenced_assets'].get(table+'.'+field,0)+1
            report['counts']={table:len(item['current']) for table,item in plans.items()}
            cur.execute('SELECT slug,details_json FROM toy_games ORDER BY position')
            for row in cur.fetchall():
                game=json.loads(row['details_json'])
                for field in ('entry','cover'):
                    if not (root/'frontend'/game[field].lstrip('/')).is_file():raise RuntimeError('Missing game file: '+row['slug'])
            cur.execute('SELECT migration_key FROM content_migrations')
            report['migration_count']=len(cur.fetchall())
    for path in ('/api/health','/api/stories','/api/learning/reader-lessons','/api/learning/reading-cards?kind=poetry','/api/learning/reading-cards?kind=science','/api/learning/history','/api/learning/history-wisdom','/api/learning/english-songs','/api/content'):
        with urllib.request.urlopen('http://127.0.0.1'+path,timeout=15) as response:
            data=json.loads(response.read());report['api_checks'][path]={'status':response.status,'total':data.get('total') if isinstance(data,dict) else len(data)}
    for path in ('/','/admin.html','/community.html','/reader-lessons.js','/reader-lessons.css'):
        with urllib.request.urlopen('http://127.0.0.1'+path,timeout=15) as response:
            raw=response.read();report['api_checks'][path]={'status':response.status,'bytes':len(raw)}
            if path=='/' and b'20261012-first-stage-match-1' not in raw:raise RuntimeError('Homepage version is not the current version')
            if path=='/reader-lessons.js' and raw!=(root/'frontend/reader-lessons.js').read_bytes():raise RuntimeError('Nginx served stale reader lesson code')
    for path in ('/api/toy-games','/puzzles.js','/toy-arcade.js','/kart-fullscreen.js','/assets/games/astra-originals/mosswing/index.html','/assets/%67ames/astra-originals/mosswing/index.html','/assets/games/astra-originals/mosswing/','/assets/games/astra-originals/thunderfall/index.html','/assets/games/astra-originals/iron-bastion/index.html'):
        try:
            urllib.request.urlopen('http://127.0.0.1'+path,timeout=15)
            raise RuntimeError('Unauthenticated game asset was not blocked: '+path)
        except urllib.error.HTTPError as error:
            if error.code!=401:raise
            report['api_checks'][path]={'status':error.code,'login_required':True}
    if report['content_differences'] or report['missing_referenced_assets']:raise RuntimeError('Published content failed verification')
    (stage/'public-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    report['missing_local_registered_asset_count']=len(report.pop('missing_local_registered_assets'))
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
