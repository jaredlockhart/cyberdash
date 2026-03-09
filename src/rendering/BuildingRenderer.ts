import Phaser from "phaser";
import { TILE_W, TILE_H } from "../iso/IsoGeometry";
import { STORY_HEIGHT } from "../iso/CityLayout";
import { Building } from "./BuildingTypes";
import { buildingCorners, tileInsetPosition, computeBuildingMetrics, WIN_MAX_SCALE, WIN_GAP, WIN_DOOR_GAP, WIN_WALL_MARGIN, WIN_BOTTOM, WIN_MIN_ZONE } from "./BuildingMetrics";
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

  // --- Door position (computed early so SE wall can skip overlapping tiles) ---

  const doorWidth = 48;
  const seWallLen = E.x - S.x;
  const doorMargin = building.doorInset;
  const doorAlong = building.doorSide === "left" ? doorMargin : seWallLen - doorWidth - doorMargin;
  const doorCenterAlong = doorAlong + doorWidth / 2;
  const doorX = S.x + doorCenterAlong;
  const doorY = S.y - doorCenterAlong * 0.5 + TILE_H / 2;
  const doorT = seWallLen > 0 ? doorCenterAlong / seWallLen : 0;
  const doorRow = building.rowEnd + (building.rowStart - building.rowEnd) * doorT;

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

  // Door image on SE wall — depth from S-ward (camera-nearest) edge
  const doorNearT = seWallLen > 0 ? doorAlong / seWallLen : 0;
  const doorNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * doorNearT;
  const doorImg = scene.add.image(doorX, doorY, `door-${building.doorTexture}`);
  doorImg.setOrigin(0.5, 1).setDepth(building.colEnd + Math.ceil(doorNearRow) + 0.5);
  objects.push(doorImg);

  // --- Ground-floor storefront windows on SE wall ---
  let windowStart: number;
  let windowEnd: number;

  if (building.doorSide === "left") {
    windowStart = doorAlong + doorWidth + WIN_DOOR_GAP;
    windowEnd = seWallLen - WIN_WALL_MARGIN;
  } else {
    windowStart = WIN_WALL_MARGIN;
    windowEnd = doorAlong - WIN_DOOR_GAP;
  }

  const windowZone = windowEnd - windowStart;
  if (windowZone >= WIN_MIN_ZONE) {
    const texKey = `window-${building.windowTexture}`;
    // Probe texture size (creates a temporary image)
    const probe = scene.textures.getFrame(texKey);
    const texW = probe?.width ?? 128;

    // Single window width at max scale
    const singleW = texW * WIN_MAX_SCALE;
    // How many windows fit with gaps between them?
    const count = Math.max(1, Math.floor((windowZone + WIN_GAP) / (singleW + WIN_GAP)));
    // Actual scale: divide available space evenly (minus gaps), then cap
    const perWinWidth = (windowZone - WIN_GAP * (count - 1)) / count;
    const scale = Math.min(WIN_MAX_SCALE, perWinWidth / texW);

    const actualWinW = texW * scale;
    // Total width of all windows + gaps
    const totalW = actualWinW * count + WIN_GAP * (count - 1);
    // Center the window group within the zone
    const offsetStart = windowStart + (windowZone - totalW) / 2;

    for (let i = 0; i < count; i++) {
      const along = offsetStart + i * (actualWinW + WIN_GAP);
      const winX = S.x + along;
      const winY = S.y - along * 0.5 - WIN_BOTTOM;

      // Depth from S-ward (camera-nearest) edge of this window
      const winNearT = seWallLen > 0 ? along / seWallLen : 0;
      const winNearRow = building.rowEnd + (building.rowStart - building.rowEnd) * winNearT;

      const winImg = scene.add.image(winX, winY, texKey);
      winImg.setOrigin(0, 1).setScale(scale, scale);
      winImg.setDepth(building.colEnd + Math.ceil(winNearRow) + 0.5);
      objects.push(winImg);
    }
  }

  return objects;
}
