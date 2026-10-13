# -*- coding: utf-8 -*-
"""全站语音批量生成（edge-tts，免费）。

音色分组：
  xiaoyi / child / curious 统一使用 speech_config.CHINESE 的晓晓讲解配置
  en 使用 speech_config.ENGLISH 的 Jenny 英语示范配置
  专业拼音录音独立保留，不通过此脚本替换

文本键 = 与前端 tts.js 完全一致的 normalize 结果，取 sha1 前 12 位。
输出：frontend/assets/audio/tts/<profile>/<key>.mp3
清单：frontend/assets/audio/tts/manifest.json  {"<key>": "/assets/audio/tts/<profile>/<key>.mp3"}

分级：
  python scripts/tts_build.py            # core：卡片+界面+幼儿园题+全部科普
  python scripts/tts_build.py --full     # 再加 749 道小学题题干
  python scripts/tts_build.py --all      # 再加所有题的“听答案”讲解句
已存在的音频自动跳过，失败可反复重跑续传。
"""
import argparse
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import edge_tts
import pymysql

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "frontend" / "assets" / "audio" / "tts"
MANIFEST = OUT_DIR / "manifest.json"
URL_PREFIX = "/assets/audio/tts/"

sys.path.insert(0, str(ROOT / 'backend'))
from speech_config import PROFILES
from learning_rewards import QUIZ_CORRECT_POINTS

CN_NUM = "一二三四五六"
HINT_FALLBACK = "再仔细听一遍题目，想想哪个选项更合适。"

FIXED_ZH = [
    "没关系，我们再听一次题目，换一个答案试试看。",
    f"提示：{HINT_FALLBACK}",
    "啦啦啦，团团喜欢你。我们一起笑嘻嘻，天天学习有惊喜！",
    "团团好开心呀，谢谢你陪我！",
]


def normalize(value, lang="zh-CN"):
    """必须与前端 tts.js 的 normalize 逐字节一致。"""
    text = re.sub(r"[\r\n\t]+", " ", str(value if value is not None else ""))
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("×", "乘").replace("✕", "乘").replace("÷", "除以").replace("＝", "等于").replace("=", "等于")
    text = re.sub(r"\s*([，。！？；：、,.!?;:])", r"\1", text)
    if text and not re.search(r"[。！？.!?]$", text):
        text += "。" if lang.lower().startswith("zh") else "."
    text = re.sub(r"([。！？；：])(?=\S)", r"\1 ", text)
    return text


def key_of(text, lang="zh-CN"):
    return hashlib.sha1(normalize(text, lang).encode("utf-8")).hexdigest()[:12]


def collect_fixed():
    """运行 Node 采集器，拿回卡片与科普文案。"""
    out = subprocess.run(["node", str(ROOT / "scripts" / "tts_collect.js")],
                         cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        print(out.stderr, file=sys.stderr)
        raise RuntimeError("tts_collect.js 执行失败")
    return json.loads(out.stdout)


def db_connect():
    return pymysql.connect(
        host=os.getenv("FUFU_MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("FUFU_MYSQL_PORT", "3306")),
        user=os.getenv("FUFU_MYSQL_USER", "root"),
        password=os.environ["FUFU_MYSQL_PASSWORD"],
        database=os.getenv("FUFU_MYSQL_DATABASE", "fufu_learning"),
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
    )


def collect_questions(tier):
    """返回 (zh_texts, reveal_texts)。"""
    zh, reveals = [], []
    conn = db_connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id,prompt,options,answer,explanation,hint,question_type,stage FROM questions "
                        "WHERE stage='幼儿园' AND status='published' ORDER BY id")
        kids = cur.fetchall()
        for q in kids:
            cur.execute("SELECT option_text,is_correct FROM question_options WHERE question_id=%s "
                        "ORDER BY sort_order,id", (q["id"],))
            rows = cur.fetchall()
            opts = [r["option_text"] for r in rows] or json.loads(q["options"] or "[]")
            correct_rows = [r["option_text"] for r in rows if r["is_correct"]]
            correct = correct_rows[0] if correct_rows else (opts[0] if opts else q["answer"])
            zh.append(f"我们来听这道题。{q['prompt']}")
            for i, text in enumerate(opts):
                zh.append(f"第{CN_NUM[i] if i < len(CN_NUM) else i + 1}个选项是，{text}。")
            zh.append(f"正确答案是{correct}。{q['explanation'] or ''}")
            zh.append(f"答对啦！正确答案是{correct}。{q['explanation'] or ''}获得{QUIZ_CORRECT_POINTS}积分。")
            if q["hint"]:
                zh.append(f"提示：{q['hint']}")

        def correct_option_text(q):
            cur.execute("SELECT option_text FROM question_options WHERE question_id=%s AND is_correct=1 "
                        "ORDER BY sort_order,id LIMIT 1", (q["id"],))
            row = cur.fetchone()
            return row["option_text"] if row else q["answer"]

        if tier in ("full", "all"):
            # 小学题：题干、听答案讲解句、答对奖励句、提示句（奖励与后端共享配置）
            cur.execute("SELECT id,prompt,options,answer,explanation,hint,question_type "
                        "FROM questions WHERE stage='小学' AND status='published' ORDER BY id")
            primary = cur.fetchall()
            for q in primary:
                ans = correct_option_text(q)
                zh.append(q["prompt"])
                zh.append(f"正确答案是{ans}。{q['explanation'] or ''}")
                zh.append(f"答对啦，答案是{ans}，获得{QUIZ_CORRECT_POINTS}积分")
                if q["hint"]:
                    zh.append(f"提示：{q['hint']}")
        if tier == "all":
            # 兜底：任何阶段已发布题目的讲解句（避免新题型遗漏）
            cur.execute("SELECT id,prompt,options,answer,explanation,question_type,stage FROM questions "
                        "WHERE status='published' ORDER BY id")
            for q in cur.fetchall():
                ans = correct_option_text(q)
                reveals.append(f"正确答案是{ans}。{q['explanation'] or ''}")
    finally:
        conn.close()
    return zh, reveals


async def synth(text, profile, out_path, retries=6):
    cfg = PROFILES[profile]
    for attempt in range(retries):
        try:
            tts = edge_tts.Communicate(text, voice=cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"])
            await tts.save(str(out_path))
            if out_path.exists() and out_path.stat().st_size > 1000:
                return True
        except Exception as exc:
            print(f"    retry {attempt + 1}: {str(exc)[:70]}", file=sys.stderr)
        await asyncio.sleep(2 + attempt * 2)
    return False


async def main(tier, shard_id=0, shards=1):
    fixed = collect_fixed()
    q_zh, q_reveals = collect_questions(tier)

    groups = {
        "xiaoyi": ([("zh", t) for t in FIXED_ZH + fixed["card_zh"] + fixed.get("safari_zh", []) + q_zh + q_reveals]),
        "en":     [("en", t) for t in fixed["card_en"] + fixed.get("safari_en", [])],
        "curious":[("zh", t) for t in fixed["curious"]],
    }

    # 去重：同一规范化文本只保留一条（首个音色生效；同音色内重复也跳过）
    seen = {}
    tasks = []
    for profile, items in groups.items():
        for lang, text in items:
            norm = normalize(text, lang)
            if not norm:
                continue
            if norm in seen:
                continue
            seen[norm] = profile
            tasks.append((profile, lang, norm))
    tasks = [t for idx, t in enumerate(tasks) if idx % shards == shard_id]
    counts = {p: 0 for p in PROFILES}
    for p, _, _ in tasks:
        counts[p] += 1
    print(f"本分片待生成：{counts}，合计 {len(tasks)} 条（tier={tier} shard={shard_id + 1}/{shards}）", flush=True)

    def update_manifest(items):
        """加进程锁的 读-改-写，保证多分片并行不丢键。"""
        from speech_manifest import merge_manifest
        return merge_manifest(MANIFEST, items)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    pending = []
    failures = []
    for n, (profile, lang, norm) in enumerate(tasks, 1):
        key = hashlib.sha1(norm.encode("utf-8")).hexdigest()[:12]
        rel = f"{URL_PREFIX}{profile}/{key}.mp3"
        out = OUT_DIR / profile / f"{key}.mp3"
        if manifest.get(key) == rel and out.exists() and out.stat().st_size > 1000:
            continue
        pending.append((n, profile, norm, key, rel, out))
    print(f"实际需要请求：{len(pending)} 条（其余已存在）", flush=True)

    for n, profile, norm, key, rel, out in pending:
        out.parent.mkdir(parents=True, exist_ok=True)
        ok = await synth(norm, profile, out)
        if ok:
            manifest = update_manifest({key: rel})
            print(f"  [{n}/{len(tasks)}] {key} ok", flush=True)
        else:
            failures.append(norm[:50])
            print(f"  [{n}] 失败：{norm[:40]}", file=sys.stderr, flush=True)
        await asyncio.sleep(.55)
    final = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    print(f"清单总条目：{len(final)}")
    if failures:
        print(f"失败 {len(failures)} 条，重跑本命令即可续传：", file=sys.stderr)
        for f in failures[:10]:
            print("  -", f, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", choices=["core", "full", "all"], default="core")
    ap.add_argument("--full", action="store_true", help="等价 --tier full")
    ap.add_argument("--all", dest="all_", action="store_true", help="等价 --tier all")
    ap.add_argument("--shard", type=int, default=0, help="分片序号（从 0 开始）")
    ap.add_argument("--of", dest="shards", type=int, default=1, help="分片总数")
    args = ap.parse_args()
    tier = "all" if args.all_ else ("full" if args.full else args.tier)
    asyncio.run(main(tier, args.shard, args.shards))
