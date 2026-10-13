import urllib.request, os, time

BASE = r"D:\福福学堂\frontend\assets\stories"

COVERS = {
    "meng-mu-san-qian": "https://aka.doubaocdn.com/s/1FBEblD2r7",
    "jing-zhong-bao-guo": "https://aka.doubaocdn.com/s/8j2BMmJlXV",
    "wang-xi-chi-chimo": "https://aka.doubaocdn.com/s/fgOKvZmXjL",
    "wen-yan-bo-qu-qiu": "https://aka.doubaocdn.com/s/WfzAxuOI1f",
    "pan-gu-kai-tian": "https://aka.doubaocdn.com/s/DECxUK5jmU",
    "nv-ua-bu-tian": "https://aka.doubaocdn.com/s/GxQo2i5CVB",
    "chang-e-ben-yue": "https://aka.doubaocdn.com/s/Uxc18ABZzX",
    "shen-nong-chang-bai-cao": "https://aka.doubaocdn.com/s/uVjAUiKJBU",
}

PARAS = {
    "meng-mu-san-qian": ["https://aka.doubaocdn.com/s/NVkSfGNy9E","https://aka.doubaocdn.com/s/tlczwVglkI","https://aka.doubaocdn.com/s/OLQPZ5UMvs","https://aka.doubaocdn.com/s/IKVSUcpgit","https://aka.doubaocdn.com/s/YqVyb5fps8","https://aka.doubaocdn.com/s/FjMvhgHx8T"],
    "jing-zhong-bao-guo": ["https://aka.doubaocdn.com/s/tzCxjsLJ5G","https://aka.doubaocdn.com/s/wNtUuZ9WgX","https://aka.doubaocdn.com/s/SsvCDo3zQE","https://aka.doubaocdn.com/s/Z4YdVEQWdF","https://aka.doubaocdn.com/s/RfBL6dsEWv","https://aka.doubaocdn.com/s/4DcdbWnlEp"],
    "wang-xi-chi-chimo": ["https://aka.doubaocdn.com/s/JUiMEfVfzA","https://aka.doubaocdn.com/s/JvRjPSJc5l","https://aka.doubaocdn.com/s/JB8tvt8XVH","https://aka.doubaocdn.com/s/T8tQrlntWY","https://aka.doubaocdn.com/s/UZEGwNStQB","https://aka.doubaocdn.com/s/39itMclK48"],
    "wen-yan-bo-qu-qiu": ["https://aka.doubaocdn.com/s/hB5Bu6fznw","https://aka.doubaocdn.com/s/JILM8IRnsK","https://aka.doubaocdn.com/s/6WPby65a0w","https://aka.doubaocdn.com/s/SCVE75YXPP","https://aka.doubaocdn.com/s/aneUUdntpm","https://aka.doubaocdn.com/s/nZ6FCsKIRk"],
    "pan-gu-kai-tian": ["https://aka.doubaocdn.com/s/EI2AcNBMTs","https://aka.doubaocdn.com/s/qCVjpHhfmH","https://aka.doubaocdn.com/s/3EoGidMIOg","https://aka.doubaocdn.com/s/XtLBPvdekn","https://aka.doubaocdn.com/s/jGTJQX6GVY","https://aka.doubaocdn.com/s/gCf4pVlBzW"],
    "nv-ua-bu-tian": ["https://aka.doubaocdn.com/s/6rVRy9sUM1","https://aka.doubaocdn.com/s/qV2n8tVrVH","https://aka.doubaocdn.com/s/4a5RKJUK4n","https://aka.doubaocdn.com/s/f6qWqkph59","https://aka.doubaocdn.com/s/HWOjM5jI2V","https://aka.doubaocdn.com/s/qOJ2Zcqbso"],
    "chang-e-ben-yue": ["https://aka.doubaocdn.com/s/r0usJHCRvO","https://aka.doubaocdn.com/s/AV1x58TMLt","https://aka.doubaocdn.com/s/RNVnCzQkjv","https://aka.doubaocdn.com/s/8zn9rDeRJf","https://aka.doubaocdn.com/s/BUGUbEKqrF","https://aka.doubaocdn.com/s/NoDSSIXur0"],
    "shen-nong-chang-bai-cao": ["https://aka.doubaocdn.com/s/E2x2U2nVPQ","https://aka.doubaocdn.com/s/2bZBuw6QAz","https://aka.doubaocdn.com/s/skqQ7p4svR","https://aka.doubaocdn.com/s/ibapH2uWNQ","https://aka.doubaocdn.com/s/8ITUi1xEAC","https://aka.doubaocdn.com/s/OATywMkntm"],
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
