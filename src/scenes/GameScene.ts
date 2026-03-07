import Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private speed = 200;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // Placeholder player (cyan rectangle until we have sprites)
    this.player = this.add.rectangle(400, 300, 24, 32, 0x00ffff);
    this.physics.add.existing(this.player);

    // Isometric grid placeholder
    this.drawIsoGrid();

    // Title text
    this.add
      .text(400, 32, "C Y B E R D A S H", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#00ffff",
      })
      .setOrigin(0.5);

    this.add
      .text(400, 64, "Arrow keys to move", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#666666",
      })
      .setOrigin(0.5);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    // Isometric-style movement: up/down moves along Y, left/right along X
    if (this.cursors.left.isDown) {
      body.setVelocityX(-this.speed);
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(this.speed);
    }

    if (this.cursors.up.isDown) {
      body.setVelocityY(-this.speed);
    } else if (this.cursors.down.isDown) {
      body.setVelocityY(this.speed);
    }
  }

  private drawIsoGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a2e, 0.5);

    const tileWidth = 64;
    const tileHeight = 32;
    const gridSize = 15;
    const offsetX = 400;
    const offsetY = 200;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = (col - row) * (tileWidth / 2) + offsetX;
        const y = (col + row) * (tileHeight / 2) + offsetY;

        graphics.strokePoints(
          [
            new Phaser.Geom.Point(x, y - tileHeight / 2),
            new Phaser.Geom.Point(x + tileWidth / 2, y),
            new Phaser.Geom.Point(x, y + tileHeight / 2),
            new Phaser.Geom.Point(x - tileWidth / 2, y),
            new Phaser.Geom.Point(x, y - tileHeight / 2),
          ],
          true
        );
      }
    }
  }
}
