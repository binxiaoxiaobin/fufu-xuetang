import urllib.request, os, time

BASE = r"D:\福福学堂\frontend\assets\stories"

COVERS = {
    "hua-mu-lie-cong-jun": "https://aka.doubaocdn.com/s/xskTMtJeoc",
    "shen-bi-ma-liang": "https://aka.doubaocdn.com/s/AScQXLSqsR",
}

PARAS = {
    "hua-mu-lie-cong-jun": ["https://aka.doubaocdn.com/s/vlHGQ4uwQw","https://aka.doubaocdn.com/s/UA3j28kTdV","https://aka.doubaocdn.com/s/At4cMDiAzu","https://aka.doubaocdn.com/s/aZV9BI2UB3","https://aka.doubaocdn.com/s/ju843yTgbO","https://aka.doubaocdn.com/s/iJEAjf8egv"],
    "shen-bi-ma-liang": ["https://aka.doubaocdn.com/s/FzVUWSzAkr","https://aka.doubaocdn.com/s/gCqVV39eGK","https://aka.doubaocdn.com/s/Dvdlf2uOUw","https://aka.doubaocdn.com/s/5wHmUEJuf5","https://aka.doubaocdn.com/s/bLMJvxrCOL","https://aka.doubaocdn.com/s/9qt2HPkxnw"],
}

ok = fail = 0
for slug, url in COVERS.items():
    out = os.path.join(BASE, slug + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(url, out)
            ok += 1; break
        except Exception as e:
            if attempt == 2: print(f"FAIL cover {slug}: {e}"); fail += 1
            time.sleep(1)

for slug, urls in PARAS.items():
    d = os.path.join(BASE, slug)
    os.makedirs(d, exist_ok=True)
    for i, url in enumerate(urls, 1):
        out = os.path.join(d, f"{i}.png")
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(url, out)
                ok += 1; break
            except Exception as e:
                if attempt == 2: print(f"FAIL {slug}/{i}: {e}"); fail += 1
                time.sleep(1)

print(f"Done. ok={ok} fail={fail}")
