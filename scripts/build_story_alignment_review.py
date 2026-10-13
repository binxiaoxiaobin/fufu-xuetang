"""Build the reviewed scene plan from the immutable live-database snapshot."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/story-alignment-audit-20261010'
stories = json.loads((OUT / 'stories-before.json').read_text(encoding='utf-8'))
by_id = {s['id']: s for s in stories}
changes = {}

def revise(id, reason, text=None, order=None, scenes=None, source=None):
    s = by_id[id]
    changes[id] = {'id': id, 'slug': s['slug'], 'title': s['title'], 'reason': reason,
        'paragraphs': list(s['paragraphs']), 'paragraph_images': list(s['paragraph_images']),
        'text_pages': [], 'scenes': scenes or {}, 'source_note': source or s.get('source_note')}
    c = changes[id]
    for p, value in (text or {}).items():
        c['paragraphs'][p-1] = value
        c['text_pages'].append(p)
    if order:
        c['paragraph_images'] = [s['paragraph_images'][i-1] for i in order]
    for p in scenes or {}:
        c['paragraph_images'][p-1] = f"/assets/stories/{s['slug']}/p{p}-review-20261010.webp"

revise(5, '古代农家晚饭场景出现类似现代吊灯的照明。', scenes={3:'Ancient Chinese farmer in gray-brown robe eats a simple supper with family in humble home. Use ONE small traditional clay OIL LAMP on table with little flame. Absolutely NO dangling lightbulb, electric lamps, cords, sockets or modern items. Same family as reference, cozy period-appropriate scene.'})
revise(308, '第三至第五页文字已讲到后续情节，图片仍在盖房、吹草房、吹木房；按现有画面重新分段。', {
 2:'老大用稻草很快盖了一间草房，就跑出去玩了。老二用木头搭了一间木房，也急着去休息。他们觉得房子能住就够了，只有老三还在准备结实的砖块。',
 3:'老三一块一块地搬砖，仔仔细细地砌墙。他忙了很久，终于盖好一间结结实实的砖房，还检查了门窗和烟囱。两个哥哥早已休息了，他却没有省掉任何一步。',
 4:'大灰狼来到老大的草房前，鼓起腮帮子使劲吹。呼——稻草飞得满天都是，草房一下子倒了！老大吓得拔腿就跑，赶紧躲进老二的木房。',
 5:'大灰狼追到木房前，又吹又撞，木板也散开了。两只小猪这才知道，盖得快不等于盖得牢。他们一起跑向老三的砖房，老三连忙开门，让哥哥们进来。',
 6:'大灰狼怎么吹，砖房都纹丝不动。他想从烟囱爬进去，却掉进了炉灶上的热水锅，烫得夹着尾巴逃走了。哥哥们又惭愧又佩服，明白了认真做事、打牢基础，才能经得起考验。'})
revise(304, '假织布出现真布；试衣与游行仍穿礼服，破坏“新衣不存在”的核心情节。', scenes={
 2:'Two adult swindlers mime weaving with EMPTY hands on a completely EMPTY wooden loom with NO THREAD OR FABRIC; elderly purple-robed minister pretends to admire it. Palace. No emperor.',
 3:'Same round adult emperor in red crown with blond-white curls and white moustache stands at mirror, bare chest and legs, simple white modest underwear only. Two dressed swindlers pretend to dress him with EMPTY HANDS. Mirror shows the identical undressed body. NO robe, cape, shirt or fabric on king.',
 4:'Same emperor walks in outdoor parade in crown and plain white modest shorts ONLY, bare chest and legs. Fully dressed crowds force smiles and applaud the nonexistent new clothes. NO cape, robe, shirt, trousers on king. No child announcement yet.',
 5:'Same undressed crowned emperor in parade, bare chest and legs, plain white modest shorts ONLY. Brown-haired child in blue vest, white shirt and purple trousers points at him and speaks truth; crowd begins surprised whispering. NO cape or royal clothes on king.',
 6:'After the truth, same undressed crowned king walks embarrassed in middle background, bare chest and legs, plain white modest shorts ONLY. Foreground the same blue-vest child talks honestly with his listening mother, crowd no longer pretends. NO cape or royal clothes on king.'})
revise(6, '添足中的过程图与已经添足的结果图颠倒。', order=[1,2,4,3,5,6])
revise(8, '大象上船提前出现；称石头时大象还在船上，无法完成等重替代。', {
 3:'年纪还小的曹冲认真观察大象和河边的船，想出了一个办法。他请人先把大象牵上船，船身果然往下沉了。曹冲让大家在船身碰到水面的位置做下记号，记住大象在船上时船沉到了哪里。',
 4:'接着，大家把大象牵回岸上，再一块块把石头搬上船，直到水面重新到达刚才的记号。船上这一次只有石头，没有大象；船身两次沉到同一位置，就可以用这些石头的总重量来代替大象的重量。'}, scenes={4:'Ancient China riverbank weighing experiment. Elephant stands COMPLETELY ASHORE in background. Wooden boat contains ONLY rocks, NO elephant. Workers add stones, young Cao Chong points to clear waterline mark on outside hull at water surface. Emphasize substitution, physically plausible.'})
revise(7, '砸缸用石头比例过大，不像孩子能握住的工具。', scenes={4:'Same little Sima Guang uses a manageable stone held in two hands, about the size of two fists, to strike low side of large pottery water vat. Small cracked hole releases water onto ground; trapped child visible safe inside. Friends call adults in background. No giant boulder, no flying child, no injuries.'})
revise(9, '射日阶段只剩一个太阳，却仍对它射箭，与留下最后一个太阳矛盾。', scenes={3:'Mythic adult archer Hou Yi aims bow upward during the MIDDLE of shooting extra suns. FOUR separated suns remain in sky, arrow heads toward one extra sun on right, other suns untouched. Heat and dry landscape. Clearly not shooting the very last sun.'})
revise(185, '结尾狐狸突然穿上衣服，和前页自然动物形象不连续。', scenes={6:'Same natural red fox and same striped tiger in forest at sunset, fox with clever cautious expression, tiger realizes he was tricked. Both normal un clothed woodland animals, NO green jacket or human clothes, same proportions as reference.'})
revise(186, '第三页青蛙已出井看海，后面却仍困在井中。', scenes={3:'Frog stays INSIDE stone well on inner ledge. Sea turtle perches on rim describing vast ocean to frog. Small soft-edged imagined ocean vignette above turtle, clearly a thought/description not a real nearby sea. Frog never leaves well in this scene.'})
revise(187, '两只手捂耳又敲钟，动作需要第三只手。', {4:'他一只手紧紧捂住一边耳朵，另一只手举起锤子去敲钟。“当——”钟声响了起来！他顾着骗自己，却忘了别人仍然听得见，也忘了另一只耳朵根本没有被捂住。'})
revise(189, '结尾出现真实小龙和儿童，而主人公其实只喜欢画中的龙。', scenes={6:'Same adult Lord Ye in gray ancient robe inside his room looks thoughtfully at a FLAT ink dragon painting mounted on wall. The REAL dragon has already left, no living dragon anywhere. Same adult protagonist, NO replacement child.'})
revise(190, '开头说手持矛盾，画面实际是摊位陈列。', {1:'古时候，有个卖兵器的人在集市上摆了一个摊。他把矛和盾陈列好，站在摊前大声招呼过路的人，希望大家来买。'})
revise(191, '画龙却在画人物肖像；四龙变成三龙；结尾画中龙又变成活物。', scenes={
 3:'Ancient painter Zhang Sengyou talking with curious visitors before temple wall bearing EXACTLY FOUR FLAT painted dragons. ALL have blank eyes with no pupils. No human portrait painting. Painter explains why he has not dotted the pupils yet.',
 4:'Temple wall has EXACTLY FOUR ink-painted dragons. Painter on stable low ladder carefully dots pupils of TWO dragons with brush. Other TWO dragons have visibly BLANK eyes. Storm clouds begin gathering above. No extra dragon, no portrait.',
 6:'After two dragons have flown away, temple wall retains exactly TWO FLAT painted dragons with blank pupil-less eyes. Painter and visitors stand thoughtfully below. No living dragon hovering over people; keep mural flat on wall.'})
revise(194, '手杖变桃林在文字中早了一页。', {4:'可是半路上，夸父实在太渴了，再也支撑不住，扑通一声倒在路上。那根陪伴他翻山越岭的手杖，也从手中落到了地上。',5:'传说，夸父留下的手杖后来化成了一片郁郁葱葱的桃林，为后来的人遮阴、提供果实。人们望着桃林，记住了这个敢于追赶太阳的巨人。'})
revise(195, '结尾画庙宇，文字的关键结果却是移山后道路畅通。', scenes={6:'Elderly Yugong with white beard and family walk through a wide OPEN unobstructed path in ancient green countryside where two mountains used to block passage. Express practical relief and cooperation. No temple, no statues, no worship scene.'})
revise(196, '让梨时孩子捧着最大的梨，和让出大梨的情节相反。', scenes={2:'Same little Kong Rong in gray ancient robe chooses the SMALLEST pear in one hand at family table. Several MUCH LARGER pears remain clearly on plate for older siblings. Friendly parents observe. Make size contrast unambiguous; no oversized pear in his hands.'})
revise(197, '求学时李白已经成人，提问时又突然长出胡须。', scenes={
 1:'Same young Li Bai BOY in plain gray ancient robe and black topknot, no beard, slips away from old schoolroom carrying book, playful distracted expression. Clearly a child, not adult.',
 4:'Same young gray-robed Li Bai BOY with black topknot and NO beard asks white-haired old woman beside stream why she is rubbing thick iron bar against stone. Old woman explains patiently. Consistent boy identity.'})
revise(198, '两个青年朋友变成三个孩子；后续练剑年龄不连续。', scenes={
 2:'Exactly TWO young ADULT scholar friends in plain gray ancient robes wake at rooster crow before dawn in modest room, looking determined. No third person, no small children. Match two adults in subsequent sword practice.',
 4:'Exactly TWO same young adult gray-robed friends practice sword movements safely in ancient sheltered courtyard beside winter snow, disciplined focus. No children, no modern objects.',
 6:'Exactly TWO same young ADULT gray-robed friends practice controlled sword forms in dawn courtyard, mutual encouragement, consistent adult identities. No children or extra characters.'})
revise(199, '点不起灯的开头却有亮灯；凿壁引光画成白天窗光。', scenes={
 1:'Same poor young Kuang Heng boy at book desk in DIM night room, EMPTY unlit oil lamp, no candle or other functioning light, moon faint outside. He wants to read but cannot afford lamp oil.',
 3:'Night scene in poor ancient home, young boy widens SMALL gap in shared plaster wall, warm narrow beam from NEIGHBOR candle through gap falls on book. No daylight window beam, no lit candle in boy own room.'})
revise(200, '冒充吹竽的大人被画成了向国王请教的小孩。', scenes={2:'Same portly ADULT Nan Guo with short dark beard and gray robe seen in later panels confidently boasts to king in ancient palace, holding sheng wind instrument. King listens. No child in his place.'})
revise(201, '古代街道出现自行车；爬回家在文字中早了一页。', {4:'他试着按原来的走法迈步，可脚底下完全不知道该怎么动了。少年站在街上，又羞又急，越想模仿别人，越不敢迈出自己的步子。',5:'最后，他只好趴到地上，爬着往家走。路上的人看见了都很奇怪。少年这才明白，只顾照搬别人的样子，竟把自己原本会的走法也丢了。'}, scenes={4:'Same anxious young ancient Chinese boy stops confused in traditional cobbled street, unable to decide how to step. People in ancient robes walk normally nearby. NO bicycles, cars, electricity, modern clothes or other modern objects.'})
revise(202, '古琴画成琵琶，结尾黄牛变成灰牛。', scenes={
 3:'Same ancient gray-robed adult musician seated on mat plays a FLAT long seven-string GUQIN laid horizontally on low stand, no upright pipa. Same brown cow calmly grazes close by ignoring melody.',
 6:'Same ancient gray-robed musician and same BROWN cow in quiet meadow, horizontal seven-string guqin on low stand. Reflective friendly composition. No gray cow, no pipa, no modern instrument.'})
revise(203, '病床、酒杯、指弓与再饮的图片顺序错位；探病与回到座位混为一句。', {3:'请客的人听说朋友病了，先去问清事情的经过，再回到自己家。他坐在朋友上次坐的位置上，倒了一杯酒，仔细一看——杯里果然有一条弯弯的小蛇影子！'}, order=[1,3,2,5,4,6])
revise(301, '丑小鸭在冬季变回黄色鸭子；变成天鹅后仍是小黄鸭或灰雏鸟。', scenes={
 3:'Snowy winter, kind elderly farmer gently lifts a weak GRAY swan juvenile with dark beak from frozen pond edge to rescue it. The ugly duckling is gray, NEVER yellow. Warm compassion, no harm.',
 4:'Spring pond, the SAME former gray bird has now grown into a graceful WHITE adult swan with long curved neck, bending to see its own identical WHITE SWAN reflection. No yellow duck, no separate swan in reflection.',
 5:'Same grown WHITE long-necked swan joins a welcoming group of WHITE adult swans on spring pond, children quietly watch from bank. Central protagonist also WHITE, no gray chick, no yellow duck.'})
revise(302, '小红帽未被吞下却从狼肚中获救；救援图在屋外且有不必要的伤口细节。', {
 1:'从前有个小女孩，总戴一顶外婆送的红丝绒帽子，大家都叫她小红帽。一天妈妈说：“外婆生病了，你把这块蛋糕和一瓶果汁送去，路上要走大路，不要离开小路。”小红帽点点头出发了。',
 5:'“外婆，你的嘴巴怎么这么大呀？”“为了更好地吃掉你呀！”大灰狼猛地跳起来，把小红帽也吞进了肚子，随后躺下睡着了。经过的猎人发现异常，救出了外婆和小红帽。两个人都平平安安，终于可以拥抱在一起。',
 6:'外婆喝了果汁，吃了蛋糕，慢慢恢复了精神。小红帽记住了教训：按约定走安全的路，不随便告诉陌生人自己的去处；感到不对劲时，要赶快向可信的大人求助。'}, scenes={5:'Inside grandmother cottage, AFTER rescue: same girl with red hood and blue dress hugs white-haired grandmother in blue apron; kind clothed hunter stands nearby. Wolf lies asleep far background on bed, fully intact fur, NO wound, blood, incision, scissors, exposed anatomy. Safe relieved reunion, indoors not forest.'})
revise(303, '睡觉与结尾的兔子变成白兔；乌龟到终点提前了一页。', {4:'兔子得意地想：“乌龟走得这么慢，我睡一觉再跑也来得及。”它在树下躺下来，很快睡着了。乌龟经过树旁，没有停下来，仍然一步一步向终点走去。',5:'乌龟坚持走到终点，大家围过来为它欢呼。兔子醒来后拼命往前跑，可它赶到时，乌龟已经赢了。兔子这才明白，只凭跑得快，却不认真比赛，也会输。'}, scenes={
 4:'Same BROWN rabbit in BLUE jacket sleeps naturally beneath tree beside race path. Same green turtle steadily passes heading toward distant finish. No white rabbit, no giant detached head, no finish arrival yet.',
 6:'Same BROWN rabbit in BLUE jacket sincerely offers flower wreath to same green turtle after race, friendly woodland animals nearby. Rabbit accepts lesson. No white rabbit, consistent characters.'})
revise(305, '继母阻拦图成了宫外三位姑娘；礼服颜色不一致；逃离图误用于试鞋。', {3:'灰姑娘难过地哭了。一位仙女出现，用魔法把南瓜变成马车，把老鼠变成仆人，把她的破衣裳变成闪着银光的蓝色礼服，还给她一双水晶鞋。仙女提醒她：“十二点前一定要离开，魔法到时就会消失。”'}, order=[1,2,3,5,5,6], scenes={
 2:'Inside humble cottage kitchen, Cinderella in ragged plain gray work dress asks to attend ball; stern stepmother blocks her. EXACTLY TWO stepsisters in fancy dresses prepare to leave. No third sister, no palace background. Cinderella same brown hair as reference.',
 5:'Inside Cinderella humble cottage, prince kneels to fit transparent GLASS slipper on same brown-haired Cinderella in simple ragged gray work dress after magic expired. It fits perfectly. Stepmother and exactly two stepsisters watch surprised. No staircase escape, no blue ball gown on Cinderella.'}, source='欧洲《灰姑娘》童话的儿童改写版，本篇采用仙女、南瓜马车和水晶鞋的版本。')
revise(306, '幻想画成真实暖屋；女孩衣着变化；烤鹅画成活鸟；结尾不应暗示死去女孩复活。', scenes={
 2:'Same poor match girl from first reference panel, shabby blue-gray dress and red head scarf, sits in snowy cold street striking one match. ABOVE her a clearly translucent soft dream vignette of warm iron stove. Girl physically remains OUTSIDE in cold, never inside warm room. No magical new dress.',
 3:'Same shabby blue-gray dress red head-scarf match girl OUTSIDE on snowy street, match glow creates clearly imaginary soft dream of a ROASTED cooked goose on festive platter and Christmas tree. Goose clearly cooked food, not live bird or flames burning a bird. Same girl identity.',
 4:'Same shabby blue-gray red-head-scarf match girl in snowy street surrounded by fading match glow, gentle translucent VISION of smiling white-haired grandmother offering embrace above her. Dreamlike soft edges, not literal woman standing there. No bonfire or new dress.',
 5:'Quiet snowy dawn street: same match girl rests motionless with closed eyes under modest thin shawl, red head scarf and shabby blue-gray dress, spent matches and basket beside her. Passersby notice sadly. Non-graphic, peaceful, no angel, no flying grandmother, no resurrection.',
 6:'Reflective illustration in same wintry town: adults open doorway to offer warm blanket and food to a DIFFERENT poor child in brown clothes. Show compassion as lesson, not the dead match girl alive again. No red scarf girl resurrected. Warm watercolor.'})
revise(307, '第四页突然换成现代条纹服；第五页说已下山而图片仍在山上；结尾绝对化“失去所有帮助”。', {5:'狼叼走了羊，远处只剩它逃走的背影。男孩站在山坡上哭了，后悔极了。他明白了，自己一次次假装遇险，让村民们再也分不清哪次求救是真的。',6:'男孩向村里的长者承认了错误。长者告诉他：“信任要靠诚实一点点建立，做错了要道歉，也要用行动改正。”男孩决定不再拿求救开玩笑；遇到真的危险，仍要尽力寻找安全的帮助。'}, scenes={4:'Same shepherd boy as early panels wears WHITE shirt, BLUE vest and BROWN shorts, frightened as gray wolf emerges from forest toward sheep. He shouts toward distant village. No modern striped T-shirt, same boy clothes and face.'})
revise(309, '收留、伪装、苏醒各提前一页；苹果有毒的半边文字前后矛盾；王后未伪装。', {
 2:'王后命令猎人把白雪公主带到森林里，猎人不忍伤害她，放她离开。公主走了很久，找到一座小屋。七个小矮人听了她的遭遇，愿意让她在这里暂住，她终于遇到了可以帮助自己的朋友。',
 3:'白雪公主和七个小矮人一起吃饭，慢慢熟悉了这个温暖的家。大家分工照顾小屋，还提醒她：独自在家时，要谨慎对待陌生人的邀请和礼物。公主很感激这些好心的朋友。',
 4:'王后从魔镜里知道公主还活着，便扮成老婆婆，带着毒苹果来到小屋前。她自己咬了无毒的白色一半，再把有毒的红色一半递给公主。公主放松了警惕，咬下一口，立刻倒下了。',
 5:'小矮人们伤心极了，把公主安放在透明的水晶棺里，守在旁边。一位王子经过，听说了她的遭遇，想把她带到能得到帮助的地方。大家小心地抬起了棺材。',
 6:'搬动时，棺材轻轻一晃，卡在公主喉咙里的苹果块掉了出来。她慢慢睁开眼睛，朋友们又惊又喜。后来，公主开始了平安的新生活。善意值得珍惜，也要学会辨别伪装，不随便接受陌生人的食物。'}, scenes={4:'Same black-haired Snow White with red ribbon and blue-yellow dress at cottage doorway. Queen is DISGUISED as a wrinkled OLD fruit vendor in plain hooded brown cloak, absolutely NO crown or royal gown. Old vendor offers RED half of apple, holds safe pale half for herself. Basket nearby, no gore.'})
revise(310, '老渔夫变成壮年男子；失去宫殿的结果页仍是海上风暴。', scenes={
 2:'Same ELDERLY fisherman from first panel: white beard, straw hat, white shirt, blue-gray vest, rolled blue trousers, barefoot. He talks with elderly wife beside broken wooden washbasin at poor hut. No young brown-bearded man.',
 3:'Same white-bearded ELDERLY fisherman straw hat white shirt blue-gray vest rolled blue trousers stands on shore asking tiny golden fish in water for wife wishes. He remains poor fisherman, no young man, no royal clothes.',
 4:'Elderly wife in ornate blue-gold queen dress sits proudly on palace throne, demands more. Same white-bearded ELDERLY fisherman straw hat humble white shirt blue-gray vest stands worried before her. No young king, no matching royal robe on fisherman.',
 5:'Magic palace has vanished. Same white-bearded elderly fisherman in straw hat and humble blue-gray vest and elderly wife in simple worn dress stand before their ORIGINAL poor hut and BROKEN wooden washbasin, shocked and regretful. No royal clothes, no ocean storm focal scene.',
 6:'Reflective ending: SAME white-bearded elderly fisherman in straw hat white shirt blue-gray vest and elderly wife in simple worn clothes quietly mend fishing net outside modest hut beside broken wooden washbasin, learning contentment. No young man, no crown, no palace.'})
revise(312, '正文残留英文；岳母刺字应明确为流传的故事，不能把传说细节当作确证史实。', {2:'岳飞的母亲是一位深明大义的妇人。她把岳飞叫到跟前，说：“国家有难，你应当去从军，保护百姓。”',3:'流传的故事里，岳母在岳飞背上刺下“精忠报国”四个字，勉励他牢记责任。岳飞记住了母亲的教诲，决心尽力保卫家国。'}, source='南宋岳飞生平与岳母刺字传说的儿童改写；刺字细节按民间流传版本讲述。')
revise(313, '从幼年直接跳到成年，文字没有交代时间。', {2:'长大以后，王羲之仍然坚持练字。他每天写呀写，用完许多纸，还在木板上反复练习。用过的笔砚都要清洗，练得越多，他对笔画和字形就越熟悉。'})
revise(314, '向树洞注水却把球画在树外，浮力取球的动作不成立。', scenes={5:'Ancient children recover ball by POURING WATER INSIDE hollow upright tree trunk with CLOSED watertight bottom. Small ball floats ON water surface INSIDE opening and rises to reachable rim. One child pours from small bucket directly into hole, another reaches toward floating ball. No ball on ground, no pouring water on outer bark.'})
revise(315, '盘古身躯化天地时仍活着用手举日月。', scenes={5:'Mythic poetic transformation AFTER Pangu rests: giant gentle adult silhouette dissolves seamlessly into mountains and rivers, breath becomes cloud, hair becomes forest, sun and moon appear independently in sky. NO living giant holding sun or moon in hands. Landscape is protagonist, no gore.'})
revise(317, '嫦娥已经奔月，后羿祭月时地面却仍有嫦娥。', scenes={5:'Hou Yi ALONE on Earth outside rustic home at night, offering fruit on small table and looking longingly at full moon. Chang E appears ONLY as delicate silhouette INSIDE distant moon. No woman standing beside Hou Yi on ground. Clear earth-moon separation.'})
revise(318, '神农从牛角形象变普通老人；神话、茶解毒和后世医药著作被混作事实。', {
 1:'上古神话里，人们还不懂得分辨山野中的许多植物，也没有积累起丰富的医药知识。传说神农看到人们生活艰难，便想帮助大家了解草木的用途。',
 3:'传说神农带着一根神鞭走遍山野，仔细观察不同的草木，把发现一一记下来。这些神奇的情节，表达了古人对探索自然、积累知识的想象。',
 4:'有一段传说讲，神农尝过草木后，偶然遇到茶叶，身体又恢复了精神。故事把茶和神农联系在一起；但这是神话里的说法，并不是说现实中的茶能解除各种毒。',
 6:'神农尝百草的传说，寄托了人们对医药知识先行者的敬意。后世医药著作凝结了许多代人的经验，不能说都是神农亲手留下的。我们可以学习观察与求知的精神，但绝不要模仿故事去尝不认识的野草。'}, scenes={
 3:'Same mythical Shen Nong from second reference panel, gentle robust adult with small OX HORNS and brown primitive leather tunic, examines plants carefully carrying red mythical whip. Same identity, not ordinary gray-bearded robe scholar.',
 4:'Same ox-horned Shen Nong brown leather tunic rests under tree studying fresh green tea leaves in mythic mountains, calmer expression. Keep horns and primitive costume, no scholar hat or Chinese later dynasty robe, no cup claiming real poison cure.',
 5:'Same ox-horned Shen Nong in brown primitive tunic lies exhausted beside a small pink-flowered plant, symbolic pale sunset, one hand near his notes. Peaceful non-graphic mythic farewell, no wounds. Same horns and costume.',
 6:'Symbolic tribute: same ox-horned Shen Nong figure in brown primitive tunic appears as translucent distant MYTH illustration above landscape. Foreground later generations study plants and books carefully without eating them. Clearly memory and knowledge across ages, not resurrected character.'})
revise(331, '成年任官的黄香仍画成小孩子。', scenes={5:'GROWN ADULT Huang Xiang in restrained traditional official robe and official hat with mature face serves people respectfully in ancient office. Adult proportions, no child official. Subtle familiar black hair from childhood, age progression clear.'})
revise(332, '风雪中两个求学者衣服变色，积雪深度与等候情节不符。', scenes={
 4:'Same TWO adult scholars, one GREEN robe and one BLUE robe, wait respectfully outside teacher closed wooden door in falling snow, discussing quietly. No yellow robe, same identities as first waiting scene.',
 5:'Same TWO adult scholars GREEN and BLUE robes have waited as snow accumulated deep around lower legs; elderly teacher opens door surprised, welcomes them. No replacement children, show noticeably deeper snow than earlier page.'})
revise(333, '无钱点灯却有灯；冬夜屋内亮灯；夏天萤火虫出现在雪地。', {5:'车胤借萤火虫的微光读书，是夏夜的故事；孙康借白雪映出的光读书，是冬夜的故事。他们生活在不同的地方，都珍惜学习的机会。这些刻苦求学的往事后来被人们一起传诵。'}, scenes={
 1:'Poor ancient boy Che Yin wants to read at night in modest dark room, oil lamp EMPTY AND UNLIT. No candle or fire, faint cool moonlight only, book hard to see.',
 4:'Different ancient boy Sun Kang wears warm coat and reads OUTSIDE by snowy ground reflecting moonlight in winter. Behind him house windows completely DARK, no functioning lamps or candles. Calm moonlit snowy setting.',
 5:'Single illustration with TWO CLEAR SEPARATE soft-edged vignettes: LEFT summer night Che Yin reads by small translucent firefly cloth bag, green plants NO snow; RIGHT winter night Sun Kang in coat reads beside moonlit snow, NO fireflies. Different children and different seasons, not same physical scene.'})
revise(334, '结尾合作的两位成年人变成男女儿童。', scenes={6:'Same TWO ADULT MEN: older bearded general Lian Po in muted armor and mature scholar Lin Xiangru in traditional robe walk together through ancient city discussing affairs respectfully. Reconciled peers, no young romantic couple, no children.'})
revise(335, '尝胆、耕作和胜利均在文字中先于对应图片。', {
 3:'回国后，勾践不再睡舒服的褥子，而把硬硬的柴草铺在床上。他希望自己即使休息时，也不会忘记曾经的失败和要重新振作的决心。',
 4:'他还把一只苦胆挂在屋里，每次吃饭前先尝一尝那苦涩的滋味。他问自己：“你忘记了在吴国受过的屈辱吗？”这份提醒让他不敢松懈，开始认真谋划怎样让越国恢复力量。',
 5:'勾践亲自下田耕种，夫人亲自织布，与百姓一起劳动。他们长期积蓄粮食，改善生活，训练军队。经过多年的努力，越国慢慢从战败后的困境中强大起来。',
 6:'后来，勾践率领军队打败了吴国。这个故事让人想到，面对失败，光有决心还不够，也要耐心地落实到每天的行动里。珍惜机会、不断改进，才可能走出困境。'})
revise(337, '威胁、莲花重生、再次战斗图顺序错误；结尾应对应新的身体和保护百姓。', {
 4:'老龙王大怒，要用海水淹没陈塘关。哪吒不愿百姓和父母受连累，挺身面对龙王。传说中，他付出了沉重的代价，失去了原来的身体。海边的人们都为他难过。',
 5:'太乙真人想办法帮助哪吒，用莲花和莲藕重新塑造他的身体。花瓣展开，哪吒又有了新的生命，也得到了风火轮和火尖枪，可以重新站起来面对困难。',
 6:'哪吒脚踏风火轮，手持火尖枪，带着新的本领面对龙王，保护陈塘关的人们。故事里的神奇本领属于传说；它让我们想一想，真正的勇敢应当用来保护别人，也要认真面对自己行为的后果。'}, order=[1,2,3,5,6,4])
revise(338, '把偷藏衣服迫使成婚写成正向行为，儿童改写改为归还与自愿相识。', {
 2:'一天，老牛突然开口说话了。它告诉牛郎：“明天黄昏，会有仙女来到山那边的湖畔。若你遇见她们，要以礼相待，不打扰别人，也不要拿走别人的东西。”',
 3:'牛郎来到湖畔，发现一件被风吹落的粉红纱衣。他捡起纱衣，站在远处出声询问是谁遗失的。织女听见后走来，牛郎把衣服好好还给她，两人才开始交谈。',
 4:'织女感谢牛郎尊重和帮助自己。相识后，两人渐渐了解对方，彼此欣赏勤劳和善良。后来，织女自愿留在人间，和牛郎结为夫妻，生了一儿一女，一起照顾他们温暖的小家。'}, source='牛郎织女民间传说的儿童改写；相识部分采用尊重他人、自愿交往的温和版本。')
revise(339, '八仙人数不对；过海提前；纸驴重复；龙王冲突未表现却提前讲完。', {
 3:'吕洞宾提议：“咱们不驾云，各自用自己的宝贝渡海，怎么样？”大家都觉得有意思。铁拐李先踏上铁拐，汉钟离坐上扇子，吕洞宾踩着宝剑，先向海面出发。',
 4:'何仙姑站上莲花，张果老倒骑纸驴，蓝采和踏着花篮，韩湘子乘着横笛，曹国舅借助玉板。其余五位神仙也各展本领，跟了上去。八位神仙用不同的办法，朝同一个方向渡海。',
 5:'海上的热闹惊动了东海龙王。龙王的儿子抢走蓝采和的花篮，神仙们不肯让同伴吃亏，纷纷施展法宝。海面翻起浪花，双方争执不下。',
 6:'观音菩萨出面劝解，龙王一方归还花篮，八仙也收起法宝，终于平安到达岸边。人们说“八仙过海，各显神通”，就是比喻各自发挥长处；遇到分歧，也应设法化解，齐心把事情办好。'}, scenes={
 1:'Portrait scene of EXACTLY EIGHT Chinese immortals together on seashore, no crowd extras: old lame Li with iron crutch/gourd; portly Zhongli fan; old Zhang ONE paper donkey; adult Lu sword; ONE female He lotus; Lan flower basket; young Han flute; mature Cao jade tablet. Eight heads total, traditional robes, no modern items.',
 2:'EXACTLY EIGHT same distinct Chinese immortals arrive at rocky SHORE after peach banquet, all still standing on LAND contemplating crossing, hold their eight identifiable tools. NONE already sailing or floating across sea. One donkey only.',
 4:'Exactly FIVE remaining immortals crossing blue sea: female He Xiangu on LOTUS, old Zhang Guolao riding ONE paper donkey BACKWARDS, Lan Caihe on flower BASKET, Han Xiangzi on FLUTE, Cao Guojiu on JADE BOARD. Five figures, no duplicated donkey, do not add first three already shown on previous page.',
 5:'Mythical sea prince emerges from waves holding STOLEN flower basket while angry immortals face him with magical tools, swirling waves. No wounds or weapons piercing bodies. The basket theft and confrontation are key, no peaceful ordinary sea crossing.'})
revise(340, '发现火之前洞穴已经有篝火；钻木者变成后世服饰的孩子。', scenes={
 1:'Prehistoric people in rough animal hide clothing huddle in DARK cold cave before discovery of fire, raw food and stone tools nearby. NO flames, embers, campfire, torch, stove or functioning light. Faint dawn at entrance.',
 4:'Same prehistoric young ADULT in primitive leather hide clothing from earlier discovery scene spins wooden spindle between hands on wooden hearth board, tiny smoking EMBER begins in tinder. Stone age forest, no blue Han dynasty robe, no modern drill, no metal tools.'})
revise(342, '神笔画鸟仍停留在纸面；结尾人物坐风筝飞走，与画风脱身不符。', scenes={
 3:'Same blue-clothed young Ma Liang with GOLD brush draws small bird on paper and bird visibly becomes ALIVE, flying up from page with soft magical glow. Partly finished painted silhouette and real emerging bird show transition. Not merely flat bird picture.',
 6:'Same blue-clothed boy Ma Liang RUNS AWAY ON GROUND holding gold brush while freshly drawn magical gust pushes corrupt magistrate and guards backward, fluttering robes and hats. Nobody flies on kite or rides paper vehicle, no giant kite, no airborne dignitary. Lively but plausible cartoon motion.'})

records = []
jobs = []
for s in stories:
    c = changes.get(s['id'])
    records.append(c or {'id':s['id'], 'slug':s['slug'], 'title':s['title'], 'reason':'逐页核对后，主要场景与段落对应，未发现需要改变情节或重画的实质错位。', 'text_pages':[], 'scenes':{}})
    if c:
        for p, scene in c['scenes'].items():
            sheet = next(OUT.glob(f"{s['id']:03}-{s['slug']}.jpg"))
            jobs.append({'key':f"{s['id']}-{p}", 'id':s['id'], 'page':p, 'slug':s['slug'], 'reference':str(sheet), 'scene':scene, 'target':c['paragraph_images'][p-1]})
plan = {'date':'2026-10-10','story_count':len(stories),'page_count':sum(len(s['paragraphs']) for s in stories), 'stories':records,'jobs':jobs}
target = ROOT/'content/stories/reviews/alignment-20261010.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'stories':len(stories),'changed':len(changes),'redraws':len(jobs),'texts':sum(len(c['text_pages']) for c in changes.values())}))
