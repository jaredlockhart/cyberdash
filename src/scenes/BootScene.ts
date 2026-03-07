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
        frameWidth: 48,
        frameHeight: 48,
      });
    }
  }

  create() {
    // Create walk animations for each direction
    for (const dir of DIRECTIONS) {
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers(`walk-${dir}`, { start: 0, end: 5 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.scene.start("GameScene");
  }
}
