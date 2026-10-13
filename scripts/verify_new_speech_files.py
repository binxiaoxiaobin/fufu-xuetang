"""Read-only validation of complete files published by the current speech worker."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import build_opener, ProxyHandler, Request
from mutagen.mp3 import MP3
ROOT=Path(__file__).resolve().parents[1]
FE=ROOT/'frontend'
files=list((FE/'assets/audio/tts/consistent-20261009').glob('*.mp3'))+list((FE/'assets/audio/learning-science').glob('*.mp3'))
def inspect(file):
    path='/'+file.relative_to(FE).as_posix()
    try:
        info=MP3(file).info
        if info.length<=0:raise ValueError('Zero duration')
        with build_opener(ProxyHandler({})).open(Request('http://127.0.0.1:8000'+path,method='HEAD'),timeout=8) as response:
            assert response.status==200 and response.headers.get('Content-Type')=='audio/mpeg'
        return None
    except Exception as exc:return {'path':path,'error':type(exc).__name__}
with ThreadPoolExecutor(max_workers=6) as pool:
    failures=[r for r in pool.map(inspect,files) if r]
result={'checked':len(files),'failures':failures}
(ROOT/'artifacts/new-speech-file-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
if failures:raise SystemExit(1)
