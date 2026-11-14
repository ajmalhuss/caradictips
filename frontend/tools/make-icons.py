#!/usr/bin/env python3
"""Generate the PWA icon set for Cardiac Care Tips.

Run from the repo root:  python3 frontend/tools/make-icons.py

Writes PNGs into frontend/public/ (Vite copies public/ to the site root). Every
size is drawn from vectors at the output resolution, so nothing is upscaled.

Design: a white heart on a rounded crimson tile. The pad is varied per target —
`any` icons keep the heart inside the safe area; `maskable` icons bleed to the
edges so Android's mask crop cannot clip the mark.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
RED = (190, 30, 45)      # crimson, matches the app's rose-600 emergency accent
RED_DEEP = (150, 22, 36)

# Standard `any` sizes plus the 512 maskable and Apple touch icon.
SIZES = [72, 96, 128, 144, 152, 192, 256, 384, 512]


def heart_points(cx: float, cy: float, size: float, steps: int = 720):
    """Parametric heart outline, scaled so its bounding box is `size` tall."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * (math.sin(t) ** 3)
        y = -(13 * math.cos(t)
              - 5 * math.cos(2 * t)
              - 2 * math.cos(3 * t)
              - math.cos(4 * t))
        pts.append((x, y))
    minx = min(p[0] for p in pts); maxx = max(p[0] for p in pts)
    miny = min(p[1] for p in pts); maxy = max(p[1] for p in pts)
    w = maxx - minx; h = maxy - miny
    s = size / max(w, h)
    ox = cx - (minx + w / 2) * s
    oy = cy - (miny + h / 2) * s
    return [(x * s + ox, y * s + oy) for x, y in pts]


def draw_icon(px: int, maskable: bool) -> Image.Image:
    """Render one square icon at `px` resolution."""
    ss = 4  # supersample, then downscale for clean edges
    size = px * ss
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    if maskable:
        # Full-bleed background: Android crops this to its own shape.
        shape = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(shape).rectangle([0, 0, size, size], fill=(255, 255, 255, 255))
        heart_frac = 0.46          # smaller: must survive the mask's safe zone
    else:
        # Rounded tile with a margin so it reads as an app icon in a launcher.
        margin = size * 0.06
        shape = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(shape).rounded_rectangle(
            [margin, margin, size - margin, size - margin],
            radius=size * 0.22, fill=(255, 255, 255, 255),
        )
        heart_frac = 0.54

    # Vertical gradient (lighter top → deeper base), masked to the tile shape.
    # A linear ramp, not a hard-edged ellipse: an ellipse leaves a visible seam
    # across the icon at the point its edge crosses the tile.
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(size - 1, 1)
        grad.putpixel((0, y), tuple(
            round(RED[i] + (RED_DEEP[i] - RED[i]) * (t ** 1.3)) for i in range(3)
        ))
    grad = grad.resize((size, size), Image.BILINEAR).convert("RGBA")
    img.paste(grad, (0, 0), shape)

    d = ImageDraw.Draw(img)
    heart = heart_points(size / 2, size / 2, size * heart_frac)
    d.polygon(heart, fill=(255, 255, 255, 255))

    return img.resize((px, px), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for px in SIZES:
        p = OUT / f"icon-{px}.png"
        draw_icon(px, maskable=False).save(p, "PNG", optimize=True)
        written.append(p.name)

    # Maskable: same art, full bleed, safe-zone sized.
    m = OUT / "icon-maskable-512.png"
    draw_icon(512, maskable=True).save(m, "PNG", optimize=True)
    written.append(m.name)

    # Apple touch icon: iOS wants an opaque square (it applies its own rounding).
    apple = OUT / "apple-touch-icon.png"
    draw_icon(180, maskable=True).save(apple, "PNG", optimize=True)
    written.append(apple.name)

    # Favicon fallback for browsers that ignore the manifest.
    draw_icon(32, maskable=False).save(OUT / "favicon.png", "PNG", optimize=True)
    written.append("favicon.png")

    print(f"{len(written)} icons written to {OUT}:")
    for n in written:
        print("  ", n)


if __name__ == "__main__":
    main()