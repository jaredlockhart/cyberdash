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
- **Generation**: PixelLab (AI pixel art generator — isometric tiles, directional sprites)
- **Cleanup/Animation**: Aseprite
- **Tilemap Editing**: Tiled (exports JSON for Phaser)
- Sprites go in `public/assets/sprites/` as PNG sprite sheets
- Tilemaps go in `public/assets/tilemaps/` as Tiled JSON + tileset PNGs

## Conventions
- Use Phaser's scene system for game state management
- Keep game config in `src/config/game.ts`
- One class per file, filename matches class name
- Use `pixelArt: true` and `roundPixels: true` for crisp pixel rendering
- Dev server runs on port 3000
