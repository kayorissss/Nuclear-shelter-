#!/usr/bin/env python3
"""
Generates a standard Windows binary resource file (native_win/resources.res)
from assets/icon.ico with RT_GROUP_ICON (ID 101) and RT_ICON entries.
Linked directly by `zig c++ -target x86_64-windows-gnu` into the PE .rsrc section!
"""
import struct

with open("assets/icon.ico", "rb") as f:
    ico = f.read()

reserved, ico_type, count = struct.unpack_from("<HHH", ico, 0)
assert reserved == 0 and ico_type == 1, "Invalid ICO header"

entries = []
offset = 6
for i in range(count):
    w, h, color_count, res, planes, bit_count, bytes_in_res, img_offset = struct.unpack_from(
        "<BBBBHHII", ico, offset
    )
    offset += 16
    img_data = ico[img_offset : img_offset + bytes_in_res]
    entries.append((i + 1, w, h, color_count, res, planes, bit_count, bytes_in_res, img_data))

def make_res_record(res_type, res_id, data_bytes, lang=0x0419):
    data_size = len(data_bytes)
    header = struct.pack(
        "<IIHHHHIHHII",
        data_size,
        32,         # HeaderSize
        0xFFFF,
        res_type,   # Type ordinal
        0xFFFF,
        res_id,     # Name ordinal
        0,          # DataVersion
        0x1030,     # MemoryFlags (MOVEABLE | PURE)
        lang,       # LanguageId (Russian 0x0419)
        0,          # Version
        0,          # Characteristics
    )
    pad_len = (4 - (data_size % 4)) % 4
    return header + data_bytes + (b"\x00" * pad_len)

out = bytearray()
# 1. Initial 32-byte null resource record required by .res format
out += struct.pack("<IIHHHHIHHII", 0, 32, 0xFFFF, 0, 0xFFFF, 0, 0, 0, 0, 0, 0)

# 2. RT_ICON (type = 3) records
grp_dir = bytearray(struct.pack("<HHH", 0, 1, count))
for icon_id, w, h, cc, res, planes, bc, size, img_data in entries:
    out += make_res_record(3, icon_id, img_data)
    grp_dir += struct.pack("<BBBBHHIH", w, h, cc, res, planes, bc, size, icon_id)

# 3. RT_GROUP_ICON (type = 14) record with ID = 101
out += make_res_record(14, 101, bytes(grp_dir))

with open("native_win/resources.res", "wb") as f:
    f.write(out)

print(f"Generated native_win/resources.res ({len(out):,} bytes, {count} icon sizes, ID=101)")
