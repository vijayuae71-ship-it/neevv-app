'use client';

import type { Layout, Room, ProjectRequirements, BOQ, Column, Setbacks, LayoutOpening } from '../types';

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
  'staircase_detail' | 'water_tank' | 'waterproofing' | 'stp_detail';

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
  section_aa: 'BUILDING SECTION A–A', front_elevation: 'FRONT ELEVATION',
  staircase_detail: 'STAIRCASE PLAN & SECTION', water_tank: 'SUMP & OVERHEAD TANK DETAILS',
  waterproofing: 'WATERPROOFING DETAILS', stp_detail: 'STP SCHEMATIC LAYOUT',
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
  c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y); c.restore();
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
  const s = Math.min((target.w - 2 * pad) / Math.max(1, bounds.w),
    (target.h - 2 * pad) / Math.max(1, bounds.h));
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
}
function drawPlot(k: Context): void {
  const c = k.c, p = box(k, k.g.footprint), b = box(k, k.g.building);
  drawRect(c, p.x, p.y, p.w, p.h, { stroke: COLORS.wall, weight: 2 });
  drawRect(c, b.x, b.y, b.w, b.h, { stroke: COLORS.grid, dash: [10, 6], weight: 1 });
  label(c, 'PLOT BOUNDARY', p.x + 7, p.y - 12, 14);
  label(c, 'BUILDABLE / BUILDING ENVELOPE', b.x + 5, b.y + 14, 13, 'left', COLORS.grid);
  const s = k.frame.s;
  if (k.g.setbacks.left > 0) drawDimensionChain(c, [p.x, b.x], p.y, -30, 'horizontal', s);
  if (k.g.setbacks.right > 0) drawDimensionChain(c, [b.x + b.w, p.x + p.w], p.y, -30, 'horizontal', s);
  if (k.g.setbacks.front > 0) drawDimensionChain(c, [p.y, b.y], p.x, -38, 'vertical', s);
  if (k.g.setbacks.rear > 0) drawDimensionChain(c, [b.y + b.h, p.y + p.h], p.x, -38, 'vertical', s);
  drawDimensionChain(c, [p.x, p.x + p.w], p.y, -67, 'horizontal', s);
  drawDimensionChain(c, [p.y, p.y + p.h], p.x, -74, 'vertical', s);
  drawNorthArrow(c, p.x + p.w + 50, p.y + 55, k.req.facing);
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
  for (const item of k.g.columns) {
    const p = at(k, item.x, item.y);
    drawColumnSymbol(k.c, p.x, p.y, Math.max(5, item.w * k.scale), Math.max(5, item.d * k.scale));
  }
}
function planOpening(c: CanvasRenderingContext2D, k: Context, o: OpeningPlacement): void {
  const a = o.axis === 'horizontal' ? at(k, o.a, o.fixed) : at(k, o.fixed, o.a);
  const b = o.axis === 'horizontal' ? at(k, o.b, o.fixed) : at(k, o.fixed, o.b);
  const length = o.axis === 'horizontal' ? b.x - a.x : b.y - a.y;
  if (length <= 4) return;
  // Only erase the small host wall segment; framing remains visible either side.
  c.save(); c.strokeStyle = '#fff'; c.lineWidth = Math.max(5, (o.face === 'internal' ? 150 : 230) * k.scale + 3);
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore();
  if (o.source.type === 'door') drawDoor(c, a.x, a.y, length, o.axis,
    o.face === 'rear' || o.face === 'right' ? -1 : 1);
  else drawWindow(c, a.x, a.y, length, o.axis);
}
function drawPlanRooms(k: Context, light = false): void {
  const c = k.c;
  const b = box(k, k.g.building);
  c.save(); if (light) c.globalAlpha = 0.55;
  const t = Math.max(4, 230 * k.scale);
  drawDoubleLineWall(c, b.x, b.y, b.x + b.w, b.y, t, 2);
  drawDoubleLineWall(c, b.x, b.y + b.h, b.x + b.w, b.y + b.h, t, 2);
  drawDoubleLineWall(c, b.x, b.y, b.x, b.y + b.h, t, 2);
  drawDoubleLineWall(c, b.x + b.w, b.y, b.x + b.w, b.y + b.h, t, 2);
  const seen = new Set<string>();
  for (const r of selected(k)) {
    const q = box(k, { x: r.x, y: r.y, w: r.w, h: r.d });
    for (const [x1, y1, x2, y2] of [
      [q.x, q.y, q.x + q.w, q.y], [q.x, q.y + q.h, q.x + q.w, q.y + q.h],
      [q.x, q.y, q.x, q.y + q.h], [q.x + q.w, q.y, q.x + q.w, q.y + q.h],
    ]) {
      const key = [x1, y1, x2, y2].map(v => Math.round(v)).join(',');
      if (seen.has(key)) continue; seen.add(key);
      drawDoubleLineWall(c, x1, y1, x2, y2, Math.max(3, 150 * k.scale), 1.2);
    }
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
    if (q.w > 65 && q.h > 45) {
      label(c, r.source.name, cx, cy - 9, clamp(q.w / 14, 11, 16), 'center');
      label(c, `${round(r.w)} × ${round(r.d)}`, cx, cy + 12, 12, 'center', COLORS.dim);
    }
  }
  for (const o of k.g.openings.filter(v => v.floor === k.level)) planOpening(c, k, o);
  c.restore();
}
function drawSectionMark(k: Context): void {
  const cutY = k.g.building.y + k.g.building.h / 2;
  const a = at(k, k.g.building.x - 600, cutY);
  const b = at(k, k.g.building.x + k.g.building.w + 600, cutY);
  dashed(k.c, a, b, COLORS.green, 1.4, [14, 4, 3, 4]);
  for (const p of [a, b]) {
    circle(k.c, p.x, p.y, 15, '#fff', COLORS.green, 1.5);
    label(k.c, 'A', p.x, p.y, 14, 'center', COLORS.green, true);
  }
}
function openingLegend(k: Context, x: number, y: number): void {
  const counts = k.g.openings.filter(o => o.floor === k.level);
  legend(k.c, x, y, 'OPENINGS / PLAN REFERENCE', [
    `Door instances: ${counts.filter(o => o.source.type === 'door').length}`,
    `Window instances: ${counts.filter(o => o.source.type === 'window').length}`,
    'Offsets centred/distributed — field verify.',
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
  label(c, `BUILDING FOOTPRINT ${round(k.g.building.w)} × ${round(k.g.building.h)} mm • FLOOR ${k.level === 0 ? 'GF' : 'FF'}`,
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

/* 6. Data-driven bar bending schedule. Never invent entry quantities. */
function barBending(k: Context): void {
  const c = k.c, raw = list(k.data.bbsEntries).map(obj);
  const columns = [110, 205, 360, 685, 810, 960, 1125, 1310, 1530, 1840];
  const headers = ['S.No', 'Bar Mark', 'Member', 'Dia', 'Shape', 'No.Bars', 'Cut Length', 'Total Length', 'Weight'];
  label(c, 'BAR BENDING SCHEDULE — ALL LENGTHS IN mm', 120, 150, 28, 'left', COLORS.green, true);
  label(c, `STEEL: ${steel(k)}  •  CONCRETE: ${concrete(k)}`, 120, 194, 16);
  const top = 270;
  const rowHeight = raw.length <= 20 ? 36 : raw.length <= 28 ? 28 : 23;
  const maxRows = Math.floor(820 / rowHeight) - 2;
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
    label(c, raw.length > maxRows ? `VISIBLE SUBTOTAL (${maxRows} OF ${raw.length})` : 'TOTAL WEIGHT',
      columns[0] + 10, summaryY + rowHeight / 2, 15, 'left', COLORS.text, true);
    const allWeight = raw.reduce((sum, r) => {
      const diameter = positive(r.diameter ?? r.diaMm, 0);
      const bars = positive(r.noOfBars, 0);
      const totalLength = positive(r.totalLength, bars * positive(r.cuttingLength, 0));
      return sum + positive(r.weight, totalLength * diameter * diameter / 162000);
    }, 0);
    label(c, `${(raw.length > maxRows ? summed : allWeight).toFixed(2)} kg`,
      columns[8] + 8, summaryY + rowHeight / 2, 15, 'left', COLORS.text, true);
    if (raw.length > maxRows) label(c, `CONTINUED: ${raw.length - maxRows} entries omitted — export approved full BBS separately.`,
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
  drawLine(c, x - 28, y, x + 15, y, 0.8, COLORS.dim);
  c.save(); c.fillStyle = COLORS.green; c.beginPath(); c.moveTo(x - 28, y);
  c.lineTo(x - 19, y - 8); c.lineTo(x - 19, y + 8); c.fill(); c.restore();
  label(c, textValue, x + 23, y, 14, 'left', COLORS.text);
}
function sectionAA(k: Context): void {
  const c = k.c, b = k.g.building, floors = Math.min(k.g.floors, 5);
  const bottom = -900, top = 450 + floors * 3000 + 900;
  const view = { x: b.x - 500, y: bottom, w: b.w + 1050, h: top - bottom };
  setFrame(k, view, { x: 135, y: 150, w: 1470, h: 900 }, 55);
  // Model Z upwards while canvas Y down; x unchanged from plan.
  const project = (x: number, z: number): Point => at(k, x, top - z + bottom);
  const s = k.scale, wall = 230 * s;
  const ngl = project(b.x, 0).y;
  drawRect(c, 150, ngl, 1440, Math.max(0, 1150 - ngl), { fill: COLORS.earth });
  drawHatch(c, 150, ngl + 4, 1440, Math.max(0, 1150 - ngl), 45, 16);
  drawLine(c, 150, ngl, 1600, ngl, 1.5);
  const left = project(b.x, 0).x, right = project(b.x + b.w, 0).x;
  const found = footingSpec(k, 0);
  const foundationY = project(0, -found.depth).y;
  const groundColumns = k.g.columns.filter(col => col.x >= b.x - 1 && col.x <= b.x + b.w + 1);
  const drawnX = unique(groundColumns.map(col => col.x));
  // Foundation and plinth are below and above NGL, respectively.
  for (const x of drawnX) {
    const col = groundColumns.find(cc => Math.abs(cc.x - x) < 1) ?? k.g.columns[0];
    const p = project(x, 0);
    hatchBox(c, { x: p.x - found.w * s / 2, y: foundationY, w: found.w * s,
      h: found.depth * s }, COLORS.concrete, 45, 10);
    hatchBox(c, { x: p.x - (found.w + 300) * s / 2, y: foundationY + found.depth * s,
      w: (found.w + 300) * s, h: found.pcc * s }, '#d7d7d7', -45, 9);
    hatchBox(c, { x: p.x - (col?.w ?? 300) * s / 2, y: project(x, 450).y,
      w: (col?.w ?? 300) * s, h: ngl - project(x, 450).y }, COLORS.concrete, 45, 13);
  }
  // DPC runs continuously at plinth. Roof slab and any intermediate slabs reuse structural thickness.
  const plinthY = project(0, 450).y;
  hatchBox(c, { x: left, y: plinthY, w: right - left, h: Math.max(3, 130 * s) }, COLORS.concrete, 45, 12);
  drawLine(c, left, plinthY - 3, right, plinthY - 3, 2, COLORS.green);
  label(c, 'DPC', right + 14, plinthY - 4, 14, 'left', COLORS.green);
  const cutY = b.y + b.h / 2;
  for (let story = 0; story < floors; story++) {
    const baseZ = 450 + story * 3000, roofZ = baseZ + 3000;
    const baseY = project(0, baseZ).y, roofY = project(0, roofZ).y;
    const slab = storyThickness(k, story), beam = positive(firstBeam(k).depthMm, 400);
    const wallTop = roofY + slab * s;
    for (const x of [b.x, b.x + b.w]) {
      const xx = project(x, 0).x;
      hatchBox(c, { x: xx - wall / 2, y: wallTop, w: wall, h: baseY - wallTop },
        '#eeeae4', -45, 14, 2);
    }
    const rooms = sectionRooms(k, story, cutY);
    const cuts = intervalCuts(rooms, b);
    for (const x of cuts.slice(1, -1)) {
      if (Math.abs(x - b.x) < 230 || Math.abs(x - b.x - b.w) < 230) continue;
      const xx = project(x, 0).x;
      hatchBox(c, { x: xx - 75 * s, y: wallTop, w: 150 * s, h: baseY - wallTop },
        '#eeeae4', -45, 15, 1.2);
    }
    for (const room of rooms) {
      const center = project(room.x + room.w / 2, baseZ + 1250);
      const span = room.w * s;
      if (span > 60) {
        label(c, room.source.name.toUpperCase(), center.x, center.y, Math.min(15, span / 10), 'center');
        label(c, `${round(room.w)} mm`, center.x, center.y + 19, 12, 'center', COLORS.dim);
      }
    }
    // Section includes openings only when front/rear host wall is intersected by
    // the cut plane. Draw on cut wall itself; every x offset is from the plan resolver.
    for (const o of k.g.openings.filter(a => a.floor === story && a.axis === 'horizontal'
      && Math.abs(a.fixed - cutY) < 115)) {
      projectVerticalOpening(k, o, project, story, s, true);
    }
    hatchBox(c, { x: left - wall / 2, y: roofY, w: right - left + wall,
      h: Math.max(5, slab * s) }, COLORS.concrete, 45, 10);
    for (const x of drawnX) {
      const xx = project(x, 0).x;
      hatchBox(c, { x: xx - 115 * s, y: roofY + slab * s,
        w: 230 * s, h: Math.max(0, beam - slab) * s }, COLORS.concrete, -45, 12, 1.2);
    }
    levelMark(c, right + 70, baseY, `${story === 0 ? 'GF' : `F${story}`} +${(baseZ / 1000).toFixed(3)} (${round(baseZ)} mm)`);
  }
  const roofZ = 450 + floors * 3000;
  const roofY = project(0, roofZ).y, parapetY = project(0, roofZ + 900).y;
  for (const x of [left - wall / 2, right - wall / 2])
    hatchBox(c, { x, y: parapetY, w: wall, h: roofY - parapetY }, '#eeeae4', -45, 13);
  levelMark(c, right + 70, ngl, 'NGL ±0.000 (0 mm)');
  levelMark(c, right + 70, roofY, `ROOF +${(roofZ / 1000).toFixed(3)} (${round(roofZ)} mm)`);
  levelMark(c, right + 70, parapetY, `PARAPET +${((roofZ + 900) / 1000).toFixed(3)} (${round(roofZ + 900)} mm)`);
  const outer = unique([b.x, ...sectionRooms(k, 0, cutY).flatMap(r => [r.x, r.x + r.w]), b.x + b.w]);
  drawDimensionChain(c, outer.map(x => project(x, 0).x), ngl, 115, 'horizontal', s);
  drawDimensionChain(c, [parapetY, roofY, ...Array.from({ length: floors }, (_, i) => project(0, 450 + i * 3000).y), ngl]
    .sort((a, b) => a - b), right + 185, 38, 'vertical', s);
  label(c, 'SECTION CUT AT MID-DEPTH (A–A ON PLAN)', 250, 180, 21, 'left', COLORS.green, true);
  legend(c, 1640, 315, 'SECTION REFERENCE', [
    `External masonry: 230 mm`, `Internal masonry: 150 mm`,
    `Floor-to-floor: 3000 mm`, `Plinth above NGL: 450 mm`,
    `Roof parapet: 900 mm`, `Roof slab: ${round(storyThickness(k, floors - 1))} mm`,
    `Beam depth: ${round(positive(firstBeam(k).depthMm, 400))} mm`,
    'Room widths = exact plan x-intercepts.',
    'Founding depth: geotechnical verification.',
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
    levelMark(c, right + 74, baseY, `${story === 0 ? 'GF' : `F${story}`} +${(z / 1000).toFixed(3)} (${round(z)} mm)`);
  }
  const roofZ = 450 + floors * 3000;
  const ry = project(0, roofZ).y, py = project(0, roofZ + 900).y;
  hatchBox(c, { x: left, y: py, w: right - left, h: ry - py }, '#f0eee9', 45, 17);
  drawRect(c, left - 5, py - 10, right - left + 10, 10,
    { fill: '#d6d6d3', stroke: COLORS.wall, weight: 1 });
  levelMark(c, right + 74, ngl, 'NGL ±0.000 (0 mm)');
  levelMark(c, right + 74, ry, `ROOF +${(roofZ / 1000).toFixed(3)} (${round(roofZ)} mm)`);
  levelMark(c, right + 74, py, `COPING +${((roofZ + 900) / 1000).toFixed(3)} (${round(roofZ + 900)} mm)`);
  drawDimensionChain(c, [left, right], ngl, 56, 'horizontal', s);
  const frontX = unique([b.x, ...k.g.openings.filter(o => o.face === 'front' && o.floor === 0)
    .flatMap(o => [o.a, o.b]), b.x + b.w]).map(x => project(x, 0).x);
  drawDimensionChain(c, frontX, ngl, 96, 'horizontal', s);
  label(c, 'FRONT = PLAN Y-MIN; OPENINGS PROJECTED AT MATCHING X', 190, 165, 20, 'left', COLORS.green, true);
  legend(c, 1715, 285, 'ELEVATION KEY', [
    `Building width ${round(b.w)} mm`,
    `Post-setback buildable ${round(positive(mm(k.layout.buildableWidthM), b.w))} mm`,
    `Front setback ${round(k.g.setbacks.front)} mm`,
    `Sill: per opening schedule`,
    `Plinth: +450 mm; storeys: 3000 mm`,
    `Parapet: 900 mm; coping shown`,
    'Unlocated openings are centred within',
    'their plan-room wall; verify offsets.',
  ]);
  const front = k.g.openings.filter(o => o.face === 'front' &&
    Math.abs(o.fixed - b.y) < 500 && o.floor === 0);
  label(c, 'FRONT OPENING SET-OUT (GF)', 1715, 575, 17,
    'left', COLORS.green, true);
  if (!front.length) label(c, 'No front-wall entries in schedule.', 1715, 604, 14);
  front.slice(0, 12).forEach((o, i) => {
    const mark = o.source.type === 'door' ? 'D' : o.source.type === 'window' ? 'W' : 'V';
    label(c, `${mark}${i + 1} ${o.room.source.name.slice(0, 11)} ${round(o.a - b.x)}–${round(o.b - b.x)} mm`,
      1715, 605 + i * 25, 13);
    label(c, `SILL ${round(o.source.sillHeightMm)} / HEIGHT ${round(o.source.heightMm)} mm`,
      1728, 620 + i * 25, 11, 'left', COLORS.dim);
  });
  if (front.length > 12) label(c, `${front.length - 12} further openings — see full schedule.`,
    1715, 923, 13);
}

/* 9. Stair plan and dimensioned side view. */
function staircaseDetail(k: Context): void {
  const c = k.c, st = stair(k);
  const risers = Math.max(2, Math.round(positive(st.numRisers, 18)));
  const riser = positive(st.riserMm, 3000 / risers), tread = positive(st.treadMm, 270);
  const flightWidth = positive(st.flightWidthMm, 1000);
  const waist = positive(st.waistSlabThicknessMm, 150);
  const landing = positive(st.landingThicknessMm, waist);
  const half = Math.ceil(risers / 2), run = Math.max(1, half - 1) * tread;
  const planScale = Math.min(0.26, 800 / Math.max(run + flightWidth, 3000));
  const px = 210, py = 500, fw = flightWidth * planScale, fh = run * planScale;
  const gap = 150 * planScale; // 150 mm newel/well, never a pixel-only gap.
  // Double flight: first rises bottom->top, second descends in plan while rising.
  drawRect(c, px, py, fw, fh, { stroke: COLORS.wall, weight: 2 });
  drawRect(c, px + fw + gap, py, fw, fh, { stroke: COLORS.wall, weight: 2 });
  drawRect(c, px, py - fw, 2 * fw + gap, fw, { fill: COLORS.concrete, stroke: COLORS.wall, weight: 2 });
  for (let i = 1; i < half; i++) {
    const y = py + i * fh / half;
    drawLine(c, px, y, px + fw, y, 1.1);
    drawLine(c, px + fw + gap, y, px + 2 * fw + gap, y, 1.1);
    label(c, `${half - i}`, px + fw / 2, y - fh / half / 2, 12, 'center');
    label(c, `${half + i}`, px + fw * 1.5 + gap, y - fh / half / 2, 12, 'center');
  }
  arrow(c, px + fw / 2, py + fh - 25, px + fw / 2, py + 35, COLORS.green, 12);
  arrow(c, px + fw * 1.5 + gap, py + 35, px + fw * 1.5 + gap, py + fh - 25, COLORS.green, 12);
  label(c, 'UP', px + fw / 2, py + fh + 25, 17, 'center', COLORS.green, true);
  label(c, 'LANDING', px + fw + gap / 2, py - fw / 2, 16, 'center');
  drawDimensionChain(c, [px, px + fw, px + fw + gap, px + 2 * fw + gap],
    py + fh, 65, 'horizontal', planScale);
  drawDimensionChain(c, [py, py + fh], px, -65, 'vertical', planScale);
  label(c, 'DOG-LEG STAIRCASE PLAN', 195, 170, 24, 'left', COLORS.green, true);
  const sx = 980, sy = 1010, ss = Math.min(0.29, 755 / Math.max(run * 2 + flightWidth, 3900));
  const landingX = sx + run * ss, landingZ = half * riser * ss;
  const totalRise = risers * riser * ss;
  // Flight 1 treads and risers are actual calculated dimensions in both axes.
  for (let i = 0; i < half; i++) {
    const x = sx + i * tread * ss, y = sy - i * riser * ss;
    drawLine(c, x, y, x, y - riser * ss, 1.3);
    drawLine(c, x, y - riser * ss, x + tread * ss, y - riser * ss, 1.3);
  }
  hatchBox(c, { x: landingX, y: sy - landingZ, w: flightWidth * ss,
    h: landing * ss }, COLORS.concrete, 45, 10);
  const secondStartX = landingX + flightWidth * ss;
  for (let i = 0; i < risers - half; i++) {
    const x = secondStartX + i * tread * ss, y = sy - landingZ - i * riser * ss;
    drawLine(c, x, y, x, y - riser * ss, 1.3);
    drawLine(c, x, y - riser * ss, x + tread * ss, y - riser * ss, 1.3);
  }
  const endRealX = secondStartX + (risers - half) * tread * ss;
  // Two raking waist slabs, not a flat slab through the entire stair run.
  hatchPolygon(c, [
    { x: sx, y: sy - riser * ss },
    { x: landingX, y: sy - landingZ },
    { x: landingX, y: sy - landingZ + waist * ss },
    { x: sx, y: sy - riser * ss + waist * ss },
  ]);
  hatchPolygon(c, [
    { x: secondStartX, y: sy - landingZ - riser * ss },
    { x: endRealX, y: sy - totalRise },
    { x: endRealX, y: sy - totalRise + waist * ss },
    { x: secondStartX, y: sy - landingZ - riser * ss + waist * ss },
  ]);
  drawLine(c, sx + 10, sy - 900 * ss, landingX + 10, sy - landingZ - 900 * ss, 1.3);
  drawLine(c, secondStartX, sy - landingZ - 900 * ss, endRealX, sy - totalRise - 900 * ss, 1.3);
  for (const [x, y] of [[sx, sy], [landingX, sy - landingZ], [secondStartX, sy - landingZ], [endRealX, sy - totalRise]]) {
    drawLine(c, x, y, x, y - 900 * ss, 1.2);
  }
  drawDimensionChain(c, [sy - totalRise, sy - landingZ, sy], endRealX + 25, 55, 'vertical', ss);
  label(c, 'STAIR SECTION — WAIST, LANDING & HANDRAIL', 960, 265, 24, 'left', COLORS.green, true);
  legend(c, 1040, 1095, 'STAIR DATA', [
    `${risers} risers @ ${riser.toFixed(1)} mm; tread ${round(tread)} mm`,
    `Flight width ${round(flightWidth)} mm; waist ${round(waist)} mm`,
    `Landing slab ${round(landing)} mm; handrail 900 mm high`,
    `Main steel Ø${round(positive(st.mainBarDiaMm, 10))} @ ${round(positive(st.mainBarSpacingMm, 150))} c/c`,
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

function header(c: CanvasRenderingContext2D, title: string, floor: Level): void {
  drawRect(c, 24, 24, SHEET_W - 48, SHEET_H - 48, { stroke: COLORS.wall, weight: 2 });
  label(c, title, MARGIN + 12, 65, 27, 'left', COLORS.green, true);
  label(c, `FLOOR: ${floor === 0 ? 'GF' : 'FF'}   •   ALL DIMENSIONS IN mm UNLESS SPECIFIED`,
    SHEET_W - MARGIN - 8, 66, 14, 'right', COLORS.dim);
  drawLine(c, 40, 99, SHEET_W - 40, 99, 1, COLORS.grid);
}
function titleBlock(k: Context): void {
  const c = k.c, x = SHEET_W - MARGIN - 900, y = SHEET_H - TITLE_H - 20;
  drawRect(c, x, y, 900, 200, { fill: '#fff', stroke: COLORS.wall, weight: 2 });
  drawLine(c, x, y + 65, x + 900, y + 65, 1, COLORS.wall);
  drawLine(c, x, y + 151, x + 900, y + 151, 1, COLORS.wall);
  drawLine(c, x + 580, y + 65, x + 580, y + 151, 1, COLORS.wall);
  label(c, 'neevv', x + 18, y + 28, 35, 'left', COLORS.green, true);
  label(c, 'Architecture • Structure • MEP • Interiors', x + 182, y + 34, 15, 'left', COLORS.dim);
  label(c, k.title, x + 18, y + 87, 19, 'left', COLORS.text, true);
  label(c, `PLOT ${round(k.g.plotW)} × ${round(k.g.plotD)} mm  •  ${k.req.city}, ${k.req.state}`,
    x + 18, y + 117, 14);
  label(c, `ROAD FACING: ${k.req.facing}`, x + 18, y + 137, 14);
  label(c, `SCALE 1:${Math.max(1, Math.round(5 / Math.max(0.0001, k.scale)))}`,
    x + 595, y + 89, 16, 'left', COLORS.text, true);
  label(c, `DATE ${new Date().toLocaleDateString('en-GB')}`, x + 595, y + 116, 14);
  label(c, `FLOOR ${k.level === 0 ? 'GF' : 'FF'}`, x + 595, y + 137, 14);
  label(c, 'PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION',
    x + 14, y + 176, 12, 'left', COLORS.wall, true);
  label(c, 'DRAWING GENERATED GEOMETRICALLY FROM LOCKED LAYOUT • DO NOT SCALE PRINT',
    MARGIN + 12, SHEET_H - 43, 12, 'left', COLORS.dim);
}


/** Drawing types that have programmatic (non-AI) renderers. */
export const PROGRAMMATIC_TYPES = [
  'excavation', 'column_layout', 'footing_detail', 'beam_slab',
  'column_detail', 'bar_bending', 'section_aa', 'front_elevation',
  'staircase_detail', 'water_tank', 'waterproofing', 'stp_detail',
] as const;

/** Render a coordinated A3 landscape construction drawing and return a PNG data URL. */
export function generateProgrammaticDrawing(
  drawingType: string, layout: Layout, requirements: ProjectRequirements,
  structuralResult?: any, boq?: BOQ | null, floor?: 'GF' | 'FF',
): string {
  if (typeof document === 'undefined') throw new Error('Canvas drawing requires a browser document.');
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
    title: titleFor[drawing] };
  c.fillStyle = '#fff'; c.fillRect(0, 0, SHEET_W, SHEET_H);
  header(c, k.title, level);
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
  }
  c.restore();
  titleBlock(k);
  return canvas.toDataURL('image/png');
}
