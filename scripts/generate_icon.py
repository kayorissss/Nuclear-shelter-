#!/usr/bin/env python3
"""
Generates custom game icon (assets/icon.ico and assets/icon.png)
Style: Soviet/Russian Nuclear Bunker "ЗАСЛОН-19" — armored blast door gear,
radioactive trefoil, glowing amber/green accents, crimson star.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

os.makedirs("assets", exist_ok=True)
os.makedirs("public/assets", exist_ok=True)

SIZE = 256
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

cx, cy = SIZE // 2, SIZE // 2

# 1. Outer octagon / heavy bunker blast door gear teeth
num_teeth = 12
outer_r = 122
inner_r = 108
gear_pts = []
for i in range(num_teeth * 4):
    angle = (i / (num_teeth * 4)) * math.tau - math.pi / 2
    r = outer_r if (i % 4 in (1, 2)) else inner_r
    gear_pts.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))

draw.polygon(gear_pts, fill=(28, 36, 30, 255), outline=(92, 110, 90, 255))

# 2. Heavy steel bezel ring
draw.ellipse(
    [cx - 104, cy - 104, cx + 104, cy + 104],
    fill=(18, 24, 20, 255),
    outline=(190, 145, 45, 255),
    width=4,
)

# 3. Hazard stripes ring segment
for deg in range(0, 360, 20):
    a1 = math.radians(deg)
    a2 = math.radians(deg + 10)
    pts = [
        (cx + math.cos(a1) * 98, cy + math.sin(a1) * 98),
        (cx + math.cos(a2) * 98, cy + math.sin(a2) * 98),
        (cx + math.cos(a2) * 88, cy + math.sin(a2) * 88),
        (cx + math.cos(a1) * 88, cy + math.sin(a1) * 88),
    ]
    draw.polygon(pts, fill=(215, 155, 30, 230))

# 4. Inner dark vault core
draw.ellipse(
    [cx - 86, cy - 86, cx + 86, cy + 86],
    fill=(12, 17, 14, 255),
    outline=(74, 222, 128, 200),
    width=2,
)

# 5. Radioactive trefoil blades (glowing amber-gold)
def draw_sector(r_in, r_out, start_deg, end_deg, color):
    pts = []
    steps = 24
    for s in range(steps + 1):
        a = math.radians(start_deg + (end_deg - start_deg) * s / steps)
        pts.append((cx + math.cos(a) * r_out, cy + math.sin(a) * r_out))
    for s in range(steps, -1, -1):
        a = math.radians(start_deg + (end_deg - start_deg) * s / steps)
        pts.append((cx + math.cos(a) * r_in, cy + math.sin(a) * r_in))
    draw.polygon(pts, fill=color, outline=(255, 215, 90, 255))

for base_angle in (-30, 90, 210):
    draw_sector(24, 72, base_angle - 28, base_angle + 28, (235, 168, 28, 255))

# 6. Center red star & core circle
draw.ellipse(
    [cx - 20, cy - 20, cx + 20, cy + 20],
    fill=(22, 30, 24, 255),
    outline=(245, 180, 40, 255),
    width=3,
)

star_pts = []
for i in range(10):
    angle = math.radians(i * 36 - 90)
    r = 14 if i % 2 == 0 else 6
    star_pts.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
draw.polygon(star_pts, fill=(225, 45, 45, 255), outline=(255, 180, 120, 255))

# 7. Rivets around the steel rim
for deg in range(15, 360, 30):
    a = math.radians(deg)
    rx = cx + math.cos(a) * 101
    ry = cy + math.sin(a) * 101
    draw.ellipse([rx - 3, ry - 3, rx + 3, ry + 3], fill=(150, 165, 150, 255))

# Save PNG and multi-resolution ICO
img.save("assets/icon.png", format="PNG")
img.save("public/assets/icon.png", format="PNG")
img.save(
    "assets/icon.ico",
    format="ICO",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)
img.save(
    "public/assets/icon.ico",
    format="ICO",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)
print("Generated assets/icon.ico and assets/icon.png successfully!")
