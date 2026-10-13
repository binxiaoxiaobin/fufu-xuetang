import urllib.request, os
base = r"D:\福福学堂\frontend\assets\real-tours"
# (filename, url)
new_imgs = [
    ("france-3.jpg",     "https://aka.doubaocdn.com/s/SgqrcOz1Vv"),
    ("india-3.jpg",      "https://aka.doubaocdn.com/s/K9Wk8NcvsT"),
    ("italy-3.jpg",      "https://aka.doubaocdn.com/s/wVywBlqlJS"),
    ("australia-3.jpg",  "https://aka.doubaocdn.com/s/9OJtNIzVcI"),
    ("egypt-3.jpg",      "https://aka.doubaocdn.com/s/l79l7gNVZg"),
    ("china-3.jpg",      "https://aka.doubaocdn.com/s/eyvU202zFv"),
    ("usa-3.jpg",        "https://aka.doubaocdn.com/s/lMVdJDxd4b"),
    ("brazil-3.jpg",     "https://aka.doubaocdn.com/s/IfE9ujj6aI"),
]
for fn, url in new_imgs:
    out = os.path.join(base, fn)
    urllib.request.urlretrieve(url, out)
    print(f"OK {fn}  {os.path.getsize(out)//1024}KB")
