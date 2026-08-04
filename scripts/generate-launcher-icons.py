#!/usr/bin/env python3
"""Rasterize PaisaFlow legacy launcher icons (pre-API-26 PNG mipmaps).

Pure stdlib (zlib + struct) — no third-party packages. Renders the same
"flow" mark as android/app/src/main/res/drawable/ic_launcher_foreground.xml:
three rounded bars of descending length in warm off-white on the terracotta
brand color. Square icons are full-bleed; round icons are a disc on a
transparent canvas.

Usage: python3 scripts/generate-launcher-icons.py
Output: android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher{,_round}.png
"""

import os
import struct
import zlib

# Brand colors (src/design-system/tokens/colors.ts)
TERRACOTTA = (0xB0, 0x51, 0x2F)  # primary (light theme)
OFF_WHITE = (0xFD, 0xF8, 0xF3)  # onPrimary

# Glyph geometry, in the same 108x108 coordinate space as the vector drawable.
# (x1, y1, x2, y2) segments with a shared stroke radius (strokeWidth 7 / 2).
SEGMENTS = [
    (38.0, 42.0, 70.0, 42.0),
    (38.0, 54.0, 62.0, 54.0),
    (38.0, 66.0, 54.0, 66.0),
]
STROKE_RADIUS = 3.5

# Legacy icons have no outer mask zone, so zoom the 108-unit glyph space in a
# little compared to the adaptive icon (where ~25% is reserved for the mask).
GLYPH_ZOOM = 1.15

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

SUPERSAMPLE = 4  # subpixels per axis for anti-aliasing

RES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "android", "app", "src", "main", "res"
)


def dist_to_segment(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        t = 0.0
    else:
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / length_sq))
    cx, cy = x1 + t * dx, y1 + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def render(size, round_icon):
    """Return RGBA pixel rows for a `size`x`size` icon."""
    scale = (size / 108.0) * GLYPH_ZOOM

    def to_canvas(x, y):
        # Center the 108-unit viewport origin on the canvas center.
        return ((x - 54.0) * scale + size / 2.0, (y - 54.0) * scale + size / 2.0)

    segments = [to_canvas(x1, y1) + to_canvas(x2, y2) for x1, y1, x2, y2 in SEGMENTS]
    radius = STROKE_RADIUS * scale
    center = size / 2.0
    disc_radius = size / 2.0

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            bg_r = bg_g = bg_b = bg_a = 0
            fg = 0  # subpixel coverage of the glyph
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    px = x + (sx + 0.5) / SUPERSAMPLE
                    py = y + (sy + 0.5) / SUPERSAMPLE
                    on_glyph = any(
                        dist_to_segment(px, py, *seg) <= radius for seg in segments
                    )
                    if round_icon:
                        in_bg = (px - center) ** 2 + (
                            py - center
                        ) ** 2 <= disc_radius**2
                    else:
                        in_bg = True
                    if on_glyph and in_bg:
                        fg += 1
                    elif in_bg:
                        bg_r += TERRACOTTA[0]
                        bg_g += TERRACOTTA[1]
                        bg_b += TERRACOTTA[2]
                        bg_a += 1
            total = SUPERSAMPLE * SUPERSAMPLE
            r = (fg * OFF_WHITE[0] + bg_r) // total
            g = (fg * OFF_WHITE[1] + bg_g) // total
            b = (fg * OFF_WHITE[2] + bg_b) // total
            a = ((fg + bg_a) * 255) // total
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)
    raw = b"".join(b"\x00" + row for row in rows)  # filter type 0 per scanline

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    for density, size in DENSITIES.items():
        out_dir = os.path.join(RES_DIR, density)
        os.makedirs(out_dir, exist_ok=True)
        for name, round_icon in (("ic_launcher", False), ("ic_launcher_round", True)):
            path = os.path.join(out_dir, f"{name}.png")
            write_png(path, render(size, round_icon))
            print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
