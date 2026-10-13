import os
import pymysql, json, sys
sys.path.insert(0, r"D:\福福学堂\scripts")
from trad2_stories import STORIES

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
    if cur.fetchone():
        print(f"SKIP {slug}")
        continue
    cur.execute("""
        INSERT INTO stories (slug, story_type, title, category, age, color, emoji, summary, moral, tags,
                             reading_minutes, cover, cover_status, source_note, cover_prompt, paragraphs, paragraph_images)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        slug, s["story_type"], s["title"], s["category"], "5–9岁", "#e6d8ba", "📖",
        s["summary"], s["moral"], json.dumps(s["tags"], ensure_ascii=False),
        3, cover, "ready", s["source_note"],
        "明亮水彩Q版儿童绘本封面",
        json.dumps(paras, ensure_ascii=False),
        json.dumps(para_imgs, ensure_ascii=False),
    ))
    print(f"INSERT {slug} {s['title']} id={cur.lastrowid}")

c.commit()
cur.execute("SELECT id, title, story_type, category FROM stories WHERE story_type='traditional-tale' ORDER BY id")
print("\n--- 传统故事列表 ---")
for r in cur.fetchall():
    print(f"  {r['id']:>4}  {r['title']}")
c.close()
