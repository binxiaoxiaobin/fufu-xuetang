"""Read-only snapshot of generated content associations; no learner records."""
import getpass
import json
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ['FUFU_MYSQL_PASSWORD']=getpass.getpass('Local MySQL password: ')
from mysql_db import connection
result={}
with connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS total,SUM(s.audio_asset_id IS NOT NULL) AS linked FROM content_segments s "
                    "JOIN content_items i ON i.id=s.item_id WHERE i.kind='companion' AND i.status='published'")
        result['companion']=cur.fetchone()
        cur.execute("SELECT COUNT(*) AS total,SUM(audio_asset_id IS NOT NULL) AS linked FROM learning_reading_cards "
                    "WHERE kind='science' AND position<65535")
        result['science']=cur.fetchone()
        cur.execute("SELECT COUNT(*) AS total,SUM(prompt_audio<>'') AS prompt_linked,SUM(explanation_audio<>'') AS explanation_linked "
                    "FROM questions WHERE status='published'")
        result['questions']=cur.fetchone()
        cur.execute("SELECT s.id,s.paragraphs,COUNT(l.asset_id) AS linked FROM stories s LEFT JOIN story_media_links l "
                    "ON l.story_id=s.id AND l.role='audio' GROUP BY s.id")
        stories=cur.fetchall()
        result['stories']={'total':len(stories),'complete':sum(len(json.loads(s['paragraphs']))==s['linked'] for s in stories)}
        cur.execute("SELECT public_path FROM media_assets WHERE public_path LIKE '/assets/audio/tts/consistent-20261009/%' "
                    "OR public_path LIKE '/assets/audio/learning-science/%'")
        paths=[row['public_path'] for row in cur.fetchall()]
        result['generated_assets']=len(paths)
        result['missing_files']=[path for path in paths if not (ROOT/'frontend'/path.lstrip('/')).is_file()]
(ROOT/'artifacts/speech-generation-links.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=int),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True,default=int))
