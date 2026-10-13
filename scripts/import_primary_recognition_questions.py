"""Idempotently import original primary literacy/vocabulary items into MySQL."""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from mysql_learning_db import mysql_connection  # noqa: E402

DATA_PATH = ROOT / "content/questions/original/primary-recognition-quick-practice.json"


def load_questions():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    rows = data["questions"]
    if len(rows) != 144:
        raise ValueError(f"Expected 144 questions, found {len(rows)}")
    if len({row["source_record_id"] for row in rows}) != len(rows):
        raise ValueError("Duplicate source_record_id")
    for row in rows:
        if row["subject"] not in {"语文", "英语"} or row["stage"] != "小学":
            raise ValueError(f"Invalid subject or stage: {row['source_record_id']}")
        if row["knowledge_point"] != ("识字快练" if row["subject"] == "语文" else "单词快练"):
            raise ValueError(f"Invalid quick-practice category: {row['source_record_id']}")
        if row["question_type"] == "single_choice":
            if not 2 <= len(row["options"]) <= 6:
                raise ValueError(f"Invalid choices: {row['source_record_id']}")
            keys = [option["key"] for option in row["options"]]
            if len(keys) != len(set(keys)) or row["answer"] not in keys:
                raise ValueError(f"Invalid answer key: {row['source_record_id']}")
        elif row["question_type"] == "short_answer":
            if row["options"] or len(row["answer"]) != 1 or not row["answer"].isalpha():
                raise ValueError(f"Invalid text answer: {row['source_record_id']}")
        else:
            raise ValueError(f"Unsupported question type: {row['source_record_id']}")
        if not all(row.get(field) for field in (
            "source_name", "source_license", "source_attribution", "prompt", "answer", "explanation"
        )):
            raise ValueError(f"Missing required content/source field: {row['source_record_id']}")
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", choices=("draft", "published"), default="draft")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--migrate-gap-inputs", action="store_true", help="Convert this import's English letter-gap choices to typed answers")
    args = parser.parse_args()
    rows = load_questions()
    with mysql_connection() as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id,source_record_id,question_type,source_name,status FROM questions WHERE source_record_id LIKE 'recognition-%'")
                existing = {row["source_record_id"]: row for row in cursor.fetchall()}
                new_rows = [row for row in rows if row["source_record_id"] not in existing]
                gap_updates = [row for row in rows if row["question_type"] == "short_answer" and row["source_record_id"] in existing and existing[row["source_record_id"]]["question_type"] != "short_answer"] if args.migrate_gap_inputs else []
                print(f"Validated {len(rows)} questions; new {len(new_rows)}; already imported {len(existing)}; input updates {len(gap_updates)}; target status {args.status}")
                print("New questions by subject and grade:", dict(Counter((q["subject"], q["grade"]) for q in new_rows)))
                if args.dry_run or (not new_rows and not gap_updates):
                    return
                for row in gap_updates:
                    previous = existing[row["source_record_id"]]
                    if previous["source_name"] != row["source_name"] or previous["status"] not in {"draft", "published"}:
                        raise ValueError(f"Refusing to modify an unexpected record: {row['source_record_id']}")
                    cursor.execute("DELETE FROM question_options WHERE question_id=%s", (previous["id"],))
                    cursor.execute("UPDATE questions SET question_type='short_answer',options='[]',answer=%s WHERE id=%s", (row["answer"], previous["id"]))
                cursor.execute("SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions")
                next_id = int(cursor.fetchone()["next_id"])
                for row in new_rows:
                    options = row["options"]
                    metadata = json.dumps({"dataset": "primary-recognition-quick-practice", "grade": row["grade"]}, ensure_ascii=False)
                    cursor.execute("""INSERT INTO questions(
                        id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,
                        difficulty,question_type,prompt_audio,hint,hint_audio,explanation_audio,status,
                        source_record_id,source_name,source_url,source_license,source_attribution,source_metadata
                    ) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s,'','',%s,%s,%s,'',%s,%s,%s)""", (
                        next_id, row["subject"], row["stage"], row["title"], row["prompt"],
                        json.dumps([option["text"] for option in options], ensure_ascii=False), row["answer"],
                        row["explanation"], row["grade"], row["knowledge_point"], row["difficulty"],
                        row["question_type"], row["hint"], args.status, row["source_record_id"],
                        row["source_name"], row["source_license"], row["source_attribution"], metadata,
                    ))
                    for position, option in enumerate(options):
                        cursor.execute("""INSERT INTO question_options(
                            question_id,option_key,option_text,image_url,audio_url,is_correct,sort_order
                        ) VALUES(%s,%s,%s,'','',%s,%s)""", (
                            next_id, option["key"], option["text"], int(option["key"] == row["answer"]), position,
                        ))
                    next_id += 1
                connection.commit()
                cursor.execute("""SELECT subject,grade,status,COUNT(*) AS total FROM questions
                    WHERE source_record_id LIKE 'recognition-%' GROUP BY subject,grade,status
                    ORDER BY subject,grade,status""")
                print("Imported-source counts:", cursor.fetchall())
        except Exception:
            connection.rollback()
            raise


if __name__ == "__main__":
    main()
