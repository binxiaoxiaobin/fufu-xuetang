# -*- coding: utf-8 -*-
"""批量生成故事旁白音频（edge-tts，免费）。

音色：晓晓 · 温柔讲故事 = zh-CN-XiaoxiaoNeural, rate=-10%, pitch=-4Hz
输入：content/stories/*.json（后端同步进 MySQL 的同一内容源）
输出：frontend/assets/audio/stories/<slug>_<两位序号>.mp3
清单：frontend/assets/audio/stories/manifest.json
      形如 {"ke-zhou-qiu-jian": ["/assets/audio/stories/ke-zhou-qiu-jian_00.mp3", ...], ...}

用法：
  python scripts/tts_stories.py            # 已存在的音频跳过
  python scripts/tts_stories.py --force    # 全部重新生成
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content" / "stories"
OUT_DIR = ROOT / "frontend" / "assets" / "audio" / "stories"
MANIFEST = OUT_DIR / "manifest.json"

sys.path.insert(0, str(ROOT/'backend'))
from speech_config import CHINESE
from speech_manifest import merge_manifest
VOICE = CHINESE['voice']
RATE = CHINESE['rate']
PITCH = CHINESE['pitch']
URL_PREFIX = "/assets/audio/stories/"


def load_stories():
    """内容源 JSON + MySQL（线上库为准，同名 slug 以数据库为准）。"""
    stories = {}
    for path in sorted(CONTENT_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for story in data.get("stories", []):
            stories[story["slug"]] = story
    if os.environ.get("FUFU_MYSQL_PASSWORD"):
        try:
            import pymysql
            conn = pymysql.connect(
                host=os.getenv("FUFU_MYSQL_HOST", "127.0.0.1"),
                port=int(os.getenv("FUFU_MYSQL_PORT", "3306")),
                user=os.getenv("FUFU_MYSQL_USER", "root"),
                password=os.environ["FUFU_MYSQL_PASSWORD"],
                database=os.getenv("FUFU_MYSQL_DATABASE", "fufu_learning"),
                charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT slug,title,paragraphs FROM stories ORDER BY id")
                    for row in cur.fetchall():
                        paras = row["paragraphs"]
                        if isinstance(paras, str):
                            paras = json.loads(paras)
                        stories[row["slug"]] = {"slug": row["slug"], "title": row["title"],
                                                "paragraphs": paras}
            finally:
                conn.close()
        except Exception as exc:
            print(f"警告：读取 MySQL 故事失败，仅使用内容文件：{exc}", file=sys.stderr)
    return [stories[k] for k in sorted(stories)]


async def synth(text, out_path, retries=5):
    for attempt in range(retries):
        try:
            tts = edge_tts.Communicate(text, voice=VOICE, rate=RATE, pitch=PITCH)
            await tts.save(str(out_path))
            if out_path.exists() and out_path.stat().st_size > 1000:
                return True
        except Exception as exc:
            print(f"    retry {attempt + 1}: {str(exc)[:70]}", file=sys.stderr)
        await asyncio.sleep(2 + attempt * 2)
    return False


def _update_manifest(slug, urls):
    """加进程锁的 读-改-写，多分片并行不丢键。"""
    merge_manifest(MANIFEST, {slug: urls})


async def main(force=False, only_slug=None, shard_id=0, shards=1):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stories = load_stories()
    if only_slug:
        stories = [s for s in stories if s.get("slug") == only_slug]
    # 按“段落”分片，保证粒度均匀
    plan = []
    for story in stories:
        for i, text in enumerate(story["paragraphs"]):
            plan.append((story, i, text))
    mine = [t for idx, t in enumerate(plan) if idx % shards == shard_id]
    by_slug = {}
    for story, i, text in mine:
        by_slug.setdefault(story["slug"], story)
    print(f"分片 {shard_id + 1}/{shards}：{len(mine)} 段，涉及 {len(by_slug)} 个故事", flush=True)
    ok_all = True
    done_by_slug = {}
    for story, i, text in mine:
        slug = story["slug"]
        name = f"{slug}_{i:02d}.mp3"
        out = OUT_DIR / name
        if out.exists() and not force and out.stat().st_size > 1000:
            pass
        else:
            print(f"《{story['title']}》[{i:02d}] 生成中… ({len(text)} 字)", flush=True)
            if not await synth(text, out):
                ok_all = False
                print(f"《{story['title']}》[{i:02d}] 失败！", file=sys.stderr, flush=True)
                await asyncio.sleep(4)
                continue
            await asyncio.sleep(.55)
        done_by_slug[slug] = done_by_slug.get(slug, 0) + 1
    # 写完本分片涉及的完整 URL 列表（已存在的段落直接列出）
    for slug, story in by_slug.items():
        urls = [URL_PREFIX + f"{slug}_{i:02d}.mp3" for i in range(len(story["paragraphs"]))]
        _update_manifest(slug, urls)
        print(f"清单更新：{slug}（本分片完成 {done_by_slug.get(slug, 0)} 段）", flush=True)
    print("清单已写入：", MANIFEST)
    if not ok_all:
        print("有段落失败，重新运行本脚本即可续传（已存在的音频会跳过）。", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--slug", default=None)
    ap.add_argument("--shard", type=int, default=0, help="分片序号（从 0 开始）")
    ap.add_argument("--of", dest="shards", type=int, default=1, help="分片总数")
    args = ap.parse_args()
    asyncio.run(main(force=args.force, only_slug=args.slug,
                     shard_id=args.shard, shards=args.shards))
