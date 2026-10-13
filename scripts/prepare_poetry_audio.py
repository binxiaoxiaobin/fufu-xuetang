"""Generate local gentle neural recitations, resumable and bounded concurrency."""
import asyncio
import json
from pathlib import Path
from urllib.request import getproxies
import edge_tts

ROOT=Path(__file__).resolve().parents[1]
async def main():
    cards=json.loads((ROOT/'content/learning/poetry-cards.json').read_text(encoding='utf-8'))
    semaphore=asyncio.Semaphore(5)
    proxy=getproxies().get('https') or getproxies().get('http')
    if proxy:proxy=proxy.replace('https://','http://')
    failures=[];done=0
    async def build(card):
        nonlocal done
        dest=ROOT/'frontend'/card['audio_path'].lstrip('/')
        if dest.is_file() and dest.stat().st_size>1000:return
        dest.parent.mkdir(parents=True,exist_ok=True)
        async with semaphore:
            for attempt in range(4):
                temporary=dest.with_suffix('.tmp')
                try:
                    await asyncio.wait_for(edge_tts.Communicate(card['narration_text'],voice='zh-CN-XiaoxiaoNeural',rate='-18%',pitch='-2Hz',proxy=proxy).save(str(temporary)),timeout=65)
                    if temporary.stat().st_size<1000:raise RuntimeError('Empty audio')
                    temporary.replace(dest);done+=1
                    if done%10==0:print('Recitations prepared:',done,flush=True)
                    return
                except Exception as error:
                    temporary.unlink(missing_ok=True)
                    if attempt<3:await asyncio.sleep(2*(attempt+1))
                    else:failures.append(card['slug']);print('Failed:',card['slug'],type(error).__name__,flush=True)
    await asyncio.gather(*(build(c) for c in cards))
    print('Complete:',len(cards)-len(failures),'Failures:',len(failures),flush=True)
    if failures:raise RuntimeError('Retry recordings: '+','.join(failures))

asyncio.run(main())
