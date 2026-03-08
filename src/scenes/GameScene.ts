import Phaser from "phaser";
import { TILE_W, TILE_H, isoToScreen, screenToIso } from "../iso/IsoGeometry";
import { COL_PERIOD, ROW_PERIOD, BLOCK_INTERIOR, TileType, CURB_HEIGHT } from "../iso/CityLayout";
import { Building, BUILDING_PALETTE } from "../rendering/BuildingTypes";
import { renderBuilding } from "../rendering/BuildingRenderer";
import { renderStreetTile, renderSidewalkTile } from "../rendering/StreetRenderer";

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
  private cityMap!: number[][];
  private buildings: Building[] = [];
  private buildingObjects: {
    data: Building;
    blockCol: number; blockRow: number;
    objects: Phaser.GameObjects.GameObject[];
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
  private readonly mapCols = 72;
  private readonly mapRows = 88;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    this.cityMap = this.generateCityMap();
    this.drawCityMap();

    // Building collision bodies
    const walls = this.physics.add.staticGroup();
    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (this.cityMap[row][col] === TileType.BUILDING) {
          const { x, y } = isoToScreen(col, row);
          const zone = this.add.zone(x, y, TILE_W * 0.45, TILE_H * 0.45);
          this.physics.add.existing(zone, true);
          walls.add(zone);
        }
      }
    }

    // Spawn player on a street tile
    const spawnCol = 4 + COL_PERIOD;
    const spawnRow = 4 + ROW_PERIOD;
    const { x: spawnX, y: spawnY } = isoToScreen(spawnCol, spawnRow);

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

    // Isometric compass
    const compass = this.add.graphics();
    compass.setScrollFactor(0);
    compass.setDepth(1000);
    const cx = 900, cy = 60, cLen = 20;
    compass.lineStyle(1, 0x555555);
    compass.lineBetween(cx - cLen, cy - cLen / 2, cx + cLen, cy + cLen / 2);
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

    // Depth sort: use sprite bottom (feet)
    const feetY = this.player.y + this.player.displayHeight / 2;
    const playerDepth = feetY / (TILE_H / 2);
    this.player.setDepth(playerDepth);

    // Hide building chunks when player is behind them
    const { col: pCol, row: pRow } = screenToIso(this.player.x, feetY);
    const margin = 16;

    const pColInt = Math.floor(pCol);
    const pRowInt = Math.floor(pRow);
    const inBounds = pColInt >= 0 && pColInt < this.mapCols && pRowInt >= 0 && pRowInt < this.mapRows;
    const onStreet = inBounds && this.cityMap[pRowInt][pColInt] !== TileType.BUILDING;

    const colMod = ((pColInt % COL_PERIOD) + COL_PERIOD) % COL_PERIOD;
    const rowMod = ((pRowInt % ROW_PERIOD) + ROW_PERIOD) % ROW_PERIOD;
    const playerBlockCol = Math.floor(pCol / COL_PERIOD);
    const playerBlockRow = Math.floor(pRow / ROW_PERIOD);
    const seBlockCol = colMod >= 22 ? playerBlockCol + 1 : playerBlockCol;
    const seBlockRow = rowMod >= 38 ? playerBlockRow + 1 : playerBlockRow;

    for (const entry of this.buildingObjects) {
      const b = entry.data;
      const nearestCol = Math.max(b.colStart, Math.min(b.colEnd, pCol));
      const nearestRow = Math.max(b.rowStart, Math.min(b.rowEnd, pRow));
      const behind = pCol + pRow < nearestCol + nearestRow;
      const withinCol = pCol >= b.colStart - margin && pCol <= b.colEnd;
      const withinRow = pRow >= b.rowStart - margin && pRow <= b.rowEnd;
      const hideBehind = behind && withinCol && withinRow;

      const isSEBlock = onStreet && entry.blockCol === seBlockCol && entry.blockRow === seBlockRow;

      const hide = hideBehind || isSEBlock;

      for (const obj of entry.objects) {
        (obj as Phaser.GameObjects.Graphics).setVisible(!hide);
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
          map[row][col] = TileType.STREET;
        } else {
          const colEdge = colMod <= 9 || colMod >= 22;
          const rowEdge = rowMod <= 9 || rowMod >= 38;

          if (colEdge || rowEdge) {
            map[row][col] = TileType.SIDEWALK;
          } else {
            map[row][col] = TileType.BUILDING;
          }
        }
      }
    }

    this.generateBuildings();
    return map;
  }

  private generateBuildings() {
    this.buildings = [];

    const numBlockCols = Math.floor(this.mapCols / COL_PERIOD);
    const numBlockRows = Math.floor(this.mapRows / ROW_PERIOD);

    for (let bRow = 0; bRow < numBlockRows; bRow++) {
      for (let bCol = 0; bCol < numBlockCols; bCol++) {
        const baseCol = bCol * COL_PERIOD + BLOCK_INTERIOR.colStart;
        const colEnd = bCol * COL_PERIOD + BLOCK_INTERIOR.colEnd;
        const baseRow = bRow * ROW_PERIOD + BLOCK_INTERIOR.rowStart;

        const depths = this.splitBlockDepth(BLOCK_INTERIOR.rows);

        let rowOffset = 0;
        for (const depth of depths) {
          const stories = 2 + Math.floor(Math.random() * 3);
          const color = BUILDING_PALETTE[Math.floor(Math.random() * BUILDING_PALETTE.length)];
          const texture = Math.floor(Math.random() * 6);
          const inset = 0.2 + Math.random() * 0.6;
          const heightOffset = Math.floor(Math.random() * 60);
          const doorSide = Math.random() < 0.5 ? "left" as const : "right" as const;
          const doorInset = 10 + Math.floor(Math.random() * 30);
          const doorTexture = Math.floor(Math.random() * 9);
          const rowStart = baseRow + rowOffset;
          const rowEnd = Math.min(baseRow + rowOffset + depth - 1, this.mapRows - 1);

          this.buildings.push({
            colStart: baseCol,
            colEnd,
            rowStart,
            rowEnd,
            stories,
            color,
            texture,
            inset,
            heightOffset,
            doorSide,
            doorInset,
            doorTexture,
          });

          rowOffset += depth;
        }
      }
    }
  }

  private splitBlockDepth(total: number): number[] {
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

      const maxDepth = Math.min(9, remaining - 5);
      const minDepth = 5;
      const depth = minDepth + Math.floor(Math.random() * (maxDepth - minDepth + 1));
      depths.push(depth);
      remaining -= depth;
    }

    return depths;
  }

  private drawCityMap() {
    const sidewalkGfx = this.add.graphics();
    sidewalkGfx.setDepth(0.6);
    const sidewalkLines = this.add.graphics();
    sidewalkLines.setDepth(0.7);
    const streetLines = this.add.graphics();
    streetLines.setDepth(0.5);

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        const tile = this.cityMap[row][col];

        if (tile === TileType.BUILDING) {
          // Sidewalk ground under buildings (visible through inset gaps)
          const { x, y } = isoToScreen(col, row);
          this.add.image(x, y - CURB_HEIGHT, "sidewalk").setDepth(0.6);

        } else if (tile === TileType.STREET) {
          renderStreetTile(this, col, row, streetLines);

        } else if (tile === TileType.SIDEWALK) {
          renderSidewalkTile(this, col, row, sidewalkGfx, sidewalkLines);
        }
      }
    }

    // Render buildings as 3-shape parallelograms
    for (const building of this.buildings) {
      const objects = renderBuilding(this, building);
      const blockCol = Math.floor(building.colStart / COL_PERIOD);
      const blockRow = Math.floor(building.rowStart / ROW_PERIOD);
      this.buildingObjects.push({ data: building, blockCol, blockRow, objects });
    }
  }
}
