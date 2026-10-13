import os
import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password=os.environ["FUFU_MYSQL_PASSWORD"], db='fufu_learning')
cur = c.cursor()
cur.execute("UPDATE stories SET story_type='chengyu', category='成语故事' WHERE slug IN ('wo-xin-chang-dan','fu-jing-qing-zui')")
c.commit()
print('affected:', cur.rowcount)
cur.execute("SELECT id, title, story_type, category FROM stories WHERE slug IN ('wo-xin-chang-dan','fu-jing-qing-zui')")
for r in cur.fetchall():
    print(r)
c.close()
