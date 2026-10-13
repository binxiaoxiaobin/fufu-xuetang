# -*- coding: utf-8 -*-
"""Fill the 26 English letter-name recordings in the shared speech library."""
import asyncio,hashlib,json,os,string,sys
from pathlib import Path
from urllib.request import getproxies
import edge_tts
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from speech_config import ENGLISH
from speech_manifest import merge_manifest
MANIFEST=ROOT/'frontend/assets/audio/tts/manifest.json'
async def main():
    recordings=json.loads(MANIFEST.read_text(encoding='utf-8'))
    sem=asyncio.Semaphore(3)
    proxy=getproxies().get('https') or getproxies().get('http')
    proxy=proxy.replace('https://','http://') if proxy else None
    async def make(letter):
        text=letter+'.';key=hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]
        url=recordings.get(key,'/assets/audio/tts/en/'+key+'.mp3')
        path=ROOT/'frontend'/url.lstrip('/')
        async with sem:
            if not path.exists() or path.stat().st_size<1000:
                path.parent.mkdir(parents=True,exist_ok=True)
                temp=path.with_suffix('.letter.tmp')
                for attempt in range(4):
                    try:
                        await asyncio.wait_for(edge_tts.Communicate(text,proxy=proxy,**ENGLISH).save(str(temp)),65)
                        if temp.stat().st_size<1000:raise ValueError('Empty letter recording')
                        os.replace(str(temp),str(path));break
                    except Exception:
                        if temp.exists():temp.unlink()
                        if attempt==3:raise
                        await asyncio.sleep(2*(attempt+1))
            merge_manifest(MANIFEST,{key:url})
            print(letter,'ready',flush=True)
    await asyncio.gather(*(make(letter) for letter in string.ascii_uppercase))
if __name__=='__main__':
    if sys.platform=='win32':asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
