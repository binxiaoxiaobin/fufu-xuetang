"""Replace the first prototype with original clay close-up action recordings."""
import json
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = 'learning_clay_action_cards_v1'


def initialize():
    cards = json.loads((ROOT/'content/learning/action-words.json').read_text(encoding='utf-8'))
    assets = ROOT/'frontend/assets/learning/actions-clay'
    missing = [card['slug'] for card in cards if not all(
        (assets/(card['slug']+suffix)).is_file() for suffix in ('-poster.webp','-motion.webp'))]
    if missing:
        raise RuntimeError('Clay action illustrations incomplete: '+', '.join(missing))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM learning_action_cards LIKE 'animation_asset_id'")
            if not cur.fetchone():
                cur.execute("""ALTER TABLE learning_action_cards ADD COLUMN animation_asset_id BIGINT UNSIGNED NULL,
                    ADD CONSTRAINT fk_learning_action_animation FOREIGN KEY (animation_asset_id) REFERENCES media_assets(id)""")
            cur.execute('SELECT migration_key FROM content_migrations WHERE migration_key=%s',(MIGRATION,))
            replace_prototype = not bool(cur.fetchone())
        conn.commit()
    rows = []
    for position, card in enumerate(cards,1):
        ids = []
        for kind in ('poster','motion'):
            path = '/assets/learning/actions-clay/{}-{}.webp'.format(card['slug'],kind)
            ids.append(register_media({'public_path':path,'media_kind':'image','mime_type':'image/webp',
                'file_bytes':(ROOT/'frontend'/path.lstrip('/')).stat().st_size,'width':320,'height':320,
                'title':card['word']+' · '+card['meaning'], 'alt_text':card['hint'],
                'source_name':'福福学堂原创 · imagegen 黏土动作素材'}))
        for kind in ('word','sentence'):
            path='/assets/audio/learning-actions-clay/{}-{}.mp3'.format(card['slug'],kind)
            file=ROOT/'frontend'/path.lstrip('/')
            ids.append(register_media({'public_path':path,'media_kind':'audio','mime_type':'audio/mpeg',
                'file_bytes':file.stat().st_size,'title':card[kind],
                'source_name':'英语语音示范 · Jenny'}) if file.is_file() else None)
        rows.append((card['slug'],card['word'],card['meaning'],card['sentence'],card['translation'],
            card['hint'],card['group'],card['color'],position,ids[0],ids[1],ids[2],ids[3]))
    with connection() as conn:
        with conn.cursor() as cur:
            sql="""INSERT INTO learning_action_cards
                (slug,word,meaning,sentence,translation,hint,group_name,color,position,
                 image_asset_id,animation_asset_id,word_audio_asset_id,sentence_audio_asset_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
            sql += """ ON DUPLICATE KEY UPDATE word=VALUES(word),meaning=VALUES(meaning),
                sentence=VALUES(sentence),translation=VALUES(translation),hint=VALUES(hint),
                group_name=VALUES(group_name),color=VALUES(color),position=VALUES(position),
                image_asset_id=VALUES(image_asset_id),animation_asset_id=VALUES(animation_asset_id),
                word_audio_asset_id=VALUES(word_audio_asset_id),sentence_audio_asset_id=VALUES(sentence_audio_asset_id),
                status='published'"""
            cur.executemany(sql,rows)
            if replace_prototype:
                cur.execute("""UPDATE learning_action_cards SET status='archived' WHERE slug IN
                    ('jump','walk','run','kick','throw','read','drink','sleep')""")
                cur.execute('INSERT IGNORE INTO content_migrations (migration_key) VALUES (%s)',(MIGRATION,))
            for row in rows:
                cur.execute("""UPDATE learning_action_cards SET word_audio_asset_id=COALESCE(word_audio_asset_id,%s),
                    sentence_audio_asset_id=COALESCE(sentence_audio_asset_id,%s) WHERE slug=%s""",(row[-2],row[-1],row[0]))
        conn.commit()


def list_cards():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT c.id,c.slug,c.word,c.meaning,c.sentence,c.translation,c.hint,
                c.group_name AS `group`,c.color,m.public_path AS image_path,a.public_path AS animation_path,
                w.public_path AS word_audio,s.public_path AS sentence_audio
                FROM learning_action_cards c JOIN media_assets m ON m.id=c.image_asset_id
                JOIN media_assets a ON a.id=c.animation_asset_id
                LEFT JOIN media_assets w ON w.id=c.word_audio_asset_id
                LEFT JOIN media_assets s ON s.id=c.sentence_audio_asset_id
                WHERE c.status='published' ORDER BY c.position,c.id LIMIT 100""")
            return {'cards':cur.fetchall()}
