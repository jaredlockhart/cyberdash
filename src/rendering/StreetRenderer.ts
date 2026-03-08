import Phaser from "phaser";
import { TILE_W, TILE_H, isoToScreen } from "../iso/IsoGeometry";
import { COL_PERIOD, ROW_PERIOD, CURB_HEIGHT } from "../iso/CityLayout";
import { TILE_COLORS } from "./BuildingTypes";
import { TileType } from "../iso/CityLayout";

/**
 * Render a street tile and its markings (center lines, stop lines, crosswalks).
 */
export function renderStreetTile(
  scene: Phaser.Scene,
  col: number,
  row: number,
  streetLines: Phaser.GameObjects.Graphics,
): void {
  const { x, y } = isoToScreen(col, row);
  scene.add.image(x, y, "street").setDepth(0);

  const colMod = col % COL_PERIOD;
  const rowMod = row % ROW_PERIOD;
  const inStreetCol = colMod < 8;
  const inStreetRow = rowMod < 8;
  const isIntersection = inStreetCol && inStreetRow;

  if (isIntersection) return;

  const tw = TILE_W;
  const th = TILE_H;

  // Double yellow center lines
  const isCenter = inStreetCol ? colMod === 4 : rowMod === 4;
  const nearCrosswalk = inStreetCol
    ? (rowMod >= 7 && rowMod <= 10) || (rowMod >= 37 && rowMod <= 39)
    : (colMod >= 7 && colMod <= 10) || (colMod >= 21 && colMod <= 23);

  if (isCenter && !nearCrosswalk) {
    const ext = 16;
    const hext = 8;
    const gap = 2;
    const hw = 1;
    streetLines.fillStyle(0x8b8520, 0.5);
    if (inStreetCol) {
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

  // White stop lines
  const hw2 = 4;
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

  // Crosswalks
  const hw = 3;
  if (inStreetCol && (rowMod === 8 || rowMod === 9 || rowMod === 38 || rowMod === 39)) {
    streetLines.fillStyle(0xffffff, 0.35);
    streetLines.fillPoints([
      new Phaser.Geom.Point(x + tw / 4 - hw, y - th / 4 - hw * 0.5),
      new Phaser.Geom.Point(x + tw / 4 + hw, y - th / 4 + hw * 0.5),
      new Phaser.Geom.Point(x - tw / 4 + hw, y + th / 4 + hw * 0.5),
      new Phaser.Geom.Point(x - tw / 4 - hw, y + th / 4 - hw * 0.5),
    ], true);
  }
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

/**
 * Render a sidewalk tile with curb walls and grid lines.
 */
export function renderSidewalkTile(
  scene: Phaser.Scene,
  col: number,
  row: number,
  sidewalkGfx: Phaser.GameObjects.Graphics,
  sidewalkLines: Phaser.GameObjects.Graphics,
): void {
  const tw = TILE_W;
  const th = TILE_H;
  const { x: sx, y: sy } = isoToScreen(col, row);

  // Textured top face (raised by curb height)
  scene.add.image(sx, sy - CURB_HEIGHT, "sidewalk").setDepth(0.6);

  // Curb walls
  const colors = TILE_COLORS[TileType.SIDEWALK];
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

  // Grid lines
  sidewalkLines.lineStyle(1, 0x2e2e3e, 0.5);
  if (col % 2 === 0) {
    sidewalkLines.lineBetween(sx, sy - th / 2 - CURB_HEIGHT, sx - tw / 2, sy - CURB_HEIGHT);
  }
  if (row % 2 === 0) {
    sidewalkLines.lineBetween(sx, sy - th / 2 - CURB_HEIGHT, sx + tw / 2, sy - CURB_HEIGHT);
  }
}
