"""Idempotently import independently authored grade-three math questions."""
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from mysql_learning_db import mysql_connection

DATA_PATH = ROOT / "content" / "questions" / "original" / "grade3-math.json"
EXPECTED_COUNT = 27
REFERENCE_URL = "https://www.tiku.cn/chapterq?cid=14&cno=1&vid=800016&bid=800104"
SOURCE_NAME = "福福学堂原创题（参考知识点目录）"
SOURCE_LICENSE = "福福学堂原创"
SOURCE_ATTRIBUTION = "题目、情境、数字、选项和解析均为福福学堂原创；外部页面仅用于核对教材章节主题，未复制或改写其题目内容。"


def load_and_validate():
    dataset = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    questions = dataset["questions"]
    if len(questions) != EXPECTED_COUNT:
        raise ValueError(f"Expected {EXPECTED_COUNT} questions; found {len(questions)}")
    ids = [item.get("id") for item in questions]
    if len(set(ids)) != len(ids) or any(not item for item in ids):
        raise ValueError("Question source IDs must be present and unique")
    for item in questions:
        if not item.get("prompt") or not item.get("answer") or not item.get("explanation"):
            raise ValueError(f"Missing prompt, answer, or explanation: {item.get('id')}")
        if item.get("question_type") == "single_choice":
            options = item.get("options")
            keys = [option.get("key") for option in options or []]
            if not 2 <= len(keys) <= 6 or len(keys) != len(set(keys)) or item["answer"] not in keys:
                raise ValueError(f"Invalid choices or answer key: {item['id']}")
        elif item.get("question_type") == "short_answer":
            if item.get("options"):
                raise ValueError(f"Short-answer question must not have options: {item['id']}")
            try:
                Fraction(str(item["answer"]).replace(",", ""))
            except (ValueError, ZeroDivisionError) as exc:
                raise ValueError(f"Unsupported numeric answer: {item['id']}") from exc
        else:
            raise ValueError(f"Unsupported question type: {item['id']}")
        if item.get("difficulty") not in {"easy", "medium", "hard"}:
            raise ValueError(f"Unsupported difficulty: {item['id']}")
    return dataset


def main():
    dataset = load_and_validate()
    questions = dataset["questions"]
    metadata = json.dumps({
        "dataset": dataset["dataset"],
        "basis": dataset["basis"],
        "reference_url": REFERENCE_URL,
    }, ensure_ascii=False)
    added = 0
    with mysql_connection() as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions")
                next_id = int(cursor.fetchone()["next_id"])
                for item in questions:
                    source_record_id = item["id"]
                    cursor.execute("SELECT id FROM questions WHERE source_record_id=%s", (source_record_id,))
                    if cursor.fetchone():
                        continue
                    options = item["options"]
                    cursor.execute("""INSERT INTO questions(
                        id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,
                        difficulty,question_type,prompt_audio,hint,hint_audio,explanation_audio,status,
                        source_record_id,source_name,source_url,source_license,source_attribution,source_metadata
                    ) VALUES(%s,'数学','小学',%s,%s,%s,%s,%s,'三年级',%s,%s,%s,'',%s,'','','draft',%s,%s,%s,%s,%s,%s)""", (
                        next_id, item["title"], item["prompt"], json.dumps([option["text"] for option in options], ensure_ascii=False),
                        item["answer"], item["explanation"], item["knowledge_point"], item["difficulty"],
                        item["question_type"], item.get("hint", ""), source_record_id, SOURCE_NAME,
                        REFERENCE_URL, SOURCE_LICENSE, SOURCE_ATTRIBUTION, metadata,
                    ))
                    for index, option in enumerate(options):
                        cursor.execute("""INSERT INTO question_options(
                            question_id,option_key,option_text,image_url,audio_url,is_correct,sort_order
                        ) VALUES(%s,%s,%s,'','',%s,%s)""", (
                            next_id, option["key"], option["text"], int(option["key"] == item["answer"]), index,
                        ))
                    next_id += 1
                    added += 1
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    print(f"Original questions checked: {len(questions)}; newly imported as drafts: {added}; already present: {len(questions)-added}")


if __name__ == "__main__":
    main()
