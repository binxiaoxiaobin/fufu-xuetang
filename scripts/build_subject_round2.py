"""Original, grade-scoped practice additions. No textbook-link mutations."""
import hashlib
import json
import random
from collections import Counter
from fractions import Fraction
from pathlib import Path
from build_primary_subject_expansion import choose, GRADES

ROOT = Path(__file__).resolve().parents[1]
DATASET = 'subject-round2-20261008'
OUTPUT = ROOT / 'content/questions/original/subject-round2-20261008.json'
REFERENCE = 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html'


def row(subject, grade, identity, topic, prompt, correct, wrong, explanation, kind='application', check=None):
    sid = '{}-{}-g{}-{}'.format(DATASET, {'语文':'cn','数学':'math','英语':'en','科学':'sci'}[subject], grade, identity)
    options, answer = choose(str(correct), [str(x) for x in wrong], sid, size=3)
    metadata = {'dataset': DATASET, 'exercise_kind': kind, 'review_status':'automated_checks_completed',
                'reference_role':'课程范围参考；题干、选项和解析原创，不是教材原题'}
    if check:
        metadata['numeric_check'] = check
    return dict(source_record_id=sid, subject=subject, stage='小学', grade=GRADES[grade-1],
                title=topic+' · 应用练习', knowledge_point=topic, question_type='single_choice',
                difficulty='easy' if grade<=2 else 'medium', prompt=prompt, options=options, answer=answer,
                explanation=explanation, hint='读清条件；阅读和探究题先从材料中寻找依据。',
                source_name='福福学堂原创·分年级学科补充（二）', source_license='福福学堂原创',
                source_url=REFERENCE, source_attribution='参考义务教育课程标准范围编写的原创分类练习；未声称教师审核。',
                source_metadata=metadata)


# person | place | purpose | difficulty | solution | result
STORIES = {
1: [
('小雨','教室','把画贴好','胶水用完了','向老师借胶水','画贴在了展示板上'),
('小禾','花园','给小花浇水','水壶里没有水','先去接水','小花的泥土湿润了'),
('小宁','家里','整理书包','书本放得很乱','把书本一本本放整齐','书包变得整齐了'),
('小安','操场','把球还给同学','不知道球是谁的','询问身边的同学','找到了球的主人'),
('小月','阅览室','读一本故事书','找不到想读的书','请管理员帮忙','找到了故事书'),
('小川','家里','把湿鞋晾干','外面正在下雨','把鞋放在通风的屋内','鞋慢慢干了')],
2: [
('小洁','校门口','把落下的围巾还给失主','围巾上没有名字','把围巾交到失物招领处','失主领回了围巾'),
('小冬','手工教室','做一只纸船','纸船总是歪斜','对齐纸边后重新折叠','纸船折得整齐了'),
('小乐','社区花坛','保护刚种的小苗','小路上的行人看不清小苗','在花坛边放上提示牌','人们绕开了小苗'),
('小青','家里','把故事讲清楚','事情的顺序说乱了','先想好开头再按顺序讲述','妹妹听懂了故事'),
('小远','学校走廊','让借书的同学有序等候','大家挤在了门口','请大家排成一队','门口不再拥挤'),
('小满','公园','记住观察到的树叶','几种叶子的形状很相似','画下叶子并写上特点','再次观察时能区分叶子了')],
3: [
('林可','校园菜园','找出哪块地需要补水','只看表面看不出土壤湿度','在老师指导下比较不同地块的土壤','找到了较干的地块'),
('陈晓','社区活动室','让低年级孩子看懂借书规则','原来的说明太长','把规则改成短句并配上图标','孩子们能按规则借书了'),
('苏南','学校图书角','找到故事的结尾','同一本书被分成了上下两册','查找目录并借来下册','读到了完整的结尾'),
('方晴','山脚步道','把游记写得具体','草稿只写了景色很美','补写看到的花色和听到的鸟声','游记有了具体的景物描写'),
('许舟','教室','介绍小组制作的桥梁模型','组员想同时发言','提前分好介绍顺序','展示过程清楚而有序'),
('赵宁','公交车站','帮助游客找到图书馆','游客不熟悉周围道路','对照站牌说明线路和下车站点','游客知道了乘车路线')],
4: [
('周悦','校史展厅','核对老照片的拍摄年份','两份介绍中的年份不同','查阅照片背面的日期和馆藏记录','找到了能够相互印证的年份'),
('李航','观察园','记录花苞开放的过程','随手记录的时间不固定','每天同一时刻观察并写下日期','记录能够按时间比较了'),
('吴桐','班级读书会','让听众理解人物的变化','只说人物变勇敢缺少依据','选出人物前后两次行为作比较','听众理解了判断的依据'),
('夏竹','校园广播室','提醒同学爱护草坪','广播内容只是一句不要踩','说明踩踏的影响并给出绕行路线','提醒变得具体且便于行动'),
('韩松','手工展区','解释模型为什么倒下','大家只凭印象猜测','检查底座并比较调整前后的状态','找到了底座不稳这一原因'),
('杜溪','社区书屋','让书架分类更清楚','一本书同时涉及自然和旅行','根据书的主要内容确定类别','这本书被放入了合适的类别')],
5: [
('沈清','地方资料室','写一篇介绍古桥的说明文','传说与史料混在了一起','把传说单独标注并核对史料来源','文章区分了传说与可核实的信息'),
('顾言','校园采访现场','了解食堂减少浪费的办法','采访问题过于宽泛','把问题改为具体措施和实施效果','获得了可用于报道的具体材料'),
('陆晨','阅读讨论会','说明自己对故事结尾的看法','同伴有不同的解释','引用结尾原句并说明推理过程','讨论围绕文本证据展开'),
('叶澄','社区展览馆','介绍两种编织方法的区别','逐件介绍使差别不明显','按材料和步骤两个方面进行比较','观众看清了两种方法的差异'),
('程雨','班级写作课','让习作中的等待场景更真实','草稿反复使用着急一词','补写看钟和来回走动等细节','人物心情通过具体动作表现出来'),
('宋林','学校公告栏','改写活动通知','通知漏写集合地点','补充时间地点和参加要求','同学们能按通知参加活动')],
6: [
('何宁','研究性学习展示会','说明社区用水调查的发现','只写结论没有展示证据','列出调查日期样本数量和数据','读者能了解结论的依据与范围'),
('唐禾','班级辩论准备会','讨论纸质阅读与电子阅读','材料只列出一种方式的优点','分别整理两种方式的优点和局限','讨论能够兼顾不同使用情境'),
('江月','毕业纪念册编辑室','保留老师寄语的原意','压缩文字时删掉了关键条件','重新阅读原文并补回关键条件','短寄语仍准确表达了原意'),
('许川','地方文化展区','介绍一项传统技艺','讲解用了许多听众不熟悉的术语','解释关键术语并展示操作实例','听众理解了技艺的主要步骤'),
('罗青','校园新闻编辑部','核实比赛报道中的名次','转述信息与官方名单不一致','以正式公布的名单核对姓名与名次','报道中的名次得到准确更正'),
('林舟','读书分享会','解释小说中一处伏笔的作用','听众忘记了前文的细节','同时引用前文细节和后文对应情节','听众看到了前后照应的关系')]
}


def chinese():
    out=[]
    for g, cases in STORIES.items():
        for i,(name,place,goal,problem,method,result) in enumerate(cases):
            passage=f'{name}在{place}，想{goal}。可是，{problem}。{name}没有急着下结论，而是{method}。最后，{result}。'
            if g<=2:
                passage=f'{name}在{place}，想{goal}。但是，{problem}。于是，{name}{method}。最后，{result}。'
            others=[c for j,c in enumerate(cases) if j!=i]
            tasks=[('信息定位',f'{name}在哪里做这件事？',place,[c[1] for c in others],f'开头“{name}在{place}”直接交代了地点。'),
                   ('事件起因',f'{name}最初想做什么？',goal,[c[2] for c in others],f'“想{goal}”说明最初的目标。'),
                   ('解决问题',f'{name}遇到的主要困难是什么？',problem,[c[3] for c in others],f'转折后的“{problem}”是遇到的困难，不能把目标或结果当成困难。'),
                   ('过程与结果',f'{name}用什么办法解决问题？',method,[c[4] for c in others],f'材料写明采用的办法是“{method}”。'),
                   ('阅读依据', '哪句话符合材料中的最后结果？',result,[c[5] for c in others],f'结尾“{result}”交代结果；只选择材料能够支持的说法。')]
            for j,(topic,q,a,w,e) in enumerate(tasks):
                out.append(row('语文',g,f'read-{i}-{j}',topic,'阅读材料：\n'+passage+'\n\n'+q,a,w,e,'reading'))
        language=[
('标点运用','“请问，图书馆在哪里”是向别人询问地点，句末应该用什么标点？','？',['。','！'],'这是疑问句，用问号表示询问。'),
('标点运用','“今天我们把书架整理好了”是在陈述一件事，句末适合用什么标点？','。',['？','、'],'这是陈述句，用句号结束；顿号用于并列词语之间。'),
('礼貌表达','向同学借尺子，哪句话既说清请求又有礼貌？','请把尺子借给我用一下，好吗？',['你快点把尺子给我！','你怎么还不把尺子拿来！'],'使用“请”“好吗”表达请求，比命令或责问更有礼貌。'),
('词语运用','“雨停了，天空逐渐明亮起来。”其中“逐渐”表示什么？','慢慢地',['突然间','始终没有变化'],'“逐渐”强调变化是一步步发生的。'),
('词语运用','“她仔细检查，发现少带了一本书。”这里“仔细”强调什么？','认真细致',['随便应付','速度很快'],'“仔细检查”是认真查看，不等同于快或随便。'),
('句意理解','“先洗手，再吃饭。”哪件事应该先做？','洗手',['吃饭','同时做完两件事'],'“先……再……”说明做事的先后顺序。'),
('句意理解','“虽然路远，但是我们按时到了。”哪句话符合句意？','路远，仍然按时到达',['因为路远，所以迟到了','路近，提前到了'],'“虽然……但是……”表示转折，实际结果是按时到达。'),
('阅读依据','读句子：“今天的活动改在教室举行。”能从这句话确定哪项信息？','活动的地点是教室',['活动一定在上午','参加人数是二十人'],'句中明确说明地点；没有交代时间和人数，不能自行补充。'),
('表达顺序','要说明如何借书，哪种顺序最清楚？','先选书，再登记，最后领取',['先领取，再选书，最后登记','先登记，再归还，最后选书'],'步骤说明应按实际办理顺序展开，领取应在选书和登记之后。'),
('信息完整','“明天带一本喜欢的书到教室。”这句话要求带什么？','一本喜欢的书',['一盒彩笔','两把尺子'],'要求是“一本喜欢的书”，要注意物品和数量。')]
        if g>=3:
            language=[
('句式与逻辑','“只有先登记，才能领取材料。”哪种理解正确？','登记是领取材料的必要条件',['只要领取材料就不用登记','登记后可以不遵守领取规则'],'“只有……才……”强调必要条件；它没有说明登记后就可以忽略其他规则。'),
('关联词运用','要表达原因和结果，“___下雨，___活动改在室内”宜填哪组？','因为……所以……',['虽然……但是……','不但……而且……'],'下雨是原因，改在室内是结果，适合用因果关联词。'),
('信息来源','一份记录注明“截至周五，已借出18本书”。能确认什么？','统计截止时间是周五',['此后不会再借书','全年只借出了18本书'],'“截至周五”限定统计时间；不能推断周五以后的变化。'),
('说明方法','“甲桥长20米，乙桥长30米，比甲桥长10米。”主要通过什么突出差异？','列出数据并作比较',['只介绍传说','抒发个人情感'],'20米、30米、10米是数据，同时比较了两座桥的长度。'),
('修辞辨析','“风把树叶吹得沙沙响，好像在低声说话。”这里把树叶怎样描写？','当作会说话的人来写',['直接说明它会说人话','说明树叶没有声音'],'“低声说话”赋予树叶人的行为，是拟人表达，不是事实断言。'),
('概括与依据','材料写“他检查了三遍，还请同伴核对一次”。哪种概括有依据？','他对结果进行了认真核对',['他没有检查','他一定从未犯错'],'多次检查和同伴核对体现认真；不能据此推出从未犯错。'),
('表达修改','“是否带齐材料，影响活动能否顺利开展。”这句话中对应关系怎样？','“是否”与“能否”前后对应',['只讨论带齐一种情况','前后完全没有联系'],'前后都包含两种可能，表达对应；不要改成前后条件范围不一致的句子。'),
('描写与感受','哪一句主要用动作表现紧张？','他攥着衣角，反复看向门口',['桌上放着一本书','窗外有一片绿地'],'攥衣角、反复看门口是具体动作，结合语境可表现紧张；另外两项只描写环境或物品。'),
('指代关系','读句子：“小禾把新书递给小雨，小雨接过它。”其中“它”指什么？','新书',['小禾','小雨'],'“接过”的对象是前句所说的新书，不是人物。'),
('文本推理','“门外传来脚步声，他立刻收起礼物，露出期待的笑容。”哪种推测最有依据？','他可能在等待某人并准备惊喜',['他一定讨厌来人','礼物一定是一本书'],'脚步声、收起礼物、期待的笑容共同支持等待与惊喜的推测；材料未限定礼物种类。')]
        for i,(topic,q,a,w,e) in enumerate(language):
            # Grade-specific sentence contexts keep these separate from reading passages.
            out.append(row('语文',g,'language-'+str(i),topic,q,a,w,e,'language'))
    return out


def number(n):
    f=Fraction(n)
    d=f.denominator
    while d%2==0:d//=2
    while d%5==0:d//=5
    if d==1:
        from decimal import Decimal
        return format((Decimal(f.numerator)/Decimal(f.denominator)).normalize(),'f')
    return str(f.numerator)+'/'+str(f.denominator)


def maths():
    out=[]
    for g in range(1,7):
        for i in range(40):
            block,j=divmod(i,10)
            a,b=j+3,j%5+2
            if g==1:
                if block==0:
                    x,y=6+j,j%4+1;ans=x+y;topic='20以内加法应用';q=f'手工桌上有{x}张绿纸，又放来{y}张黄纸。现在共有多少张纸？';exp=f'把两部分合起来，用加法：{x}＋{y}＝{ans}张。'
                elif block==1:
                    x,y=12+j%8,j%6+2;ans=x-y;topic='20以内减法应用';q=f'篮子里有{x}个沙包，体育老师拿走{y}个。篮子里还剩多少个？';exp=f'从原来数量中减去拿走的数量：{x}－{y}＝{ans}个。'
                elif block==2:
                    x,y=5+j,j%4+1;ans=x-y;topic='两数相差';q=f'小禾贴了{x}枚贴纸，小雨贴了{y}枚。小禾比小雨多贴几枚？';exp=f'求多几枚，用较大数量减去较小数量：{x}－{y}＝{ans}枚。'
                else:
                    x,y=10+j,j%5+2;ans=x-y;topic='整体与部分';q=f'一组有{x}个积木，其中{y}个是红色，其余是蓝色。蓝色积木有多少个？';exp=f'总数减去红色部分，就是蓝色部分：{x}－{y}＝{ans}个。'
            elif g==2:
                if block==0:
                    x,y=25+j*2,18+j;ans=x+y;topic='100以内加法应用';q=f'图书角周一收到{x}本书，周二收到{y}本。两天一共收到多少本？';exp=f'合并两天的数量：{x}＋{y}＝{ans}本。'
                elif block==1:
                    x,y=68+j,23+j%7;ans=x-y;topic='100以内减法应用';q=f'展览准备了{x}张入场卡，已经发出{y}张。还剩多少张？';exp=f'剩余数量＝准备数量－已发数量：{x}－{y}＝{ans}张。'
                elif block==2:
                    x,y=j%8+2,(j*3+j//8)%8+2;ans=x*y;topic='表内乘法应用';q=f'每排摆{x}盆花，摆了{y}排。共摆了多少盆？';exp=f'{y}个{x}相加可以用乘法：{x}×{y}＝{ans}盆。'
                else:
                    x,y=j%8+2,(j*3+j//8)%8+2;ans=x;topic='平均分';q=f'把{x*y}根彩绳平均分给{y}个小组，每组分到多少根？';exp=f'平均分用除法：{x*y}÷{y}＝{ans}根。'
            elif g==3:
                if block==0:
                    x,y=123+j*17,86+j*8;ans=x+y;topic='三位数加法应用';q=f'科技馆上午来了{x}人，下午来了{y}人。共来了多少人？';exp=f'合并人数：{x}＋{y}＝{ans}人。'
                elif block==1:
                    x,y=24+j,j%7+2;ans=x*y;topic='多位数乘一位数';q=f'一盒有{x}张实验记录纸，领取{y}盒共有多少张？';exp=f'每盒数量乘盒数：{x}×{y}＝{ans}张。'
                elif block==2:
                    x,y=12+j,j%6+3;ans=2*(x+y);topic='长方形周长';q=f'长方形作品卡长{x}厘米、宽{y}厘米。沿边贴一圈彩带，需要多少厘米？';exp=f'一圈是周长：（{x}＋{y}）×2＝{ans}厘米。'
                else:
                    x,y=10+j,25+j;ans=x+y;topic='经过时间';q=f'小组9点{x:02d}分开始参观，参观{y}分钟，结束时是9点几分？';exp=f'{x}＋{y}＝{ans}，未超过60分，因此是9点{ans:02d}分。'
            elif g==4:
                if block==0:
                    x,y=105+j*11,12+j;ans=x*y;topic='三位数乘两位数';q=f'印刷室每包有{x}张纸，运来{y}包。共运来多少张？';exp=f'每包数量乘包数：{x}×{y}＝{ans}张。'
                elif block==1:
                    x,y=24+j,15+j;ans=x;topic='除数是两位数';q=f'把{x*y}个标签平均分装在{y}袋里，每袋装多少个？';exp=f'总数量÷袋数：{x*y}÷{y}＝{ans}个。'
                elif block==2:
                    x,y=Fraction(125+j*15,100),Fraction(75+j*5,100);ans=x+y;topic='小数加法应用';q=f'第一段绳长{float(x):.2f}米，第二段长{float(y):.2f}米。两段共长多少米？';exp=f'对齐小数点相加：{float(x):.2f}＋{float(y):.2f}＝{number(ans)}米。'
                else:
                    x,y=80+j*3,20+j;ans=2*(x+y);topic='运算定律与数量关系';q=f'两块相同展板，每块长边{x}厘米、短边{y}厘米。只计算每块一条长边和一条短边，两块合计多少厘米？';exp=f'每块是{x}＋{y}，两块为2×（{x}＋{y}）＝{ans}厘米。'
            elif g==5:
                if block==0:
                    x,y=Fraction(15+j,10),j%5+3;ans=x*y;topic='小数乘法应用';q=f'每份手工材料重{float(x):.1f}千克，{y}份共重多少千克？';exp=f'每份质量乘份数：{float(x):.1f}×{y}＝{number(ans)}千克。'
                elif block==1:
                    x,y=Fraction(3+j%4,10),j%5+4;ans=x;topic='小数除法应用';q=f'把{float(x*y):.1f}升颜料平均分到{y}个瓶子，每瓶多少升？';exp=f'总量÷瓶数：{float(x*y):.1f}÷{y}＝{number(ans)}升。'
                elif block==2:
                    x,y=j%5+2,12+j;ans=Fraction(x*y,2);topic='三角形面积';q=f'一张三角形纸板底{y}厘米，高{x}厘米。面积是多少平方厘米？';exp=f'底×高÷2：{y}×{x}÷2＝{number(ans)}平方厘米。'
                else:
                    x,y=j+3,j+7;ans=x+y;topic='简易方程';q=f'盒中原有一些零件，放入{y}个后共有{x+2*y}个。原来有多少个？';exp=f'设原有数量为n，n＋{y}＝{x+2*y}，两边减{y}得n＝{ans}。'
            else:
                if block==0:
                    x,y=40+j*8,Fraction(j%3+1,4);ans=x*y;topic='分数乘法应用';q=f'学校有{x}盆花，其中{number(y)}放在走廊。走廊放了多少盆？';exp=f'求一个数的几分之几，用乘法：{x}×{number(y)}＝{number(ans)}盆。'
                elif block==1:
                    x,y=60+j*10,Fraction(j%3+2,10);ans=x*y;topic='百分数应用';q=f'活动有{x}人参加，其中{int(y*100)}%选择手工。选择手工的有多少人？';exp=f'总人数×百分率：{x}×{int(y*100)}%＝{number(ans)}人。'
                elif block==2:
                    x,y=j%5+2,j%4+3;total=(x+y)*(j+5);ans=Fraction(total*x,x+y);topic='按比分配';q=f'红色与蓝色彩纸的张数比为{x}∶{y}，共{total}张。红色有多少张？';exp=f'红色占总份数的{x}/（{x}＋{y}），所以{total}×{x}/（{x}＋{y}）＝{number(ans)}张。'
                else:
                    x,y=j+4,j+2;ans=x*y*3;topic='长方体体积';q=f'一个长方体收纳盒内部长{x}厘米、宽{y}厘米、高3厘米。内部容积是多少立方厘米？';exp=f'长×宽×高：{x}×{y}×3＝{ans}立方厘米。'
            answer=number(ans)
            wrong=[number(Fraction(ans)+1),number(Fraction(ans)+2),number(Fraction(ans)-1)]
            out.append(row('数学',g,str(i),topic,q,answer,wrong,exp,'numeric',{'expected':answer,'block':block,'variant':j}))
    return out


# Original English contexts: activity, location, time, reason.
ENGLISH_CONTEXTS = [
('read books','the library','Monday','learn about animals'),
('play football','the playground','Tuesday','keep fit'),
('draw pictures','the art room','Wednesday','make a birthday card'),
('buy apples','the shop','Thursday','make a fruit salad'),
('water flowers','the garden','Friday','help the plants grow'),
('visit Grandma',"Grandma's house",'Saturday','spend time with her'),
('see old trains','the museum','Sunday','learn about transport'),
('watch birds','the park','Monday','learn about birds'),
('clean the desk','the classroom','Tuesday','keep the classroom tidy'),
('make bread','the kitchen','Wednesday','prepare breakfast')]
PAST=['read books','played football','drew pictures','bought apples','watered flowers','visited Grandma','saw old trains','watched birds','cleaned the desk','made bread']
STARTERS=[('cat','猫','black','黑色','box','盒子'),('dog','狗','brown','棕色','garden','花园'),
('bird','鸟','yellow','黄色','tree','树'),('rabbit','兔子','white','白色','room','房间'),
('fish','鱼','red','红色','pond','池塘'),('duck','鸭子','white','白色','pond','池塘'),
('bag','书包','blue','蓝色','desk','书桌'),('ball','球','green','绿色','box','盒子'),
('kite','风筝','orange','橙色','room','房间'),('cup','杯子','pink','粉色','desk','书桌')]


def english():
    out=[]
    names=['Amy','Ben','Lucy','Tom','Lily','Jack','Mary','Sam','Alice','Mike']
    for g in range(1,7):
        for i in range(10):
            if g<=2:
                noun,meaning,color,color_cn,place,place_cn=STARTERS[i]
                article='an' if noun[:1] in 'aeiou' else 'a'
                passage=f'I have {article} {noun}. It is {color}. It is in the {place}.'
                if g==2:passage+=f' I like my {noun}.'
                tasks=[('英语启蒙·情境认词','孩子有什么？',meaning,[x[1] for x in STARTERS if x[1]!=meaning],f'{noun}表示{meaning}，第一句说明拥有的物品。'),
                       ('英语启蒙·颜色理解','它是什么颜色？',color_cn,['黑色','棕色','黄色','白色','红色','蓝色','绿色','橙色','粉色'],f'It is {color}.说明颜色；{color}表示{color_cn}。'),
                       ('英语启蒙·位置理解','它在哪里？',place_cn,['盒子','花园','树','房间','池塘','书桌'],f'in the {place}表示在{place_cn}里。'),
                       ('英语启蒙·句意理解','哪句话符合英文材料？',f'{meaning}是{color_cn}的',[f'{meaning}是紫色的',f'{meaning}是灰色的'],f'第二句说明{meaning}是{color_cn}的。')]
            else:
                activity,place,day,reason=ENGLISH_CONTEXTS[i];name=names[i]
                if g==3:
                    passage=f'It is {day}. {name} is at {place}. {name} wants to {activity} and {reason}.'
                    query='What does '+name+' want to do?';answer=activity+'.';why=f'wants to {activity}说明想做的事情。'
                elif g==4:
                    passage=f'On {day}, {name} goes to {place} to {activity}. {name} wants to {reason}.'
                    query='What is the activity?';answer=activity+'.';why=f'to {activity}说明到那里进行的活动。'
                elif g==5:
                    passage=f'Next {day}, {name} is going to {activity} at {place}. {name} wants to {reason}.'
                    query='What is '+name+' going to do?';answer=activity+'.';why=f'is going to {activity}说明计划做的事情。'
                else:
                    passage=f'Last {day}, {name} {PAST[i]} at {place}. {name} wanted to {reason}.'
                    query='What did '+name+' do?';answer=PAST[i]+'.';why=f'{PAST[i]}是短文交代的过去发生的活动。'
                time=('Next ' if g==5 else 'Last ' if g==6 else '')+day+'.'
                alternatives=[p+'.' for k,p in enumerate(PAST) if k!=i] if g==6 else [x[0]+'.' for x in ENGLISH_CONTEXTS if x[0]!=activity]
                tasks=[('情境阅读·活动',query,answer,alternatives,why),
                       ('情境阅读·地点','Where is the activity?',place+'.',[x[1]+'.' for x in ENGLISH_CONTEXTS if x[1]!=place],f'at {place}交代地点。'),
                       ('情境阅读·时间','When is the activity?',time,[('Next ' if g==5 else 'Last ' if g==6 else '')+d+'.' for d in ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] if d!=day],f'材料明确给出{time}，要区分计划与过去发生的活动。'),
                       ('情境阅读·目的','Why does '+name+' want to do this?', 'To '+reason+'.',['To '+x[3]+'.' for x in ENGLISH_CONTEXTS if x[3]!=reason],f'want to / wanted to {reason}说明目的，不是地点或时间。')]
            for j,(topic,q,a,w,e) in enumerate(tasks):
                out.append(row('英语',g,f'context-{i}-{j}',topic,'阅读英文材料：\n'+passage+'\n\n'+q,a,w,e,'reading'))
    return out


# question | changed condition | kept condition | observations | limited conclusion
# Each experiment is described as a completed teacher-guided observation,
# not an instruction for children to use heat, electricity or biological samples.
EXPERIMENTS = {
1:[
('同一种纸遇水会怎样','纸是否接触水','纸的种类','干纸保持干燥，湿纸变软','本次观察中纸遇水后变软了'),
('相同杯子能否让人看清后面的图案','杯子的材料','后面的图案','透过透明塑料杯看清图案，透过不透明纸杯看不清','透明塑料杯在本次观察中更透光'),
('两种叶子外形是否相同','叶子的种类','观察时的照明','银杏叶像扇子，柳叶细长','这两种叶子的形状不同'),
('石子与棉花摸起来有什么不同','材料的种类','用手轻轻触摸的方法','石子较硬，棉花较软','两种材料的软硬不同'),
('同一盆土加水前后怎样变化','是否向土中加水','土的种类','加水后土的颜色变深','本次观察中湿土比干土颜色深'),
('阳光下同一影子上午下午是否一样','观察的时刻','所观察的物体','同一根杆子的影子方向发生变化','这根杆子的影子方向随时刻改变'),
('轻推与不推玩具车有什么不同','是否轻推小车','小车和桌面','没有推时小车静止，轻推后小车移动','轻推可以使这辆静止小车移动'),
('同一小鼓敲与不敲时是否有声音','是否敲鼓','使用的小鼓','不敲时无鼓声，轻敲时有鼓声','轻敲小鼓可以发出鼓声'),
('两种布吸水后的样子是否相同','布的种类','滴入的水量','甲布很快湿润，乙布上的水滴停留较久','两种布在本次观察中吸水表现不同'),
('种子和已经长出的小苗有何区别','所观察的生长阶段','植物种类','种子未见叶，小苗长出了叶','这株植物在生长中出现了叶')],
2:[
('斜坡高度会不会影响小车滑行距离','斜坡的高度','小车和释放位置','高斜坡组滑得较远','本次实验中斜坡较高时小车滑得较远'),
('磁铁能否吸引两种材料','物体的材料','使用的磁铁','铁钉被吸引，木块未被吸引','这块磁铁能吸引铁钉，不能吸引木块'),
('相同纸张折叠前后承重是否改变','纸张是否折成波纹','纸张大小和测试方法','波纹纸能放更多相同小积木','本次实验中折成波纹的纸承重更大'),
('沙与土漏水的情况是否相同','材料为沙还是土','材料量和倒入的水量','相同时间内沙漏出的水更多','本次条件下沙漏水较快'),
('同种小苗是否都向着光生长','照明的方向','植物种类和供水','两组小苗分别朝光较强的方向生长','本次观察的小苗表现出向光生长'),
('晴天和阴天云量是否相同','记录时的天气','同一观察地点','晴天云少，阴天云多','所记录的两天云量不同'),
('两种表面上推同一小车有什么不同','路面的粗糙程度','小车和推力大小','光滑面上小车移动较远','本次实验中路面影响了移动距离'),
('纸杯孔大小是否影响漏水快慢','纸杯孔的大小','初始水量和杯子规格','大孔杯先流空','本次条件下大孔杯漏水更快'),
('同量冰在两处融化速度是否相同','放置位置的温暖程度','冰的初始大小','温暖处的冰先融化','本次条件下温暖处的冰融化较快'),
('同一树枝上叶片大小是否完全相同','选取的叶片','同一树枝和测量方法','测量的叶片长度不完全相同','同一树枝的叶片大小也可能不同')],
3:[
('搅拌是否影响糖溶解的速度','是否搅拌','水温水量和糖量','搅拌组的糖更早看不见','本次实验中搅拌使糖溶解较快'),
('加热是否改变空气占据的空间','空气的温度','密闭装置中空气的量','教师将装置温和加热，连接的气球变大','本次观察中空气受热后体积增大'),
('气球大小是否影响小车行进距离','气球充气量','小车和轨道','充气较多组移动较远','本次条件下充气量影响移动距离'),
('温度不同是否影响水的蒸发速度','环境温度','水量容器和通风','较温暖组相同时间内水减少较多','本次条件下较温暖组蒸发较快'),
('盐和沙在水中表现是否相同','加入物质的种类','水温水量和搅拌方式','盐溶解了，沙静置后沉底','盐和沙在水中的表现不同'),
('压缩空气和压缩水是否一样容易','注射器内是空气还是水','同规格无针注射器和施力方式','空气组体积变化较明显','本次实验中空气比水容易被压缩'),
('同一根杆子影长怎样随时间变化','测量的时刻','杆长和地点','记录中中午附近影长比早晨短','这次记录中影长随时刻变化'),
('土壤颗粒静置后如何分布','静置前后状态','土样和加入的水量','静置后较大颗粒在底部','这份土样的颗粒可通过沉降观察'),
('风是否会改变轻纸条的状态','是否有风吹来','纸条长度和悬挂方式','有风时纸条偏向一侧','本次观察中风能使轻纸条偏转'),
('橡皮泥形状是否影响浮沉','橡皮泥的形状','橡皮泥质量和水槽','球形沉底，做成不漏水的船形漂浮','同量橡皮泥改变形状后浮沉可能不同')],
4:[
('橡皮筋拉长程度是否影响音高','橡皮筋的拉伸程度','橡皮筋种类和拨动方式','拉得较紧时发出的声音较高','本次实验中松紧程度影响音高'),
('拨动幅度是否影响声音大小','拨动橡皮筋的幅度','橡皮筋的松紧和长度','拨动幅度较大时声音较大','本次实验中振动幅度影响声音大小'),
('遮住口鼻是否影响气流通过','是否遮住模型的气流通道','使用的呼吸模型','遮住通道后模型无法正常进气','模型说明通畅的气流通道很重要'),
('连接方式是否影响灯泡发光','导线是否形成闭合回路','低压电池灯泡与导线','闭合回路时发光，断开时不发光','这个电路需要闭合回路才能正常工作'),
('哪些材料能接通这个低压电路','接入的材料','低压电池灯泡和导线','铜片组灯亮，塑料片组灯不亮','本次实验中铜片导电，塑料片未导通'),
('食物中有没有淀粉','食品样品的种类','教师使用的检测方法','教师检测时馒头样品呈现淀粉阳性反应','这份馒头样品含有淀粉'),
('树根是否会吸收水分','根部是否接触水','植物种类及其他生长条件','根接触水的组更久保持挺立','本次现象支持根吸收水分的解释'),
('种子萌发是否需要适量水','是否提供适量水','种子种类温度和空气','适量水组萌发，干燥组未萌发','本次条件下水影响种子萌发'),
('沙质土和黏质土保水是否相同','土壤类型','土量和注水量','相同时间内黏质土流出的水较少','本次条件下黏质土保水较多'),
('运动前后脉搏次数是否不同','是否刚完成适度运动','同一人和计数时长','运动后每分钟脉搏次数增加','这次记录中运动后脉搏加快')],
5:[
('同类豆种萌发是否受温度影响','环境温度','豆种水分空气和观察时长','适宜温度组萌发较多，低温组较少','本次实验中温度影响萌发情况'),
('通风是否影响湿布变干速度','是否有空气流动','布料面积含水量和温度','通风组先干','本次条件下通风加快变干'),
('摆长是否影响往返一次的时间','摆线长度','摆锤质量和起始摆角','长摆线组往返一次用时更长','本次实验中摆长影响摆动周期'),
('摆锤质量是否影响摆动周期','摆锤质量','摆长和较小起始摆角','两组多次测量的平均周期近似相同','本次范围内质量变化未明显改变周期'),
('光照角度是否影响受光面积','光线与板面的夹角','光源距离和光束','斜照的光斑面积更大','本次观察中照射角度影响光斑面积'),
('哪种材料更容易传热','材料种类','棒的长度粗细和加热条件','教师实验中金属棒远端较早升温','本次条件下金属棒传热较快'),
('水量是否影响相同热量下的升温','水的质量','初温和提供的热量','水量较少组升温较多','本次条件下水量影响温度变化'),
('植被是否影响流水冲走的土量','土面是否有植被','土量坡度和淋水方式','有植被组流失的土较少','本次模拟中植被减少土壤流失'),
('斜面是否能减小提升物体所需的力','是否使用斜面','物体质量和提升高度','使用斜面时测得的拉力较小','本次实验中斜面可以省力'),
('食物链中某种生物减少会有何影响','叶片数量是否减少','观察箱中昆虫初始数量和时长','叶片减少组昆虫取食竞争增多','本次观察中食物减少影响昆虫取食')],
6:[
('电磁铁匝数是否影响吸引能力','线圈匝数','铁芯电流和测试方法','匝数较多组吸起更多相同回形针','本次范围内增加匝数增强吸引能力'),
('电流方向是否影响电磁铁的磁极','电流方向','线圈匝数铁芯和电流大小','改变方向后指南针偏转方向相反','本次实验中改变电流方向改变磁极'),
('桥面结构是否影响模型承重','桥面的结构','材料用量跨度和加重方法','拱形支撑组承受的重物较多','本次条件下结构影响承重能力'),
('哪种包装减缓冰块融化','包装材料','冰质量初温和外部环境','泡沫包装组保留的冰更多','本次条件下泡沫包装减缓融化'),
('杠杆支点位置是否影响用力大小','支点位置','负载和力的作用位置','动力臂较长时所需力较小','本次实验中动力臂较长有助于省力'),
('同一物体放大后看到的细节是否不同','放大倍数','同一观察对象和光照','使用放大镜看到了更多叶脉细节','放大镜能帮助观察该物体的细节'),
('铁生锈是否与水和空气有关','接触水和空气的条件','铁钉种类和观察时长','同时接触水和空气的组出现明显锈迹','本次条件下水和空气共同促进生锈'),
('月相是否每天完全相同','观察日期','同一地点和记录方法','连续记录中月球亮面形状发生变化','月相会随日期发生变化'),
('白糖溶解与纸燃烧的变化是否相同','材料和变化过程','由教师按对应方法演示','糖水蒸发可取回糖，纸燃烧后形成灰等物质','溶解与燃烧属于不同性质的变化'),
('太阳照射方向是否影响太阳能板输出','太阳能板朝向','同一板和近似相同光照条件','面向光源较正时测得输出较大','本次条件下朝向影响太阳能板输出')]
}


def science():
    out=[]
    for g,cases in EXPERIMENTS.items():
        for i,(goal,changed,kept,observed,conclusion) in enumerate(cases):
            material=f'老师带领小组进行观察。研究的问题：{goal}。小组改变：{changed}；保持相同：{kept}。记录：{observed}。'
            others=[c for j,c in enumerate(cases) if j!=i]
            tasks=[('探究问题','这次观察主要研究什么？',goal,[x[0] for x in others],f'材料开头明确写出研究的问题是“{goal}”。'),
                   ('比较条件','小组有意改变的条件是什么？',changed,[x[1] for x in others],f'“小组改变：{changed}”说明比较的条件；保持相同的条件不应同时改变。'),
                   ('观察记录','哪项属于这次实际记录的现象？',observed,[x[3] for x in others],f'记录是“{observed}”，不能把其他实验的现象当作这次的结果。'),
                   ('证据与结论','根据记录，哪项结论得到支持？',conclusion,[x[4] for x in others],f'依据“{observed}”，可支持“{conclusion}”。结论限于题目条件，不把单次观察推广成所有情况。')]
            for j,(topic,q,a,w,e) in enumerate(tasks):
                out.append(row('科学',g,f'inquiry-{i}-{j}',topic,'观察材料：\n'+material+'\n\n'+q,a,w,e,'inquiry'))
    return out


def validate(rows):
    seen=set();ids=set();counts=Counter()
    for r in rows:
        identity=(r['subject'],r['grade'],r['prompt'])
        assert identity not in seen and r['source_record_id'] not in ids
        seen.add(identity);ids.add(r['source_record_id']);counts[(r['subject'],r['grade'])]+=1
        assert r['explanation'] and r['hint'] and len(r['options'])==3
        assert len({o['text'] for o in r['options']})==3
        assert sum(o['key']==r['answer'] for o in r['options'])==1
        assert r['source_metadata']['dataset']==DATASET
        if r['subject']=='数学':
            answer=next(o['text'] for o in r['options'] if o['key']==r['answer'])
            g=GRADES.index(r['grade'])+1;b,j=divmod(int(r['source_record_id'].rsplit('-',1)[1]),10)
            # Independent answer evaluator from the parameterization, separate
            # from generation and the stored key (uses exact rational numbers).
            if g==1:expected=[6+j+j%4+1,12+j%8-(j%6+2),5+j-(j%4+1),10+j-(j%5+2)][b]
            elif g==2:expected=[25+j*2+18+j,68+j-(23+j%7),(j%8+2)*((j*3+j//8)%8+2),j%8+2][b]
            elif g==3:expected=[123+j*17+86+j*8,(24+j)*(j%7+2),2*(12+j+j%6+3),10+j+25+j][b]
            elif g==4:expected=[(105+j*11)*(12+j),24+j,Fraction(200+j*20,100),2*(100+j*4)][b]
            elif g==5:expected=[Fraction(15+j,10)*(j%5+3),Fraction(3+j%4,10),Fraction((j%5+2)*(12+j),2),2*j+10][b]
            else:expected=[Fraction(40+j*8,4)*(j%3+1),Fraction(60+j*10,10)*(j%3+2),(j%5+2)*(j+5),(j+4)*(j+2)*3][b]
            assert Fraction(answer)==Fraction(expected),(r,expected)
    assert len(rows)==960
    assert all(counts[s,g]==40 for s in ['语文','数学','英语','科学'] for g in GRADES)
    return counts


if __name__=='__main__':
    rows=chinese()+maths()+english()+science()
    validate(rows)
    OUTPUT.write_text(json.dumps({'dataset':DATASET,'questions':rows,'authorship':'原创分类练习；非教材原题；低年级英语为启蒙'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Validated 960 original questions: 40 per subject per grade.')
