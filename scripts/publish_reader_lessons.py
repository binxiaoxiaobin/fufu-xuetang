import getpass,os,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('MySQL password: ')
import reader_lessons
reader_lessons.initialize()
for subject in ('语文','英语'):
    data=reader_lessons.list_lessons(subject)
    expected=sum(item['subject']==subject for item in json.loads(reader_lessons.SEED.read_text(encoding='utf-8')))
    assert data['total']==expected and expected>=300
    assert all('grade' not in item and 'stage' not in item for item in data['items'])
    print(subject,':',data['total'],'lessons; topic/difficulty only')
