"""Shared media and extensible comic / 3D learning content catalog."""
import json
import re
from pathlib import Path

from mysql_db import connection

KINDS = {"comic", "dinosaur", "machine", "companion"}
STATUSES = {"draft", "published", "archived"}
MEDIA_KINDS = {"image", "audio", "video", "model"}
ASSETS_ROOT = Path(__file__).resolve().parent.parent / "frontend"


def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS media_assets (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                public_path VARCHAR(500) NOT NULL UNIQUE,
                media_kind VARCHAR(20) NOT NULL,
                mime_type VARCHAR(100) NOT NULL DEFAULT '',
                file_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
                width INT UNSIGNED NULL, height INT UNSIGNED NULL,
                title VARCHAR(160) NOT NULL DEFAULT '',
                alt_text VARCHAR(500) NOT NULL DEFAULT '',
                source_name VARCHAR(200) NOT NULL DEFAULT '',
                source_url VARCHAR(1000) NOT NULL DEFAULT '',
                license_name VARCHAR(100) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_media_kind (media_kind, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS media_asset_variants (
                source_asset_id BIGINT UNSIGNED NOT NULL,
                variant_key VARCHAR(30) NOT NULL,
                variant_asset_id BIGINT UNSIGNED NOT NULL,
                PRIMARY KEY(source_asset_id,variant_key),
                INDEX idx_variant_asset(variant_asset_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS content_items (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(120) NOT NULL UNIQUE,
                kind VARCHAR(30) NOT NULL,
                title VARCHAR(160) NOT NULL,
                summary VARCHAR(500) NOT NULL DEFAULT '',
                stage VARCHAR(40) NOT NULL DEFAULT '',
                grade VARCHAR(40) NOT NULL DEFAULT '',
                category VARCHAR(80) NOT NULL DEFAULT '',
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                cover_asset_id BIGINT UNSIGNED NULL,
                model_asset_id BIGINT UNSIGNED NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_content_catalog (kind,status,id),
                INDEX idx_content_grade (stage,grade,status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS content_segments (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                item_id BIGINT UNSIGNED NOT NULL,
                chapter_no INT UNSIGNED NOT NULL DEFAULT 1,
                position INT UNSIGNED NOT NULL,
                title VARCHAR(160) NOT NULL DEFAULT '',
                body TEXT NOT NULL,
                image_asset_id BIGINT UNSIGNED NULL,
                audio_asset_id BIGINT UNSIGNED NULL,
                hotspot_x DECIMAL(8,4) NULL,
                hotspot_y DECIMAL(8,4) NULL,
                hotspot_z DECIMAL(8,4) NULL,
                UNIQUE KEY uq_content_segment (item_id,chapter_no,position),
                INDEX idx_content_segment_item (item_id,chapter_no)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS story_media_links (
                story_id BIGINT UNSIGNED NOT NULL,
                role VARCHAR(30) NOT NULL,
                position INT UNSIGNED NOT NULL,
                asset_id BIGINT UNSIGNED NOT NULL,
                PRIMARY KEY(story_id,role,position),
                INDEX idx_story_asset(asset_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS content_migrations (
                migration_key VARCHAR(100) NOT NULL PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT migration_key FROM content_migrations WHERE migration_key='story_audio_v1'")
            pending = not cur.fetchone()
    if pending:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM stories ORDER BY id")
                ids = [row["id"] for row in cur.fetchall()]
        for story_id in ids:
            sync_story_media(story_id)
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT IGNORE INTO content_migrations(migration_key) VALUES('story_media_v1'),('story_audio_v1')")
            conn.commit()
    seed_companion_content()


def seed_companion_content():
    """Insert editable first-run pet lines into the shared MySQL content catalog."""
    defaults = [
        {"slug": "pet-encouragements", "kind": "companion", "title": "团团鼓励话术",
         "summary": "首页伙伴可选或随机说出的鼓励短句。", "category": "encouragement", "status": "published",
         "segments": [{"body": text} for text in (
             "你今天认真尝试的样子真棒！",
             "不用着急，一步一步来也很厉害。",
             "遇到难题再试一次，你一定能找到办法！",
             "每一点进步，都值得给自己一个微笑！",
             "我相信你，我们一起加油！")]},
        {"slug": "pet-songs", "kind": "companion", "title": "团团儿歌",
         "summary": "熟悉的传统儿歌短句，由伙伴用轻快童声念唱。", "category": "song", "status": "published",
         "segments": [
             {"title": "小老鼠上灯台", "body": "小老鼠，上灯台；偷油吃，下不来。"},
             {"title": "拉大锯", "body": "拉大锯，扯大锯；姥姥门口唱大戏。"},
             {"title": "小白兔", "body": "小白兔，白又白；两只耳朵竖起来。"}]},
    ]
    slugs = [item["slug"] for item in defaults]
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT slug FROM content_items WHERE slug IN (%s,%s)", slugs)
            existing = {row["slug"] for row in cur.fetchall()}
    for item in defaults:
        if item["slug"] not in existing:
            save_item(item)


def sync_story_media(story_id):
    """Keep legacy story paths available while recording their asset relationships."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT slug,cover,paragraph_images,title FROM stories WHERE id=%s", (story_id,))
            story = cur.fetchone()
    links = []
    if story:
        try:
            pictures = json.loads(story.get("paragraph_images") or "[]")
        except (TypeError, ValueError):
            pictures = []
        links = [("cover", 0, story.get("cover"))] + [("paragraph_image", i, path) for i, path in enumerate(pictures)]
        manifest_path = ASSETS_ROOT / "assets" / "audio" / "stories" / "manifest.json"
        if manifest_path.is_file():
            try:
                audio = json.loads(manifest_path.read_text(encoding="utf-8")).get(story["slug"], [])
                links += [("audio", i, path) for i, path in enumerate(audio)]
            except (OSError, ValueError):
                pass
    resolved = []
    for role, position, path in links:
        if not isinstance(path, str) or not path.startswith("/assets/") or ".." in path or "\\" in path:
            continue
        local = ASSETS_ROOT / path.lstrip("/")
        if not local.is_file():
            continue
        asset_id = register_media({"public_path": path, "media_kind": "audio" if role == "audio" else "image",
                                   "file_bytes": local.stat().st_size, "title": story["title"]})
        resolved.append((story_id, role, position, asset_id))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM story_media_links WHERE story_id=%s", (story_id,))
            for row in resolved:
                cur.execute("INSERT INTO story_media_links(story_id,role,position,asset_id) VALUES(%s,%s,%s,%s)", row)
        conn.commit()


def register_media(values):
    path = str(values.get("public_path", "")).strip()
    kind = str(values.get("media_kind", "")).strip()
    if not path.startswith("/assets/") or ".." in path or "\\" in path:
        raise ValueError("素材路径必须是 /assets/ 下的站内路径")
    if kind not in MEDIA_KINDS:
        raise ValueError("素材类型无效")
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO media_assets
                (public_path,media_kind,mime_type,file_bytes,width,height,title,alt_text,source_name,source_url,license_name)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),
                    title=IF(VALUES(title)='',title,VALUES(title)),
                    alt_text=IF(VALUES(alt_text)='',alt_text,VALUES(alt_text)),
                    source_name=IF(VALUES(source_name)='',source_name,VALUES(source_name)),
                    source_url=IF(VALUES(source_url)='',source_url,VALUES(source_url)),
                    license_name=IF(VALUES(license_name)='',license_name,VALUES(license_name))""",
                (path, kind, str(values.get("mime_type", ""))[:100], int(values.get("file_bytes") or 0),
                 values.get("width"), values.get("height"), str(values.get("title", ""))[:160],
                 str(values.get("alt_text", ""))[:500], str(values.get("source_name", ""))[:200],
                 str(values.get("source_url", ""))[:1000], str(values.get("license_name", ""))[:100]))
            asset_id = cur.lastrowid
        conn.commit()
    return asset_id


def list_media(page=1, size=30, kind=""):
    page, size = max(1, int(page)), max(1, min(100, int(size)))
    where, params = ("WHERE media_kind=%s", (kind,)) if kind else ("", ())
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM media_assets {where}", params)
            total = cur.fetchone()["total"]
            cur.execute(f"SELECT * FROM media_assets {where} ORDER BY id DESC LIMIT %s OFFSET %s",
                        params + (size, (page - 1) * size))
            items = cur.fetchall()
    return {"items": items, "total": total, "page": page, "page_size": size}


def update_media(asset_id, values):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE media_assets SET title=%s,alt_text=%s,source_name=%s,
                source_url=%s,license_name=%s WHERE id=%s""",
                (str(values.get("title", ""))[:160], str(values.get("alt_text", ""))[:500],
                 str(values.get("source_name", ""))[:200], str(values.get("source_url", ""))[:1000],
                 str(values.get("license_name", ""))[:100], asset_id))
            cur.execute("SELECT * FROM media_assets WHERE id=%s", (asset_id,))
            item = cur.fetchone()
        conn.commit()
    return item


def _asset_exists(cur, asset_id, kind):
    if not asset_id:
        return None
    row = cur.execute("SELECT id FROM media_assets WHERE id=%s AND media_kind=%s", (asset_id, kind))
    if not row:
        raise ValueError(f"所选{kind}素材不存在")
    return int(asset_id)


def save_item(values, item_id=None):
    kind = str(values.get("kind", ""))
    status = str(values.get("status", "draft"))
    slug = str(values.get("slug", "")).strip()
    title = str(values.get("title", "")).strip()
    if kind not in KINDS or status not in STATUSES or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("内容类型、状态或素材 ID 无效")
    if not title or len(title) > 160:
        raise ValueError("请填写不超过 160 字的标题")
    segments = values.get("segments", [])
    if not isinstance(segments, list) or len(segments) > 300:
        raise ValueError("章节内容必须是列表，最多 300 段")
    if kind == "companion" and (values.get("category") not in {"encouragement", "song"}
                                 or not segments
                                 or any(not isinstance(s, dict) or not str(s.get("body", "")).strip() for s in segments)
                                 or (values.get("category") == "song" and any(not str(s.get("title", "")).strip() for s in segments if isinstance(s, dict)))):
        raise ValueError("伙伴内容请分类为鼓励或儿歌，并填写每一段文字")
    if status == "published" and (kind != "companion" and (not segments or not values.get("cover_asset_id")
                                  or (kind != "comic" and not values.get("model_asset_id"))
                                  or (kind == "comic" and not any(s.get("image_asset_id") for s in segments if isinstance(s, dict))))):
        raise ValueError("发布前请补齐封面、图文分镜或 3D 模型与讲解段落")
    with connection() as conn:
        try:
            with conn.cursor() as cur:
                cover = _asset_exists(cur, values.get("cover_asset_id"), "image")
                model = _asset_exists(cur, values.get("model_asset_id"), "model")
                data = (slug, kind, title, str(values.get("summary", ""))[:500],
                        str(values.get("stage", ""))[:40], str(values.get("grade", ""))[:40],
                        str(values.get("category", ""))[:80], status, cover, model)
                if item_id:
                    cur.execute("""UPDATE content_items SET slug=%s,kind=%s,title=%s,summary=%s,stage=%s,
                        grade=%s,category=%s,status=%s,cover_asset_id=%s,model_asset_id=%s WHERE id=%s""",
                        data + (item_id,))
                    if not cur.rowcount:
                        cur.execute("SELECT id FROM content_items WHERE id=%s", (item_id,))
                        if not cur.fetchone():
                            raise ValueError("内容不存在")
                    cur.execute("DELETE FROM content_segments WHERE item_id=%s", (item_id,))
                else:
                    cur.execute("""INSERT INTO content_items
                        (slug,kind,title,summary,stage,grade,category,status,cover_asset_id,model_asset_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", data)
                    item_id = cur.lastrowid
                for position, segment in enumerate(segments, 1):
                    if not isinstance(segment, dict):
                        raise ValueError("内容段落格式无效")
                    image = _asset_exists(cur, segment.get("image_asset_id"), "image")
                    audio = _asset_exists(cur, segment.get("audio_asset_id"), "audio")
                    chapter = int(segment.get("chapter_no") or 1)
                    if chapter < 1 or chapter > 1000:
                        raise ValueError("章节编号无效")
                    cur.execute("""INSERT INTO content_segments
                        (item_id,chapter_no,position,title,body,image_asset_id,audio_asset_id,hotspot_x,hotspot_y,hotspot_z)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (item_id, chapter, position, str(segment.get("title", ""))[:160],
                         str(segment.get("body", ""))[:10000], image, audio,
                         segment.get("hotspot_x"), segment.get("hotspot_y"), segment.get("hotspot_z")))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return get_item(item_id, public=False)


def list_items(page=1, size=12, kind="", public=True):
    page, size = max(1, int(page)), max(1, min(100, int(size)))
    if kind and kind not in KINDS:
        raise ValueError("内容类型无效")
    clauses = ["i.status='published'"] if public else []
    params = []
    if kind:
        clauses.append("i.kind=%s")
        params.append(kind)
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    join = "LEFT JOIN media_assets cover ON cover.id=i.cover_asset_id"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM content_items i {where}", params)
            total = cur.fetchone()["total"]
            cur.execute(f"""SELECT i.id,i.slug,i.kind,i.title,i.summary,i.stage,i.grade,i.category,i.status,
                i.updated_at,cover.public_path AS cover_path FROM content_items i {join} {where}
                ORDER BY i.id DESC LIMIT %s OFFSET %s""", params + [size, (page - 1) * size])
            items = cur.fetchall()
    return {"items": items, "total": total, "page": page, "page_size": size}


def get_item(item_id, public=True):
    condition = "AND i.status='published'" if public else ""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""SELECT i.*, cover.public_path AS cover_path, model.public_path AS model_path
                FROM content_items i LEFT JOIN media_assets cover ON cover.id=i.cover_asset_id
                LEFT JOIN media_assets model ON model.id=i.model_asset_id
                WHERE i.id=%s {condition}""", (item_id,))
            item = cur.fetchone()
            if not item:
                return None
            cur.execute("""SELECT s.*, image.public_path AS image_path, audio.public_path AS audio_path
                FROM content_segments s LEFT JOIN media_assets image ON image.id=s.image_asset_id
                LEFT JOIN media_assets audio ON audio.id=s.audio_asset_id
                WHERE s.item_id=%s ORDER BY s.chapter_no,s.position""", (item_id,))
            item["segments"] = cur.fetchall()
    return item


def list_pet_speech():
    """Published, editable companion phrases and short rhymes for the home UI."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT i.category,s.title,s.body FROM content_items i
                JOIN content_segments s ON s.item_id=i.id
                WHERE i.kind='companion' AND i.status='published'
                ORDER BY i.id,s.chapter_no,s.position LIMIT 500""")
            rows = cur.fetchall()
    return {
        "encouragements": [row["body"] for row in rows if row["category"] == "encouragement"],
        "songs": [{"title": row["title"], "lyrics": row["body"]}
                  for row in rows if row["category"] == "song"],
    }


def archive_item(item_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE content_items SET status='archived' WHERE id=%s", (item_id,))
            changed = cur.rowcount
        conn.commit()
    return bool(changed)
