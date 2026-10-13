"""Build inspectable primary extensions; do not overwrite Grade 1's edition."""
import json
import random
from pathlib import Path
from primary_catalog import GRADES,MATH,U,T
from primary_chinese_questions import CHINESE,topics as chinese_topics,generate as chinese_generate
from primary_english_questions import ENGLISH,generate as english_generate
from primary_math_questions import generate as math_generate,verify
from build_grade1_curriculum import validate

ROOT=Path(__file__).resolve().parent.parent
AUTHORSHIP='福福学堂原创基础同步练习；参考明确标注版本的教材目录，非出版社配套原题；未声称教师审核或覆盖全部教学活动'


def finish(b):
    for ui,u in enumerate(b['units']):
        u.update(id=b['id']+'.u%02d'%ui,position=ui)
        for ti,t in enumerate(u['topics']):
            t.update(id=u['id']+'.t%02d'%ti,position=ti)
            if b['subject']=='数学':
                # Enforce the taught operand sizes, not merely a matching label.
                if t['kind']=='arithmetic':
                    p=t['data'];grade=GRADES.index(b['grade'])+1
                    if '一位数' in t['title'] or (grade<=3 and p[0]=='div') or grade==2 and p[0] in ('mul','div'):p=p[:3]+[9,2]
                    if '两位数乘两位数' in t['title'] or '三位数乘两位数' in t['title'] or '两位数乘法' in t['title']:p=p[:3]+[99,11]
                    if '除数是两位数' in u['title'] and p[0]=='div':p=p[:3]+[40,10]
                    if t['title'] in ('两位数加法','两位数减法'):p=p[:3]+[20,11]
                    t['data']=p
                if t['kind']=='word' and GRADES.index(b['grade'])+1<=3:
                    t['data']=t['data'][:3]+['table' if b['grade']=='二年级' else 'single']
                items=math_generate(t['kind'],t['data'],t['id'])
                for item in items:verify(item)
            elif b['subject']=='语文':items=chinese_generate(t['kind'],t['data'])
            else:items=english_generate(t['kind'],t['data'])
            rng=random.Random(t['id'])
            for qi,item in enumerate(items):
                item.update(source_record_id=t['id']+'.q%02d'%qi,difficulty='easy' if qi<6 else 'medium',hint='先读清题目，关注“'+t['title']+'”；阅读题请回到短文寻找依据。')
                options=item.pop('choices',None)
                if options:
                    options=list(dict.fromkeys(options));rng.shuffle(options)
                    item.update(question_type='single_choice',options=[dict(key=str(i+1),text=x) for i,x in enumerate(options)],answer=str(options.index(item['answer_text'])+1))
                else:item.update(question_type='short_answer',options=[],answer=item['answer_text'])
            t['questions']=items
    return b


def build():
    books=[]
    for (grade,term),units in MATH.items():
        ref='https://download.pep.com.cn/xsxjc/22xjcsx%d1x/index.html'%grade if term=='a' else 'https://bp.pep.com.cn/2020chun/'
        books.append(dict(id='pepclassic-g%d-math-%s'%(grade,term),subject='数学',stage='小学',grade=GRADES[grade-1],term='上册' if term=='a' else '下册',title=GRADES[grade-1]+'数学'+('上册' if term=='a' else '下册'),edition='人教版经典目录（2013—2014编排；非2024后修订目录）',source_url='https://bp.pep.com.cn/xsjc2022/',directory_reference=ref,units=units))
    for (grade,term),mapping in CHINESE.items():
        units=[]
        for ui,(theme,bank,skill) in enumerate(mapping):
            # These are basic text exercises. Do not label generic drills as a
            # complete evaluation of a unit-specific higher reading objective.
            ts=chinese_topics(theme,bank,skill,ui+(0 if term=='a' else 8),grade)
            ts[-1]['title']=theme+' · 句段表达与阅读依据'
            units.append(U('第%d单元 · %s'%(ui+1,theme),*ts))
        books.append(dict(id='compiledclassic-g%d-chinese-%s'%(grade,term),subject='语文',stage='小学',grade=GRADES[grade-1],term='上册' if term=='a' else '下册',title=GRADES[grade-1]+'语文'+('上册' if term=='a' else '下册'),edition='统编版经典目录（2017—2019编排；非2024后修订目录）',source_url='https://www.pep.com.cn/rjyc/kcjc/gjkc/tbjc/',directory_reference='https://www.pep.com.cn/xw/zt/cp/zxxgswzt/xxbf/',units=units))
    for (grade,term),mapping in ENGLISH.items():
        units=[]
        for ui,(title,bank,grammar) in enumerate(mapping):
            units.append(U(title,T('主题词汇理解','english_words',[bank,title]),T('核心句型运用','english_grammar',[grammar,bank,title]),T('主题短文阅读','english_reading',[bank,title,grade,ui])))
        source='https://www.pep.com.cn/zslth/yyptypzj/xypep/%d%s/'%(grade,'s' if term=='a' else 'x')
        books.append(dict(id='pepclassic-g%d-english-%s'%(grade,term),subject='英语',stage='小学',grade=GRADES[grade-1],term='上册' if term=='a' else '下册',title=GRADES[grade-1]+'英语'+('上册' if term=='a' else '下册')+'（三年级起点）',edition='人教PEP经典版（三年级起点，2012—2014编排）',source_url=source,directory_reference=source,units=units))
    payload=dict(schema_version=1,authorship=AUTHORSHIP,books=[finish(b) for b in books])
    validate(payload)
    output=ROOT/'content/questions/primary-classic-extension.json'
    output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    summary=dict(books=len(books),units=sum(len(b['units']) for b in books),topics=sum(len(u['topics']) for b in books for u in b['units']),questions=sum(len(t['questions']) for b in books for u in b['units'] for t in u['topics']))
    print(json.dumps(summary,ensure_ascii=False))
    return payload


if __name__=='__main__':build()
