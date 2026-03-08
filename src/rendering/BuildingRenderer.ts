import Phaser from "phaser";
import { TILE_W, TILE_H, isoToScreen } from "../iso/IsoGeometry";
import { STORY_HEIGHT } from "../iso/CityLayout";
import { WallFaceGeometry, wallFeatureRect } from "../iso/WallFace";
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

  // --- Flat fill base layers (covers any sub-pixel gaps between tiled images) ---

  // SE wall fill
  const seGfx = scene.add.graphics();
  seGfx.setDepth(depth);
  seGfx.fillStyle(building.color.right, 1);
  seGfx.fillPoints([
    new Phaser.Geom.Point(E.x, E.y),
    new Phaser.Geom.Point(S.x, S.y),
    new Phaser.Geom.Point(Sr.x, Sr.y),
    new Phaser.Geom.Point(Er.x, Er.y),
  ], true);
  objects.push(seGfx);

  // SW wall fill
  const swGfx = scene.add.graphics();
  swGfx.setDepth(depth);
  swGfx.fillStyle(building.color.left, 1);
  swGfx.fillPoints([
    new Phaser.Geom.Point(S.x, S.y),
    new Phaser.Geom.Point(W.x, W.y),
    new Phaser.Geom.Point(Wr.x, Wr.y),
    new Phaser.Geom.Point(Sr.x, Sr.y),
  ], true);
  objects.push(swGfx);

  // Roof fill
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

  // --- Texture image overlays ---

  const wallImgHeight = 16 + building.stories * STORY_HEIGHT;
  const scaleY = (wallHeight + 16) / wallImgHeight;

  // SE wall textures (right-face images along colEnd edge)
  for (let row = building.rowStart; row <= building.rowEnd; row++) {
    const pos = tileInsetPosition(building, building.colEnd, row);
    const img = scene.add.image(pos.x, pos.y - wallHeight, `wall-right-v${v}-${building.stories}s`);
    img.setOrigin(0, 0).setDepth(depth + 0.02).setTint(building.color.right).setScale(1, scaleY);
    objects.push(img);
  }

  // SW wall textures (left-face images along rowEnd edge)
  for (let col = building.colStart; col <= building.colEnd; col++) {
    const pos = tileInsetPosition(building, col, building.rowEnd);
    const img = scene.add.image(pos.x - TILE_W / 2, pos.y - wallHeight, `wall-left-v${v}-${building.stories}s`);
    img.setOrigin(0, 0).setDepth(depth + 0.02).setTint(building.color.left).setScale(1, scaleY);
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

  // Door on SE wall (near S vertex)
  const seFace: WallFaceGeometry = {
    baseX: S.x,
    baseY: S.y,
    dx: 1,
    slope: -0.5,
    wallHeight,
  };
  const doorPoints = wallFeatureRect(seFace, 2, 0, 28, STORY_HEIGHT * 0.75);
  const doorGfx = scene.add.graphics();
  doorGfx.setDepth(depth + 0.5);
  doorGfx.fillStyle(0xff0000, 1);
  doorGfx.fillPoints(
    doorPoints.map((p) => new Phaser.Geom.Point(p.x, p.y)),
    true,
  );
  objects.push(doorGfx);

  return objects;
}
