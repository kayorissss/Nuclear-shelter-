#!/usr/bin/env python3
"""
Bundles the entire 3D+2D game into:
1) dist/index.html (single-file standalone HTML with Three.js, CSS, JS, and icon inlined)
2) native_win/game_bundle.h (C byte array for embedding inside Zaslon19_Bunker.exe)
3) native_win/webview2_dll.h (Embedded 64-bit WebView2Loader.dll for standalone Windows .exe)
"""
import base64
import io
import json
import os
import urllib.request
import zipfile

os.makedirs("release", exist_ok=True)
os.makedirs("native_win", exist_ok=True)

# 1. Read assets and inline into a single self-contained HTML file
with open("public/assets/icon.png", "rb") as f:
    icon_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")

embedded_assets = {}
for tex_name in os.listdir("public/assets/textures"):
    p = os.path.join("public/assets/textures", tex_name)
    if os.path.isfile(p):
        with open(p, "rb") as f:
            embedded_assets[tex_name] = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")

for aud_name in os.listdir("public/assets/audio"):
    p = os.path.join("public/assets/audio", aud_name)
    if os.path.isfile(p):
        with open(p, "rb") as f:
            embedded_assets[aud_name] = "data:audio/wav;base64," + base64.b64encode(f.read()).decode("ascii")

embedded_js = "window.EMBEDDED_ASSETS = " + json.dumps(embedded_assets) + ";\n"

with open("public/css/style.css", "r", encoding="utf-8") as f:
    css = f.read()

js_files = [
    "public/lib/three.min.js",
    "public/js/data.js",
    "public/js/sound.js",
    "public/js/cutscene.js",
    "public/js/world3d.js",
    "public/js/game.js",
]
js_combined = [embedded_js]
for jf in js_files:
    with open(jf, "r", encoding="utf-8") as f:
        js_combined.append(f"/* === {jf} === */\n" + f.read())

with open("public/index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Replace external asset references with inline versions
html = html.replace('href="assets/icon.png"', f'href="{icon_b64}"')
html = html.replace('src="assets/icon.png"', f'src="{icon_b64}"')
html = html.replace('<link rel="stylesheet" href="css/style.css" />', f"<style>\n{css}\n</style>")

scripts_block = "\n".join([
    '  <script src="lib/three.min.js"></script>',
    '  <script src="js/data.js"></script>',
    '  <script src="js/sound.js"></script>',
    '  <script src="js/cutscene.js"></script>',
    '  <script src="js/world3d.js"></script>',
    '  <script src="js/game.js"></script>',
])
inline_scripts = "<script>\n" + "\n\n".join(js_combined) + "\n</script>"
html = html.replace(scripts_block, inline_scripts)

html_bytes = html.encode("utf-8")
with open("release/Zaslon19_Standalone.html", "wb") as f:
    f.write(html_bytes)

print(f"Bundled standalone HTML: {len(html_bytes):,} bytes")

# 2. Write native_win/game_bundle.h using fast .incbin assembly
with open("native_win/game_bundle.h", "w", encoding="utf-8") as out:
    out.write(f"""#pragma once
extern "C" const unsigned char GAME_HTML_BUNDLE[];
static const unsigned int GAME_HTML_BUNDLE_len = {len(html_bytes)};
__asm__(
  ".section .rdata,\\\"dr\\\"\\n"
  ".globl GAME_HTML_BUNDLE\\n"
  "GAME_HTML_BUNDLE:\\n"
  ".incbin \\"release/Zaslon19_Standalone.html\\"\\n"
  ".byte 0\\n"
);
""")
print("Generated native_win/game_bundle.h (.incbin)")

# 3. Fetch WebView2Loader.dll (win-x64) from pywebview wheel on PyPI
r = urllib.request.urlopen("https://pypi.org/pypi/pywebview/json", timeout=10)
meta = json.loads(r.read())
whl_url = meta["urls"][0]["url"]
whl_bytes = urllib.request.urlopen(whl_url, timeout=15).read()
z = zipfile.ZipFile(io.BytesIO(whl_bytes))
dll_bytes = z.read("webview/lib/runtimes/win-x64/native/WebView2Loader.dll")

with open("native_win/WebView2Loader.dll", "wb") as f:
    f.write(dll_bytes)
with open("release/WebView2Loader.dll", "wb") as f:
    f.write(dll_bytes)

with open("native_win/webview2_dll.h", "w", encoding="utf-8") as out:
    out.write(f"""#pragma once
extern "C" const unsigned char WEBVIEW2_LOADER_DLL[];
static const unsigned int WEBVIEW2_LOADER_DLL_len = {len(dll_bytes)};
__asm__(
  ".section .rdata,\\\"dr\\\"\\n"
  ".globl WEBVIEW2_LOADER_DLL\\n"
  "WEBVIEW2_LOADER_DLL:\\n"
  ".incbin \\"native_win/WebView2Loader.dll\\"\\n"
);
""")
print(f"Extracted WebView2Loader.dll ({len(dll_bytes):,} bytes) and generated native_win/webview2_dll.h (.incbin)")
