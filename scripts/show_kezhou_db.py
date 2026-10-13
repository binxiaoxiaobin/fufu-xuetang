import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
cur.execute("SELECT id, title, cover, paragraph_images FROM stories WHERE id=4")
row = cur.fetchone()
print("故事ID:", row['id'])
print("标题:", row['title'])
print("封面字段 cover:", row['cover'])
print("段落图字段 paragraph_images (原始存储值):")
print(row['paragraph_images'])
print()
imgs = json.loads(row['paragraph_images'])
print(f"共 {len(imgs)} 条路径：")
for i, p in enumerate(imgs, 1):
    print(f"  段{i}: {p}")
c.close()
