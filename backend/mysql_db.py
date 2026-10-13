"""MySQL-backed story content with JSON import for easy editing and migration."""
import json
import os
import re
import math
import random
from contextlib import contextmanager
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parent.parent
CONTENT_PATH = ROOT / "content" / "stories" / "chengyu-and-tradition.json"
DB_NAME = os.getenv("FUFU_MYSQL_DATABASE", "fufu_learning")


def _settings(include_database=True):
    settings = {
        "host": os.getenv("FUFU_MYSQL_HOST", "127.0.0.1"),
        "port": int(os.getenv("FUFU_MYSQL_PORT", "3306")),
        "user": os.getenv("FUFU_MYSQL_USER", "root"),
        "password": os.getenv("FUFU_MYSQL_PASSWORD", ""),
        "charset": "utf8mb4",
        "connect_timeout": 5,
        "cursorclass": DictCursor,
    }
    if include_database:
        settings["database"] = DB_NAME
    return settings


@contextmanager
def connection(include_database=True):
    conn = pymysql.connect(**_settings(include_database))
    try:
        yield conn
    finally:
        conn.close()


def initialize():
    if not re.fullmatch(r"[A-Za-z0-9_]+", DB_NAME):
        raise ValueError("FUFU_MYSQL_DATABASE may contain only letters, numbers, and underscores")
    if not os.getenv("FUFU_MYSQL_PASSWORD"):
        raise RuntimeError("Set FUFU_MYSQL_PASSWORD before starting the backend")
    with connection(include_database=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=%s", (DB_NAME,))
            if not cur.fetchone():
                cur.execute(f"CREATE DATABASE `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.commit()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS stories (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(120) NOT NULL UNIQUE,
                story_type VARCHAR(40) NOT NULL DEFAULT 'story',
                title VARCHAR(160) NOT NULL,
                category VARCHAR(80) NOT NULL DEFAULT '故事科普',
                age VARCHAR(40) NOT NULL DEFAULT '',
                color CHAR(7) NOT NULL DEFAULT '#e6d8ba',
                emoji VARCHAR(32) NOT NULL DEFAULT '📖',
                summary VARCHAR(500) NOT NULL,
                paragraphs LONGTEXT NOT NULL,
                moral TEXT NOT NULL,
                tags TEXT NOT NULL,
                reading_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 3,
                cover VARCHAR(255) NOT NULL DEFAULT '',
                cover_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                source_note TEXT NOT NULL,
                cover_prompt TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_stories_type (story_type),
                INDEX idx_stories_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
            cur.execute("SHOW COLUMNS FROM stories LIKE 'paragraph_images'")
            if not cur.fetchone():
                cur.execute('ALTER TABLE stories ADD COLUMN paragraph_images LONGTEXT NULL')
            cur.execute("SHOW COLUMNS FROM stories LIKE 'conversation'")
            if not cur.fetchone():
                cur.execute('ALTER TABLE stories ADD COLUMN conversation TEXT NULL')
        conn.commit()
    sync_from_json()


def _record_from_json(story):
    story_type = story.get("type", "story")
    category = story.get("category") or {
        "chengyu": "成语故事",
        "traditional-tale": "传统故事",
        "traditional-myth": "中国神话",
    }.get(story_type, "故事科普")
    return (
        story["slug"], story_type, story["title"], category, story.get("ageRange", "6–9岁"),
        story.get("color", "#e6d8ba"), story.get("emoji", "📖"), story["summary"],
        json.dumps(story["paragraphs"], ensure_ascii=False), story.get("moral", ""),
        json.dumps(story.get("tags", []), ensure_ascii=False), story.get("readingMinutes", 3),
        story.get("cover") or "", story.get("coverStatus", "pending"),
        story.get("sourceNote", ""), story.get("coverPrompt", ""),
    )


def sync_from_json():
    if not CONTENT_PATH.exists():
        return
    collection = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    sql = """INSERT IGNORE INTO stories
        (slug,story_type,title,category,age,color,emoji,summary,paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
    with connection() as conn:
        with conn.cursor() as cur:
            for story in collection.get("stories", []):
                cur.execute(sql, _record_from_json(story))
        conn.commit()


def _decode(row):
    item = dict(row)
    for key in ("paragraphs", "tags", "paragraph_images"):
        try:
            item[key] = json.loads(item.get(key) or "[]")
        except (TypeError, json.JSONDecodeError):
            item[key] = []
    item["id"] = int(item["id"])
    return item


def list_stories():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM stories ORDER BY id")
            return [_decode(row) for row in cur.fetchall()]


def list_story_summaries(page=1, page_size=12, story_type=""):
    """Public catalog: never send paragraphs until the reader opens an item."""
    page = max(1, int(page))
    page_size = max(1, min(48, int(page_size)))
    where = "WHERE s.story_type=%s" if story_type else ""
    params = (story_type,) if story_type else ()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM stories s {where}", params)
            total = cur.fetchone()["total"]
            cur.execute(f"""SELECT s.id,s.slug,s.story_type,s.title,s.category,s.age,s.color,s.emoji,s.summary,
                s.reading_minutes,COALESCE(a.public_path,s.cover) AS cover,s.cover_status,s.updated_at
                FROM stories s LEFT JOIN story_media_links l ON l.story_id=s.id AND l.role='cover' AND l.position=0
                LEFT JOIN media_asset_variants v ON v.source_asset_id=l.asset_id AND v.variant_key='card'
                LEFT JOIN media_assets a ON a.id=v.variant_asset_id {where}
                ORDER BY s.id LIMIT %s OFFSET %s""", params + (page_size, (page - 1) * page_size))
            items = [dict(row) for row in cur.fetchall()]
            cur.execute('SELECT story_type,COUNT(*) AS total FROM stories GROUP BY story_type')
            category_totals = {row['story_type']:row['total'] for row in cur.fetchall()}
    return {"items": items, "page": page, "page_size": page_size,
            "total": total, "pages": math.ceil(total / page_size), "category_totals": category_totals}


def get_story(story_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM stories WHERE id=%s", (story_id,))
            row = cur.fetchone()
            if row:
                cur.execute("""SELECT l.position,a.public_path FROM story_media_links l
                    JOIN media_assets a ON a.id=l.asset_id WHERE l.story_id=%s AND l.role='audio'
                    ORDER BY l.position""", (story_id,))
                audio_paths = [link["public_path"] for link in cur.fetchall()]
    if not row:
        return None
    item = _decode(row)
    item["audio_paths"] = audio_paths
    return item


def story_recommendations(exclude=(), exclude_types=()):
    """Sample primary-key offsets without loading full stories or sorting by RAND()."""
    type_filter = ""
    type_params = tuple(exclude_types)
    if type_params:
        type_marks = ",".join(["%s"] * len(type_params))
        type_filter = f" WHERE COALESCE(story_type,'') NOT IN ({type_marks})"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f'SELECT COUNT(*) AS total FROM stories{type_filter}', type_params)
            total = int(cur.fetchone()['total'])
            if not total:
                return {'items': []}
            candidates = []
            for offset in random.sample(range(total), min(total, 6)):
                cur.execute(f'SELECT id FROM stories{type_filter} ORDER BY id LIMIT 1 OFFSET %s', type_params + (offset,))
                row = cur.fetchone()
                if row:
                    candidates.append(row['id'])
            available = [i for i in candidates if i not in exclude]
            # For a tiny catalog, fill remaining slots from previously shown stories.
            chosen = (available + [i for i in candidates if i in exclude])[:min(3, total)]
            marks = ','.join(['%s'] * len(chosen))
            cur.execute(f'''SELECT s.id,s.slug,s.story_type,s.title,s.category,s.age,s.color,s.emoji,
                       s.summary,s.reading_minutes,COALESCE(a.public_path,s.cover) AS cover,s.cover_status
                       FROM stories s LEFT JOIN story_media_links l
                         ON l.story_id=s.id AND l.role='cover' AND l.position=0
                       LEFT JOIN media_asset_variants v ON v.source_asset_id=l.asset_id AND v.variant_key='card'
                       LEFT JOIN media_assets a ON a.id=v.variant_asset_id WHERE s.id IN ({marks})''', chosen)
            by_id = {row['id']: row for row in cur.fetchall()}
            return {'items': [by_id[i] for i in chosen if i in by_id]}


def create_story(values):
    columns = "slug,story_type,title,category,age,color,emoji,summary,paragraphs,moral,tags,reading_minutes,cover,cover_status,source_note,cover_prompt"
    placeholders = ",".join(["%s"] * 16)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"INSERT INTO stories ({columns}) VALUES ({placeholders})", _encode(values))
            story_id = cur.lastrowid
        conn.commit()
    return get_story(story_id)


def update_story(story_id, values):
    columns = "story_type=%s,title=%s,category=%s,age=%s,color=%s,emoji=%s,summary=%s,paragraphs=%s,moral=%s,tags=%s,reading_minutes=%s,cover=%s,cover_status=%s,source_note=%s,cover_prompt=%s,slug=%s"
    encoded = _encode(values)
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE stories SET {columns} WHERE id=%s", encoded[1:] + (encoded[0], story_id))
            changed = cur.rowcount
        conn.commit()
    return get_story(story_id) if changed else None


def delete_story(story_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM stories WHERE id=%s", (story_id,))
            changed = cur.rowcount
        conn.commit()
    return bool(changed)


def _encode(values):
    return (
        values["slug"], values["story_type"], values["title"], values["category"], values["age"],
        values["color"], values["emoji"], values["summary"], json.dumps(values["paragraphs"], ensure_ascii=False),
        values["moral"], json.dumps(values["tags"], ensure_ascii=False), values["reading_minutes"],
        values["cover"], values["cover_status"], values["source_note"], values["cover_prompt"],
    )
