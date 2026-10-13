import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
cur.execute("SELECT id, slug, title, story_type, cover FROM stories ORDER BY id")
rows = cur.fetchall()
print(f"数据库里共 {len(rows)} 条故事：")
for r in rows:
    print(f"  id={r['id']} type={r['story_type']} slug={r['slug']} title={r['title']} cover={r['cover']}")
c.close()
