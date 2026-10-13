import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
cur.execute("SELECT id, slug, title, cover, cover_status, cover_prompt, paragraphs FROM stories WHERE title LIKE %s", ("%刻舟求剑%",))
row = cur.fetchone()
print("ID:", row['id'])
print("slug:", row['slug'])
print("title:", row['title'])
print("cover:", row['cover'])
print("cover_status:", row['cover_status'])
print("cover_prompt:", row['cover_prompt'])
print("---paragraphs---")
p = json.loads(row['paragraphs'])
print("段落数:", len(p))
for i, x in enumerate(p):
    print(f"[{i+1}]", x)
    print()
