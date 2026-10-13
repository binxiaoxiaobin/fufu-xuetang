"""Pinyin recordings are local assets; card metadata is served from MySQL."""
import json
from pathlib import Path
from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parents[1]

def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS learning_pinyin_cards (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(16) NOT NULL UNIQUE, symbol VARCHAR(16) NOT NULL,
                group_key VARCHAR(24) NOT NULL, group_name VARCHAR(40) NOT NULL,
                position SMALLINT UNSIGNED NOT NULL, audio_asset_id BIGINT UNSIGNED NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'published',
                FOREIGN KEY (audio_asset_id) REFERENCES media_assets(id)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci''')
            cur.execute("SHOW COLUMNS FROM learning_pinyin_cards LIKE 'status'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE learning_pinyin_cards ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'published'")
            cur.execute("SHOW COLUMNS FROM learning_pinyin_cards LIKE 'audio_asset_id'")
            if cur.fetchone():
                cur.execute("ALTER TABLE learning_pinyin_cards MODIFY audio_asset_id BIGINT UNSIGNED NULL")
        conn.commit()
    cards = json.loads((ROOT/'content/learning/pinyin-cards.json').read_text(encoding='utf-8'))
    rows = []
    for position, card in enumerate(cards):
        file = ROOT/'frontend'/card['audio_path'].lstrip('/')
        if not file.is_file():
            raise RuntimeError('Missing pinyin recording: '+str(file))
        asset_id = register_media({'public_path':card['audio_path'], 'media_kind':'audio',
            'mime_type':'audio/mpeg', 'file_bytes':file.stat().st_size,
            'title':card['symbol']+' · 拼音示范', 'source_name':card['source_name'],
            'source_url':card['source_url'], 'license_name':'原网站未声明开放许可；未转授权'})
        rows.append((card['slug'],card['symbol'],card['group_key'],card['group_name'],position,asset_id))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany('''INSERT IGNORE INTO learning_pinyin_cards
                (slug,symbol,group_key,group_name,position,audio_asset_id)
                VALUES (%s,%s,%s,%s,%s,%s)''',rows)
        conn.commit()

def list_cards():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''SELECT c.slug,c.symbol,c.group_key,c.group_name,
                m.public_path AS audio_path,m.source_name,m.source_url FROM learning_pinyin_cards c
                LEFT JOIN media_assets m ON m.id=c.audio_asset_id WHERE c.status='published' ORDER BY c.position,c.id''')
            return {'cards':cur.fetchall()}
