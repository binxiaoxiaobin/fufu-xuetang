"""Append original companion speech; preserve published/editor-managed lines."""
import getpass
import json
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from mysql_db import connection

def main():
    payload=json.loads((ROOT/'content/companion/tuantuan-lines-20261008.json').read_text(encoding='utf-8'))
    assert len(payload['lines'])==30 and len(payload['songs'])==6
    bodies=payload['lines']+[s['lyrics'] for s in payload['songs']]
    assert len(set(bodies))==36 and all(0<len(s)<100 for s in bodies)
    os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('MySQL password: ')
    with connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT GET_LOCK(%s,10) AS acquired',('fufu_tuantuan_lines',))
                assert cur.fetchone()['acquired']==1
                cur.execute("SELECT i.id,s.id AS segment_id,s.body FROM content_items i JOIN content_segments s ON s.item_id=i.id WHERE i.kind='companion' ORDER BY i.id,s.id")
                old=cur.fetchall()
                (ROOT/'artifacts/tuantuan-lines-before-20261008.json').write_text(json.dumps(old,ensure_ascii=False,default=str),encoding='utf-8') if not (ROOT/'artifacts/tuantuan-lines-before-20261008.json').exists() else None
                added=0
                for kind,segments in [('encouragement',[{'title':'团团的话语','body':line} for line in payload['lines']]),('song',[{'title':s['title'],'body':s['lyrics']} for s in payload['songs']])]:
                    slug='tuantuan-20261008-'+kind
                    cur.execute('SELECT id FROM content_items WHERE slug=%s',(slug,))
                    if cur.fetchone():continue
                    cur.execute("INSERT INTO content_items(slug,kind,title,summary,category,status) VALUES(%s,'companion',%s,%s,%s,'published')",(slug,'团团原创伙伴话语' if kind=='encouragement' else '团团原创短谣','点击团团随机播放；福福学堂原创',kind))
                    item=cur.lastrowid
                    cur.executemany('INSERT INTO content_segments(item_id,chapter_no,position,title,body) VALUES(%s,1,%s,%s,%s)',[(item,i,s['title'],s['body']) for i,s in enumerate(segments)])
                    added+=len(segments)
                for r in old:
                    cur.execute('SELECT body FROM content_segments WHERE id=%s',(r['segment_id'],))
                    assert cur.fetchone()['body']==r['body']
                cur.execute("SELECT COUNT(*) AS n FROM content_segments s JOIN content_items i ON i.id=s.item_id WHERE i.slug IN ('tuantuan-20261008-encouragement','tuantuan-20261008-song')")
                assert cur.fetchone()['n']==36
                conn.commit()
                cur.execute('SELECT RELEASE_LOCK(%s)',('fufu_tuantuan_lines',))
                print('New published companion lines:',added,'; existing content preserved.')
        except Exception:
            conn.rollback();raise

if __name__=='__main__':main()
