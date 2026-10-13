"""MySQL storage for learner profiles, learning activity, points and pets.

Legacy SQLite rows are copied once with INSERT IGNORE semantics. The SQLite
file is intentionally retained as a backup; it is no longer used at runtime.
"""
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

from db import DB_PATH, init_db as init_legacy_db
from mysql_db import DB_NAME, _settings


class Store:
    def __init__(self, connection):
        self.connection = connection
        self.learner_id = None

    def set_learner_id(self, learner_id):
        self.learner_id = int(learner_id)
        cursor = self.connection.cursor()
        cursor.execute("SET @fufu_learner_id=%s", (self.learner_id,))

    def execute(self, sql, params=()):
        sql = sql.replace("?", "%s")
        # Scope remaining legacy singleton statements to the authenticated child.
        if self.learner_id is not None:
            sql = re.sub(r"\b(id|pet_id)=1\b", r"\1=@fufu_learner_id", sql, flags=re.I)
            sql = re.sub(r"VALUES\(1,", "VALUES(@fufu_learner_id,", sql, flags=re.I)
        sql = re.sub(r"\bmax\(0,\s*([^()]+)\)", r"GREATEST(0, \1)", sql, flags=re.I)
        sql = re.sub(r"\bmin\(100,\s*([^()]+)\)", r"LEAST(100, \1)", sql, flags=re.I)
        cursor = self.connection.cursor()
        cursor.execute(sql, params)
        return cursor


@contextmanager
def connect():
    conn = pymysql.connect(**_settings())
    try:
        yield Store(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = {
    "story_readings": """CREATE TABLE IF NOT EXISTS story_readings (
        learner_id BIGINT NOT NULL, story_id BIGINT UNSIGNED NOT NULL,
        story_version DATETIME NOT NULL, next_page INT UNSIGNED NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL,
        ledger_id BIGINT NULL, PRIMARY KEY(learner_id,story_id),
        INDEX idx_story_readings_completed(learner_id,completed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "parent_point_grants": """CREATE TABLE IF NOT EXISTS parent_point_grants (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_account_id BIGINT NOT NULL,
        request_id CHAR(32) NOT NULL, learner_id BIGINT NOT NULL, amount INT NOT NULL,
        reason VARCHAR(200) NOT NULL, balance_before INT NOT NULL, balance_after INT NOT NULL,
        actor_name VARCHAR(80) NOT NULL, ledger_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_parent_grant_request(actor_account_id,request_id),
        INDEX idx_parent_grants_learner(learner_id,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "questions": """CREATE TABLE IF NOT EXISTS questions (
        id BIGINT NOT NULL PRIMARY KEY, subject VARCHAR(80) NOT NULL, stage VARCHAR(80) NOT NULL,
        title VARCHAR(200) NOT NULL, prompt TEXT NOT NULL, options JSON NOT NULL,
        answer VARCHAR(500) NOT NULL, explanation TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "profile": """CREATE TABLE IF NOT EXISTS profile (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, child_name VARCHAR(60) NOT NULL DEFAULT '福福',
        points INT NOT NULL DEFAULT 120, pet_name VARCHAR(60) NOT NULL DEFAULT '团团',
        pet_xp INT NOT NULL DEFAULT 0, learning_stage VARCHAR(40) NOT NULL DEFAULT '未设置',
        grade VARCHAR(40) NOT NULL DEFAULT '', account_id BIGINT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "user_accounts": """CREATE TABLE IF NOT EXISTS user_accounts (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL,
        password_hash VARCHAR(255) NOT NULL, account_type VARCHAR(20) NOT NULL,
        role VARCHAR(40) NOT NULL, display_name VARCHAR(80) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_accounts_username(username), INDEX idx_user_type(account_type,status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "user_sessions": """CREATE TABLE IF NOT EXISTS user_sessions (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, account_id BIGINT NOT NULL, learner_id BIGINT NULL,
        token_hash CHAR(64) NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_session_token(token_hash), INDEX idx_session_expiry(expires_at), INDEX idx_session_account(account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "ledger": """CREATE TABLE IF NOT EXISTS ledger (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(80) NOT NULL, amount INT NOT NULL,
        description VARCHAR(500) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ledger_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "admin_audit_logs": """CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_account_id BIGINT NULL,
        actor_name VARCHAR(80) NOT NULL, action VARCHAR(80) NOT NULL,
        target_type VARCHAR(40) NOT NULL, target_id VARCHAR(80) NOT NULL,
        detail TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin_audit_created(created_at), INDEX idx_admin_audit_target(target_type,target_id),
        INDEX idx_admin_audit_actor(actor_account_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "redemption_orders": """CREATE TABLE IF NOT EXISTS redemption_orders (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, account_id BIGINT NOT NULL,
        learner_id BIGINT NOT NULL, item_name VARCHAR(160) NOT NULL, points INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending', note VARCHAR(500) NOT NULL DEFAULT '',
        created_by BIGINT NULL, processed_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, processed_at DATETIME NULL,
        INDEX idx_redemption_status_created(status,created_at), INDEX idx_redemption_account(account_id,created_at),
        INDEX idx_redemption_learner(learner_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "completions": """CREATE TABLE IF NOT EXISTS completions (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, question_id BIGINT NOT NULL, correct TINYINT NOT NULL,
        points_delta INT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_completions_created(created_at), INDEX idx_completions_question(question_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "pet_state": """CREATE TABLE IF NOT EXISTS pet_state (
        id BIGINT NOT NULL PRIMARY KEY, hunger INT NOT NULL DEFAULT 35, happiness INT NOT NULL DEFAULT 65,
        accessory VARCHAR(100) NOT NULL DEFAULT '', last_action VARCHAR(255) NOT NULL DEFAULT '等你来陪我玩',
        pet_model VARCHAR(80) NOT NULL DEFAULT 'clay_explorer', equipment_migrated TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "store_items": """CREATE TABLE IF NOT EXISTS store_items (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, emoji VARCHAR(32) NOT NULL,
        description VARCHAR(500) NOT NULL, price INT NOT NULL, kind VARCHAR(40) NOT NULL,
        pet_model VARCHAR(80) NOT NULL DEFAULT '', zoo_animal_id VARCHAR(40) NOT NULL DEFAULT '',
        equip_slot VARCHAR(20) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "owned_items": """CREATE TABLE IF NOT EXISTS owned_items (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, item_id BIGINT NOT NULL UNIQUE, purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "pet_equipment": """CREATE TABLE IF NOT EXISTS pet_equipment (
        pet_id BIGINT NOT NULL, slot VARCHAR(20) NOT NULL, item_id BIGINT NOT NULL,
        PRIMARY KEY(pet_id,slot), INDEX idx_pet_equipment_item(item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    "game_rewards": """CREATE TABLE IF NOT EXISTS game_rewards (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, game VARCHAR(40) NOT NULL,
        played_on DATE NOT NULL, UNIQUE KEY uq_game_day(game,played_on)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
}


def initialize():
    if not os.getenv("FUFU_MYSQL_PASSWORD"):
        raise RuntimeError("Set FUFU_MYSQL_PASSWORD before starting the backend")
    with mysql_connection() as conn:
        with conn.cursor() as cur:
            for statement in SCHEMA.values():
                cur.execute(statement)
            # Additive account ownership field keeps the existing learner intact.
            cur.execute("SHOW COLUMNS FROM profile LIKE 'account_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE profile ADD COLUMN account_id BIGINT NULL")
            cur.execute("SHOW COLUMNS FROM profile LIKE 'id'")
            profile_id_column = cur.fetchone()
            if profile_id_column and "auto_increment" not in str(profile_id_column.get("Extra", "")):
                cur.execute("ALTER TABLE profile MODIFY id BIGINT NOT NULL AUTO_INCREMENT")
            for table in ("ledger", "completions", "owned_items", "game_rewards"):
                cur.execute(f"SHOW COLUMNS FROM `{table}` LIKE 'learner_id'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE `{table}` ADD COLUMN learner_id BIGINT NOT NULL DEFAULT 1")
            cur.execute("SHOW COLUMNS FROM user_sessions LIKE 'learner_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE user_sessions ADD COLUMN learner_id BIGINT NULL")
            # Make owned rewards and daily game rewards unique per learner, retaining the legacy learner's rows.
            cur.execute("SHOW INDEX FROM owned_items")
            owned_indexes = cur.fetchall()
            if any(index["Key_name"] == "item_id" and not index["Non_unique"] for index in owned_indexes):
                cur.execute("ALTER TABLE owned_items DROP INDEX item_id")
            if not any(index["Key_name"] == "uq_owned_learner_item" for index in owned_indexes):
                cur.execute("ALTER TABLE owned_items ADD UNIQUE KEY uq_owned_learner_item(learner_id,item_id)")
            cur.execute("SHOW INDEX FROM game_rewards")
            reward_indexes = cur.fetchall()
            if any(index["Key_name"] == "uq_game_day" for index in reward_indexes):
                cur.execute("ALTER TABLE game_rewards DROP INDEX uq_game_day")
            if not any(index["Key_name"] == "uq_learner_game_day" for index in reward_indexes):
                cur.execute("ALTER TABLE game_rewards ADD UNIQUE KEY uq_learner_game_day(learner_id,game,played_on)")
            cur.execute("SHOW COLUMNS FROM pet_state LIKE 'pet_model'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE pet_state ADD COLUMN pet_model VARCHAR(80) NOT NULL DEFAULT 'clay_explorer'")
            cur.execute("SHOW COLUMNS FROM store_items LIKE 'pet_model'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE store_items ADD COLUMN pet_model VARCHAR(80) NOT NULL DEFAULT ''")
            cur.execute("SHOW COLUMNS FROM store_items LIKE 'zoo_animal_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE store_items ADD COLUMN zoo_animal_id VARCHAR(40) NOT NULL DEFAULT ''")
            cur.execute("SHOW COLUMNS FROM store_items LIKE 'equip_slot'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE store_items ADD COLUMN equip_slot VARCHAR(20) NOT NULL DEFAULT ''")
            cur.execute("SHOW COLUMNS FROM pet_state LIKE 'equipment_migrated'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE pet_state ADD COLUMN equipment_migrated TINYINT NOT NULL DEFAULT 0")
            # Additive question-bank schema. Existing rows remain usable as wildcard-grade questions.
            question_columns = {
                "grade": "VARCHAR(40) NOT NULL DEFAULT '*'",
                "knowledge_point": "VARCHAR(160) NOT NULL DEFAULT ''",
                "difficulty": "VARCHAR(20) NOT NULL DEFAULT 'medium'",
                "question_type": "VARCHAR(30) NOT NULL DEFAULT 'single_choice'",
                "prompt_audio": "VARCHAR(1000) NOT NULL DEFAULT ''",
                "hint": "TEXT NULL",
                "hint_audio": "VARCHAR(1000) NOT NULL DEFAULT ''",
                "explanation_audio": "VARCHAR(1000) NOT NULL DEFAULT ''",
                "status": "VARCHAR(20) NOT NULL DEFAULT 'published'",
                "source_record_id": "VARCHAR(160) NULL",
                "source_name": "VARCHAR(120) NOT NULL DEFAULT ''",
                "source_url": "VARCHAR(1000) NOT NULL DEFAULT ''",
                "source_license": "VARCHAR(80) NOT NULL DEFAULT ''",
                "source_attribution": "TEXT NULL",
                "source_metadata": "JSON NULL",
                "updated_at": "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            }
            for column, definition in question_columns.items():
                cur.execute(f"SHOW COLUMNS FROM questions LIKE '{column}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE questions ADD COLUMN {column} {definition}")
            cur.execute("SHOW INDEX FROM questions WHERE Key_name='uq_question_source_record'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE questions ADD UNIQUE KEY uq_question_source_record(source_record_id)")
            cur.execute("SHOW INDEX FROM questions WHERE Key_name='idx_question_catalog'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE questions ADD INDEX idx_question_catalog(status,stage,grade,subject,id)")
            for table, name, columns in (
                ('completions','idx_completion_learner_date','learner_id,created_at,question_id'),
                ('completions','idx_completion_learner_id','learner_id,id'),
                ('ledger','idx_ledger_learner_id','learner_id,id'),
            ):
                cur.execute("SHOW INDEX FROM `" + table + "` WHERE Key_name=%s", (name,))
                if not cur.fetchone():
                    cur.execute("ALTER TABLE `" + table + "` ADD INDEX `" + name + "` (" + columns + ")")
            cur.execute("""CREATE TABLE IF NOT EXISTS question_options (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, question_id BIGINT NOT NULL,
                option_key VARCHAR(20) NOT NULL, option_text VARCHAR(1000) NOT NULL,
                image_url VARCHAR(1000) NOT NULL DEFAULT '', audio_url VARCHAR(1000) NOT NULL DEFAULT '',
                is_correct TINYINT NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0,
                UNIQUE KEY uq_question_option(question_id,option_key), INDEX idx_option_question(question_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS quiz_sessions (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, subject VARCHAR(80) NOT NULL,
                stage VARCHAR(80) NOT NULL, grade VARCHAR(40) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL,
                INDEX idx_quiz_created(created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("SHOW COLUMNS FROM quiz_sessions LIKE 'learner_id'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE quiz_sessions ADD COLUMN learner_id BIGINT NOT NULL DEFAULT 1")
            cur.execute("SHOW INDEX FROM quiz_sessions WHERE Key_name='idx_quiz_learner'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE quiz_sessions ADD INDEX idx_quiz_learner(learner_id,id)")
            cur.execute("""CREATE TABLE IF NOT EXISTS quiz_session_questions (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, session_id BIGINT NOT NULL, question_id BIGINT NOT NULL,
                position INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', wrong_attempts INT NOT NULL DEFAULT 0,
                UNIQUE KEY uq_session_question(session_id,question_id), UNIQUE KEY uq_session_position(session_id,position),
                INDEX idx_session_question_id(question_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("""CREATE TABLE IF NOT EXISTS question_attempts (
                id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, session_question_id BIGINT NOT NULL,
                selected_option VARCHAR(20) NOT NULL DEFAULT '', answer_text TEXT NULL, is_correct TINYINT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_attempt_item(session_question_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
            cur.execute("SHOW COLUMNS FROM question_attempts LIKE 'answer_text'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE question_attempts ADD COLUMN answer_text TEXT NULL")
            cur.execute("SHOW COLUMNS FROM question_attempts LIKE 'selected_option'")
            selected_option_column = cur.fetchone()
            if selected_option_column and "DEFAULT" not in str(selected_option_column.get("Default")):
                cur.execute("ALTER TABLE question_attempts MODIFY selected_option VARCHAR(20) NOT NULL DEFAULT ''")
            # Idempotently normalize legacy JSON options and mark the matching answer.
            cur.execute("SELECT id,options,answer FROM questions")
            for row in cur.fetchall():
                cur.execute("SELECT id FROM question_options WHERE question_id=%s LIMIT 1", (row["id"],))
                if cur.fetchone():
                    continue
                options = row["options"]
                if isinstance(options, str):
                    import json
                    options = json.loads(options)
                for index, option in enumerate(options or []):
                    key = str(index + 1)
                    label = str(option)
                    cur.execute("INSERT IGNORE INTO question_options(question_id,option_key,option_text,is_correct,sort_order) VALUES(%s,%s,%s,%s,%s)",
                                (row["id"], key, label, int(label == str(row["answer"])), index))
        conn.commit()
    migrate_sqlite()
    from curriculum import initialize as initialize_curriculum
    from daily_plan import initialize as initialize_daily_plan
    with connect() as db:
        initialize_curriculum(db)
        initialize_daily_plan(db)
    animals = [
        ('snake', '黏土小蛇', '🐍', 12), ('lion', '黏土狮子', '🦁', 0),
        ('giraffe', '黏土长颈鹿', '🦒', 30), ('bird', '黏土小鸟', '🐦', 6),
        ('zebra', '黏土斑马', '🦓', 24), ('hippo', '黏土河马', '🦛', 28),
        ('fish', '黏土小鱼', '🐟', 10), ('crocodile', '黏土鳄鱼', '🐊', 32),
        ('elephant', '黏土大象', '🐘', 40), ('monkey', '黏土猴子', '🐵', 26),
    ]
    with mysql_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE pet_state SET pet_model=%s,last_action='黏土探险家准备出发啦' WHERE pet_model<>%s", ('clay_explorer', 'clay_explorer'))
            cur.execute("SELECT id FROM store_items WHERE kind='pet' AND pet_model='clay_explorer' LIMIT 1")
            starter = cur.fetchone()
            if not starter:
                cur.execute("INSERT INTO store_items(name,emoji,description,price,kind,pet_model) VALUES(%s,%s,%s,%s,%s,%s)",
                            ('黏土探险家', '🧒', '来自黏土世界的小伙伴，一起学习与探险。', 0, 'pet', 'clay_explorer'))
                starter = {'id': cur.lastrowid}
            cur.execute("UPDATE store_items SET emoji='🧒' WHERE id=%s AND emoji='🧑‍🌾'", (starter['id'],))
            cur.execute("INSERT IGNORE INTO owned_items(item_id) VALUES(%s)", (starter['id'],))
            for animal_id, name, emoji, price in animals:
                cur.execute("SELECT id FROM store_items WHERE kind='zoo_animal' AND zoo_animal_id=%s LIMIT 1", (animal_id,))
                row = cur.fetchone()
                if not row:
                    cur.execute("INSERT INTO store_items(name,emoji,description,price,kind,zoo_animal_id) VALUES(%s,%s,%s,%s,'zoo_animal',%s)",
                                (name, emoji, '兑换后在黏土动物园里认识这位新朋友。', price, animal_id))
                    row = {'id': cur.lastrowid}
                if animal_id == 'lion':
                    cur.execute("INSERT IGNORE INTO owned_items(item_id) VALUES(%s)", (row['id'],))
            accessories = [
                ('黏土蝴蝶结', '🎀', '柔软的粉色蝴蝶结，戴在探险家的头发上。', 6, 'head'),
                ('星星胸针', '🌟', '一枚会闪亮的黄色星星，别在胸前。', 12, 'chest'),
                ('探险小背包', '🎒', '跟着小伙伴一起出发的黏土背包。', 16, 'outer'),
                ('花朵发夹', '🌼', '一朵温柔的黏土小花，别在头发上。', 10, 'head'),
                ('探险小圆帽', '🧢', '手捏的薄荷色小帽子，出门探险刚刚好。', 10, 'head'),
                ('软软黏土鞋', '👟', '一双奶油色小鞋子，陪团团走遍动物园。', 10, 'feet'),
                ('彩虹小围巾', '🧣', '软软的彩虹围巾，围在团团脖子上。', 12, 'neck'),
                ('圆圆太阳镜', '🕶️', '两片圆圆镜片，戴上就是小探险家。', 14, 'face'),
            ]
            for name, emoji, description, price, slot in accessories:
                cur.execute("SELECT id FROM store_items WHERE kind='wearable' AND name=%s LIMIT 1", (name,))
                if not cur.fetchone():
                    cur.execute("INSERT INTO store_items(name,emoji,description,price,kind,equip_slot) VALUES(%s,%s,%s,%s,'wearable',%s)", (name, emoji, description, price, slot))
            for name, slot in [('闪亮铃铛', 'neck'), ('星星披风', 'outer'), ('黏土蝴蝶结', 'head'),
                               ('星星胸针', 'chest'), ('探险小背包', 'outer'), ('花朵发夹', 'head')]:
                cur.execute("UPDATE store_items SET equip_slot=%s WHERE kind='wearable' AND name=%s AND equip_slot IN ('','neck')",
                            (slot, name))
            cur.execute("""SELECT e.pet_id,e.slot,e.item_id,i.equip_slot FROM pet_equipment e
                JOIN store_items i ON i.id=e.item_id WHERE e.slot<>i.equip_slot""")
            for worn in cur.fetchall():
                if not worn['equip_slot']:
                    continue
                cur.execute("SELECT item_id FROM pet_equipment WHERE pet_id=%s AND slot=%s",
                            (worn['pet_id'], worn['equip_slot']))
                if cur.fetchone():
                    cur.execute("DELETE FROM pet_equipment WHERE pet_id=%s AND slot=%s AND item_id=%s",
                                (worn['pet_id'], worn['slot'], worn['item_id']))
                else:
                    cur.execute("UPDATE pet_equipment SET slot=%s WHERE pet_id=%s AND slot=%s AND item_id=%s",
                                (worn['equip_slot'], worn['pet_id'], worn['slot'], worn['item_id']))
            cur.execute("UPDATE store_items SET description=%s WHERE kind='wearable' AND name=%s AND description=%s",
                        ('柔软的粉色蝴蝶结，戴在探险家的头发上。', '黏土蝴蝶结', '柔软的粉色蝴蝶结，戴在探险家的帽子上。'))
            cur.execute("UPDATE store_items SET description=%s WHERE kind='wearable' AND name=%s AND description=%s",
                        ('一朵温柔的黏土小花，别在头发上。', '花朵发夹', '一朵温柔的黏土小花，装点帽檐。'))
            cur.execute("SELECT accessory,equipment_migrated FROM pet_state WHERE id=1 FOR UPDATE")
            pet = cur.fetchone()
            if pet and not pet['equipment_migrated']:
                if pet['accessory']:
                    cur.execute("""SELECT i.id,i.equip_slot FROM store_items i JOIN owned_items o ON o.item_id=i.id
                        WHERE i.kind='wearable' AND BINARY i.emoji=BINARY %s AND i.equip_slot<>'' LIMIT 1""", (pet['accessory'],))
                    old_item = cur.fetchone()
                    if old_item:
                        cur.execute("INSERT IGNORE INTO pet_equipment(pet_id,slot,item_id) VALUES(1,%s,%s)",
                                    (old_item['equip_slot'], old_item['id']))
                cur.execute("UPDATE pet_state SET equipment_migrated=1 WHERE id=1")
        conn.commit()


@contextmanager
def mysql_connection():
    conn = pymysql.connect(**_settings())
    try:
        yield conn
    finally:
        conn.close()


def migrate_sqlite():
    init_legacy_db()
    if not DB_PATH.exists():
        return
    source = sqlite3.connect(DB_PATH)
    source.row_factory = sqlite3.Row
    try:
        with mysql_connection() as target:
            with target.cursor() as cur:
                for table, columns in {
                    "questions": "id,subject,stage,title,prompt,options,answer,explanation",
                    "profile": "id,child_name,points,pet_name,pet_xp,learning_stage,grade",
                    "ledger": "id,kind,amount,description,created_at",
                    "completions": "id,question_id,correct,points_delta,created_at",
                    "pet_state": "id,hunger,happiness,accessory,last_action,pet_model",
                    "store_items": "id,name,emoji,description,price,kind,pet_model",
                    "owned_items": "id,item_id,purchased_at",
                    "game_rewards": "game,played_on",
                }.items():
                    rows = source.execute(f"SELECT {columns} FROM {table}").fetchall()
                    if not rows:
                        continue
                    if table == "store_items":
                        rows = [row for row in rows if row["kind"] != "pet" or row["pet_model"] == "cat_pilot"]
                    allowed_owned_item_ids = None
                    if table == "owned_items":
                        allowed_owned_item_ids = {
                            row["id"] for row in source.execute(
                                "SELECT id FROM store_items WHERE kind<>'pet' OR pet_model='cat_pilot'"
                            )
                        }
                    names = columns.split(",")
                    placeholders = ",".join(["%s"] * len(names))
                    sql = f"INSERT IGNORE INTO {table} ({columns}) VALUES ({placeholders})"
                    for row in rows:
                        vals = [row[name] for name in names]
                        if table == "pet_state":
                            vals[-1] = "cat_pilot"
                        if table == "owned_items" and vals[1] not in allowed_owned_item_ids:
                            continue
                        if table == "questions":
                            vals[6] = str(vals[6])
                        cur.execute(sql, vals)
            target.commit()
    finally:
        source.close()
