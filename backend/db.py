import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "fufu.db"

SEED_QUESTIONS = [
    ("语文", "幼儿园", "声母小侦探", "听一听，‘妈妈’的第一个声音是哪一个？", ["m", "b", "a"], "m", "妈妈的第一个声音是 m。"),
    ("数学", "幼儿园", "数一数", "小兔有两根胡萝卜，又拿来一根，一共有几根？", ["2", "3", "4"], "3", "两根再添一根，一共三根。"),
    ("英语", "幼儿园", "字母你好", "哪个字母是 Apple 的第一个字母？", ["A", "B", "C"], "A", "Apple 的开头是字母 A。"),
    ("科学", "幼儿园", "小小观察家", "白天在天空中发光发热的是什么？", ["月亮", "太阳", "星星"], "太阳", "太阳在白天给我们光和热。"),
    ("数学", "小学", "口算小勇士", "3 × 4 等于多少？", ["7", "12", "14"], "12", "三乘四等于十二。"),
    ("语文", "小学", "词语花园", "‘春风又绿江南岸’描写的是哪个季节？", ["春天", "夏天", "冬天"], "春天", "诗句里有春风，描写的是春天。"),
]

def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY, subject TEXT NOT NULL, stage TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, options TEXT NOT NULL, answer TEXT NOT NULL, explanation TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), child_name TEXT NOT NULL DEFAULT '福福', points INTEGER NOT NULL DEFAULT 120, pet_name TEXT NOT NULL DEFAULT '团团', pet_xp INTEGER NOT NULL DEFAULT 0, learning_stage TEXT NOT NULL DEFAULT '未设置', grade TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
        CREATE TABLE IF NOT EXISTS completions (id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL, correct INTEGER NOT NULL, points_delta INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), FOREIGN KEY(question_id) REFERENCES questions(id));
        CREATE TABLE IF NOT EXISTS pet_state (id INTEGER PRIMARY KEY CHECK(id=1), hunger INTEGER NOT NULL DEFAULT 35, happiness INTEGER NOT NULL DEFAULT 65, accessory TEXT NOT NULL DEFAULT '', last_action TEXT NOT NULL DEFAULT '等你来陪我玩', pet_model TEXT NOT NULL DEFAULT 'cat_pilot');
        CREATE TABLE IF NOT EXISTS store_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, description TEXT NOT NULL, price INTEGER NOT NULL, kind TEXT NOT NULL, pet_model TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS owned_items (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL UNIQUE REFERENCES store_items(id), purchased_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
        CREATE TABLE IF NOT EXISTS game_rewards (id INTEGER PRIMARY KEY, game TEXT NOT NULL, played_on TEXT NOT NULL DEFAULT (date('now','localtime')), UNIQUE(game, played_on));
        """)
        profile_columns = {row['name'] for row in db.execute("PRAGMA table_info(profile)")}
        if "learning_stage" not in profile_columns:
            db.execute("ALTER TABLE profile ADD COLUMN learning_stage TEXT NOT NULL DEFAULT '未设置'")
        if "grade" not in profile_columns:
            db.execute("ALTER TABLE profile ADD COLUMN grade TEXT NOT NULL DEFAULT ''")
        pet_columns = {row['name'] for row in db.execute("PRAGMA table_info(pet_state)")}
        if "pet_model" not in pet_columns:
            db.execute("ALTER TABLE pet_state ADD COLUMN pet_model TEXT NOT NULL DEFAULT 'cat_pilot'")
        store_columns = {row['name'] for row in db.execute("PRAGMA table_info(store_items)")}
        if "pet_model" not in store_columns:
            db.execute("ALTER TABLE store_items ADD COLUMN pet_model TEXT NOT NULL DEFAULT ''")
        if db.execute("SELECT count(*) FROM questions").fetchone()[0] == 0:
            db.executemany("INSERT INTO questions(subject,stage,title,prompt,options,answer,explanation) VALUES(?,?,?,?,?,?,?)", [(s,st,t,p,json.dumps(o,ensure_ascii=False),a,e) for s,st,t,p,o,a,e in SEED_QUESTIONS])
        db.execute("INSERT OR IGNORE INTO profile(id) VALUES(1)")
        db.execute("INSERT OR IGNORE INTO pet_state(id) VALUES(1)")
        if db.execute("SELECT count(*) FROM store_items").fetchone()[0] == 0:
            db.executemany("INSERT INTO store_items(name,emoji,description,price,kind) VALUES(?,?,?,?,?)", [
                ('香香点心', '🧁', '团团最爱的软软小蛋糕', 8, 'snack'),
                ('彩虹皮球', '🏐', '一起抛接，玩耍心情 +12', 15, 'toy'),
                ('闪亮铃铛', '🔔', '叮铃叮铃的探险铃铛', 28, 'wearable'),
                ('星星披风', '🦸', '勇敢小伙伴的星星披风', 45, 'wearable'),
                ('坦克涂装', '🚜', '解锁酷酷的探险坦克造型', 35, 'game')
            ])
        pet_catalog = [
            ('飞行员猫咪', '🐱', '穿着飞行服的猫咪：会走路、飞行和互动。', 0, 'pet', 'cat_pilot'),
        ]
        for name, emoji, description, price, kind, model in pet_catalog:
            if not db.execute("SELECT id FROM store_items WHERE pet_model=?", (model,)).fetchone():
                db.execute("INSERT INTO store_items(name,emoji,description,price,kind,pet_model) VALUES(?,?,?,?,?,?)", (name, emoji, description, price, kind, model))
        for model in ('cat_pilot',):
            starter_id = db.execute("SELECT id FROM store_items WHERE pet_model=?", (model,)).fetchone()[0]
            db.execute("INSERT OR IGNORE INTO owned_items(item_id) VALUES(?)", (starter_id,))
        if db.execute("SELECT count(*) FROM ledger").fetchone()[0] == 0:
            db.execute("INSERT INTO ledger(kind,amount,description) VALUES('奖励',120,'欢迎来到福福学堂')")
