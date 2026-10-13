"""Listening-first play questions, without primary-school literacy drills."""
import json
from collections import Counter
from build_subject_round2 import ROOT,row,english

DATASET='preschool-round2-20261008'
OUTPUT=ROOT/'content/questions/original'/f'{DATASET}.json'
GRADES=('小班','中班','大班')
REFERENCE='https://www.moe.gov.cn/srcsite/A06/s3327/201210/t20121009_143254.html'


def make(subject,g,identity,topic,prompt,answer,wrong,explanation,kind='listening'):
    q=row(subject,g,identity,topic,prompt,answer,wrong,explanation,kind)
    q.update(stage='幼儿园',grade=GRADES[g-1],source_record_id=q['source_record_id'].replace('subject-round2-20261008',DATASET),
             source_name='福福学堂原创·幼儿听题与生活游戏',source_url=REFERENCE,
             source_attribution='参考3—6岁儿童学习与发展指南；原创倾听、生活观察与游戏题；英语为可选接触，不属于指南规定学科。',
             hint='可以点“再听一次”，听完题目和选项再选择。',difficulty='easy')
    q['source_metadata'].update(dataset=DATASET,reference_role='生活游戏与倾听范围参考；英语仅为可选启蒙',exercise_kind=kind)
    return q


EVENTS=[
('小禾','花园','给花浇水','花盆里的土湿了'),('小雨','教室','整理玩具','玩具回到盒子里'),
('小安','家里','洗净双手','双手变干净了'),('小宁','图书角','轻轻翻书','书页没有被撕破'),
('小月','餐桌旁','把水杯摆好','每个座位前有了水杯'),('小川','操场','把球传给朋友','朋友接住了球'),
('小冬','手工区','把纸折成小船','一只纸船折好了'),('小青','门口','把雨伞放进伞架','地上不再摆着雨伞'),
('小乐','活动室','和朋友一起搭积木','一座积木房子搭好了'),('小满','散步的小路','停下来看蚂蚁','看到了蚂蚁搬食物')]


def chinese():
    rows=[]
    for g in range(1,4):
        for i,(name,place,act,result) in enumerate(EVENTS):
            material=f'{name}在{place}{act}。后来，{result}。'
            if g==2:material+=' 他把用过的东西收好了。'
            if g==3:material+=' 他把这件事告诉了老师，老师请他按顺序讲一讲。'
            others=[x for j,x in enumerate(EVENTS) if j!=i]
            tasks=[('听话找人物','故事里是谁在做这件事？',name,[x[0] for x in others],f'故事开头说的是{name}。'),
                   ('听话找地点',f'{name}在哪里？',place,[x[1] for x in others],f'故事说{name}在{place}。'),
                   ('听话找事情',f'{name}做了什么？',act,[x[2] for x in others],f'他做的是{act}。'),
                   ('听故事找结果','后来发生了什么？',result,[x[3] for x in others],f'故事的后一句说：{result}。')]
            for j,(topic,q,a,w,e) in enumerate(tasks):
                rows.append(make('语文',g,f'story-{i}-{j}',topic,'听一听小故事：'+material+'\n'+q,a,w,e))
    return rows


OBJECTS=['玩具熊','小汽车','布娃娃','皮球','积木','小船','纸花','画笔','水杯','小椅子']


def maths():
    rows=[]
    for g in range(1,4):
        for i in range(40):
            b,j=divmod(i,10);obj=OBJECTS[j]
            if b==0:
                n=j%(5 if g==1 else 10)+1
                items='，'.join([obj]*n)
                topic='数一数';q=f'老师依次摆好这些{obj}：{items}。一共有几个？';a=str(n);w=[str(n+1),str(n+2)];e=f'一个一个数，最后数到{n}，就是{n}个。'
            elif b==1:
                a1=j%(3 if g==1 else 7)+1;a2=a1+1;left,right=(a1,a2) if j%2==0 else (a2,a1)
                topic='比多少';q=f'左边有{left}个{obj}，右边有{right}个{obj}。哪边多？';a='左边' if left>right else '右边';w=['一样多','右边' if a=='左边' else '左边'];e=f'{max(left,right)}比{min(left,right)}多，所以{a}多。'
            elif b==2:
                relation=['上面','下面','里面','外面','前面'][j%5]
                opposite={'上面':'下面','下面':'上面','里面':'外面','外面':'里面','前面':'后面'}
                topic='位置与方向';q=f'听老师说：“{obj}放在盒子的{relation}。”它在哪里？';a=relation;w=[opposite[a],'左边'];e=f'听到的是盒子的{relation}。可以用自己的玩具摆一摆。'
            elif g==3:
                n=j%5+1;m=j%3+1
                if j%2==0:q=f'盘里有{n}个小饼干，又放进去{m}个。现在有几个？';a=str(n+m);e=f'原来的{n}个加上新放的{m}个，共{a}个。'
                else:q=f'盘里有{n+m}个小饼干，拿走{m}个。还剩几个？';a=str(n);e=f'从{n+m}个里拿走{m}个，还剩{n}个。'
                topic='生活中的添减';w=[str(int(a)+1),str(int(a)+2)]
            else:
                relation='大' if j%2==0 else '小';topic='比较大小';q=f'两个{obj}放在一起，一个大、一个小。老师要{relation}的，应该选哪个？';a=relation+'的'+obj;w=[('小' if relation=='大' else '大')+'的'+obj,'两个都不选'];e=f'老师要{relation}的，应选{a}，注意听清“大”和“小”。'
            rows.append(make('数学',g,str(i),topic,q,a,w,e,'number_play'))
    return rows


# scenario | question | correct | wrong1 | wrong2 | explanation
SCIENCE=[
('老师把冰放在温暖的房间，过一会儿冰变成了水。','冰后来变成了什么？','水','石头','纸片','冰变暖会融化成水。'),
('小雨轻轻摸棉花，发现棉花软软的。','棉花摸起来怎样？','软软的','像石块一样硬','像木板一样硬','棉花一般摸起来柔软。'),
('小禾看银杏叶，发现叶子像一把小扇子。','这片叶子像什么？','小扇子','长筷子','皮球','题目描述的银杏叶是扇形的。'),
('老师轻敲小鼓，孩子们听到了鼓声。','孩子们用什么听到鼓声？','耳朵','鼻子','脚','耳朵可以听声音。'),
('老师把铁钉和木块放在磁铁旁，铁钉被吸过去了。','哪一个被磁铁吸过去了？','铁钉','木块','两个都没有','这次观察中铁钉被磁铁吸引，木块没有。'),
('纸巾碰到少量清水，清水慢慢浸湿了纸巾。','纸巾后来怎样了？','湿了','变成石头','长出树叶','纸巾能吸收水，所以会湿。'),
('晴天，小安站在阳光下，在地上看到了自己的影子。','地上出现了什么？','影子','月亮','彩虹','身体挡住部分光，地面上会出现影子。'),
('风吹来，树上的叶子轻轻摇动。','叶子为什么摇动？','有风吹来','叶子在读书','树变成了汽车','风可以吹动树叶。'),
('小宁照顾小苗，几天后看到新的叶子。','小苗出现了什么变化？','长出新叶','变成杯子','变成玩具车','植物生长时可能长出新叶。'),
('老师在水槽里演示，水从较高处向较低处流。','水流向哪边？','较低处','一直往天上流','变成积木后流','这次水沿着坡面流向较低处。'),
('小鱼在水里摆动身体和鳍，游到了水草旁。','小鱼在哪里游动？','水里','干燥书桌上','树梢上','鱼生活在水中，借助身体和鳍的运动游动。'),
('鸟展开翅膀，从树枝上飞起来。','鸟展开了什么？','翅膀','鱼鳍','人的手臂','鸟有翅膀，很多鸟能用翅膀飞行。'),
('老师把气球吹起来，气球鼓起来了。','气球里增加了什么？','空气','石头','树叶','吹气向气球中送入空气，使它鼓起来。'),
('小月透过透明水杯看见了后面的红花。','这个杯子能让人看到后面的东西吗？','能','完全不能','一定会把花变成树','透明的杯子可以让部分光透过。'),
('小安在雨后抬头看天空，看到了彩虹。','小安在哪里看到了彩虹？','天空中','抽屉里','鞋盒里','彩虹是天空中可能出现的光学现象。'),
('老师让孩子们看天空，云挡住了部分太阳光。','云在哪里？','天空中','书本里','餐盘里','云在天空中，能遮挡部分阳光。'),
('小禾轻轻捏橡皮泥，橡皮泥变了形状。','橡皮泥发生了什么变化？','形状变了','变成水','立刻长出叶子','橡皮泥受力可以改变形状。'),
('老师给植物的土浇适量水，没有把花盆灌满。','老师给土加了什么？','水','汽油','糖果','植物需要适量水，不能乱加其他东西。'),
('小乐用干毛巾擦掉桌上的水，毛巾湿了。','什么吸走了桌上的水？','毛巾','影子','鼓声','毛巾能吸水，擦过后会湿。'),
('小雨摸自己的手，发现手是暖的；老师提醒不要摸热水壶。','热水壶能随便摸吗？','不能，要避免烫伤','可以一直抱着','要用脸贴着看','热水壶可能烫伤，应由成人处理。')]


def science():
    rows=[]
    for g in range(1,4):
        for i,(material,q,a,w1,w2,e) in enumerate(SCIENCE):
            rows.append(make('科学',g,f'observe-{i}', '生活观察',material+'\n'+q,a,[w1,w2],e,'observation'))
            good='把刚才看到或听到的事情告诉老师'
            wrong=['没有观察就随便说一个结果','为了看清，把东西放进嘴里']
            if g==2:good='把看到的变化画下来，再告诉老师';wrong=['只画没有见到的变化','把观察材料放进嘴里尝一尝']
            if g==3:good='记录看到的现象，有不懂的地方问老师';wrong=['只按自己的猜想改写结果','用嘴尝所有材料']
            rows.append(make('科学',g,f'record-{i}','表达观察结果',material+'\n观察完，怎样分享自己的发现更合适？',good,wrong,'分享发现应说出实际看到或听到的事情，可以画下来或提问；不能乱尝材料。','observation'))
    return rows


def english_play():
    base=[q for q in english() if q['grade']=='一年级']
    rows=[]
    for g in range(1,4):
        for i,q in enumerate(base):
            correct=next(o['text'] for o in q['options'] if o['key']==q['answer'])
            wrong=[o['text'] for o in q['options'] if o['key']!=q['answer']]
            rows.append(make('英语',g,str(i),'英语可选启蒙',q['prompt'].replace('阅读英文材料：','听一听简单英语：'),correct,wrong,q['explanation'],'optional_english'))
    return rows


def validate(rows):
    count=Counter();seen=set();ids=set()
    for q in rows:
        scoped=(q['subject'],q['grade'],q['prompt'])
        assert scoped not in seen and q['source_record_id'] not in ids
        seen.add(scoped);ids.add(q['source_record_id']);count[q['subject'],q['grade']]+=1
        assert q['stage']=='幼儿园' and q['grade'] in GRADES
        assert q['explanation'] and q['hint'] and len(q['options'])==3
        assert len({o['text'] for o in q['options']})==3
        assert sum(o['key']==q['answer'] for o in q['options'])==1
    assert len(rows)==480 and all(count[s,g]==40 for s in ('语文','数学','英语','科学') for g in GRADES)


if __name__=='__main__':
    rows=chinese()+maths()+science()+english_play();validate(rows)
    OUTPUT.write_text(json.dumps({'dataset':DATASET,'questions':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Validated preschool package: 480 questions, 40 per subject per grade.')
