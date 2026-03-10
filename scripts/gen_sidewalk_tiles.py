#!/usr/bin/env python3
"""Generate sidewalk tile variants with cracks and noise variation.

Takes the base sidewalk_speckled.png and produces N variants with
random crack lines and slight color variation baked in.

Usage:
    python3 scripts/gen_sidewalk_tiles.py -n 8
"""

import argparse
import random
from pathlib import Path
from PIL import Image, ImageDraw

BASE = Path("public/assets/tilemaps/sidewalk_speckled.png")
OUT_DIR = Path("public/assets/tilemaps")


def iso_diamond_mask(w: int, h: int) -> Image.Image:
    """Create a mask for the iso diamond shape."""
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([
        (w // 2, 0),
        (w, h // 2),
        (w // 2, h),
        (0, h // 2),
    ], fill=255)
    return mask


def draw_crack(draw: ImageDraw.Draw, w: int, h: int, rng: random.Random):
    """Draw a single jagged crack line within the iso diamond."""
    # Start at a random point inside the diamond
    cx, cy = w / 2, h / 2
    t = rng.uniform(0.15, 0.85)
    # Pick a point along the diamond edge and offset inward
    edge = rng.randint(0, 3)
    if edge == 0:
        sx = cx + (t - 0.5) * w * 0.6
        sy = cy - h * 0.3 + rng.uniform(-2, 2)
    elif edge == 1:
        sx = cx + w * 0.3 + rng.uniform(-2, 2)
        sy = cy + (t - 0.5) * h * 0.6
    elif edge == 2:
        sx = cx + (t - 0.5) * w * 0.6
        sy = cy + h * 0.3 + rng.uniform(-2, 2)
    else:
        sx = cx - w * 0.3 + rng.uniform(-2, 2)
        sy = cy + (t - 0.5) * h * 0.6

    # Direction roughly along an iso axis (slope ±0.5) with jitter
    slope = rng.choice([-0.5, 0.5]) + rng.uniform(-0.2, 0.2)
    total_len = rng.uniform(20, 45)
    num_segs = rng.randint(2, 4)
    seg_len = total_len / num_segs

    points = [(sx, sy)]
    px, py = sx, sy
    for _ in range(num_segs):
        dx = seg_len * rng.choice([-1, 1])
        dy = dx * slope + rng.uniform(-3, 3)
        px += dx
        py += dy
        points.append((px, py))

    # Draw with subtle dark color
    color = (32, 32, 34, 255)
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=color, width=1)


def generate_variant(base: Image.Image, seed: int, num_cracks: int) -> Image.Image:
    """Generate one sidewalk variant with cracks."""
    img = base.copy()
    rng = random.Random(seed)

    w, h = img.size
    draw = ImageDraw.Draw(img)
    for _ in range(num_cracks):
        draw_crack(draw, w, h, rng)

    # Mask to iso diamond so cracks don't bleed outside
    mask = iso_diamond_mask(w, h)
    # Composite: keep only pixels inside diamond
    bg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    result = Image.composite(img, bg, mask)
    return result


def main():
    parser = argparse.ArgumentParser(description="Generate sidewalk tile variants")
    parser.add_argument("-n", type=int, default=8, help="Number of variants")
    args = parser.parse_args()

    base = Image.open(BASE).convert("RGBA")
    print(f"Base tile: {base.size}")

    for i in range(args.n):
        # Vary crack count: some clean, some heavily cracked
        num_cracks = random.Random(i * 1000).randint(0, 4)
        img = generate_variant(base, seed=i * 7919, num_cracks=num_cracks)
        out = OUT_DIR / f"sidewalk_{i}.png"
        img.save(out)
        print(f"  {out.name}: {num_cracks} cracks")

    print(f"\nGenerated {args.n} variants.")


if __name__ == "__main__":
    main()
