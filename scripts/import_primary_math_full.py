"""Idempotently import the original six-grade primary math supplement."""

import argparse
import gzip
import json
import sys
from collections import Counter
from datetime import datetime
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from mysql_learning_db import mysql_connection  # noqa: E402

DATA_PATH = ROOT / "content/questions/original/primary-math-full.json"
BACKUP_DIR = ROOT / "artifacts/backups"
SOURCE_NAME = "福福学堂原创·小学一至六年级数学补充题"
SOURCE_LICENSE = "福福学堂原创"
SOURCE_ATTRIBUTION = "题干、数字、选项、提示和解析均由福福学堂原创编写。"
GRADES = ("一年级", "二年级", "三年级", "四年级", "五年级", "六年级")


def normalized(text):
    return "".join(str(text).split())


def load_questions():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    rows = data["questions"]
    counts = Counter(row.get("grade") for row in rows)
    if len(rows) != 120 or counts != {grade: 20 for grade in GRADES}:
        raise ValueError(f"Expected 20 questions for each of six grades; got {counts}")
    ids, prompts = set(), set()
    for row in rows:
        rid = row.get("id")
        prompt = normalized(row.get("prompt", ""))
        if not rid or rid in ids or not prompt or prompt in prompts:
            raise ValueError(f"Missing or duplicate ID/prompt: {rid}")
        ids.add(rid)
        prompts.add(prompt)
        for field in ("title", "knowledge_point", "answer", "hint", "explanation", "difficulty"):
            if not str(row.get(field, "")).strip():
                raise ValueError(f"Missing {field}: {rid}")
        if len(row["title"]) > 200 or len(row["knowledge_point"]) > 160:
            raise ValueError(f"Title or knowledge point is too long: {rid}")
        if row["difficulty"] not in {"easy", "medium", "hard"}:
            raise ValueError(f"Invalid difficulty: {rid}")
        if row["question_type"] == "short_answer":
            if row["options"]:
                raise ValueError(f"Short answer has options: {rid}")
            Fraction(row["answer"])
        elif row["question_type"] == "single_choice":
            options = row["options"]
            keys = [option["key"] for option in options]
            if not 2 <= len(options) <= 6 or len(keys) != len(set(keys)) or row["answer"] not in keys:
                raise ValueError(f"Invalid choices: {rid}")
            if any(not option["text"].strip() for option in options):
                raise ValueError(f"Blank option: {rid}")
        else:
            raise ValueError(f"Unsupported question type: {rid}")
    return data, rows


def backup_tables(cursor):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"questions-before-primary-math-{datetime.now():%Y%m%d-%H%M%S}.json.gz"
    snapshot = {}
    for table in ("questions", "question_options"):
        cursor.execute(f"SELECT * FROM {table}")
        snapshot[table] = cursor.fetchall()
    with gzip.open(target, "wt", encoding="utf-8") as output:
        json.dump(snapshot, output, ensure_ascii=False, default=str)
    return target, {table: len(rows) for table, rows in snapshot.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", choices=("draft", "published"), default="published")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing to MySQL")
    args = parser.parse_args()
    data, rows = load_questions()
    with mysql_connection() as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id,source_record_id,prompt FROM questions WHERE subject='数学' AND stage='小学'")
                existing = cursor.fetchall()
                existing_ids = {row["source_record_id"] for row in existing if row["source_record_id"]}
                existing_prompts = {normalized(row["prompt"]) for row in existing}
                to_add = [row for row in rows if row["id"] not in existing_ids and normalized(row["prompt"]) not in existing_prompts]
                already = sum(row["id"] in existing_ids for row in rows)
                duplicate_prompt = len(rows) - already - len(to_add)
                if args.dry_run:
                    print(f"Validated {len(rows)} source rows; would add {len(to_add)}; existing source IDs: {already}; prompt duplicates: {duplicate_prompt}")
                    print("New rows by grade:", dict(Counter(row["grade"] for row in to_add)))
                    return
                if not to_add:
                    print(f"No new rows. Existing source IDs: {already}; prompt duplicates: {duplicate_prompt}")
                    return
                backup_path, before_counts = backup_tables(cursor)
                cursor.execute("SELECT COALESCE(MAX(id),0)+1 AS next_id FROM questions")
                next_id = int(cursor.fetchone()["next_id"])
                for row in to_add:
                    options = row["options"]
                    metadata = json.dumps({"dataset": data["dataset"], "grade": row["grade"]}, ensure_ascii=False)
                    cursor.execute("""INSERT INTO questions(
                        id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,
                        difficulty,question_type,prompt_audio,hint,hint_audio,explanation_audio,status,
                        source_record_id,source_name,source_url,source_license,source_attribution,source_metadata
                    ) VALUES(%s,'数学','小学',%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s,'','',%s,%s,%s,'',%s,%s,%s)""", (
                        next_id, row["title"], row["prompt"],
                        json.dumps([option["text"] for option in options], ensure_ascii=False),
                        row["answer"], row["explanation"], row["grade"], row["knowledge_point"],
                        row["difficulty"], row["question_type"], row["hint"], args.status,
                        row["id"], SOURCE_NAME, SOURCE_LICENSE, SOURCE_ATTRIBUTION, metadata,
                    ))
                    for index, option in enumerate(options):
                        cursor.execute("""INSERT INTO question_options(
                            question_id,option_key,option_text,image_url,audio_url,is_correct,sort_order
                        ) VALUES(%s,%s,%s,'','',%s,%s)""", (
                            next_id, option["key"], option["text"], int(option["key"] == row["answer"]), index,
                        ))
                    next_id += 1
                connection.commit()
                cursor.execute("SELECT grade,status,COUNT(*) AS n FROM questions WHERE source_name=%s GROUP BY grade,status ORDER BY grade,status", (SOURCE_NAME,))
                summary = cursor.fetchall()
                print(f"Backup: {backup_path}; before: {before_counts}")
                print(f"Imported: {len(to_add)}; existing source IDs: {already}; prompt duplicates: {duplicate_prompt}; status: {args.status}")
                print(f"Imported-source counts: {summary}")
        except Exception:
            connection.rollback()
            raise


if __name__ == "__main__":
    main()
