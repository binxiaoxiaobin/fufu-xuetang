"""Restart this project's local backend with a password entered privately."""
import getpass
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
os.environ['FUFU_BIND_HOST'] = '0.0.0.0'
sys.path.insert(0, str(ROOT/'backend'))
import toy_games
toy_games.initialize()
check = subprocess.run(['powershell','-NoProfile','-Command',
    "$item=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($item){$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$item.OwningProcess); if($proc.CommandLine -match 'backend[\\\\/]server.py'){Stop-Process -Id $proc.ProcessId}else{exit 2}}; exit 0"],capture_output=True)
if check.returncode:
    raise RuntimeError('Port 8000 is used by a different process; no process was stopped')
logs = ROOT/'artifacts'; logs.mkdir(exist_ok=True)
with (logs/'backend-toy.stdout.log').open('ab') as stdout, (logs/'backend-toy.stderr.log').open('ab') as stderr:
    process = subprocess.Popen([sys.executable,'-u',str(ROOT/'backend/server.py')],cwd=str(ROOT),env=os.environ.copy(),stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW)
time.sleep(3)
if process.poll() is not None:
    raise RuntimeError('Backend did not start; inspect the local backend log')
print('Backend restarted on 0.0.0.0:8000; PID',process.pid)
