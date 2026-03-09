import Phaser from "phaser";
import { TILE_W, TILE_H } from "../iso/IsoGeometry";
import { STORY_HEIGHT } from "../iso/CityLayout";
import { Building } from "./BuildingTypes";
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
  roofGfx.setDepth(depth + 0.1);
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
  seWallGfx.setDepth(building.colEnd + building.rowStart - 0.1);
  seWallGfx.fillStyle(building.color.right, 1);
  seWallGfx.fillPoints([
    new Phaser.Geom.Point(E.x, E.y),
    new Phaser.Geom.Point(S.x, S.y),
    new Phaser.Geom.Point(Sr.x, Sr.y),
    new Phaser.Geom.Point(Er.x, Er.y),
  ], true);
  objects.push(seWallGfx);

  const swWallGfx = scene.add.graphics();
  swWallGfx.setDepth(building.colStart + building.rowEnd - 0.1);
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

  // --- Texture images with per-tile depth ---

  const wallImgHeight = 16 + building.stories * STORY_HEIGHT;
  const scaleY = (wallHeight + 16) / wallImgHeight;

  // SE wall textures (right-face images along colEnd edge)
  for (let row = building.rowStart; row <= building.rowEnd; row++) {
    const pos = tileInsetPosition(building, building.colEnd, row);
    const img = scene.add.image(pos.x, pos.y - wallHeight, `wall-right-v${v}-${building.stories}s`);
    img.setOrigin(0, 0).setDepth(building.colEnd + row).setTint(building.color.right).setScale(1, scaleY);
    objects.push(img);
  }

  // SW wall textures (left-face images along rowEnd edge)
  for (let col = building.colStart; col <= building.colEnd; col++) {
    const pos = tileInsetPosition(building, col, building.rowEnd);
    const img = scene.add.image(pos.x - TILE_W / 2, pos.y - wallHeight, `wall-left-v${v}-${building.stories}s`);
    img.setOrigin(0, 0).setDepth(col + building.rowEnd).setTint(building.color.left).setScale(1, scaleY);
    objects.push(img);
  }

  // Door image on SE wall (ground floor, door slot)
  const doorNearT = seWallLen > 0 ? doorAlong / seWallLen : 0;
  const doorNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * doorNearT;
  const doorImg = scene.add.image(doorX, doorY, `door-${building.doorTexture}`);
  doorImg.setOrigin(0.5, 1).setDepth(building.colEnd + Math.ceil(doorNearRow) + 0.5);
  objects.push(doorImg);

  // --- Windows on SE wall (grid-aligned, all floors, tops aligned with door top) ---
  const texKey = `window-${building.windowTexture}`;
  const probe = scene.textures.getFrame(texKey);
  const texW = probe?.width ?? 128;
  const texH = probe?.height ?? 128;
  // Scale to fit: target height, but also don't exceed slot width
  const winScale = Math.min(WIN_TARGET_H / texH, SLOT_WIDTH / texW);

  // Door rendered height = 128 (native). Window top aligns with door top.
  // Door bottom is at floorBaseY (= S.y - along*0.5 + TILE_H/2 for its slot).
  // Door top = floorBaseY - 128. Window top should match.
  const doorRenderedH = 128;

  for (let floor = 0; floor < building.stories; floor++) {
    const floorY = floor * STORY_HEIGHT;

    for (let s = 0; s < numSlots; s++) {
      // Ground floor: skip the door slot
      if (floor === 0 && s === doorSlot) continue;

      const along = slotCenters[s];
      const winX = S.x + along;
      // Floor baseline at this slot position
      const floorBaseY = S.y - along * 0.5 + TILE_H / 2 - floorY;
      // Top of door (or where door top would be) at this floor
      const topY = floorBaseY - doorRenderedH;

      const winNearT = seWallLen > 0 ? (along - SLOT_WIDTH / 2) / seWallLen : 0;
      const winNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * winNearT;

      const winImg = scene.add.image(winX, topY, texKey);
      winImg.setOrigin(0.5, 0).setScale(winScale, winScale);
      winImg.setDepth(building.colEnd + Math.ceil(winNearRow) + 0.5);
      objects.push(winImg);
    }
  }

  return objects;
}
