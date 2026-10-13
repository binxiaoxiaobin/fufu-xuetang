import urllib.request, os, time

BASE = r"D:\福福学堂\frontend\assets\stories"

COVERS = {
    "huang-xiang-wen-xi": "https://aka.doubaocdn.com/s/xPVvJXjYQk",
    "cheng-men-li-xue": "https://aka.doubaocdn.com/s/ZqwDqCyMLi",
    "nang-ying-ying-xue": "https://aka.doubaocdn.com/s/U7M5siX2VX",
    "fu-jing-qing-zui": "https://aka.doubaocdn.com/s/QLo0DvQTsx",
    "wo-xin-chang-dan": "https://aka.doubaocdn.com/s/gyujN74VJu",
    "da-yu-zhi-shui": "https://aka.doubaocdn.com/s/O9hn39K6Zi",
    "ne-zha-nao-hai": "https://aka.doubaocdn.com/s/YwvV6MArdV",
    "niu-lang-zhi-nv": "https://aka.doubaocdn.com/s/Q0QPUHXVhf",
    "ba-xian-guo-hai": "https://aka.doubaocdn.com/s/Vd3hrU4Dk4",
    "sui-ren-shi-zuan-mu": "https://aka.doubaocdn.com/s/qlxJwjh9yq",
}

PARAS = {
    "huang-xiang-wen-xi": ["https://aka.doubaocdn.com/s/vKhfP9cw9I","https://aka.doubaocdn.com/s/wnVv33Geat","https://aka.doubaocdn.com/s/PmWmXY8DMj","https://aka.doubaocdn.com/s/heQSVOJhxY","https://aka.doubaocdn.com/s/yVfbIqcULH","https://aka.doubaocdn.com/s/5aq4IajeYv"],
    "cheng-men-li-xue": ["https://aka.doubaocdn.com/s/NYVESrErC5","https://aka.doubaocdn.com/s/nPGUq9SV9I","https://aka.doubaocdn.com/s/RE60zcvJU3","https://aka.doubaocdn.com/s/ZWvmTFSmfb","https://aka.doubaocdn.com/s/n8Xq28stP4","https://aka.doubaocdn.com/s/qSjzbmeBVs"],
    "nang-ying-ying-xue": ["https://aka.doubaocdn.com/s/mXSUjf8JPL","https://aka.doubaocdn.com/s/EoIIkFUnNY","https://aka.doubaocdn.com/s/kSMYKqc7j3","https://aka.doubaocdn.com/s/zNU6Czp41M","https://aka.doubaocdn.com/s/ApTBBeXwqy","https://aka.doubaocdn.com/s/Krl8quYg2l"],
    "fu-jing-qing-zui": ["https://aka.doubaocdn.com/s/T1Mz411clO","https://aka.doubaocdn.com/s/AAsVingCm0","https://aka.doubaocdn.com/s/PoqVtAxx2Q","https://aka.doubaocdn.com/s/nkVWsJoxys","https://aka.doubaocdn.com/s/yh2tFMBm29","https://aka.doubaocdn.com/s/O7XO3RkR4k"],
    "wo-xin-chang-dan": ["https://aka.doubaocdn.com/s/VCO3SbvIqO","https://aka.doubaocdn.com/s/wVTi7O6OTV","https://aka.doubaocdn.com/s/HOgvNKEBCd","https://aka.doubaocdn.com/s/oeH36z0O1I","https://aka.doubaocdn.com/s/R8K0bcTnuf","https://aka.doubaocdn.com/s/1r7PXZTwSc"],
    "da-yu-zhi-shui": ["https://aka.doubaocdn.com/s/AWyY5ESjNP","https://aka.doubaocdn.com/s/kCTBVxkl32","https://aka.doubaocdn.com/s/AjWneN3sQk","https://aka.doubaocdn.com/s/b6qEzdKd8n","https://aka.doubaocdn.com/s/FwAA4mQQw7","https://aka.doubaocdn.com/s/NpVYbbVyRM"],
    "ne-zha-nao-hai": ["https://aka.doubaocdn.com/s/tdTIoMsK2t","https://aka.doubaocdn.com/s/Efn7SkXh6A","https://aka.doubaocdn.com/s/htzay3VHGW","https://aka.doubaocdn.com/s/QMkQ2wLrDk","https://aka.doubaocdn.com/s/THjUb8wzUK","https://aka.doubaocdn.com/s/g6363r9s1z"],
    "niu-lang-zhi-nv": ["https://aka.doubaocdn.com/s/oYMkomWLo8","https://aka.doubaocdn.com/s/qpCk4vwccJ","https://aka.doubaocdn.com/s/hCob9Px9SR","https://aka.doubaocdn.com/s/xXXrUCpGqW","https://aka.doubaocdn.com/s/CV1UCGirZF","https://aka.doubaocdn.com/s/PQP0sgqySn"],
    "ba-xian-guo-hai": ["https://aka.doubaocdn.com/s/tnx56tVo5Z","https://aka.doubaocdn.com/s/5zumU8ZjAI","https://aka.doubaocdn.com/s/2AwZj2CZom","https://aka.doubaocdn.com/s/XejhgMU9JG","https://aka.doubaocdn.com/s/QBFVIVV4S0","https://aka.doubaocdn.com/s/askOMhbTQ4"],
    "sui-ren-shi-zuan-mu": ["https://aka.doubaocdn.com/s/TzhcH3x4xG","https://aka.doubaocdn.com/s/uXVhqVgaAI","https://aka.doubaocdn.com/s/on0e9gat6p","https://aka.doubaocdn.com/s/2AZoRQRxhc","https://aka.doubaocdn.com/s/bDG3aUkaZS","https://aka.doubaocdn.com/s/Gj257jZuw6"],
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
