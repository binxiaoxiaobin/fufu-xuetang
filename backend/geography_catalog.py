"""Database-backed province photo cards for the interactive China map."""
import json
import mimetypes
from pathlib import Path

from content_catalog import register_media
from mysql_db import connection

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
ASSETS_ROOT = (FRONTEND / "assets").resolve()
MANIFEST = ROOT / "backend" / "seed_data" / "province_photos.json"
MIGRATION = "china_province_photos_v1"


def initialize():
    if not MANIFEST.is_file():
        raise FileNotFoundError(f"Province photo catalog missing: {MANIFEST}")
    photos = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if len(photos) != 34 or any(len(items) != 3 for items in photos.values()):
        raise ValueError("Province gallery seed must contain three photos for each of 34 regions")

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS province_photo_links (
                province_adcode INT UNSIGNED NOT NULL,
                position SMALLINT UNSIGNED NOT NULL,
                label VARCHAR(120) NOT NULL,
                caption VARCHAR(500) NOT NULL DEFAULT '',
                license_url VARCHAR(1000) NOT NULL DEFAULT '',
                asset_id BIGINT UNSIGNED NOT NULL,
                PRIMARY KEY (province_adcode, position),
                UNIQUE KEY uq_province_photo_asset (asset_id),
                CONSTRAINT fk_province_photo_asset FOREIGN KEY (asset_id)
                    REFERENCES media_assets(id) ON DELETE RESTRICT,
                INDEX idx_province_photo_order (province_adcode, position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("SELECT migration_key FROM content_migrations WHERE migration_key=%s", (MIGRATION,))
            already_seeded = bool(cur.fetchone())
        conn.commit()
    if already_seeded:
        return

    links = []
    for province, items in photos.items():
        if not str(province).isdigit():
            raise ValueError(f"Invalid province adcode: {province}")
        for position, photo in enumerate(items, start=1):
            path = str(photo.get("file", ""))
            if not path.startswith("/assets/real-tours/provinces/") or ".." in path or "\\" in path:
                raise ValueError(f"Invalid province photo path: {path}")
            local = (ASSETS_ROOT / path.removeprefix("/assets/")).resolve()
            try:
                local.relative_to(ASSETS_ROOT)
            except ValueError:
                raise ValueError(f"Province photo path escapes frontend assets: {path}")
            if not local.is_file():
                raise FileNotFoundError(f"Province photo missing: {path}")
            author = str(photo.get("author", "")).strip()
            source = str(photo.get("source", "")).strip()
            license_name = str(photo.get("license", "")).strip()
            if not author or not source.startswith("https://commons.wikimedia.org/") or not license_name:
                raise ValueError(f"Photo source and license attribution required: {path}")
            asset_id = register_media({
                "public_path": path,
                "media_kind": "image",
                "mime_type": mimetypes.guess_type(local.name)[0] or "image/jpeg",
                "file_bytes": local.stat().st_size,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "title": photo.get("label", ""),
                "alt_text": photo.get("caption", ""),
                "source_name": author,
                "source_url": source,
                "license_name": license_name,
            })
            links.append((int(province), position, photo["label"], photo.get("caption", ""),
                          photo.get("licenseUrl", ""), asset_id))

    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO province_photo_links
                (province_adcode,position,label,caption,license_url,asset_id)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE label=VALUES(label),caption=VALUES(caption),
                    license_url=VALUES(license_url),asset_id=VALUES(asset_id)""", links)
            cur.execute("INSERT IGNORE INTO content_migrations(migration_key) VALUES(%s)", (MIGRATION,))
        conn.commit()


def list_province_photos():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT p.province_adcode,p.label,p.caption,p.license_url,
                    a.public_path AS file,a.source_url AS source,a.source_name AS author,
                    a.license_name AS license,a.width,a.height
                FROM province_photo_links p
                JOIN media_assets a ON a.id=p.asset_id
                ORDER BY p.province_adcode,p.position""")
            rows = cur.fetchall()
    provinces = {}
    for row in rows:
        code = str(row.pop("province_adcode"))
        provinces.setdefault(code, []).append(row)
    return {"provinces": provinces}
