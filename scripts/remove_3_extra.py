import os
import json, pymysql

# 1. 从 JSON 种子文件删除这 3 条
p = r"D:\福福学堂\content\stories\chengyu-and-tradition.json"
d = json.load(open(p, encoding="utf-8"))
before = len(d["stories"])
remove_slugs = {"xiao-xiong-zhong-tai-yang", "wei-shen-me-hui-xia-yu", "yue-liang-wei-shen-me-hui-bian-lian"}
d["stories"] = [s for s in d["stories"] if s["slug"] not in remove_slugs]
after = len(d["stories"])
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"JSON: {before} -> {after} 条，删除了 {before-after} 条")

# 2. 从数据库删除
c = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=os.environ["FUFU_MYSQL_PASSWORD"],
                    database='fufu_learning', charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()
cur.execute("DELETE FROM stories WHERE slug IN ('xiao-xiong-zhong-tai-yang','wei-shen-me-hui-xia-yu','yue-liang-wei-shen-me-hui-bian-lian')")
print(f"数据库删除行数: {cur.rowcount}")
c.commit()
cur.execute("SELECT id, title FROM stories ORDER BY id")
for r in cur.fetchall():
    print(f"  剩余: id={r['id']} {r['title']}")
c.close()
