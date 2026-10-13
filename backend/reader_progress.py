"""Private per-learner vocabulary status; never trust learner IDs from clients."""
from mysql_db import connection
from reader_lessons import SOURCE

def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS reader_progress (
                learner_id BIGINT NOT NULL, question_id BIGINT NOT NULL,
                memory_status VARCHAR(16) NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(learner_id,question_id),
                INDEX idx_reader_status(learner_id,memory_status,updated_at))''')
            cur.execute("SHOW TABLES LIKE 'completions'")
            if cur.fetchone():
                cur.execute('''INSERT IGNORE INTO reader_progress(learner_id,question_id,memory_status)
                    SELECT DISTINCT c.learner_id,c.question_id,'review' FROM completions c
                    JOIN questions q ON q.id=c.question_id
                    WHERE c.correct=1 AND q.source_name=%s AND q.status='published' ''',(SOURCE,))
        conn.commit()

def list_progress(db,learner_id):
    rows=db.execute('''SELECT p.question_id,p.memory_status FROM reader_progress p
        JOIN questions q ON q.id=p.question_id AND q.source_name=? AND q.status='published'
        WHERE p.learner_id=?''',(SOURCE,learner_id)).fetchall()
    return dict(items=[dict(question_id=int(r['question_id']),status=r['memory_status']) for r in rows])

def save_progress(db,learner_id,body):
    if not isinstance(body,dict):raise ValueError('无效标记请求')
    values=body.get('items')
    if not isinstance(values,list) or not 1<=len(values)<=5:raise ValueError('一次请标记1至5个字词')
    validated=[]
    for item in values:
        if not isinstance(item,dict):raise ValueError('无效标记')
        qid=item.get('question_id');status=item.get('status')
        if isinstance(qid,bool) or not isinstance(qid,int) or status not in {'review','mastered','new'}:raise ValueError('无效字词或记忆状态')
        if qid in [q for q,_ in validated]:raise ValueError('不能重复标记')
        if not db.execute("SELECT id FROM questions WHERE id=? AND source_name=? AND status='published'",(qid,SOURCE)).fetchone():raise ValueError('字词不存在')
        # A status can only be saved after this child actually completed the word.
        if status!='new' and not db.execute('SELECT id FROM completions WHERE learner_id=? AND question_id=? AND correct=1 LIMIT 1',(learner_id,qid)).fetchone():raise ValueError('请先完成这个字词的练习')
        validated.append((qid,status))
    for qid,status in validated:
        db.execute('''INSERT INTO reader_progress(learner_id,question_id,memory_status)
            VALUES(?,?,?) ON DUPLICATE KEY UPDATE memory_status=VALUES(memory_status),updated_at=NOW()''',(learner_id,qid,status))
    return dict(ok=True,items=[dict(question_id=q,status=s) for q,s in validated])
