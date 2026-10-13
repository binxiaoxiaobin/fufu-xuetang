import urllib.request, os, time

BASE = r"D:\福福学堂\frontend\assets\stories"

COVERS = {
    "chou-xiao-ya": "https://aka.doubaocdn.com/s/ExxYz1OJ43",
    "xiao-hong-mao": "https://aka.doubaocdn.com/s/v3OeNcLSfh",
    "gui-tu-sai-pao": "https://aka.doubaocdn.com/s/YqpGUUPtIF",
    "huang-di-de-xin-zhuang": "https://aka.doubaocdn.com/s/haaZTq0O1W",
    "hui-gu-niang": "https://aka.doubaocdn.com/s/c8VHBRrPR1",
    "mai-huo-chai-de-xiao-nu-hai": "https://aka.doubaocdn.com/s/giAXeef4iM",
    "lang-lai-le": "https://aka.doubaocdn.com/s/3eVZTsdLun",
    "san-zhi-xiao-zhu": "https://aka.doubaocdn.com/s/vklNkAv3rt",
    "bai-xue-gong-zhu": "https://aka.doubaocdn.com/s/DvozIouV9C",
    "yu-fu-he-jin-yu": "https://aka.doubaocdn.com/s/SDoHVgjy9M",
}

PARAS = {
    "chou-xiao-ya": ["https://aka.doubaocdn.com/s/VFk3GoFoEo","https://aka.doubaocdn.com/s/iLhlL5ay9C","https://aka.doubaocdn.com/s/nuXTumW3Py","https://aka.doubaocdn.com/s/n6B92i12kq","https://aka.doubaocdn.com/s/Q7wRtQkHfp","https://aka.doubaocdn.com/s/mDGURayHu4"],
    "xiao-hong-mao": ["https://aka.doubaocdn.com/s/iSS8IEyh7O","https://aka.doubaocdn.com/s/DXMiDdY4JV","https://aka.doubaocdn.com/s/FeltuqE31F","https://aka.doubaocdn.com/s/RleEMZUzX5","https://aka.doubaocdn.com/s/GlUtjywUXn","https://aka.doubaocdn.com/s/CWbWLigKO3"],
    "gui-tu-sai-pao": ["https://aka.doubaocdn.com/s/1U2biRAXgi","https://aka.doubaocdn.com/s/g0FHsmMkLs","https://aka.doubaocdn.com/s/rp5CXVdodn","https://aka.doubaocdn.com/s/xLDCuPzczE","https://aka.doubaocdn.com/s/iu8nbHMgcA","https://aka.doubaocdn.com/s/PGBtg1B0s6"],
    "huang-di-de-xin-zhuang": ["https://aka.doubaocdn.com/s/Q2xs8aUPRy","https://aka.doubaocdn.com/s/fTQUhCxx04","https://aka.doubaocdn.com/s/Y9Oejr72A0","https://aka.doubaocdn.com/s/6gSvMVvk2K","https://aka.doubaocdn.com/s/68Eg8uIqBB","https://aka.doubaocdn.com/s/kVH62bizHp"],
    "hui-gu-niang": ["https://aka.doubaocdn.com/s/YzGyUFGxxJ","https://aka.doubaocdn.com/s/49pN2Vi3Pv","https://aka.doubaocdn.com/s/UeajbVrF4J","https://aka.doubaocdn.com/s/hUdYLUIYkJ","https://aka.doubaocdn.com/s/dFrDs1bsEq","https://aka.doubaocdn.com/s/zmvq27A3EG"],
    "mai-huo-chai-de-xiao-nu-hai": ["https://aka.doubaocdn.com/s/02i5VzqURU","https://aka.doubaocdn.com/s/BKnot7vHVD","https://aka.doubaocdn.com/s/UogGy1Zml9","https://aka.doubaocdn.com/s/V7x42tbYov","https://aka.doubaocdn.com/s/7zbSJEq89y","https://aka.doubaocdn.com/s/U6e2a28dPz"],
    "lang-lai-le": ["https://aka.doubaocdn.com/s/H5JwwlSjEd","https://aka.doubaocdn.com/s/Ladf2iMrIb","https://aka.doubaocdn.com/s/ZTj7qOB56E","https://aka.doubaocdn.com/s/GjlMtcrpU0","https://aka.doubaocdn.com/s/lG10MywSVZ","https://aka.doubaocdn.com/s/6bNNQM0qDi"],
    "san-zhi-xiao-zhu": ["https://aka.doubaocdn.com/s/eTaorLxty3","https://aka.doubaocdn.com/s/5TzQVIwUqA","https://aka.doubaocdn.com/s/dL4b7sIre1","https://aka.doubaocdn.com/s/RovLFATXWt","https://aka.doubaocdn.com/s/7rNvLjOLm2","https://aka.doubaocdn.com/s/SBaR6qKhf0"],
    "bai-xue-gong-zhu": ["https://aka.doubaocdn.com/s/wENGw4Mgnw","https://aka.doubaocdn.com/s/mBqAQTqotD","https://aka.doubaocdn.com/s/ty9EKzrB9O","https://aka.doubaocdn.com/s/pluNgXRQXO","https://aka.doubaocdn.com/s/5cYMNo7V7O","https://aka.doubaocdn.com/s/EAIQ2LEfy0"],
    "yu-fu-he-jin-yu": ["https://aka.doubaocdn.com/s/imIWkzx8jw","https://aka.doubaocdn.com/s/enjylXa9Iy","https://aka.doubaocdn.com/s/VY9AwusaqD","https://aka.doubaocdn.com/s/P1C0TLrFcz","https://aka.doubaocdn.com/s/s0TXLvVfRE","https://aka.doubaocdn.com/s/OuAxMXDHAs"],
}

ok = fail = 0
for slug, url in COVERS.items():
    out = os.path.join(BASE, slug + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(url, out)
            ok += 1
            break
        except Exception as e:
            if attempt == 2:
                print(f"FAIL cover {slug}: {e}"); fail += 1
            time.sleep(1)

for slug, urls in PARAS.items():
    d = os.path.join(BASE, slug)
    os.makedirs(d, exist_ok=True)
    for i, url in enumerate(urls, 1):
        out = os.path.join(d, f"{i}.png")
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(url, out)
                ok += 1
                break
            except Exception as e:
                if attempt == 2:
                    print(f"FAIL {slug}/{i}: {e}"); fail += 1
                time.sleep(1)

print(f"\nDone. ok={ok} fail={fail}")
