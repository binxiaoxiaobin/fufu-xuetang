"""Original exercises for explicitly labelled classic PEP, Grade 3 start."""
from primary_math_questions import choice

# Unit word banks stay within the theme; ten tasks alternate meaning/retrieval
# to avoid adding ten out-of-scope words just to achieve a question count.
VOCAB={
'school':'pen=钢笔;pencil=铅笔;book=书;bag=包;ruler=尺子;eraser=橡皮',
'colors':'red=红色;yellow=黄色;green=绿色;blue=蓝色;black=黑色;white=白色',
'body':'head=头;hand=手;arm=手臂;leg=腿;foot=脚;eye=眼睛;ear=耳朵;mouth=嘴',
'animals':'cat=猫;dog=狗;bird=鸟;bear=熊;duck=鸭子;pig=猪;elephant=大象;monkey=猴子',
'food':'bread=面包;milk=牛奶;egg=鸡蛋;rice=米饭;water=水;cake=蛋糕',
'numbers':'one=一;two=二;three=三;four=四;five=五;six=六;seven=七;eight=八;nine=九;ten=十',
'people':'student=学生;teacher=教师;boy=男孩;girl=女孩;friend=朋友',
'family':'father=父亲;mother=母亲;brother=兄弟;sister=姐妹;grandfather=祖父或外祖父;grandmother=祖母或外祖母',
'size':'big=大的;small=小的;tall=高的;short=矮的或短的;long=长的;thin=瘦的',
'location':'in=在……里面;on=在……上面;under=在……下面;desk=书桌;chair=椅子;box=盒子',
'fruit':'apple=苹果;pear=梨;orange=橙子;banana=香蕉;grape=葡萄;watermelon=西瓜',
'teen':'eleven=十一;twelve=十二;thirteen=十三;fourteen=十四;fifteen=十五;sixteen=十六;seventeen=十七;eighteen=十八;nineteen=十九;twenty=二十',
'classroom':'classroom=教室;window=窗户;door=门;light=电灯;blackboard=黑板;floor=地板',
'schoolbag':'schoolbag=书包;notebook=笔记本;key=钥匙;toy=玩具;Chinese book=语文书;maths book=数学书',
'friends':'strong=强壮的;friendly=友好的;quiet=安静的;hair=头发;shoe=鞋;glasses=眼镜',
'home':'bedroom=卧室;living room=客厅;study=书房;kitchen=厨房;bathroom=浴室',
'dinner':'beef=牛肉;chicken=鸡肉;noodles=面条;soup=汤;spoon=勺子;fork=叉子',
'jobs':'doctor=医生;nurse=护士;driver=司机;cook=厨师;farmer=农民',
'campus':'library=图书馆;playground=操场;classroom=教室;office=办公室;computer room=计算机房',
'time':'breakfast=早餐;lunch=午餐;dinner=晚餐;music class=音乐课;English class=英语课;PE class=体育课',
'weather':'warm=温暖的;hot=炎热的;cool=凉爽的;cold=寒冷的;sunny=晴朗的;rainy=下雨的;snowy=下雪的;windy=有风的',
'farm':'cow=奶牛;sheep=绵羊;horse=马;hen=母鸡;carrot=胡萝卜;potato=土豆;tomato=西红柿',
'clothes':'shirt=衬衫;skirt=裙子;dress=连衣裙;coat=外套;pants=裤子;hat=帽子',
'shopping':'expensive=昂贵的;cheap=便宜的;nice=好的;pretty=漂亮的;scarf=围巾;gloves=手套',
'character':'young=年轻的;old=年老的;kind=和蔼的;strict=严格的;funny=有趣的;polite=有礼貌的;hard-working=勤奋的',
'week':'Monday=星期一;Tuesday=星期二;Wednesday=星期三;Thursday=星期四;Friday=星期五;Saturday=星期六;Sunday=星期日',
'meals':'sandwich=三明治;salad=沙拉;hamburger=汉堡包;ice cream=冰淇淋;tea=茶;fresh=新鲜的;healthy=健康的',
'abilities':'sing=唱歌;dance=跳舞;swim=游泳;draw=画画;cook=烹饪;play football=踢足球',
'room':'clock=时钟;plant=植物;photo=照片;water bottle=水瓶;bike=自行车;bed=床',
'park':'forest=森林;river=河流;lake=湖泊;mountain=山;hill=小山;tree=树;bridge=桥',
'routine':'get up=起床;eat breakfast=吃早餐;play sports=进行体育运动;clean my room=打扫我的房间;go for a walk=去散步',
'seasons':'spring=春天;summer=夏天;autumn=秋天;winter=冬天;season=季节;snow=雪',
'months':'January=一月;February=二月;March=三月;April=四月;May=五月;June=六月;July=七月;August=八月;September=九月;October=十月;November=十一月;December=十二月',
'ordinal':'first=第一;second=第二;third=第三;fourth=第四;fifth=第五;sixth=第六',
'ownership':'mine=我的（名词性物主代词）;yours=你的（名词性物主代词）;his=他的;hers=她的（名词性物主代词）;ours=我们的（名词性物主代词）;theirs=他们的（名词性物主代词）',
'rules':'keep to the right=靠右;keep your desk clean=保持课桌整洁;talk quietly=轻声说话;take turns=轮流;work quietly=安静地工作',
'places':'museum=博物馆;post office=邮局;bookstore=书店;cinema=电影院;hospital=医院',
'transport':'on foot=步行;by bus=乘公共汽车;by train=乘火车;by plane=乘飞机;by ship=乘船;by subway=乘地铁',
'plans':'tomorrow=明天;tonight=今晚;next week=下周;visit=拜访;trip=旅行;dictionary=词典',
'hobbies':'reading=阅读;singing=唱歌;dancing=跳舞;swimming=游泳;hiking=远足;cooking=烹饪',
'professions':'scientist=科学家;pilot=飞行员;coach=教练;worker=工人;fisherman=渔民',
'feelings':'angry=生气的;afraid=害怕的;sad=悲伤的;happy=高兴的;worried=担心的',
'comparative':'taller=更高的;shorter=更矮的或更短的;older=年龄更大的;younger=更年轻的;heavier=更重的;stronger=更强壮的',
'past':'cleaned=打扫了;washed=清洗了;watched=观看了;stayed=停留了;slept=睡了;read=读（原形或过去式，发音随时态变化）',
'travel':'went=去了;took=拿了或拍摄了;ate=吃了;bought=买了;rode=骑了;camping=野营',
'changes':'before=以前;now=现在;ago=……之前（用于一段时间之后）;grass=草地;gym=体育馆;cycling=骑自行车',
}

def unit(title,bank,grammar):return (title,bank,grammar)
E=unit
ENGLISH={
(3,'a'):[E('Unit 1 · Hello!','school','be'),E('Unit 2 · Colours','colors','color'),E('Unit 3 · Look at me!','body','possessive'),E('Recycle 1','school','be'),E('Unit 4 · We love animals','animals','be'),E('Unit 5 · Let’s eat!','food','like'),E('Unit 6 · Happy birthday!','numbers','age'),E('Recycle 2','food','like')],
(3,'b'):[E('Unit 1 · Welcome back to school!','people','be'),E('Unit 2 · My family','family','be'),E('Unit 3 · At the zoo','size','be'),E('Recycle 1','people','be'),E('Unit 4 · Where is my car?','location','location'),E('Unit 5 · Do you like pears?','fruit','like'),E('Unit 6 · How many?','teen','number'),E('Recycle 2','fruit','like')],
(4,'a'):[E('Unit 1 · My classroom','classroom','there'),E('Unit 2 · My schoolbag','schoolbag','have'),E('Unit 3 · My friends','friends','has'),E('Recycle 1','schoolbag','have'),E('Unit 4 · My home','home','location'),E('Unit 5 · Dinner’s ready','dinner','would'),E('Unit 6 · Meet my family!','jobs','job'),E('Recycle 2','home','location')],
(4,'b'):[E('Unit 1 · My school','campus','location'),E('Unit 2 · What time is it?','time','time'),E('Unit 3 · Weather','weather','be'),E('Recycle 1','weather','be'),E('Unit 4 · At the farm','farm','plural'),E('Unit 5 · My clothes','clothes','ownership'),E('Unit 6 · Shopping','shopping','price'),E('Recycle 2','clothes','ownership')],
(5,'a'):[E('Unit 1 · What’s he like?','character','be'),E('Unit 2 · My week','week','routine'),E('Unit 3 · What would you like?','meals','would'),E('Recycle 1','week','routine'),E('Unit 4 · What can you do?','abilities','can'),E('Unit 5 · There is a big bed','room','there'),E('Unit 6 · In a nature park','park','there'),E('Recycle 2','abilities','can')],
(5,'b'):[E('Unit 1 · My day','routine','routine'),E('Unit 2 · My favourite season','seasons','favorite'),E('Unit 3 · My school calendar','months','month'),E('Recycle 1','seasons','favorite'),E('Unit 4 · When is the art show?','ordinal','ordinal'),E('Unit 5 · Whose dog is it?','ownership','ownership'),E('Unit 6 · Work quietly!','rules','progressive'),E('Recycle 2','ownership','ownership')],
(6,'a'):[E('Unit 1 · How can I get there?','places','location'),E('Unit 2 · Ways to go to school','transport','transport'),E('Unit 3 · My weekend plan','plans','future'),E('Recycle 1','places','location'),E('Unit 4 · I have a pen pal','hobbies','third'),E('Unit 5 · What does he do?','professions','job'),E('Unit 6 · How do you feel?','feelings','should'),E('Recycle 2','hobbies','third')],
(6,'b'):[E('Unit 1 · How tall are you?','comparative','comparative'),E('Unit 2 · Last weekend','past','past'),E('Unit 3 · Where did you go?','travel','past'),E('Unit 4 · Then and now','changes','was'),E('Recycle · Mike’s happy days','past','past')],
}


def pairs(bank):return [tuple(x.split('=',1)) for x in VOCAB[bank].split(';')]


def vocabulary(bank,title):
    vocab=pairs(bank);out=[]
    for i in range(10):
        word,meaning=vocab[i//2]
        other=[vocab[(i//2+2)%len(vocab)],vocab[(i//2+3)%len(vocab)]]
        if i%2==0:prompt='【%s】英文“%s”是什么意思？'%(title,word);ans=meaning;wrong=[x[1] for x in other]
        else:prompt='【%s】“%s”对应哪个英文词语？'%(title,meaning);ans=word;wrong=[x[0] for x in other]
        out.append(choice(prompt,ans,wrong,'“%s”表示“%s”。注意结合单元语境区分词义。'%(word,meaning)))
    return out


def grammar(kind,bank,title):
    out=[];names=['Amy','Ben','Chen','Dora','Ella','Fred','Grace','Helen','Ivy','Jack'];vocab=pairs(bank)
    for i in range(10):
        name=names[i];word=vocab[i%len(vocab)][0]
        if kind=='be':
            subjects=[('I','am'),('He','is'),('She','is'),('We','are'),('They','are')];subject,ans=subjects[i%5];prompt='%s ___ happy today.（句子%d：选择be动词）'%(subject,i+1);wrong=['am','is','are'];exp='I后用am；he/she后用is；we/they后用are。'
        elif kind=='color':prompt='%s的卡片上写着“%s”。这个词表示哪种颜色？'%(name,word);ans=vocab[i%len(vocab)][1];wrong=[vocab[(i+2)%len(vocab)][1],vocab[(i+3)%len(vocab)][1]];exp='“%s”表示%s。'%(word,ans)
        elif kind=='possessive':
            subjects=[('I','my'),('you','your'),('he','his'),('she','her'),('we','our')];sub,ans=subjects[i%5];prompt='人物卡%d：%s有一本书，表示“%s的书”应选哪项？'%(i+1,sub,sub);wrong=['my','your','his','her','our'];exp='这里使用形容词性物主代词，%s对应%s book。'%(sub,ans)
        elif kind=='like':prompt='%s: I ___ apples.（表示“喜欢”）'%name;ans='like';wrong=['likes','liking'];exp='主语是I，一般现在时用动词原形like。'
        elif kind=='age':n=i+1;prompt='%s: I am %d years old. 他/她几岁？（选择英文数字）'%(name,n);ans=pairs('numbers')[i][0];wrong=[pairs('numbers')[(i+2)%10][0],pairs('numbers')[(i+3)%10][0]];exp='years old用于表达年龄，%d对应%s。'%(n,ans)
        elif kind=='location':
            loc,zh=[('in','里面'),('on','上面'),('under','下面')][i%3];prompt='%s把书放在盒子%s。The book is ___ the box.'%(name,zh);ans=loc;wrong=['in','on','under'];exp='in在里面，on在上面，under在下面；根据中文位置选择'+loc+'。'
        elif kind=='number':n=i+11;prompt='%s数到%d个球。How many balls? 选择英文数字。'%(name,n);ans=pairs('teen')[i][0];wrong=[pairs('teen')[(i+2)%10][0],pairs('teen')[(i+3)%10][0]];exp='%d对应%s；how many询问数量。'%(n,ans)
        elif kind in ('have','has'):
            sub='I' if kind=='have' else name;ans='have' if kind=='have' else 'has';prompt='%s ___ a red bag.（表示“有”，练习%d）'%(sub,i+1);wrong=['have','has','having'];exp='主语I用have，第三人称单数人名用has。'
        elif kind=='there':n=i%4+1;ans='is' if n==1 else 'are';prompt='%s的房间里有%d个盒子：There ___ %s.'%(name,n,'a box' if n==1 else '%d boxes'%n);wrong=['is','are','am'];exp='There be句型里单数a box用is，复数boxes用are。'
        elif kind=='would':prompt='%s想礼貌地表达“我想要一些水”。哪一句适合？'%name;ans='I would like some water.';wrong=['I likes water.','I would water.'];exp='would like表示“想要”，I would like some water.是完整而礼貌的表达。'
        elif kind=='job':job=pairs('jobs')[i%5];prompt='%s的爸爸是一名%s。He is a ___.'%(name,job[1]);ans=job[0];wrong=[pairs('jobs')[(i+2)%5][0],pairs('jobs')[(i+3)%5][0]];exp='职业“%s”用%s表示，a后面跟单数职业名词。'%(job[1],job[0])
        elif kind=='time':n=i+1;prompt='%s: It is %s o’clock. 现在是几点？'%(name,pairs('numbers')[i][0]);ans='%d点'%n;wrong=['%d点'%(n+1),'%d点'%(n+2)];exp='o’clock表示整点，%s对应%d，所以是%d点。'%(pairs('numbers')[i][0],n,n)
        elif kind=='plural':noun,plural=[('cow','cows'),('hen','hens'),('horse','horses'),('sheep','sheep'),('tomato','tomatoes')][i%5];prompt='%s看见两只或两个%s，句中应使用哪个复数形式？'%(name,noun);ans=plural;wrong=[noun+'ing',noun+'ed'];exp='此处表达不止一个，%s的复数是%s；sheep单复数同形，tomato加-es。'%(noun,plural)
        elif kind=='ownership':sub,ans=[('I','mine'),('you','yours'),('he','his'),('she','hers'),('we','ours')][i%5];prompt='卡片%d：这本书属于%s。名词已省略，“是%s的”应选哪个物主代词？'%(i+1,sub,sub);wrong=['mine','yours','his','hers','ours'];exp='名词性物主代词可独立使用，不再接名词；%s对应%s。'%(sub,ans)
        elif kind=='price':price=(i+2)*5;prompt='%s: The hat is %d yuan. How much is the hat?'%(name,price);ans='%d元'%price;wrong=['%d元'%(price+5),'%d元'%(price+10)];exp='How much询问价格，句子直接说明帽子%d元。'%price
        elif kind=='routine':day=pairs('week')[i%7][0];prompt='%s在%s读书：I read books ___ %s.'%(name,day,day);ans='on';wrong=['in','at'];exp='在具体星期几之前用介词on。'
        elif kind=='can':prompt='%s: I can ___ a song.（表示能唱一首歌）'%name;ans='sing';wrong=['sings','singing'];exp='情态动词can后用动词原形sing。'
        elif kind=='favorite':season=pairs('seasons')[i%4];prompt='%s: My favourite season is %s. 最喜欢哪个季节？'%(name,season[0]);ans=season[1];wrong=[pairs('seasons')[(i+1)%4][1],pairs('seasons')[(i+2)%4][1]];exp='favourite season指最喜欢的季节，%s表示%s。'%(season[0],season[1])
        elif kind=='month':month=pairs('months')[i][0];prompt='%s的生日在%s。My birthday is ___ %s.'%(name,month,month);ans='in';wrong=['on','at'];exp='只说月份时用in；具体到某一天时才用on。'
        elif kind=='ordinal':day=i%6+1;ordword=pairs('ordinal')[day-1][0];prompt='%s排第%d，应使用哪个英文序数词？'%(name,day);ans=ordword;wrong=[pairs('ordinal')[(day+1)%6][0],pairs('ordinal')[(day+2)%6][0]];exp='表示顺序使用序数词，第%d对应%s。'%(day,ordword)
        elif kind=='progressive':prompt='%s现在正在读书：%s is ___ a book.'%(name,name);ans='reading';wrong=['read','reads'];exp='正在发生的动作使用be＋动词-ing，is reading表示正在读。'
        elif kind=='transport':trans=pairs('transport')[i%6];prompt='%s去上学的方式是“%s”，对应哪种英文表达？'%(name,trans[1]);ans=trans[0];wrong=[pairs('transport')[(i+2)%6][0],pairs('transport')[(i+3)%6][0]];exp='“%s”对应%s。交通工具前用by时通常不加冠词，步行是on foot。'%(trans[1],trans[0])
        elif kind=='future':prompt='%s明天打算读书：%s is going ___ read a book tomorrow.'%(name,name);ans='to';wrong=['for','at'];exp='be going to＋动词原形，表示计划或打算。'
        elif kind=='third':prompt='%s每天读书：%s ___ books every day.'%(name,name);ans='reads';wrong=['read','reading'];exp='一般现在时的主语为第三人称单数人名，read加-s为reads。'
        elif kind=='should':prompt='%s感冒了。You should ___ a doctor.（表示建议看医生）'%name;ans='see';wrong=['sees','seeing'];exp='should表示建议，其后用动词原形see。'
        elif kind=='comparative':h=140+i;prompt='%s身高%d厘米，同伴%d厘米。%s is ___ than the other child.'%(name,h,h-3,name);ans='taller';wrong=['shorter','tall'];exp='有than的比较句用比较级；%d大于%d，因此是taller（更高）。'%(h,h-3)
        elif kind=='past':prompt='%s昨天打扫房间：%s ___ the room yesterday.'%(name,name);ans='cleaned';wrong=['cleans','cleaning'];exp='yesterday提示过去时间，clean的过去式为cleaned。'
        elif kind=='was':prompt='%s: There ___ a small library here ten years ago.'%name;ans='was';wrong=['is','were'];exp='ten years ago是过去时间，a small library为单数，there was表示以前有。'
        else:raise ValueError(kind)
        out.append(choice('【%s】%s'%(title,prompt),ans,wrong,exp))
    return out


def wordcard_reading(bank,title,grade,index):
    vocab=pairs(bank);w1,w2,w3=[x[0] for x in vocab[:3]]
    # A short original classroom activity about this unit's exact vocabulary.
    name=['Amy','Ben','Chen','Dora','Ella','Fred','Grace','Helen'][index%8]
    n=index+3;day=['Monday','Tuesday','Wednesday','Thursday','Friday'][index%5]
    if grade==3:
        text='I am %s. I have %d cards. Look at my cards: "%s", "%s" and "%s". I read the cards with my friend. I like the word game.'%(name,n,w1,w2,w3)
    else:
        text='My name is %s. On %s, I make %d word cards in the classroom. The cards include "%s", "%s" and "%s". I read them with my friend. We put the cards in a blue box after the game. The word game helps us learn.'%(name,day,n,w1,w2,w3)
    prefix='阅读原创短文：\n'+text+'\n\n';out=[]
    facts=[('Who is speaking?',name,['Mike','Oliver'],'开头写着说话人的姓名'+name+'。'),('How many cards does the speaker have?',str(n),[str(n+1),str(n+2)],'短文中的%d cards直接说明数量。'%n),('Which word is on a card?',w1,['airport','astronaut'],'卡片上列出了“'+w1+'”，另外两个词没有在卡片内容中出现。'),('Who reads the cards with the speaker?','A friend.',['A doctor.','A driver.'],'with my friend表示与朋友一起。'),('What does the activity help the children do?','Learn words.',['Repair a car.','Cook dinner.'],'活动围绕word cards和word game展开，是学习词语。'),('文中的“'+w2+'”是什么意思？',vocab[1][1],[vocab[3][1],vocab[4][1]],'“'+w2+'”在本单元表示“'+vocab[1][1]+'”。'),('文中的“'+w3+'”是什么意思？',vocab[2][1],[vocab[0][1],vocab[4][1]],'“'+w3+'”表示“'+vocab[2][1]+'”。'),('Which is a suitable title?','A word-card game',['A train repair','A long sea trip'],'标题要概括主要活动，短文讲的是词语卡片游戏。')]
    if grade==3:facts += [('Does the speaker like the game?','Yes.',['No.','The text does not say.'],'最后一句I like the word game直接表示喜欢。'),('卡片活动的主要材料是什么？','Word cards.',['Bikes.','Cakes.'],'全文围绕cards展开，主要材料是词语卡片。')]
    else:facts += [('Where do they put the cards after the game?','In a blue box.',['Under a tree.','In a red bag.'],'put the cards in a blue box after the game直接说明活动后放卡片的位置。'),('When does the speaker make the cards?',day,[x for x in ['Monday','Tuesday','Wednesday','Thursday','Friday'] if x!=day][:2],'On '+day+'交代制作卡片的时间。')]
    for prompt,ans,wrong,explanation in facts:out.append(choice(prefix+prompt,ans,wrong,explanation))
    return out


# Functional contexts keep reading linked to the actual unit rather than
# turning every Grade 6 lesson into a Grade 3 word-card activity.
CONTEXTS={
 'school':('classroom','check my bag','a ruler','have everything ready for class','put the ruler in the bag'),
 'colors':('art room','make a picture','a red pencil','make a colourful picture','put the picture on the wall'),
 'body':('classroom','draw a face','a small picture','learn the names of body parts','show the picture to the class'),
 'animals':('zoo','watch the animals','a picture of a bear','learn about animals','draw the bear in my notebook'),
 'food':('kitchen','make breakfast','a piece of bread','have breakfast before school','eat the bread with milk'),
 'numbers':('classroom','count the books','a book','check how many books we have','put the books on the shelf'),
 'people':('classroom','meet a new student','a name card','help the new student meet the class','say hello to the new student'),
 'family':('living room','look at family photos','a photo of my mother','tell my friend about my family','put the photos in a box'),
 'size':('zoo','look at the giraffes','a tall giraffe','compare the animals','draw the tall giraffe'),
 'location':('bedroom','look for my toy','a toy car under the chair','find my toy car','put the car in the box'),
 'fruit':('kitchen','make a fruit salad','an apple','prepare a healthy snack','share the salad with my friend'),
 'teen':('classroom','count the pencils','a pencil','check our classroom supplies','put the pencils in a box'),
 'classroom':('classroom','clean the desks','a clean cloth','keep our classroom tidy','open the window'),
 'schoolbag':('classroom','check my schoolbag','a notebook','get ready for the next class','put the notebook in my bag'),
 'friends':('playground','play a game','a ball','have fun with my friend','put the ball away'),
 'home':('living room','tidy the room','a book on the sofa','make the room clean','put the book in the study'),
 'dinner':('kitchen','prepare dinner','a bowl of soup','help my family','put the soup on the table'),
 'jobs':('classroom','talk about our families','a photo of a doctor','learn about different jobs','put the photo on the board'),
 'campus':('school','visit the library','a storybook','find a book to read','borrow the storybook'),
 'time':('classroom','check the clock','a small clock','get to the music class on time','go to the music room'),
 'weather':('classroom','look at the weather report','a report saying it is rainy','make a plan for the afternoon','take an umbrella'),
 'farm':('farm','help feed the hens','a basket of food','help the farmer care for animals','wash our hands'),
 'clothes':('bedroom','choose clothes for school','a clean shirt','get ready for school','put on the shirt'),
 'shopping':('shop','look for a gift','a scarf','choose a useful gift','buy the scarf'),
 'character':('classroom','help a new student','a book','make our new classmate feel welcome','give the book to the student'),
 'week':('classroom','make a weekly plan','a timetable','use our time well','write the plan in a notebook'),
 'meals':('kitchen','make lunch','a fresh salad','prepare a healthy meal','share the salad with my family'),
 'abilities':('music room','practise a song','a song sheet','prepare for the school show','sing the song together'),
 'room':('bedroom','put things in order','a photo','make the room tidy','put the photo beside the clock'),
 'park':('nature park','look at the river','a little bridge','learn about the park','walk across the bridge'),
 'routine':('living room','plan the morning','a notebook','make time for reading and exercise','write the plan down'),
 'seasons':('classroom','compare the seasons','a picture of spring','choose a good time to plant flowers','choose spring'),
 'months':('classroom','make a school calendar','a calendar','remember the school activities','mark the dates'),
 'ordinal':('classroom','arrange an art show','a timetable','tell everyone when the show begins','put the timetable on the wall'),
 'ownership':('classroom','return lost things','a blue bag','help its owner find it','give the bag to the teacher'),
 'rules':('library','read quietly','a storybook','let other people read peacefully','put the book back'),
 'places':('street','read the map','a map showing the hospital','find the way to the hospital','follow the map'),
 'transport':('bus stop','check the route','a bus timetable','get to the museum safely','wait for the right bus'),
 'plans':('living room','make a weekend plan','a notebook','prepare for a visit to the museum','write the plan down'),
 'hobbies':('classroom','talk about our hobbies','a book about cooking','learn about each other','lend the book to my friend'),
 'professions':('classroom','prepare a report','a photo of a pilot','learn about different jobs','write about the pilot'),
 'feelings':('living room','help a worried friend','a warm drink','help my friend feel better','listen to my friend patiently'),
 'comparative':('classroom','compare our heights','a measuring tape','record how much we have grown','write our heights down'),
 'past':('living room','talk about last weekend','a photo','share a happy memory','put the photo in an album'),
 'travel':('classroom','talk about a trip','a photo of a mountain','share what I saw on the trip','show the photo to my classmates'),
 'changes':('school','compare the old and new school','an old photo','learn how our school has changed','write down the differences'),
}


def reading(bank,title,grade,index):
    if grade==3:return wordcard_reading(bank,title,grade,index)
    place,activity,item,purpose,end=CONTEXTS[bank]
    name=['Amy','Ben','Chen','Dora','Ella','Fred','Grace','Helen'][index%8]
    friend=['Lily','Tom','Sam','Lucy'][(index+1)%4]
    day=['Monday','Tuesday','Wednesday','Thursday','Friday'][index%5]
    hour=index%3+3
    location='at the bus stop' if place=='bus stop' else 'on the farm' if place=='farm' else 'in the '+place
    text='My name is %s. On %s at %d o’clock, I am %s with my friend %s. We %s. We have %s. We want to %s. After the activity, we %s.'%(name,day,hour,location,friend,activity,item,purpose,end)
    if grade>=5:text+=' We work together, so the task becomes easier. We make a short record of what we do.'
    prefix='阅读原创短文：\n'+text+'\n\n'
    facts=[('Who is speaking?',name,['Mike','Oliver'],'开头My name is '+name+'交代姓名。'),
      ('Where are the children?', location[0].upper()+location[1:]+'.',['At the airport.','In a train.'],'短文写着'+location+'，据此找到地点。'),
      ('Who is with the speaker?',friend,['Anna','Peter'],'with my friend '+friend+'交代同行的朋友。'),
      ('What do they do?',activity,['build a new train','repair a broken ship'],'短文的We '+activity+'直接说明活动。'),
      ('What do they have?',item,['a ticket to the moon','a broken computer'],'We have '+item+'说明他们拥有的物品。'),
      ('Why do they do this activity?',purpose,['become famous immediately','win a running race'],'We want to '+purpose+'说明活动目的。'),
      ('What do they do after the activity?',end,['throw everything away','forget the whole activity'],'After the activity, we '+end+'交代活动后做的事情。'),
      ('On which day does the activity happen?',day,[x for x in ['Monday','Tuesday','Wednesday','Thursday','Friday'] if x!=day][:2],'On '+day+'交代日期。'),
      ('What time is it at the start?','%d o’clock.'%hour,['%d o’clock.'%(hour+1),'%d o’clock.'%(hour+2)],'at %d o’clock表示开始时的整点时间。'%hour),
      ('Which sentence best describes this passage?','Two friends complete a task together.',['A person travels alone to another country.','A child gives up before doing anything.'],'两人一起'+activity+'，有明确目的和结束后的行动，所以“共同完成任务”是有依据的概括。')]
    return [choice(prefix+q,ans,wrong,exp) for q,ans,wrong,exp in facts]


def generate(kind,p):
    if kind=='english_words':return vocabulary(*p)
    if kind=='english_grammar':return grammar(*p)
    if kind=='english_reading':return reading(*p)
    raise ValueError(kind)
