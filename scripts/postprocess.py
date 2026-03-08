#!/usr/bin/env python3
"""Post-process PixelLab assets for CyberDash's dark cyberpunk aesthetic.

Darkens, blue-shifts, and contrast-boosts pixel art PNGs while preserving alpha.

Usage:
    python3 scripts/postprocess.py [OPTIONS] INPUT [INPUT...]
    python3 scripts/postprocess.py --preview public/assets/sprites/door_*.png
    python3 scripts/postprocess.py --preset cyberdark-heavy public/assets/sprites/door_*.png
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

# ── Presets ──────────────────────────────────────────────────────────────────

PRESETS = {
    "cyberdark":       {"brightness": 0.45, "blue_shift": 0.08, "contrast": 1.2, "gamma": 1.0},
    "cyberdark-heavy": {"brightness": 0.35, "blue_shift": 0.10, "contrast": 1.3, "gamma": 1.2},
    "neon-preserve":   {"brightness": 0.50, "blue_shift": 0.05, "contrast": 1.4, "gamma": 1.3},
}


def process_image(
    img: Image.Image,
    brightness: float,
    blue_shift: float,
    contrast: float,
    gamma: float,
    alpha_threshold: int,
) -> Image.Image:
    """Apply the full processing pipeline to an RGBA image."""
    img = img.convert("RGBA")
    r, g, b, a = img.split()

    # 1. Alpha cleanup
    if alpha_threshold > 0:
        a = a.point(lambda v: 255 if v >= alpha_threshold else 0)

    # 2. Darken + blue shift (per-channel multipliers)
    r_mult = brightness * (1.0 - blue_shift)
    g_mult = brightness * (1.0 - blue_shift / 2.0)
    b_mult = brightness * (1.0 + blue_shift / 2.0)

    r = r.point(lambda v: min(255, int(v * r_mult)))
    g = g.point(lambda v: min(255, int(v * g_mult)))
    b = b.point(lambda v: min(255, int(v * b_mult)))

    # 3. Gamma correction (>1 darkens midtones)
    if gamma != 1.0:
        inv_gamma = 1.0 / gamma
        r = r.point(lambda v: min(255, int(255 * (v / 255.0) ** inv_gamma)))
        g = g.point(lambda v: min(255, int(255 * (v / 255.0) ** inv_gamma)))
        b = b.point(lambda v: min(255, int(255 * (v / 255.0) ** inv_gamma)))

    # 4. Contrast boost (on RGB only, then reattach alpha)
    rgb = Image.merge("RGB", (r, g, b))
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    r, g, b = rgb.split()

    return Image.merge("RGBA", (r, g, b, a))


def make_preview(original: Image.Image, processed: Image.Image) -> Image.Image:
    """Side-by-side comparison with labels rendered as colored blocks."""
    gap = 4
    w = original.width * 2 + gap
    h = original.height + 12
    canvas = Image.new("RGBA", (w, h), (30, 30, 35, 255))
    canvas.paste(original, (0, 12))
    canvas.paste(processed, (original.width + gap, 12))
    # Simple indicator: 4px colored bar — green=original, magenta=processed
    for x in range(original.width):
        for y in range(4):
            canvas.putpixel((x, y + 4), (80, 200, 80, 255))
    for x in range(processed.width):
        for y in range(4):
            canvas.putpixel((original.width + gap + x, y + 4), (200, 80, 200, 255))
    return canvas


def main():
    parser = argparse.ArgumentParser(
        description="Post-process PixelLab assets for CyberDash cyberpunk aesthetic."
    )
    parser.add_argument("inputs", nargs="+", metavar="INPUT", help="PNG files to process")
    parser.add_argument("-b", "--brightness", type=float, default=None, help="Brightness multiplier (default: 0.45)")
    parser.add_argument("-s", "--blue-shift", type=float, default=None, help="Cool tint intensity (default: 0.08)")
    parser.add_argument("-c", "--contrast", type=float, default=None, help="Contrast factor (default: 1.2)")
    parser.add_argument("-g", "--gamma", type=float, default=None, help="Gamma correction (default: 1.0)")
    parser.add_argument("-a", "--alpha-threshold", type=int, default=None, help="Alpha snap threshold (default: 0 = off)")
    parser.add_argument("-o", "--output-dir", type=str, default=None, help="Output directory (default: in-place)")
    parser.add_argument("--suffix", type=str, default="", help="Append before extension (e.g. _dark)")
    parser.add_argument("--preview", action="store_true", help="Generate side-by-side comparison PNGs")
    parser.add_argument("--preset", type=str, default="cyberdark", choices=PRESETS.keys(), help="Parameter preset (default: cyberdark)")

    args = parser.parse_args()

    # Resolve params: preset first, then CLI overrides
    preset = PRESETS[args.preset]
    brightness = args.brightness if args.brightness is not None else preset["brightness"]
    blue_shift = args.blue_shift if args.blue_shift is not None else preset["blue_shift"]
    contrast = args.contrast if args.contrast is not None else preset["contrast"]
    gamma = args.gamma if args.gamma is not None else preset["gamma"]
    alpha_threshold = args.alpha_threshold if args.alpha_threshold is not None else 0

    r_mult = brightness * (1.0 - blue_shift)
    g_mult = brightness * (1.0 - blue_shift / 2.0)
    b_mult = brightness * (1.0 + blue_shift / 2.0)

    print(f"Preset: {args.preset}")
    print(f"  brightness={brightness}, blue_shift={blue_shift}, contrast={contrast}, gamma={gamma}")
    print(f"  R×{r_mult:.3f}  G×{g_mult:.3f}  B×{b_mult:.3f}")
    if alpha_threshold > 0:
        print(f"  alpha_threshold={alpha_threshold}")
    print()

    output_dir = Path(args.output_dir) if args.output_dir else None
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)

    for input_path_str in args.inputs:
        input_path = Path(input_path_str)
        if not input_path.exists():
            print(f"  SKIP {input_path} (not found)")
            continue

        img = Image.open(input_path).convert("RGBA")
        result = process_image(img, brightness, blue_shift, contrast, gamma, alpha_threshold)

        stem = input_path.stem + args.suffix
        out_name = stem + input_path.suffix
        if output_dir:
            out_path = output_dir / out_name
        else:
            out_path = input_path.parent / out_name

        if args.preview:
            preview = make_preview(img, result)
            preview_path = out_path.parent / f"{stem}_preview.png"
            preview.save(preview_path)
            print(f"  PREVIEW {input_path.name} → {preview_path.name}")
        else:
            result.save(out_path)
            print(f"  {'WROTE' if out_path != input_path else 'OVERWROTE'} {out_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
