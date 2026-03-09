import Phaser from "phaser";
import { TILE_W, TILE_H } from "../iso/IsoGeometry";
import { STORY_HEIGHT } from "../iso/CityLayout";
import { Building, buildingHash } from "./BuildingTypes";

/**
 * Depth sub-layers within a building's col+row band.
 * Base depth = col + row for each wall tile.
 * These offsets ensure consistent front-to-back ordering.
 */
const DEPTH_ROOF = -0.5;          // behind everything
const DEPTH_WALL_FILL = -0.1;     // flat fill behind textures
const DEPTH_WALL_TEX = 0;         // wall texture images (base)
const DEPTH_FEATURE = 0.3;        // doors, windows (on wall surface)
const DEPTH_STREET_OBJ = 0.6;     // vending machines, garbage bins (in front of wall)
const DEPTH_BILLBOARD = 1.0;      // billboards (extend outward from wall)
const DEPTH_BILLBOARD_TEXT = 1.01; // text on billboard face
import { buildingCorners, tileInsetPosition, computeBuildingMetrics, SLOT_WIDTH, SLOT_GAP, WALL_MARGIN, WIN_TARGET_H, WIN_BOTTOM } from "./BuildingMetrics";
export type { BuildingMetrics } from "./BuildingMetrics";
export { computeBuildingMetrics } from "./BuildingMetrics";

/**
 * Browser-side wrapper: reads texture sizes from Phaser and logs to console.
 */
export function dumpBuildingMetrics(
  scene: Phaser.Scene,
  buildings: Building[],
) {
  const metrics = computeBuildingMetrics(buildings, (key) => {
    const src = scene.textures.get(key)?.getSourceImage();
    return { w: src?.width ?? 0, h: src?.height ?? 0 };
  });

  console.table(metrics.map(m => ({
    "#": m.index,
    rows: m.rowSpan,
    stories: m.stories,
    seWall: m.seWallLen,
    door: `${m.doorTexW}x${m.doorTexH} d${m.doorTexture}`,
    doorSide: m.doorSide,
    zone: m.windowZone,
    nWin: m.winCount,
    winTex: `${m.winTexW}x${m.winTexH} w${m.windowTexture}`,
    winScale: m.winScale,
    winRendered: `${m.winRenderedW}x${m.winRenderedH}`,
    "win/door": m.winDoorRatio,
  })));

  const ratios = metrics.filter(m => m.winScale > 0).map(m => m.winDoorRatio);
  if (ratios.length > 0) {
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    console.log(`Window/door height ratio — min: ${min}, max: ${max}, avg: ${avg.toFixed(2)}, n=${ratios.length}`);
  }

  return metrics;
}

/**
 * Render a building as 3 filled parallelograms (base layer) with
 * texture images tiled on top. Returns all GameObjects for occlusion.
 */
export function renderBuilding(
  scene: Phaser.Scene,
  building: Building,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const { N, E, S, W } = buildingCorners(building);
  const wallHeight = building.stories * STORY_HEIGHT + building.heightOffset;
  const depth = building.colEnd + building.rowEnd;
  const v = building.texture;

  // Roof corners (ground corners shifted up by wallHeight)
  const Nr = { x: N.x, y: N.y - wallHeight };
  const Er = { x: E.x, y: E.y - wallHeight };
  const Sr = { x: S.x, y: S.y - wallHeight };
  const Wr = { x: W.x, y: W.y - wallHeight };

  // --- Roof flat fill (covers gaps between tiled diamond images) ---

  const roofGfx = scene.add.graphics();
  roofGfx.setDepth(depth + DEPTH_ROOF);
  roofGfx.fillStyle(building.color.top, 1);
  roofGfx.fillPoints([
    new Phaser.Geom.Point(Nr.x, Nr.y),
    new Phaser.Geom.Point(Er.x, Er.y),
    new Phaser.Geom.Point(Sr.x, Sr.y),
    new Phaser.Geom.Point(Wr.x, Wr.y),
  ], true);
  objects.push(roofGfx);

  // --- Wall flat fills (backdrops behind texture images to cover gaps) ---

  const seWallGfx = scene.add.graphics();
  seWallGfx.setDepth(building.colEnd + building.rowStart + DEPTH_WALL_FILL);
  seWallGfx.fillStyle(building.color.right, 1);
  seWallGfx.fillPoints([
    new Phaser.Geom.Point(E.x, E.y),
    new Phaser.Geom.Point(S.x, S.y),
    new Phaser.Geom.Point(Sr.x, Sr.y),
    new Phaser.Geom.Point(Er.x, Er.y),
  ], true);
  objects.push(seWallGfx);

  const swWallGfx = scene.add.graphics();
  swWallGfx.setDepth(building.colStart + building.rowEnd + DEPTH_WALL_FILL);
  swWallGfx.fillStyle(building.color.left, 1);
  swWallGfx.fillPoints([
    new Phaser.Geom.Point(S.x, S.y),
    new Phaser.Geom.Point(W.x, W.y),
    new Phaser.Geom.Point(Wr.x, Wr.y),
    new Phaser.Geom.Point(Sr.x, Sr.y),
  ], true);
  objects.push(swWallGfx);

  // --- Slot grid for SE wall features (doors & windows) ---

  const seWallLen = E.x - S.x;
  const usableWidth = seWallLen - 2 * WALL_MARGIN;
  const numSlots = Math.max(1, Math.floor((usableWidth + SLOT_GAP) / (SLOT_WIDTH + SLOT_GAP)));
  const totalSlotsWidth = numSlots * SLOT_WIDTH + (numSlots - 1) * SLOT_GAP;
  const gridStart = WALL_MARGIN + (usableWidth - totalSlotsWidth) / 2;

  // Door slot: leftmost or rightmost based on doorSide
  const doorSlot = building.doorSide === "left" ? 0 : numSlots - 1;

  // Compute slot center positions along the wall
  const slotCenters: number[] = [];
  for (let s = 0; s < numSlots; s++) {
    slotCenters.push(gridStart + s * (SLOT_WIDTH + SLOT_GAP) + SLOT_WIDTH / 2);
  }

  const doorCenterAlong = slotCenters[doorSlot];
  const doorX = S.x + doorCenterAlong;
  const doorY = S.y - doorCenterAlong * 0.5 + TILE_H / 2;
  const doorAlong = doorCenterAlong - SLOT_WIDTH / 2;

  // Each wall gets either a regular door (75%) or a garage door (25%)
  const seHasDoor = buildingHash(building.seed, 40) < 0.75;

  // --- Texture images with per-tile depth ---

  const wallImgHeight = 16 + building.stories * STORY_HEIGHT;
  const scaleY = (wallHeight + 16) / wallImgHeight;

  // SE wall textures (right-face images along colEnd edge)
  for (let row = building.rowStart; row <= building.rowEnd; row++) {
    const pos = tileInsetPosition(building, building.colEnd, row);
    const img = scene.add.image(pos.x, pos.y - wallHeight, `wall-right-v${v}-${building.stories}s`);
    img.setOrigin(0, 0).setDepth(building.colEnd + row + DEPTH_WALL_TEX).setTint(building.color.right).setScale(1, scaleY);
    objects.push(img);
  }

  // SW wall textures (left-face images along rowEnd edge)
  for (let col = building.colStart; col <= building.colEnd; col++) {
    const pos = tileInsetPosition(building, col, building.rowEnd);
    const img = scene.add.image(pos.x - TILE_W / 2, pos.y - wallHeight, `wall-left-v${v}-${building.stories}s`);
    img.setOrigin(0, 0).setDepth(col + building.rowEnd + DEPTH_WALL_TEX).setTint(building.color.left).setScale(1, scaleY);
    objects.push(img);
  }

  // Door image on SE wall (ground floor, door slot) — only when not garage
  if (seHasDoor) {
    const doorNearT = seWallLen > 0 ? doorAlong / seWallLen : 0;
    const doorNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * doorNearT;
    const doorImg = scene.add.image(doorX, doorY, `door-${building.doorTexture}`);
    doorImg.setOrigin(0.5, 1).setDepth(building.colEnd + Math.ceil(doorNearRow) + DEPTH_FEATURE);
    objects.push(doorImg);
  }

  // --- Windows on SE wall (grid-aligned, all floors, tops aligned with door top) ---
  const VENTS = ["wall-vent-0", "wall-vent-1", "wall-vent-2"];
  const NUM_GARAGE = 9;
  const ventKey = VENTS[Math.floor(buildingHash(building.seed, 30) * VENTS.length)];

  // Pick slots for special features
  const nonDoorSlots = seHasDoor
    ? Array.from({ length: numSlots }, (_, i) => i).filter(i => i !== doorSlot)
    : Array.from({ length: numSlots }, (_, i) => i);

  // Garage door: two adjacent non-door slots on ground floor
  const adjacentPairs: number[][] = [];
  for (let i = 0; i < nonDoorSlots.length - 1; i++) {
    if (nonDoorSlots[i + 1] - nonDoorSlots[i] === 1) {
      adjacentPairs.push([nonDoorSlots[i], nonDoorSlots[i + 1]]);
    }
  }
  const garageSlots = (!seHasDoor && adjacentPairs.length > 0)
    ? adjacentPairs[Math.floor(buildingHash(building.seed, 35) * adjacentPairs.length)] : [];
  const garageTexKey = `garage-door-${Math.floor(buildingHash(building.seed, 36) * NUM_GARAGE)}`;
  const garageSet = new Set(garageSlots);

  // Elec box + vent: upper floors only
  const upperFloors = Array.from({ length: building.stories - 1 }, (_, i) => i + 1);
  const elecSlot = nonDoorSlots.length > 0
    ? nonDoorSlots[Math.floor(buildingHash(building.seed, 31) * nonDoorSlots.length)] : -1;
  const elecFloor = upperFloors.length > 0
    ? upperFloors[Math.floor(buildingHash(building.seed, 32) * upperFloors.length)] : -1;
  const ventFloorOptions = upperFloors.filter(i => i !== elecFloor);
  if (ventFloorOptions.length === 0 && upperFloors.length > 0) ventFloorOptions.push(upperFloors[0]);
  const ventFloor = ventFloorOptions[Math.floor(buildingHash(building.seed, 33) * ventFloorOptions.length)];
  const ventSlotOptions = nonDoorSlots.filter(s => !(s === elecSlot && ventFloor === elecFloor));
  const ventSlot = ventSlotOptions.length > 0
    ? ventSlotOptions[Math.floor(buildingHash(building.seed, 34) * ventSlotOptions.length)] : -1;

  const texKey = `window-${building.windowTexture}`;
  const probe = scene.textures.getFrame(texKey);
  const texW = probe?.width ?? 128;
  const texH = probe?.height ?? 128;
  const winScale = Math.min(WIN_TARGET_H / texH, SLOT_WIDTH / texW);

  const doorRenderedH = 128;

  // Render garage door spanning two slots
  if (garageSlots.length === 2) {
    const gAlong = (slotCenters[garageSlots[0]] + slotCenters[garageSlots[1]]) / 2;
    const gX = S.x + gAlong;
    const gBaseY = S.y - gAlong * 0.5 + TILE_H / 2;
    const gFrame = scene.textures.getFrame(garageTexKey);
    if (gFrame) {
      const garageW = SLOT_WIDTH * 2 + SLOT_GAP;
      const gScale = Math.min(doorRenderedH / gFrame.height, garageW / gFrame.width);
      const gNearT = seWallLen > 0 ? (gAlong - garageW / 2) / seWallLen : 0;
      const gNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * gNearT;
      const gImg = scene.add.image(gX, gBaseY, garageTexKey);
      gImg.setOrigin(0.5, 1).setScale(gScale, gScale);
      gImg.setDepth(building.colEnd + Math.ceil(gNearRow) + DEPTH_FEATURE);
      objects.push(gImg);
    }
  }

  for (let floor = 0; floor < building.stories; floor++) {
    const floorY = floor * STORY_HEIGHT;

    for (let s = 0; s < numSlots; s++) {
      // Ground floor: skip door slot (if door) or garage slots (if garage)
      if (floor === 0 && seHasDoor && s === doorSlot) continue;
      if (floor === 0 && garageSet.has(s)) continue;

      const along = slotCenters[s];
      const winX = S.x + along;
      const floorBaseY = S.y - along * 0.5 + TILE_H / 2 - floorY;
      const topY = floorBaseY - doorRenderedH;

      const winNearT = seWallLen > 0 ? (along - SLOT_WIDTH / 2) / seWallLen : 0;
      const winNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * winNearT;

      let slotTexKey = texKey;
      let slotScale = winScale;
      if (floor === elecFloor && s === elecSlot) {
        const ef = scene.textures.getFrame("elec-box-0");
        if (ef) { slotTexKey = "elec-box-0"; slotScale = Math.min(WIN_TARGET_H / ef.height, SLOT_WIDTH / ef.width); }
      } else if (floor === ventFloor && s === ventSlot) {
        const vf = scene.textures.getFrame(ventKey);
        if (vf) { slotTexKey = ventKey; slotScale = Math.min(WIN_TARGET_H / vf.height, SLOT_WIDTH / vf.width); }
      }

      const winImg = scene.add.image(winX, topY, slotTexKey);
      winImg.setOrigin(0.5, 0).setScale(slotScale, slotScale);
      winImg.setDepth(building.colEnd + Math.ceil(winNearRow) + DEPTH_FEATURE);
      objects.push(winImg);
    }
  }

  // --- Windows on SW wall (grid-aligned, all floors, flipped) ---
  // Each SW wall also gets 1 elec box + 1 vent
  const swVentKey = VENTS[Math.floor(buildingHash(building.seed, 130) * VENTS.length)];

  const swWallLen = S.x - W.x;
  const swUsableWidth = swWallLen - 2 * WALL_MARGIN;
  const swNumSlots = Math.max(0, Math.floor((swUsableWidth + SLOT_GAP) / (SLOT_WIDTH + SLOT_GAP)));

  if (swNumSlots > 0) {
    const swTotalSlotsWidth = swNumSlots * SLOT_WIDTH + (swNumSlots - 1) * SLOT_GAP;
    const swGridStart = WALL_MARGIN + (swUsableWidth - swTotalSlotsWidth) / 2;
    const swSlotCenters: number[] = [];
    for (let s = 0; s < swNumSlots; s++) {
      swSlotCenters.push(swGridStart + s * (SLOT_WIDTH + SLOT_GAP) + SLOT_WIDTH / 2);
    }

    const swAllSlots = Array.from({ length: swNumSlots }, (_, i) => i);

    // Each SW wall gets either a regular door (75%) or garage door (25%)
    const swHasDoor = buildingHash(building.seed, 41) < 0.75;
    const swDoorSlot = Math.floor(buildingHash(building.seed, 42) * swNumSlots);
    const swDoorTexture = Math.floor(buildingHash(building.seed, 43) * 6);

    const swNonDoorSlots = swHasDoor
      ? swAllSlots.filter(i => i !== swDoorSlot)
      : swAllSlots;

    // Garage door: two adjacent non-door slots on ground floor
    const swAdjacentPairs: number[][] = [];
    for (let i = 0; i < swNonDoorSlots.length - 1; i++) {
      if (swNonDoorSlots[i + 1] - swNonDoorSlots[i] === 1) {
        swAdjacentPairs.push([swNonDoorSlots[i], swNonDoorSlots[i + 1]]);
      }
    }
    const swGarageSlots = (!swHasDoor && swAdjacentPairs.length > 0)
      ? swAdjacentPairs[Math.floor(buildingHash(building.seed, 135) * swAdjacentPairs.length)] : [];
    const swGarageTexKey = `garage-door-${Math.floor(buildingHash(building.seed, 136) * NUM_GARAGE)}`;
    const swGarageSet = new Set(swGarageSlots);

    // Elec box + vent on upper floors
    const swElecSlot = swNonDoorSlots.length > 0
      ? swNonDoorSlots[Math.floor(buildingHash(building.seed, 131) * swNonDoorSlots.length)] : -1;
    const swUpperFloors = Array.from({ length: building.stories - 1 }, (_, i) => i + 1);
    const swElecFloor = swUpperFloors.length > 0
      ? swUpperFloors[Math.floor(buildingHash(building.seed, 132) * swUpperFloors.length)] : -1;
    const swVentFloorOpts = swUpperFloors.filter(i => i !== swElecFloor);
    if (swVentFloorOpts.length === 0 && swUpperFloors.length > 0) swVentFloorOpts.push(swUpperFloors[0]);
    const swVentFloor = swVentFloorOpts[Math.floor(buildingHash(building.seed, 133) * swVentFloorOpts.length)];
    const swVentSlotOpts = swNonDoorSlots.filter(s => !(s === swElecSlot && swVentFloor === swElecFloor));
    const swVentSlot = swVentSlotOpts.length > 0
      ? swVentSlotOpts[Math.floor(buildingHash(building.seed, 134) * swVentSlotOpts.length)] : -1;

    // Render SW door (if door) or SW garage door (if garage)
    if (swHasDoor) {
      const swDoorAlong = swSlotCenters[swDoorSlot];
      const swDoorX = S.x - swDoorAlong;
      const swDoorBaseY = S.y - swDoorAlong * 0.5 + TILE_H / 2;
      const swDoorNearT = swWallLen > 0 ? (swDoorAlong - SLOT_WIDTH / 2) / swWallLen : 0;
      const swDoorNearCol = building.colEnd + (building.colStart - building.colEnd) * swDoorNearT;
      const swDoorImg = scene.add.image(swDoorX, swDoorBaseY, `door-${swDoorTexture}`);
      swDoorImg.setOrigin(0.5, 1).setFlipX(true);
      swDoorImg.setDepth(Math.ceil(swDoorNearCol) + building.rowEnd + DEPTH_FEATURE);
      objects.push(swDoorImg);
    } else if (swGarageSlots.length === 2) {
      const gAlong = (swSlotCenters[swGarageSlots[0]] + swSlotCenters[swGarageSlots[1]]) / 2;
      const gX = S.x - gAlong;
      const gBaseY = S.y - gAlong * 0.5 + TILE_H / 2;
      const gFrame = scene.textures.getFrame(swGarageTexKey);
      if (gFrame) {
        const garageW = SLOT_WIDTH * 2 + SLOT_GAP;
        const gScale = Math.min(doorRenderedH / gFrame.height, garageW / gFrame.width);
        const gNearT = swWallLen > 0 ? (gAlong - garageW / 2) / swWallLen : 0;
        const gNearCol = building.colEnd + (building.colStart - building.colEnd) * gNearT;
        const gImg = scene.add.image(gX, gBaseY, swGarageTexKey);
        gImg.setOrigin(0.5, 1).setScale(gScale, gScale).setFlipX(true);
        gImg.setDepth(Math.ceil(gNearCol) + building.rowEnd + DEPTH_FEATURE);
        objects.push(gImg);
      }
    }

    for (let floor = 0; floor < building.stories; floor++) {
      const floorY = floor * STORY_HEIGHT;

      for (let s = 0; s < swNumSlots; s++) {
        // Ground floor: skip door slot (if door) or garage slots (if garage)
        if (floor === 0 && swHasDoor && s === swDoorSlot) continue;
        if (floor === 0 && swGarageSet.has(s)) continue;

        const along = swSlotCenters[s];
        const winX = S.x - along;
        const floorBaseY = S.y - along * 0.5 + TILE_H / 2 - floorY;
        const topY = floorBaseY - doorRenderedH;

        const winNearT = swWallLen > 0 ? (along - SLOT_WIDTH / 2) / swWallLen : 0;
        const winNearCol = building.colEnd + (building.colStart - building.colEnd) * winNearT;

        let swSlotTexKey = texKey;
        let swSlotScale = winScale;
        if (floor === swElecFloor && s === swElecSlot) {
          const ef = scene.textures.getFrame("elec-box-0");
          if (ef) { swSlotTexKey = "elec-box-0"; swSlotScale = Math.min(WIN_TARGET_H / ef.height, SLOT_WIDTH / ef.width); }
        } else if (floor === swVentFloor && s === swVentSlot) {
          const vf = scene.textures.getFrame(swVentKey);
          if (vf) { swSlotTexKey = swVentKey; swSlotScale = Math.min(WIN_TARGET_H / vf.height, SLOT_WIDTH / vf.width); }
        }

        const winImg = scene.add.image(winX, topY, swSlotTexKey);
        winImg.setOrigin(0.5, 0).setScale(swSlotScale, swSlotScale);
        winImg.setFlipX(true);
        winImg.setDepth(Math.ceil(winNearCol) + building.rowEnd + DEPTH_FEATURE);
        objects.push(winImg);
      }
    }
  }

  // --- Billboard perpendicular to SE wall (second floor level) ---
  // Extends outward from wall along +col axis (slope +0.5 in screen)
  // One story tall, positioned at second floor height

  const BB_EXTENT = 48;  // how far billboard sticks out (screen x pixels)
  const BB_DEPTH = 10;   // thickness (screen pixels along +row axis)

  // Position between rightmost slot and wall edge (NE end of SE wall)
  const lastSlotRight = slotCenters[numSlots - 1] + SLOT_WIDTH / 2;
  const bbAlong = (lastSlotRight + seWallLen) / 2;
  const bbX = S.x + bbAlong;
  const bbBaseY = S.y - bbAlong * 0.5 + TILE_H / 2;

  // Varying height: 1.0x to 1.5x of one story, deterministic per building
  const bbHeightMult = 1.0 + 0.5 * buildingHash(building.seed, 10);
  const bbHeight = STORY_HEIGHT * bbHeightMult;

  // Second floor level: bottom of billboard is one story up from ground
  const bbBottom = bbBaseY - STORY_HEIGHT;
  const bbTop = bbBottom - bbHeight;

  // Col axis extent: slope +0.5
  const bbExtY = BB_EXTENT * 0.5;

  // Thickness extends in -row direction (toward NE, away from camera)
  // so the visible front face faces SW (toward camera, like SW walls)
  const bbDx = BB_DEPTH;          // -row in screen: +x
  const bbDy = -BB_DEPTH * 0.5;   // -row in screen: -y

  // Random dark grey base color, deterministic per building
  const bbBase = 0x0a + Math.floor(buildingHash(building.seed, 11) * 16);  // 0x0a to 0x1a
  const bbFront = (bbBase << 16) | (bbBase << 8) | bbBase;
  const bbTopCol = ((bbBase + 0x08) << 16) | ((bbBase + 0x08) << 8) | (bbBase + 0x08);
  const bbEdgeCol = ((bbBase - 0x04) << 16) | ((bbBase - 0x04) << 8) | (bbBase - 0x04);

  const bbGfx = scene.add.graphics();

  // Top face (lighter)
  bbGfx.fillStyle(bbTopCol, 1);
  bbGfx.fillPoints([
    new Phaser.Geom.Point(bbX, bbTop),
    new Phaser.Geom.Point(bbX + BB_EXTENT, bbTop + bbExtY),
    new Phaser.Geom.Point(bbX + BB_EXTENT + bbDx, bbTop + bbExtY + bbDy),
    new Phaser.Geom.Point(bbX + bbDx, bbTop + bbDy),
  ], true);

  // Outer edge (SE-facing — darker)
  bbGfx.fillStyle(bbEdgeCol, 1);
  bbGfx.fillPoints([
    new Phaser.Geom.Point(bbX + BB_EXTENT, bbTop + bbExtY),
    new Phaser.Geom.Point(bbX + BB_EXTENT + bbDx, bbTop + bbExtY + bbDy),
    new Phaser.Geom.Point(bbX + BB_EXTENT + bbDx, bbBottom + bbExtY + bbDy),
    new Phaser.Geom.Point(bbX + BB_EXTENT, bbBottom + bbExtY),
  ], true);

  // Front face (SW-facing — the sign surface)
  bbGfx.fillStyle(bbFront, 1);
  bbGfx.fillPoints([
    new Phaser.Geom.Point(bbX, bbTop),
    new Phaser.Geom.Point(bbX + BB_EXTENT, bbTop + bbExtY),
    new Phaser.Geom.Point(bbX + BB_EXTENT, bbBottom + bbExtY),
    new Phaser.Geom.Point(bbX, bbBottom),
  ], true);

  // Depth: billboard extends from colEnd outward, use mid-row for sorting
  const bbT = seWallLen > 0 ? bbAlong / seWallLen : 0;
  const bbNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * bbT;
  const bbDepth = building.colEnd + building.rowEnd + DEPTH_BILLBOARD;
  bbGfx.setDepth(bbDepth);
  objects.push(bbGfx);

  // --- Vertical Japanese text on billboard face (iso-skewed) ---
  const KANJI = '電光夜闇風雷火水星月刃龍鬼魂影神力速街道店酒薬肉麺飯茶';
  const NEON = [0xff1493, 0x00ffff, 0x39ff14, 0xff6600, 0xbf00ff, 0xff0033, 0xffff00, 0x0066ff];

  const numChars = bbHeightMult >= 1.25 ? 3 : 2;
  const neonHex = NEON[Math.floor(buildingHash(building.seed, 12) * NEON.length)];
  const neonStr = '#' + neonHex.toString(16).padStart(6, '0');

  // Center line of billboard face
  const bbCenterX = bbX + BB_EXTENT / 2;
  const bbFaceMidTopY = bbTop + bbExtY / 2;
  const bbFaceH = bbBottom - bbTop;

  const charPad = 16;
  const charSlotH = (bbFaceH - charPad * 2) / numChars;
  const fontSize = Math.floor(charSlotH * 0.65);

  for (let i = 0; i < numChars; i++) {
    const ci = Math.floor(buildingHash(building.seed, 13 + i) * KANJI.length);
    const char = KANJI[ci];

    // Render character onto a canvas with skewY to match col axis slope +0.5
    const cw = Math.ceil(fontSize * 1.2);
    const skewExtra = Math.ceil(cw * 0.5);
    const ch = fontSize + skewExtra + 4;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    // setTransform(a, b, c, d, e, f): (x,y) → (ax+cy+e, bx+dy+f)
    // skewY of 0.5 matches the +col axis slope
    ctx.setTransform(1, 0.5, 0, 1, 0, 0);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = neonStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, cw / 2, fontSize / 2 + 2);

    const texKey = `bb-${building.colStart}-${building.rowStart}-${i}`;
    if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
    scene.textures.addCanvas(texKey, canvas);

    const charY = bbFaceMidTopY + charPad + (i + 0.5) * charSlotH;
    const charImg = scene.add.image(bbCenterX, charY, texKey);
    charImg.setOrigin(0.5, 0.5);
    charImg.setDepth(building.colEnd + building.rowEnd + DEPTH_BILLBOARD_TEXT);
    (charImg as any).isNeonText = true;
    objects.push(charImg);
  }

  // --- Street-level object per building (vending machine or garbage bin) ---
  const streetObjType = buildingHash(building.seed, 20) < 0.5 ? 0 : 1;
  if (streetObjType === 0) {
    // Vending machine under billboard
    const VM_H = 96;
    const vmVariant = Math.floor(buildingHash(building.seed, 21) * 9);
    const vmKey = `vending-machine-${vmVariant}`;
    const vmFrame = scene.textures.getFrame(vmKey);
    if (vmFrame) {
      const vmScale = VM_H / vmFrame.height;
      const vmRenderedW = vmFrame.width * vmScale;
      const vmX = bbX + vmRenderedW / 2;
      const vmY = bbBaseY;
      const vmImg = scene.add.image(vmX, vmY, vmKey);
      vmImg.setOrigin(0.5, 1).setScale(vmScale).setDepth(depth + DEPTH_STREET_OBJ);
      objects.push(vmImg);
    }
  } else {
    // Garbage bin flush against wall, far from door (opposite end of SE wall)
    const BIN_H = 48;
    const binVariant = Math.floor(buildingHash(building.seed, 22) * 6);
    const binKey = `garbage-bin-${binVariant}`;
    const binFrame = scene.textures.getFrame(binKey);
    if (binFrame) {
      const binScale = BIN_H / binFrame.height;
      const binRenderedW = binFrame.width * binScale;
      // Place at the opposite end of the wall from the door
      const binAlong = building.doorSide === "left"
        ? seWallLen - WALL_MARGIN - binRenderedW / 2
        : WALL_MARGIN + binRenderedW / 2;
      const binX = S.x + binAlong;
      const binY = S.y - binAlong * 0.5 + TILE_H / 2;
      const binNearT = seWallLen > 0 ? binAlong / seWallLen : 0;
      const binNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * binNearT;
      const binImg = scene.add.image(binX, binY, binKey);
      binImg.setOrigin(0.5, 1).setScale(binScale).setDepth(depth + DEPTH_STREET_OBJ);
      objects.push(binImg);
    }
  }

  // --- Street-level object on SW wall (flipped) ---
  const swStreetObjType = buildingHash(building.seed, 23) < 0.5 ? 0 : 1;
  if (swStreetObjType === 0) {
    // Vending machine on SW wall
    const SW_VM_H = 96;
    const swVmVariant = Math.floor(buildingHash(building.seed, 24) * 9);
    const swVmKey = `vending-machine-${swVmVariant}`;
    const swVmFrame = scene.textures.getFrame(swVmKey);
    if (swVmFrame) {
      const swVmScale = SW_VM_H / swVmFrame.height;
      const swVmRenderedW = swVmFrame.width * swVmScale;
      // Place near one end of SW wall
      const swVmAlong = swWallLen - WALL_MARGIN - swVmRenderedW / 2;
      const swVmX = S.x - swVmAlong - swVmRenderedW / 2;
      const swVmY = S.y - swVmAlong * 0.5 + TILE_H / 2;
      const swVmNearT = swWallLen > 0 ? swVmAlong / swWallLen : 0;
      const swVmNearCol = building.colEnd + (building.colStart - building.colEnd) * swVmNearT;
      const swVmImg = scene.add.image(swVmX, swVmY, swVmKey);
      swVmImg.setOrigin(0.5, 1).setScale(swVmScale).setFlipX(true).setDepth(depth + DEPTH_STREET_OBJ);
      objects.push(swVmImg);
    }
  } else {
    // Garbage bin on SW wall
    const SW_BIN_H = 48;
    const swBinVariant = Math.floor(buildingHash(building.seed, 25) * 6);
    const swBinKey = `garbage-bin-${swBinVariant}`;
    const swBinFrame = scene.textures.getFrame(swBinKey);
    if (swBinFrame) {
      const swBinScale = SW_BIN_H / swBinFrame.height;
      const swBinAlong = WALL_MARGIN + swBinFrame.width * swBinScale / 2;
      const swBinX = S.x - swBinAlong;
      const swBinY = S.y - swBinAlong * 0.5 + TILE_H / 2;
      const swBinNearT = swWallLen > 0 ? swBinAlong / swWallLen : 0;
      const swBinNearCol = building.colEnd + (building.colStart - building.colEnd) * swBinNearT;
      const swBinImg = scene.add.image(swBinX, swBinY, swBinKey);
      swBinImg.setOrigin(0.5, 1).setScale(swBinScale).setFlipX(true).setDepth(depth + DEPTH_STREET_OBJ);
      objects.push(swBinImg);
    }
  }

  return objects;
}
