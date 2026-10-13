# 小学英语、科学分类练习补充（2026-10-05）

用于首页“按学科练一练”和“学习小工具 → 专项训练”。运行时从 MySQL 的 `questions`、`question_options` 读取；本目录的 JSON 是导入包，前端不下载它。

## 发布结果

| 年级 | 英语原有 | 英语新增 | 英语现有 | 科学新增及现有 |
| --- | ---: | ---: | ---: | ---: |
| 一年级 | 12 | 488 | 500 | 300 |
| 二年级 | 12 | 488 | 500 | 300 |
| 三年级 | 492 | 8 | 500 | 300 |
| 四年级 | 492 | 8 | 500 | 300 |
| 五年级 | 492 | 8 | 500 | 300 |
| 六年级 | 402 | 98 | 500 | 300 |

实际新增 2,898 题：英语 1,098 题、科学 1,800 题。以上是每个年级的已发布题数；首页根据孩子年级显示。

## 内容范围

- 一、二年级英语为启蒙，按校园用品、颜色、动物、身体、家人、食物、数字、家居、动作、自然、描述等 11 个主题分类，包含认词义、选单词、拼写辨认和中英情境填空。素材库共 131 个词。每年级从候选题补足到目标，不要求所有单词都同时拥有四种题型。
- 三至五年级保留已有教材题库，仅增加各 8 道校园和生活情境题。
- 六年级增加出行情境短文阅读，考查人物、时间、地点、交通方式与目的。
- 科学按观察、植物、动物、材料、空气、水、天气、力、声音、电路、光、热、生态、地表、机械、能量和宇宙等分类。每年级选取 150 条知识素材，每条生成一道认识选择题和一道判断辨析题，共 300 题。辨析题的正确与错误说法各 75 题。
- 科学包含通用观察与安全基础、当前范围和相邻年级复习；一、二年级共享基础范围，之后逐步加入更深入的内容。题目是原创学科练习，不标成某一版教材的逐章同步题，也未标成教师人工审定试题。
- 每题包含答案、解析、提示、难度、年级、知识点、来源编号与原创说明；选择题有 2～4 个选项。

## 文件与复现

- `primary-english-starters.txt`：可编辑的英语词汇和例句素材。
- `primary-science-facts.txt`：可编辑的科学认识题、解析和错误说法素材。
- `scripts/build_primary_subject_expansion.py`：生成确定性的导入包。
- `primary-subject-expansion.json`：2,972 道候选题。导入时按数据库现状选择所需题目，本次实际发布 2,898 道。
- `scripts/import_primary_subject_expansion.py`：默认只预览，带 `--apply` 才写入。使用已有数据库环境变量；未提供密码时通过隐藏输入读取，不保存密码。

在项目根目录运行：

```text
python scripts/build_primary_subject_expansion.py
python scripts/test_primary_subject_expansion.py
python scripts/import_primary_subject_expansion.py
python scripts/import_primary_subject_expansion.py --apply
python scripts/verify_primary_subject_database.py
```

新环境应先导入项目原有基础和教材题库，再运行补充导入。本补充包根据现有基数补足目标，不代替完整的原有教材数据。候选题不足时在写入前停止。

导入采用单事务，按来源编号和同年级题干去重。仅新增，不覆盖或删除原题，不改教材关联。目标数量包含该年级和通用年级 `*` 的已发布题；已有题数超过目标时保持原数量。重复导入的新增数量为 0。

## 验证与备份

- 7 项内容及导入规划测试通过；公共出题接口的选项读取测试通过。
- 24 项真实数据库出题检查通过，覆盖六个年级的英语、科学，以及知识点过滤、采样回绕。检查生成的临时会话在结束后回滚。
- 新增题的答案与正确选项一致，解析及选项与导入包一致。
- 原有 7,877 道题及 15,477 条选项的内容散列在导入前后相同。
- 已在浏览器确认二年级首页英语 500 / 科学 300、两科实际题目、专项训练分类及分类题量。
- 原题库和选项完整备份：`artifacts/primary-subject-expansion-20261005-before-20261005-103718.json`。
- 导入记录：`artifacts/primary-subject-expansion-20261005-import-report.json`。
- 数据库检查记录：`artifacts/primary-subject-expansion-20261005-database-check.txt`。

首页继续只取分类数量，答题每次最多取 20 题；答案与解析由现有服务端判题流程提供，公开出题响应不包含答案。

## 部分科学事实核对资料

题干和解析采用原创中文表达。下列资料用于核对易混淆概念，不是复制试题的来源：

- [NASA：月相与反射太阳光](https://science.nasa.gov/moon/moon-phases/)
- [NASA：地轴倾斜与四季](https://spaceplace.nasa.gov/seasons/en/)
- [美国国家气象局：风向表示风吹来的方向](https://www.weather.gov/ggw/GlossaryW)
- [美国能源信息署：能量转移与转换](https://www.eia.gov/energyexplained/what-is-energy/laws-of-energy.php)
