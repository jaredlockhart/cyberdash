# CyberDash - Claude Code Guidelines

## Project Overview
CyberDash is a cyberpunk courier action game. The player is a cybernetically enhanced courier navigating a dystopian future. Isometric 2.5D with pixel art style.

## Tech Stack
- **Engine**: Phaser 3
- **Language**: TypeScript (strict mode)
- **Build**: Vite
- **Package Manager**: npm

## Project Structure
- `src/main.ts` - Entry point
- `src/config/` - Game configuration
- `src/scenes/` - Phaser scenes
- `src/entities/` - Game entities (player, NPCs, etc.)
- `public/assets/sprites/` - Sprite sheets and images
- `public/assets/tilemaps/` - Tilemap data and tilesets
- `public/assets/audio/` - Sound effects and music

## Asset Pipeline
- **SE wall assets (doors, windows)**: Replicate `retro-diffusion/rd-plus` model with `isometric_asset` style
- **Characters/sprites**: PixelLab (AI pixel art generator — directional sprites, animations)
- **Cleanup/Animation**: Aseprite
- **Tilemap Editing**: Tiled (exports JSON for Phaser)
- Sprites go in `public/assets/sprites/` as PNG sprite sheets
- Tilemaps go in `public/assets/tilemaps/` as Tiled JSON + tileset PNGs

## SE Wall Asset Pipeline (doors, windows, etc.)

Generate via Replicate, filter, correct, postprocess:

1. **Generate 10 candidates** via `scripts/replicate_generate.py`:
   ```
   python3 scripts/replicate_generate.py "large glass window flat asset isometric 2:1 pixel art black background" \
     --style isometric_asset --width 384 --height 384 -n 10 --remove-bg -o /tmp/asset.png
   ```
2. **Remove black backgrounds** (Pillow: pixels with R<20, G<20, B<20 → alpha=0), auto-crop to content
3. **Filter by angle** — `scripts/check_iso_angle.py --fix --tolerance 0.09 *.png`
   - Auto-flips SW-facing → SE
   - Keep only assets with slopes within ±0.09 of -0.5 (i.e. -0.41 to -0.59)
   - Typically ~6-7 of 10 pass
4. **Shear-correct to exactly -0.5** — affine vertical shear (shift columns up/down by measured error)
5. **Postprocess** — `scripts/postprocess.py *.png` to darken/blue-shift for cyberpunk aesthetic
6. **Audition in-game** — showroom wall in NW corner displays all candidates numbered for review

Key facts:
- SE wall target slope = **-0.5 dy/dx** (right side higher)
- Use **uniform scaling** `setScale(s, s)` in renderer — non-uniform distorts the angle
- `check_iso_angle.py` auto-detects black vs transparent backgrounds
- Replicate prompt format: `"<object> flat asset isometric 2:1 pixel art black background"`
- Always use `--style isometric_asset --width 384 --height 384`
- Requires `REPLICATE_API_TOKEN` in `.env`

## PixelLab Rules (for characters/sprites only)
- Description = bare minimum object name + isometric qualifiers. NO adjectives.
- Standard qualifiers: `isometric 2:1 perspective, flat on wall, facing southeast, pixel art`
- Use API params (view, detail, shading, outline) for style, NOT the description
- PixelLab **cannot reliably generate iso-angled wall elements** — use Replicate instead

## Conventions
- Use Phaser's scene system for game state management
- Keep game config in `src/config/game.ts`
- One class per file, filename matches class name
- Use `pixelArt: true` and `roundPixels: true` for crisp pixel rendering
- Dev server runs on port 3000
