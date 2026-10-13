# -*- coding: utf-8 -*-
"""Import complete original picture books; runtime content is served from MySQL."""
import json
from pathlib import Path
from PIL import Image
import mysql_db
import content_catalog

ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT/'content/stories/the-bus-that-learned-to-stop.json'


def initialize():
    if not BOOK.is_file():
        return
    book = json.loads(BOOK.read_text(encoding='utf-8'))
    slug = book['slug']
    images = ['/assets/stories/'+slug+'/'+str(i+1)+'.webp' for i in range(len(book['pages']))]
    cover = '/assets/stories/'+slug+'/cover-card.webp'
    # Never publish an unfinished picture book with missing pages.
    if not all((ROOT/'frontend'/path.lstrip('/')).is_file() for path in images+[cover]):
        return
    with mysql_db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM stories WHERE slug=%s', (slug,))
            if cur.fetchone():
                return  # Keep subsequent edits made in the content admin.
            values = dict(book, paragraphs=[page['text'] for page in book['pages']],
                          tags=['原创绘本','亲子游戏','表达需要','倾听','合作'],
                          cover=images[0], coverStatus='ready', coverPrompt=book['pages'][0]['scene'])
            cur.execute('''INSERT INTO stories(slug,story_type,title,category,age,color,emoji,summary,
                       paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt,
                       paragraph_images,conversation) VALUES('''+','.join(['%s']*18)+')',
                       mysql_db._record_from_json(values)+(json.dumps(images),book['conversation']))
            story_id = cur.lastrowid
        conn.commit()
    # Media metadata and small card variants follow the existing shared catalog.
    for index, public_path in enumerate(images):
        local = ROOT/'frontend'/public_path.lstrip('/')
        with Image.open(local) as image:
            width,height = image.size
        asset_id = content_catalog.register_media({'public_path':public_path,'media_kind':'image',
            'mime_type':'image/webp','file_bytes':local.stat().st_size,'width':width,'height':height,
            'title':book['title']+' · 第 '+str(index+1)+' 页',
            'alt_text':book['pages'][index]['scene'], 'source_name':'福福学堂原创绘本插图',
            'license_name':'项目生成素材'})
        if index == 0:
            local_card = ROOT/'frontend'/cover.lstrip('/')
            with Image.open(local_card) as image:
                width,height = image.size
            variant_id = content_catalog.register_media({'public_path':cover,'media_kind':'image',
                'mime_type':'image/webp','file_bytes':local_card.stat().st_size,'width':width,'height':height,
                'title':book['title']+' · 卡片封面','source_name':'福福学堂原创绘本插图'})
            with mysql_db.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute('''INSERT INTO media_asset_variants(source_asset_id,variant_key,variant_asset_id)
                                   VALUES(%s,'card',%s) ON DUPLICATE KEY UPDATE variant_asset_id=VALUES(variant_asset_id)''',
                                (asset_id,variant_id))
                conn.commit()
    content_catalog.sync_story_media(story_id)
