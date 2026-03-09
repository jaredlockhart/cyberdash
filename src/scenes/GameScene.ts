import Phaser from "phaser";
import { TILE_W, TILE_H, isoToScreen, screenToIso } from "../iso/IsoGeometry";
import { COL_PERIOD, ROW_PERIOD, STREET_WIDTH, SIDEWALK_WIDTH, BLOCK_INTERIOR, TileType, CURB_HEIGHT } from "../iso/CityLayout";
import { Building, BUILDING_PALETTE } from "../rendering/BuildingTypes";
import { renderBuilding, dumpBuildingMetrics } from "../rendering/BuildingRenderer";
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
    objects: Phaser.GameObjects.GameObject[];
  }[] = [];
  private fpsText!: Phaser.GameObjects.Text;

  // Walk tuning
  private walkSpeed = 160;
  private walkAccel = 1400;
  private walkDrag = 1600;

  // Run tuning (shift held)
  private runSpeed = 300;
  private runAccel = 2400;
  private runDrag = 2000;

  // Map settings
  private readonly mapCols = 108;
  private readonly mapRows = 168;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    this.cityMap = this.generateCityMap();
    this.drawCityMap();

    // Building collision bodies — perimeter only (interior unreachable)
    const walls = this.physics.add.staticGroup();
    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (this.cityMap[row][col] === TileType.BUILDING) {
          const colMod = col % COL_PERIOD;
          const rowMod = row % ROW_PERIOD;
          const isEdge =
            colMod === BLOCK_INTERIOR.colStart || colMod === BLOCK_INTERIOR.colEnd ||
            rowMod === BLOCK_INTERIOR.rowStart || rowMod === BLOCK_INTERIOR.rowEnd;
          if (!isEdge) continue;
          const { x, y } = isoToScreen(col, row);
          const zone = this.add.zone(x, y, TILE_W * 0.45, TILE_H * 0.45);
          this.physics.add.existing(zone, true);
          walls.add(zone);
        }
      }
    }

    // Spawn player on a street tile
    const spawnCol = 4;
    const spawnRow = 4;
    const { x: spawnX, y: spawnY } = isoToScreen(spawnCol, spawnRow);

    this.player = this.add.sprite(spawnX, spawnY, "player-south");
    this.player.setScale(1.5);
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

    this.fpsText = this.add.text(8, 8, "", {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "10px",
      color: "#555555",
    }).setResolution(dpr).setScrollFactor(0).setDepth(1000);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  update() {
    this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);

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

    // Hide buildings that obstruct the player
    const { col: pCol, row: pRow } = screenToIso(this.player.x, feetY);
    const margin = 16;

    for (const entry of this.buildingObjects) {
      const b = entry.data;
      const nearestCol = Math.max(b.colStart, Math.min(b.colEnd, pCol));
      const nearestRow = Math.max(b.rowStart, Math.min(b.rowEnd, pRow));
      const behind = pCol + pRow < nearestCol + nearestRow;
      const withinCol = pCol >= b.colStart - margin && pCol <= b.colEnd;
      const withinRow = pRow >= b.rowStart - margin && pRow <= b.rowEnd;
      const hide = behind && withinCol && withinRow;

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
        const inStreetCol = colMod < STREET_WIDTH;
        const inStreetRow = rowMod < STREET_WIDTH;

        if (inStreetCol || inStreetRow) {
          map[row][col] = TileType.STREET;
        } else {
          const colEdge = colMod < BLOCK_INTERIOR.colStart || colMod > BLOCK_INTERIOR.colEnd;
          const rowEdge = rowMod < BLOCK_INTERIOR.rowStart || rowMod > BLOCK_INTERIOR.rowEnd;

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

  /** Simple deterministic hash from two coordinates. */
  private hash(a: number, b: number, salt = 0): number {
    let h = (a * 374761393 + b * 668265263 + salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 0x100000000; // 0..1
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

        const depths = this.splitBlockDepth(BLOCK_INTERIOR.rows, bCol, bRow);

        let rowOffset = 0;
        for (let i = 0; i < depths.length; i++) {
          const depth = depths[i];
          const rowStart = baseRow + rowOffset;
          const rowEnd = Math.min(baseRow + rowOffset + depth - 1, this.mapRows - 1);
          const h = (s: number) => this.hash(baseCol, rowStart, s);

          const stories = 2 + Math.floor(h(1) * 3);
          const color = BUILDING_PALETTE[Math.floor(h(2) * BUILDING_PALETTE.length)];
          const texture = Math.floor(h(3) * 6);
          const inset = 0.1 + h(4) * 0.3;
          const heightOffset = Math.floor(h(5) * 60);
          const doorSide = h(6) < 0.5 ? "left" as const : "right" as const;
          const doorInset = 10 + Math.floor(h(7) * 30);
          const doorTexture = Math.floor(h(8) * 6);
          const windowTexture = Math.floor(h(9) * 12);

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
            windowTexture,
          });

          rowOffset += depth;
        }
      }
    }
  }

  private splitBlockDepth(total: number, bCol: number, bRow: number): number[] {
    const depths: number[] = [];
    let remaining = total;
    let i = 0;

    while (remaining > 0) {
      if (remaining <= 16) {
        if (remaining >= 8) {
          depths.push(remaining);
        } else {
          depths[depths.length - 1] += remaining;
        }
        break;
      }

      const maxDepth = Math.min(16, remaining - 8);
      const minDepth = 8;
      const depth = minDepth + Math.floor(this.hash(bCol * 100 + i, bRow, 99) * (maxDepth - minDepth + 1));
      depths.push(depth);
      remaining -= depth;
      i++;
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

    // Batch ground tile images into blitters (single draw call each)
    const streetBlitter = this.add.blitter(0, 0, "street").setDepth(0);
    const sidewalkBlitter = this.add.blitter(0, 0, "sidewalk").setDepth(0.6);

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        const tile = this.cityMap[row][col];

        if (tile === TileType.BUILDING) {
          // Sidewalk ground under buildings (visible through inset gaps)
          const { x, y } = isoToScreen(col, row);
          sidewalkBlitter.create(x - TILE_W / 2, y - CURB_HEIGHT - TILE_H / 2);

        } else if (tile === TileType.STREET) {
          const { x, y } = isoToScreen(col, row);
          streetBlitter.create(x - TILE_W / 2, y - TILE_H / 2);
          renderStreetTile(this, col, row, streetLines);

        } else if (tile === TileType.SIDEWALK) {
          const { x, y } = isoToScreen(col, row);
          sidewalkBlitter.create(x - TILE_W / 2, y - CURB_HEIGHT - TILE_H / 2);
          renderSidewalkTile(this, col, row, sidewalkGfx, sidewalkLines);
        }
      }
    }

    // Render buildings as 3-shape parallelograms
    for (const building of this.buildings) {
      const objects = renderBuilding(this, building);
      this.buildingObjects.push({ data: building, objects });
    }

    // Diagnostic: dump building/window/door metrics to console
    dumpBuildingMetrics(this, this.buildings);

    // Asset showroom at NW corner
    this.drawShowroom();
  }

  private drawShowroom() {
    const dpr = window.devicePixelRatio || 1;

    // Asset counts
    const sections = [
      { label: "DOORS", prefix: "door", count: 6 },
      { label: "DOOR CAND.", prefix: "door-candidate", count: 10 },
      { label: "WINDOWS", prefix: "window", count: 12 },
      { label: "BARRED WIN", prefix: "barred-window", count: 14 },
      { label: "GLASS WIN", prefix: "glass-window", count: 6 },
      { label: "METAL DOOR", prefix: "metal-door", count: 14 },
      { label: "GLASS DOOR", prefix: "glass-door", count: 6 },
      { label: "BARRED DOOR", prefix: "barred-door", count: 9 },
      { label: "GLASS BAR DOOR", prefix: "glass-barred-door", count: 9 },
    ];
    const TOTAL = sections.reduce((s, sec) => s + sec.count, 0);

    // Big SE-facing wall at NW corner
    const wallCol = 1;
    const rStart = 1;
    const rEnd = 350;
    const wallHeight = 350;

    const E = isoToScreen(wallCol, rStart);
    const S = isoToScreen(wallCol, rEnd);
    const Er = { x: E.x, y: E.y - wallHeight };
    const Sr = { x: S.x, y: S.y - wallHeight };

    const wallDepth = wallCol + rEnd;

    // Wall backdrop
    const gfx = this.add.graphics();
    gfx.setDepth(wallDepth);
    gfx.fillStyle(0x2a2a35, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(E.x, E.y),
      new Phaser.Geom.Point(S.x, S.y),
      new Phaser.Geom.Point(Sr.x, Sr.y),
      new Phaser.Geom.Point(Er.x, Er.y),
    ], true);

    const margin = 0.02;
    const slotWidth = (1 - 2 * margin) / TOTAL;

    // Helper: place an asset on the wall at slot index
    const placeAsset = (slot: number, texKey: string, label: string, targetH: number) => {
      const frame = this.textures.getFrame(texKey);
      if (!frame) return;

      const t = margin + slotWidth * (slot + 0.5);
      const wx = S.x + t * (E.x - S.x);
      const wy = S.y + t * (E.y - S.y);

      const scale = targetH / frame.height;

      const img = this.add.image(wx, wy - 30, texKey);
      img.setOrigin(0.5, 1).setScale(scale);
      img.setDepth(wallDepth + 0.1);

      this.add.text(wx, wy - 10, label, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "14px",
        color: "#00ffff",
        fontStyle: "bold",
      }).setOrigin(0.5).setResolution(dpr).setDepth(wallDepth + 0.2);
    };

    let slot = 0;

    for (const sec of sections) {
      const startSlot = slot;
      for (let i = 0; i < sec.count; i++) {
        const shortLabel = sec.prefix.charAt(0).toUpperCase() + i;
        placeAsset(slot++, `${sec.prefix}-${i}`, shortLabel, 180);
      }

      // Section label along top of wall
      const t = margin + slotWidth * ((startSlot + slot - 1) / 2 + 0.5);
      const lx = S.x + t * (E.x - S.x);
      const ly = S.y + t * (E.y - S.y) - wallHeight + 20;
      this.add.text(lx, ly, sec.label, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "12px",
        color: "#00ffff",
      }).setOrigin(0.5).setResolution(dpr).setDepth(wallDepth + 0.2);
    }
  }
}
