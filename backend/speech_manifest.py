"""Atomic manifest merges shared by independent batch and HTTP processes."""
import json
import os
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

@contextmanager
def manifest_lock(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(path) + '.lock', 'a+b') as handle:
        if handle.seek(0, 2) == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            deadline = time.monotonic() + 30
            while True:
                try:
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Audio manifest is busy')
                    time.sleep(.05)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

def merge_manifest(path, changes):
    path = Path(path)
    with manifest_lock(path):
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.update(changes)
        handle, temporary = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=str(path.parent))
        try:
            with os.fdopen(handle, 'w', encoding='utf-8') as output:
                json.dump(data, output, ensure_ascii=False)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return data
