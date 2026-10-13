"""Check source semantics, target planning, repeat imports and learner payloads."""
import json
import unittest
from collections import Counter

from build_primary_subject_expansion import DATA_DIR, GRADES, OUTPUT, older_english, science_questions, starter_questions
from import_primary_subject_expansion import counts_for_grade, load_package, plan_import


def baseline():
    rows = []
    for grade, count in zip(GRADES, (12, 12, 492, 492, 492, 402)):
        for index in range(count):
            rows.append(dict(subject="英语", stage="小学", grade=grade, status="published",
                             source_record_id="previous-{}-{}".format(grade, index), prompt="之前的{}第{}题".format(grade, index)))
    return rows


def answer_text(row):
    return next(o["text"] for o in row["options"] if o["key"] == row["answer"])


class ExpansionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = load_package()

    def test_checked_in_package_matches_sources(self):
        rebuilt = starter_questions() + older_english() + science_questions()
        self.assertEqual(rebuilt, self.rows)
        self.assertEqual(len(rebuilt), 2972)

    def test_starter_answers_and_explanations_match_curated_words(self):
        vocabulary = {}
        for line in (DATA_DIR / "primary-english-starters.txt").read_text(encoding="utf-8").splitlines():
            if line and not line.startswith("#"):
                _, word, meaning, sentence, translation = line.split("|")
                vocabulary[word] = (meaning, sentence, translation)
        for row in self.rows:
            if "-starter-" not in row["source_record_id"]:
                continue
            word = row["source_record_id"].split("-starter-", 1)[1].rsplit("-", 1)[0]
            meaning, sentence, translation = vocabulary[word]
            kind = row["source_metadata"]["exercise_kind"]
            self.assertEqual(answer_text(row), meaning if kind == "word_meaning" else word)
            if kind == "word_recall":
                for option in row["options"]:
                    if option["text"] != word:
                        self.assertIn(option["text"] + " 表示“" + vocabulary[option["text"]][0] + "”", row["explanation"])
            if kind == "context":
                self.assertIn(sentence.replace("____", word), row["explanation"])
                self.assertIn(translation, row["prompt"])

    def test_science_judgements_are_balanced_and_explained(self):
        judgements = [q for q in self.rows if q["subject"] == "科学" and q["source_metadata"]["exercise_kind"] == "judgement"]
        for grade in GRADES:
            scoped = [q for q in judgements if q["grade"] == grade]
            self.assertEqual(Counter(answer_text(q) for q in scoped), {"正确": 75, "不正确": 75})
            for q in scoped:
                self.assertTrue(q["explanation"].startswith("这句话" + answer_text(q) + "。"))
        # Guard tricky elementary misconceptions, not just the JSON structure.
        guards = {"水蒸气": "通常不能", "能量转换时": "不可以", "化学变化的重要特征": "产生新物质", "风向指": "风吹来的方向"}
        for stem, answer in guards.items():
            matches = [q for q in self.rows if q["subject"] == "科学" and q["source_metadata"]["exercise_kind"] != "judgement" and stem in q["prompt"]]
            self.assertTrue(matches, stem)
            self.assertTrue(all(answer_text(q) == answer for q in matches), stem)

    def test_additive_plan_and_repeat_import(self):
        original = baseline()
        before, additions = plan_import(self.rows, original)
        self.assertEqual(len(additions), 2898)
        self.assertEqual(sum(q["subject"] == "英语" for q in additions), 1098)
        self.assertEqual(sum(q["subject"] == "科学" for q in additions), 1800)
        after = original + [dict(q, status="published") for q in additions]
        counts = counts_for_grade(after)
        for grade in GRADES:
            self.assertEqual(counts[("英语", grade)], 500)
            self.assertEqual(counts[("科学", grade)], 300)
        self.assertEqual(plan_import(self.rows, after)[1], [])
        topics = {q["knowledge_point"] for q in additions if q["subject"] == "英语" and q["grade"] == "二年级"}
        self.assertEqual(len(topics), 11)
        kinds = Counter(q["source_metadata"]["exercise_kind"] for q in additions if q["subject"] == "英语" and q["grade"] == "二年级")
        self.assertTrue(all(100 <= count <= 131 for count in kinds.values()))

    def test_existing_over_target_and_shared_grade_questions_are_preserved(self):
        original = baseline()
        original.extend(dict(subject="英语", stage="小学", grade="三年级", status="published", source_record_id="extra-{}".format(i), prompt="额外题目{}".format(i)) for i in range(20))
        original.extend(dict(subject="科学", stage="小学", grade="*", status="published", source_record_id="shared-{}".format(i), prompt="共享题目{}".format(i)) for i in range(30))
        _, additions = plan_import(self.rows, original)
        self.assertFalse(any(q["subject"] == "英语" and q["grade"] == "三年级" for q in additions))
        for grade in GRADES:
            self.assertEqual(sum(q["subject"] == "科学" and q["grade"] == grade for q in additions), 270)
        self.assertEqual(len(original), len(baseline()) + 50)

    def test_existing_prompt_and_source_are_not_imported_twice(self):
        original = baseline()
        candidate = next(q for q in self.rows if q["subject"] == "英语" and q["grade"] == "一年级")
        previous = dict(candidate, source_record_id="different-origin", status="published")
        _, additions = plan_import(self.rows, original + [previous])
        self.assertFalse(any(q["prompt"] == candidate["prompt"] and q["grade"] == candidate["grade"] for q in additions))
        _, additions = plan_import(self.rows, original + [dict(candidate, status="published")])
        self.assertFalse(any(q["source_record_id"] == candidate["source_record_id"] for q in additions))

    def test_insufficient_candidates_fail_before_writing(self):
        with self.assertRaisesRegex(ValueError, "Insufficient candidates"):
            plan_import(self.rows, [])


if __name__ == "__main__":
    unittest.main()
