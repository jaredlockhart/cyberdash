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

// Tile types
const BUILDING = 0;
const STREET = 1;
const SIDEWALK = 2;

// Isometric tile colors: top face, left face, right face
const TILE_COLORS: Record<number, { top: number; left: number; right: number }> = {
  [BUILDING]: { top: 0x1a1a2e, left: 0x121225, right: 0x0f0f1e },
  [STREET]: { top: 0x2a2a2a, left: 0x222222, right: 0x1a1a1a },
  [SIDEWALK]: { top: 0x3a3a4a, left: 0x30303e, right: 0x282835 },
};

// Street line color
const STREET_LINE = 0x3a3a3a;

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

  // Map settings
  private readonly tileWidth = 64;
  private readonly tileHeight = 32;
  private readonly mapCols = 72;
  private readonly mapRows = 72;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    const cityMap = this.generateCityMap();
    this.drawCityMap(cityMap);

    // Spawn player on a street tile near center
    const spawnCol = 7;
    const spawnRow = 7;
    const spawnX = (spawnCol - spawnRow) * (this.tileWidth / 2);
    const spawnY = (spawnCol + spawnRow) * (this.tileHeight / 2);

    this.player = this.add.sprite(spawnX, spawnY, "player-south");
    this.player.setScale(2);
    this.player.setDepth(10);
    this.physics.add.existing(this.player);

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(40, 40);

    // HUD text (fixed to camera)
    const dpr = window.devicePixelRatio || 1;

    this.add
      .text(480, 24, "CYBERDASH", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "20px",
        color: "#00ffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setResolution(dpr)
      .setScrollFactor(0);

    this.add
      .text(480, 52, "Arrow keys to move \u2022 Hold SHIFT to run", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setResolution(dpr)
      .setScrollFactor(0);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const running = this.shiftKey.isDown;

    const maxSpeed = running ? this.runSpeed : this.walkSpeed;
    const accel = running ? this.runAccel : this.walkAccel;
    const drag = running ? this.runDrag : this.walkDrag;

    body.setMaxSpeed(maxSpeed);
    body.setDrag(drag, drag);

    let inputX = 0;
    let inputY = 0;

    if (this.cursors.left.isDown) inputX = -1;
    else if (this.cursors.right.isDown) inputX = 1;

    if (this.cursors.up.isDown) inputY = -1;
    else if (this.cursors.down.isDown) inputY = 1;

    if (inputX !== 0 || inputY !== 0) {
      this.facing = this.getDirection(inputX, inputY);

      // For diagonals, use iso-aligned 2:1 slope instead of 45°
      let moveX = inputX;
      let moveY = inputY;
      if (inputX !== 0 && inputY !== 0) {
        moveY = inputY * 0.5;
      }

      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      body.setAcceleration(
        (moveX / len) * accel,
        (moveY / len) * accel
      );

      const prefix = running ? "run" : "walk";
      const animKey = `${prefix}-${this.facing}`;
      if (this.player.anims.currentAnim?.key !== animKey || !this.player.anims.isPlaying) {
        this.player.stop();
        this.player.play(animKey);
      }
    } else {
      body.setAcceleration(0, 0);

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

  private generateCityMap(): number[][] {
    const map: number[][] = [];

    for (let row = 0; row < this.mapRows; row++) {
      map[row] = [];
      for (let col = 0; col < this.mapCols; col++) {
        // Street pattern: 4-wide streets every 10 tiles
        const inStreetCol = (col % 24) < 8;
        const inStreetRow = (row % 24) < 8;

        if (inStreetCol || inStreetRow) {
          // Sidewalk borders the street (1 tile around streets)
          const nextToBuilding =
            (!inStreetCol && this.isBuildingAt(col, row - 1)) ||
            (!inStreetCol && this.isBuildingAt(col, row + 1)) ||
            (!inStreetRow && this.isBuildingAt(col - 1, row)) ||
            (!inStreetRow && this.isBuildingAt(col + 1, row));

          if (inStreetCol && inStreetRow) {
            // Intersection - always street
            map[row][col] = STREET;
          } else if (nextToBuilding) {
            map[row][col] = SIDEWALK;
          } else {
            map[row][col] = STREET;
          }
        } else {
          map[row][col] = BUILDING;
        }
      }
    }

    return map;
  }

  private isBuildingAt(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.mapCols || row >= this.mapRows) return false;
    const inStreetCol = (col % 24) < 8;
    const inStreetRow = (row % 24) < 8;
    return !inStreetCol && !inStreetRow;
  }

  private drawCityMap(map: number[][]) {
    const graphics = this.add.graphics();
    const tw = this.tileWidth;
    const th = this.tileHeight;

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        const tile = map[row][col];
        const colors = TILE_COLORS[tile];

        // Isometric position
        const x = (col - row) * (tw / 2);
        const y = (col + row) * (th / 2);

        const tileDepth = tile === BUILDING ? 8 : 0;

        // Top face (diamond)
        graphics.fillStyle(colors.top, 1);
        graphics.fillPoints(
          [
            new Phaser.Geom.Point(x, y - th / 2 - tileDepth),
            new Phaser.Geom.Point(x + tw / 2, y - tileDepth),
            new Phaser.Geom.Point(x, y + th / 2 - tileDepth),
            new Phaser.Geom.Point(x - tw / 2, y - tileDepth),
          ],
          true
        );

        if (tileDepth > 0) {
          // Left face
          graphics.fillStyle(colors.left, 1);
          graphics.fillPoints(
            [
              new Phaser.Geom.Point(x - tw / 2, y - tileDepth),
              new Phaser.Geom.Point(x, y + th / 2 - tileDepth),
              new Phaser.Geom.Point(x, y + th / 2),
              new Phaser.Geom.Point(x - tw / 2, y),
            ],
            true
          );

          // Right face
          graphics.fillStyle(colors.right, 1);
          graphics.fillPoints(
            [
              new Phaser.Geom.Point(x + tw / 2, y - tileDepth),
              new Phaser.Geom.Point(x, y + th / 2 - tileDepth),
              new Phaser.Geom.Point(x, y + th / 2),
              new Phaser.Geom.Point(x + tw / 2, y),
            ],
            true
          );
        }

        // Street center dashes
        if (tile === STREET) {
          const inStreetCol = (col % 24) < 8;
          const inStreetRow = (row % 24) < 8;
          const isCenter = inStreetCol ? (col % 24 === 3 || col % 24 === 4) : (row % 24 === 3 || row % 24 === 4);

          if (isCenter && !inStreetCol !== !inStreetRow) {
            graphics.lineStyle(1, STREET_LINE, 0.6);
            graphics.lineBetween(
              x - tw / 4, y - tileDepth,
              x + tw / 4, y - tileDepth
            );
          }
        }

        // Subtle edge on buildings
        if (tile === BUILDING) {
          graphics.lineStyle(1, 0x252540, 0.3);
          graphics.strokePoints(
            [
              new Phaser.Geom.Point(x, y - th / 2 - tileDepth),
              new Phaser.Geom.Point(x + tw / 2, y - tileDepth),
              new Phaser.Geom.Point(x, y + th / 2 - tileDepth),
              new Phaser.Geom.Point(x - tw / 2, y - tileDepth),
              new Phaser.Geom.Point(x, y - th / 2 - tileDepth),
            ],
            true
          );
        }
      }
    }
  }
}
