"""Generate non-destructive WebP card variants and register their relationships in MySQL."""
import os, sys, getpass, hashlib, json
from pathlib import Path
from PIL import Image, ImageOps
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root/'backend'))
os.environ['FUFU_MYSQL_PASSWORD'] = getpass.getpass('Local MySQL password: ')
import content_catalog
from mysql_db import connection
content_catalog.initialize()
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT a.* FROM media_assets a JOIN story_media_links l ON l.asset_id=a.id WHERE l.role='cover'")
        assets = cur.fetchall()
output = root/'frontend/assets/optimized/stories'; output.mkdir(parents=True,exist_ok=True)
result = {'count':0,'original_bytes':0,'card_bytes':0,'skipped':[]}
for asset in assets:
    source = (root/'frontend'/asset['public_path'].lstrip('/')).resolve()
    try:
        source.relative_to((root/'frontend').resolve())
    except ValueError:
        continue
    try:
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((640,640),Image.Resampling.LANCZOS if hasattr(Image,'Resampling') else Image.LANCZOS)
            digest = hashlib.sha256(source.read_bytes()).hexdigest()[:24]
            target = output/(digest+'-card.webp')
            if not target.exists(): image.save(target,'WEBP',quality=78,method=6)
            width,height=image.size
    except (OSError,ValueError):
        result['skipped'].append(asset['public_path']);continue
    path='/'+target.relative_to(root/'frontend').as_posix()
    values=dict(asset);values.update(public_path=path,mime_type='image/webp',file_bytes=target.stat().st_size,width=width,height=height)
    variant_id=content_catalog.register_media(values)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO media_asset_variants(source_asset_id,variant_key,variant_asset_id) VALUES(%s,'card',%s) ON DUPLICATE KEY UPDATE variant_asset_id=VALUES(variant_asset_id)",(asset['id'],variant_id))
        conn.commit()
    result['count']+=1;result['original_bytes']+=source.stat().st_size;result['card_bytes']+=target.stat().st_size
(root/'artifacts/story-cover-optimization.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
