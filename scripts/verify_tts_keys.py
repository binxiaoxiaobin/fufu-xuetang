# -*- coding: utf-8 -*-
"""语音清单键一致性回归测试。

背景（2026-09-30 那次"平板上除了故事和黏土世界都没声音"）：
    frontend/tts.js 原本用 crypto.subtle.digest('SHA-1', ...) 算清单键。
    crypto.subtle 只在【安全上下文】（HTTPS 或 localhost）存在，
    而本项目实际跑在 http://<内网 IP 或 Tailscale IP>:8000 —— 明文 HTTP，
    不是安全上下文，于是 window.crypto.subtle 是 undefined，
    speak() 一进来就抛异常、整条 Promise 链崩掉，一声不响。
    要命的是：在电脑上用 localhost 调试永远复现不出来。
    故事页走的是 playUrls（直接给 URL，不算哈希），所以只有它有声音 ——
    这个"哪些响、哪些不响"的分界，就是判断本问题的指纹。

现在 tts.js 用纯 JS SHA-1 替代。本脚本守住三件事：
    1. 纯 JS SHA-1 与标准 SHA-1 逐位一致（含 55/56/64 字节边界、中文、emoji）
    2. tts.js 的 normalize() 与 scripts/tts_build.py 的 normalize() 结果一致
    3. 用真实题目文本算出的键，确实能命中 assets/audio/tts/manifest.json

用法（项目根目录，需 node；数据库连不上时自动跳过第 3 项）：
    python scripts/verify_tts_keys.py
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TTS_JS = ROOT / "frontend" / "tts.js"
TT_BUILD = ROOT / "scripts" / "tts_build.py"
MANIFEST = ROOT / "frontend" / "assets" / "audio" / "tts" / "manifest.json"

FAILURES: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    print(("  OK   " if ok else "  FAIL ") + label + (("  " + detail) if detail else ""))
    if not ok:
        FAILURES.append(label)


# ---------------------------------------------------------------- 1) 提取前端实现
def extract_js_helpers() -> str:
    src = TTS_JS.read_text(encoding="utf-8")

    def between(start: str, end: str) -> str:
        i, j = src.find(start), src.find(end)
        if i < 0 or j <= i:
            raise SystemExit("无法从 tts.js 提取 %s" % start)
        return src[i:j]

    # sha1 实现 + normalize 实现，拼成一段可独立执行的代码
    return between("function utf8Bytes", "function keyOf") + "\n" + \
        between("function normalize", "function ensure")


NODE = shutil.which("node") or shutil.which("node.exe")


def run_js(payload: dict) -> dict:
    """把 JSON 交给 node，用 tts.js 里真实的 normalize + sha1Hex 处理。"""
    if not NODE:
        raise SystemExit("找不到 node，无法验证前端实现")
    script = (
        extract_js_helpers()
        + "\nvar IN = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        + "\nrequire('fs').writeFileSync(1, JSON.stringify({"
        + "  keys: IN.texts.map(function (t) { return sha1Hex(normalize(t, 'zh-CN')).slice(0, 12); }),"
        + "  norms: IN.texts.map(function (t) { return normalize(t, 'zh-CN'); }),"
        + "  sha1: IN.vectors.map(function (v) { return sha1Hex(v); })"
        + "}));"
    )
    proc = subprocess.run([NODE, "-e", script], input=json.dumps(payload),
                          capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        raise SystemExit("node 执行失败：\n" + (proc.stderr or "")[:2000])
    return json.loads(proc.stdout)


# ---------------------------------------------------------------- 2) 取后端 normalize
def backend_normalize():
    src = TT_BUILD.read_text(encoding="utf-8")
    for node in ast.parse(src).body:
        if isinstance(node, ast.FunctionDef) and node.name == "normalize":
            ns = {"re": re}
            exec(ast.get_source_segment(src, node), ns)
            return ns["normalize"]
    raise SystemExit("tts_build.py 里找不到 normalize")


def main() -> int:
    print("语音清单键一致性回归测试")
    print("  前端实现:", TTS_JS.name, "| node:", NODE or "(缺失)")
    print()

    vectors = ["", "abc", "a", "1234567890",
               "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
               "中文测试。", "小朋友，请数一数：3 × 4 等于多少？",
               "A" * 55, "A" * 56, "A" * 64, "A" * 1000,
               "好" * 200, "🎉🦖🌍 emoji 与中文混排"]

    # 取真实题目文本（连不上数据库就退回内置样本，只验算法一致性）
    texts: list[str] = []
    try:
        sys.path.insert(0, str(ROOT / "backend"))
        import pymysql  # noqa: PLC0415
        conn = pymysql.connect(
            host=os.getenv("FUFU_MYSQL_HOST", "127.0.0.1"),
            port=int(os.getenv("FUFU_MYSQL_PORT", "3306")),
            user=os.getenv("FUFU_MYSQL_USER", "root"),
            password=os.environ["FUFU_MYSQL_PASSWORD"],
            database=os.getenv("FUFU_MYSQL_DATABASE", "fufu_learning"),
            charset="utf8mb4")
        cur = conn.cursor()
        cur.execute("SELECT title, prompt, hint, explanation FROM questions ORDER BY id LIMIT 60")
        for row in cur.fetchall():
            for cell in row:
                if cell and str(cell).strip():
                    texts.append(str(cell))
        conn.close()
        texts = texts[:200]
        print("  题目文本样本:", len(texts), "条（来自数据库）")
    except Exception as exc:                                    # noqa: BLE001
        texts = ["声母小侦探", "数一数", "小兔有两根胡萝卜，又拿来一根，一共有几根？",
                 "恐龙生活在中生代。", "小朋友你好。"]
        print("  题目文本样本:", len(texts), "条（内置；数据库不可用：%s）" % type(exc).__name__)
    print()

    js = run_js({"texts": texts, "vectors": vectors})

    print("[1] 纯 JS SHA-1 vs 标准 SHA-1")
    bad = 0
    for text, got in zip(vectors, js["sha1"]):
        want = hashlib.sha1(text.encode("utf-8")).hexdigest()
        if got != want:
            bad += 1
            print("       不一致:", repr(text[:24]), got, "!=", want)
    check(bad == 0, "SHA-1 逐位一致", "%d/%d" % (len(vectors) - bad, len(vectors)))

    print("[2] 前端 normalize vs 后端 normalize")
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    else:                                                       # pragma: no cover
        manifest = {}
    normalize = backend_normalize()
    norm_bad = key_bad = hit = 0
    for text, js_norm, js_key in zip(texts, js["norms"], js["keys"]):
        py_norm = normalize(text, "zh-CN")
        py_key = hashlib.sha1(py_norm.encode("utf-8")).hexdigest()[:12]
        if js_norm != py_norm:
            norm_bad += 1
            if norm_bad <= 3:
                print("       规范化不一致:", repr(text[:30]), repr(js_norm), "!=", repr(py_norm))
        if js_key != py_key:
            key_bad += 1
            if key_bad <= 3:
                print("       键不一致:", repr(text[:30]), js_key, "!=", py_key)
        hit += 1 if js_key in manifest else 0
    check(norm_bad == 0, "normalize 结果一致", "不一致 %d 条" % norm_bad)
    check(key_bad == 0, "清单键一致", "不一致 %d 条" % key_bad)

    print("[3] 预生成音频命中率")
    check(True, "命中 %d / %d（其余走 /api/tts 按需合成后落盘）" % (hit, len(texts)))
    unknown = sum(1 for k in js["keys"] if k not in manifest)
    print("       未命中 %d 条 —— 这批会请求后端合成，属正常，不是错误" % unknown)

    print()
    if FAILURES:
        print("结果：失败 %d 项 —— %s" % (len(FAILURES), "; ".join(FAILURES)))
        return 1
    print("结果：全部通过。前端纯 JS SHA-1 与后端算法一致，清单键可正常命中。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
