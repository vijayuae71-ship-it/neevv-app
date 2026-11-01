'use client';

import type { Layout, Room, ProjectRequirements, BOQ, Column, Setbacks, LayoutOpening } from '../types';
import { ASSUMED_FOUNDING_DEPTH_M, PARAPET_HEIGHT_MM, ELEC_KINDS, electricalBreakdown, electricalPoints, fixturesFor, fixtureTotals, isNiche, WALL_EXTERNAL_MM, WALL_INTERNAL_MM } from './quantityRules';
import { computeTakeoff, bathWallTileSqM, kitchenCounterRmt, KITCHEN_DADO_HEIGHT_M, type Takeoff } from './quantityTakeoff';

/**
 * Deterministic, millimetre-based construction drawings. All model coordinates are
 * millimetres; conversions from Layout metres take place in makeGeometry only.
 * Canvas coordinates are pixels. No image service, random data or persisted state.
 *
 * IMPORTANT: OpeningsSchedule has room/wall/size but no offset along the wall.
 * The same deterministic centring/spacing resolver is used by every view. The
 * output is preliminary until real surveyed door/window offsets are supplied.
 *
 * Structural output contains analysis-member sizes but no signed reinforcement
 * shop drawings. The details therefore distinguish checked member quantities
 * from typical unapproved schematics. Footing founding depth, sump capacity,
 * STP process sizing, waterproofing products and reinforcement anchorage all
 * require field/site inputs before a drawing can be issued for construction.
 * Every sheet carries the professional-verification disclaimer explicitly.
 */
const SHEET_W = 2100;
const SHEET_H = 1485;
const MARGIN = 60;
const TITLE_H = 200;
const DRAW_BOTTOM = SHEET_H - TITLE_H - MARGIN;
const DRAW_W = SHEET_W - 2 * MARGIN;
const DRAW_H = DRAW_BOTTOM - MARGIN;
const COLORS = {
  wall: '#333333', dim: '#666666', grid: '#888888', hatch: '#aaaaaa',
  column: '#555555', text: '#333333', green: '#4f6f52',
  pale: '#eeeeee', concrete: '#e6e9e7', earth: '#f2efe9', water: '#d9edf2',
};
type Point = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };
type Axis = 'horizontal' | 'vertical';
type Data = Record<string, unknown>;
type Level = 0 | 1;
type DrawingType = 'excavation' | 'column_layout' | 'footing_detail' | 'beam_slab' |
  'column_detail' | 'bar_bending' | 'section_aa' | 'front_elevation' |
  'staircase_detail' | 'water_tank' | 'waterproofing' | 'stp_detail' |
  'electrical' | 'plumbing' | 'tiling_layout' | 'brickwork_detail' |
  'working_plan' | 'door_window_schedule';

/* ── neevv Drafting Standard v1 (IS 962 / SP 46) ──
 * Sheet = A3 landscape (420 × 297 mm) rendered at 5 px per paper-mm.
 * Only preferred scales are used; a view is drawn at the largest preferred scale that fits.
 * Pen weights are paper millimetres × 5. */
const PX_PER_PAPER_MM = 5;
const STD_SCALES = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const PEN = { cut: 3.0, medium: 1.75, thin: 0.9, hair: 0.6 };
const POCHE = { solid: '#8d8d8d', light: '#d3d3d3' };
/** Drafting audit collected while a sheet renders (label boxes, dimension sums, scales). */
export interface DraftingCheck { item: string; status: 'PASS' | 'WARNING' | 'ERROR'; detail: string }
interface AuditState { labels: { x0: number; y0: number; x1: number; y1: number; t: string }[]; checks: DraftingCheck[]; scales: number[] }
let AUDIT: AuditState | null = null;
/** Results of the most recent render per sheet key (`type-floor`), for tests and the validation report. */
export const DRAFTING_AUDIT: Record<string, DraftingCheck[]> = {};

interface Frame { x: number; y: number; s: number; width: number; height: number; }
interface ModelRoom { source: Room; x: number; y: number; w: number; d: number; }
interface ModelColumn { x: number; y: number; w: number; d: number; supplied?: Column; }
interface OpeningPlacement {
  source: LayoutOpening; floor: number; room: ModelRoom;
  // left/right edges are in model coordinates, along the x or y wall axis.
  a: number; b: number; axis: Axis; face: 'front' | 'rear' | 'left' | 'right' | 'internal';
  fixed: number; index: number;
}
interface Geometry {
  plotW: number; plotD: number; building: Bounds; footprint: Bounds;
  setbacks: { front: number; rear: number; left: number; right: number };
  rooms: ModelRoom[][]; architecturalColumns: ModelColumn[][];
  gridX: number[]; gridY: number[]; columns: ModelColumn[];
  openings: OpeningPlacement[]; floors: number;
}
interface Context {
  /** scale denominators of every view drawn on this sheet */
  views: number[];
  type: DrawingType;
  sheetNo: string;
  rev: number;
  c: CanvasRenderingContext2D;
  g: Geometry;
  layout: Layout;
  req: ProjectRequirements;
  data: Data;
  boq: BOQ | null;
  level: Level;
  frame: Frame;
  title: string;
  scale: number;
}
const finite = (n: unknown, fallback: number): number => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
const positive = (n: unknown, fallback: number): number => { const x = finite(n, fallback); return x > 0 ? x : fallback; };
const text = (v: unknown, fallback = ''): string => typeof v === 'string' && v.trim() ? v : fallback;
const obj = (v: unknown): Data => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Data : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const nval = (d: Data, key: string, fallback: number): number => finite(d[key], fallback);
const sval = (d: Data, key: string, fallback: string): string => text(d[key], fallback);
const mm = (metres: number): number => metres * 1000;
const round = (v: number): string => `${Math.round(v)}`;
const unique = (v: number[]): number[] => [...new Set(v.filter(Number.isFinite).map(a => Math.round(a)))].sort((a, b) => a - b);
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const titleFor: Record<DrawingType, string> = {
  excavation: 'EXCAVATION PLAN', column_layout: 'FOUNDATION & COLUMN LAYOUT',
  footing_detail: 'ISOLATED FOOTING DETAIL', beam_slab: 'RCC BEAM & SLAB LAYOUT',
  column_detail: 'COLUMN & REINFORCEMENT DETAIL', bar_bending: 'BAR BENDING SCHEDULE',
  section_aa: 'BUILDING SECTION 1–1', front_elevation: 'FRONT ELEVATION',
  staircase_detail: 'STAIRCASE PLAN & SECTION', water_tank: 'SUMP & OVERHEAD TANK DETAILS',
  waterproofing: 'WATERPROOFING DETAILS', stp_detail: 'STP SCHEMATIC LAYOUT',
  electrical: 'ELECTRICAL LAYOUT', plumbing: 'PLUMBING & DRAINAGE LAYOUT',
  tiling_layout: 'FLOOR & WALL TILING LAYOUT', brickwork_detail: 'MASONRY & LINTEL LAYOUT',
  working_plan: 'WORKING PLAN', door_window_schedule: 'DOOR & WINDOW SCHEDULE',
};

/** Thin, dimensioned CAD-like primitives. Coordinates are canvas pixels. */
export function drawLine(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number,
  weight = 1, color = COLORS.wall): void {
  c.save(); c.strokeStyle = color; c.lineWidth = weight;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
}
export function drawRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  opts: { fill?: string; stroke?: string; weight?: number; dash?: number[] } = {}): void {
  c.save(); if (opts.dash) c.setLineDash(opts.dash);
  if (opts.fill) { c.fillStyle = opts.fill; c.fillRect(x, y, w, h); }
  if (opts.stroke) { c.strokeStyle = opts.stroke; c.lineWidth = opts.weight ?? 2; c.strokeRect(x, y, w, h); }
  c.restore();
}
export function drawDoubleLineWall(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number,
  thicknessPx: number, weight = 2): void {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 0.01) return;
  const nx = (y1 - y2) * thicknessPx / (2 * length);
  const ny = (x2 - x1) * thicknessPx / (2 * length);
  drawLine(c, x1 + nx, y1 + ny, x2 + nx, y2 + ny, weight);
  drawLine(c, x1 - nx, y1 - ny, x2 - nx, y2 - ny, weight);
}
function label(c: CanvasRenderingContext2D, value: string, x: number, y: number, size = 17,
  align: CanvasTextAlign = 'left', color = COLORS.text, bold = false): void {
  c.save(); c.fillStyle = color; c.font = `${bold ? '700 ' : ''}${size}px Arial, sans-serif`;
  c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
  if (AUDIT && value.trim()) {
    const w = c.measureText(value).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const m = c.getTransform();
    const pts = [[x0, y - size * 0.42], [x0 + w, y - size * 0.42], [x0, y + size * 0.42], [x0 + w, y + size * 0.42]]
      .map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
    AUDIT.labels.push({ x0: Math.min(...pts.map(q => q[0])), x1: Math.max(...pts.map(q => q[0])), y0: Math.min(...pts.map(q => q[1])), y1: Math.max(...pts.map(q => q[1])), t: value });
  }
  c.restore();
}
function multiline(c: CanvasRenderingContext2D, lines: string[], x: number, y: number, size = 17, step = 26): void {
  lines.forEach((s, i) => label(c, s, x, y + i * step, size));
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, radius: number,
  fill = '#fff', stroke = COLORS.wall, weight = 1): void {
  c.save(); c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = weight; c.stroke(); c.restore();
}
function arrow(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number,
  color = COLORS.wall, head = 11): void {
  drawLine(c, x1, y1, x2, y2, 1.3, color);
  const a = Math.atan2(y2 - y1, x2 - x1);
  drawLine(c, x2, y2, x2 - head * Math.cos(a - 0.43), y2 - head * Math.sin(a - 0.43), 1.3, color);
  drawLine(c, x2, y2, x2 - head * Math.cos(a + 0.43), y2 - head * Math.sin(a + 0.43), 1.3, color);
}
/** 90-degree leaf and arc; wall: horizontal or vertical, swing: positive/negative side. */
export function drawDoor(c: CanvasRenderingContext2D, x: number, y: number, width: number,
  wall: Axis, swing: 1 | -1 = 1): void {
  if (width <= 0) return;
  c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = 1.2;
  if (wall === 'horizontal') {
    drawLine(c, x, y, x, y + swing * width, 1.6);
    c.beginPath();
    c.arc(x, y, width, swing > 0 ? 0 : -Math.PI / 2, swing > 0 ? Math.PI / 2 : 0, swing < 0);
    c.stroke();
    circle(c, x, y, 2.5, COLORS.wall, COLORS.wall);
  } else {
    drawLine(c, x, y, x + swing * width, y, 1.6);
    c.beginPath();
    c.arc(x, y, width, swing > 0 ? 0 : Math.PI / 2, swing > 0 ? Math.PI / 2 : Math.PI, false);
    c.stroke();
    circle(c, x, y, 2.5, COLORS.wall, COLORS.wall);
  }
  c.restore();
}
/** Window opening: continuous double glazing lines and end jambs. */
export function drawWindow(c: CanvasRenderingContext2D, x: number, y: number, width: number,
  wall: Axis): void {
  if (wall === 'horizontal') {
    drawLine(c, x, y - 4, x + width, y - 4, 1.2);
    drawLine(c, x, y + 4, x + width, y + 4, 1.2);
    drawLine(c, x, y - 9, x, y + 9, 1);
    drawLine(c, x + width, y - 9, x + width, y + 9, 1);
  } else {
    drawLine(c, x - 4, y, x - 4, y + width, 1.2);
    drawLine(c, x + 4, y, x + 4, y + width, 1.2);
    drawLine(c, x - 9, y, x + 9, y, 1);
    drawLine(c, x - 9, y + width, x + 9, y + width, 1);
  }
}
/** Dimension chain: points are pixel positions, scaleFactor is px/mm. */
export function drawDimensionChain(c: CanvasRenderingContext2D, points: number[], baseline: number,
  offset: number, direction: Axis, scaleFactor: number): void {
  // Do not round canvas coordinates: rounding before converting back into mm
  // introduces 5–20 mm errors in dimension labels at small plot scales.
  const p = points.filter(Number.isFinite).sort((a, b) => a - b)
    .filter((v, i, all) => i === 0 || v - all[i - 1] > 0.2);
  if (p.length < 2) return;
  const coord = baseline + offset; const horizontal = direction === 'horizontal';
  const xy = (along: number, across: number): Point => horizontal ? { x: along, y: across } : { x: across, y: along };
  p.forEach(v => {
    const a = xy(v, baseline + Math.sign(offset || 1) * 8);
    const b = xy(v, coord + Math.sign(offset || 1) * 13);
    drawLine(c, a.x, a.y, b.x, b.y, 0.5, COLORS.dim);
  });
  let a = xy(p[0], coord), b = xy(p[p.length - 1], coord);
  drawLine(c, a.x, a.y, b.x, b.y, 0.5, COLORS.dim);
  p.forEach(v => {
    const a1 = xy(v - 5, coord + 5), b1 = xy(v + 5, coord - 5);
    drawLine(c, a1.x, a1.y, b1.x, b1.y, 0.8, COLORS.dim);
  });
  for (let i = 1; i < p.length; i++) {
    const dim = round((p[i] - p[i - 1]) / Math.max(scaleFactor, 1e-9));
    const center = (p[i] + p[i - 1]) / 2;
    if (horizontal) label(c, dim, center, coord - 13, 14, 'center', COLORS.dim);
    else {
      c.save(); c.translate(coord - 12, center); c.rotate(-Math.PI / 2);
      label(c, dim, 0, 0, 14, 'center', COLORS.dim); c.restore();
    }
  }
}
/** Clipped diagonal hatch; independent of other geometry. */
export function drawHatch(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  angle = 45, spacing = 12): void {
  if (w <= 0 || h <= 0) return;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const radians = angle * Math.PI / 180;
  const cs = Math.cos(radians), sn = Math.sin(radians);
  const diagonal = Math.hypot(w, h) + spacing * 2;
  const cx = x + w / 2, cy = y + h / 2;
  for (let t = -diagonal; t <= diagonal; t += Math.max(4, spacing)) {
    const sx = cx + t * -sn, sy = cy + t * cs;
    drawLine(c, sx - diagonal * cs, sy - diagonal * sn,
      sx + diagonal * cs, sy + diagonal * sn, 0.3, COLORS.hatch);
  }
  c.restore();
}
export function drawColumnSymbol(c: CanvasRenderingContext2D, x: number, y: number, wPx: number, dPx: number): void {
  drawRect(c, x - wPx / 2, y - dPx / 2, wPx, dPx,
    { fill: COLORS.column, stroke: COLORS.wall, weight: 1 });
}
export function drawNorthArrow(c: CanvasRenderingContext2D, x: number, y: number,
  facing: ProjectRequirements['facing']): void {
  // On a plan, the frontage is at the bottom. North follows the given road/front orientation.
  const a = facing === 'North' ? Math.PI / 2 : facing === 'South' ? -Math.PI / 2 :
    facing === 'East' ? Math.PI : 0;
  const dx = Math.cos(a) * 50, dy = Math.sin(a) * 50;
  arrow(c, x - dx * 0.6, y - dy * 0.6, x + dx, y + dy, COLORS.green, 17);
  label(c, 'N', x + dx * 1.3, y + dy * 1.3, 23, 'center', COLORS.green, true);
}
export function drawScaleBar(c: CanvasRenderingContext2D, x: number, y: number, scaleFactor: number): void {
  const unit = 1000 * scaleFactor;
  if (unit > 250 || unit < 5) return;
  for (let i = 0; i < 5; i++) drawRect(c, x + i * unit, y, unit, 12,
    { fill: i % 2 ? '#fff' : COLORS.wall, stroke: COLORS.wall, weight: 0.8 });
  for (let i = 0; i <= 5; i++) label(c, `${i * 1000}`, x + i * unit, y + 28, 12, 'center');
  label(c, 'mm', x + 5 * unit + 13, y + 28, 12);
}
function gridLetter(i: number): string {
  let n = i + 1; let result = '';
  while (n > 0) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); }
  return result;
}
export function drawGridLabels(c: CanvasRenderingContext2D, xPositions: number[], yPositions: number[],
  originX: number, originY: number): void {
  xPositions.forEach((x, i) => {
    drawLine(c, x, originY - 5, x, originY + 34, 1, COLORS.grid);
    circle(c, x, originY - 28, 17, '#fff', COLORS.grid);
    label(c, gridLetter(i), x, originY - 28, 14, 'center');
  });
  yPositions.forEach((y, i) => {
    drawLine(c, originX - 5, y, originX + 34, y, 1, COLORS.grid);
    circle(c, originX - 28, y, 17, '#fff', COLORS.grid);
    label(c, `${i + 1}`, originX - 28, y, 14, 'center');
  });
}
function hatchBox(c: CanvasRenderingContext2D, b: Bounds, fill = COLORS.concrete,
  angle = 45, spacing = 10, weight = 2): void {
  drawRect(c, b.x, b.y, b.w, b.h, { fill, stroke: COLORS.wall, weight });
  drawHatch(c, b.x, b.y, b.w, b.h, angle, spacing);
}
function hatchPolygon(c: CanvasRenderingContext2D, points: Point[], color = COLORS.concrete): void {
  if (points.length < 3) return;
  c.save(); c.beginPath(); c.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => c.lineTo(p.x, p.y)); c.closePath();
  c.fillStyle = color; c.fill(); c.lineWidth = 1.5; c.strokeStyle = COLORS.wall; c.stroke();
  c.clip();
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  drawHatch(c, x, y, Math.max(...xs) - x, Math.max(...ys) - y, 45, 11);
  c.restore();
}
function dashed(c: CanvasRenderingContext2D, a: Point, b: Point,
  color = COLORS.grid, weight = 1, pattern = [10, 7]): void {
  c.save(); c.setLineDash(pattern); drawLine(c, a.x, a.y, b.x, b.y, weight, color); c.restore();
}
function ring(c: CanvasRenderingContext2D, r: Bounds, color = COLORS.grid): void {
  drawRect(c, r.x, r.y, r.w, r.h, { stroke: color, weight: 1, dash: [8, 5] });
}
function note(c: CanvasRenderingContext2D, textValue: string, x: number, y: number,
  toX: number, toY: number, size = 15): void {
  label(c, textValue, x, y, size);
  arrow(c, x + Math.min(140, textValue.length * size * 0.4), y + 4, toX, toY, COLORS.dim, 7);
}
function legend(c: CanvasRenderingContext2D, x: number, y: number, title: string, entries: string[]): void {
  label(c, title, x, y, 19, 'left', COLORS.green, true);
  entries.forEach((v, i) => label(c, v, x, y + 30 + i * 24, 15));
}

/* Geometry creation: exactly one source for plans and derived sections/elevations. */
function makeGeometry(layout: Layout, req: ProjectRequirements, data: Data): Geometry {
  const plotW = positive(mm(layout.plotWidthM), positive(req.plotWidthFt, 30) * 304.8);
  const plotD = positive(mm(layout.plotDepthM), positive(req.plotDepthFt, 40) * 304.8);
  const setback: Setbacks = layout.setbacks ?? { front: 0, rear: 0, left: 0, right: 0 };
  const setbacks = {
    front: Math.max(0, mm(finite(setback.front, 0))), rear: Math.max(0, mm(finite(setback.rear, 0))),
    left: Math.max(0, mm(finite(setback.left, 0))), right: Math.max(0, mm(finite(setback.right, 0))),
  };
  const buildW = positive(layout.buildingWidthMm,
    positive(mm(layout.buildableWidthM), Math.max(1000, plotW - setbacks.left - setbacks.right)));
  const buildD = positive(layout.buildingDepthMm,
    positive(mm(layout.buildableDepthM), Math.max(1000, plotD - setbacks.front - setbacks.rear)));
  const rooms: ModelRoom[][] = (layout.floors ?? []).map(f => (f.rooms ?? [])
    .filter(r => r && r.width > 0 && r.depth > 0)
    .map(source => ({ source, x: mm(source.x), y: mm(source.y), w: mm(source.width), d: mm(source.depth) })));
  const allRooms = rooms.flat();
  // Room coordinates in the generator are often local to the building, but can also
  // be absolute plot coordinates. Preserve the room coordinate system and place the
  // plot relative to the building instead of rebasing one view independently.
  const minX = allRooms.length ? Math.min(...allRooms.map(r => r.x)) : 0;
  const minY = allRooms.length ? Math.min(...allRooms.map(r => r.y)) : 0;
  const maxX = allRooms.length ? Math.max(...allRooms.map(r => r.x + r.w)) : minX + buildW;
  const maxY = allRooms.length ? Math.max(...allRooms.map(r => r.y + r.d)) : minY + buildD;
  const bW = Math.max(buildW, maxX - minX);
  const bD = Math.max(buildD, maxY - minY);
  const building = { x: minX, y: minY, w: bW, h: bD };
  const footprint = {
    x: minX - setbacks.left, y: minY - setbacks.front,
    w: Math.max(plotW, bW + setbacks.left + setbacks.right),
    h: Math.max(plotD, bD + setbacks.front + setbacks.rear),
  };
  const architecturalColumns: ModelColumn[][] = (layout.floors ?? []).map(f =>
    (f.columns ?? []).map(supplied => ({ x: mm(supplied.x), y: mm(supplied.y),
      w: positive(supplied.widthMM, 300), d: positive(supplied.depthMM, 300), supplied })));
  const structuralColumns = list(data.columns).map(obj).filter(v => nval(v, 'floor', 0) === 0 &&
    typeof v.x === 'number' && typeof v.y === 'number').map(v => ({
    x: mm(nval(v, 'x', 0)), y: mm(nval(v, 'y', 0)),
    w: positive(v.widthMm, 300), d: positive(v.depthMm, 300),
  }));
  const suppliedGrid = obj(data.grid);
  const usableX = unique(list(suppliedGrid.xPositions).map(v => finite(v, NaN)));
  const usableY = unique(list(suppliedGrid.yPositions).map(v => finite(v, NaN)));
  // The preliminary structural engine makes a rational <=5 m grid, not the
  // room-corner architectural grid. Prefer its designed column coordinates.
  function generatedGrid(start: number, length: number): number[] {
    const steps = Math.max(1, Math.ceil(length / 5000));
    return Array.from({ length: steps + 1 }, (_, i) => Math.round(start + length * i / steps));
  }
  const gridX = usableX.length > 1 ? usableX : structuralColumns.length > 1 ?
    unique(structuralColumns.map(c => c.x)) : generatedGrid(building.x, building.w);
  const gridY = usableY.length > 1 ? usableY : structuralColumns.length > 1 ?
    unique(structuralColumns.map(c => c.y)) : generatedGrid(building.y, building.h);
  const columns = structuralColumns.length ? structuralColumns : gridX.flatMap(x => gridY.map(y => ({ x, y, w: 300, d: 300 })));
  const floors = Math.max(1, Math.floor(positive(layout.numFloors, Math.max(1, layout.floors?.length ?? 0))));
  const geometry: Geometry = { plotW, plotD, building, footprint, setbacks, rooms,
    architecturalColumns, gridX, gridY, columns, openings: [], floors };
  geometry.openings = resolveOpenings(geometry, layout.openingsSchedule?.openings ?? []);
  return geometry;
}
function normalizeName(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function resolveOpenings(g: Geometry, entries: LayoutOpening[]): OpeningPlacement[] {
  const result: OpeningPlacement[] = [];
  for (let floor = 0; floor < g.floors; floor++) {
    const rooms = g.rooms[floor] ?? g.rooms[0] ?? [];
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (!entry || !['door', 'window', 'ventilator'].includes(entry.type)) continue;
      if (typeof entry.floor === 'number' && entry.floor !== floor) continue;
      // Planner openings carry the exact room, side and position — no distribution guesswork.
      if (typeof entry.floor === 'number' && entry.face && typeof entry.positionMm === 'number') {
        const room = rooms.find(r => r.source.id === entry.roomId) ?? rooms.find(r => normalizeName(r.source.name) === normalizeName(entry.room));
        if (!room) continue;
        const face = entry.face;
        const axis: Axis = face === 'left' || face === 'right' ? 'vertical' : 'horizontal';
        const fixed = face === 'rear' ? room.y + room.d : face === 'left' ? room.x : face === 'right' ? room.x + room.w : room.y;
        const start = axis === 'horizontal' ? room.x : room.y;
        const span = positive(entry.widthMm, entry.type === 'door' ? 900 : 1200);
        const center = start + entry.positionMm;
        result.push({ source: entry, floor, room, a: center - span / 2, b: center + span / 2, axis, fixed, face: entry.wall === 'internal' ? 'internal' : face, index: result.length });
        continue;
      }
      const key = normalizeName(entry.room);
      const room = rooms.find(r => normalizeName(r.source.name) === key || normalizeName(r.source.id) === key)
        ?? rooms.find(r => normalizeName(r.source.name).includes(key) && key.length > 1);
      if (!room) continue;
      const face = entry.wall;
      const axis: Axis = face === 'left' || face === 'right' ? 'vertical' : 'horizontal';
      const fixed = face === 'rear' ? room.y + room.d : face === 'left' ? room.x :
        face === 'right' ? room.x + room.w : room.y;
      const start = axis === 'horizontal' ? room.x : room.y;
      const length = axis === 'horizontal' ? room.w : room.d;
      // The schedule lacks offsets. Grouped entries are distributed, symmetrically,
      // on the SAME room wall across all projections. No fresh random placement.
      const group = entries.filter(e => normalizeName(e.room) === key && e.wall === face && e.type === entry.type);
      const occurrence = counts.get(`${key}|${face}|${entry.type}`) ?? 0;
      counts.set(`${key}|${face}|${entry.type}`, occurrence + 1);
      const earlier = group.slice(0, occurrence).reduce((s, e) => s + Math.max(1, Math.floor(finite(e.quantity, 1))), 0);
      const total = group.reduce((s, e) => s + Math.max(1, Math.floor(finite(e.quantity, 1))), 0);
      for (let i = 0; i < Math.max(1, Math.floor(finite(entry.quantity, 1))); i++) {
        const span = Math.min(positive(entry.widthMm, entry.type === 'door' ? 900 : 1200), Math.max(150, length / (total + 0.25)));
        const center = start + length * (earlier + i + 1) / (total + 1);
        result.push({ source: entry, floor, room, a: center - span / 2, b: center + span / 2,
          axis, fixed, face, index: earlier + i });
      }
    }
  }
  return result;
}
function map(frame: Frame, x: number, y: number): Point {
  return { x: frame.x + (x - frame.width) * frame.s, y: frame.y + (y - frame.height) * frame.s };
}
function fit(bounds: Bounds, target: Bounds, pad = 60): Frame {
  const raw = Math.min((target.w - 2 * pad) / Math.max(1, bounds.w),
    (target.h - 2 * pad) / Math.max(1, bounds.h));
  // largest IS 962 preferred scale that fits (never an odd 1:47 / 1:86)
  const den = STD_SCALES.find(d => PX_PER_PAPER_MM / d <= raw + 1e-12) ?? Math.ceil(PX_PER_PAPER_MM / Math.max(raw, 1e-9));
  const s = PX_PER_PAPER_MM / den;
  return { x: target.x + (target.w - bounds.w * s) / 2,
    y: target.y + (target.h - bounds.h * s) / 2, s, width: bounds.x, height: bounds.y };
}
function at(k: Context, x: number, y: number): Point { return map(k.frame, x, y); }
function box(k: Context, b: Bounds): Bounds {
  const p = at(k, b.x, b.y); return { x: p.x, y: p.y, w: b.w * k.frame.s, h: b.h * k.frame.s };
}
function selected(k: Context): ModelRoom[] { return k.g.rooms[k.level] ?? k.g.rooms[0] ?? []; }
function structuralRows(k: Context, key: string): Data[] { return list(k.data[key]).map(obj); }
function footing(k: Context): Data { return structuralRows(k, 'foundations')[0] ?? {}; }
function firstBeam(k: Context): Data { return structuralRows(k, 'beams')[0] ?? {}; }
function firstSlab(k: Context): Data { return structuralRows(k, 'slabs')[0] ?? {}; }
function firstColumn(k: Context): Data { return structuralRows(k, 'columns')[0] ?? {}; }
function stair(k: Context): Data { return obj(k.data.staircase); }
function concrete(k: Context): string { return sval(obj(k.data.parameters), 'concreteGrade', k.boq?.concreteGrade ?? 'M25'); }
function steel(k: Context): string { return sval(obj(k.data.parameters), 'steelGrade', k.boq?.steelGrade ?? 'Fe500D'); }
function extent(): Bounds { return { x: MARGIN, y: MARGIN + 55, w: DRAW_W, h: DRAW_H - 120 }; }
function setFrame(k: Context, geometryBounds: Bounds, target = extent(), pad = 70): void {
  k.frame = fit(geometryBounds, target, pad);
  k.scale = k.frame.s;
  k.views.push(Math.round(PX_PER_PAPER_MM / k.frame.s));
}
function drawPlot(k: Context): void {
  const c = k.c, p = box(k, k.g.footprint), b = box(k, k.g.building);
  drawRect(c, p.x, p.y, p.w, p.h, { stroke: COLORS.wall, weight: 2 });
  drawRect(c, b.x, b.y, b.w, b.h, { stroke: COLORS.grid, dash: [10, 6], weight: 1 });
  label(c, 'PLOT BOUNDARY', p.x + 7, p.y - 12, 14);
  label(c, 'BUILDING LINE', b.x + 5, b.y - 12, 11, 'left', COLORS.grid);
  const s = k.frame.s;
  if (k.g.setbacks.left > 0) drawDimensionChain(c, [p.x, b.x], p.y, -30, 'horizontal', s);
  if (k.g.setbacks.right > 0) drawDimensionChain(c, [b.x + b.w, p.x + p.w], p.y, -30, 'horizontal', s);
  if (k.g.setbacks.front > 0) drawDimensionChain(c, [p.y, b.y], p.x, -38, 'vertical', s);
  if (k.g.setbacks.rear > 0) drawDimensionChain(c, [b.y + b.h, p.y + p.h], p.x, -38, 'vertical', s);
  drawDimensionChain(c, [p.x, p.x + p.w], p.y, -67, 'horizontal', s);
  drawDimensionChain(c, [p.y, p.y + p.h], p.x, -74, 'vertical', s);
  drawNorthArrow(c, p.x + p.w + 120, p.y + p.h - 70, k.req.facing);
}
function grid(k: Context): void {
  const c = k.c, b = k.g.building;
  for (const x of k.g.gridX) {
    const top = at(k, x, b.y - 400), bottom = at(k, x, b.y + b.h + 400);
    dashed(c, top, bottom, COLORS.grid, 1, [13, 5, 2, 5]);
  }
  for (const y of k.g.gridY) {
    const left = at(k, b.x - 400, y), right = at(k, b.x + b.w + 400, y);
    dashed(c, left, right, COLORS.grid, 1, [13, 5, 2, 5]);
  }
  const anchor = at(k, b.x, b.y);
  drawGridLabels(c, k.g.gridX.map(x => at(k, x, 0).x),
    k.g.gridY.map(y => at(k, 0, y).y), anchor.x - 10, anchor.y - 10);
}
function gridDimensions(k: Context): void {
  const b = box(k, k.g.building);
  drawDimensionChain(k.c, k.g.gridX.map(x => at(k, x, 0).x), b.y + b.h, 48, 'horizontal', k.scale);
  drawDimensionChain(k.c, k.g.gridY.map(y => at(k, 0, y).y), b.x + b.w, 48, 'vertical', k.scale);
  drawDimensionChain(k.c, [b.x, b.x + b.w], b.y + b.h, 88, 'horizontal', k.scale);
}
function footingSpec(k: Context, index: number): { w: number; d: number; depth: number; pcc: number } {
  const entries = structuralRows(k, 'foundations'); const f = entries[index] ?? entries[0] ?? {};
  const side = positive(f.footingSizeMm, 1400);
  return { w: positive(f.widthMm, side), d: positive(f.depthMm, side),
    depth: positive(f.footingDepthMm, 450), pcc: positive(f.pccThicknessMm, 150) };
}
function gridSegments(g: Geometry): { a: Point; b: Point }[] {
  const result: { a: Point; b: Point }[] = [];
  for (const y of g.gridY) for (let i = 1; i < g.gridX.length; i++)
    result.push({ a: { x: g.gridX[i - 1], y }, b: { x: g.gridX[i], y } });
  for (const x of g.gridX) for (let i = 1; i < g.gridY.length; i++)
    result.push({ a: { x, y: g.gridY[i - 1] }, b: { x, y: g.gridY[i] } });
  return result;
}
function drawColumns(k: Context): void {
  const bb = k.g.building;
  for (const item of k.g.columns) {
    // edge columns are kept flush with the outer wall face (not projecting outside the building)
    const p = at(k, clamp(item.x, bb.x + item.w / 2, bb.x + bb.w - item.w / 2), clamp(item.y, bb.y + item.d / 2, bb.y + bb.h - item.d / 2));
    drawColumnSymbol(k.c, p.x, p.y, Math.max(5, item.w * k.scale), Math.max(5, item.d * k.scale));
  }
}
function drawPlanRooms(k: Context, light = false, cornerLabels = false): void {
  drawPlanWalls(k, light ? 'light' : 'solid');
  for (const o of k.g.openings.filter(v => v.floor === k.level)) planOpening(k.c, k, o);
  for (const r of selected(k)) if (cornerLabels || r.source.type !== 'staircase') roomLabel(k, r, { corner: cornerLabels });
}
function drawSectionMark(k: Context): void { sectionMarker(k, sectionCutY(k)); }
function openingLegend(k: Context, x: number, y: number): void {
  const counts = k.g.openings.filter(o => o.floor === k.level);
  legend(k.c, x, y, 'OPENINGS / PLAN REFERENCE', [
    `Door instances: ${counts.filter(o => o.source.type === 'door').length}`,
    `Window instances: ${counts.filter(o => o.source.type === 'window').length}`,
    'Offsets centred/distributed — field verify.',
  ]);
}

/* ═════════ Drafting kit (shared by every plan sheet) ═════════ */
/** Finished internal partition as reserved by the planner: 115 mm brick + plaster both faces ≈ 150 mm. */
const WALL_PLAN_INT_MM = 150;
const RAIL_MM = 100;
type PSide = 'front' | 'rear' | 'left' | 'right';
const OPP: Record<PSide, PSide> = { front: 'rear', rear: 'front', left: 'right', right: 'left' };
const INWARD: Record<PSide, number> = { front: 1, rear: -1, left: 1, right: -1 };
function onBuildingEdge(k: Context, r: ModelRoom, side: PSide): boolean {
  const b = k.g.building, e = 40;
  if (side === 'front') return Math.abs(r.y - b.y) < e;
  if (side === 'rear') return Math.abs(r.y + r.d - (b.y + b.h)) < e;
  if (side === 'left') return Math.abs(r.x - b.x) < e;
  return Math.abs(r.x + r.w - (b.x + b.w)) < e;
}
/** Intervals (model mm, along the side) where this side has no wall because the rooms are open to each other. */
function openIntervals(k: Context, r: ModelRoom, side: PSide): [number, number][] {
  if (onBuildingEdge(k, r, side)) return [];
  const own = !!r.source.openTo?.includes(side);
  const out: [number, number][] = [];
  // only public rooms flow into each other without a wall (living ↔ dining ↔ lobby/lounge); bedrooms, baths, kitchen, stair keep walls
  const PUBLIC = ['hall', 'dining', 'passage'];
  if (!PUBLIC.includes(r.source.type)) return out;
  for (const n of selected(k)) {
    if (n === r || isNiche(n.source) || !PUBLIC.includes(n.source.type)) continue;
    if (!own && !n.source.openTo?.includes(OPP[side])) continue;
    const touch = side === 'front' ? Math.abs(n.y + n.d - r.y) < 5 : side === 'rear' ? Math.abs(n.y - (r.y + r.d)) < 5
      : side === 'left' ? Math.abs(n.x + n.w - r.x) < 5 : Math.abs(n.x - (r.x + r.w)) < 5;
    if (!touch) continue;
    const [a0, a1, b0, b1] = side === 'front' || side === 'rear' ? [r.x, r.x + r.w, n.x, n.x + n.w] : [r.y, r.y + r.d, n.y, n.y + n.d];
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
    if (hi - lo > 300) out.push([lo, hi]);
  }
  return out;
}
function sideInset(k: Context, r: ModelRoom, side: PSide): number {
  if (onBuildingEdge(k, r, side)) return r.source.type === 'balcony' ? RAIL_MM : WALL_EXTERNAL_MM;
  const len = side === 'front' || side === 'rear' ? r.w : r.d;
  const open = openIntervals(k, r, side).reduce((s, [a, b]) => s + b - a, 0);
  return open >= len - 10 ? 0 : WALL_PLAN_INT_MM / 2;
}
/** Clear (inside-finish) rectangle of a room, model mm. */
function clearRect(k: Context, r: ModelRoom): Bounds {
  const f = sideInset(k, r, 'front'), re = sideInset(k, r, 'rear'), l = sideInset(k, r, 'left'), ri = sideInset(k, r, 'right');
  return { x: r.x + l, y: r.y + f, w: Math.max(0, r.w - l - ri), h: Math.max(0, r.d - f - re) };
}
/** Cut walls: poché between room clear rectangles, cut-pen outline, open sides left unwalled. */
function drawPlanWalls(k: Context, mode: 'solid' | 'light' | 'brick' = 'solid'): void {
  const c = k.c, rooms = selected(k).filter(r => !isNiche(r.source));
  const B = box(k, k.g.building);
  const fill = mode === 'solid' ? POCHE.solid : mode === 'light' ? POCHE.light : '#e7c4ae';
  const pen = mode === 'light' ? PEN.medium : PEN.cut;
  c.save();
  drawRect(c, B.x, B.y, B.w, B.h, { fill });
  if (mode === 'brick') drawHatch(c, B.x, B.y, B.w, B.h, 45, 7);
  for (const r of rooms) { const q = box(k, clearRect(k, r)); drawRect(c, q.x, q.y, q.w, q.h, { fill: '#fff' }); }
  // open connections: clear the partition band where two rooms are open to each other
  for (const r of rooms) for (const side of ['front', 'rear', 'left', 'right'] as PSide[]) for (const [a, b] of openIntervals(k, r, side)) {
    const h = side === 'front' || side === 'rear';
    const fixed = side === 'front' ? r.y : side === 'rear' ? r.y + r.d : side === 'left' ? r.x : r.x + r.w;
    const t = WALL_PLAN_INT_MM / 2 + 2;
    const q = box(k, h ? { x: a + WALL_PLAN_INT_MM / 2, y: fixed - t, w: b - a - WALL_PLAN_INT_MM, h: 2 * t } : { x: fixed - t, y: a + WALL_PLAN_INT_MM / 2, w: 2 * t, h: b - a - WALL_PLAN_INT_MM });
    drawRect(c, q.x, q.y, q.w, q.h, { fill: '#fff' });
  }
  c.strokeStyle = COLORS.wall; c.lineWidth = pen; c.lineCap = 'square';
  for (const r of rooms) {
    const q = clearRect(k, r);
    const edges: [PSide, number, number, number, boolean][] = [
      ['front', q.y, q.x, q.x + q.w, true], ['rear', q.y + q.h, q.x, q.x + q.w, true],
      ['left', q.x, q.y, q.y + q.h, false], ['right', q.x + q.w, q.y, q.y + q.h, false]];
    for (const [side, fixed, s0, s1, h] of edges) {
      if (r.source.type === 'balcony' && onBuildingEdge(k, r, side)) {
        const o = side === 'front' ? r.y : side === 'rear' ? r.y + r.d : side === 'left' ? r.x : r.x + r.w;
        const p0 = h ? at(k, s0, o) : at(k, o, s0), p1 = h ? at(k, s1, o) : at(k, o, s1);
        drawLine(c, p0.x, p0.y, p1.x, p1.y, PEN.thin);
      }
      // the inside face minus open stretches; wall ends get a stub
      let segs: [number, number][] = [[s0, s1]];
      for (const [a, b] of openIntervals(k, r, side)) {
        const ga = a + WALL_PLAN_INT_MM / 2, gb = b - WALL_PLAN_INT_MM / 2;
        segs = segs.flatMap(([u, v]) => (gb <= u || ga >= v) ? [[u, v] as [number, number]] : [[u, Math.max(u, ga)], [Math.min(v, gb), v]].filter(([x0, x1]) => x1 - x0 > 1) as [number, number][]);
        const o = side === 'front' ? r.y : side === 'rear' ? r.y + r.d : side === 'left' ? r.x : r.x + r.w;
        for (const e of [ga, gb]) if (e > s0 + 5 && e < s1 - 5) {
          const p0 = h ? at(k, e, o - WALL_PLAN_INT_MM / 2) : at(k, o - WALL_PLAN_INT_MM / 2, e);
          const p1 = h ? at(k, e, o + WALL_PLAN_INT_MM / 2) : at(k, o + WALL_PLAN_INT_MM / 2, e);
          c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
        }
      }
      if (sideInset(k, r, side) === 0) continue;
      for (const [u, v] of segs) {
        const p0 = h ? at(k, u, fixed) : at(k, fixed, u), p1 = h ? at(k, v, fixed) : at(k, fixed, v);
        c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
      }
    }
  }
  c.strokeRect(B.x, B.y, B.w, B.h);
  c.restore();
}
/** Across-wall band (model mm) of an opening. */
function openingBand(o: OpeningPlacement): [number, number] {
  if (o.face === 'internal') return [o.fixed - WALL_PLAN_INT_MM / 2, o.fixed + WALL_PLAN_INT_MM / 2];
  return INWARD[o.face] > 0 ? [o.fixed, o.fixed + WALL_EXTERNAL_MM] : [o.fixed - WALL_EXTERNAL_MM, o.fixed];
}
/** Door, window or ventilator cut through the wall band, drawn per SP 46 (jambs, frame, leaf + swing). */
function planOpening(c: CanvasRenderingContext2D, k: Context, o: OpeningPlacement): void {
  const [c0, c1] = openingBand(o), h = o.axis === 'horizontal';
  const P = (along: number, across: number) => h ? at(k, along, across) : at(k, across, along);
  const q0 = P(o.a, c0), q1 = P(o.b, c1);
  const x = Math.min(q0.x, q1.x), y = Math.min(q0.y, q1.y), w = Math.abs(q1.x - q0.x), ht = Math.abs(q1.y - q0.y);
  if (Math.max(w, ht) < 3) return;
  drawRect(c, x - (h ? 0 : 1), y - (h ? 1 : 0), w + (h ? 0 : 2), ht + (h ? 2 : 0), { fill: '#fff' });
  for (const e of [o.a, o.b]) { const p0 = P(e, c0), p1 = P(e, c1); drawLine(c, p0.x, p0.y, p1.x, p1.y, PEN.medium); }
  if (o.source.type === 'door' && /sliding/i.test(o.source.material ?? '')) {
    const m = (c0 + c1) / 2, mid = (o.a + o.b) / 2;
    for (const [u0, u1, v] of [[o.a, mid + 50, m - 25], [mid - 50, o.b, m + 25]] as [number, number, number][]) { const p0 = P(u0, v), p1 = P(u1, v); drawLine(c, p0.x, p0.y, p1.x, p1.y, PEN.medium); }
  } else if (o.source.type === 'door') {
    // hinge on the room-side face, leaf opens into the room the door belongs to
    const roomMid = h ? o.room.y + o.room.d / 2 : o.room.x + o.room.w / 2;
    const into = roomMid > (c0 + c1) / 2 ? 1 : -1;
    const face = into > 0 ? c1 : c0, span = o.b - o.a;
    const hinge = P(o.a, face), tip = P(o.a, face + into * span), end = P(o.b, face);
    drawLine(c, hinge.x, hinge.y, tip.x, tip.y, PEN.medium);
    const r = Math.hypot(tip.x - hinge.x, tip.y - hinge.y);
    const a0 = Math.atan2(tip.y - hinge.y, tip.x - hinge.x), a1 = Math.atan2(end.y - hinge.y, end.x - hinge.x);
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.hair; c.beginPath(); c.arc(hinge.x, hinge.y, r, a0, a0 + d, d < 0); c.stroke(); c.restore();
  } else {
    for (const f of o.source.type === 'ventilator' ? [0.5] : [0.38, 0.62]) {
      const p0 = P(o.a, c0 + (c1 - c0) * f), p1 = P(o.b, c0 + (c1 - c0) * f);
      drawLine(c, p0.x, p0.y, p1.x, p1.y, PEN.thin);
    }
    for (const f of [0, 1]) { const p0 = P(o.a, c0 + (c1 - c0) * f), p1 = P(o.b, c0 + (c1 - c0) * f); drawLine(c, p0.x, p0.y, p1.x, p1.y, PEN.hair); }
  }
}
/* Door / window types: identical size + material share one mark (D1, W2, V1) on every sheet and in the schedule. */
interface OpeningType { mark: string; type: 'door' | 'window' | 'ventilator'; widthMm: number; heightMm: number; sillMm: number; material: string; perFloor: number[]; rooms: Set<string>; main: boolean }
const TYPE_CACHE = new WeakMap<Geometry, { types: OpeningType[]; markOf: Map<OpeningPlacement, string> }>();
function openingTypes(g: Geometry): { types: OpeningType[]; markOf: Map<OpeningPlacement, string> } {
  const hit = TYPE_CACHE.get(g); if (hit) return hit;
  const groups = new Map<string, { t: OpeningType; members: OpeningPlacement[] }>();
  for (const o of g.openings) {
    const s = o.source, wMm = Math.round(o.b - o.a), hMm = Math.round(positive(s.heightMm, s.type === 'door' ? 2100 : 1200));
    const sill = Math.round(finite(s.sillHeightMm, s.type === 'door' ? 0 : 900)), mat = text(s.material, '—');
    const main = !!(s as LayoutOpening & { main?: boolean }).main;
    const key = `${s.type}|${wMm}|${hMm}|${sill}|${mat}|${main}`;
    let gr = groups.get(key);
    if (!gr) { gr = { t: { mark: '', type: s.type, widthMm: wMm, heightMm: hMm, sillMm: sill, material: mat, perFloor: Array(g.floors).fill(0), rooms: new Set(), main }, members: [] }; groups.set(key, gr); }
    gr.t.perFloor[o.floor] = (gr.t.perFloor[o.floor] ?? 0) + 1; gr.t.rooms.add(o.room.source.name); gr.members.push(o);
  }
  const order = { door: 0, window: 1, ventilator: 2 };
  const list2 = [...groups.values()].sort((a, b) => order[a.t.type] - order[b.t.type] || Number(b.t.main) - Number(a.t.main) || b.t.widthMm - a.t.widthMm || b.t.heightMm - a.t.heightMm);
  const n = { door: 0, window: 0, ventilator: 0 }, markOf = new Map<OpeningPlacement, string>();
  for (const gr of list2) { gr.t.mark = `${gr.t.type === 'door' ? 'D' : gr.t.type === 'window' ? 'W' : 'V'}${++n[gr.t.type]}`; for (const m of gr.members) markOf.set(m, gr.t.mark); }
  const out = { types: list2.map(x => x.t), markOf };
  TYPE_CACHE.set(g, out); return out;
}
/** Opening tag: doors tagged inside the room, windows/ventilators outside the wall. */
function openingTag(k: Context, o: OpeningPlacement): void {
  const mark = openingTypes(k.g).markOf.get(o); if (!mark) return;
  const [c0, c1] = openingBand(o), h = o.axis === 'horizontal', mid = (o.a + o.b) / 2;
  let across: number;
  if (o.source.type === 'door') { const roomMid = h ? o.room.y + o.room.d / 2 : o.room.x + o.room.w / 2; across = roomMid > (c0 + c1) / 2 ? c1 + 330 : c0 - 330; }
  else if (o.face !== 'internal') across = INWARD[o.face] > 0 ? c0 - 330 : c1 + 330;
  else across = c1 + 260;
  const along = o.source.type === 'door' ? mid + (o.b - o.a) * 0.18 : mid;
  const p = h ? at(k, along, across) : at(k, across, along);
  const c = k.c;
  if (o.source.type === 'door') { drawRect(c, p.x - 15, p.y - 9, 30, 18, { fill: '#fff', stroke: COLORS.wall, weight: PEN.hair }); }
  else { c.save(); c.beginPath(); c.ellipse(p.x, p.y, 16, 9, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = PEN.hair; c.strokeStyle = COLORS.wall; c.stroke(); c.restore(); }
  label(c, mark, p.x, p.y + 0.5, 11, 'center', COLORS.text, true);
}
/** Room label fitted inside the clear rectangle: NAME / clear size / area (/ FFL). Never crosses a wall. */
function roomLabel(k: Context, r: ModelRoom, opts: { area?: boolean; ffl?: string; corner?: boolean; color?: string } = {}): void {
  if (isNiche(r.source)) return;
  const c = k.c, cr = clearRect(k, r), q = box(k, cr), maxW = q.w - 10;
  if (maxW < 18 || q.h < 14) return;
  const fits = (t: string, size: number, bold = true) => { c.save(); c.font = `${bold ? '700 ' : ''}${size}px Arial, sans-serif`; const w = c.measureText(t).width; c.restore(); return w <= maxW; };
  let name = r.source.name.toUpperCase();
  let size = opts.corner ? 11 : clamp(q.w / 9, 10, 15);
  while (size > 8 && !fits(name, size)) size -= 0.5;
  if (!fits(name, size)) name = name.replace(/\s*\(.*?\)\s*/g, '').replace(/ \/ .*$/, '');
  let lines = [name];
  if (!fits(name, size)) { const words = name.split(' '); const half = Math.ceil(words.length / 2); lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')].filter(Boolean); }
  if (lines.some(l => !fits(l, size))) {
    lines = [lines.join(' ').split(' ')[0]];
    if (!fits(lines[0], size)) { if (AUDIT) AUDIT.checks.push({ item: 'Room label fits room', status: 'WARNING', detail: `${r.source.name}: room too small at this scale; named in schedule` }); return; }
  }
  if (opts.corner) { lines.forEach((l, i) => label(c, l, q.x + 6, q.y + 11 + i * (size + 2), size, 'left', opts.color ?? COLORS.dim, true)); return; }
  const sub: string[] = [];
  const dims = `${round(cr.w)} × ${round(cr.h)}`;
  if (fits(dims, size * 0.8, false)) sub.push(dims);
  if (opts.area) { const a = `${(cr.w * cr.h / 1e6).toFixed(2)} m²`; if (fits(a, size * 0.8, false)) sub.push(a); }
  if (opts.ffl && fits(opts.ffl, size * 0.75, false)) sub.push(opts.ffl);
  const lh = size + 3, sh = size * 0.8 + 3, total = lines.length * lh + sub.length * sh;
  const room = q.h - 8; while (sub.length && lines.length * lh + sub.length * sh > room) sub.pop();
  let y = q.y + q.h / 2 - Math.min(total, room) / 2 + lh / 2;
  for (const l of lines) { label(c, l, q.x + q.w / 2, y, size, 'center', opts.color ?? COLORS.text, true); y += lh; }
  for (const s2 of sub) { label(c, s2, q.x + q.w / 2, y - 1, size * 0.8, 'center', COLORS.dim); y += sh; }
}
/** Dimension string with labels taken from model millimetres, so the parts always add up to the total. */
function dimMm(k: Context, pts: number[], axis: 'x' | 'y', fixedPx: number, offsetPx: number, tier: string): void {
  const p = [...new Set(pts.map(v => Math.round(v)))].sort((a, b) => a - b);
  if (p.length < 2) return;
  const c = k.c, sign = Math.sign(offsetPx) || 1, line = fixedPx + offsetPx;
  const P = (v: number, across: number): Point => axis === 'x' ? { x: at(k, v, 0).x, y: across } : { x: across, y: at(k, 0, v).y };
  const a = P(p[0], line), b = P(p[p.length - 1], line);
  drawLine(c, a.x, a.y, b.x, b.y, PEN.hair, COLORS.dim);
  const parts: number[] = [];
  p.forEach((v, i) => {
    const e0 = P(v, fixedPx + sign * 6), e1 = P(v, line + sign * 7);
    drawLine(c, e0.x, e0.y, e1.x, e1.y, PEN.hair, COLORS.dim);
    const m = P(v, line); drawLine(c, m.x - 4, m.y + 4, m.x + 4, m.y - 4, PEN.medium, COLORS.wall);
    if (i === 0) return;
    const d = v - p[i - 1]; parts.push(d);
    const mid = P((v + p[i - 1]) / 2, line), span = axis === 'x' ? at(k, v, 0).x - at(k, p[i - 1], 0).x : at(k, 0, v).y - at(k, 0, p[i - 1]).y;
    const size = 11, txt = `${d}`;
    const off = span < txt.length * 6.5 + 4 ? (i % 2 ? -1 : 1) * 12 : 0; // stagger very short parts
    if (axis === 'x') label(c, txt, mid.x, mid.y - 8 + (off < 0 ? -10 : 0), size, 'center', COLORS.text);
    else { c.save(); c.translate(mid.x - 8 + (off < 0 ? -10 : 0), mid.y); c.rotate(-Math.PI / 2); label(c, txt, 0, 0, size, 'center', COLORS.text); c.restore(); }
  });
  if (AUDIT) {
    const sum = parts.reduce((s, v) => s + v, 0), total = p[p.length - 1] - p[0];
    AUDIT.checks.push({ item: `Dimension string adds up (${tier})`, status: sum === total ? 'PASS' : 'ERROR', detail: `${parts.join(' + ')} = ${sum} vs ${total}` });
  }
}
/** Column grid: chain lines through the building, bubbles outside (A, B, C… across the width; 1, 2, 3… along the depth). */
function gridBubbles(k: Context, outPx: number, sides: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'left']): void {
  const c = k.c, b = k.g.building, B = box(k, b);
  const R = 15;
  k.g.gridX.forEach((x, i) => {
    const px = at(k, x, 0).x;
    dashed(c, { x: px, y: B.y - outPx + R }, { x: px, y: B.y + B.h + (sides.includes('bottom') ? outPx - R : 0) }, COLORS.grid, PEN.hair, [16, 4, 3, 4]);
    for (const sd of sides.filter(s2 => s2 === 'top' || s2 === 'bottom')) { const py = sd === 'top' ? B.y - outPx : B.y + B.h + outPx; circle(c, px, py, R, '#fff', COLORS.wall, PEN.thin); label(c, gridLetter(i), px, py, 13, 'center', COLORS.text, true); }
  });
  k.g.gridY.forEach((y, i) => {
    const py = at(k, 0, y).y;
    dashed(c, { x: B.x - outPx + R, y: py }, { x: B.x + B.w + (sides.includes('right') ? outPx - R : 0), y: py }, COLORS.grid, PEN.hair, [16, 4, 3, 4]);
    for (const sd of sides.filter(s2 => s2 === 'left' || s2 === 'right')) { const px = sd === 'left' ? B.x - outPx : B.x + B.w + outPx; circle(c, px, py, R, '#fff', COLORS.wall, PEN.thin); label(c, `${i + 1}`, px, py, 13, 'center', COLORS.text, true); }
  });
}
/** Section cut: thick-thin chain with split bubbles "1 / A-301" and view arrows (never a grid letter). */
function sectionMarker(k: Context, cutY: number, id = '1', ref = sheetNumber('section_aa', 0), outPx?: number): void {
  const c = k.c, b = k.g.building;
  const off = outPx ?? 900 * k.scale;
  const a = { x: at(k, b.x, cutY).x - off, y: at(k, b.x, cutY).y }, e = { x: at(k, b.x + b.w, cutY).x + off, y: a.y };
  c.save(); c.setLineDash([22, 5, 4, 5]); drawLine(c, a.x + 18, a.y, e.x - 18, e.y, PEN.medium, COLORS.wall); c.restore();
  for (const p of [a, e]) {
    circle(c, p.x, p.y, 18, '#fff', COLORS.wall, PEN.medium);
    drawLine(c, p.x - 18, p.y, p.x + 18, p.y, PEN.thin);
    label(c, id, p.x, p.y - 8, 12, 'center', COLORS.text, true);
    label(c, ref, p.x, p.y + 8, 9, 'center', COLORS.text);
    // looking towards the rear
    c.save(); c.fillStyle = COLORS.wall; c.beginPath(); c.moveTo(p.x - 9, p.y + 18); c.lineTo(p.x + 9, p.y + 18); c.lineTo(p.x, p.y + 32); c.fill(); c.restore();
  }
}
/** Section cut line used by plans and the section: through the staircase when there is one. */
function sectionCutY(k: Context): number {
  const st = (k.g.rooms[0] ?? []).find(r => r.source.type === 'staircase');
  return st ? st.y + st.d * 0.3 : k.g.building.y + k.g.building.h / 2;
}
/* Sheet numbering (A architecture, S structure, M masonry, E electrical, P plumbing, F finishes, D details). */
const SHEET_BASE: Record<DrawingType, string> = {
  working_plan: 'A-101', front_elevation: 'A-201', section_aa: 'A-301', door_window_schedule: 'A-401', staircase_detail: 'A-501',
  excavation: 'S-101', column_layout: 'S-102', footing_detail: 'S-103', beam_slab: 'S-104', column_detail: 'S-105', bar_bending: 'S-106',
  brickwork_detail: 'M-101', electrical: 'E-101', plumbing: 'P-101', water_tank: 'P-201', stp_detail: 'P-202',
  tiling_layout: 'F-101', waterproofing: 'D-101',
};
const PER_FLOOR: DrawingType[] = ['working_plan', 'brickwork_detail', 'electrical', 'plumbing', 'tiling_layout'];
export function sheetNumber(type: string, level: number): string {
  const base = SHEET_BASE[type as DrawingType] ?? 'X-000';
  if (level > 0 && PER_FLOOR.includes(type as DrawingType)) return base.slice(0, -1) + String(Number(base.slice(-1)) + level);
  return base;
}
/** The complete sheet list of a set, in issue order. */
export function sheetIndex(floors: number): { type: string; level: number; no: string; title: string }[] {
  const out: { type: string; level: number; no: string; title: string }[] = [];
  for (const t of Object.keys(SHEET_BASE) as DrawingType[]) {
    const levels = PER_FLOOR.includes(t) ? Array.from({ length: Math.min(2, Math.max(1, floors)) }, (_, i) => i) : [0];
    for (const l of levels) out.push({ type: t, level: l, no: sheetNumber(t, l), title: titleFor[t] });
  }
  const pre = 'ASMEPFD';
  return out.sort((a, b) => pre.indexOf(a.no[0]) - pre.indexOf(b.no[0]) || a.no.localeCompare(b.no));
}
function scaleText(k: Context): string {
  const u = [...new Set(k.views)];
  return u.length === 0 ? 'NTS' : u.length === 1 ? `1:${u[0]}` : 'AS SHOWN';
}
function viewTitle(k: Context, title: string, x: number, y: number): void {
  const den = k.views[k.views.length - 1];
  label(k.c, title, x, y, 17, 'left', COLORS.text, true);
  const w = title.length * 9.5;
  drawLine(k.c, x, y + 13, x + w, y + 13, PEN.medium); drawLine(k.c, x, y + 17, x + w, y + 17, PEN.hair);
  if (den) label(k.c, `SCALE 1:${den}`, x, y + 32, 12, 'left', COLORS.dim);
}

/** Dimension tiers outside a plan: openings → wall faces → overall (front & left), wall faces → overall (rear & right). Returns the outer offset used. */
function planDimensions(k: Context, full: boolean, gap = 34): number {
  const b = k.g.building, B = box(k, b), rooms = selected(k).filter(r => !isNiche(r.source));
  const ops = k.g.openings.filter(o => o.floor === k.level && o.face !== 'internal');
  const faces: { side: PSide; axis: 'x' | 'y'; fixedPx: number; sign: number }[] = [
    { side: 'front', axis: 'x', fixedPx: B.y, sign: -1 }, { side: 'left', axis: 'y', fixedPx: B.x, sign: -1 },
    { side: 'rear', axis: 'x', fixedPx: B.y + B.h, sign: 1 }, { side: 'right', axis: 'y', fixedPx: B.x + B.w, sign: 1 }];
  let used = 0;
  for (const f of faces) {
    const lo = f.axis === 'x' ? b.x : b.y, hi = f.axis === 'x' ? b.x + b.w : b.y + b.h;
    // Tier 1 is reserved on every face: opening chain (front/left) or opening tags (rear/right).
    let tier = 1;
    if (full && (f.side === 'rear' || f.side === 'right') && ops.some(o2 => o2.face === f.side)) tier = 2;
    if (full && (f.side === 'front' || f.side === 'left')) {
      const o = ops.filter(o2 => o2.face === f.side).flatMap(o2 => [o2.a, o2.b]);
      if (o.length) dimMm(k, [lo, ...o, hi], f.axis, f.fixedPx, f.sign * (gap * tier++ + 22), `${f.side} openings`);
    }
    if (full) {
      const pts = [lo, lo + WALL_EXTERNAL_MM, hi - WALL_EXTERNAL_MM, hi];
      for (const r of rooms.filter(r2 => onBuildingEdge(k, r2, f.side))) {
        const ends: [number, PSide][] = f.axis === 'x' ? [[r.x, 'left'], [r.x + r.w, 'right']] : [[r.y, 'front'], [r.y + r.d, 'rear']];
        for (const [e, sd] of ends) if (e > lo + 1 && e < hi - 1 && sideInset(k, r, sd) > 0) pts.push(e - WALL_PLAN_INT_MM / 2, e + WALL_PLAN_INT_MM / 2);
      }
      dimMm(k, pts, f.axis, f.fixedPx, f.sign * (gap * tier++ + 22), `${f.side} wall faces`);
    }
    dimMm(k, [lo, hi], f.axis, f.fixedPx, f.sign * (gap * tier++ + 22), `${f.side} overall`);
    used = Math.max(used, gap * (tier - 1) + 22);
  }
  return used;
}
/** Dog-leg stair in plan: two flights side by side, landing at the far end, tread lines, UP arrow, riser numbers. */
function stairPlanSymbol(k: Context, r: ModelRoom): void {
  const c = k.c, cr = clearRect(k, r), st = stair(k);
  const alongX = cr.w >= cr.h;
  const L = alongX ? cr.w : cr.h, Wd = alongX ? cr.h : cr.w;
  const risers = Math.max(4, Math.round(positive(st.numRisers, 18))), half = Math.ceil(risers / 2);
  const landing = Math.min(Wd, positive(st.flightWidthMm, 1000)) , fw = (Wd - 100) / 2;
  const treads = half - 1, run = Math.min(L - landing, treads * positive(st.treadMm, 270));
  const P = (u: number, v: number) => alongX ? at(k, cr.x + u, cr.y + v) : at(k, cr.x + v, cr.y + u);
  const ln = (u0: number, v0: number, u1: number, v1: number, w = PEN.thin) => { const a = P(u0, v0), e = P(u1, v1); drawLine(c, a.x, a.y, e.x, e.y, w); };
  const lStart = L - landing;
  ln(lStart, 0, lStart, Wd, PEN.thin);
  ln(lStart - run, fw + 50, lStart, fw + 50, PEN.thin);
  for (let i = 0; i <= treads; i++) { const u = lStart - run + (run * i) / treads; ln(u, 0, u, fw, PEN.hair); ln(u, fw + 100, u, Wd, PEN.hair); }
  ln(lStart - run, fw, lStart, fw, PEN.thin); ln(lStart - run, fw + 100, lStart, fw + 100, PEN.thin);
  // walking line: up flight 1 (near side), across the landing, up flight 2
  const a0 = P(lStart - run + 120, fw / 2), a1 = P(L - landing / 2, fw / 2), a2 = P(L - landing / 2, fw + 100 + fw / 2), a3 = P(lStart - run + 150, fw + 100 + fw / 2);
  c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.thin; c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(a1.x, a1.y); c.lineTo(a2.x, a2.y); c.stroke(); c.restore();
  arrow(c, a2.x, a2.y, a3.x, a3.y, COLORS.wall, 9);
  circle(c, a0.x, a0.y, 3, COLORS.wall, COLORS.wall);
  const tag = P(lStart - run - 60 > 0 ? (lStart - run) / 2 : lStart - run + 200, Wd / 2);
  label(c, k.level === 0 ? 'UP' : 'UP / DN', tag.x, tag.y, 11, 'center', COLORS.text, true);
}
/** Plan sheet frame: largest preferred scale that leaves room for the dimension tiers (more on the front/left). */
function planFrame(k: Context): void {
  const b = k.g.building, T = 236, L = 236, R = 140, Bm = 140, X0 = 60, Y0 = 106, W = 1340, Hh = 1150;
  const den = STD_SCALES.find(d => b.w * PX_PER_PAPER_MM / d + L + R <= W && b.h * PX_PER_PAPER_MM / d + T + Bm <= Hh) ?? 500;
  const s2 = PX_PER_PAPER_MM / den;
  const sx = (W - (b.w * s2 + L + R)) / 2, sy = (Hh - (b.h * s2 + T + Bm)) / 2;
  k.frame = { x: X0 + L + sx, y: Y0 + T + sy, s: s2, width: b.x, height: b.y };
  k.scale = s2; k.views.push(den);
}
function northAndScale(k: Context, x: number, y: number): void {
  drawNorthArrow(k.c, x + 40, y, k.req.facing);
  drawScaleBar(k.c, x + 110, y - 6, k.scale);
}
/* A-101 / A-102: Working plan — fully dimensioned, tagged, areas, grid, section marker. */
function workingPlan(k: Context): void {
  const c = k.c, b = k.g.building;
  planFrame(k);
  drawPlanWalls(k, 'solid');
  const ops = k.g.openings.filter(o => o.floor === k.level);
  for (const o of ops) planOpening(c, k, o);
  drawColumns(k);
  const ffl = k.level === 0 ? 'FFL +0.450' : `FFL +${(0.45 + 3 * k.level).toFixed(3)}`;
  for (const r of selected(k)) { if (r.source.type === 'staircase') { stairPlanSymbol(k, r); continue; } roomLabel(k, r, { area: true, ffl }); }
  for (const o of ops) openingTag(k, o);
  const out = planDimensions(k, true);
  // grid-to-grid string beyond the overall, then bubbles
  const B = box(k, b);
  dimMm(k, k.g.gridX, 'x', B.y, -(out + 34), 'grid A–' + gridLetter(k.g.gridX.length - 1));
  dimMm(k, k.g.gridY, 'y', B.x, -(out + 34), `grid 1–${k.g.gridY.length}`);
  gridBubbles(k, out + 66, ['top', 'left']);
  sectionMarker(k, sectionCutY(k), '1', sheetNumber('section_aa', 0), out + 40);
  label(c, 'FRONT / ROAD SIDE', B.x + B.w / 2, B.y - out - 100, 12, 'center', COLORS.dim, true);
  viewTitle(k, `${floorName(k)} WORKING PLAN`, 80, 140);
  // room area schedule
  const rooms = selected(k).filter(r => !isNiche(r.source));
  const rows = rooms.map(r => { const cr = clearRect(k, r); return [r.source.name, `${round(cr.w)} × ${round(cr.h)}`, (cr.w * cr.h / 1e6).toFixed(2)]; });
  const carpet = rooms.filter(r => r.source.type !== 'balcony').reduce((s, r) => { const cr = clearRect(k, r); return s + cr.w * cr.h / 1e6; }, 0);
  const balc = rooms.filter(r => r.source.type === 'balcony').reduce((s, r) => s + r.w * r.d / 1e6, 0);
  rows.push(['TOTAL CARPET (excl. balcony)', '', carpet.toFixed(2)]);
  rows.push([`WHOLE FLOOR (built-up ${(b.w * b.h / 1e6 - balc).toFixed(2)} m²)`, `${round(b.w)} × ${round(b.h)}`, '']);
  const y = table(c, 1420, 150, [{ h: 'ROOM', w: 260 }, { h: 'CLEAR SIZE mm', w: 170 }, { h: 'AREA m²', w: 90 }], rows, `ROOM AREA SCHEDULE — ${floorName(k)}`);
  legend(c, 1420, y + 38, 'NOTES', [
    'Dimensions in mm to masonry/finished faces as shown.',
    `External walls ${WALL_EXTERNAL_MM} mm brick; partitions 115 mm`,
    '  brick + plaster (150 mm finished).',
    'D/W/V marks: see door & window schedule ' + sheetNumber('door_window_schedule', 0) + '.',
    `Section 1–1: see ${sheetNumber('section_aa', 0)}. Stair: see ${sheetNumber('staircase_detail', 0)}.`,
    'Grid lines A, B… / 1, 2… match the structural sheets.',
    `${ffl}; NGL ±0.000 (plinth 450 mm).`,
    'Setbacks/FSI are assumptions — confirm locally.',
  ]);
  northAndScale(k, 1420, Math.max(y + 330, 760));
}
/* A-401: Door, window & ventilator schedule with type elevations at 1:50. */
function doorWindowSchedule(k: Context): void {
  const c = k.c, { types } = openingTypes(k.g);
  const nm = { door: 'Door', window: 'Window', ventilator: 'Ventilator' };
  const rows = types.map(t => [t.mark, `${nm[t.type]}${t.main ? ' (main)' : ''}`, `${t.widthMm}`, `${t.heightMm}`, `${t.sillMm}`, `${t.sillMm + t.heightMm}`, t.material,
    ...Array.from({ length: k.g.floors }, (_, i) => `${t.perFloor[i] ?? 0}`), `${t.perFloor.reduce((s, v) => s + v, 0)}`, [...t.rooms].join(', ')]);
  const sum = (ty: OpeningType['type']) => types.filter(t => t.type === ty).reduce((s, t) => s + t.perFloor.reduce((a, v) => a + v, 0), 0);
  const sched = k.layout.openingsSchedule;
  const boqOk = !sched || (sched.totalDoors === sum('door') && sched.totalWindows === sum('window') && sched.totalVentilators === sum('ventilator'));
  rows.push(['TOTAL', '', '', '', '', '', '', ...Array.from({ length: k.g.floors }, () => ''), `${sum('door') + sum('window') + sum('ventilator')}`, `Doors ${sum('door')} • Windows ${sum('window')} • Ventilators ${sum('ventilator')} ${boqOk ? '(= BOQ opening count)' : '(CHECK against BOQ)'}`]);
  if (AUDIT) AUDIT.checks.push({ item: 'Door/window schedule = BOQ counts', status: boqOk ? 'PASS' : 'ERROR', detail: `D ${sum('door')} W ${sum('window')} V ${sum('ventilator')} vs schedule D ${sched?.totalDoors} W ${sched?.totalWindows} V ${sched?.totalVentilators}` });
  const cols = [{ h: 'MARK', w: 60 }, { h: 'TYPE', w: 125 }, { h: 'W mm', w: 65 }, { h: 'H mm', w: 65 }, { h: 'SILL', w: 60 }, { h: 'LINTEL LVL', w: 90 }, { h: 'MATERIAL', w: 330 },
    ...Array.from({ length: k.g.floors }, (_, i) => ({ h: i === 0 ? 'GF' : `F${i}`, w: 45 })), { h: 'TOTAL', w: 60 }, { h: 'LOCATION', w: 720 - 45 * k.g.floors }];
  const yEnd = table(c, 80, 150, cols, rows, 'DOOR, WINDOW & VENTILATOR SCHEDULE', 24);
  // Type elevations at 1:50 (0.1 px per mm on this A3 sheet)
  const den = 50, s = PX_PER_PAPER_MM / den; k.views.push(den);
  let x = 100, rowY = yEnd + 110; const baseOf = (t: OpeningType) => t.sillMm + t.heightMm;
  label(c, 'TYPE ELEVATIONS (viewed from outside)', 80, yEnd + 50, 17, 'left', COLORS.green, true);
  label(c, `SCALE 1:${den}`, 80, yEnd + 72, 12, 'left', COLORS.dim);
  const maxH = Math.max(...types.map(baseOf), 2100) * s;
  for (const t of types) {
    const w = t.widthMm * s, h = t.heightMm * s;
    if (x + w + 70 > 1400) { x = 100; rowY += maxH + 95; }
    if (rowY + maxH > 1240) break;
    const ffl = rowY + maxH, top = ffl - (t.sillMm + t.heightMm) * s;
    drawLine(c, x - 20, ffl, x + w + 20, ffl, PEN.thin, COLORS.dim);
    drawRect(c, x, top, w, h, { fill: '#fff', stroke: COLORS.wall, weight: PEN.medium });
    drawRect(c, x + 4, top + 4, w - 8, h - (t.type === 'door' ? 4 : 8), { stroke: COLORS.wall, weight: PEN.hair });
    if (t.type === 'door') { drawLine(c, x + w - 9, top + h * 0.5, x + w - 9, top + h * 0.56, PEN.medium); if (t.widthMm >= 1000) drawLine(c, x + w / 2, top + 4, x + w / 2, top + h, PEN.hair); }
    else if (t.type === 'window') { drawLine(c, x + w / 2, top + 4, x + w / 2, top + h - 4, PEN.hair); drawLine(c, x - 5, top + h + 3, x + w + 5, top + h + 3, PEN.medium); }
    else for (let yy = top + 8; yy < top + h - 4; yy += 6) drawLine(c, x + 5, yy, x + w - 5, yy, PEN.hair, COLORS.dim);
    drawLine(c, x - 8, top - 6, x + w + 8, top - 6, PEN.thin); // lintel
    label(c, t.mark, x + w / 2, ffl + 18, 14, 'center', COLORS.text, true);
    label(c, `${t.widthMm} × ${t.heightMm}`, x + w / 2, ffl + 36, 11, 'center', COLORS.dim);
    if (t.sillMm > 0) label(c, `sill ${t.sillMm}`, x + w / 2, ffl - t.sillMm * s / 2, 10, 'center', COLORS.dim);
    x += Math.max(w, 90) + 60;
  }
  legend(c, 1440, yEnd + 50, 'NOTES', [
    'Sizes are clear openings in mm; frames fixed in',
    '  the opening. Lintel level = sill + height.',
    'RCC lintels bear 150 mm on each side;',
    '  chajja 450 mm over external windows (see S-sheets).',
    'Glazing, hardware and finishes as per',
    '  customer selection; verify on site.',
    'Marks D/W/V are used on every plan sheet.',
  ]);
}

/* 1. Excavation plan. */
function excavation(k: Context): void {
  setFrame(k, k.g.footprint, { x: 115, y: 140, w: 1450, h: 900 }, 90);
  drawPlot(k); grid(k);
  const c = k.c;
  const trenches: Bounds[] = [];
  for (const [i, col] of k.g.columns.entries()) {
    const spec = footingSpec(k, i);
    const trench = { x: col.x - (spec.w + 600) / 2, y: col.y - (spec.d + 600) / 2,
      w: spec.w + 600, h: spec.d + 600 };
    trenches.push(trench);
    const r = box(k, trench);
    drawRect(c, r.x, r.y, r.w, r.h, { fill: '#f8f5ee', stroke: COLORS.wall, weight: 1.4, dash: [7, 4] });
    const f = box(k, { x: col.x - spec.w / 2, y: col.y - spec.d / 2, w: spec.w, h: spec.d });
    drawRect(c, f.x, f.y, f.w, f.h, { stroke: COLORS.dim, weight: 1 });
    drawColumnSymbol(c, at(k, col.x, col.y).x, at(k, col.x, col.y).y,
      Math.max(5, col.w * k.scale), Math.max(5, col.d * k.scale));
  }
  const beamW = positive(firstBeam(k).widthMm, 230);
  const trenchWidth = beamW + 600;
  for (const segment of gridSegments(k.g)) {
    const p = at(k, segment.a.x, segment.a.y), q = at(k, segment.b.x, segment.b.y);
    // Continuous beam trenches are two parallel excavated cut edges. The
    // central chain line remains visible for the setting-out surveyor.
    const half = trenchWidth * k.scale / 2;
    if (Math.abs(p.y - q.y) < 0.1) {
      dashed(c, { x: p.x, y: p.y - half }, { x: q.x, y: q.y - half }, '#956f4f', 1.1);
      dashed(c, { x: p.x, y: p.y + half }, { x: q.x, y: q.y + half }, '#956f4f', 1.1);
    } else {
      dashed(c, { x: p.x - half, y: p.y }, { x: q.x - half, y: q.y }, '#956f4f', 1.1);
      dashed(c, { x: p.x + half, y: p.y }, { x: q.x + half, y: q.y }, '#956f4f', 1.1);
    }
    dashed(c, p, q, '#956f4f', 0.7, [12, 3, 2, 3]);
  }
  gridDimensions(k);
  const example = trenches[0];
  if (example) {
    const p = box(k, example);
    drawDimensionChain(c, [p.x, p.x + p.w], p.y, -18, 'horizontal', k.scale);
    drawDimensionChain(c, [p.y, p.y + p.h], p.x, -18, 'vertical', k.scale);
  }
  const bm = at(k, k.g.footprint.x, k.g.footprint.y + k.g.footprint.h);
  circle(c, bm.x, bm.y, 7, COLORS.green, COLORS.green);
  label(c, 'BM ±0.000 (VERIFY SURVEY DATUM)', bm.x + 13, bm.y + 24, 14);
  const f = footingSpec(k, 0);
  legend(c, 1600, 250, 'EXCAVATION NOTES', [
    'All dimensions in mm; not for setting out without survey.',
    `Typical footing: ${round(f.w)} × ${round(f.d)} mm`,
    `Working space: 300 mm each side`,
    `Typical trench: ${round(f.w + 600)} × ${round(f.d + 600)} mm`,
    `Beam trench width: ${round(beamW + 600)} mm`,
    `Excavate to underside PCC: verify founding depth`,
    `PCC: ${round(f.pcc)} mm; pad: ${round(f.depth)} mm`,
    'Founding level / shoring subject to geotechnical report.',
  ]);
  // Typical trench cross-section below the note panel. Both footing and
  // working-space dimensions are the very same values shown in the plan.
  const sx = 1680, sy = 760, cs = Math.min(0.21, 265 / Math.max(f.w + 600, 1400));
  const pitW = (f.w + 600) * cs, footingW = f.w * cs;
  const groundY = sy - 105;
  drawLine(c, sx - 45, groundY, sx + pitW + 45, groundY, 1.2);
  drawHatch(c, sx - 42, groundY + 3, 42, 230, 45, 11);
  drawHatch(c, sx + pitW, groundY + 3, 42, 230, 45, 11);
  drawRect(c, sx, groundY, pitW, 224, { stroke: '#956f4f', weight: 1.5 });
  hatchBox(c, { x: sx + 300 * cs, y: groundY + 224 - (f.depth + f.pcc) * cs,
    w: footingW, h: f.depth * cs }, COLORS.concrete, 45, 9);
  hatchBox(c, { x: sx + 280 * cs, y: groundY + 224 - f.pcc * cs,
    w: footingW + 40 * cs, h: f.pcc * cs }, '#d7d7d7', -45, 8);
  drawDimensionChain(c, [sx, sx + 300 * cs, sx + (f.w + 300) * cs, sx + pitW],
    groundY + 226, 42, 'horizontal', cs);
  label(c, 'TYPICAL EXCAVATION SECTION', sx, groundY - 51, 16,
    'left', COLORS.green, true);
  label(c, 'PIT DEPTH SUBJECT TO SBC / SOIL PROFILE', sx - 25, groundY + 309, 13);
  drawScaleBar(c, 180, 1160, k.scale);
}

/* 2. Foundation / column layout. */
function foundationSchedule(k: Context, x: number, y: number): void {
  const c = k.c;
  const cols = k.g.columns;
  const rows = structuralRows(k, 'foundations');
  const widths = [36, 83, 130, 96];
  const offsets = [0, widths[0], widths[0] + widths[1],
    widths[0] + widths[1] + widths[2]];
  const total = widths.reduce((s, v) => s + v, 0);
  label(c, 'FOOTING SET-OUT SCHEDULE', x, y - 23, 17,
    'left', COLORS.green, true);
  drawRect(c, x, y, total, 27, { fill: '#e5eae5', stroke: COLORS.wall, weight: 0.8 });
  ['Mark', 'Grid', 'Pad mm', 'Load kN'].forEach((heading, j) =>
    label(c, heading, x + offsets[j] + 4, y + 14, 12,
      'left', COLORS.text, true));
  const shown = cols.slice(0, 16);
  shown.forEach((col, i) => {
    const top = y + 27 + 23 * i;
    drawRect(c, x, top, total, 23,
      { fill: i % 2 === 0 ? '#fff' : '#f5f7f5', stroke: COLORS.grid, weight: 0.5 });
    const cx = k.g.gridX.findIndex(v => Math.abs(v - col.x) < 2);
    const cy = k.g.gridY.findIndex(v => Math.abs(v - col.y) < 2);
    const loc = cx >= 0 && cy >= 0 ? `${gridLetter(cx)}-${cy + 1}` : '—';
    const footingData = rows[i] ?? rows[0] ?? {};
    const pad = footingSpec(k, i);
    const values = [`F${i + 1}`, loc, `${round(pad.w)}×${round(pad.d)}`,
      rows.length ? round(positive(footingData.columnLoadKN, 0)) : '—'];
    values.forEach((value, j) => label(c, value, x + offsets[j] + 4,
      top + 12, 11));
  });
  for (const off of offsets.slice(1))
    drawLine(c, x + off, y, x + off, y + (shown.length + 1) * 23 + 4,
      0.5, COLORS.dim);
  if (cols.length > shown.length) label(c,
    `${cols.length - shown.length} further footing marks omitted from sheet.`,
    x, y + 38 + shown.length * 23, 13, 'left', COLORS.dim);
  label(c, 'LOADS: STRUCTURAL RESULT IF AVAILABLE', x,
    y + 61 + shown.length * 23, 12, 'left', COLORS.dim);
}
function columnLayout(k: Context): void {
  setFrame(k, k.g.footprint, { x: 120, y: 140, w: 1490, h: 900 }, 95);
  drawPlot(k); grid(k);
  const c = k.c;
  for (const seg of gridSegments(k.g)) {
    const a = at(k, seg.a.x, seg.a.y), b = at(k, seg.b.x, seg.b.y);
    drawDoubleLineWall(c, a.x, a.y, b.x, b.y, Math.max(3, 230 * k.scale), 1.3);
  }
  for (const [i, col] of k.g.columns.entries()) {
    const spec = footingSpec(k, i), p = at(k, col.x, col.y);
    const f = box(k, { x: col.x - spec.w / 2, y: col.y - spec.d / 2, w: spec.w, h: spec.d });
    ring(c, f);
    drawColumnSymbol(c, p.x, p.y, Math.max(5, col.w * k.scale), Math.max(5, col.d * k.scale));
    if (i < 20) label(c, `F${i + 1}`, f.x + f.w + 3, f.y - 6, 12);
  }
  gridDimensions(k); drawSectionMark(k);
  const spec = footingSpec(k, 0), beam = firstBeam(k);
  legend(c, 1640, 240, 'FOUNDATION KEY', [
    `Isolated footings: ${k.g.columns.length} nos.`,
    `Typical pad: ${round(spec.w)} × ${round(spec.d)} × ${round(spec.depth)} mm`,
    `Column: ${round(k.g.columns[0]?.w ?? 300)} × ${round(k.g.columns[0]?.d ?? 300)} mm`,
    `Plinth beam (typ.): ${round(positive(beam.widthMm, 230))} × ${round(positive(beam.depthMm, 400))} mm`,
    'Dashed outline: footing; solid double line: beam.',
    'Grid positions taken from structural design where supplied.',
    `Grade: ${concrete(k)} / ${steel(k)}`,
  ]);
  foundationSchedule(k, 1640, 520);
  drawScaleBar(c, 160, 1160, k.scale);
}

/* 3. Footing pad in section AND bar layout in plan. */
function footingDetail(k: Context): void {
  const c = k.c, f = footing(k), spec = footingSpec(k, 0);
  const colW = positive(firstColumn(k).widthMm, 300);
  const colD = positive(firstColumn(k).depthMm, 300);
  const side = spec.w, depth = spec.depth, pcc = spec.pcc;
  const cover = 50, barDia = positive(f.barDiaMm, 12), spacing = positive(f.barSpacingMm, 150);
  const nBars = Math.max(2, Math.round(positive(f.barsEachWay, Math.ceil((side - 100) / spacing) + 1)));
  const yGround = 555, s = Math.min(0.42, 640 / Math.max(side, 1100));
  const center = 500, footingTop = yGround + 115, footingBottom = footingTop + depth * s;
  const fx = center - side * s / 2;
  const pccSize = positive(f.pccSizeMm, side + 300);
  drawLine(c, 115, yGround, 965, yGround, 1.5, COLORS.wall);
  drawHatch(c, 120, yGround + 4, 840, 350, 45, 15);
  drawRect(c, 120, yGround + 8, 840, 350, { fill: 'rgba(240,235,226,0.38)' });
  hatchBox(c, { x: center - pccSize * s / 2, y: footingBottom, w: pccSize * s, h: pcc * s }, '#d7d7d7', -45, 8);
  hatchBox(c, { x: fx, y: footingTop, w: side * s, h: depth * s }, COLORS.concrete, 45, 12);
  hatchBox(c, { x: center - colW * s / 2, y: 318, w: colW * s, h: footingTop - 318 }, COLORS.concrete, -45, 12);
  // Four column starters are anchored into the pad. The available anchorage
  // is only schematic: the structural engineer must verify actual development.
  const starterSpacing = Math.max(8, (colW - 90) * s);
  const starterX = [center - starterSpacing / 2, center + starterSpacing / 2];
  for (const xx of starterX) {
    drawLine(c, xx, 323, xx, footingBottom - 72 * s, 2, COLORS.wall);
    const hookDirection = xx < center ? -1 : 1;
    drawLine(c, xx, footingBottom - 72 * s,
      xx + hookDirection * 100 * s, footingBottom - 72 * s, 2, COLORS.wall);
  }
  for (let yy = 340; yy < footingTop - 12; yy += Math.max(15, 150 * s))
    drawLine(c, starterX[0] - 4, yy, starterX[1] + 4, yy,
      0.8, COLORS.wall);
  note(c, 'COLUMN STARTERS / HOOKS: DESIGN DEVELOPMENT LENGTH',
    145, 282, starterX[0], footingTop + 30);
  // Actual longitudinal reinforcement at cover, with bend/anchorage schematic.
  const rebarY = footingBottom - cover * s;
  drawLine(c, fx + cover * s, rebarY, fx + (side - cover) * s, rebarY, 2.2, COLORS.wall);
  for (let i = 0; i < nBars; i++) {
    const x = fx + (cover + i * (side - 2 * cover) / Math.max(1, nBars - 1)) * s;
    circle(c, x, rebarY - 10, 2.8, COLORS.wall, COLORS.wall);
  }
  const sectionDims = [fx, fx + side * s];
  drawDimensionChain(c, sectionDims, footingBottom, 98, 'horizontal', s);
  drawDimensionChain(c, [footingTop, footingBottom, footingBottom + pcc * s], fx, -67, 'vertical', s);
  note(c, `PCC ${round(pcc)} THK`, 90, 1040, center - side * s / 3, footingBottom + pcc * s / 2);
  note(c, `BOTTOM MAT Ø${round(barDia)} @ ${round(spacing)} c/c BOTH WAYS`, 90, 1090, center, rebarY);
  label(c, 'A–A  FOOTING SECTION', 280, 243, 23, 'left', COLORS.green, true);
  label(c, 'NGL ±0.000', 820, yGround - 15, 15);
  label(c, 'FOUNDING LEVEL: VERIFY WITH SOIL REPORT', 640, footingBottom + pcc * s + 48, 14);
  // Plan view of the identical footing with mesh on right.
  const planS = Math.min(0.38, 650 / Math.max(side, spec.d)), pcx = 1510, pcy = 690;
  const pw = side * planS, ph = spec.d * planS;
  drawRect(c, pcx - pw / 2, pcy - ph / 2, pw, ph,
    { stroke: COLORS.wall, weight: 2 });
  const cpw = colW * planS, cph = colD * planS;
  drawRect(c, pcx - cpw / 2, pcy - cph / 2, cpw, cph,
    { fill: '#b5b9b8', stroke: COLORS.wall, weight: 1 });
  const rebarStepX = (pw - 2 * cover * planS) / Math.max(1, nBars - 1);
  const rebarStepY = (ph - 2 * cover * planS) / Math.max(1, nBars - 1);
  for (let i = 0; i < nBars; i++) {
    const x = pcx - pw / 2 + cover * planS + i * rebarStepX;
    const y = pcy - ph / 2 + cover * planS + i * rebarStepY;
    drawLine(c, x, pcy - ph / 2 + cover * planS, x, pcy + ph / 2 - cover * planS, 0.8, COLORS.dim);
    drawLine(c, pcx - pw / 2 + cover * planS, y, pcx + pw / 2 - cover * planS, y, 0.8, COLORS.dim);
  }
  drawDimensionChain(c, [pcx - pw / 2, pcx + pw / 2], pcy + ph / 2,
    58, 'horizontal', planS);
  drawDimensionChain(c, [pcy - ph / 2, pcy + ph / 2], pcx + pw / 2,
    55, 'vertical', planS);
  const coverX = pcx - pw / 2 + cover * planS;
  const coverY = pcy - ph / 2 + cover * planS;
  drawLine(c, pcx - pw / 2, pcy - ph / 2 - 21,
    coverX, pcy - ph / 2 - 21, 0.7, COLORS.dim);
  drawLine(c, pcx - pw / 2, pcy - ph / 2 - 29,
    pcx - pw / 2, pcy - ph / 2 - 13, 0.7, COLORS.dim);
  drawLine(c, coverX, pcy - ph / 2 - 29,
    coverX, pcy - ph / 2 - 13, 0.7, COLORS.dim);
  label(c, `COVER ${round(cover)} mm`, pcx - pw / 2,
    pcy - ph / 2 - 40, 13, 'left', COLORS.dim);
  circle(c, coverX, coverY, 3, COLORS.wall, COLORS.wall);
  label(c, 'TYPICAL FOOTING PLAN', 1300, 243, 23, 'left', COLORS.green, true);
  multiline(c, [`FOOTING ${round(side)} × ${round(spec.d)} × ${round(depth)} mm`,
    `COLUMN ${round(colW)} × ${round(colD)} mm; CLEAR COVER 50 mm`,
    `${nBars} BARS EACH WAY; ${concrete(k)}, ${steel(k)}`], 1220, 1090, 16, 27);
}

/* 4. Slab/beam layout with panel reinforcement and a coordinated architectural overlay. */
function beamCrossSection(k: Context, x: number, y: number): void {
  const c = k.c;
  const beam = firstBeam(k), slab = firstSlab(k);
  const beamW = positive(beam.widthMm, 230), beamD = positive(beam.depthMm, 400);
  const slabThk = positive(slab.thicknessMm, 150);
  const drawingScale = Math.min(0.45, 180 / beamD);
  const beamWPx = beamW * drawingScale, beamDPx = beamD * drawingScale;
  const slabYPx = slabThk * drawingScale;
  const slabW = 330;
  hatchBox(c, { x: x - slabW / 2, y, w: slabW, h: slabYPx }, COLORS.concrete, 45, 14, 1.2);
  hatchBox(c, { x: x - beamWPx / 2, y: y + slabYPx,
    w: beamWPx, h: beamDPx - slabYPx }, COLORS.concrete, -45, 12, 1.5);
  const cover = Math.min(22, 25 * drawingScale);
  const barR = 4.5;
  for (const yy of [y + slabYPx + cover, y + beamDPx - cover]) {
    circle(c, x - beamWPx / 2 + cover, yy, barR, COLORS.wall, COLORS.wall);
    circle(c, x + beamWPx / 2 - cover, yy, barR, COLORS.wall, COLORS.wall);
  }
  drawRect(c, x - beamWPx / 2 + cover / 2, y + slabYPx + cover / 2,
    beamWPx - cover, beamDPx - slabYPx - cover, { stroke: COLORS.wall, weight: 1 });
  drawDimensionChain(c, [x - beamWPx / 2, x + beamWPx / 2], y + beamDPx,
    32, 'horizontal', drawingScale);
  drawDimensionChain(c, [y, y + slabYPx, y + beamDPx], x + slabW / 2,
    24, 'vertical', drawingScale);
  label(c, 'TYPICAL BEAM-SLAB SECTION', x - slabW / 2, y - 34, 16,
    'left', COLORS.green, true);
  label(c, `${sval(beam, 'tensionBars', 'BOTTOM: BY ENGINEER')} bottom`,
    x - slabW / 2, y + beamDPx + 77, 13);
  label(c, `Ø${round(positive(beam.stirrupDiaMm, 8))} stirrups @ ${round(positive(beam.stirrupSpacingMidSpanMm, 200))} mm`,
    x - slabW / 2, y + beamDPx + 99, 13);
}
function beamSlab(k: Context): void {
  setFrame(k, k.g.building, { x: 160, y: 145, w: 1480, h: 865 }, 90);
  const c = k.c, b = box(k, k.g.building);
  drawPlanRooms(k, true);
  grid(k);
  for (const segment of gridSegments(k.g)) {
    const a = at(k, segment.a.x, segment.a.y), z = at(k, segment.b.x, segment.b.y);
    drawDoubleLineWall(c, a.x, a.y, z.x, z.y, Math.max(4, positive(firstBeam(k).widthMm, 230) * k.scale), 2);
  }
  for (const [i, r] of selected(k).entries()) {
    const p = at(k, r.x + r.w / 2, r.y + r.d / 2);
    const slab = structuralRows(k, 'slabs').find(s => sval(s, 'id', '').endsWith(r.source.id)) ?? firstSlab(k);
    const oneWay = sval(slab, 'slabType', r.w / r.d > 2 || r.d / r.w > 2 ? 'one-way' : 'two-way') === 'one-way';
    const horizontal = r.w <= r.d;
    const length = Math.min(65, (horizontal ? r.w : r.d) * k.scale / 3);
    if (horizontal) arrow(c, p.x - length, p.y + 27, p.x + length, p.y + 27, COLORS.green, 9);
    else arrow(c, p.x + 35, p.y - length, p.x + 35, p.y + length, COLORS.green, 9);
    if (!oneWay) {
      if (horizontal) arrow(c, p.x + 35, p.y - 45, p.x + 35, p.y + 45, COLORS.green, 9);
      else arrow(c, p.x - 55, p.y + 25, p.x + 55, p.y + 25, COLORS.green, 9);
    }
    label(c, `S${i + 1} ${oneWay ? '1W' : '2W'} / ${round(positive(slab.thicknessMm, 150))} THK`,
      p.x, p.y + 52, 12, 'center', COLORS.green);
    if (r.source.type === 'staircase') {
      const q = box(k, { x: r.x, y: r.y, w: r.w, h: r.d });
      drawRect(c, q.x, q.y, q.w, q.h, { stroke: COLORS.wall, dash: [6, 4], weight: 2 });
      label(c, 'STAIR OPENING', p.x, p.y, 16, 'center', COLORS.green, true);
    }
  }
  drawColumns(k); gridDimensions(k); drawSectionMark(k);
  const slab = firstSlab(k), beam = firstBeam(k);
  legend(c, 1670, 215, 'RCC DESIGN KEY', [
    `Typical slab thickness: ${round(positive(slab.thicknessMm, 150))} mm`,
    `Short direction: Ø${round(positive(slab.shortSpanBarDiaMm ?? slab.mainBarDiaMm, 10))} @ ${round(positive(slab.shortSpanSpacingMm ?? slab.mainBarSpacingMm, 150))} c/c`,
    `Other direction: Ø${round(positive(slab.longSpanBarDiaMm ?? slab.distBarDiaMm, 8))} @ ${round(positive(slab.longSpanSpacingMm ?? slab.distBarSpacingMm, 200))} c/c`,
    `Typical beam: ${round(positive(beam.widthMm, 230))} × ${round(positive(beam.depthMm, 400))} mm`,
    `Bottom steel: ${sval(beam, 'tensionBars', sval(beam, 'bottomBars', 'BY ENGINEER'))}`,
    `Top steel: ${sval(beam, 'compressionBars', sval(beam, 'topBars', 'BY ENGINEER'))}`,
    `${concrete(k)} concrete, ${steel(k)} reinforcement`,
    'Room lines in light grey = coordinated floor plan.',
  ]);
  openingLegend(k, 1670, 540);
  beamCrossSection(k, 1850, 770);
  label(c, `BUILDING FOOTPRINT ${round(k.g.building.w)} × ${round(k.g.building.h)} mm • ${k.g.floors > 1 ? 'TYPICAL SLAB — ALL FLOORS (GF room names shown)' : 'ROOF SLAB'}`,
    b.x, 1154, 15);
  drawScaleBar(c, 200, 1180, k.scale);
}

/* 5. Column cross-section, elevation and ties. */
function columnDetail(k: Context): void {
  const c = k.c, column = firstColumn(k);
  const w = positive(column.widthMm, k.g.columns[0]?.w ?? 300);
  const d = positive(column.depthMm, k.g.columns[0]?.d ?? 300);
  const spec = sval(column, 'mainBars', '4-16mm');
  const count = Math.max(4, Number(/^\d+/.exec(spec)?.[0] ?? 4));
  const dia = positive(Number(/-(\d+)mm/.exec(spec)?.[1]), 16);
  const tie = positive(column.tieDiaMm, 8), spacing = positive(column.tieSpacingMm, 150);
  const cover = 40, scale = Math.min(1.13, 425 / Math.max(w, d));
  const x = 390, y = 475, cw = w * scale, ch = d * scale;
  hatchBox(c, { x, y, w: cw, h: ch }, '#e7e9e7', -45, 20);
  drawRect(c, x + cover * scale, y + cover * scale,
    cw - 2 * cover * scale, ch - 2 * cover * scale, { stroke: COLORS.wall, weight: 2 });
  // Bar positions: four corners, with remaining bars distributed on perimeter.
  const inset = (cover + tie + dia / 2) * scale;
  const x0 = x + inset, x1 = x + cw - inset, y0 = y + inset, y1 = y + ch - inset;
  const perimeter = 2 * ((x1 - x0) + (y1 - y0));
  for (let i = 0; i < count; i++) {
    const dist = i * perimeter / count;
    const dx = x1 - x0, dy = y1 - y0;
    const p = dist < dx ? { x: x0 + dist, y: y0 } :
      dist < dx + dy ? { x: x1, y: y0 + dist - dx } :
      dist < 2 * dx + dy ? { x: x1 - (dist - dx - dy), y: y1 } :
      { x: x0, y: y1 - (dist - 2 * dx - dy) };
    circle(c, p.x, p.y, Math.max(4, dia * scale / 2), COLORS.wall, COLORS.wall);
  }
  label(c, 'COLUMN CROSS-SECTION', 250, 265, 23, 'left', COLORS.green, true);
  drawDimensionChain(c, [x, x + cw], y + ch, 60, 'horizontal', scale);
  drawDimensionChain(c, [y, y + ch], x, -60, 'vertical', scale);
  note(c, `${spec} MAIN BARS`, 240, 930, x + cw - inset, y + inset);
  note(c, `Ø${round(tie)} CLOSED TIES @ ${round(spacing)} c/c`, 240, 980, x + inset, y + ch / 2);
  label(c, `CLEAR COVER ${round(cover)} mm`, 240, 1025, 16);
  // 3 m side elevation from same member shape.
  const ex = 1300, ey = 325, eh = 730, ew = Math.max(100, w * 0.43);
  hatchBox(c, { x: ex, y: ey, w: ew, h: eh }, '#e7e9e7', -45, 23);
  drawLine(c, ex + 23, ey + 10, ex + 23, ey + eh - 10, 2);
  drawLine(c, ex + ew - 23, ey + 10, ex + ew - 23, ey + eh - 10, 2);
  const pitch = eh * spacing / 3000;
  for (let yy = ey + pitch / 2; yy < ey + eh; yy += Math.max(10, pitch))
    drawRect(c, ex + 14, yy, ew - 28, 6, { stroke: COLORS.wall, weight: 1.2 });
  hatchBox(c, { x: ex - 105, y: ey - 40, w: ew + 210, h: 38 }, COLORS.concrete, 45, 12);
  hatchBox(c, { x: ex - 105, y: ey + eh + 3, w: ew + 210, h: 38 }, COLORS.concrete, 45, 12);
  drawDimensionChain(c, [ey, ey + eh], ex + ew, 105, 'vertical', eh / 3000);
  label(c, 'COLUMN SIDE ELEVATION', 1200, 265, 23, 'left', COLORS.green, true);
  note(c, `TIES @ ${round(spacing)} c/c`, 1520, 532, ex + ew - 7, 565);
  multiline(c, ['Seismic joint / confinement lengths to engineer detail.',
    `Concrete ${concrete(k)}; reinforcement ${steel(k)}.`,
    'Bar laps, development and hooks require design review.'], 1090, 1130, 15, 23);
}


/** Map bbsGenerator.ts field names to drawingEngine conventions. */
function normalizeBBSRow(r: Data): Data {
  const totalLenMm = typeof r.totalLengthM === 'number' ? r.totalLengthM * 1000 : undefined;
  return { ...r,
    diameter: r.diameter ?? r.barDiaMm ?? r.diaMm,
    noOfBars: r.noOfBars ?? r.numberOfBars,
    cuttingLength: r.cuttingLength ?? r.barLengthMm,
    totalLength: r.totalLength ?? totalLenMm,
    weight: r.weight ?? r.totalWeightKg,
    barMark: r.barMark ?? r.barMarkNo,
    member: r.member ?? r.memberDescription,
    shape: r.shape ?? r.barShape,
  };
}

/* 6. Data-driven bar bending schedule. Never invent entry quantities. */
function barBending(k: Context): void {
  const c = k.c, raw = list(k.data.bbsEntries).map(obj).map(normalizeBBSRow);
  const columns = [110, 205, 360, 685, 810, 960, 1125, 1310, 1530, 1840];
  const headers = ['S.No', 'Bar Mark', 'Member', 'Dia', 'Shape', 'No.Bars', 'Cut Length', 'Total Length', 'Weight'];
  label(c, 'BAR BENDING SCHEDULE — ALL LENGTHS IN mm', 120, 150, 28, 'left', COLORS.green, true);
  label(c, `STEEL: ${steel(k)}  •  CONCRETE: ${concrete(k)}`, 120, 194, 16);
  // Summary by member type × bar diameter: every bar mark is counted here, so the grand total
  // is the complete schedule weight (the same steel figure the BOQ uses).
  const src = list(k.data.bbsEntries).map(obj);
  const wOf = (r: Record<string, unknown>, n: ReturnType<typeof normalizeBBSRow>) => {
    const d = positive(n.diameter ?? n.diaMm, 0), nb = positive(n.noOfBars, 0);
    return positive(r.totalWeightKg ?? n.weight, positive(n.totalLength, nb * positive(n.cuttingLength, 0)) * d * d / 162000);
  };
  const dias = [...new Set(raw.map(n => Math.round(positive(n.diameter ?? n.diaMm, 0))))].filter(d => d > 0).sort((a, b) => a - b);
  const groups = new Map<string, Map<number, number>>();
  src.forEach((r, i) => {
    const g = String(r.memberType ?? sval(raw[i], 'member', 'other').split(' ')[0]).toUpperCase();
    const d = Math.round(positive(raw[i].diameter ?? raw[i].diaMm, 0));
    const m = groups.get(g) ?? new Map<number, number>(); m.set(d, (m.get(d) ?? 0) + wOf(r, raw[i])); groups.set(g, m);
  });
  const grand = [...groups.values()].reduce((s2, m) => s2 + [...m.values()].reduce((a, b) => a + b, 0), 0);
  const boqSteel = k.boq ? { quantity: k.boq.steelWeightMT } : null;
  let top = 270;
  if (raw.length > 20) {
    const sumRows = [...groups.entries()].map(([g, m]) => [g, ...dias.map(d => m.get(d) ? (m.get(d) as number).toFixed(1) : '—'), [...m.values()].reduce((a, b) => a + b, 0).toFixed(1)]);
    sumRows.push(['GRAND TOTAL (all ' + raw.length + ' bar marks)', ...dias.map(d => [...groups.values()].reduce((a, m) => a + (m.get(d) ?? 0), 0).toFixed(1)), grand.toFixed(1)]);
    const yEnd = table(c, 110, 240, [{ h: 'MEMBER', w: 330 }, ...dias.map(d => ({ h: `Ø${d} kg`, w: 120 })), { h: 'TOTAL kg', w: 150 }], sumRows, 'STEEL SUMMARY BY MEMBER AND DIAMETER', 26);
    // BBS procurement total = net bar weight + 5% cutting waste (bbsGenerator WASTE_FACTOR); the BOQ uses it.
    const withWaste = grand * 1.05, boqKg = boqSteel ? Number(boqSteel.quantity) * 1000 : NaN;
    const agrees = Number.isFinite(boqKg) && Math.abs(boqKg - withWaste) <= 10 + 0.005 * withWaste;
    label(c, `Net bar weight ${(grand / 1000).toFixed(2)} t + 5% cutting waste = ${(withWaste / 1000).toFixed(2)} t` +
      (Number.isFinite(boqKg) ? (agrees ? ` = BOQ reinforcement ${(boqKg / 1000).toFixed(2)} MT.` : `  •  CHECK: BOQ shows ${(boqKg / 1000).toFixed(2)} MT.`) : '.'),
      110, yEnd + 30, 15, 'left', agrees ? COLORS.green : COLORS.wall, true);
    if (AUDIT) AUDIT.checks.push({ item: 'BBS total = BOQ steel', status: agrees || !Number.isFinite(boqKg) ? 'PASS' : 'ERROR', detail: `${withWaste.toFixed(0)} kg vs BOQ ${boqKg.toFixed(0)} kg` });
    top = yEnd + 70;
  }
  const rowHeight = raw.length <= 20 ? 36 : raw.length <= 28 ? 28 : 23;
  const maxRows = Math.max(4, Math.floor((1110 - top) / rowHeight) - 2);
  drawRect(c, columns[0], top, columns[9] - columns[0], rowHeight,
    { fill: '#e5eae5', stroke: COLORS.wall, weight: 1.3 });
  for (let i = 0; i < 9; i++) label(c, headers[i], columns[i] + 8, top + rowHeight / 2, 15, 'left', COLORS.text, true);
  if (!raw.length) {
    drawRect(c, columns[0], top + rowHeight, columns[9] - columns[0], 130, { stroke: COLORS.wall, weight: 0.7 });
    multiline(c, ['BAR BENDING DATA NOT PROVIDED BY STRUCTURAL ENGINE.',
      'No cutting lengths or weights are inferred from preliminary member sizes.',
      'Prepare approved BBS after reinforcement detailing and lap verification.'],
      140, top + 78, 18, 30);
  } else {
    const shown = raw.slice(0, maxRows);
    let summed = 0;
    shown.forEach((r, i) => {
      const y = top + rowHeight * (i + 1);
      drawRect(c, columns[0], y, columns[9] - columns[0], rowHeight,
        { fill: i % 2 ? '#fff' : '#f7f8f7', stroke: '#aaa', weight: 0.5 });
      const diameter = positive(r.diameter ?? r.diaMm, 0);
      const noBars = positive(r.noOfBars, 0), cutting = positive(r.cuttingLength, 0);
      const totalLength = positive(r.totalLength, noBars * cutting);
      const weight = positive(r.weight, totalLength * diameter * diameter / 162000);
      summed += weight;
      const values = [`${i + 1}`, sval(r, 'barMark', `B${i + 1}`), sval(r, 'member', '—'),
        `Ø${round(diameter)}`, sval(r, 'shape', 'STRAIGHT'), round(noBars),
        round(cutting), round(totalLength), weight.toFixed(2) + ' kg'];
      values.forEach((v, j) => label(c, v, columns[j] + 8, y + rowHeight / 2,
        rowHeight < 26 ? 12 : 14));
    });
    const summaryY = top + rowHeight * (shown.length + 1);
    drawRect(c, columns[0], summaryY, columns[9] - columns[0], rowHeight,
      { fill: '#e5eae5', stroke: COLORS.wall, weight: 1 });
    label(c, raw.length > maxRows ? `EXTRACT SUBTOTAL (${maxRows} OF ${raw.length} BAR MARKS)` : 'TOTAL WEIGHT',
      columns[0] + 10, summaryY + rowHeight / 2, 15, 'left', COLORS.text, true);
    const allWeight = raw.reduce((sum, r) => {
      const diameter = positive(r.diameter ?? r.diaMm, 0);
      const bars = positive(r.noOfBars, 0);
      const totalLength = positive(r.totalLength, bars * positive(r.cuttingLength, 0));
      return sum + positive(r.weight, totalLength * diameter * diameter / 162000);
    }, 0);
    label(c, `${(raw.length > maxRows ? summed : allWeight).toFixed(2)} kg`,
      columns[8] + 8, summaryY + rowHeight / 2, 15, 'left', COLORS.text, true);
    if (raw.length > maxRows) label(c, `Extract only: the other ${raw.length - maxRows} bar marks are included in the steel summary and grand total above.`,
      120, summaryY + rowHeight + 26, 15, 'left', COLORS.dim);
  }
  for (const x of columns) drawLine(c, x, top, x, Math.min(1150, top + rowHeight * (Math.min(raw.length, maxRows) + 2)), 0.5, COLORS.dim);
  legend(c, 120, 1145, 'FABRICATION NOTES', [
    'Check bend allowances, hooks, anchorage, development, splice lengths and actual field measurements.',
    'Weight is schedule weight where supplied; calculated fallback uses diameter² / 162 kg per metre.',
  ]);
}

/* 7/8. Related projection model: x offsets belong to the same room geometry. */
function storyThickness(k: Context, floor: number): number {
  const slabs = structuralRows(k, 'slabs');
  const candidate = slabs.find(s => nval(s, 'floor', -1) === floor) ?? slabs[0] ?? {};
  return positive(candidate.thicknessMm, 150);
}
function sectionRooms(k: Context, floor: number, cutY: number): ModelRoom[] {
  const rooms = k.g.rooms[floor] ?? k.g.rooms[0] ?? [];
  return rooms.filter(r => cutY >= r.y - 1 && cutY <= r.y + r.d + 1).sort((a, b) => a.x - b.x);
}
function intervalCuts(rooms: ModelRoom[], building: Bounds): number[] {
  return unique([building.x, ...rooms.flatMap(r => [r.x, r.x + r.w]), building.x + building.w]);
}
function projectVerticalOpening(k: Context, o: OpeningPlacement, transform: (x: number, z: number) => Point,
  story: number, s: number, visible: boolean): void {
  if (!visible || o.axis !== 'horizontal') return;
  const z = 450 + story * 3000 + Math.max(0, finite(o.source.sillHeightMm, o.source.type === 'door' ? 0 : 900));
  const h = Math.min(2700, positive(o.source.heightMm, o.source.type === 'door' ? 2100 : 1200));
  const left = transform(o.a, z + h), right = transform(o.b, z);
  const x = Math.min(left.x, right.x), y = Math.min(left.y, right.y);
  const w = Math.abs(right.x - left.x), ht = Math.abs(right.y - left.y);
  if (w < 2 || ht < 2) return;
  drawRect(k.c, x, y, w, ht, { fill: '#fff', stroke: COLORS.wall, weight: 1.8 });
  if (o.source.type === 'door') {
    drawLine(k.c, x + w / 2, y, x + w / 2, y + ht, 0.8);
    circle(k.c, x + Math.min(10, w / 4), y + ht * 0.53,
      2.2, COLORS.wall, COLORS.wall);
    drawLine(k.c, x + 5, y + 5, x + w - 5, y + 5, 0.6, COLORS.dim);
  } else {
    drawLine(k.c, x + 3, y + ht / 2, x + w - 3, y + ht / 2,
      0.9, COLORS.dim);
    if (w > 45) drawLine(k.c, x + w / 2, y + 2,
      x + w / 2, y + ht - 2, 0.8, COLORS.dim);
    // External sill and lintel project beyond the scheduled clear opening.
    drawLine(k.c, x - 4, y + ht, x + w + 4, y + ht, 1.6);
    drawLine(k.c, x - 3, y - 5, x + w + 3, y - 5, 1.1);
    if (o.source.type === 'ventilator') {
      for (let yy = y + 7; yy < y + ht - 4; yy += 9)
        drawLine(k.c, x + 5, yy, x + w - 5, yy, 0.5, COLORS.dim);
    }
  }
  if (w > 48) label(k.c, `${round(o.b - o.a)}`, x + w / 2, y - 11, 11, 'center', COLORS.dim);
  void s;
}
function levelMark(c: CanvasRenderingContext2D, x: number, y: number, textValue: string): void {
  // ▽ level symbol on the line, value written above the line (never struck through)
  drawLine(c, x - 34, y, x + 200, y, PEN.hair, COLORS.dim);
  c.save(); c.fillStyle = COLORS.wall; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 16, y - 12); c.lineTo(x, y - 12); c.closePath(); c.fill(); c.restore();
  label(c, textValue, x + 8, y - 9, 13, 'left', COLORS.text);
}
const fmtLvl = (mm: number) => `${mm >= 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toFixed(3)}`;
function sectionAA(k: Context): void {
  const c = k.c, b = k.g.building, floors = Math.min(k.g.floors, 5);
  const FD = ASSUMED_FOUNDING_DEPTH_M * 1000, H = 3000, PL = 450;
  const found = footingSpec(k, 0);
  const cutY = sectionCutY(k);
  const stairRooms = Array.from({ length: floors }, (_, f) => (k.g.rooms[f] ?? []).find(r => r.source.type === 'staircase' && cutY >= r.y && cutY <= r.y + r.d));
  const st0 = stairRooms[0];
  const roofZ = PL + floors * H, mumtyZ = roofZ + 2700;
  const top = (st0 ? mumtyZ + 150 : roofZ + PARAPET_HEIGHT_MM) + 400, bottom = -FD - found.pcc - 500;
  setFrame(k, { x: b.x - 600, y: bottom, w: b.w + 1200, h: top - bottom }, { x: 110, y: 120, w: 1220, h: 1120 }, 60);
  const project = (x: number, z: number): Point => at(k, x, top - z + bottom);
  const s = k.scale, wallE = WALL_EXTERNAL_MM * s;
  const left = project(b.x, 0).x, right = project(b.x + b.w, 0).x, ngl = project(b.x, 0).y, botY = project(0, bottom).y;
  drawRect(c, left - 520 * s, ngl, right - left + 1040 * s, botY - ngl, { fill: COLORS.earth });
  drawHatch(c, left - 520 * s, ngl + 3, right - left + 1040 * s, botY - ngl - 3, 45, 16);
  drawLine(c, left - 520 * s, ngl, right + 520 * s, ngl, PEN.medium);
  // footings at the assumed founding depth (same depth as BOQ earthwork)
  const groundColumns = k.g.columns.filter(col => col.x >= b.x - 1 && col.x <= b.x + b.w + 1);
  const drawnX = unique(groundColumns.map(col => clamp(col.x, b.x + col.w / 2, b.x + b.w - col.w / 2)));
  const fTop = project(0, -FD + found.depth).y;
  for (const x of drawnX) {
    const col = groundColumns[0] ?? k.g.columns[0];
    const p = project(x, 0);
    hatchBox(c, { x: p.x - (found.w + 300) * s / 2, y: project(0, -FD).y, w: (found.w + 300) * s, h: found.pcc * s }, '#d7d7d7', -45, 9, PEN.thin);
    hatchBox(c, { x: p.x - found.w * s / 2, y: fTop, w: found.w * s, h: found.depth * s }, COLORS.concrete, 45, 8, PEN.medium);
    hatchBox(c, { x: p.x - (col?.w ?? 300) * s / 2, y: project(x, PL).y, w: (col?.w ?? 300) * s, h: fTop - project(x, PL).y }, COLORS.concrete, 45, 10, PEN.medium);
  }
  // plinth beam + DPC
  const plinthY = project(0, PL).y;
  hatchBox(c, { x: left, y: plinthY, w: right - left, h: Math.max(3, positive(firstBeam(k).depthMm, 400) * s * 0.75) }, COLORS.concrete, 45, 10, PEN.medium);
  drawLine(c, left, plinthY - 2, right, plinthY - 2, PEN.medium, COLORS.green);
  label(c, 'DPC', left - 12, plinthY - 8, 11, 'right', COLORS.green, true);
  const beamD = positive(firstBeam(k).depthMm, 400);
  for (let story = 0; story < floors; story++) {
    const baseZ = PL + story * H, topZ = baseZ + H, slab = storyThickness(k, story);
    const baseY = project(0, baseZ).y, roofY = project(0, topZ).y, wallTop = roofY + slab * s;
    for (const x of [b.x, b.x + b.w]) { const xx = project(x, 0).x; hatchBox(c, { x: x === b.x ? xx : xx - wallE, y: wallTop, w: wallE, h: baseY - wallTop }, '#eeeae4', -45, 9, PEN.cut); }
    const rooms = sectionRooms(k, story, cutY);
    for (const x of intervalCuts(rooms, b).slice(1, -1)) {
      if (Math.abs(x - b.x) < 230 || Math.abs(x - b.x - b.w) < 230) continue;
      const xx = project(x, 0).x; hatchBox(c, { x: xx - 75 * s, y: wallTop, w: 150 * s, h: baseY - wallTop }, '#eeeae4', -45, 9, PEN.cut);
    }
    for (const room of rooms) {
      if (room.source.type === 'staircase') continue;
      const cen = project(room.x + room.w / 2, baseZ + 1700), span = room.w * s;
      if (span > 50) label(c, room.source.name.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase(), cen.x, cen.y, Math.min(14, span / 9), 'center');
    }
    // slab (cut, solid RCC) and beams under it at the grid
    hatchBox(c, { x: left, y: roofY, w: right - left, h: Math.max(4, slab * s) }, '#cfd3d0', 45, 6, PEN.cut);
    for (const x of drawnX) { const xx = project(x, 0).x; hatchBox(c, { x: clamp(xx - 115 * s, left, right - 230 * s), y: roofY + slab * s, w: 230 * s, h: Math.max(0, beamD - slab) * s }, '#cfd3d0', 45, 6, PEN.medium); }
    // lintel band over openings
    drawLine(c, left, project(0, baseZ + 2100).y, right, project(0, baseZ + 2100).y, PEN.hair, COLORS.grid);
    levelMark(c, right + 70, baseY, `${story === 0 ? 'FFL GF' : `FFL F${story}`} ${fmtLvl(baseZ)}`);
    // stair: flight 1 cut (hatched waist), landing, flight 2 seen beyond
    const sr = stairRooms[story];
    if (sr) {
      const stD = stair(k), risers = Math.max(4, Math.round(positive(stD.numRisers, 18))), half = Math.ceil(risers / 2);
      const rz = H / risers, landingW = Math.min(positive(stD.flightWidthMm, 1000), sr.w * 0.4);
      const x0 = sr.x + (Math.abs(sr.x - b.x) < 40 ? WALL_EXTERNAL_MM : 75), x1 = sr.x + sr.w - (Math.abs(sr.x + sr.w - b.x - b.w) < 40 ? WALL_EXTERNAL_MM : 75);
      const run = x1 - landingW - x0, tr = run / Math.max(1, half - 1);
      const prof: Point[] = [project(x0, baseZ)];
      for (let i = 0; i < half; i++) { const xx = x0 + i * tr; prof.push(project(xx, baseZ + (i + 1) * rz)); prof.push(project(Math.min(xx + tr, x1 - landingW), baseZ + (i + 1) * rz)); }
      const waist = positive(stD.waistSlabThicknessMm, 150);
      const lz = baseZ + half * rz;
      hatchPolygon(c, [...prof, project(x1 - landingW, lz - waist - 80), project(x0, baseZ - waist)], '#e0e3e0');
      hatchBox(c, { x: project(x1 - landingW, 0).x, y: project(0, lz).y, w: landingW * s, h: waist * s }, '#e0e3e0', 45, 6, PEN.medium);
      c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.thin; c.beginPath();
      const n2 = risers - half, tr2 = run / Math.max(1, n2);
      let p = project(x1 - landingW, lz); c.moveTo(p.x, p.y);
      for (let i = 0; i < n2; i++) { const xx = x1 - landingW - i * tr2; p = project(xx, lz + (i + 1) * rz); c.lineTo(project(xx, lz + i * rz).x, p.y); c.lineTo(project(xx - tr2, 0).x, p.y); }
      c.stroke(); c.restore();
      const h0 = project(x0 + 100, baseZ + 900 + rz), h1 = project(x1 - landingW, lz + 900);
      drawLine(c, h0.x, h0.y, h1.x, h1.y, PEN.thin, COLORS.dim);
      label(c, `${risers} R × ${rz.toFixed(0)}`, project((x0 + x1) / 2, 0).x, project(0, baseZ + H * 0.82).y, 11, 'center', COLORS.dim);
    }
  }
  // roof: parapet (and stair-head room when the stair continues to the terrace)
  const roofY = project(0, roofZ).y, parapetY = project(0, roofZ + PARAPET_HEIGHT_MM).y;
  for (const x of [left, right - wallE]) hatchBox(c, { x, y: parapetY, w: wallE, h: roofY - parapetY }, '#eeeae4', -45, 9, PEN.cut);
  drawRect(c, left - 4, parapetY - 6, right - left + 8, 6, { fill: '#d6d6d3', stroke: COLORS.wall, weight: PEN.thin });
  levelMark(c, right + 70, roofY, `TOS ROOF ${fmtLvl(roofZ)}`);
  levelMark(c, right + 70, parapetY - 6, `TOP OF PARAPET ${fmtLvl(roofZ + PARAPET_HEIGHT_MM)}`);
  const stTop = (k.g.rooms[floors - 1] ?? []).find(r => r.source.type === 'staircase' && cutY >= r.y && cutY <= r.y + r.d);
  if (stTop) {
    const mx0 = project(stTop.x, 0).x, mx1 = project(stTop.x + stTop.w, 0).x, my = project(0, mumtyZ).y;
    for (const x of [mx0, mx1 - wallE]) hatchBox(c, { x, y: my, w: wallE, h: roofY - my }, '#eeeae4', -45, 9, PEN.cut);
    hatchBox(c, { x: mx0 - 6, y: my - 120 * s, w: mx1 - mx0 + 12, h: 120 * s }, '#cfd3d0', 45, 6, PEN.cut);
    label(c, 'STAIR HEAD ROOM', (mx0 + mx1) / 2, (my + roofY) / 2, 12, 'center', COLORS.text, true);
    levelMark(c, right + 70, my - 120 * s, `TOP OF HEAD ROOM ${fmtLvl(mumtyZ + 120)}`);
  }
  levelMark(c, right + 70, ngl, 'NGL ±0.000');
  levelMark(c, right + 70, project(0, -FD).y, `FOUNDING LEVEL ${fmtLvl(-FD)} (ASSUMED — VERIFY BY SOIL REPORT)`);
  // vertical dimension string on the left, horizontal string below ground
  const vz = [-FD, 0, ...Array.from({ length: floors + 1 }, (_, i) => PL + i * H), roofZ + PARAPET_HEIGHT_MM];
  const ys = vz.map(z => project(0, z).y);
  drawDimensionChain(c, ys, left - 40, -50, 'vertical', s);
  const outer = unique([b.x, ...sectionRooms(k, 0, cutY).flatMap(r => [r.x, r.x + r.w]), b.x + b.w]);
  dimMm(k, outer, 'x', botY - 40, -0.0001, 'section widths');
  viewTitle(k, 'SECTION 1–1 (THROUGH STAIR)', 130, 150);
  legend(c, 1660, 330, 'SECTION NOTES', [
    `Floor-to-floor ${H} mm; plinth ${PL} mm.`,
    `Slab ${round(storyThickness(k, floors - 1))} mm; beams ${round(positive(firstBeam(k).widthMm, 230))} × ${round(beamD)} mm.`,
    `Footing ${round(found.w)} × ${round(found.d)} × ${round(found.depth)} mm on ${round(found.pcc)} mm PCC.`,
    `Founding depth ${FD} mm: ASSUMED`,
    '  (same as BOQ) — confirm by soil test.',
    `Walls ${WALL_EXTERNAL_MM} mm ext.; 150 mm partitions.`,
    'Lintel level +2100 above each floor.',
    `Cut shown on plans ${sheetNumber('working_plan', 0)}${k.g.floors > 1 ? '/' + sheetNumber('working_plan', 1) : ''}.`,
  ]);
}
function frontElevation(k: Context): void {
  const c = k.c, b = k.g.building, floors = Math.min(k.g.floors, 5);
  const maxZ = 450 + floors * 3000 + 900;
  setFrame(k, { x: b.x - 300, y: -250, w: b.w + 1700, h: maxZ + 600 },
    { x: 135, y: 140, w: 1540, h: 930 }, 60);
  const project = (x: number, z: number): Point => at(k, x, maxZ - z - 250);
  const s = k.scale, left = project(b.x, 0).x, right = project(b.x + b.w, 0).x;
  const ngl = project(0, 0).y, plinth = project(0, 450).y;
  drawLine(c, 145, ngl, 1690, ngl, 1.5);
  hatchBox(c, { x: left, y: plinth, w: right - left, h: ngl - plinth },
    '#e6e8e5', 45, 12);
  for (let story = 0; story < floors; story++) {
    const z = 450 + story * 3000, roofZ = z + 3000, slab = storyThickness(k, story);
    const topY = project(0, roofZ).y, baseY = project(0, z).y;
    drawRect(c, left, topY, right - left, baseY - topY,
      { fill: story % 2 ? '#f7f7f6' : '#fafafa', stroke: COLORS.wall, weight: 2 });
    const floorOpenings = k.g.openings.filter(o => o.floor === story && o.face === 'front' &&
      Math.abs(o.fixed - b.y) < 500);
    for (const opening of floorOpenings) projectVerticalOpening(k, opening, project, story, s, true);
    // Reveal slab band at elevation, supported by exactly the structural slab thickness.
    hatchBox(c, { x: left, y: topY, w: right - left, h: Math.max(5, slab * s) },
      '#e2e4e2', 45, 14, 2);
    const beam = positive(firstBeam(k).depthMm, 400);
    drawRect(c, left, topY + slab * s, right - left, Math.max(2, (beam - slab) * s),
      { stroke: COLORS.grid, weight: 0.8 });
    levelMark(c, right + 74, baseY, `FFL ${story === 0 ? 'GF' : `F${story}`} ${fmtLvl(z)}`);
  }
  const roofZ = 450 + floors * 3000;
  const ry = project(0, roofZ).y, py = project(0, roofZ + PARAPET_HEIGHT_MM).y;
  hatchBox(c, { x: left, y: py, w: right - left, h: ry - py }, '#f0eee9', 45, 17);
  drawRect(c, left - 5, py - 10, right - left + 10, 10,
    { fill: '#d6d6d3', stroke: COLORS.wall, weight: 1 });
  levelMark(c, right + 74, ngl, 'NGL ±0.000');
  levelMark(c, right + 74, ry, `TOS ROOF ${fmtLvl(roofZ)}`);
  levelMark(c, right + 74, py, `TOP OF COPING ${fmtLvl(roofZ + PARAPET_HEIGHT_MM)}`);
  drawDimensionChain(c, [left, right], ngl, 56, 'horizontal', s);
  const frontX = unique([b.x, ...k.g.openings.filter(o => o.face === 'front' && o.floor === 0)
    .flatMap(o => [o.a, o.b]), b.x + b.w]).map(x => project(x, 0).x);
  drawDimensionChain(c, frontX, ngl, 96, 'horizontal', s);
  viewTitle(k, 'FRONT ELEVATION (ROAD SIDE)', 150, 150);
  legend(c, 1715, 285, 'ELEVATION KEY', [
    `Building width ${round(b.w)} mm`,
    `Post-setback buildable ${round(positive(mm(k.layout.buildableWidthM), b.w))} mm`,
    `Front setback ${round(k.g.setbacks.front)} mm`,
    `Sill: per opening schedule`,
    `Plinth: +450 mm; storeys: 3000 mm`,
    `Parapet: ${PARAPET_HEIGHT_MM} mm; coping shown`,
    'Opening positions from the locked plan;',
    `marks as per ${sheetNumber('door_window_schedule', 0)}. Chajja over windows.`,
  ]);
  const front = k.g.openings.filter(o => o.face === 'front' &&
    Math.abs(o.fixed - b.y) < 500 && o.floor === 0);
  label(c, 'FRONT OPENING SET-OUT (GF)', 1715, 575, 17,
    'left', COLORS.green, true);
  if (!front.length) label(c, 'No front-wall entries in schedule.', 1715, 604, 14);
  const marks = openingTypes(k.g).markOf;
  front.slice(0, 9).forEach((o, i) => {
    const elevRoomName = o.room.source.name.replace(/\s*\(.*?\)\s*/g, '').trim().slice(0, 14);
    label(c, `${marks.get(o) ?? '—'}  ${elevRoomName}: ${round(o.a - b.x)}–${round(o.b - b.x)} mm`, 1715, 605 + i * 38, 13);
    label(c, `sill ${round(o.source.sillHeightMm)} • height ${round(o.source.heightMm)} mm`, 1740, 623 + i * 38, 11, 'left', COLORS.dim);
  });
  if (front.length > 9) label(c, `${front.length - 9} more — see ${sheetNumber('door_window_schedule', 0)}.`, 1715, 605 + 9 * 38, 13);
  for (const o of k.g.openings.filter(o2 => o2.face === 'front' && Math.abs(o2.fixed - b.y) < 500)) { const m = marks.get(o); if (!m) continue; const z = 450 + o.floor * 3000 + finite(o.source.sillHeightMm, 0) + positive(o.source.heightMm, 1200); const p = project((o.a + o.b) / 2, z); label(c, m, p.x, p.y - 22, 11, 'center', COLORS.text, true);
    if (o.source.type === 'window') { const l0 = project(o.a - 150, z + 150), l1 = project(o.b + 150, z + 100 + 150); hatchBox(c, { x: l0.x, y: Math.min(l0.y, l1.y), w: l1.x - l0.x, h: Math.max(3, Math.abs(l1.y - l0.y)) }, '#e2e4e2', 45, 6, PEN.thin); } }
}

/* 9. Stair plan and dimensioned side view. */
function staircaseDetail(k: Context): void {
  const c = k.c, st = stair(k);
  const risers = Math.max(4, Math.round(positive(st.numRisers, 18))), H = 3000;
  const riser = positive(st.riserMm, H / risers), tread = positive(st.treadMm, 270);
  const fw = positive(st.flightWidthMm, 1000), waist = positive(st.waistSlabThicknessMm, 150);
  const landingT = positive(st.landingThicknessMm, waist), well = 150;
  const half = Math.ceil(risers / 2), n1 = half - 1, n2 = risers - half - 1; // treads per flight
  const run = Math.max(n1, n2) * tread, landing = fw;
  // ── PLAN 1:50 ──  x = along the flights, y = across (flight 1 near, flight 2 far)
  setFrame(k, { x: -300, y: -300, w: run + landing + 600, h: 2 * fw + well + 600 }, { x: 70, y: 170, w: 780, h: 900 }, 70);
  const P = (x: number, y: number) => at(k, x, y);
  const Wtot = 2 * fw + well;
  const o = P(0, 0), e = P(run + landing, Wtot);
  drawRect(c, o.x, o.y, e.x - o.x, e.y - o.y, { stroke: COLORS.wall, weight: PEN.cut });
  const ln = (x0: number, y0: number, x1: number, y1: number, w = PEN.thin) => { const a = P(x0, y0), z = P(x1, y1); drawLine(c, a.x, a.y, z.x, z.y, w); };
  ln(run, 0, run, Wtot, PEN.medium);
  ln(0, fw, run, fw, PEN.medium); ln(0, fw + well, run, fw + well, PEN.medium);
  // Flight 1 occupies y ∈ [fw+well, Wtot] (bottom), climbs left→right; flight 2 y ∈ [0, fw] climbs right→left.
  for (let i = 0; i <= n1; i++) { const x = run - n1 * tread + i * tread; ln(x, fw + well, x, Wtot, PEN.thin); if (i < n1) { const m = P(x + tread / 2, fw + well + fw * 0.78); label(c, `${i + 1}`, m.x, m.y, 10, 'center', COLORS.dim); } }
  for (let i = 0; i <= n2; i++) { const x = run - i * tread; ln(x, 0, x, fw, PEN.thin); if (i < n2) { const m = P(x - tread / 2, fw * 0.22); label(c, `${half + i + 1}`, m.x, m.y, 10, 'center', COLORS.dim); } }
  const lm = P(run + landing / 2, Wtot / 2); label(c, `LANDING (R${half})`, lm.x, lm.y, 12, 'center', COLORS.text, true);
  const a0 = P(run - n1 * tread + 80, fw + well + fw / 2), a1 = P(run + landing / 2, fw + well + fw / 2), a2 = P(run + landing / 2, fw / 2), a3 = P(run - n2 * tread + 120, fw / 2);
  c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.thin; c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(a1.x, a1.y); c.lineTo(a2.x, a2.y); c.stroke(); c.restore();
  circle(c, a0.x, a0.y, 4, COLORS.wall, COLORS.wall); arrow(c, a2.x, a2.y, a3.x, a3.y, COLORS.wall, 10);
  label(c, 'UP', a0.x - 26, a0.y, 13, 'center', COLORS.text, true);
  dimMm(k, [0, run, run + landing], 'x', e.y, 40, 'stair plan run');
  dimMm(k, [0, fw, fw + well, Wtot], 'y', o.x, -40, 'stair plan width');
  viewTitle(k, 'STAIR PLAN', 90, 150);
  // ── SECTION 1:50 ── flight 1 cut, landing, flight 2 seen
  const secTop = H + 1200;
  setFrame(k, { x: -500, y: -600, w: run + landing + 1000, h: secTop + 900 }, { x: 880, y: 170, w: 760, h: 900 }, 60);
  const Q = (x: number, z: number) => at(k, x, secTop - z);
  const steps: Point[] = [Q(0, 0)];
  for (let i = 0; i < half; i++) { steps.push(Q(i * tread, (i + 1) * riser)); steps.push(Q(Math.min((i + 1) * tread, run), (i + 1) * riser)); }
  const lz = half * riser;
  hatchPolygon(c, [...steps, Q(run + landing, lz), Q(run + landing, lz - landingT), Q(run, lz - landingT), Q(0, -waist)], '#e0e3e0');
  c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.thin; c.beginPath();
  let p = Q(run, lz); c.moveTo(p.x, p.y);
  for (let i = 0; i < risers - half; i++) { const x = run - i * tread; c.lineTo(Q(x, lz + (i + 1) * riser).x, Q(x, lz + (i + 1) * riser).y); c.lineTo(Q(x - tread, 0).x, Q(x - tread, lz + (i + 1) * riser).y); }
  c.stroke(); c.restore();
  const g = Q(-400, 0), g2 = Q(run + landing + 300, 0); drawLine(c, g.x, g.y, g2.x, g2.y, PEN.medium);
  const f = Q(-400, H), f2 = Q(run - (risers - half) * tread + 0, H); drawLine(c, f.x, f.y, f2.x, f2.y, PEN.medium);
  const h0 = Q(0, riser + 900), h1 = Q(run, lz + 900); drawLine(c, h0.x, h0.y, h1.x, h1.y, PEN.thin, COLORS.dim);
  label(c, 'HANDRAIL 900 H', (h0.x + h1.x) / 2 - 30, (h0.y + h1.y) / 2 - 14, 10, 'center', COLORS.dim);
  drawDimensionChain(c, [Q(0, H).y, Q(0, lz).y, Q(0, 0).y], Q(run + landing, 0).x + 30, 40, 'vertical', k.scale);
  dimMm(k, [0, run, run + landing], 'x', Q(0, -waist).y + 10, 40, 'stair section run');
  levelMark(c, Q(run + landing, 0).x + 110, Q(0, 0).y, 'FFL ±0.000 (floor below)');
  levelMark(c, Q(run + landing, 0).x + 110, Q(0, lz).y, `LANDING +${(lz / 1000).toFixed(3)}`);
  levelMark(c, Q(run + landing, 0).x + 110, Q(0, H).y, `FFL +${(H / 1000).toFixed(3)} (floor above)`);
  viewTitle(k, 'STAIR SECTION (FLIGHT 1 CUT, FLIGHT 2 BEYOND)', 900, 150);
  const going = 2 * riser + tread;
  legend(c, 1660, 230, 'STAIR DATA', [
    `${risers} risers × ${riser.toFixed(1)} mm`,
    `Tread (going) ${round(tread)} mm`,
    `2R + T = ${going.toFixed(0)} mm ${going >= 550 && going <= 700 ? '(within 550–700)' : '(CHECK)'}`,
    `Flight width ${round(fw)} mm; well ${well} mm`,
    `Waist ${round(waist)} mm; landing ${round(landingT)} mm`,
    `Main steel Ø${round(positive(st.mainBarDiaMm, 10))} @ ${round(positive(st.mainBarSpacingMm, 150))} c/c`,
    'Handrail 900 mm above nosing.',
    'Keep ≥ 2100 mm clear headroom under',
    '  any beam over the flight — check on site.',
    `Located on plans ${sheetNumber('working_plan', 0)}; cut on ${sheetNumber('section_aa', 0)}.`,
  ]);
}

/* 10. Water storage schematic: tanks are explicitly not sized without demand. */
function tankReinforcement(c: CanvasRenderingContext2D, r: Bounds,
  wallPx: number, basePx: number): void {
  const inset = Math.max(8, wallPx * 0.33);
  // Closed loop of indicated inner reinforcement; outer face of concrete is
  // represented by the hatchBox outlines drawn by waterTank below.
  const x1 = r.x + inset, x2 = r.x + r.w - inset;
  const y1 = r.y - wallPx + inset, y2 = r.y + r.h - inset;
  drawLine(c, x1, y1, x1, y2, 1.5, COLORS.column);
  drawLine(c, x2, y1, x2, y2, 1.5, COLORS.column);
  drawLine(c, x1, y2, x2, y2, 1.5, COLORS.column);
  drawLine(c, x1, y1, x2, y1, 1.5, COLORS.column);
  const outerX1 = r.x + wallPx - inset, outerX2 = r.x + r.w - wallPx + inset;
  drawLine(c, outerX1, r.y, outerX1, r.y + r.h - basePx, 1, COLORS.column);
  drawLine(c, outerX2, r.y, outerX2, r.y + r.h - basePx, 1, COLORS.column);
  const pitch = Math.max(23, r.w / 17);
  for (let x = r.x + wallPx + 15; x < r.x + r.w - wallPx - 10; x += pitch) {
    circle(c, x, r.y + r.h - basePx / 2, 3, COLORS.column, COLORS.column);
    circle(c, x, r.y - wallPx / 2, 2.5, COLORS.column, COLORS.column);
  }
  for (let y = r.y + 17; y < r.y + r.h - basePx; y += 32) {
    circle(c, r.x + wallPx / 2, y, 2.5, COLORS.column, COLORS.column);
    circle(c, r.x + r.w - wallPx / 2, y, 2.5, COLORS.column, COLORS.column);
  }
}
function waterTank(k: Context): void {
  const c = k.c;
  label(c, 'UNDERGROUND SUMP — SECTION', 220, 250, 24, 'left', COLORS.green, true);
  label(c, 'OVERHEAD TANK — SECTION', 1200, 250, 24, 'left', COLORS.green, true);
  const sump = { x: 240, y: 470, w: 620, h: 470 };
  const tank = { x: 1290, y: 410, w: 560, h: 420 };
  for (const [r, underground] of [[sump, true], [tank, false]] as const) {
    const thick = 42, base = 57;
    if (underground) {
      drawLine(c, r.x - 120, r.y + 80, r.x + r.w + 120, r.y + 80, 1.3);
      drawHatch(c, r.x - 105, r.y + 85, 105, r.h, 45, 13);
      drawHatch(c, r.x + r.w, r.y + 85, 105, r.h, 45, 13);
    } else {
      hatchBox(c, { x: r.x + 80, y: r.y + r.h + 15, w: 60, h: 215 }, COLORS.concrete);
      hatchBox(c, { x: r.x + r.w - 140, y: r.y + r.h + 15, w: 60, h: 215 }, COLORS.concrete);
    }
    hatchBox(c, { x: r.x, y: r.y, w: thick, h: r.h }, COLORS.concrete);
    hatchBox(c, { x: r.x + r.w - thick, y: r.y, w: thick, h: r.h }, COLORS.concrete);
    hatchBox(c, { x: r.x, y: r.y + r.h - base, w: r.w, h: base }, COLORS.concrete);
    drawRect(c, r.x + thick, r.y + 100, r.w - 2 * thick, r.h - base - 100,
      { fill: COLORS.water, stroke: '#4b9eb3', weight: 1 });
    hatchBox(c, { x: r.x, y: r.y - thick, w: r.w, h: thick }, COLORS.concrete);
    tankReinforcement(c, r, thick, base);
    const lidX = r.x + r.w / 2 - 55;
    drawRect(c, lidX, r.y - thick - 5, 110, 8, { fill: '#fff', stroke: COLORS.wall });
    arrow(c, r.x - 65, r.y + 175, r.x + thick + 10, r.y + 175, COLORS.green);
    arrow(c, r.x + r.w - thick, r.y + 245, r.x + r.w + 70, r.y + 245, COLORS.green);
    label(c, 'INLET', r.x - 105, r.y + 155, 14);
    label(c, 'OUTLET', r.x + r.w + 12, r.y + 225, 14);
    drawDimensionChain(c, [r.x, r.x + r.w], r.y + r.h, 48, 'horizontal', 0.2);
    drawDimensionChain(c, [r.y, r.y + r.h], r.x, -58, 'vertical', 0.2);
    drawLine(c, r.x + thick, r.y + 100, r.x + r.w - thick, r.y + 100, 1, '#4b9eb3');
    label(c, 'FREEBOARD', r.x + r.w / 2, r.y + 70, 15, 'center');
    label(c, underground ? 'WATERPROOF EXTERNAL TANKING' : 'OVERFLOW / VENT / FLOAT VALVE',
      r.x + r.w / 2, r.y + r.h + 100, 15, 'center');
    label(c, `WALL ${round(thick / 0.2)} mm; BASE ${round(base / 0.2)} mm; ROOF ${round(thick / 0.2)} mm`,
      r.x + r.w / 2, r.y + r.h + 130, 14, 'center');
    label(c, 'SCHEMATIC MAT Ø12 @ 150 c/c BOTH FACES — ENGINEER TO VERIFY',
      r.x + r.w / 2, r.y + r.h + 157, 12, 'center');
  }
  const assumptionDepth = 2000; // transverse internal dimension not present in layout
  const sumpWaterHeight = (sump.h - 57 - 100) / 0.2;
  const ohtWaterHeight = (tank.h - 57 - 100) / 0.2;
  const sumpLitres = (sump.w - 84) / 0.2 * assumptionDepth * sumpWaterHeight / 1e6;
  const ohtLitres = (tank.w - 84) / 0.2 * assumptionDepth * ohtWaterHeight / 1e6;
  legend(c, 155, 1140, 'DESIGN BASIS (SCHEMATIC ONLY)', [
    `Indicative capacities: sump ${round(sumpLitres)} L / OHT ${round(ohtLitres)} L, assuming ${assumptionDepth} mm transverse clear dimension.`,
    'Demand, transverse dimension, support reactions, seismic anchorage and potable-water hygiene require project-specific design.',
  ]);
}

/* 11. Roof and wet-area waterproofing: layer build-up, drainage, and upstands. */
function waterproofing(k: Context): void {
  const c = k.c;
  label(c, 'ROOF TERRACE — TYPICAL SECTION', 170, 250, 24, 'left', COLORS.green, true);
  label(c, 'BATHROOM SUNKEN SLAB — SECTION', 1190, 250, 24, 'left', COLORS.green, true);
  const roofX = 190, roofY = 515, roofW = 730;
  const layers = [
    { h: 27, fill: '#ded6c7', name: 'TILES + JOINT GROUT 20 mm' },
    { h: 50, fill: '#ebe6d7', name: 'SLOPING SCREED 40–75 mm' },
    { h: 10, fill: '#899c89', name: 'MEMBRANE 3–4 mm (CONTINUOUS)' },
    { h: 9, fill: '#d9ded2', name: 'PRIMER / BOND COAT' },
    { h: 110, fill: COLORS.concrete, name: `RCC SLAB ${round(storyThickness(k, k.g.floors - 1))} mm` },
  ];
  let y = roofY;
  for (const layer of layers) {
    drawRect(c, roofX, y, roofW, layer.h, { fill: layer.fill, stroke: COLORS.wall, weight: 1 });
    label(c, layer.name, roofX + roofW + 20, y + layer.h / 2, 14);
    if (layer.fill === COLORS.concrete) drawHatch(c, roofX, y, roofW, layer.h, 45, 13);
    y += layer.h;
  }
  hatchBox(c, { x: roofX, y: roofY - 220, w: 50, h: 220 }, '#eeeae4');
  drawLine(c, roofX + 52, roofY + 85, roofX + 52, roofY - 150, 3, COLORS.green);
  drawLine(c, roofX + 52, roofY - 150, roofX + 80, roofY - 150, 3, COLORS.green);
  note(c, 'MEMBRANE UPSTAND >=300 mm ABOVE FINISH', 175, 800, roofX + 55, roofY - 110);
  arrow(c, roofX + 340, roofY - 42, roofX + 690, roofY - 23, COLORS.green);
  label(c, 'SLOPE >=1:100 TO OUTLET', roofX + 335, roofY - 69, 14);
  circle(c, roofX + roofW - 25, roofY + 8, 12, '#fff', COLORS.wall);
  const outletX = roofX + roofW - 25;
  drawLine(c, outletX - 5, roofY + 14, outletX - 5, roofY + 240, 1.5);
  drawLine(c, outletX + 5, roofY + 14, outletX + 5, roofY + 240, 1.5);
  drawRect(c, outletX - 22, roofY - 13, 44, 5, { fill: COLORS.column, stroke: COLORS.wall, weight: 0.8 });
  arrow(c, outletX, roofY + 35, outletX, roofY + 188, COLORS.green, 9);
  label(c, 'RAINWATER OUTLET / CLAMP RING', roofX + 340, 880, 14);
  const bx = 1240, by = 495, bw = 600;
  hatchBox(c, { x: bx, y: by + 160, w: bw, h: 140 }, COLORS.concrete, 45, 12);
  hatchBox(c, { x: bx, y: by, w: 48, h: 280 }, '#eeeae4');
  hatchBox(c, { x: bx + bw - 48, y: by, w: 48, h: 280 }, '#eeeae4');
  drawRect(c, bx + 48, by + 75, bw - 96, 18, { fill: '#d8cdb7', stroke: COLORS.wall, weight: 1 });
  drawRect(c, bx + 48, by + 93, bw - 96, 67, { fill: '#ece7db', stroke: COLORS.wall, weight: 1 });
  drawLine(c, bx + 45, by + 158, bx + bw - 45, by + 158, 3, COLORS.green);
  drawLine(c, bx + 45, by + 158, bx + 45, by + 18, 3, COLORS.green);
  drawLine(c, bx + bw - 45, by + 158, bx + bw - 45, by + 18, 3, COLORS.green);
  // The lowered waterproofing is dressed into a clamped floor drain, not
  // simply stopped at a point drain penetration.
  const trapX = bx + bw - 136;
  drawRect(c, trapX - 25, by + 69, 50, 8, { fill: COLORS.column, stroke: COLORS.wall });
  drawLine(c, trapX - 16, by + 77, trapX - 16, by + 170, 1.5);
  drawLine(c, trapX + 16, by + 77, trapX + 16, by + 170, 1.5);
  drawLine(c, trapX - 16, by + 169, trapX - 16, by + 231, 1.4);
  drawLine(c, trapX + 16, by + 169, trapX + 16, by + 231, 1.4);
  drawLine(c, trapX - 24, by + 158, trapX - 24, by + 115, 2.2, COLORS.green);
  drawLine(c, trapX + 24, by + 158, trapX + 24, by + 115, 2.2, COLORS.green);
  label(c, 'FLOOR TRAP', trapX, by + 49, 12, 'center');
  drawDimensionChain(c, [by + 75, by + 160, by + 300], bx + bw, 56, 'vertical', 0.65);
  note(c, 'FLOOR TILE + ADHESIVE', 1270, 875, bx + 400, by + 85);
  note(c, 'PROTECTION SCREED', 1270, 920, bx + 400, by + 130);
  note(c, 'MEMBRANE + 300 mm WALL UPSTAND', 1270, 965, bx + 53, by + 150);
  note(c, 'LOWERED RCC SLAB; PROVIDE FLOOR TRAP', 1270, 1010, bx + 400, by + 210);
  legend(c, 185, 1125, 'QUALITY CONTROL', [
    'Primer and membrane compatibility, coves at corners, 48-hour ponding test; protect before laying screed.',
    'Dimensions are typical layer intent; verify proprietary material specifications and site drain levels.',
  ]);
}

/* 12. STP flow-plan; explicitly distinguishes schematic dimensions from design capacity. */
function stpDetail(k: Context): void {
  const c = k.c;
  const chambers = [
    { name: 'INLET / SCREEN', w: 210 }, { name: 'EQUALISATION', w: 270 },
    { name: 'AERATION', w: 300 }, { name: 'CLARIFIER', w: 260 },
    { name: 'FILTER / UV', w: 230 }, { name: 'TREATED WATER', w: 250 },
  ];
  const gap = 40, startX = 155, top = 475, h = 320;
  let x = startX;
  label(c, 'SEWAGE TREATMENT PLANT — SCHEMATIC PROCESS PLAN', 150, 220, 26, 'left', COLORS.green, true);
  label(c, 'Process order and nominal diagrammatic dimensions; NOT a hydraulic / statutory design.',
    150, 263, 17);
  for (let i = 0; i < chambers.length; i++) {
    const ch = chambers[i];
    drawRect(c, x, top, ch.w, h, { fill: i % 2 ? '#edf2ef' : '#f7f8f6', stroke: COLORS.wall, weight: 2 });
    drawRect(c, x + 10, top + 10, ch.w - 20, h - 20, { stroke: COLORS.dim, weight: 0.8 });
    circle(c, x + ch.w / 2, top + 75, 35, '#fff', COLORS.green, 1.5);
    label(c, `${i + 1}`, x + ch.w / 2, top + 75, 23, 'center', COLORS.green, true);
    label(c, ch.name, x + ch.w / 2, top + 163, 15, 'center', COLORS.text, true);
    if (i === 2) {
      for (let p = 0; p < 6; p++) circle(c, x + 70 + (p % 3) * 65,
        top + 220 + Math.floor(p / 3) * 38, 9, '#fff', COLORS.green);
      label(c, 'AIR DIFFUSERS', x + ch.w / 2, top + 300, 12, 'center');
    }
    if (i === 3) {
      circle(c, x + ch.w / 2, top + 245, 44, '#fff', COLORS.grid);
      arrow(c, x + 78, top + 263, x + 145, top + 213, COLORS.green);
    }
    drawDimensionChain(c, [x, x + ch.w], top + h, 57, 'horizontal', 0.15);
    if (i < chambers.length - 1) {
      arrow(c, x + ch.w + 6, top + h / 2, x + ch.w + gap - 6, top + h / 2, COLORS.green, 10);
      drawLine(c, x + ch.w, top + h / 2 - 8, x + ch.w + gap, top + h / 2 - 8, 1);
    }
    x += ch.w + gap;
  }
  arrow(c, startX - 65, top + h / 2, startX - 5, top + h / 2, COLORS.green);
  label(c, 'RAW SEWAGE', startX - 90, top + h / 2 - 50, 13);
  arrow(c, x - gap + 5, top + h / 2, x - gap + 73, top + h / 2, COLORS.green);
  label(c, 'REUSE / DISCHARGE', x - gap - 43, top + h / 2 - 50, 13);
  drawDimensionChain(c, [top, top + h], startX, -50, 'vertical', 0.15);
  const aerationCenter = startX + chambers.slice(0, 2)
    .reduce((sum, ch) => sum + ch.w + gap, 0) + chambers[2].w / 2;
  const clarifierCenter = startX + chambers.slice(0, 3)
    .reduce((sum, ch) => sum + ch.w + gap, 0) + chambers[3].w / 2;
  arrow(c, aerationCenter, top - 95, aerationCenter, top - 9, COLORS.green);
  label(c, 'BLOWER AIR', aerationCenter, top - 116, 14, 'center');
  dashed(c, { x: clarifierCenter, y: top + h },
    { x: clarifierCenter, y: top + h + 94 }, COLORS.dim, 1.2);
  arrow(c, clarifierCenter, top + h + 57, clarifierCenter, top + h + 92,
    COLORS.green, 8);
  drawRect(c, clarifierCenter - 96, top + h + 94, 192, 43,
    { fill: '#f2efe9', stroke: COLORS.wall, weight: 1 });
  label(c, 'SLUDGE HOLDING', clarifierCenter, top + h + 115, 12, 'center');
  legend(c, 150, 960, 'CONNECTIONS & HOLD POINTS', [
    'Raw sewage → screening → EQ tank → aeration → settling → tertiary treatment → treated-water tank.',
    'Sludge withdrawal from clarifier to separately designed sludge holding / dewatering facility.',
    'Calculate population-equivalent, daily flow, retention time, blower duty and discharge limits.',
    'Shown widths and depth are schematic (mm on sheet), not construction or capacity dimensions.',
  ]);
}


/* =====================================================================================
 * 13–16. Floor-specific services & finishes drawings (Electrical, Plumbing, Tiling,
 * Brickwork). Drawn from the locked plan's rooms and openings for the selected floor; every
 * count and quantity comes from the shared rules (quantityRules / quantityTakeoff) that
 * also drive the BOQ, so drawing schedules and BOQ lines cannot disagree.
 * ===================================================================================== */
type Side = 'front' | 'rear' | 'left' | 'right';
const SVC = { power: '#b5651d', light: '#2f5d8a', water: '#1f78b4', hot: '#c0392b', drain: '#7a5230', brick: '#e7c4ae', tileA: '#e9eef2', tileB: '#dfe9df', wetTile: '#cfe3ea' };
function svcRooms(k: Context): ModelRoom[] { return selected(k).filter(r => !isNiche(r.source)); }
function svcFrame(k: Context, withPlot = false): void {
  const b = k.g.building, m = 700;
  setFrame(k, withPlot ? k.g.footprint : { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }, { x: 80, y: 120, w: 1300, h: 1060 }, 40);
  // Service symbols shrink with the drawing scale so small wet rooms stay legible (full size at 1:50).
  SYM_SCALE = Math.max(0.62, Math.min(1, k.scale / 0.1));
}
let SYM_SCALE = 1;
function externalSides(k: Context, r: ModelRoom): Side[] {
  const b = k.g.building, e = 40, out: Side[] = [];
  if (Math.abs(r.y + r.d - (b.y + b.h)) < e) out.push('rear');
  if (Math.abs(r.x - b.x) < e) out.push('left');
  if (Math.abs(r.x + r.w - (b.x + b.w)) < e) out.push('right');
  if (Math.abs(r.y - b.y) < e) out.push('front');
  return out;
}
function doorOf(k: Context, r: ModelRoom): OpeningPlacement | undefined {
  return k.g.openings.find(o => o.floor === k.level && o.room === r && o.source.type === 'door');
}
function doorSide(r: ModelRoom, o?: OpeningPlacement): Side | null {
  if (!o) return null;
  if (o.axis === 'horizontal') return Math.abs(o.fixed - r.y) < Math.abs(o.fixed - (r.y + r.d)) ? 'front' : 'rear';
  return Math.abs(o.fixed - r.x) < Math.abs(o.fixed - (r.x + r.w)) ? 'left' : 'right';
}
const opposite: Record<Side, Side> = { front: 'rear', rear: 'front', left: 'right', right: 'left' };
/** Point on a room side at fraction t along it, `inset` mm into the room. */
function onSide(r: ModelRoom, side: Side, t: number, inset: number): Point {
  if (side === 'front') return { x: r.x + r.w * t, y: r.y + inset };
  if (side === 'rear') return { x: r.x + r.w * t, y: r.y + r.d - inset };
  if (side === 'left') return { x: r.x + inset, y: r.y + r.d * t };
  return { x: r.x + r.w - inset, y: r.y + r.d * t };
}
function sideLen(r: ModelRoom, s: Side): number { return s === 'front' || s === 'rear' ? r.w : r.d; }
/** Fraction along `side` that is farthest from the room's door (so fixtures cluster away from it). */
function awayFromDoor(r: ModelRoom, side: Side, door?: OpeningPlacement): number {
  if (!door) return 0.2;
  const c = (door.a + door.b) / 2;
  const along = side === 'front' || side === 'rear' ? (door.axis === 'horizontal' ? c : door.fixed) : (door.axis === 'vertical' ? c : door.fixed);
  const start = side === 'front' || side === 'rear' ? r.x : r.y;
  return (along - start) / Math.max(1, sideLen(r, side)) > 0.5 ? 0.2 : 0.8;
}
/** Base plan for services sheets: walls, openings and small corner room names (centre kept free for symbols). */
function servicesBase(k: Context): void {
  drawPlanRooms(k, true, true);
}
function sym(c: CanvasRenderingContext2D, p: Point, code: string, color: string, shape: 'circle' | 'square' = 'circle', r0 = 12): void {
  const r = Math.max(6, r0 * SYM_SCALE), fs = Math.max(7, (code.length > 1 ? 10 : 12) * SYM_SCALE);
  if (shape === 'circle') circle(c, p.x, p.y, r, '#fff', color, 1.6);
  else drawRect(c, p.x - r, p.y - r, 2 * r, 2 * r, { fill: '#fff', stroke: color, weight: 1.6 });
  label(c, code, p.x, p.y + 0.5, fs, 'center', color, true);
}
function ortho(c: CanvasRenderingContext2D, a: Point, b: Point, color: string, weight: number, dash?: number[]): void {
  c.save(); if (dash) c.setLineDash(dash); c.strokeStyle = color; c.lineWidth = weight;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore();
}
function table(c: CanvasRenderingContext2D, x: number, y: number, cols: { h: string; w: number }[], rows: string[][], title: string, rowH = 22): number {
  label(c, title, x, y, 17, 'left', COLORS.green, true);
  let yy = y + 18; let xx = x;
  const totalW = cols.reduce((s, col) => s + col.w, 0);
  drawRect(c, x, yy, totalW, rowH, { fill: '#f1f3f1', stroke: COLORS.grid, weight: 1 });
  for (const col of cols) { label(c, col.h, xx + 5, yy + rowH / 2 + 1, 11, 'left', COLORS.text, true); xx += col.w; }
  yy += rowH;
  for (const row of rows) {
    const bold = row[0].startsWith('TOTAL') || row[0].startsWith('WHOLE');
    drawRect(c, x, yy, totalW, rowH, { fill: bold ? '#f7f7f2' : '#fff', stroke: COLORS.grid, weight: 0.8 });
    xx = x;
    row.forEach((v, i) => { label(c, v.length > Math.floor(cols[i].w / 6.3) ? v.slice(0, Math.floor(cols[i].w / 6.3) - 1) + '…' : v, xx + 5, yy + rowH / 2 + 1, 11, 'left', COLORS.text, bold); xx += cols[i].w; });
    yy += rowH;
  }
  return yy;
}
function floorName(k: Context): string { return k.level === 0 ? 'GROUND FLOOR' : 'FIRST FLOOR'; }
/** Kitchen counter: long leg on the best non-door wall (external preferred), short leg on an adjacent non-door wall. */
function kitchenCounter(k: Context, r: ModelRoom): { long: Side; short: Side } {
  const dSide = doorSide(r, doorOf(k, r)), ext = externalSides(k, r);
  const all: Side[] = ['rear', 'front', 'left', 'right'];
  const longSides = all.filter(s => s !== dSide && sideLen(r, s) >= Math.max(r.w, r.d) - 1);
  const long = longSides.find(s => ext.includes(s)) ?? longSides[0] ?? all.filter(s => s !== dSide).sort((a, b) => sideLen(r, b) - sideLen(r, a))[0];
  const perp: Side[] = long === 'front' || long === 'rear' ? ['left', 'right'] : ['front', 'rear'];
  const short = perp.find(s => s !== dSide && ext.includes(s)) ?? perp.find(s => s !== dSide) ?? perp[0];
  return { long, short };
}
/** Wet-room service wall: a long, non-door wall (external preferred), anchored at the end nearest an external wall. */
function wetLayout(k: Context, r: ModelRoom): { service: Side; tEnd: 0 | 1; ext: Side[]; outSide: Side | null } {
  const door = doorOf(k, r), dSide = doorSide(r, door), ext = externalSides(k, r);
  const cands = (['rear', 'left', 'right', 'front'] as Side[]).filter(s => s !== dSide);
  const score = (s: Side) => (sideLen(r, s) >= 2000 ? 10 : 0) + (ext.includes(s) ? 5 : 0) + sideLen(r, s) / 10000;
  const service = cands.sort((a, b) => score(b) - score(a))[0] ?? 'rear';
  const horizontal = service === 'front' || service === 'rear';
  const endSides: [Side, Side] = horizontal ? ['left', 'right'] : ['front', 'rear'];
  let tEnd: 0 | 1;
  if (ext.includes(endSides[0]) && !ext.includes(endSides[1])) tEnd = 0;
  else if (ext.includes(endSides[1]) && !ext.includes(endSides[0])) tEnd = 1;
  else tEnd = awayFromDoor(r, service, door) < 0.5 ? 0 : 1;
  const outSide = ext.includes(service) ? service : ext.includes(endSides[tEnd]) ? endSides[tEnd] : ext[0] ?? null;
  return { service, tEnd, ext, outSide };
}

/* 13. Electrical layout. */
function electrical(k: Context): void {
  const c = k.c; svcFrame(k); servicesBase(k);
  const rooms = svcRooms(k);
  // Main DB beside the main entrance door on GF; sub-DB at the stair landing on upper floors.
  const mainDoor = k.g.openings.find(o => o.floor === k.level && o.source.type === 'door' && (o.source as LayoutOpening & { main?: boolean }).main)
    ?? k.g.openings.find(o => o.floor === k.level && o.source.type === 'door' && o.face === 'front');
  const stairRoom = rooms.find(r => r.source.type === 'staircase');
  let dbModel: Point;
  if (k.level === 0 && mainDoor) {
    dbModel = mainDoor.axis === 'horizontal' ? { x: mainDoor.b + 250, y: mainDoor.fixed + (mainDoor.room.y + mainDoor.room.d / 2 > mainDoor.fixed ? 250 : -250) } : { x: mainDoor.fixed + (mainDoor.room.x + mainDoor.room.w / 2 > mainDoor.fixed ? 250 : -250), y: mainDoor.b + 250 };
  } else if (stairRoom) dbModel = onSide(stairRoom, 'front', 0.55, 300);
  else dbModel = { x: k.g.building.x + 400, y: k.g.building.y + 400 };
  const db = at(k, dbModel.x, dbModel.y);
  const rowsOut: string[][] = [];
  const tot = { light: 0, fan: 0, exhaust: 0, socket: 0, power: 0, ac: 0 };
  for (const r of rooms) {
    const b = electricalBreakdown(r.source.type);
    for (const kind of ELEC_KINDS) tot[kind] += b[kind];
    const n = ELEC_KINDS.reduce((s, kind) => s + b[kind], 0);
    rowsOut.push([r.source.name, `${b.light}`, `${b.fan}`, `${b.exhaust}`, `${b.socket}`, `${b.power}`, `${b.ac}`, `${n}`]);
    const door = doorOf(k, r), dSide = doorSide(r, door);
    // Ceiling points along the long axis of the room.
    const ceiling: { code: string; color: string }[] = [];
    for (let i = 0; i < b.fan; i++) ceiling.push({ code: 'F', color: SVC.light });
    for (let i = 0; i < b.light; i++) ceiling.push({ code: 'L', color: SVC.light });
    const longX = r.w >= r.d;
    ceiling.forEach((item, i) => {
      const t = (i + 0.5) / ceiling.length;
      const off = ceiling.length > 2 ? ((i % 2) ? 0.62 : 0.38) : 0.5;
      const p = longX ? { x: r.x + r.w * t, y: r.y + r.d * off } : { x: r.x + r.w * off, y: r.y + r.d * t };
      const q = at(k, p.x, p.y);
      if (item.code === 'F') { circle(c, q.x, q.y, 13, '#fff', item.color, 1.6); for (let a = 0; a < 3; a++) { const ang = a * 2.094; drawLine(c, q.x, q.y, q.x + 11 * Math.cos(ang), q.y + 11 * Math.sin(ang), 1.4, item.color); } }
      else sym(c, q, 'L', item.color, 'circle', 10);
    });
    // Wall points: sockets/power/AC/exhaust around the walls, skipping the door position.
    const ext = externalSides(k, r);
    const sides: Side[] = (['rear', 'left', 'right', 'front'] as Side[]).filter(s => s !== dSide).concat(dSide ? [dSide] : []);
    const slots: { side: Side; t: number }[] = [];
    for (const s of sides) for (const t of [0.3, 0.7, 0.5]) if (!(s === dSide && door)) slots.push({ side: s, t });
    if (!slots.length) for (const t of [0.15, 0.85]) slots.push({ side: dSide ?? 'rear', t });
    const wallItems: { code: string; color: string; prefer?: Side[] }[] = [];
    for (let i = 0; i < b.exhaust; i++) wallItems.push({ code: 'EF', color: SVC.light, prefer: ext });
    for (let i = 0; i < b.ac; i++) wallItems.push({ code: 'AC', color: SVC.power, prefer: ext.filter(s => s !== 'front') });
    for (let i = 0; i < b.power; i++) wallItems.push({ code: 'P', color: SVC.power });
    for (let i = 0; i < b.socket; i++) wallItems.push({ code: 'S', color: SVC.power });
    const used = new Set<number>();
    for (const item of wallItems) {
      let idx = slots.findIndex((s, i) => !used.has(i) && (item.prefer?.length ? item.prefer.includes(s.side) : true));
      if (idx < 0) idx = slots.findIndex((_, i) => !used.has(i));
      const slot = idx >= 0 ? slots[idx] : slots[0];
      if (idx >= 0) used.add(idx);
      const extra = idx < 0 ? 0 : Math.floor(idx / Math.max(1, slots.length)) * 0.08;
      const p = at(k, onSide(r, slot.side, Math.min(0.9, slot.t + extra), 170).x, onSide(r, slot.side, Math.min(0.9, slot.t + extra), 170).y);
      sym(c, p, item.code, item.color, item.code === 'S' ? 'circle' : 'square', item.code.length > 1 ? 12 : 9);
    }
    // Switch board beside the door, with the home run to the DB.
    let sb: Point;
    if (door) {
      const inward = door.axis === 'horizontal' ? (r.y + r.d / 2 > door.fixed ? 1 : -1) : (r.x + r.w / 2 > door.fixed ? 1 : -1);
      const along = Math.min(door.b + 200, (door.axis === 'horizontal' ? r.x + r.w : r.y + r.d) - 150);
      sb = door.axis === 'horizontal' ? { x: along, y: door.fixed + inward * 180 } : { x: door.fixed + inward * 180, y: along };
    } else sb = { x: r.x + 250, y: r.y + 250 };
    const sp = at(k, sb.x, sb.y);
    ortho(c, sp, db, SVC.power, 1, [6, 4]);
    drawRect(c, sp.x - 7, sp.y - 5, 14, 10, { fill: COLORS.wall, stroke: COLORS.wall, weight: 1 });
  }
  drawRect(c, db.x - 18, db.y - 12, 36, 24, { fill: '#fff', stroke: SVC.power, weight: 2.2 });
  label(c, k.level === 0 ? 'DB' : 'SDB', db.x, db.y + 1, 11, 'center', SVC.power, true);
  // Schedule + legend.
  const floorTotal = ELEC_KINDS.reduce((s, kind) => s + tot[kind], 0);
  rowsOut.push(['TOTAL ' + (k.level === 0 ? 'GF' : 'FF'), `${tot.light}`, `${tot.fan}`, `${tot.exhaust}`, `${tot.socket}`, `${tot.power}`, `${tot.ac}`, `${floorTotal}`]);
  const allRooms = k.layout.floors.flatMap(f => f.rooms);
  const whole = electricalPoints(allRooms);
  rowsOut.push(['WHOLE HOUSE (= BOQ)', '', '', '', '', '', '', `${whole}`]);
  const y = table(c, 1420, 150, [{ h: 'ROOM', w: 230 }, { h: 'L', w: 38 }, { h: 'F', w: 38 }, { h: 'EF', w: 38 }, { h: 'S', w: 38 }, { h: 'P', w: 38 }, { h: 'AC', w: 38 }, { h: 'PTS', w: 50 }], rowsOut, `ELECTRICAL POINT SCHEDULE — ${floorName(k)}`);
  legend(c, 1420, y + 40, 'LEGEND', [
    'L  ceiling light point        F  ceiling fan point',
    'EF exhaust fan                 S  6A socket (modular)',
    'P  16A power point             AC split-AC 16A point + drain',
    '▬  switch board at door, 1200 mm FFL',
    `${k.level === 0 ? 'DB  main distribution board' : 'SDB sub-distribution board'} — RCCB 30 mA + MCBs`,
    '- - - circuit run, FR/FRLS Cu in concealed PVC conduit',
    'Lighting 1.5 mm², 6A sockets 2.5 mm², 16A/AC 4 mm² (prelim.)',
    'Earthing per IS 3043; final load to be designed by electrician.',
  ]);
  label(c, `${floorName(k)} ELECTRICAL LAYOUT — points as per locked plan`, 100, 140, 16, 'left', COLORS.dim);
}

/* 14. Plumbing & drainage layout. */
function plumbing(k: Context): void {
  const c = k.c; svcFrame(k, k.level === 0); if (k.level === 0) drawPlot(k); servicesBase(k);
  const rooms = svcRooms(k);
  const b = k.g.building;
  const stairRoom = rooms.find(r => r.source.type === 'staircase');
  const downModel = stairRoom ? onSide(stairRoom, 'rear', 0.85, 200) : { x: b.x + 300, y: b.y + b.h - 300 };
  const down = at(k, downModel.x, downModel.y);
  const wet = rooms.filter(r => fixturesFor(r.source.type).points > 0);
  const rowsOut: string[][] = [];
  const tot = fixtureTotals([]);
  const exits: Point[] = [];
  const outPt = (p: Point, side: Side, dist: number): Point => side === 'front' ? { x: p.x, y: b.y - dist } : side === 'rear' ? { x: p.x, y: b.y + b.h + dist } : side === 'left' ? { x: b.x - dist, y: p.y } : { x: b.x + b.w + dist, y: p.y };
  for (const r of wet) {
    const f = fixturesFor(r.source.type);
    for (const key of Object.keys(tot) as (keyof typeof tot)[]) tot[key] += f[key];
    rowsOut.push([r.source.name, `${f.ewc}`, `${f.basin}`, `${f.shower}`, `${f.sink + f.purifier + f.washer}`, `${f.floorTrap}`, `${f.points}`]);
    const b0 = k.g.building;
    const pts: Point[] = [];
    const put = (side: Side, t: number, inset: number, code: string, color = SVC.water, shape: 'circle' | 'square' = 'square'): Point => {
      const m = onSide(r, side, Math.max(0.06, Math.min(0.94, t)), inset); pts.push(m); sym(c, at(k, m.x, m.y), code, color, shape, code.length > 1 ? 13 : 10); return m;
    };
    let stackModel: Point; let outSide: Side | null;
    if (r.source.type === 'toilet') {
      const w = wetLayout(k, r); outSide = w.outSide;
      const L = sideLen(r, w.service);
      const tAt = (mm: number) => w.tEnd === 0 ? mm / L : 1 - mm / L;
      const sh = put(w.service, tAt(450), 450, 'SH');
      ring(c, box(k, { x: sh.x - 450, y: sh.y - 450, w: 900, h: 900 }), SVC.water);
      put(w.service, tAt(1250), 330, 'WC');
      put(w.service, tAt(1650), 130, 'HF', SVC.water, 'circle');
      if (L >= 2500) put(w.service, tAt(2150), 260, 'WB'); else put(opposite[w.service], 0.5, 260, 'WB');
      put(w.service, tAt(450), 950, 'FT', SVC.drain, 'circle');
      put(w.service, tAt(Math.min(L - 300, 2000)), Math.min(sideLen(r, w.service === 'front' || w.service === 'rear' ? 'left' : 'front') - 300, 800), 'FT', SVC.drain, 'circle');
      const g = onSide(r, w.service, tAt(450), 110);
      const gp = at(k, g.x, g.y); sym(c, gp, 'GY', SVC.hot, 'square', 11);
      const sp = at(k, sh.x, sh.y); drawLine(c, gp.x, gp.y + 11 * SYM_SCALE, sp.x, sp.y - 13 * SYM_SCALE, 1.5, SVC.hot);
      // Stack at the anchored end, outside the external wall where there is one.
      const corner = onSide(r, w.service, w.tEnd, 0);
      const inner = onSide(r, w.service, tAt(1250), 0);
      stackModel = !outSide ? onSide(r, w.service, tAt(1250), 120)
        : outSide === w.service ? onSide(r, w.service, tAt(1250), -130)
        : { x: outSide === 'left' ? r.x - 130 : outSide === 'right' ? r.x + r.w + 130 : (corner.x + inner.x) / 2 || inner.x,
            y: outSide === 'front' ? r.y - 130 : outSide === 'rear' ? r.y + r.d + 130 : (corner.y + inner.y) / 2 || inner.y };
      if (outSide && outSide !== w.service) { if (outSide === 'left' || outSide === 'right') stackModel.y = onSide(r, w.service, tAt(300), 300).y; else stackModel.x = onSide(r, w.service, tAt(300), 300).x; }
    } else {
      const ext = externalSides(k, r);
      const side = r.source.type === 'kitchen' ? kitchenCounter(k, r).long : (ext[0] ?? wetLayout(k, r).service);
      outSide = ext.includes(side) ? side : ext[0] ?? null;
      if (r.source.type === 'kitchen') { put(side, 0.5, 300, 'SK'); put(side, 0.5 + Math.min(0.3, 900 / sideLen(r, side)), 150, 'RO', SVC.water, 'circle'); }
      else put(side, 0.5, 350, 'WM');
      put(side, 0.5, 850, 'FT', SVC.drain, 'circle');
      stackModel = outSide === side ? onSide(r, side, 0.5 - Math.min(0.3, 700 / sideLen(r, side)), -130) : onSide(r, side, 0.2, 150);
    }
    // Supply: from the OHT down-take to the room's service wall.
    const first = pts[0];
    ortho(c, down, at(k, first.x, first.y), SVC.water, 2);
    // Drainage: fixtures to the soil/waste stack, then out of the building.
    const stack = at(k, stackModel.x, stackModel.y);
    for (const m of pts) { const p = at(k, m.x, m.y); ortho(c, p, stack, SVC.drain, 1.4, [7, 4]); }
    circle(c, stack.x, stack.y, 9, SVC.drain, SVC.drain);
    label(c, k.level === 0 ? 'SWR' : 'SVP ↓', stack.x + 12, stack.y - 14, 11, 'left', SVC.drain, true);
    if (k.level === 0) {
      const o = outSide ?? ((['front', 'rear', 'left', 'right'] as Side[]).map(sd => ({ sd, d: sd === 'front' ? stackModel.y - b0.y : sd === 'rear' ? b0.y + b0.h - stackModel.y : sd === 'left' ? stackModel.x - b0.x : b0.x + b0.w - stackModel.x })).sort((p, q) => p.d - q.d)[0].sd);
      const ic = outPt(stackModel, o, 700);
      const icp = at(k, ic.x, ic.y);
      ortho(c, stack, icp, SVC.drain, 2, [9, 4]);
      drawRect(c, icp.x - 12, icp.y - 12, 24, 24, { fill: '#fff', stroke: SVC.drain, weight: 2 });
      label(c, 'IC', icp.x, icp.y + 1, 10, 'center', SVC.drain, true);
      exits.push(ic);
    }
  }
  if (k.level === 0 && exits.length) {
    // Inspection chambers are linked around the setback to the front boundary (septic tank / sewer).
    const front = { x: b.x + b.w + 600, y: b.y - Math.max(600, k.g.setbacks.front * 0.6) };
    const sorted = [...exits].sort((p, q) => q.y - p.y);
    let prev = sorted[0];
    for (const e of sorted.slice(1)) { ortho(c, at(k, prev.x, prev.y), at(k, e.x, e.y), SVC.drain, 2, [9, 4]); prev = e; }
    ortho(c, at(k, prev.x, prev.y), at(k, front.x, front.y), SVC.drain, 2, [9, 4]);
    const fp = at(k, front.x, front.y);
    drawRect(c, fp.x - 16, fp.y - 12, 32, 24, { fill: '#fff', stroke: SVC.drain, weight: 2 });
    label(c, 'MH', fp.x, fp.y + 1, 10, 'center', SVC.drain, true);
    label(c, 'TO SEPTIC TANK / MUNICIPAL SEWER', fp.x - 20, fp.y - 26, 12, 'right', SVC.drain, true);
    const sump = at(k, b.x - 200, b.y - Math.max(500, k.g.setbacks.front * 0.5));
    drawRect(c, sump.x - 40, sump.y - 14, 80, 28, { fill: '#e8f3f8', stroke: SVC.water, weight: 2 });
    label(c, 'UG SUMP', sump.x, sump.y + 1, 11, 'center', SVC.water, true);
    ortho(c, sump, down, SVC.water, 1.5, [3, 3]);
  }
  // Rainwater pipes at the four building corners.
  for (const [x, y, dx] of [[b.x - 200, b.y + 300, -1], [b.x + b.w + 200, b.y + 300, 1], [b.x - 200, b.y + b.h - 300, -1], [b.x + b.w + 200, b.y + b.h - 300, 1]]) {
    const p = at(k, x, y); circle(c, p.x, p.y, 7, '#fff', SVC.water, 1.5); label(c, 'RWP', p.x + dx * 10, p.y - 12, 10, dx < 0 ? 'right' : 'left', SVC.water);
  }
  circle(c, down.x, down.y, 10, SVC.water, SVC.water);
  label(c, 'DOWN-TAKE FROM OHT', down.x + 14, down.y - 12, 11, 'left', SVC.water, true);
  rowsOut.push(['TOTAL ' + (k.level === 0 ? 'GF' : 'FF'), `${tot.ewc}`, `${tot.basin}`, `${tot.shower}`, `${tot.sink + tot.purifier + tot.washer}`, `${tot.floorTrap}`, `${tot.points}`]);
  const whole = fixtureTotals(k.layout.floors.flatMap(f => f.rooms));
  rowsOut.push(['WHOLE HOUSE (= BOQ)', `${whole.ewc}`, `${whole.basin}`, `${whole.shower}`, `${whole.sink + whole.purifier + whole.washer}`, `${whole.floorTrap}`, `${whole.points}`]);
  const y = table(c, 1420, 150, [{ h: 'ROOM', w: 230 }, { h: 'WC', w: 40 }, { h: 'WB', w: 40 }, { h: 'SH', w: 40 }, { h: 'SK/RO/WM', w: 76 }, { h: 'FT', w: 40 }, { h: 'PTS', w: 50 }], rowsOut, `SANITARY FIXTURE SCHEDULE — ${floorName(k)}`);
  legend(c, 1420, y + 40, 'LEGEND', [
    'WC EWC + health faucet (HF)    WB wash basin',
    'SH shower (900×900 zone)       GY geyser 15–25 L',
    'SK sink  RO purifier inlet     WM washing machine',
    'FT floor trap   IC inspection chamber   MH manhole',
    '━ cold supply CPVC 20–25 mm     ━ hot supply (red)',
    '- - - waste/soil SWR 75/110 mm, fall ≥ 1:40 (waste), 1:60 (soil)',
    k.level === 0 ? 'Upper-floor stacks drop to the ICs shown here.' : 'SVP ↓ stacks drop to ground-floor inspection chambers.',
    'Sizes preliminary; plumber to confirm levels on site.',
  ]);
}

/* 15. Floor & wall tiling layout. */
function tiling(k: Context): void {
  const c = k.c; svcFrame(k); drawPlanWalls(k, 'light');
  const rooms = svcRooms(k);
  const takeoff = (k.boq as (BOQ & { takeoff?: Takeoff }) | null)?.takeoff;
  const tileH = takeoff?.bathTileHeightM ?? 2.1;
  const rowsOut: string[][] = [];
  const t = { vit: 0, anti: 0, balc: 0, wall: 0, dado: 0 };
  for (const r of rooms) {
    const type = r.source.type;
    const area = (r.w / 1000) * (r.d / 1000);
    const q = box(k, clearRect(k, r));
    const wetFloor = type === 'toilet' || type === 'utility';
    let finish = 'Vitrified 600×600', tile = 600, fill = SVC.tileA, cat: keyof typeof t | null = 'vit';
    if (wetFloor) { finish = 'Anti-skid matt 300×300'; tile = 300; fill = SVC.wetTile; cat = 'anti'; }
    else if (type === 'balcony') { finish = 'Rustic anti-skid 300×300'; tile = 300; fill = SVC.tileB; cat = 'balc'; }
    else if (type === 'staircase') { finish = 'Granite treads & risers'; tile = 0; fill = '#ece8e1'; cat = null; }
    else if (type === 'parking') { finish = 'Paver / IPS (site works)'; tile = 0; fill = '#eeeeee'; cat = null; }
    if (cat) t[cat] += area;
    drawRect(c, q.x, q.y, q.w, q.h, { fill, stroke: COLORS.wall, weight: PEN.medium });
    if (tile) {
      c.save(); c.beginPath(); c.rect(q.x, q.y, q.w, q.h); c.clip(); c.strokeStyle = '#9aa7ad'; c.lineWidth = 0.6;
      const s = tile * k.scale;
      for (let x = q.x + s; x < q.x + q.w; x += s) { c.beginPath(); c.moveTo(x, q.y); c.lineTo(x, q.y + q.h); c.stroke(); }
      for (let y = q.y + s; y < q.y + q.h; y += s) { c.beginPath(); c.moveTo(q.x, y); c.lineTo(q.x + q.w, y); c.stroke(); }
      c.restore();
    } else if (type === 'staircase') {
      for (let i = 1; i < 10; i++) drawLine(c, q.x + q.w * i / 10, q.y, q.x + q.w * i / 10, q.y + q.h, 0.8, COLORS.grid);
    }
    let wall = 0, dado = 0;
    if (type === 'toilet') {
      wall = bathWallTileSqM(r.source, tileH); t.wall += wall;
      c.save(); c.strokeStyle = '#2b7a99'; c.lineWidth = 6; c.globalAlpha = 0.55; c.strokeRect(q.x + 4, q.y + 4, q.w - 8, q.h - 8); c.restore();
    }
    if (type === 'kitchen') {
      const rmt = kitchenCounterRmt(r.source); dado = rmt * KITCHEN_DADO_HEIGHT_M; t.dado += dado;
      const { long, short } = kitchenCounter(k, r);
      const cd = 600 * k.scale;
      const strip = (sd: Side) => { if (sd === 'front') c.fillRect(q.x, q.y, q.w, cd); else if (sd === 'rear') c.fillRect(q.x, q.y + q.h - cd, q.w, cd); else if (sd === 'left') c.fillRect(q.x, q.y, cd, q.h); else c.fillRect(q.x + q.w - cd, q.y, cd, q.h); };
      c.save(); c.fillStyle = '#c9c2b6'; c.globalAlpha = 0.85; strip(long); strip(short); c.restore();
      label(c, 'GRANITE COUNTER + DADO 600', q.x + q.w / 2, q.y + q.h / 2 + 22, 10, 'center', COLORS.dim, true);
    }
    roomLabel(k, r, { corner: true, color: COLORS.text });
    { c.save(); c.font = '10px Arial, sans-serif'; const fw2 = c.measureText(finish).width; c.restore(); if (fw2 < q.w - 10) label(c, finish, q.x + q.w / 2, q.y + q.h - 12, 10, 'center', COLORS.dim); }
    rowsOut.push([r.source.name, finish, area.toFixed(2), wall ? wall.toFixed(2) : dado ? dado.toFixed(2) : '–']);
  }
  for (const o of k.g.openings.filter(v => v.floor === k.level)) planOpening(c, k, o);
  rowsOut.push([`TOTAL ${k.level === 0 ? 'GF' : 'FF'}`, `Vit ${t.vit.toFixed(1)} • Anti ${t.anti.toFixed(1)} • Balc ${t.balc.toFixed(1)}`, '', `${(t.wall + t.dado).toFixed(1)}`]);
  const y = table(c, 1420, 150, [{ h: 'ROOM', w: 175 }, { h: 'FLOOR FINISH', w: 215 }, { h: 'FLOOR m²', w: 75 }, { h: 'WALL m²', w: 75 }], rowsOut, `FINISH SCHEDULE — ${floorName(k)}`);
  const lines = takeoff ? [
    `Vitrified 600×600: ${takeoff.floorFinish.vitrifiedSqM} m²`,
    `Anti-skid bath/utility: ${takeoff.floorFinish.antiSkidSqM} m²`,
    `Bath wall tiles to ${tileH} m: ${takeoff.bathWallTileSqM} m²`,
    `Kitchen dado 600 mm: ${takeoff.kitchenDadoSqM} m² • Counter ${takeoff.kitchenCounterRmt} Rmt`,
    `Balcony rustic: ${takeoff.floorFinish.balconySqM} m² • Stair treads: ${takeoff.floorFinish.stairTreads} nos`,
  ] : ['BOQ not yet generated — totals shown per floor only.'];
  legend(c, 1420, y + 40, 'WHOLE HOUSE (= BOQ)', lines);
  legend(c, 1420, y + 230, 'NOTES', [
    `Bath walls tiled to ${tileH} m (blue band); floors laid to fall towards floor traps.`,
    'Skirting 100 mm in dry rooms; granite thresholds at all doors.',
    'Start tiling from room centre lines; cut tiles ≥ half size at walls.',
    'Floor areas are net room areas from the locked plan.',
  ]);
  label(c, `${floorName(k)} TILING LAYOUT`, 100, 140, 16, 'left', COLORS.dim);
}

/* 16. Brickwork / masonry layout. */
function brickwork(k: Context): void {
  const c = k.c; planFrame(k);
  const rooms = svcRooms(k);
  const b = box(k, k.g.building);
  drawPlanWalls(k, 'brick');
  for (const r of rooms) {
    roomLabel(k, r);
    if (r.source.type === 'balcony') for (const sd of externalSides(k, r)) {
      const m = onSide(r, sd, 0.5, sd === 'front' || sd === 'rear' ? -260 : -260), p = at(k, m.x, m.y);
      void p;
    }
  }
  void b;
  drawColumns(k);
  // Openings with lintels (150 mm bearing each side).
  const ops = k.g.openings.filter(v => v.floor === k.level);
  const lintels = new Map<number, number>();
  for (const o of ops) {
    planOpening(c, k, o);
    openingTag(k, o);
    const span = Math.round(o.b - o.a);
    lintels.set(span, (lintels.get(span) ?? 0) + 1);
    const mid = (openingBand(o)[0] + openingBand(o)[1]) / 2;
    const a = o.axis === 'horizontal' ? at(k, o.a - 150, mid) : at(k, mid, o.a - 150);
    const e = o.axis === 'horizontal' ? at(k, o.b + 150, mid) : at(k, mid, o.b + 150);
    dashed(c, a, e, '#8e44ad', PEN.medium, [5, 3]);
  }
  planDimensions(k, true);
  const tf = (k.boq as (BOQ & { takeoff?: Takeoff }) | null)?.takeoff ?? computeTakeoff(k.layout);
  const fl = tf.floors[k.level] ?? tf.floors[0];
  const rowsOut: string[][] = [
    ['External wall length', `${fl?.externalWallLenM ?? 0} m`, `${WALL_EXTERNAL_MM} mm`],
    ['Internal wall length', `${fl?.internalWallLenM ?? 0} m`, `${WALL_INTERNAL_MM} mm`],
    ['Masonry height (floor − beam)', `${tf.masonryHeightM} m`, ''],
    ['Net ext. masonry (less openings)', `${fl?.netExtMasonrySqM ?? 0} m²`, `${((fl?.netExtMasonrySqM ?? 0) * WALL_EXTERNAL_MM / 1000).toFixed(2)} m³`],
    ['Net int. masonry (less openings)', `${fl?.netIntMasonrySqM ?? 0} m²`, `${((fl?.netIntMasonrySqM ?? 0) * WALL_INTERNAL_MM / 1000).toFixed(2)} m³`],
    ['WHOLE HOUSE ext. (= BOQ)', `${tf.externalMasonrySqM} m²`, `${(tf.externalMasonrySqM * WALL_EXTERNAL_MM / 1000).toFixed(2)} m³`],
    ['WHOLE HOUSE int. (= BOQ)', `${tf.internalMasonrySqM} m²`, `${(tf.internalMasonrySqM * WALL_INTERNAL_MM / 1000).toFixed(2)} m³`],
  ];
  let y = table(c, 1420, 150, [{ h: 'ITEM', w: 285 }, { h: 'QTY', w: 110 }, { h: 'VOL / THK', w: 115 }], rowsOut, `MASONRY QUANTITIES — ${floorName(k)}`);
  const lrows = [...lintels.entries()].sort((p, q) => p[0] - q[0]).map(([span, n]) => [`Opening ${span} mm`, `${span + 300} mm long`, `${n} nos`]);
  y = table(c, 1420, y + 40, [{ h: 'LINTEL (230 × 150, M25)', w: 285 }, { h: 'LENGTH', w: 110 }, { h: 'QTY', w: 115 }], lrows.length ? lrows : [['No openings on this floor', '', '']], 'LINTEL SCHEDULE');
  legend(c, 1420, y + 40, 'NOTES', [
    `External ${WALL_EXTERNAL_MM} mm brick, CM 1:6, English bond; internal ${WALL_INTERNAL_MM} mm, CM 1:4.`,
    'Lintels bear 150 mm each side (purple dashes); chajja over external windows.',
    'Wet-area walls: waterproof plaster to 300 mm above floor.',
    'Bricks soaked before use; max 1.0 m lift per day.',
  ]);
  viewTitle(k, `${floorName(k)} MASONRY & LINTEL PLAN`, 80, 140);
}

function header(k: Context): void {
  const c = k.c;
  drawRect(c, 24, 24, SHEET_W - 48, SHEET_H - 48, { stroke: COLORS.wall, weight: PEN.cut });
  label(c, k.title, MARGIN + 12, 65, 27, 'left', COLORS.green, true);
  label(c, `${k.sheetNo}   •   ALL DIMENSIONS IN mm UNLESS NOTED   •   LEVELS IN m`, SHEET_W - MARGIN - 8, 66, 14, 'right', COLORS.dim);
  drawLine(c, 40, 99, SHEET_W - 40, 99, PEN.thin, COLORS.grid);
}
function titleBlock(k: Context): void {
  const c = k.c, W = 900, H = 200, x = SHEET_W - MARGIN - W, y = SHEET_H - TITLE_H - 20;
  drawRect(c, x, y, W, H, { fill: '#fff', stroke: COLORS.wall, weight: PEN.cut });
  const hl = (yy: number, x0 = x, x1 = x + W) => drawLine(c, x0, y + yy, x1, y + yy, PEN.thin, COLORS.wall);
  const vl = (xx: number, y0: number, y1: number) => drawLine(c, x + xx, y + y0, x + xx, y + y1, PEN.thin, COLORS.wall);
  hl(58); hl(160); vl(560, 58, 160); hl(92, x + 560); hl(126, x + 560); vl(730, 58, 160);
  label(c, 'neevv', x + 18, y + 29, 33, 'left', COLORS.green, true);
  label(c, 'Architecture • Structure • MEP • Interiors', x + 170, y + 31, 14, 'left', COLORS.dim);
  label(c, 'DRAFT DESIGN', x + W - 16, y + 31, 12, 'right', COLORS.dim, true);
  const t = k.level > 0 && PER_FLOOR.includes(k.type) ? `${k.title} — ${floorName(k)}` : k.title;
  label(c, t.length > 44 ? t.slice(0, 43) + '…' : t, x + 16, y + 78, 17, 'left', COLORS.text, true);
  label(c, `PLOT ${round(k.g.plotW)} × ${round(k.g.plotD)} mm  •  ${k.req.city}, ${k.req.state}`, x + 16, y + 106, 13);
  label(c, `ROAD FACING ${k.req.facing}  •  LOCKED PLAN REV ${k.rev}`, x + 16, y + 128, 13);
  label(c, `DATE ${new Date().toLocaleDateString('en-GB')}`, x + 16, y + 148, 12, 'left', COLORS.dim);
  const cell = (cx: number, cy: number, h: string, v: string, big = false) => { label(c, h, x + cx + 8, y + cy + 9, 9, 'left', COLORS.dim, true); label(c, v, x + cx + 8, y + cy + 24, big ? 16 : 13, 'left', COLORS.text, true); };
  const idx = sheetIndex(k.g.floors), pos = idx.findIndex(e => e.no === k.sheetNo);
  cell(560, 58, 'DRG NO', k.sheetNo, true); cell(730, 58, 'REV', `P${k.rev}`, true);
  cell(560, 92, 'SCALE (A3)', scaleText(k)); cell(730, 92, 'SHEET', pos >= 0 ? `${pos + 1} of ${idx.length}` : '—');
  cell(560, 126, 'DRAWN', 'neevv engine'); cell(730, 126, 'CHECKED', 'pending');
  label(c, 'PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION', x + 14, y + 180, 11, 'left', COLORS.dim);
  label(c, 'DO NOT SCALE — FOLLOW WRITTEN DIMENSIONS • GENERATED FROM THE LOCKED PLAN • REVIEW BY ARCHITECT / STRUCTURAL ENGINEER PENDING',
    MARGIN + 12, SHEET_H - 43, 12, 'left', COLORS.dim);
}

/** Drawing types that have programmatic (non-AI) renderers. */
export const PROGRAMMATIC_TYPES = [
  'excavation', 'column_layout', 'footing_detail', 'beam_slab',
  'column_detail', 'bar_bending', 'section_aa', 'front_elevation',
  'staircase_detail', 'water_tank', 'waterproofing', 'stp_detail',
  'electrical', 'plumbing', 'tiling_layout', 'brickwork_detail',
  'working_plan', 'door_window_schedule',
] as const;

/** Render a coordinated A3 landscape construction drawing and return a PNG data URL. */
export function generateProgrammaticDrawing(
  drawingType: string, layout: Layout, requirements: ProjectRequirements,
  structuralResult?: any, boq?: BOQ | null, floor?: 'GF' | 'FF',
): string {
  if (typeof document === 'undefined') throw new Error('Canvas drawing requires a browser document.');
  SYM_SCALE = 1;
  const canvas = document.createElement('canvas'); canvas.width = SHEET_W; canvas.height = SHEET_H;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Unable to obtain Canvas 2D context.');
  const data = obj(structuralResult as unknown);
  const g = makeGeometry(layout, requirements, data);
  const drawing = drawingType as DrawingType;
  if (!Object.prototype.hasOwnProperty.call(titleFor, drawing))
    throw new Error(`Unsupported programmatic drawing type: ${drawingType}`);
  const level: Level = floor === 'FF' && g.floors > 1 ? 1 : 0;
  const k: Context = { c, g, layout, req: requirements, data, boq: boq ?? null,
    level, frame: { x: 0, y: 0, s: 1, width: 0, height: 0 }, scale: 1,
    title: titleFor[drawing], views: [], type: drawing, sheetNo: sheetNumber(drawing, level),
    rev: Math.max(1, Math.round(finite((layout as Layout & { revision?: number }).revision, 1))) };
  AUDIT = { labels: [], checks: [], scales: [] };
  try {
  c.fillStyle = '#fff'; c.fillRect(0, 0, SHEET_W, SHEET_H);
  header(k);
  c.save(); c.beginPath(); c.rect(45, 105, SHEET_W - 90, DRAW_BOTTOM - 105); c.clip();
  switch (drawing) {
    case 'excavation': excavation(k); break;
    case 'column_layout': columnLayout(k); break;
    case 'footing_detail': footingDetail(k); break;
    case 'beam_slab': beamSlab(k); break;
    case 'column_detail': columnDetail(k); break;
    case 'bar_bending': barBending(k); break;
    case 'section_aa': sectionAA(k); break;
    case 'front_elevation': frontElevation(k); break;
    case 'staircase_detail': staircaseDetail(k); break;
    case 'water_tank': waterTank(k); break;
    case 'waterproofing': waterproofing(k); break;
    case 'stp_detail': stpDetail(k); break;
    case 'electrical': electrical(k); break;
    case 'plumbing': plumbing(k); break;
    case 'tiling_layout': tiling(k); break;
    case 'brickwork_detail': brickwork(k); break;
    case 'working_plan': workingPlan(k); break;
    case 'door_window_schedule': doorWindowSchedule(k); break;
  }
  c.restore();
  titleBlock(k);
  // ── drafting audit: preferred scales, overlapping text ──
  const a = AUDIT;
  const odd = k.views.filter(d => !STD_SCALES.includes(d));
  a.checks.push({ item: 'Preferred scale (IS 962)', status: odd.length ? 'ERROR' : 'PASS', detail: k.views.length ? k.views.map(d => `1:${d}`).join(', ') : 'diagrammatic sheet (NTS)' });
  const L = a.labels.filter(l => l.x1 - l.x0 > 2);
  const clashes: string[] = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const p = L[i], q = L[j];
    const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    if (ox <= 1 || oy <= 1) continue;
    const small = Math.min((p.x1 - p.x0) * (p.y1 - p.y0), (q.x1 - q.x0) * (q.y1 - q.y0));
    if (ox * oy > 0.2 * small) clashes.push(`"${p.t}" × "${q.t}"`);
  }
  a.checks.push({ item: 'No overlapping text', status: clashes.length ? 'WARNING' : 'PASS', detail: clashes.length ? `${clashes.length}: ${clashes.slice(0, 6).join('; ')}` : `${L.length} labels clear` });
  DRAFTING_AUDIT[`${drawing}-${level === 0 ? 'GF' : 'FF'}`] = a.checks;
  return canvas.toDataURL('image/png');
  } finally { AUDIT = null; }
}
