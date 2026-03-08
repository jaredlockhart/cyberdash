import Phaser from "phaser";
import { TILE_W, TILE_H, isoToScreen } from "../iso/IsoGeometry";
import { COL_PERIOD, STORY_HEIGHT, CURB_HEIGHT } from "../iso/CityLayout";
import { WallFaceId, getWallFaceGeometry, wallFeatureRect } from "../iso/WallFace";
import { BuildingTile } from "./BuildingTypes";

/**
 * Compute the inset-adjusted screen position for a building tile.
 * Buildings compress toward block center based on their inset value.
 */
export function computeInsetPosition(
  col: number,
  row: number,
  bData: BuildingTile,
): { bx: number; by: number } {
  const { x, y } = isoToScreen(col, row);
  const relCol = (col % COL_PERIOD) - 10; // 0-11 within block
  const t = relCol / 11;
  const dc = bData.inset * (1 - 2 * t); // +inset at NW edge, -inset at SE edge
  return {
    bx: x + dc * (TILE_W / 2),
    by: y + dc * (TILE_H / 2),
  };
}

/**
 * Render storefront features (doors, future windows/signs) on the SE wall.
 */
function renderStorefrontFeatures(
  scene: Phaser.Scene,
  bx: number,
  by: number,
  wallHeight: number,
  depth: number,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];

  const seFace = getWallFaceGeometry(WallFaceId.SE, bx, by, wallHeight);
  const doorPoints = wallFeatureRect(seFace, 2, 0, 28, STORY_HEIGHT * 0.75);

  const doorGfx = scene.add.graphics();
  doorGfx.setDepth(depth + 0.5);
  doorGfx.fillStyle(0xff0000, 1); // bright red for now
  doorGfx.fillPoints(
    doorPoints.map((p) => new Phaser.Geom.Point(p.x, p.y)),
    true,
  );
  objects.push(doorGfx);

  return objects;
}

/**
 * Render a single building tile (walls, top face, storefront features).
 * Returns all GameObjects created for chunk registration.
 */
export function renderBuildingTile(
  scene: Phaser.Scene,
  col: number,
  row: number,
  bData: BuildingTile,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const { x, y } = isoToScreen(col, row);

  // Sidewalk ground under building (visible through inset gaps)
  scene.add.image(x, y - CURB_HEIGHT, "sidewalk").setDepth(0.6);

  const { bx, by } = computeInsetPosition(col, row, bData);
  const tileDepth = bData.stories * STORY_HEIGHT + bData.heightOffset;
  const depth = col + row;
  const v = bData.texture;

  // Scale walls to reach ground when heightOffset stretches them
  const wallImgHeight = 16 + bData.stories * STORY_HEIGHT;
  const scaleY = (tileDepth + 16) / wallImgHeight;

  // NW back wall (code "left wall" image: W-to-S edge)
  const leftImg = scene.add.image(bx - TILE_W / 2, by - tileDepth, `wall-left-v${v}-${bData.stories}s`);
  leftImg.setOrigin(0, 0).setDepth(depth).setTint(bData.color.left).setScale(1, scaleY);
  objects.push(leftImg);

  // NE back wall (code "right wall" image: E-to-S edge)
  const rightImg = scene.add.image(bx, by - tileDepth, `wall-right-v${v}-${bData.stories}s`);
  rightImg.setOrigin(0, 0).setDepth(depth).setTint(bData.color.right).setScale(1, scaleY);
  objects.push(rightImg);

  // Top face
  const topImg = scene.add.image(bx, by - tileDepth, `bldg-top-v${v}`);
  topImg.setDepth(depth + 0.1).setTint(bData.color.top);
  objects.push(topImg);

  // Door on the SE wall at the building's east edge (colMod 21) and last row
  if (row === bData.buildingMaxRow && (col % COL_PERIOD) === 21) {
    const featureObjects = renderStorefrontFeatures(scene, bx, by, tileDepth, depth);
    objects.push(...featureObjects);
  }

  return objects;
}
