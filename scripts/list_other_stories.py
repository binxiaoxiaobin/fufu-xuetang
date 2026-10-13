import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
cur.execute("SELECT id, slug, title, cover, paragraphs FROM stories WHERE id!=4 ORDER BY id")
for row in cur.fetchall():
    print("="*60)
    print(f"id={row['id']} slug={row['slug']} title={row['title']}")
    print(f"cover={row['cover']}")
    ps = json.loads(row['paragraphs'])
    print(f"段落数={len(ps)}")
    for i, p in enumerate(ps, 1):
        print(f"  [{i}] {p}")
c.close()
