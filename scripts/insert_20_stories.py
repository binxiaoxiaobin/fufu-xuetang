import pymysql, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from mysql_db import _settings
from new_stories_data import STORIES

c = pymysql.connect(**_settings())
cur = c.cursor()

for s in STORIES:
    slug = s["slug"]
    cover = f"/assets/stories/{slug}.png"
    paras = s["paragraphs"]
    para_imgs = [f"/assets/stories/{slug}/{i}.png" for i in range(1, len(paras)+1)]
    # check if exists
    cur.execute("SELECT id FROM stories WHERE slug=%s", (slug,))
    row = cur.fetchone()
    if row:
        print(f"SKIP {slug} (already exists id={row['id']})")
        continue
    cur.execute("""
        INSERT INTO stories (slug, story_type, title, category, age, color, emoji, summary, moral, tags,
                             reading_minutes, cover, cover_status, source_note, cover_prompt, paragraphs, paragraph_images)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        slug,
        "chengyu", s["title"], "成语故事", "6–9岁", "#e6d8ba", "📖",
        s["summary"], s["moral"], json.dumps(s["tags"], ensure_ascii=False),
        3, cover, "ready", s["source_note"],
        "中国风水墨儿童绘本封面",
        json.dumps(paras, ensure_ascii=False),
        json.dumps(para_imgs, ensure_ascii=False),
    ))
    print(f"INSERT {slug} {s['title']} id={cur.lastrowid}")

c.commit()
cur.execute("SELECT id, title FROM stories ORDER BY id")
for r in cur.fetchall():
    print(f"  id={r['id']} {r['title']}")
c.close()
