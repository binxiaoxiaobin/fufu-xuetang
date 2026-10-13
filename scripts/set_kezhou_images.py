import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
imgs = [f"/assets/stories/ke-zhou-qiu-jian/{i}.png" for i in range(1, 7)]
cur.execute("UPDATE stories SET paragraph_images=%s WHERE id=4", (json.dumps(imgs, ensure_ascii=False),))
c.commit()
cur.execute("SELECT paragraph_images FROM stories WHERE id=4")
print("updated:", cur.fetchone())
c.close()
