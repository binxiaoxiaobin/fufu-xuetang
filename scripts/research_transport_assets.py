"""Inspect licensed transport candidates in the public Objaverse distribution."""
import gzip, json, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT/'artifacts/transport-sources/realistic'
CACHE.mkdir(parents=True,exist_ok=True)
BASE = 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/'
def session():
    s=requests.Session();s.trust_env=False
    proxy=urllib.request.getproxies().get('https')
    if proxy:s.proxies={'http':proxy.replace('https://','http://'),'https':proxy.replace('https://','http://')}
    return s
def cached(path):
    local=CACHE/path;local.parent.mkdir(parents=True,exist_ok=True)
    if not local.exists():
        r=session().get(BASE+path,timeout=60);r.raise_for_status();local.write_bytes(r.content)
    return json.loads(gzip.decompress(local.read_bytes()))
if __name__=='__main__':
    with ThreadPoolExecutor(2) as pool:
        lvis,paths=list(pool.map(cached,['lvis-annotations.json.gz','object-paths.json.gz']))
    cats={k:v for k,v in lvis.items() if any(t in k.lower() for t in ['train','locomotive','helicopter','fire_engine','sailboat','ship','airplane','taxi','boat'])}
    (CACHE/'categories.json').write_text(json.dumps(cats),encoding='utf8')
    print([(k,len(v)) for k,v in cats.items()],flush=True)
    print([(k,[paths.get(uid) for uid in v[:3]]) for k,v in cats.items()],flush=True)
    targets=['airplane','helicopter','bullet_train','cab_(taxi)','fire_engine','cargo_ship','boat','passenger_car_(part_of_a_train)','train_(railroad_vehicle)']
    wanted={uid:cat for cat in targets for uid in cats[cat]}
    buckets={}
    for uid,cat in wanted.items():
        bucket=paths[uid].split('/')[1];buckets.setdefault(bucket,[]).append(uid)
    ranked=sorted(buckets,key=lambda b:len(buckets[b]),reverse=True)[:18]
    def inspect(bucket):
        data=cached('metadata/'+bucket+'.json.gz')
        return {uid:dict(data[uid],category=wanted[uid],object_path=paths[uid]) for uid in buckets[bucket] if uid in data}
    candidates={}
    with ThreadPoolExecutor(4) as pool:
        for data in pool.map(inspect,ranked):candidates.update(data)
    (CACHE/'candidates.json').write_text(json.dumps(candidates,ensure_ascii=False),encoding='utf8')
    for uid,item in candidates.items():
        if item.get('license') in ['by','cc0']:
            print(uid,item['category'],item.get('name'),item.get('faceCount'),item.get('license'),flush=True)
