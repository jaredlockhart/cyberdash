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
    this.player = this.add.sprite(480, 270, "player-south");
    this.player.setScale(2); // Scale up 48px sprite for visibility
    this.physics.add.existing(this.player);

    // Title text (high resolution so it stays crisp when canvas scales)
    const dpr = window.devicePixelRatio || 1;

    this.add
      .text(480, 24, "CYBERDASH", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "20px",
        color: "#00ffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setResolution(dpr);

    this.add
      .text(480, 52, "Arrow keys to move", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setResolution(dpr);

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

      // Play walk animation
      const animKey = `walk-${this.facing}`;
      if (this.player.anims.currentAnim?.key !== animKey) {
        this.player.play(animKey);
      }

      // Normalize diagonal speed
      const len = Math.sqrt(dx * dx + dy * dy);
      body.setVelocity((dx / len) * this.speed, (dy / len) * this.speed);
    } else {
      // Stop animation and show idle frame
      this.player.stop();
      this.player.setTexture(`player-${this.facing}`);
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
    const offsetX = 480;
    const offsetY = 170;

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
