/**
 * CLI tool to dump building rendering metrics.
 * Uses the actual game's building generation + metrics code — no duplicated logic.
 *
 * Usage:
 *   npx tsx scripts/measure_buildings.ts
 *   npx tsx scripts/measure_buildings.ts --json
 *   npx tsx scripts/measure_buildings.ts --summary
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { COL_PERIOD, ROW_PERIOD, BLOCK_INTERIOR } from "../src/iso/CityLayout";
import { Building, BUILDING_PALETTE } from "../src/rendering/BuildingTypes";
import { computeBuildingMetrics, BuildingMetrics } from "../src/rendering/BuildingMetrics";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Constants matching GameScene ──────────────────────────────────────────────

const MAP_COLS = 108;
const MAP_ROWS = 168;

const ASSETS_DIR = path.join(__dirname, "..", "public", "assets", "sprites");

// ── Hash (exact copy of GameScene.hash) ──────────────────────────────────────

function gameHash(a: number, b: number, salt = 0): number {
  let h = Math.imul(1, a * 374761393 + b * 668265263 + salt) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0x100000000;
}

// ── splitBlockDepth (exact copy) ─────────────────────────────────────────────

function splitBlockDepth(total: number, bCol: number, bRow: number): number[] {
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
    const depth = minDepth + Math.floor(gameHash(bCol * 100 + i, bRow, 99) * (maxDepth - minDepth + 1));
    depths.push(depth);
    remaining -= depth;
    i++;
  }
  return depths;
}

// ── Generate buildings (exact copy of GameScene.generateBuildings) ────────────

function generateBuildings(): Building[] {
  const buildings: Building[] = [];
  const numBlockCols = Math.floor(MAP_COLS / COL_PERIOD);
  const numBlockRows = Math.floor(MAP_ROWS / ROW_PERIOD);

  for (let bRow = 0; bRow < numBlockRows; bRow++) {
    for (let bCol = 0; bCol < numBlockCols; bCol++) {
      const baseCol = bCol * COL_PERIOD + BLOCK_INTERIOR.colStart;
      const colEnd = bCol * COL_PERIOD + BLOCK_INTERIOR.colEnd;
      const baseRow = bRow * ROW_PERIOD + BLOCK_INTERIOR.rowStart;

      const depths = splitBlockDepth(BLOCK_INTERIOR.rows, bCol, bRow);
      let rowOffset = 0;

      for (let i = 0; i < depths.length; i++) {
        const depth = depths[i];
        const rowStart = baseRow + rowOffset;
        const rowEnd = Math.min(baseRow + rowOffset + depth - 1, MAP_ROWS - 1);
        const h = (s: number) => gameHash(baseCol, rowStart, s);

        buildings.push({
          colStart: baseCol,
          colEnd,
          rowStart,
          rowEnd,
          stories: 2 + Math.floor(h(1) * 3),
          color: BUILDING_PALETTE[Math.floor(h(2) * BUILDING_PALETTE.length)],
          texture: Math.floor(h(3) * 6),
          inset: 0.1 + h(4) * 0.3,
          heightOffset: Math.floor(h(5) * 60),
          doorSide: h(6) < 0.5 ? "left" : "right",
          doorInset: 10 + Math.floor(h(7) * 30),
          doorTexture: Math.floor(h(8) * 16),
          windowTexture: Math.floor(h(9) * 14),
        });

        rowOffset += depth;
      }
    }
  }
  return buildings;
}

// ── Texture size reader (PNG IHDR parse, no dependencies) ────────────────────

function texSize(key: string): { w: number; h: number } {
  // key is like "door-3" or "window-2" — map to filename
  const filename = key.replace("-", "_") + ".png";
  const filepath = path.join(ASSETS_DIR, filename);
  try {
    const buf = fs.readFileSync(filepath);
    if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      return { w: 0, h: 0 };
    }
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return { w, h };
  } catch {
    return { w: 0, h: 0 };
  }
}

// ── Output formatting ────────────────────────────────────────────────────────

function printTable(metrics: BuildingMetrics[]) {
  const rows = metrics.map(m => ({
    "#": m.index,
    rows: m.rowSpan,
    st: m.stories,
    seWall: m.seWallLen,
    side: m.doorSide,
    door: `d${m.doorTexture} ${m.doorTexW}x${m.doorTexH}`,
    zone: m.windowZone,
    nWin: m.winCount,
    win: `w${m.windowTexture} ${m.winTexW}x${m.winTexH}`,
    scale: m.winScale,
    rendered: `${m.winRenderedW}x${m.winRenderedH}`,
    "w/d": m.winDoorRatio,
  }));
  console.table(rows);
}

function printSummary(metrics: BuildingMetrics[]) {
  const withWin = metrics.filter(m => m.winCount > 0);
  const ratios = withWin.map(m => m.winDoorRatio);
  const scales = withWin.map(m => m.winScale);
  const zones = withWin.map(m => m.windowZone);
  const counts = withWin.map(m => m.winCount);
  const skipped = metrics.length - withWin.length;

  console.log(`\nTotal buildings: ${metrics.length}`);
  console.log(`  With windows: ${withWin.length}`);
  console.log(`  Skipped (too narrow): ${skipped}`);

  if (ratios.length > 0) {
    const min = (a: number[]) => Math.min(...a);
    const max = (a: number[]) => Math.max(...a);
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

    console.log(`\nWindow zone width:      min=${min(zones)}, max=${max(zones)}, avg=${avg(zones).toFixed(0)}`);
    console.log(`Windows per building:   min=${min(counts)}, max=${max(counts)}, avg=${avg(counts).toFixed(1)}`);
    console.log(`Window scale factor:    min=${min(scales)}, max=${max(scales)}, avg=${avg(scales).toFixed(2)}`);
    console.log(`Window/door height:     min=${min(ratios)}, max=${max(ratios)}, avg=${avg(ratios).toFixed(2)}`);

    // Count distribution
    const countDist: Record<number, number> = {};
    for (const c of counts) countDist[c] = (countDist[c] || 0) + 1;
    console.log(`\nWindow count distribution:`);
    for (const [n, ct] of Object.entries(countDist).sort((a, b) => +a[0] - +b[0])) {
      console.log(`  ${n} windows: ${ct} buildings`);
    }

    const buckets: Record<string, number> = { "<0.5": 0, "0.5-0.8": 0, "0.8-1.0": 0, "1.0-1.5": 0, ">1.5": 0 };
    for (const r of ratios) {
      if (r < 0.5) buckets["<0.5"]++;
      else if (r < 0.8) buckets["0.5-0.8"]++;
      else if (r < 1.0) buckets["0.8-1.0"]++;
      else if (r < 1.5) buckets["1.0-1.5"]++;
      else buckets[">1.5"]++;
    }
    console.log(`\nWin/door height distribution:`);
    for (const [label, count] of Object.entries(buckets)) {
      console.log(`  ${label.padStart(7)}: ${String(count).padStart(2)} ${"#".repeat(count)}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const summaryOnly = args.includes("--summary");

const buildings = generateBuildings();
const metrics = computeBuildingMetrics(buildings, texSize);

if (jsonMode) {
  console.log(JSON.stringify(metrics, null, 2));
} else if (summaryOnly) {
  printSummary(metrics);
} else {
  printTable(metrics);
  printSummary(metrics);
}
