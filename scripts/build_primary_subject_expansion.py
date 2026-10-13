"""Build original English/science practice candidates; JSON is for DB import only."""
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "content/questions/original"
OUTPUT = DATA_DIR / "primary-subject-expansion.json"
DATASET = "primary-subject-expansion-20261005"
GRADES = ("一年级", "二年级", "三年级", "四年级", "五年级", "六年级")


def choose(correct, distractors, seed, size=4):
    pool = list(dict.fromkeys(str(x) for x in distractors if str(x) != correct))
    rng = random.Random(int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16))
    rng.shuffle(pool)
    if len(pool) < size - 1:
        raise ValueError("Not enough distinct distractors: " + seed)
    values = [correct] + pool[:size - 1]
    rng.shuffle(values)
    options = [{"key": chr(65 + i), "text": text} for i, text in enumerate(values)]
    answer = next(o["key"] for o in options if o["text"] == correct)
    return options, answer


def question(subject, grade, identity, topic, prompt, correct, distractors,
             explanation, hint, *, kind="recognition", difficulty="easy", size=4):
    record_id = "subject-expansion-{}-{}-{}".format("en" if subject == "英语" else "sci", GRADES.index(grade) + 1, identity)
    options, answer = choose(correct, distractors, record_id, size)
    return dict(
        source_record_id=record_id, source_name="福福学堂原创·小学学科练习补充",
        source_license="福福学堂原创", source_url="",
        source_attribution="原创题干、选项与解析；用于学科分类练习，不作为某版教材的同步原题。",
        source_metadata={"dataset": DATASET, "concept_id": identity.rsplit("-", 1)[0], "exercise_kind": kind},
        subject=subject, stage="小学", grade=grade, title=topic + " · " + ("辨析" if kind == "judgement" else "练习"),
        knowledge_point=topic, difficulty=difficulty, question_type="single_choice",
        prompt=prompt, options=options, answer=answer, hint=hint, explanation=explanation,
    )


def starter_questions():
    vocabulary = []
    for line in (DATA_DIR / "primary-english-starters.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        topic, word, meaning, sentence, translation = line.split("|")
        assert sentence.count("____") == 1, word
        vocabulary.append((topic, word, meaning, sentence, translation))
    assert len(vocabulary) >= 125
    assert len({v[1] for v in vocabulary}) == len(vocabulary)
    rows = []
    for grade in GRADES[:2]:
        for topic, word, meaning, sentence, translation in vocabulary:
            same = [v for v in vocabulary if v[0] == topic and v[1] != word]
            alternatives = same if len(same) >= 3 else [v for v in vocabulary if v[1] != word]
            base = "starter-" + word
            category = "英语启蒙·" + topic
            rows.append(question("英语", grade, base + "-meaning", category,
                "单词“{}”表示什么？".format(word), meaning, [v[2] for v in alternatives],
                "{} 表示“{}”。例如：{}（{}）".format(word, meaning, sentence.replace("____", word), translation),
                "先认读这个单词，再联系生活中的意思。", kind="word_meaning"))
            recall = question("英语", grade, base + "-word", category,
                "想用英语表达“{}”，应该选哪个单词？".format(meaning), word, [v[1] for v in alternatives],
                "“{}”对应 {}。".format(meaning, word),
                "比较几个单词各自的意思。", kind="word_recall")
            meanings = {v[1]: v[2] for v in vocabulary}
            recall["explanation"] += "其他选项：" + "；".join(
                o["text"] + " 表示“" + meanings[o["text"]] + "”"
                for o in recall["options"] if o["text"] != word) + "。"
            rows.append(recall)
            misspellings = [word[:1] + word, word[:-1], word + word[-1], word[1:] + word[:1]]
            rows.append(question("英语", grade, base + "-spelling", category,
                "表示“{}”的英语单词，哪一个拼写正确？".format(meaning), word, misspellings,
                "正确拼写是 {}，字母顺序为 {}。它表示“{}”。".format(word, "－".join(word), meaning),
                "注意有没有多写、少写字母，或把字母顺序写反。", kind="spelling"))
            rows.append(question("英语", grade, base + "-context", category,
                "根据中文意思选择填空：{}\n{}".format(translation, sentence), word, [v[1] for v in alternatives],
                "完整句子是 {}，意思是“{}”。这里需要 {}（{}）。".format(sentence.replace("____", word), translation, word, meaning),
                "先找到中文句子里需要补入的词，再选对应的英语。", kind="context"))
    return rows


# Grade 3–5 already have nearly 500 published questions; these fill genuine gaps.
SUPPLEMENTS = {
    "三年级": [
        ("校园表达", "你想请同学打开书，哪句话合适？", "Open your book, please.", ["Close your eyes, please.", "Show me your bag.", "Drink some water."], "Open your book, please. 表示“请打开你的书”，open 是打开。"),
        ("校园表达", "同学递给你一支铅笔，你表示感谢，应该说什么？", "Thank you.", ["Goodbye.", "I'm sorry.", "Good night."], "收到别人的帮助可以说 Thank you，表示“谢谢你”。"),
        ("生活阅读", "读句子：I have a white rabbit.\n兔子是什么颜色？", "White.", ["Black.", "Red.", "Blue."], "white 表示白色，所以句中的兔子是白色的。"),
        ("生活阅读", "读句子：There are two pencils in my bag.\n书包里有几支铅笔？", "Two.", ["One.", "Three.", "Four."], "two pencils 表示两支铅笔，two 是二。"),
        ("位置与物品", "读句子：The ball is under the chair.\n球在哪里？", "Under the chair.", ["On the chair.", "In the bag.", "On the desk."], "under 表示在……下面，球在椅子下面。"),
        ("数字与年龄", "别人问 How old are you?，哪句话是在回答年龄？", "I'm nine years old.", ["I'm fine.", "My name is Lily.", "It's a cat."], "How old are you? 是问年龄；I'm nine years old. 表示我九岁。"),
        ("喜好表达", "读句子：I like pears, but I don't like grapes.\n这个孩子喜欢什么？", "Pears.", ["Grapes.", "Both pears and grapes.", "Neither fruit."], "like pears 表示喜欢梨；don't like grapes 表示不喜欢葡萄。"),
        ("家庭成员", "读句子：Ben is my brother.\nBen 和说话者是什么关系？", "Brother.", ["Teacher.", "Mother.", "Grandfather."], "brother 表示哥哥或弟弟，所以 Ben 是说话者的兄弟。"),
    ],
    "四年级": [
        ("校园阅读", "读短文：Our classroom is on the second floor. The library is on the first floor.\n图书馆在哪一层？", "The first floor.", ["The second floor.", "The third floor.", "The fourth floor."], "The library is on the first floor. 明确说明图书馆在一层。"),
        ("作息时间", "读句子：It is seven o'clock. It is time for breakfast.\n现在该做什么？", "Have breakfast.", ["Have dinner.", "Go to bed.", "Have lunch."], "time for breakfast 表示该吃早餐了，breakfast 是早餐。"),
        ("天气与穿着", "读句子：It is cold outside. Put on your coat.\n为什么要穿外套？", "It is cold.", ["It is hot.", "It is time for lunch.", "The coat is new."], "cold 是冷的，句子建议因外面冷而穿外套。"),
        ("购物表达", "读对话：How much is the hat? — It is twenty yuan.\n帽子多少钱？", "Twenty yuan.", ["Twelve yuan.", "Thirty yuan.", "Two yuan."], "twenty yuan 表示二十元，twenty 和 twelve 不能混淆。"),
        ("家庭职业", "读句子：My aunt is a nurse. She works in a hospital.\n阿姨做什么工作？", "A nurse.", ["A cook.", "A driver.", "A farmer."], "a nurse 表示护士；hospital 表示医院，与职业信息对应。"),
        ("物品归属", "读对话：Are these your shoes? — No, they are Amy's.\n鞋是谁的？", "Amy's.", ["The speaker's.", "Ben's.", "Tom's."], "they are Amy's 中 Amy's 表示艾米的，鞋属于艾米。"),
        ("农场观察", "读句子：There are six cows and four sheep on the farm.\n农场有几只绵羊？", "Four.", ["Six.", "Ten.", "Two."], "four sheep 表示四只绵羊，six cows 表示六头奶牛。"),
        ("用餐表达", "别人问 Would you like some soup?，你想要汤，哪句回答合适？", "Yes, please.", ["It's a pencil.", "I'm ten.", "Good morning."], "Would you like...? 用于询问是否想要；Yes, please. 是礼貌接受。"),
    ],
    "五年级": [
        ("校园人物", "读句子：Mr Lee is strict, but he is very kind.\n哪项描述符合句意？", "He is strict and kind.", ["He is strict but not kind.", "He is never strict.", "He is a student."], "but 表示转折：李老师严格，同时很友善。"),
        ("周末安排", "读句子：I often read books on Saturdays. I play football on Sundays.\n这个孩子周六常做什么？", "Read books.", ["Play football.", "Go swimming.", "Wash the car."], "on Saturdays 所在句说明周六常读书，不要混同周日的活动。"),
        ("健康饮食", "读句子：My favourite food is fish. I like it because it is delicious.\n这个孩子为什么喜欢鱼？", "Because it is delicious.", ["Because it is a toy.", "Because it is a colour.", "Because it is a subject."], "because 引出原因，delicious 表示美味的。"),
        ("能力表达", "读句子：I can swim, but I can't skate.\n这个孩子不会做什么？", "Skate.", ["Swim.", "Both swim and skate.", "Neither swim nor skate."], "can't skate 表示不会滑冰；can swim 表示会游泳。"),
        ("房间位置", "读句子：The plant is between the bed and the desk.\n植物在哪里？", "Between the bed and the desk.", ["Under the bed.", "Behind the door.", "In the desk."], "between...and... 表示在两者之间，植物在床和书桌之间。"),
        ("季节活动", "读句子：I like winter because I can make a snowman.\n这个孩子冬天喜欢做什么？", "Make a snowman.", ["Pick summer fruit.", "Swim in the sea.", "Plant spring flowers."], "make a snowman 表示堆雪人，是句中选择冬天的原因。"),
        ("物品归属", "读对话：Whose notebook is this? — It is hers.\nhers 表示什么意思？", "她的笔记本。", ["他的笔记本。", "我们的笔记本。", "他们的笔记本。"], "hers 是名词性物主代词，指她的物品；这里代替 her notebook。"),
        ("公共规则", "读句子：Keep your desk clean.\n这条要求是什么？", "保持课桌干净。", ["把课桌搬走。", "在课桌上跑步。", "只把椅子藏起来。"], "keep...clean 表示保持……干净，your desk 是你的课桌。"),
    ],
}

TRIPS = [
    ("Lily", "She", "Saturday morning", "the science museum", "by bus", "saw old trains", "learn about transport"),
    ("Ben", "He", "Sunday afternoon", "the park", "by bike", "took photos of birds", "watch birds"),
    ("Amy", "She", "Friday afternoon", "the library", "on foot", "borrowed a book about space", "read about the moon"),
    ("Tom", "He", "Saturday afternoon", "the farm", "by car", "helped pick apples", "help the farmer"),
    ("Lucy", "She", "Sunday morning", "the zoo", "by bus", "watched the pandas", "see the pandas"),
    ("Jack", "He", "Wednesday afternoon", "the sports centre", "by bike", "played basketball", "practise basketball"),
    ("Emma", "She", "Tuesday afternoon", "the art museum", "on foot", "looked at paintings", "learn about art"),
    ("Leo", "He", "Thursday afternoon", "the beach", "by car", "cleaned up plastic bottles", "keep the beach clean"),
    ("Mia", "She", "Monday afternoon", "the bookshop", "on foot", "bought a storybook", "find a new story"),
    ("Max", "He", "Friday morning", "the post office", "by bus", "sent a postcard", "send a message to his cousin"),
    ("Anna", "She", "Saturday morning", "the flower shop", "by bike", "bought some flowers", "give her mother a gift"),
    ("Sam", "He", "Sunday afternoon", "the railway station", "by car", "met his grandfather", "welcome his grandfather"),
    ("Rose", "She", "Tuesday morning", "the hospital", "by taxi", "visited her aunt", "see her aunt"),
    ("David", "He", "Wednesday morning", "the bakery", "on foot", "bought bread", "get breakfast for his family"),
    ("Nina", "She", "Thursday afternoon", "the music school", "by bus", "played the piano", "practise the piano"),
    ("Paul", "He", "Friday afternoon", "the cinema", "by bike", "watched a film about animals", "enjoy a film"),
    ("Ella", "She", "Sunday morning", "the garden", "on foot", "watered the flowers", "look after the plants"),
    ("Mike", "He", "Monday afternoon", "the swimming pool", "by bus", "had a swimming lesson", "learn to swim"),
    ("Sara", "She", "Saturday afternoon", "the market", "by car", "bought vegetables", "help her family cook dinner"),
    ("Peter", "He", "Thursday morning", "the planetarium", "by taxi", "watched a show about stars", "learn about stars"),
]


def older_english():
    rows = []
    for grade, entries in SUPPLEMENTS.items():
        for index, (topic, prompt, correct, distractors, explanation) in enumerate(entries):
            rows.append(question("英语", grade, "everyday-{:02d}-reading".format(index + 1), "情境英语·" + topic,
                prompt, correct, distractors, explanation, "找到句子中的人物、时间或关键词，再对照问题。", kind="reading", difficulty="medium"))
    for index, (name, pronoun, day, place, transport, activity, goal) in enumerate(TRIPS):
        passage = "{} went to {} {} last {}. {} {} there. {} wanted to {}.".format(name, place, transport, day, pronoun, activity, pronoun, goal)
        exercises = [
            ("人物地点", "Who made this trip?", name, [t[0] for t in TRIPS], "短文第一句的主语 {} 是出行的人。".format(name)),
            ("时间交通", "When did {} go there?".format(name), "Last " + day + ".", ["Last " + t[2] + "." for t in TRIPS], "last {} 给出了出行的时间。".format(day)),
            ("人物地点", "Where did {} go?".format(name), "To " + place + ".", ["To " + t[3] + "." for t in TRIPS], "went to {} 说明去了哪里。".format(place)),
            ("时间交通", "How did {} get there?".format(name), transport[:1].upper() + transport[1:] + ".", [t[4][:1].upper() + t[4][1:] + "." for t in TRIPS], "{} 表示出行方式；by 后接交通工具，步行用 on foot。".format(transport)),
            ("出行目的", "Why did {} go there?".format(name), "To " + goal + ".", ["To " + t[6] + "." for t in TRIPS], "wanted to {} 表达了这次出行的目的。".format(goal)),
        ]
        for part, (topic, query, correct, distractors, why) in enumerate(exercises):
            rows.append(question("英语", "六年级", "trip-{:02d}-{}".format(index + 1, part), "短文阅读·" + topic,
                "阅读短文，回答问题：\n{}\n\n{}".format(passage, query), correct, distractors,
                why + "先确定问题问的是谁、何时、何地、怎样或为什么，再定位短文中的信息。",
                "Who 问人物，When 问时间，Where 问地点，How 问方式，Why 问原因。", kind="reading", difficulty="medium"))
    return rows


def science_questions():
    sections = {}
    section = None
    for line in (DATA_DIR / "primary-science-facts.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        if line.startswith("["):
            section = line[1:-1]
            sections[section] = []
        else:
            fields = line.split("|")
            assert len(fields) == 7, line
            sections[section].append(fields)
    assert set(sections) == {"common", "g1", "g2", "g3", "g4", "g5", "g6"}
    assert all(len(v) == 50 for v in sections.values()), {k: len(v) for k, v in sections.items()}
    rows = []
    for number, grade in enumerate(GRADES, 1):
        # Adjacent-grade revision, with a shared observation/safety foundation.
        selected = ("common", "g1", "g2") if number <= 2 else ("common", "g" + str(number - 1), "g" + str(number))
        for group in selected:
            for index, (topic, prompt, correct, wrong1, wrong2, explanation, false_claim) in enumerate(sections[group]):
                identity = "{}-{:02d}".format(group, index + 1)
                difficulty = "easy" if number <= 2 or group == "common" else "medium"
                rows.append(question("科学", grade, identity + "-knowledge", topic,
                    prompt, correct, [wrong1, wrong2], explanation,
                    "先想一想实际观察过的现象，再排除不符合事实的选项。", difficulty=difficulty, size=3))
                is_true = (index + number) % 2 == 0
                claim = explanation if is_true else false_claim
                rows.append(question("科学", grade, identity + "-judgement", topic,
                    "判断这句话是否正确：\n“{}”".format(claim), "正确" if is_true else "不正确",
                    ["不正确" if is_true else "正确"],
                    ("这句话正确。" if is_true else "这句话不正确。") + explanation,
                    "根据观察和知识判断，注意“所有”“一定”“永远”等说法是否过于绝对。",
                    kind="judgement", difficulty=difficulty, size=2))
    return rows


def validate(rows):
    identities, prompts = set(), set()
    for row in rows:
        identity = row["source_record_id"]
        scoped = (row["subject"], row["grade"], row["prompt"])
        assert identity not in identities, identity
        assert scoped not in prompts, scoped
        identities.add(identity)
        prompts.add(scoped)
        assert row["grade"] in GRADES and row["stage"] == "小学"
        assert row["subject"] in ("英语", "科学")
        assert all(row.get(k) for k in ("prompt", "explanation", "hint", "source_name", "source_license", "knowledge_point"))
        assert len(row["prompt"]) <= 4000 and len(identity) <= 160
        assert len(row["knowledge_point"]) <= 80
        options = row["options"]
        assert 2 <= len(options) <= 6
        assert len({o["text"] for o in options}) == len(options)
        assert [o["key"] for o in options] == [chr(65 + n) for n in range(len(options))]
        assert sum(o["key"] == row["answer"] for o in options) == 1
    counts = Counter((q["subject"], q["grade"]) for q in rows)
    for grade in GRADES:
        assert counts[("科学", grade)] == 300
    for grade in GRADES[:2]:
        assert counts[("英语", grade)] >= 500
    for grade in GRADES[2:5]:
        assert counts[("英语", grade)] == 8
    assert counts[("英语", "六年级")] == 100
    return counts


def main():
    rows = starter_questions() + older_english() + science_questions()
    counts = validate(rows)
    data = {"schema_version": 1, "dataset": DATASET, "targets_per_grade": {"英语": 500, "科学": 300},
            "authorship": "福福学堂原创分类练习；一、二年级英语为启蒙，科学含邻近年级复习；非某版教材同步试卷。",
            "questions": rows}
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Validated candidate counts:", dict(counts))
    print("Candidate total:", len(rows))
    print("Import package:", OUTPUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
