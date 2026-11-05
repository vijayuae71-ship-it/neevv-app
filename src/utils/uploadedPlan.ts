import type { Layout, LayoutOpening, ProjectRequirements, Room, FloorProgram, Facing, Column } from '../types';
import { MAX_COLUMN_SPAN_M } from './quantityRules';

/**
 * A plan read from an uploaded drawing (by the analyze-drawing route), as the customer confirms it.
 * Coordinates are in feet, origin at the building's front-left corner with the road at the top:
 * x runs to the right, y away from the road.
 */
export type Wall = 'front' | 'rear' | 'left' | 'right';
export interface ExtractedRoom { name: string; type: string; xFt: number; yFt: number; widthFt: number; depthFt: number }
export interface ExtractedOpening { roomName: string; type: 'door' | 'window' | 'ventilator'; wall: Wall; positionFt: number; widthFt: number }
export interface ExtractedFloor { floorLabel: string; rooms: ExtractedRoom[]; openings: ExtractedOpening[] }
export interface ExtractedPlan {
  plotWidthFt: number; plotDepthFt: number; facing: string;
  setbacksFt: { front: number; rear: number; left: number; right: number };
  floors: ExtractedFloor[];
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

export const ROOM_TYPES = ['bedroom', 'master_bedroom', 'hall', 'kitchen', 'toilet', 'dining', 'puja', 'staircase', 'parking', 'balcony', 'passage', 'entrance', 'store', 'utility', 'study'] as const;
const FT = 0.3048;

/** Problems the customer should fix before the plan is locked (overlaps, rooms outside the plot, missing doors). */
export function planIssues(p: ExtractedPlan): string[] {
  const out: string[] = [];
  const s = p.setbacksFt;
  p.floors.forEach((f) => {
    f.rooms.forEach((a, i) => {
      if (a.widthFt <= 0 || a.depthFt <= 0) out.push(`${f.floorLabel}: ${a.name} has no size.`);
      f.rooms.slice(i + 1).forEach((b) => {
        const ox = Math.min(a.xFt + a.widthFt, b.xFt + b.widthFt) - Math.max(a.xFt, b.xFt);
        const oy = Math.min(a.yFt + a.depthFt, b.yFt + b.depthFt) - Math.max(a.yFt, b.yFt);
        if (ox > 0.5 && oy > 0.5) out.push(`${f.floorLabel}: ${a.name} and ${b.name} overlap by ${ox.toFixed(1)} × ${oy.toFixed(1)} ft — correct a position or size.`);
      });
    });
    const W = Math.max(0, ...f.rooms.map((r) => r.xFt + r.widthFt)), D = Math.max(0, ...f.rooms.map((r) => r.yFt + r.depthFt));
    if (W + s.left + s.right > p.plotWidthFt + 0.5) out.push(`${f.floorLabel}: the rooms span ${W.toFixed(1)} ft but the plot leaves ${(p.plotWidthFt - s.left - s.right).toFixed(1)} ft between side setbacks.`);
    if (D + s.front + s.rear > p.plotDepthFt + 0.5) out.push(`${f.floorLabel}: the rooms span ${D.toFixed(1)} ft deep but the plot leaves ${(p.plotDepthFt - s.front - s.rear).toFixed(1)} ft between front and rear setbacks.`);
  });
  return out;
}

/** Column lines on wall lines with bays ≤ the structural span limit, kept out of the stair opening. */
export function wallLineGrid(W: number, D: number, rooms: Room[]): { xs: number[]; ys: number[] } {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const stair = rooms.find((r) => r.type === 'staircase');
  const axis = (len: number, edges: number[], s0?: number, s1?: number): number[] => {
    const banned = (v: number) => s0 !== undefined && s1 !== undefined && v > s0 + 0.05 && v < s1 - 0.05;
    const cand = [...new Set(edges.map(r2))].filter((v) => v > 0.6 && v < len - 0.6 && !banned(v)).sort((a, b) => a - b);
    const out = [0]; let at = 0;
    while (len - at > MAX_COLUMN_SPAN_M) {
      const reach = cand.filter((v) => v > at + 0.6 && v <= at + MAX_COLUMN_SPAN_M);
      let nx = reach[reach.length - 1];
      if (nx === undefined) { nx = r2(at + (len - at) / Math.ceil((len - at) / MAX_COLUMN_SPAN_M)); while (banned(nx)) nx = r2(nx - 0.1); }
      out.push(nx); at = nx;
    }
    out.push(r2(len));
    return out;
  };
  return {
    xs: axis(W, rooms.flatMap((r) => [r.x, r.x + r.width]), stair?.x, stair ? stair.x + stair.width : undefined),
    ys: axis(D, rooms.flatMap((r) => [r.y, r.y + r.depth]), stair?.y, stair ? stair.y + stair.depth : undefined),
  };
}

/** The confirmed drawing as a locked plan + brief for the drawing, structure and BOQ engines. */
export function uploadedPlanToLayout(p: ExtractedPlan, city = 'Not specified', state = 'Not specified'): { layout: Layout; requirements: ProjectRequirements } {
  const facing = (['North', 'South', 'East', 'West'].includes(p.facing) ? p.facing : 'North') as Facing;
  const snap = (m: number) => Math.round(m * 100) / 100;
  // building origin = front-left of the rooms on any floor
  const all = p.floors.flatMap((f) => f.rooms);
  const x0 = Math.min(...all.map((r) => r.xFt)), y0 = Math.min(...all.map((r) => r.yFt));
  const openings: LayoutOpening[] = [];
  const floors = p.floors.map((f, fi) => {
    const rooms: Room[] = f.rooms.map((r, ri) => ({
      id: `U${fi}-${ri + 1}`, name: r.name, type: (ROOM_TYPES as readonly string[]).includes(r.type) ? (r.type as Room['type']) : 'store',
      x: snap((r.xFt - x0) * FT), y: snap((r.yFt - y0) * FT), width: snap(r.widthFt * FT), depth: snap(r.depthFt * FT), floor: fi,
    }));
    let n = 0;
    for (const o of f.openings) {
      const room = rooms.find((r) => r.name.toLowerCase() === o.roomName.toLowerCase()); if (!room) continue;
      const len = o.wall === 'front' || o.wall === 'rear' ? room.width : room.depth, w = Math.max(0.45, o.widthFt * FT);
      const pos = Math.min(Math.max(o.positionFt * FT, w / 2 + 0.1), len - w / 2 - 0.1);
      const outer = o.wall === 'front' ? room.y < 0.05 : o.wall === 'left' ? room.x < 0.05 : false;
      openings.push({ id: `${o.type === 'door' ? 'D' : o.type === 'window' ? 'W' : 'V'}${fi}${++n}`, floor: fi, roomId: room.id, face: o.wall, positionMm: Math.round(pos * 1000),
        type: o.type, room: room.name, wall: outer || isOuter(room, o.wall, rooms) ? o.wall : 'internal', widthMm: Math.round(w * 1000),
        heightMm: o.type === 'door' ? 2100 : o.type === 'ventilator' ? 450 : 1200, sillHeightMm: o.type === 'door' ? 0 : o.type === 'ventilator' ? 1800 : 900,
        material: o.type === 'door' ? 'Flush door' : 'UPVC sliding', quantity: 1 });
    }
    // every room needs a way in: a door on the wall shared with the hall / passage / largest neighbour
    for (const room of rooms) {
      if (openings.some((o) => o.roomId === room.id && o.type === 'door') || room.type === 'balcony') continue;
      const nb = rooms.filter((q) => q !== room && sharedWall(room, q)).sort((a, b) => access(room, b) - access(room, a))[0];
      if (!nb) continue;
      const wall = sharedWall(room, nb)!, len = wall === 'front' || wall === 'rear' ? room.width : room.depth;
      openings.push({ id: `D${fi}${++n}`, floor: fi, roomId: room.id, face: wall, positionMm: Math.round(Math.min(len / 2, 0.6) * 1000), type: 'door', room: room.name, wall: 'internal',
        widthMm: room.type === 'toilet' ? 750 : 900, heightMm: 2100, sillHeightMm: 0, material: 'Flush door', quantity: 1 });
    }
    return { floor: fi, floorLabel: f.floorLabel, rooms, columns: [] as Column[] };
  });
  // main entrance: if the drawing shows none on the road side, on the front wall of the front-most living space
  if (!openings.some((o) => o.floor === 0 && o.type === 'door' && o.wall === 'front')) {
    const front = (floors[0]?.rooms ?? []).filter((r) => r.y < 0.05).sort((a, b) => score(b) - score(a))[0];
    if (front) openings.push({ id: 'D-MAIN', floor: 0, roomId: front.id, face: 'front', positionMm: Math.round(Math.min(front.width / 2, 1.2) * 1000), main: true, type: 'door', room: front.name, wall: 'front', widthMm: 1050, heightMm: 2100, sillHeightMm: 0, material: 'Teak main door', quantity: 1 });
  } else { const m = openings.find((o) => o.floor === 0 && o.type === 'door' && o.wall === 'front'); if (m) m.main = true; }

  const W = snap(Math.max(...floors.flatMap((f) => f.rooms.map((r) => r.x + r.width))));
  const D = snap(Math.max(...floors.flatMap((f) => f.rooms.map((r) => r.y + r.depth))));
  const plotW = p.plotWidthFt * FT, plotD = p.plotDepthFt * FT;
  // setbacks as drawn, trimmed so the building fits the plot
  const sb = { front: p.setbacksFt.front * FT, rear: p.setbacksFt.rear * FT, left: p.setbacksFt.left * FT, right: p.setbacksFt.right * FT };
  if (W + sb.left + sb.right > plotW) { const k = Math.max(0, plotW - W) / Math.max(0.01, sb.left + sb.right); sb.left *= k; sb.right *= k; }
  if (D + sb.front + sb.rear > plotD) { const k = Math.max(0, plotD - D) / Math.max(0.01, sb.front + sb.rear); sb.front *= k; sb.rear *= k; }
  const setbacks = { front: snap(sb.front), rear: snap(sb.rear), left: snap(sb.left), right: snap(sb.right) };
  const grid = wallLineGrid(W, D, floors[0]?.rooms ?? []);
  const cols = grid.xs.flatMap((x) => grid.ys.map((y) => ({ x, y, widthMM: 230, depthMM: 300 })));
  for (const f of floors) f.columns = cols;
  const footprint = W * D, builtUp = footprint * floors.length;
  const programs: FloorProgram[] = p.floors.map((f) => ({
    floorLabel: f.floorLabel,
    bedrooms: f.rooms.filter((r) => r.type === 'bedroom' || r.type === 'master_bedroom').length,
    halls: f.rooms.filter((r) => r.type === 'hall').length,
    kitchens: f.rooms.filter((r) => r.type === 'kitchen').length,
    hasDining: f.rooms.some((r) => r.type === 'dining'), hasPuja: f.rooms.some((r) => r.type === 'puja'),
  }));
  const requirements: ProjectRequirements = {
    city, state, plotWidthFt: p.plotWidthFt, plotDepthFt: p.plotDepthFt, facing, vastuCompliance: false,
    parkingType: p.floors[0]?.rooms.some((r) => r.type === 'parking') ? 'Open' : 'None', budget: 'standard', architecturalStyle: 'modern_minimalist', floors: programs,
  };
  const doors = openings.filter((o) => o.type === 'door').length;
  const layout: Layout = {
    id: 'uploaded-plan', name: 'Your uploaded plan', strategy: 'User Uploaded Drawing',
    description: `Plan read from your drawing — ${p.plotWidthFt}′×${p.plotDepthFt}′ plot`,
    floors, vastuScore: 0, vastuDetails: [], nbcCompliant: true, nbcIssues: [],
    builtUpAreaSqM: builtUp, builtUpAreaSqFt: builtUp * 10.7639, totalBuiltUpSqFt: builtUp * 10.7639,
    setbacks, plotWidthM: snap(plotW), plotDepthM: snap(plotD), buildableWidthM: snap(plotW - setbacks.left - setbacks.right), buildableDepthM: snap(plotD - setbacks.front - setbacks.rear),
    buildingWidthMm: Math.round(W * 1000), buildingDepthMm: Math.round(D * 1000), structuralGridM: grid,
    openingsSchedule: { openings, totalDoors: doors, totalWindows: openings.filter((o) => o.type === 'window').length, totalVentilators: openings.filter((o) => o.type === 'ventilator').length, scheduleText: '' },
  };
  return { layout, requirements };
}

/** How good a way in `to` is for `from`: circulation first; a bath may open off a bedroom, a utility off the kitchen. */
function access(from: Room, to: Room): number {
  const t = to.type, base = t === 'passage' || t === 'hall' || t === 'entrance' ? 100 : t === 'dining' ? 80 : t === 'staircase' ? 30 : 0;
  const special = (from.type === 'toilet' && (t === 'bedroom' || t === 'master_bedroom')) ? 60 : (from.type === 'utility' || from.type === 'store') && t === 'kitchen' ? 90 : 0;
  const never = t === 'toilet' || t === 'utility' || t === 'store' || t === 'balcony' || ((t === 'bedroom' || t === 'master_bedroom') && from.type !== 'toilet') ? -200 : 0;
  return base + special + never + to.width * to.depth / 100;
}
function score(r: Room): number { return (r.type === 'passage' || r.type === 'hall' || r.type === 'entrance' ? 100 : r.type === 'dining' ? 50 : 0) + r.width * r.depth; }
/** Which wall of a touches b, if they share at least 0.9 m of wall. */
function sharedWall(a: Room, b: Room): Wall | null {
  const e = 0.05, ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), oy = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  if (ox >= 0.9 && Math.abs(a.y - (b.y + b.depth)) < e) return 'front';
  if (ox >= 0.9 && Math.abs(a.y + a.depth - b.y) < e) return 'rear';
  if (oy >= 0.9 && Math.abs(a.x - (b.x + b.width)) < e) return 'left';
  if (oy >= 0.9 && Math.abs(a.x + a.width - b.x) < e) return 'right';
  return null;
}
/** True when no other room sits against that wall (it is an outside wall). */
function isOuter(r: Room, wall: Wall, rooms: Room[]): boolean { return !rooms.some((q) => q !== r && sharedWall(r, q) === wall); }
