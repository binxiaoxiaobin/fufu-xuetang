"""Small textbook directories; questions remain in the shared assessed question bank."""
import re

# This directory contains primary textbooks; selecting a book is independent
# of the learner's daily practice stage.
PRACTICE_STAGE = '小学'

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS curriculum_books (
        id VARCHAR(60) PRIMARY KEY, subject VARCHAR(80) NOT NULL,
        stage VARCHAR(40) NOT NULL, grade VARCHAR(40) NOT NULL,
        term VARCHAR(20) NOT NULL, edition VARCHAR(120) NOT NULL,
        title VARCHAR(160) NOT NULL, source_url VARCHAR(1000) NOT NULL,
        INDEX idx_book_scope(stage,grade,subject,term)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS curriculum_units (
        id VARCHAR(96) PRIMARY KEY, book_id VARCHAR(60) NOT NULL,
        title VARCHAR(160) NOT NULL, position INT NOT NULL,
        INDEX idx_unit_book(book_id,position),
        FOREIGN KEY (book_id) REFERENCES curriculum_books(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS curriculum_topics (
        id VARCHAR(120) PRIMARY KEY, unit_id VARCHAR(96) NOT NULL,
        title VARCHAR(160) NOT NULL, position INT NOT NULL,
        INDEX idx_topic_unit(unit_id,position),
        FOREIGN KEY (unit_id) REFERENCES curriculum_units(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    """CREATE TABLE IF NOT EXISTS question_curriculum (
        question_id BIGINT PRIMARY KEY, topic_id VARCHAR(120) NOT NULL,
        INDEX idx_topic_question(topic_id,question_id),
        FOREIGN KEY (question_id) REFERENCES questions(id),
        FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
]


def initialize(db):
    for statement in SCHEMA:
        db.execute(statement)


def quiz_filter(db, body, subject, stage, grade):
    """Derive practice grade from a real textbook; never change the learner profile."""
    topic = str(body.get('topic_id', '')).strip()
    unit = str(body.get('unit_id', '')).strip()
    if not topic and not unit:
        return '', [], None
    if topic and unit:
        raise ValueError('请选择一个知识点或一个单元')
    if not re.fullmatch(r'[a-z0-9.-]{1,120}', topic or unit):
        raise ValueError('教材目录编号无效')
    field = 't.id' if topic else 'u.id'
    params = [topic or unit, subject, PRACTICE_STAGE]
    valid = db.execute("""SELECT b.grade FROM curriculum_topics t
        JOIN curriculum_units u ON u.id=t.unit_id
        JOIN curriculum_books b ON b.id=u.book_id
        WHERE """ + field + "=? AND b.subject=? AND b.stage=? LIMIT 1", params).fetchone()
    if not valid:
        raise ValueError('所选教材知识点与科目不一致或目录不存在')
    if topic:
        clause = ' AND q.id IN (SELECT qc.question_id FROM question_curriculum qc WHERE qc.topic_id=?)'
    else:
        clause = ''' AND q.id IN (SELECT qc.question_id FROM question_curriculum qc
            JOIN curriculum_topics t ON t.id=qc.topic_id WHERE t.unit_id=?)'''
    return clause, [topic or unit], valid['grade']


def catalog(db, path, query, profile):
    """One directory level per request; no prompts, options or answer keys."""
    subject = query.get('subject', ['数学'])[0]
    if subject not in {'语文', '数学', '英语'}:
        raise ValueError('科目无效')
    grade = query.get('grade', [profile['grade']])[0]
    if grade not in {'一年级','二年级','三年级','四年级','五年级','六年级'}:
        return {'items': []}
    scope = [PRACTICE_STAGE, grade, subject]
    if path == '/api/curriculum/books':
        return {'items': list(db.execute("""SELECT id,title,subject,grade,term,edition,source_url
            FROM curriculum_books WHERE stage=? AND grade=? AND subject=?
            ORDER BY CASE term WHEN '上册' THEN 0 ELSE 1 END,id""", scope).fetchall())}
    match = re.fullmatch(r'/api/curriculum/(books|units)/([a-z0-9.-]{1,96})/(units|topics)', path)
    if not match:
        return None
    kind, identifier, level = match.groups()
    if (kind, level) == ('books', 'units'):
        rows = db.execute("""SELECT u.id,u.title,u.position,COUNT(DISTINCT t.id) AS topic_count,
            COUNT(q.id) AS question_count FROM curriculum_units u
            JOIN curriculum_books b ON b.id=u.book_id
            LEFT JOIN curriculum_topics t ON t.unit_id=u.id
            LEFT JOIN question_curriculum qc ON qc.topic_id=t.id
            LEFT JOIN questions q ON q.id=qc.question_id AND q.status='published'
            WHERE b.stage=? AND b.grade=? AND b.subject=? AND b.id=?
            GROUP BY u.id,u.title,u.position ORDER BY u.position""", scope + [identifier]).fetchall()
    elif (kind, level) == ('units', 'topics'):
        rows = db.execute("""SELECT t.id,t.title,t.position,COUNT(q.id) AS question_count
            FROM curriculum_topics t JOIN curriculum_units u ON u.id=t.unit_id
            JOIN curriculum_books b ON b.id=u.book_id
            LEFT JOIN question_curriculum qc ON qc.topic_id=t.id
            LEFT JOIN questions q ON q.id=qc.question_id AND q.status='published'
            WHERE b.stage=? AND b.grade=? AND b.subject=? AND u.id=?
            GROUP BY t.id,t.title,t.position ORDER BY t.position""", scope + [identifier]).fetchall()
    else:
        return None
    return {'items': list(rows)}
