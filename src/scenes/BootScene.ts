import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Future asset loading goes here
    // this.load.image("tileset", "assets/tilemaps/tileset.png");
    // this.load.spritesheet("player", "assets/sprites/player.png", { ... });
  }

  create() {
    this.scene.start("GameScene");
  }
}
