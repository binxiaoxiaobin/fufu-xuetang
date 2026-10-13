"""Reload local HTTP code against an already initialized database, without reseeding."""
import getpass
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
sys.path.insert(0, str(ROOT / 'backend'))
# Validate code and connection before interrupting the running service.
from server import Handler
from mysql_db import connection
with connection() as conn:
    with conn.cursor() as cursor:
        cursor.execute('SELECT 1')
check = subprocess.run(['powershell', '-NoProfile', '-Command',
    "$item=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($item){$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$item.OwningProcess); if($proc.CommandLine -match 'backend[\\\\/]server.py'){Stop-Process -Id $proc.ProcessId}else{exit 2}}; exit 0"], capture_output=True)
if check.returncode:
    raise RuntimeError('Port 8000 belongs to a different process')
code = "import sys;sys.path.insert(0,'backend');from server import Handler,ThreadingHTTPServer;ThreadingHTTPServer(('0.0.0.0',8000),Handler).serve_forever()"
with (ROOT / 'artifacts/backend-reload.stdout.log').open('ab') as out, (ROOT / 'artifacts/backend-reload.stderr.log').open('ab') as err:
    process = subprocess.Popen([sys.executable, '-u', '-c', code, 'backend/server.py'], cwd=str(ROOT),
                               env=os.environ.copy(), stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
time.sleep(2)
if process.poll() is not None:
    raise RuntimeError('Local service failed to start; inspect backend-reload.stderr.log')
print('Existing database service on 0.0.0.0:8000; PID', process.pid)
