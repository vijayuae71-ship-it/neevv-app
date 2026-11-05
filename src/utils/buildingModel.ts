/**
 * Shared building model — the ONE place that fixes the vertical datum, opening positions and the
 * site/terrace services, so the 2D drawings, the 3D model and the BOQ describe the same building.
 *
 * Coordinates: metres, building-relative (room x/y as stored on the locked Layout), y = 0 at the
 * front (road) wall. Levels in metres above natural ground level (NGL ±0.000).
 */
import type { Layout, LayoutOpening, Room } from '../types';
import { isNiche, PARAPET_HEIGHT_MM } from './quantityRules';

/** Finished floor of the ground floor above NGL. */
export const PLINTH_HEIGHT_MM = 450;
/** Floor-to-floor height used by sections, elevations, 3D and BOQ. */
export const FLOOR_TO_FLOOR_MM = 3000;
/** Stair head room (mumty) height above the terrace slab. */
export const STAIR_HEAD_ROOM_MM = 2700;
/** Compound wall height and thickness. */
export const COMPOUND_WALL_HEIGHT_MM = 1500;
export const COMPOUND_WALL_THICKNESS_MM = 150;
export { PARAPET_HEIGHT_MM };

/** Floor finish level of storey `floor` above NGL (mm). */
export const floorLevelMm = (floor: number) => PLINTH_HEIGHT_MM + floor * FLOOR_TO_FLOOR_MM;
/** Top of the terrace slab above NGL (mm). */
export const roofLevelMm = (floors: number) => PLINTH_HEIGHT_MM + Math.max(1, floors) * FLOOR_TO_FLOOR_MM;

/** Main gate width — the same opening is drawn on the site plan, modelled in 3D and billed in the BOQ. */
export function gateWidthM(plotWidthM: number): number {
  return plotWidthM >= 10 ? 4 : 3;
}
/** Gate centre along the front boundary (m from the plot's left edge). */
export function gateCentreM(layout: Pick<Layout, 'plotWidthM' | 'setbacks' | 'buildableWidthM'>, mainDoorCentreM?: number): number {
  const W = layout.plotWidthM, g = gateWidthM(W);
  const want = typeof mainDoorCentreM === 'number' ? (layout.setbacks?.left ?? 0) + mainDoorCentreM : W / 2;
  return Math.min(W - g / 2 - 0.3, Math.max(g / 2 + 0.3, want));
}

/** Water storage sized from occupancy — used by the BOQ, the tank sheet, the terrace plan and the 3D. */
export function waterStorage(layout: Layout): { persons: number; sumpL: number; ohtL: number } {
  const beds = layout.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'bedroom' || r.type === 'master_bedroom').length;
  const persons = beds * 2 + 1;
  return {
    persons,
    sumpL: Math.max(5000, Math.ceil((persons * 135 * 1.5) / 1000) * 1000),
    ohtL: Math.max(1000, Math.ceil((persons * 135) / 500) * 500),
  };
}
/** Standard loft tank (vertical cylinder) for a capacity; ≥ 2 tanks above 2000 L. */
export function ohtTanks(litres: number): { count: number; diaM: number; heightM: number; eachL: number } {
  const sizes = [
    { l: 1000, d: 1.1, h: 1.2 }, { l: 1500, d: 1.3, h: 1.35 }, { l: 2000, d: 1.42, h: 1.5 },
  ];
  const count = litres > 2000 ? Math.ceil(litres / 2000) : 1;
  const each = litres / count;
  const s = sizes.find((x) => x.l >= each - 1) ?? sizes[sizes.length - 1];
  return { count, diaM: s.d, heightM: s.h, eachL: s.l };
}
/** RCC sump internal size for a capacity (1.5 m water depth + 0.3 m freeboard). */
export function sumpSizeM(litres: number): { l: number; w: number; waterDepth: number; depth: number } {
  const waterDepth = 1.5, area = litres / 1000 / waterDepth;
  const w = Math.max(1.5, Math.round(Math.sqrt(area / 1.5) * 20) / 20);
  const l = Math.max(w, Math.ceil((area / w) * 20) / 20);
  return { l, w, waterDepth, depth: waterDepth + 0.3 };
}

const bounds = (layout: Layout) => {
  const rooms = layout.floors.flatMap((f) => f.rooms);
  const W = Math.max(layout.buildableWidthM || 0, ...rooms.map((r) => r.x + r.width));
  const D = Math.max(layout.buildableDepthM || 0, ...rooms.map((r) => r.y + r.depth));
  return { W, D };
};
export function stairRoom(layout: Layout, floor?: number): Room | undefined {
  const f = floor ?? Math.max(0, layout.floors.length - 1);
  return (layout.floors[f]?.rooms ?? []).find((r) => r.type === 'staircase');
}

/** Overhead tank(s): on the stair head room roof when there is one (above the down-take), else on the terrace rear corner. */
export function ohtPlacement(layout: Layout): { cx: number; cy: number; diaM: number; heightM: number; count: number; eachL: number; onHeadRoom: boolean; baseM: number }[] {
  const { ohtL } = waterStorage(layout); const t = ohtTanks(ohtL);
  const { W, D } = bounds(layout); const st = stairRoom(layout);
  const floors = layout.floors.length;
  const roof = roofLevelMm(floors) / 1000;
  const out: ReturnType<typeof ohtPlacement> = [];
  const pitch = t.diaM + 0.25;
  if (st && st.width >= t.diaM + 0.3 && st.depth >= t.diaM + 0.3) {
    const base = roof + STAIR_HEAD_ROOM_MM / 1000 + 0.15 + 0.3; // head-room slab + 300 mm stand
    const n = Math.min(t.count, Math.max(1, Math.floor((st.width - 0.3) / pitch)));
    for (let i = 0; i < t.count; i++) {
      const onTop = i < n;
      const cx = onTop ? st.x + st.width - 0.15 - t.diaM / 2 - i * pitch : W - 0.4 - t.diaM / 2 - (i - n) * pitch;
      const cy = onTop ? st.y + st.depth - 0.15 - t.diaM / 2 : D - 0.4 - t.diaM / 2;
      out.push({ cx, cy, diaM: t.diaM, heightM: t.heightM, count: t.count, eachL: t.eachL, onHeadRoom: onTop, baseM: onTop ? base : roof + 0.3 });
    }
    return out;
  }
  for (let i = 0; i < t.count; i++) out.push({ cx: W - 0.4 - t.diaM / 2 - i * pitch, cy: D - 0.4 - t.diaM / 2, diaM: t.diaM, heightM: t.heightM, count: t.count, eachL: t.eachL, onHeadRoom: false, baseM: roof + 0.3 });
  return out;
}

/** Rain-water pipes at the four building corners (outside face), drained to the plot — same points on plumbing, terrace and site plans. */
export function rainwaterPipes(layout: Layout): { x: number; y: number; side: 'left' | 'right' }[] {
  const { W, D } = bounds(layout);
  return [{ x: -0.2, y: 0.3, side: 'left' }, { x: W + 0.2, y: 0.3, side: 'right' }, { x: -0.2, y: D - 0.3, side: 'left' }, { x: W + 0.2, y: D - 0.3, side: 'right' }];
}
/** Underground sump: in the front setback near the building's left front corner (as on the plumbing layout). */
export function sumpPlacement(layout: Layout): { cx: number; cy: number; l: number; w: number } {
  const s = sumpSizeM(waterStorage(layout).sumpL); const front = layout.setbacks?.front ?? 1.5, left = layout.setbacks?.left ?? 1;
  // long side along the road; kept inside the plot (300 mm clear of the compound wall) and 300 mm off the building
  const l = Math.max(s.l, s.w), w = Math.min(s.l, s.w);
  const cx = Math.max(-left + 0.3 + l / 2, -0.2);
  const cy = Math.min(-0.3 - w / 2, Math.max(-front + 0.3 + w / 2, -front / 2));
  return { cx, cy, l, w };
}

export type Face = 'front' | 'rear' | 'left' | 'right';
/** An opening resolved to an exact wall line, in metres (same rule as the drawing engine). */
export interface PlacedOpening {
  source: LayoutOpening; floor: number; room: Room;
  /** 'x' = runs along x on a wall line y = fixed; 'y' = runs along y on a wall line x = fixed. */
  axis: 'x' | 'y'; fixed: number; a: number; b: number;
  face: Face; exterior: boolean; sillM: number; heightM: number;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Resolve the locked openings schedule to wall positions. Planner openings carry the exact room,
 * side and centre position; older schedules (no position) are distributed evenly along the wall,
 * exactly as the drawing engine does, so every projection shows the same opening in the same place.
 */
export function placeOpenings(layout: Layout): PlacedOpening[] {
  const entries = layout.openingsSchedule?.openings ?? [];
  const out: PlacedOpening[] = [];
  const floors = Math.max(1, layout.floors.length);
  for (let floor = 0; floor < floors; floor++) {
    const rooms = (layout.floors[floor]?.rooms ?? layout.floors[0]?.rooms ?? []).filter((r) => r.width > 0 && r.depth > 0);
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (!e || !['door', 'window', 'ventilator'].includes(e.type)) continue;
      if (typeof e.floor === 'number' && e.floor !== floor) continue;
      const sill = Math.max(0, (e.sillHeightMm ?? (e.type === 'door' ? 0 : 900)) / 1000);
      const height = Math.min(2.7, Math.max(0.3, (e.heightMm || (e.type === 'door' ? 2100 : 1200)) / 1000));
      const span = Math.max(0.3, (e.widthMm || (e.type === 'door' ? 900 : 1200)) / 1000);
      if (typeof e.floor === 'number' && e.face && typeof e.positionMm === 'number') {
        const room = rooms.find((r) => r.id === e.roomId) ?? rooms.find((r) => norm(r.name) === norm(e.room));
        if (!room) continue;
        const face = e.face; const axis = face === 'left' || face === 'right' ? 'y' : 'x';
        const fixed = face === 'rear' ? room.y + room.depth : face === 'left' ? room.x : face === 'right' ? room.x + room.width : room.y;
        const c = (axis === 'x' ? room.x : room.y) + e.positionMm / 1000;
        out.push({ source: e, floor, room, axis, fixed, a: c - span / 2, b: c + span / 2, face, exterior: e.wall !== 'internal', sillM: sill, heightM: height });
        continue;
      }
      if (e.wall === 'internal') continue;
      const key = norm(e.room);
      const room = rooms.find((r) => norm(r.name) === key || norm(r.id) === key) ?? rooms.find((r) => norm(r.name).includes(key) && key.length > 1);
      if (!room) continue;
      const face = e.wall as Face; const axis = face === 'left' || face === 'right' ? 'y' : 'x';
      const fixed = face === 'rear' ? room.y + room.depth : face === 'left' ? room.x : face === 'right' ? room.x + room.width : room.y;
      const start = axis === 'x' ? room.x : room.y, length = axis === 'x' ? room.width : room.depth;
      const group = entries.filter((g) => norm(g.room) === key && g.wall === face && g.type === e.type);
      const occ = counts.get(`${key}|${face}|${e.type}`) ?? 0; counts.set(`${key}|${face}|${e.type}`, occ + 1);
      const q = (g: LayoutOpening) => Math.max(1, Math.floor(g.quantity || 1));
      const earlier = group.slice(0, occ).reduce((s, g) => s + q(g), 0), total = group.reduce((s, g) => s + q(g), 0);
      for (let i = 0; i < q(e); i++) {
        const sp = Math.min(span, Math.max(0.15, length / (total + 0.25)));
        const c = start + (length * (earlier + i + 1)) / (total + 1);
        out.push({ source: e, floor, room, axis, fixed, a: c - sp / 2, b: c + sp / 2, face, exterior: true, sillM: sill, heightM: height });
      }
    }
  }
  return out;
}

/** Openings that cut the wall on side `face` of `room` (including doors owned by the neighbouring room). */
export function openingsOnRoomWall(placed: PlacedOpening[], room: Room, floor: number, face: Face, tol = 0.12): PlacedOpening[] {
  const axis = face === 'left' || face === 'right' ? 'y' : 'x';
  const line = face === 'rear' ? room.y + room.depth : face === 'left' ? room.x : face === 'right' ? room.x + room.width : room.y;
  const s0 = axis === 'x' ? room.x : room.y, s1 = s0 + (axis === 'x' ? room.width : room.depth);
  return placed.filter((o) => o.floor === floor && o.axis === axis && Math.abs(o.fixed - line) <= tol && o.b > s0 + 0.05 && o.a < s1 - 0.05);
}

/** Centre of the main entrance door along the building width (m), if the schedule marks one. */
export function mainDoorCentreM(layout: Layout): number | undefined {
  const doors = placeOpenings(layout).filter((o) => o.floor === 0 && o.source.type === 'door' && o.exterior && o.face === 'front');
  const m = doors.find((o) => o.source.main) ?? doors[0];
  return m ? (m.a + m.b) / 2 : undefined;
}

/** Rooms counted on the terrace/roof plan (niches excluded). */
export const roofRooms = (layout: Layout) => (layout.floors[layout.floors.length - 1]?.rooms ?? []).filter((r) => !isNiche(r));
