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
  private fpsEl!: HTMLElement | null;
  private glowOverlays: Phaser.GameObjects.Image[] = [];
  private neonTexts: Phaser.GameObjects.Image[] = [];

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
    this.cameras.main.setZoom(0.5);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(40, 40);

    // HUD is rendered as HTML overlay (see index.html) for native resolution
    this.fpsEl = document.getElementById("hud-fps");

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  update() {
    if (this.fpsEl) this.fpsEl.textContent = `${Math.round(this.game.loop.actualFps)} fps`;

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

    // Single sine pulse for all light sources
    const t = 0.5 + 0.5 * Math.sin(this.time.now * Math.PI / 2000);
    const glow = 0.55 * t;
    for (const ov of this.glowOverlays) ov.setAlpha(glow);
    const neonAlpha = 0.6 + 0.4 * t;
    for (const img of this.neonTexts) img.setAlpha(neonAlpha);
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
          // One seed per building, derived from coordinates
          let seed = (baseCol * 374761393 + rowStart * 668265263) | 0;
          seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
          seed = (seed ^ (seed >>> 16)) >>> 0;

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
            seed,
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
      for (const obj of objects) {
        if ((obj as any).isNeonText) this.neonTexts.push(obj as Phaser.GameObjects.Image);
      }
    }

    // Diagnostic: dump building/window/door metrics to console
    dumpBuildingMetrics(this, this.buildings);

    // Traffic lights at intersection corners
    this.placeTrafficLights();

    // Sewer grates scattered on streets
    this.placeSewerGrates();

    // Steam vents on roads flush against sidewalk
    this.placeSteamVents();

    // Street lamps along sidewalks
    this.placeStreetLamps();

    // Clutter scattered on sidewalks
    this.placeSidewalkClutter();

    // Asset showroom at NW corner
    this.drawShowroom();
  }

  /** Create a texture containing only bright or colorful pixels from the source.
   *  luminance: keep pixels with luminance above this (for grey bright areas like lamp bulbs)
   *  saturation: keep pixels with color saturation above this (for colored lights like traffic signals)
   */
  private createBrightMask(texKey: string, opts: { luminance?: number; saturation?: number }): string | null {
    const suffix = `${opts.luminance ?? 'x'}-${opts.saturation ?? 'x'}`;
    const maskKey = `${texKey}-bright-${suffix}`;
    if (this.textures.exists(maskKey)) return maskKey;

    const source = this.textures.get(texKey).getSourceImage() as HTMLImageElement;
    if (!source || !source.width) return null;

    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const keepLum = opts.luminance !== undefined && lum >= opts.luminance;
      const keepSat = opts.saturation !== undefined && sat >= opts.saturation;
      if (!keepLum && !keepSat) {
        d[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    // Count kept pixels for debugging
    let kept = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) kept++; }
    console.log(`Bright mask "${maskKey}": ${kept} pixels kept (lum=${opts.luminance ?? '-'}, sat=${opts.saturation ?? '-'})`);
    this.textures.addCanvas(maskKey, canvas);
    return maskKey;
  }

  private placeTrafficLights() {
    const TRAFFIC_LIGHT_H = 140; // rendered height in pixels
    const texKey = "traffic-light-2";
    const frame = this.textures.getFrame(texKey);
    if (!frame) return;
    const scale = TRAFFIC_LIGHT_H / frame.height;
    const maskKey = this.createBrightMask(texKey, { saturation: 60 });

    const numBlockCols = Math.floor(this.mapCols / COL_PERIOD);
    const numBlockRows = Math.floor(this.mapRows / ROW_PERIOD);

    // Each intersection is at (bCol * COL_PERIOD, bRow * ROW_PERIOD).
    // Streets occupy cols 0..7 and rows 0..7 within each period.
    // Place traffic lights on the 4 sidewalk corners just outside each intersection.
    for (let bRow = 0; bRow <= numBlockRows; bRow++) {
      for (let bCol = 0; bCol <= numBlockCols; bCol++) {
        const streetColStart = bCol * COL_PERIOD;
        const streetRowStart = bRow * ROW_PERIOD;
        const streetColEnd = streetColStart + STREET_WIDTH - 1;
        const streetRowEnd = streetRowStart + STREET_WIDTH - 1;

        // 4 corners: just outside the street on the sidewalk
        // flip = true for E (NE) and W (SW) corners
        const corners = [
          { col: streetColEnd + 1, row: streetRowEnd + 1, flip: false },   // S (SE)
          { col: streetColStart - 1, row: streetRowEnd + 1, flip: true },  // W (SW)
          { col: streetColEnd + 1, row: streetRowStart - 1, flip: true },  // E (NE)
          { col: streetColStart - 1, row: streetRowStart - 1, flip: false }, // N (NW)
        ];

        for (const c of corners) {
          if (c.col < 0 || c.col >= this.mapCols || c.row < 0 || c.row >= this.mapRows) continue;

          const pos = isoToScreen(c.col, c.row);
          const img = this.add.image(pos.x, pos.y, texKey);
          img.setOrigin(0.5, 1).setScale(scale);
          if (c.flip) img.setFlipX(true);
          img.setDepth(c.col + c.row + 0.5);
          // DEBUG: bright mask overlay in magenta
          if (maskKey) {
            const overlay = this.add.image(pos.x, pos.y, maskKey);
            overlay.setOrigin(0.5, 1).setScale(scale);
            if (c.flip) overlay.setFlipX(true);
            overlay.setDepth(c.col + c.row + 0.51);
            overlay.setBlendMode(Phaser.BlendModes.ADD);
            overlay.setAlpha(0);
            this.glowOverlays.push(overlay);
          }
        }
      }
    }
  }

  private placeSewerGrates() {
    const NUM_GRATES = 10;
    const GRATE_W = 48; // rendered width in pixels
    const numBlockCols = Math.floor(this.mapCols / COL_PERIOD);
    const numBlockRows = Math.floor(this.mapRows / ROW_PERIOD);

    // Place one grate per street segment between intersections
    for (let bRow = 0; bRow < numBlockRows; bRow++) {
      for (let bCol = 0; bCol < numBlockCols; bCol++) {
        // Horizontal street segment (runs along cols, within row street band)
        const hStreetRowStart = bRow * ROW_PERIOD;
        const hStreetColStart = bCol * COL_PERIOD + STREET_WIDTH;
        const hStreetColEnd = (bCol + 1) * COL_PERIOD - 1;

        const h1 = this.hash(bCol, bRow, 200);
        const hCol = hStreetColStart + Math.floor(h1 * (hStreetColEnd - hStreetColStart - 2)) + 1;
        // Avoid center line (rowMod === 4 for horizontal streets)
        const centerLine = Math.floor(STREET_WIDTH / 2); // 4
        const hLanes = [];
        for (let l = 1; l < STREET_WIDTH - 1; l++) {
          if (l !== centerLine) hLanes.push(l);
        }
        const h2 = this.hash(bCol, bRow, 201);
        const hRow = hStreetRowStart + hLanes[Math.floor(h2 * hLanes.length)];
        const hTex = 4; // standardized on s4

        const hPos = isoToScreen(hCol, hRow);
        const frame = this.textures.getFrame(`sewer-grate-${hTex}`);
        if (frame) {
          const scale = GRATE_W / frame.width;
          const img = this.add.image(hPos.x, hPos.y, `sewer-grate-${hTex}`);
          img.setOrigin(0.5, 0.5).setScale(scale).setDepth(0.4);
          // Slight depth above street tiles
        }

        // Vertical street segment (runs along rows, within col street band)
        const vStreetColStart = bCol * COL_PERIOD;
        const vStreetRowStart = bRow * ROW_PERIOD + STREET_WIDTH;
        const vStreetRowEnd = (bRow + 1) * ROW_PERIOD - 1;

        const v1 = this.hash(bCol, bRow, 210);
        const vRow = vStreetRowStart + Math.floor(v1 * (vStreetRowEnd - vStreetRowStart - 2)) + 1;
        // Avoid center line (colMod === 4 for vertical streets)
        const vLanes = [];
        for (let l = 1; l < STREET_WIDTH - 1; l++) {
          if (l !== centerLine) vLanes.push(l);
        }
        const v2 = this.hash(bCol, bRow, 211);
        const vCol = vStreetColStart + vLanes[Math.floor(v2 * vLanes.length)];
        const vTex = 4; // standardized on s4

        const vPos = isoToScreen(vCol, vRow);
        const vFrame = this.textures.getFrame(`sewer-grate-${vTex}`);
        if (vFrame) {
          const vScale = GRATE_W / vFrame.width;
          const vImg = this.add.image(vPos.x, vPos.y, `sewer-grate-${vTex}`);
          vImg.setOrigin(0.5, 0.5).setScale(vScale).setDepth(0.4);
        }
      }
    }
  }

  private placeSidewalkClutter() {
    const types = [
      { prefix: "boxes", count: 10, h: 40 },
    ];
    const CHANCE = 0.15; // ~15% of road-edge sidewalk tiles get clutter

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (this.cityMap[row][col] !== TileType.SIDEWALK) continue;
        // Only on the sidewalk tile closest to the road
        const colMod = col % COL_PERIOD;
        const rowMod = row % ROW_PERIOD;
        const onColEdge = colMod === STREET_WIDTH || colMod === COL_PERIOD - 1;
        const onRowEdge = rowMod === STREET_WIDTH || rowMod === ROW_PERIOD - 1;
        if (!onColEdge && !onRowEdge) continue;
        // Skip corner zones (where both col and row are in the sidewalk band)
        const colInSidewalk = colMod < BLOCK_INTERIOR.colStart || colMod > BLOCK_INTERIOR.colEnd;
        const rowInSidewalk = rowMod < BLOCK_INTERIOR.rowStart || rowMod > BLOCK_INTERIOR.rowEnd;
        if (colInSidewalk && rowInSidewalk) continue;
        const h = this.hash(col, row, 300);
        if (h >= CHANCE) continue;

        const typeIdx = Math.floor(this.hash(col, row, 301) * types.length);
        const type = types[typeIdx];
        const variant = Math.floor(this.hash(col, row, 302) * type.count);
        const texKey = `${type.prefix}-${variant}`;
        const frame = this.textures.getFrame(texKey);
        if (!frame) continue;

        const scale = type.h / frame.height;
        const pos = isoToScreen(col, row);
        // Nudge inward (away from road) so clutter sits fully on sidewalk
        let nx = 0, ny = 0;
        if (colMod === STREET_WIDTH)      { nx += TILE_W / 4; ny += TILE_H / 4; }
        if (colMod === COL_PERIOD - 1)    { nx -= TILE_W / 4; ny -= TILE_H / 4; }
        if (rowMod === STREET_WIDTH)      { nx -= TILE_W / 4; ny += TILE_H / 4; }
        if (rowMod === ROW_PERIOD - 1)    { nx += TILE_W / 4; ny -= TILE_H / 4; }
        const img = this.add.image(pos.x + nx, pos.y + ny, texKey);
        img.setOrigin(0.5, 1).setScale(scale).setDepth(col + row + 0.5);
      }
    }
  }

  private placeSteamVents() {
    const VENT_H = 32;
    const texKey = "steam-vent-0";
    const frame = this.textures.getFrame(texKey);
    if (!frame) return;
    const scale = VENT_H / frame.height;

    const numBlockCols = Math.floor(this.mapCols / COL_PERIOD);
    const numBlockRows = Math.floor(this.mapRows / ROW_PERIOD);

    // One vent per street segment, on the road flush against sidewalk, near the intersection
    for (let bRow = 0; bRow < numBlockRows; bRow++) {
      for (let bCol = 0; bCol < numBlockCols; bCol++) {
        const baseCol = bCol * COL_PERIOD;
        const baseRow = bRow * ROW_PERIOD;

        // Horizontal street: flush against north sidewalk, a bit past intersection
        const hCol = baseCol + STREET_WIDTH + 5;
        const hRow = baseRow + STREET_WIDTH - 1;
        if (hCol < this.mapCols && hRow < this.mapRows) {
          const pos = isoToScreen(hCol, hRow);
          const img = this.add.image(pos.x, pos.y, texKey);
          img.setOrigin(0.5, 1).setScale(scale).setDepth(0.4);
        }

        // Vertical street: flush against west sidewalk, a bit past intersection
        const vCol = baseCol + STREET_WIDTH - 1;
        const vRow = baseRow + STREET_WIDTH + 5;
        if (vCol < this.mapCols && vRow < this.mapRows) {
          const pos = isoToScreen(vCol, vRow);
          const img = this.add.image(pos.x, pos.y, texKey);
          img.setOrigin(0.5, 1).setScale(scale).setDepth(0.4);
        }
      }
    }
  }

  private placeStreetLamps() {
    const LAMP_H = 140;
    const texKey = "street-lamp-1";
    const frame = this.textures.getFrame(texKey);
    if (!frame) return;
    const scale = LAMP_H / frame.height;
    const SPACING = 12;
    const maskKey = this.createBrightMask(texKey, { luminance: 95 });

    const numBlockCols = Math.floor(this.mapCols / COL_PERIOD);
    const numBlockRows = Math.floor(this.mapRows / ROW_PERIOD);

    for (let bRow = 0; bRow < numBlockRows; bRow++) {
      for (let bCol = 0; bCol < numBlockCols; bCol++) {
        const baseCol = bCol * COL_PERIOD;
        const baseRow = bRow * ROW_PERIOD;

        // Sidewalk outer edges (street-facing tiles)
        const westCol = baseCol + STREET_WIDTH;         // colMod 8
        const eastCol = baseCol + COL_PERIOD - 1;       // colMod 35
        const northRow = baseRow + STREET_WIDTH;         // rowMod 8
        const southRow = baseRow + ROW_PERIOD - 1;       // rowMod 55

        const offset = Math.floor(SPACING / 2); // start offset to avoid traffic light corners

        // Helper to place lamp + glow overlay
        const placeLamp = (lx: number, ly: number, col: number, row: number) => {
          const pos = isoToScreen(col, row);
          const img = this.add.image(pos.x, pos.y, texKey);
          img.setOrigin(0.5, 1).setScale(scale).setDepth(col + row + 0.5);
          if (maskKey) {
            const ov = this.add.image(pos.x, pos.y, maskKey);
            ov.setOrigin(0.5, 1).setScale(scale).setDepth(col + row + 0.51);
            ov.setBlendMode(Phaser.BlendModes.ADD);
            ov.setAlpha(0);
            this.glowOverlays.push(ov);
          }
        };

        // West sidewalk: runs along rows
        for (let row = northRow + offset; row <= southRow; row += SPACING) {
          if (row >= this.mapRows) continue;
          placeLamp(westCol, row, westCol, row);
        }

        // East sidewalk: runs along rows
        for (let row = northRow + offset; row <= southRow; row += SPACING) {
          if (row >= this.mapRows || eastCol >= this.mapCols) continue;
          placeLamp(eastCol, row, eastCol, row);
        }

        // North sidewalk: runs along cols
        for (let col = westCol + offset; col <= eastCol; col += SPACING) {
          if (col >= this.mapCols) continue;
          placeLamp(col, northRow, col, northRow);
        }

        // South sidewalk: runs along cols
        for (let col = westCol + offset; col <= eastCol; col += SPACING) {
          if (col >= this.mapCols || southRow >= this.mapRows) continue;
          placeLamp(col, southRow, col, southRow);
        }
      }
    }
  }

  private drawShowroom() {
    const dpr = window.devicePixelRatio || 1;

    // Asset counts
    const sections = [
      { label: "DOORS", prefix: "door", tag: "D", count: 6, targetH: 128 },
      { label: "DOOR CAND.", prefix: "door-candidate", tag: "DC", count: 10, targetH: 128 },
      { label: "WINDOWS", prefix: "window", tag: "W", count: 12, targetH: 96 },
      { label: "BARRED WIN", prefix: "barred-window", tag: "BW", count: 14, targetH: 96 },
      { label: "GLASS WIN", prefix: "glass-window", tag: "GW", count: 6, targetH: 96 },
      { label: "METAL DOOR", prefix: "metal-door", tag: "MD", count: 14, targetH: 128 },
      { label: "GLASS DOOR", prefix: "glass-door", tag: "GD", count: 6, targetH: 128 },
      { label: "BARRED DOOR", prefix: "barred-door", tag: "BD", count: 9, targetH: 128 },
      { label: "GLASS BAR DOOR", prefix: "glass-barred-door", tag: "GB", count: 9, targetH: 128 },
      { label: "TRAFFIC LIGHT", prefix: "traffic-light", tag: "TL", count: 8, targetH: 140 },
      { label: "SEWER GRATE", prefix: "sewer-grate", tag: "SG", count: 10, targetH: 48 },
      { label: "GARBAGE BIN", prefix: "garbage-bin", tag: "BN", count: 6, targetH: 64 },
      { label: "VENDING MACH", prefix: "vending-machine", tag: "VM", count: 9, targetH: 96 },
      { label: "ELEC BOX", prefix: "elec-box", tag: "EB", count: 1, targetH: 96 },
      { label: "WALL VENT", prefix: "wall-vent", tag: "WV", count: 3, targetH: 80 },
      { label: "WALL PIPE", prefix: "wall-pipe", tag: "WP", count: 1, targetH: 80 },
      { label: "GARAGE DOOR", prefix: "garage-door", tag: "GR", count: 9, targetH: 128 },
      { label: "GARBAGE", prefix: "garbage", tag: "GA", count: 10, targetH: 64 },
      { label: "DEBRIS", prefix: "debris", tag: "DE", count: 10, targetH: 64 },
      { label: "BOXES", prefix: "boxes", tag: "BX", count: 10, targetH: 64 },
      { label: "SCRAPS", prefix: "scraps", tag: "SC", count: 10, targetH: 64 },
      { label: "FIRE HYDRANT", prefix: "fire-hydrant", tag: "FH", count: 10, targetH: 96 },
      { label: "STREET LAMP", prefix: "street-lamp", tag: "SL", count: 10, targetH: 140 },
      { label: "STEAM VENT", prefix: "steam-vent", tag: "SV", count: 10, targetH: 64 },
      { label: "DUMPSTER", prefix: "dumpster", tag: "DU", count: 10, targetH: 96 },
    ];
    const TOTAL = sections.reduce((s, sec) => s + sec.count, 0);

    // Big SE-facing wall at NW corner
    const wallCol = 1;
    const rStart = 1;
    const rEnd = 700;
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

      this.add.text(wx, wy - 30 - targetH - 8, label, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "24px",
        color: "#00ffff",
        fontStyle: "bold",
      }).setOrigin(0.5, 1).setResolution(dpr).setDepth(wallDepth + 0.2);
    };

    let slot = 0;

    for (const sec of sections) {
      const startSlot = slot;
      for (let i = 0; i < sec.count; i++) {
        const shortLabel = sec.tag + i;
        placeAsset(slot++, `${sec.prefix}-${i}`, shortLabel, sec.targetH);
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
