"""Build original elementary Chinese character and English word quick-practice questions.

The generated JSON is an import package for the MySQL question bank. The web app
never uses this file as a runtime fallback.
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "content/questions/original/primary-recognition-quick-practice.json"
GRADES = ("一年级", "二年级", "三年级", "四年级", "五年级", "六年级")

# character, pinyin, short sentence with a one-character blank
CHINESE = {
    "一年级": [
        ("水", "shuǐ", "口渴了，请喝一杯____。"), ("火", "huǒ", "冬天烤____取暖。"),
        ("山", "shān", "远处有一座高____。"), ("月", "yuè", "夜空中的____亮亮的。"),
        ("日", "rì", "____出以后，天渐渐亮了。"), ("木", "mù", "这张桌子是____头做的。"),
    ],
    "二年级": [
        ("春", "chūn", "____天到了，小草发芽了。"), ("风", "fēng", "今天有____，风车转起来了。"),
        ("雨", "yǔ", "下____了，记得带伞。"), ("雪", "xuě", "冬天飘下白白的____花。"),
        ("花", "huā", "公园里的____开得真漂亮。"), ("草", "cǎo", "小兔在____地上吃菜。"),
    ],
    "三年级": [
        ("读", "dú", "每天认真____书，能学到新知识。"), ("写", "xiě", "请把自己的名字____在纸上。"),
        ("跑", "pǎo", "听到哨声，大家一起向前____。"), ("跳", "tiào", "小青蛙用力一____，跳进池塘。"),
        ("画", "huà", "我用彩笔____了一只小鸟。"), ("唱", "chàng", "大家一起大声____歌。"),
    ],
    "四年级": [
        ("勇", "yǒng", "遇到困难不害怕，做一个____敢的孩子。"), ("静", "jìng", "图书馆里要保持安____。"),
        ("观", "guān", "我们仔细____察蚂蚁怎样搬家。"), ("察", "chá", "警察叔叔认真____看路口的交通。"),
        ("整", "zhěng", "请把书本摆放____齐。"), ("护", "hù", "我们要爱____花草树木。"),
    ],
    "五年级": [
        ("环", "huán", "大家一起保护____境，让城市更干净。"), ("境", "jìng", "安静的学习环____让人更专心。"),
        ("植", "zhí", "春天到了，同学们去____树。"), ("物", "wù", "熊猫是珍贵的野生动____。"),
        ("需", "xū", "完成这项任务____要大家合作。"), ("保", "bǎo", "我们要____护眼睛，注意用眼时间。"),
    ],
    "六年级": [
        ("诚", "chéng", "____实守信的孩子会得到大家的信任。"), ("敬", "jìng", "我们要尊____老师，也要关心同学。"),
        ("宽", "kuān", "和同学相处要多一些____容。"), ("容", "róng", "遇到不同意见，我们可以互相包____。"),
        ("责", "zé", "做错事要勇于承认并承担____任。"), ("任", "rèn", "每个人都要承担自己的责____。"),
    ],
}

# word, Chinese meaning
ENGLISH = {
    "一年级": [("sun", "太阳"), ("red", "红色"), ("pen", "钢笔"), ("cat", "猫"), ("bag", "书包"), ("run", "跑")],
    "二年级": [("book", "书"), ("school", "学校"), ("water", "水"), ("happy", "开心的"), ("table", "桌子"), ("friend", "朋友")],
    "三年级": [("animal", "动物"), ("flower", "花"), ("garden", "花园"), ("little", "小的"), ("morning", "早晨"), ("teacher", "老师")],
    "四年级": [("library", "图书馆"), ("between", "在两者之间"), ("picture", "图画"), ("because", "因为"), ("subject", "学科"), ("beautiful", "美丽的")],
    "五年级": [("environment", "环境"), ("adventure", "冒险"), ("remember", "记得"), ("different", "不同的"), ("interesting", "有趣的"), ("important", "重要的")],
    "六年级": [("knowledge", "知识"), ("discover", "发现"), ("protect", "保护"), ("exercise", "锻炼"), ("healthy", "健康的"), ("country", "国家" )],
}

SOURCE_NAME = "福福学堂原创·小学识字与英语单词快练"
LICENSE = "福福学堂原创"
ATTRIBUTION = "题干、选项、提示与解析由福福学堂原创编写；按年级整理常用识字和英语词汇。"


def choices(correct, pool, *, key_text=None):
    options = [correct]
    for candidate in pool:
        if candidate != correct and candidate not in options:
            options.append(candidate)
        if len(options) == 4:
            break
    if len(options) != 4:
        raise ValueError(f"Need four distinct options for {correct!r}")
    random.Random(f"{correct}|{'|'.join(pool)}").shuffle(options)
    answer = "ABCD"[options.index(correct)]
    return [{"key": "ABCD"[i], "text": key_text(option) if key_text else option} for i, option in enumerate(options)], answer


def add_question(rows, grade, subject, knowledge, title, prompt, options, answer, explanation, index, difficulty="easy", question_type="single_choice"):
    rows.append({
        "source_record_id": f"recognition-{grade}-{subject}-{index:03d}",
        "source_name": SOURCE_NAME, "source_license": LICENSE,
        "source_attribution": ATTRIBUTION,
        "subject": subject, "stage": "小学", "grade": grade,
        "difficulty": difficulty, "question_type": question_type,
        "knowledge_point": knowledge, "title": title, "prompt": prompt,
        "options": options, "answer": answer,
        "hint": "先读一读题目里的拼音、句子或单词，再看看每个选项。",
        "explanation": explanation,
    })


def build():
    rows = []
    for grade in GRADES:
        chars = CHINESE[grade]
        for index, (char, pinyin, sentence) in enumerate(chars, 1):
            distractors = [item[0] for item in chars if item[0] != char]
            options, answer = choices(char, distractors)
            add_question(rows, grade, "语文", "识字快练", f"看拼音认汉字·{grade}",
                         f"拼音“{pinyin}”对应哪个汉字？", options, answer,
                         f"“{char}”读作 {pinyin}。", index)
            options, answer = choices(char, distractors)
            add_question(rows, grade, "语文", "识字快练", f"按语境补汉字·{grade}",
                         sentence, options, answer, f"这个句子里应填“{char}”。", index + 6, "medium")

        words = ENGLISH[grade]
        translations = [meaning for _, meaning in words]
        for index, (word, meaning) in enumerate(words, 1):
            distractors = [item[1] for item in words if item[1] != meaning]
            options, answer = choices(meaning, distractors)
            add_question(rows, grade, "英语", "单词快练", f"看英文认词义·{grade}",
                         f"“{word}”是什么意思？", options, answer,
                         f"{word} 的意思是“{meaning}”。", index)

            hidden_index = max(1, len(word) // 2)
            missing = word[hidden_index]
            incomplete = word[:hidden_index] + "_" + word[hidden_index + 1:]
            add_question(rows, grade, "英语", "单词快练", f"补全英文单词·{grade}",
                         f"补上缺少的字母：{incomplete}", [], missing,
                         f"完整单词是 {word}，意思是“{meaning}”。", index + 6, "medium", "short_answer")

    ids = [row["source_record_id"] for row in rows]
    prompts = [(row["subject"], row["grade"], row["prompt"]) for row in rows]
    if len(rows) != 144 or len(set(ids)) != len(ids) or len(set(prompts)) != len(prompts):
        raise ValueError("Question count, IDs or prompts are invalid")
    for row in rows:
        if row["question_type"] == "single_choice":
            if len(row["options"]) != 4 or len({option["text"] for option in row["options"]}) != 4:
                raise ValueError(f"Duplicate option: {row['source_record_id']}")
            if row["options"][ord(row["answer"]) - ord("A")]["key"] != row["answer"]:
                raise ValueError(f"Invalid answer key: {row['source_record_id']}")
        elif row["question_type"] == "short_answer":
            if row["options"] or len(row["answer"]) != 1 or not row["answer"].isalpha():
                raise ValueError(f"Invalid text answer: {row['source_record_id']}")
        else:
            raise ValueError(f"Unsupported question type: {row['source_record_id']}")
    return rows


if __name__ == "__main__":
    questions = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"name": SOURCE_NAME, "questions": questions}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    from collections import Counter
    print(f"Generated {len(questions)} original questions: {dict(Counter((row['subject'], row['grade']) for row in questions))}")
    print(OUTPUT)
