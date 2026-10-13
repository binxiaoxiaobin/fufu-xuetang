"""Reproducible original exercises aligned to the revised Grade 1 textbook skills.

This creates a validated, inspectable JSON import, not a runtime text generator.
Arithmetic is computed; language examples are explicitly curated below.
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDITION = '2024修订版（依据2022年版课程标准）'
BOOKS = []


def book(subject, term, units, reference):
    identifier = 'pep2024-g1-' + ('math' if subject == '数学' else 'chinese') + ('-a' if term == '上册' else '-b')
    BOOKS.append(dict(id=identifier, subject=subject, stage='小学', grade='一年级', term=term,
        edition=EDITION, title='一年级' + subject + term,
        source_url='https://www.pep.com.cn/xw/zt/hd/12/', directory_reference=reference,
        units=[dict(title=title, topics=topics) for title, topics in units]))


def spec(title, kind, data=None):
    return dict(title=title, kind=kind, data=data)


def q(prompt, answer, explanation, distractors=None, calculation=None):
    item = dict(prompt=prompt, answer_text=str(answer), explanation=explanation)
    if distractors is not None:
        item['choices'] = [str(answer)] + [str(x) for x in distractors if str(x) != str(answer)]
    if calculation is not None:
        item['calculation'] = calculation
    return item


def numeric(prompt, answer, explanation, expression=None):
    return q(prompt, answer, explanation, calculation=expression)


MATH_A = [
 ('数学游戏 · 入学活动', [spec('数一数与一一对应','count',[1,10]),spec('上下前后与左右','position'),spec('按一种标准分类','classification')]),
 ('第一单元 · 5以内数的认识和加、减法', [spec('1～5的认识','count',[1,5]),spec('比大小','compare',[0,5]),spec('第几','ordinal',[5]),spec('分与合','split',[2,5]),spec('5以内加法','add',[5]),spec('5以内减法','subtract',[5]),spec('0的认识和加、减法','zero')]),
 ('第二单元 · 6～10的认识和加、减法', [spec('6～10的认识','count',[6,10]),spec('比大小与第几','ordinal',[10]),spec('6～10的分与合','split',[6,10]),spec('6和7的加、减法','mixed',[6,7]),spec('8和9的加、减法','mixed',[8,9]),spec('10的加、减法','mixed',[10,10]),spec('连加与连减','chain'),spec('加、减混合','chainmixed')]),
 ('第三单元 · 认识立体图形', [spec('认识长方体、正方体、圆柱和球','solid'),spec('立体图形的特征与生活应用','solidfeatures')]),
 ('第四单元 · 11～20的认识', [spec('十与数的组成','compose',[11,20]),spec('11～20的顺序与大小','compare',[11,20]),spec('十几加几与十几减几','teen')]),
 ('第五单元 · 20以内的进位加法', [spec('9加几与凑十','carry',[9]),spec('8、7、6加几','carry',[6,7,8]),spec('5、4、3、2加几','carry',[2,3,4,5])]),
 ('第六单元 · 复习与关联', [spec('数与运算的联系','review20'),spec('简单数量关系','wordtotal',[20]),spec('图形辨认与应用','solidreview')]),
]
MATH_B = [
 ('第一单元 · 认识平面图形', [spec('认识长方形、正方形、三角形和圆','flat'),spec('平面图形的特征与拼组','flatfeatures')]),
 ('第二单元 · 20以内的退位减法', [spec('十几减9','borrow',[9]),spec('十几减8、7、6','borrow',[6,7,8]),spec('十几减5、4、3、2','borrow',[2,3,4,5])]),
 ('第三单元 · 100以内数的认识', [spec('数数与数的组成','compose',[21,99]),spec('数位、读数和写数','place'),spec('数的顺序与比较大小','compare',[21,99]),spec('整十数与简单加、减法','tens'),spec('摆一摆、想一想','beads')]),
 ('第四单元 · 100以内的口算加、减法', [spec('两位数加一位数和整十数','mentaladd'),spec('两位数减一位数和整十数','mentalsub'),spec('口算进位与退位','mentalcarry')]),
 ('第五单元 · 100以内的笔算加、减法', [spec('两位数不进位笔算加法','writtenadd'),spec('两位数不退位笔算减法','writtensub'),spec('数位对齐与计算检查','alignment')]),
 ('第六单元 · 数量间的加减关系', [spec('合起来与求总数','wordtotal',[90]),spec('已知总数求另一部分','wordmissing'),spec('求相差多少','worddifference')]),
 ('综合实践 · 欢乐购物街', [spec('认识元、角、分','moneyunits'),spec('购物、付款与找零','shopping')]),
 ('第七单元 · 复习与关联', [spec('100以内数与运算','review100'),spec('数量关系综合应用','wordreview'),spec('图形的辨认与应用','flatreview')]),
]
book('数学','上册',MATH_A,'https://www.renjiaoshe.com/jiaocai/2412.html')
book('数学','下册',MATH_B,'https://www.renjiaoshe.com/jiaocai/2413.html')

# Character/pronunciation pairs and word meanings, selected at beginner level.
LEXICONS = {
 'nature': [('天','tiān','天空'),('地','dì','大地'),('人','rén','人们'),('山','shān','高山'),('水','shuǐ','河水'),('火','huǒ','火苗'),('土','tǔ','土地'),('日','rì','日子'),('月','yuè','月亮'),('云','yún','白云')],
 'things': [('口','kǒu','口水'),('耳','ěr','耳朵'),('目','mù','目光'),('手','shǒu','小手'),('足','zú','手足'),('鸟','niǎo','小鸟'),('鱼','yú','小鱼'),('木','mù','木头'),('竹','zhú','竹子'),('禾','hé','禾苗')],
 'school': [('书','shū','书本'),('本','běn','本子'),('尺','chǐ','尺子'),('刀','dāo','小刀'),('小','xiǎo','小手'),('大','dà','大山'),('多','duō','多少'),('少','shǎo','少见'),('上','shàng','上山'),('下','xià','下车')],
 'spring': [('春','chūn','春天'),('冬','dōng','冬天'),('风','fēng','大风'),('雪','xuě','下雪'),('花','huā','花朵'),('草','cǎo','小草'),('青','qīng','青草'),('清','qīng','清水'),('晴','qíng','晴天'),('雨','yǔ','雨水')],
 'family': [('爸','bà','爸爸'),('妈','mā','妈妈'),('哥','gē','哥哥'),('弟','dì','弟弟'),('姐','jiě','姐姐'),('妹','mèi','妹妹'),('家','jiā','家人'),('爱','ài','关爱'),('来','lái','回来'),('去','qù','出去')],
 'homeland': [('我','wǒ','我们'),('想','xiǎng','想法'),('看','kàn','看见'),('井','jǐng','水井'),('乡','xiāng','家乡'),('亲','qīn','亲人'),('国','guó','中国'),('党','dǎng','党员'),('民','mín','人民'),('心','xīn','关心')],
 'animals': [('虫','chóng','小虫'),('蚂','mǎ','蚂蚁'),('蚁','yǐ','蚂蚁'),('蝶','dié','蝴蝶'),('猫','māo','小猫'),('狗','gǒu','小狗'),('牛','niú','小牛'),('马','mǎ','小马'),('羊','yáng','山羊'),('鸡','jī','小鸡')],
 'summer': [('池','chí','水池'),('叶','yè','叶子'),('荷','hé','荷花'),('树','shù','大树'),('林','lín','树林'),('莲','lián','莲子'),('河','hé','小河'),('热','rè','炎热'),('凉','liáng','凉水'),('光','guāng','阳光')],
 'habits': [('早','zǎo','早上'),('晚','wǎn','晚上'),('先','xiān','先后'),('后','hòu','后来'),('学','xué','学习'),('习','xí','练习'),('包','bāo','书包'),('洗','xǐ','洗手'),('走','zǒu','走路'),('回','huí','回家')],
}


def literacy(title, key):
    return [spec(title+' · 看拼音认字','character',key),spec(title+' · 组词与词义','word',key)]


CHINESE_A = [
 ('第一单元 · 识字', literacy('自然与生活中的汉字','nature')+[spec('基本笔画与书写习惯','strokes')]),
 ('第二单元 · 汉语拼音', [spec('单韵母 a、o、e、i、u、ü','vowels'),spec('b、p、m、f、d、t、n、l','initials1'),spec('四声与声调辨认','tones')]),
 ('第三单元 · 汉语拼音', [spec('g、k、h、j、q、x','initials2'),spec('z、c、s、zh、ch、sh、r','initials3'),spec('j、q、x与ü的拼写','umlaut')]),
 ('第四单元 · 汉语拼音', [spec('复韵母与特殊韵母','compound'),spec('前鼻韵母与后鼻韵母','nasal'),spec('整体认读音节','whole')]),
 ('第五单元 · 阅读', [spec('借助拼音读词语','readpinyin','things'),spec('从短句中寻找人和事物','who'),spec('从短句中寻找地点','where')]),
 ('第六单元 · 识字', literacy('校园与生活中的汉字','school')+[spec('形近字辨认','similar')]),
 ('第七单元 · 阅读', [spec('提取明显的信息','what'),spec('按先后顺序读懂事情','sequence'),spec('礼貌问答与口语交流','polite')]),
 ('第八单元 · 阅读', [spec('读好长句子与停顿','pause'),spec('联系生活理解词语','context'),spec('句号、问号与感叹号','punctuation')]),
]
CHINESE_B = [
 ('第一单元 · 识字', literacy('季节与天气中的汉字','spring')+[spec('同音形近字与偏旁','radicals')]),
 ('第二单元 · 阅读', literacy('家乡与祖国词语','homeland')+[spec('读懂短句与明显信息','who2')]),
 ('第三单元 · 阅读', [spec('读懂伙伴之间的事情','what2'),spec('联系上下文理解词语','context2'),spec('交流与表达感受','feelings')]),
 ('第四单元 · 阅读', [spec('读好长句子','pause2'),spec('根据句子提取地点','where2'),spec('读懂事情的先后','sequence2')]),
 ('第五单元 · 识字', literacy('动物与生活词语','animals')+[spec('偏旁与汉字意思','radicals2')]),
 ('第六单元 · 阅读', literacy('夏天与自然词语','summer')+[spec('联系生活理解词义','context3')]),
 ('第七单元 · 阅读', literacy('学习与生活习惯词语','habits')+[spec('从短句中提取行动','what3'),spec('音序查字典的步骤','dictionary')]),
 ('第八单元 · 阅读', [spec('借助线索自主阅读','where3'),spec('读懂简单故事的顺序','sequence3'),spec('理解故事与表达想法','feelings2')]),
]
book('语文','上册',CHINESE_A,'https://keben.szxuexiao.com/rjb1njyuwens2024.html')
book('语文','下册',CHINESE_B,'https://keben.szxuexiao.com/rjb1njyuwenx2024.html')

def math_questions(kind, data, rng):
    result = []
    objects = ['积木','小球','铅笔','苹果','贝壳','书本','纸船','花朵','卡片','石子']
    if kind == 'count':
        lo, hi = data
        for i in range(10):
            n = lo + i % (hi-lo+1)
            marks = ' '.join(['●']*n)
            result.append(numeric('一颗圆点代表一个%s。%s\n一共有几个%s？'%(objects[i],marks,objects[i]),n,'每个圆点数一次，最后数到%d，所以共有%d个。'%(n,n)))
    elif kind in ('compare','ordinal'):
        if kind == 'compare':
            lo,hi=data; pairs=[(a,b) for a in range(lo,hi+1) for b in range(lo,hi+1) if a!=b];rng.shuffle(pairs)
            for a,b in pairs[:10]:
                result.append(q('在%d和%d之间填哪个符号？'%(a,b),'>' if a>b else '<','%d比%d%s，所以填%s。'%(a,b,'大' if a>b else '小','>' if a>b else '<'),['<','>','=']))
        else:
            n=data[0]
            for i in range(10):
                k=i%n+1;direction='左' if i<5 else '右';other='右' if direction=='左' else '左'
                result.append(numeric('一排有%d位小朋友。团团从%s数排第%d，从%s数排第几？'%(n,direction,k,other),n-k+1,'从两边数，团团所在的位置都算一次：%d－%d＋1＝%d。'%(n,k,n-k+1),['+', ['-',n,k],1]))
    elif kind in ('add','subtract','mixed','split','zero','teen','carry','borrow','writtenadd','writtensub','mentaladd','mentalsub','mentalcarry','review20','review100','tens'):
        pairs=[]
        if kind in ('add','subtract'):
            pairs=[(a,'+' if kind=='add' else '-',b) for a in range(data[0]+1) for b in range(data[0]+1) if (a+b<=data[0] if kind=='add' else b<=a)]
        elif kind in ('mixed','split'):
            lo,hi=data
            pairs=[(a,'+',n-a) for n in range(lo,hi+1) for a in range(n+1)]
            if kind=='mixed': pairs += [(n,'-',a) for n in range(lo,hi+1) for a in range(n+1)]
        elif kind=='zero': pairs=[(n,op,0) for n in range(6) for op in ['+','-']]+[(0,'+',n) for n in range(1,6)]
        elif kind=='teen': pairs=[(n,op,b) for n in range(11,20) for op in ['+','-'] for b in range(1,10) if (n+b<=20 if op=='+' else b<=n%10)]
        elif kind in ('carry','borrow'):
            pairs=[(a,'+',b) for a in data for b in range(2,10) if a+b>10] if kind=='carry' else [(a,'-',b) for a in range(11,19) for b in data if b>a%10]
        elif kind in ('writtenadd','writtensub'):
            pairs=[(a,'+' if kind=='writtenadd' else '-',b) for a in range(21,70) for b in range(11,40) if (a+b<100 and a%10+b%10<10 if kind=='writtenadd' else a>=b and a%10>=b%10)]
        elif kind in ('mentaladd','mentalsub','mentalcarry'):
            pairs=[(a,op,b) for a in range(21,80) for b in list(range(1,10))+[10,20] for op in (['+','-'] if kind=='mentalcarry' else ['+'] if kind=='mentaladd' else ['-']) if 0<= (a+b if op=='+' else a-b)<=99 and (b<10 and (a%10+b>=10 if op=='+' else a%10<b) if kind=='mentalcarry' else True)]
        elif kind=='tens': pairs=[(a,op,b) for a in range(10,91,10) for b in range(10,91,10) for op in ['+','-'] if 0<=(a+b if op=='+' else a-b)<=100]
        else:
            limit=20 if kind=='review20' else 100
            pairs=[(a,op,b) for a in range(1,limit) for b in range(1,min(10,limit)) for op in ['+','-'] if 0<=(a+b if op=='+' else a-b)<=limit and not (kind=='review20' and op=='-' and a>10 and a%10<b)]
        rng.shuffle(pairs)
        # Nine-plus and ten-minus-nine have eight distinct sums; add two contextual applications.
        for i in range(10):
            a,op,b=pairs[i%len(pairs)];answer=a+b if op=='+' else a-b
            expression=[op,a,b]
            if kind=='split':
                prompt='%d可以分成%d和几？'%(a+b,a);answer=b;expression=['-',a+b,a]
                explanation='%d＋%d＝%d，所以另一部分是%d。'%(a,b,a+b,b)
            else:
                prompt='%d %s %d ＝多少？'%(a,'＋' if op=='+' else '－',b)
                if i>=len(pairs): prompt='团团有%d个%s，%s%d个，现在有多少个？'%(a,objects[i],'又得到' if op=='+' else '送出',b)
                explanation='%d%s%d＝%d。'%(a,'＋' if op=='+' else '－',b,answer)
                if kind=='carry': explanation+='先把%d凑成10，把%d分成%d和%d，再算10＋%d＝%d。'%(a,b,10-a,b-(10-a),b-(10-a),answer)
                elif kind=='borrow': explanation+='用破十法：先算10－%d＝%d，再加上%d，得到%d。'%(b,10-b,a-10,answer)
                elif kind in ('writtenadd','writtensub'): explanation+='相同数位对齐，先算个位，再算十位；这一题不用进位或退位。'
                elif op=='+': explanation+='加法表示把两部分合起来。'
                else: explanation+='减法表示从原来的数里去掉一部分。'
            result.append(numeric(prompt,answer,explanation,expression))
    elif kind in ('compose','place','beads'):
        lo,hi=data if data else (21,99);values=list(range(lo,hi+1));rng.shuffle(values)
        for i in range(10):
            n=values[i%len(values)];t,u=divmod(n,10)
            if kind=='beads': result.append(numeric('十位放%d颗珠，个位放%d颗珠，这个数是多少？'%(t,u),n,'十位的%d表示%d，个位的%d表示%d，合起来是%d。'%(t,t*10,u,u,n),['+',t*10,u]))
            elif i%2==0: result.append(numeric('%d个十和%d个一组成的数是多少？'%(t,u),n,'%d个十是%d，加上%d个一，就是%d。'%(t,t*10,u,n),['+',t*10,u]))
            else: result.append(numeric('%d的%s位上是几？'%(n,'十' if kind=='place' else '个'),t if kind=='place' else u,'从右起第一位是个位，第二位是十位；%d的十位是%d，个位是%d。'%(n,t,u)))
    elif kind in ('chain','chainmixed'):
        pool=[(a,b,c) for a in range(1,6) for b in range(1,5) for c in range(1,4) if a+b+c<=10];rng.shuffle(pool)
        for i,(a,b,c) in enumerate(pool[:10]):
            op='-' if kind=='chainmixed' or i%2 else '+';first=a+b+c if op=='-' and kind=='chain' else a
            middle='-' if kind=='chain' and op=='-' else '+'
            answer=(first-b if middle=='-' else first+b)-c if op=='-' else first+b+c
            expression=[op,[middle,first,b],c]
            interim=first-b if middle=='-' else first+b
            result.append(numeric('%d %s %d %s %d ＝多少？'%(first,'－' if middle=='-' else '＋',b,'－' if op=='-' else '＋',c),answer,'从左往右算：先算%d%s%d＝%d，再算%d%s%d＝%d。'%(first,middle,b,interim,interim,op,c,answer),expression))
    elif kind in ('wordtotal','wordmissing','worddifference','wordreview','shopping'):
        for i in range(10):
            a=3+i;b=2+i%5
            if kind=='wordtotal' and data==[90]: a=20+i;b=10+i%5
            if kind=='worddifference': prompt='团团有%d张卡片，小安有%d张。团团比小安多几张？'%(a+b,b);answer=a;expr=['-',a+b,b];ex='求多多少，用较大的数减较小的数：%d－%d＝%d。'%(a+b,b,a)
            elif kind in ('wordmissing','wordreview'): prompt='盒里原有%d个%s，拿走%d个，还剩几个？'%(a+b,objects[i],b);answer=a;expr=['-',a+b,b];ex='原来的总数减去拿走的部分，就是剩下的部分：%d－%d＝%d。'%(a+b,b,a)
            elif kind=='shopping': prompt='一件文具%d元，付了%d元，应找回多少元？'%(b,a+b);answer=a;expr=['-',a+b,b];ex='付的钱减去价格就是找零：%d－%d＝%d（元）。'%(a+b,b,a)
            else: prompt='盒里有%d个%s，又放入%d个，一共有几个？'%(a,objects[i],b);answer=a+b;expr=['+',a,b];ex='把原有的和新放入的合起来：%d＋%d＝%d。'%(a,b,a+b)
            result.append(numeric(prompt,answer,ex,expr))
    elif kind=='moneyunits':
        for i in range(1,6):
            result.append(numeric('%d元等于多少角？'%i,i*10,'1元＝10角，%d元就是%d个10角，等于%d角。'%(i,i,i*10),['+',i*10,0]))
            result.append(numeric('%d角等于多少分？'%i,i*10,'1角＝10分，%d角等于%d分。'%(i,i*10),['+',i*10,0]))
    elif kind=='alignment':
        for i in range(10):
            a=21+i;b=12+i%3
            result.append(q('竖式计算%d＋%d时，数字%d应该与哪个数位对齐？'%(a,b,b%10),'个位','相同数位要对齐：个位对个位，十位对十位。数字%d在个位上。'%(b%10),['十位','个位','百位']))
    else:
        facts=MATH_FACTS[kind]
        for prompt,answer,wrong,reason in facts: result.append(q(prompt,answer,reason,wrong))
    assert len(result)>=10, kind
    return result[:10]

MATH_FACTS = {
 'position': [
 ('书放在桌面上，书在桌子的哪一边？','上面',['下面','后面'],'书在桌面上，所以在桌子上面。'),
 ('小猫躲在桌子底下，小猫在桌子的哪一边？','下面',['上面','前面'],'桌子底下就是桌子的下面。'),
 ('排队时团团面对前方，小安排在团团前一位。小安在团团的哪一边？','前面',['后面','上面'],'向前看，前一位的小朋友在前面。'),
 ('排队时团团面对前方，小安排在团团后一位。小安在团团的哪一边？','后面',['前面','下面'],'后一位的小朋友在后面。'),
 ('面对纸上的一排字：日 月 星。月在日的哪一边？','右边',['左边','下面'],'纸面从左到右是日、月、星，月在日的右边。'),
 ('面对纸上的一排字：山 水 云。山在水的哪一边？','左边',['右边','上面'],'山在水的左边。'),
 ('面对纸上的一排字：甲 乙 丙。丙在乙的哪一边？','右边',['左边','下面'],'从左到右看，丙在乙的右边。'),
 ('面对纸上的一排字：红 黄 蓝。红在黄的哪一边？','左边',['右边','后面'],'红在黄的左边。'),
 ('柜子分上下两层，球放在下层。球在上层书本的哪一边？','下面',['上面','前面'],'下层低于上层，球在书本下面。'),
 ('书架分上下两层，杯子放在上层。杯子在下层盒子的哪一边？','上面',['下面','后面'],'上层高于下层，杯子在盒子上面。')],
 'classification': [(f'把{a}、{b}、{c}按“是不是{category}”分类，哪一个应放进{category}这一组？',a,[b,c],f'{a}是{category}，{b}和{c}不属于这一组。') for category,a,b,c in [
 ('水果','苹果','铅笔','皮球'),('文具','尺子','香蕉','小狗'),('动物','小猫','书本','杯子'),('交通工具','汽车','小草','书包'),('水果','梨','积木','椅子'),('文具','橡皮','橘子','小鸟'),('动物','小兔','石子','纸船'),('交通工具','火车','桃子','尺子'),('水果','葡萄','帽子','小鱼'),('文具','铅笔','西瓜','足球')]],
}

SOLIDS=[('足球','球'),('玻璃弹珠','球'),('六个面一样大的骰子','正方体'),('正方体积木','正方体'),('长方形纸盒','长方体'),('砖块','长方体'),('罐身笔直、上下底一样大的饮料罐','圆柱'),('直直的圆形水桶的桶身','圆柱'),('篮球','球'),('魔方的整体外形','正方体')]
SOLID_FEATURES=[('哪个图形没有平面，容易向各个方向滚动？','球'),('哪个图形有两个一样大的圆形底面？','圆柱'),('哪个图形的六个面都是一样大的正方形？','正方体'),('长纸盒的整体外形通常接近什么？','长方体'),('用手摸足球，表面是弯曲的，它接近什么？','球'),('哪种立体图形的上、下底都是圆形？','圆柱'),('骰子的整体外形接近什么？','正方体'),('砖块的整体外形接近什么？','长方体'),('把四种图形都放在斜坡上，哪一种最容易自由滚动？','球'),('形状笔直的饮料罐的罐身接近什么？','圆柱')]
FLATS=[('有3条直边和3个角','三角形'),('没有直边，是圆圆的一圈','圆'),('4条边一样长，4个角都是直角','正方形'),('两组对边分别一样长，4个角都是直角，邻边长短不同','长方形'),('用笔沿正方体的一个面描一圈','正方形'),('用笔沿圆柱的圆形底面描一圈','圆'),('有三条边的红领巾展开后的形状','三角形'),('长边和短边不同的课本封面','长方形'),('一张4个角都是直角、4条边一样长的纸片','正方形'),('一张只有3个角的纸片','三角形')]
for kind in ['solid','solidreview']:
    MATH_FACTS[kind]=[(f'{item}的整体形状接近哪种立体图形？',a,[x for x in ['球','圆柱','正方体','长方体'] if x!=a],f'{item}的整体形状接近{a}。') for item,a in SOLIDS]
MATH_FACTS['solidfeatures']=[(p,a,[x for x in ['球','圆柱','正方体','长方体'] if x!=a],f'根据题干描述的表面或底面特征，应选择{a}。') for p,a in SOLID_FEATURES]
for kind in ['flat','flatfeatures','flatreview']:
    MATH_FACTS[kind]=[(f'哪种平面图形符合“{p}”？',a,[x for x in ['圆','三角形','正方形','长方形'] if x!=a],f'{p}对应{a}。平面图形是平平的形状，与立体图形不同。') for p,a in FLATS]
MATH_FACTS['flatfeatures']=[
 ('三角形有几个角？','3',['2','4'],'三角形有3条边和3个角。'),
 ('圆有几个角？','0',['1','4'],'圆的边是弯曲的，没有角。'),
 ('正方形有几条边？','4',['3','5'],'正方形有4条边，4条边一样长。'),
 ('长方形有几个角？','4',['2','3'],'长方形有4个角，都是直角。'),
 ('两个一样大的正方形沿一整条边拼在一起，外轮廓是什么？','长方形',['圆','三角形'],'两个正方形完整边靠边拼接，外轮廓是长方形。'),
 ('把一个正方形沿连接两个对角的线剪开，每一块是什么图形？','三角形',['圆','正方形'],'对角线把正方形分成两个三角形。'),
 ('把长为4格、宽为2格的长方形沿长边中点剪开，得到两个什么图形？','正方形',['圆','三角形'],'沿中间剪开后，每块长和宽都是2格，是正方形。'),
 ('哪种图形的边是弯曲的，没有直边？','圆',['三角形','长方形'],'圆没有直边，边是弯曲的。'),
 ('用3根同样长的小棒首尾相接围成封闭图形，可以围成什么？','三角形',['正方形','长方形'],'3根小棒围出的封闭图形有3条边，是三角形。'),
 ('用4根同样长的小棒围图形，并让4个角都是直角，围成什么？','正方形',['三角形','圆'],'4条边一样长、4个角都是直角的图形是正方形。'),
]

# All passages below are original miniature reading situations.
READING=[('团团','公园','捡树叶'),('小安','教室','读书'),('小禾','院子','浇花'),('爷爷','菜园','种菜'),('奶奶','厨房','洗水果'),('妈妈','客厅','整理书本'),('爸爸','阳台','晾衣服'),('小云','图书馆','借书'),('小明','操场','跑步'),('小青','河边','观察小鱼')]
CONTEXT=[('小猫轻轻地走，脚步声很小。','轻轻','动作轻，声音小',['使劲喊叫','跑得很快']),('河水很清，能看见水底的小石子。','清','水干净、透亮',['水很脏','水已经结冰']),('门开着，小安走了进去。','进去','从外面走到里面',['从里面走到外面','在门外不动']),('小禾把散乱的书摆整齐了。','整齐','摆放有顺序',['到处乱放','把书撕开']),('太阳出来了，屋子变得明亮。','明亮','光线充足',['一片漆黑','很冷']),('小鸟飞得很高，超过了树顶。','高','离地面远',['紧贴地面','颜色很红']),('弟弟闭上眼，安静地睡着了。','安静','没有吵闹声',['大声唱歌','用力敲门']),('奶奶走得慢，我们耐心等她。','等','停下来等待',['立刻跑远','把门关上']),('小河弯弯地向远处流去。','弯弯','不是直直的',['完全笔直','停止流动']),('雨停了，地面还有些湿。','湿','带着水分',['没有一点水','非常烫'])]
POLITE=[('向老师问好','老师好！',['快走开！','我不认识你。']),('请同学借你一支笔','请借我一支笔，好吗？',['必须给我！','把笔扔过来！']),('得到同学帮助','谢谢你！',['都是你不好！','别再帮我！']),('不小心碰倒同学的书','对不起，我帮你捡起来。',['我不管。','你自己捡！']),('离开朋友家','再见！',['起床！','向左转！']),('想加入同学的游戏','我可以和你们一起玩吗？',['全都听我的！','都不许玩！']),('没有听清老师的话','请您再说一遍，好吗？',['别说了！','太烦了！']),('想从别人身边经过','请让一让，谢谢。',['快滚开！','我就挤过去！']),('朋友向你道谢','不用谢。',['不给你！','我不听！']),('在家向长辈问早','早上好！',['别理我！','快让开！'])]
SIMILAR=[('木','本','木头','书本'),('日','目','日子','目光'),('人','入','人们','入口'),('大','天','大山','天空'),('土','士','土地','战士'),('禾','木','禾苗','木头'),('上','下','上山','下车'),('口','日','人口','日光'),('小','少','小手','多少'),('山','出','山水','出门')]
RADICALS=[('江','河','氵','水'),('树','林','木','树木'),('蚂','蚁','虫','昆虫'),('晴','明','日','太阳或光亮'),('情','忙','忄','心情或心理活动'),('打','拍','扌','手的动作'),('吃','叫','口','嘴'),('跑','跳','足','脚的动作'),('你','他','亻','人'),('花','草','艹','植物')]


def chinese_questions(kind, data, rng):
    result=[]
    if kind in ('character','word','readpinyin'):
        entries=LEXICONS[data]
        for i,(char,pinyin,word) in enumerate(entries):
            wrong=list(dict.fromkeys(x[0] if kind!='word' else x[2] for x in entries[i+1:]+entries[:i] if (x[0]!=char if kind!='word' else char not in x[2])))[:2]
            if kind=='word': result.append(q('哪个词语中有“%s”字？'%char,word,'“%s”可以组成“%s”，先辨认字形，再检查两个字是否能组成词。'%(char,word),wrong))
            else: result.append(q('读拼音“%s”，选择“%s”中应填的字。'%(pinyin,word.replace(char,'（ ）',1)),char,'“%s”的读音是%s，在“%s”中也读这个音。'%(char,pinyin,word),wrong))
    elif kind in ('who','where','what','who2','where2','where3','what2','what3'):
        for i,(person,place,action) in enumerate(READING):
            story='%s在%s%s。'%(person,place,action)
            if kind.startswith('who'): question='谁在'+place+action+'？';answer=person;wrong=[READING[(i+1)%10][0],READING[(i+2)%10][0]];reason='句子开头写的是%s，他（她）是这件事的行动者。'%person
            elif kind.startswith('where'):question=person+'在哪里'+action+'？';answer=place;wrong=[READING[(i+1)%10][1],READING[(i+2)%10][1]];reason='“在%s”直接告诉我们地点是%s。'%(place,place)
            else:question=person+'在做什么？';answer=action;wrong=[READING[(i+1)%10][2],READING[(i+2)%10][2]];reason='句子中的“%s”告诉我们%s正在做的事情。'%(action,person)
            result.append(q('读一读：'+story+'\n'+question,answer,reason,wrong))
    elif kind.startswith('sequence'):
        plans=[('洗手','吃饭','收碗'),('拿出书','读书','收好书'),('穿鞋','出门','到学校'),('拿出种子','播种','浇水'),('洗苹果','切苹果','吃苹果'),('打开画本','画画','收起画本'),('摆好积木','搭房子','收积木'),('拿出纸','折纸船','把纸船放好'),('整理书包','背书包','出门'),('排队','上车','找座位')]
        for a,b,c in plans:result.append(q('团团先%s，再%s，最后%s。\n团团做完第一件事后，接着做什么？'%(a,b,c),b,'“先—再—最后”表示顺序；“再”后面的%s是第二件事。'%b,[a,c]))
    elif kind.startswith('context'):
        for story,word,meaning,wrong in CONTEXT: result.append(q('读一读：'+story+'\n这里的“'+word+'”是什么意思？',meaning,'联系句子前后的内容，“%s”在这里表示%s。'%(word,meaning),wrong))
    elif kind=='polite':
        for situation,answer,wrong in POLITE:result.append(q('当你要%s时，怎样说更有礼貌？'%situation,answer,'礼貌交流要尊重对方，使用合适的问候、请求、感谢或道歉的话。',wrong))
    elif kind.startswith('feelings'):
        situations=[('朋友帮助我找到了丢失的笔。','我想谢谢他。',['我想责怪他。','我想嘲笑他。']),('看见小伙伴摔倒了。','我想扶他起来。',['我想笑他。','我想推他。']),('小猫没有水喝。','我想请大人给它添水。',['我想拿走水碗。','我想吓它。']),('我把借来的书弄脏了。','我想道歉并想办法补救。',['我想偷偷藏起来。','我想说不是我弄的。']),('我终于学会写一个字。','我很高兴，还想继续练习。',['我再也不练了。','我想撕掉本子。']),('我看到花开得很美。','我想欣赏它，不随便摘。',['我想把它踩坏。','我想把花全摘走。']),('大家一起把教室收拾干净了。','我觉得合作真好。',['我想弄乱教室。','我想吵架。']),('听见同学朗读有进步。','我想鼓励他。',['我想笑话他。','我想打断他。']),('游戏输了，我有点难过。','我想调整心情，下次再试。',['我想打别人。','我想把玩具砸了。']),('老师耐心地教我。','我很感谢老师。',['我想不停打断。','我想大声吵闹。'])]
        for story,answer,wrong in situations: result.append(q(story+'\n哪一种想法更合适？',answer,'根据情境表达感受，也要想到如何关心他人、爱护物品或继续努力。',wrong))
    elif kind.startswith('pause'):
        for person,place,action in READING:
            sentence='%s和朋友一起在%s%s'%(person,place,action)
            good='%s和朋友一起／在%s／%s'%(person,place,action)
            result.append(q('读长句“'+sentence+'”。哪种停顿更自然？',good,'把人物、地点和动作分别读成完整的意思，不把一个词拆开。',[person[0]+'／'+sentence[1:],sentence[:-1]+'／'+sentence[-1]]))
    elif kind=='punctuation':
        lines=[('你叫什么名字','？'),('太阳出来了','。'),('这朵花真漂亮啊','！'),('你在哪里读书','？'),('小鸟飞走了','。'),('我们成功啦','！'),('这是谁的书','？'),('妈妈回家了','。'),('今天真开心呀','！'),('你想看哪本书','？')]
        for line,answer in lines:result.append(q('给“'+line+'”的句末选一个合适的标点。',answer,'一般陈述用句号，提问用问号，表达强烈感情的感叹用感叹号。',['。','？','！']))
    elif kind=='similar':
        for a,b,wa,wb in SIMILAR:result.append(q('“%s”和“%s”很相像。“%s”的第一个字是哪个？'%(a,b,wa),a,'“%s”写作“%s”，要仔细比较两个字的笔画。'%(wa,wa),[b,'田' if a!='田' else '由']))
    elif kind.startswith('radicals'):
        for a,b,rad,meaning in RADICALS:result.append(q('“%s”和“%s”都带有“%s”，它们的意思常与什么有关？'%(a,b,rad),meaning,'形声字的形旁常提示意思；“%s”在这些字中提示与%s有关。'%(rad,meaning),['天气' if meaning!='天气' else '食物','数量']))
    elif kind=='dictionary':
        words=[('爸','bà','B'),('妈','mā','M'),('天','tiān','T'),('水','shuǐ','S'),('花','huā','H'),('风','fēng','F'),('云','yún','Y'),('日','rì','R'),('家','jiā','J'),('口','kǒu','K')]
        for char,pinyin,letter in words:result.append(q('用音序查字法查“%s”（%s），先在音序表中找哪个大写字母？'%(char,pinyin),letter,'音序是音节首字母的大写形式。%s以%s开头，应先找%s，再找音节和正文页码。'%(pinyin,pinyin[0],letter),[x for x in ['A','B','C','D'] if x!=letter][:2]))
    elif kind=='strokes':
        facts=[('“一”的笔画是什么？','横',['竖','撇'],'“一”是从左向右写的一横。'),('“十”一般先写哪一笔？','横',['竖','点'],'“十”先横后竖。'),('“二”有几笔？','2',['1','3'],'“二”由两横组成，共2笔。'),('“三”有几笔？','3',['2','4'],'“三”由三横组成，共3笔。'),('写字时眼睛和书本要怎样？','保持合适距离',['紧贴书本','歪着头贴近'],'保持距离、坐姿端正，保护眼睛。'),('“人”一般先写哪一笔？','撇',['捺','横'],'“人”先撇后捺。'),('“口”有几笔？','3',['2','4'],'竖、横折、横，共3笔。'),('“上”有几笔？','3',['2','5'],'竖、横、横，共3笔。'),('握笔写字时身体应该怎样？','坐端正',['趴在桌上','歪着身子'],'坐端正，肩膀放松，便于书写。'),('“日”有几笔？','4',['3','5'],'竖、横折、横、横，共4笔。')]
        for prompt,answer,wrong,reason in facts:result.append(q(prompt,answer,reason,wrong))
    else:
        groups={
            'vowels':['a','o','e','i','u','ü'], 'initials1':['b','p','m','f','d','t','n','l'],
            'initials2':['g','k','h','j','q','x'], 'initials3':['z','c','s','zh','ch','sh','r'],
            'compound':['ai','ei','ui','ao','ou','iu','ie','üe','er'],
            'nasal':['an','en','in','un','ün','ang','eng','ing','ong'],
            'whole':['zhi','chi','shi','ri','zi','ci','si','yi','wu','yu','ye','yue','yuan','yin','yun','ying'],
        }
        if kind=='tones':
            tones=[('ā','第一声'),('á','第二声'),('ǎ','第三声'),('à','第四声'),('ō','第一声'),('ó','第二声'),('ǒ','第三声'),('ò','第四声'),('ǐ','第三声'),('ù','第四声')]
            for syllable,answer in tones:result.append(q('“%s”的声调是第几声？'%syllable,answer,'一声平、二声扬、三声拐弯、四声降。“%s”标的是%s。'%(syllable,answer),[x for x in ['第一声','第二声','第三声','第四声'] if x!=answer][:2]))
        elif kind=='umlaut':
            for base in ['j','q','x','y']:
                for tone in (['不带声调','第二声','第四声'] if base!='y' else ['不带声调']):
                    answer=base+('u' if tone=='不带声调' else 'ú' if tone=='第二声' else 'ù')
                    result.append(q('%s和ü组成音节（%s），规范写法是哪一个？'%(base,tone),answer,'ü与j、q、x相拼时省去两点；单独成音节时加y，也写作yu，声调标在u上。',[base+'ü',base+'o']))
        else:
            group=groups[kind];label='单韵母' if kind=='vowels' else '声母' if kind.startswith('initials') else '复韵母或特殊韵母' if kind=='compound' else '鼻韵母' if kind=='nasal' else '整体认读音节'
            for i in range(10):
                answer=group[i%len(group)];wrong=['a','o'] if kind.startswith('initials') or kind=='whole' else ['b','p']
                prompt='在“'+answer+'、'+wrong[0]+'、'+wrong[1]+'”中，哪一个是'+label+'？'
                explanation='“%s”属于%s。'% (answer,label)
                if kind.startswith('initials'):
                    examples={'initials1':[('bā','b'),('pā','p'),('mā','m'),('fā','f'),('dà','d'),('tā','t'),('nǐ','n'),('lǐ','l'),('bó','b'),('pái','p')],
                        'initials2':[('gā','g'),('kē','k'),('hē','h'),('jī','j'),('qī','q'),('xī','x'),('gū','g'),('hú','h'),('qù','q'),('jú','j')],
                        'initials3':[('zǐ','z'),('cì','c'),('sī','s'),('zhī','zh'),('chī','ch'),('shī','sh'),('rì','r'),('zá','z'),('cā','c'),('sǎ','s')]}
                    syllable,answer=examples[kind][i];prompt='音节“'+syllable+'”的声母是哪一个？'
                    wrong=[x for x in group if x!=answer][:2];explanation='音节“'+syllable+'”开头的声母是'+answer+'。'
                elif kind=='vowels' and i>=6:
                    offset=i-6;answer='、'.join(group[offset:offset+2]);wrong=['b、p','d、t']
                    prompt='“'+answer+'”“b、p”“d、t”中，哪一组全是单韵母？';explanation=answer+'中的两个字母都是单韵母；b、p、d、t是声母。'
                elif kind=='compound' and i==9:
                    answer='ai';wrong=['a','i'];prompt='音节“bái”的韵母是哪一个？';explanation='bái的声母是b，韵母是ai；ai是一个复韵母。'
                elif kind=='nasal' and i==9:
                    answer='ang';wrong=['an','a'];prompt='“ang、an、a”中，哪一个是后鼻韵母？';explanation='ang以ng结尾，是后鼻韵母；an是前鼻韵母。'
                if kind=='nasal': explanation+='以n结尾的是前鼻韵母，以ng结尾的是后鼻韵母。'
                elif kind=='whole': explanation+='整体认读音节要作为整体认读，不用按声母、韵母拆开拼读。'
                result.append(q(prompt,answer,explanation,wrong))
    assert len(result)==10, (kind,len(result))
    return result


def evaluate(expression):
    if isinstance(expression,int): return expression
    op,a,b=expression; a,b=evaluate(a),evaluate(b)
    return a+b if op=='+' else a-b


def build():
    for b in BOOKS:
        for ui,u in enumerate(b['units']):
            u['id']=b['id']+'.u%02d'%ui;u['position']=ui
            for ti,t in enumerate(u['topics']):
                t['id']=u['id']+'.t%02d'%ti;t['position']=ti
                rng=random.Random(t['id'])
                generated=math_questions(t['kind'],t['data'],rng) if b['subject']=='数学' else chinese_questions(t['kind'],t['data'],rng)
                for qi,item in enumerate(generated):
                    item.update(source_record_id=t['id']+'.q%02d'%qi,difficulty='easy' if qi<6 else 'medium',hint='先读清题目，再回想“'+t['title']+'”的学习方法。')
                    choices=item.pop('choices',None)
                    if choices:
                        choices=list(dict.fromkeys(choices));rng.shuffle(choices)
                        item['question_type']='single_choice';item['options']=[dict(key=str(i+1),text=c) for i,c in enumerate(choices)]
                        item['answer']=str(choices.index(item['answer_text'])+1)
                    else:item.update(question_type='short_answer',options=[],answer=item['answer_text'])
                t['questions']=generated
    payload=dict(schema_version=1,edition=EDITION,authorship='原创同步练习；目录与知识点映射参照修订版教材，不是出版社配套原题',books=BOOKS)
    validate(payload)
    target=ROOT/'content/questions/pep2024-grade1.json'
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(books=len(BOOKS),units=sum(len(b['units']) for b in BOOKS),topics=sum(len(u['topics']) for b in BOOKS for u in b['units']),questions=sum(len(t['questions']) for b in BOOKS for u in b['units'] for t in u['topics'])),ensure_ascii=False))
    return payload


def validate(payload):
    source_ids=set()
    for b in payload['books']:
        for u in b['units']:
            for t in u['topics']:
                assert len(t['questions'])>=10,t['id']
                assert len({x['prompt'] for x in t['questions']})==len(t['questions']),t['id']
                for item in t['questions']:
                    assert item['source_record_id'] not in source_ids
                    source_ids.add(item['source_record_id'])
                    assert item['explanation'] and item['hint'] and item['answer']
                    if item.get('calculation') is not None:
                        expression=item['calculation']
                        assert str(evaluate(expression))==item['answer_text'],item
                        if b['subject']=='数学' and b['term']=='上册' and t['kind'] in ('review20','teen') and expression[0]=='-' and expression[1]>10:
                            assert expression[1]%10>=expression[2],'Upper term must not introduce borrowing'
                        if t['kind']=='writtenadd':assert expression[1]%10+expression[2]%10<10
                        if t['kind']=='writtensub':assert expression[1]%10>=expression[2]%10
                    if item['question_type']=='single_choice':
                        assert len(item['options'])>=3,item
                        answers=[o for o in item['options'] if o['key']==item['answer']]
                        assert len(answers)==1 and answers[0]['text']==item['answer_text'],item
                        assert len({o['text'] for o in item['options']})==len(item['options']),item

if __name__=='__main__':build()
