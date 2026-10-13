"""Original thematic word/context lessons, ordered by difficulty instead of grade."""
import json
from difflib import SequenceMatcher
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
# difficulty band|word|pronunciation|meaning|sentence before gap|sentence after gap|scene
CHINESE = '''1|太阳|tài yáng|白天照亮大地的恒星|早上，|升起来了。|sun
1|月亮|yuè liang|夜空中常见的月球|夜晚，我们一起看|。|moon
1|小鸟|xiǎo niǎo|有羽毛、会鸣叫的动物|一只|飞过树梢。|bird
1|小猫|xiǎo māo|常见的宠物|窗边的|伸了个懒腰。|cat
1|雨水|yǔ shuǐ|从云里落下的水|小树喝到了|。|rain
1|大树|dà shù|长着树干、树枝和叶子的植物|我们坐在|下乘凉。|tree
1|苹果|píng guǒ|一种常见的水果|我把洗好的|分给妹妹。|apple
1|朋友|péng you|愿意一起相处、互相关心的人|我和|一起玩球。|friends
2|春天|chūn tiān|万物渐渐生长的季节|到了|，花园里的花开了。|flowers
2|彩虹|cǎi hóng|雨后有时出现的彩色光弧|雨停后，天空出现了|。|rainbow
2|读书|dú shū|阅读书本的内容|每天睡前，我都会|。|read
2|跳跃|tiào yuè|身体离开地面再落下|小兔轻轻|，越过一块小石头。|jump
2|跑步|pǎo bù|用双脚交替快速向前移动|我在操场上|，风吹过耳边。|run
2|分享|fēn xiǎng|把自己的东西或快乐与别人一起享用|我愿意和朋友|这个苹果。|apple
2|种子|zhǒng zi|能长出新植物的小小生命|我们把|放进湿润的泥土。|plant
2|安静|ān jìng|没有很大的声音|大家|地听老师讲故事。|read
3|清晨|qīng chén|太阳升起前后的一段时间|我在|听见了鸟叫。|sun
3|观察|guān chá|仔细看，发现特点和变化|我蹲下来|小苗的新叶。|plant
3|照顾|zhào gù|关心并帮助别人或小动物|我给小猫添水，认真|它。|cat
3|合作|hé zuò|几个人一起完成一件事情|我和同学|，把书摆整齐。|friends
3|勇敢|yǒng gǎn|虽然担心，仍愿意面对困难|第一次上台，我努力做个|的孩子。|friends
3|温暖|wēn nuǎn|让人感到舒适、不冷|阳光照在身上，让我觉得|。|sun
3|寻找|xún zhǎo|想办法找到需要的人或东西|我们在草地上|丢失的小球。|ball
3|整理|zhěng lǐ|把东西安排得整齐、有条理|读完书，我会|书架。|read
4|倾听|qīng tīng|专心听别人说话|朋友说话时，我认真|。|friends
4|尊重|zūn zhòng|重视别人的感受与权利|意见不同时，我们也要互相|。|friends
4|保护|bǎo hù|让人或事物免受伤害|不折树枝，也是|树木的一种方式。|tree
4|探索|tàn suǒ|带着问题寻找新的发现|我们沿着小路|，发现一朵新开的花。|flowers
4|坚持|jiān chí|遇到困难时继续认真做下去|练习跳绳有点难，我决定|。|jump
4|诚实|chéng shí|说真话，不欺骗别人|打碎杯子后，我|地告诉了爸爸。|friends
4|耐心|nài xīn|不急躁地等待或做事情|小苗长得慢，我们要|地等待。|plant
4|发现|fā xiàn|看见或了解到以前不知道的事情|看过雨后的天空，我|了一道彩虹。|rainbow
5|责任|zé rèn|自己应该承担的事情|照料班级的盆栽，是我的|。|plant
5|欣赏|xīn shǎng|认真感受美好之处|我们停下脚步，|窗外的月色。|moon
5|沟通|gōu tōng|把想法说清楚，也理解别人的意思|遇到误会时，我们可以好好|。|friends
5|珍惜|zhēn xī|重视并爱护拥有的事物|把水龙头关紧，是在|水资源。|rain
5|专注|zhuān zhù|把注意力放在正在做的事情上|我|地读书，暂时放下玩具。|read
5|鼓励|gǔ lì|让别人更有信心地尝试|朋友还没学会拍球，我轻声|他。|ball
5|协调|xié tiáo|安排不同的事情，让它们配合得更好|小组成员|分工，一起种好小树。|plant
5|记录|jì lù|把看到或想到的事情保存下来|我用笔|小苗每天的变化。|plant
6|包容|bāo róng|理解差异，愿意接纳不同的想法|每个人的习惯不同，我们学着互相|。|friends
6|反思|fǎn sī|回头想想做得怎样，寻找改进的方法|练习结束后，我会|哪里还能改进。|read
6|自律|zì lǜ|主动管理自己的行为|我按约定完成阅读，慢慢学会|。|read
6|感恩|gǎn ēn|记住并感谢别人给予的帮助|得到朋友的帮助，我心怀|。|friends
6|传承|chuán chéng|把有价值的文化与经验接着传下去|我们学唱家乡的歌，让文化继续|。|friends
6|创造|chuàng zào|动脑筋做出新的想法或事物|我们用落叶|一幅特别的画。|tree
6|承诺|chéng nuò|认真答应别人要做到的事情|答应照顾小苗后，我努力兑现|。|plant
6|成长|chéng zhǎng|身体、知识和能力逐渐发展|一次次尝试，让我们慢慢|。|tree'''
ENGLISH = '''1|sun|太阳|The | is bright.|sun
1|moon|月亮|I can see the | tonight.|moon
1|cat|猫|The | is on the mat.|cat
1|dog|狗|My | likes to play.|dog
1|bird|鸟|A | is in the tree.|bird
1|apple|苹果|I have an |.|apple
1|book|书|This is my |.|read
1|ball|球|The | is round.|ball
2|up|向上|The bird flies |.|bird
2|down|向下|The rain falls |.|rain
2|big|大的|This tree is |.|tree
2|small|小的|The cat is |.|cat
2|red|红色的|The apple is |.|apple
2|blue|蓝色的|The ball is |.|ball
2|in|在里面|The seed is | the pot.|plant
2|on|在上面|The cat is | the mat.|cat
3|run|跑|I can | in the park.|run
3|jump|跳|The rabbit can |.|jump
3|read|阅读|I like to | a book.|read
3|rain|雨|The | helps the plants grow.|rain
3|tree|树|A bird rests in the |.|tree
3|flower|花|This | is yellow.|flowers
3|friend|朋友|I play with my |.|friends
3|happy|开心的|We are | to play together.|friends
4|help|帮助|I can | my friend.|friends
4|share|分享|We | an apple.|apple
4|water|水；浇水|I | the little plant.|plant
4|grow|生长|The plants | in the sun.|plant
4|listen|倾听|I | when my friend speaks.|friends
4|careful|小心的|Be | with the little bird.|bird
4|together|一起|We read a book |.|read
4|kind|友善的|My friend is | to me.|friends
5|garden|花园|We plant flowers in the |.|flowers
5|protect|保护|We | the trees.|tree
5|collect|收集|We | leaves in the park.|tree
5|quiet|安静的|Please be | while we read.|read
5|patient|耐心的|Be | while the seed grows.|plant
5|practice|练习|I | jumping every day.|jump
5|because|因为|The plant grows | it gets water.|plant
5|always|总是|I | put my books away.|read
6|notice|注意到|I | a new leaf on the plant.|plant
6|respect|尊重|We | each other.|friends
6|promise|答应|I | to look after the plant.|plant
6|improve|改进；提高|I read every day to |.|read
6|although|虽然|I keep trying | jumping is hard.|jump
6|instead|代替；而是|It is raining, so we read inside |.|rain
6|remember|记得|Please | to water the plant.|plant
6|future|未来|This little tree will grow in the |.|tree'''

CHINESE += '''
1|香蕉|xiāng jiāo|一种长长的、成熟后常呈黄色的水果|我剥开|，慢慢地吃。|banana
1|橙子|chéng zi|一种有果皮、果肉分瓣的水果|妈妈把|切成小块。|orange
1|葡萄|pú tao|常常一串串生长的水果|我把一串|洗干净。|grape
1|西瓜|xī guā|一种果实较大的水果|我们分享一块|。|watermelon
1|草莓|cǎo méi|一种成熟后常呈红色的小水果|小碗里装着洗好的|。|strawberry
1|梨子|lí zi|一种汁水较多的水果|我轻轻咬了一口|。|pear
1|胡萝卜|hú luó bo|一种常呈橙色的根类蔬菜|爸爸把|切成小条。|carrot
1|番茄|fān qié|常作蔬菜食用的果实|我把红红的|洗干净。|tomato
1|黄瓜|huáng guā|一种长条形的蔬菜|这根|又脆又清爽。|cucumber
1|土豆|tǔ dòu|一种可以食用的地下块茎|妈妈把|煮熟了。|potato
1|白菜|bái cài|一种常见的叶类蔬菜|锅里有洗净的|。|vegetable
1|南瓜|nán guā|一种可以食用的瓜类果实|桌上有一碗|汤。|pumpkin
1|杯子|bēi zi|用来盛饮料的容器|我用|喝水。|cup
1|勺子|sháo zi|用来舀食物的小工具|我用|喝汤。|spoon
1|牙刷|yá shuā|清洁牙齿的小工具|我拿起|，认真刷牙。|brush
1|毛巾|máo jīn|用来擦拭的柔软布巾|洗脸后，我用|擦干水。|towel
1|鞋子|xié zi|穿在脚上保护双脚的用品|出门前，我把|穿好。|shoes
1|书包|shū bāo|用来装书和学习用品的包|我把课本放进|。|backpack
1|桌子|zhuō zi|可以摆放物品的家具|我把书放在|上。|table
1|椅子|yǐ zi|供人坐下的家具|我坐在|上读书。|chair
2|打开|dǎ kāi|让原本关闭的东西展开或开启|我轻轻|书本。|read
2|关上|guān shàng|让原本打开的东西闭合|读完后，我把书|了。|read
2|洗手|xǐ shǒu|用水和清洁用品洗净双手|吃饭前，我先|。|wash
2|睡觉|shuì jiào|让身体休息的活动|夜晚到了，我准备|。|sleep'''
ENGLISH += '''
1|banana|香蕉|I peel a |.|banana
1|orange|橙子|This | is sweet.|orange
1|grape|葡萄|I wash a | before I eat it.|grape
1|watermelon|西瓜|We share a |.|watermelon
1|strawberry|草莓|This | is red.|strawberry
1|pear|梨|I have a | for a snack.|pear
1|carrot|胡萝卜|The | is orange.|carrot
1|tomato|番茄|I wash the |.|tomato
1|cucumber|黄瓜|This | is green.|cucumber
1|potato|土豆|We cook a |.|potato
1|cabbage|卷心菜|We wash the |.|vegetable
1|pumpkin|南瓜|We make | soup.|pumpkin
1|cup|杯子|There is water in my |.|cup
1|spoon|勺子|I use a | to eat soup.|spoon
1|toothbrush|牙刷|I clean my teeth with a |.|brush
1|towel|毛巾|I dry my hands with a |.|towel
1|shoes|鞋子|I put on my |.|shoes
1|backpack|背包|My book is in my |.|backpack
1|table|桌子|The book is on the |.|table
1|chair|椅子|I sit on a |.|chair
2|open|打开|I | my book.|read
2|close|关上|I | my book.|read
2|wash|洗|I | my hands.|wash
2|sleep|睡觉|I | at night.|sleep'''
FRUIT={'banana','orange','grape','watermelon','strawberry','pear','apple','香蕉','橙子','葡萄','西瓜','草莓','梨子','苹果'}
VEGETABLE={'carrot','tomato','cucumber','potato','cabbage','pumpkin','胡萝卜','番茄','黄瓜','土豆','白菜','南瓜'}
DAILY={'cup','spoon','toothbrush','towel','shoes','backpack','table','chair','book','ball','杯子','勺子','牙刷','毛巾','鞋子','书包','桌子','椅子'}
DESCRIPTIONS={'up','down','big','small','red','blue','in','on','because','always','although','instead','future','quiet','careful','安静','温暖','清晨'}
SOCIAL={'朋友','分享','照顾','合作','勇敢','倾听','尊重','坚持','诚实','耐心','责任','沟通','珍惜','专注','鼓励','协调','包容','反思','自律','感恩','传承','承诺','成长','friend','happy','help','share','listen','together','kind','patient','respect','promise'}
ACTIONS={'观察','寻找','整理','保护','探索','发现','欣赏','记录','创造','protect','collect','notice','improve','remember','water','practice'}
def category(word,scene):
    if word in FRUIT:return '水果'
    if word in VEGETABLE:return '蔬菜'
    if word in DAILY:return '生活用品'
    if word in DESCRIPTIONS:return '位置与描述'
    if word in SOCIAL:return '朋友与表达'
    if word in ACTIONS:return '动作与生活'
    if scene in {'sun','moon','rain','rainbow','flowers','tree','plant','bird','cat','dog'}:return '自然与生命'
    if scene=='friends':return '朋友与表达'
    return '动作与生活'
units=[]
for subject, rows in [('语文',CHINESE),('英语',ENGLISH)]:
    for index, line in enumerate(rows.splitlines()):
        parts=line.split('|')
        if subject=='语文':
            band,word,pinyin,meaning,before,after,scene=parts
        else:
            band,word,meaning,before,after,scene=parts;pinyin=''
        item=dict(subject=subject,level=1 if int(band)<=2 else 2 if int(band)<=4 else 3,word=word,
                  pinyin=pinyin,meaning=meaning,before=before,after=after,scene=scene,
                  category=category(word,scene),
                  language='zh-CN' if subject=='语文' else 'en-US')
        units.append(item)
extra_lines=[]
for name in ('reader-common-expansion.txt','reader-more-common.txt'):
    extra_lines.extend((ROOT/'content/questions/original'/name).read_text(encoding='utf-8').splitlines())
for line in extra_lines:
    if not line.strip() or line.startswith('#'):continue
    topic,level,zh,pinyin,meaning,en,zh_sentence,en_sentence,scene=line.split('|')
    for subject,word,sentence in [('语文',zh,zh_sentence),('英语',en,en_sentence)]:
        # A new English synonym can reuse an already taught Chinese concept.
        if subject=='语文' and any(i['subject']==subject and i['word']==word for i in units):continue
        before,after=sentence.split('{}')
        units.append(dict(subject=subject,level=int(level),word=word,pinyin=pinyin if subject=='语文' else '',meaning=meaning if subject=='语文' else zh,before=before,after=after,scene=scene,category=topic,language='zh-CN' if subject=='语文' else 'en-US'))
target=ROOT/'backend/seed_data/reader_lessons.json'
previous={(item['subject'],item['word']):item for item in json.loads(target.read_text(encoding='utf-8'))} if target.exists() else {}
next_id=max([5900000000]+[item['question_id'] for item in previous.values()])+1
assert len({(item['subject'],item['word']) for item in units})==len(units), 'Duplicate vocabulary'
confusions=json.loads((ROOT/'content/questions/original/reader-confusions.json').read_text(encoding='utf-8'))
for item in units:
    if item['subject']=='英语':
        letter_count=len(item['word'].replace(' ',''))
        item['level']=max(item['level'],3 if letter_count>9 else 2 if letter_count>5 else 1)
for item in units:
    old=previous.get((item['subject'],item['word']),{})
    if old:item['question_id']=old['question_id']
    else:item['question_id']=next_id;next_id+=1
    item['sentence']=item['before']+item['word']+item['after']
    if item['subject']=='英语':item['translation']=item['meaning']
    alternatives=list(confusions['words'].get(item['word'],[]))
    peers=sorted(units,key=lambda candidate:(candidate['level']>item['level'],-SequenceMatcher(None,item['word'],candidate['word']).ratio(),abs(len(candidate['word'])-len(item['word']))))
    for candidate in peers:
        if candidate['subject']==item['subject'] and candidate['category']==item['category'] and candidate['word']!=item['word'] and candidate['word'] not in alternatives:
            alternatives.append(candidate['word'])
    item['choice_words']=alternatives[:2]
    assert len(item['choice_words'])==2 and item['word'] not in item['choice_words']
    characters=[]
    if item['subject']=='语文':
        for character in item['word']:
            for group in confusions['characters']:
                if character in group:
                    characters.extend(c for c in group if c not in item['word'] and c not in characters)
    else:
        for character in item['word']:
            group=next((g for g in ('bpd','mn','il','uv','ae','cq','tf','sz','oau') if character in g),'')
            characters.extend(c for c in group if c not in item['word'] and c not in characters)
    item['extra_characters']=characters[:2]
    text=item['sentence'].lower()
    word=item['word']
    demo='discover'
    if item['scene'] in ('car','bus','train','plane','boat','bike'):demo='travel'
    elif item['scene'] in ('fish','duck'):demo='swim'
    elif item['scene']=='rain':demo='rain'
    elif item['scene']=='sleep':demo='sleep'
    elif item['scene']=='wash':demo='wash'
    elif item['scene']=='plant':demo='grow'
    if word in ('跳跃','jump','兔子','rabbit','坚持','practice'):demo='jump'
    if word in ('跑步','run','小马','horse'):demo='run'
    if word in ('踢','kick'):demo='kick'
    if word in ('喝','drink'):demo='drink'
    if word in ('吃','eat'):demo='eat'
    if word in ('推','push','门','door','打开','open'):demo='open'
    if word in ('关上','close'):demo='close'
    if item['scene']=='read' and word in ('打开','open'):demo='open-book'
    if item['scene']=='read' and word in ('关上','close'):demo='close-book'
    if word in ('拥抱','hug'):demo='hug'
    if 'share' in text or '分享' in text or '分给' in text:demo='share'
    if word in ('up','向上'):demo='up'
    if word in ('down','向下'):demo='down'
    if word in ('big','大的'):demo='big'
    if word in ('small','小的'):demo='small'
    if word in ('quiet','安静','倾听','listen'):demo='listen'
    if item['scene']=='bowl' and word in ('碗','bowl'):demo='fill-bowl'
    if item['scene'] in ('shirt','coat','pants','skirt','socks','shoes') and ('put on' in text or '穿' in text):demo='wear'
    if item['scene']=='hat':demo='wear-hat'
    item['demo']=demo
    if old.get('scene')==item['scene'] and old.get('scene_image'):
        item['scene_image']=old['scene_image']
    for field in ('word','sentence','translation'):
        if field in item and old.get(field)==item[field] and old.get(field+'_audio'):
            item[field+'_audio']=old[field+'_audio']
target.write_text(json.dumps(units,ensure_ascii=False,indent=2),encoding='utf-8')
print('Prepared',len(units),'original lessons;',dict((subject,sum(i['subject']==subject for i in units)) for subject in ('语文','英语')),'; no grade restrictions.')
