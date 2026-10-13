import urllib.request, os
base = r"D:\福福学堂\frontend\assets\stories"
updates = {
    r"shou-zhu-dai-tu\1.png": "https://aka.doubaocdn.com/s/JCVSsrpRVG",
    r"si-ma-guang-za-gang\3.png": "https://aka.doubaocdn.com/s/2UbSx7tsBU",
    r"hua-she-tian-zu\6.png": "https://aka.doubaocdn.com/s/ypOIXlPHuF",
    r"hou-yi-she-ri\5.png": "https://aka.doubaocdn.com/s/2QoyO0Uemz",
}
for rel, url in updates.items():
    out = os.path.join(base, rel)
    urllib.request.urlretrieve(url, out)
    print(f"overwrote {rel}  {os.path.getsize(out)//1024}KB")
