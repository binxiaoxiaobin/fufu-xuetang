"""Prepare local word/sentence recordings with the project's shared voices."""
import asyncio,hashlib,json,os,sys
from pathlib import Path
from urllib.request import getproxies
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import edge_tts
from speech_config import CHINESE,ENGLISH,VOICE_VERSION
SEED=ROOT/'backend/seed_data/reader_lessons.json'
async def main():
    units=json.loads(SEED.read_text(encoding='utf-8'))
    semaphore=asyncio.Semaphore(4)
    proxy=getproxies().get('https') or getproxies().get('http')
    proxy=proxy.replace('https://','http://') if proxy else None
    completed=0
    locks={}
    jobs=[(item,field) for item in units for field in (('word','sentence','translation') if item['language']=='en-US' else ('word','sentence'))]
    async def make(item,field):
        nonlocal completed
        config=CHINESE if item['language']=='zh-CN' or field=='translation' else ENGLISH
        digest=hashlib.sha256((VOICE_VERSION+json.dumps(config,sort_keys=True)+item[field]).encode()).hexdigest()[:24]
        path='/assets/audio/reader-lessons/'+digest+'.mp3'
        file=ROOT/'frontend'/path.lstrip('/');file.parent.mkdir(parents=True,exist_ok=True)
        async with locks.setdefault(path,asyncio.Lock()), semaphore:
            if not file.exists() or file.stat().st_size<1000:
                temp=file.with_suffix('.tmp')
                for attempt in range(5):
                    try:
                        await asyncio.wait_for(edge_tts.Communicate(item[field],proxy=proxy,**config).save(str(temp)),80)
                        if temp.stat().st_size<1000:raise ValueError('Empty audio')
                        os.replace(str(temp),str(file));break
                    except Exception:
                        if temp.exists():temp.unlink()
                        if attempt==4:raise
                        await asyncio.sleep(3*(attempt+1))
            item[field+'_audio']=path
            completed+=1
            if completed%24==0:print('Ready recordings: {}/{}'.format(completed,len(jobs)),flush=True)
    await asyncio.gather(*(make(item,field) for item,field in jobs))
    temp=SEED.with_suffix('.tmp');temp.write_text(json.dumps(units,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(str(temp),str(SEED))
    print('All {} recordings ready.'.format(len(jobs)),flush=True)
if __name__=='__main__':
    if sys.platform=='win32':asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
