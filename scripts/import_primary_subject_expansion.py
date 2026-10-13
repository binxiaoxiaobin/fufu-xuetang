"""Add original questions up to per-grade targets, without modifying existing content."""
import argparse
import getpass
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from mysql_learning_db import mysql_connection  # noqa: E402
from build_primary_subject_expansion import DATASET, GRADES, OUTPUT, validate  # noqa: E402

TARGETS = {"英语": 500, "科学": 300}
LOCK = "fufu_primary_subject_expansion"


def digest(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False,
                                    default=str, separators=(",", ":")).encode("utf-8")).hexdigest()


def counts_for_grade(rows):
    return {(subject, grade): sum(q["subject"] == subject and q["status"] == "published"
                                 and q["stage"] == "小学" and q["grade"] in (grade, "*") for q in rows)
            for subject in TARGETS for grade in GRADES}


def plan_import(candidates, existing):
    existing_ids = {q["source_record_id"] for q in existing}
    existing_prompts = {(q["subject"], q["grade"], q["prompt"]) for q in existing if q["stage"] == "小学"}
    before = counts_for_grade(existing)
    pools = defaultdict(list)
    for row in candidates:
        if row["source_record_id"] not in existing_ids and (row["subject"], row["grade"], row["prompt"]) not in existing_prompts:
            pools[(row["subject"], row["grade"])].append(row)
    selected = []
    for scope, count in before.items():
        needed = max(0, TARGETS[scope[0]] - count)
        pool = sorted(pools[scope], key=lambda q: hashlib.sha256(q["source_record_id"].encode()).hexdigest())
        if needed > len(pool):
            raise ValueError("Insufficient candidates for {}: need {}, available {}. Import the base curriculum first.".format(scope, needed, len(pool)))
        selected.extend(pool[:needed])
    return before, selected


def load_package():
    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    if data["dataset"] != DATASET or data["targets_per_grade"] != TARGETS:
        raise ValueError("Unexpected import package")
    validate(data["questions"])
    return data["questions"]


def insert_question(cursor, row, question_id):
    options = row["options"]
    cursor.execute("""INSERT INTO questions(
        id,subject,stage,title,prompt,options,answer,explanation,grade,knowledge_point,
        difficulty,question_type,prompt_audio,hint,hint_audio,explanation_audio,status,
        source_record_id,source_name,source_url,source_license,source_attribution,source_metadata
    ) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s,'','','published',%s,%s,%s,%s,%s,%s)""", (
        question_id, row["subject"], row["stage"], row["title"], row["prompt"],
        json.dumps([o["text"] for o in options], ensure_ascii=False), row["answer"], row["explanation"],
        row["grade"], row["knowledge_point"], row["difficulty"], row["question_type"], row["hint"],
        row["source_record_id"], row["source_name"], row["source_url"], row["source_license"],
        row["source_attribution"], json.dumps(row["source_metadata"], ensure_ascii=False),
    ))
    cursor.executemany("""INSERT INTO question_options(
        question_id,option_key,option_text,image_url,audio_url,is_correct,sort_order
    ) VALUES(%s,%s,%s,'','',%s,%s)""", [
        (question_id, o["key"], o["text"], int(o["key"] == row["answer"]), position)
        for position, o in enumerate(options)
    ])


def assert_imported(cursor, selected, first_id):
    if not selected:
        return
    cursor.execute("""SELECT q.id,q.source_record_id,q.answer,q.options,q.explanation,q.status,
        qo.option_key,qo.option_text,qo.is_correct,qo.sort_order
        FROM questions q JOIN question_options qo ON qo.question_id=q.id
        WHERE q.id BETWEEN %s AND %s ORDER BY q.id,qo.sort_order""", (first_id, first_id + len(selected) - 1))
    stored = defaultdict(list)
    for row in cursor.fetchall():
        stored[row["source_record_id"]].append(row)
    for question in selected:
        records = stored[question["source_record_id"]]
        assert len(records) == len(question["options"])
        assert sum(r["is_correct"] for r in records) == 1
        assert all(r["is_correct"] == int(r["option_key"] == question["answer"]) for r in records)
        assert [(r["option_key"], r["option_text"]) for r in records] == [(o["key"], o["text"]) for o in question["options"]]
        assert all(r["answer"] == question["answer"] and r["explanation"] == question["explanation"] and r["status"] == "published" for r in records)
        assert json.loads(records[0]["options"]) == [o["text"] for o in question["options"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Publish the validated additional questions; default is a dry run")
    args = parser.parse_args()
    candidates = load_package()
    if not os.getenv("FUFU_MYSQL_PASSWORD"):
        os.environ["FUFU_MYSQL_PASSWORD"] = getpass.getpass("MySQL password: ")
    with mysql_connection() as connection:
        locked = False
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT GET_LOCK(%s,10) AS acquired", (LOCK,))
                locked = cursor.fetchone()["acquired"] == 1
                if not locked:
                    raise RuntimeError("Another import is running")
                cursor.execute("SELECT * FROM questions ORDER BY id")
                existing = cursor.fetchall()
                before, selected = plan_import(candidates, existing)
                print("Before:", before)
                print("Planned additions:", dict(Counter((q["subject"], q["grade"]) for q in selected)))
                print("New total:", len(selected))
                if not args.apply or not selected:
                    print("No database changes." if not args.apply else "Already at targets; no database changes.")
                    connection.rollback()
                    return
                cursor.execute("SELECT * FROM question_options ORDER BY id")
                old_options = cursor.fetchall()
                protected_ids = {q["id"] for q in existing}
                backup_path = ROOT / "artifacts" / (DATASET + "-before-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".json")
                backup_path.parent.mkdir(parents=True, exist_ok=True)
                backup_path.write_text(json.dumps({"dataset": DATASET, "questions": existing, "question_options": old_options},
                                                  ensure_ascii=False, default=str), encoding="utf-8")
                protected_hash = digest(existing)
                option_hash = digest(old_options)
                cursor.execute("SELECT id FROM questions ORDER BY id DESC LIMIT 1 FOR UPDATE")
                last = cursor.fetchone()
                next_id = int(last["id"]) + 1 if last else 1
                first_id = next_id
                for row in selected:
                    insert_question(cursor, row, next_id)
                    next_id += 1
                assert_imported(cursor, selected, first_id)
                cursor.execute("SELECT * FROM questions ORDER BY id")
                after_rows = cursor.fetchall()
                assert digest([q for q in after_rows if q["id"] in protected_ids]) == protected_hash, "Existing questions changed"
                cursor.execute("SELECT * FROM question_options WHERE question_id<%s ORDER BY id", (first_id,))
                assert digest(cursor.fetchall()) == option_hash, "Existing options changed"
                after = counts_for_grade(after_rows)
                assert all(after[scope] == max(TARGETS[scope[0]], count) for scope, count in before.items())
                _, second_plan = plan_import(candidates, after_rows)
                assert not second_plan, "Import is not idempotent"
                report = {"dataset": DATASET, "imported": len(selected), "backup": str(backup_path.relative_to(ROOT)),
                          "counts": [{"subject": scope[0], "grade": scope[1], "before": count, "after": after[scope],
                                      "added": after[scope] - count} for scope, count in before.items()],
                          "preserved_existing_questions": len(existing), "preserved_existing_options": len(old_options),
                          "repeat_import_additions": len(second_plan), "imported_first_id": first_id, "imported_last_id": next_id - 1,
                          "validation": "Options/answers/explanations matched; existing row hashes unchanged; second plan empty."}
                connection.commit()
                report_path = ROOT / "artifacts" / (DATASET + "-import-report.json")
                report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print("Published", len(selected), "questions.")
                print("After:", after)
                print("Report:", report_path.relative_to(ROOT))
        except Exception:
            connection.rollback()
            raise
        finally:
            if locked:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT RELEASE_LOCK(%s)", (LOCK,))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
