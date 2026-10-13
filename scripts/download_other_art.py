import urllib.request, os, time
base = r"D:\福福学堂\frontend\assets\stories"
data = {
    "shou-zhu-dai-tu": [
        "https://aka.doubaocdn.com/s/AoKngAdRdQ",
        "https://aka.doubaocdn.com/s/2jXVig6xBO",
        "https://aka.doubaocdn.com/s/Qhy2GsCpIY",
        "https://aka.doubaocdn.com/s/zu9VwrK2Zn",
        "https://aka.doubaocdn.com/s/e4ns8Gechx",
        "https://aka.doubaocdn.com/s/0R7WYslNUQ",
    ],
    "hua-she-tian-zu": [
        "https://aka.doubaocdn.com/s/IjKJjoKecd",
        "https://aka.doubaocdn.com/s/82u7XyxFn3",
        "https://aka.doubaocdn.com/s/q1Srqyiydr",
        "https://aka.doubaocdn.com/s/uCPEVHcMFy",
        "https://aka.doubaocdn.com/s/G5tePtOxjw",
        "https://aka.doubaocdn.com/s/3y2EEMxvKm",
    ],
    "si-ma-guang-za-gang": [
        "https://aka.doubaocdn.com/s/hx4sUM5hBf",
        "https://aka.doubaocdn.com/s/IH5iVdEDQg",
        "https://aka.doubaocdn.com/s/gPFvswRzTl",
        "https://aka.doubaocdn.com/s/5CGuhVuUbl",
        "https://aka.doubaocdn.com/s/zWus2ISQjI",
        "https://aka.doubaocdn.com/s/1FMHVEt06j",
    ],
    "cao-chong-cheng-xiang": [
        "https://aka.doubaocdn.com/s/i5kme4r2cR",
        "https://aka.doubaocdn.com/s/3kVi7iULcj",
        "https://aka.doubaocdn.com/s/2v0QFoPyJl",
        "https://aka.doubaocdn.com/s/LAChVqDu6R",
        "https://aka.doubaocdn.com/s/fz8eVDkDwk",
        "https://aka.doubaocdn.com/s/zCv4hvrurt",
    ],
    "hou-yi-she-ri": [
        "https://aka.doubaocdn.com/s/J1CvesbDeP",
        "https://aka.doubaocdn.com/s/odnal2hFS5",
        "https://aka.doubaocdn.com/s/U04OSERTax",
        "https://aka.doubaocdn.com/s/RfOQ5T5dhZ",
        "https://aka.doubaocdn.com/s/4zUij9DlK5",
        "https://aka.doubaocdn.com/s/adoDQRLOCU",
    ],
}
for slug, urls in data.items():
    d = os.path.join(base, slug)
    os.makedirs(d, exist_ok=True)
    for i, url in enumerate(urls, 1):
        out = os.path.join(d, f"{i}.png")
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(url, out)
                print(f"OK {slug}/{i}.png  {os.path.getsize(out)//1024}KB")
                break
            except Exception as e:
                print(f"retry {slug}/{i} attempt {attempt+1}: {e}")
                time.sleep(2)
