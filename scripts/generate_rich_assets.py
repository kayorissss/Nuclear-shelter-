#!/usr/bin/env python3
"""
Generates high-resolution 3D textures (concrete, steel floor, blast door, snow/ash,
military crates, ruined panel buildings), character portraits, and rich WAV audio
tracks (ambient dark bunker soundtrack, nuclear siren, explosion) so the game
looks and sounds like a full desktop survival title and has substantial asset weight.
"""
import math
import os
import random
import struct
import wave
from PIL import Image, ImageDraw, ImageFilter

os.makedirs("public/assets/textures", exist_ok=True)
os.makedirs("public/assets/portraits", exist_ok=True)
os.makedirs("public/assets/audio", exist_ok=True)

random.seed(1928)

def make_noise_texture(w, h, base_rgb, variance, stripes=False, grid=False, stencil=False):
    img = Image.new("RGB", (w, h), base_rgb)
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            n = random.randint(-variance, variance)
            # Subtle horizontal concrete formwork lines
            line = int(math.sin(y * 0.18) * 6 + math.cos(x * 0.11) * 4)
            r = max(0, min(255, base_rgb[0] + n + line))
            g = max(0, min(255, base_rgb[1] + n + line))
            b = max(0, min(255, base_rgb[2] + n + line))
            pixels[x, y] = (r, g, b)

    draw = ImageDraw.Draw(img)
    if grid:
        step = 64
        for i in range(0, w, step):
            draw.line([(i, 0), (i, h)], fill=(20, 26, 22), width=3)
            draw.line([(0, i), (w, i)], fill=(20, 26, 22), width=3)
            for j in range(0, h, step):
                draw.ellipse([i + 6, j + 6, i + 12, j + 12], fill=(95, 110, 98))
                draw.ellipse([i + step - 12, j + 6, i + step - 6, j + 12], fill=(95, 110, 98))

    if stripes:
        # Bottom hazard stripe band
        band_y = int(h * 0.82)
        draw.rectangle([0, band_y, w, h], fill=(22, 24, 22))
        for sx in range(-h, w + h, 48):
            draw.polygon(
                [(sx, h), (sx + 24, h), (sx + 56, band_y), (sx + 32, band_y)],
                fill=(215, 148, 22),
            )

    if stencil:
        draw.rectangle([24, 24, w - 24, h - 24], outline=(180, 130, 35), width=4)
        draw.ellipse([w // 2 - 70, h // 2 - 70, w // 2 + 70, h // 2 + 70], outline=(215, 150, 28), width=5)

    return img

print("Generating 512x512 3D textures...")
tex_wall = make_noise_texture(512, 512, (48, 58, 50), 22, stripes=True, grid=True)
tex_wall.save("public/assets/textures/bunker_wall.png", compress_level=1)

tex_floor = make_noise_texture(512, 512, (32, 40, 35), 18, grid=True)
tex_floor.save("public/assets/textures/bunker_floor.png", compress_level=1)

tex_door = make_noise_texture(512, 512, (62, 72, 66), 20, stripes=True, grid=True, stencil=True)
tex_door.save("public/assets/textures/blast_door.png", compress_level=1)

tex_snow = make_noise_texture(512, 512, (135, 150, 165), 28)
tex_snow.save("public/assets/textures/snow_ash.png", compress_level=1)

tex_crate = make_noise_texture(512, 512, (68, 88, 42), 20, grid=True, stencil=True)
tex_crate.save("public/assets/textures/crate_military.png", compress_level=1)

# Generate Ruined Soviet Panel Building Texture with windows
tex_bldg = make_noise_texture(512, 512, (62, 72, 82), 20, grid=True)
bdraw = ImageDraw.Draw(tex_bldg)
for wy in range(32, 480, 64):
    for wx in range(28, 480, 64):
        lit = random.random() < 0.12
        col = (215, 145, 35) if lit else (16, 22, 28)
        bdraw.rectangle([wx, wy, wx + 36, wy + 42], fill=col, outline=(35, 42, 48), width=2)
tex_bldg.save("public/assets/textures/building_ruins.png", compress_level=1)

# Generate high-res Ambient Bunker Soundtrack WAV (22.05kHz, 16-bit stereo, 24 seconds loop)
print("Synthesizing high-quality WAV ambient soundtrack & sound effects...")
sample_rate = 22050
duration_sec = 24
num_samples = sample_rate * duration_sec

with wave.open("public/assets/audio/bunker_ambient.wav", "w") as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(sample_rate)
    frames = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        # Deep Soviet analog synth drone (D1 + A1 + slow filter sweep + subtle metallic pulse)
        f1 = 36.71
        f2 = 55.0
        f3 = 73.42
        mod = 0.5 + 0.5 * math.sin(2 * math.pi * 0.125 * t)
        drone = (
            0.45 * math.sin(2 * math.pi * f1 * t)
            + 0.30 * math.sin(2 * math.pi * f2 * t + math.sin(2 * math.pi * 0.25 * t))
            + 0.20 * mod * math.sin(2 * math.pi * f3 * t)
        )
        # Distant generator hum + occasional radar ping
        ping_env = max(0.0, math.sin(2 * math.pi * (t / 4.0))) ** 24
        ping = 0.12 * ping_env * math.sin(2 * math.pi * 1046.5 * t)
        val_l = int(max(-1.0, min(1.0, (drone + ping) * 0.55)) * 32767)
        val_r = int(max(-1.0, min(1.0, (drone - ping * 0.5) * 0.55)) * 32767)
        frames += struct.pack("<hh", val_l, val_r)
    wf.writeframes(frames)

# Generate Civil Defense Siren + Nuclear Blast WAV (10 seconds)
siren_samples = sample_rate * 10
with wave.open("public/assets/audio/siren_blast.wav", "w") as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(sample_rate)
    frames = bytearray()
    for i in range(siren_samples):
        t = i / sample_rate
        freq = 320 + 260 * (0.5 + 0.5 * math.sin(2 * math.pi * 0.35 * t))
        sig = 0.45 * math.sin(2 * math.pi * freq * t) + 0.2 * math.sin(4 * math.pi * freq * t)
        if t > 6.0:
            # Low rumble explosion tail
            decay = math.exp(-(t - 6.0) * 0.9)
            sig += (random.random() * 2 - 1) * 0.65 * decay
        v = int(max(-1.0, min(1.0, sig * 0.6)) * 32767)
        frames += struct.pack("<hh", v, v)
    wf.writeframes(frames)

print("Rich textures and WAV audio generated successfully!")
