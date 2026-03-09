import Phaser from "phaser";

export const DIRECTIONS = [
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
  "east",
  "south-east",
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    for (const dir of DIRECTIONS) {
      this.load.image(`player-${dir}`, `assets/sprites/player/${dir}.png`);
      this.load.spritesheet(`walk-${dir}`, `assets/sprites/player/walk-${dir}.png`, {
        frameWidth: 64,
        frameHeight: 64,
      });
      this.load.spritesheet(`run-${dir}`, `assets/sprites/player/run-${dir}.png`, {
        frameWidth: 64,
        frameHeight: 64,
      });
    }

    // Tiles
    this.load.image("street", "assets/tilemaps/street_0.png");
    this.load.image("sidewalk", "assets/tilemaps/sidewalk_speckled.png");
    for (let d = 0; d < 16; d++) {
      this.load.image(`door-${d}`, `assets/sprites/door_${d}.png`);
    }
    for (let w = 0; w < 14; w++) {
      this.load.image(`window-${w}`, `assets/sprites/window_${w}.png`);
    }
    // Candidate assets for audition
    for (let c = 0; c < 14; c++) {
      this.load.image(`win-candidate-${c}`, `assets/sprites/window_candidate_${c}.png`);
    }
    for (let c = 0; c < 10; c++) {
      this.load.image(`door-candidate-${c}`, `assets/sprites/door_candidate_${c}.png`);
    }
    for (let v = 0; v < 6; v++) {
      this.load.image(`bldg-top-v${v}`, `assets/tilemaps/bldg_top_v${v}.png`);
      for (const s of [2, 3, 4]) {
        this.load.image(`wall-left-v${v}-${s}s`, `assets/tilemaps/wall_left_v${v}_${s}s.png`);
        this.load.image(`wall-right-v${v}-${s}s`, `assets/tilemaps/wall_right_v${v}_${s}s.png`);
      }
    }
  }

  create() {
    for (const dir of DIRECTIONS) {
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers(`walk-${dir}`, { start: 0, end: 5 }),
        frameRate: 10,
        repeat: -1,
      });

      this.anims.create({
        key: `run-${dir}`,
        frames: this.anims.generateFrameNumbers(`run-${dir}`, { start: 0, end: 7 }),
        frameRate: 14,
        repeat: -1,
      });
    }

    this.scene.start("GameScene");
  }
}
