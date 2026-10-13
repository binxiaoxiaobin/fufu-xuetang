# -*- coding: utf-8 -*-
"""批量处理豆包 TTS 生成的音频：下载 wav -> 转 mp3 -> 放到 tts/<profile>/<key>.mp3 -> 更新 manifest.json。

用法：
  python scripts/install_doubao_audio.py artifacts/doubao-jobs.json
  jobs.json: [{"key":"...","profile":"xiaoyi|child|en","text":"...","url":"https://..."}, ...]
"""
import json, subprocess, sys, os, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "frontend" / "assets" / "audio" / "tts"
MANIFEST = OUT_DIR / "manifest.json"

def install(job):
    key = job["key"]
    profile = job.get("profile", "xiaoyi")
    url = job["url"]
    dest_dir = OUT_DIR / profile
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{key}.mp3"
    if dest.exists() and dest.stat().st_size > 1000:
        return ("skip", str(dest), dest.stat().st_size)
    # 下载 wav 到临时文件
    tmp_wav = dest.with_suffix(".wav.dl")
    r = subprocess.run(["curl.exe", "-L", "-s", "-o", str(tmp_wav), url],
                       capture_output=True)
    if not tmp_wav.exists() or tmp_wav.stat().st_size < 5000:
        return ("download_fail", url, tmp_wav.stat().st_size if tmp_wav.exists() else 0)
    # 转 mp3（强制 -f mp3，因为临时扩展名 .tmp 会让 ffmpeg 猜不出格式）
    tmp_mp3 = dest.with_suffix(".tmp.mp3")
    r = subprocess.run(["ffmpeg", "-y", "-nostdin", "-i", str(tmp_wav),
                        "-f", "mp3", "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1",
                        str(tmp_mp3)], capture_output=True)
    tmp_wav.unlink(missing_ok=True)
    if not tmp_mp3.exists() or tmp_mp3.stat().st_size < 1000:
        import sys as _s
        print(f"  [debug] ffmpeg rc={r.returncode} mp3_exists={tmp_mp3.exists()} mp3_size={tmp_mp3.stat().st_size if tmp_mp3.exists() else 0}", file=_s.stderr)
        print(f"  [debug] stderr: {r.stderr[-400:]!r}", file=_s.stderr)
        return ("transcode_fail", url, 0)
    tmp_mp3.replace(dest)
    return ("ok", str(dest), dest.stat().st_size)

def main():
    jobs_path = Path(sys.argv[1])
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    # 读 manifest
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    updates = {}
    results = {"ok": 0, "skip": 0, "fail": 0}
    failures = []
    for job in jobs:
        status, path, size = install(job)
        results[status] = results.get(status, 0) + 1
        if status == "ok":
            rel = f"/assets/audio/tts/{job.get('profile','xiaoyi')}/{job['key']}.mp3"
            updates[job["key"]] = rel
        elif status == "download_fail" or status == "transcode_fail":
            failures.append({"key": job["key"], "url": job["url"], "error": status})
    # 原子更新 manifest
    if updates:
        manifest.update(updates)
        tmp = MANIFEST.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        tmp.replace(MANIFEST)
    print(json.dumps({"results": results, "manifest_updates": len(updates),
                      "failures": failures}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
