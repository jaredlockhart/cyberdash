// City grid constants and helpers

export const COL_PERIOD = 24;
export const ROW_PERIOD = 40;
export const STREET_WIDTH = 8;
export const STORY_HEIGHT = 128;
export const CURB_HEIGHT = 6;

export const BLOCK_INTERIOR = {
  colStart: 10,
  colEnd: 21,
  cols: 12,
  rowStart: 10,
  rowEnd: 37,
  rows: 28,
} as const;

export enum TileType {
  BUILDING = 0,
  STREET = 1,
  SIDEWALK = 2,
}

/** Column position within a building block (0-11), or -1 if outside */
export function relativeCol(col: number): number {
  const colMod = col % COL_PERIOD;
  if (colMod < BLOCK_INTERIOR.colStart || colMod > BLOCK_INTERIOR.colEnd) return -1;
  return colMod - BLOCK_INTERIOR.colStart;
}

/** Row position within a building block (0-27), or -1 if outside */
export function relativeRow(row: number): number {
  const rowMod = row % ROW_PERIOD;
  if (rowMod < BLOCK_INTERIOR.rowStart || rowMod > BLOCK_INTERIOR.rowEnd) return -1;
  return rowMod - BLOCK_INTERIOR.rowStart;
}
