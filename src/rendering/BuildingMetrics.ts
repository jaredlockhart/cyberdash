/**
 * Pure-math building metrics — no Phaser dependency.
 * Used by both the in-browser renderer and CLI measurement scripts.
 */

import { TILE_W, TILE_H, isoToScreen } from "../iso/IsoGeometry";
import { STORY_HEIGHT } from "../iso/CityLayout";
import { Building } from "./BuildingTypes";

interface Corner { x: number; y: number }

/**
 * Compute the 4 ground-level corners of a building's iso diamond,
 * compressed inward along the col axis by the inset amount.
 */
export function buildingCorners(b: Building): { N: Corner; E: Corner; S: Corner; W: Corner } {
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
export function tileInsetPosition(b: Building, col: number, row: number): Corner {
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

export interface BuildingMetrics {
  index: number;
  colSpan: number;
  rowSpan: number;
  stories: number;
  wallHeight: number;
  seWallLen: number;
  doorSide: string;
  doorInset: number;
  doorAlong: number;
  doorTexture: number;
  doorTexW: number;
  doorTexH: number;
  windowTexture: number;
  windowZone: number;    // available width for windows
  winCount: number;      // number of windows placed
  winTexW: number;
  winTexH: number;
  winScale: number;
  winRenderedW: number;
  winRenderedH: number;
  winDoorRatio: number;
}

// Layout constants — shared between renderer and metrics
export const WIN_MAX_SCALE = 0.85;
export const WIN_GAP = 12;
export const WIN_DOOR_GAP = 20;
export const WIN_WALL_MARGIN = 32;
export const WIN_BOTTOM = 20;
export const WIN_MIN_ZONE = 24;

/**
 * Pure-math metrics computation. texSize callback returns {w, h} for a texture key.
 * Works in browser (Phaser textures) or Node (PNG header reads).
 */
export function computeBuildingMetrics(
  buildings: Building[],
  texSize: (key: string) => { w: number; h: number },
): BuildingMetrics[] {
  const metrics: BuildingMetrics[] = [];

  for (let idx = 0; idx < buildings.length; idx++) {
    const b = buildings[idx];
    const { E, S } = buildingCorners(b);
    const wallHeight = b.stories * STORY_HEIGHT + b.heightOffset;

    const doorWidth = 48;
    const seWallLen = E.x - S.x;
    const doorAlong = b.doorSide === "left" ? b.doorInset : seWallLen - doorWidth - b.doorInset;

    let windowStart: number;
    let windowEnd: number;
    if (b.doorSide === "left") {
      windowStart = doorAlong + doorWidth + WIN_DOOR_GAP;
      windowEnd = seWallLen - WIN_WALL_MARGIN;
    } else {
      windowStart = WIN_WALL_MARGIN;
      windowEnd = doorAlong - WIN_DOOR_GAP;
    }
    const windowZone = windowEnd - windowStart;

    const door = texSize(`door-${b.doorTexture}`);
    const winIdx = b.windowTexture;
    const win = texSize(`window-${winIdx}`);

    let winCount = 0;
    let winScale = 0;
    let winRenderedW = 0;
    let winRenderedH = 0;

    if (win.w > 0 && windowZone >= WIN_MIN_ZONE) {
      const singleW = win.w * WIN_MAX_SCALE;
      winCount = Math.max(1, Math.floor((windowZone + WIN_GAP) / (singleW + WIN_GAP)));
      const perWinWidth = (windowZone - WIN_GAP * (winCount - 1)) / winCount;
      winScale = Math.min(WIN_MAX_SCALE, perWinWidth / win.w);
      winRenderedW = Math.round(win.w * winScale);
      winRenderedH = Math.round(win.h * winScale);
    }

    const winDoorRatio = door.h > 0 ? winRenderedH / door.h : 0;

    metrics.push({
      index: idx,
      colSpan: b.colEnd - b.colStart,
      rowSpan: b.rowEnd - b.rowStart,
      stories: b.stories,
      wallHeight,
      seWallLen: Math.round(seWallLen),
      doorSide: b.doorSide,
      doorInset: b.doorInset,
      doorAlong: Math.round(doorAlong),
      doorTexture: b.doorTexture,
      doorTexW: door.w,
      doorTexH: door.h,
      windowTexture: winIdx,
      windowZone: Math.round(windowZone),
      winCount,
      winTexW: win.w,
      winTexH: win.h,
      winScale: Math.round(winScale * 100) / 100,
      winRenderedW,
      winRenderedH,
      winDoorRatio: Math.round(winDoorRatio * 100) / 100,
    });
  }

  return metrics;
}
