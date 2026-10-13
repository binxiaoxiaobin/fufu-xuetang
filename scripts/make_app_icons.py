# -*- coding: utf-8 -*-
"""生成"福福学堂"的 PWA / iOS 主屏图标。

输出到 frontend/assets/icons/：
    icon-192.png / icon-512.png   —— manifest 用
    apple-touch-icon.png (180)    —— iOS 添加到主屏幕用

iOS 会自己给图标加圆角，所以这里画满幅方图、不要自己切圆角，
否则会出现双重圆角。内容只占约 62%，留出安全区，可同时声明为 maskable。

用法：python scripts/make_app_icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "frontend", "assets", "icons")

# 取自站点主色：深绿到浅绿，字用暖白
TOP = (72, 106, 84)
BOTTOM = (118, 158, 126)
INK = (255, 250, 238)

GLYPH = "福"
GLYPH_RATIO = 0.56          # 字占边长比例，留白给 iOS / Android 的裁切
TARGETS = [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]


def pick_font_path():
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    raise SystemExit("找不到可用的中文字体，请检查 C:\\Windows\\Fonts")


def render(size, font_path):
    image = Image.new("RGB", (size, size), TOP)
    draw = ImageDraw.Draw(image)

    # 垂直渐变底
    for y in range(size):
        t = y / max(1, size - 1)
        draw.line(
            [(0, y), (size, y)],
            fill=(
                round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
                round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
                round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
            ),
        )

    font = ImageFont.truetype(font_path, int(size * GLYPH_RATIO))
    box = draw.textbbox((0, 0), GLYPH, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text(
        ((size - width) / 2 - box[0], (size - height) / 2 - box[1]),
        GLYPH,
        font=font,
        fill=INK,
    )
    return image


def main():
    font_path = pick_font_path()
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, size in TARGETS:
        path = os.path.join(OUT_DIR, name)
        render(size, font_path).save(path, "PNG", optimize=True)
        print("已生成 %s (%dx%d, %d 字节)" % (name, size, size, os.path.getsize(path)))


if __name__ == "__main__":
    main()
