import Phaser from "phaser";

type Direction =
  | "south"
  | "south-west"
  | "west"
  | "north-west"
  | "north"
  | "north-east"
  | "east"
  | "south-east";

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private facing: Direction = "south";
  private speed = 200;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // Isometric grid
    this.drawIsoGrid();

    // Player sprite
    this.player = this.add.sprite(400, 300, "player-south");
    this.player.setScale(2); // Scale up 48px sprite for visibility
    this.physics.add.existing(this.player);

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

    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;

    if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;

    if (dx !== 0 || dy !== 0) {
      this.facing = this.getDirection(dx, dy);
      this.player.setTexture(`player-${this.facing}`);

      // Normalize diagonal speed
      const len = Math.sqrt(dx * dx + dy * dy);
      body.setVelocity((dx / len) * this.speed, (dy / len) * this.speed);
    }
  }

  private getDirection(dx: number, dy: number): Direction {
    if (dx === 0 && dy === -1) return "north";
    if (dx === 1 && dy === -1) return "north-east";
    if (dx === 1 && dy === 0) return "east";
    if (dx === 1 && dy === 1) return "south-east";
    if (dx === 0 && dy === 1) return "south";
    if (dx === -1 && dy === 1) return "south-west";
    if (dx === -1 && dy === 0) return "west";
    if (dx === -1 && dy === -1) return "north-west";
    return this.facing;
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
