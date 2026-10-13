"""Configure public IP HTTPS; keep loopback HTTP for the existing admin tunnel."""
import argparse
from pathlib import Path
import shutil
import subprocess

BASE=Path('/srv/fufu')
BACKUP=BASE/'backups/https-20261012-1'
CONFIG=Path('/etc/nginx/sites-enabled/fufu').resolve()
ACME=BASE/'acme'
CERTBOT='/opt/fufu-certbot/bin/certbot'

def run(*args):subprocess.run(args,check=True)

def install_config(text):
    previous=CONFIG.read_text();CONFIG.write_text(text)
    try:run('nginx','-t');run('systemctl','reload','nginx')
    except Exception:
        CONFIG.write_text(previous);run('nginx','-t');run('systemctl','reload','nginx');raise

def main():
    parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['prepare','tls','redirect','renewal']);args=parser.parse_args()
    if args.phase=='prepare':
        BACKUP.mkdir(mode=0o700,parents=True,exist_ok=False)
        shutil.copy2(CONFIG,BACKUP/'nginx-before.conf')
        (ACME/'.well-known/acme-challenge').mkdir(parents=True,exist_ok=True)
        challenge='''    location ^~ /.well-known/acme-challenge/ {
        root /srv/fufu/acme;
        default_type text/plain;
        try_files $uri =404;
    }
'''
        original=CONFIG.read_text()
        if 'location ^~ /.well-known/acme-challenge/' in original:raise ValueError('Existing ACME configuration requires review')
        prepared=original.replace('    location /api/admin/ {',challenge+'    location /api/admin/ {',1)
        if prepared==original:raise ValueError('Unexpected server config')
        (BACKUP/'nginx-acme.conf').write_text(prepared)
        install_config(prepared);run('ufw','allow','443/tcp')
        (ACME/'.well-known/acme-challenge/fufu-probe').write_text('fufu-acme-ready\n')
        print('ACME_READY: HTTP unchanged, challenge route enabled, server firewall allows 443.',flush=True)
    elif args.phase in ('tls','redirect'):
        original=(BACKUP/'nginx-acme.conf').read_text()
        certificate=Path('/etc/letsencrypt/live/fufu-ip/fullchain.pem')
        if not certificate.is_file():raise ValueError('A trusted certificate is required')
        tls=original.replace('    listen 80;','''    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/fufu-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fufu-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:FufuTLS:10m;
    ssl_session_timeout 1d;''',1)
        tls=tls.replace('        proxy_set_header X-Forwarded-Proto $scheme;',
                        '        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_cookie_flags fufu_session secure;')
        if args.phase=='tls':text=original+'\n'+tls
        else:
            # An explicit loopback listener is selected before the wildcard listener.
            # The user's existing SSH forward to 127.0.0.1:80 keeps its origin/login.
            loopback=original.replace('    listen 80;','    listen 127.0.0.1:80;',1)
            public='''server {
    listen 80;
    server_name 106.53.96.154;
    location ^~ /.well-known/acme-challenge/ {
        root /srv/fufu/acme;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 308 https://106.53.96.154$request_uri; }
}
'''
            text=public+'\n'+loopback+'\n'+tls
        install_config(text)
        (BACKUP/('nginx-'+args.phase+'.conf')).write_text(text)
        print('NGINX_'+args.phase.upper()+'_READY',flush=True)
    else:
        hooks=Path('/etc/letsencrypt/renewal-hooks/deploy');hooks.mkdir(parents=True,exist_ok=True)
        hook=hooks/'fufu-nginx';hook.write_text('#!/bin/sh\nset -eu\n/usr/sbin/nginx -t\n/bin/systemctl reload nginx\n');hook.chmod(0o755)
        service=Path('/etc/systemd/system/fufu-certbot-renew.service')
        timer=Path('/etc/systemd/system/fufu-certbot-renew.timer')
        if service.exists() or timer.exists():raise ValueError('Renewal unit already exists')
        service.write_text('''[Unit]
Description=Renew Fufu public IP HTTPS certificate
Wants=network-online.target
After=network-online.target nginx.service
ConditionPathExists=/etc/letsencrypt/renewal/fufu-ip.conf

[Service]
Type=oneshot
ExecStart=/opt/fufu-certbot/bin/certbot renew --cert-name fufu-ip --quiet
TimeoutStartSec=600
''')
        timer.write_text('''[Unit]
Description=Check Fufu HTTPS certificate renewal every six hours

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=1800
Persistent=true
Unit=fufu-certbot-renew.service

[Install]
WantedBy=timers.target
''')
        run('systemctl','daemon-reload');run('systemctl','enable','--now','fufu-certbot-renew.timer')
        print('AUTOMATIC_RENEWAL_READY: six-hour checks and verified Nginx deploy hook.',flush=True)

if __name__=='__main__':main()
