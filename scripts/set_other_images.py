import os
import pymysql, json
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
mapping = {
    5: "shou-zhu-dai-tu",
    6: "hua-she-tian-zu",
    7: "si-ma-guang-za-gang",
    8: "cao-chong-cheng-xiang",
    9: "hou-yi-she-ri",
}
for sid, slug in mapping.items():
    imgs = [f"/assets/stories/{slug}/{i}.png" for i in range(1, 7)]
    cur.execute("UPDATE stories SET paragraph_images=%s WHERE id=%s",
                (json.dumps(imgs, ensure_ascii=False), sid))
    print(f"id={id} slug={slug} rows={cur.rowcount}")
c.commit()
cur.execute("SELECT id, title, paragraph_images FROM stories WHERE id IN (5,6,7,8,9) ORDER BY id")
for row in cur.fetchall():
    print(row['id'], row['title'], "->", json.loads(row['paragraph_images']))
c.close()
