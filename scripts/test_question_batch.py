"""Verify batch reads are bounded and preserve the public answer-free contract."""
import sys, unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parent.parent/'backend'))
from server import Handler

class QuestionBatchTests(unittest.TestCase):
    def test_two_queries_group_options_without_exposing_answers(self):
        db = Mock()
        db.execute.side_effect = [Mock(fetchall=lambda:[{'id':4,'prompt':'题目四'},{'id':2,'prompt':'题目二'}]),
                                  Mock(fetchall=lambda:[{'question_id':2,'key':'A','text':'选项一'},{'question_id':4,'key':'B','text':'选项二'}])]
        handler = object.__new__(Handler)
        items = handler.public_questions(db,[2,4])
        self.assertEqual(db.execute.call_count,2)
        self.assertEqual(items[2]['options'],[{'key':'A','text':'选项一'}])
        self.assertEqual(items[4]['options'][0]['key'],'B')
        for call in db.execute.call_args_list:
            sql=call.args[0].lower()
            self.assertNotIn('is_correct',sql)
            self.assertNotIn('answer',sql)
        self.assertEqual(handler.public_questions(db,[]),{})
        self.assertEqual(db.execute.call_count,2)

if __name__=='__main__': unittest.main()
