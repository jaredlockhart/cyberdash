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
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private facing: Direction = "south";

  // Walk tuning
  private walkSpeed = 160;
  private walkAccel = 1400;
  private walkDrag = 1600;

  // Run tuning (shift held)
  private runSpeed = 300;
  private runAccel = 2400;
  private runDrag = 2000;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    // Isometric grid
    this.drawIsoGrid();

    // Player sprite
    this.player = this.add.sprite(480, 270, "player-south");
    this.player.setScale(2);
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
      .text(480, 52, "Arrow keys to move \u2022 Hold SHIFT to run", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setResolution(dpr);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const running = this.shiftKey.isDown;

    // Apply movement tuning based on walk/run
    const maxSpeed = running ? this.runSpeed : this.walkSpeed;
    const accel = running ? this.runAccel : this.walkAccel;
    const drag = running ? this.runDrag : this.walkDrag;

    body.setMaxSpeed(maxSpeed);
    body.setDrag(drag, drag);

    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;

    if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;

    if (dx !== 0 || dy !== 0) {
      this.facing = this.getDirection(dx, dy);

      // Normalize diagonal acceleration
      const len = Math.sqrt(dx * dx + dy * dy);
      body.setAcceleration(
        (dx / len) * accel,
        (dy / len) * accel
      );

      // Play walk or run animation
      const prefix = running ? "run" : "walk";
      const animKey = `${prefix}-${this.facing}`;
      if (this.player.anims.currentAnim?.key !== animKey || !this.player.anims.isPlaying) {
        this.player.stop();
        this.player.play(animKey);
      }
    } else {
      // Let drag slow us down naturally
      body.setAcceleration(0, 0);

      // Switch to idle once nearly stopped
      if (body.speed < 20) {
        this.player.stop();
        this.player.setTexture(`player-${this.facing}`);
      }
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
