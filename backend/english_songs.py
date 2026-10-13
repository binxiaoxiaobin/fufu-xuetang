"""Database-backed collection of traditional English nursery rhymes."""
import json
from pathlib import Path

from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "content" / "learning" / "english-nursery-songs.json"


def initialize():
    songs = json.loads(SEED.read_text(encoding="utf-8"))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS learning_english_songs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(100) NOT NULL UNIQUE,
                title VARCHAR(160) NOT NULL,
                title_zh VARCHAR(160) NOT NULL DEFAULT '',
                summary VARCHAR(500) NOT NULL DEFAULT '',
                emoji VARCHAR(16) NOT NULL DEFAULT '🎵',
                source_name VARCHAR(160) NOT NULL DEFAULT '',
                source_url VARCHAR(1000) NOT NULL DEFAULT '',
                position INT UNSIGNED NOT NULL DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'published',
                INDEX idx_english_song_status (status, position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS learning_english_song_lines (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                song_id BIGINT UNSIGNED NOT NULL,
                position INT UNSIGNED NOT NULL,
                lyric TEXT NOT NULL,
                translation VARCHAR(500) NOT NULL DEFAULT '',
                UNIQUE KEY uq_english_song_line (song_id, position),
                CONSTRAINT fk_english_song_line_song FOREIGN KEY (song_id)
                    REFERENCES learning_english_songs(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("SHOW COLUMNS FROM learning_english_songs LIKE 'audio_asset_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE learning_english_songs ADD COLUMN audio_asset_id BIGINT UNSIGNED NULL")
            for column in ('start_ms', 'end_ms'):
                cur.execute(f"SHOW COLUMNS FROM learning_english_song_lines LIKE '{column}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE learning_english_song_lines ADD COLUMN {column} INT UNSIGNED NOT NULL DEFAULT 0")
            cur.execute("""UPDATE learning_english_songs SET status='draft'
                WHERE slug IN ('old-macdonald-had-a-farm','row-row-row-your-boat','baa-baa-black-sheep')""")
            for position, song in enumerate(songs, 1):
                cur.execute("""INSERT INTO learning_english_songs
                    (slug,title,title_zh,summary,emoji,source_name,source_url,position,status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'published')
                    ON DUPLICATE KEY UPDATE title=VALUES(title),title_zh=VALUES(title_zh),
                    summary=VALUES(summary),emoji=VALUES(emoji),source_name=VALUES(source_name),
                    source_url=VALUES(source_url),position=VALUES(position),status='published'""",
                    (song['slug'],song['title'],song['title_zh'],song['summary'],song['emoji'],
                     song['source_name'],song['source_url'],position))
                cur.execute("SELECT id FROM learning_english_songs WHERE slug=%s", (song['slug'],))
                song_id = cur.fetchone()['id']
                cur.execute("DELETE FROM learning_english_song_lines WHERE song_id=%s", (song_id,))
                cur.executemany("""INSERT INTO learning_english_song_lines
                    (song_id,position,lyric,translation,start_ms,end_ms) VALUES (%s,%s,%s,%s,%s,%s)""",
                    [(song_id,index,line['lyric'],line.get('translation',''),line.get('start_ms',0),line.get('end_ms',0))
                     for index,line in enumerate(song['lines'],1)])
        conn.commit()
    for song in songs:
        filename = song.get('audio_filename')
        if not filename:
            continue
        relative_path = song.get('audio_media_path') or ('assets/audio/english-nursery-songs/' + filename)
        path = ROOT / 'frontend' / relative_path
        if not path.is_file():
            raise RuntimeError(f'Nursery song audio is missing: {path}')
        asset_id = register_media({
            'public_path': '/' + relative_path,
            'media_kind': song.get('audio_media_kind', 'audio'), 'mime_type': song.get('audio_mime_type', 'audio/ogg'), 'file_bytes': path.stat().st_size,
            'title': song['title'] + ' · 人声演唱', 'alt_text': song['title'] + ' 儿歌演唱',
            'source_name': song['audio_source_name'], 'source_url': song['audio_source_url'],
            'license_name': song['audio_license']})
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE learning_english_songs SET audio_asset_id=%s WHERE slug=%s",
                            (asset_id, song['slug']))
            conn.commit()
def list_songs():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT s.id,s.slug,s.title,s.title_zh,s.summary,s.emoji,s.source_name,s.source_url,
                a.public_path AS audio_path,a.media_kind AS media_kind,a.mime_type AS media_mime_type,a.source_name AS audio_source_name,
                a.source_url AS audio_source_url,a.license_name AS audio_license
                FROM learning_english_songs s LEFT JOIN media_assets a ON a.id=s.audio_asset_id
                WHERE s.status='published' ORDER BY s.position,s.id""")
            songs = cur.fetchall()
            if not songs:
                return {'songs': []}
            ids = [song['id'] for song in songs]
            marks = ','.join(['%s'] * len(ids))
            cur.execute(f"""SELECT song_id,position,lyric,translation,start_ms,end_ms
                FROM learning_english_song_lines WHERE song_id IN ({marks})
                ORDER BY song_id,position""", ids)
            by_song = {song_id: [] for song_id in ids}
            for row in cur.fetchall():
                by_song[row['song_id']].append({
                    'position': row['position'], 'lyric': row['lyric'],
                    'translation': row['translation'], 'start_ms': row['start_ms'],
                    'end_ms': row['end_ms']})
            for song in songs:
                song['lines'] = by_song[song['id']]
            return {'songs': songs}
