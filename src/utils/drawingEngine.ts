'use client';

import type { Layout, Room, ProjectRequirements, BOQ, Column, Setbacks, LayoutOpening, RoomInterior, FurnitureItem } from '../types';
import { planCircuits, circuitDemand, ASSUMED_FOUNDING_DEPTH_M, PARAPET_HEIGHT_MM, ELEC_KINDS, electricalBreakdown, electricalPoints, fixturesFor, fixtureTotals, isNiche, WALL_EXTERNAL_MM, WALL_INTERNAL_MM } from './quantityRules';
import { COMPOUND_WALL_HEIGHT_MM, COMPOUND_WALL_THICKNESS_MM, FLOOR_TO_FLOOR_MM, PLINTH_HEIGHT_MM, STAIR_HEAD_ROOM_MM, floorLevelMm, gateCentreM, gateWidthM, mainDoorCentreM, ohtPlacement, ohtTanks, rainwaterPipes, roofLevelMm, sumpPlacement, sumpSizeM, waterStorage } from './buildingModel';
import { VectorContext, type VectorSheet } from './vectorCanvas';
import { officeServices, isOfficeLayout, type ServicePoint } from './officeServices';
import { getDefaultFurniture, mapRoomTypeToFinish } from './interiorTemplates';
import { wallTileBand, floorModule, skirtingMm } from './interiorSpecs';
import { styleFor, roofGeom, roofProfile } from './designStyles';
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
  'working_plan' | 'door_window_schedule' | 'site_plan' | 'terrace_plan' | 'side_elevation' | 'section_bb' | 'cover_sheet' | 'wet_areas' | 'typical_details'
  | 'int_furniture' | 'int_rcp' | 'int_electrical' | 'int_flooring' | 'int_elevations' | 'int_woodwork'
  | 'office_furniture' | 'hvac' | 'fire_safety';

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
interface ModelColumn { x: number; y: number; w: number; d: number; supplied?: Column; mark?: string; }
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
  /** interior sheets: the room's placement and the customer's selection */
  int?: { plan: InteriorPlan; interior?: RoomInterior };
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
  footing_detail: 'FOUNDATION DETAILS', beam_slab: 'RCC BEAM & SLAB LAYOUT',
  column_detail: 'COLUMN SCHEDULE & BEAM DETAIL', bar_bending: 'BAR BENDING SCHEDULE',
  section_aa: 'BUILDING SECTION 1–1', front_elevation: 'FRONT ELEVATION',
  staircase_detail: 'STAIRCASE PLAN & SECTION', water_tank: 'SUMP & OVERHEAD TANK DETAILS',
  waterproofing: 'WATERPROOFING DETAILS', stp_detail: 'STP SCHEMATIC LAYOUT',
  electrical: 'ELECTRICAL LAYOUT', plumbing: 'PLUMBING & DRAINAGE LAYOUT',
  tiling_layout: 'FLOOR & WALL TILING LAYOUT', brickwork_detail: 'MASONRY & LINTEL LAYOUT',
  working_plan: 'WORKING PLAN', door_window_schedule: 'DOOR & WINDOW SCHEDULE',
  site_plan: 'SITE PLAN', terrace_plan: 'TERRACE / ROOF PLAN', side_elevation: 'SIDE & REAR ELEVATIONS',
  section_bb: 'BUILDING SECTION 2–2', cover_sheet: 'COVER SHEET & DRAWING REGISTER',
  wet_areas: 'TOILET & KITCHEN ENLARGEMENTS', typical_details: 'TYPICAL CONSTRUCTION DETAILS',
  office_furniture: 'OFFICE FURNITURE LAYOUT', hvac: 'HVAC LAYOUT', fire_safety: 'FIRE SAFETY & ESCAPE PLAN',
  int_furniture: 'INTERIOR FURNITURE LAYOUT', int_rcp: 'REFLECTED CEILING PLAN', int_electrical: 'INTERIOR ELECTRICAL & LIGHTING',
  int_flooring: 'FLOORING LAYOUT', int_elevations: 'INTERIOR WALL ELEVATIONS', int_woodwork: 'WOODWORK DETAILS',
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
/* ── Deferred ("soft") labels ──
 * Room names, door/window tags and member marks are queued while a sheet is drawn and placed last,
 * each at the first candidate position whose box is clear of everything already lettered on the sheet
 * (dimension text, symbols, schedules, earlier soft labels). Fixed items never move. */
interface SoftLabel { w: number; h: number; cands: Point[]; draw: (x: number, y: number) => void; optional?: boolean }
let SOFT: SoftLabel[] | null = null;
function textWidth(c: CanvasRenderingContext2D, t: string, size: number, bold = false): number {
  c.save(); c.font = `${bold ? '700 ' : ''}${size}px Arial, sans-serif`; const w = c.measureText(t).width; c.restore(); return w;
}
/** optional: the label is left off (it is named in the sheet's schedule) when no clear spot exists. */
function soft(w: number, h: number, cands: Point[], draw: (x: number, y: number) => void, optional = false): void {
  if (!SOFT) { draw(cands[0].x, cands[0].y); return; }
  SOFT.push({ w, h, cands, draw, optional });
}
function resolveSoft(): void {
  if (!SOFT) return;
  const queue = SOFT; SOFT = null;
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = AUDIT ? AUDIT.labels.map(l => ({ ...l })) : [];
  const overlap = (b: { x0: number; y0: number; x1: number; y1: number }) => boxes.reduce((sum, o) => {
    const ox = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0), oy = Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0);
    return sum + (ox > 0.5 && oy > 0.5 ? ox * oy : 0);
  }, 0);
  for (const q of queue) {
    let best = q.cands[0], bestScore = Infinity;
    for (const p of q.cands) {
      const sc = overlap({ x0: p.x - q.w / 2, y0: p.y - q.h / 2, x1: p.x + q.w / 2, y1: p.y + q.h / 2 });
      if (sc < bestScore - 1e-6) { best = p; bestScore = sc; }
      if (sc === 0) break;
    }
    if (bestScore > 0 && q.optional) continue;
    q.draw(best.x, best.y);
    boxes.push({ x0: best.x - q.w / 2, y0: best.y - q.h / 2, x1: best.x + q.w / 2, y1: best.y + q.h / 2 });
  }
}
/** Candidate points around (x, y) in rings of the given steps (first: the point itself). */
function ringCands(x: number, y: number, sx: number, sy: number, rings = 3): Point[] {
  const out: Point[] = [{ x, y }];
  for (let r = 1; r <= rings; r++) for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]) out.push({ x: x + dx * sx * r, y: y + dy * sy * r });
  return out;
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
  // Narrow segments: smaller figures, and a figure that would run into its neighbour goes to the other side of the line.
  let lastEnd = -Infinity, lastFlipped = false;
  for (let i = 1; i < p.length; i++) {
    const dim = round((p[i] - p[i - 1]) / Math.max(scaleFactor, 1e-9));
    const center = (p[i] + p[i - 1]) / 2, seg = p[i] - p[i - 1];
    const size = seg < textWidth(c, dim, 14) + 4 ? 11 : 14, w = textWidth(c, dim, size);
    const flip: boolean = center - w / 2 < lastEnd + 3 && !lastFlipped;
    const across = flip ? (horizontal ? coord + 12 : coord + 12) : (horizontal ? coord - 13 : coord - 12);
    if (horizontal) label(c, dim, center, across, size, 'center', COLORS.dim);
    else { c.save(); c.translate(across, center); c.rotate(-Math.PI / 2); label(c, dim, 0, 0, size, 'center', COLORS.dim); c.restore(); }
    lastFlipped = flip; lastEnd = flip ? lastEnd : center + w / 2;
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
  // Plans are drawn with the frontage (road) at the TOP of the sheet, viewed from above.
  // Road on the north → north points up; road on the east → east is up, so north points left.
  const a = facing === 'North' ? -Math.PI / 2 : facing === 'South' ? Math.PI / 2 :
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
    // office washrooms are drawn, plumbed and tiled as toilets
    .map(r0 => { const source = /^washroom/.test(String(r0.type)) ? { ...r0, type: 'toilet' as Room['type'] } : r0;
      return { source, x: mm(source.x), y: mm(source.y), w: mm(source.width), d: mm(source.depth) }; }));
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
    w: positive(v.widthMm, 300), d: positive(v.depthMm, 300), mark: sval(v, 'mark', '') || undefined,
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
  { const w = textWidth(c, 'PLOT BOUNDARY', 14); soft(w, 16, [0, 0.35, 0.7].map(f => ({ x: p.x + 7 + w / 2 + f * Math.max(0, p.w - w - 14), y: p.y - 12 })), (x, y) => label(c, 'PLOT BOUNDARY', x, y, 14, 'center')); }
  { const w = textWidth(c, 'BUILDING LINE', 11); soft(w, 13, [0, 0.35, 0.7].flatMap(f => [-12, 12].map(dy => ({ x: b.x + 5 + w / 2 + f * Math.max(0, b.w - w - 10), y: b.y + dy }))), (x, y) => label(c, 'BUILDING LINE', x, y, 11, 'center', COLORS.grid)); }
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
function drawPlanRooms(k: Context, light = false, cornerLabels = false, labels = true): void {
  drawPlanWalls(k, light ? 'light' : 'solid');
  for (const o of k.g.openings.filter(v => v.floor === k.level)) planOpening(k.c, k, o);
  if (labels) for (const r of selected(k)) if (cornerLabels || r.source.type !== 'staircase') roomLabel(k, r, { corner: cornerLabels });
}
// at small scales the default 900 mm stand-off is only a few pixels: keep the marker clear of the dimension strings
function drawSectionMark(k: Context): void { sectionMarker(k, sectionCutY(k), '1', sheetNumber('section_aa', 0), Math.max(900 * k.scale, 120)); }
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
  const draw = (x: number, y: number) => {
    if (o.source.type === 'door') { drawRect(c, x - 15, y - 9, 30, 18, { fill: '#fff', stroke: COLORS.wall, weight: PEN.hair }); }
    else { c.save(); c.beginPath(); c.ellipse(x, y, 16, 9, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = PEN.hair; c.strokeStyle = COLORS.wall; c.stroke(); c.restore(); }
    label(c, mark, x, y + 0.5, 11, 'center', COLORS.text, true);
  };
  // slide along the opening first, then further away from the wall
  const along1 = h ? { x: 1, y: 0 } : { x: 0, y: 1 }, acrossDir = h ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const cands: Point[] = [p];
  for (const t of [18, -18, 34, -34]) cands.push({ x: p.x + along1.x * t, y: p.y + along1.y * t });
  for (const t of [20, -20]) for (const u of [0, 18, -18]) cands.push({ x: p.x + acrossDir.x * t + along1.x * u, y: p.y + acrossDir.y * t + along1.y * u });
  soft(32, 18, cands, draw);
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
  if (opts.corner) {
    const bw0 = Math.max(...lines.map(l => textWidth(c, l, size, true))), bh0 = lines.length * (size + 2);
    const at0 = (cx: number, cy: number) => ({ x: cx, y: cy });
    const cands = [at0(q.x + 6 + bw0 / 2, q.y + 5 + bh0 / 2), at0(q.x + q.w - 6 - bw0 / 2, q.y + 5 + bh0 / 2), at0(q.x + 6 + bw0 / 2, q.y + q.h - 5 - bh0 / 2), at0(q.x + q.w - 6 - bw0 / 2, q.y + q.h - 5 - bh0 / 2), at0(q.x + q.w / 2, q.y + q.h / 2)];
    soft(bw0, bh0, cands, (cx, cy) => lines.forEach((l, i) => label(c, l, cx - bw0 / 2, cy - bh0 / 2 + (size + 2) / 2 + i * (size + 2), size, 'left', opts.color ?? COLORS.dim, true)), true);
    return;
  }
  const sub: string[] = [];
  const dims = `${round(cr.w)} × ${round(cr.h)}`;
  if (fits(dims, size * 0.8, false)) sub.push(dims);
  if (opts.area) { const a = `${(cr.w * cr.h / 1e6).toFixed(2)} m²`; if (fits(a, size * 0.8, false)) sub.push(a); }
  if (opts.ffl && fits(opts.ffl, size * 0.75, false)) sub.push(opts.ffl);
  const lh = size + 3, sh = size * 0.8 + 3;
  const room = q.h - 8; while (sub.length && lines.length * lh + sub.length * sh > room) sub.pop();
  const total = Math.min(lines.length * lh + sub.length * sh, room);
  const bw = Math.max(...lines.map(l => textWidth(c, l, size, true)), ...sub.map(s2 => textWidth(c, s2, size * 0.8)));
  const draw = (cx: number, cy: number) => {
    let y = cy - total / 2 + lh / 2;
    for (const l of lines) { label(c, l, cx, y, size, 'center', opts.color ?? COLORS.text, true); y += lh; }
    for (const s2 of sub) { label(c, s2, cx, y - 1, size * 0.8, 'center', COLORS.dim); y += sh; }
  };
  // candidates stay inside the room's clear rectangle
  const mx = Math.max(0, (q.w - bw) / 2 - 4), my = Math.max(0, (q.h - total) / 2 - 4), cx0 = q.x + q.w / 2, cy0 = q.y + q.h / 2;
  const cands: Point[] = [{ x: cx0, y: cy0 }];
  for (const f of [0.5, 1]) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) cands.push({ x: cx0 + dx * mx * f, y: cy0 + dy * my * f });
  soft(bw, total, cands, draw);
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
  // grid lines closer than a bubble (corridor walls) alternate onto a second row
  const stagger = (ps: number[]) => { const out: boolean[] = []; ps.forEach((p, i) => out.push(i > 0 && !out[i - 1] && p - ps[i - 1] < 2 * R + 2)); return out; };
  const pxs = k.g.gridX.map(x => at(k, x, 0).x), sx = stagger(pxs);
  k.g.gridX.forEach((_, i) => {
    const px = pxs[i], extra = sx[i] ? 2 * R + 4 : 0;
    dashed(c, { x: px, y: B.y - outPx - extra + R }, { x: px, y: B.y + B.h + (sides.includes('bottom') ? outPx + extra - R : 0) }, COLORS.grid, PEN.hair, [16, 4, 3, 4]);
    for (const sd of sides.filter(s2 => s2 === 'top' || s2 === 'bottom')) { const py = sd === 'top' ? B.y - outPx - extra : B.y + B.h + outPx + extra; circle(c, px, py, R, '#fff', COLORS.wall, PEN.thin); label(c, gridLetter(i), px, py, 13, 'center', COLORS.text, true); }
  });
  const pys = k.g.gridY.map(y => at(k, 0, y).y), sy = stagger(pys);
  k.g.gridY.forEach((_, i) => {
    const py = pys[i], extra = sy[i] ? 2 * R + 4 : 0;
    dashed(c, { x: B.x - outPx - extra + R, y: py }, { x: B.x + B.w + (sides.includes('right') ? outPx + extra - R : 0), y: py }, COLORS.grid, PEN.hair, [16, 4, 3, 4]);
    for (const sd of sides.filter(s2 => s2 === 'left' || s2 === 'right')) { const px = sd === 'left' ? B.x - outPx - extra : B.x + B.w + outPx + extra; circle(c, px, py, R, '#fff', COLORS.wall, PEN.thin); label(c, `${i + 1}`, px, py, 13, 'center', COLORS.text, true); }
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
/** Vertical section marker (section 2–2, looking towards the right-hand side so the road is on the section's left). */
function sectionMarkerV(k: Context, cutX: number, id: string, ref: string, outPx?: number): void {
  const c = k.c, b = k.g.building, off = outPx ?? 900 * k.scale;
  const a = { x: at(k, cutX, b.y).x, y: at(k, cutX, b.y).y - off }, e = { x: a.x, y: at(k, cutX, b.y + b.h).y + off };
  c.save(); c.setLineDash([22, 5, 4, 5]); drawLine(c, a.x, a.y + 18, e.x, e.y - 18, PEN.medium, COLORS.wall); c.restore();
  for (const p of [a, e]) {
    circle(c, p.x, p.y, 18, '#fff', COLORS.wall, PEN.medium);
    drawLine(c, p.x - 18, p.y, p.x + 18, p.y, PEN.thin);
    label(c, id, p.x, p.y - 8, 12, 'center', COLORS.text, true);
    label(c, ref, p.x, p.y + 8, 9, 'center', COLORS.text);
    c.save(); c.fillStyle = COLORS.wall; c.beginPath(); c.moveTo(p.x + 18, p.y - 9); c.lineTo(p.x + 18, p.y + 9); c.lineTo(p.x + 32, p.y); c.fill(); c.restore();
  }
}
/** Section 2–2 cut: through the centre of the largest ground-floor room that is not the stair. */
function sectionCutX(k: Context): number {
  const rooms = (k.g.rooms[0] ?? []).filter(r => r.source.type !== 'staircase' && !isNiche(r.source)).sort((p, q) => q.w * q.d - p.w * p.d);
  return rooms[0] ? rooms[0].x + rooms[0].w / 2 : k.g.building.x + k.g.building.w / 2;
}
/** Section cut line used by plans and the section: through the staircase when there is one. */
function sectionCutY(k: Context): number {
  const st = (k.g.rooms[0] ?? []).find(r => r.source.type === 'staircase');
  return st ? st.y + st.d * 0.3 : k.g.building.y + k.g.building.h / 2;
}
/* Sheet numbering (A architecture, S structure, M masonry, E electrical, P plumbing, F finishes, D details). */
const SHEET_BASE: Partial<Record<DrawingType, string>> = {
  cover_sheet: 'G-001', site_plan: 'A-001', working_plan: 'A-101', section_bb: 'A-302', terrace_plan: 'A-109', front_elevation: 'A-201', side_elevation: 'A-202', section_aa: 'A-301', door_window_schedule: 'A-401', staircase_detail: 'A-501', wet_areas: 'A-601', typical_details: 'A-602',
  excavation: 'S-101', column_layout: 'S-102', footing_detail: 'S-103', beam_slab: 'S-104', column_detail: 'S-105', bar_bending: 'S-106',
  brickwork_detail: 'M-101', electrical: 'E-101', plumbing: 'P-101', water_tank: 'P-201', stp_detail: 'P-202',
  tiling_layout: 'F-101', waterproofing: 'D-101',
  office_furniture: 'A-701', hvac: 'M-201', fire_safety: 'FP-101',
};
const PER_FLOOR: DrawingType[] = ['working_plan', 'brickwork_detail', 'electrical', 'plumbing', 'tiling_layout', 'office_furniture', 'hvac', 'fire_safety'];
/** Sheets drawn only for office buildings. */
const OFFICE_ONLY: DrawingType[] = ['office_furniture', 'hvac', 'fire_safety'];
/** Interior sheets: one set per room, not part of the building register. */
const INT_BASE: Record<string, string> = { int_furniture: 'I-101', int_rcp: 'I-201', int_electrical: 'I-301', int_flooring: 'I-401', int_elevations: 'I-501', int_woodwork: 'I-601' };
export const INTERIOR_SHEET_TYPES = Object.keys(INT_BASE);
export function sheetNumber(type: string, level: number): string {
  if (INT_BASE[type]) return INT_BASE[type];
  const base = SHEET_BASE[type as DrawingType] ?? 'X-000';
  if (level > 0 && PER_FLOOR.includes(type as DrawingType)) return base.slice(0, -1) + String(Number(base.slice(-1)) + level);
  return base;
}
/** The complete sheet list of a set, in issue order. */
export function sheetIndex(floors: number, office = false): { type: string; level: number; no: string; title: string }[] {
  const out: { type: string; level: number; no: string; title: string }[] = [];
  for (const t of Object.keys(SHEET_BASE) as DrawingType[]) {
    if (!office && OFFICE_ONLY.includes(t)) continue;
    const levels = PER_FLOOR.includes(t) ? Array.from({ length: Math.min(2, Math.max(1, floors)) }, (_, i) => i) : [0];
    for (const l of levels) out.push({ type: t, level: l, no: sheetNumber(t, l), title: titleFor[t] });
  }
  const pre = 'GASMEPFD';
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
  sectionMarkerV(k, sectionCutX(k), '2', sheetNumber('section_bb', 0), out + 112);  // beyond the grid bubbles
  { const t = 'FRONT / ROAD SIDE', w = textWidth(c, t, 12, true), cx = at(k, sectionCutX(k), 0).x;
    soft(w, 14, [0.5, 0.2, 0.8].map(f => ({ x: B.x + B.w * f, y: B.y - out - 100 })).filter(p => Math.abs(p.x - cx) > w / 2 + 24).concat([{ x: B.x + B.w / 2, y: B.y - out - 100 }]), (x, y) => label(c, t, x, y, 12, 'center', COLORS.dim, true)); }
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
/* ── Adopted foundation (isolated / combined / raft) in model millimetres ── */
interface PadMm { mark: string; type: string; x: number; y: number; w: number; d: number; depth: number; bar: number; sp: number; topMesh: boolean; pcc: number; cols: ModelColumn[]; load: number }
function foundationSys(k: Context): Data { return obj(k.data.foundationSystem); }
function padsMm(k: Context): PadMm[] {
  const raw = list(foundationSys(k).pads).map(obj);
  const colsData = structuralRows(k, 'columns');
  if (raw.length) return raw.map(p => {
    const L = nval(p, 'lengthMm', 1200), B = nval(p, 'widthMm', 1200), cx = nval(p, 'cx', 0) * 1000, cy = nval(p, 'cy', 0) * 1000;
    const ids = list(p.columnIds).map(v => text(v));
    const pts = colsData.filter(cl => ids.includes(sval(cl, 'id', ''))).map(cl => ({ x: nval(cl, 'x', 0) * 1000, y: nval(cl, 'y', 0) * 1000 }));
    const cols = k.g.columns.filter(col => pts.some(q => Math.abs(q.x - col.x) < 2 && Math.abs(q.y - col.y) < 2));
    return { mark: sval(p, 'mark', 'F'), type: sval(p, 'type', 'isolated'), x: cx - L / 2, y: cy - B / 2, w: L, d: B, depth: nval(p, 'depthMm', 450),
      bar: nval(p, 'barDiaMm', 12), sp: nval(p, 'barSpacingMm', 150), topMesh: p.topMesh === true, pcc: nval(p, 'pccThicknessMm', 150), cols, load: nval(p, 'loadKN', 0) };
  });
  return k.g.columns.map((col, i) => { const f = footingSpec(k, i), fr = structuralRows(k, 'foundations')[i] ?? {};
    return { mark: `F${i + 1}`, type: 'isolated', x: col.x - f.w / 2, y: col.y - f.d / 2, w: f.w, d: f.d, depth: f.depth, bar: nval(fr, 'barDiaMm', 12), sp: nval(fr, 'barSpacingMm', 150), topMesh: false, pcc: f.pcc, cols: [col], load: nval(fr, 'columnLoadKN', 0) }; });
}
function foundationType(k: Context): string { return sval(foundationSys(k), 'type', 'isolated'); }
function foundationName(t: string): string { return t === 'raft' ? 'RAFT FOUNDATION' : t === 'combined' ? 'ISOLATED + COMBINED FOOTINGS' : 'ISOLATED FOOTINGS'; }
/** Short lines of the foundation basis, for sheet notes. */
function foundationBasis(k: Context, width = 58): string[] {
  const wrap = (t: string) => { const out: string[] = []; let line = ''; for (const w of t.split(' ')) { if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; };
  const sys = foundationSys(k);
  return [...wrap(sval(sys, 'reason', 'Isolated pads under each column.')), ...(sval(sys, 'soilNote', '') ? wrap('CAUTION: ' + sval(sys, 'soilNote', '')) : [])];
}

function excavation(k: Context): void {
  setFrame(k, k.g.footprint, { x: 115, y: 130, w: 1400, h: 1000 }, 90);
  drawPlot(k); grid(k);
  const c = k.c;
  const trenches: Bounds[] = [];
  const pads = padsMm(k), raft = foundationType(k) === 'raft';
  for (const pad of pads) {
    const trench = { x: pad.x - 300, y: pad.y - 300, w: pad.w + 600, h: pad.d + 600 };
    trenches.push(trench);
    const r = box(k, trench);
    drawRect(c, r.x, r.y, r.w, r.h, { fill: '#f8f5ee', stroke: COLORS.wall, weight: 1.4, dash: [7, 4] });
    const f = box(k, { x: pad.x, y: pad.y, w: pad.w, h: pad.d });
    drawRect(c, f.x, f.y, f.w, f.h, { stroke: COLORS.dim, weight: 1 });
  }
  for (const col of k.g.columns) drawColumnSymbol(c, at(k, col.x, col.y).x, at(k, col.x, col.y).y, Math.max(5, col.w * k.scale), Math.max(5, col.d * k.scale));
  const beamW = positive(firstBeam(k).widthMm, 230);
  const trenchWidth = beamW + 600;
  for (const segment of raft ? [] : gridSegments(k.g)) {
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
  const example = raft ? undefined : trenches[0];
  if (example) {
    const p = box(k, example);
    drawDimensionChain(c, [p.x, p.x + p.w], p.y, -18, 'horizontal', k.scale);
    drawDimensionChain(c, [p.y, p.y + p.h], p.x, -18, 'vertical', k.scale);
  }
  const bm = at(k, k.g.footprint.x, k.g.footprint.y + k.g.footprint.h);
  circle(c, bm.x, bm.y, 7, COLORS.green, COLORS.green);
  { const t = 'BM ±0.000 (VERIFY SURVEY DATUM)', w = textWidth(c, t, 14); soft(w, 16, ringCands(bm.x + 13 + w / 2, bm.y + 24, 0.6 * w, 22, 2), (x, y) => label(c, t, x, y, 14, 'center')); }
  const p0 = pads.find(p => p.type === (raft ? 'raft' : 'isolated')) ?? pads[0];
  const f = { w: p0?.w ?? 1200, d: p0?.d ?? 1200, depth: p0?.depth ?? 450, pcc: p0?.pcc ?? 150 };
  legend(c, 1600, 250, 'EXCAVATION NOTES', [
    `Foundation: ${foundationName(foundationType(k)).toLowerCase()} (${pads.length}).`,
    raft ? `Raft pit: ${round(f.w + 600)} × ${round(f.d + 600)} mm` : `Typical pad ${p0?.mark ?? 'F1'}: ${round(f.w)} × ${round(f.d)} mm`,
    `Working space: 300 mm each side`,
    raft ? 'One open excavation; no separate beam trenches.' : `Beam trench width: ${round(beamW + 600)} mm`,
    `Excavate to underside PCC at ${fmtLvl(-ASSUMED_FOUNDING_DEPTH_M * 1000)} (assumed)`,
    `PCC: ${round(f.pcc)} mm; ${raft ? 'raft' : 'pad'}: ${round(f.depth)} mm`,
    'Founding level / shoring subject to geotechnical report.',
    ...(sval(foundationSys(k), 'soilNote', '') ? ['SOIL: see caution on ' + sheetNumber('column_layout', 0) + '.'] : []),
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
  setFrame(k, k.g.footprint, { x: 90, y: 140, w: 1180, h: 960 }, 95);
  drawPlot(k); grid(k);
  const c = k.c, pads = padsMm(k), t = foundationType(k);
  for (const seg of gridSegments(k.g)) {
    const a = at(k, seg.a.x, seg.a.y), b = at(k, seg.b.x, seg.b.y);
    drawDoubleLineWall(c, a.x, a.y, b.x, b.y, Math.max(3, 230 * k.scale), 1.3);
  }
  for (const pad of pads) {
    const f = box(k, { x: pad.x, y: pad.y, w: pad.w, h: pad.d });
    if (pad.type === 'raft') drawRect(c, f.x, f.y, f.w, f.h, { fill: 'rgba(200,205,200,0.18)', stroke: COLORS.wall, weight: 1.6, dash: [10, 5] });
    else ring(c, f);
    const w = textWidth(c, pad.mark, 12, true);
    soft(w, 14, pad.type === 'raft' ? [{ x: f.x + 14 + w / 2, y: f.y + 14 }] : [{ x: f.x + f.w + 3 + w / 2, y: f.y - 6 }, { x: f.x - 3 - w / 2, y: f.y - 6 }, { x: f.x + f.w + 3 + w / 2, y: f.y + f.h + 6 }, { x: f.x - 3 - w / 2, y: f.y + f.h + 6 }],
      (x, y) => label(c, pad.mark, x, y, 12, 'center', COLORS.text, true));
  }
  for (const col of k.g.columns) {
    const p = at(k, col.x, col.y);
    drawColumnSymbol(c, p.x, p.y, Math.max(5, col.w * k.scale), Math.max(5, col.d * k.scale));
    if (col.mark) { const w = textWidth(c, col.mark, 10); soft(w, 12, ringCands(p.x + 10 + w / 2, p.y + 12, 14, 12, 2), (x, y) => label(c, col.mark!, x, y, 10, 'center', COLORS.dim)); }
  }
  // the plot boundary and its dimension strings sit outside the building here: the marker goes beyond them
  gridDimensions(k); sectionMarker(k, sectionCutY(k), '1', sheetNumber('section_aa', 0), (k.g.building.x - k.g.footprint.x) * k.scale + 130);
  // schedule: one row per distinct pad (identical isolated pads grouped)
  const groups = new Map<string, PadMm[]>();
  for (const p of pads) { const key = p.type === 'isolated' ? `${round(p.w)}|${round(p.d)}|${round(p.depth)}|${p.bar}|${p.sp}` : p.mark; groups.set(key, [...(groups.get(key) ?? []), p]); }
  const colMarks = (ps: PadMm[]) => ps.flatMap(p => p.cols.map(cl => cl.mark ?? '')).filter(Boolean).join(', ');
  const rowsOut = [...groups.values()].map(ps => { const p = ps[0]; return [
    ps.length > 1 ? `${ps[0].mark}–${ps[ps.length - 1].mark}` : p.mark,
    p.type === 'raft' ? 'Raft' : p.type === 'combined' ? 'Combined' : 'Isolated',
    p.type === 'raft' ? `all (${p.cols.length})` : colMarks(ps),
    `${round(p.w)}×${round(p.d)}×${round(p.depth)}`,
    `Ø${p.bar}@${p.sp} ${p.topMesh ? 'T&B' : 'B'}`,
    `${ps.length}`]; });
  const y = table(c, 1300, 140, [{ h: 'MARK', w: 70 }, { h: 'TYPE', w: 72 }, { h: 'COLUMNS', w: 150 }, { h: 'L×B×D mm', w: 120 }, { h: 'MESH', w: 92 }, { h: 'NOS', w: 40 }], rowsOut, 'FOUNDATION SCHEDULE');
  legend(c, 1300, y + 36, foundationName(t), [
    ...foundationBasis(k, 62),
    `PCC ${round(pads[0]?.pcc ?? 150)} mm under ${t === 'raft' ? 'the raft' : 'all pads'}; cover 50 mm.`,
    `Founding ${fmtLvl(-ASSUMED_FOUNDING_DEPTH_M * 1000)} (ASSUMED — soil test).`,
    `Plinth beams on all grid lines; ${concrete(k)} / ${steel(k)}.`,
    `Details: ${sheetNumber('footing_detail', 0)}; excavation: ${sheetNumber('excavation', 0)}.`,
  ]);
  viewTitle(k, 'FOUNDATION & COLUMN LAYOUT', 80, 130);
}

/* 3. Footing pad in section AND bar layout in plan. */
function footingDetail(k: Context): void {
  const c = k.c, pads = padsMm(k), t = foundationType(k);
  const pick = (t === 'raft' ? pads.find(p => p.type === 'raft') : t === 'combined' ? pads.find(p => p.type === 'combined') : pads.find(p => p.type === 'isolated')) ?? pads[0];
  if (!pick) return;
  const col0 = pick.cols[0] ?? k.g.columns[0] ?? { x: pick.x + pick.w / 2, y: pick.y + pick.d / 2, w: 300, d: 300 };
  // section A–A along the pad length (raft: a 3.6 m edge strip through the first column)
  const raft = pick.type === 'raft';
  const x0 = raft ? pick.x : pick.x, len = raft ? Math.min(pick.w, 3600) : pick.w;
  const colsIn = (raft ? k.g.columns.filter(cl => Math.abs(cl.y - col0.y) < 2 && cl.x < pick.x + len) : pick.cols).map(cl => cl.x);
  const stub = 700, FD = 450;
  const geoW = len + 1000, geoH = stub + pick.depth + pick.pcc + FD;
  const den = STD_SCALES.find(d => geoW * PX_PER_PAPER_MM / d <= 1000 && geoH * PX_PER_PAPER_MM / d <= 520) ?? 100, s = PX_PER_PAPER_MM / den;
  k.views.push(den);
  const ox = 90 + (1000 - geoW * s) / 2 + 500 * s, top = 250;
  const X = (mm: number) => ox + (mm - x0) * s;
  const padTop = top + stub * s, padBot = padTop + pick.depth * s, pccBot = padBot + pick.pcc * s;
  label(c, raft ? `A–A  TYPICAL RAFT EDGE SECTION (${pick.mark})` : `A–A  SECTION THROUGH ${pick.mark} (${pick.type.toUpperCase()})`, 90, 150, 18, 'left', COLORS.green, true);
  label(c, `SCALE 1:${den}`, 90, 170, 11, 'left', COLORS.dim);
  drawHatch(c, X(x0) - 400 * s, padTop - 40, (len + 800) * s, pccBot - padTop + 140, 45, 15);
  drawRect(c, X(x0) - 400 * s, padTop - 40, (len + 800) * s, pccBot - padTop + 140, { fill: 'rgba(240,235,226,0.45)' });
  hatchBox(c, { x: X(x0) - 75 * s, y: padBot, w: (len + 150) * s, h: pick.pcc * s }, '#d7d7d7', -45, 8, PEN.thin);
  hatchBox(c, { x: X(x0), y: padTop, w: len * s, h: pick.depth * s }, COLORS.concrete, 45, 12, PEN.cut);
  const cover = 50 * s, barR = Math.max(2.2, pick.bar * s / 2);
  drawLine(c, X(x0) + cover, padBot - cover, X(x0 + len) - cover, padBot - cover, 2.2, '#b03a2e');
  for (let xx = X(x0) + cover; xx <= X(x0 + len) - cover + 0.1; xx += Math.max(6, pick.sp * s)) circle(c, xx, padBot - cover - barR - 1, barR, '#b03a2e', '#b03a2e');
  if (pick.topMesh) {
    drawLine(c, X(x0) + cover, padTop + cover, X(x0 + len) - cover, padTop + cover, 2.2, '#1f5f99');
    for (let xx = X(x0) + cover; xx <= X(x0 + len) - cover + 0.1; xx += Math.max(6, pick.sp * s)) circle(c, xx, padTop + cover + barR + 1, barR, '#1f5f99', '#1f5f99');
  }
  for (const cx of colsIn) {
    const cw = (pick.cols[0]?.w ?? 300) * s;
    hatchBox(c, { x: X(cx) - cw / 2, y: top, w: cw, h: padTop - top }, COLORS.concrete, -45, 10, PEN.medium);
    for (const sx of [X(cx) - cw / 2 + 40 * s, X(cx) + cw / 2 - 40 * s]) {
      drawLine(c, sx, top + 4, sx, padBot - cover - 2 * barR - 2, 1.8, COLORS.wall);
      drawLine(c, sx, padBot - cover - 2 * barR - 2, sx + (sx < X(cx) ? -1 : 1) * 12 * (pick.cols[0] ? 16 : 12) * s, padBot - cover - 2 * barR - 2, 1.8, COLORS.wall);
    }
  }
  drawDimensionChain(c, [X(x0), ...colsIn.map(X), X(x0 + len)], pccBot, 40, 'horizontal', s);
  drawDimensionChain(c, [padTop, padBot, pccBot], X(x0), -40, 'vertical', s);
  levelMark(c, X(x0 + len) + 60, pccBot, `FOUNDING ${fmtLvl(-ASSUMED_FOUNDING_DEPTH_M * 1000)} (ASSUMED)`);
  // plan of the pad (raft: whole raft with columns and mesh notation)
  const den2 = STD_SCALES.find(d => pick.w * PX_PER_PAPER_MM / d <= 640 && pick.d * PX_PER_PAPER_MM / d <= 420) ?? 200, s2 = PX_PER_PAPER_MM / den2;
  k.views.push(den2);
  const px = 1260, py = 230, pw = pick.w * s2, ph = pick.d * s2;
  label(c, raft ? `RAFT PLAN ${pick.mark}` : `PLAN ${pick.mark}`, px, 150, 18, 'left', COLORS.green, true);
  label(c, `SCALE 1:${den2}`, px, 170, 11, 'left', COLORS.dim);
  drawRect(c, px, py, pw, ph, { fill: '#fafafa', stroke: COLORS.wall, weight: PEN.cut });
  const stepPx = pick.sp * s2, every = Math.max(1, Math.ceil(5 / Math.max(stepPx, 1e-6)));
  for (let i = 0, xx = px + 50 * s2; xx < px + pw - 50 * s2; xx += stepPx, i++) if (i % every === 0) drawLine(c, xx, py + 50 * s2, xx, py + ph - 50 * s2, 0.6, '#b03a2e');
  for (let i = 0, yy = py + 50 * s2; yy < py + ph - 50 * s2; yy += stepPx, i++) if (i % every === 0) drawLine(c, px + 50 * s2, yy, px + pw - 50 * s2, yy, 0.6, '#b03a2e');
  for (const cl of (raft ? k.g.columns : pick.cols)) drawRect(c, px + (cl.x - cl.w / 2 - pick.x) * s2, py + (cl.y - cl.d / 2 - pick.y) * s2, cl.w * s2, cl.d * s2, { fill: '#8d8d8d', stroke: COLORS.wall, weight: 1 });
  drawDimensionChain(c, [px, px + pw], py + ph, 34, 'horizontal', s2);
  drawDimensionChain(c, [py, py + ph], px + pw, 34, 'vertical', s2);
  if (!raft) { const ay = py + (col0.y - pick.y) * s2; drawLine(c, px - 26, ay, px - 8, ay, PEN.medium); drawLine(c, px + pw + 8, ay, px + pw + 26, ay, PEN.medium); label(c, 'A', px - 34, ay, 12, 'center', COLORS.text, true); label(c, 'A', px + pw + 34, ay, 12, 'center', COLORS.text, true); }
  if (every > 1) label(c, `1 in ${every} bars shown at this scale`, px, py + ph + 70, 11, 'left', COLORS.dim);
  const y0 = Math.max(pccBot + 120, py + ph + 110, 820);
  legend(c, 90, y0, `${foundationName(t)} — ${pick.mark}`, [
    `${round(pick.w)} × ${round(pick.d)} × ${round(pick.depth)} mm on ${round(pick.pcc)} mm PCC 1:4:8; ${concrete(k)} / ${steel(k)}.`,
    `Bottom mesh Ø${pick.bar} @ ${pick.sp} c/c both ways (red)${pick.topMesh ? `; top mesh Ø${pick.bar} @ ${pick.sp} c/c both ways (blue)` : ''}.`,
    'Clear cover 50 mm; column starters L-footed on the bottom mesh, lap 50d above.',
    raft ? 'Raft projects 300 mm beyond the outer column faces all round.' : `Columns on this ${pick.type === 'combined' ? 'combined footing' : 'pad'}: ${pick.cols.map(cl => cl.mark ?? '').filter(Boolean).join(', ') || '—'}.`,
    `${raft ? 'Total column load' : 'Column load'} (service) ≈ ${round(pick.load)} kN${raft ? ` → ${(pick.load / (pick.w * pick.d / 1e6)).toFixed(0)} kN/m² average` : ''}; SBC assumed ${round(nval(obj(k.data.parameters), 'sbc', 150))} kN/m².`,
  ]);
  legend(c, 1260, y0, 'BASIS', foundationBasis(k, 60));
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
function beamsAt(k: Context, floor: number): Data[] {
  return structuralRows(k, 'beams').filter(b => nval(b, 'floor', -1) === floor && typeof b.x1 === 'number' && typeof b.y2 === 'number');
}
const sameAxis = (p: Data, q: Data) => Math.abs(nval(p, 'x1', 0) - nval(q, 'x1', 0)) + Math.abs(nval(p, 'y1', 0) - nval(q, 'y1', 0)) + Math.abs(nval(p, 'x2', 0) - nval(q, 'x2', 0)) + Math.abs(nval(p, 'y2', 0) - nval(q, 'y2', 0)) < 0.02;
/** Unique beam marks across all slab levels, one schedule row each. */
function beamScheduleRows(k: Context): string[][] {
  const seen = new Map<string, { b: Data; n: number }>();
  for (const b of structuralRows(k, 'beams')) {
    const m = sval(b, 'mark', ''); if (!m) continue;
    const e = seen.get(m); if (e) e.n++; else seen.set(m, { b, n: 1 });
  }
  const order = (m: string) => (m.startsWith('RB') ? 9 : 0) + Number(m.replace(/\D/g, '')) / 100;
  return [...seen.entries()].sort((p, q) => order(p[0]) - order(q[0])).map(([m, { b, n }]) => [
    m, `${round(nval(b, 'widthMm', 230))}×${round(nval(b, 'depthMm', 300))}`, sval(b, 'tensionBars', '—').replace('mm', ''),
    sval(b, 'topBars', '2-12mm').replace('mm', ''), sval(b, 'supportTopBars', 'Nil').replace('mm', ''),
    `Ø${round(nval(b, 'stirrupDiaMm', 8))}@${round(nval(b, 'stirrupSpacingNearSupportMm', 150))}/${round(nval(b, 'stirrupSpacingMidSpanMm', 200))}`, `${n}`,
  ]);
}
function beamSlab(k: Context): void {
  setFrame(k, k.g.building, { x: 80, y: 140, w: 1170, h: 960 }, 95);
  const c = k.c;
  drawPlanRooms(k, true, false, false); // structural plan: slab marks only, room names are on the A-sheets
  grid(k);
  const lvl0 = beamsAt(k, 0), roof = k.g.floors > 1 ? beamsAt(k, k.g.floors - 1) : [];
  if (lvl0.length) {
    for (const bm of lvl0) {
      const a = at(k, nval(bm, 'x1', 0) * 1000, nval(bm, 'y1', 0) * 1000), z = at(k, nval(bm, 'x2', 0) * 1000, nval(bm, 'y2', 0) * 1000);
      drawDoubleLineWall(c, a.x, a.y, z.x, z.y, Math.max(4, nval(bm, 'widthMm', 230) * k.scale), 2);
    }
  } else for (const segment of gridSegments(k.g)) {
    const a = at(k, segment.a.x, segment.a.y), z = at(k, segment.b.x, segment.b.y);
    drawDoubleLineWall(c, a.x, a.y, z.x, z.y, Math.max(4, positive(firstBeam(k).widthMm, 230) * k.scale), 2);
  }
  for (const [i, r] of selected(k).entries()) {
    if (isNiche(r.source)) continue;
    const p = at(k, r.x + r.w / 2, r.y + r.d / 2);
    const slab = structuralRows(k, 'slabs').find(s => sval(s, 'id', '').endsWith(r.source.id)) ?? firstSlab(k);
    if (r.source.type === 'staircase') {
      const q = box(k, { x: r.x, y: r.y, w: r.w, h: r.d });
      drawLine(c, q.x, q.y, q.x + q.w, q.y + q.h, PEN.thin, COLORS.grid); drawLine(c, q.x + q.w, q.y, q.x, q.y + q.h, PEN.thin, COLORS.grid);
      label(c, 'STAIR OPENING', p.x, p.y - 10, 12, 'center', COLORS.green, true);
      continue;
    }
    const oneWay = sval(slab, 'slabType', r.w / r.d > 2 || r.d / r.w > 2 ? 'one-way' : 'two-way') === 'one-way';
    const small = Math.min(r.w, r.d) * k.scale < 90;
    const sub = `${oneWay ? '1-WAY' : '2-WAY'} ${round(positive(slab.thicknessMm, 150))}`;
    soft(small ? 22 : 62, small ? 12 : 30, ringCands(p.x, p.y, 20, 16, 3), (x, y) => {
      label(c, `S${i + 1}`, x, y - (small ? 0 : 8), small ? 10 : 13, 'center', COLORS.green, true);
      if (!small) label(c, sub, x, y + 9, 10, 'center', COLORS.green);
    });
  }
  drawColumns(k);
  // beam marks at mid-span, offset off the beam line
  for (const bm of (lvl0.length ? lvl0 : [])) {
    const x1 = nval(bm, 'x1', 0) * 1000, y1 = nval(bm, 'y1', 0) * 1000, x2 = nval(bm, 'x2', 0) * 1000, y2 = nval(bm, 'y2', 0) * 1000;
    const horiz = Math.abs(y2 - y1) < 1, m = at(k, (x1 + x2) / 2, (y1 + y2) / 2);
    const rm = roof.find(r => sameAxis(r, bm));
    const t = `${sval(bm, 'mark', '')}${rm ? '/' + sval(rm, 'mark', '') : ''}`;
    const tw = textWidth(c, t, 10.5, true) + 8;
    const cands = horiz ? [{ x: m.x, y: m.y - 12 }, { x: m.x, y: m.y + 12 }, { x: m.x - 40, y: m.y - 12 }, { x: m.x + 40, y: m.y - 12 }, { x: m.x - 40, y: m.y + 12 }, { x: m.x + 40, y: m.y + 12 }]
      : [{ x: m.x - tw / 2 - 6, y: m.y }, { x: m.x + tw / 2 + 6, y: m.y }, { x: m.x - tw / 2 - 6, y: m.y - 30 }, { x: m.x - tw / 2 - 6, y: m.y + 30 }, { x: m.x + tw / 2 + 6, y: m.y - 30 }, { x: m.x + tw / 2 + 6, y: m.y + 30 }];
    soft(tw, 15, cands, (x, y) => { drawRect(c, x - tw / 2, y - 7.5, tw, 15, { fill: '#fff', stroke: COLORS.wall, weight: 0.6 }); label(c, t, x, y + 0.5, 10.5, 'center', COLORS.text, true); });
  }
  gridDimensions(k); drawSectionMark(k);
  const rows = beamScheduleRows(k);
  let y = table(c, 1290, 140, [{ h: 'MARK', w: 58 }, { h: 'b × D', w: 74 }, { h: 'BOTTOM', w: 70 }, { h: 'TOP CONT.', w: 76 }, { h: 'EXTRA TOP', w: 76 }, { h: 'STIRRUPS', w: 108 }, { h: 'NOS', w: 40 }],
    rows.length ? rows : [['—', 'Beams designed by engineer', '', '', '', '', '']], 'BEAM SCHEDULE');
  const slabs = structuralRows(k, 'slabs'), thk = slabs.map(s => nval(s, 'thicknessMm', 150));
  const slab = firstSlab(k);
  legend(c, 1290, y + 36, 'NOTES', [
    `Marks: ${k.g.floors > 1 ? 'FB = first-floor slab beam, ' : ''}RB = roof beam${k.g.floors > 1 ? '; label FBn/RBn at one position' : ''}.`,
    'EXTRA TOP: over each support, 0.3L into each span + Ld.',
    'Stirrups: near-support spacing over L/4 each end / mid-span.',
    `Slabs ${thk.length ? Math.min(...thk) : 150}–${thk.length ? Math.max(...thk) : 150} mm; main Ø${round(positive(slab.mainBarDiaMm, 8))} @ ${round(positive(slab.mainBarSpacingMm, 150))}, dist. Ø${round(positive(slab.distBarDiaMm, 8))} @ ${round(positive(slab.distBarSpacingMm, 200))}.`,
    'Slab top bars at supports: 0.3L strip (see BBS S-106).',
    `${concrete(k)} / ${steel(k)}; cover: slab 20, beam 25 mm.`,
    `Beam detail and column schedule: ${sheetNumber('column_detail', 0)}.`,
  ]);
  viewTitle(k, `BEAM & SLAB LAYOUT — ${k.g.floors > 1 ? 'TYPICAL (ALL SLABS)' : 'ROOF SLAB'}`, 80, 130);
}

/* S-105: column schedule (per storey), sections at 1:10 and a typical continuous-beam detail. */
function columnDetail(k: Context): void {
  const c = k.c, cols = structuralRows(k, 'columns');
  const storeys = Math.max(1, k.g.floors);
  // group plan positions whose section/bars are identical on every storey into column types
  const byMark = new Map<string, Data[]>();
  for (const col of cols) { const m = sval(col, 'mark', ''); if (m) byMark.set(m, [...(byMark.get(m) ?? []), col]); }
  const spec = (cl: Data | undefined) => cl ? `${round(nval(cl, 'widthMm', 230))}×${round(nval(cl, 'depthMm', 300))} ${sval(cl, 'mainBars', '4-12mm').replace('mm', '')}` : '—';
  const types = new Map<string, { marks: string[]; per: (Data | undefined)[] }>();
  const markNo = (m: string) => Number(m.replace(/\D/g, ''));
  for (const [m, list0] of [...byMark.entries()].sort((p, q) => markNo(p[0]) - markNo(q[0]))) {
    const per = Array.from({ length: storeys }, (_, f) => list0.find(cl => nval(cl, 'floor', -1) === f));
    const key = per.map(spec).join('|') + `|${nval(per[0] ?? {}, 'tieDiaMm', 8)}@${nval(per[0] ?? {}, 'tieSpacingMm', 150)}`;
    const t = types.get(key); if (t) t.marks.push(m); else types.set(key, { marks: [m], per });
  }
  const ranges = (ms: string[]) => { const n = ms.map(markNo).sort((p, q) => p - q); const out: string[] = []; for (let i = 0; i < n.length; ) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push(j > i ? `C${n[i]}–C${n[j]}` : `C${n[i]}`); i = j + 1; } return out.join(', '); };
  const rowsOut = [...types.values()].map((t, i) => [`CT${i + 1}`, ranges(t.marks), ...t.per.map(spec),
    `Ø${round(nval(t.per[0] ?? {}, 'tieDiaMm', 8))}@${round(nval(t.per[0] ?? {}, 'tieSpacingMm', 150))}`]);
  const cw = storeys > 1 ? [{ h: 'TYPE', w: 56 }, { h: 'COLUMNS', w: 330 }, { h: 'GF (to FF slab)', w: 170 }, { h: 'FF (to roof)', w: 170 }, { h: 'TIES', w: 90 }]
    : [{ h: 'TYPE', w: 56 }, { h: 'COLUMNS', w: 420 }, { h: 'GF (to roof)', w: 200 }, { h: 'TIES', w: 90 }];
  let y = table(c, 80, 140, cw, rowsOut.length ? rowsOut : [['—', 'Columns by engineer', '', '', '']], 'COLUMN SCHEDULE', 24);
  // sections of each type (lowest storey, which governs) at 1:10
  const S = PX_PER_PAPER_MM / 10; k.views.push(10);
  let x = 110; y += 80;
  label(c, 'COLUMN SECTIONS (GROUND STOREY)', 80, y - 50, 16, 'left', COLORS.green, true);
  label(c, 'SCALE 1:10', 80, y - 32, 11, 'left', COLORS.dim);
  for (const [i, t] of [...types.values()].slice(0, 5).entries()) {
    const cl = t.per[0]; if (!cl) continue;
    const w = nval(cl, 'widthMm', 230), d = nval(cl, 'depthMm', 300), tie = nval(cl, 'tieDiaMm', 8), cover = 40;
    const bars = sval(cl, 'mainBars', '4-12mm'), n = Math.max(4, Number(/^\d+/.exec(bars)?.[0] ?? 4)), dia = positive(Number(/-(\d+)mm/.exec(bars)?.[1]), 12);
    const bw = w * S, bh = d * S;
    hatchBox(c, { x, y, w: bw, h: bh }, '#e7e9e7', -45, 14, PEN.cut);
    drawRect(c, x + cover * S, y + cover * S, bw - 2 * cover * S, bh - 2 * cover * S, { stroke: COLORS.wall, weight: 1.4 });
    const ins = (cover + tie + dia / 2) * S, xs = [x + ins, x + bw - ins], ys = [y + ins, y + bh - ins];
    const pts: Point[] = [{ x: xs[0], y: ys[0] }, { x: xs[1], y: ys[0] }, { x: xs[1], y: ys[1] }, { x: xs[0], y: ys[1] }];
    const extra = n - 4;
    for (let j = 0; j < extra; j++) { const side = j % 2 === 0; const k2 = Math.floor(j / 2) + 1, m2 = Math.ceil(extra / 2) + 1; pts.push(side ? { x: xs[0], y: ys[0] + (ys[1] - ys[0]) * k2 / m2 } : { x: xs[1], y: ys[0] + (ys[1] - ys[0]) * k2 / m2 }); }
    for (const p of pts) circle(c, p.x, p.y, Math.max(3, dia * S / 2), COLORS.wall, COLORS.wall);
    drawDimensionChain(c, [x, x + bw], y + bh, 22, 'horizontal', S);
    drawDimensionChain(c, [y, y + bh], x, -22, 'vertical', S);
    label(c, `CT${i + 1}`, x + bw / 2, y - 14, 14, 'center', COLORS.text, true);
    label(c, `${bars.replace('mm', '')} + Ø${round(tie)} ties`, x + bw / 2, y + bh + 50, 11, 'center', COLORS.dim);
    x += Math.max(bw + 120, 220);
  }
  // typical continuous beam: elevation (largest preferred scale that fits) + sections at support and mid-span (1:10)
  const beams = structuralRows(k, 'beams');
  const bm = [...beams].sort((p, q) => nval(q, 'depthMm', 0) - nval(p, 'depthMm', 0))[0] ?? {};
  const span = nval(bm, 'spanM', 4) * 1000, D = nval(bm, 'depthMm', 300), Bw = nval(bm, 'widthMm', 230);
  const den = STD_SCALES.find(dd => (span + 900) * PX_PER_PAPER_MM / dd <= 1180) ?? 100; const s = PX_PER_PAPER_MM / den;
  k.views.push(den);
  const ox = 80, oy = 700, colW = 300 * s;
  label(c, `TYPICAL BEAM DETAIL — ${sval(bm, 'mark', 'B')} (${round(Bw)}×${round(D)}, span ${round(span)})`, ox, oy - 90, 16, 'left', COLORS.green, true);
  label(c, `SCALE 1:${den}`, ox, oy - 72, 11, 'left', COLORS.dim);
  const L = span * s, H = Math.max(24, D * s), bx0 = ox + colW, by0 = oy;
  hatchBox(c, { x: ox, y: by0 - 40, w: colW, h: H + 100 }, '#e7e9e7', 45, 10, PEN.medium);
  hatchBox(c, { x: bx0 + L, y: by0 - 40, w: colW, h: H + 100 }, '#e7e9e7', 45, 10, PEN.medium);
  drawRect(c, bx0, by0, L, H, { fill: '#fafafa', stroke: COLORS.wall, weight: PEN.cut });
  const cv = Math.max(4, 25 * s);
  drawLine(c, ox + 6, by0 + H - cv, bx0 + L + colW - 6, by0 + H - cv, 2.2, '#b03a2e');
  drawLine(c, ox + 6, by0 + H - cv, ox + 6, by0 + H - cv - Math.min(H * 0.6, 12 * 16 * s), 2.2, '#b03a2e');
  drawLine(c, bx0 + L + colW - 6, by0 + H - cv, bx0 + L + colW - 6, by0 + H - cv - Math.min(H * 0.6, 12 * 16 * s), 2.2, '#b03a2e');
  drawLine(c, ox + 6, by0 + cv, bx0 + L + colW - 6, by0 + cv, 1.6, '#1f5f99');
  const ext = 0.3 * span * s;
  drawLine(c, ox + 6, by0 + cv + 6, bx0 + ext, by0 + cv + 6, 2.4, '#1f5f99');
  drawLine(c, bx0 + L - ext, by0 + cv + 6, bx0 + L + colW - 6, by0 + cv + 6, 2.4, '#1f5f99');
  const near = nval(bm, 'stirrupSpacingNearSupportMm', 150) * s, mid = nval(bm, 'stirrupSpacingMidSpanMm', 200) * s;
  for (let xx = bx0 + 50 * s; xx < bx0 + L - 25 * s; ) { drawLine(c, xx, by0 + 3, xx, by0 + H - 3, 0.7, COLORS.dim); const inEnd = xx - bx0 < L / 4 || bx0 + L - xx < L / 4; xx += Math.max(3, inEnd ? near : mid); }
  drawDimensionChain(c, [bx0, bx0 + ext, bx0 + L - ext, bx0 + L], by0, -30, 'horizontal', s);
  drawDimensionChain(c, [bx0, bx0 + L / 4, bx0 + L * 3 / 4, bx0 + L], by0 + H, 34, 'horizontal', s);
  drawDimensionChain(c, [by0, by0 + H], bx0 + L + colW, 24, 'vertical', s);
  label(c, 'EXTRA TOP 0.3L', bx0 + ext / 2, by0 - 66, 10, 'center', '#1f5f99', true);
  label(c, 'STIRRUP ZONES L/4 – L/2 – L/4', bx0 + L / 2, by0 + H + 66, 10, 'center', COLORS.dim, true);
  // cross-sections at 1:10: at support (top = hangers + extra) and at mid-span (top = hangers)
  const bars = (t: string) => { const m = /^(\d+)-(\d+)mm$/.exec(t); return m ? { n: Number(m[1]), d: Number(m[2]) } : null; };
  const bot = bars(sval(bm, 'tensionBars', '2-12mm')), top = bars(sval(bm, 'topBars', '2-12mm')), xt = bars(sval(bm, 'supportTopBars', 'Nil'));
  const sec = (sx: number, title: string, withExtra: boolean) => {
    const bw = Bw * S, bh = D * S;
    hatchBox(c, { x: sx, y: oy - 40, w: bw, h: bh }, '#e7e9e7', -45, 14, PEN.cut);
    drawRect(c, sx + 25 * S, oy - 40 + 25 * S, bw - 50 * S, bh - 50 * S, { stroke: COLORS.wall, weight: 1.2 });
    const row = (n: number, d: number, yy: number, col: string) => { for (let j = 0; j < n; j++) circle(c, sx + 25 * S + 8 * S + d * S / 2 + (bw - 50 * S - 16 * S - d * S) * (n > 1 ? j / (n - 1) : 0.5), yy, Math.max(3, d * S / 2), col, col); };
    if (bot) row(bot.n, bot.d, oy - 40 + bh - 25 * S - 8 * S - bot.d * S / 2, '#b03a2e');
    if (top) row(top.n, top.d, oy - 40 + 25 * S + 8 * S + top.d * S / 2, '#1f5f99');
    if (withExtra && xt) row(xt.n, xt.d, oy - 40 + 25 * S + 8 * S + 2 * Math.max(12, top?.d ?? 12) * S, '#1f5f99');
    drawDimensionChain(c, [sx, sx + bw], oy - 40 + bh, 20, 'horizontal', S);
    drawDimensionChain(c, [oy - 40, oy - 40 + bh], sx + bw, 20, 'vertical', S);
    label(c, title, sx + bw / 2, oy - 62, 12, 'center', COLORS.text, true);
  };
  sec(1330, 'AT SUPPORT 1:10', true); sec(1560, 'AT MID-SPAN 1:10', false);
  const by1 = Math.max(by0 + H + 110, oy + D * S + 30);
  legend(c, ox, by1, 'BAR KEY', [
    `Bottom (red): ${sval(bm, 'tensionBars', '—')} continuous, Ld into supports`,
    `Top (blue): ${sval(bm, 'topBars', '2-12mm')} continuous`,
    `Extra top over supports: ${sval(bm, 'supportTopBars', 'Nil')}, 0.3L + Ld`,
    `Stirrups Ø${round(nval(bm, 'stirrupDiaMm', 8))} @ ${round(nval(bm, 'stirrupSpacingNearSupportMm', 150))} in L/4 ends, @ ${round(nval(bm, 'stirrupSpacingMidSpanMm', 200))} mid`,
  ]);
  legend(c, 1330, 140, 'DETAILING NOTES', [
    'Clear cover: column 40, beam 25, slab 20, footing 50 mm.',
    'Laps: column bars in the middle half of the storey, ≤ 50% at one section.',
    'Ties at 100 mm c/c over max(D, L/6, 450 mm) at each end and through joints (IS 13920).',
    '135° hooks on ties and stirrups, extension 6d ≥ 65 mm.',
    'Beam bars anchored Ld into end columns with 90° bend.',
    `${concrete(k)} / ${steel(k)}. Schedule = BBS ${sheetNumber('bar_bending', 0)}.`,
  ]);
}
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
function levelMark(c: CanvasRenderingContext2D, x: number, y: number, textValue: string): void {
  // ▽ level symbol on the line, value written above the line (never struck through)
  drawLine(c, x - 34, y, x + 200, y, PEN.hair, COLORS.dim);
  c.save(); c.fillStyle = COLORS.wall; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 16, y - 12); c.lineTo(x, y - 12); c.closePath(); c.fill(); c.restore();
  label(c, textValue, x + 8, y - 9, 13, 'left', COLORS.text);
}
const fmtLvl = (mm: number) => `${mm >= 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toFixed(3)}`;
function sectionAA(k: Context): void {
  const c = k.c, b = k.g.building, floors = Math.min(k.g.floors, 5);
  const FD = ASSUMED_FOUNDING_DEPTH_M * 1000, H = FLOOR_TO_FLOOR_MM, PL = PLINTH_HEIGHT_MM;
  const found = footingSpec(k, 0);
  const cutY = sectionCutY(k);
  const stairRooms = Array.from({ length: floors }, (_, f) => (k.g.rooms[f] ?? []).find(r => r.source.type === 'staircase' && cutY >= r.y && cutY <= r.y + r.d));
  const st0 = stairRooms[0], pitched = isPitched(k);
  const roofZ = PL + floors * H, mumtyZ = roofZ + STAIR_HEAD_ROOM_MM;
  const top = Math.max(st0 && !pitched ? mumtyZ + 150 : 0, roofZ + roofRiseMm(k)) + 400, bottom = -FD - found.pcc - 500;
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
  // the adopted foundation, cut along the section line: raft slab, or the pads whose plan box the cut crosses
  const sPads = padsMm(k), sRaft = sPads.find(p => p.type === 'raft');
  if (sRaft) {
    const rTop = project(0, -FD + sRaft.depth).y;
    hatchBox(c, { x: project(sRaft.x - 75, 0).x, y: project(0, -FD).y, w: (sRaft.w + 150) * s, h: sRaft.pcc * s }, '#d7d7d7', -45, 9, PEN.thin);
    hatchBox(c, { x: project(sRaft.x, 0).x, y: rTop, w: sRaft.w * s, h: sRaft.depth * s }, COLORS.concrete, 45, 8, PEN.medium);
    for (const x of drawnX) { const col = groundColumns[0] ?? k.g.columns[0]; hatchBox(c, { x: project(x, 0).x - (col?.w ?? 300) * s / 2, y: project(x, PL).y, w: (col?.w ?? 300) * s, h: rTop - project(x, PL).y }, COLORS.concrete, 45, 10, PEN.medium); }
  } else {
    for (const x of drawnX) {
      const col = groundColumns[0] ?? k.g.columns[0];
      const p = project(x, 0);
      const pad = sPads.find(q => x >= q.x - 1 && x <= q.x + q.w + 1 && cutY >= q.y - 1 && cutY <= q.y + q.d + 1) ?? sPads.find(q => x >= q.x - 1 && x <= q.x + q.w + 1);
      const pw = pad ? pad.w : found.w, pd = pad ? pad.depth : found.depth, pcc = pad ? pad.pcc : found.pcc, px0 = pad ? project(pad.x, 0).x : p.x - found.w * s / 2;
      const top2 = project(0, -FD + pd).y;
      hatchBox(c, { x: px0 - 150 * s, y: project(0, -FD).y, w: (pw + 300) * s, h: pcc * s }, '#d7d7d7', -45, 9, PEN.thin);
      hatchBox(c, { x: px0, y: top2, w: pw * s, h: pd * s }, COLORS.concrete, 45, 8, PEN.medium);
      hatchBox(c, { x: p.x - (col?.w ?? 300) * s / 2, y: project(x, PL).y, w: (col?.w ?? 300) * s, h: top2 - project(x, PL).y }, COLORS.concrete, 45, 10, PEN.medium);
    }
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
      if (span > 50) { const t = room.source.name.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase(); let fs = Math.min(14, span / 9); while (fs > 8 && textWidth(c, t, fs) > span - 8) fs -= 0.5; const w = textWidth(c, t, fs); soft(w, fs + 2, [cen, { x: cen.x, y: cen.y - 22 }, { x: cen.x, y: cen.y + 22 }, { x: cen.x, y: cen.y - 44 }], (x, y) => label(c, t, x, y, fs, 'center'), true); }
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
  // roof: parapet (and stair-head room when the stair continues to the terrace), or the pitched roof over the slab
  const roofY = project(0, roofZ).y, parapetY = project(0, roofZ + PARAPET_HEIGHT_MM).y;
  levelMark(c, right + 70, roofY, `TOS ROOF ${fmtLvl(roofZ)}`);
  if (pitched) {
    const rz = drawPitchedRoof(k, 'front', project, b.x, roofZ, true);
    levelMark(c, right + 70, project(0, rz).y, `RIDGE ${fmtLvl(Math.round(rz))}`);
    label(c, `${kStyle(k).roof.material.toUpperCase()} — ${kStyle(k).roof.pitchDeg}° PITCH ON RCC ROOF SLAB`, (left + right) / 2, project(0, rz + 450).y, 11, 'center', COLORS.dim, true);
  } else {
    for (const x of [left, right - wallE]) hatchBox(c, { x, y: parapetY, w: wallE, h: roofY - parapetY }, '#eeeae4', -45, 9, PEN.cut);
    drawRect(c, left - 4, parapetY - 6, right - left + 8, 6, { fill: '#d6d6d3', stroke: COLORS.wall, weight: PEN.thin });
    levelMark(c, right + 70, parapetY - 6, `TOP OF PARAPET ${fmtLvl(roofZ + PARAPET_HEIGHT_MM)}`);
  }
  const stTop = pitched ? undefined : (k.g.rooms[floors - 1] ?? []).find(r => r.source.type === 'staircase' && cutY >= r.y && cutY <= r.y + r.d);
  if (stTop) {
    const mx0 = project(stTop.x, 0).x, mx1 = project(stTop.x + stTop.w, 0).x, my = project(0, mumtyZ).y;
    for (const x of [mx0, mx1 - wallE]) hatchBox(c, { x, y: my, w: wallE, h: roofY - my }, '#eeeae4', -45, 9, PEN.cut);
    hatchBox(c, { x: mx0 - 6, y: my - 150 * s, w: mx1 - mx0 + 12, h: 150 * s }, '#cfd3d0', 45, 6, PEN.cut);
    label(c, 'STAIR HEAD ROOM', (mx0 + mx1) / 2, (my + roofY) / 2, 12, 'center', COLORS.text, true);
    levelMark(c, right + 70, my - 150 * s, `TOP OF HEAD ROOM ${fmtLvl(mumtyZ + 150)}`);
  }
  levelMark(c, right + 70, ngl, 'NGL ±0.000');
  levelMark(c, right + 70, project(0, -FD).y, `FOUNDING LEVEL ${fmtLvl(-FD)} (ASSUMED — VERIFY BY SOIL REPORT)`);
  // vertical dimension string on the left, horizontal string below ground
  const vz = [-FD, 0, ...Array.from({ length: floors + 1 }, (_, i) => PL + i * H), ...(pitched ? [] : [roofZ + PARAPET_HEIGHT_MM])];
  const ys = vz.map(z => project(0, z).y);
  drawDimensionChain(c, ys, left - 40, -50, 'vertical', s);
  const outer = unique([b.x, ...sectionRooms(k, 0, cutY).flatMap(r => [r.x, r.x + r.w]), b.x + b.w]);
  dimMm(k, outer, 'x', botY - 40, -0.0001, 'section widths');
  viewTitle(k, 'SECTION 1–1 (THROUGH STAIR)', 130, 150);
  legend(c, 1660, 330, 'SECTION NOTES', [
    `Floor-to-floor ${H} mm; plinth ${PL} mm.`,
    `Slab ${round(storyThickness(k, floors - 1))} mm; beams ${round(positive(firstBeam(k).widthMm, 230))} × ${round(beamD)} mm.`,
    foundationType(k) === 'raft' ? `Raft ${round(padsMm(k)[0]?.depth ?? 300)} mm on 100 mm PCC (see ${sheetNumber('footing_detail', 0)}).` : `Footing ${round(found.w)} × ${round(found.d)} × ${round(found.depth)} mm on ${round(found.pcc)} mm PCC.`,
    `Founding depth ${FD} mm: ASSUMED`,
    '  (same as BOQ) — confirm by soil test.',
    `Walls ${WALL_EXTERNAL_MM} mm ext.; 150 mm partitions.`,
    'Lintel level +2100 above each floor.',
    `Cut shown on plans ${sheetNumber('working_plan', 0)}${k.g.floors > 1 ? '/' + sheetNumber('working_plan', 1) : ''}.`,
  ]);
}
/* A-302: Section 2–2, front (road) to rear, through the largest ground-floor room. */
function sectionBB(k: Context): void {
  const c = k.c, b = k.g.building, floors = Math.min(k.g.floors, 5);
  const FD = ASSUMED_FOUNDING_DEPTH_M * 1000, H = FLOOR_TO_FLOOR_MM, PL = PLINTH_HEIGHT_MM, cutX = sectionCutX(k);
  const roofZ = PL + floors * H, pitched = isPitched(k);
  const stTop = pitched ? undefined : (k.g.rooms[floors - 1] ?? []).find(r => r.source.type === 'staircase' && cutX >= r.x && cutX <= r.x + r.w);
  const top = Math.max(stTop ? roofZ + STAIR_HEAD_ROOM_MM + 150 : 0, roofZ + roofRiseMm(k)) + 400, bottom = -FD - 150 - 500;
  setFrame(k, { x: b.y - 600, y: bottom, w: b.h + 1200, h: top - bottom }, { x: 110, y: 120, w: 1220, h: 1120 }, 60);
  const project = (u: number, z: number): Point => at(k, u, top - z + bottom);
  const s = k.scale, wallE = WALL_EXTERNAL_MM * s;
  const left = project(b.y, 0).x, right = project(b.y + b.h, 0).x, ngl = project(0, 0).y, botY = project(0, bottom).y;
  drawRect(c, left - 520 * s, ngl, right - left + 1040 * s, botY - ngl, { fill: COLORS.earth });
  drawHatch(c, left - 520 * s, ngl + 3, right - left + 1040 * s, botY - ngl - 3, 45, 16);
  drawLine(c, left - 520 * s, ngl, right + 520 * s, ngl, PEN.medium);
  // foundations cut by the line
  for (const pad of padsMm(k).filter(p => cutX >= p.x - 1 && cutX <= p.x + p.w + 1)) {
    const pTop = project(0, -FD + pad.depth).y;
    hatchBox(c, { x: project(pad.y - 75, 0).x, y: project(0, -FD).y, w: (pad.d + 150) * s, h: pad.pcc * s }, '#d7d7d7', -45, 9, PEN.thin);
    hatchBox(c, { x: project(pad.y, 0).x, y: pTop, w: pad.d * s, h: pad.depth * s }, COLORS.concrete, 45, 8, PEN.medium);
    for (const col of (pad.type === 'raft' ? k.g.columns : pad.cols).filter(cl => Math.abs(cl.x - cutX) < cl.w / 2 + 1))
      hatchBox(c, { x: project(col.y, 0).x - col.d * s / 2, y: project(0, PL).y, w: col.d * s, h: pTop - project(0, PL).y }, COLORS.concrete, 45, 10, PEN.medium);
  }
  const plinthY = project(0, PL).y, beamD = positive(firstBeam(k).depthMm, 400);
  hatchBox(c, { x: left, y: plinthY, w: right - left, h: Math.max(3, 300 * s) }, COLORS.concrete, 45, 10, PEN.medium);
  drawLine(c, left, plinthY - 2, right, plinthY - 2, PEN.medium, COLORS.green);
  label(c, 'DPC', left - 12, plinthY - 8, 11, 'right', COLORS.green, true);
  for (let story = 0; story < floors; story++) {
    const baseZ = PL + story * H, slab = storyThickness(k, story);
    const baseY = project(0, baseZ).y, roofY = project(0, baseZ + H).y, wallTop = roofY + slab * s;
    const rooms = (k.g.rooms[story] ?? []).filter(r => !isNiche(r.source) && cutX >= r.x && cutX <= r.x + r.w).sort((p, q) => p.y - q.y);
    for (const u of [b.y, b.y + b.h]) { const xx = project(u, 0).x; hatchBox(c, { x: u === b.y ? xx : xx - wallE, y: wallTop, w: wallE, h: baseY - wallTop }, '#eeeae4', -45, 9, PEN.cut); }
    for (let i = 1; i < rooms.length; i++) {
      const yb = rooms[i].y; if (Math.abs(yb - b.y) < 230 || Math.abs(yb - b.y - b.h) < 230) continue;
      const open = rooms[i].source.openTo?.includes('front') || rooms[i - 1].source.openTo?.includes('rear');
      if (open) continue;
      const xx = project(yb, 0).x; hatchBox(c, { x: xx - 75 * s, y: wallTop, w: 150 * s, h: baseY - wallTop }, '#eeeae4', -45, 9, PEN.cut);
    }
    // openings cut by the section line (doors in partitions, windows / doors in the front and rear walls)
    for (const o of k.g.openings.filter(o2 => o2.floor === story && o2.axis === 'horizontal' && cutX >= o2.a && cutX <= o2.b)) {
      const sill = Math.max(0, finite(o.source.sillHeightMm, o.source.type === 'door' ? 0 : 900)), h = positive(o.source.heightMm, o.source.type === 'door' ? 2100 : 1200);
      const thick = o.face === 'internal' ? 150 : WALL_EXTERNAL_MM;
      const u0 = o.face === 'rear' ? o.fixed - thick : o.face === 'front' ? o.fixed : o.fixed - 75;
      const p0 = project(u0, baseZ + sill + h), p1 = project(u0 + thick, baseZ + sill);
      drawRect(c, p0.x - 1, p0.y, p1.x - p0.x + 2, p1.y - p0.y, { fill: '#fff', stroke: COLORS.wall, weight: PEN.thin });
      if (o.source.type !== 'door') drawLine(c, (p0.x + p1.x) / 2, p0.y, (p0.x + p1.x) / 2, p1.y, PEN.thin, COLORS.dim);
      hatchBox(c, { x: p0.x - 1, y: p0.y - 150 * s, w: p1.x - p0.x + 2, h: 150 * s }, COLORS.concrete, 45, 5, PEN.thin);
    }
    for (const r of rooms) { const cen = project(r.y + r.d / 2, baseZ + 1700), span = r.d * s; if (span > 50) { const t = r.source.name.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase(); let fs = Math.min(14, span / 9); while (fs > 8 && textWidth(c, t, fs) > span - 8) fs -= 0.5; const w = textWidth(c, t, fs); soft(w, fs + 2, [cen, { x: cen.x, y: cen.y - 22 }, { x: cen.x, y: cen.y + 22 }, { x: cen.x, y: cen.y - 44 }], (x, y) => label(c, t, x, y, fs, 'center'), true); } }
    hatchBox(c, { x: left, y: roofY, w: right - left, h: Math.max(4, slab * s) }, '#cfd3d0', 45, 6, PEN.cut);
    for (const gy of k.g.gridY) { const xx = clamp(project(gy, 0).x - 115 * s, left, right - 230 * s); hatchBox(c, { x: xx, y: roofY + slab * s, w: 230 * s, h: Math.max(0, beamD - slab) * s }, '#cfd3d0', 45, 6, PEN.medium); }
    levelMark(c, right + 70, baseY, `${story === 0 ? 'FFL GF' : `FFL F${story}`} ${fmtLvl(baseZ)}`);
  }
  const roofY = project(0, roofZ).y, parapetY = project(0, roofZ + PARAPET_HEIGHT_MM).y;
  if (pitched) {
    const rz = drawPitchedRoof(k, 'left', project, b.y, roofZ, true);
    levelMark(c, right + 70, project(0, rz).y, `RIDGE ${fmtLvl(Math.round(rz))}`);
  } else {
    for (const x of [left, right - wallE]) hatchBox(c, { x, y: parapetY, w: wallE, h: roofY - parapetY }, '#eeeae4', -45, 9, PEN.cut);
    drawRect(c, left - 4, parapetY - 6, right - left + 8, 6, { fill: '#d6d6d3', stroke: COLORS.wall, weight: PEN.thin });
  }
  if (stTop) {
    const m0 = project(stTop.y, 0).x, m1 = project(stTop.y + stTop.d, 0).x, my = project(0, roofZ + STAIR_HEAD_ROOM_MM).y;
    for (const x of [m0, m1 - wallE]) hatchBox(c, { x, y: my, w: wallE, h: roofY - my }, '#eeeae4', -45, 9, PEN.cut);
    hatchBox(c, { x: m0 - 6, y: my - 150 * s, w: m1 - m0 + 12, h: 150 * s }, '#cfd3d0', 45, 6, PEN.cut);
    label(c, 'STAIR HEAD ROOM', (m0 + m1) / 2, (my + roofY) / 2, 12, 'center', COLORS.text, true);
  }
  levelMark(c, right + 70, roofY, `TOS ROOF ${fmtLvl(roofZ)}`);
  if (!pitched) levelMark(c, right + 70, parapetY - 6, `TOP OF PARAPET ${fmtLvl(roofZ + PARAPET_HEIGHT_MM)}`);
  levelMark(c, right + 70, ngl, 'NGL ±0.000');
  levelMark(c, right + 70, project(0, -FD).y, `FOUNDING ${fmtLvl(-FD)} (ASSUMED)`);
  const vz = [-FD, 0, ...Array.from({ length: floors + 1 }, (_, i) => PL + i * H), ...(pitched ? [] : [roofZ + PARAPET_HEIGHT_MM])];
  drawDimensionChain(c, vz.map(z => project(0, z).y), left - 40, -50, 'vertical', s);
  const outer = unique([b.y, ...(k.g.rooms[0] ?? []).filter(r => !isNiche(r.source) && cutX >= r.x && cutX <= r.x + r.w).flatMap(r => [r.y, r.y + r.d]), b.y + b.h]);
  dimMm(k, outer, 'x', botY + 34, -0.0001, 'section depths');
  label(c, 'ROAD SIDE', left, botY + 66, 11, 'left', COLORS.dim, true); label(c, 'REAR', right, botY + 66, 11, 'right', COLORS.dim, true);
  viewTitle(k, 'SECTION 2–2 (FRONT TO REAR)', 130, 150);
  legend(c, 1660, 330, 'SECTION NOTES', [
    `Cut shown on ${sheetNumber('working_plan', 0)}${k.g.floors > 1 ? '/' + sheetNumber('working_plan', 1) : ''}; looking right.`,
    `Floor-to-floor ${H}; plinth ${PL}; parapet ${PARAPET_HEIGHT_MM} mm.`,
    `Foundation: ${foundationName(foundationType(k)).toLowerCase()}.`,
    'Lintels 150 mm over every opening cut.',
    `Section 1–1 (through stair): ${sheetNumber('section_aa', 0)}.`,
  ]);
}

/* G-001: Cover sheet — project data, drawing register, general notes, codes and abbreviations. */
function coverSheet(k: Context): void {
  const c = k.c, L = k.layout, g = k.g, req = k.req;
  label(c, `PROPOSED ${g.floors > 1 ? 'G+1' : 'GROUND FLOOR'} RESIDENCE`, 80, 150, 30, 'left', COLORS.text, true);
  label(c, `${req.city}, ${req.state}  •  Plot ${req.plotWidthFt} × ${req.plotDepthFt} ft  •  Road facing ${req.facing}`, 80, 186, 16, 'left', COLORS.dim);
  { let nm = L.name ?? ''; while (nm.length > 8 && textWidth(c, nm, 14) > 600) nm = nm.slice(0, -2).trimEnd() + '…'; label(c, nm.replace(/……$/, '…'), 80, 212, 14, 'left', COLORS.dim); }
  const beds = L.floors.flatMap(f => f.rooms).filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
  const ws = waterStorage(L);
  const proj: string[][] = [
    ['Plot', `${round(g.plotW)} × ${round(g.plotD)} mm (${(g.plotW * g.plotD / 1e6).toFixed(1)} m²)`],
    ['Building', `${round(g.building.w)} × ${round(g.building.h)} mm, ${g.floors > 1 ? 'G+1' : 'ground floor'}`],
    ['Built-up area', `${finite(L.totalBuiltUpSqM, 0).toFixed(1)} m² (${Math.round(finite(L.totalBuiltUpSqFt, 0))} sqft)`],
    ['Bedrooms', `${beds}`],
    ['FSI used / allowed', `${finite(L.fsiUsed, 0).toFixed(2)} / ${finite(L.fsiValue, 1)} (${L.fsiSource ?? 'assumed'})`],
    ['Structure', `RCC frame, ${concrete(k)} / ${steel(k)}`],
    ['Foundation', foundationName(foundationType(k)).toLowerCase()],
    ['Seismic zone / SBC', `${sval(obj(k.data.parameters), 'seismicZone', '—')} / ${round(nval(obj(k.data.parameters), 'sbc', 150))} kN/m² (assumed)`],
    ['Water storage', `sump ${ws.sumpL} L, OHT ${ws.ohtL} L`],
    ['Levels', `NGL ±0.000, GF FFL +${(PLINTH_HEIGHT_MM / 1000).toFixed(3)}, roof +${(roofLevelMm(g.floors) / 1000).toFixed(3)}`],
  ];
  let y = table(c, 80, 250, [{ h: 'PROJECT DATA', w: 170 }, { h: '', w: 400 }], proj, 'PROJECT', 22);
  const idx = sheetIndex(g.floors, isOfficeLayout(k.layout));
  const reg = idx.map(e => [e.no, e.level > 0 && PER_FLOOR.includes(e.type as DrawingType) ? `${e.title} — FIRST FLOOR` : (PER_FLOOR.includes(e.type as DrawingType) && g.floors > 1 ? `${e.title} — GROUND FLOOR` : e.title), `P${k.rev}`]);
  table(c, 720, 140, [{ h: 'DRG NO', w: 80 }, { h: 'TITLE', w: 380 }, { h: 'REV', w: 50 }], reg, `DRAWING REGISTER (${idx.length} SHEETS)`, Math.min(22, Math.floor(1000 / (reg.length + 2))));
  legend(c, 80, y + 40, 'GENERAL NOTES', [
    '1. All dimensions in mm, levels in m. Do not scale; follow written dimensions.',
    '2. Read with all architectural, structural and services drawings.',
    '3. Setbacks, FSI, SBC and founding depth are ASSUMED — confirm locally.',
    `4. Concrete ${concrete(k)} (structure), M20 (lintels, chajjas), PCC 1:4:8.`,
    `5. Reinforcement ${steel(k)} TMT; cover: footing 50, column 40, beam 25, slab 20.`,
    '6. Masonry: 230 ext. CM 1:6, 115 int. CM 1:4; plaster 12/20 mm.',
    '7. Cure all concrete 10 days minimum; formwork striking per IS 456.',
    '8. Electrical per IS 732 / NBC Part 8; plumbing per NBC Part 9.',
    '9. Preliminary design: architect and structural engineer to verify and sign.',
  ]);
  legend(c, 1280, 140, 'CODES', ['IS 456:2000 — plain & reinforced concrete', 'IS 875 (1–3) — loads', 'IS 1893:2016 — seismic', 'IS 13920:2016 — ductile detailing', 'IS 2502 — bar bending', 'NBC 2016 — building code', 'IS 962 / SP 46 — drafting']);
  legend(c, 1280, 360, 'ABBREVIATIONS', ['FFL finished floor level   NGL natural ground level', 'TOS top of slab   DPC damp-proof course', 'RCC reinforced cement concrete   PCC plain cement concrete', 'OHT overhead tank   RWP rain-water pipe', 'IC inspection chamber   MH manhole   SWR soil/waste', 'DB distribution board   MCB miniature circuit breaker', 'c/c centre to centre   Ø bar diameter   THK thickness']);
  legend(c, 1280, 600, 'SHEET SERIES', ['G general   A architecture   S structure', 'M masonry   E electrical   P plumbing', 'F finishes   D details']);
}

/* A-601: Enlarged toilet and kitchen plans (1:25 where they fit) with fixture set-out and the toilet's service-wall elevation. */
function wetAreas(k: Context): void {
  const c = k.c;
  const all = k.g.rooms.flatMap((fl, f) => fl.map(r => ({ r, f }))).filter(o => !isNiche(o.r.source));
  const toilets = all.filter(o => o.r.source.type === 'toilet').sort((p, q) => q.r.w * q.r.d - p.r.w * p.r.d);
  const pickT: typeof toilets = [];
  for (const t of toilets) if (!pickT.some(p => Math.abs(p.r.w - t.r.w) < 50 && Math.abs(p.r.d - t.r.d) < 50) && pickT.length < 2) pickT.push(t);
  const kit = all.find(o => o.r.source.type === 'kitchen');
  const views = [...pickT, ...(kit ? [kit] : [])];
  const boxes: Bounds[] = [{ x: 70, y: 150, w: 560, h: 560 }, { x: 680, y: 150, w: 560, h: 560 }, { x: 1290, y: 150, w: 640, h: 560 }];
  const tileH = ((k.boq as (BOQ & { takeoff?: Takeoff }) | null)?.takeoff?.bathTileHeightM ?? 2.1) * 1000;
  const keepLevel = k.level;
  views.slice(0, 3).forEach(({ r, f }, vi) => {
    const bx = boxes[vi], m = 450;
    const geo = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.d + 2 * m };
    const den = STD_SCALES.find(d => geo.w * PX_PER_PAPER_MM / d <= bx.w && geo.h * PX_PER_PAPER_MM / d <= bx.h - 60) ?? 100, s = PX_PER_PAPER_MM / den;
    k.views.push(den); k.level = (f > 0 ? 1 : 0) as Level;
    k.frame = { x: bx.x + (bx.w - geo.w * s) / 2, y: bx.y + 40, s, width: geo.x, height: geo.y }; k.scale = s;
    const clip = box(k, geo);
    c.save(); c.beginPath(); c.rect(clip.x, clip.y, clip.w, clip.h); c.clip();
    drawPlanWalls(k, 'solid');
    for (const o of k.g.openings.filter(v => v.floor === k.level && (v.room === r || Math.abs(v.fixed - r.x) < 5 || Math.abs(v.fixed - r.x - r.w) < 5 || Math.abs(v.fixed - r.y) < 5 || Math.abs(v.fixed - r.y - r.d) < 5))) planOpening(c, k, o);
    c.restore();
    const P = (x: number, y: number) => at(k, x, y);
    const fx = (pt: Point, w: number, d: number, draw: (q: Bounds) => void, side: Side) => { // w along the wall, d out of the wall
      const hz = side === 'front' || side === 'rear';
      const q0 = hz ? { x: pt.x - w / 2, y: side === 'front' ? pt.y : pt.y - d, w, h: d } : { x: side === 'left' ? pt.x : pt.x - d, y: pt.y - w / 2, w: d, h: w };
      draw(box(k, q0));
    };
    const setOut: number[] = [];
    let svc: Side = 'rear', tEnd: 0 | 1 = 0;
    const officeWCs = r.source.type === 'toilet' ? Number(/\((\d+) WC/.exec(r.source.name)?.[1] ?? 0) : 0;
    if (officeWCs > 0) {
      // office toilet block: WC cubicles on the service wall, wash counter opposite
      const w = wetLayout(k, r); svc = w.service; tEnd = w.tEnd;
      const L = sideLen(r, svc), tAt = (mm: number) => (w.tEnd === 0 ? mm / L : 1 - mm / L);
      const cub = Math.min(1200, (L - 230) / officeWCs), depth = 1500;
      for (let i = 0; i < officeWCs; i++) {
        const a0 = 115 + i * cub, mid = a0 + cub / 2;
        fx(onSide(r, svc, tAt(mid), 115), cub, depth, q => { drawRect(c, q.x, q.y, q.w, q.h, { stroke: COLORS.wall, weight: 1.4 }); }, svc);
        fx(onSide(r, svc, tAt(mid), 115), 380, 600, q => { drawRect(c, q.x, q.y, q.w, q.h, { stroke: COLORS.wall, weight: 1.2, fill: '#fff' }); c.save(); c.beginPath(); c.ellipse(q.x + q.w / 2, q.y + q.h / 2, q.w / 2 - 3, q.h / 2 - 3, 0, 0, Math.PI * 2); c.strokeStyle = COLORS.wall; c.lineWidth = 1; c.stroke(); c.restore(); }, svc);
        setOut.push(mid);
      }
      { const t = `${officeWCs} WC CUBICLES ${round(cub)} × ${depth}`, q = P(onSide(r, svc, tAt(115 + officeWCs * cub / 2), depth + 280).x, onSide(r, svc, tAt(115 + officeWCs * cub / 2), depth + 280).y), tw = textWidth(c, t, 10, true); soft(tw, 12, ringCands(q.x, q.y, 20, 16, 3), (x, y) => label(c, t, x, y, 10, 'center', COLORS.text, true)); }
      const nb = Math.max(1, Math.min(Math.ceil(officeWCs / 2) + 1, Math.floor((L - 600) / 700))), opp = opposite[svc];
      const wbLen = nb * 700; fx(onSide(r, opp, 0.5, 115), wbLen, 550, q => { hatchBox(c, q, '#efe9df', 45, 10, PEN.thin); }, opp);
      for (let i = 0; i < nb; i++) { const t = (sideLen(r, opp) / 2 - wbLen / 2 + 350 + i * 700) / sideLen(r, opp); fx(onSide(r, opp, t, 115), 420, 380, q => { c.save(); c.beginPath(); c.ellipse(q.x + q.w / 2, q.y + q.h / 2, q.w / 2 - 4, q.h / 2 - 4, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = COLORS.wall; c.lineWidth = 1.2; c.stroke(); c.restore(); }, opp); }
      { const t = `WASH COUNTER — ${nb} BASIN${nb > 1 ? 'S' : ''}`, q0 = onSide(r, opp, 0.5, 900), q = P(q0.x, q0.y), tw = textWidth(c, t, 10, true); soft(tw, 12, ringCands(q.x, q.y, 20, 16, 3), (x, y) => label(c, t, x, y, 10, 'center', COLORS.text, true)); }
      const ft = P(r.x + r.w / 2, r.y + r.d / 2); circle(c, ft.x, ft.y, Math.max(4, 50 * s), '#fff', SVC.drain, 1.4); label(c, 'FT', ft.x + 12, ft.y, 9, 'left', SVC.drain, true);
    } else if (r.source.type === 'toilet') {
      const w = wetLayout(k, r); svc = w.service; tEnd = w.tEnd;
      const L = sideLen(r, svc), tAt = (mm: number) => (w.tEnd === 0 ? mm / L : 1 - mm / L);
      const wallPt = (mm: number) => onSide(r, svc, tAt(mm), svc === 'front' || svc === 'left' ? 115 : 115);
      const sh = onSide(r, svc, tAt(450), 450), shB = box(k, { x: sh.x - 450, y: sh.y - 450, w: 900, h: 900 });
      c.save(); c.setLineDash([6, 4]); drawRect(c, shB.x, shB.y, shB.w, shB.h, { stroke: SVC.water, weight: 1.2 }); c.restore();
      label(c, 'SHOWER 900×900', shB.x + shB.w / 2, shB.y + shB.h / 2 + 16, 10, 'center', SVC.water, true);
      const ft = P(onSide(r, svc, tAt(450), 950).x, onSide(r, svc, tAt(450), 950).y); circle(c, ft.x, ft.y, Math.max(4, 50 * s), '#fff', SVC.drain, 1.4); label(c, 'FT', ft.x + 12, ft.y, 9, 'left', SVC.drain, true);
      fx(wallPt(1250), 380, 600, q => { drawRect(c, q.x, q.y, q.w, q.h, { stroke: COLORS.wall, weight: 1.2, fill: '#fff' }); c.save(); c.beginPath(); c.ellipse(q.x + q.w / 2, q.y + q.h / 2, q.w / 2 - 3, q.h / 2 - 3, 0, 0, Math.PI * 2); c.strokeStyle = COLORS.wall; c.lineWidth = 1; c.stroke(); c.restore(); label(c, 'EWC', q.x + q.w / 2, q.y + q.h / 2, 10, 'center', COLORS.text, true); }, svc);
      const hf = P(onSide(r, svc, tAt(1650), 130).x, onSide(r, svc, tAt(1650), 130).y); circle(c, hf.x, hf.y, 4, SVC.water, SVC.water); label(c, 'HF', hf.x + 8, hf.y, 9, 'left', SVC.water);
      const wbOn = L >= 2500 ? svc : opposite[svc];
      const wbPt = L >= 2500 ? wallPt(2150) : onSide(r, wbOn, 0.5, 115);
      fx(wbPt, 500, 420, q => { drawRect(c, q.x, q.y, q.w, q.h, { stroke: COLORS.wall, weight: 1.2, fill: '#fff' }); label(c, 'WB', q.x + q.w / 2, q.y + q.h / 2, 10, 'center', COLORS.text, true); }, wbOn);
      const g = P(onSide(r, svc, tAt(450), 110).x, onSide(r, svc, tAt(450), 110).y); drawRect(c, g.x - 10, g.y - 7, 20, 14, { fill: '#fff', stroke: SVC.hot, weight: 1.2 }); label(c, 'GY', g.x, g.y + 1, 8, 'center', SVC.hot, true);
      setOut.push(450, 1250, 1650, ...(L >= 2500 ? [2150] : []));
    } else {
      const kc = kitchenCounter(k, r); svc = kc.long;
      for (const [sd, len] of [[kc.long, sideLen(r, kc.long)], [kc.short, Math.min(sideLen(r, kc.short), 1800)]] as [Side, number][]) {
        const start = 0; void start;
        const pt = onSide(r, sd, sd === kc.long ? 0.5 : 0.5, 115);
        fx(pt, sd === kc.long ? len - 230 : len - 230, 600, q => { hatchBox(c, q, '#efe9df', 45, 10, PEN.thin); }, sd);
      }
      fx(onSide(r, kc.long, 0.5, 115), 900, 450, q => { drawRect(c, q.x + 4, q.y + 4, q.w - 8, q.h - 8, { fill: '#fff', stroke: SVC.water, weight: 1.4 }); label(c, 'SINK', q.x + q.w / 2, q.y + q.h / 2, 10, 'center', SVC.water, true); }, kc.long);
      fx(onSide(r, kc.long, 0.8, 115), 600, 500, q => { drawRect(c, q.x + 4, q.y + 4, q.w - 8, q.h - 8, { fill: '#fff', stroke: COLORS.wall, weight: 1.2 }); for (const [a2, b2] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) circle(c, q.x + q.w * a2, q.y + q.h * b2, 5, '#fff', COLORS.wall, 1); label(c, 'HOB', q.x + q.w / 2, q.y + q.h / 2, 9, 'center', COLORS.text, true); }, kc.long);
      { const t = 'COUNTER 600 DEEP, 820 HIGH', q = P(r.x + r.w / 2, r.y + r.d / 2), w = textWidth(c, t, 10, true); soft(w, 12, ringCands(q.x, q.y, 30, 22, 3), (x, y) => label(c, t, x, y, 10, 'center', COLORS.dim, true)); }
    }
    // clear room dimensions
    const cr = clearRect(k, r);
    dimMm(k, [cr.x, cr.x + cr.w], 'x', box(k, cr).y + box(k, cr).h, 0.0001 + 28, 'clear');
    dimMm(k, [cr.y, cr.y + cr.h], 'y', box(k, cr).x + box(k, cr).w, 0.0001 + 28, 'clear');
    label(c, `${r.source.name.toUpperCase()} — ${f === 0 ? 'GF' : 'FF'}`, bx.x, bx.y, 15, 'left', COLORS.green, true);
    label(c, `ENLARGED PLAN  SCALE 1:${den}`, bx.x, bx.y + 18, 11, 'left', COLORS.dim);
    if (setOut.length) label(c, `Set-out from ${tEnd === 0 ? 'the start' : 'the end'} of the ${svc} wall: SH ${setOut[0]}, WC ${setOut[1]}, HF ${setOut[2]}${setOut[3] ? `, WB ${setOut[3]}` : ''} mm (centres)`, bx.x, bx.y + bx.h - 6, 10, 'left', COLORS.dim);
  });
  k.level = keepLevel;
  // toilet service-wall elevation at 1:25
  const t0 = pickT[0];
  if (t0) {
    const w = wetLayout(k, t0.r), L = sideLen(t0.r, w.service), Hc = FLOOR_TO_FLOOR_MM - 150;
    const den = STD_SCALES.find(d => (L + 400) * PX_PER_PAPER_MM / d <= 900 && (Hc + 400) * PX_PER_PAPER_MM / d <= 420) ?? 50, s = PX_PER_PAPER_MM / den;
    k.views.push(den);
    const ox = 110, base = 1190, X = (mm: number) => ox + (w.tEnd === 0 ? mm : L - mm) * s, Y = (mm: number) => base - mm * s;
    label(c, `${t0.r.source.name.toUpperCase()} — SERVICE WALL ELEVATION`, ox - 40, 760, 15, 'left', COLORS.green, true);
    label(c, `SCALE 1:${den}`, ox - 40, 778, 11, 'left', COLORS.dim);
    drawRect(c, X(0) < X(L) ? X(0) : X(L), Y(Hc), L * s, Hc * s, { fill: '#fff', stroke: COLORS.wall, weight: PEN.cut });
    hatchBox(c, { x: Math.min(X(0), X(L)), y: Y(tileH), w: L * s, h: tileH * s }, '#e3eef3', 0, 14, PEN.thin);
    label(c, `WALL TILES TO ${round(tileH)}`, Math.min(X(0), X(L)) + 8, Y(tileH) + 12, 10, 'left', COLORS.dim, true);
    const rect = (cx: number, z0: number, ww: number, hh: number, t: string) => {
      drawRect(c, X(cx) - ww * s / 2, Y(z0 + hh), ww * s, hh * s, { fill: '#fff', stroke: COLORS.wall, weight: 1.2 });
      const tw = textWidth(c, t, 9, true);
      if (tw + 4 <= ww * s) label(c, t, X(cx), Y(z0 + hh / 2), 9, 'center', COLORS.text, true);
      else soft(tw, 11, [{ x: X(cx) + ww * s / 2 + 6 + tw / 2, y: Y(z0 + hh / 2) }, { x: X(cx) - ww * s / 2 - 6 - tw / 2, y: Y(z0 + hh / 2) }, { x: X(cx), y: Y(z0 + hh) - 8 }], (x, y) => label(c, t, x, y, 9, 'center', COLORS.text, true));
    };
    const nWC = Number(/\((\d+) WC/.exec(t0.r.source.name)?.[1] ?? 0);
    if (nWC > 0) { // office block: cubicle partitions (2100 high, 150 clear of floor) with a WC in each
      const cub = Math.min(1200, (L - 230) / nWC), cuts: number[] = [0];
      for (let i = 0; i < nWC; i++) { const a0 = 115 + i * cub, mid = a0 + cub / 2; rect(mid, 0, 380, 400, 'EWC'); rect(mid, 450, 380, 300, ''); cuts.push(a0, a0 + cub);
        drawRect(c, Math.min(X(a0), X(a0 + cub)), Y(2100), cub * s, 1950 * s, { stroke: COLORS.wall, weight: PEN.medium }); }
      { const t = `${nWC} CUBICLES — PARTITIONS 2100 HIGH, 150 CLEAR OF FLOOR; CONCEALED CISTERNS`, tw = textWidth(c, t, 10, true); soft(tw, 12, [{ x: Math.min(X(0), X(L)) + tw / 2 + 8, y: Y(Hc) + 16 }], (x, y) => label(c, t, x, y, 10, 'center', COLORS.text, true)); }
      drawDimensionChain(c, [Y(Hc), Y(2100), Y(150), Y(0)], Math.max(X(0), X(L)), 30, 'vertical', s);
      drawDimensionChain(c, [...new Set([...cuts, L].map(v => X(v)))].sort((a, b) => a - b), Y(0), 30, 'horizontal', s);
    } else {
    rect(1250, 0, 380, 400, 'EWC'); rect(1250, 450, 450, 650, 'CISTERN / FLUSH');
    rect(450, 2250, 400, 450, 'GEYSER'); circle(c, X(450), Y(2100), 6, '#fff', SVC.water, 1.4); soft(textWidth(c, 'SHOWER ROSE 2100', 9), 11, [{ x: X(450) + 60, y: Y(2100) + 14 }, { x: X(450) - 60, y: Y(2100) + 14 }], (x, y) => label(c, 'SHOWER ROSE 2100', x, y, 9, 'center', SVC.water)); drawLine(c, X(450), Y(2100), X(450), Y(1090), 1.4, SVC.water);
    rect(450, 1000, 160, 90, 'MIXER 1000'); circle(c, X(1650), Y(600), 5, SVC.water, SVC.water); label(c, 'HF 600', X(1650) + 8, Y(600), 10, 'left', SVC.water);
    if (L >= 2500) { rect(2150, 800, 500, 150, 'WB TOP 800'); rect(2150, 1300, 450, 600, 'MIRROR'); }
    drawDimensionChain(c, [Y(Hc), Y(tileH), Y(0)], Math.max(X(0), X(L)), 30, 'vertical', s);
    drawDimensionChain(c, [X(0), X(450), X(1250), X(1650), ...(L >= 2500 ? [X(2150)] : []), X(L)].sort((a, b) => a - b), Y(0), 30, 'horizontal', s);
    }
  }
  legend(c, 1290, 780, 'WET-AREA NOTES', [
    `Bath floor sunk 300 mm; waterproofing per ${sheetNumber('waterproofing', 0)}; fall 1:100 to FT.`,
    `Wall tiles to ${round(tileH)} mm (= BOQ); anti-skid floor tiles.`,
    'Fixture centres from the plumbing layout; CP points per schedule.',
    'EWC wall-hung / floor-mounted per client; 100 mm SWR to stack.',
    'Kitchen: granite counter 600 deep on RCC slab / SS frame, 820 high;',
    '  dado 600 mm above counter; sink with RO point; hob with chimney.',
    `Drainage and supply runs: ${sheetNumber('plumbing', 0)}${k.g.floors > 1 ? '/' + sheetNumber('plumbing', 1) : ''}.`,
  ]);
}

/* A-602: Typical construction details — lintel & chajja (1:10); plinth / DPC, stair railing, parapet & coping (1:20). */
function typicalDetails(k: Context): void {
  const c = k.c; k.views.push(10, 20);
  const head = (t: string, den: number, x: number, y: number) => { label(c, t, x, y, 15, 'left', COLORS.green, true); label(c, `SCALE 1:${den}`, x, y + 18, 11, 'left', COLORS.dim); };
  const tag = (t: string, x: number, y: number, tx: number, ty: number) => { drawLine(c, x, y, tx - 4, ty, 0.6, COLORS.dim); circle(c, x, y, 2, COLORS.wall, COLORS.wall); label(c, t, tx, ty, 10.5, 'left', COLORS.text); };
  // quadrant frames (thin) so the four details read as separate views
  for (const q of [{ x: 60, y: 120, w: 960, h: 520 }, { x: 1040, y: 120, w: 920, h: 520 }, { x: 60, y: 660, w: 960, h: 560 }, { x: 1040, y: 660, w: 920, h: 560 }]) drawRect(c, q.x, q.y, q.w, q.h, { stroke: '#d8dcd8', weight: 0.6 });
  // 1. Lintel + chajja (1:10)
  { const S = PX_PER_PAPER_MM / 10, ox = 330, oy = 330; head('1  LINTEL & CHAJJA AT WINDOW HEAD', 10, 80, 140);
    hatchBox(c, { x: ox, y: oy - 100, w: 230 * S, h: 100 }, '#eeeae4', -45, 9, PEN.cut);
    hatchBox(c, { x: ox, y: oy, w: 230 * S, h: 150 * S }, COLORS.concrete, 45, 8, PEN.cut);
    c.save(); c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox - 450 * S, oy + 25 * S); c.lineTo(ox - 450 * S, oy + 75 * S); c.lineTo(ox, oy + 100 * S); c.closePath(); c.fillStyle = COLORS.concrete; c.fill(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.cut; c.stroke(); c.restore();
    drawRect(c, ox + 20, oy + 150 * S, 230 * S - 40, 140, { stroke: COLORS.dim, weight: 0.8 }); label(c, 'WINDOW FRAME', ox + 115 * S, oy + 150 * S + 70, 10, 'center', COLORS.dim);
    for (const yy of [oy + 30 * S, oy + 120 * S]) for (const xx of [ox + 35 * S, ox + 195 * S]) circle(c, xx, yy, 4, COLORS.wall, COLORS.wall);
    drawRect(c, ox + 25 * S, oy + 25 * S, 180 * S, 100 * S, { stroke: COLORS.wall, weight: 1 });
    drawLine(c, ox + 180 * S, oy + 20 * S, ox - 420 * S, oy + 45 * S, 1.6, '#1f5f99');
    drawDimensionChain(c, [ox - 450 * S, ox, ox + 230 * S], oy - 100, -22, 'horizontal', S);
    drawDimensionChain(c, [oy, oy + 150 * S], ox + 230 * S, 26, 'vertical', S);
    tag('Lintel 230×150 M20: 2-10 bottom, 2-8 top, Ø6 @ 150', ox + 57, oy + 40, 560, 250);
    tag('Chajja 450, 100→75 thick: Ø8 @ 150 top into lintel, Ø6 @ 200', ox - 150, oy + 25, 560, 282);
    tag('Drip groove 15×15 at the chajja edge', ox - 220, oy + 37, 560, 314);
    tag('Lintel bears 150 mm each side of the opening', ox + 105, oy + 70, 560, 346); }
  // 2. Plinth / DPC (1:20)
  { const S = PX_PER_PAPER_MM / 20, ox = 1330, yNGL = 540, yFFL = yNGL - PLINTH_HEIGHT_MM * S; head('2  PLINTH, DPC & PLINTH PROTECTION', 20, 1060, 140);
    drawLine(c, ox - 800 * S, yNGL, ox + 1000 * S, yNGL, PEN.medium); label(c, 'NGL ±0.000', ox + 1010 * S, yNGL, 11, 'left', COLORS.text, true);
    drawHatch(c, ox - 800 * S, yNGL + 2, 1800 * S, 80, 45, 10);
    hatchBox(c, { x: ox, y: yNGL - 150 * S, w: 230 * S, h: 450 * S }, COLORS.concrete, 45, 7, PEN.cut);
    hatchBox(c, { x: ox, y: yFFL - 600 * S, w: 230 * S, h: (yNGL - 150 * S) - (yFFL - 600 * S) }, '#eeeae4', -45, 8, PEN.cut);
    drawRect(c, ox, yNGL - 150 * S - 3, 230 * S, 3, { fill: COLORS.green, stroke: COLORS.green, weight: 0.5 });
    hatchBox(c, { x: ox + 230 * S, y: yFFL, w: 800 * S, h: 100 * S }, '#e6e6e6', -45, 6, PEN.medium);
    drawHatch(c, ox + 230 * S, yFFL + 100 * S, 800 * S, yNGL - yFFL - 100 * S, 135, 8);
    hatchBox(c, { x: ox - 600 * S, y: yNGL - 75 * S, w: 600 * S, h: 75 * S }, '#e6e6e6', -45, 6, PEN.medium);
    drawDimensionChain(c, [yFFL, yNGL], ox + 1040 * S, 16, 'vertical', S);
    label(c, `FFL +${(PLINTH_HEIGHT_MM / 1000).toFixed(3)}`, ox + 1010 * S, yFFL - 12, 11, 'left', COLORS.text, true);
    tag('DPC 40 CC 1:2:4 + waterproofing compound', ox + 115 * S, yNGL - 150 * S - 1, 1560, 240);
    tag('Floor: tile on 100 PCC 1:4:8 over compacted filling', ox + 600 * S, yFFL + 50 * S, 1560, 272);
    tag('Plinth protection 600 wide, 75 PCC, slope away', ox - 300 * S, yNGL - 40 * S, 1560, 304);
    tag('Plinth beam 230×300 on all wall lines', ox + 115 * S, yNGL + 30 * S, 1560, 336);
    tag('Anti-termite treatment (IS 6313)', ox + 600 * S, yNGL - 20, 1560, 368); }
  // 3. Stair railing (1:20)
  { const S = PX_PER_PAPER_MM / 20, ox = 160, oy = 1150; head('3  STAIR RAILING', 20, 80, 680);
    const step = (i: number) => ({ x: ox + i * 270 * S, y: oy - i * 165 * S });
    c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.cut; c.beginPath(); c.moveTo(ox, oy); for (let i = 0; i < 5; i++) { const p0 = step(i); c.lineTo(p0.x, p0.y - 165 * S); c.lineTo(p0.x + 270 * S, p0.y - 165 * S); } c.stroke(); c.restore();
    const railY = (x: number) => step(0).y - 165 * S - 900 * S - (x - step(0).x) * 165 / 270;
    for (let i = 0; i < 5; i++) { const p0 = step(i); for (const dx of [0.3, 0.7]) { const xx = p0.x + dx * 270 * S; drawLine(c, xx, p0.y - 165 * S, xx, railY(xx), 1, COLORS.wall); } }
    drawLine(c, step(0).x, step(0).y - 165 * S - 900 * S, step(5).x, step(5).y - 165 * S - 900 * S, 3, COLORS.wall);
    drawDimensionChain(c, [step(0).y - 165 * S - 900 * S, step(0).y - 165 * S], step(0).x, -16, 'vertical', S);
    tag('Handrail 50 Ø SS / MS pipe, 900 above nosing', step(4).x, step(4).y - 165 * S - 900 * S, 560, 760);
    tag('Balusters 20×20 MS, ≤ 100 clear (NBC), grouted 75 into tread', step(3).x + 0.3 * 270 * S, step(3).y - 600 * S, 560, 792);
    tag('Treads 270, risers ≈ 165, granite nosing', step(1).x + 135 * S, step(1).y - 165 * S, 560, 824); }
  // 4. Parapet & coping (1:20)
  { const S = PX_PER_PAPER_MM / 20, ox = 1420, oy = 1120; head('4  PARAPET, COPING & ROOF UPSTAND', 20, 1060, 680);
    hatchBox(c, { x: ox, y: oy - PARAPET_HEIGHT_MM * S, w: 115 * S, h: PARAPET_HEIGHT_MM * S }, '#eeeae4', -45, 8, PEN.cut);
    hatchBox(c, { x: ox - 25 * S, y: oy - (PARAPET_HEIGHT_MM + 75) * S, w: 165 * S, h: 75 * S }, '#e6e6e6', 45, 6, PEN.cut);
    hatchBox(c, { x: ox - 1200 * S, y: oy, w: 1315 * S, h: 150 * S }, COLORS.concrete, 45, 7, PEN.cut);
    drawRect(c, ox - 1200 * S, oy - 75 * S, 1200 * S, 75 * S, { fill: '#ebe6d7', stroke: COLORS.wall, weight: 1 });
    drawLine(c, ox - 1200 * S, oy - 78 * S, ox - 2, oy - 78 * S, 2, '#899c89'); drawLine(c, ox - 2, oy - 78 * S, ox - 2, oy - 300 * S, 2, '#899c89');
    drawDimensionChain(c, [oy - (PARAPET_HEIGHT_MM + 75) * S, oy - PARAPET_HEIGHT_MM * S, oy], ox + 140 * S, 18, 'vertical', S);
    tag(`Parapet 115 brick, ${PARAPET_HEIGHT_MM} high, CM 1:4`, ox + 60 * S, oy - 600 * S, 1560, 800);
    tag('PCC coping 75 with drip both sides', ox + 60 * S, oy - (PARAPET_HEIGHT_MM + 40) * S, 1560, 768);
    tag('Membrane turned up 300 into a groove', ox - 4, oy - 200 * S, 1560, 832);
    tag(`Screed to falls; waterproofing per ${sheetNumber('waterproofing', 0)}`, ox - 600 * S, oy - 40 * S, 1560, 864);
    tag('Roof slab', ox - 700 * S, oy + 75 * S, 1560, 896); }
}

type ElevSide = 'front' | 'rear' | 'left' | 'right';
/** Elevation geometry for one side, viewed from OUTSIDE the building (so the front elevation reads as seen from the road). */
function elevAxis(k: Context, side: ElevSide): { len: number; u: (along: number) => number; line: number; axis: Axis } {
  const b = k.g.building;
  if (side === 'front') return { len: b.w, u: x => b.x + b.w - x, line: b.y, axis: 'horizontal' };
  if (side === 'rear') return { len: b.w, u: x => x - b.x, line: b.y + b.h, axis: 'horizontal' };
  if (side === 'left') return { len: b.h, u: y => y - b.y, line: b.x, axis: 'vertical' };
  return { len: b.h, u: y => b.y + b.h - y, line: b.x + b.w, axis: 'vertical' };
}
/** Chosen exterior style (designStyles); a pitched roof replaces the parapet on elevations and sections. */
const kStyle = (k: Context) => styleFor(k.req);
const isPitched = (k: Context) => !!k.req?.designStyle && kStyle(k).roof.type !== 'flat';
/** Height above roof slab top (mm) the drawing must leave room for. */
function roofRiseMm(k: Context): number {
  if (!isPitched(k)) return PARAPET_HEIGHT_MM;
  const b = k.g.building, g = roofGeom(kStyle(k), b.w / 1000, b.h / 1000);
  return g ? Math.round(g.ridge * 1000) + 250 : PARAPET_HEIGHT_MM;
}
/**
 * Pitched roof outline of the chosen style, seen from `side`, drawn over the roof slab at roofZ (mm).
 * project(u, z): u in the view's own coordinate starting at u0 for the building edge.
 */
function drawPitchedRoof(k: Context, side: ElevSide, project: (u: number, z: number) => Point, u0: number, roofZ: number, section = false): number {
  const st = kStyle(k), b = k.g.building, c = k.c;
  const prof = roofProfile(st, side, b.w / 1000, b.h / 1000);
  if (!prof) return roofZ;
  const P = (pts: [number, number][]) => pts.map(([u, z]) => project(u0 + u * 1000, roofZ + z * 1000));
  const poly = (pts: Point[], fill: string, w = PEN.medium) => {
    c.save(); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
    c.fillStyle = fill; c.fill(); c.strokeStyle = COLORS.wall; c.lineWidth = w; c.stroke(); c.restore();
  };
  if (prof.gable) {
    const gp = P(prof.gable); poly(gp, section ? '#fbfbfa' : '#f7f7f6', PEN.medium);
    if (st.walls.cladding === 'brick' && !section) { // brick courses in the gable
      c.save(); c.beginPath(); gp.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.clip();
      const y0 = Math.min(...gp.map(p => p.y)), y1 = Math.max(...gp.map(p => p.y)), step = Math.max(3, 75 * k.scale);
      for (let y = y1; y > y0; y -= step) drawLine(c, Math.min(...gp.map(p => p.x)), y, Math.max(...gp.map(p => p.x)), y, PEN.hair, COLORS.grid);
      c.restore();
    }
  }
  const rp = P(prof.roof);
  poly(rp, section ? '#f2efe9' : '#e9e4dc', section ? PEN.medium : PEN.cut);
  if (!section) { // tile / slate / shingle courses parallel to the eave, or standing seams
    c.save(); c.beginPath(); rp.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.clip();
    const xs = rp.map(p => p.x), ys = rp.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (/metal/i.test(st.roof.material)) for (let x = x0; x < x1; x += Math.max(4, 450 * k.scale)) drawLine(c, x, y0, x, y1, PEN.hair, COLORS.dim);
    else for (let y = y1; y > y0; y -= Math.max(3, 260 * k.scale)) drawLine(c, x0, y, x1, y, PEN.hair, COLORS.grid);
    c.restore();
  }
  return roofZ + prof.ridge * 1000;
}
function roofNote(k: Context): string {
  if (!k.req?.designStyle) return `Parapet ${PARAPET_HEIGHT_MM} mm; coping shown`;
  const st = kStyle(k);
  return st.roof.type === 'flat' ? `Parapet ${PARAPET_HEIGHT_MM} mm; coping shown` : `${st.roof.type === 'gable' ? 'Gable' : 'Hipped'} roof ${st.roof.pitchDeg}°, eaves ${st.roof.overhangM * 1000} mm`;
}
/** Arched head / shutters / mashrabiya on an elevation window, per the chosen style. */
function styleWindowDress(k: Context, x: number, y: number, w: number, ht: number, upper: boolean, maxRise = 40): number {
  if (!k.req?.designStyle) return 0;
  const st = kStyle(k), c = k.c;
  let rise = 0;
  if (st.openings.arch && maxRise > 4) { // pointed arch over the window head, kept clear of the slab band
    rise = Math.min(w * 0.5, 40, maxRise);
    c.save(); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w * 0.05, y - rise * 0.9, x + w / 2, y - rise); c.quadraticCurveTo(x + w * 0.95, y - rise * 0.9, x + w, y);
    c.closePath(); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = COLORS.wall; c.lineWidth = 1.6; c.stroke(); c.restore();
  }
  if (st.openings.shutters) for (const sx of [x - w / 2 - 3, x + w + 3]) {
    drawRect(c, sx, y, w / 2, ht, { fill: '#f1f3f1', stroke: COLORS.wall, weight: 1 });
    for (let yy = y + 5; yy < y + ht - 2; yy += 6) drawLine(c, sx + 2, yy, sx + w / 2 - 2, yy, PEN.hair, COLORS.dim);
  }
  if (st.openings.mashrabiya && upper) {
    const step = Math.max(4, w / 8);
    for (let xx = x + step; xx < x + w - 1; xx += step) drawLine(c, xx, y + 2, xx, y + ht - 2, PEN.hair, COLORS.wall);
    for (let yy = y + step; yy < y + ht - 1; yy += step) drawLine(c, x + 2, yy, x + w - 2, yy, PEN.hair, COLORS.wall);
  }
  return rise;
}
function elevOpenings(k: Context, side: ElevSide): OpeningPlacement[] {
  const ax = elevAxis(k, side);
  return k.g.openings.filter(o => o.face === side && o.axis === ax.axis && Math.abs(o.fixed - ax.line) < 500);
}
/** Elevation of one side into `target`; `den` forces a common scale for several views on one sheet. */
function elevationView(k: Context, side: ElevSide, target: Bounds, title: string, den?: number, levels = true): { right: number; ngl: number } {
  const c = k.c, floors = Math.min(k.g.floors, 5), ax = elevAxis(k, side);
  const roofZ = roofLevelMm(floors), pitched = isPitched(k);
  // under a pitched roof the stair head room and the tank sit inside the roof void
  const stTop = pitched ? undefined : (k.g.rooms[floors - 1] ?? []).find(r => r.source.type === 'staircase');
  const tanks = pitched ? [] : ohtPlacement(k.layout);
  const tankTop = Math.max(0, ...tanks.map(t => (t.baseM + t.heightM) * 1000));
  const maxZ = Math.max(roofZ + roofRiseMm(k), stTop ? roofZ + STAIR_HEAD_ROOM_MM + 150 : 0, tankTop) + 300;
  const geo = { x: -300, y: -250, w: ax.len + 1700, h: maxZ + 600 };
  if (den) { const s0 = PX_PER_PAPER_MM / den; k.frame = { x: target.x + 300 * s0, y: target.y + target.h - geo.h * s0, s: s0, width: geo.x, height: geo.y }; k.scale = s0; k.views.push(den); }
  else setFrame(k, geo, target, 50);
  const project = (u: number, z: number): Point => at(k, u, maxZ - z - 250);
  const s = k.scale, left = project(0, 0).x, right = project(ax.len, 0).x;
  const ngl = project(0, 0).y, plinth = project(0, PLINTH_HEIGHT_MM).y;
  drawLine(c, left - 120, ngl, right + 160, ngl, 1.5);
  hatchBox(c, { x: left, y: plinth, w: right - left, h: ngl - plinth }, '#e6e8e5', 45, 12);
  const marks = openingTypes(k.g).markOf;
  const ops = elevOpenings(k, side);
  for (let story = 0; story < floors; story++) {
    const z = floorLevelMm(story), topZ = z + FLOOR_TO_FLOOR_MM, slab = storyThickness(k, story);
    const topY = project(0, topZ).y, baseY = project(0, z).y;
    drawRect(c, left, topY, right - left, baseY - topY, { fill: story % 2 ? '#f7f7f6' : '#fafafa', stroke: COLORS.wall, weight: 2 });
    if (k.req?.designStyle) { // facade cladding texture of the chosen style
      const cl = kStyle(k).walls.cladding, y0 = topY + slab * s;
      if (cl === 'brick') for (let y = baseY - 75 * s; y > y0; y -= Math.max(3, 75 * s)) drawLine(c, left, y, right, y, PEN.hair, COLORS.grid);
      else if (cl === 'board_batten') for (let x = left + 400 * s; x < right - 2; x += Math.max(4, 400 * s)) drawLine(c, x, y0, x, baseY, PEN.hair, COLORS.dim);
      else if (cl === 'stone') for (let y = baseY - 600 * s, i = 0; y > y0; y -= Math.max(6, 600 * s), i++) {
        drawLine(c, left, y, right, y, PEN.hair, COLORS.grid);
        for (let x = left + (i % 2 ? 600 : 1200) * s; x < right; x += Math.max(10, 1200 * s)) drawLine(c, x, y, x, Math.min(baseY, y + 600 * s), PEN.hair, COLORS.grid);
      }
    }
    hatchBox(c, { x: left, y: topY, w: right - left, h: Math.max(5, slab * s) }, '#e2e4e2', 45, 14, 2);
    // open balconies on this face: recessed (shaded) wall behind a 1000 mm railing, as in the plans and 3D
    for (const r of (k.g.rooms[story] ?? []).filter(rr => rr.source.type === 'balcony')) {
      const onFace = side === 'front' ? Math.abs(r.y - k.g.building.y) < 40 : side === 'rear' ? Math.abs(r.y + r.d - k.g.building.y - k.g.building.h) < 40
        : side === 'left' ? Math.abs(r.x - k.g.building.x) < 40 : Math.abs(r.x + r.w - k.g.building.x - k.g.building.w) < 40;
      if (!onFace) continue;
      const ua = ax.axis === 'horizontal' ? [ax.u(r.x), ax.u(r.x + r.w)] : [ax.u(r.y), ax.u(r.y + r.d)];
      const p0 = project(Math.min(...ua), topZ), p1 = project(Math.max(...ua), z);
      const yTop = p0.y + slab * s;
      drawRect(c, p0.x + 1, yTop, p1.x - p0.x - 2, p1.y - yTop, { fill: '#e9ebe8', stroke: COLORS.grid, weight: 0.6 });
      const rail = project(0, z + 1000).y;
      drawLine(c, p0.x, rail, p1.x, rail, PEN.medium, COLORS.wall);
      drawLine(c, p0.x, rail + 4, p1.x, rail + 4, PEN.hair, COLORS.wall);
      for (let xx = p0.x + 6; xx < p1.x - 2; xx += Math.max(5, 120 * s)) drawLine(c, xx, rail, xx, p1.y, PEN.hair, COLORS.dim);
      if (p1.x - p0.x > 60) label(c, 'BALCONY', (p0.x + p1.x) / 2, (yTop + rail) / 2, 10, 'center', COLORS.dim, true);
    }
    if (levels) levelMark(c, right + 60, baseY, `FFL ${story === 0 ? 'GF' : `F${story}`} ${fmtLvl(z)}`);
    for (const o of ops.filter(v => v.floor === story)) {
      const u0 = Math.min(ax.u(o.a), ax.u(o.b)), u1 = Math.max(ax.u(o.a), ax.u(o.b));
      const sill = Math.max(0, finite(o.source.sillHeightMm, o.source.type === 'door' ? 0 : 900));
      const h = Math.min(2700, positive(o.source.heightMm, o.source.type === 'door' ? 2100 : 1200));
      const p0 = project(u0, z + sill + h), p1 = project(u1, z + sill);
      const x = p0.x, y = p0.y, w = p1.x - p0.x, ht = p1.y - p0.y;
      if (w < 2 || ht < 2) continue;
      let archRise = 0;
      if (o.source.type !== 'door' && !(k.req?.designStyle && (kStyle(k).openings.arch || pitched))) { // chajja 450 mm over windows, drawn first so marks stay readable
        const l0 = project(u0 - 150, z + sill + h + 250), l1 = project(u1 + 150, z + sill + h + 150);
        hatchBox(c, { x: l0.x, y: l0.y, w: l1.x - l0.x, h: Math.max(3, l1.y - l0.y) }, '#e2e4e2', 45, 6, PEN.thin);
      }
      drawRect(c, x, y, w, ht, { fill: '#fff', stroke: COLORS.wall, weight: 1.8 });
      if (o.source.type === 'door') {
        drawLine(c, x + w / 2, y, x + w / 2, y + ht, 0.8);
        circle(c, x + Math.min(10, w / 4), y + ht * 0.53, 2.2, COLORS.wall, COLORS.wall);
      } else {
        drawLine(c, x + 3, y + ht / 2, x + w - 3, y + ht / 2, 0.9, COLORS.dim);
        if (w > 45) drawLine(c, x + w / 2, y + 2, x + w / 2, y + ht - 2, 0.8, COLORS.dim);
        drawLine(c, x - 4, y + ht, x + w + 4, y + ht, 1.6);
        if (o.source.type === 'ventilator') for (let yy = y + 7; yy < y + ht - 4; yy += 9) drawLine(c, x + 5, yy, x + w - 5, yy, 0.5, COLORS.dim);
        else archRise = styleWindowDress(k, x, y, w, ht, story > 0, y - (topY + slab * s) - 6);
      }
      const m = marks.get(o);
      const tagY = archRise > 0 ? y + 12 : o.source.type === 'door' ? y - 12 : project(0, z + sill + h + 250).y - 12;
      if (m) label(c, m, x + w / 2, tagY, 11, 'center', COLORS.text, true);
    }
  }
  // stair head room and overhead tank(s) above the terrace (same as the section and the 3D model)
  if (stTop) {
    const ua = ax.axis === 'horizontal' ? [ax.u(stTop.x), ax.u(stTop.x + stTop.w)] : [ax.u(stTop.y), ax.u(stTop.y + stTop.d)];
    const p0 = project(Math.min(...ua), roofZ + STAIR_HEAD_ROOM_MM + 150), p1 = project(Math.max(...ua), roofZ);
    drawRect(c, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y, { fill: '#f2f2f0', stroke: COLORS.wall, weight: 1.6 });
    hatchBox(c, { x: p0.x - 4, y: p0.y, w: p1.x - p0.x + 8, h: Math.max(3, 150 * s) }, '#e2e4e2', 45, 6, PEN.thin);
    if (levels) levelMark(c, right + 60, p0.y, `TOP OF HEAD ROOM ${fmtLvl(roofZ + STAIR_HEAD_ROOM_MM + 150)}`);
  }
  for (const t of tanks) {
    const cu = ax.axis === 'horizontal' ? ax.u(t.cx * 1000) : ax.u(t.cy * 1000), r = t.diaM * 500;
    const p0 = project(cu - r, (t.baseM + t.heightM) * 1000), p1 = project(cu + r, t.baseM * 1000);
    drawRect(c, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y, { fill: '#e8f3f8', stroke: '#4b9eb3', weight: 1.2 });
    label(c, 'OHT', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 10, 'center', '#2e7d8f', true);
  }
  const ry = project(0, roofZ).y;
  if (pitched) {
    const ridgeZ = drawPitchedRoof(k, side, project, 0, roofZ);
    if (levels) levelMark(c, right + 60, project(0, ridgeZ).y, `RIDGE ${fmtLvl(Math.round(ridgeZ))}`);
  } else {
    const py = project(0, roofZ + PARAPET_HEIGHT_MM).y;
    hatchBox(c, { x: left, y: py, w: right - left, h: ry - py }, '#f0eee9', 45, 17);
    drawRect(c, left - 5, py - 10, right - left + 10, 10, { fill: '#d6d6d3', stroke: COLORS.wall, weight: 1 });
    if (levels) levelMark(c, right + 60, py, `TOP OF COPING ${fmtLvl(roofZ + PARAPET_HEIGHT_MM)}`);
  }
  if (levels) levelMark(c, right + 60, ngl, 'NGL ±0.000');
  if (levels) levelMark(c, right + 60, ry, `TOS ROOF ${fmtLvl(roofZ)}`);
  drawDimensionChain(c, [left, right], ngl, 40, 'horizontal', s);
  const gf = ops.filter(o => o.floor === 0);
  const us = unique([0, ...gf.flatMap(o => [ax.u(o.a), ax.u(o.b)]), ax.len]).map(u => project(u, 0).x);
  if (us.length > 2) drawDimensionChain(c, us, ngl, 72, 'horizontal', s);
  viewTitle(k, title, target.x + 10, target.y + 10);
  return { right, ngl };
}
function frontElevation(k: Context): void {
  const c = k.c, b = k.g.building;
  elevationView(k, 'front', { x: 135, y: 130, w: 1540, h: 960 }, 'FRONT ELEVATION (AS SEEN FROM THE ROAD)');
  legend(c, 1715, 285, 'ELEVATION KEY', [
    `Building width ${round(b.w)} mm`,
    `Front setback ${round(k.g.setbacks.front)} mm`,
    `Plinth +${PLINTH_HEIGHT_MM} mm; storeys ${FLOOR_TO_FLOOR_MM} mm`,
    roofNote(k),
    'Openings, sills and heights from the',
    `locked plan; marks as per ${sheetNumber('door_window_schedule', 0)}.`,
    isPitched(k) || (k.req?.designStyle && kStyle(k).openings.arch) ? 'Window heads as per the chosen style.' : 'Chajja 450 mm over every window.',
    `Side elevations: ${sheetNumber('side_elevation', 0)}.`,
  ]);
  const ax = elevAxis(k, 'front');
  const front = elevOpenings(k, 'front').filter(o => o.floor === 0).sort((p, q) => Math.min(ax.u(p.a), ax.u(p.b)) - Math.min(ax.u(q.a), ax.u(q.b)));
  label(c, 'FRONT OPENING SET-OUT (GF)', 1715, 575, 17, 'left', COLORS.green, true);
  label(c, 'measured from the left corner as seen from the road', 1715, 596, 11, 'left', COLORS.dim);
  if (!front.length) label(c, 'No front-wall entries in schedule.', 1715, 620, 14);
  const marks = openingTypes(k.g).markOf;
  front.slice(0, 9).forEach((o, i) => {
    const elevRoomName = o.room.source.name.replace(/\s*\(.*?\)\s*/g, '').trim().slice(0, 14);
    const u0 = Math.min(ax.u(o.a), ax.u(o.b)), u1 = Math.max(ax.u(o.a), ax.u(o.b));
    label(c, `${marks.get(o) ?? '—'}  ${elevRoomName}: ${round(u0)}–${round(u1)} mm`, 1715, 625 + i * 38, 13);
    label(c, `sill ${round(o.source.sillHeightMm)} • height ${round(o.source.heightMm)} mm`, 1740, 643 + i * 38, 11, 'left', COLORS.dim);
  });
  if (front.length > 9) label(c, `${front.length - 9} more — see ${sheetNumber('door_window_schedule', 0)}.`, 1715, 625 + 9 * 38, 13);
}
/* A-202: Left, right and rear elevations at one common scale. */
function sideElevations(k: Context): void {
  const c = k.c, b = k.g.building, floors = Math.min(k.g.floors, 5);
  const tanks = isPitched(k) ? [] : ohtPlacement(k.layout);
  const st = isPitched(k) ? undefined : (k.g.rooms[floors - 1] ?? []).find(r => r.source.type === 'staircase');
  const maxZ = Math.max(roofLevelMm(floors) + roofRiseMm(k), st ? roofLevelMm(floors) + STAIR_HEAD_ROOM_MM + 150 : 0, ...tanks.map(t => (t.baseM + t.heightM) * 1000)) + 300;
  // all three views in one row on a common ground line and scale; levels once, on the right
  const GAP = 2000, total = b.h + b.w + b.h + 2 * GAP + 600;
  const den = STD_SCALES.find(d => total * PX_PER_PAPER_MM / d + 300 <= 1960 && (maxZ + 600) * PX_PER_PAPER_MM / d <= 700) ?? 500;
  const s0 = PX_PER_PAPER_MM / den, top = 150, h = 780;
  let x = 70;
  const views: [ElevSide, string, number][] = [['left', 'LEFT SIDE ELEVATION', b.h], ['rear', 'REAR ELEVATION', b.w], ['right', 'RIGHT SIDE ELEVATION', b.h]];
  views.forEach(([side, title, len], i) => {
    elevationView(k, side, { x, y: top, w: len * s0 + 600, h }, title, den, i === views.length - 1);
    x += (len + GAP) * s0;
  });
  legend(c, 90, 1070, 'ELEVATION NOTES', [
    'Each view is drawn as seen from outside that side; left/right as seen from the road.',
    `Plinth +${PLINTH_HEIGHT_MM}; storeys ${FLOOR_TO_FLOOR_MM}; ${roofNote(k)}.`,
    isPitched(k) ? 'Stair head room and OHT inside the roof void (loft); access hatch from the stair.' : `Stair head room ${STAIR_HEAD_ROOM_MM} mm above terrace; OHT on its roof (capacity as BOQ / ${sheetNumber('water_tank', 0)}).`,
    `Opening marks as per ${sheetNumber('door_window_schedule', 0)}; chajja 450 mm over windows. Front elevation: ${sheetNumber('front_elevation', 0)}.`,
    `RWPs at the four corners (see ${sheetNumber('terrace_plan', 0)}).`,
  ]);
}

/* A-001: Site plan — plot, setbacks, building, gate, parking, sump, drainage and area statement. */
function sitePlan(k: Context): void {
  const c = k.c, g = k.g, b = g.building, fp = g.footprint, L = k.layout;
  // Largest preferred scale at which road + plot fit the drawing area (road strip above, clear of the dimension strings).
  const GAP = 82, TOP = 110, AVAIL_H = DRAW_BOTTOM - TOP - 10, AVAIL_W = 1180;
  const roadPx = (sc: number) => Math.max(50, 1500 * sc);
  const den = STD_SCALES.find(d => { const sc = PX_PER_PAPER_MM / d; return fp.h * sc + GAP + roadPx(sc) + 20 <= AVAIL_H && fp.w * sc + 260 <= AVAIL_W; }) ?? 500;
  const s = PX_PER_PAPER_MM / den, roadH = roadPx(s);
  const slack = AVAIL_H - (fp.h * s + GAP + roadH + 20);
  k.frame = { x: 70 + (AVAIL_W - fp.w * s) / 2 + 40, y: TOP + roadH + GAP + slack / 2, s, width: fp.x, height: fp.y };
  k.scale = s; k.views.push(den);
  const P0 = box(k, fp);
  const road = { x: P0.x - 140, y: P0.y - GAP - roadH, w: P0.w + 280, h: roadH };
  drawRect(c, road.x, road.y, road.w, road.h, { fill: '#ececec', stroke: COLORS.grid, weight: 1 });
  dashed(c, { x: road.x, y: road.y + road.h / 2 }, { x: road.x + road.w, y: road.y + road.h / 2 }, '#fff', 3, [24, 16]);
  label(c, `ROAD (${k.req.facing.toUpperCase()} SIDE) — WIDTH TO BE CONFIRMED`, road.x + road.w / 2, road.y + road.h / 2 - 16, 13, 'center', COLORS.dim, true);
  // compound wall with gate opening
  const cw = COMPOUND_WALL_THICKNESS_MM;
  const gateW = gateWidthM(L.plotWidthM) * 1000;
  const gateC = fp.x + gateCentreM(L, mainDoorCentreM(L)) * 1000;
  const P = box(k, fp);
  hatchBox(c, { x: P.x, y: P.y + P.h - cw * s, w: P.w, h: cw * s }, '#d9d4cc', 45, 5, PEN.thin);
  hatchBox(c, { x: P.x, y: P.y, w: cw * s, h: P.h }, '#d9d4cc', 45, 5, PEN.thin);
  hatchBox(c, { x: P.x + P.w - cw * s, y: P.y, w: cw * s, h: P.h }, '#d9d4cc', 45, 5, PEN.thin);
  const g0 = at(k, gateC - gateW / 2, fp.y).x, g1 = at(k, gateC + gateW / 2, fp.y).x;
  hatchBox(c, { x: P.x, y: P.y, w: g0 - P.x, h: cw * s }, '#d9d4cc', 45, 5, PEN.thin);
  hatchBox(c, { x: g1, y: P.y, w: P.x + P.w - g1, h: cw * s }, '#d9d4cc', 45, 5, PEN.thin);
  c.save(); c.strokeStyle = COLORS.wall; c.lineWidth = PEN.thin; c.beginPath();
  c.arc(g0, P.y, (g1 - g0) / 2, 0, Math.PI / 2); c.moveTo(g1, P.y); c.arc(g1, P.y, (g1 - g0) / 2, Math.PI, Math.PI / 2, true); c.stroke(); c.restore();
  label(c, `MAIN GATE ${gateW / 1000} m`, g1 + 8, P.y + 16, 12, 'left', COLORS.text, true);
  // driveway / parking in the front open space
  const frontOpen = g.setbacks.front;
  if (frontOpen >= 1200) {
    const dw = Math.min(gateW, 3000), dx = clamp(gateC - dw / 2, fp.x + cw, fp.x + fp.w - cw - dw);
    const d = box(k, { x: dx, y: fp.y + cw, w: dw, h: Math.max(0, b.y - fp.y - cw) });
    drawRect(c, d.x, d.y, d.w, d.h, { fill: '#f3efe6', stroke: COLORS.grid, weight: 1, dash: [6, 4] });
    { const t = frontOpen >= 5000 ? 'CAR PARKING' : 'TWO-WHEELER / PAVED', w = textWidth(c, t, 12, true); soft(w, 14, ringCands(d.x + d.w / 2, d.y + d.h / 2, 0, Math.max(14, d.h / 4), 2).filter((_, i) => i < 3 || i === 0), (x, y) => label(c, t, x, y, 12, 'center', COLORS.dim, true)); }
  }
  // building footprint with ground-floor rooms (light) and main entry
  const B = box(k, b);
  drawRect(c, B.x, B.y, B.w, B.h, { fill: '#f4f4f2', stroke: COLORS.wall, weight: PEN.cut });
  for (const r of (g.rooms[0] ?? []).filter(rr => !isNiche(rr.source))) { const R = box(k, { x: r.x, y: r.y, w: r.w, h: r.d }); drawRect(c, R.x, R.y, R.w, R.h, { stroke: COLORS.grid, weight: 0.6 }); if (R.w > 60 && R.h > 30) label(c, r.source.name.replace(/\s*\(.*?\)\s*/g, '').toUpperCase().slice(0, 16), R.x + R.w / 2, R.y + R.h / 2, 10, 'center', COLORS.dim); }
  label(c, `PROPOSED ${g.floors > 1 ? 'G+1' : 'GROUND'} RESIDENCE`, B.x + B.w / 2, B.y + B.h + 18, 13, 'center', COLORS.text, true);
  label(c, `FFL +${(PLINTH_HEIGHT_MM / 1000).toFixed(3)}  •  ${round(b.w)} × ${round(b.h)} mm`, B.x + B.w / 2, B.y + B.h + 36, 11, 'center', COLORS.dim);
  const md = mainDoorCentreM(L);
  if (md !== undefined) { const e = at(k, md * 1000, b.y); arrow(c, e.x, e.y - 46, e.x, e.y - 4, COLORS.green); { const w = textWidth(c, 'ENTRY', 11, true); soft(w, 13, [{ x: e.x + 8 + w / 2, y: e.y - 40 }, { x: e.x - 8 - w / 2, y: e.y - 40 }, { x: e.x + 8 + w / 2, y: e.y - 18 }, { x: e.x - 8 - w / 2, y: e.y - 18 }], (x, y) => label(c, 'ENTRY', x, y, 11, 'center', COLORS.green, true)); } }
  // services: sump, RWPs, inspection chambers to the road
  const sp = sumpPlacement(L), sm = box(k, { x: sp.cx * 1000 - sp.l * 500, y: sp.cy * 1000 - sp.w * 500, w: sp.l * 1000, h: sp.w * 1000 });
  drawRect(c, sm.x, sm.y, sm.w, sm.h, { fill: '#e8f3f8', stroke: '#4b9eb3', weight: 1.5 });
  label(c, `UG SUMP ${waterStorage(L).sumpL} L`, sm.x + sm.w / 2, sm.y - 10, 11, 'center', '#2e7d8f', true);
  for (const r of rainwaterPipes(L)) { const p = at(k, r.x * 1000, r.y * 1000); circle(c, p.x, p.y, 6, '#fff', '#4b9eb3', 1.4); }
  const mh = at(k, b.x + b.w + 600, b.y - Math.max(600, g.setbacks.front * 0.6));
  drawRect(c, mh.x - 12, mh.y - 9, 24, 18, { fill: '#fff', stroke: '#8e5a2b', weight: 1.6 });
  label(c, 'MH', mh.x, mh.y + 1, 9, 'center', '#8e5a2b', true);
  dashed(c, mh, { x: mh.x, y: road.y + road.h - 6 }, '#8e5a2b', 1.4, [7, 4]);
  label(c, 'TO SEWER', mh.x + 8, road.y + road.h - 12, 10, 'left', '#8e5a2b');
  // setback and plot dimensions
  drawPlot(k);
  // area statement (same numbers as the planner, validation and BOQ)
  const plotSqm = (g.plotW * g.plotD) / 1e6, gfSqm = (b.w * b.h) / 1e6;
  const bua = finite(L.totalBuiltUpSqM, gfSqm * g.floors), fsiCap = finite(L.fsiValue, 1);
  const rs = L.requiredSetbacks;
  const rowsOut: string[][] = [
    ['Plot area', `${plotSqm.toFixed(2)} m²`, `${Math.round(plotSqm * 10.7639)} sqft`],
    ['Ground coverage', `${gfSqm.toFixed(2)} m²`, `${((gfSqm / plotSqm) * 100).toFixed(1)} %`],
    ['Total built-up area', `${bua.toFixed(2)} m²`, `${Math.round(bua * 10.7639)} sqft`],
    ['FSI / FAR used', `${(bua / plotSqm).toFixed(2)}`, `allowed ${fsiCap} (${L.fsiSource ?? 'assumed'})`],
    ['Floors', g.floors > 1 ? 'G+1' : 'Ground', `height ${(roofLevelMm(g.floors) + PARAPET_HEIGHT_MM) / 1000} m to coping`],
    ['Setback front (req./prov.)', `${rs ? rs.front : '—'} / ${(g.setbacks.front / 1000).toFixed(2)} m`, ''],
    ['Setback rear (req./prov.)', `${rs ? rs.rear : '—'} / ${(g.setbacks.rear / 1000).toFixed(2)} m`, ''],
    ['Setback left (req./prov.)', `${rs ? rs.left : '—'} / ${(g.setbacks.left / 1000).toFixed(2)} m`, ''],
    ['Setback right (req./prov.)', `${rs ? rs.right : '—'} / ${(g.setbacks.right / 1000).toFixed(2)} m`, ''],
  ];
  const y = table(c, 1420, 150, [{ h: 'ITEM', w: 220 }, { h: 'VALUE', w: 150 }, { h: 'NOTE', w: 160 }], rowsOut, 'AREA STATEMENT');
  legend(c, 1420, y + 40, 'SITE NOTES', [
    `Compound wall ${cw} mm, ${COMPOUND_WALL_HEIGHT_MM / 1000} m high; gate ${gateW / 1000} m (= BOQ).`,
    `Sump ${waterStorage(L).sumpL} L, OHT ${waterStorage(L).ohtL} L for ~${waterStorage(L).persons} persons (= BOQ).`,
    'RWPs at four corners to soak pit / recharge well.',
    'Drainage via ICs to manhole and municipal sewer',
    '  (septic tank + soak pit where no sewer).',
    `Setbacks/FSI ${L.setbackSource ?? 'assumed'} — confirm with local authority.`,
    'Levels: NGL ±0.000 assumed; survey to confirm.',
  ]);
  viewTitle(k, 'SITE PLAN', 80, 130);
}

/* A-109: Terrace / roof plan — parapet, head room, OHT, slopes to RWPs. */
function terracePlan(k: Context): void {
  const c = k.c, g = k.g, b = g.building, L = k.layout; planFrame(k);
  const s = k.scale, B = box(k, b), pt = 115 * s;
  drawRect(c, B.x, B.y, B.w, B.h, { fill: '#fbfbf9', stroke: COLORS.wall, weight: PEN.cut });
  drawRect(c, B.x + pt, B.y + pt, B.w - 2 * pt, B.h - 2 * pt, { stroke: COLORS.wall, weight: PEN.medium });
  label(c, `PARAPET 115 mm × ${PARAPET_HEIGHT_MM} mm WITH COPING`, B.x + B.w / 2, B.y - 18, 11, 'center', COLORS.dim);
  const top = g.rooms[g.floors - 1] ?? [];
  const st = top.find(r => r.source.type === 'staircase');
  const tanks = ohtPlacement(L);
  if (st) {
    const S = box(k, { x: st.x, y: st.y, w: st.w, h: st.d });
    hatchBox(c, S, '#eceae4', 45, 10, PEN.cut);
    label(c, 'STAIR HEAD ROOM', S.x + S.w / 2, S.y + 18, 12, 'center', COLORS.text, true);
    label(c, `ROOF +${((roofLevelMm(g.floors) + STAIR_HEAD_ROOM_MM + 150) / 1000).toFixed(3)}`, S.x + S.w / 2, S.y + 34, 10, 'center', COLORS.dim);
    const door = box(k, { x: st.x + st.w / 2 - 450, y: st.y - 60, w: 900, h: 120 });
    drawRect(c, door.x, door.y, door.w, door.h, { fill: '#fff', stroke: COLORS.wall, weight: 1 });
    label(c, 'DOOR 900', door.x + door.w / 2, door.y - 10, 10, 'center', COLORS.dim);
  }
  for (const t of tanks) {
    const p = at(k, t.cx * 1000, t.cy * 1000);
    circle(c, p.x, p.y, (t.diaM * 500) * s, '#e8f3f8', '#4b9eb3', 1.6);
    label(c, `OHT ${t.eachL} L`, p.x, p.y + 1, 10, 'center', '#2e7d8f', true);
  }
  // slopes: 1:100 falls from the ridge to the four corner RWPs
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  for (const r of rainwaterPipes(L)) {
    const p = at(k, clamp(r.x * 1000, b.x + 300, b.x + b.w - 300), clamp(r.y * 1000, b.y + 300, b.y + b.h - 300));
    const stB = st ? box(k, { x: st.x, y: st.y, w: st.w, h: st.d }) : null;
    const hits = (t: number) => !!stB && cx + (p.x - cx) * t > stB.x && cx + (p.x - cx) * t < stB.x + stB.w && cy + (p.y - cy) * t > stB.y && cy + (p.y - cy) * t < stB.y + stB.h;
    if (![0.35, 0.5, 0.65, 0.8].some(hits)) arrow(c, cx + (p.x - cx) * 0.35, cy + (p.y - cy) * 0.35, cx + (p.x - cx) * 0.8, cy + (p.y - cy) * 0.8, COLORS.green);
    circle(c, p.x, p.y, 7, '#fff', '#4b9eb3', 1.5);
    { const tw = textWidth(c, 'RWP Ø110', 10, true), dx = r.side === 'left' ? 10 + tw / 2 : -10 - tw / 2, dy = p.y < cy ? 18 : -14;
      soft(tw, 12, [{ x: p.x + dx, y: p.y + dy }, { x: p.x + dx, y: p.y - dy }, { x: p.x + dx, y: p.y + dy * 2 }, { x: p.x - dx, y: p.y + dy }, { x: p.x + dx, y: p.y - dy * 2 }], (x, y) => label(c, 'RWP Ø110', x, y, 10, 'center', '#2e7d8f', true)); }
  }
  { const t2 = `TERRACE +${(roofLevelMm(g.floors) / 1000).toFixed(3)}`, w = Math.max(textWidth(c, 'FALL 1:100 TO RWPs', 12, true), textWidth(c, t2, 11));
    soft(w, 34, ringCands(cx, cy, Math.max(60, B.w / 6), Math.max(40, B.h / 6), 2), (x, y) => { label(c, 'FALL 1:100 TO RWPs', x, y - 8, 12, 'center', COLORS.green, true); label(c, t2, x, y + 12, 11, 'center', COLORS.dim); }); }
  planDimensions(k, false);
  const wpSqm = ((b.w - 230) * (b.h - 230)) / 1e6 - (st ? (st.w * st.d) / 1e6 : 0);
  const rowsOut: string[][] = [
    ['Terrace slab level', `+${(roofLevelMm(g.floors) / 1000).toFixed(3)} m`],
    ['Open terrace (waterproofed)', `${wpSqm.toFixed(2)} m²`],
    ['Parapet length (= BOQ)', `${(2 * (b.w + b.h) / 1000).toFixed(2)} m`],
    ['Parapet height', `${PARAPET_HEIGHT_MM} mm`],
    ['Stair head room', st ? `${round(st.w)} × ${round(st.d)} mm` : 'none'],
    ['Overhead tank(s) (= BOQ)', `${tanks.length} × ${tanks[0]?.eachL ?? 0} L = ${waterStorage(L).ohtL} L`],
    ['Rain-water pipes', `${rainwaterPipes(L).length} nos Ø110 mm`],
  ];
  const y = table(c, 1420, 150, [{ h: 'ITEM', w: 260 }, { h: 'VALUE', w: 250 }], rowsOut, 'TERRACE SCHEDULE');
  legend(c, 1420, y + 40, 'NOTES', [
    `Waterproofing build-up as ${sheetNumber('waterproofing', 0)} (membrane + screed to falls).`,
    'Upstand 300 mm at parapet and head-room walls.',
    'Khurrami / spout at each RWP with grating.',
    `OHT on 300 mm stand over the down-take (${sheetNumber('plumbing', 0)}).`,
    'Lightning conductor where required by local rules.',
  ]);
  northAndScale(k, 1450, y + 270);
  viewTitle(k, 'TERRACE / ROOF PLAN', 80, 140);
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
  const ws = waterStorage(k.layout), ss = sumpSizeM(ws.sumpL), tk = ohtTanks(ws.ohtL);
  legend(c, 155, 1110, 'DESIGN BASIS (SAME AS BOQ, SITE PLAN AND TERRACE PLAN)', [
    `Occupancy ~${ws.persons} persons @ 135 lpcd. UG sump ${ws.sumpL} L (1.5 days): internal ${ss.l.toFixed(2)} × ${ss.w.toFixed(2)} m, water depth ${ss.waterDepth} m + 300 mm freeboard.`,
    `Overhead storage ${ws.ohtL} L (1 day): ${tk.count} × ${tk.eachL} L loft tank(s) Ø${Math.round(tk.diaM * 1000)} mm on a 300 mm stand${ohtPlacement(k.layout)[0]?.onHeadRoom ? ' over the stair head room' : ' on the terrace'} (${sheetNumber('terrace_plan', 0)}).`,
    'RCC section shown is typical; support reactions, seismic anchorage and potable-water hygiene need project-specific design.',
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
/** Services frame. withPlot: show the whole plot if it fits at 1:100; otherwise the building + 3 m of the site
 * (sump, inspection chambers, manhole) at 1:100 — the full plot is on the site plan. Returns whether the plot is framed. */
function svcFrame(k: Context, withPlot = false): boolean {
  const b = k.g.building, m = 450; // tight margin so small houses reach 1:50
  const target = { x: 80, y: 120, w: 1300, h: 1060 }, pad = 40;
  let plot = false;
  if (withPlot) {
    const fp = k.g.footprint, sAt100 = PX_PER_PAPER_MM / 100;
    plot = fp.w * sAt100 <= target.w - 2 * pad && fp.h * sAt100 <= target.h - 2 * pad;
    const M = 3000, site = { x: Math.max(fp.x, b.x - M), y: Math.max(fp.y, b.y - M), w: 0, h: 0 };
    site.w = Math.min(fp.x + fp.w, b.x + b.w + M) - site.x; site.h = Math.min(fp.y + fp.h, b.y + b.h + M) - site.y;
    setFrame(k, plot ? fp : site, target, pad);
  } else setFrame(k, { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }, target, pad);
  // Service symbols shrink with the drawing scale so small wet rooms stay legible (full size at 1:50).
  SYM_SCALE = Math.max(0.62, Math.min(1, k.scale / 0.1));
  return plot;
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
  // back-to-back baths on one internal wall: the second bath (further right / rear) anchors from the opposite end,
  // so the two sets of fixtures are staggered along the shared wall instead of sitting point-for-point opposite
  if (!ext.includes(service)) {
    const e = 5, nb = selected(k).find(o => o !== r && o.source.type === 'toilet' && (
      service === 'right' ? Math.abs(o.x - (r.x + r.w)) < e : service === 'left' ? Math.abs(o.x + o.w - r.x) < e
        : service === 'rear' ? Math.abs(o.y - (r.y + r.d)) < e : Math.abs(o.y + o.d - r.y) < e)
      && (horizontal ? Math.min(o.x + o.w, r.x + r.w) - Math.max(o.x, r.x) : Math.min(o.y + o.d, r.y + r.d) - Math.max(o.y, r.y)) > 600);
    if (nb && r.x + r.y > nb.x + nb.y) tEnd = tEnd === 0 ? 1 : 0;
  }
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
  const circuits = planCircuits(rooms.map(r => r.source));
  /** wiring curve (draughting convention): switch board → point */
  const wire = (a: Point, b: Point, color: string) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    c.save(); c.setLineDash([4, 3]); c.strokeStyle = color; c.lineWidth = 0.8; c.beginPath(); c.moveTo(a.x, a.y);
    c.quadraticCurveTo(mx - dy / L * Math.min(30, L * 0.2), my + dx / L * Math.min(30, L * 0.2), b.x, b.y); c.stroke(); c.restore();
  };
  for (const r of rooms) {
    const ceilPts: Point[] = [], wallPts: Point[] = [];
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
      ceilPts.push(q);
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
      (item.code === 'EF' ? ceilPts : wallPts).push(p);
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
    for (const q of ceilPts) wire(sp, q, SVC.light);
    for (const q of wallPts) wire(sp, q, SVC.power);
    drawRect(c, sp.x - 7, sp.y - 5, 14, 10, { fill: COLORS.wall, stroke: COLORS.wall, weight: 1 });
    const tag = circuits.filter(ci => ci.roomIds.includes(r.source.id)).map(ci => ci.no).join(',');
    if (tag) { const w = textWidth(c, tag, 9, true) + 6; soft(w, 12, ringCands(sp.x + w / 2 + 9, sp.y - 10, 16, 12, 2), (x, y) => { drawRect(c, x - w / 2, y - 6, w, 12, { fill: '#fff', stroke: SVC.power, weight: 0.6 }); label(c, tag, x, y + 0.5, 9, 'center', SVC.power, true); }, true); }
  }
  drawRect(c, db.x - 18, db.y - 12, 36, 24, { fill: '#fff', stroke: SVC.power, weight: 2.2 });
  label(c, k.level === 0 ? 'DB' : 'SDB', db.x, db.y + 1, 11, 'center', SVC.power, true);
  // Schedule + legend.
  const floorTotal = ELEC_KINDS.reduce((s, kind) => s + tot[kind], 0);
  rowsOut.push(['TOTAL ' + (k.level === 0 ? 'GF' : 'FF'), `${tot.light}`, `${tot.fan}`, `${tot.exhaust}`, `${tot.socket}`, `${tot.power}`, `${tot.ac}`, `${floorTotal}`]);
  const allRooms = k.layout.floors.flatMap(f => f.rooms);
  const whole = electricalPoints(allRooms);
  rowsOut.push(['WHOLE HOUSE (= BOQ)', '', '', '', '', '', '', `${whole}`]);
  let y = table(c, 1420, 140, [{ h: 'ROOM', w: 200 }, { h: 'L', w: 36 }, { h: 'F', w: 36 }, { h: 'EF', w: 36 }, { h: 'S', w: 36 }, { h: 'P', w: 36 }, { h: 'AC', w: 36 }, { h: 'PTS', w: 46 }], rowsOut, `POINT SCHEDULE — ${floorName(k)}`, 19);
  const crow = circuits.map(ci => [ci.no, ci.kind === 'lighting' ? 'Lights/fans' : ci.kind === 'socket' ? '6A sockets' : ci.kind === 'power' ? '16A power' : 'Split AC',
    ci.rooms.map(n => n.replace(/\s*\(.*?\)\s*/g, '')).join(', '), `${ci.points}`, `${ci.loadW}`, `${ci.mcbA}A`, `${ci.cableMm2}`]);
  const dm = circuitDemand(circuits);
  // the main DB (GF) carries the whole house: main switch and supply from every floor's circuits
  const whole0 = circuitDemand(k.layout.floors.flatMap(f => planCircuits(f.rooms)));
  crow.push(['TOTAL', `${circuits.length} circuits`, `demand ${(dm.demandW / 1000).toFixed(1)} kW`, '', `${dm.connectedW}`, '', '']);
  y = table(c, 1420, y + 34, [{ h: 'CKT', w: 40 }, { h: 'TYPE', w: 78 }, { h: 'ROOMS', w: 170 }, { h: 'PTS', w: 34 }, { h: 'LOAD W', w: 56 }, { h: 'MCB', w: 44 }, { h: 'mm²', w: 40 }], crow, `CIRCUIT SCHEDULE — ${k.level === 0 ? 'DB' : 'SDB'}`, 19);
  legend(c, 1420, y + 30, 'LEGEND & NOTES', [
    'L light  F fan  EF exhaust  S 6A socket  P 16A power  AC split AC',
    '▬ switch board 1200 FFL, tag = its circuits; curves = switch wiring',
    k.level === 0 ? `DB: ${whole0.mainA}A ${whole0.supply === 'single-phase' ? 'DP' : 'TPN'} main + RCCB 30 mA; house demand ${(whole0.demandW / 1000).toFixed(1)} kW, ${whole0.supply}` : `SDB: ${dm.mainA}A DP incomer + RCCB 30 mA, fed from the GF DB`,
    'FRLS Cu in concealed PVC conduit; earthing per IS 3043.',
  ]);
  viewTitle(k, `${floorName(k)} ELECTRICAL LAYOUT`, 80, 130);
}

/* 14. Plumbing & drainage layout. */
function plumbing(k: Context): void {
  const c = k.c; const plotShown = svcFrame(k, k.level === 0); if (plotShown) drawPlot(k); servicesBase(k);
  if (k.level === 0 && !plotShown) label(c, `Site services shown within 3 m of the building; full plot on ${sheetNumber('site_plan', 0)}.`, 100, 1190, 12, 'left', COLORS.dim);
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
    { const t = k.level === 0 ? 'SWR' : 'SVP ↓', w = textWidth(c, t, 11, true); soft(w, 13, ringCands(stack.x + 12 + w / 2, stack.y - 14, 18, 14, 2), (x, y) => label(c, t, x, y, 11, 'center', SVC.drain, true)); }
    if (k.level === 0) {
      const o = outSide ?? ((['front', 'rear', 'left', 'right'] as Side[]).map(sd => ({ sd, d: sd === 'front' ? stackModel.y - b0.y : sd === 'rear' ? b0.y + b0.h - stackModel.y : sd === 'left' ? stackModel.x - b0.x : b0.x + b0.w - stackModel.x })).sort((p, q) => p.d - q.d)[0].sd);
      const ic = outPt(stackModel, o, 700);
      const icp = at(k, ic.x, ic.y);
      ortho(c, stack, icp, SVC.drain, 2, [9, 4]);
      // stacks that share a chamber position are connected to ONE inspection chamber
      if (!exits.some(e => Math.hypot(e.x - ic.x, e.y - ic.y) < 900)) {
        drawRect(c, icp.x - 12, icp.y - 12, 24, 24, { fill: '#fff', stroke: SVC.drain, weight: 2 });
        label(c, 'IC', icp.x, icp.y + 1, 10, 'center', SVC.drain, true);
        exits.push(ic);
      }
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
    const spm = sumpPlacement(k.layout), sump = at(k, spm.cx * 1000, spm.cy * 1000);
    drawRect(c, sump.x - 40, sump.y - 14, 80, 28, { fill: '#e8f3f8', stroke: SVC.water, weight: 2 });
    label(c, 'UG SUMP', sump.x, sump.y + 1, 11, 'center', SVC.water, true);
    ortho(c, sump, down, SVC.water, 1.5, [3, 3]);
  }
  // Rainwater pipes at the four building corners.
  for (const [x, y, dx] of [[b.x - 200, b.y + 300, -1], [b.x + b.w + 200, b.y + 300, 1], [b.x - 200, b.y + b.h - 300, -1], [b.x + b.w + 200, b.y + b.h - 300, 1]]) {
    const p = at(k, x, y); circle(c, p.x, p.y, 7, '#fff', SVC.water, 1.5);
    soft(24, 12, ringCands(p.x + dx * 22, p.y - 12, 14, 14, 2), (lx, ly) => label(c, 'RWP', lx, ly, 10, 'center', SVC.water));
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
  label(c, k.title, MARGIN + 12, 65, 24, 'left', COLORS.text, true);
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
  const t = k.int ? `${k.title} — ${k.int.plan.roomName.toUpperCase()}` : k.level > 0 && PER_FLOOR.includes(k.type) ? `${k.title} — ${floorName(k)}` : k.title;
  label(c, t.length > 44 ? t.slice(0, 43) + '…' : t, x + 16, y + 78, 17, 'left', COLORS.text, true);
  label(c, `PLOT ${round(k.g.plotW)} × ${round(k.g.plotD)} mm  •  ${k.req.city}, ${k.req.state}`, x + 16, y + 106, 13);
  label(c, `ROAD FACING ${k.req.facing}  •  LOCKED PLAN REV ${k.rev}`, x + 16, y + 128, 13);
  label(c, `DATE ${new Date().toLocaleDateString('en-GB')}`, x + 16, y + 148, 12, 'left', COLORS.dim);
  const cell = (cx: number, cy: number, h: string, v: string, big = false) => { label(c, h, x + cx + 8, y + cy + 9, 9, 'left', COLORS.dim, true); label(c, v, x + cx + 8, y + cy + 24, big ? 16 : 13, 'left', COLORS.text, true); };
  const idx = sheetIndex(k.g.floors, isOfficeLayout(k.layout)), pos = idx.findIndex(e => e.no === k.sheetNo);
  cell(560, 58, 'DRG NO', k.sheetNo, true); cell(730, 58, 'REV', `P${k.rev}`, true);
  cell(560, 92, 'SCALE (A3)', scaleText(k)); cell(730, 92, 'SHEET', pos >= 0 ? `${pos + 1} of ${idx.length}` : '—');
  cell(560, 126, 'DRAWN', 'neevv engine'); cell(730, 126, 'CHECKED', 'pending');
  label(c, 'PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION', x + 14, y + 180, 11, 'left', COLORS.dim);
  label(c, 'DO NOT SCALE — FOLLOW WRITTEN DIMENSIONS • GENERATED FROM THE LOCKED PLAN • REVIEW BY ARCHITECT / STRUCTURAL ENGINEER PENDING',
    MARGIN + 12, SHEET_H - 43, 12, 'left', COLORS.dim);
}

/* ══════════════════════════════════════════════════════════════════════════════
 * INTERIOR ENGINE — furniture placement from the locked plan.
 * One placement per room feeds the interior sheets, the interior BOQ cross-check and the 3D room view.
 * Model coordinates are building millimetres (same frame as every architectural sheet).
 * ══════════════════════════════════════════════════════════════════════════════ */
export interface PlacedFurniture {
  name: string; category: string; x: number; y: number; w: number; d: number; h: number;
  /** wall the item backs onto ('free' = free-standing); for wall items w runs along that wall */
  side: Side | 'free'; kind: 'furniture' | 'counter' | 'upper' | 'fixture' | 'seat';
  /** quantity represented by this symbol (e.g. a workstation cluster) */
  qty?: number; cost?: number; material?: string; color?: string;
  /** id of the customer's FurnitureItem this symbol draws */
  srcId?: string;
}
export interface InteriorPlan {
  roomId: string; roomName: string; roomType: string; floor: number;
  room: Bounds; clear: Bounds; option: number; label: string; keySide?: Side;
  items: PlacedFurniture[]; omitted: string[]; doorZones: Bounds[];
  /** doors / windows / ventilators on this room's walls: side, extent along it (mm, plan coords), sill and height */
  openings: { side: Side; a: number; b: number; type: string; sill: number; height: number }[];
}
const ovl = (a: Bounds, b: Bounds, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const inside = (a: Bounds, b: Bounds) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
function interiorContext(layout: Layout, req: ProjectRequirements, level: number): Context {
  const g = makeGeometry(layout, req, {});
  return { c: null as unknown as CanvasRenderingContext2D, g, layout, req, data: {}, boq: null, level: (level > 0 ? 1 : 0) as Level,
    frame: { x: 0, y: 0, s: 1, width: 0, height: 0 }, scale: 1, title: '', views: [], type: 'working_plan', sheetNo: '', rev: 1 };
}
function findModelRoom(g: Geometry, roomId: string): { r: ModelRoom; floor: number } | null {
  for (let f = 0; f < g.rooms.length; f++) { const r = (g.rooms[f] ?? []).find(m => m.source.id === roomId); if (r) return { r, floor: f }; }
  return null;
}
/** Finished (clear) size of each room in metres, inside the walls: the area that is tiled, painted and ceilinged. */
export function roomClearM(layout: Layout, req: ProjectRequirements): Record<string, { width: number; depth: number }> {
  const out: Record<string, { width: number; depth: number }> = {};
  try {
    const g = makeGeometry(layout, req, {});
    for (let f = 0; f < g.rooms.length; f++) {
      const k = interiorContext(layout, req, f);
      for (const r of k.g.rooms[f] ?? []) { const cl = clearRect(k, r); if (cl.w > 0 && cl.h > 0) out[r.source.id] = { width: cl.w / 1000, depth: cl.h / 1000 }; }
    }
  } catch { /* fall back to room sizes */ }
  return out;
}
/** Openings on any wall of room r (including doors owned by the neighbour). */
function roomWallOpenings(k: Context, r: ModelRoom): { o: OpeningPlacement; side: Side }[] {
  const out: { o: OpeningPlacement; side: Side }[] = [];
  for (const o of k.g.openings.filter(v => v.floor === k.level)) {
    if (o.axis === 'horizontal' && o.b > r.x + 5 && o.a < r.x + r.w - 5) {
      if (Math.abs(o.fixed - r.y) < 160) out.push({ o, side: 'front' }); else if (Math.abs(o.fixed - (r.y + r.d)) < 160) out.push({ o, side: 'rear' });
    } else if (o.axis === 'vertical' && o.b > r.y + 5 && o.a < r.y + r.d - 5) {
      if (Math.abs(o.fixed - r.x) < 160) out.push({ o, side: 'left' }); else if (Math.abs(o.fixed - (r.x + r.w)) < 160) out.push({ o, side: 'right' });
    }
  }
  return out;
}
const countOf = (name: string) => { const m = /[×x]\s*(\d+)\s*\)?\s*$/i.exec(name) ?? /\(set of (\d+)\)/i.exec(name) ?? /(\d+)-seat/i.exec(name); return m ? Math.max(1, Number(m[1])) : 1; };
/** Plan one arrangement of the room's selected furniture. option 0,1,2… rotates the wall the key piece backs onto. */
export function planInteriorRoom(layout: Layout, req: ProjectRequirements, roomId: string, interior: RoomInterior | undefined, option = 0,
  /** fix the key piece (bed, else sofa) at this wall position — used by the option search */ force?: { side: Side; t: number }): InteriorPlan | null {
  const g0 = makeGeometry(layout, req, {}); const found = findModelRoom(g0, roomId); if (!found) return null;
  const k = interiorContext(layout, req, found.floor); const r = (k.g.rooms[found.floor] ?? []).find(m => m.source.id === roomId)!;
  const clear = clearRect(k, r), items: PlacedFurniture[] = [], omitted: string[] = [], occupied: Bounds[] = [];
  const ops = roomWallOpenings(k, r), ext = externalSides(k, r);
  const doorZones: Bounds[] = [], windows: { side: Side; a: number; b: number; sill: number }[] = [];
  for (const { o, side } of ops) {
    if (o.source.type === 'door') {
      const depth = o.room === r ? Math.min(1000, o.b - o.a + 100) : 750, a = o.a - 100, b = o.b + 100;
      doorZones.push(side === 'front' ? { x: a, y: clear.y, w: b - a, h: depth } : side === 'rear' ? { x: a, y: clear.y + clear.h - depth, w: b - a, h: depth }
        : side === 'left' ? { x: clear.x, y: a, w: depth, h: b - a } : { x: clear.x + clear.w - depth, y: a, w: depth, h: b - a });
    } else windows.push({ side, a: o.a, b: o.b, sill: finite(o.source.sillHeightMm, o.source.type === 'ventilator' ? 2100 : 900) });
  }
  const sideL = (s: Side) => (s === 'front' || s === 'rear' ? clear.w : clear.h);
  const along0 = (s: Side) => (s === 'front' || s === 'rear' ? clear.x : clear.y);
  const wallRect = (s: Side, t: number, w: number, d: number): Bounds => s === 'front' ? { x: t, y: clear.y, w, h: d } : s === 'rear' ? { x: t, y: clear.y + clear.h - d, w, h: d }
    : s === 'left' ? { x: clear.x, y: t, w: d, h: w } : { x: clear.x + clear.w - d, y: t, w: d, h: w };
  const fits = (b: Bounds, h: number, side?: Side, extra: Bounds[] = []) => inside(b, clear) && !occupied.some(o => ovl(o, b, -1)) && !doorZones.some(z => ovl(z, b, -1)) && !extra.some(z => ovl(z, b, -1))
    && !(side && h > 0 && windows.some(wn => wn.side === side && h > wn.sill - 50 && (side === 'front' || side === 'rear' ? b.x < wn.b && wn.a < b.x + b.w : b.y < wn.b && wn.a < b.y + b.h)));
  const put = (it: PlacedFurniture, clearance?: Bounds) => { items.push(it); occupied.push({ x: it.x, y: it.y, w: it.w, h: it.d }); if (clearance) occupied.push(clearance); };
  const asItem = (f: FurnitureItem | undefined, name: string, cat: string, b: Bounds, h: number, side: Side | 'free', kind: PlacedFurniture['kind'] = 'furniture', qty?: number): PlacedFurniture =>
    ({ name, category: cat, x: b.x, y: b.y, w: b.w, d: b.h, h, side, kind, qty, cost: f?.estimatedCost, material: f?.material, color: f?.color, srcId: f?.id });
  /** Wall slot: positions centred, corners, then every 100 mm along each preferred side. Returns the rect (w along wall). */
  const wallSlot = (w: number, d: number, h: number, sides: Side[], mode: 'center' | 'corner' = 'center', front = 0): { b: Bounds; side: Side } | null => {
    for (const s of sides) {
      const L = sideL(s), a0 = along0(s); if (w > L) continue;
      const cands = mode === 'center' ? [a0 + (L - w) / 2, a0, a0 + L - w] : [a0, a0 + L - w, a0 + (L - w) / 2];
      for (let t = a0; t <= a0 + L - w; t += 100) cands.push(t);
      for (const t of cands) {
        const b = wallRect(s, t, w, d);
        const fr = front > 0 ? wallRect(s, t, w, d + front) : undefined;
        if (fits(b, h, s) && (!fr || !doorZones.some(z => ovl(z, fr, -1)))) return { b, side: s };
      }
    }
    return null;
  };
  const inward = (s: Side, b: Bounds, dist: number, w: number, d: number): Bounds => { // rect in front of b, centred
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return s === 'front' ? { x: cx - w / 2, y: b.y + b.h + dist, w, h: d } : s === 'rear' ? { x: cx - w / 2, y: b.y - dist - d, w, h: d }
      : s === 'left' ? { x: b.x + b.w + dist, y: cy - d / 2, w: d, h: w } : { x: b.x - dist - d, y: cy - d / 2, w: d, h: w };
  };
  const all: Side[] = ['rear', 'left', 'right', 'front'];
  const doorSides = new Set(ops.filter(v => v.o.source.type === 'door').map(v => v.side));
  const winSides = new Set(windows.filter(wn => wn.sill < 1500).map(wn => wn.side));
  const rankSides = (pref: (s: Side) => number) => [...all].sort((p, q) => pref(q) - pref(p));
  const keyRank = rankSides(s => sideL(s) / 1000 + (doorSides.has(s) ? -3 : 0) + (winSides.has(s) ? -1.5 : 0));
  const keyOrder = (n: number) => { const ok = keyRank.slice(0, Math.max(1, keyRank.length)); return [...ok.slice(n % ok.length), ...ok.slice(0, n % ok.length)]; };
  const furn = (interior?.furniture ?? []).filter(f => f.defaultSelected === true); // billed items only (same rule as the interior BOQ)
  const t = r.source.type as string, used = new Set<FurnitureItem>();
  const take = (pred: (f: FurnitureItem) => boolean) => { const f = furn.find(x => !used.has(x) && pred(x)); if (f) used.add(f); return f; };
  let keySide: Side | undefined;

  if (t === 'toilet') {
    // fixtures exactly where the plumbing layout puts them
    // set-out from the finished wall faces (room bounds include external wall thickness)
    const w = wetLayout(k, r), rc = { ...r, x: clear.x, y: clear.y, w: clear.w, d: clear.h } as ModelRoom, L = sideLen(rc, w.service), tAt = (mm: number) => (w.tEnd === 0 ? mm / L : 1 - mm / L);
    const at0 = (mm: number, inset: number) => onSide(rc, w.service, tAt(mm), inset);
    const fixAt = (p: Point, wAlong: number, dOut: number, name: string, side: Side) => {
      const hz = side === 'front' || side === 'rear';
      const sgn = side === 'front' || side === 'left' ? 1 : -1, wallC = side === 'front' ? clear.y : side === 'rear' ? clear.y + clear.h : side === 'left' ? clear.x : clear.x + clear.w;
      const b = hz ? { x: p.x - wAlong / 2, y: sgn > 0 ? wallC : wallC - dOut, w: wAlong, h: dOut } : { x: sgn > 0 ? wallC : wallC - dOut, y: p.y - wAlong / 2, w: dOut, h: wAlong };
      items.push(asItem(take(f => new RegExp(name.split(' ')[0], 'i').test(f.name)), name, 'bathroom_fixture', b, 800, side, 'fixture')); occupied.push(b);
    };
    const nWC = Number(/\((\d+) WC/.exec(r.source.name)?.[1] ?? 0);
    if (nWC > 0) { // office toilet block: the same cubicles and wash counter as A-601
      const cub = Math.min(1200, (L - 230) / nWC);
      for (let i = 0; i < nWC; i++) fixAt(at0(115 + i * cub + cub / 2, 0), 400, 700, `WC ${i + 1}`, w.service);
      const opp = opposite[w.service], oppL = sideLen(rc, opp), nb = Math.max(1, Math.min(Math.ceil(nWC / 2) + 1, Math.floor((oppL - 600) / 700)));
      fixAt(onSide(rc, opp, 0.5, 0), nb * 700, 550, `Wash counter (${nb} basins)`, opp);
    } else if (!/washroom/i.test(r.source.name)) { // homes: shower at the far end; office washrooms have none
      const sh = at0(450, 450); const shB = { x: sh.x - 450, y: sh.y - 450, w: 900, h: 900 };
      items.push(asItem(take(f => /shower/i.test(f.name)), 'Shower 900×900', 'bathroom_fixture', shB, 2000, w.service, 'fixture')); occupied.push(shB);
    }
    if (!nWC) {
    fixAt(at0(1250, 0), 400, 700, 'WC', w.service);
    const L2 = L >= 2500; const vanity = take(f => /vanity/i.test(f.name));
    fixAt(L2 ? at0(2150, 0) : onSide(rc, opposite[w.service], 0.5, 0), vanity ? 900 : 600, vanity ? 450 : 450, vanity ? 'Vanity unit' : 'Wash basin', L2 ? w.service : opposite[w.service]);
    }
  } else if (t === 'kitchen') {
    const kc = kitchenCounter(k, r);
    for (const [s, maxLen] of [[kc.long, 99999], [kc.short, 2400]] as [Side, number][]) {
      const L = Math.min(sideL(s), maxLen), a0 = s === kc.short ? along0(s) : along0(s);
      let run = { b: wallRect(s, a0, L, 600) };
      // shorten the run off any door zone, trimming whichever end clears it
      for (let cut = 100; cut < L - 900 && !fits(run.b, 900, undefined); cut += 100) {
        const atEnd = { b: wallRect(s, a0, L - cut, 600) }, atStart = { b: wallRect(s, a0 + cut, L - cut, 600) };
        run = fits(atStart.b, 900, undefined) ? atStart : atEnd;
      }
      if (!fits(run.b, 900, undefined)) continue;
      put(asItem(take(f => /lower cabinet/i.test(f.name)), s === kc.long ? 'Counter + base units (L)' : 'Counter + base units (S)', 'kitchen_cabinet', run.b, 900, s, 'counter'));
      // upper units over the run, interrupted by windows on that wall (150 clear each side)
      const upF = take(f => /upper cabinet/i.test(f.name)), hzR = s === 'front' || s === 'rear';
      let segs: [number, number][] = [[hzR ? run.b.x : run.b.y, hzR ? run.b.x + run.b.w : run.b.y + run.b.h]];
      for (const { o } of roomWallOpenings(k, r).filter(v => v.side === s && v.o.source.type !== 'door'))
        segs = segs.flatMap(([a1, b1]): [number, number][] => { const w0 = Math.min(o.a, o.b) - 150, w1 = Math.max(o.a, o.b) + 150; return w1 <= a1 || w0 >= b1 ? [[a1, b1]] : [[a1, w0], [w1, b1]]; }).filter(([a1, b1]) => b1 - a1 >= 450);
      segs.forEach(([a1, b1], si) => items.push(asItem(si === 0 ? upF : undefined, 'Upper units over', 'kitchen_cabinet', wallRect(s, a1, b1 - a1, 350), 700, s, 'upper')));
    }
    const lr0 = items.filter(i => i.kind === 'counter').sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d))[0];
    const lr = lr0 && Math.max(lr0.w, lr0.d) >= 1500 ? lr0 : undefined; if (lr) kc.long = lr.side as Side;
    if (lr) {
      const hz = kc.long === 'front' || kc.long === 'rear', sinkC = onSide(r, kc.long, 0.5, 300);
      const sink = hz ? { x: clamp(sinkC.x - 400, lr.x, lr.x + lr.w - 800), y: lr.y + 75, w: 800, h: 450 } : { x: lr.x + 75, y: clamp(sinkC.y - 400, lr.y, lr.y + lr.d - 800), w: 450, h: 800 };
      items.push(asItem(take(f => /sink/i.test(f.name)), 'Sink', 'kitchen_cabinet', sink, 900, kc.long, 'fixture'));
      const hobT = hz ? (sink.x - lr.x > lr.x + lr.w - sink.x - sink.w ? lr.x + 150 : lr.x + lr.w - 750) : (sink.y - lr.y > lr.y + lr.d - sink.y - sink.h ? lr.y + 150 : lr.y + lr.d - 750);
      const hob = hz ? { x: hobT, y: lr.y + 50, w: 600, h: 500 } : { x: lr.x + 50, y: hobT, w: 500, h: 600 };
      items.push(asItem(take(f => /\bhob\b/i.test(f.name)), 'Hob + chimney over', 'kitchen_cabinet', hob, 900, kc.long, 'fixture'));
    }
    const tall = take(f => /tall unit/i.test(f.name));
    if (tall) { const sl = wallSlot(600, 600, 2100, [opposite[kc.short], kc.long, kc.short], 'corner', 600); if (sl) put(asItem(tall, 'Tall pantry unit', 'kitchen_cabinet', sl.b, 2100, sl.side)); else omitted.push('Tall pantry unit'); }
    furn.filter(f => /island/i.test(f.name) && !used.has(f)).forEach(f => { used.add(f); const b = { x: clear.x + clear.w / 2 - f.widthMM / 2, y: clear.y + clear.h / 2 - f.depthMM / 2, w: f.widthMM, h: f.depthMM }; if (fits(b, 900, undefined, [])) put(asItem(f, 'Island', 'kitchen_cabinet', b, 900, 'free')); else omitted.push(f.name); });
    furn.filter(f => /countertop|backsplash|led strip|cutlery|bottle|carousel|chimney/i.test(f.name)).forEach(f => used.add(f)); // part of the counter run
  } else if (t.startsWith('workstation') || t === 'open_office') {
    const desk = take(f => /desk cluster|workstation/i.test(f.name)); const n = desk ? countOf(desk.name) : Math.max(1, Math.floor(clear.w * clear.h / 1e6 / 4.5 / 4));
    const W = desk?.widthMM ?? 2400, D = desk?.depthMM ?? 1200, aisle = 1200, edge = 900; let placed = 0;
    for (let y = clear.y + edge; y + D + 450 <= clear.y + clear.h - 600 && placed < n; y += D + aisle + 900)
      for (let x = clear.x + edge; x + W <= clear.x + clear.w - edge && placed < n; x += W + 900) {
        const b = { x, y: y + 450, w: W, h: D }; if (!fits(b, 750)) continue;
        put(asItem(desk, `Workstation cluster ${placed + 1}`, 'study_table', b, 750, 'free', 'furniture', 4), { x: b.x, y: b.y - 450, w: b.w, h: b.h + 900 }); placed++;
      }
    if (placed < n) omitted.push(`${n - placed} of ${n} workstation clusters (room too small)`);
    furn.filter(f => /chair|pedestal|screen/i.test(f.name)).forEach(f => used.add(f)); // drawn with the clusters
  } else if (/conference|board/.test(t)) {
    const tb = take(f => f.category === 'dining_table'); const seats = tb ? countOf(tb.name) : 6;
    const long = clear.w >= clear.h, TW = Math.min((long ? clear.w : clear.h) - 1600, tb?.widthMM ?? 2400), TD = Math.min(tb?.depthMM ?? 1200, (long ? clear.h : clear.w) - 1600);
    const b = long ? { x: clear.x + (clear.w - TW) / 2, y: clear.y + (clear.h - TD) / 2, w: TW, h: TD } : { x: clear.x + (clear.w - TD) / 2, y: clear.y + (clear.h - TW) / 2, w: TD, h: TW };
    if (TW > 900 && TD > 600) put(asItem(tb, `Conference table (${seats} seats)`, 'dining_table', b, 750, 'free', 'furniture', seats), { x: b.x - 600, y: b.y - 600, w: b.w + 1200, h: b.h + 1200 }); else omitted.push('Conference table');
    furn.filter(f => /chair/i.test(f.name)).forEach(f => used.add(f));
  }

  // key piece: bed / sofa / desk / dining table, on the wall the option selects
  const order = keyOrder(option);
  const bed = take(f => f.category === 'bed');
  if (bed) {
    let sl: { b: Bounds; side: Side } | null = null;
    if (force) { const b = wallRect(force.side, force.t, bed.widthMM, bed.depthMM); sl = fits(b, 450, force.side) ? { b, side: force.side } : null; }
    else for (const s of order) { sl = wallSlot(bed.widthMM, bed.depthMM, 450, [s], 'center'); if (sl) break; }
    if (sl) {
      keySide = sl.side; put(asItem(bed, bed.name, 'bed', sl.b, 450, sl.side), inward(sl.side, sl.b, 0, sl.b.w + 0, 600));
      const sideTables = furn.filter(f => f.category === 'side_table' && !used.has(f));
      for (const [i, st] of sideTables.slice(0, 2).entries()) {
        used.add(st); const hz = sl.side === 'front' || sl.side === 'rear';
        const tpos = hz ? (i === 0 ? sl.b.x - st.widthMM - 50 : sl.b.x + sl.b.w + 50) : (i === 0 ? sl.b.y - st.widthMM - 50 : sl.b.y + sl.b.h + 50);
        const b = wallRect(sl.side, tpos, st.widthMM, st.depthMM);
        if (fits(b, st.heightMM, sl.side)) put(asItem(st, st.name, 'side_table', b, st.heightMM, sl.side)); else omitted.push(st.name);
      }
    } else omitted.push(bed.name);
  }
  const sofa = take(f => f.category === 'sofa' && !/recliner/i.test(f.name));
  if (sofa) {
    let sl: { b: Bounds; side: Side } | null = null;
    if (force && !bed) { const b = wallRect(force.side, force.t, sofa.widthMM, Math.min(sofa.depthMM, 1000)); sl = fits(b, sofa.heightMM, force.side) ? { b, side: force.side } : null; }
    else for (const s of (bed ? rankSides(s2 => (s2 === keySide ? -9 : 0) + sideL(s2) / 1000) : order)) { sl = wallSlot(sofa.widthMM, Math.min(sofa.depthMM, 1000), sofa.heightMM, [s], /l-shape/i.test(sofa.name) ? 'corner' : 'center'); if (sl) break; }
    if (sl) {
      if (!keySide) keySide = sl.side;
      const lshape = /l-shape/i.test(sofa.name);
      put(asItem(sofa, sofa.name, 'sofa', sl.b, sofa.heightMM, sl.side), inward(sl.side, sl.b, 0, sl.b.w, 450));
      if (lshape) { const hz = sl.side === 'front' || sl.side === 'rear', leg = sofa.depthMM - Math.min(sofa.depthMM, 1000);
        const lb = hz ? { x: sl.b.x <= clear.x + 5 ? sl.b.x : sl.b.x + sl.b.w - 900, y: sl.side === 'front' ? sl.b.y + sl.b.h : sl.b.y - leg, w: 900, h: leg } : { x: sl.side === 'left' ? sl.b.x + sl.b.w : sl.b.x - leg, y: sl.b.y <= clear.y + 5 ? sl.b.y : sl.b.y + sl.b.h - 900, w: leg, h: 900 };
        if (leg > 100 && fits(lb, sofa.heightMM)) put({ ...asItem(undefined, 'L-return', 'sofa', lb, sofa.heightMM, sl.side) }); }
      const ct = take(f => /center table|coffee/i.test(f.name));
      if (ct) { const b = inward(sl.side, sl.b, 450, ct.widthMM, ct.depthMM); if (fits(b, 400)) put(asItem(ct, ct.name, 'console', b, ct.heightMM, 'free')); else omitted.push(ct.name); }
    } else omitted.push(sofa.name);
  }
  const dining = take(f => f.category === 'dining_table');
  if (dining) {
    const seats = countOf(furn.find(f => /dining chair/i.test(f.name))?.name ?? '') || 6;
    const rot = option % 2 === 1 && clear.h > clear.w * 0.9; const W = rot ? dining.depthMM : dining.widthMM, D = rot ? dining.widthMM : dining.depthMM;
    const b = { x: clear.x + (clear.w - W) / 2, y: clear.y + (clear.h - D) / 2, w: W, h: D };
    if (fits({ x: b.x - 550, y: b.y - 550, w: b.w + 1100, h: b.h + 1100 }, 750)) put(asItem(dining, dining.name, 'dining_table', b, 750, 'free', 'furniture', seats), { x: b.x - 550, y: b.y - 550, w: b.w + 1100, h: b.h + 1100 });
    else if (fits(b, 750)) put(asItem(dining, dining.name, 'dining_table', b, 750, 'free', 'furniture', seats)); else omitted.push(dining.name);
    furn.filter(f => /dining chair/i.test(f.name)).forEach(f => used.add(f));
  }
  const tv = take(f => f.category === 'tv_unit');
  if (tv) { const pref = keySide ? [opposite[keySide], ...all.filter(s => s !== opposite[keySide!] && s !== keySide)] : order; const sl = wallSlot(tv.widthMM, tv.depthMM, tv.heightMM, pref, 'center'); if (sl) put(asItem(tv, tv.name, 'tv_unit', sl.b, tv.heightMM, sl.side)); else omitted.push(tv.name); }
  // desks: by a window where possible, chair in front
  for (const dk of furn.filter(f => f.category === 'study_table' && !used.has(f))) {
    used.add(dk); const pref = rankSides(s => (winSides.has(s) ? 3 : 0) + (s === keySide ? -5 : 0) + sideL(s) / 2000);
    const sl = wallSlot(dk.widthMM, dk.depthMM, dk.heightMM, /executive/i.test(dk.name) ? [] : pref, 'center', 700)
      ?? (/executive/i.test(dk.name) ? (() => { const b = { x: clear.x + (clear.w - dk.widthMM) / 2, y: clear.y + clear.h * 0.35, w: dk.widthMM, h: dk.depthMM }; return fits(b, 750) ? { b, side: 'rear' as Side } : null; })() : null);
    if (sl) put(asItem(dk, dk.name, 'study_table', sl.b, dk.heightMM, /executive/i.test(dk.name) ? 'free' : sl.side), inward(sl.side, sl.b, 0, sl.b.w, 700)); else omitted.push(dk.name);
  }
  // storage and everything else against free wall lengths; tall items avoid windows, wardrobes need 600 in front
  const rest = furn.filter(f => !used.has(f) && f.category !== 'chair' && f.category !== 'bathroom_fixture' && f.category !== 'side_table');
  rest.sort((p, q) => q.widthMM * q.heightMM - p.widthMM * p.heightMM);
  for (const f of rest) {
    used.add(f);
    if (/mirror|towel|bell|decorative|cutlery|led|backsplash|countertop|bottle|carousel|hood|chimney/i.test(f.name)) continue; // wall-mounted / accessories: no floor area
    const front = f.category === 'wardrobe' || f.category === 'crockery' ? 600 : 450;
    const pref = rankSides(s => (s === keySide ? -4 : 0) + (doorSides.has(s) ? -1 : 0) + sideL(s) / 1000);
    const sl = wallSlot(f.widthMM, f.depthMM, f.heightMM, pref, f.heightMM > 1500 ? 'corner' : 'center', front);
    if (sl) put(asItem(f, f.name, f.category, sl.b, f.heightMM, sl.side), inward(sl.side, sl.b, 0, sl.b.w, front)); else omitted.push(f.name);
  }
  // seats drawn with their tables/desks
  for (const ch of furn.filter(f => f.category === 'chair' && !used.has(f))) used.add(ch);
  const label0 = keySide ? `${t === 'hall' || t === 'living' ? 'Sofa' : bed ? 'Bed' : 'Main piece'} on the ${keySide} wall` : 'Standard arrangement';
  const openings = ops.map(({ o, side }) => ({ side, a: Math.min(o.a, o.b), b: Math.max(o.a, o.b), type: o.source.type,
    sill: o.source.type === 'door' ? 0 : finite(o.source.sillHeightMm, o.source.type === 'ventilator' ? 1800 : 900), height: positive(o.source.heightMm, o.source.type === 'door' ? 2100 : o.source.type === 'ventilator' ? 450 : 1200) }));
  return { roomId, roomName: r.source.name, roomType: t, floor: found.floor, room: { x: r.x, y: r.y, w: r.w, h: r.d }, clear, option, label: label0, keySide, items, omitted, doorZones, openings };
}
/** Up to three genuinely different arrangements: the key piece (bed, else sofa) on a different wall each time, at the
 * position along that wall that leaves room for the most furniture (fewest items that don't fit, then most central). */
export function interiorOptions(layout: Layout, req: ProjectRequirements, roomId: string, interior: RoomInterior | undefined): InteriorPlan[] {
  const p0 = planInteriorRoom(layout, req, roomId, interior, 0); if (!p0) return [];
  const key = (interior?.furniture ?? []).find(f => f.category === 'bed') ?? (interior?.furniture ?? []).find(f => f.category === 'sofa' && !/recliner/i.test(f.name));
  const candidates: InteriorPlan[] = [];
  if (key) {
    const c = p0.clear, kw = key.widthMM;
    for (const side of ['rear', 'left', 'right', 'front'] as Side[]) {
      const L = side === 'front' || side === 'rear' ? c.w : c.h, a0 = side === 'front' || side === 'rear' ? c.x : c.y;
      if (kw > L) continue;
      let best: InteriorPlan | null = null; let bestScore = Infinity;
      const ts: number[] = [a0, a0 + L - kw]; for (let t = a0; t <= a0 + L - kw + 1; t += 150) ts.push(t);
      for (const t of ts) {
        const p = planInteriorRoom(layout, req, roomId, interior, 0, { side, t }); if (!p || p.keySide !== side) continue;
        // losing a wardrobe matters more than losing a side table: weight what doesn't fit by its cost
        const lost = p.omitted.reduce((sum, n) => sum + ((interior?.furniture ?? []).find(f => f.name === n)?.estimatedCost ?? 20000), 0);
        const score = lost * 10 + Math.abs(t + kw / 2 - (a0 + L / 2));
        if (score < bestScore) { bestScore = score; best = p; }
      }
      if (best) candidates.push(best);
    }
  }
  if (!candidates.length) candidates.push(p0);
  const lostOf = (p: InteriorPlan) => p.omitted.reduce((sum, n) => sum + ((interior?.furniture ?? []).find(f => f.name === n)?.estimatedCost ?? 20000), 0);
  candidates.sort((p, q) => lostOf(p) - lostOf(q) || q.items.length - p.items.length);
  const out: InteriorPlan[] = [], seen = new Set<string>();
  for (const p of candidates) {
    const sig = p.items.map(i => `${i.name}:${Math.round(i.x / 50)},${Math.round(i.y / 50)}`).sort().join('|');
    if (seen.has(sig) || out.length >= 3) continue; seen.add(sig);
    out.push({ ...p, option: out.length, label: `Option ${out.length + 1} — ${p.label}${p.omitted.length ? ` (${p.omitted.length} item${p.omitted.length > 1 ? 's' : ''} don't fit)` : ''}` });
  }
  return out;
}

/* ── Interior sheets (one set per room) ── */
const INT_TAG = '#5b6b8c';
/** Room plan frame: the room plus 900 mm around it, walls and openings of that floor clipped to the frame. */
function roomFrame(k: Context, target: Bounds = { x: 60, y: 150, w: 1200, h: 1075 }, walls: 'solid' | 'light' = 'solid'): Bounds {
  // interior plans at 1:20 / 1:25 where they fit with their dimension chains (≈110 px), else 1:50 / 1:100
  const p = k.int!.plan, fitsAt = (den: number, m: number) => { const sc = PX_PER_PAPER_MM / den; return (p.room.w + 2 * m) * sc + 130 <= target.w && (p.room.h + 2 * m) * sc + 140 <= target.h; };
  let den = 200, m = 250;
  search: for (const d of [20, 25, 50, 100, 200]) for (const mm of [250, 120]) if (fitsAt(d, mm)) { den = d; m = mm; break search; }
  const sc = PX_PER_PAPER_MM / den, geo = { x: p.room.x - m, y: p.room.y - m, w: p.room.w + 2 * m, h: p.room.h + 2 * m };
  k.frame = { x: target.x + (target.w - geo.w * sc) / 2, y: target.y + Math.min(30, (target.h - geo.h * sc) / 2), s: sc, width: geo.x, height: geo.y }; k.scale = sc; k.views.push(den);
  const G = box(k, geo), c = k.c;
  c.save(); c.beginPath(); c.rect(G.x, G.y, G.w, G.h); c.clip();
  drawPlanWalls(k, walls);
  for (const o of k.g.openings.filter(v => v.floor === k.level)) planOpening(c, k, o);
  c.restore();
  return G;
}
/** The room's finish spec: the customer's selection, or its room type's defaults when there is none. */
function intSpec(k: Context): RoomInterior {
  const it = k.int!.interior;
  if (it) return it;
  const t = k.int!.plan.roomType;
  return { roomType: t === 'toilet' ? 'bathroom' : t === 'kitchen' ? 'kitchen' : 'bedroom', ceilingHeight: 2700, flooring: { name: '', finish: '' }, wallFinish: { name: '' } } as unknown as RoomInterior;
}
function intRoom(k: Context): ModelRoom { const p = k.int!.plan; return (k.g.rooms[k.level] ?? []).find(r => r.source.id === p.roomId)!; }
const shortName = (n: string) => n.replace(/\s*[—–-]\s.*$/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
/** Furniture / fixture symbol. light = grey context on services sheets. */
function drawItem(k: Context, it: PlacedFurniture, light = false): void {
  const c = k.c, B = box(k, { x: it.x, y: it.y, w: it.w, h: it.d }), s = k.scale;
  const stroke = light ? '#a9adb3' : COLORS.wall, pen = light ? PEN.hair : PEN.medium;
  const hz = it.side === 'front' || it.side === 'rear';
  // edge strip along the wall the item backs onto
  const strip = (mm: number): Bounds => it.side === 'front' ? { x: B.x, y: B.y, w: B.w, h: mm * s } : it.side === 'rear' ? { x: B.x, y: B.y + B.h - mm * s, w: B.w, h: mm * s }
    : it.side === 'left' ? { x: B.x, y: B.y, w: mm * s, h: B.h } : it.side === 'right' ? { x: B.x + B.w - mm * s, y: B.y, w: mm * s, h: B.h } : { x: B.x, y: B.y, w: B.w, h: mm * s };
  const chair = (cx: number, cy: number) => { c.save(); c.beginPath(); c.arc(cx, cy, Math.max(3, 220 * s), 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = stroke; c.lineWidth = PEN.hair; c.stroke(); c.restore(); };
  if (it.kind === 'upper') { c.save(); c.setLineDash([6, 4]); drawRect(c, B.x, B.y, B.w, B.h, { stroke, weight: PEN.hair }); c.restore(); return; }
  if (it.kind === 'counter') { drawRect(c, B.x, B.y, B.w, B.h, { fill: light ? '#f4f4f4' : '#efe9df', stroke, weight: pen }); return; }
  if (it.kind === 'fixture') {
    drawRect(c, B.x, B.y, B.w, B.h, { fill: '#fff', stroke, weight: pen });
    if (/shower/i.test(it.name)) { c.save(); c.setLineDash([5, 4]); drawLine(c, B.x, B.y, B.x + B.w, B.y + B.h, PEN.hair, stroke); drawLine(c, B.x + B.w, B.y, B.x, B.y + B.h, PEN.hair, stroke); c.restore(); }
    else if (/^wc/i.test(it.name)) { const tk = strip(150); drawRect(c, tk.x, tk.y, tk.w, tk.h, { stroke, weight: PEN.hair }); c.save(); c.beginPath(); c.ellipse(B.x + B.w / 2, B.y + B.h / 2, B.w / 2.6, B.h / 2.6, 0, 0, Math.PI * 2); c.strokeStyle = stroke; c.lineWidth = PEN.hair; c.stroke(); c.restore(); }
    else if (/basin|vanity|sink/i.test(it.name)) { c.save(); c.beginPath(); c.ellipse(B.x + B.w / 2, B.y + B.h / 2, B.w / 3, B.h / 3, 0, 0, Math.PI * 2); c.strokeStyle = stroke; c.lineWidth = PEN.hair; c.stroke(); c.restore(); }
    else if (/hob/i.test(it.name)) for (const [a, b] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) circle(c, B.x + B.w * a, B.y + B.h * b, Math.max(2, 80 * s), '#fff', stroke, PEN.hair);
    return;
  }
  drawRect(c, B.x, B.y, B.w, B.h, { fill: '#fff', stroke, weight: pen });
  switch (it.category) {
    case 'bed': { const pl = strip(320); const n = B.w > B.h ? 1 : 1; void n;
      if (hz) { drawRect(c, pl.x + 4, pl.y + 2, pl.w / 2 - 6, pl.h - 4, { stroke, weight: PEN.hair }); drawRect(c, pl.x + pl.w / 2 + 2, pl.y + 2, pl.w / 2 - 6, pl.h - 4, { stroke, weight: PEN.hair }); const fy = it.side === 'front' ? B.y + B.h * 0.62 : B.y + B.h * 0.38; drawLine(c, B.x, fy, B.x + B.w, fy, PEN.hair, stroke); }
      else { drawRect(c, pl.x + 2, pl.y + 4, pl.w - 4, pl.h / 2 - 6, { stroke, weight: PEN.hair }); drawRect(c, pl.x + 2, pl.y + pl.h / 2 + 2, pl.w - 4, pl.h / 2 - 6, { stroke, weight: PEN.hair }); const fx = it.side === 'left' ? B.x + B.w * 0.62 : B.x + B.w * 0.38; drawLine(c, fx, B.y, fx, B.y + B.h, PEN.hair, stroke); }
      break; }
    case 'sofa': { const bk = strip(200); drawRect(c, bk.x, bk.y, bk.w, bk.h, { fill: light ? '#f4f4f4' : '#eceff3', stroke, weight: PEN.hair }); break; }
    case 'dining_table': {
      const n = Math.max(2, it.qty ?? 4), long = B.w >= B.h, per = Math.ceil(n / 2), off = 300 * s;
      for (let i = 0; i < n; i++) { const side = i < per ? 0 : 1, j = side ? i - per : i, cnt = side ? n - per : per;
        if (long) chair(B.x + B.w * (j + 0.5) / cnt, side ? B.y + B.h + off : B.y - off); else chair(side ? B.x + B.w + off : B.x - off, B.y + B.h * (j + 0.5) / cnt); }
      break; }
    case 'study_table': {
      if ((it.qty ?? 1) >= 4) { drawLine(c, B.x + B.w / 2, B.y, B.x + B.w / 2, B.y + B.h, PEN.hair, stroke); drawLine(c, B.x, B.y + B.h / 2, B.x + B.w, B.y + B.h / 2, PEN.hair, stroke);
        for (const fx of [0.25, 0.75]) { chair(B.x + B.w * fx, B.y - 300 * s); chair(B.x + B.w * fx, B.y + B.h + 300 * s); } }
      else { const f = it.side === 'free' ? { x: B.x + B.w / 2, y: B.y - 350 * s } : it.side === 'front' ? { x: B.x + B.w / 2, y: B.y + B.h + 350 * s } : it.side === 'rear' ? { x: B.x + B.w / 2, y: B.y - 350 * s } : it.side === 'left' ? { x: B.x + B.w + 350 * s, y: B.y + B.h / 2 } : { x: B.x - 350 * s, y: B.y + B.h / 2 }; chair(f.x, f.y); }
      break; }
    case 'wardrobe': case 'crockery': case 'bookshelf': case 'pooja_unit': case 'shoe_rack': case 'bar_unit': case 'kitchen_cabinet': {
      if (it.h > 1200) drawLine(c, B.x, B.y, B.x + B.w, B.y + B.h, PEN.hair, stroke);
      const len = hz ? it.w : it.d, n = Math.max(1, Math.round(len / 600));
      for (let i = 1; i < n; i++) { if (hz) { const x = B.x + B.w * i / n; const fr = it.side === 'front' ? B.y + B.h : B.y; drawLine(c, x, fr, x, fr + (it.side === 'front' ? -6 : 6), PEN.medium, stroke); } else { const y = B.y + B.h * i / n; const fr = it.side === 'left' ? B.x + B.w : B.x; drawLine(c, fr, y, fr + (it.side === 'left' ? -6 : 6), y, PEN.medium, stroke); } }
      break; }
    case 'tv_unit': { const tv = strip(60); drawRect(c, tv.x, tv.y, tv.w, tv.h, { fill: stroke, stroke, weight: PEN.hair }); break; }
    default: break;
  }
}
function tagItem(k: Context, it: PlacedFurniture, n: number): void {
  const c = k.c, B = box(k, { x: it.x, y: it.y, w: it.w, h: it.d }), t = `${n}`;
  const cands = [{ x: B.x + B.w / 2, y: B.y + B.h / 2 }, { x: B.x + B.w / 2, y: B.y - 12 }, { x: B.x + B.w / 2, y: B.y + B.h + 12 }, { x: B.x - 12, y: B.y + B.h / 2 }, { x: B.x + B.w + 12, y: B.y + B.h / 2 }];
  soft(18, 18, cands, (x, y) => { circle(c, x, y, 9, '#fff', INT_TAG, 1.2); label(c, t, x, y + 0.5, 10, 'center', INT_TAG, true); });
}
/** Points shared by the RCP and the electrical sheet. */
function intPoints(k: Context): { lights: Point[]; fans: Point[]; ac: { b: Bounds; side: Side }[]; sb: Point | null; sockets: { p: Point; kind: 'S' | 'P' | 'TV' | 'D' }[] } {
  const p = k.int!.plan, it = k.int!.interior, ep = it?.electricalPoints ?? { switches: 1, sockets: 2, dataPoints: 0, lightPoints: 2, fanPoints: 1, acPoints: 0 };
  const cl = p.clear, r = intRoom(k), periph = it?.ceilingType === 'false_ceiling_peripheral';
  const nL = Math.max(0, ep.lightPoints), lights: Point[] = [];
  if (periph && nL > 0) { // evenly around the 600 band, 300 mm from the wall
    const inset = 300, per = 2 * (cl.w + cl.h - 4 * inset);
    for (let i = 0; i < nL; i++) { let d = per * (i + 0.5) / nL; const W = cl.w - 2 * inset, H = cl.h - 2 * inset;
      const pt = d < W ? { x: cl.x + inset + d, y: cl.y + inset } : (d -= W) < H ? { x: cl.x + cl.w - inset, y: cl.y + inset + d } : (d -= H) < W ? { x: cl.x + cl.w - inset - d, y: cl.y + cl.h - inset } : { x: cl.x + inset, y: cl.y + cl.h - inset - (d - W) };
      lights.push(pt); }
  } else { const cols = Math.max(1, Math.round(Math.sqrt(nL * cl.w / Math.max(1, cl.h)))), rows = Math.max(1, Math.ceil(nL / cols));
    for (let i = 0; i < nL; i++) lights.push({ x: cl.x + cl.w * ((i % cols) + 0.5) / cols, y: cl.y + cl.h * (Math.floor(i / cols) + 0.5) / rows }); }
  const fans: Point[] = []; for (let i = 0; i < ep.fanPoints; i++) fans.push({ x: cl.x + cl.w * (i + 1) / (ep.fanPoints + 1), y: cl.y + cl.h / 2 });
  const ext = externalSides(k, r), ac: { b: Bounds; side: Side }[] = [];
  for (let i = 0; i < ep.acPoints; i++) { const side = ext.find(sd => sd !== p.keySide) ?? ext[0] ?? 'rear', hz = side === 'front' || side === 'rear';
    const t0 = (hz ? cl.x + cl.w / 2 : cl.y + cl.h / 2) - 450 + i * 1000; ac.push({ side, b: side === 'front' ? { x: t0, y: cl.y, w: 900, h: 250 } : side === 'rear' ? { x: t0, y: cl.y + cl.h - 250, w: 900, h: 250 } : side === 'left' ? { x: cl.x, y: t0, w: 250, h: 900 } : { x: cl.x + cl.w - 250, y: t0, w: 250, h: 900 } }); }
  // switch board on the latch side of the room's door, 150 mm in
  const door = roomWallOpenings(k, r).find(v => v.o.source.type === 'door');
  let sb: Point | null = null;
  if (door) { const o = door.o, along = Math.min(o.b + 150, (o.axis === 'horizontal' ? cl.x + cl.w : cl.y + cl.h) - 100);
    sb = door.side === 'front' ? { x: along, y: cl.y + 80 } : door.side === 'rear' ? { x: along, y: cl.y + cl.h - 80 } : door.side === 'left' ? { x: cl.x + 80, y: along } : { x: cl.x + cl.w - 80, y: along }; }
  // sockets where they are used: bedside, TV, desk, counter, then the rest along free wall
  const sockets0: { p: Point; kind: 'S' | 'P' | 'TV' | 'D' }[] = [];
  // a point within 350 mm of another is moved along its wall
  const sockets = { push: (v: { p: Point; kind: 'S' | 'P' | 'TV' | 'D' }) => {
    const onH = Math.abs(v.p.y - cl.y) < 100 || Math.abs(v.p.y - cl.y - cl.h) < 100;
    const taken = [...sockets0.map(o => ({ ...o.p, r: 350 })), ...ac.map(a => ({ x: a.b.x + a.b.w / 2, y: a.b.y + a.b.h / 2, r: 700 })), ...(sb ? [{ ...sb, r: 350 }] : [])];
    const clash = (q: Point) => taken.some(o => Math.hypot(o.x - q.x, o.y - q.y) < o.r);
    if (clash(v.p)) {
      // nearest free point on any wall (60 mm in from the finish), every 150 mm
      const cands: Point[] = [];
      for (let t = 100; t <= cl.w - 100; t += 150) cands.push({ x: cl.x + t, y: cl.y + 60 }, { x: cl.x + t, y: cl.y + cl.h - 60 });
      for (let t = 100; t <= cl.h - 100; t += 150) cands.push({ x: cl.x + 60, y: cl.y + t }, { x: cl.x + cl.w - 60, y: cl.y + t });
      const free = cands.filter(q => !clash(q) && !p.doorZones.some(z => q.x > z.x && q.x < z.x + z.w && q.y > z.y && q.y < z.y + z.h))
        .sort((a2, b2) => Math.hypot(a2.x - v.p.x, a2.y - v.p.y) - Math.hypot(b2.x - v.p.x, b2.y - v.p.y))[0];
      if (!free) return; // no wall space left: not drawn (the schedule still counts it)
      v = { ...v, p: free };
    }
    void onH;
    sockets0.push(v); } };
  const wallPt = (it2: PlacedFurniture, frac: number): Point => it2.side === 'front' ? { x: it2.x + it2.w * frac, y: cl.y + 60 } : it2.side === 'rear' ? { x: it2.x + it2.w * frac, y: cl.y + cl.h - 60 } : it2.side === 'left' ? { x: cl.x + 60, y: it2.y + it2.d * frac } : { x: cl.x + cl.w - 60, y: it2.y + it2.d * frac };
  let nS = ep.sockets, nD = ep.dataPoints;
  for (const st of p.items.filter(i => i.category === 'side_table')) if (nS > 0) { sockets.push({ p: wallPt(st, 0.5), kind: 'S' }); nS--; }
  const tv = p.items.find(i => i.category === 'tv_unit'); if (tv && nS > 0) { sockets.push({ p: wallPt(tv, 0.35), kind: 'TV' }); nS--; if (nD > 0) { sockets.push({ p: wallPt(tv, 0.65), kind: 'D' }); nD--; } }
  for (const dk of p.items.filter(i => i.category === 'study_table' && i.side !== 'free')) { if (nS > 0) { sockets.push({ p: wallPt(dk, 0.3), kind: 'S' }); nS--; } if (nD > 0) { sockets.push({ p: wallPt(dk, 0.7), kind: 'D' }); nD--; } }
  for (const cn of p.items.filter(i => i.kind === 'counter')) for (const f of [0.2, 0.8]) if (nS > 0) { sockets.push({ p: wallPt(cn, f), kind: 'P' }); nS--; }
  const sides: Side[] = ['rear', 'left', 'right', 'front']; let si = 0;
  while ((nS > 0 || nD > 0) && si < 12) { const sd = sides[si % 4], f = 0.25 + 0.5 * Math.floor(si / 4) / 2;
    const pt = sd === 'front' ? { x: cl.x + cl.w * f, y: cl.y + 60 } : sd === 'rear' ? { x: cl.x + cl.w * f, y: cl.y + cl.h - 60 } : sd === 'left' ? { x: cl.x + 60, y: cl.y + cl.h * f } : { x: cl.x + cl.w - 60, y: cl.y + cl.h * f };
    if (!p.doorZones.some(z => pt.x > z.x && pt.x < z.x + z.w && pt.y > z.y && pt.y < z.y + z.h)) { if (nS > 0) { sockets.push({ p: pt, kind: 'S' }); nS--; } else { sockets.push({ p: pt, kind: 'D' }); nD--; } }
    si++; }
  return { lights, fans, ac, sb, sockets: sockets0 };
}
function intNotes(k: Context): string[] {
  const p = k.int!.plan;
  return [`${p.label}.`, ...(p.omitted.length ? [`Not placed — does not fit: ${p.omitted.map(shortName).join(', ')}. Choose smaller sizes or remove.`] : []),
    'Placement from the locked plan; door swings and approaches kept clear.'];
}
/* I-101 furniture layout */
function intFurniture(k: Context): void {
  const c = k.c, p = k.int!.plan, it = k.int!.interior;
  roomFrame(k);
  const shown = p.items.filter(i => i.kind !== 'upper');
  for (const i of p.items.filter(i2 => i2.kind === 'upper')) drawItem(k, i);
  for (const i of shown) drawItem(k, i);
  const numbered = shown.filter(i => i.kind !== 'fixture' || /vanity|sink|hob/i.test(i.name));
  numbered.forEach((i, n) => tagItem(k, i, n + 1));
  const B = box(k, p.clear), wo = 300 * k.scale + 24;
  const key = shown.find(i => i.category === 'bed') ?? shown.find(i => i.category === 'sofa');
  const keyOn = key && key.side !== 'free' ? key.side : null;
  // set-out of the key piece on its wall (inner chain), overall clear size outside it
  if (key && keyOn) { const hz = keyOn === 'front' || keyOn === 'rear';
    if (hz) dimMm(k, [p.clear.x, key.x, key.x + key.w, p.clear.x + p.clear.w], 'x', keyOn === 'front' ? B.y : B.y + B.h, keyOn === 'front' ? -wo : wo, 'key piece set-out');
    else dimMm(k, [p.clear.y, key.y, key.y + key.d, p.clear.y + p.clear.h], 'y', keyOn === 'left' ? B.x : B.x + B.w, keyOn === 'left' ? -wo : wo, 'key piece set-out'); }
  dimMm(k, [p.clear.x, p.clear.x + p.clear.w], 'x', B.y + B.h, wo + (keyOn === 'rear' ? 40 : 0), 'room clear width');
  dimMm(k, [p.clear.y, p.clear.y + p.clear.h], 'y', B.x + B.w, wo + (keyOn === 'right' ? 40 : 0), 'room clear depth');
  const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
  const drawnIds = new Set(p.items.map(i => i.srcId).filter(Boolean));
  const rows = numbered.map((i, n) => [`${n + 1}`, shortName(i.name), `${round(i.side === 'left' || i.side === 'right' ? i.d : i.w)}×${round(i.side === 'left' || i.side === 'right' ? i.w : i.d)}×${round(i.h)}`, (i.material ?? '—').slice(0, 22), `${i.qty && i.category !== 'study_table' ? i.qty : 1}`, i.cost ? inr(i.cost) : 'in set']);
  // selected items drawn as part of a run (uppers, countertop, chimney) or not placed: still billed, so listed
  const omittedNames = new Set(p.omitted);
  for (const f of (it?.furniture ?? []).filter(x => !drawnIds.has(x.id) && x.defaultSelected === true))
    rows.push(['–', shortName(f.name), `${round(f.widthMM)}×${round(f.depthMM)}×${round(f.heightMM)}`, (f.material ?? '—').slice(0, 22), '1', inr(f.estimatedCost) + (omittedNames.has(f.name) ? ' (NOT PLACED)' : '')]);
  for (const i of p.items.filter(x => x.kind === 'upper' && x.cost)) rows.push(['–', shortName(i.name), `${round(Math.max(i.w, i.d))} run`, (i.material ?? '—').slice(0, 22), '1', inr(i.cost!)]);
  const total = (it?.furniture ?? []).filter(x => x.defaultSelected === true).reduce((sum, f) => sum + f.estimatedCost, 0);
  rows.push(['', 'TOTAL SELECTED (= BOQ woodwork)', '', '', '', inr(total)]);
  const y = table(c, 1290, 150, [{ h: '#', w: 30 }, { h: 'ITEM', w: 175 }, { h: 'W×D×H mm', w: 110 }, { h: 'MATERIAL', w: 130 }, { h: 'QTY', w: 36 }, { h: 'COST', w: 150 }], rows, 'FURNITURE SCHEDULE', 21);
  legend(c, 1290, y + 34, 'NOTES', [...intNotes(k), 'Clear 600 in front of wardrobes, 750 walkways.', `Ceiling ${it?.ceilingType?.replace(/_/g, ' ') ?? 'plain'}; see I-201.`]);
  viewTitle(k, `${p.roomName.toUpperCase()} — FURNITURE LAYOUT`, 80, 130);
}
/* I-201 reflected ceiling plan */
function intRcp(k: Context): void {
  const c = k.c, p = k.int!.plan, it = k.int!.interior, ct = it?.ceilingType ?? 'plain', s = k.scale;
  roomFrame(k, undefined, 'light');
  const B = box(k, p.clear), soffit = FLOOR_TO_FLOOR_MM - 150, fc = Math.min(positive(it?.ceilingHeight, 2750), soffit - 150);
  if (ct === 'false_ceiling_peripheral') {
    const band = 600 * s;
    for (const r of [{ x: B.x, y: B.y, w: B.w, h: band }, { x: B.x, y: B.y + B.h - band, w: B.w, h: band }, { x: B.x, y: B.y + band, w: band, h: B.h - 2 * band }, { x: B.x + B.w - band, y: B.y + band, w: band, h: B.h - 2 * band }]) hatchBox(c, r, '#eef1f5', 45, 9, PEN.hair);
    c.save(); c.setLineDash([8, 4]); drawRect(c, B.x + band + 6, B.y + band + 6, B.w - 2 * band - 12, B.h - 2 * band - 12, { stroke: '#d08b2c', weight: PEN.medium }); c.restore();
    { const t1 = `FC +${(fc / 1000).toFixed(3)}`, w1 = textWidth(c, t1, 11); soft(w1, 13, [B.y + band / 2, B.y + B.h - band / 2].flatMap(y => [0.5, 0.25, 0.75].map(f => ({ x: B.x + B.w * f, y }))), (x, y) => label(c, t1, x, y, 11, 'center', COLORS.text, true)); }
    { const t2 = `SOFFIT +${(soffit / 1000).toFixed(3)} (PAINTED)`, w2 = textWidth(c, t2, 11); soft(w2, 13, [0.5, 0.62, 0.38, 0.72, 0.28].map(f => ({ x: B.x + B.w / 2, y: B.y + B.h * f })), (x, y) => label(c, t2, x, y, 11, 'center', COLORS.dim)); }
  } else if (ct === 'false_ceiling_full' || ct === 'wooden_ceiling') {
    hatchBox(c, B, ct === 'wooden_ceiling' ? '#f3ead9' : '#eef1f5', ct === 'wooden_ceiling' ? 0 : 45, ct === 'wooden_ceiling' ? 16 : 12, PEN.hair);
    label(c, `${ct === 'wooden_ceiling' ? 'WOODEN PANEL' : 'GYPSUM'} FC +${(fc / 1000).toFixed(3)}`, B.x + B.w / 2, B.y + B.h / 2 + 34, 11, 'center', COLORS.text, true);
  } else label(c, `PLAIN CEILING — SOFFIT +${(soffit / 1000).toFixed(3)}`, B.x + B.w / 2, B.y + B.h / 2 + 34, 11, 'center', COLORS.text, true);
  const pts = intPoints(k);
  for (const l of pts.lights) { const q = at(k, l.x, l.y); circle(c, q.x, q.y, 8, '#fff', SVC.light, 1.4); drawLine(c, q.x - 6, q.y - 6, q.x + 6, q.y + 6, 1, SVC.light); drawLine(c, q.x + 6, q.y - 6, q.x - 6, q.y + 6, 1, SVC.light); }
  for (const f of pts.fans) { const q = at(k, f.x, f.y); circle(c, q.x, q.y, 13, '#fff', SVC.light, 1.6); for (let a = 0; a < 3; a++) { const ang = a * 2.094; drawLine(c, q.x, q.y, q.x + 11 * Math.cos(ang), q.y + 11 * Math.sin(ang), 1.4, SVC.light); } }
  for (const a of pts.ac) { const A = box(k, a.b); c.save(); c.setLineDash([5, 3]); drawRect(c, A.x, A.y, A.w, A.h, { stroke: SVC.power, weight: PEN.medium }); c.restore(); label(c, 'AC', A.x + A.w / 2, A.y + A.h / 2, 10, 'center', SVC.power, true); }
  const areaSqft = p.clear.w * p.clear.h / 1e6 * 10.7639, fcArea = ct === 'false_ceiling_peripheral' ? areaSqft * 0.6 : ct === 'plain' ? 0 : areaSqft;
  const y = table(c, 1290, 150, [{ h: 'ITEM', w: 300 }, { h: 'QTY', w: 140 }], [
    ['Ceiling', ct.replace(/_/g, ' ')], ['False ceiling area (= BOQ)', `${fcArea.toFixed(1)} sqft`], ['Ceiling paint (= BOQ)', `${areaSqft.toFixed(1)} sqft`],
    ['Light points', `${pts.lights.length}`], ['Fan points', `${pts.fans.length}`], ['AC indoor units', `${pts.ac.length}`],
    ['False ceiling level', ct === 'plain' ? '—' : `+${(fc / 1000).toFixed(3)} FFL`], ['Slab soffit', `+${(soffit / 1000).toFixed(3)} FFL`]], 'CEILING SCHEDULE', 22);
  legend(c, 1290, y + 34, 'LEGEND & NOTES', ['⊗ recessed LED downlight   fan: ceiling fan   AC: split indoor unit', '- - - cove LED strip at the band edge (orange)', '12.5 mm gypsum board on GI frame; access panel at AC and junctions.', ...intNotes(k).slice(0, 1)]);
  viewTitle(k, `${p.roomName.toUpperCase()} — REFLECTED CEILING PLAN`, 80, 130);
}
/* I-301 electrical & lighting */
function intElectrical(k: Context): void {
  const c = k.c, p = k.int!.plan, it = k.int!.interior; roomFrame(k, undefined, 'light');
  for (const i of p.items) drawItem(k, i, true);
  const pts = intPoints(k), ep = it?.electricalPoints;
  const wire = (a: Point, b: Point, color: string) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; c.save(); c.setLineDash([4, 3]); c.strokeStyle = color; c.lineWidth = 0.8; c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mx - dy / L * Math.min(30, L * 0.2), my + dx / L * Math.min(30, L * 0.2), b.x, b.y); c.stroke(); c.restore(); };
  const sbP = pts.sb ? at(k, pts.sb.x, pts.sb.y) : null;
  for (const l of pts.lights) { const q = at(k, l.x, l.y); if (sbP) wire(sbP, q, SVC.light); sym(c, q, 'L', SVC.light, 'circle', 10); }
  for (const f of pts.fans) { const q = at(k, f.x, f.y); if (sbP) wire(sbP, q, SVC.light); sym(c, q, 'F', SVC.light, 'circle', 12); }
  for (const a of pts.ac) { const A = box(k, a.b); sym(c, { x: A.x + A.w / 2, y: A.y + A.h / 2 }, 'AC', SVC.power, 'square', 12); }
  for (const so of pts.sockets) { const q = at(k, so.p.x, so.p.y); sym(c, q, so.kind, so.kind === 'D' ? '#6a4c93' : SVC.power, so.kind === 'S' ? 'circle' : 'square', so.kind.length > 1 ? 12 : 9); }
  if (sbP) { drawRect(c, sbP.x - 9, sbP.y - 6, 18, 12, { fill: COLORS.wall, stroke: COLORS.wall, weight: 1 }); soft(24, 12, ringCands(sbP.x + 20, sbP.y - 12, 14, 12, 2), (x, y) => label(c, 'SB', x, y, 10, 'center', COLORS.text, true)); }
  const cnt = (kd: string) => pts.sockets.filter(s2 => s2.kind === kd).length;
  const rows = [['Switch board (modular)', `${ep?.switches ?? 1}`, '1200', 'at door latch side'], ['Light points', `${ep?.lightPoints ?? pts.lights.length}`, 'ceiling', 'see I-201'], ['Fan points', `${ep?.fanPoints ?? pts.fans.length}`, 'ceiling', ''],
    ['6A sockets (S / TV)', `${ep ? Math.max(0, ep.sockets - cnt('P')) : cnt('S') + cnt('TV')}`, '300 / 1100 TV', 'bedside 600'], ['16A power (P)', `${cnt('P')}`, '1100 over counter', ''], ['Data / TV (D)', `${ep?.dataPoints ?? cnt('D')}`, '300', 'Cat6'], ['AC points', `${ep?.acPoints ?? pts.ac.length}`, '2100', '16A + drain']];
  const y = table(c, 1290, 150, [{ h: 'POINT (= interior BOQ)', w: 200 }, { h: 'QTY', w: 50 }, { h: 'HEIGHT mm', w: 110 }, { h: 'NOTE', w: 140 }], rows, 'ELECTRICAL POINTS', 22);
  legend(c, 1290, y + 34, 'NOTES', ['Curves: switching from the board to each light / fan.', 'Points follow the furniture: bedside, TV wall, desk, counter.', 'FRLS Cu wiring in concealed conduit; circuits on the house DB (E-sheets).', ...intNotes(k).slice(0, 1)]);
  viewTitle(k, `${p.roomName.toUpperCase()} — ELECTRICAL & LIGHTING`, 80, 130);
}
/* I-401 flooring */
function intFlooring(k: Context): void {
  const c = k.c, p = k.int!.plan, it = k.int!.interior; roomFrame(k);
  const fl = it?.flooring, spec = intSpec(k), mod = floorModule(spec), m = !!spec.floorTileSize || /(\d{3,4})\s*[x×]\s*(\d{2,4})/.test(`${fl?.name ?? ''} ${fl?.finish ?? ''}`);
  const tw = mod.w, th = mod.h, skirt = skirtingMm(spec), band = wallTileBand(spec);
  const B = box(k, p.clear), s = k.scale, cx = p.clear.x + p.clear.w / 2, cy = p.clear.y + p.clear.h / 2;
  c.save(); c.beginPath(); c.rect(B.x, B.y, B.w, B.h); c.clip(); c.fillStyle = '#fbfaf7'; c.fillRect(B.x, B.y, B.w, B.h);
  for (let x = cx - Math.ceil(p.clear.w / 2 / tw + 1) * tw; x <= p.clear.x + p.clear.w; x += tw) { const q = at(k, x, 0).x; drawLine(c, q, B.y, q, B.y + B.h, PEN.hair, '#b8b1a5'); }
  for (let y = cy - Math.ceil(p.clear.h / 2 / th + 1) * th; y <= p.clear.y + p.clear.h; y += th) { const q = at(k, 0, y).y; drawLine(c, B.x, q, B.x + B.w, q, PEN.hair, '#b8b1a5'); }
  c.restore();
  const cl = at(k, cx, cy); c.save(); c.setLineDash([14, 4, 3, 4]); drawLine(c, cl.x, B.y - 20, cl.x, B.y + B.h + 20, PEN.thin, COLORS.green); drawLine(c, B.x - 20, cl.y, B.x + B.w + 20, cl.y, PEN.thin, COLORS.green); c.restore();
  drawRect(c, B.x, B.y, B.w, B.h, { stroke: '#7a5c3a', weight: 2.2 });
  for (const z of p.doorZones) { const Z = box(k, z); const hz = Z.w >= Z.h; drawRect(c, Z.x, hz ? (Math.abs(Z.y - B.y) < 2 ? B.y - 4 : B.y + B.h - 4) : Z.y, hz ? Z.w : 8, hz ? 8 : Z.h, { fill: '#cfcac0', stroke: '#7a5c3a', weight: PEN.hair }); }
  void s;
  dimMm(k, [p.clear.x, p.clear.x + p.clear.w], 'x', B.y + B.h, 300 * k.scale + 24, 'floor width');
  dimMm(k, [p.clear.y, p.clear.y + p.clear.h], 'y', B.x + B.w, 300 * k.scale + 24, 'floor depth');
  const areaSqft = p.clear.w * p.clear.h / 1e6 * 10.7639, perimFt = 2 * (p.clear.w + p.clear.h) / 1000 * 3.28084;
  const y = table(c, 1290, 150, [{ h: 'ITEM', w: 230 }, { h: 'VALUE', w: 230 }], [
    ['Material', (fl?.name ?? '—').slice(0, 36)], ['Finish', (fl?.finish ?? '—').slice(0, 36)], ['Module', `${tw} × ${th} mm${m ? '' : ' (typical)'}`],
    ['Floor area (= BOQ)', `${areaSqft.toFixed(1)} sqft`], ['Skirting (= BOQ)', skirt > 0 ? `${perimFt.toFixed(1)} rft, ${skirt} mm` : 'none — walls tiled to floor'],
    ['Wall tiles', band ? (band.full ? 'full height' : `${band.fromMm ? `${band.fromMm}–` : 'to '}${band.toMm} mm`) : 'none'], ['Clear floor', `${round(p.clear.w)} × ${round(p.clear.h)} mm`], ['Wastage allowance', '5–8% (cutting)']], 'FLOORING SCHEDULE', 22);
  legend(c, 1290, y + 34, 'NOTES', ['Lay from the room centre lines (green); cut pieces ≥ half a module at walls.', 'Granite threshold at every door (grey strip).', `${skirt > 0 ? 'Skirting brown line; ' : ''}3 mm joints, epoxy grout in wet zones.`, ...intNotes(k).slice(0, 1)]);
  viewTitle(k, `${p.roomName.toUpperCase()} — FLOORING LAYOUT`, 80, 130);
}
/* I-501 four wall elevations, viewed from inside the room */
function intElevations(k: Context): void {
  const c = k.c, p = k.int!.plan, it = k.int!.interior, r = intRoom(k), cl = p.clear;
  const soffit = FLOOR_TO_FLOOR_MM - 150, fc = it?.ceilingType && it.ceilingType !== 'plain' ? Math.min(positive(it.ceilingHeight, 2750), soffit - 150) : soffit;
  const spec = intSpec(k), band0 = wallTileBand(spec), skirt = skirtingMm(spec);
  // tiles stop at the false ceiling (or the soffit) whatever the stored ceiling height
  const band = band0 ? { ...band0, toMm: Math.min(band0.full ? fc : band0.toMm, fc) } : null;
  const sides: [Side, string][] = [['rear', 'A'], ['right', 'B'], ['front', 'C'], ['left', 'D']];
  const lens = sides.map(([sd]) => (sd === 'front' || sd === 'rear' ? cl.w : cl.h));
  const den = STD_SCALES.find(d => Math.max(...lens) * PX_PER_PAPER_MM / d <= 560 && (soffit + 200) * PX_PER_PAPER_MM / d <= 360) ?? 100, s = PX_PER_PAPER_MM / den; k.views.push(den);
  const ops = roomWallOpenings(k, r), pts = intPoints(k);
  sides.forEach(([sd, letter], i) => {
    const ox = 90 + (i % 2) * 640, base = 470 + Math.floor(i / 2) * 470, L = lens[i];
    // horizontal coordinate as seen from inside facing this wall
    const u = (x: number, y: number) => sd === 'rear' ? cl.x + cl.w - x : sd === 'front' ? x - cl.x : sd === 'left' ? cl.y + cl.h - y : y - cl.y;
    const X = (mm: number) => ox + mm * s, Y = (mm: number) => base - mm * s;
    drawRect(c, X(0), Y(soffit), L * s, soffit * s, { fill: '#fff', stroke: COLORS.wall, weight: PEN.cut });
    if (fc < soffit) hatchBox(c, { x: X(0), y: Y(soffit), w: L * s, h: (soffit - fc) * s }, '#eef1f5', 45, 8, PEN.hair);
    if (band) { // wall tiles: band with the tile joints (300 × 600 laid vertical)
      const y0 = Y(band.toMm), hgt = (band.toMm - band.fromMm) * s;
      drawRect(c, X(0), y0, L * s, hgt, { fill: '#e6f0f4', stroke: '#7aa5b8', weight: PEN.hair });
      c.save(); c.beginPath(); c.rect(X(0), y0, L * s, hgt); c.clip();
      for (let u = 300; u < L; u += 300) drawLine(c, X(u), y0, X(u), y0 + hgt, 0.5, '#9fc0cf');
      for (let z = band.fromMm + 600; z < band.toMm; z += 600) drawLine(c, X(0), Y(z), X(L), Y(z), 0.5, '#9fc0cf');
      c.restore();
      if (i === 0) { const t = band.full ? 'WALL TILES FULL HEIGHT' : `WALL TILES ${band.fromMm ? `${band.fromMm}–` : 'TO '}${band.toMm}`, tw2 = textWidth(c, t, 10, true); soft(tw2, 12, [{ x: X(0) + tw2 / 2 + 6, y: y0 + 10 }, { x: X(L) - tw2 / 2 - 6, y: y0 + 10 }, { x: X(0) + tw2 / 2 + 6, y: y0 - 10 }], (x2, y2) => label(c, t, x2, y2, 10, 'center', '#2b6f8a', true)); }
    }
    if (skirt > 0) drawRect(c, X(0), Y(skirt), L * s, skirt * s, { fill: '#e8e2d6', stroke: COLORS.dim, weight: PEN.hair });
    for (const { o, side } of ops.filter(v => v.side === sd)) {
      const a = o.axis === 'horizontal' ? u(o.a, 0) : u(0, o.a), b = o.axis === 'horizontal' ? u(o.b, 0) : u(0, o.b), u0 = Math.max(0, Math.min(a, b)), u1 = Math.min(L, Math.max(a, b));
      if (u1 - u0 < 100) continue;
      const sill = o.source.type === 'door' ? 0 : finite(o.source.sillHeightMm, 900), h = positive(o.source.heightMm, o.source.type === 'door' ? 2100 : 1200);
      drawRect(c, X(u0), Y(sill + h), (u1 - u0) * s, h * s, { fill: o.source.type === 'door' ? '#f4efe6' : '#e8f3f8', stroke: COLORS.wall, weight: PEN.medium }); void side;
    }
    for (const fi of p.items.filter(v => v.side === sd)) {
      const a = sd === 'front' || sd === 'rear' ? u(fi.x, 0) : u(0, fi.y), b = sd === 'front' || sd === 'rear' ? u(fi.x + fi.w, 0) : u(0, fi.y + fi.d), u0 = Math.min(a, b), u1 = Math.max(a, b);
      const inCounter = fi.kind === 'fixture' && p.items.some(cn => cn.kind === 'counter' && ovl({ x: cn.x, y: cn.y, w: cn.w, h: cn.d }, { x: fi.x, y: fi.y, w: fi.w, h: fi.d }));
      if (inCounter) { drawRect(c, X(u0), Y(900), (u1 - u0) * s, 60 * s + 2, { fill: '#c9d3da', stroke: COLORS.wall, weight: PEN.hair }); continue; }
      const z0 = fi.kind === 'upper' ? 1500 : 0, h = fi.kind === 'upper' ? 700 : fi.category === 'bed' ? 1050 : Math.max(50, fi.h);
      drawRect(c, X(u0), Y(z0 + h), (u1 - u0) * s, h * s, { fill: fi.kind === 'counter' ? '#efe9df' : '#f6f6f4', stroke: COLORS.wall, weight: PEN.medium });
      if (u1 - u0 > 500 && h > 300) { const tW = textWidth(c, shortName(fi.name), 9); if (tW < (u1 - u0) * s - 4) label(c, shortName(fi.name), X((u0 + u1) / 2), Y(z0 + h / 2), 9, 'center', COLORS.dim); }
    }
    for (const so of pts.sockets) { const onS = sd === 'front' ? Math.abs(so.p.y - cl.y) < 100 : sd === 'rear' ? Math.abs(so.p.y - cl.y - cl.h) < 100 : sd === 'left' ? Math.abs(so.p.x - cl.x) < 100 : Math.abs(so.p.x - cl.x - cl.w) < 100;
      if (!onS) continue; const uu = u(so.p.x, so.p.y), z = so.kind === 'TV' ? 1100 : so.kind === 'P' ? 1100 : 300; drawRect(c, X(uu) - 4, Y(z) - 4, 8, 8, { fill: '#fff', stroke: SVC.power, weight: 1 }); }
    if (pts.sb) { const sb = pts.sb, onS = sd === 'front' ? Math.abs(sb.y - cl.y) < 120 : sd === 'rear' ? Math.abs(sb.y - cl.y - cl.h) < 120 : sd === 'left' ? Math.abs(sb.x - cl.x) < 120 : Math.abs(sb.x - cl.x - cl.w) < 120;
      if (onS) drawRect(c, X(u(sb.x, sb.y)) - 7, Y(1200) - 5, 14, 10, { fill: COLORS.wall, stroke: COLORS.wall, weight: 1 }); }
    drawDimensionChain(c, [Y(soffit), ...(fc < soffit ? [Y(fc)] : []), Y(0)], X(L), 22, 'vertical', s);
    drawDimensionChain(c, [X(0), X(L)], Y(0), 24, 'horizontal', s);
    label(c, `ELEVATION ${letter} — ${sd.toUpperCase()} WALL`, X(0), Y(soffit) - 26, 13, 'left', COLORS.green, true);
    label(c, `SCALE 1:${den}`, X(0), Y(soffit) - 10, 10, 'left', COLORS.dim);
  });
  // key plan
  const kp = { x: 1450, y: 160, w: 300, h: 300 }, sc = Math.min(kp.w / cl.w, kp.h / cl.h) * 0.7;
  const kw = clamp(cl.w * sc, 200, 300), kh = clamp(cl.h * sc, 200, 300), kx = kp.x + (kp.w - kw) / 2, ky = kp.y + (kp.h - kh) / 2;
  drawRect(c, kx, ky, kw, kh, { stroke: COLORS.wall, weight: PEN.cut });
  for (const [sd, letter] of sides) { const pt = sd === 'rear' ? { x: kx + kw / 2, y: ky + kh - 30 } : sd === 'front' ? { x: kx + kw / 2, y: ky + 30 } : sd === 'left' ? { x: kx + 30, y: ky + kh / 2 } : { x: kx + kw - 30, y: ky + kh / 2 };
    circle(c, pt.x, pt.y, 12, '#fff', COLORS.wall, 1.2); label(c, letter, pt.x, pt.y + 0.5, 11, 'center', COLORS.text, true); }
  label(c, 'KEY PLAN (NTS, road at top)', kp.x, kp.y - 8, 12, 'left', COLORS.green, true);
  legend(c, 1450, 520, 'NOTES', [`Wall finish: ${(it?.wallFinish?.name ?? 'paint').slice(0, 40)}${band ? `; wall tiles ${band.full ? 'full height' : `${band.fromMm ? `${band.fromMm}–` : 'to '}${band.toMm} mm`}` : ''}`, `${skirt > 0 ? `Skirting ${skirt}; ` : ''}${fc < soffit ? `false ceiling +${(fc / 1000).toFixed(3)}` : 'plain ceiling'}; soffit +${(soffit / 1000).toFixed(3)}`, 'Sockets 300 / 1100; switch boards 1200 FFL.', 'Each elevation viewed from inside the room.']);
}
/* I-601 woodwork: front elevations of the storage units at the largest scale that fits */
function intWoodwork(k: Context): void {
  const c = k.c, p = k.int!.plan, it = k.int!.interior;
  const units = p.items.filter(i => ['wardrobe', 'crockery', 'tv_unit', 'bookshelf', 'dressing', 'shoe_rack', 'pooja_unit', 'bar_unit', 'kitchen_cabinet'].includes(i.category) && i.kind !== 'fixture').slice(0, 4);
  if (!units.length) { label(c, 'No built-in woodwork selected for this room.', 120, 300, 16, 'left', COLORS.dim); viewTitle(k, `${p.roomName.toUpperCase()} — WOODWORK`, 80, 130); return; }
  units.forEach((u0, i) => {
    const len = u0.side === 'front' || u0.side === 'rear' || u0.side === 'free' ? u0.w : u0.d, H = u0.kind === 'upper' ? 700 : u0.h;
    const one = units.length <= 2, cellH = one ? 760 : 330;
    const den = [10, 20, 25, 50, 100].find(d => len * PX_PER_PAPER_MM / d <= 520 && H * PX_PER_PAPER_MM / d <= cellH) ?? 100, s = PX_PER_PAPER_MM / den; k.views.push(den);
    const ox = 110 + (i % 2) * 640, base = one ? 1000 : 520 + Math.floor(i / 2) * 470;
    drawRect(c, ox, base - H * s, len * s, H * s, { fill: '#faf7f1', stroke: COLORS.wall, weight: PEN.cut });
    const n = Math.max(1, Math.round(len / 550)), loft = u0.category === 'wardrobe' && H >= 2100 ? 600 : 0;
    for (let j = 1; j < n; j++) drawLine(c, ox + len * s * j / n, base - H * s, ox + len * s * j / n, base, PEN.medium);
    if (loft) drawLine(c, ox, base - (H - loft) * s, ox + len * s, base - (H - loft) * s, PEN.medium);
    if (u0.kind === 'counter') drawLine(c, ox, base - (H - 40) * s, ox + len * s, base - (H - 40) * s, PEN.cut);
    for (let j = 0; j < n; j++) { const hx = ox + len * s * (j + (j % 2 ? 0.12 : 0.88)) / n; drawLine(c, hx, base - Math.min(H, 1100) * s, hx, base - Math.min(H, 1100) * s + 18, 2.2); }
    drawDimensionChain(c, [ox, ox + len * s], base, 26, 'horizontal', s);
    drawDimensionChain(c, [base - H * s, ...(loft ? [base - (H - loft) * s] : []), base], ox + len * s, 22, 'vertical', s);
    label(c, `${shortName(u0.name).toUpperCase()} — FRONT ELEVATION`, ox, base - H * s - 34, 13, 'left', COLORS.green, true);
    label(c, `SCALE 1:${den}  •  ${n} shutters${loft ? ' + loft' : ''}`, ox, base - H * s - 17, 10, 'left', COLORS.dim);
    const spec = u0.category === 'wardrobe' ? 'hanging rod 1050 + 4 shelves @ 350; 2 drawers; loft over' : u0.category === 'kitchen_cabinet' ? 'base modules 600: drawers / shutters; carcass BWP ply' : u0.category === 'tv_unit' ? 'wall-hung; open niche + 2 drawers; cable duct' : 'shelves @ 350 c/c';
    label(c, `Internal: ${spec}`, ox, base + 58, 10.5, 'left', COLORS.text);
  });
  legend(c, 1300, 1060, 'WOODWORK NOTES', [`Carcass 18 mm BWP ply; ${(it?.style ?? 'modern').replace(/_/g, ' ')} finish laminate 1 mm.`, 'Soft-close hinges and channels; handles as shown.', 'Sizes from the furniture schedule (I-101) = BOQ woodwork.']);
  viewTitle(k, `${p.roomName.toUpperCase()} — WOODWORK DETAILS`, 80, 130);
}


/* ── Office sheets (per floor): A-701 furniture, M-201 HVAC, FP-101 fire safety ── */
/** Building-local metres (as the Layout rooms) → model mm. */
function officeXY(k: Context): (x: number, y: number) => Point {
  const r = (k.g.rooms[k.level] ?? [])[0];
  const ox = r ? r.x - r.source.x * 1000 : k.g.building.x, oy = r ? r.y - r.source.y * 1000 : k.g.building.y;
  return (x, y) => at(k, ox + x * 1000, oy + y * 1000);
}
/** Symbol placement that steps aside from symbols already on the sheet. */
function declutter(): (p: Point, r: number) => Point {
  const placed: { x: number; y: number; r: number }[] = [];
  return (p, r) => {
    const free = (q: Point) => placed.every(o => Math.hypot(o.x - q.x, o.y - q.y) >= o.r + r + 2);
    let q = p;
    for (let ring = 1; ring <= 6 && !free(q); ring++) for (let a = 0; a < 8; a++) { const t = { x: p.x + Math.cos(a * Math.PI / 4) * ring * (r + 3), y: p.y + Math.sin(a * Math.PI / 4) * ring * (r + 3) }; if (free(t)) { q = t; break; } }
    placed.push({ ...q, r }); return q;
  };
}
function officeFurniture(k: Context): void {
  const c = k.c; svcFrame(k); servicesBase(k);
  const counts = new Map<string, number>();
  let seats = 0;
  for (const r of svcRooms(k)) {
    const t = r.source.type as string; if (t === 'passage' || t === 'staircase') continue;
    const fin = mapRoomTypeToFinish(r.source.type), area = r.source.width * r.source.depth;
    const furniture = getDefaultFurniture(fin, 'modern_minimalist', t, area).filter(f => f.defaultSelected === true);
    const interior = { roomId: r.source.id, roomName: r.source.name, roomType: fin, style: 'modern_minimalist', furniture } as unknown as RoomInterior;
    const plan = planInteriorRoom(k.layout, k.req, r.source.id, interior, 0);
    if (!plan) continue;
    for (const it of plan.items.filter(i => i.kind === 'upper')) drawItem(k, it, true);
    for (const it of plan.items.filter(i => i.kind !== 'upper')) {
      drawItem(k, it);
      const name = it.category === 'study_table' && (it.qty ?? 1) >= 4 ? 'Workstation (4-seat cluster)' : shortName(it.name).replace(/\s+\d+$/, '');
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (it.category === 'study_table') seats += it.qty ?? 1;
    }
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([n, q]) => [n.slice(0, 34), `${q}`]);
  rows.push(['Desk seats placed (workstations + cabins)', `${seats}`]);
  const y = table(c, 1420, 150, [{ h: 'ITEM', w: 300 }, { h: 'QTY', w: 70 }], rows, `FURNITURE — ${floorName(k).toUpperCase()}`, 20);
  legend(c, 1420, y + 30, 'NOTES', ['Same placement as each room’s interior sheets (I-101).', 'Clear aisles 1200 between clusters, 900 at desks.', 'Final sizes from the furniture vendor.']);
  viewTitle(k, `${floorName(k).toUpperCase()} — FURNITURE LAYOUT`, 80, 112);
}
const HV = '#1f6fb2', FIRE = '#c62828', EXIT = '#2e7d32';
function hvacPlan(k: Context): void {
  const c = k.c; svcFrame(k); servicesBase(k);
  const S = officeServices(k.layout), f = S.floors[k.level], P = officeXY(k), place = declutter(), s = k.scale;
  if (!f) return;
  // refrigerant riser by the stair (or the rear-right corner) up to the terrace VRV units
  const st = (k.g.rooms[k.level] ?? []).find(r => r.source.type === 'staircase');
  const riser = st ? at(k, st.x + 150, st.y + 150) : at(k, k.g.building.x + k.g.building.w - 300, k.g.building.y + k.g.building.h - 300);
  for (const p of f.points.filter(q => q.kind === 'cassette' || q.kind === 'wall_unit')) {
    const q = P(p.x, p.y);
    ortho(c, q, riser, HV, 0.9, [6, 3]);
  }
  for (const p of f.points) {
    const q = P(p.x, p.y);
    if (p.kind === 'cassette') { const h = 420 * s; drawRect(c, q.x - h, q.y - h, 2 * h, 2 * h, { fill: '#eaf3fb', stroke: HV, weight: 1.4 }); drawLine(c, q.x - h, q.y - h, q.x + h, q.y + h, 0.7, HV); drawLine(c, q.x + h, q.y - h, q.x - h, q.y + h, 0.7, HV); const t = place(q, 12); sym(c, t, 'C', HV, 'square', 10); }
    else if (p.kind === 'wall_unit') { drawRect(c, q.x - 450 * s, q.y - 125 * s, 900 * s, 250 * s, { fill: '#eaf3fb', stroke: HV, weight: 1.4 }); sym(c, place({ x: q.x, y: q.y - 16 }, 12), 'AC', HV, 'square', 11); }
    else if (p.kind === 'exhaust') sym(c, place(q, 12), 'EF', '#6a4c93', 'circle', 11);
  }
  circle(c, riser.x, riser.y, 9, '#fff', HV, 2); label(c, 'R', riser.x, riser.y + 0.5, 10, 'center', HV, true);
  const rows = f.cooling.map(r => [r.name.slice(0, 26), `${Math.round(r.areaSqFt)}`, `${r.tr}`, `${r.units} × ${r.unitType === 'cassette' ? 'cassette' : 'wall unit'}`]);
  const trF = f.cooling.reduce((a, r) => a + r.tr, 0);
  rows.push(['TOTAL THIS FLOOR', '', `${trF}`, ''], ['BUILDING (= BOQ)', '', `${S.totals.tr}`, `${S.totals.outdoorUnits} × 10 TR VRV outdoor`]);
  const y = table(c, 1420, 150, [{ h: 'ROOM', w: 190 }, { h: 'SQ FT', w: 60 }, { h: 'TR', w: 50 }, { h: 'INDOOR UNITS', w: 150 }], rows, `COOLING LOAD — ${floorName(k).toUpperCase()}`, 20);
  legend(c, 1420, y + 30, 'LEGEND & NOTES', ['C  4-way ceiling cassette, 2 TR (840 sq)   AC  wall-mounted VRV unit', 'EF exhaust fan   R  refrigerant riser to terrace', '- - - refrigerant + drain lines, run above the false ceiling', 'Load: 110 sq ft/TR offices & meeting, 130 cabins, 60 server room.', 'Server room: two units (one standby).', 'Fresh air by ducted inline fans; final sizing by HVAC consultant.']);
  viewTitle(k, `${floorName(k).toUpperCase()} — HVAC LAYOUT`, 80, 112);
}
function firePlan(k: Context): void {
  const c = k.c; svcFrame(k); servicesBase(k);
  const S = officeServices(k.layout), f = S.floors[k.level], P = officeXY(k), place = declutter();
  if (!f) return;
  // escape routes first (under the symbols)
  for (const r of f.routes) {
    const pts = r.path.slice(1).map(p => P(p.x, p.y)); // drawn from the room door onward; in-room travel is in the table
    if (pts.length < 2) continue;
    c.save(); c.setLineDash([10, 5]); c.strokeStyle = EXIT; c.lineWidth = 1.3; c.beginPath(); c.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p => c.lineTo(p.x, p.y)); c.stroke(); c.restore();
    const a = pts[pts.length - 2], b = pts[pts.length - 1]; if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 12) arrow(c, a.x + (b.x - a.x) * 0.6, a.y + (b.y - a.y) * 0.6, a.x + (b.x - a.x) * 0.9, a.y + (b.y - a.y) * 0.9, EXIT, 9);
  }
  const draw = (p: ServicePoint) => {
    const q = P(p.x, p.y);
    switch (p.kind) {
      case 'sprinkler': circle(c, q.x, q.y, 3.2, FIRE, FIRE, 0.8); break;
      case 'smoke': sym(c, place(q, 9), 'S', FIRE, 'circle', 8); break;
      case 'ext_abc': sym(c, place({ x: q.x, y: q.y + 16 }, 13), 'FE', FIRE, 'square', 12); break;
      case 'ext_co2': sym(c, place(q, 14), 'CO2', FIRE, 'square', 13); break;
      case 'mcp': sym(c, place({ x: q.x + 18, y: q.y }, 13), 'MCP', FIRE, 'square', 13); break;
      case 'hooter': sym(c, place({ x: q.x - 18, y: q.y }, 11), 'H', FIRE, 'circle', 10); break;
      case 'em_light': sym(c, place(q, 11), 'EL', '#b26a00', 'circle', 10); break;
      case 'hose_reel': sym(c, place(q, 13), 'HR', FIRE, 'square', 12); break;
      case 'exit_sign': { const t = place({ x: q.x, y: q.y - 18 }, 16); drawRect(c, t.x - 16, t.y - 7, 32, 14, { fill: EXIT, stroke: EXIT, weight: 1 }); label(c, 'EXIT', t.x, t.y + 0.5, 9, 'center', '#ffffff', true); break; }
      default: break;
    }
  };
  for (const p of f.points.filter(q => q.kind === 'sprinkler')) draw(p);
  for (const p of f.points.filter(q => q.kind !== 'sprinkler')) draw(p);
  const cnt = (kd: ServicePoint['kind']) => f.points.filter(p => p.kind === kd).length;
  const ok = f.maxTravelM <= 30;
  const longest = [...f.routes].sort((a, b) => b.lengthM - a.lengthM).slice(0, 6).map(r => [r.name.slice(0, 24), `${r.lengthM.toFixed(1)} m`, r.exit]);
  let y = table(c, 1420, 150, [{ h: 'DEVICE', w: 240 }, { h: 'QTY', w: 60 }], [
    ['Sprinklers (light hazard, ≤ 4 m grid)', `${cnt('sprinkler')}`], ['Smoke detectors (≤ 7 m grid)', `${cnt('smoke')}`], ['Extinguishers ABC 6 kg', `${cnt('ext_abc')}`], ['Extinguishers CO2 4.5 kg', `${cnt('ext_co2')}`],
    ['Manual call points / hooters', `${cnt('mcp')} / ${cnt('hooter')}`], ['Exit signs', `${cnt('exit_sign')}`], ['Emergency lights', `${cnt('em_light')}`], ['Hose reel', `${cnt('hose_reel')}`]], `FIRE SAFETY — ${floorName(k).toUpperCase()} (= BOQ)`, 20);
  y = table(c, 1420, y + 24, [{ h: 'LONGEST ESCAPE ROUTES', w: 170 }, { h: 'TRAVEL', w: 70 }, { h: 'TO', w: 110 }], longest, `TRAVEL DISTANCE: ${f.maxTravelM.toFixed(1)} m ${ok ? '≤' : '>'} 30 m (NBC) — ${ok ? 'OK' : 'CHECK'}`, 20);
  legend(c, 1420, y + 30, 'LEGEND & NOTES', ['• sprinkler   S smoke detector   FE / CO2 extinguisher', 'MCP manual call point   H hooter   EL emergency light   HR hose reel', '- - -> escape route from each door to the nearest exit (travel measured from the farthest point of the room)', `Exits: ${f.exits.map(e => e.name).join(', ') || 'none found'}.`, ...(k.g.floors > 1 && f.exits.filter(e => e.name === 'Staircase').length < 2 && k.level > 0 ? ['One staircase: confirm a second exit with the fire officer.'] : []), 'NBC Part 4 (business). Approval by the local fire authority.']);
  viewTitle(k, `${floorName(k).toUpperCase()} — FIRE SAFETY & ESCAPE`, 80, 112);
}

/* ── vector output: the same sheet drawn into a recording context (for vector PDF and CAD export) ── */
let VECTOR_TARGET: VectorContext | null = null;
/** Same arguments as generateProgrammaticDrawing; returns the sheet as vector data instead of a PNG. */
export function generateVectorDrawing(...args: Parameters<typeof generateProgrammaticDrawing>): VectorSheet {
  const v = new VectorContext(SHEET_W, SHEET_H);
  VECTOR_TARGET = v;
  try { generateProgrammaticDrawing(...args); } finally { VECTOR_TARGET = null; }
  const type = args[0], floor = args[5], ff = floor === 'FF' ? 1 : 0;
  return v.sheet({ title: titleFor[type as DrawingType], sheetNo: sheetNumber(type, ff) });
}
/** Drawing types that have programmatic (non-AI) renderers. */
export const PROGRAMMATIC_TYPES = [
  'excavation', 'column_layout', 'footing_detail', 'beam_slab',
  'column_detail', 'bar_bending', 'section_aa', 'front_elevation',
  'staircase_detail', 'water_tank', 'waterproofing', 'stp_detail',
  'electrical', 'plumbing', 'tiling_layout', 'brickwork_detail',
  'working_plan', 'door_window_schedule',
  'site_plan', 'terrace_plan', 'side_elevation', 'section_bb', 'cover_sheet', 'wet_areas', 'typical_details',
] as const;

/** Render a coordinated A3 landscape construction drawing and return a PNG data URL. */
export function generateProgrammaticDrawing(
  drawingType: string, layout: Layout, requirements: ProjectRequirements,
  structuralResult?: any, boq?: BOQ | null, floor?: 'GF' | 'FF',
  /** interior sheets: which room, the customer's selection for it, and the chosen arrangement */
  interiorOpts?: { roomId: string; interior?: RoomInterior; option?: number },
): string {
  if (typeof document === 'undefined') throw new Error('Canvas drawing requires a browser document.');
  SYM_SCALE = 1;
  const canvas = VECTOR_TARGET ? null : document.createElement('canvas'); if (canvas) { canvas.width = SHEET_W; canvas.height = SHEET_H; }
  const c = VECTOR_TARGET ? (VECTOR_TARGET as unknown as CanvasRenderingContext2D) : canvas!.getContext('2d');
  if (!c) throw new Error('Unable to obtain Canvas 2D context.');
  const data = obj(structuralResult as unknown);
  const g = makeGeometry(layout, requirements, data);
  const drawing = drawingType as DrawingType;
  if (!Object.prototype.hasOwnProperty.call(titleFor, drawing))
    throw new Error(`Unsupported programmatic drawing type: ${drawingType}`);
  let level: Level = floor === 'FF' && g.floors > 1 ? 1 : 0;
  let intCtx: Context['int'];
  if (INT_BASE[drawing]) {
    if (!interiorOpts) throw new Error('Interior sheets need a room.');
    const opts = interiorOptions(layout, requirements, interiorOpts.roomId, interiorOpts.interior);
    const plan = opts[interiorOpts.option ?? 0] ?? opts[0] ?? planInteriorRoom(layout, requirements, interiorOpts.roomId, interiorOpts.interior, 0);
    if (!plan) throw new Error(`Room ${interiorOpts.roomId} not found in the locked plan.`);
    level = (plan.floor > 0 ? 1 : 0) as Level; intCtx = { plan, interior: interiorOpts.interior };
  }
  const k: Context = { c, g, layout, req: requirements, data, boq: boq ?? null,
    level, frame: { x: 0, y: 0, s: 1, width: 0, height: 0 }, scale: 1,
    title: titleFor[drawing], views: [], type: drawing, sheetNo: sheetNumber(drawing, level),
    rev: Math.max(1, Math.round(finite((layout as Layout & { revision?: number }).revision, 1))), int: intCtx };
  AUDIT = { labels: [], checks: [], scales: [] };
  SOFT = [];
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
    case 'site_plan': sitePlan(k); break;
    case 'terrace_plan': terracePlan(k); break;
    case 'side_elevation': sideElevations(k); break;
    case 'section_bb': sectionBB(k); break;
    case 'cover_sheet': coverSheet(k); break;
    case 'wet_areas': wetAreas(k); break;
    case 'typical_details': typicalDetails(k); break;
    case 'office_furniture': officeFurniture(k); break;
    case 'hvac': hvacPlan(k); break;
    case 'fire_safety': firePlan(k); break;
    case 'int_furniture': intFurniture(k); break;
    case 'int_rcp': intRcp(k); break;
    case 'int_electrical': intElectrical(k); break;
    case 'int_flooring': intFlooring(k); break;
    case 'int_elevations': intElevations(k); break;
    case 'int_woodwork': intWoodwork(k); break;
  }
  resolveSoft();
  c.restore();
  titleBlock(k);
  // ── drafting audit: preferred scales, overlapping text ──
  const a = AUDIT;
  const odd = k.views.filter(d => !STD_SCALES.includes(d) && !(k.int && d === 25));
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
  return canvas ? canvas.toDataURL('image/png') : '';
  } finally { AUDIT = null; SOFT = null; }
}
