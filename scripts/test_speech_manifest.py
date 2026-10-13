"""Concurrent merges must preserve every published clip, including across processes."""
import json
import multiprocessing
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'backend'))
from speech_manifest import merge_manifest
from speech_config import CHINESE, PROFILES

def worker(path, label):
    for i in range(20):
        merge_manifest(Path(path), {'{}-{}'.format(label,i): '/assets/audio/test.mp3'})

if __name__ == '__main__':
    assert all(PROFILES[name] == CHINESE for name in ['xiaoyi','child','curious'])
    with tempfile.TemporaryDirectory(prefix='fufu-speech-check-') as directory:
        path = Path(directory)/'manifest.json'
        processes = [multiprocessing.Process(target=worker, args=(str(path), label)) for label in ['batch','http']]
        for process in processes:
            process.start()
        for process in processes:
            process.join(timeout=40)
            assert process.exitcode == 0
        assert len(json.loads(path.read_text(encoding='utf-8'))) == 40
    print('Unified profiles and concurrent manifest merges: passed')
