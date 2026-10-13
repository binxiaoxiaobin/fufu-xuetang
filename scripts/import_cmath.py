"""Idempotently import the licensed CMATH dev question release into MySQL."""
import hashlib
import json
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from mysql_learning_db import mysql_connection


SOURCE_DIR = ROOT / "content" / "questions" / "sources" / "cmath"
DATA_PATH = SOURCE_DIR / "cmath_dev.jsonl"
META_PATH = SOURCE_DIR / "source.json"
GRADE_NAMES = {1: "一年级", 2: "二年级", 3: "三年级", 4: "四年级", 5: "五年级", 6: "六年级"}


def main():
    metadata = json.loads(META_PATH.read_text(encoding="utf-8"))
    records = [json.loads(line) for line in DATA_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(records) != metadata["expected_records"]:
        raise ValueError(f"Expected {metadata['expected_records']} records; found {len(records)}")
    counts = Counter(int(row["grade"]) for row in records)
    expected = {int(key): value for key, value in metadata["grade_counts"].items()}
    if counts != expected:
        raise ValueError(f"Unexpected grade distribution: {dict(counts)}")
    if any(not row.get("input") or not row.get("golden") for row in records):
        raise ValueError("Every record must have a prompt and answer")
    for row in records:
        try:
            answer = str(row["golden"]).strip().replace(",", "")
            Fraction(answer[:-1]) / 100 if answer.endswith("%") else Fraction(answer)
        except (ValueError, ZeroDivisionError) as exc:
            raise ValueError(f"Unsupported answer format in source grade {row['grade']}") from exc

    added = 0
    with mysql_connection() as connection:
        with connection.cursor() as cursor:
            for column, definition in {
                "source_record_id": "VARCHAR(160) NULL",
                "source_name": "VARCHAR(120) NOT NULL DEFAULT ''",
                "source_url": "VARCHAR(1000) NOT NULL DEFAULT ''",
                "source_license": "VARCHAR(80) NOT NULL DEFAULT ''",
                "source_attribution": "TEXT NULL",
                "source_metadata": "JSON NULL",
            }.items():
                cursor.execute(f"SHOW COLUMNS FROM questions LIKE '{column}'")
                if not cursor.fetchone():
                    cursor.execute(f"ALTER TABLE questions ADD COLUMN {column} {definition}")
            cursor.execute("SHOW INDEX FROM questions WHERE Key_name='uq_question_source_record'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE questions ADD UNIQUE KEY uq_question_source_record(source_record_id)")
            cursor.execute("SHOW COLUMNS FROM question_attempts LIKE 'answer_text'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE question_attempts ADD COLUMN answer_text TEXT NULL")
            cursor.execute("SHOW COLUMNS FROM question_attempts LIKE 'selected_option'")
            selected_column = cursor.fetchone()
            if selected_column and selected_column.get("Default") is None:
                cursor.execute("ALTER TABLE question_attempts MODIFY selected_option VARCHAR(20) NOT NULL DEFAULT ''")
            cursor.execute("SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions")
            next_id = int(cursor.fetchone()["next_id"])
            for row in records:
                grade_number = int(row["grade"])
                prompt = str(row["input"]).strip()
                source_record_id = "cmath_dev:" + hashlib.sha256(
                    f"{grade_number}\0{prompt}".encode("utf-8")
                ).hexdigest()[:32]
                cursor.execute("SELECT id FROM questions WHERE source_record_id=%s", (source_record_id,))
                if cursor.fetchone():
                    continue
                steps = int(row.get("reasoning_step", 2))
                difficulty = "easy" if steps <= 1 else "medium" if steps <= 3 else "hard"
                source_metadata = json.dumps({
                    "dataset": metadata["dataset"],
                    "source_grade": grade_number,
                    "reasoning_step": steps,
                    "num_digits": row.get("num_digits"),
                }, ensure_ascii=False)
                title = f"CMATH · {GRADE_NAMES[grade_number]}应用题 · {added + 1:03d}"
                cursor.execute("""INSERT INTO questions(
                    id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,
                    difficulty,question_type,prompt_audio,hint,hint_audio,explanation_audio,status,
                    source_record_id,source_name,source_url,source_license,source_attribution,source_metadata
                ) VALUES(%s,'数学','小学',%s,%s,'[]',%s,'',%s,'小学数学应用题',%s,'short_answer','','','','','published',%s,%s,%s,%s,%s,%s)""", (
                    next_id, title, prompt, str(row["golden"]).strip(), GRADE_NAMES[grade_number],
                    difficulty, source_record_id, metadata["name"], metadata["source_url"],
                    metadata["license"], metadata["attribution"], source_metadata,
                ))
                next_id += 1
                added += 1
        connection.commit()
    print(f"CMATH records: {len(records)}; newly imported: {added}; already present: {len(records)-added}")


if __name__ == "__main__":
    main()
