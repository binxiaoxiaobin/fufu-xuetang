"""Seed categorized vocabulary alongside the existing action-card collection."""
import json
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parents[1]


def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            columns = {
                'category_key': "VARCHAR(40) NOT NULL DEFAULT 'actions'",
                'category_name': "VARCHAR(80) NOT NULL DEFAULT '日常动作'",
                'display_kind': "VARCHAR(20) NOT NULL DEFAULT 'motion'",
            }
            for name, definition in columns.items():
                cur.execute('SHOW COLUMNS FROM learning_action_cards LIKE %s', (name,))
                if not cur.fetchone():
                    cur.execute('ALTER TABLE learning_action_cards ADD COLUMN '+name+' '+definition)
        conn.commit()
    cards = json.loads((ROOT/'content/learning/vocabulary-words.json').read_text(encoding='utf-8'))
    missing = [c['slug'] for c in cards if not (ROOT/'frontend/assets/learning/vocabulary-clay'/(c['slug']+'-poster.webp')).is_file()]
    if missing:
        raise RuntimeError('Vocabulary illustrations incomplete: '+', '.join(missing))
    rows = []
    for position, card in enumerate(cards, 101):
        path = '/assets/learning/vocabulary-clay/'+card['slug']+'-poster.webp'
        image_id = register_media({
            'public_path':path, 'media_kind':'image', 'mime_type':'image/webp',
            'file_bytes':(ROOT/'frontend'/path.lstrip('/')).stat().st_size,
            'width':320, 'height':320, 'title':card['word']+' · '+card['meaning'],
            'alt_text':card['meaning']+'的黏土插图', 'source_name':'福福学堂原创 · imagegen 黏土词汇素材'})
        audio_ids = []
        for kind in ('word','sentence'):
            path = '/assets/audio/learning-vocabulary-clay/{}-{}.mp3'.format(card['slug'],kind)
            file = ROOT/'frontend'/path.lstrip('/')
            if not file.is_file():
                raise RuntimeError('Vocabulary recording missing: '+path)
            audio_ids.append(register_media({'public_path':path,'media_kind':'audio',
                'mime_type':'audio/mpeg','file_bytes':file.stat().st_size,
                'title':card[kind],'source_name':'英语语音示范 · Jenny'}))
        rows.append((card['slug'],card['word'],card['meaning'],card['sentence'],card['translation'],
            card['meaning']+'的黏土插图',card['group'],'green',position,image_id,image_id,
            audio_ids[0],audio_ids[1],card['category'],card['category_name'],'illustration'))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany("""INSERT IGNORE INTO learning_action_cards
                (slug,word,meaning,sentence,translation,hint,group_name,color,position,
                 image_asset_id,animation_asset_id,word_audio_asset_id,sentence_audio_asset_id,
                 category_key,category_name,display_kind)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",rows)
            cur.execute("SELECT migration_key FROM content_migrations WHERE migration_key='vocabulary_fruit_group_v1'")
            if not cur.fetchone():
                cur.execute("""UPDATE learning_action_cards SET group_name='多彩的水果'
                    WHERE category_key='fruit' AND group_name='甜甜的水果'""")
                cur.execute("INSERT INTO content_migrations(migration_key) VALUES('vocabulary_fruit_group_v1')")
        conn.commit()


def list_cards(category=None):
    with connection() as conn:
        with conn.cursor() as cur:
            clause = ' AND c.category_key=%s' if category else ''
            cur.execute("""SELECT c.id,c.slug,c.word,c.meaning,c.sentence,c.translation,c.hint,
                c.group_name AS `group`,c.color,c.category_key,c.category_name,c.display_kind,
                m.public_path AS image_path,a.public_path AS animation_path,
                w.public_path AS word_audio,s.public_path AS sentence_audio
                FROM learning_action_cards c JOIN media_assets m ON m.id=c.image_asset_id
                JOIN media_assets a ON a.id=c.animation_asset_id
                LEFT JOIN media_assets w ON w.id=c.word_audio_asset_id
                LEFT JOIN media_assets s ON s.id=c.sentence_audio_asset_id
                WHERE c.status='published'"""+clause+' ORDER BY c.position,c.id LIMIT 200',
                (category,) if category else ())
            return {'cards':cur.fetchall()}
