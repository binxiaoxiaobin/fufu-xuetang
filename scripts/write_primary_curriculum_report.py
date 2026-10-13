# -*- coding: utf-8 -*-
"""Summarize the delivered database content and its actual version/skill scope."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
old=json.loads((ROOT/'content/questions/pep2024-grade1.json').read_text(encoding='utf-8'))
extension=json.loads((ROOT/'content/questions/primary-classic-extension.json').read_text(encoding='utf-8'))
books=old['books']+extension['books']
verification=json.loads((ROOT/'artifacts/primary-curriculum-verification.json').read_text(encoding='utf-8'))
lines=['# 小学全年级基础题库与使用说明','',
 '完成日期：2026-10-04。范围：小学一至六年级语文、数学上下册；英语为三年级起点，三至六年级上下册。这里的“全年级”指小学，不包含初中、高中。','',
 '本次新增 **5,960 题**。教材目录题库累计 **32 册、259 个单元及活动/复习板块、698 个已列知识点、6,980 道原创题**，每个已列知识点 10 题，均有答案、提示与解析。保留原有 897 道其他练习后，数据库题库总量 **7,877 题**。','',
 '## 教材版本与内容范围','',
 '一年级语文、数学保留上次制作的2024修订版目录。新增二至六年级语文按2017—2019统编版经典目录整理；二至六年级数学按人教版2013—2014经典编排整理；英语按PEP三年级起点2012—2014经典版整理。每册在数据库和页面均单独标注版本。新增册次没有冒充2024后修订版目录。','',
 '这是一套可自动判分的基础同步练习。知识点由本项目归纳；语文侧重主题字词、原创短文信息理解、句段表达与阅读依据，英语侧重主题词汇、核心句型、原创短文阅读，数学按单元列出计算与应用技能。它不等同于逐课、逐个教材教学目标的穷尽覆盖，暂不包括作文人工评价、真实口语录音测评、整篇课文背诵评价、实验操作评价。高年级的深入阅读、综合写作和跨知识点难题仍可继续加厚；目前的easy/medium为生成规则分组，并非学生实测难度。','',
 '题目为原创情境与练习，没有复制整篇教材课文或出版社配套试题。程序已校验算术、题量、选项和分类，尚未经过教师逐题审定。需要严格对齐正在使用的修订版时，应按对应册次另建版本目录与题目映射，再做教材逐课核对；不能只改旧版书名。','',
 '## 在 App 中使用','',
 '首页 → **教材同步练习** → 选择科目、练习年级 → 上册/下册 → 单元 → 知识点。首次进入默认个人学习年级；之后保留本次选过的年级和目录。英语一年级、二年级教材页显示三年级起点说明，原有低年级英语快练数据保留。','',
 '支持每组5题或10题、本单元综合练习、返回所在目录和继续同知识点练习。练习年级与个人资料分开，复习其他年级不会修改个人学习年级。','',
 '分数和负数短答题已切换为可输入斜杠和负号的文本键盘提示；普通数字题仍保留小数键盘。继续复用现有朗读、提示、判分、解析、积分和学习记录。答案由后端判定，首次出题不向浏览器发送正确答案；答对或按照现有两次答错揭晓流程展示解析。','',
 '## 数据与加载方式','',
 '- 原创数据文件：`content/questions/primary-classic-extension.json`。一年级文件仍为`content/questions/pep2024-grade1.json`。这些是可检查、可重复导入的数据源，App运行时从MySQL读取。',
 '- 沿用`curriculum_books → curriculum_units → curriculum_topics → question_curriculum`分类关系，题干、解析存入`questions`，选项存入`question_options`。参考来源和原创声明存入题目来源字段。',
 '- 数据库目录接口按一个层级读取。浏览器首次只加载当前年级当前科目的两册目录，随后读取当前册单元与当前单元知识点；题干在开始练习后只取5或10题。',
 '- 保留索引`idx_book_scope`、`idx_unit_book`、`idx_topic_unit`和`idx_topic_question`。出题候选池有上限，并优先避开最近答过的题。不要改成把6980道题一次性发给平板。',
 '- 导入程序支持指定数据文件与报告路径，使用事务、导入锁和稳定来源编号去重。重复导入不会再添加相同题目；修订脚本只更新仍与此前生成内容相同的题目，检测到编辑差异即中止。','',
 '## 验证结果','',
 '- 已通过32册目录、259个单元和698个知识点的真实数据库出题测试：每个知识点可取10题，科目/年级/单元映射一致。',
 '- 单选、整数、小数、分数、负数答案均走真实判分接口验证，解析正常返回。测试学习者、练习、积分全部回滚。',
 '- 一年级既有测试继续覆盖跨学习者隔离、两次答错后的解析揭晓、重复提交防重复加分、非法目录输入和索引使用。',
 '- 保全检查比较此前1917道题及其选项、学习者年级与积分摘要，确认本次追加不改动已有数据。',
 '- 浏览器检查覆盖六年级英语上下册与练习、数学分数练习、二年级语文以及英语起点说明。平板尺寸布局的检查用于发现横向溢出，不等同于真实iPad的Safari性能测试。',
 '- 本机测试中的数据库目录/出题调用中位耗时为 **%s ms**，最大 **%s ms**；这是本机单连接测试数据，不是网络延迟或并发压测。'%(verification['database_timing_ms']['median'],verification['database_timing_ms']['max']),'',
 '服务继续使用8000端口。本次无需重新启动后端；数据库新增目录立即可读。前端版本号已更新，刷新页面获取新的入口文案和默认年级行为。','',
 '## 册次清单','', '| 年级 | 科目 | 册次 | 板块数 | 知识点 | 题数 |', '| --- | --- | --- | ---: | ---: | ---: |']
for b in sorted(books,key=lambda b:({'一年级':1,'二年级':2,'三年级':3,'四年级':4,'五年级':5,'六年级':6}[b['grade']],b['subject'],b['term'])):
    topics=sum(len(u['topics']) for u in b['units']);count=sum(len(t['questions']) for u in b['units'] for t in u['topics'])
    lines.append('| %s | %s | %s | %d | %d | %d |'%(b['grade'],b['subject'],b['term'],len(b['units']),topics,count))
lines+=['','## 后续扩展顺序','',
 '1. 针对实际采用的教材版本建立逐课核对清单，优先审核孩子当前年级；旧版与修订版分别保留稳定编号。',
 '2. 逐单元增加高年级推理、写作思路、综合应用题；增加题目难度和错误类型的教师标注，避免仅用改数字的方式扩大题量。',
 '3. 根据答题记录加入错题复习和阶段测验，仍按小批量读取。题库规模增加后再按真实慢查询调整索引与统计缓存。',
 '4. 图片、音频或漫画等新增素材放入指定的`frontend/assets`子目录并建立数据库媒体关联，不把素材与答案批量塞进首页。','',
 '## 目录与版本参考','',
 '- [人教社小学数学2022插图重绘版及电子教材入口](https://bp.pep.com.cn/xsjc2022/)',
 '- [人教社统编教材栏目](https://www.pep.com.cn/rjyc/kcjc/gjkc/tbjc/)',
 '- [人教社小学语文古诗文专题及目录入口](https://www.pep.com.cn/xw/zt/cp/zxxgswzt/xxbf/)',
 '- [人教社PEP经典版四年级上册配套目录](https://www.pep.com.cn/zslth/yyptypzj/xypep/4s/)',
 '- [人教社修订版英语结构说明](https://www.pep.com.cn/xw/zt/hd/12/xjcjs/xx/202409/t20240920_1995564.html)：新版单元安排有变化，因此与当前导入的经典版分开标记。','',
 '公开电子教材入口有部分访问限制；保留了可以读取的出版社页面及版本目录检索资料在`artifacts/primary-textbook-references`，没有把受限访问的页面标为已逐页审核。','',
 '## 知识点与题量清单','']
for b in books:
    lines+=['### '+b['title'],'',b['edition'],'']
    for u in b['units']:
        lines.append('- '+u['title']+'：'+'；'.join(t['title']+'（'+str(len(t['questions']))+'题）' for t in u['topics']))
    lines.append('')
(ROOT/'artifacts/小学全年级题库与展示方案.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Primary curriculum report written.')
