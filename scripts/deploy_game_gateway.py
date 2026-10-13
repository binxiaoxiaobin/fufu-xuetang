"""Preserve parent game access when Nginx serves shared release assets."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess

def main():
    stage=Path('/srv/fufu/staging/20261012-content-full-2');root=Path('/srv/fufu/current').resolve()
    backup=Path('/srv/fufu/backups/20261012-content-full-2/game-gateway')
    backup.mkdir(mode=0o700);os.chmod(backup,0o700)
    spec=importlib.util.spec_from_file_location('controller',stage/'deploy_cloud_release.py')
    controller=importlib.util.module_from_spec(spec);spec.loader.exec_module(controller)
    def run(*args):subprocess.run(args,check=True)
    def content(mode,output):run('/srv/fufu/venv/bin/python',str(stage/'deploy_content_snapshot.py'),mode,'--project-root',str(root),'--env-file','/etc/fufu.env','--output',str(output))
    code=root/'backend/game_access.py';config=Path('/etc/nginx/sites-enabled/fufu').resolve()
    old_config=config.read_text();anchor='    location /assets/optimized/ {'
    if anchor not in old_config or 'location ^~ /assets/games/' in old_config:raise ValueError('Unexpected Nginx config')
    gateway='''    location ^~ /assets/games/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
        add_header Cache-Control "private, no-store" always;
    }
    location ~ ^/(puzzles|toy-arcade|kart-fullscreen)\\.js$ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "private, no-store" always;
    }
'''
    shutil.copy2(code,backup/'game_access.py');shutil.copy2(config,backup/'nginx.conf')
    try:
        run('systemctl','stop','nginx');run('systemctl','stop','fufu')
        content('audit',backup/'users-before.json');content('backup',backup/'database.json.gz')
        shutil.copyfile(stage/'game_access.py',code);os.chmod(code,0o644)
        config.write_text(old_config.replace(anchor,gateway+anchor));run('nginx','-t')
        run('systemctl','restart','fufu');controller.healthy(8000)
        content('audit',backup/'users-after.json')
        if (backup/'users-before.json').read_bytes()!=(backup/'users-after.json').read_bytes():raise RuntimeError('Protected user data changed')
        run('systemctl','restart','nginx');controller.healthy(80)
        shutil.copyfile(stage/'nginx.conf.example',root/'deploy/nginx.conf.example')
        manifest=json.loads((stage/'release-manifest.json').read_text())
        for name in ('backend/game_access.py','deploy/nginx.conf.example'):
            raw=(root/name).read_bytes();manifest['code_files'][name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        (stage/'release-manifest-effective.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
        print('GAME_GATEWAY_OK: shared asset paths protected; Nginx config validated; user data unchanged; services restarted.',flush=True)
    except Exception:
        run('systemctl','stop','nginx');run('systemctl','stop','fufu')
        shutil.copy2(backup/'game_access.py',code);shutil.copy2(backup/'nginx.conf',config)
        if (backup/'database.json.gz').exists():controller.restore_database(stage/'deploy_content_snapshot.py',root,backup/'database.json.gz')
        run('systemctl','restart','fufu')
        try:controller.healthy(8000)
        finally:run('systemctl','restart','nginx')
        raise

if __name__=='__main__':main()
