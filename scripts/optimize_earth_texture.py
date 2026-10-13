"""Keep the source map; generate and register a smaller GPU texture for the moon lab."""
import os, sys, getpass, hashlib, json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
import content_catalog
from mysql_db import connection
source=root/'frontend/assets/earth-nasa-source.jpg'
digest=hashlib.sha256(source.read_bytes()).hexdigest()[:24]
target=root/'frontend/assets/optimized'/('earth-'+digest+'-1536.webp')
target.parent.mkdir(parents=True,exist_ok=True)
with Image.open(source) as im:
    original_size=im.size
    im=im.convert('RGB');im.thumbnail((1536,1536),Image.Resampling.LANCZOS if hasattr(Image,'Resampling') else Image.LANCZOS)
    im.save(target,'WEBP',quality=85,method=6);size=im.size
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM media_assets WHERE public_path=%s',('/assets/earth-nasa-source.jpg',))
        original=cur.fetchone()
if not original:
    source_id=content_catalog.register_media({'public_path':'/assets/earth-nasa-source.jpg','media_kind':'image','mime_type':'image/jpeg','file_bytes':source.stat().st_size,'width':original_size[0],'height':original_size[1],'title':'地月实验室已有地球纹理'})
    original={'id':source_id,'media_kind':'image','title':'地月实验室地球纹理'}
path='/'+target.relative_to(root/'frontend').as_posix()
values=dict(original);values.update(public_path=path,mime_type='image/webp',file_bytes=target.stat().st_size,width=size[0],height=size[1])
variant_id=content_catalog.register_media(values)
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute("INSERT INTO media_asset_variants(source_asset_id,variant_key,variant_asset_id) VALUES(%s,'texture',%s) ON DUPLICATE KEY UPDATE variant_asset_id=VALUES(variant_asset_id)",(original['id'],variant_id))
    conn.commit()
p=root/'frontend/moon.js';text=p.read_text(encoding='utf-8');text=text.replace('/assets/earth-nasa-source.jpg',path);p.write_text(text,encoding='utf-8')
result={'source_size':original_size,'texture_size':size,'original_bytes':source.stat().st_size,'optimized_bytes':target.stat().st_size,'source_decoded_rgba_bytes':original_size[0]*original_size[1]*4,'texture_decoded_rgba_bytes':size[0]*size[1]*4,'path':path}
(root/'artifacts/earth-texture-optimization.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
