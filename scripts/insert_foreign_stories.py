import os
import pymysql, json, sys
sys.path.insert(0, r"D:\福福学堂\scripts")
from foreign_stories_data import STORIES

c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()

for s in STORIES:
    slug = s["slug"]
    cover = f"/assets/stories/{slug}.png"
    paras = s["paragraphs"]
    para_imgs = [f"/assets/stories/{slug}/{i}.png" for i in range(1, len(paras)+1)]
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
        "foreign-tale", s["title"], "外国童话", "5–9岁", "#b8d4e3", "🌍",
        s["summary"], s["moral"], json.dumps(s["tags"], ensure_ascii=False),
        3, cover, "ready", s["source_note"],
        "明亮水彩儿童绘本封面",
        json.dumps(paras, ensure_ascii=False),
        json.dumps(para_imgs, ensure_ascii=False),
    ))
    print(f"INSERT {slug} {s['title']} id={cur.lastrowid}")

c.commit()
cur.execute("SELECT id, title, story_type FROM stories WHERE story_type='foreign-tale' ORDER BY id")
for r in cur.fetchall():
    print(f"  id={r['id']} {r['title']}")
c.close()
