# -*- coding: utf-8 -*-
"""Publish reviewed science-film scripts to the card catalog and live DB."""
import json
import re
from pathlib import Path
from PIL import Image

from mysql_db import connection
from content_catalog import register_media

ROOT = Path(__file__).resolve().parents[1]
FILMS = ROOT / "artifacts" / "science-films"
CATALOG = ROOT / "content" / "learning" / "science-cards.json"
LESSONS = [
    ("sky-blue", "为什么天空是蓝色的？", "白光穿过空气，蓝色光为什么更容易散开？", "NASA Space Place; 大连理工大学物理教学中心", "https://spaceplace.nasa.gov/blue-sky/en/"),
    ("moon-phases", "月亮为什么会变样子？", "月亮没有变形，变化的是我们看见的亮面。", "NASA Space Place; NASA Science", "https://spaceplace.nasa.gov/moon-phases/sp/"),
    ("rainbow", "彩虹是怎样出现的？", "阳光经过雨滴，折射和反射让颜色排成弧线。", "NASA Space Place; NASA APOD; NASA Cosmicopia", "https://spaceplace.nasa.gov/review/posters/goes-funpad/goes-r_activity_book.pdf"),
    ("thunder", "闪电之后为什么会有雷声？", "闪电把空气迅速加热，膨胀的空气发出声响。", "美国国家气象局 NWS", "https://www.weather.gov/safety/lightning-science-thunder"),
    ("ice-floats", "冰为什么会浮在水面？", "水结成冰后结构更疏，密度变小，于是浮起来。", "美国地质调查局 USGS", "https://www.usgs.gov/water-science-school/science/water-density"),
    ("plant-light", "植物为什么会朝光生长？", "嫩茎两侧生长速度不同，会让茎弯向光源。", "Penn State Extension; Colorado State University Extension", "https://extension.psu.edu/how-plants-move/"),
]
LESSONS = [(x['slug'], x['title'], x['subtitle'], x['source'], x['url'])
           for x in json.loads((FILMS / 'batch-lessons.json').read_text(encoding='utf-8'))] + LESSONS

def main():
    for slug, *_ in LESSONS:
        if not (FILMS / 'out' / slug / 'cover-720x480-a.png').is_file():
            raise RuntimeError(f'Missing reviewed cover: {slug}')
        if not (ROOT / 'frontend' / 'assets' / 'content' / f'science-{slug}.mp4').is_file():
            raise RuntimeError(f'Missing published video: {slug}')
    cards = []
    for pos, (slug, title, subtitle, source, url) in enumerate(LESSONS):
        script = (FILMS / "brief" / slug / "script.zh.txt").read_text(encoding="utf-8")
        paragraphs = [part.strip() for part in script.split("\n\n") if part.strip()]
        cover = FILMS / 'out' / slug / 'cover-720x480-a.png'
        if not cover.is_file():
            raise RuntimeError(f'Missing reviewed cover: {slug}')
        image_path = f'/assets/learning/science/{slug}-card-v2.webp'
        destination = ROOT / 'frontend' / image_path.lstrip('/')
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(cover) as image:
            image.convert('RGB').save(destination, 'WEBP', quality=92)
        image_id = register_media({'public_path': image_path, 'media_kind': 'image',
            'mime_type': 'image/webp', 'file_bytes': destination.stat().st_size,
            'width': 720, 'height': 480, 'title': title, 'alt_text': title + '的手绘示意图',
            'source_name': '福福学堂原创白板手绘', 'license_name': '项目原创插图'})
        cards.append({"slug": slug, "subject": "科学", "kind": "science", "title": title,
            "collection": "手绘科学课", "subtitle": subtitle, "paragraphs": paragraphs,
            "image_path": image_path, "image_asset_id": image_id,
            "source_name": source, "source_url": url,
            "license_name": "原创中文讲稿、配音与手绘动画；科学事实参考来源链接", "position": pos})
    CATALOG.write_text(json.dumps([{k:v for k,v in card.items() if k!='image_asset_id'} for card in cards], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sql = """INSERT INTO learning_reading_cards
        (slug,subject,kind,title,author,dynasty,collection,subtitle,paragraphs_json,position,
         image_asset_id,audio_asset_id,source_name,source_url,license_name,explanation_json)
        VALUES (%s,%s,%s,%s,'','',%s,%s,%s,%s,%s,NULL,%s,%s,%s,NULL)
        ON DUPLICATE KEY UPDATE subject=VALUES(subject),kind=VALUES(kind),title=VALUES(title),
        collection=VALUES(collection),subtitle=VALUES(subtitle),paragraphs_json=VALUES(paragraphs_json),
        position=VALUES(position),image_asset_id=VALUES(image_asset_id),source_name=VALUES(source_name),source_url=VALUES(source_url),license_name=VALUES(license_name)"""
    with connection() as conn:
        with conn.cursor() as cur:
            for card in cards:
                cur.execute(sql, (card["slug"], card["subject"], card["kind"], card["title"],
                    card["collection"], card["subtitle"], json.dumps(card["paragraphs"], ensure_ascii=False),
                    card["position"], card["image_asset_id"], card["source_name"], card["source_url"], card["license_name"]))
            cur.execute("SELECT COUNT(*) AS total FROM learning_reading_cards WHERE kind='science' AND position<65535")
            total = cur.fetchone()["total"]
        conn.commit()
    print(f"Published {len(cards)} science cards; live visible count is {total}.")
    # Keep the player lookup and database catalog in sync from one lesson manifest.
    player = ROOT / 'frontend' / 'science-videos.js'
    source = player.read_text(encoding='utf-8')
    registry = {card['slug']: {'title':card['title'], 'description':card['subtitle'],
        'videoUrl':f"/assets/content/science-{card['slug']}.mp4", 'posterUrl':card['image_path']}
        for card in cards}
    source, replaced = re.subn(r'const lessons = \{.*?\n\s*\};', 'const lessons = '+json.dumps(registry,ensure_ascii=False,indent=2)+';',source,count=1,flags=re.S)
    if replaced != 1:
        raise RuntimeError('Could not update the science player registry')
    player.write_text(source,encoding='utf-8')

if __name__ == "__main__":
    main()
