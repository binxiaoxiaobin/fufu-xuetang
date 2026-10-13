"""Read-only public HTTP checks and transfer sizes; no authentication data exported."""
import json, gzip, time, urllib.request, urllib.error
from pathlib import Path
result={}
for path in ['/api/health','/api/stories?page=1&page_size=12','/api/questions','/page-loader.js']:
    started=time.perf_counter()
    request=urllib.request.Request('http://127.0.0.1:8000'+path,headers={'Accept-Encoding':'gzip'})
    with urllib.request.urlopen(request,timeout=15) as response:
        body=response.read();headers=response.headers
        decoded=gzip.decompress(body) if headers.get('Content-Encoding')=='gzip' else body
        row={'status':response.status,'wire_bytes':len(body),'decoded_bytes':len(decoded),'milliseconds':round((time.perf_counter()-started)*1000,1),'encoding':headers.get('Content-Encoding'),'cache_control':headers.get('Cache-Control')}
        if path.startswith('/api/stories'):
            data=json.loads(decoded);row.update(total=data['total'],items=len(data['items']),optimized_covers=sum('/assets/optimized/' in str(item['cover']) for item in data['items']),category_totals=data.get('category_totals'))
        if path=='/page-loader.js':
            request=urllib.request.Request('http://127.0.0.1:8000'+path,headers={'Accept-Encoding':'gzip','If-Modified-Since':headers['Last-Modified']})
            try: urllib.request.urlopen(request,timeout=15)
            except urllib.error.HTTPError as error:
                assert error.code==304;row['conditional_status']=error.code
        result[path]=row
target=Path(__file__).resolve().parent.parent/'artifacts/http-audit-after.json'
target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
