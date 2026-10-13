import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
# 检查是否已有该字段
cur.execute("SHOW COLUMNS FROM stories LIKE 'paragraph_images'")
exists = cur.fetchone()
if not exists:
    cur.execute("ALTER TABLE stories ADD COLUMN paragraph_images LONGTEXT NULL")
    print("Added paragraph_images column")
    cur.execute("UPDATE stories SET paragraph_images='[]' WHERE paragraph_images IS NULL")
    print("Backfilled existing rows with []")
else:
    print("paragraph_images column already exists")
c.commit()
cur.execute("SHOW COLUMNS FROM stories LIKE 'paragraph_images'")
print(cur.fetchone())
c.close()
