"""Add useful vocabulary notes and normalize a repeated correction, keeping card IDs stable."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'content/learning/poetry-cards.json'
NOTES={
 '明月几时有':[('婵娟','这里指美好的月亮。'),('绮户','有花纹装饰的门窗。')],
 '大江东去':[('公瑾','周瑜的字。'),('酹','把酒洒在地上，表示祭奠。')],
 '莫听穿林打叶声':[('芒鞋','草鞋。'),('料峭','形容风中带着寒意。')],
 '山下兰芽短浸溪':[('子规','杜鹃鸟。'),('黄鸡','这里借鸡鸣报时，说时光过去。')],
 '常记溪亭日暮':[('兴尽','游玩尽兴之后。'),('藕花','荷花。')],
 '昨夜雨疏风骤':[('骤','急，快。'),('绿肥红瘦','绿叶变得茂盛，红花却渐渐减少。')],
 '红藕香残玉簟秋':[('玉簟','光洁的竹席。'),('锦书','书信。')],
 '寻寻觅觅':[('将息','休养、调养。'),('黄花','菊花。')],
 '薄雾浓云愁永昼':[('永昼','漫长的白天。'),('暗香','淡淡的香气。')],
 '明月别枝惊鹊':[('社林','土地庙附近的树林。'),('忽见','忽然出现；见在这里同现。')],
 '茅檐低小':[('翁媪','年老的男子和女子。'),('亡赖','这里同无赖，是亲昵地说孩子顽皮可爱。')],
 '东风夜放花千树':[('元夕','农历正月十五的夜晚。'),('阑珊','稀疏、零落。')],
 '纤云弄巧':[('银汉','银河。'),('金风玉露','秋风和秋露。')],
 '怒发冲冠':[('等闲','随便、轻易。'),('朝天阙','回朝廷拜见皇帝。')],
 '寒蝉凄切':[('凝噎','喉咙哽住，说不出话。'),('经年','一年或多年。')],
 '去年元夜时':[('元夜','元宵节的夜晚。'),('花市','这里指节日里热闹的灯市。')],
 '一曲新词酒一杯':[('似曾相识','好像以前见过。'),('徘徊','来回慢慢地走。')],
 '驿外断桥边':[('驿','古时供传递公文的人换马、歇脚的地方。'),('一任','任凭。')],
 '国破山河在':[('烽火','这里指战争。'),('抵','相当于。')],
 '会当凌绝顶':[('会当','一定要。'),('凌','登上。')],
 '岱宗夫如何':[('岱宗','泰山的别称。'),('会当','一定要。')],
 '空山新雨后':[('浣女','洗衣服的女子。'),('秋暝','秋天的傍晚。')],
 '中岁颇好道':[('陲','边缘、旁边。'),('林叟','树林中遇见的老人。')],
 '少小离家老大回':[('乡音','家乡的口音。'),('鬓毛','耳旁的头发。')],
 '君问归期未有期':[('归期','回家的日期。'),('共剪西窗烛','相聚夜谈时，一起剪去烛花。')],
 '秦时明月汉时关':[('度','越过。'),('飞将','这里指英勇善战的将领。')],
 '千里莺啼绿映红':[('山郭','依山而建的城镇。'),('酒旗','酒家的招牌旗。')],
 '劝君莫惜金缕衣':[('金缕衣','用金线装饰的华美衣服。'),('堪','可以。')],
}

def main():
    cards=json.loads(PATH.read_text(encoding='utf-8'))
    for card in cards:
        card['paragraphs']=[p.replace('刬刬地东风','刬地东风') for p in card['paragraphs']]
        card['narration_text']=card['title']+'。'+card['author']+'。\n\n'+'\n\n'.join(card['paragraphs'])
        if card['subtitle'] in NOTES:
            card['explanation']['notes']=[dict(word=w,meaning=m) for w,m in NOTES[card['subtitle']]]
    PATH.write_text(json.dumps(cards,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Persist vocabulary notes in the source explanation files as well.
    by_slug={card['slug']:card for card in cards}
    for file in (ROOT/'content/learning').glob('poetry-explanations-*.json'):
        entries=json.loads(file.read_text(encoding='utf-8'))
        for entry in entries:entry['notes']=by_slug[entry['slug']]['explanation']['notes']
        file.write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Original meanings:',len(cards),'With vocabulary notes:',sum(bool(c['explanation']['notes']) for c in cards))

if __name__=='__main__':main()
