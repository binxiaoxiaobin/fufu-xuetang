"""Exact, deterministic original primary-school maths exercises.

Recipes are topic-specific. Decimal/Fraction arithmetic avoids floating-point
answers; every numeric item carries an independent executable answer check.
"""
from decimal import Decimal
from fractions import Fraction
import math
import random


def value(text):
    return Fraction(str(text))


def fmt(n):
    if isinstance(n, Fraction):
        return str(n.numerator) if n.denominator == 1 else '%d/%d' % (n.numerator, n.denominator)
    if isinstance(n, Decimal):
        return format(n.normalize(), 'f')
    return str(n)


def calc(op, a, b):
    a, b = value(a), value(b)
    return {'add':lambda:a+b, 'sub':lambda:a-b, 'mul':lambda:a*b,
            'div':lambda:a/b, 'pow':lambda:a**int(b)}[op]()


def numeric(prompt, answer, explanation, check):
    return dict(prompt=prompt, answer_text=fmt(answer), explanation=explanation,
                numeric_check=check)


def choice(prompt, answer, wrong, explanation):
    return dict(prompt=prompt, answer_text=str(answer), choices=[str(answer)]+[str(x) for x in wrong if str(x)!=str(answer)], explanation=explanation)


def expression(op,a,b):return dict(op=op,a=fmt(a),b=fmt(b))


def arithmetic(kind, p, rng):
    op='mul'
    pairs=[]
    if kind=='arithmetic':
        op,lo,hi=p[:3]
        max_b=p[3] if len(p)>3 else min(hi,20)
        min_b=p[4] if len(p)>4 else 2
        for a in range(lo,hi+1):
            for b in range(min_b,max_b+1):
                if op=='div' and a%b:continue
                if op=='sub' and a<b:continue
                pairs.append((a,b))
        rng.shuffle(pairs)
        pairs=pairs[:10]
    elif kind=='table':
        pairs=[(p, n) for n in range(1,10)]+[(p, p)]
        op='mul'
    elif kind=='decimal':
        op,places=p
        pairs=[(Decimal(rng.randrange(11,250))/Decimal(10**places),Decimal(rng.randrange(2,40))/Decimal(10**places)) for _ in range(10)]
        if op=='div':pairs=[(a*b,b) for a,b in pairs]
        if op=='sub':pairs=[(max(a,b),min(a,b)) for a,b in pairs]
    elif kind=='fraction':
        op,den=p
        pairs=[(Fraction(i+1,den),Fraction(i%4+1,den if op in ('add','sub') else den+1)) for i in range(10)]
        if op=='sub':pairs=[(a+b,b) for a,b in pairs]
    signs={'add':'＋','sub':'－','mul':'×','div':'÷'}
    out=[]
    for i,(a,b) in enumerate(pairs):
        ans=calc(op,a,b)
        if kind=='decimal':ans=Decimal(ans.numerator)/Decimal(ans.denominator)
        prompt='%s %s %s ＝多少？'%(fmt(a),signs[op],fmt(b))
        if kind=='fraction':prompt+='（填写最简分数或整数，例如 2/3。）'
        if kind=='table' and i==9:prompt='每组有%d枚贴纸，%d组共有多少枚？'%(a,b)
        step='计算得到：%s%s%s＝%s。'%(fmt(a),signs[op],fmt(b),fmt(ans))
        if kind=='fraction':step+='分数加减先统一分母；乘法分子、分母分别相乘；除法乘除数的倒数。结果约成最简分数。'
        elif kind=='decimal':step+= {'add':'小数点对齐后相加。','sub':'小数点对齐后相减。','mul':'先按整数相乘，再按两个因数的小数位数确定积的小数点。','div':'将除数化成整数，被除数同时扩大相同倍数，再相除。'}[op]
        elif op=='div':step+='可用商×除数＝被除数来检验。'
        else:step+='注意按运算符号计算，可用逆运算检查。'
        out.append(numeric(prompt,ans,step,expression(op,a,b)))
    return out


def generate(kind,p,seed):
    rng=random.Random(seed)
    if kind in ('arithmetic','table','decimal','fraction'):return arithmetic(kind,p,rng)
    result=[]
    for i in range(10):
        a=i+3;b=i+2
        if kind=='place':
            digits=p;leading=i%9+1;n=leading*10**(digits-1)+(i+2)*10+3
            place=10**(digits-1)
            result.append(numeric('数%d的最高位数字是几？'%n,leading,'最高位是%s位，最高位上的数字是%d。'%('百' if digits==3 else '千' if digits==4 else '万' if digits==5 else '十万',leading),dict(op='div',a=n//place,b=1)))
        elif kind=='compare':
            scale=p;x=(i+2)*scale+7;y=(i+2)*scale+3
            if i%2:x,y=y,x
            answer='>' if x>y else '<'
            result.append(choice('在%d ○ %d的○里应填什么符号？'%(x,y),answer,['<','>','='],'比较相同数位的数字：%d%s%d。'%(x,answer,y)))
        elif kind=='round':
            base=p;n=(i+12)*base+int(base*(0.2 if i%2==0 else 0.7));ans=((n+base//2)//base)*base
            result.append(numeric('把%d四舍五入到最接近的%d，结果是多少？'%(n,base),ans,'看保留数位的下一位，满5向前进1，不满5舍去：得到%d。'%ans,dict(op='mul',a=(n+base//2)//base,b=base)))
        elif kind=='unit':
            big,small,factor=p
            if i<5:
                result.append(numeric('%d%s＝多少%s？（只填数）'%(a,big,small),a*factor,'1%s＝%d%s，所以%d×%d＝%d。'%(big,factor,small,a,factor,a*factor),expression('mul',a,factor)))
            else:
                result.append(numeric('%d%s＝多少%s？（只填数）'%(a*factor,small,big),a,'从小单位换成大单位除以进率%d：%d÷%d＝%d。'%(factor,a*factor,factor,a),expression('div',a*factor,factor)))
        elif kind=='time':
            h=i%5+8;minute=10+i*3;duration=20+i
            result.append(numeric('团团%d:%02d开始阅读，读了%d分钟。结束时距%d:00已经过了多少分钟？'%(h,minute,duration,h),minute+duration,'把开始时超过整点的%d分钟加上阅读的%d分钟，得到%d分钟。'%(minute,duration,minute+duration),expression('add',minute,duration)))
        elif kind=='elapsed':
            start=8*60+i*5;end=start+45+i*7
            result.append(numeric('活动从%d:%02d到%d:%02d，共几分钟？'%(start//60,start%60,end//60,end%60),end-start,'先换成从当天零时开始的分钟数，再相减：%d－%d＝%d分钟。'%(end,start,end-start),expression('sub',end,start)))
        elif kind=='word':
            op,lo,hi=p[:3];a=lo+i*2;b=i+2
            if len(p)>3 and op in ('mul','div'):
                b=i%8+2
                if p[3]=='table':a=(i*3+i//8)%8+2
            if op=='mul':prompt='每盒有%d支铅笔，买%d盒共有多少支？'%(a,b)
            elif op=='div':a=a*b;prompt='%d支铅笔平均分给%d人，每人几支？'%(a,b)
            elif op=='sub':prompt='原来有%d本书，借出%d本，还剩几本？'%(a,b)
            else:prompt='一层书架有%d本书，另一层有%d本书，合起来多少本？'%(a,b)
            ans=calc(op,a,b);result.append(numeric(prompt,ans,'依据题目数量关系，列式计算得到%s。'%fmt(ans),expression(op,a,b)))
        elif kind=='remainder':
            divisor=i%7+2;quotient=i+2;remainder=i%(divisor-1)+1;n=divisor*quotient+remainder
            result.append(numeric('%d÷%d的余数是几？'%(n,divisor),remainder,'%d＝%d×%d＋%d，余数%d小于除数%d。'%(n,divisor,quotient,remainder,remainder,divisor),expression('sub',n,divisor*quotient)))
        elif kind=='mixed':
            op=p
            if op=='order':
                result.append(numeric('%d＋%d×3＝多少？'%(a,b),a+b*3,'先乘后加：%d×3＝%d，再加%d，得%d。'%(b,b*3,a,a+b*3),expression('add',a,b*3)))
            else:
                result.append(numeric('（%d＋%d）×3＝多少？'%(a,b),(a+b)*3,'先算括号内：%d＋%d＝%d，再乘3，得%d。'%(a,b,a+b,(a+b)*3),expression('mul',a+b,3)))
        elif kind=='geometry':
            shape,measure=p
            if shape=='rectangle':
                ans=2*(a+b) if measure=='perimeter' else a*b;check=expression('mul',a+b,2) if measure=='perimeter' else expression('mul',a,b)
                prompt='长方形长%d厘米、宽%d厘米，%s是多少%s？（只填数）'%(a,b,'周长' if measure=='perimeter' else '面积','厘米' if measure=='perimeter' else '平方厘米')
                exp='长方形周长＝（长＋宽）×2。' if measure=='perimeter' else '长方形面积＝长×宽。'
            elif shape=='square':
                ans=4*a if measure=='perimeter' else a*a;check=expression('mul',a,4 if measure=='perimeter' else a)
                prompt='正方形边长%d厘米，%s是多少%s？（只填数）'%(a,'周长' if measure=='perimeter' else '面积','厘米' if measure=='perimeter' else '平方厘米');exp='正方形周长＝边长×4。' if measure=='perimeter' else '正方形面积＝边长×边长。'
            elif shape in ('triangle','parallelogram','trapezoid'):
                a*=2;ans=a*b//2 if shape=='triangle' else a*b if shape=='parallelogram' else (a+a+2)*b//2
                if shape=='trapezoid':prompt='梯形上底%d厘米、下底%d厘米、高%d厘米，面积是多少平方厘米？（只填数）'%(a,a+2,b);exp='梯形面积＝（上底＋下底）×高÷2。';check=expression('div',(2*a+2)*b,2)
                else:prompt='%s底%d厘米、高%d厘米，面积是多少平方厘米？（只填数）'%('三角形' if shape=='triangle' else '平行四边形',a,b);exp='面积＝底×高'+('÷2。' if shape=='triangle' else '。');check=expression('div',a*b,2) if shape=='triangle' else expression('mul',a,b)
            elif shape=='circle':
                a=i+1;ans=Decimal('3.14')*(2*a if measure=='perimeter' else a*a);check=expression('mul','3.14',2*a if measure=='perimeter' else a*a)
                prompt='圆的半径%d厘米，%s是多少%s？（π取3.14，只填数）'%(a,'周长' if measure=='perimeter' else '面积','厘米' if measure=='perimeter' else '平方厘米');exp='圆的周长＝2πr。' if measure=='perimeter' else '圆的面积＝πr²。'
            elif shape=='cuboid':
                c=i%3+2;ans=a*b*c if measure=='volume' else 2*(a*b+a*c+b*c);check=expression('mul',a*b,c) if measure=='volume' else expression('mul',a*b+a*c+b*c,2)
                prompt='长方体长%d厘米、宽%d厘米、高%d厘米，%s是多少%s？（只填数）'%(a,b,c,'体积' if measure=='volume' else '表面积','立方厘米' if measure=='volume' else '平方厘米');exp='长方体体积＝长×宽×高。' if measure=='volume' else '表面积＝（长×宽＋长×高＋宽×高）×2。'
            elif shape=='cube':
                ans=a**3 if measure=='volume' else 6*a*a;check=expression('pow',a,3) if measure=='volume' else expression('mul',6,a*a)
                prompt='正方体棱长%d厘米，%s是多少%s？（只填数）'%(a,'体积' if measure=='volume' else '表面积','立方厘米' if measure=='volume' else '平方厘米');exp='体积＝棱长×棱长×棱长。' if measure=='volume' else '六个面的面积相等，表面积＝6×棱长×棱长。'
            elif shape in ('cylinder','cone'):
                radius=i%4+1;height=(i+2)*3;ans=Decimal('3.14')*radius*radius*height/(3 if shape=='cone' else 1);check=expression('mul','3.14',radius*radius*height//(3 if shape=='cone' else 1))
                prompt='%s底面半径%d厘米、高%d厘米，体积是多少立方厘米？（π取3.14，只填数）'%('圆锥' if shape=='cone' else '圆柱',radius,height);exp='体积＝底面积×高'+('÷3。' if shape=='cone' else '。')
            else:raise ValueError(shape)
            result.append(numeric(prompt,ans,exp+'代入题中数据，得到%s。'%fmt(ans),check))
        elif kind=='angle':
            angle=20+i*15;answer='锐角' if angle<90 else '直角' if angle==90 else '钝角'
            # Keep within the angles taught, avoiding reflex/straight ambiguity.
            result.append(choice('%d°的角属于哪一种？'%angle,answer,['锐角','直角','钝角'],'小于90°的是锐角，等于90°的是直角，大于90°且小于180°的是钝角。'))
        elif kind=='triangleangles':
            x=30+i*4;y=60+i;ans=180-x-y
            result.append(numeric('三角形两个内角是%d°和%d°，第三个内角是多少度？（只填数）'%(x,y),ans,'三角形内角和180°，180－%d－%d＝%d°。'%(x,y,ans),expression('sub',180-x,y)))
        elif kind=='fractionmeaning':
            den=i+3;num=i%2+1
            result.append(numeric('把一张纸平均分成%d份，取其中%d份，用什么分数表示？（用最简分数，如1/3）'%(den,num),Fraction(num,den),'分母表示平均分的份数，分子表示取出的份数：%d/%d，约分后为%s。'%(num,den,fmt(Fraction(num,den))),expression('div',num,den)))
        elif kind=='percent':
            total=20+i*5;part=(i%3+1)*total//5;ans=part*100//total
            result.append(numeric('共有%d人，其中%d人步行上学。步行人数占百分之几？（只填百分号前的数）'%(total,part),ans,'部分÷整体×100%%：%d÷%d×100＝%d，因此是%d%%。'%(part,total,ans,ans),expression('div',part*100,total)))
        elif kind=='discount':
            price=50+i*10;rate=(i%4+5);ans=Decimal(price)*Decimal(rate)/10
            result.append(numeric('原价%d元，打%d折后售价多少元？（只填数）'%(price,rate),ans,'%d折表示原价的%d%%，%d×%d÷10＝%s元。'%(rate,rate*10,price,rate,fmt(ans)),expression('div',price*rate,10)))
        elif kind=='ratio':
            total=(a+b)*3
            result.append(numeric('红、蓝珠子的数量比是%d:%d，共有%d颗。红珠有几颗？'%(a,b,total),a*3,'总份数%d＋%d＝%d，每份%d÷%d＝3，红珠%d×3＝%d。'%(a,b,a+b,total,a+b,a,a*3),expression('mul',a,3)))
        elif kind=='proportion':
            if p=='direct':prompt='每本书%d元，%d本共多少元？价格保持不变。'%(a,b);ans=a*b;exp='总价与数量成正比例，总价＝单价×数量。';check=expression('mul',a,b)
            else:total=a*b;prompt='路程%d千米，速度每小时%d千米，需要多少小时？'%(total,a);ans=b;exp='路程一定，速度与时间成反比例，时间＝路程÷速度。';check=expression('div',total,a)
            result.append(numeric(prompt,ans,exp+'结果为%d。'%ans,check))
        elif kind=='scale':
            ratio=(i+1)*1000;length=i%4+2;ans=ratio*length//100
            result.append(numeric('比例尺1:%d，图上长%d厘米。实际距离多少米？（只填数）'%(ratio,length),ans,'实际厘米数＝图上长度×比例尺分母，再除以100换成米，得到%d米。'%ans,expression('div',ratio*length,100)))
        elif kind=='equation':
            op=p;answer=i+4
            if op=='add':rhs=answer+a;prompt='x＋%d＝%d，x是多少？'%(a,rhs);check=expression('sub',rhs,a);exp='等式两边同时减去%d。'%a
            else:rhs=answer*a;prompt='%dx＝%d，x是多少？'%(a,rhs);check=expression('div',rhs,a);exp='等式两边同时除以%d。'%a
            result.append(numeric(prompt,answer,exp+'得到x＝%d；代回等式可验证。'%answer,check))
        elif kind=='factor':
            x=(i+2)*6;y=(i+2)*9
            ans=math.gcd(x,y) if p=='gcd' else x*y//math.gcd(x,y)
            result.append(numeric('%d和%d的%s是多少？'%(x,y,'最大公因数' if p=='gcd' else '最小公倍数'),ans,'列出公因数取最大值。' if p=='gcd' else '最小公倍数＝两数的乘积÷最大公因数。',expression('div',x*y,math.gcd(x,y)) if p=='lcm' else expression('mul',i+2,3)))
        elif kind=='divisibility':
            n=12+i*7;div=p;ans='能' if n%div==0 else '不能'
            rule={2:'个位是0、2、4、6、8的数能被2整除。',3:'各位数字之和是3的倍数的数能被3整除。',5:'个位是0或5的数能被5整除。'}[div]
            result.append(choice('%d能否被%d整除？'%(n,div),ans,['能','不能','无法判断'],rule+'%d÷%d%s余数。'%(n,div,'没有' if ans=='能' else '有')))
        elif kind=='coordinate':
            col=i%5+1;row=i+2
            result.append(numeric('用数对（%d，%d）表示位置，所在的行是第几行？'%(col,row),row,'数对先列后行，第二个数%d表示第%d行。'%(row,row),expression('add',row,0)))
        elif kind=='negative':
            t=i+3
            result.append(numeric('零下%d摄氏度记为多少摄氏度？（只填带符号的数）'%t,-t,'零下用负数表示，因此记为－%d℃。'%t,expression('sub',0,t)))
        elif kind=='average':
            nums=[a,a+2,a+4];ans=a+2
            result.append(numeric('三次跳绳分别%d、%d、%d下，平均每次多少下？'%tuple(nums),ans,'平均数＝总数÷份数：（%d＋%d＋%d）÷3＝%d。'%tuple(nums+[ans]),expression('div',sum(nums),3)))
        elif kind=='data':
            counts=[i+3,i+6,i+4];labels=['红色','蓝色','绿色'];target=i%3
            if p=='sum':prompt='调查中喜欢红、蓝、绿的人数分别为%d、%d、%d人，一共调查几人？'%tuple(counts);ans=sum(counts);check=expression('add',counts[0]+counts[1],counts[2]);exp='把三类人数相加，得到%d人。'%ans
            elif p=='compare':prompt='记录红、蓝、绿球的个数分别为%d、%d、%d。蓝球比红球多几个？'%tuple(counts);ans=3;check=expression('sub',counts[1],counts[0]);exp='多多少用减法：%d－%d＝3。'%(counts[1],counts[0])
            else:prompt='记录红、蓝、绿球的个数分别为%d、%d、%d。%s球有几个？'%tuple(counts+[labels[target]]);ans=counts[target];check=expression('add',ans,0);exp='从记录找到%s对应的数%d。'%(labels[target],ans)
            result.append(numeric(prompt,ans,exp,check))
        elif kind=='possibility':
            red=i+1;blue=i+3
            result.append(choice('袋中有%d个红球、%d个蓝球，球的大小质地相同。随机摸一个，哪种颜色更可能被摸到？'%(red,blue),'蓝色',['红色','两种一样可能'],'蓝球数量%d大于红球数量%d，因此蓝球被摸到的可能性较大。'%(blue,red)))
        elif kind=='probability':
            red=i+1;total=red+3
            result.append(numeric('袋中有%d个红球、3个蓝球，球大小质地相同。随机摸一个，摸到红球的概率是多少？（最简分数）'%red,Fraction(red,total),'概率＝红球数÷总球数＝%d/%d＝%s。'%(red,total,fmt(Fraction(red,total))),expression('div',red,total)))
        elif kind=='pattern':
            step=i+2;start=i+1;nums=[start+j*step for j in range(3)]
            result.append(numeric('数列%d、%d、%d，按相同规律下一个数是多少？'%tuple(nums),start+3*step,'每次增加%d，所以下一个数是%d＋%d＝%d。'%(step,nums[-1],step,start+3*step),expression('add',nums[-1],step)))
        elif kind=='combinations':
            if p=='multiply':prompt='有%d件不同上衣、%d条不同裤子，一件上衣配一条裤子，共有多少种搭配？'%(a,b);ans=a*b;check=expression('mul',a,b);exp='每件上衣都能配%d条裤子，所以%d×%d＝%d种。'%(b,a,b,ans)
            else:prompt='%d位同学两两握手，每两人只握一次，共握手多少次？'%a;ans=a*(a-1)//2;check=expression('div',a*(a-1),2);exp='每人握%d次，乘%d后每对被算两遍，所以%d×%d÷2＝%d。'%(a-1,a,a,a-1,ans)
            result.append(numeric(prompt,ans,exp,check))
        elif kind=='planting':
            gap=i+2;intervals=i+3;length=gap*intervals
            result.append(numeric('直路长%d米，每隔%d米种一棵，两端都种，一共几棵？'%(length,gap),intervals+1,'间隔数＝%d÷%d＝%d，两端都种时棵数比间隔数多1，所以%d棵。'%(length,gap,intervals,intervals+1),expression('add',intervals,1)))
        elif kind=='pigeonhole':
            boxes=i+2;n=boxes*2+1
            result.append(numeric('把%d个苹果放进%d个盒子。无论怎样放，至少有一个盒子至少放几个苹果？'%(n,boxes),3,'先每盒放2个，还剩1个，必有一盒达到3个；也存在最多每盒3个的放法，所以保证至少3个。',expression('add',2,1)))
        elif kind=='optimize':
            wash=i+3;boil=i+5;tea=2
            result.append(numeric('烧水%d分钟时可同时洗杯子%d分钟，水开且杯子洗好后泡茶2分钟。最快几分钟完成？'%(boil,wash),boil+tea,'烧水和洗杯可同时做，先用较长的%d分钟，再泡茶2分钟，共%d分钟。'%(boil,boil+tea),expression('add',boil,tea)))
        elif kind=='distance':
            speed=30+i*5;hours=i%3+2
            result.append(numeric('每小时行%d千米，行%d小时，路程是多少千米？（只填数）'%(speed,hours),speed*hours,'路程＝速度×时间：%d×%d＝%d千米。'%(speed,hours,speed*hours),expression('mul',speed,hours)))
        elif kind=='symmetry':
            # Written reflection rules need no fabricated visual asset.
            d=i+1
            result.append(numeric('一个点在对称轴左侧%d厘米，轴对称后的对应点在轴右侧几厘米？（只填数）'%d,d,'轴对称的对应点到对称轴的距离相等，都是%d厘米。'%d,expression('add',d,0)))
        elif kind=='movement':
            start=i+1;steps=i+3
            result.append(numeric('棋子从第%d列向右平移%d格，来到第几列？'%(start,steps),start+steps,'向右平移，列号增加%d：%d＋%d＝%d。'%(steps,start,steps,start+steps),expression('add',start,steps)))
        elif kind=='view':
            n=i+2
            result.append(numeric('把%d个相同正方体排成一条直线，前后紧贴、没有遮挡，从正上方看，能看到几个正方形？'%n,n,'每个正方体的上面都能看到，所以有%d个正方形。'%n,expression('add',n,0)))
        elif kind=='directions':
            turns=i//4+1;faces=['北','东','南','西'];start=i%4;ans=faces[(start+turns)%4]
            result.append(choice('面朝%s，每次向右转90°，连续转%d次后面朝哪方？'%(faces[start],turns),ans,[f for f in faces if f!=ans],'向右转时按北→东→南→西循环，从%s数%d次得到%s。'%(faces[start],turns,ans)))
        elif kind=='inclusion':
            both=i+2;left=i+7;right=i+5;ans=left+right-both
            result.append(numeric('喜欢画画的有%d人，喜欢唱歌的有%d人，两种都喜欢的有%d人。至少喜欢其中一种的有几人？'%(left,right,both),ans,'两种都喜欢的人被加了两次，减去一次：%d＋%d－%d＝%d。'%(left,right,both,ans),expression('sub',left+right,both)))
        elif kind=='chickenrabbit':
            chickens=i+2;rabbits=i+3;heads=chickens+rabbits;feet=chickens*2+rabbits*4
            result.append(numeric('鸡兔同笼，共%d个头、%d只脚，兔有几只？'%(heads,feet),rabbits,'假设全是鸡，共%d只脚，实际多%d只脚，每只兔比鸡多2只脚，所以兔有%d只。'%(heads*2,feet-heads*2,rabbits),expression('div',feet-heads*2,2)))
        elif kind=='counterfeit':
            n=[3,9,27,81,243,729,2187,6561,19683,59049][i];ans=i+1
            result.append(numeric('有%d个外观相同的零件，其中一个较轻，其余等重。用无砝码天平，最少称几次能保证找出较轻的零件？'%n,ans,'每次均分三组，称其中两组；平衡则次品在第三组，不平衡则在较轻组。每次缩小到三分之一，%d连续除以3共%d次到1；一次只有三种结果，因此不能更少。'%(n,ans),expression('add',ans,0)))
        elif kind=='laws':
            left=i+12;right=i+3;factor=7;ans=(left+right)*factor
            result.append(numeric('%d×7＋%d×7，用乘法分配律计算得多少？'%(left,right),ans,'提取相同因数7：（%d＋%d）×7＝%d。'%(left,right,ans),expression('mul',left+right,factor)))
        elif kind=='yearmonth':
            year=2000+i*4;ans=29 if year%400==0 or year%4==0 and year%100!=0 else 28
            result.append(numeric('%d年2月有多少天？（只填数）'%year,ans,'公历年份是4的倍数通常为闰年；整百年份需是400的倍数。%d年是闰年，2月29天。'%year,expression('add',ans,0)))
        elif kind=='anglesbasic':
            # Grade 2 does not require degree measures.
            names=['书本封面','课桌桌面','长方形卡片','正方形手帕','长方形黑板','长方形相框','正方形瓷砖','长方形窗框','长方形信封','正方形棋盘']
            result.append(choice('把%s看作规则的长方形或正方形，它的四个角是什么角？'%names[i],'直角',['锐角','钝角'],'长方形和正方形的四个角都是直角；角的大小与边画得长短无关。'))
        elif kind=='parallel':
            statements=[('同一平面内，两条永不相交的直线','平行'),('长方形的一组对边所在的直线','平行'),('正方形的一组对边所在的直线','平行'),('长方形相邻边所在的两条直线','垂直'),('正方形相邻边所在的两条直线','垂直'),('相交并形成直角的两条直线','垂直'),('同一平面内相互距离始终相同的两条直线','平行'),('一条水平直线与一条竖直直线相交形成直角','垂直'),('方格纸上两条不同的横线','平行'),('方格纸上的横线与竖线','垂直')]
            desc,ans=statements[i];result.append(choice('%s，其关系是什么？'%desc,ans,['平行','垂直','无法判断'],'同一平面内不相交的两条直线互相平行；相交成直角的两条直线互相垂直。'))
        elif kind=='unlikefractions':
            x=Fraction(i+1,12);y=Fraction(i%3+1,8);ans=x+y
            result.append(numeric('%s＋%s＝多少？（最简分数或整数）'%(fmt(x),fmt(y)),ans,'先通分，把分母统一为24，再把分子相加，结果约分为%s。'%fmt(ans),expression('add',x,y)))
        elif kind=='smallfractions':
            den=i+3;num=i%2+1;ans=Fraction(num+1,den)
            result.append(numeric('%s＋%s＝多少？（最简分数或整数）'%(fmt(Fraction(num,den)),fmt(Fraction(1,den))),ans,'分母相同，把分子相加，分母不变，再约分，得到%s。'%fmt(ans),expression('add',Fraction(num,den),Fraction(1,den))))
        else:raise ValueError('Unknown maths recipe: '+kind)
    return result


def verify(item):
    if 'numeric_check' in item:
        c=item['numeric_check'];expected=calc(c['op'],c['a'],c['b'])
        assert value(item['answer_text'])==expected,(item,expected)
