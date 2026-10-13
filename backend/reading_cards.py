"""Compact subject cards with paginated poetry and local media references."""
import json
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

ROOT=Path(__file__).resolve().parents[1]

def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS learning_reading_cards (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE, subject VARCHAR(16) NOT NULL,
                kind VARCHAR(24) NOT NULL, title VARCHAR(200) NOT NULL,
                author VARCHAR(80) NOT NULL DEFAULT '', dynasty VARCHAR(16) NOT NULL DEFAULT '',
                collection VARCHAR(40) NOT NULL, subtitle VARCHAR(200) NOT NULL,
                paragraphs_json TEXT NOT NULL, position SMALLINT UNSIGNED NOT NULL,
                image_asset_id BIGINT UNSIGNED NULL, audio_asset_id BIGINT UNSIGNED NULL,
                source_name VARCHAR(200) NOT NULL, source_url VARCHAR(1000) NOT NULL,
                license_name VARCHAR(100) NOT NULL,
                INDEX reading_kind_position(kind,position), INDEX reading_collection(kind,collection),
                FOREIGN KEY(image_asset_id) REFERENCES media_assets(id),
                FOREIGN KEY(audio_asset_id) REFERENCES media_assets(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci''')
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM learning_reading_cards LIKE 'explanation_json'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE learning_reading_cards ADD COLUMN explanation_json MEDIUMTEXT NULL")
        conn.commit()
    poems=json.loads((ROOT/'content/learning/poetry-cards.json').read_text(encoding='utf-8'))
    science=json.loads((ROOT/'content/learning/science-cards.json').read_text(encoding='utf-8'))
    rows=[]
    for position,card in enumerate(poems+science):
        media=[]
        for key,kind,mime in [('image_path','image','image/webp'),('audio_path','audio','audio/mpeg')]:
            path=card.get(key)
            if not path:media.append(None);continue
            file=ROOT/'frontend'/path.lstrip('/')
            if not file.is_file():raise RuntimeError('Missing reading-card asset: '+path)
            media.append(register_media({'public_path':path,'media_kind':kind,'mime_type':'image/svg+xml' if file.suffix.lower()=='.svg' else mime,
                'file_bytes':file.stat().st_size,'title':card['title'],
                'source_name':'福福学堂原创 · imagegen 绘本风景' if kind=='image' else '晓晓神经语音 · 舒缓合成朗诵',
                'license_name':'项目原创配图' if kind=='image' else '合成语音；非真人录音'}))
        rows.append((card['slug'],card['subject'],card['kind'],card['title'],card.get('author',''),
            card.get('dynasty',''),card['collection'],card['subtitle'],json.dumps(card['paragraphs'],ensure_ascii=False),
            position,*media,card['source_name'],card['source_url'],card['license_name'],
            json.dumps(card.get('explanation'),ensure_ascii=False)))
    with connection() as conn:
        with conn.cursor() as cur:
            # Keep previous import versions recoverable, but expose only this selection.
            cur.execute("UPDATE learning_reading_cards SET position=65535 WHERE kind='poetry'")
            cur.executemany('''INSERT INTO learning_reading_cards
                (slug,subject,kind,title,author,dynasty,collection,subtitle,paragraphs_json,position,
                 image_asset_id,audio_asset_id,source_name,source_url,license_name,explanation_json)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE title=VALUES(title),author=VALUES(author),
                paragraphs_json=VALUES(paragraphs_json),position=VALUES(position),
                subtitle=VALUES(subtitle),image_asset_id=VALUES(image_asset_id),audio_asset_id=VALUES(audio_asset_id),
                explanation_json=VALUES(explanation_json)''',rows)
        conn.commit()

def list_cards(kind='poetry',page=1,query='',collection=''):
    if kind not in ('poetry','science'):raise ValueError('卡片分类无效')
    page=max(1,min(1000,int(page)));size=24;where='c.kind=%s AND c.position<65535';params=[kind]
    if query:
        value='%'+str(query)[:80].replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        where+=' AND (c.title LIKE %s OR c.author LIKE %s OR c.subtitle LIKE %s)';params.extend([value]*3)
    if collection:
        where+=' AND c.collection=%s';params.append(str(collection)[:40])
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) AS total FROM learning_reading_cards c WHERE '+where,params)
            total=cur.fetchone()['total']
            cur.execute('''SELECT c.id,c.title,c.author,c.dynasty,c.collection,c.subtitle,
                m.public_path AS image_path FROM learning_reading_cards c
                LEFT JOIN media_assets m ON m.id=c.image_asset_id WHERE '''+where+
                ' ORDER BY c.position,c.id LIMIT %s OFFSET %s',params+[size,(page-1)*size])
            cards=cur.fetchall()
            cur.execute('SELECT collection,COUNT(*) AS total FROM learning_reading_cards WHERE kind=%s AND position<65535 GROUP BY collection ORDER BY MIN(position)',(kind,))
            return dict(cards=cards,total=total,page=page,page_size=size,collections=cur.fetchall())

def get_card(card_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''SELECT c.*,m.public_path AS image_path,a.public_path AS audio_path
                FROM learning_reading_cards c LEFT JOIN media_assets m ON m.id=c.image_asset_id
                LEFT JOIN media_assets a ON a.id=c.audio_asset_id WHERE c.id=%s AND c.position<65535''',(int(card_id),))
            card=cur.fetchone()
            if not card:raise ValueError('卡片不存在')
            card['paragraphs']=json.loads(card.pop('paragraphs_json'))
            card['explanation']=json.loads(card.pop('explanation_json') or 'null')
            return card
