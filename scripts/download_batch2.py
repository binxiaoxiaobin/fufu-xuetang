import urllib.request, os
base = r"D:\福福学堂\frontend\assets\real-tours"
new_imgs = [
    # France
    ("france-4.jpg",      "https://aka.doubaocdn.com/s/xZi0hhwswm"),
    ("france-5.jpg",      "https://aka.doubaocdn.com/s/tqkkWfMOGl"),
    # UK
    ("united-kingdom-3.jpg", "https://aka.doubaocdn.com/s/Eu31BNGItO"),
    ("united-kingdom-4.jpg", "https://aka.doubaocdn.com/s/UKndsGvoA2"),
    ("united-kingdom-5.jpg", "https://aka.doubaocdn.com/s/FAzHk9i4p3"),
    # China
    ("china-4.jpg",       "https://aka.doubaocdn.com/s/FhJTilhnv4"),
    ("china-5.jpg",       "https://aka.doubaocdn.com/s/tQgzPkfp6P"),
    # Japan
    ("japan-3.jpg",       "https://aka.doubaocdn.com/s/U0BtMuZSVE"),
    ("japan-4.jpg",       "https://aka.doubaocdn.com/s/llh29W7wTz"),
    ("japan-5.jpg",       "https://aka.doubaocdn.com/s/FYXWhCF90r"),
    # India
    ("india-4.jpg",       "https://aka.doubaocdn.com/s/x1osJ9z3L0"),
    ("india-5.jpg",       "https://aka.doubaocdn.com/s/h3AUUadGIV"),
    # Thailand
    ("thailand-3.jpg",    "https://aka.doubaocdn.com/s/WamPYwJoMy"),
    ("thailand-4.jpg",    "https://aka.doubaocdn.com/s/c9d8GDXUVA"),
    ("thailand-5.jpg",    "https://aka.doubaocdn.com/s/V80M6R6d8H"),
    # USA
    ("usa-4.jpg",         "https://aka.doubaocdn.com/s/GJCYuI2EKi"),
    ("usa-5.jpg",         "https://aka.doubaocdn.com/s/lTz2kwDDnb"),
    # Australia
    ("australia-4.jpg",   "https://aka.doubaocdn.com/s/d7lCV1reDM"),
    ("australia-5.jpg",   "https://aka.doubaocdn.com/s/zjZLyIzUtI"),
    # Italy
    ("italy-4.jpg",       "https://aka.doubaocdn.com/s/nV1FHqqDkN"),
    ("italy-5.jpg",       "https://aka.doubaocdn.com/s/Ml74N31CVq"),
    # Brazil
    ("brazil-4.jpg",      "https://aka.doubaocdn.com/s/qj5zpNTPwM"),
    ("brazil-5.jpg",      "https://aka.doubaocdn.com/s/DpX4xQVyxx"),
    # Egypt
    ("egypt-4.jpg",       "https://aka.doubaocdn.com/s/KPFER0eOTM"),
    ("egypt-5.jpg",       "https://aka.doubaocdn.com/s/RF4quLCriT"),
]
for fn, url in new_imgs:
    out = os.path.join(base, fn)
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(url, out)
            print(f"OK {fn}  {os.path.getsize(out)//1024}KB")
            break
        except Exception as e:
            print(f"retry {fn}: {e}")
