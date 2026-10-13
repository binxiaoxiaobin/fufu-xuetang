# -*- coding: utf-8 -*-
"""按需语音合成：前端请求的文本若不在预生成清单里，现场调用 edge-tts 合成、
落盘缓存并写入同一份 manifest.json，之后该文本即与预生成音频无异。

键规则、normalize、音色配置全部复用 scripts/tts_build.py，保证与批量产物一致。
"""
import asyncio
import hashlib
import json
import os
import sys
import threading
from pathlib import Path

import edge_tts
from urllib.request import getproxies
from speech_manifest import merge_manifest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import tts_build as tb  # noqa: E402

MAX_CHARS = 600
MIN_BYTES = 1000

# 同进程内串行合成 + 清单读改写，避免半文件与清单丢键
_lock = threading.Lock()


def _profile_for(lang, voice=""):
    if str(lang or "zh-CN").lower().startswith("en"):
        return "en"
    return "child" if voice == "child" else "xiaoyi"


async def _synth_to(text, profile, dest: Path, retries=4):
    cfg = tb.PROFILES[profile]
    tmp = dest.with_name(dest.name + f".tmp.{os.getpid()}")
    for attempt in range(retries):
        try:
            proxy = getproxies().get('https') or getproxies().get('http')
            proxy = proxy.replace('https://', 'http://') if proxy else None
            tts = edge_tts.Communicate(text, voice=cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"], proxy=proxy)
            await tts.save(str(tmp))
            if tmp.exists() and tmp.stat().st_size > MIN_BYTES:
                os.replace(tmp, dest)
                return True
            tmp.unlink(missing_ok=True)
        except Exception:
            tmp.unlink(missing_ok=True)
        await asyncio.sleep(1.5 + attempt * 2)
    return False


def _load_manifest():
    return json.loads(tb.MANIFEST.read_text(encoding="utf-8")) if tb.MANIFEST.exists() else {}


def synthesize_on_demand(raw_text, lang="zh-CN", voice=""):
    """返回 (url, cached)。失败抛 RuntimeError。"""
    norm = tb.normalize(raw_text, lang)
    if not norm:
        raise ValueError("空文本")
    if len(norm) > MAX_CHARS:
        raise ValueError(f"文本过长（{len(norm)}>{MAX_CHARS}）")
    profile = _profile_for(lang, voice)
    key_source = (profile + "\0" + norm) if profile == "child" else norm
    key = hashlib.sha1(key_source.encode("utf-8")).hexdigest()[:12]
    rel = f"{tb.URL_PREFIX}{profile}/{key}.mp3"
    dest = tb.OUT_DIR / profile / f"{key}.mp3"

    with _lock:
        manifest = _load_manifest()
        if key in manifest and dest.exists() and dest.stat().st_size > MIN_BYTES:
            return manifest[key], True

        dest.parent.mkdir(parents=True, exist_ok=True)
        ok = asyncio.run(_synth_to(norm, profile, dest))
        if not ok:
            raise RuntimeError("语音合成服务暂时不可用")

        # 以磁盘为准重新读一次清单，再合并新键
        manifest = _load_manifest()
        merge_manifest(tb.MANIFEST, {key: rel})
        return rel, False
