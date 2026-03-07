import Phaser from "phaser";

const PLAYER_DIRECTIONS = [
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
  "east",
  "south-east",
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    for (const dir of PLAYER_DIRECTIONS) {
      this.load.image(`player-${dir}`, `assets/sprites/player/${dir}.png`);
    }
  }

  create() {
    this.scene.start("GameScene");
  }
}
