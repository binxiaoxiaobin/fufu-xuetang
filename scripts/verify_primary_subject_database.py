"""Verify all grades against actual quiz SQL; temporary sessions are rolled back."""
import getpass
import os
import sys
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from mysql_learning_db import Store, mysql_connection  # noqa: E402
from server import Handler  # noqa: E402
from build_primary_subject_expansion import GRADES  # noqa: E402


class GradeView:
    """Override only the profile read, without changing any learner's settings."""
    def __init__(self, db, grade):
        self.db, self.grade = db, grade

    def execute(self, sql, params=()):
        if sql.startswith("SELECT learning_stage,grade FROM profile WHERE id="):
            return Mock(fetchone=lambda: {"learning_stage": "小学", "grade": self.grade})
        return self.db.execute(sql, params)


def main():
    if not os.getenv("FUFU_MYSQL_PASSWORD"):
        os.environ["FUFU_MYSQL_PASSWORD"] = getpass.getpass("MySQL password: ")
    with mysql_connection() as connection:
        try:
            db = Store(connection)
            learner_id = db.execute("SELECT id FROM profile ORDER BY id LIMIT 1").fetchone()["id"]
            handler = object.__new__(Handler)
            captured = []
            handler.send_json = lambda payload, status=200: captured.append((payload, status))
            checks = []
            for grade in GRADES:
                for subject, expected in (("英语", 500), ("科学", 300)):
                    total = db.execute("""SELECT COUNT(*) AS total FROM questions
                        WHERE status='published' AND stage='小学' AND subject=? AND (grade=? OR grade='*')""", (subject, grade)).fetchone()["total"]
                    assert total == expected, (subject, grade, total)
                    topic = db.execute("""SELECT knowledge_point FROM questions WHERE stage='小学' AND grade=?
                        AND subject=? AND status='published' AND source_record_id LIKE ?
                        ORDER BY id LIMIT 1""", (grade, subject, "subject-expansion-%")).fetchone()["knowledge_point"]
                    for knowledge_point, force_wrap in (("", False), (topic, True)):
                        captured.clear()
                        with patch("server.random.randint", return_value=10**12) if force_wrap else patch("server.random.randint", return_value=1):
                            handler.create_quiz(GradeView(db, grade), {"subject": subject, "count": 5, "knowledge_point": knowledge_point}, learner_id)
                        payload, status = captured[0]
                        assert status == 200, payload
                        assert 1 <= len(payload["questions"]) <= 5
                        assert payload["grade"] == grade
                        for q in payload["questions"]:
                            assert q["grade"] in (grade, "*") and q["subject"] == subject
                            assert "answer" not in q and "explanation" not in q and "hint" not in q
                            assert all("is_correct" not in option for option in q["options"])
                            if knowledge_point:
                                assert q["knowledge_point"] == knowledge_point
                                assert 2 <= len(q["options"]) <= 4
                        checks.append((subject, grade, knowledge_point or "all", len(payload["questions"])))
            output = ROOT / "artifacts/primary-subject-expansion-20261005-database-check.txt"
            output.write_text("24 real quiz SQL checks passed; grade/topic scoping and answer-free payloads verified.\n" +
                              "\n".join(str(check) for check in checks) + "\nTemporary sessions rolled back.\n", encoding="utf-8")
            print("24 real quiz SQL checks passed for all six grades and both subjects.")
            print("Per-grade totals, topic filters, wraparound and answer-free payloads verified.")
        finally:
            connection.rollback()
            print("Temporary sessions rolled back; no learner profile or points changed.")


if __name__ == "__main__":
    main()
