#!/usr/bin/env python3
"""Generate pixel art assets via Replicate's retro-diffusion/rd-plus model.

Usage:
    python3 scripts/replicate_generate.py "window" -o output.png
    python3 scripts/replicate_generate.py "window" --style isometric_asset -o output.png
    python3 scripts/replicate_generate.py "window" --style isometric --width 192 --height 128 -n 4 -o output.png

Requires REPLICATE_API_TOKEN env var.
"""

import argparse
import os
import sys
import json
import urllib.request
import urllib.error
import time
from pathlib import Path

# Load .env from project root
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            if val and key.strip() not in os.environ:
                os.environ[key.strip()] = val.strip()

API_BASE = "https://api.replicate.com/v1"
MODEL = "retro-diffusion/rd-plus"

STYLES = [
    "default", "retro", "watercolor", "textured", "cartoon",
    "ui_element", "item_sheet", "character_turnaround", "environment",
    "isometric", "isometric_asset", "topdown_map", "topdown_asset",
    "classic", "topdown_item", "low_res", "mc_item", "mc_texture", "skill_icon",
]


def api_request(method: str, path: str, data=None) -> dict:
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        print("Error: REPLICATE_API_TOKEN env var not set", file=sys.stderr)
        sys.exit(1)

    url = f"{API_BASE}/{path}"
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
    }

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"API error {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)


def create_prediction(prompt: str, style: str, width: int, height: int,
                      num_images: int, remove_bg: bool, seed=None) -> dict:
    """Start a prediction and return the prediction object."""
    input_data: dict = {
        "prompt": prompt,
        "style": style,
        "width": width,
        "height": height,
        "num_images": num_images,
        "remove_bg": remove_bg,
    }
    if seed is not None:
        input_data["seed"] = seed

    return api_request("POST", "models/retro-diffusion/rd-plus/predictions", {
        "input": input_data,
    })


def wait_for_prediction(prediction_id: str, timeout: int = 300) -> dict:
    """Poll until prediction completes or fails."""
    start = time.time()
    while time.time() - start < timeout:
        result = api_request("GET", f"predictions/{prediction_id}")
        status = result.get("status")

        if status == "succeeded":
            return result
        elif status in ("failed", "canceled"):
            print(f"Prediction {status}: {result.get('error', 'unknown error')}", file=sys.stderr)
            sys.exit(1)

        elapsed = int(time.time() - start)
        print(f"  [{elapsed}s] status: {status}...", file=sys.stderr)
        time.sleep(5)

    print(f"Timeout after {timeout}s", file=sys.stderr)
    sys.exit(1)


def download_image(url: str, output_path: Path):
    """Download an image URL to a file."""
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        output_path.write_bytes(resp.read())


def main():
    parser = argparse.ArgumentParser(description="Generate pixel art via Replicate rd-plus")
    parser.add_argument("prompt", help="Text prompt")
    parser.add_argument("-o", "--output", required=True, help="Output path (for multiple images, adds _0, _1, etc.)")
    parser.add_argument("--style", default="isometric_asset", choices=STYLES, help="Style preset (default: isometric_asset)")
    parser.add_argument("--width", type=int, default=192, help="Width in pixels (default: 192)")
    parser.add_argument("--height", type=int, default=128, help="Height in pixels (default: 128)")
    parser.add_argument("-n", "--num-images", type=int, default=1, help="Number of images (default: 1)")
    parser.add_argument("--remove-bg", action="store_true", help="Remove background for transparency")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    args = parser.parse_args()

    print(f"Prompt: {args.prompt}")
    print(f"Style: {args.style}, Size: {args.width}x{args.height}, N: {args.num_images}")
    print(f"Remove BG: {args.remove_bg}")

    prediction = create_prediction(
        prompt=args.prompt,
        style=args.style,
        width=args.width,
        height=args.height,
        num_images=args.num_images,
        remove_bg=args.remove_bg,
        seed=args.seed,
    )

    pred_id = prediction["id"]
    print(f"Prediction ID: {pred_id}")

    result = wait_for_prediction(pred_id)
    output_urls = result.get("output", [])

    if not output_urls:
        print("No output images returned", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output)
    if len(output_urls) == 1:
        download_image(output_urls[0], output_path)
        print(f"Saved: {output_path}")
    else:
        for i, url in enumerate(output_urls):
            p = output_path.parent / f"{output_path.stem}_{i}{output_path.suffix}"
            download_image(url, p)
            print(f"Saved: {p}")

    print("Done.")


if __name__ == "__main__":
    main()
