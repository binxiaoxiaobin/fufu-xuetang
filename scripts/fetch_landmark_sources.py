"""Fetch the openly licensed Objaverse copies of selected Sketchfab landmarks.

Usage: python scripts/fetch_landmark_sources.py [--head]
Original GLBs are kept outside the frontend. Attribution metadata is in
artifacts/landmarks-v2/source-credits.json.
"""
from pathlib import Path
import argparse
import gzip
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "artifacts" / "landmarks-v2"
ORIGINALS = STORE / "originals"
PATHS = STORE / "object-paths.json.gz"
INDEX_URL = "https://huggingface.co/datasets/allenai/objaverse/resolve/main/"
MIRROR_URL = "https://hf-mirror.com/datasets/allenai/objaverse/resolve/main/"

SOURCES = {
    "taj": ("c8eb2e89098746898b94f0b556ecdefe", "THE CUBE GUY", "https://sketchfab.com/3d-models/taj-mahal-c8eb2e89098746898b94f0b556ecdefe"),
    "liberty": ("84094e8d5e724b5c882cf576ca12e44e", "Gravity Jack", "https://sketchfab.com/3d-models/statue-of-liberty-84094e8d5e724b5c882cf576ca12e44e"),
    "opera": ("317b2d540f0a4f7e8d87dd3b0372712d", "Nick Reinhardt", "https://sketchfab.com/3d-models/sydney-opera-house-317b2d540f0a4f7e8d87dd3b0372712d"),
    "colosseum": ("a416564e36fb450594c45b1bce119188", "Vladyslav Holhanov", "https://sketchfab.com/3d-models/colosseum-a416564e36fb450594c45b1bce119188"),
    "cristo": ("d143e5357efd42529777438d0f72c79c", "JuanG3Dpremium", "https://sketchfab.com/3d-models/christ-the-redeemer-d143e5357efd42529777438d0f72c79c"),
    "wall": ("405928f2624742d18408896d26fc0d28", "DroneScan China", "https://sketchfab.com/3d-models/14th-century-great-wall-405928f2624742d18408896d26fc0d28"),
    "fuji": ("b081cb6aed1043cbab1818e071c5b3e3", "Rafael Kenji Horota", "https://sketchfab.com/3d-models/mount-fuji-honshu-japan-b081cb6aed1043cbab1818e071c5b3e3"),
    "pyramid": ("4a251113722f4d969b6cf2ca5f35c502", "ianicolo", "https://sketchfab.com/3d-models/the-great-pyramid-of-giza-4a251113722f4d969b6cf2ca5f35c502"),
}

def fetch(url, output):
    if output.exists() and output.stat().st_size > 1000:
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(output.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "FufuSchool/1.0"})
    try:
        response = urllib.request.urlopen(req, timeout=120)
    except Exception:
        fallback = url.replace(MIRROR_URL, INDEX_URL) if url.startswith(MIRROR_URL) else url.replace(INDEX_URL, MIRROR_URL)
        response = urllib.request.urlopen(urllib.request.Request(fallback, headers={"User-Agent": "FufuSchool/1.0"}), timeout=120)
    with response, tmp.open("wb") as target:
        while block := response.read(1024 * 1024):
            target.write(block)
    tmp.replace(output)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--head", action="store_true")
    parser.add_argument("--credits-only", action="store_true")
    parser.add_argument("names", nargs="*")
    args = parser.parse_args()
    unknown = set(args.names) - set(SOURCES)
    if unknown:
        parser.error("unknown names: " + ", ".join(sorted(unknown)))
    if not args.credits_only:
        fetch(INDEX_URL + "object-paths.json.gz", PATHS)
        with gzip.open(PATHS, "rt", encoding="utf-8") as source:
            paths = json.load(source)
    credits = {}
    for name, (uid, artist, page) in SOURCES.items():
        if args.names and name not in args.names:
            continue
        if args.credits_only:
            credits[name] = {"creator": artist, "source": page, "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/", "objaverse_uid": uid}
            continue
        if uid not in paths:
            raise RuntimeError(f"Objaverse index does not contain {name}: {uid}")
        url = MIRROR_URL + paths[uid]
        if name == "colosseum":
            url = "https://zenodo.org/records/10357365/files/a416564e36fb450594c45b1bce119188.glb?download=1"
        output = ORIGINALS / f"{name}.glb"
        if args.head:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as response:
                print(name, response.headers.get("Content-Length", "unknown"))
        else:
            fetch(url, output)
            print(name, output.stat().st_size)
        credits[name] = {"creator": artist, "source": page, "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/", "objaverse_uid": uid}
    (STORE / "source-credits.json").write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
