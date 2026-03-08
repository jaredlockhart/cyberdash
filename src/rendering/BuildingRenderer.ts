import Phaser from "phaser";
import { TILE_W, TILE_H, isoToScreen } from "../iso/IsoGeometry";
import { STORY_HEIGHT } from "../iso/CityLayout";
import { Building } from "./BuildingTypes";

interface Corner { x: number; y: number }

/**
 * Compute the 4 ground-level corners of a building's iso diamond,
 * compressed inward along the col axis by the inset amount.
 */
function buildingCorners(b: Building): { N: Corner; E: Corner; S: Corner; W: Corner } {
  const insOff = b.inset * TILE_W / 2;
  const insOffY = b.inset * TILE_H / 2;

  const nBase = isoToScreen(b.colStart, b.rowStart);
  const eBase = isoToScreen(b.colEnd, b.rowStart);
  const sBase = isoToScreen(b.colEnd, b.rowEnd);
  const wBase = isoToScreen(b.colStart, b.rowEnd);

  return {
    N: { x: nBase.x + insOff, y: nBase.y - TILE_H / 2 + insOffY },
    E: { x: eBase.x + TILE_W / 2 - insOff, y: eBase.y - insOffY },
    S: { x: sBase.x - insOff, y: sBase.y + TILE_H / 2 - insOffY },
    W: { x: wBase.x - TILE_W / 2 + insOff, y: wBase.y + insOffY },
  };
}

/**
 * Compute the inset-adjusted screen position for a tile within a building.
 */
function tileInsetPosition(b: Building, col: number, row: number): Corner {
  const { x, y } = isoToScreen(col, row);
  const span = b.colEnd - b.colStart;
  const relCol = col - b.colStart;
  const t = span > 0 ? relCol / span : 0.5;
  const dc = b.inset * (1 - 2 * t);
  return {
    x: x + dc * (TILE_W / 2),
    y: y + dc * (TILE_H / 2),
  };
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

  // Roof textures (top-face images across entire footprint)
  for (let row = building.rowStart; row <= building.rowEnd; row++) {
    for (let col = building.colStart; col <= building.colEnd; col++) {
      const pos = tileInsetPosition(building, col, row);
      const img = scene.add.image(pos.x, pos.y - wallHeight, `bldg-top-v${v}`);
      img.setDepth(depth + 0.12).setTint(building.color.top);
      objects.push(img);
    }
  }

  // Door image on SE wall (left = near S vertex, right = near E vertex)
  const doorWidth = 48;
  const seWallLen = E.x - S.x;
  const doorMargin = building.doorInset;
  const doorAlong = building.doorSide === "left" ? doorMargin : seWallLen - doorWidth - doorMargin;
  const doorCenterAlong = doorAlong + doorWidth / 2;
  const doorX = S.x + doorCenterAlong;
  const doorY = S.y - doorCenterAlong * 0.5 + TILE_H / 2;
  const doorImg = scene.add.image(doorX, doorY, `door-${building.doorTexture}`);
  doorImg.setOrigin(0.5, 1).setDepth(depth + 0.5);
  objects.push(doorImg);

  return objects;
}
