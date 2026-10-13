# coding: utf-8
"""Build core and expansion vocabulary groups for the database seed."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
seed=root/'backend/seed_data/reader_lessons.json'
items=json.loads(seed.read_text(encoding='utf-8'));groups=[];used=set()
def add(subject,title,focus,words,level=1,kind='word'):
    lookup={i['word']:i for i in items if i['subject']==subject}
    members=[lookup[w] for w in words]
    group=dict(id='group-'+str(len(groups)+1),subject=subject,title=title,focus=focus,level=level,kind=kind,category=members[0]['category'],question_ids=[i['question_id'] for i in members],priority=len(groups))
    groups.append(group);used.update(group['question_ids'])
add('语文','身体小伙伴','先认识能指给别人看的身体部位。',['手','头','脚'],kind='character')
add('语文','家里的三个字','把字形与熟悉的房间物品联系起来。',['门','床','灯'],kind='character')
add('语文','户外发现','从生活中认识自然事物，不拆笔画。',['风','山','草'],kind='character')
add('语文','水果篮','熟悉的水果名称，练习两个字的顺序。',['苹果','香蕉','梨子'])
add('语文','餐桌准备好了','日常餐具，同一场景里反复认词。',['杯子','盘子','勺子','碗'])
add('语文','整理书包','在上学的情境里识字。',['铅笔','橡皮','尺子','书包'])
add('语文','看看天空','在同一自然场景中理解词义。',['太阳','月亮','星星'])
add('英语','短词起步 · a','熟悉物品和动物，观察短词中字母 a 的位置。',['cat','hat','map','bag','jam'])
add('英语','短词起步 · o','短词先行，听整词并观察拼写。',['dog','fox','box','pot'])
add('英语','短词起步 · u','先理解常见名词和动作，再记字母顺序。',['sun','cup','bus','run','hug'])
add('英语','水果篮','熟悉名称后，再练稍长的拼写。',['apple','banana','pear','grape'],2)
add('英语','身体小伙伴','可以指一指、说一说的日常词。',['hand','foot','eyes','ears','nose'],2)
add('英语','整理书包','用学校生活帮助理解和记忆。',['book','bag','pencil','ruler','eraser'],2)
# Keep every existing word available; expansion groups stay within a theme,
# difficulty and character/word form. Core sets above have manual teaching focus.
for subject in ['语文','英语']:
    buckets={}
    for item in items:
        if item['subject']!=subject or item['question_id'] in used:continue
        kind='character' if subject=='语文' and len(item['word'])==1 else 'word'
        difficulty=item['level']
        if subject=='语文':
            difficulty=max(difficulty,3 if len(item['word'])>3 else 2 if len(item['word'])==3 or item['word'] in {'蒜','姜','鲸','盐','糖','锅','鹅','踢'} else 1)
        elif len(item['word'])>8:difficulty=max(difficulty,2)
        key=(item['category'],difficulty,kind)
        buckets.setdefault(key,[]).append(item)
    for (category,level,kind),members in buckets.items():
        members.sort(key=lambda i:(len(i['word']),i['question_id']))
        # Spread tails across groups so groups have 3–5 items whenever possible.
        count=(len(members)+4)//5
        chunks=[members[n::count] for n in range(count)]
        for n,chunk in enumerate(chunks):
            add(subject,category+' · 扩展 '+str(n+1),'同主题扩展词；可先选认识起步，再尝试较长词。',[i['word'] for i in chunk],level,kind)
for item in items:item['learning_groups']=[g for g in groups if item['question_id'] in g['question_ids']]
seed.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'backend/seed_data/reader_learning_groups.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print("Reviewed learning groups rebuilt")
