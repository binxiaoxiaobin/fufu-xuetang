import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
cur.execute("SELECT * FROM stories ORDER BY id")
rows = cur.fetchall()
for r in rows[:2]:
    for k, v in r.items():
        if k == 'paragraphs':
            p = json.loads(v)
            print(f"  {k}: [{len(p)}段] 第1段: {p[0][:60]}...")
        elif k == 'paragraph_images':
            print(f"  {k}: {v[:100]}...")
        else:
            print(f"  {k}: {v}")
    print("="*50)
c.close()
