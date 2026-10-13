import os
import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password=os.environ["FUFU_MYSQL_PASSWORD"], db='fufu_learning')
cur = c.cursor()
cur.execute("SELECT id, slug, title, story_type, category FROM stories WHERE story_type IN ('traditional-tale','traditional-myth') ORDER BY story_type, id")
for r in cur.fetchall():
    print(r)
c.close()
