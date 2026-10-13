"""Verified content-only cloud release with private server backups and rollback."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

BASE=Path('/srv/fufu')

def run(*args):
    subprocess.run(args,check=True)

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def extract(archive,destination):
    destination.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive,'r:gz') as tf:
        for member in tf.getmembers():
            target=(destination/member.name).resolve()
            if not target.is_relative_to(destination.resolve()) or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe archive entry')
        tf.extractall(destination,filter='data')
    for path in destination.rglob('*'):
        os.chmod(path,0o755 if path.is_dir() else 0o644)

def atomic_bytes(target,data,uid,gid):
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_name(target.name+'.deployment-tmp')
    temporary.write_bytes(data);os.chmod(temporary,0o644);os.chown(temporary,uid,gid)
    os.replace(temporary,target)

def link_release(target):
    temporary=BASE/'current.deployment-tmp'
    if temporary.is_symlink():temporary.unlink()
    temporary.symlink_to(target);os.replace(temporary,BASE/'current')

def healthy(port):
    for _ in range(180):
        try:
            with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/api/health',timeout=2) as response:
                if response.status==200:return
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('Application health check did not pass')

def restore_database(helper,project,backup):
    spec=importlib.util.spec_from_file_location('snapshot_restore',helper)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    mod.load_env('/etc/fufu.env');sys.path.insert(0,str(project/'backend'))
    from mysql_db import connection
    with gzip.open(backup,'rt',encoding='utf-8') as f:packet=json.load(f)
    if packet['format']!='fufu-server-private-backup-v1':raise ValueError('Unexpected rollback backup')
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SET FOREIGN_KEY_CHECKS=0')
            try:
                for table,item in packet['tables'].items():
                    cur.execute('DELETE FROM `'+table+'`')
                    columns=item['schema']['columns']
                    sql='INSERT INTO `'+table+'` ('+','.join('`'+c+'`' for c in columns)+') VALUES ('+','.join('%s' for _ in columns)+')'
                    for offset in range(0,len(item['rows']),250):
                        values=[]
                        for row in item['rows'][offset:offset+250]:
                            values.append(tuple(mod.base64.b64decode(row[c]['__bytes__']) if isinstance(row[c],dict) and '__bytes__' in row[c] else row[c] for c in columns))
                        cur.executemany(sql,values)
                conn.commit()
            except Exception:conn.rollback();raise
            finally:cur.execute('SET FOREIGN_KEY_CHECKS=1')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Invalid release tag')
    stage=BASE/'staging'/args.tag;release=BASE/'releases'/args.tag;backup=BASE/'backups'/args.tag
    if release.exists() or backup.exists():raise ValueError('Release or backup already exists')
    manifest=json.loads((stage/'release-manifest.json').read_text())
    if manifest['tag']!=args.tag:raise ValueError('Tag mismatch')
    for name,expected in manifest['bundle_sha256'].items():
        if digest(stage/name)!=expected:raise ValueError('Bundle checksum mismatch')
    if digest(stage/'content-only.json.gz')!=manifest['content_snapshot_sha256']:raise ValueError('Content checksum mismatch')
    old=(BASE/'current').resolve();print('Preparing release; previous release:',old.name,flush=True)
    extract(stage/'code.tar.gz',release);extract(stage/'assets-delta.tar.gz',stage/'asset-delta')
    for name,item in manifest['code_files'].items():
        if digest(release/name)!=item['sha256']:raise ValueError('Code verification failed: '+name)
    for name,item in manifest['assets'].items():
        if digest(stage/'asset-delta'/name)!=item['sha256']:raise ValueError('Asset verification failed: '+name)
    for relative,target in [('frontend/assets','assets'),('backend/data','data'),('logs','logs')]:
        path=release/relative
        if path.exists():
            if any(path.iterdir()):raise ValueError('Shared directory is not empty')
            path.rmdir()
        path.symlink_to(BASE/'shared'/target)
    run('/srv/fufu/venv/bin/python','-m','compileall','-q',str(release/'backend'))
    run('nginx','-t')
    backup.mkdir(parents=True,mode=0o700);os.chmod(backup,0o700)
    (backup/'previous-release.txt').write_text(str(old))
    helper=stage/'deploy_content_snapshot.py';python='/srv/fufu/venv/bin/python'
    def content(mode,output,extra=()):
        run(python,str(helper),mode,'--project-root',str(release),'--env-file','/etc/fufu.env','--output',str(output),*extra)
    content('plan',backup/'content-plan.json',('--snapshot',str(stage/'content-only.json.gz')))
    user=pwd.getpwnam('fufu');asset_backup=backup/'assets';asset_backup.mkdir(mode=0o700)
    journal=[];database_backup=backup/'database.json.gz';committed=False;services_stopped=False
    try:
        print('Stopping services for consistent backup and publication.',flush=True)
        run('systemctl','stop','nginx');services_stopped=True;run('systemctl','stop','fufu')
        content('audit',backup/'users-before.json')
        for name,item in manifest['assets'].items():
            target=BASE/'shared/assets'/name;existed=target.exists()
            if existed:
                saved=asset_backup/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
            journal.append({'path':name,'existed':existed})
            (backup/'asset-journal.json').write_text(json.dumps(journal))
            raw=(stage/'asset-delta'/name).read_bytes()
            if item['mode']=='merge-json' and existed:
                merged=json.loads(target.read_text());merged.update(json.loads(raw));raw=json.dumps(merged,ensure_ascii=False,separators=(',',':')).encode()
            atomic_bytes(target,raw,user.pw_uid,user.pw_gid)
        content('apply',backup/'content-result.json',('--snapshot',str(stage/'content-only.json.gz'),'--backup',str(database_backup)))
        committed=True;link_release(release);run('systemctl','restart','fufu');healthy(8000)
        content('audit',backup/'users-after-startup.json')
        before=json.loads((backup/'users-before.json').read_text());after=json.loads((backup/'users-after-startup.json').read_text())
        if before!=after:raise RuntimeError('Startup changed protected user data; rolling back')
        run('systemctl','restart','nginx');healthy(80)
        run('systemctl','is-active','fufu','nginx')
        report={'release':str(release),'previous_release':str(old),'backup':str(backup),'user_tables_unchanged':True,'protected_tables':len(before),'asset_updates':len(journal),'content':json.loads((backup/'content-result.json').read_text())['tables']}
        (backup/'deployment-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print('DEPLOYMENT_OK: content verified, user data unchanged, frontend and backend restarted.',flush=True)
    except Exception:
        if services_stopped:
            print('Restoring previous release after failed deployment check.',flush=True)
            run('systemctl','stop','nginx');run('systemctl','stop','fufu');link_release(old)
            if committed:restore_database(helper,old,database_backup)
            for entry in reversed(journal):
                target=BASE/'shared/assets'/entry['path']
                if entry['existed']:atomic_bytes(target,(asset_backup/entry['path']).read_bytes(),user.pw_uid,user.pw_gid)
                elif target.exists():target.unlink()
            run('systemctl','restart','fufu')
            try:healthy(8000)
            finally:run('systemctl','restart','nginx')
            healthy(80)
        raise

if __name__=='__main__':main()
