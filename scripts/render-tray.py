#!/usr/bin/env python3
"""Генерация tray.png: прозрачный фон + цветной кружок (без qlmanage)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "main", "icons", "tray.png")
SIZE = 44

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.ellipse((1, 1, SIZE - 2, SIZE - 2), fill=(88, 101, 242, 255))
draw.ellipse((9, 9, SIZE - 10, SIZE - 10), fill=(114, 137, 218, 255))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print(f"tray.png -> {OUT}")
