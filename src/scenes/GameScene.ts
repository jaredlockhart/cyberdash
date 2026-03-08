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
  [SIDEWALK]: { top: 0x262628, left: 0x202022, right: 0x1a1a1c },
};

const STREET_LINE = 0x3a3a3a;
const STORY_HEIGHT = 128;
const CURB_HEIGHT = 6;
const COL_PERIOD = 24;
const ROW_PERIOD = 40;

// Building data per tile (null for non-building tiles)
interface BuildingTile {
  stories: number;
  color: { top: number; left: number; right: number };
  texture: number; // 0-5, indexes into texture variants
}

// Dark cyberpunk color palette — base hues with consistent lighting
const BUILDING_PALETTE: { top: number; left: number; right: number }[] = [
  { top: 0x2a2a2a, left: 0x202020, right: 0x181818 }, // dark grey
  { top: 0x2e2e2e, left: 0x242424, right: 0x1c1c1c }, // medium dark grey
  { top: 0x232323, left: 0x1a1a1a, right: 0x141414 }, // charcoal
  { top: 0x282830, left: 0x1e1e26, right: 0x18181e }, // blue-grey
  { top: 0x2a2a32, left: 0x202028, right: 0x1a1a20 }, // steel grey
  { top: 0x242832, left: 0x1c1e28, right: 0x161820 }, // slate blue-grey
  { top: 0x2e2828, left: 0x241e1e, right: 0x1c1818 }, // reddish grey
  { top: 0x302a2a, left: 0x262020, right: 0x1e1818 }, // warm grey
  { top: 0x2a2420, left: 0x201c18, right: 0x181410 }, // dark brown
  { top: 0x2c2622, left: 0x221e1a, right: 0x1a1612 }, // warm brown
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
    blockCol: number; blockRow: number;
    tiles: Phaser.GameObjects.GameObject[];
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
    const spawnCol = 4 + COL_PERIOD;
    const spawnRow = 4 + ROW_PERIOD;
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

    // Check if player is on a street/sidewalk (not inside a building)
    const pColInt = Math.floor(pCol);
    const pRowInt = Math.floor(pRow);
    const inBounds = pColInt >= 0 && pColInt < this.mapCols && pRowInt >= 0 && pRowInt < this.mapRows;
    const onStreet = inBounds && this.cityMap[pRowInt][pColInt] !== BUILDING;

    // Determine which block is SE of the player (between player and camera)
    const colMod = ((pColInt % COL_PERIOD) + COL_PERIOD) % COL_PERIOD;
    const rowMod = ((pRowInt % ROW_PERIOD) + ROW_PERIOD) % ROW_PERIOD;
    const playerBlockCol = Math.floor(pCol / COL_PERIOD);
    const playerBlockRow = Math.floor(pRow / ROW_PERIOD);
    // If player is past the building interior (east/south sidewalk), SE block is next period
    const seBlockCol = colMod >= 22 ? playerBlockCol + 1 : playerBlockCol;
    const seBlockRow = rowMod >= 38 ? playerBlockRow + 1 : playerBlockRow;

    for (const chunk of this.buildingChunks) {
      // Existing NW occlusion (player behind building)
      const nearestCol = Math.max(chunk.minCol, Math.min(chunk.maxCol, pCol));
      const nearestRow = Math.max(chunk.minRow, Math.min(chunk.maxRow, pRow));
      const behind = pCol + pRow < nearestCol + nearestRow;
      const withinCol = pCol >= chunk.minCol - margin && pCol <= chunk.maxCol;
      const withinRow = pRow >= chunk.minRow - margin && pRow <= chunk.maxRow;
      const hideBehind = behind && withinCol && withinRow;

      // Hide the entire block SE of the player when on a street/sidewalk
      const isSEBlock = onStreet && chunk.blockCol === seBlockCol && chunk.blockRow === seBlockRow;

      const hide = hideBehind || isSEBlock;

      for (const g of chunk.tiles) {
        (g as Phaser.GameObjects.Image).setVisible(!hide);
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
          const stories = 2 + Math.floor(Math.random() * 3);
          const color = BUILDING_PALETTE[Math.floor(Math.random() * BUILDING_PALETTE.length)];
          const texture = Math.floor(Math.random() * 6);

          // Fill all tiles for this building (full col width, varying row depth)
          for (let r = baseRow + rowOffset; r < baseRow + rowOffset + depth; r++) {
            for (let c = baseCol; c <= bCol * COL_PERIOD + blockInteriorColEnd; c++) {
              if (r < this.mapRows && c < this.mapCols && map[r][c] === BUILDING) {
                this.buildingData[r][c] = { stories, color, texture };
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
    const sidewalkGfx = this.add.graphics();
    sidewalkGfx.setDepth(0.6);
    const sidewalkLines = this.add.graphics();
    sidewalkLines.setDepth(0.7);
    const streetLines = this.add.graphics();
    streetLines.setDepth(0.5);

    // Group building tiles into small chunks for clean rectangular occlusion
    const chunkSize = 6;
    const chunkMap = new Map<string, { minCol: number; maxCol: number; minRow: number; maxRow: number; blockCol: number; blockRow: number; tiles: Phaser.GameObjects.GameObject[] }>();

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        const tile = map[row][col];
        if (tile === BUILDING) {
          const bData = this.buildingData[row][col];
          const tileObjects: Phaser.GameObjects.GameObject[] = [];

          if (bData) {
            const tw = this.tileWidth;
            const th = this.tileHeight;
            const bx = (col - row) * (tw / 2);
            const by = (col + row) * (th / 2);
            const tileDepth = bData.stories * STORY_HEIGHT;
            const depth = col + row;
            const v = bData.texture;

            // Left wall
            const leftImg = this.add.image(bx - tw / 2, by - tileDepth, `wall-left-v${v}-${bData.stories}s`);
            leftImg.setOrigin(0, 0).setDepth(depth).setTint(bData.color.left);
            tileObjects.push(leftImg);

            // Right wall
            const rightImg = this.add.image(bx, by - tileDepth, `wall-right-v${v}-${bData.stories}s`);
            rightImg.setOrigin(0, 0).setDepth(depth).setTint(bData.color.right);
            tileObjects.push(rightImg);

            // Top face
            const topImg = this.add.image(bx, by - tileDepth, `bldg-top-v${v}`);
            topImg.setDepth(depth + 0.1).setTint(bData.color.top);
            tileObjects.push(topImg);
          }

          const relCol = (col % COL_PERIOD) - 10;
          const relRow = (row % ROW_PERIOD) - 10;
          const blockCol = Math.floor(col / COL_PERIOD);
          const blockRow = Math.floor(row / ROW_PERIOD);
          const ck = `${blockCol},${blockRow},${Math.floor(relCol / chunkSize)},${Math.floor(relRow / chunkSize)}`;
          if (!chunkMap.has(ck)) {
            chunkMap.set(ck, { minCol: col, maxCol: col, minRow: row, maxRow: row, blockCol, blockRow, tiles: [] });
          }
          const chunk = chunkMap.get(ck)!;
          chunk.minCol = Math.min(chunk.minCol, col);
          chunk.maxCol = Math.max(chunk.maxCol, col);
          chunk.minRow = Math.min(chunk.minRow, row);
          chunk.maxRow = Math.max(chunk.maxRow, row);
          for (const obj of tileObjects) chunk.tiles.push(obj);
        } else if (tile === STREET) {
          const x = (col - row) * (this.tileWidth / 2);
          const y = (col + row) * (this.tileHeight / 2);
          this.add.image(x, y, "street").setDepth(0);

          const colMod = col % COL_PERIOD;
          const rowMod = row % ROW_PERIOD;
          const inStreetCol = colMod < 8;
          const inStreetRow = rowMod < 8;
          const isIntersection = inStreetCol && inStreetRow;

          if (!isIntersection) {
            const tw = this.tileWidth;
            const th = this.tileHeight;

            // Double yellow center lines on streets
            const isCenter = inStreetCol ? colMod === 4 : rowMod === 4;

            // Skip yellow lines near crosswalks
            const nearCrosswalk = inStreetCol
              ? (rowMod >= 7 && rowMod <= 10) || (rowMod >= 37 && rowMod <= 39)
              : (colMod >= 7 && colMod <= 10) || (colMod >= 21 && colMod <= 23);

            if (isCenter && !nearCrosswalk) {
              // Exactly half tile size — segments connect at tile boundaries with no overlap
              const ext = 16;
              const hext = 8;
              const gap = 2; // perpendicular offset between lines
              const hw = 1; // vertical half-width of each line
              streetLines.fillStyle(0x8b8520, 0.5);
              if (inStreetCol) {
                // Two parallel NW-SE parallelograms offset along NE-SW axis
                for (const s of [-1, 1]) {
                  const ox = gap * s;
                  const oy = gap * s / 2;
                  streetLines.fillPoints([
                    new Phaser.Geom.Point(x + ext + ox, y - hext + oy - hw),
                    new Phaser.Geom.Point(x + ext + ox, y - hext + oy + hw),
                    new Phaser.Geom.Point(x - ext + ox, y + hext + oy + hw),
                    new Phaser.Geom.Point(x - ext + ox, y + hext + oy - hw),
                  ], true);
                }
              } else {
                // Two parallel NE-SW parallelograms offset along NW-SE axis
                for (const s of [-1, 1]) {
                  const ox = -gap * s;
                  const oy = gap * s / 2;
                  streetLines.fillPoints([
                    new Phaser.Geom.Point(x - ext + ox, y - hext + oy - hw),
                    new Phaser.Geom.Point(x - ext + ox, y - hext + oy + hw),
                    new Phaser.Geom.Point(x + ext + ox, y + hext + oy + hw),
                    new Phaser.Geom.Point(x + ext + ox, y + hext + oy - hw),
                  ], true);
                }
              }
            }

            // White stop lines — only on the approaching traffic's side of the center line
            const hw2 = 4;
            // Col-streets: center line at colMod 4
            // rowMod 10 (approaching from SE going NW): right lane = colMod 0-3
            // rowMod 37 (approaching from NW going SE): right lane = colMod 5-7
            if (inStreetCol && rowMod === 10 && colMod >= 5) {
              streetLines.fillStyle(0xffffff, 0.4);
              streetLines.fillPoints([
                new Phaser.Geom.Point(x - tw / 4 - hw2, y - th / 4 + hw2 * 0.5),
                new Phaser.Geom.Point(x - tw / 4 + hw2, y - th / 4 - hw2 * 0.5),
                new Phaser.Geom.Point(x + tw / 4 + hw2, y + th / 4 - hw2 * 0.5),
                new Phaser.Geom.Point(x + tw / 4 - hw2, y + th / 4 + hw2 * 0.5),
              ], true);
            }
            if (inStreetCol && rowMod === 37 && colMod <= 3) {
              streetLines.fillStyle(0xffffff, 0.4);
              streetLines.fillPoints([
                new Phaser.Geom.Point(x - tw / 4 - hw2, y - th / 4 + hw2 * 0.5),
                new Phaser.Geom.Point(x - tw / 4 + hw2, y - th / 4 - hw2 * 0.5),
                new Phaser.Geom.Point(x + tw / 4 + hw2, y + th / 4 - hw2 * 0.5),
                new Phaser.Geom.Point(x + tw / 4 - hw2, y + th / 4 + hw2 * 0.5),
              ], true);
            }
            // Row-streets: center line at rowMod 4
            // colMod 10 (approaching from NE going SW): right lane = rowMod 5-7
            // colMod 21 (approaching from SW going NE): right lane = rowMod 0-3
            if (inStreetRow && colMod === 10 && rowMod <= 3) {
              streetLines.fillStyle(0xffffff, 0.4);
              streetLines.fillPoints([
                new Phaser.Geom.Point(x + tw / 4 - hw2, y - th / 4 - hw2 * 0.5),
                new Phaser.Geom.Point(x + tw / 4 + hw2, y - th / 4 + hw2 * 0.5),
                new Phaser.Geom.Point(x - tw / 4 + hw2, y + th / 4 + hw2 * 0.5),
                new Phaser.Geom.Point(x - tw / 4 - hw2, y + th / 4 - hw2 * 0.5),
              ], true);
            }
            if (inStreetRow && colMod === 21 && rowMod >= 5) {
              streetLines.fillStyle(0xffffff, 0.4);
              streetLines.fillPoints([
                new Phaser.Geom.Point(x + tw / 4 - hw2, y - th / 4 - hw2 * 0.5),
                new Phaser.Geom.Point(x + tw / 4 + hw2, y - th / 4 + hw2 * 0.5),
                new Phaser.Geom.Point(x - tw / 4 + hw2, y + th / 4 + hw2 * 0.5),
                new Phaser.Geom.Point(x - tw / 4 - hw2, y + th / 4 - hw2 * 0.5),
              ], true);
            }

            // Crosswalks: white bars on street tiles adjacent to sidewalks
            // Col-street crosswalks at rowMod 8-9 and 38-39 (next to sidewalks)
            const hw = 3; // bar half-width
            // Col-street crosswalks at rowMod 8-9 and 38-39
            if (inStreetCol && (rowMod === 8 || rowMod === 9 || rowMod === 38 || rowMod === 39)) {
              streetLines.fillStyle(0xffffff, 0.35);
              streetLines.fillPoints([
                new Phaser.Geom.Point(x + tw / 4 - hw, y - th / 4 - hw * 0.5),
                new Phaser.Geom.Point(x + tw / 4 + hw, y - th / 4 + hw * 0.5),
                new Phaser.Geom.Point(x - tw / 4 + hw, y + th / 4 + hw * 0.5),
                new Phaser.Geom.Point(x - tw / 4 - hw, y + th / 4 - hw * 0.5),
              ], true);
            }
            // Row-street crosswalks at colMod 8-9 and 22-23
            if (inStreetRow && (colMod === 8 || colMod === 9 || colMod === 22 || colMod === 23)) {
              streetLines.fillStyle(0xffffff, 0.35);
              streetLines.fillPoints([
                new Phaser.Geom.Point(x - tw / 4 + hw, y - th / 4 - hw * 0.5),
                new Phaser.Geom.Point(x - tw / 4 - hw, y - th / 4 + hw * 0.5),
                new Phaser.Geom.Point(x + tw / 4 - hw, y + th / 4 + hw * 0.5),
                new Phaser.Geom.Point(x + tw / 4 + hw, y + th / 4 - hw * 0.5),
              ], true);
            }
          }
        } else if (tile === SIDEWALK) {
          const tw = this.tileWidth;
          const th = this.tileHeight;
          const sx = (col - row) * (tw / 2);
          const sy = (col + row) * (th / 2);

          // Textured top face (raised by curb height)
          this.add.image(sx, sy - CURB_HEIGHT, "sidewalk").setDepth(0.6);

          // Curb walls (left and right faces)
          const colors = TILE_COLORS[SIDEWALK];
          sidewalkGfx.fillStyle(colors.left, 1);
          sidewalkGfx.fillPoints([
            new Phaser.Geom.Point(sx - tw / 2, sy - CURB_HEIGHT),
            new Phaser.Geom.Point(sx, sy + th / 2 - CURB_HEIGHT),
            new Phaser.Geom.Point(sx, sy + th / 2),
            new Phaser.Geom.Point(sx - tw / 2, sy),
          ], true);
          sidewalkGfx.fillStyle(colors.right, 1);
          sidewalkGfx.fillPoints([
            new Phaser.Geom.Point(sx + tw / 2, sy - CURB_HEIGHT),
            new Phaser.Geom.Point(sx, sy + th / 2 - CURB_HEIGHT),
            new Phaser.Geom.Point(sx, sy + th / 2),
            new Phaser.Geom.Point(sx + tw / 2, sy),
          ], true);
          sidewalkLines.lineStyle(1, 0x2e2e3e, 0.5);
          if (col % 2 === 0) {
            // NW edge (col boundary, runs NW-SE)
            sidewalkLines.lineBetween(sx, sy - th / 2 - CURB_HEIGHT, sx - tw / 2, sy - CURB_HEIGHT);
          }
          if (row % 2 === 0) {
            // NE edge (row boundary, runs NE-SW)
            sidewalkLines.lineBetween(sx, sy - th / 2 - CURB_HEIGHT, sx + tw / 2, sy - CURB_HEIGHT);
          }
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
    const tileDepth = bData ? bData.stories * STORY_HEIGHT : (tile === SIDEWALK ? CURB_HEIGHT : 0);

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
