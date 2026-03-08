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
  [STREET]: { top: 0x2a2a2a, left: 0x222222, right: 0x1a1a1a },
  [SIDEWALK]: { top: 0x3a3a4a, left: 0x30303e, right: 0x282835 },
};

const STREET_LINE = 0x3a3a3a;
const STORY_HEIGHT = 128;
const COL_PERIOD = 24;
const ROW_PERIOD = 40;

// Building data per tile (null for non-building tiles)
interface BuildingTile {
  stories: number;
  color: { top: number; left: number; right: number };
}

// Dark cyberpunk color palette — base hues with consistent lighting
const BUILDING_PALETTE: { top: number; left: number; right: number }[] = [
  { top: 0x1a1a2e, left: 0x121225, right: 0x0f0f1e }, // dark indigo (original)
  { top: 0x1e1a2e, left: 0x161225, right: 0x120f1e }, // dark purple
  { top: 0x2e1a1a, left: 0x251212, right: 0x1e0f0f }, // dark crimson
  { top: 0x1a2e2e, left: 0x122525, right: 0x0f1e1e }, // dark teal
  { top: 0x2e2e1a, left: 0x252512, right: 0x1e1e0f }, // dark olive
  { top: 0x1a1e2e, left: 0x121625, right: 0x0f121e }, // dark navy
  { top: 0x2e1a2e, left: 0x251225, right: 0x1e0f1e }, // dark magenta
  { top: 0x1a2e1e, left: 0x122516, right: 0x0f1e12 }, // dark forest
  { top: 0x222233, left: 0x1a1a28, right: 0x141420 }, // steel blue
  { top: 0x2a1a28, left: 0x22121f, right: 0x1b0f19 }, // dark plum
];

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private facing: Direction = "south";
  private cityMap!: number[][];
  private buildingData!: (BuildingTile | null)[][];
  private buildingChunks: {
    minCol: number; maxCol: number; minRow: number; maxRow: number;
    tiles: Phaser.GameObjects.Graphics[];
  }[] = [];

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
  private readonly mapRows = 88;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    this.cityMap = this.generateCityMap();
    this.drawCityMap(this.cityMap);

    // Building collision bodies
    const walls = this.physics.add.staticGroup();
    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (this.cityMap[row][col] === BUILDING) {
          const x = (col - row) * (this.tileWidth / 2);
          const y = (col + row) * (this.tileHeight / 2);
          const zone = this.add.zone(x, y, this.tileWidth * 0.45, this.tileHeight * 0.45);
          this.physics.add.existing(zone, true);
          walls.add(zone);
        }
      }
    }

    // Spawn player on a street tile
    const spawnCol = 7;
    const spawnRow = 7;
    const spawnX = (spawnCol - spawnRow) * (this.tileWidth / 2);
    const spawnY = (spawnCol + spawnRow) * (this.tileHeight / 2);

    this.player = this.add.sprite(spawnX, spawnY, "player-south");
    this.player.setScale(2);
    this.physics.add.existing(this.player);

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(16, 8);
    playerBody.setOffset(16, 36);

    this.physics.add.collider(this.player, walls);

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(40, 40);

    // HUD
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
      .setScrollFactor(0)
      .setDepth(1000);

    this.add
      .text(480, 52, "Arrow keys to move \u2022 Hold SHIFT to run", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setResolution(dpr)
      .setScrollFactor(0)
      .setDepth(1000);

    // Isometric compass (NW/NE/SW/SE aligned to iso axes)
    const compass = this.add.graphics();
    compass.setScrollFactor(0);
    compass.setDepth(1000);
    const cx = 900, cy = 60, cLen = 20;
    // NW-SE axis (vertical-ish on screen: up-left to down-right)
    compass.lineStyle(1, 0x555555);
    compass.lineBetween(cx - cLen, cy - cLen / 2, cx + cLen, cy + cLen / 2);
    // NE-SW axis
    compass.lineBetween(cx + cLen, cy - cLen / 2, cx - cLen, cy + cLen / 2);

    const compassLabel = (text: string, ox: number, oy: number) => {
      this.add.text(cx + ox, cy + oy, text, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "8px",
        color: "#888888",
      }).setOrigin(0.5).setResolution(dpr).setScrollFactor(0).setDepth(1000);
    };
    compassLabel("NW", -cLen - 8, -cLen / 2 - 6);
    compassLabel("SE", cLen + 8, cLen / 2 + 6);
    compassLabel("NE", cLen + 8, -cLen / 2 - 6);
    compassLabel("SW", -cLen - 8, cLen / 2 + 6);
    compassLabel("N", 0, -cLen / 2 - 10);

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

    // Depth sort: use sprite bottom (feet) so player stays in front of building walls
    // until their feet actually cross behind the building edge
    const feetY = this.player.y + this.player.displayHeight / 2;
    const playerDepth = feetY / (this.tileHeight / 2);
    this.player.setDepth(playerDepth);

    // Hide building chunks when player is behind them (use feet position for iso coords)
    const pCol = (this.player.x / (this.tileWidth / 2) + feetY / (this.tileHeight / 2)) / 2;
    const pRow = (feetY / (this.tileHeight / 2) - this.player.x / (this.tileWidth / 2)) / 2;
    const margin = 16;

    for (const chunk of this.buildingChunks) {
      const nearestCol = Math.max(chunk.minCol, Math.min(chunk.maxCol, pCol));
      const nearestRow = Math.max(chunk.minRow, Math.min(chunk.maxRow, pRow));
      const behind = pCol + pRow < nearestCol + nearestRow;
      const withinCol = pCol >= chunk.minCol - margin && pCol <= chunk.maxCol;
      const withinRow = pRow >= chunk.minRow - margin && pRow <= chunk.maxRow;
      const hide = behind && withinCol && withinRow;

      for (const g of chunk.tiles) {
        g.setVisible(!hide);
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
        const colMod = col % COL_PERIOD;
        const rowMod = row % ROW_PERIOD;
        const inStreetCol = colMod < 8;
        const inStreetRow = rowMod < 8;

        if (inStreetCol || inStreetRow) {
          map[row][col] = STREET;
        } else {
          const colEdge = colMod <= 9 || colMod >= 22;
          const rowEdge = rowMod <= 9 || rowMod >= 38;

          if (colEdge || rowEdge) {
            map[row][col] = SIDEWALK;
          } else {
            map[row][col] = BUILDING;
          }
        }
      }
    }

    this.generateBuildings(map);
    return map;
  }

  private generateBuildings(map: number[][]) {
    // Initialize buildingData with nulls
    this.buildingData = [];
    for (let row = 0; row < this.mapRows; row++) {
      this.buildingData[row] = new Array(this.mapCols).fill(null);
    }

    // Buildings span the full 12-col width and vary in depth along the 28-row axis.
    // SE side is the storefront; buildings pack NW from there.
    const blockInteriorRowStart = 10;
    const blockInteriorRows = 28; // rowMod 10-37
    const blockInteriorColStart = 10;
    const blockInteriorColEnd = 21;

    const numBlockCols = Math.floor(this.mapCols / COL_PERIOD);
    const numBlockRows = Math.floor(this.mapRows / ROW_PERIOD);

    for (let bRow = 0; bRow < numBlockRows; bRow++) {
      for (let bCol = 0; bCol < numBlockCols; bCol++) {
        const baseCol = bCol * COL_PERIOD + blockInteriorColStart;
        const baseRow = bRow * ROW_PERIOD + blockInteriorRowStart;

        // Split 28 rows into buildings with depths 5-9
        const depths = this.splitBlockDepth(blockInteriorRows);

        let rowOffset = 0;
        for (const depth of depths) {
          const stories = 1 + Math.floor(Math.random() * 3); // 1-3
          const color = BUILDING_PALETTE[Math.floor(Math.random() * BUILDING_PALETTE.length)];

          // Fill all tiles for this building (full col width, varying row depth)
          for (let r = baseRow + rowOffset; r < baseRow + rowOffset + depth; r++) {
            for (let c = baseCol; c <= bCol * COL_PERIOD + blockInteriorColEnd; c++) {
              if (r < this.mapRows && c < this.mapCols && map[r][c] === BUILDING) {
                this.buildingData[r][c] = { stories, color };
              }
            }
          }

          rowOffset += depth;
        }
      }
    }
  }

  private splitBlockDepth(total: number): number[] {
    // Randomly split `total` into segments of 5-9
    const depths: number[] = [];
    let remaining = total;

    while (remaining > 0) {
      if (remaining <= 9) {
        if (remaining >= 5) {
          depths.push(remaining);
        } else {
          depths[depths.length - 1] += remaining;
        }
        break;
      }

      const maxDepth = Math.min(9, remaining - 5); // leave at least 5 for next
      const minDepth = 5;
      const depth = minDepth + Math.floor(Math.random() * (maxDepth - minDepth + 1));
      depths.push(depth);
      remaining -= depth;
    }

    return depths;
  }

  private drawCityMap(map: number[][]) {
    const ground = this.add.graphics();
    ground.setDepth(0);

    // Group building tiles into small chunks for clean rectangular occlusion
    const chunkSize = 6;
    const chunkMap = new Map<string, { minCol: number; maxCol: number; minRow: number; maxRow: number; tiles: Phaser.GameObjects.Graphics[] }>();

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        const tile = map[row][col];
        if (tile === BUILDING) {
          const g = this.add.graphics();
          g.setDepth(col + row);
          this.drawTile(g, col, row, BUILDING);

          const relCol = (col % COL_PERIOD) - 10;
          const relRow = (row % ROW_PERIOD) - 10;
          const blockCol = Math.floor(col / COL_PERIOD);
          const blockRow = Math.floor(row / ROW_PERIOD);
          const ck = `${blockCol},${blockRow},${Math.floor(relCol / chunkSize)},${Math.floor(relRow / chunkSize)}`;
          if (!chunkMap.has(ck)) {
            chunkMap.set(ck, { minCol: col, maxCol: col, minRow: row, maxRow: row, tiles: [] });
          }
          const chunk = chunkMap.get(ck)!;
          chunk.minCol = Math.min(chunk.minCol, col);
          chunk.maxCol = Math.max(chunk.maxCol, col);
          chunk.minRow = Math.min(chunk.minRow, row);
          chunk.maxRow = Math.max(chunk.maxRow, row);
          chunk.tiles.push(g);
        } else if (tile === STREET) {
          const x = (col - row) * (this.tileWidth / 2);
          const y = (col + row) * (this.tileHeight / 2);
          this.add.image(x, y, "street").setDepth(0);
        } else {
          this.drawTile(ground, col, row, tile);
        }
      }
    }

    this.buildingChunks = Array.from(chunkMap.values());
  }

  private drawTile(graphics: Phaser.GameObjects.Graphics, col: number, row: number, tile: number) {
    const tw = this.tileWidth;
    const th = this.tileHeight;
    const x = (col - row) * (tw / 2);
    const y = (col + row) * (th / 2);

    const bData = tile === BUILDING ? this.buildingData[row][col] : null;
    const colors = bData ? bData.color : TILE_COLORS[tile];
    const tileDepth = bData ? bData.stories * STORY_HEIGHT : 0;

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

    if (tile === STREET) {
      const inStreetCol = (col % COL_PERIOD) < 8;
      const inStreetRow = (row % ROW_PERIOD) < 8;
      const isCenter = inStreetCol
        ? (col % COL_PERIOD === 3 || col % COL_PERIOD === 4)
        : (row % ROW_PERIOD === 3 || row % ROW_PERIOD === 4);

      if (isCenter && !inStreetCol !== !inStreetRow) {
        graphics.lineStyle(1, STREET_LINE, 0.6);
        graphics.lineBetween(x - tw / 4, y, x + tw / 4, y);
      }
    }
  }
}
