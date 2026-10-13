"""Reload the HTTP handlers against the existing, already initialized database.

Pinyin import is performed first. Other content being edited in parallel is not
reseeded by this preview restart.
"""
import getpass
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
sys.path.insert(0,str(ROOT/'backend'))
import pinyin_cards
pinyin_cards.initialize()
check=subprocess.run(['powershell','-NoProfile','-Command',
    "$item=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($item){$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$item.OwningProcess); if($proc.CommandLine -match 'backend[\\\\/]server.py'){Stop-Process -Id $proc.ProcessId}else{exit 2}}; exit 0"],capture_output=True)
if check.returncode:
    raise RuntimeError('Port 8000 belongs to another process')
code="import sys;sys.path.insert(0,'backend');from server import Handler,ThreadingHTTPServer;ThreadingHTTPServer(('0.0.0.0',8000),Handler).serve_forever()"
with (ROOT/'artifacts/backend-pinyin.stdout.log').open('ab') as out, (ROOT/'artifacts/backend-pinyin.stderr.log').open('ab') as err:
    process=subprocess.Popen([sys.executable,'-u','-c',code,'backend/server.py'],cwd=str(ROOT),env=os.environ.copy(),stdout=out,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW)
time.sleep(2)
if process.poll() is not None:
    raise RuntimeError('Preview service did not start')
print('Existing database service on 0.0.0.0:8000; PID',process.pid)
