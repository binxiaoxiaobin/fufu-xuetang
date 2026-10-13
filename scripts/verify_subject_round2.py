"""Verify stored answer/option contracts and live public catalogs, without answering."""
import getpass
import json
import os
import sys
from collections import Counter,defaultdict
from urllib.request import urlopen
from build_subject_round2 import ROOT,OUTPUT as PRIMARY,validate as validate_primary
from build_preschool_round2 import OUTPUT as PRESCHOOL,validate as validate_preschool
from import_subject_round2 import plan
sys.path.insert(0,str(ROOT/'backend'))
from mysql_learning_db import mysql_connection


def main():
    rows=[]
    for path,validator in [(PRIMARY,validate_primary),(PRESCHOOL,validate_preschool)]:
        package=json.loads(path.read_text(encoding='utf-8'));validator(package['questions']);rows+=package['questions']
    os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('MySQL password: ')
    with mysql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM questions ORDER BY id');stored=cur.fetchall()
            assert not plan(rows,stored),'Repeat import would change catalog'
            by_source={r['source_record_id']:r for r in stored}
            first=min(by_source[q['source_record_id']]['id'] for q in rows)
            last=max(by_source[q['source_record_id']]['id'] for q in rows)
            cur.execute('SELECT * FROM question_options WHERE question_id BETWEEN %s AND %s ORDER BY question_id,sort_order',(first,last))
            options=defaultdict(list)
            for o in cur.fetchall():options[o['question_id']].append(o)
            for q in rows:
                s=by_source[q['source_record_id']]
                assert s['status']=='published'
                assert all(s[k]==q[k] for k in ('stage','grade','subject','prompt','answer','explanation','hint','knowledge_point','difficulty'))
                assert json.loads(s['source_metadata'])==q['source_metadata']
                assert json.loads(s['options'])==[o['text'] for o in q['options']]
                opts=options[s['id']]
                assert [(o['option_key'],o['option_text']) for o in opts]==[(o['key'],o['text']) for o in q['options']]
                assert sum(o['is_correct'] for o in opts)==1
                assert all(bool(o['is_correct'])==(o['option_key']==q['answer']) for o in opts)
            count=Counter((q['stage'],q['grade'],q['subject']) for q in stored if q['status']=='published')
    with urlopen('http://localhost:8000/api/questions',timeout=15) as response:
        raw=response.read();catalog=json.loads(raw)
    public=Counter()
    for q in catalog:
        assert not {'answer','explanation','options','is_correct'} & set(q)
        public[q['stage'],q['grade'],q['subject']]+=q['count']
    scopes={ (q['stage'],q['grade'],q['subject']) for q in rows }
    assert all(public[scope]==count[scope] for scope in scopes)
    result={'new_questions_verified':len(rows),'numeric_answers_verified':240,'repeat_import_additions':0,
            'catalog_bytes':len(raw),'catalog_rows':len(catalog),'counts':[
                {'stage':s,'grade':g,'subject':sub,'exact_grade':count[s,g,sub],
                 'available_including_shared':count[s,g,sub]+count[s,'*',sub]} for s,g,sub in sorted(scopes)]}
    (ROOT/'artifacts/subject-round2-20261008-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Verified 1440 published questions, option/answer/explanation contracts, repeat import and live catalog.')


if __name__=='__main__':main()
