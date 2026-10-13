"""Local asset inventory; records metadata only, never credentials or learner content."""
import collections,json,struct
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
files=[];groups=collections.defaultdict(lambda:{'files':0,'bytes':0})
for path in (root/'frontend').rglob('*'):
    if not path.is_file():continue
    relative=path.relative_to(root/'frontend').as_posix();size=path.stat().st_size
    key='/'.join(relative.split('/')[:2]) if '/' in relative else 'entry-code'
    groups[key]['files']+=1;groups[key]['bytes']+=size
    row={'path':relative,'bytes':size}
    if path.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}:
        try:
            with Image.open(path) as im:
                row.update(width=im.width,height=im.height,decoded_rgba_bytes=im.width*im.height*4)
        except Exception:pass
    if path.suffix.lower()=='.glb':
        try:
            with path.open('rb') as handle:
                header=handle.read(20);length=struct.unpack('<I',header[12:16])[0]
                data=json.loads(handle.read(length))
            row['triangles']=sum(data['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3 for m in data.get('meshes',[]) for p in m['primitives'] if p.get('mode',4)==4)
            row['textures']=len(data.get('images',[]))
        except Exception:pass
    files.append(row)
result={'files':len(files),'total_bytes':sum(r['bytes'] for r in files),'groups':dict(groups),
        'largest_files':sorted(files,key=lambda r:r['bytes'],reverse=True)[:30],
        'largest_decoded_images':sorted([r for r in files if 'decoded_rgba_bytes' in r],key=lambda r:r['decoded_rgba_bytes'],reverse=True)[:25],
        'models':sorted([r for r in files if 'triangles' in r],key=lambda r:r['triangles'],reverse=True)[:25]}
target=root/'artifacts/resource-audit.json';target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files':result['files'],'total_MB':round(result['total_bytes']/1048576,1),'groups':{k:round(v['bytes']/1048576,1) for k,v in sorted(groups.items(),key=lambda x:-x[1]['bytes'])[:10]},'largest_files':result['largest_files'][:8],'largest_decoded_images':result['largest_decoded_images'][:5]},ensure_ascii=False))
