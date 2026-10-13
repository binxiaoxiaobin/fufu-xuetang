import urllib.request, os, time

BASE = r"D:\福福学堂\frontend\assets\stories"

COVERS = {
    "hu-jia-hu-wei": "https://aka.doubaocdn.com/s/7cBRG6VbCN",
    "jing-di-zhi-wa": "https://aka.doubaocdn.com/s/TcCJmGymNb",
    "yan-er-dao-ling": "https://aka.doubaocdn.com/s/phKpuxDU7G",
    "wang-yang-bu-lao": "https://aka.doubaocdn.com/s/tGPVt4SqMS",
    "ye-gong-hao-long": "https://aka.doubaocdn.com/s/h4vSR3QRko",
    "zi-xiang-mao-dun": "https://aka.doubaocdn.com/s/SPWgUpJ8vJ",
    "hua-long-dian-jing": "https://aka.doubaocdn.com/s/l6IVyZGSAe",
    "nan-yuan-bei-zhe": "https://aka.doubaocdn.com/s/lVB2qCicVo",
    "jing-wei-tian-hai": "https://aka.doubaocdn.com/s/qnmq29N9VT",
    "kua-fu-zhui-ri": "https://aka.doubaocdn.com/s/E2cDxyMriL",
    "yu-gong-yi-shan": "https://aka.doubaocdn.com/s/LyEnKLKsfr",
    "kong-rong-rang-li": "https://aka.doubaocdn.com/s/T3mlbVfvTn",
    "mo-cheng-cheng-zhen": "https://aka.doubaocdn.com/s/Kd3nxO0JNb",
    "wen-ji-qi-wu": "https://aka.doubaocdn.com/s/hUCe2sANf9",
    "zao-bi-tou-guang": "https://aka.doubaocdn.com/s/WVH7S4mjpi",
    "lan-yu-chong-shu": "https://aka.doubaocdn.com/s/qOZJpMUpgT",
    "han-dan-xue-bu": "https://aka.doubaocdn.com/s/NYEcIfJYNK",
    "dui-niu-tan-qin": "https://aka.doubaocdn.com/s/jeEON4VxES",
    "bei-gong-she-ying": "https://aka.doubaocdn.com/s/H1cUZzvSSl",
    "ye-lang-zi-da": "https://aka.doubaocdn.com/s/dxSkOS8NKp",
}

PARAS = {
    "hu-jia-hu-wei": ["https://aka.doubaocdn.com/s/zHHRqm9VWJ","https://aka.doubaocdn.com/s/R2DEIajvVm","https://aka.doubaocdn.com/s/BedeoJZtyr","https://aka.doubaocdn.com/s/VrcgDPPlCq","https://aka.doubaocdn.com/s/KYUoonXfqw","https://aka.doubaocdn.com/s/xCgUxZRNZA"],
    "jing-di-zhi-wa": ["https://aka.doubaocdn.com/s/usYcnUx6gq","https://aka.doubaocdn.com/s/IQgEEUDBps","https://aka.doubaocdn.com/s/M4soyjRw0P","https://aka.doubaocdn.com/s/DiUgs22DAQ","https://aka.doubaocdn.com/s/wUZlbUI0lO","https://aka.doubaocdn.com/s/bIFUi5RdcC"],
    "yan-er-dao-ling": ["https://aka.doubaocdn.com/s/oy94vNHaIA","https://aka.doubaocdn.com/s/g6UJmULSSG","https://aka.doubaocdn.com/s/p8MGBa4VjZ","https://aka.doubaocdn.com/s/aYLAtEb53U","https://aka.doubaocdn.com/s/6Pez7SZ6xU","https://aka.doubaocdn.com/s/k6h36vrD2e"],
    "wang-yang-bu-lao": ["https://aka.doubaocdn.com/s/h7mUSkrcHy","https://aka.doubaocdn.com/s/cx344CuRCw","https://aka.doubaocdn.com/s/XeujyVD1qM","https://aka.doubaocdn.com/s/mVTbpiskuc","https://aka.doubaocdn.com/s/LUfDtmHeAD","https://aka.doubaocdn.com/s/tk7AEywWs0"],
    "ye-gong-hao-long": ["https://aka.doubaocdn.com/s/AOH5U5aw7K","https://aka.doubaocdn.com/s/5Kk7r89Wam","https://aka.doubaocdn.com/s/8DAicSkuar","https://aka.doubaocdn.com/s/9TPMVmRwpU","https://aka.doubaocdn.com/s/bLJledmPGW","https://aka.doubaocdn.com/s/0DgLiECnGp"],
    "zi-xiang-mao-dun": ["https://aka.doubaocdn.com/s/WY5vKUVXYU","https://aka.doubaocdn.com/s/xpv1acg3EI","https://aka.doubaocdn.com/s/3LXgM5uDdr","https://aka.doubaocdn.com/s/lqtGzDXg3w","https://aka.doubaocdn.com/s/ySaXUV88U8","https://aka.doubaocdn.com/s/2TxzPhuN0e"],
    "hua-long-dian-jing": ["https://aka.doubaocdn.com/s/O9J6dmJ4ok","https://aka.doubaocdn.com/s/0WyU2ZcKUd","https://aka.doubaocdn.com/s/WnnsXPbf0U","https://aka.doubaocdn.com/s/nIUJ2Q0I3f","https://aka.doubaocdn.com/s/CdfPU4Mp9X","https://aka.doubaocdn.com/s/Kw3ONOTedQ"],
    "nan-yuan-bei-zhe": ["https://aka.doubaocdn.com/s/k3h4FSPVHN","https://aka.doubaocdn.com/s/3y6CjvsIai","https://aka.doubaocdn.com/s/yLmrYar56l","https://aka.doubaocdn.com/s/e8aIvFUVyY","https://aka.doubaocdn.com/s/vjlRueGoin","https://aka.doubaocdn.com/s/IAlairodSv"],
    "jing-wei-tian-hai": ["https://aka.doubaocdn.com/s/rEaN9xu53v","https://aka.doubaocdn.com/s/Vk9Ot0QnW4","https://aka.doubaocdn.com/s/45YWr9kDUF","https://aka.doubaocdn.com/s/ikal22EkJf","https://aka.doubaocdn.com/s/z6q5JzhwSF","https://aka.doubaocdn.com/s/ZxVf6jiiph"],
    "kua-fu-zhui-ri": ["https://aka.doubaocdn.com/s/ArY9xXcddb","https://aka.doubaocdn.com/s/zwfFyHk1m1","https://aka.doubaocdn.com/s/cniwqEya8v","https://aka.doubaocdn.com/s/eEajH0gStU","https://aka.doubaocdn.com/s/VkMlveI2gJ","https://aka.doubaocdn.com/s/2hD0HmToTh"],
    "yu-gong-yi-shan": ["https://aka.doubaocdn.com/s/6ARNRAwJd5","https://aka.doubaocdn.com/s/JStoYyh8ky","https://aka.doubaocdn.com/s/5sS1O1ak34","https://aka.doubaocdn.com/s/oBL1prjtEP","https://aka.doubaocdn.com/s/CUVJ6tJb3S","https://aka.doubaocdn.com/s/8zQE2J9u07"],
    "kong-rong-rang-li": ["https://aka.doubaocdn.com/s/IK3vciEzpB","https://aka.doubaocdn.com/s/VbVz7Q1AI4","https://aka.doubaocdn.com/s/BTbdidUO5J","https://aka.doubaocdn.com/s/G2urYhvkgU","https://aka.doubaocdn.com/s/nAQdLWA3sK","https://aka.doubaocdn.com/s/n6HB7AgjpP"],
    "mo-cheng-cheng-zhen": ["https://aka.doubaocdn.com/s/p37YgVfxoc","https://aka.doubaocdn.com/s/mLXfRXICFt","https://aka.doubaocdn.com/s/6ohqLideEV","https://aka.doubaocdn.com/s/QOVIUVUczV","https://aka.doubaocdn.com/s/9HIWwXV0GA","https://aka.doubaocdn.com/s/h23aMcLT2q"],
    "wen-ji-qi-wu": ["https://aka.doubaocdn.com/s/cUV7pMO877","https://aka.doubaocdn.com/s/2lSsmmM9Qt","https://aka.doubaocdn.com/s/WuVKEIxnmB","https://aka.doubaocdn.com/s/LQ1V6ln2aX","https://aka.doubaocdn.com/s/Aq9sreryBA","https://aka.doubaocdn.com/s/DlhmfLjTk3"],
    "zao-bi-tou-guang": ["https://aka.doubaocdn.com/s/oVnuDSAhBl","https://aka.doubaocdn.com/s/4tQUy4VD6U","https://aka.doubaocdn.com/s/MMv9HaH0Hl","https://aka.doubaocdn.com/s/U2wLXY7osQ","https://aka.doubaocdn.com/s/Uv00OhcHcm","https://aka.doubaocdn.com/s/WgabDCVma4"],
    "lan-yu-chong-shu": ["https://aka.doubaocdn.com/s/GTVXR47f40","https://aka.doubaocdn.com/s/6VrJVpAGdr","https://aka.doubaocdn.com/s/MGVf7vrAUO","https://aka.doubaocdn.com/s/V6RjHGLb6L","https://aka.doubaocdn.com/s/YJrwkOsVLS","https://aka.doubaocdn.com/s/ZGAap8Vxzc"],
    "han-dan-xue-bu": ["https://aka.doubaocdn.com/s/LO3hi1VP8A","https://aka.doubaocdn.com/s/o4xh62Wyno","https://aka.doubaocdn.com/s/k35aQy5u1Z","https://aka.doubaocdn.com/s/f3vFEUYYd0","https://aka.doubaocdn.com/s/UpfPB7Zuo2","https://aka.doubaocdn.com/s/IKcs3btIz5"],
    "dui-niu-tan-qin": ["https://aka.doubaocdn.com/s/RePjNgLfBz","https://aka.doubaocdn.com/s/MuyScdKsUQ","https://aka.doubaocdn.com/s/GfMrzZZwLf","https://aka.doubaocdn.com/s/H3GOQ9O3U5","https://aka.doubaocdn.com/s/9rIKIDUirA","https://aka.doubaocdn.com/s/T1dPDracUE"],
    "bei-gong-she-ying": ["https://aka.doubaocdn.com/s/mWIXZXTVq9","https://aka.doubaocdn.com/s/bRHd5M0dVi","https://aka.doubaocdn.com/s/VNGUYdmq6U","https://aka.doubaocdn.com/s/6MGFIC5IFx","https://aka.doubaocdn.com/s/KhLuNQ5BeX","https://aka.doubaocdn.com/s/yvVORFnv3k"],
    "ye-lang-zi-da": ["https://aka.doubaocdn.com/s/elvMKIl7LV","https://aka.doubaocdn.com/s/9sdL8BGOX4","https://aka.doubaocdn.com/s/gIV0tIJu6l","https://aka.doubaocdn.com/s/FBO0VyiPF6","https://aka.doubaocdn.com/s/bpRSp0EGAf","https://aka.doubaocdn.com/s/VhMKnjGkpS"],
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
